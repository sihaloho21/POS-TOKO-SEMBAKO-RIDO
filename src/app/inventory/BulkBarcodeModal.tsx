import React, { useState, useMemo } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  X, 
  Printer, 
  Search, 
  Layout, 
  Settings2, 
  CheckCircle2, 
  Grid, 
  Type, 
  Maximize2,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { BarcodeService } from '@/core/utils/barcode-service';
import type { Product } from '@/core/types';
import JsBarcode from 'jsbarcode';

interface BulkBarcodeModalProps {
  onClose: () => void;
}

interface LayoutConfig {
  width: number; // mm
  height: number; // mm
  columns: number;
  fontSize: number;
  showPrice: boolean;
  showName: boolean;
  margin: number; // mm
  paperSize: 'A4' | 'THERMAL';
}

export function BulkBarcodeModal({ onClose }: BulkBarcodeModalProps) {
  const [step, setStep] = useState<'SELECT' | 'PREVIEW'>('SELECT');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [config, setConfig] = useState<LayoutConfig>({
    width: 40,
    height: 25,
    columns: 2,
    fontSize: 8,
    showPrice: true,
    showName: true,
    margin: 2,
    paperSize: 'A4'
  });

  const products = useLiveQuery(() => 
    db.products
      .filter(p => p.status === 'ACTIVE' && (p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search)))
      .toArray()
  , [search]);

  const selectedProducts = useLiveQuery(
    () => db.products.where('productId').anyOf(selectedIds).toArray(),
    [selectedIds]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handlePrint = () => {
    if (!selectedProducts) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const labelsHtml = selectedProducts.map(p => {
      const barcode = p.barcode.length === 13 ? p.barcode : BarcodeService.generateInternalEAN13(p.barcode || p.productId.slice(-10));
      return `
        <div class="barcode-label">
          ${config.showName ? `<div class="product-name">${p.name}</div>` : ''}
          <svg id="barcode-${p.productId}"></svg>
          ${config.showPrice ? `<div class="price">Rp ${p.normalPrice.toLocaleString()}</div>` : ''}
        </div>
      `;
    }).join('');

    const pageConfig = config.paperSize === 'A4' 
      ? `size: A4; margin: 0;` 
      : `size: ${config.width}mm ${config.height}mm; margin: 0;`;

    const bodyStyle = config.paperSize === 'A4'
      ? `
          display: grid; 
          grid-template-columns: repeat(${config.columns}, ${config.width}mm);
          gap: ${config.margin}mm;
          padding: ${config.margin}mm;
          justify-content: center;
        `
      : `
          display: flex;
          flex-direction: column;
          align-items: center;
        `;

    const html = `
      <html>
        <head>
          <style>
            @page { ${pageConfig} }
            body { 
              font-family: sans-serif; 
              margin: 0;
              ${bodyStyle}
            }
            .barcode-label {
              width: ${config.width}mm;
              height: ${config.height}mm;
              ${config.paperSize === 'A4' ? 'border: 0.1mm solid #eee;' : ''}
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 1mm;
              text-align: center;
              page-break-inside: avoid;
              overflow: hidden;
              box-sizing: border-box;
            }
            .product-name {
              font-size: ${config.fontSize}px;
              font-weight: bold;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              width: 100%;
              text-transform: uppercase;
            }
            .price {
              font-size: ${config.fontSize + 2}px;
              font-weight: 900;
              margin-top: 0.5mm;
            }
            svg {
              width: 90%;
              max-height: ${config.height * 0.5}mm;
            }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js"></script>
        </head>
        <body>
          ${labelsHtml}
          <script>
            window.onload = function() {
              ${selectedProducts.map(p => {
                const barcode = p.barcode.length === 13 ? p.barcode : BarcodeService.generateInternalEAN13(p.barcode || p.productId.slice(-10));
                return `
                  JsBarcode("#barcode-${p.productId}", "${barcode}", {
                    format: "EAN13",
                    width: 1.2,
                    height: 30,
                    displayValue: true,
                    fontSize: 8,
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
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className={`bg-white w-full transition-all duration-500 rounded-3xl shadow-2xl overflow-hidden flex flex-col ${step === 'SELECT' ? 'max-w-2xl max-h-[85vh]' : 'max-w-6xl h-[90vh]'}`}>
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              {step === 'SELECT' ? <Printer size={20} /> : <Layout size={20} />}
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                {step === 'SELECT' ? 'Bulk Barcode Printing' : 'Print Preview & Layout'}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {step === 'SELECT' ? `Pilih Produk (${selectedIds.length})` : 'Sesuaikan Kepadatan & Ukuran Label'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        {step === 'SELECT' ? (
          <>
            <div className="p-6 border-b border-slate-100 bg-white">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm shadow-inner"
                  placeholder="Cari produk..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <div className="grid grid-cols-1 gap-2">
                {products?.map(p => (
                  <button 
                    key={p.productId}
                    onClick={() => toggleSelect(p.productId)}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      selectedIds.includes(p.productId) ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/10' : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                        selectedIds.includes(p.productId) ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200'
                      }`}>
                        {selectedIds.includes(p.productId) && <CheckCircle2 size={14} />}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-900 uppercase">{p.name}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.barcode || 'AUTO-GEN'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-blue-600">Rp {p.normalPrice.toLocaleString()}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button 
                onClick={onClose}
                className="flex-1 py-4 font-bold text-slate-500 uppercase tracking-widest hover:bg-white rounded-xl transition-all"
              >
                Batal
              </button>
              <button 
                onClick={() => setStep('PREVIEW')}
                disabled={selectedIds.length === 0}
                className="flex-[2] py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-xl hover:bg-blue-500 shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 transition-all"
              >
                Lanjutkan Ke Preview
                <ChevronRight size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar Controls */}
            <div className="w-80 border-r border-slate-100 p-8 space-y-8 overflow-y-auto bg-slate-50/30">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Printer size={14} /> Tipe Kertas
                </h4>
                <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1">
                  <button 
                    onClick={() => setConfig({...config, paperSize: 'A4', columns: 2})}
                    className={`flex-1 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${config.paperSize === 'A4' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}
                  >
                    Standard A4
                  </button>
                  <button 
                    onClick={() => setConfig({...config, paperSize: 'THERMAL', columns: 1})}
                    className={`flex-1 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${config.paperSize === 'THERMAL' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}
                  >
                    Thermal Roll
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Layout size={14} /> Presets Label
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: '40x25mm', w: 40, h: 25 },
                    { label: '50x30mm', w: 50, h: 30 },
                    { label: 'Shelf-Small', w: 60, h: 30 },
                    { label: 'Shelf-Large', w: 80, h: 40 }
                  ].map(p => (
                    <button 
                      key={p.label}
                      onClick={() => setConfig({...config, width: p.w, height: p.h})}
                      className="px-2 py-2 bg-white border border-slate-200 rounded-xl text-[8px] font-black uppercase tracking-widest hover:border-blue-600 transition-all"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Maximize2 size={14} /> Dimensi Kustom (mm)
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase">Lebar</span>
                    <input 
                      type="number" 
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                      value={config.width ?? 40}
                      onChange={e => setConfig({...config, width: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase">Tinggi</span>
                    <input 
                      type="number" 
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                      value={config.height ?? 25}
                      onChange={e => setConfig({...config, height: Number(e.target.value)})}
                    />
                  </div>
                </div>
              </div>

              {config.paperSize === 'A4' && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Grid size={14} /> Layout A4
                  </h4>
                  <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase">Kolom Per Baris</span>
                    <input 
                      type="number" 
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                      value={config.columns ?? 2}
                      onChange={e => setConfig({...config, columns: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase">Margin (mm)</span>
                    <input 
                      type="number" 
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                      value={config.margin ?? 2}
                      onChange={e => setConfig({...config, margin: Number(e.target.value)})}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Type size={14} /> Konten & Font
                </h4>
                <div className="space-y-1">
                  <span className="text-[8px] font-black text-slate-400 uppercase">Ukuran Font (px)</span>
                  <input 
                    type="number" 
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                    value={config.fontSize ?? 8}
                    onChange={e => setConfig({...config, fontSize: Number(e.target.value)})}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={config.showName} 
                      onChange={e => setConfig({...config, showName: e.target.checked})}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Tampilkan Nama</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={config.showPrice} 
                      onChange={e => setConfig({...config, showPrice: e.target.checked})}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Tampilkan Harga</span>
                  </label>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={handlePrint}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                >
                  <Printer size={16} />
                  Print Sekarang
                </button>
                <button 
                  onClick={() => setStep('SELECT')}
                  className="w-full py-3 mt-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors flex items-center justify-center gap-2"
                >
                  <ChevronLeft size={16} />
                  Kembali Pilih Produk
                </button>
              </div>
            </div>

            {/* Preview Area */}
            <div className="flex-1 bg-slate-200 p-12 overflow-y-auto">
              <div className="mx-auto bg-white shadow-2xl p-8 min-h-[11in] w-[8.5in] relative" id="print-canvas">
                <div className="absolute top-4 left-4 text-[8px] font-black text-slate-300 uppercase tracking-widest">A4 Preview Canvas</div>
                <div 
                  className="grid justify-center mx-auto"
                  style={{ 
                    gridTemplateColumns: `repeat(${config.columns}, ${config.width}mm)`,
                    gap: `${config.margin}mm`
                  }}
                >
                  {selectedProducts?.map(p => (
                    <div 
                      key={p.productId}
                      className="border border-slate-100 flex flex-col items-center justify-center p-2 text-center overflow-hidden"
                      style={{ width: `${config.width}mm`, height: `${config.height}mm` }}
                    >
                      {config.showName && (
                        <p className="font-bold uppercase truncate w-full" style={{ fontSize: `${config.fontSize}px` }}>
                          {p.name}
                        </p>
                      )}
                      <div className="w-full flex items-center justify-center py-1 opacity-50">
                        <div className="h-6 w-full bg-slate-900" style={{ height: `${config.height * 0.4}mm` }} />
                      </div>
                      <p className="font-mono" style={{ fontSize: `${config.fontSize - 2}px` }}>
                        {p.barcode || '2000000000000'}
                      </p>
                      {config.showPrice && (
                        <p className="font-black mt-1" style={{ fontSize: `${config.fontSize + 1}px` }}>
                          Rp {p.normalPrice.toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
