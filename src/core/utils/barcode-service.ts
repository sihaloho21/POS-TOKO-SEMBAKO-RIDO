import JsBarcode from 'jsbarcode';
import type { Product } from '../types';
import { db } from '../database';

export class BarcodeService {
  /**
   * Generates a valid EAN-13 checksum digit
   */
  static calculateEAN13Checksum(code: string): number {
    const digits = code.split('').map(Number);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }
    const res = 10 - (sum % 10);
    return res === 10 ? 0 : res;
  }

  /**
   * Generates a new EAN-13 barcode for internal use
   * Format: 20 (Internal) + 10 digits (Product ID suffix or random) + Checksum
   */
  static generateInternalEAN13(suffix: string): string {
    // Pad suffix to 10 digits
    const padded = suffix.padStart(10, '0').slice(-10);
    const codeWithoutChecksum = `20${padded}`;
    const checksum = this.calculateEAN13Checksum(codeWithoutChecksum);
    return `${codeWithoutChecksum}${checksum}`;
  }

  static async bulkPrintBarcodes(products: Product[]): Promise<void> {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const labelsHtml = products.map(p => {
      const barcode = p.barcode.length === 13 ? p.barcode : this.generateInternalEAN13(p.barcode || p.productId.slice(-10));
      return `
        <div class="barcode-label">
          <div class="product-name">${p.name}</div>
          <svg id="barcode-${p.productId}"></svg>
          <div class="price">Rp ${p.normalPrice.toLocaleString()}</div>
        </div>
      `;
    }).join('');

    const html = `
      <html>
        <head>
          <style>
            @page { margin: 5mm; }
            body { 
              font-family: sans-serif; 
              display: flex; 
              flex-wrap: wrap; 
              gap: 10px;
              justify-content: center;
              padding: 10px;
            }
            .barcode-label {
              width: 40mm;
              height: 25mm;
              border: 0.1mm solid #eee;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 2mm;
              text-align: center;
              page-break-inside: avoid;
            }
            .product-name {
              font-size: 8px;
              font-weight: bold;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              width: 100%;
              text-transform: uppercase;
            }
            .price {
              font-size: 10px;
              font-weight: 900;
              margin-top: 1mm;
            }
            svg {
              width: 100%;
              max-height: 15mm;
            }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js"></script>
        </head>
        <body>
          ${labelsHtml}
          <script>
            window.onload = function() {
              ${products.map(p => {
                const barcode = p.barcode.length === 13 ? p.barcode : this.generateInternalEAN13(p.barcode || p.productId.slice(-10));
                return `
                  JsBarcode("#barcode-${p.productId}", "${barcode}", {
                    format: "EAN13",
                    width: 1.5,
                    height: 40,
                    displayValue: true,
                    fontSize: 10,
                    margin: 0
                  });
                `;
              }).join('')}
              
              setTimeout(() => {
                window.print();
                window.onafterprint = function() { window.close(); };
              }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  }
}
