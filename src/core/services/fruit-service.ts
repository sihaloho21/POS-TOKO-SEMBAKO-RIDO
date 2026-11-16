import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { Product, StockMovement, ProductCost } from '../types';
import { StockService } from './stock-service';
import { FinanceService } from './finance-service';
import { AuditEngine } from '../audit-engine';
import { cloudSetDoc, cloudUpdateDoc } from '../firestore-realtime';

export interface FruitProductDef {
  productId: string;
  name: string;
  barcode: string;
  sku: string;
  normalPrice: number;
  initialHpp: number;
  initialStock: number;
  minStock: number;
  targetStock: number;
  baseUnit: string;
  notes?: string;
}

export const DEFAULT_FRUIT_SPECIES: FruitProductDef[] = [];

export class FruitService {
  /**
   * Auto-seeding disabled: fruit catalog items must always be added manually.
   */
  static async ensureMinimalFruitProducts(_userId: string = 'SYSTEM'): Promise<number> {
    return 0;
  }

  /**
   * Catat Penyusutan / Buah Rusak / Buah Busuk
   */
  static async recordFruitWaste(params: {
    productId: string;
    qtyKg: number;
    reason: 'Buah busuk / rusak' | 'Susut timbangan alami' | 'Sortir afkir' | 'Lainnya';
    notes?: string;
    userId: string;
    role?: string;
    deviceId: string;
  }): Promise<StockMovement> {
    if (params.qtyKg <= 0) {
      throw new Error('Jumlah berat penyusutan harus lebih dari 0 kg');
    }

    const product = await db.products.get(params.productId);
    if (!product) {
      throw new Error('Produk buah tidak ditemukan');
    }

    const costDoc = await db.productCosts.get(params.productId);
    const hpp = costDoc?.hpp ?? product.hpp ?? 0;
    const now = new Date().toISOString();

    const movement = await StockService.recordMovement({
      productId: params.productId,
      movementType: 'DAMAGED_OUT',
      qty: params.qtyKg,
      unit: product.baseUnit || 'KG',
      baseQty: params.qtyKg,
      referenceId: `waste_${uuidv4().slice(0, 8)}`,
      segmentId: 'BUAH',
      reason: `${params.reason}${params.notes ? ` - ${params.notes}` : ''}`,
      costSnapshot: hpp,
      userId: params.userId,
      deviceId: params.deviceId,
      timestamp: now
    });

    await AuditEngine.log({
      action: 'RECORD_FRUIT_WASTE',
      module: 'FRUIT_MANAGEMENT',
      userId: params.userId,
      role: params.role || 'OWNER',
      deviceId: params.deviceId,
      referenceId: movement.stockMovementId,
      after: {
        productId: product.productId,
        name: product.name,
        wasteKg: params.qtyKg,
        lossAmount: params.qtyKg * hpp,
        reason: params.reason,
        notes: params.notes
      }
    });

    return movement;
  }

