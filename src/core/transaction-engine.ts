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
import { LoyaltyEngine } from './loyalty-engine';

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
      loyaltyPointsEarned: 0, // Calculated below
      clientTimestamp: timestamp,
    };

    // 1. Calculate Loyalty Points
    if (params.type === 'SALE' && params.customerId) {
      transaction.loyaltyPointsEarned = await LoyaltyEngine.calculatePoints(transaction);
    }

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
      const customer = await db.customers.get(params.customerId);
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

      // 5b. Handle MDR Cost (Merchant Discount Rate)
      const paymentMethod = await db.paymentMethods.get(params.paymentMethodId);
      if (paymentMethod && paymentMethod.mdrPercent > 0) {
        const mdrAmount = Math.round(total * (paymentMethod.mdrPercent / 100));
        const mdrEvent: FinanceEvent = {
          financeEventId: uuidv4(),
          amount: mdrAmount,
          storageId: params.moneyStorageId,
          direction: 'OUT',
          referenceId: transactionId,
          referenceType: 'MDR_COST',
          userId: params.cashierId,
          deviceId: params.deviceId,
          timestamp
        };
        await db.financeEvents.add(mdrEvent);
        await this.addToQueue('financeEvents', mdrEvent.financeEventId, 'CREATE', mdrEvent);
      }
    }

    // 6. Update Customer Loyalty & Audit
    if (transaction.loyaltyPointsEarned > 0 && params.customerId) {
      await LoyaltyEngine.recordEarnEvent(params.customerId, transaction.loyaltyPointsEarned, transactionId);
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

  static async voidTransaction(transactionId: string, userId: string, deviceId: string, reason: string): Promise<void> {
    const transaction = await db.transactions.get(transactionId);
    if (!transaction) throw new Error('Transaction not found');
    if (transaction.status === 'VOIDED') throw new Error('Transaction already voided');

    const timestamp = new Date().toISOString();

    // 1. Reverse Stock Movements
    for (const item of transaction.items) {
      const product = await db.products.get(item.productId);
      if (!product) continue;

      let baseQty = item.quantity;
      if (item.unit !== product.baseUnit) {
        const conversion = product.conversionRules.find(r => r.toUnit === item.unit);
        if (conversion) baseQty = item.quantity * conversion.factor;
      }

      const reversal: StockMovement = {
        stockMovementId: uuidv4(),
        productId: item.productId,
        quantity: baseQty,
        type: 'IN',
        reason: 'VOID',
        referenceId: transactionId,
        referenceType: 'TRANSACTION',
        timestamp
      };
      await db.stockMovements.add(reversal);
      await db.products.update(item.productId, {
        stock: product.stock + baseQty,
        updatedAt: timestamp
      });

      // Reverse Bundles
      if (product.productType === 'BUNDLE') {
        const bundle = await db.bundles.get(item.productId);
        if (bundle) {
          for (const comp of bundle.components) {
            const compProduct = await db.products.get(comp.productId);
            if (compProduct) {
              const compBaseQty = comp.qty * item.quantity;
              await db.products.update(comp.productId, {
                stock: compProduct.stock + compBaseQty,
                updatedAt: timestamp
              });
            }
          }
        }
      }
    }

    // 2. Reverse Finance
    if (transaction.type === 'GAJIAN') {
      const receivable = await db.receivables.where('transactionId').equals(transactionId).first();
      if (receivable) {
        await db.receivables.update(receivable.receivableId, { status: 'VOIDED', remainingAmount: 0 });
      }
    } else {
      const financeReversal: FinanceEvent = {
        financeEventId: uuidv4(),
        amount: transaction.total,
        storageId: transaction.moneyStorageId,
        direction: 'OUT',
        referenceId: transactionId,
        referenceType: 'VOID',
        userId,
        deviceId,
        timestamp
      };
      await db.financeEvents.add(financeReversal);
    }

    // 3. Reverse Loyalty
    if (transaction.loyaltyPointsEarned > 0 && transaction.customerId) {
      await LoyaltyEngine.recordReversalEvent(transaction.customerId, transaction.loyaltyPointsEarned, transactionId);
    }

    // 4. Update Transaction Status
    await db.transactions.update(transactionId, { status: 'VOIDED' });

    // 5. Audit
    await AuditEngine.log({
      userId,
      role: 'SUPERVISOR',
      deviceId,
      action: 'VOID_TRANSACTION',
      module: 'POS',
      referenceId: transactionId,
      before: transaction,
      reason
    });
  }

  static async returnItems(transactionId: string, returnItems: { productId: string, quantity: number }[], userId: string, deviceId: string, reason: string): Promise<void> {
    const transaction = await db.transactions.get(transactionId);
    if (!transaction) throw new Error('Transaction not found');
    
    const timestamp = new Date().toISOString();
    let totalRefund = 0;

    for (const ret of returnItems) {
      const originalItem = transaction.items.find(i => i.productId === ret.productId);
      if (!originalItem) continue;
      if (ret.quantity > originalItem.quantity) throw new Error('Return quantity exceeds original');

      const product = await db.products.get(ret.productId);
      if (!product) continue;

      // 1. Stock Return
      let baseQty = ret.quantity;
      if (originalItem.unit !== product.baseUnit) {
        const conversion = product.conversionRules.find(r => r.toUnit === originalItem.unit);
        if (conversion) baseQty = ret.quantity * conversion.factor;
      }

      await db.stockMovements.add({
        stockMovementId: uuidv4(),
        productId: ret.productId,
        quantity: baseQty,
        type: 'IN',
        reason: 'RETURN',
        referenceId: transactionId,
        referenceType: 'TRANSACTION',
        timestamp
      });
      await db.products.update(ret.productId, {
        stock: product.stock + baseQty,
        updatedAt: timestamp
      });

      totalRefund += (ret.quantity * originalItem.unitPrice);
    }

    // 2. Finance Refund
    const refundEvent: FinanceEvent = {
      financeEventId: uuidv4(),
      amount: totalRefund,
      storageId: transaction.moneyStorageId,
      direction: 'OUT',
      referenceId: transactionId,
      referenceType: 'RETURN',
      userId,
      deviceId,
      timestamp
    };
    await db.financeEvents.add(refundEvent);

    // 3. Log Return Transaction (as a child or related event)
    await AuditEngine.log({
      userId,
      role: 'SUPERVISOR',
      deviceId,
      action: 'SALES_RETURN',
      module: 'POS',
      referenceId: transactionId,
      after: { returnItems, totalRefund },
      reason
    });
  }

  static async settleReceivable(params: {
    cashierId: string;
    deviceId: string;
    shiftId: string;
    customerId: string;
    receivableId: string;
    amount: number;
    paymentMethodId: string;
    moneyStorageId: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
  }): Promise<void> {
    const timestamp = new Date().toISOString();
    const receivable = await db.receivables.get(params.receivableId);
    if (!receivable) throw new Error('Receivable not found');

    const newPaidAmount = receivable.paidAmount + params.amount;
    const newRemainingAmount = receivable.totalAmount - newPaidAmount;
    const newStatus = newRemainingAmount <= 0 ? 'PAID' : 'PARTIAL';

    // 1. Update Receivable
    await db.receivables.update(params.receivableId, {
      paidAmount: newPaidAmount,
      remainingAmount: newRemainingAmount,
      status: newStatus
    });

    // 2. Record Receivable Payment
    const paymentId = uuidv4();
    const payment = {
      paymentId,
      receivableId: params.receivableId,
      amount: params.amount,
      paymentMethodId: params.paymentMethodId,
      moneyStorageId: params.moneyStorageId,
      userId: params.cashierId,
      timestamp
    };
    await db.receivablePayments.add(payment);

    // 3. Finance Event
    const financeEvent: FinanceEvent = {
      financeEventId: uuidv4(),
      amount: params.amount,
      storageId: params.moneyStorageId,
      direction: 'IN',
      referenceId: paymentId,
      referenceType: 'RECEIVABLE_PAYMENT',
      userId: params.cashierId,
      deviceId: params.deviceId,
      timestamp
    };
    await db.financeEvents.add(financeEvent);

    // 4. Sync Queue
    await this.addToQueue('receivables', params.receivableId, 'UPDATE', { ...receivable, paidAmount: newPaidAmount, remainingAmount: newRemainingAmount, status: newStatus });
    await this.addToQueue('receivablePayments', paymentId, 'CREATE', payment);
    await this.addToQueue('financeEvents', financeEvent.financeEventId, 'CREATE', financeEvent);

    // 5. Audit
    await AuditEngine.log({
      userId: params.cashierId,
      role: 'KASIR',
      deviceId: params.deviceId,
      action: 'SETTLE_RECEIVABLE',
      module: 'FINANCE',
      referenceId: params.receivableId,
      after: { payment }
    });
  }

  static async checkCreditLimit(customerId: string, amount: number): Promise<{ allowed: boolean; message?: string }> {
    const customer = await db.customers.get(customerId);
    if (!customer) return { allowed: false, message: 'Customer not found' };

    const activeReceivables = await db.receivables
      .where('customerId')
      .equals(customerId)
      .filter(r => r.status === 'OPEN' || r.status === 'PARTIAL' || r.status === 'OVERDUE')
      .toArray();

    const currentDebt = activeReceivables.reduce((acc, r) => acc + r.remainingAmount, 0);
    const projectedDebt = currentDebt + amount;

    if (projectedDebt > customer.creditLimit) {
      return { 
        allowed: false, 
        message: `Limit Kredit Terlampaui! Hutang saat ini: Rp ${currentDebt.toLocaleString()}, Limit: Rp ${customer.creditLimit.toLocaleString()}. Sisa Limit: Rp ${(customer.creditLimit - currentDebt).toLocaleString()}.` 
      };
    }

    return { allowed: true };
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
