import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { Purchase, PurchaseItem, StockMovement, FinanceEvent, SyncQueueItem } from '../types';
import { CostingEngine } from '../costing-engine';
import { AuditEngine } from '../audit-engine';
import { StockService } from './stock-service';

export class PurchaseService {
  static async createPurchase(params: {
    supplierId: string;
    invoiceNumber: string;
    items: {
      productId: string;
      quantity: number;
      unit: string;
      purchasePrice: number;
      discount: number;
    }[];
    paymentStatus: 'PAID' | 'PAYABLE';
    moneyStorageId?: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
    userId: string;
    deviceId: string;
  }): Promise<string> {
    const purchaseId = uuidv4();
    const timestamp = new Date().toISOString();
    
    let total = 0;
    const purchaseItems: PurchaseItem[] = [];

    for (const item of params.items) {
      const effectiveCost = item.purchasePrice - item.discount;
      const subtotal = effectiveCost * item.quantity;
      total += subtotal;

      purchaseItems.push({
        ...item,
        effectiveCost,
        total: subtotal
      });

      const product = await db.products.get(item.productId);
      if (!product) continue;

      // 1. Calculate New WAC/HPP
      let baseQty = item.quantity;
      if (item.unit !== product.baseUnit) {
        const conversion = product.conversionRules.find(r => r.toUnit === item.unit);
        if (conversion) baseQty = item.quantity * conversion.factor;
      }

      const newWac = await CostingEngine.calculateNewWac(item.productId, baseQty, effectiveCost);
      await CostingEngine.updateHpp(item.productId, newWac);

      // 2. Record Stock Movement via StockService (derives stock)
      await StockService.recordMovement({
        productId: item.productId,
        movementType: 'PURCHASE_IN',
        qty: item.quantity,
        unit: item.unit,
        baseQty,
        referenceId: purchaseId,
        segmentId: product.productType === 'FISH' ? 'IKAN' : 'WARUNG',
        reason: `Penerimaan Pembelian Faktur #${params.invoiceNumber || purchaseId}`,
        costSnapshot: effectiveCost,
        userId: 'SYSTEM',
        deviceId: 'LOCAL',
        timestamp
      });
    }

    const purchase: Purchase = {
      purchaseId,
      supplierId: params.supplierId,
      invoiceNumber: params.invoiceNumber,
      status: params.paymentStatus === 'PAID' ? 'PAID' : 'CONFIRMED',
      items: purchaseItems,
      total,
      timestamp,
      createdAt: timestamp
    };

    await db.purchases.add(purchase);
    await this.addToQueue('purchases', purchaseId, 'CREATE', purchase);

    // 4. Handle Finance (Outflow if PAID)
    if (params.paymentStatus === 'PAID' && params.moneyStorageId) {
      const financeEvent: FinanceEvent = {
        financeEventId: uuidv4(),
        amount: total,
        storageId: params.moneyStorageId,
        direction: 'OUT',
        referenceId: purchaseId,
        referenceType: 'PURCHASE',
        userId: params.userId,
        deviceId: params.deviceId,
        timestamp
      };
      await db.financeEvents.add(financeEvent);
      await this.addToQueue('financeEvents', financeEvent.financeEventId, 'CREATE', financeEvent);
    }

    // 5. Audit
    await AuditEngine.log({
      userId: params.userId,
      role: 'SUPERVISOR',
      deviceId: params.deviceId,
      action: 'CREATE_PURCHASE',
      module: 'PURCHASES',
      referenceId: purchaseId,
      after: purchase
    });

    return purchaseId;
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
