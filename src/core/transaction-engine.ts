import { v4 as uuidv4 } from 'uuid';
import { db } from './database';
import type { 
  Transaction, 
  TransactionItem, 
  StockMovement, 
  FinanceEvent,
  SyncQueueItem,
  Receivable,
  Customer,
  Product
} from './types';
import { addDays } from 'date-fns';
import { AuditEngine } from './audit-engine';

export class TransactionEngine {
  static async createSale(params: {
    cashierId: string;
    deviceId: string;
    shiftId: string;
    customerId?: string;
    items: TransactionItem[];
    discount: number; 
    paymentMethodId: string;
    moneyStorageId: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
    type: 'SALE' | 'GAJIAN';
  }): Promise<string> {
    const transactionId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const subtotal = params.items.reduce((acc, item) => acc + item.subtotal, 0);
    const total = subtotal - params.discount;

    // 1. Fetch Customer if exists
    let customer: Customer | undefined;
    if (params.customerId) {
      customer = await db.customers.get(params.customerId);
    }

    // 2. Loyalty Point Calculation (PRD 16: Sembako only by default)
    let pointsEarned = 0;
    if (params.type === 'SALE' && customer && !customer.isReseller) {
      // Points calculated only for non-fish items by default (simplified logic)
      pointsEarned = Math.ceil(total / 10000);
    }

    const transaction: Transaction = {
      transactionId,
      receiptNumber: `REC-${Date.now()}`,
      type: params.type,
      status: 'COMPLETED',
      customerId: params.customerId,
      cashierId: params.cashierId,
      deviceId: params.deviceId,
      shiftId: params.shiftId,
      items: params.items,
      subtotal,
      discount: params.discount,
      total,
      paymentMethodId: params.paymentMethodId,
      moneyStorageId: params.moneyStorageId,
      loyaltyPointsEarned: pointsEarned,
      clientTimestamp: timestamp,
    };

    // 3. Persist Transaction
    await db.transactions.add(transaction);

    // 4. Handle Stock Movements & Audit
    for (const item of params.items) {
      const product = await db.products.get(item.productId);
      if (!product) continue;

      let baseQty = item.quantity;
      // Multi-unit conversion snapshot (PRD 9)
      if (item.unit !== product.baseUnit) {
        const conversion = product.conversionRules.find(r => r.toUnit === item.unit);
        if (conversion) {
          baseQty = item.quantity * conversion.factor;
        }
      }

      // Record Stock Movement
      const stockMovement: StockMovement = {
        stockMovementId: uuidv4(),
        productId: item.productId,
        quantity: -baseQty,
        type: 'OUT',
        reason: 'SALE',
        referenceId: transactionId,
        referenceType: 'TRANSACTION',
        timestamp
      };
      await db.stockMovements.add(stockMovement);

      // Update Local Stock Cache (derived but kept for UI performance)
      await db.products.update(item.productId, {
        stock: product.stock - baseQty,
        updatedAt: timestamp
      });

      // Handle Bundle Components (PRD 10)
      if (product.productType === 'BUNDLE') {
        const bundle = await db.bundles.get(item.productId);
        if (bundle) {
          for (const comp of bundle.components) {
            const compProduct = await db.products.get(comp.productId);
            if (compProduct) {
              const compBaseQty = comp.qty * item.quantity; 
              const compMovement: StockMovement = {
                stockMovementId: uuidv4(),
                productId: comp.productId,
                quantity: -compBaseQty,
                type: 'OUT',
                reason: 'SALE',
                referenceId: transactionId,
                referenceType: 'TRANSACTION',
                timestamp
              };
              await db.stockMovements.add(compMovement);
              await db.products.update(comp.productId, {
                stock: compProduct.stock - compBaseQty,
                updatedAt: timestamp
              });
              await this.addToQueue('stockMovements', compMovement.stockMovementId, 'CREATE', compMovement);
            }
          }
        }
      }

      await this.addToQueue('stockMovements', stockMovement.stockMovementId, 'CREATE', stockMovement);
    }

    // 5. Handle Finance & Receivables (PRD 14, 27)
    if (params.type === 'GAJIAN' && params.customerId) {
      const receivableId = uuidv4();
      const dueDate = addDays(new Date(), customer?.defaultDueDateDays || 30).toISOString();
      
      const receivable: Receivable = {
        receivableId,
        transactionId,
        customerId: params.customerId,
        totalAmount: total,
        paidAmount: 0,
        remainingAmount: total,
        dueDate,
        status: 'OPEN',
        createdAt: timestamp
      };
      await db.receivables.add(receivable);
      await this.addToQueue('receivables', receivableId, 'CREATE', receivable);
    } else {
      const financeEvent: FinanceEvent = {
        financeEventId: uuidv4(),
        amount: total,
        storageId: params.moneyStorageId,
        direction: 'IN',
        referenceId: transactionId,
        referenceType: 'TRANSACTION',
        userId: params.cashierId,
        deviceId: params.deviceId,
        timestamp
      };
      await db.financeEvents.add(financeEvent);
      await this.addToQueue('financeEvents', financeEvent.financeEventId, 'CREATE', financeEvent);
    }

    // 6. Update Customer Loyalty & Audit
    if (pointsEarned > 0 && customer) {
      const newPoints = customer.loyaltyPoints + pointsEarned;
      await db.customers.update(customer.customerId, {
        loyaltyPoints: newPoints
      });
      await this.addToQueue('customers', customer.customerId, 'UPDATE', { ...customer, loyaltyPoints: newPoints });
    }

    // 7. FINAL LOGGING
    await AuditEngine.log({
      userId: params.cashierId,
      role: 'KASIR', 
      deviceId: params.deviceId,
      action: 'CREATE_TRANSACTION',
      module: 'POS',
      referenceId: transactionId,
      after: transaction
    });

    await this.addToQueue('transactions', transactionId, 'CREATE', transaction);

    return transactionId;
  }

  private static async addToQueue(entityType: string, entityId: string, action: 'CREATE' | 'UPDATE' | 'DELETE', payload: any) {
    const queueItem: SyncQueueItem = {
      entityType,
      entityId,
      action,
      payload,
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date().toISOString()
    };
    await db.syncQueue.add(queueItem);
  }
}
