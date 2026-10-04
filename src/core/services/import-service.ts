import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { Product, ProductType } from '../types';

export interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export class ImportService {
  static async importProductsFromCSV(file: File): Promise<ImportResult> {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const result: ImportResult = {
            success: 0,
            failed: 0,
            errors: []
          };

          const timestamp = new Date().toISOString();
          const productsToSync: Product[] = [];

          for (let i = 0; i < results.data.length; i++) {
            const row: any = results.data[i];
            try {
              // Validation
              if (!row.name || !row.normalPrice) {
                throw new Error(`Row ${i + 1}: Name and Normal Price are required.`);
              }

              const productId = uuidv4();
              const product: Product = {
                productId,
                barcode: row.barcode || `INT-${Date.now()}-${i}`,
                sku: row.sku || '',
                name: row.name,
                categoryId: row.categoryId || 'GENERAL',
                productType: (row.productType as ProductType) || 'SEMBAKO',
                baseUnit: row.baseUnit || 'PCS',
                saleUnits: [row.baseUnit || 'PCS'],
                conversionRules: [],
                normalPrice: parseFloat(row.normalPrice),
                stock: parseFloat(row.stock || '0'),
                minimumStock: parseFloat(row.minimumStock || '5'),
                targetStock: parseFloat(row.targetStock || '20'),
                tags: row.tags ? row.tags.split(',').map((t: string) => t.trim().toUpperCase()).filter(Boolean) : [],
                status: 'ACTIVE',
                createdAt: timestamp,
                updatedAt: timestamp
              };

              await db.products.add(product);
              
              const hppValue = parseFloat(row.hpp || '0');
              await db.productCosts.add({
                productId,
                hpp: hppValue,
                updatedAt: timestamp
              });
              productsToSync.push(product);
              result.success++;
            } catch (error: any) {
              result.failed++;
              result.errors.push(error.message);
            }
          }

          // Batch sync queue
          for (const product of productsToSync) {
            await db.syncQueue.add({
              entityType: 'products',
              entityId: product.productId,
              action: 'CREATE',
              payload: product,
              status: 'PENDING',
              retryCount: 0,
              createdAt: timestamp
            });
          }

          resolve(result);
        },
        error: (error) => {
          resolve({
            success: 0,
            failed: 0,
            errors: [error.message]
          });
        }
      });
    });
  }

  static downloadTemplate() {
    const csvContent = "name,barcode,sku,categoryId,productType,baseUnit,normalPrice,hpp,stock,minimumStock,targetStock,tags\n" +
                       "Beras Pandan 5kg,8991234567890,SKU-001,SEMBAKO,SEMBAKO,KG,75000,65000,100,10,50,LEBARAN,PROMO\n" +
                       "Telur Ayam,8990987654321,SKU-002,SEMBAKO,SEMBAKO,BUTIR,2000,1500,500,50,200,HARIAN";
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = "template_import_produk.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
