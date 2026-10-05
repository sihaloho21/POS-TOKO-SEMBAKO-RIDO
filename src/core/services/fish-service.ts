import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { Product, Supplier, StockMovement, ProductCost } from '../types';
import { CostingEngine } from '../costing-engine';
import { StockService } from './stock-service';
import { AuditEngine } from '../audit-engine';

export interface MinimalFishDef {
  productId: string;
  name: string;
  barcode: string;
  sku: string;
  normalPrice: number;
  initialHpp: number;
  initialStock: number;
  minStock: number;
  targetStock: number;
}

export const MINIMAL_FISH_SPECIES: MinimalFishDef[] = [
  {
    productId: 'fish_nila',
    name: 'Ikan Nila Segar / Hidup',
    barcode: '888002',
    sku: 'IKAN-NILA',
    normalPrice: 38000,
    initialHpp: 30000,
    initialStock: 25,
    minStock: 5,
    targetStock: 30
  },
  {
    productId: 'fish_mas',
    name: 'Ikan Mas Hidup',
    barcode: '888003',
    sku: 'IKAN-MAS',
    normalPrice: 36000,
    initialHpp: 28000,
    initialStock: 20,
    minStock: 5,
    targetStock: 25
  },
  {
    productId: 'fish_gurame',
    name: 'Ikan Gurame Segar / Hidup',
    barcode: '888004',
    sku: 'IKAN-GURAME',
    normalPrice: 55000,
    initialHpp: 45000,
    initialStock: 15,
    minStock: 3,
    targetStock: 20
  },
  {
    productId: 'fish_lele',
    name: 'Ikan Lele Hidup',
    barcode: '888005',
    sku: 'IKAN-LELE',
    normalPrice: 28000,
    initialHpp: 22000,
    initialStock: 40,
    minStock: 10,
    targetStock: 50
  },
  {
    productId: 'fish_patin',
    name: 'Ikan Patin Segar / Hidup',
    barcode: '888006',
    sku: 'IKAN-PATIN',
    normalPrice: 32000,
    initialHpp: 25000,
    initialStock: 20,
    minStock: 5,
    targetStock: 25
  }
];

export const MINIMAL_FISH_SUPPLIERS = [
  {
    supplierId: 'sup_cikande',
    name: 'Supplier Ikan Cikande',
    phone: '081288991122',
    address: 'Kawasan Budidaya Cikande, Kab. Serang, Banten',
    notes: 'Pemasok utama ikan air tawar konsumsi hidup (Nila, Mas, Lele, Patin). Pengiriman rutin pagi.',
    status: 'ACTIVE' as const
  },
  {
    supplierId: 'sup_rau',
    name: 'Supplier Ikan Pasar Rau',
    phone: '085711223344',
    address: 'Pasar Induk Rau Blok Ikan No. 15, Kota Serang, Banten',
    notes: 'Pemasok harian ikan segar & hidup (Gurame, Nila, Lele). Melayani pengiriman mendesak.',
    status: 'ACTIVE' as const
  }
];

export interface FishProcurementCycle {
  cycleId: string;
  cycleNumber: number;
  productId: string;
  productName: string;
  supplierId?: string;
  supplierName: string;
  purchaseKg: number;
  purchasePriceKg: number;
  stockBeforeKg: number;
  wacBeforeKg: number;
  stockAfterKg: number;
  wacAfterKg: number;
  wacChange: number;
  timestamp: string;
  dateLabel: string;
  notes?: string;
}

export interface RecordFishDeathParams {
  productId: string;
  deathKg: number;
  date?: string;
  notes?: string;
  userId: string;
  deviceId?: string;
}

export interface FishPurchaseParams {
  productId: string;
  supplierId: string;
  purchaseKg: number;
  purchasePricePerKg: number;
  invoiceNumber?: string;
  moneyStorageId?: 'WARUNG' | 'IKAN';
  userId: string;
  deviceId?: string;
}

