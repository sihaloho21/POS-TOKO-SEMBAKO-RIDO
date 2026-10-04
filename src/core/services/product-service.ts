import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { Product } from '../types';
import { AuditEngine } from '../audit-engine';
import Papa from 'papaparse';

export class ProductService {
  static async getAllProducts(): Promise<Product[]> {
    return db.products.toArray();
  }

  static async exportToCSV(): Promise<void> {
    const products = await this.getAllProducts();
    const csv = Papa.unparse(products);
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
                hpp: Number(row.hpp || 0),
                stock: Number(row.stock || 0),
                minimumStock: Number(row.minimumStock || 0),
                targetStock: Number(row.targetStock || 0),
                status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
              };
              
              if (!productData.name) throw new Error('Missing name');
              
              await this.saveProduct(productData);
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

  static async saveProduct(formData: Partial<Product>): Promise<string> {
    const isNew = !formData.productId;
    const productId = formData.productId || uuidv4();
    const timestamp = new Date().toISOString();

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
      hpp: Number(formData.hpp || 0),
      stock: Number(formData.stock || 0),
      minimumStock: Number(formData.minimumStock || 0),
      targetStock: Number(formData.targetStock || 0),
      saleUnits: formData.saleUnits || [formData.baseUnit || 'PCS'],
      conversionRules: formData.conversionRules || [],
      createdAt: formData.createdAt || timestamp,
      updatedAt: timestamp
    };

    await db.products.put(finalProduct);

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
    
    await db.products.delete(productId);

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
}
