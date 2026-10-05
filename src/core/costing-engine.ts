import { db } from './database';
import type { Product, ProductCost, StockMovement } from './types';
import { AuditEngine } from './audit-engine';
import { v4 as uuidv4 } from 'uuid';

export interface WacCalculationParams {
  productId: string;
  purchaseQty: number;
  purchasePrice: number;
  discountPerUnit?: number;
  additionalCostPerUnit?: number;
  additionalCostTotal?: number;
}

export interface WacSourceEvent {
  eventId: string;
  eventType: 'OPENING_BALANCE' | 'PURCHASE' | 'COST_ADJUSTMENT' | 'STOCK_OPNAME';
  timestamp: string;
  qty: number;
  unitCost: number;
  effectiveCost: number;
  discountPerUnit?: number;
  additionalCostAllocated?: number;
  wacResult: number;
  referenceId: string;
  supplierName?: string;
  notes?: string;
  user: string;
}

export class CostingEngine {
  /**
   * Calculates new Weighted Average Cost (WAC) based on incoming purchase:
   * New WAC = (Old Stock Value + Effective Purchase Cost) / (Old Qty + Purchase Qty)
   *
   * Effective purchase cost accounts for purchase discount and any capitalized additional cost.
   */
  static async calculateNewWac(
    productIdOrParams: string | WacCalculationParams,
    legacyQty?: number,
    legacyPrice?: number,
    legacyDiscount?: number,
    legacyAdditionalCost?: number
  ): Promise<number> {
    let productId: string;
    let purchaseQty: number;
    let purchasePrice: number;
    let discountPerUnit: number = 0;
    let additionalCostAllocated: number = 0;

    if (typeof productIdOrParams === 'object') {
      productId = productIdOrParams.productId;
      purchaseQty = productIdOrParams.purchaseQty;
      purchasePrice = productIdOrParams.purchasePrice;
      discountPerUnit = productIdOrParams.discountPerUnit || 0;
      additionalCostAllocated = productIdOrParams.additionalCostTotal || 
        (productIdOrParams.additionalCostPerUnit ? productIdOrParams.additionalCostPerUnit * purchaseQty : 0);
    } else {
      productId = productIdOrParams;
      purchaseQty = legacyQty || 0;
      purchasePrice = legacyPrice || 0;
      discountPerUnit = legacyDiscount || 0;
      additionalCostAllocated = legacyAdditionalCost || 0;
    }

    const product = await db.products.get(productId);
    const cost = await db.productCosts.get(productId);
    
    if (!product) throw new Error('Product not found');
    
    const currentStock = Math.max(0, product.stock); // Ignore negative stock for HPP calculation
    const currentHpp = cost?.hpp || product.hpp || 0;
    
    // Effective Purchase Cost accounts for discount and capitalized additional cost
    const effectiveUnitPrice = Math.max(0, purchasePrice - discountPerUnit);
    const effectivePurchaseCost = (purchaseQty * effectiveUnitPrice) + additionalCostAllocated;

    if (currentStock === 0) {
      const unitCost = purchaseQty > 0 ? Math.round(effectivePurchaseCost / purchaseQty) : effectiveUnitPrice;
      return unitCost;
    }
    
    const oldStockValue = currentStock * currentHpp;
    const totalNewStock = currentStock + purchaseQty;
    
    if (totalNewStock <= 0) {
      return effectiveUnitPrice;
    }
    
    const newWac = (oldStockValue + effectivePurchaseCost) / totalNewStock;
    return Math.round(newWac); // Rounding for financial ledger simplicity
  }

  /**
   * Updates HPP in database and synchronizes with product document.
   */
  static async updateHpp(productId: string, newHpp: number): Promise<void> {
    const timestamp = new Date().toISOString();
    await db.productCosts.put({
      productId,
      hpp: newHpp,
      updatedAt: timestamp
    });
    // Keep cached product document in sync with the new WAC/HPP
    await db.products.update(productId, {
      hpp: newHpp,
      updatedAt: timestamp
    });
  }

