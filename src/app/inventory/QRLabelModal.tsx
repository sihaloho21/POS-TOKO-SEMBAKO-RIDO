import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer, Download } from 'lucide-react';
import type { Product } from '@/core/types';

interface QRLabelModalProps {
  product: Product;
  onClose: () => void;
}

export function QRLabelModal({ product, onClose }: QRLabelModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Label - ${product.name}</title>
          <style>
            @page { margin: 0; }
            body { 
              font-family: sans-serif; 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: center; 
              padding: 20px;
              text-align: center;
            }
            .label-container {
              border: 1px solid #eee;
              padding: 15px;
              width: 200px;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .product-name {
              font-size: 14px;
              font-weight: bold;
              margin-top: 10px;
              text-transform: uppercase;
            }
            .sku {
              font-size: 10px;
              color: #666;
              margin-top: 5px;
            }
            .price {
              font-size: 16px;
              font-weight: 900;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="label-container">
            ${content.innerHTML}
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Print QR Label</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col items-center justify-center py-8 bg-slate-50 rounded-2xl border border-slate-100 mb-8" ref={printRef}>
          <QRCodeSVG 
            value={product.barcode || product.productId} 
            size={160}
            level="H"
            includeMargin={true}
          />
          <p className="product-name font-bold text-slate-900 mt-4 text-center px-4 uppercase">{product.name}</p>
          <p className="sku text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{product.sku || product.barcode}</p>
          <p className="price text-xl font-black text-blue-600 mt-2">Rp {product.normalPrice.toLocaleString()}</p>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-4 font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all"
          >
            Batal
          </button>
          <button 
            onClick={handlePrint}
            className="flex-1 py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-xl hover:bg-blue-500 shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all"
          >
            <Printer size={18} />
            Print Label
          </button>
        </div>
      </div>
    </div>
  );
}