export class FishService {
  /**
   * Pure calculation of Weighted Average Cost (WAC) per KG:
   * WAC/kg = total cost stock / total kg stock.
   *
   * Example:
   * 20 kg @ 28.000 + 30 kg @ 32.000
   * = total 1.520.000 / 50 kg
   * = 30.400/kg.
   */
  static calculateWac(
    currentStockKg: number,
    currentWacKg: number,
    incomingKg: number,
    incomingPricePerKg: number
  ): {
    currentValue: number;
    incomingValue: number;
    totalValue: number;
    totalStockKg: number;
    newWacKg: number;
  } {
    const validCurrentStock = Math.max(0, currentStockKg);
    const validIncomingKg = Math.max(0, incomingKg);
    
    const currentValue = validCurrentStock * currentWacKg;
    const incomingValue = validIncomingKg * incomingPricePerKg;
    const totalValue = currentValue + incomingValue;
    const totalStockKg = validCurrentStock + validIncomingKg;

    const newWacKg = totalStockKg > 0 ? Math.round(totalValue / totalStockKg) : incomingPricePerKg;

    return {
      currentValue,
      incomingValue,
      totalValue,
      totalStockKg,
      newWacKg
    };
  }

  /**
   * Ensures minimal 5 fish products (Nila, Ikan Mas, Gurame, Lele, Patin) exist in the database.
   */
  static async ensureMinimalFishProducts(userId: string = 'SYSTEM'): Promise<number> {
    const existingProducts = await db.products.toArray();
    const existingFish = existingProducts.filter(p => p.productType === 'FISH');
    let addedCount = 0;
    const now = new Date().toISOString();

    for (const species of MINIMAL_FISH_SPECIES) {
      const alreadyExists = existingFish.some(p => 
        p.name.toLowerCase().includes(species.name.toLowerCase().split(' ')[1] || species.name.toLowerCase()) ||
        p.productId === species.productId ||
        p.barcode === species.barcode
      );

      if (!alreadyExists) {
        const newProduct: Product = {
          productId: species.productId,
          sku: species.sku,
          barcode: species.barcode,
          name: species.name,
          categoryId: 'FISH',
          productType: 'FISH',
          baseUnit: 'KG',
          saleUnits: ['KG'],
          conversionRules: [],
          normalPrice: species.normalPrice,
          hpp: species.initialHpp,
          stock: species.initialStock,
          minimumStock: species.minStock,
          targetStock: species.targetStock,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now
        };

        await db.products.put(newProduct);
        await db.productCosts.put({
          productId: species.productId,
          hpp: species.initialHpp,
          updatedAt: now
        });

        // Record initial OPENING_BALANCE movement
        await StockService.recordMovement({
          productId: species.productId,
          movementType: 'OPENING_BALANCE',
          qty: species.initialStock,
          unit: 'KG',
          baseQty: species.initialStock,
          referenceId: `init_${species.productId}`,
          segmentId: 'IKAN',
          reason: `Stok Awal Retail Ikan Hidup: ${species.name}`,
          costSnapshot: species.initialHpp,
          userId,
          deviceId: 'device-1',
          timestamp: now
        });

        addedCount++;
      }
    }

    return addedCount;
  }

  /**
   * Ensures suppliers Cikande and Rau exist in the database.
   */
  static async ensureFishSuppliers(userId: string = 'SYSTEM'): Promise<number> {
    const suppliers = await db.suppliers.toArray();
    let addedCount = 0;
    const now = new Date().toISOString();

    for (const sup of MINIMAL_FISH_SUPPLIERS) {
      const exists = suppliers.some(s => 
        s.supplierId === sup.supplierId || 
        s.name.toLowerCase().includes(sup.name.toLowerCase()) ||
        (sup.name.toLowerCase().includes('cikande') && s.name.toLowerCase().includes('cikande')) ||
        (sup.name.toLowerCase().includes('rau') && s.name.toLowerCase().includes('rau'))
      );

      if (!exists) {
        await db.suppliers.put({
          ...sup,
          createdAt: now,
          updatedAt: now
        });
        addedCount++;
      }
    }

    return addedCount;
  }

