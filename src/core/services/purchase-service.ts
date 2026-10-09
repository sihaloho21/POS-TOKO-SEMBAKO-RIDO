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
    additionalCost?: number;
    additionalCostAllocation?: 'CAPITALIZE_INTO_WAC' | 'OPERATIONAL_EXPENSE';
    additionalCostNotes?: string;
    paymentStatus: 'PAID' | 'PAYABLE';
    moneyStorageId?: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
    userId: string;
    deviceId: string;
  }): Promise<string> {
    const purchaseId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const additionalCost = Math.max(0, params.additionalCost || 0);
    const allocation = params.additionalCostAllocation || 'CAPITALIZE_INTO_WAC';

    // 1. Calculate items subtotal
    let itemsSubtotal = 0;
    for (const item of params.items) {
      const effectiveUnitPrice = Math.max(0, item.purchasePrice - item.discount);
      itemsSubtotal += (effectiveUnitPrice * item.quantity);
    }

    const totalInvoice = itemsSubtotal + additionalCost;
    const purchaseItems: PurchaseItem[] = [];
    const additionalCostMappings: { productId: string; productName: string; allocatedCost: number }[] = [];

    for (const item of params.items) {
      const effectiveUnitPrice = Math.max(0, item.purchasePrice - item.discount);
      const itemSubtotal = effectiveUnitPrice * item.quantity;

      // Allocate additional cost if Owner chose to capitalize into WAC
      let itemAdditionalCostShare = 0;
      if (additionalCost > 0 && allocation === 'CAPITALIZE_INTO_WAC') {
        itemAdditionalCostShare = itemsSubtotal > 0
          ? Math.round((itemSubtotal / itemsSubtotal) * additionalCost)
          : Math.round(additionalCost / params.items.length);
      }

      purchaseItems.push({
        ...item,
        effectiveCost: effectiveUnitPrice + (item.quantity > 0 ? itemAdditionalCostShare / item.quantity : 0),
        total: itemSubtotal + itemAdditionalCostShare
      });

      const product = await db.products.get(item.productId);
      if (!product) continue;

      additionalCostMappings.push({
        productId: item.productId,
        productName: product.name,
        allocatedCost: itemAdditionalCostShare
      });

      // 1. Calculate New WAC with effective purchase cost (accounting for discount & allocated additional cost)
      let baseQty = item.quantity;
      if (item.unit !== product.baseUnit) {
        const conversion = product.conversionRules.find(r => r.toUnit === item.unit);
        if (conversion) baseQty = item.quantity * conversion.factor;
      }

      const newWac = await CostingEngine.calculateNewWac({
        productId: item.productId,
        purchaseQty: baseQty,
        purchasePrice: item.purchasePrice,
        discountPerUnit: item.discount,
        additionalCostTotal: itemAdditionalCostShare
      });
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
        reason: `Penerimaan Pembelian Faktur #${params.invoiceNumber || purchaseId} (Diskon: Rp ${item.discount.toLocaleString()}${itemAdditionalCostShare > 0 ? `, Biaya Tambahan WAC: Rp ${itemAdditionalCostShare.toLocaleString()}` : ''})`,
        costSnapshot: Math.round((itemSubtotal + itemAdditionalCostShare) / (baseQty || 1)),
        userId: params.userId || 'SYSTEM',
        deviceId: params.deviceId || 'LOCAL',
        timestamp
      });
    }

    const purchase: Purchase = {
      purchaseId,
      supplierId: params.supplierId,
      invoiceNumber: params.invoiceNumber,
      status: params.paymentStatus === 'PAID' ? 'PAID' : 'CONFIRMED',
      items: purchaseItems,
      total: totalInvoice,
      timestamp,
      createdAt: timestamp
    };

    await db.purchases.add(purchase);
    await this.addToQueue('purchases', purchaseId, 'CREATE', purchase);

    // 3. Handle additional cost audit and operational expense if chosen
    if (additionalCost > 0) {
      if (allocation === 'OPERATIONAL_EXPENSE') {
        // Only record immediate cash outflow if purchase is PAID
        if (params.paymentStatus === 'PAID' && params.moneyStorageId) {
          const expenseEvent: FinanceEvent = {
            financeEventId: uuidv4(),
            amount: additionalCost,
            storageId: params.moneyStorageId,
            direction: 'OUT',
            referenceId: purchaseId,
            referenceType: 'EXPENSE',
            description: `Biaya Tambahan / Ongkir Faktur #${params.invoiceNumber} (${params.additionalCostNotes || 'Beban Opex'})`,
            userId: params.userId,
            deviceId: params.deviceId,
            timestamp
          };
          await db.financeEvents.add(expenseEvent);
          await this.addToQueue('financeEvents', expenseEvent.financeEventId, 'CREATE', expenseEvent);
        }

        await AuditEngine.log({
          userId: params.userId,
          role: 'OWNER',
          deviceId: params.deviceId,
          action: 'PURCHASE_ADDITIONAL_COST_EXPENSED',
          module: 'COSTING',
          referenceId: purchaseId,
          after: {
            invoiceNumber: params.invoiceNumber,
            additionalCost,
            paymentStatus: params.paymentStatus,
            treatment: 'OPERATIONAL_EXPENSE',
            notes: params.additionalCostNotes || 'Beban operasional logistik/pengiriman pembelian'
          }
        });
      } else {
        await AuditEngine.log({
          userId: params.userId,
          role: 'OWNER',
          deviceId: params.deviceId,
          action: 'PURCHASE_ADDITIONAL_COST_CAPITALIZED',
          module: 'COSTING',
          referenceId: purchaseId,
          after: {
            invoiceNumber: params.invoiceNumber,
            additionalCost,
            paymentStatus: params.paymentStatus,
            treatment: 'CAPITALIZE_INTO_WAC',
            notes: params.additionalCostNotes || 'Kapitalisasi biaya tambahan ke WAC produk',
            mapping: additionalCostMappings
          }
        });
      }
    }

    // 4. Handle Finance (Outflow if PAID)
    if (params.paymentStatus === 'PAID' && params.moneyStorageId) {
      const goodsAmount = allocation === 'OPERATIONAL_EXPENSE' ? itemsSubtotal : totalInvoice;

      const financeEvent: FinanceEvent = {
        financeEventId: uuidv4(),
        amount: goodsAmount,
        storageId: params.moneyStorageId,
        direction: 'OUT',
        referenceId: purchaseId,
        referenceType: 'PURCHASE',
        description: `Pembayaran Pembelian Faktur #${params.invoiceNumber}`,
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
      role: 'OWNER',
      deviceId: params.deviceId,
      action: 'CREATE_PURCHASE',
      module: 'PURCHASES',
      referenceId: purchaseId,
      after: purchase
    });

    return purchaseId;
  }

  static async payPurchasePayable(params: {
    purchaseId: string;
    moneyStorageId: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
    userId: string;
    deviceId: string;
  }): Promise<void> {
    const purchase = await db.purchases.get(params.purchaseId);
    if (!purchase) throw new Error('Data pembelian tidak ditemukan.');
    if (purchase.status === 'PAID') throw new Error('Faktur pembelian ini sudah lunas.');

    const timestamp = new Date().toISOString();
    const financeEvent: FinanceEvent = {
      financeEventId: uuidv4(),
      amount: purchase.total,
      storageId: params.moneyStorageId,
      direction: 'OUT',
      referenceId: purchase.purchaseId,
      referenceType: 'PURCHASE',
      description: `Pelunasan Hutang Supplier Faktur #${purchase.invoiceNumber}`,
      userId: params.userId,
      deviceId: params.deviceId,
      timestamp
    };

    const updatedPurchase: Purchase = {
      ...purchase,
      status: 'PAID'
    };

    await db.purchases.update(params.purchaseId, { status: 'PAID' });
    await db.financeEvents.add(financeEvent);

    await this.addToQueue('purchases', params.purchaseId, 'UPDATE', updatedPurchase);
    await this.addToQueue('financeEvents', financeEvent.financeEventId, 'CREATE', financeEvent);

    await AuditEngine.log({
      userId: params.userId,
      role: 'OWNER',
      deviceId: params.deviceId,
      action: 'PAY_SUPPLIER_PAYABLE',
      module: 'PURCHASES',
      referenceId: params.purchaseId,
      before: { status: purchase.status },
      after: { status: 'PAID', amount: purchase.total, storageId: params.moneyStorageId }
    });
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
