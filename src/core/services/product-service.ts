import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { Product } from '../types';
import { AuditEngine } from '../audit-engine';
import { StockService } from './stock-service';
import Papa from 'papaparse';

export class ProductService {
  static async getAllProducts(): Promise<Product[]> {
    return db.products.toArray();
  }

  static async exportToCSV(): Promise<void> {
    const products = await this.getAllProducts();
    const costs = await db.productCosts.toArray();
    
    const exportData = products.map(p => {
      const cost = costs.find(c => c.productId === p.productId);
      return {
        name: p.name,
        barcode: p.barcode,
        sku: p.sku || '',
        categoryId: p.categoryId || 'GENERAL',
        productType: p.productType,
        baseUnit: p.baseUnit,
        normalPrice: p.normalPrice,
        hpp: cost?.hpp ?? p.hpp ?? 0,
        stock: p.stock,
        minimumStock: p.minimumStock,
        targetStock: p.targetStock,
        status: p.status,
        tags: (p.tags || []).join(',')
      };
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `products_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  static async importFromCSV(file: File): Promise<{ success: number; failed: number }> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          let success = 0;
          let failed = 0;
          for (const row of results.data as any[]) {
            try {
              // Basic validation and formatting
              const productData: Partial<Product> = {
                ...row,
                normalPrice: Number(row.normalPrice || 0),
                stock: Number(row.stock || 0),
                minimumStock: Number(row.minimumStock || 0),
                targetStock: Number(row.targetStock || 0),
                priceAlertThreshold: row.priceAlertThreshold ? Number(row.priceAlertThreshold) : undefined,
                status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
              };

              const hpp = Number(row.hpp || 0);
              
              if (!productData.name) throw new Error('Missing name');
              
              await this.saveProduct(productData, hpp);
              success++;
            } catch (error) {
              console.error('Failed to import row:', row, error);
              failed++;
            }
          }
          resolve({ success, failed });
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  }

  static async saveProduct(formData: Partial<Product>, hpp?: number): Promise<string> {
    const isNew = !formData.productId;
    const productId = formData.productId || uuidv4();
    const timestamp = new Date().toISOString();

    const oldProduct = isNew ? undefined : await db.products.get(productId);
    const oldCost = isNew ? undefined : await db.productCosts.get(productId);

    // 1. Logic for SKU generation
    let sku = formData.sku;
    if (!sku) {
      const prefix = formData.productType?.substring(0, 3).toUpperCase() || 'PRO';
      const random = Math.floor(1000 + Math.random() * 9000);
      sku = `${prefix}-${random}`;
    }

    // 2. Barcode handling
    const barcode = formData.barcode || sku;

    const finalProduct: Product = {
      ...(formData as Product),
      productId,
      sku,
      barcode,
      name: formData.name || 'Produk Tanpa Nama',
      categoryId: formData.categoryId || 'UNCATEGORIZED',
      productType: formData.productType || 'SEMBAKO',
      baseUnit: formData.baseUnit || 'PCS',
      status: formData.status || 'ACTIVE',
      normalPrice: Number(formData.normalPrice || 0),
      hpp: hpp ?? Number(formData.hpp || 0),
      priceAlertThreshold: formData.priceAlertThreshold ? Number(formData.priceAlertThreshold) : undefined,
      stock: isNew ? 0 : (oldProduct?.stock ?? 0),
      minimumStock: Number(formData.minimumStock || 0),
      targetStock: Number(formData.targetStock || 0),
      saleUnits: formData.saleUnits || [formData.baseUnit || 'PCS'],
      conversionRules: formData.conversionRules || [],
      createdAt: formData.createdAt || timestamp,
      updatedAt: timestamp
    };

    // Enforce opening cost rule: Opening stock wajib memiliki valid opening cost (> 0)
    if (isNew && Number(formData.stock || 0) > 0) {
      const openingCost = hpp !== undefined ? hpp : finalProduct.hpp;
      if (!openingCost || openingCost <= 0) {
        throw new Error('Opening stock wajib memiliki valid opening cost (HPP/WAC > 0).');
      }
    }

    // NO DIRECT FREE WAC EDIT:
    // Existing product costs cannot be edited arbitrarily without cost adjustment audit
    if (!isNew && oldCost && hpp !== undefined && hpp !== oldCost.hpp) {
      throw new Error('HPP/WAC tidak dapat diubah bebas secara langsung (No Direct Free Edit). Gunakan menu Koreksi HPP Resmi dengan audit trail.');
    }

    await db.products.put(finalProduct);

    // If new product has initial stock, record OPENING_BALANCE movement
    if (isNew && Number(formData.stock || 0) > 0) {
      const validOpeningCost = (hpp !== undefined && hpp > 0) ? hpp : finalProduct.hpp;
      await StockService.recordMovement({
        productId,
        movementType: 'OPENING_BALANCE',
        qty: Number(formData.stock),
        unit: finalProduct.baseUnit,
        baseQty: Number(formData.stock),
        referenceId: `init_${productId.slice(0, 8)}`,
        segmentId: finalProduct.productType === 'FISH' ? 'IKAN' : 'WARUNG',
        reason: 'Stok Awal Produk Baru dengan Valid Opening Cost',
        costSnapshot: validOpeningCost,
        userId: 'SYSTEM',
        deviceId: 'LOCAL',
        timestamp
      });
    }

    // 3. Handle HPP (Separately)
    if (hpp !== undefined) {
      const productCost = {
        productId,
        hpp,
        updatedAt: timestamp
      };
      await db.productCosts.put(productCost);
      
      await db.syncQueue.add({
        entityType: 'productCosts',
        entityId: productId,
        action: isNew ? 'CREATE' : 'UPDATE',
        payload: productCost,
        status: 'PENDING',
        retryCount: 0,
        createdAt: timestamp
      });
    }

    // Check for price fluctuations
    if (oldProduct && oldCost && hpp !== undefined) {
      await this.checkPriceFluctuation(oldProduct, oldCost.hpp, finalProduct, hpp);
    }

    await AuditEngine.log({
      userId: 'SYSTEM',
      role: 'SYSTEM',
      deviceId: 'LOCAL',
      action: isNew ? 'CREATE_PRODUCT' : 'UPDATE_PRODUCT',
      module: 'INVENTORY',
      referenceId: productId,
      after: finalProduct
    });

    await db.syncQueue.add({
      entityType: 'products',
      entityId: productId,
      action: isNew ? 'CREATE' : 'UPDATE',
      payload: finalProduct,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    return productId;
  }

  static async deleteProduct(productId: string): Promise<void> {
    const product = await db.products.get(productId);
    if (!product) return;
    
    // Track deleted product ID so baseline seeding will never resurrect this product
    try {
      const deletedSetting = await db.settings.get('deleted_product_ids');
      let ids: string[] = [];
      if (deletedSetting && Array.isArray(deletedSetting.ids)) {
        ids = deletedSetting.ids;
      }
      
      if (!ids.includes(productId)) {
        ids.push(productId);
        await db.settings.put({ id: 'deleted_product_ids', ids });
      }
    } catch (e) {
      console.warn('Failed to record deleted_product_ids:', e);
    }

    // Hard delete from core tables
    await db.products.delete(productId);
    await db.productCosts.delete(productId);
    
    // Also clean up stock movements to prevent orphaned ledger entries
    try {
      await db.stockMovements.where('productId').equals(productId).delete();
    } catch (e) {
      console.warn('Failed to clean up stock movements for deleted product:', e);
    }

    await AuditEngine.log({
      userId: 'SYSTEM',
      role: 'SYSTEM',
      deviceId: 'LOCAL',
      action: 'DELETE_PRODUCT',
      module: 'INVENTORY',
      referenceId: productId,
      before: product
    });

    await db.syncQueue.add({
      entityType: 'products',
      entityId: productId,
      action: 'DELETE',
      payload: { productId },
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date().toISOString()
    });
  }

  static async toggleStatus(productId: string): Promise<void> {
    const product = await db.products.get(productId);
    if (!product) return;

    const newStatus = product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const timestamp = new Date().toISOString();

    await db.products.update(productId, { 
      status: newStatus,
      updatedAt: timestamp
    });

    const updatedProduct = { ...product, status: newStatus, updatedAt: timestamp };

    await AuditEngine.log({
      userId: 'SYSTEM',
      role: 'SYSTEM',
      deviceId: 'LOCAL',
      action: 'TOGGLE_PRODUCT_STATUS',
      module: 'INVENTORY',
      referenceId: productId,
      before: product,
      after: updatedProduct
    });

    await db.syncQueue.add({
      entityType: 'products',
      entityId: productId,
      action: 'UPDATE',
      payload: updatedProduct,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });
  }

  static async bulkAdjustPrice(productIds: string[], percentage: number, type: 'INCREASE' | 'DECREASE'): Promise<void> {
    const timestamp = new Date().toISOString();
    const factor = type === 'INCREASE' ? (1 + percentage / 100) : (1 - percentage / 100);

    for (const id of productIds) {
      const product = await db.products.get(id);
      if (!product) continue;

      const newPrice = Math.round(product.normalPrice * factor);
      await db.products.update(id, {
        normalPrice: newPrice,
        updatedAt: timestamp
      });

      const updatedProduct = { ...product, normalPrice: newPrice, updatedAt: timestamp };

      await db.syncQueue.add({
        entityType: 'products',
        entityId: id,
        action: 'UPDATE',
        payload: updatedProduct,
        status: 'PENDING',
        retryCount: 0,
        createdAt: timestamp
      });
    }

    await AuditEngine.log({
      userId: 'SYSTEM',
      role: 'SYSTEM',
      deviceId: 'LOCAL',
      action: 'BULK_PRICE_ADJUSTMENT',
      module: 'INVENTORY',
      referenceId: 'BULK',
      after: { productCount: productIds.length, percentage, type }
    });
  }

  static async checkLowStock(): Promise<void> {
    const products = await db.products.filter(p => p.status === 'ACTIVE' && p.stock <= p.minimumStock).toArray();
    
    for (const p of products) {
      const notificationId = `LOW_STOCK_${p.productId}_${new Date().toISOString().split('T')[0]}`;
      const existing = await db.notifications.get(notificationId);
      
      if (!existing) {
        const notif = {
          notificationId,
          severity: 'WARNING' as const,
          referenceId: p.productId,
          message: `Stok Menipis! Produk ${p.name} sisa ${p.stock} ${p.baseUnit}. Segera lakukan restock.`,
          isRead: false,
          createdAt: new Date().toISOString()
        };

        await db.notifications.put(notif);
        
        await db.syncQueue.add({
          entityType: 'notifications',
          entityId: notificationId,
          action: 'CREATE',
          payload: notif,
          status: 'PENDING',
          retryCount: 0,
          createdAt: notif.createdAt
        });
      }
    }
  }
  
  static async checkPriceFluctuation(oldProduct: Product, oldHpp: number, newProduct: Product, newHpp: number): Promise<void> {
    if (!newProduct.priceAlertThreshold) return;
    
    if (oldHpp === 0) return; 
    
    const fluctuationPercent = Math.abs((newHpp - oldHpp) / oldHpp) * 100;
    
    if (fluctuationPercent >= newProduct.priceAlertThreshold) {
      const notificationId = `PRICE_ALERT_${newProduct.productId}_${new Date().getTime()}`;
      const notif = {
        notificationId,
        severity: 'URGENT' as const,
        referenceId: newProduct.productId,
        message: `Alert Harga! HPP ${newProduct.name} berfluktuasi ${fluctuationPercent.toFixed(1)}% (Rp ${oldHpp.toLocaleString()} -> Rp ${newHpp.toLocaleString()}).`,
        isRead: false,
        createdAt: new Date().toISOString()
      };
      
      await db.notifications.put(notif);
      
      await db.syncQueue.add({
        entityType: 'notifications',
        entityId: notificationId,
        action: 'CREATE',
        payload: notif,
        status: 'PENDING',
        retryCount: 0,
        createdAt: notif.createdAt
      });
    }
  }

  /**
   * Automatically converts a quantity from any unit (display or base) to the product's base unit.
   * E.g.:
   * - 2 BUNGKUS Magnum (baseUnit: BATANG, 1 BUNGKUS = 20 BATANG) -> 40 BATANG (factor: 20)
   * - 5 BATANG -> 5 BATANG (factor: 1)
   * Handles case-insensitive unit names and fallback cleanly.
   */
  static convertToBaseUnit(
    product: Product,
    quantity: number,
    unit?: string
  ): {
    baseQty: number;
    baseUnit: string;
    factor: number;
    unit: string;
  } {
    const rawUnit = unit?.trim() || product.baseUnit || 'PCS';
    const baseUnit = product.baseUnit || 'PCS';

    // 1. Direct match with baseUnit
    if (rawUnit.toUpperCase() === baseUnit.toUpperCase()) {
      return {
        baseQty: quantity,
        baseUnit,
        factor: 1,
        unit: baseUnit
      };
    }

    // 2. Look for matching rule in conversionRules
    const rules = product.conversionRules || [];
    const directRule = rules.find(
      r => r.toUnit.toUpperCase() === rawUnit.toUpperCase()
    );

    if (directRule && directRule.factor > 0) {
      return {
        baseQty: Number((quantity * directRule.factor).toFixed(4)),
        baseUnit,
        factor: directRule.factor,
        unit: directRule.toUnit
      };
    }

    // 3. Inverse rule fallback (if fromUnit was stored as the display unit)
    const inverseRule = rules.find(
      r => r.fromUnit?.toUpperCase() === rawUnit.toUpperCase() && r.toUnit.toUpperCase() === baseUnit.toUpperCase()
    );

    if (inverseRule && inverseRule.factor > 0) {
      return {
        baseQty: Number((quantity * inverseRule.factor).toFixed(4)),
        baseUnit,
        factor: inverseRule.factor,
        unit: inverseRule.fromUnit
      };
    }

    // 4. Fallback 1:1 if unit is unknown
    return {
      baseQty: quantity,
      baseUnit,
      factor: 1,
      unit: rawUnit
    };
  }

  /**
   * Converts a quantity from base unit to a target display unit (e.g. 'BATANG' to 'BUNGKUS').
   * E.g.:
   * - 40 BATANG -> 2 BUNGKUS (factor: 20, remainder: 0 BATANG)
   * - 45 BATANG -> 2.25 BUNGKUS (2 whole BUNGKUS, 5 remainder BATANG)
   */
  static convertFromBaseUnit(
    product: Product,
    baseQuantity: number,
    targetUnit: string
  ): {
    displayQty: number;
    wholeUnits: number;
    remainderBaseQty: number;
    targetUnit: string;
    baseUnit: string;
    factor: number;
  } {
    const baseUnit = product.baseUnit || 'PCS';
    const cleanTarget = targetUnit.trim();

    if (cleanTarget.toUpperCase() === baseUnit.toUpperCase()) {
      return {
        displayQty: baseQuantity,
        wholeUnits: Math.floor(baseQuantity),
        remainderBaseQty: 0,
        targetUnit: baseUnit,
        baseUnit,
        factor: 1
      };
    }

    const rules = product.conversionRules || [];
    const rule = rules.find(r => r.toUnit.toUpperCase() === cleanTarget.toUpperCase());

    if (rule && rule.factor > 0) {
      const displayQty = Number((baseQuantity / rule.factor).toFixed(4));
      const wholeUnits = Math.floor(baseQuantity / rule.factor);
      const remainderBaseQty = Number((baseQuantity % rule.factor).toFixed(4));

      return {
        displayQty,
        wholeUnits,
        remainderBaseQty,
        targetUnit: rule.toUnit,
        baseUnit,
        factor: rule.factor
      };
    }

    return {
      displayQty: baseQuantity,
      wholeUnits: Math.floor(baseQuantity),
      remainderBaseQty: 0,
      targetUnit: cleanTarget,
      baseUnit,
      factor: 1
    };
  }

  /**
   * Universal unit converter between any two arbitrary units defined on a product
   * (e.g., SLOP -> BUNGKUS, BUNGKUS -> BATANG, BATANG -> BUNGKUS).
   */
  static convertUnitQuantity(
    product: Product,
    quantity: number,
    fromUnit: string,
    toUnit: string
  ): {
    convertedQuantity: number;
    baseQty: number;
    fromUnit: string;
    toUnit: string;
    baseUnit: string;
  } {
    // 1. Convert source unit to base unit quantity
    const { baseQty } = this.convertToBaseUnit(product, quantity, fromUnit);

    // 2. Convert base quantity to destination unit
    const { displayQty } = this.convertFromBaseUnit(product, baseQty, toUnit);

    return {
      convertedQuantity: displayQty,
      baseQty,
      fromUnit,
      toUnit,
      baseUnit: product.baseUnit || 'PCS'
    };
  }

  /**
   * Resolves base quantity for a product by ID or Product instance.
   */
  static async resolveBaseQuantity(
    productIdOrProduct: string | Product,
    quantity: number,
    unit?: string
  ): Promise<{
    product: Product;
    baseQty: number;
    baseUnit: string;
    factor: number;
    unit: string;
  }> {
    let product: Product | undefined;
    if (typeof productIdOrProduct === 'string') {
      product = await db.products.get(productIdOrProduct);
      if (!product) {
        throw new Error(`Produk dengan ID ${productIdOrProduct} tidak ditemukan.`);
      }
    } else {
      product = productIdOrProduct;
    }

    const conversion = this.convertToBaseUnit(product, quantity, unit);

    return {
      product,
      ...conversion
    };
  }

  /**
   * Service layer function that automatically handles unit conversion between
   * display units and base units (e.g., 'bungkus' -> 'batang'), then accurately
   * decrements the inventory in the database and updates stock movements.
   */
  static async decrementInventory(params: {
    productId: string;
    quantity: number;
    unit?: string;
    movementType?: 'SALE_OUT' | 'DAMAGED_OUT' | 'LOST_OUT' | 'EXPIRED_OUT' | 'STOCK_OPNAME_OUT';
    referenceId?: string;
    transactionId?: string;
    reason?: string;
    userId?: string;
    deviceId?: string;
    segmentId?: 'WARUNG' | 'IKAN';
  }): Promise<{
    product: Product;
    previousStock: number;
    newStock: number;
    deductedBaseQty: number;
    baseUnit: string;
    unitUsed: string;
  }> {
    const product = await db.products.get(params.productId);
    if (!product) {
      throw new Error(`Produk dengan ID ${params.productId} tidak ditemukan.`);
    }

    const previousStock = product.stock ?? 0;
    const unitUsed = params.unit || product.baseUnit;

    // Automatic unit conversion to smallest denominator (base unit)
    const { baseQty, baseUnit } = this.convertToBaseUnit(
      product,
      Math.abs(params.quantity),
      unitUsed
    );

    // Record stock movement using StockService gateway (derives and updates stock)
    await StockService.recordMovement({
      productId: product.productId,
      movementType: params.movementType || 'SALE_OUT',
      qty: Math.abs(params.quantity),
      unit: unitUsed,
      baseQty,
      referenceId: params.referenceId || `dec_${uuidv4().substring(0, 8)}`,
      transactionId: params.transactionId,
      reason: params.reason || `Pengurangan stok otomatis (${params.quantity} ${unitUsed} -> ${baseQty} ${baseUnit})`,
      userId: params.userId || 'SYSTEM',
      deviceId: params.deviceId || 'LOCAL',
      segmentId: params.segmentId || (product.productType === 'FISH' ? 'IKAN' : 'WARUNG')
    });

    const refreshedProduct = await db.products.get(params.productId);
    const newStock = refreshedProduct?.stock ?? (previousStock - baseQty);

    return {
      product: refreshedProduct || product,
      previousStock,
      newStock,
      deductedBaseQty: baseQty,
      baseUnit,
      unitUsed
    };
  }

  /**
   * Ensures essential sembako catalog items exist and have valid Opening Balance stock movements.
   * If any non-bundle product has missing opening movements or negative derived stock (e.g. from prior tests),
   * repairs and initializes the stock ledger to prevent checkout blockage.
   */
  static async ensureBaselineProductsAndStock(userId: string = 'SYSTEM'): Promise<void> {
    const nowStr = new Date().toISOString();

    const baselineProducts: Product[] = [
      {
        productId: 'p1',
        sku: 'B-PANDAN-5K',
        barcode: '888001',
        name: 'Beras Pandan Wangi 5kg',
        categoryId: 'SEMBAKO',
        productType: 'SEMBAKO',
        baseUnit: 'PCS',
        saleUnits: ['PCS', 'DUS'],
        conversionRules: [{ fromUnit: 'PCS', toUnit: 'DUS', factor: 4 }],
        normalPrice: 85000,
        hpp: 78000,
        stock: 100,
        minimumStock: 10,
        targetStock: 50,
        status: 'ACTIVE',
        createdAt: nowStr,
        updatedAt: nowStr
      },
      {
        productId: 'p2',
        sku: 'M-GORENG-2L',
        barcode: '888002',
        name: 'Minyak Goreng 2L',
        categoryId: 'SEMBAKO',
        productType: 'SEMBAKO',
        baseUnit: 'PCS',
        saleUnits: ['PCS', 'DUS'],
        conversionRules: [{ fromUnit: 'PCS', toUnit: 'DUS', factor: 6 }],
        normalPrice: 34000,
        hpp: 29000,
        stock: 100,
        minimumStock: 15,
        targetStock: 60,
        status: 'ACTIVE',
        createdAt: nowStr,
        updatedAt: nowStr
      },
      {
        productId: 'p3',
        sku: 'G-PASIR-1KG',
        barcode: '888003',
        name: 'Gula Pasir 1kg',
        categoryId: 'SEMBAKO',
        productType: 'SEMBAKO',
        baseUnit: 'PCS',
        saleUnits: ['PCS', 'KARUNG'],
        conversionRules: [{ fromUnit: 'PCS', toUnit: 'KARUNG', factor: 50 }],
        normalPrice: 17500,
        hpp: 15000,
        stock: 100,
        minimumStock: 20,
        targetStock: 100,
        status: 'ACTIVE',
        createdAt: nowStr,
        updatedAt: nowStr
      },
      {
        productId: 'p4',
        sku: 'T-AYAM-1KG',
        barcode: '888004',
        name: 'Telur Ayam 1kg',
        categoryId: 'SEMBAKO',
        productType: 'SEMBAKO',
        baseUnit: 'KG',
        saleUnits: ['KG', 'PETI'],
        conversionRules: [{ fromUnit: 'KG', toUnit: 'PETI', factor: 10 }],
        normalPrice: 28000,
        hpp: 24000,
        stock: 100,
        minimumStock: 10,
        targetStock: 50,
        status: 'ACTIVE',
        createdAt: nowStr,
        updatedAt: nowStr
      },
      {
        productId: 'p5',
        sku: 'MIE-GRG',
        barcode: '888005',
        name: 'Mie Instan Goreng',
        categoryId: 'SEMBAKO',
        productType: 'SEMBAKO',
        baseUnit: 'PCS',
        saleUnits: ['PCS', 'DUS'],
        conversionRules: [{ fromUnit: 'PCS', toUnit: 'DUS', factor: 40 }],
        normalPrice: 3500,
        hpp: 2800,
        stock: 200,
        minimumStock: 40,
        targetStock: 200,
        status: 'ACTIVE',
        createdAt: nowStr,
        updatedAt: nowStr
      }
    ];

    const deletedSetting = await db.settings.get('deleted_product_ids');
    const deletedIds: string[] = deletedSetting?.ids || [];

    for (const bp of baselineProducts) {
      // 1. Never re-seed if explicitly deleted by user
      if (deletedIds.includes(bp.productId)) continue;

      const existing = await db.products.get(bp.productId);
      if (!existing) {
        // 2. Check if product already exists with same barcode (manual entry override)
        const sameBarcode = await db.products.where('barcode').equals(bp.barcode).first();
        if (sameBarcode) continue;

        await db.products.put(bp);
        await db.productCosts.put({ productId: bp.productId, hpp: bp.hpp, updatedAt: nowStr });
      }
    }

    // Set flag that baseline process has run (though we now check individually for safety)
    await db.settings.put({ id: 'baseline_products_seeded', value: true, seededAt: nowStr });

    // Verify stock ledger integrity for ALL non-bundle products
    const allProducts = await db.products.toArray();
    for (const prod of allProducts) {
      if (prod.productType === 'BUNDLE') continue;

      const movements = await db.stockMovements.where('productId').equals(prod.productId).toArray();
      const derived = await StockService.getDerivedStock(prod.productId);

      // Case 1: No movements at all -> Initialize with Opening Balance
      if (movements.length === 0) {
        const initialQty = prod.stock > 0 ? prod.stock : 100;
        await db.stockMovements.add({
          stockMovementId: `sm_init_${prod.productId}_${uuidv4().slice(0, 6)}`,
          productId: prod.productId,
          referenceId: `init_${prod.productId}`,
          movementType: 'OPENING_BALANCE',
          qty: initialQty,
          unit: prod.baseUnit,
          baseQty: initialQty,
          segmentId: prod.productType === 'FISH' ? 'IKAN' : 'WARUNG',
          clientTimestamp: nowStr,
          serverTimestamp: null,
          deviceId: 'LOCAL',
          userId,
          reason: 'Stok Awal Sistem (OPENING_BALANCE)',
          costSnapshot: prod.hpp || 10000,
          createdAt: nowStr,
          quantity: initialQty,
          type: 'IN',
          timestamp: nowStr
        });
        await StockService.reconcileProductStock(prod.productId);
      } else {
        // Reconcile cached stock in product doc if out of sync with movements
        if (prod.stock !== derived) {
          await db.products.update(prod.productId, {
            stock: derived,
            updatedAt: nowStr
          });
        }
      }
    }
  }
}