  /**
   * Records fish mortality (Ikan Mati):
   * - Reduces stock in KG
   * - Snapshots current WAC/kg
   * - Enters into Stock Loss
   * - Reduces Net Profit
   */
  static async recordFishDeath(params: RecordFishDeathParams): Promise<{
    movement: StockMovement;
    lossKg: number;
    wacSnapshot: number;
    lossAmountRp: number;
  }> {
    const product = await db.products.get(params.productId);
    if (!product) throw new Error('Produk ikan tidak ditemukan.');

    const costDoc = await db.productCosts.get(params.productId);
    const currentWacKg = costDoc?.hpp ?? product.hpp ?? 0;
    const lossKg = Math.abs(params.deathKg);
    const lossAmountRp = Math.round(lossKg * currentWacKg);
    let timestamp = new Date().toISOString();
    if (params.date) {
      if (params.date.includes('T')) {
        timestamp = params.date;
      } else {
        const timePart = new Date().toTimeString().split(' ')[0];
        timestamp = new Date(`${params.date}T${timePart}`).toISOString();
      }
    }
    const reasonText = params.notes?.trim() 
      ? `Ikan mati/tidak layak jual: ${params.notes.trim()}`
      : 'Ikan mati/tidak layak jual (Mortalitas harian)';

    // Record stock movement (FISH_DEAD_OUT)
    const movement = await StockService.recordMovement({
      productId: params.productId,
      movementType: 'FISH_DEAD_OUT',
      qty: lossKg,
      unit: 'KG',
      baseQty: lossKg,
      referenceId: `fish_dead_${uuidv4().slice(0, 8)}`,
      segmentId: 'IKAN',
      reason: reasonText,
      costSnapshot: currentWacKg,
      userId: params.userId,
      deviceId: params.deviceId || 'device-1',
      timestamp
    });

    // Audit log
    await AuditEngine.log({
      userId: params.userId,
      role: 'OWNER',
      deviceId: params.deviceId || 'device-1',
      action: 'FISH_DEATH_LOSS',
      module: 'FISH_MANAGEMENT',
      referenceId: movement.stockMovementId,
      after: {
        productId: params.productId,
        productName: product.name,
        lossKg,
        wacSnapshot: currentWacKg,
        lossAmountRp,
        reason: reasonText
      }
    });

    return {
      movement,
      lossKg,
      wacSnapshot: currentWacKg,
      lossAmountRp
    };
  }

