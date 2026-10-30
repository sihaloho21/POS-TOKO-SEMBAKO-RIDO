import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { Product, StockMovement, ProductCost } from '../types';
import { StockService } from './stock-service';
import { FinanceService } from './finance-service';
import { AuditEngine } from '../audit-engine';

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

export const DEFAULT_FRUIT_SPECIES: FruitProductDef[] = [
  {
    productId: 'fruit_mangga_arum_manis',
    name: 'Mangga Arum Manis',
    barcode: '888101',
    sku: 'BUAH-MANGGA',
    normalPrice: 28000,
    initialHpp: 20000,
    initialStock: 25,
    minStock: 10,
    targetStock: 50,
    baseUnit: 'KG',
    notes: 'Kualitas super matang pohon, harum manis legit'
  },
  {
    productId: 'fruit_jeruk_berastagi',
    name: 'Jeruk Berastagi',
    barcode: '888102',
    sku: 'BUAH-JERUK',
    normalPrice: 22000,
    initialHpp: 16000,
    initialStock: 30,
    minStock: 15,
    targetStock: 60,
    baseUnit: 'KG',
    notes: 'Segar manis asal Berastagi Medan, kaya air'
  }
];

export class FruitService {
  /**
   * Ensures default fruit products (Mangga Arum Manis & Jeruk Berastagi) exist in the database.
   */
  static async ensureMinimalFruitProducts(userId: string = 'SYSTEM'): Promise<number> {
    const deletedSetting = await db.settings.get('deleted_product_ids');
    const deletedIds: string[] = deletedSetting?.ids || [];

    const existingProducts = await db.products.toArray();
    const existingFruits = existingProducts.filter(p => p.productType === 'FRUIT');
    let addedCount = 0;
    const now = new Date().toISOString();

    for (const item of DEFAULT_FRUIT_SPECIES) {
      if (deletedIds.includes(item.productId)) continue;

      const alreadyExists = existingFruits.some(p => 
        p.productId === item.productId ||
        p.barcode === item.barcode ||
        p.name.toLowerCase().includes(item.name.toLowerCase().split(' ')[0])
      );

      if (!alreadyExists) {
        const newProduct: Product = {
          productId: item.productId,
          sku: item.sku,
          barcode: item.barcode,
          name: item.name,
          categoryId: 'BUAH',
          productType: 'FRUIT',
          baseUnit: item.baseUnit,
          saleUnits: ['KG', 'GRAM'],
          conversionRules: [
            { fromUnit: 'GRAM', toUnit: 'KG', factor: 0.001 }
          ],
          normalPrice: item.normalPrice,
          hpp: item.initialHpp,
          stock: item.initialStock,
          minimumStock: item.minStock,
          targetStock: item.targetStock,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now
        };

        await db.products.put(newProduct);
        await db.productCosts.put({
          productId: item.productId,
          hpp: item.initialHpp,
          updatedAt: now
        });

        // Record initial OPENING_BALANCE movement
        await StockService.recordMovement({
          productId: item.productId,
          movementType: 'OPENING_BALANCE',
          qty: item.initialStock,
          unit: item.baseUnit,
          baseQty: item.initialStock,
          referenceId: `init_${item.productId}`,
          segmentId: 'BUAH',
          reason: `Stok Awal Penjualan Buah Segar: ${item.name}`,
          costSnapshot: item.initialHpp,
          userId,
          deviceId: 'device-1',
          timestamp: now
        });

        addedCount++;
      }
    }

    await db.settings.put({ id: 'minimal_fruits_seeded', value: true, seededAt: now });
    return addedCount;
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
    await db.productCosts.put({
      productId: product.productId,
      hpp: newHpp,
      updatedAt: now
    });
    await db.products.update(product.productId, {
      hpp: newHpp,
      updatedAt: now
    });

    // 3. Record Finance Cash Out from BUAH storage
    await FinanceService.recordLedgerEntry({
      amount: totalCost,
      storageId: 'BUAH',
      direction: 'OUT',
      referenceId: purchaseRef,
      referenceType: 'EXPENSE',
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
