import Papa from 'papaparse';
import type { Product, ProductType } from '../types';
import { ProductService } from './product-service';

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

          for (let i = 0; i < results.data.length; i++) {
            const row: any = results.data[i];
            try {
              // Validation
              if (!row.name || !row.normalPrice) {
                throw new Error(`Baris ${i + 1}: Nama dan Harga Jual (normalPrice) wajib diisi.`);
              }

              const stockVal = parseFloat(row.stock || '0');
              const normalPriceVal = parseFloat(row.normalPrice);
              let hppVal = parseFloat(row.hpp || '0');
              if (stockVal > 0 && hppVal <= 0) {
                // Default fallback opening cost if user omitted hpp on positive stock
                hppVal = Math.max(1, Math.round(normalPriceVal * 0.85));
              }

              const baseUnit = (row.baseUnit || 'PCS').toUpperCase();
              const rawTags = row.tags
                ? String(row.tags).split(/[;,]/).map((t: string) => t.trim().toUpperCase()).filter(Boolean)
                : [];

              const productData: Partial<Product> = {
                barcode: row.barcode || `INT-${Date.now()}-${i}`,
                sku: row.sku || '',
                name: String(row.name).trim(),
                categoryId: row.categoryId || 'GENERAL',
                productType: ((row.productType as ProductType) || 'SEMBAKO'),
                baseUnit,
                saleUnits: [baseUnit],
                conversionRules: [],
                normalPrice: normalPriceVal,
                hpp: hppVal,
                stock: stockVal,
                minimumStock: parseFloat(row.minimumStock || '5'),
                targetStock: parseFloat(row.targetStock || '20'),
                tags: rawTags,
                status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
              };

              await ProductService.saveProduct(productData, hppVal);
              result.success++;
            } catch (error: any) {
              result.failed++;
              result.errors.push(`Baris ${i + 1}: ${error.message}`);
            }
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
    const csvContent =
      'name,barcode,sku,categoryId,productType,baseUnit,normalPrice,hpp,stock,minimumStock,targetStock,tags\n' +
      '"Beras Pandan 5kg",8991234567890,SKU-001,SEMBAKO,SEMBAKO,KG,75000,65000,100,10,50,"LEBARAN,PROMO"\n' +
      '"Telur Ayam",8990987654321,SKU-002,SEMBAKO,SEMBAKO,BUTIR,2000,1500,500,50,200,"HARIAN"';
    
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