  /**
   * Quick fish purchase batch directly updating WAC and stock.
   */
  static async recordFishPurchase(params: FishPurchaseParams): Promise<{
    oldWacKg: number;
    newWacKg: number;
    totalCost: number;
    newStockKg: number;
  }> {
    const product = await db.products.get(params.productId);
    if (!product) throw new Error('Produk ikan tidak ditemukan.');

    const costDoc = await db.productCosts.get(params.productId);
    const oldWacKg = costDoc?.hpp ?? product.hpp ?? 0;
    const currentStockKg = await StockService.getDerivedStock(params.productId);

    const wacCalc = this.calculateWac(
      currentStockKg,
      oldWacKg,
      params.purchaseKg,
      params.purchasePricePerKg
    );

    const timestamp = new Date().toISOString();
    const purchaseId = uuidv4();
    const totalCost = params.purchaseKg * params.purchasePricePerKg;

    // 1. Update WAC in database
    await CostingEngine.updateHpp(params.productId, wacCalc.newWacKg);

    // 2. Record Stock Movement (PURCHASE_IN)
    await StockService.recordMovement({
      productId: params.productId,
      movementType: 'PURCHASE_IN',
      qty: params.purchaseKg,
      unit: 'KG',
      baseQty: params.purchaseKg,
      referenceId: purchaseId,
      segmentId: 'IKAN',
      reason: `Restock Ikan: ${params.purchaseKg} KG @ Rp ${params.purchasePricePerKg.toLocaleString()}/kg`,
      costSnapshot: params.purchasePricePerKg,
      userId: params.userId,
      deviceId: params.deviceId || 'device-1',
      timestamp
    });

    // 3. Record Finance Outflow from IKAN storage
    const storageId = params.moneyStorageId || 'IKAN';
    await db.financeEvents.add({
      financeEventId: uuidv4(),
      amount: totalCost,
      storageId,
      direction: 'OUT',
      referenceId: purchaseId,
      referenceType: 'PURCHASE',
      userId: params.userId,
      deviceId: params.deviceId || 'device-1',
      timestamp
    });

    // 4. Audit
    await AuditEngine.log({
      userId: params.userId,
      role: 'OWNER',
      deviceId: params.deviceId || 'device-1',
      action: 'FISH_RESTOCK_WAC',
      module: 'FISH_MANAGEMENT',
      referenceId: purchaseId,
      after: {
        product: product.name,
        qtyKg: params.purchaseKg,
        pricePerKg: params.purchasePricePerKg,
        oldWac: oldWacKg,
        newWac: wacCalc.newWacKg,
        totalCost
      }
    });

    // 5. Record Procurement Cycle for WAC Evolution History Chart
    const supplierDoc = await db.suppliers.get(params.supplierId);
    const supplierName = supplierDoc?.name || (params.supplierId === 'sup_cikande' ? 'Supplier Ikan Cikande' : 'Supplier Ikan Pasar Rau');
    const dateLabel = new Date(timestamp).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });

    await this.recordProcurementCycle({
      cycleId: purchaseId,
      cycleNumber: 0,
      productId: params.productId,
      productName: product.name,
      supplierId: params.supplierId,
      supplierName,
      purchaseKg: params.purchaseKg,
      purchasePriceKg: params.purchasePricePerKg,
      stockBeforeKg: currentStockKg,
      wacBeforeKg: oldWacKg,
      stockAfterKg: wacCalc.totalStockKg,
      wacAfterKg: wacCalc.newWacKg,
      wacChange: wacCalc.newWacKg - oldWacKg,
      timestamp,
      dateLabel,
      notes: `Faktur #${params.invoiceNumber || purchaseId.slice(0, 8)}`
    });

    const newStockKg = await StockService.getDerivedStock(params.productId);

    return {
      oldWacKg,
      newWacKg: wacCalc.newWacKg,
      totalCost,
      newStockKg
    };
  }

  /**
   * Save a procurement cycle point to persistent history.
   */
  static async recordProcurementCycle(cycle: FishProcurementCycle): Promise<void> {
    const existing = await this.getProcurementCycles();
    const productCycles = existing.filter(c => c.productId === cycle.productId);
    cycle.cycleNumber = productCycles.length + 1;
    existing.push(cycle);
    await db.settings.put({
      id: 'fish_procurement_cycles',
      data: existing
    });
  }

  /**
   * Get all procurement cycles, filterable by productId.
   */
  static async getProcurementCycles(productId?: string): Promise<FishProcurementCycle[]> {
    const doc = await db.settings.get('fish_procurement_cycles');
    let cycles: FishProcurementCycle[] = doc?.data || [];
    if (cycles.length === 0) {
      cycles = await this.ensureSampleProcurementCycles();
    }

    try {
      // Also inspect stock movements for any purchase logs of fish products
      const movements = await db.stockMovements
        .filter(m => m.movementType === 'PURCHASE_IN' && m.segmentId === 'IKAN')
        .toArray();

      const existingIds = new Set(cycles.map(c => c.cycleId));
      for (const m of movements) {
        if (!existingIds.has(m.referenceId)) {
          const prod = await db.products.get(m.productId);
          if (prod && prod.productType === 'FISH') {
            const costDoc = await db.productCosts.get(m.productId);
            const ts = m.clientTimestamp || m.createdAt || m.timestamp || new Date().toISOString();
            const dateLabel = new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            const purchasePrice = m.costSnapshot || prod.hpp || 0;
            const currentWac = costDoc?.hpp || prod.hpp || purchasePrice;
            const qty = m.baseQty || m.qty || 0;

            cycles.push({
              cycleId: m.referenceId,
              cycleNumber: cycles.filter(c => c.productId === m.productId).length + 1,
              productId: m.productId,
              productName: prod.name,
              supplierName: m.reason?.includes('Supplier') ? (m.reason.split('Supplier')[1]?.trim() || 'Supplier Ikan') : 'Supplier Mitra Ikan',
              purchaseKg: qty,
              purchasePriceKg: purchasePrice,
              stockBeforeKg: Math.max(0, prod.stock - qty),
              wacBeforeKg: currentWac,
              stockAfterKg: prod.stock,
              wacAfterKg: currentWac,
              wacChange: 0,
              timestamp: ts,
              dateLabel,
              notes: m.reason
            });
            existingIds.add(m.referenceId);
          }
        }
      }
    } catch (e) {
      console.warn('Procurement logs sync warning:', e);
    }

    // Sort chronologically
    cycles.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (productId && productId !== 'ALL') {
      return cycles.filter(c => c.productId === productId);
    }
    return cycles;
  }

  /**
   * Populates rich baseline procurement cycles for all 5 minimal fish species.
   */
  static async ensureSampleProcurementCycles(): Promise<FishProcurementCycle[]> {
    const doc = await db.settings.get('fish_procurement_cycles');
    if (doc?.data && doc.data.length > 0) return doc.data;

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const samples: FishProcurementCycle[] = [
      // Nila
      {
        cycleId: 'cycle_nila_1',
        cycleNumber: 1,
        productId: 'fish_nila',
        productName: 'Ikan Nila Segar / Hidup',
        supplierId: 'sup_cikande',
        supplierName: 'Supplier Ikan Cikande',
        purchaseKg: 25,
        purchasePriceKg: 28500,
        stockBeforeKg: 0,
        wacBeforeKg: 28500,
        stockAfterKg: 25,
        wacAfterKg: 28500,
        wacChange: 0,
        timestamp: new Date(now - 12 * dayMs).toISOString(),
        dateLabel: new Date(now - 12 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Pengadaan Awal Kolam Aerasi 1'
      },
      {
        cycleId: 'cycle_nila_2',
        cycleNumber: 2,
        productId: 'fish_nila',
        productName: 'Ikan Nila Segar / Hidup',
        supplierId: 'sup_rau',
        supplierName: 'Supplier Ikan Pasar Rau',
        purchaseKg: 30,
        purchasePriceKg: 31500,
        stockBeforeKg: 18,
        wacBeforeKg: 28500,
        stockAfterKg: 48,
        wacAfterKg: 30375,
        wacChange: 1875,
        timestamp: new Date(now - 8 * dayMs).toISOString(),
        dateLabel: new Date(now - 8 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Restock Tambahan Akhir Pekan'
      },
      {
        cycleId: 'cycle_nila_3',
        cycleNumber: 3,
        productId: 'fish_nila',
        productName: 'Ikan Nila Segar / Hidup',
        supplierId: 'sup_cikande',
        supplierName: 'Supplier Ikan Cikande',
        purchaseKg: 20,
        purchasePriceKg: 29500,
        stockBeforeKg: 22,
        wacBeforeKg: 30375,
        stockAfterKg: 42,
        wacAfterKg: 29958,
        wacChange: -417,
        timestamp: new Date(now - 4 * dayMs).toISOString(),
        dateLabel: new Date(now - 4 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Restock Rutin Panen Segar'
      },
      {
        cycleId: 'cycle_nila_4',
        cycleNumber: 4,
        productId: 'fish_nila',
        productName: 'Ikan Nila Segar / Hidup',
        supplierId: 'sup_cikande',
        supplierName: 'Supplier Ikan Cikande',
        purchaseKg: 25,
        purchasePriceKg: 30000,
        stockBeforeKg: 15,
        wacBeforeKg: 29958,
        stockAfterKg: 40,
        wacAfterKg: 30000,
        wacChange: 42,
        timestamp: new Date(now - 1 * dayMs).toISOString(),
        dateLabel: new Date(now - 1 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Pengadaan Stok Awal Minggu'
      },

      // Ikan Mas
      {
        cycleId: 'cycle_mas_1',
        cycleNumber: 1,
        productId: 'fish_mas',
        productName: 'Ikan Mas Hidup',
        supplierId: 'sup_cikande',
        supplierName: 'Supplier Ikan Cikande',
        purchaseKg: 20,
        purchasePriceKg: 27000,
        stockBeforeKg: 0,
        wacBeforeKg: 27000,
        stockAfterKg: 20,
        wacAfterKg: 27000,
        wacChange: 0,
        timestamp: new Date(now - 13 * dayMs).toISOString(),
        dateLabel: new Date(now - 13 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Stok Awal Ikan Mas Super'
      },
      {
        cycleId: 'cycle_mas_2',
        cycleNumber: 2,
        productId: 'fish_mas',
        productName: 'Ikan Mas Hidup',
        supplierId: 'sup_rau',
        supplierName: 'Supplier Ikan Pasar Rau',
        purchaseKg: 25,
        purchasePriceKg: 29200,
        stockBeforeKg: 12,
        wacBeforeKg: 27000,
        stockAfterKg: 37,
        wacAfterKg: 28486,
        wacChange: 1486,
        timestamp: new Date(now - 7 * dayMs).toISOString(),
        dateLabel: new Date(now - 7 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Harga Pakan Naik dari Petani'
      },
      {
        cycleId: 'cycle_mas_3',
        cycleNumber: 3,
        productId: 'fish_mas',
        productName: 'Ikan Mas Hidup',
        supplierId: 'sup_cikande',
        supplierName: 'Supplier Ikan Cikande',
        purchaseKg: 20,
        purchasePriceKg: 27500,
        stockBeforeKg: 18,
        wacBeforeKg: 28486,
        stockAfterKg: 38,
        wacAfterKg: 28000,
        wacChange: -486,
        timestamp: new Date(now - 2 * dayMs).toISOString(),
        dateLabel: new Date(now - 2 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Pasokan Cikande Normal'
      },

      // Gurame
      {
        cycleId: 'cycle_gurame_1',
        cycleNumber: 1,
        productId: 'fish_gurame',
        productName: 'Ikan Gurame Segar / Hidup',
        supplierId: 'sup_rau',
        supplierName: 'Supplier Ikan Pasar Rau',
        purchaseKg: 15,
        purchasePriceKg: 43000,
        stockBeforeKg: 0,
        wacBeforeKg: 43000,
        stockAfterKg: 15,
        wacAfterKg: 43000,
        wacChange: 0,
        timestamp: new Date(now - 14 * dayMs).toISOString(),
        dateLabel: new Date(now - 14 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Gurame Ukuran Konsumsi 500-700gr'
      },
      {
        cycleId: 'cycle_gurame_2',
        cycleNumber: 2,
        productId: 'fish_gurame',
        productName: 'Ikan Gurame Segar / Hidup',
        supplierId: 'sup_cikande',
        supplierName: 'Supplier Ikan Cikande',
        purchaseKg: 15,
        purchasePriceKg: 46500,
        stockBeforeKg: 8,
        wacBeforeKg: 43000,
        stockAfterKg: 23,
        wacAfterKg: 45282,
        wacChange: 2282,
        timestamp: new Date(now - 9 * dayMs).toISOString(),
        dateLabel: new Date(now - 9 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Gurame Kolam Air Deras'
      },
      {
        cycleId: 'cycle_gurame_3',
        cycleNumber: 3,
        productId: 'fish_gurame',
        productName: 'Ikan Gurame Segar / Hidup',
        supplierId: 'sup_rau',
        supplierName: 'Supplier Ikan Pasar Rau',
        purchaseKg: 12,
        purchasePriceKg: 44500,
        stockBeforeKg: 10,
        wacBeforeKg: 45282,
        stockAfterKg: 22,
        wacAfterKg: 45000,
        wacChange: -282,
        timestamp: new Date(now - 3 * dayMs).toISOString(),
        dateLabel: new Date(now - 3 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Restock Persiapan Pesanan Resto'
      },

      // Lele
      {
        cycleId: 'cycle_lele_1',
        cycleNumber: 1,
        productId: 'fish_lele',
        productName: 'Ikan Lele Hidup',
        supplierId: 'sup_cikande',
        supplierName: 'Supplier Ikan Cikande',
        purchaseKg: 40,
        purchasePriceKg: 20500,
        stockBeforeKg: 0,
        wacBeforeKg: 20500,
        stockAfterKg: 40,
        wacAfterKg: 20500,
        wacChange: 0,
        timestamp: new Date(now - 11 * dayMs).toISOString(),
        dateLabel: new Date(now - 11 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Lele Sangkuriang Ukuran Isi 7-8'
      },
      {
        cycleId: 'cycle_lele_2',
        cycleNumber: 2,
        productId: 'fish_lele',
        productName: 'Ikan Lele Hidup',
        supplierId: 'sup_rau',
        supplierName: 'Supplier Ikan Pasar Rau',
        purchaseKg: 50,
        purchasePriceKg: 23000,
        stockBeforeKg: 25,
        wacBeforeKg: 20500,
        stockAfterKg: 75,
        wacAfterKg: 22166,
        wacChange: 1666,
        timestamp: new Date(now - 6 * dayMs).toISOString(),
        dateLabel: new Date(now - 6 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Permintaan Tinggi Pecel Lele'
      },
      {
        cycleId: 'cycle_lele_3',
        cycleNumber: 3,
        productId: 'fish_lele',
        productName: 'Ikan Lele Hidup',
        supplierId: 'sup_cikande',
        supplierName: 'Supplier Ikan Cikande',
        purchaseKg: 35,
        purchasePriceKg: 21800,
        stockBeforeKg: 30,
        wacBeforeKg: 22166,
        stockAfterKg: 65,
        wacAfterKg: 22000,
        wacChange: -166,
        timestamp: new Date(now - 2 * dayMs).toISOString(),
        dateLabel: new Date(now - 2 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Restock Rutin Sore'
      },

      // Patin
      {
        cycleId: 'cycle_patin_1',
        cycleNumber: 1,
        productId: 'fish_patin',
        productName: 'Ikan Patin Segar / Hidup',
        supplierId: 'sup_cikande',
        supplierName: 'Supplier Ikan Cikande',
        purchaseKg: 20,
        purchasePriceKg: 24000,
        stockBeforeKg: 0,
        wacBeforeKg: 24000,
        stockAfterKg: 20,
        wacAfterKg: 24000,
        wacChange: 0,
        timestamp: new Date(now - 10 * dayMs).toISOString(),
        dateLabel: new Date(now - 10 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Patin Segar Kolam Tanah'
      },
      {
        cycleId: 'cycle_patin_2',
        cycleNumber: 2,
        productId: 'fish_patin',
        productName: 'Ikan Patin Segar / Hidup',
        supplierId: 'sup_rau',
        supplierName: 'Supplier Ikan Pasar Rau',
        purchaseKg: 25,
        purchasePriceKg: 26000,
        stockBeforeKg: 10,
        wacBeforeKg: 24000,
        stockAfterKg: 35,
        wacAfterKg: 25428,
        wacChange: 1428,
        timestamp: new Date(now - 5 * dayMs).toISOString(),
        dateLabel: new Date(now - 5 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Patin Ukuran 1kg Up'
      },
      {
        cycleId: 'cycle_patin_3',
        cycleNumber: 3,
        productId: 'fish_patin',
        productName: 'Ikan Patin Segar / Hidup',
        supplierId: 'sup_cikande',
        supplierName: 'Supplier Ikan Cikande',
        purchaseKg: 20,
        purchasePriceKg: 24500,
        stockBeforeKg: 15,
        wacBeforeKg: 25428,
        stockAfterKg: 35,
        wacAfterKg: 25000,
        wacChange: -428,
        timestamp: new Date(now - 1 * dayMs).toISOString(),
        dateLabel: new Date(now - 1 * dayMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        notes: 'Panen Cikande Timur'
      }
    ];

    await db.settings.put({
      id: 'fish_procurement_cycles',
      data: samples
    });

    return samples;
  }

  /**
   * Daily Profit Report Impact for Fish Retail:
   * Calculates Today's Gross Profit, Fish Death Loss, and Net Profit.
   */
  static async getDailyFishProfitReport(targetDateStr?: string): Promise<{
    dateStr: string;
    totalRevenue: number;
    totalHpp: number;
    grossProfit: number;
    fishDeathKg: number;
    fishDeathLossRp: number;
    deathEventsCount: number;
    netProfit: number;
  }> {
    const todayPrefix = targetDateStr || new Date().toISOString().split('T')[0];
    
    // 1. Transactions for today
    const txs = await db.transactions
      .where('status')
      .equals('COMPLETED')
      .filter(tx => tx.clientTimestamp.startsWith(todayPrefix))
      .toArray();

    let totalRevenue = 0;
    let totalHpp = 0;

    for (const tx of txs) {
      if (tx.items) {
        for (const item of tx.items) {
          const prod = await db.products.get(item.productId);
          if (prod?.productType === 'FISH') {
            const rev = item.subtotal || (item.unitPrice * item.quantity);
            const hpp = (item.hppSnapshot || prod.hpp || 0) * item.quantity;
            totalRevenue += rev;
            totalHpp += hpp;
          }
        }
      }
    }

    const grossProfit = totalRevenue - totalHpp;

    // 2. Fish death movements for today
    const movements = await db.stockMovements
      .filter(m => 
        (m.movementType === 'FISH_DEAD_OUT' || (m.segmentId === 'IKAN' && m.reason?.toLowerCase().includes('ikan mati'))) &&
        (m.clientTimestamp?.startsWith(todayPrefix) || m.createdAt?.startsWith(todayPrefix))
      )
      .toArray();

    let fishDeathKg = 0;
    let fishDeathLossRp = 0;

    for (const m of movements) {
      const qty = m.baseQty || m.qty || 0;
      const wac = m.costSnapshot || 0;
      fishDeathKg += qty;
      fishDeathLossRp += (qty * wac);
    }

    const netProfit = grossProfit - fishDeathLossRp;

    return {
      dateStr: todayPrefix,
      totalRevenue,
      totalHpp,
      grossProfit,
      fishDeathKg,
      fishDeathLossRp,
      deathEventsCount: movements.length,
      netProfit
    };
  }

  /**
   * Event-based Stock Opname specifically for Fish Retail in KG.
   */
  static async recordFishOpnameEvent(params: {
    items: { productId: string; physicalKg: number }[];
    notes?: string;
    userId: string;
    deviceId?: string;
  }): Promise<{ opnameId: string; adjustmentsCount: number }> {
    const opnameId = uuidv4();
    const timestamp = new Date().toISOString();
    let adjustmentsCount = 0;

    for (const item of params.items) {
      const product = await db.products.get(item.productId);
      if (!product) continue;

      const currentStockKg = await StockService.getDerivedStock(item.productId);
      const diffKg = Number((item.physicalKg - currentStockKg).toFixed(2));
      const costDoc = await db.productCosts.get(item.productId);
      const wacKg = costDoc?.hpp ?? product.hpp ?? 0;

      if (diffKg !== 0) {
        const movementType = diffKg > 0 ? 'STOCK_OPNAME_IN' : 'STOCK_OPNAME_OUT';
        const absDiff = Math.abs(diffKg);

        await StockService.recordMovement({
          productId: item.productId,
          movementType,
          qty: absDiff,
          unit: 'KG',
          baseQty: absDiff,
          referenceId: opnameId,
          segmentId: 'IKAN',
          reason: `Opname Ikan (${diffKg > 0 ? 'Surplus' : 'Susut Timbangan'} ${absDiff} KG) - ${params.notes || 'Penimbangan Fisik berkala'}`,
          costSnapshot: wacKg,
          userId: params.userId,
          deviceId: params.deviceId || 'device-1',
          timestamp
        });

        adjustmentsCount++;
      }
    }

    // Save stock opname document
    await db.stockOpnames.add({
      opnameId,
      status: 'COMPLETED',
      createdBy: params.userId,
      deviceId: params.deviceId || 'device-1',
      items: await Promise.all(params.items.map(async it => {
        const p = await db.products.get(it.productId);
        const expected = await StockService.getDerivedStock(it.productId);
        return {
          productId: it.productId,
          nameSnapshot: p?.name || it.productId,
          expectedQty: expected,
          physicalQty: it.physicalKg
        };
      })),
      finalizedBy: params.userId,
      finalizedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    return { opnameId, adjustmentsCount };
  }
}