  /**
   * WAC SOURCE TRACEABILITY:
   * Traces every cost event that contributed to the current WAC for a product:
   * 1. Valid Opening stock cost
   * 2. Purchase updates (with purchase price, discount, and capitalized additional cost)
   * 3. Official cost adjustment / correction events with audit trails
   */
  static async getWacTraceability(productId: string): Promise<{
    product: Product;
    currentWac: number;
    currentStock: number;
    events: WacSourceEvent[];
  }> {
    const product = await db.products.get(productId);
    if (!product) throw new Error(`Product ${productId} tidak ditemukan.`);

    const costDoc = await db.productCosts.get(productId);
    const currentWac = costDoc?.hpp ?? product.hpp ?? 0;

    const events: WacSourceEvent[] = [];

    // 1. Check for OPENING_BALANCE movement
    const openingMovement = await db.stockMovements
      .filter(m => m.productId === productId && m.movementType === 'OPENING_BALANCE')
      .first();

    if (openingMovement) {
      const openingCost = openingMovement.costSnapshot || product.hpp || 0;
      events.push({
        eventId: openingMovement.stockMovementId,
        eventType: 'OPENING_BALANCE',
        timestamp: openingMovement.clientTimestamp || openingMovement.createdAt || openingMovement.timestamp || new Date().toISOString(),
        qty: openingMovement.baseQty || openingMovement.qty,
        unitCost: openingCost,
        effectiveCost: (openingMovement.baseQty || openingMovement.qty) * openingCost,
        wacResult: openingCost,
        referenceId: openingMovement.referenceId || 'OPENING_BALANCE',
        notes: openingMovement.reason || 'Saldo Stok Awal dengan Valid Opening Cost',
        user: openingMovement.userId || 'SYSTEM'
      });
    }

    // 2. Check for PURCHASE_IN movements
    const purchaseMovements = await db.stockMovements
      .filter(m => m.productId === productId && m.movementType === 'PURCHASE_IN')
      .toArray();

    const suppliers = await db.suppliers.toArray();
    const supMap = new Map(suppliers.map(s => [s.supplierId, s.name]));

    for (const pm of purchaseMovements) {
      // Find corresponding purchase record if available
      const purchase = await db.purchases.get(pm.referenceId);
      const purchaseItem = purchase?.items?.find(it => it.productId === productId);
      const supplierName = purchase?.supplierId ? supMap.get(purchase.supplierId) || 'Supplier Mitra' : 'Supplier';

      const unitCost = pm.costSnapshot || purchaseItem?.purchasePrice || product.hpp;
      const discount = purchaseItem?.discount || 0;
      const qty = pm.baseQty || pm.qty;
      const effectiveCost = purchaseItem?.total || (qty * (unitCost - discount));

      events.push({
        eventId: pm.stockMovementId,
        eventType: 'PURCHASE',
        timestamp: pm.clientTimestamp || pm.createdAt || pm.timestamp || new Date().toISOString(),
        qty,
        unitCost,
        discountPerUnit: discount,
        effectiveCost,
        wacResult: pm.costSnapshot || unitCost,
        referenceId: purchase?.invoiceNumber ? `#${purchase.invoiceNumber}` : pm.referenceId,
        supplierName,
        notes: pm.reason || `Penerimaan Pembelian Supplier (${supplierName})`,
        user: pm.userId || 'SYSTEM'
      });
    }

    // 3. Check for official Cost Adjustments in Audit Logs
    const costAuditLogs = await db.auditLogs
      .filter(a => a.module === 'COSTING' || a.action === 'COST_ADJUSTMENT' || a.action === 'COST_CORRECTION')
      .toArray();

    for (const log of costAuditLogs) {
      if (log.after?.productId === productId) {
        events.push({
          eventId: log.auditId,
          eventType: 'COST_ADJUSTMENT',
          timestamp: log.timestamp,
          qty: 0,
          unitCost: log.after?.newHpp || 0,
          effectiveCost: 0,
          wacResult: log.after?.newHpp || 0,
          referenceId: log.referenceId || log.auditId.slice(0, 8),
          notes: `Koreksi Biaya Resmi: ${log.after?.reason || '-'} (${log.after?.notes || 'Audit Terverifikasi'})`,
          user: `${log.userId} (${log.role})`
        });
      }
    }

    // Sort chronologically
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      product,
      currentWac,
      currentStock: product.stock,
      events
    };
  }

  /**
   * NO DIRECT FREE WAC EDIT:
   * Cost adjustments can only occur through official, validated events with Owner authorization
   * and complete audit trail logging.
   */
  static async recordCostAdjustment(params: {
    productId: string;
    newHpp: number;
    reason: string;
    notes?: string;
    userId: string;
    role: string;
    deviceId?: string;
  }): Promise<{ oldHpp: number; newHpp: number; auditId: string }> {
    if (params.role !== 'OWNER') {
      throw new Error('Hanya Owner yang memiliki wewenang untuk melakukan koreksi/penyesuaian HPP.');
    }

    if (!params.reason?.trim()) {
      throw new Error('Alasan koreksi HPP wajib diisi untuk kepatuhan audit trail.');
    }

    if (params.newHpp < 0) {
      throw new Error('Nilai HPP tidak boleh bernilai negatif.');
    }

    const product = await db.products.get(params.productId);
    if (!product) throw new Error('Produk tidak ditemukan.');

    const costDoc = await db.productCosts.get(params.productId);
    const oldHpp = costDoc?.hpp ?? product.hpp ?? 0;

    // 1. Update HPP
    await this.updateHpp(params.productId, params.newHpp);

    const auditRef = `cost_adj_${uuidv4().slice(0, 8)}`;
    const timestamp = new Date().toISOString();

    // 2. Audit Log with complete before/after tracking
    const audit = await AuditEngine.log({
      userId: params.userId,
      role: 'OWNER',
      deviceId: params.deviceId || 'device-1',
      action: 'COST_ADJUSTMENT',
      module: 'COSTING',
      referenceId: auditRef,
      before: {
        productId: params.productId,
        productName: product.name,
        hpp: oldHpp
      },
      after: {
        productId: params.productId,
        productName: product.name,
        oldHpp,
        newHpp: params.newHpp,
        reason: params.reason,
        notes: params.notes || ''
      }
    });

    // 3. Record an entry in stock movement ledger to preserve cost event continuity
    await db.stockMovements.add({
      stockMovementId: auditRef,
      productId: params.productId,
      referenceId: auditRef,
      movementType: 'ADJUSTMENT_IN',
      qty: 0,
      unit: product.baseUnit,
      baseQty: 0,
      segmentId: product.productType === 'FISH' ? 'IKAN' : 'WARUNG',
      clientTimestamp: timestamp,
      serverTimestamp: null,
      deviceId: params.deviceId || 'device-1',
      userId: params.userId,
      reason: `Koreksi HPP Resmi: ${params.reason} (${params.notes || 'Penyesuaian Akuntansi'})`,
      costSnapshot: params.newHpp,
      createdAt: timestamp,
      quantity: 0,
      type: 'IN',
      timestamp
    });

    return {
      oldHpp,
      newHpp: params.newHpp,
      auditId: audit.auditId
    };
  }
}

