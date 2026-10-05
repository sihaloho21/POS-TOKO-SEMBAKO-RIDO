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
import { StockService } from './services/stock-service';
import { BundleService } from './services/bundle-service';

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
    allowInsufficientStock?: boolean;
  }): Promise<string> {
    const transactionId = uuidv4();
    const timestamp = new Date().toISOString();
    
    // Validate items and resolve bundle HPP/component snapshots at finalization
    for (const item of params.items) {
      const product = await db.products.get(item.productId);
      if (!product) continue;

      if (product.productType === 'BUNDLE') {
        const bundleValidation = await BundleService.validateBundleForSale(
          item.productId,
          item.quantity,
          !!params.allowInsufficientStock
        );
        if (!bundleValidation.valid) {
          throw new Error(bundleValidation.error || `Validasi paket ${product.name} gagal.`);
        }
        item.isBundle = true;
        item.hppSnapshot = bundleValidation.totalHpp;
        item.bundleComponentsSnapshot = await BundleService.createBundleSnapshot(
          item.productId,
          item.quantity
        );
      } else {
        const stockValidation = await StockService.validateSaleItems(
          [item],
          !!params.allowInsufficientStock
        );
        if (!stockValidation.valid) {
          throw new Error(stockValidation.error || 'Stok tidak mencukupi untuk item penjualan.');
        }
        const costDoc = await db.productCosts.get(item.productId);
        item.hppSnapshot = costDoc?.hpp ?? product.hpp;
      }
    }
    
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

      if (product.productType === 'BUNDLE' && item.bundleComponentsSnapshot) {
        // Bundle does NOT have physical stock itself.
        // Selling bundle reduces component stock!
        for (const comp of item.bundleComponentsSnapshot) {
          const compProduct = await db.products.get(comp.componentProductId);
          await StockService.recordMovement({
            productId: comp.componentProductId,
            movementType: 'BUNDLE_COMPONENT_OUT',
            qty: comp.totalQty,
            unit: comp.unit,
            baseQty: comp.totalQty,
            referenceId: transactionId,
            transactionId,
            segmentId: compProduct?.productType === 'FISH' ? 'IKAN' : 'WARUNG',
            reason: `Komponen Paket ${product.name} (${item.quantity}x)`,
            costSnapshot: comp.wacSnapshot,
            userId: params.cashierId,
            deviceId: params.deviceId,
            timestamp
          });

          // Check if shortage occurred with Owner override
          const compStock = await StockService.getDerivedStock(comp.componentProductId);
          if (compStock < 0) {
            await StockService.flagStockShortageConflict({
              productId: comp.componentProductId,
              productName: comp.nameSnapshot,
              currentStock: compStock,
              userId: params.cashierId,
              deviceId: params.deviceId,
              referenceId: transactionId,
              reason: `Penjualan paket ${product.name} dengan Owner Override menyebabkan shortage komponen ${comp.nameSnapshot} (${compStock} ${comp.unit}).`
            });
          }
        }
      } else {
        // Physical product
        let baseQty = item.quantity;
        // Multi-unit conversion snapshot (PRD 9)
        if (item.unit !== product.baseUnit) {
          const conversion = product.conversionRules?.find(r => r.toUnit === item.unit);
          if (conversion && conversion.factor > 0) {
            baseQty = item.quantity * conversion.factor;
          }
        }

        // Record Stock Movement via StockService (derives stock balance, never direct edit)
        await StockService.recordMovement({
          productId: item.productId,
          movementType: 'SALE_OUT',
          qty: item.quantity,
          unit: item.unit,
          baseQty,
          referenceId: transactionId,
          transactionId,
          segmentId: params.moneyStorageId === 'IKAN' ? 'IKAN' : 'WARUNG',
          reason: 'SALE_OUT',
          costSnapshot: product.hpp,
          userId: params.cashierId,
          deviceId: params.deviceId,
          timestamp
        });

        // Check if override resulted in negative stock shortage -> flag for review
        const derivedStock = await StockService.getDerivedStock(item.productId);
        if (derivedStock < 0) {
          await StockService.flagStockShortageConflict({
            productId: item.productId,
            productName: product.name,
            currentStock: derivedStock,
            userId: params.cashierId,
            deviceId: params.deviceId,
            referenceId: transactionId,
            reason: `Penjualan kasir (${transaction.receiptNumber}) menyebabkan stok negatif: ${derivedStock} ${product.baseUnit}`
          });
        }
      }
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

  static async processReturnOrVoid(params: {
    transactionId: string;
    userId: string;
    role: string;
    actionType: 'VOID' | 'RETURN' | 'REFUND';
    reason: string;
  }): Promise<void> {
    const transaction = await db.transactions.get(params.transactionId);
    if (!transaction) throw new Error('Transaksi tidak ditemukan.');
    if (transaction.status === 'VOIDED' || transaction.status === 'CANCELLED') {
      throw new Error('Transaksi sudah dibatalkan sebelumnya.');
    }

    const timestamp = new Date().toISOString();

    // 1. Update Transaction Status
    const newStatus = params.actionType === 'VOID' ? 'VOIDED' : 'CANCELLED';
    await db.transactions.update(params.transactionId, {
      status: newStatus,
      serverTimestamp: timestamp
    });

    // 2. Reverse Stock Movements
    for (const item of transaction.items) {
      if (item.isBundle && item.bundleComponentsSnapshot?.length) {
        // Return/void whole bundle - reverses each component movement
        const compReversalType = params.actionType === 'VOID' ? 'VOID_REVERSAL_IN' : 'BUNDLE_RETURN_COMPONENT_IN';
        for (const comp of item.bundleComponentsSnapshot) {
          const compProduct = await db.products.get(comp.componentProductId);
          await StockService.recordMovement({
            productId: comp.componentProductId,
            movementType: compReversalType,
            qty: comp.totalQty,
            unit: comp.unit,
            baseQty: comp.totalQty,
            referenceId: params.transactionId,
            transactionId: params.transactionId,
            segmentId: compProduct?.productType === 'FISH' ? 'IKAN' : 'WARUNG',
            reason: params.reason || (params.actionType === 'VOID' ? `Batal Transaksi (Void) Komponen Paket ${item.nameSnapshot}` : `Retur Komponen Paket: ${item.nameSnapshot}`),
            costSnapshot: comp.wacSnapshot,
            userId: params.userId,
            deviceId: transaction.deviceId,
            timestamp
          });
        }
      } else {
        const product = await db.products.get(item.productId);
        if (!product) continue;

        let baseQty = item.quantity;
        if (item.unit !== product.baseUnit) {
          const conversion = product.conversionRules?.find(r => r.toUnit === item.unit);
          if (conversion && conversion.factor > 0) {
            baseQty = item.quantity * conversion.factor;
          }
        }

        const reversalType = params.actionType === 'VOID' ? 'VOID_REVERSAL_IN' : 'SALE_RETURN_IN';
        await StockService.recordMovement({
          productId: item.productId,
          movementType: reversalType,
          qty: item.quantity,
          unit: item.unit,
          baseQty,
          referenceId: params.transactionId,
          transactionId: params.transactionId,
          segmentId: transaction.moneyStorageId === 'IKAN' ? 'IKAN' : 'WARUNG',
          reason: params.reason || (params.actionType === 'VOID' ? 'VOID_REVERSAL_IN' : 'SALE_RETURN_IN'),
          costSnapshot: item.hppSnapshot ?? product.hpp,
          userId: params.userId,
          deviceId: transaction.deviceId,
          timestamp
        });
      }
    }

    // 3. Reverse Finance Event if was cash sale
    if (transaction.paymentMethodId === 'CASH') {
      const reverseFinance: FinanceEvent = {
        financeEventId: uuidv4(),
        amount: transaction.total,
        storageId: transaction.moneyStorageId,
        direction: 'OUT',
        referenceId: params.transactionId,
        referenceType: 'EXPENSE',
        userId: params.userId,
        deviceId: transaction.deviceId,
        timestamp
      };
      await db.financeEvents.add(reverseFinance);
      await this.addToQueue('financeEvents', reverseFinance.financeEventId, 'CREATE', reverseFinance);
    }

    // 4. If was GAJIAN, cancel or reduce receivable
    if (transaction.type === 'GAJIAN') {
      const receivable = await db.receivables.where('transactionId').equals(params.transactionId).first();
      if (receivable) {
        await db.receivables.update(receivable.receivableId, {
          status: 'PAID', // or voided
          remainingAmount: 0
        });
      }
    }

    // 5. Audit Logging
    await AuditEngine.log({
      userId: params.userId,
      role: params.role,
      deviceId: transaction.deviceId,
      action: `${params.actionType}_TRANSACTION`,
      module: 'POS',
      referenceId: params.transactionId,
      reason: params.reason,
      after: { ...transaction, status: newStatus }
    });

    await this.addToQueue('transactions', params.transactionId, 'UPDATE', {
      ...transaction,
      status: newStatus
    });
  }

  static async voidTransaction(transactionId: string, userId: string, deviceId: string, reason: string): Promise<void> {
    await this.processReturnOrVoid({
      transactionId,
      userId,
      role: 'KASIR', // Default as it's from POS
      actionType: 'VOID',
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
    const receivable = await db.receivables.get(params.receivableId);
    if (!receivable) throw new Error('Receivable not found');

    const timestamp = new Date().toISOString();
    const paymentId = uuidv4();

    // 1. Record Finance Event
    const financeEvent: FinanceEvent = {
      financeEventId: uuidv4(),
      amount: params.amount,
      storageId: params.moneyStorageId,
      direction: 'IN',
      referenceId: params.receivableId,
      referenceType: 'RECEIVABLE_PAYMENT',
      userId: params.cashierId,
      deviceId: params.deviceId,
      timestamp
    };
    await db.financeEvents.add(financeEvent);

    // 2. Update Receivable
    const newPaidAmount = receivable.paidAmount + params.amount;
    const newRemainingAmount = Math.max(0, receivable.totalAmount - newPaidAmount);
    const newStatus = newRemainingAmount <= 0 ? 'PAID' : 'PARTIAL';

    await db.receivables.update(params.receivableId, {
      paidAmount: newPaidAmount,
      remainingAmount: newRemainingAmount,
      status: newStatus
    });

    // 3. Record Receivable Payment
    await (db as any).receivablePayments.add({
      paymentId,
      receivableId: params.receivableId,
      amount: params.amount,
      paymentMethodId: params.paymentMethodId,
      moneyStorageId: params.moneyStorageId,
      userId: params.cashierId,
      timestamp
    });

    // 4. Audit Log
    await AuditEngine.log({
      userId: params.cashierId,
      role: 'KASIR',
      deviceId: params.deviceId,
      action: 'SETTLE_RECEIVABLE',
      module: 'FINANCE',
      referenceId: params.receivableId,
      after: { paymentId, amount: params.amount, newRemainingAmount }
    });

    // 5. Sync Queue
    await this.addToQueue('financeEvents', financeEvent.financeEventId, 'CREATE', financeEvent);
    await this.addToQueue('receivables', params.receivableId, 'UPDATE', { ...receivable, paidAmount: newPaidAmount, remainingAmount: newRemainingAmount, status: newStatus });
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