  /**
   * Catat Kulakan / Pengadaan Buah Masuk (Procurement & Finance Out)
   */
  static async recordFruitProcurement(params: {
    productId: string;
    incomingKg: number;
    purchasePricePerKg: number;
    supplierName?: string;
    notes?: string;
    userId: string;
    role?: string;
    deviceId: string;
  }): Promise<{ movement: StockMovement; newHpp: number; totalCost: number }> {
    if (params.incomingKg <= 0) {
      throw new Error('Jumlah kg kulakan harus lebih besar dari 0');
    }
    if (params.purchasePricePerKg <= 0) {
      throw new Error('Harga beli per kg kulakan harus lebih besar dari Rp 0');
    }

    const product = await db.products.get(params.productId);
    if (!product) throw new Error('Produk buah tidak ditemukan');

    const totalCost = Math.round(params.incomingKg * params.purchasePricePerKg);
    const currentStock = await StockService.getDerivedStock(params.productId);
    const costDoc = await db.productCosts.get(params.productId);
    const currentHpp = costDoc?.hpp ?? product.hpp ?? 0;

    // Hitung Weighted Average Cost (WAC) baru
    const validCurrentStock = Math.max(0, currentStock);
    const currentValue = validCurrentStock * currentHpp;
    const incomingValue = params.incomingKg * params.purchasePricePerKg;
    const totalQty = validCurrentStock + params.incomingKg;
    const newHpp = totalQty > 0 ? Math.round((currentValue + incomingValue) / totalQty) : params.purchasePricePerKg;

    const now = new Date().toISOString();
    const purchaseRef = `kulakan_buah_${uuidv4().slice(0, 8)}`;

    // 1. Record stock movement IN
    const movement = await StockService.recordMovement({
      productId: params.productId,
      movementType: 'PURCHASE_IN',
      qty: params.incomingKg,
      unit: product.baseUnit || 'KG',
      baseQty: params.incomingKg,
      referenceId: purchaseRef,
      segmentId: 'BUAH',
      reason: `Kulakan Buah: ${product.name} (${params.incomingKg} kg @ Rp ${params.purchasePricePerKg.toLocaleString()})${params.supplierName ? ` dari ${params.supplierName}` : ''}`,
      costSnapshot: params.purchasePricePerKg,
      userId: params.userId,
      deviceId: params.deviceId,
      timestamp: now
    });

    // 2. Update HPP in database
    await cloudUpdateDoc('products', product.productId, {
      hpp: newHpp,
      updatedAt: now
    });
    await cloudSetDoc('productCosts', product.productId, {
      productId: product.productId,
      hpp: newHpp,
      updatedAt: now
    });

    // 3. Record Finance Cash Out from BUAH storage
    await FinanceService.recordLedgerEntry({
      amount: totalCost,
      storageId: 'BUAH',
      direction: 'OUT',
      referenceId: purchaseRef,
      referenceType: 'PURCHASE',
      description: `Kulakan Buah: ${product.name} ${params.incomingKg} kg @ Rp ${params.purchasePricePerKg.toLocaleString()} (${params.supplierName || 'Pasar Buah'})`,
      userId: params.userId,
      role: params.role || 'OWNER',
      deviceId: params.deviceId,
      timestamp: now
    });

    await AuditEngine.log({
      action: 'RECORD_FRUIT_PROCUREMENT',
      module: 'FRUIT_MANAGEMENT',
      userId: params.userId,
      role: params.role || 'OWNER',
      deviceId: params.deviceId,
      referenceId: purchaseRef,
      after: {
        product: product.name,
        incomingKg: params.incomingKg,
        purchasePricePerKg: params.purchasePricePerKg,
        totalCost,
        previousHpp: currentHpp,
        newHpp
      }
    });

    return { movement, newHpp, totalCost };
  }

  /**
   * Mengambil statistik ringkas performa penjualan buah & valuasi stok
   */
  static async getFruitSummary() {
    const products = await db.products.filter(p => p.productType === 'FRUIT').toArray();
    const transactions = await db.transactions.where('status').equals('COMPLETED').toArray();
    const movements = await db.stockMovements.filter(m => m.segmentId === 'BUAH').toArray();
    const balances = await FinanceService.getLedgerBalances();

    // 1. Calculate Fruit Revenue & HPP
    let fruitRevenue = 0;
    let fruitHpp = 0;
    let totalFruitKgSold = 0;

    for (const tx of transactions) {
      if (!tx.items) continue;
      for (const item of tx.items) {
        const isFruit = products.some(p => p.productId === item.productId);
        if (isFruit) {
          fruitRevenue += item.subtotal;
          fruitHpp += (item.hppSnapshot || 0) * item.quantity;
          totalFruitKgSold += item.quantity;
        }
      }
    }

    const fruitGrossProfit = fruitRevenue - fruitHpp;

    // 2. Calculate Waste & Loss
    let wasteKg = 0;
    let wasteLossRp = 0;

    for (const m of movements) {
      if (['DAMAGED_OUT', 'LOST_OUT', 'EXPIRED_OUT'].includes(m.movementType)) {
        const qty = m.baseQty || m.qty || 0;
        wasteKg += qty;
        wasteLossRp += qty * (m.costSnapshot || 0);
      }
    }

    // 3. Current Inventory Valuation
    let totalCurrentKg = 0;
    let totalValuationRp = 0;

    for (const p of products) {
      const stock = Math.max(0, p.stock || 0);
      totalCurrentKg += stock;
      totalValuationRp += stock * (p.hpp || 0);
    }

    return {
      fruitCount: products.length,
      fruitRevenue,
      fruitHpp,
      fruitGrossProfit,
      totalFruitKgSold,
      wasteKg,
      wasteLossRp,
      totalCurrentKg,
      totalValuationRp,
      cashFruitBalance: balances.BUAH || 0
    };
  }
}
