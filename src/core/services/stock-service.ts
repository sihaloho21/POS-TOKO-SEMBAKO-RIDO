import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { 
  Product, 
  StockMovement, 
  StockMovementType, 
  StockAdjustmentReason, 
  BusinessConflict 
} from '../types';
import { AuditEngine } from '../audit-engine';

export function getMovementDelta(movement: { movementType: StockMovementType; baseQty: number }): number {
  const base = Math.abs(movement.baseQty);
  switch (movement.movementType) {
    case 'OPENING_BALANCE':
    case 'PURCHASE_IN':
    case 'SALE_RETURN_IN':
    case 'BUNDLE_RETURN_COMPONENT_IN':
    case 'STOCK_OPNAME_IN':
    case 'ADJUSTMENT_IN':
    case 'VOID_REVERSAL_IN':
      return base;

    case 'SALE_OUT':
    case 'BUNDLE_COMPONENT_OUT':
    case 'STOCK_OPNAME_OUT':
    case 'DAMAGED_OUT':
    case 'LOST_OUT':
    case 'EXPIRED_OUT':
    case 'FISH_DEAD_OUT':
    case 'ADJUSTMENT_OUT':
    case 'VOID_REVERSAL_OUT':
    case 'SUPPLIER_RETURN_OUT':
      return -base;

    case 'OTHER_VALIDATED_MOVEMENT':
      return movement.baseQty;

    default:
      return 0;
  }
}

export function isMovementIn(type: StockMovementType): boolean {
  return [
    'OPENING_BALANCE',
    'PURCHASE_IN',
    'SALE_RETURN_IN',
    'BUNDLE_RETURN_COMPONENT_IN',
    'STOCK_OPNAME_IN',
    'ADJUSTMENT_IN',
    'VOID_REVERSAL_IN'
  ].includes(type);
}

export interface RecordMovementParams {
  productId: string;
  movementType: StockMovementType;
  qty: number;
  unit: string;
  baseQty?: number;
  referenceId: string;
  transactionId?: string;
  segmentId?: 'WARUNG' | 'IKAN' | string;
  reason: string;
  costSnapshot?: number;
  userId?: string;
  deviceId?: string;
  timestamp?: string;
}

export interface StockShortage {
  productId: string;
  productName: string;
  requestedBaseQty: number;
  availableStock: number;
  shortageQty: number;
}

export class StockService {
  /**
   * Calculate derived stock balance for a product directly from the movement ledger.
   * Stock balance must be derived, never an arbitrary stock = stock + 1.
   */
  static async getDerivedStock(productId: string): Promise<number> {
    const movements = await db.stockMovements
      .where('productId')
      .equals(productId)
      .toArray();

    let derived = 0;
    for (const m of movements) {
      if (m.movementType) {
        derived += getMovementDelta(m);
      } else if (m.quantity !== undefined) {
        derived += m.quantity;
      }
    }

    return Number(derived.toFixed(4));
  }

  /**
   * Reconcile cached product.stock with the actual derived ledger total.
   */
  static async reconcileProductStock(productId: string): Promise<number> {
    const derivedStock = await this.getDerivedStock(productId);
    const timestamp = new Date().toISOString();
    
    await db.products.update(productId, {
      stock: derivedStock,
      updatedAt: timestamp
    });

    return derivedStock;
  }

  /**
   * Reconcile all products in the database.
   */
  static async reconcileAllProducts(): Promise<Record<string, number>> {
    const products = await db.products.toArray();
    const result: Record<string, number> = {};

    for (const p of products) {
      const derived = await this.reconcileProductStock(p.productId);
      result[p.productId] = derived;
    }

    return result;
  }

