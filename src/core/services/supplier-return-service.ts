import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { StockMovement, FinanceEvent, AuditLog } from '../types';
import { AuditEngine } from '../audit-engine';

export class SupplierReturnService {
  static async processReturn(params: {
    supplierId: string;
    items: { productId: string; quantity: number; unit: string; price: number }[];
    moneyStorageId: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
    userId: string;
    deviceId: string;
    reason: string;
  }): Promise<string> {
    const returnId = uuidv4();
    const timestamp = new Date().toISOString();
    let totalRefundAmount = 0;

    for (const item of params.items) {
      const refund = item.quantity * item.price;
      totalRefundAmount += refund;

      // 1. Stock Movement OUT
      const movement: StockMovement = {
        stockMovementId: uuidv4(),
        productId: item.productId,
        quantity: -item.quantity,
        type: 'OUT',
        reason: 'RETURN',
        referenceId: returnId,
        referenceType: 'PURCHASE', // Or specific type if available
        timestamp
      };
      await db.stockMovements.add(movement);

      // 2. Update Product Stock
      const product = await db.products.get(item.productId);
      if (product) {
        await db.products.update(item.productId, {
          stock: product.stock - item.quantity,
          updatedAt: timestamp
        });
      }

      await db.syncQueue.add({
        entityType: 'stockMovements',
        entityId: movement.stockMovementId,
        action: 'CREATE',
        payload: movement,
        status: 'PENDING',
        retryCount: 0,
        createdAt: timestamp
      });
    }

    // 3. Finance Event (Refund IN from Supplier)
    const financeEvent: FinanceEvent = {
      financeEventId: uuidv4(),
      amount: totalRefundAmount,
      storageId: params.moneyStorageId,
      direction: 'IN',
      referenceId: returnId,
      referenceType: 'PURCHASE', // Simplified
      userId: params.userId,
      deviceId: params.deviceId,
      timestamp
    };
    await db.financeEvents.add(financeEvent);

    await db.syncQueue.add({
      entityType: 'financeEvents',
      entityId: financeEvent.financeEventId,
      action: 'CREATE',
      payload: financeEvent,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    await AuditEngine.log({
      userId: params.userId,
      role: 'OWNER',
      deviceId: params.deviceId,
      action: 'SUPPLIER_RETURN',
      module: 'PURCHASING',
      referenceId: returnId,
      after: { supplierId: params.supplierId, amount: totalRefundAmount, items: params.items }
    });

    return returnId;
  }
}
