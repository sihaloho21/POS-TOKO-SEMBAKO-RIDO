import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { StockMovement, FinanceEvent, AuditLog } from '../types';
import { AuditEngine } from '../audit-engine';
import { StockService } from './stock-service';

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

      // 1. Stock Movement OUT via StockService
      const product = await db.products.get(item.productId);
      await StockService.recordMovement({
        productId: item.productId,
        movementType: 'SUPPLIER_RETURN_OUT',
        qty: item.quantity,
        unit: item.unit || product?.baseUnit || 'PCS',
        referenceId: returnId,
        segmentId: params.moneyStorageId === 'IKAN' ? 'IKAN' : 'WARUNG',
        reason: params.reason || 'Retur Barang ke Supplier (SUPPLIER_RETURN_OUT)',
        costSnapshot: item.price,
        userId: params.userId,
        deviceId: params.deviceId,
        timestamp
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