  /**
   * Record a validated stock movement. Single gateway for stock updates.
   */
  static async recordMovement(params: RecordMovementParams): Promise<StockMovement> {
    const product = await db.products.get(params.productId);
    if (!product) {
      throw new Error(`Produk dengan ID ${params.productId} tidak ditemukan.`);
    }

    const timestamp = params.timestamp || new Date().toISOString();
    const unit = params.unit || product.baseUnit;

    // Calculate baseQty
    let baseQty = params.baseQty !== undefined ? Math.abs(params.baseQty) : Math.abs(params.qty);
    if (params.baseQty === undefined && unit !== product.baseUnit) {
      const conversion = product.conversionRules?.find(r => r.toUnit === unit);
      if (conversion && conversion.factor > 0) {
        baseQty = Math.abs(params.qty) * conversion.factor;
      }
    }

    const movementDelta = getMovementDelta({
      movementType: params.movementType,
      baseQty
    });

    const isDirectionIn = isMovementIn(params.movementType);
    const segmentId = params.segmentId || (product.productType === 'FISH' ? 'IKAN' : 'WARUNG');
    const deviceId = params.deviceId || 'device-1';
    const userId = params.userId || 'SYSTEM';

    const stockMovementId = uuidv4();
    const movement: StockMovement = {
      stockMovementId,
      productId: params.productId,
      referenceId: params.referenceId,
      transactionId: params.transactionId || params.referenceId,
      movementType: params.movementType,
      qty: Math.abs(params.qty),
      unit,
      baseQty,
      segmentId,
      clientTimestamp: timestamp,
      serverTimestamp: null,
      deviceId,
      userId,
      reason: params.reason,
      costSnapshot: params.costSnapshot !== undefined ? params.costSnapshot : (product.hpp || 0),
      createdAt: timestamp,

      // Legacy compatibility fields
      quantity: movementDelta,
      type: isDirectionIn ? 'IN' : 'OUT',
      referenceType: params.referenceId.startsWith('tx_') || params.transactionId ? 'TRANSACTION' : 'STOCK_ADJUSTMENT',
      timestamp
    };

    // 1. Add to stock movement ledger
    await db.stockMovements.add(movement);

    // 2. Derive and update product stock projection
    const derivedStock = await this.getDerivedStock(params.productId);
    await db.products.update(params.productId, {
      stock: derivedStock,
      updatedAt: timestamp
    });

    // 3. Queue for synchronization
    await db.syncQueue.add({
      entityType: 'stockMovements',
      entityId: stockMovementId,
      action: 'CREATE',
      payload: movement,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    // 4. Audit log
    await AuditEngine.log({
      userId,
      role: 'SYSTEM',
      deviceId,
      action: `STOCK_MOVEMENT_${params.movementType}`,
      module: 'INVENTORY',
      referenceId: stockMovementId,
      after: {
        productId: params.productId,
        productName: product.name,
        movementType: params.movementType,
        qty: params.qty,
        unit,
        baseQty,
        delta: movementDelta,
        newDerivedStock: derivedStock,
        reason: params.reason
      }
    });

    return movement;
  }

  /**
   * Process manual stock adjustment with required reasons.
   */
  static async recordAdjustment(params: {
    productId: string;
    adjustmentReason: StockAdjustmentReason | string;
    qty: number;
    unit?: string;
    direction: 'IN' | 'OUT';
    userId: string;
    deviceId?: string;
    notes?: string;
    isOwnerOverride?: boolean;
  }): Promise<StockMovement> {
    const product = await db.products.get(params.productId);
    if (!product) throw new Error('Produk tidak ditemukan.');

    const unit = params.unit || product.baseUnit;
    let baseQty = Math.abs(params.qty);
    if (unit !== product.baseUnit) {
      const conv = product.conversionRules?.find(r => r.toUnit === unit);
      if (conv && conv.factor > 0) baseQty = Math.abs(params.qty) * conv.factor;
    }

    const currentStock = await this.getDerivedStock(params.productId);

    // Normal flow prevents negative stock
    if (params.direction === 'OUT' && currentStock - baseQty < 0 && !params.isOwnerOverride) {
      throw new Error(
        `Penyesuaian stok ditolak: Stok tidak mencukupi. Stok saat ini ${currentStock} ${product.baseUnit}, permohonan keluar ${baseQty} ${product.baseUnit}. Memerlukan Owner override untuk kekurangan stok.`
      );
    }

    // Determine movementType
    let movementType: StockMovementType;
    if (params.direction === 'IN') {
      if (params.adjustmentReason === 'Kesalahan stok opname') {
        movementType = 'STOCK_OPNAME_IN';
      } else {
        movementType = 'ADJUSTMENT_IN';
      }
    } else {
      switch (params.adjustmentReason) {
        case 'Rusak':
          movementType = 'DAMAGED_OUT';
          break;
        case 'Hilang':
          movementType = 'LOST_OUT';
          break;
        case 'Kadaluarsa':
          movementType = 'EXPIRED_OUT';
          break;
        case 'Ikan mati/tidak layak jual':
          movementType = 'FISH_DEAD_OUT';
          break;
        case 'Kesalahan stok opname':
          movementType = 'STOCK_OPNAME_OUT';
          break;
        case 'Salah Input':
        case 'Lainnya':
        default:
          movementType = 'ADJUSTMENT_OUT';
          break;
      }
    }

    const referenceId = `adj_${uuidv4().slice(0, 8)}`;
    const fullReason = params.notes 
      ? `${params.adjustmentReason} - ${params.notes}`
      : params.adjustmentReason;

    const movement = await this.recordMovement({
      productId: params.productId,
      movementType,
      qty: Math.abs(params.qty),
      unit,
      baseQty,
      referenceId,
      reason: fullReason,
      userId: params.userId,
      deviceId: params.deviceId || 'device-1'
    });

    // Check if adjustment created negative shortage with Owner override
    const newStock = await this.getDerivedStock(params.productId);
    if (newStock < 0) {
      await this.flagStockShortageConflict({
        productId: params.productId,
        productName: product.name,
        currentStock: newStock,
        userId: params.userId,
        deviceId: params.deviceId || 'device-1',
        referenceId,
        reason: `Penyesuaian stok (${fullReason}) menyebabkan stok negatif: ${newStock} ${product.baseUnit}`
      });
    }

    return movement;
  }

  /**
   * Validate stock availability for sale items before processing transaction.
   * If normal flow: prevents negative stock.
   * If owner override: allows insufficient stock, but flags shortage as STOCK_PENDING_REVIEW.
   */
  static async validateSaleItems(
    items: { productId: string; quantity: number; unit?: string }[],
    allowInsufficientStock: boolean = false
  ): Promise<{
    valid: boolean;
    shortages: StockShortage[];
    error?: string;
  }> {
    const shortages: StockShortage[] = [];

    for (const item of items) {
      const product = await db.products.get(item.productId);
      if (!product) continue;

      // Skip bundles if components are checked separately
      if (product.productType === 'BUNDLE') {
        const bundle = await db.bundles.get(item.productId);
        if (bundle) {
          for (const comp of bundle.components) {
            const compId = comp.componentProductId || comp.productId;
            if (!compId) continue;
            const compProduct = await db.products.get(compId);
            if (!compProduct) continue;
            const qtyPerBundle = Number(comp.qtyPerBundle || comp.qty || 1);
            const compReqBaseQty = qtyPerBundle * item.quantity;
            const available = await this.getDerivedStock(compId);
            if (available < compReqBaseQty) {
              shortages.push({
                productId: compId,
                productName: `${compProduct.name} (Komponen Paket ${product.name})`,
                requestedBaseQty: compReqBaseQty,
                availableStock: available,
                shortageQty: compReqBaseQty - available
              });
            }
          }
        }
        continue;
      }

      let baseQty = item.quantity;
      if (item.unit && item.unit !== product.baseUnit) {
        const conv = product.conversionRules?.find(r => r.toUnit === item.unit);
        if (conv && conv.factor > 0) baseQty = item.quantity * conv.factor;
      }

      const available = await this.getDerivedStock(item.productId);
      if (available < baseQty) {
        shortages.push({
          productId: item.productId,
          productName: product.name,
          requestedBaseQty: baseQty,
          availableStock: available,
          shortageQty: baseQty - available
        });
      }
    }

    if (shortages.length > 0 && !allowInsufficientStock) {
      const details = shortages
        .map(s => `${s.productName} (Sisa: ${s.availableStock}, Diminta: ${s.requestedBaseQty})`)
        .join(', ');
      return {
        valid: false,
        shortages,
        error: `Transaksi dibatalkan: Stok tidak mencukupi untuk ${details}. Hubungi Owner jika ingin mengaktifkan Override Penjualan Stok Kurang.`
      };
    }

    return {
      valid: true,
      shortages
    };
  }

  /**
   * If an Owner override produces shortage, log as STOCK_PENDING_REVIEW conflict.
   * If excessive shortage, flag for urgent owner approval.
   */
  static async flagStockShortageConflict(params: {
    productId: string;
    productName: string;
    currentStock: number;
    userId: string;
    deviceId: string;
    referenceId: string;
    reason: string;
  }): Promise<void> {
    const isExcessive = Math.abs(params.currentStock) >= 10;
    const conflictId = `conf_stock_${uuidv4().slice(0, 8)}`;
    const timestamp = new Date().toISOString();

    const conflict: BusinessConflict = {
      conflictId,
      type: 'STOCK_PENDING_REVIEW',
      entityType: 'products',
      entityId: params.productId,
      deviceId: params.deviceId,
      userId: params.userId,
      timestamp,
      details: {
        productName: params.productName,
        currentDerivedStock: params.currentStock,
        referenceId: params.referenceId,
        reason: params.reason,
        isExcessive,
        requiresOwnerApproval: isExcessive
      },
      status: 'PENDING'
    };

    await db.conflicts.put(conflict);

    // Create notification
    await db.notifications.put({
      notificationId: `NOTIF_SHORTAGE_${params.productId}_${new Date().getTime()}`,
      severity: isExcessive ? 'URGENT' : 'WARNING',
      referenceId: conflictId,
      message: `Review Stok! Produk ${params.productName} memiliki shortage stok (${params.currentStock}). ${isExcessive ? 'Shortage berlebih memerlukan audit dan persetujuan Owner.' : 'Segera lakukan opname atau penerimaan barang.'}`,
      isRead: false,
      createdAt: timestamp
    });
  }

  /**
   * Multi-device offline oversell resolution:
   * Retains all original cashier transactions, flags excess as STOCK_CONFLICT.
   */
  static async handleOfflineOversellConflict(params: {
    productId: string;
    productName: string;
    excessShortage: number;
    transactionIds: string[];
    deviceId: string;
    userId: string;
  }): Promise<void> {
    const conflictId = `conf_oversell_${uuidv4().slice(0, 8)}`;
    const timestamp = new Date().toISOString();

    const conflict: BusinessConflict = {
      conflictId,
      type: 'STOCK_CONFLICT',
      entityType: 'products',
      entityId: params.productId,
      deviceId: params.deviceId,
      userId: params.userId,
      timestamp,
      details: {
        productName: params.productName,
        excessShortage: params.excessShortage,
        transactionIds: params.transactionIds,
        message: 'Multi-device offline oversell terdeteksi. Semua transaksi kasir dipertahankan; kekurangan stok dicatat untuk rekonsiliasi stok opname atau restock supplier.'
      },
      status: 'PENDING'
    };

    await db.conflicts.put(conflict);
  }
}
