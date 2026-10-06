import React, { useState, useMemo } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Printer, 
  Search, 
  Tag as TagIcon, 
  Layout, 
  CheckCircle2, 
  X,
  Plus,
  Package,
  Layers,
  Sparkles
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { Product, Bundle } from '@/core/types';

interface ShelfTalkerItem {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  unit: string;
  tags: string[];
  type: 'PRODUCT' | 'BUNDLE';
}

export function ShelfTalkerModule() {
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const products = useLiveQuery(() => db.products.where('status').equals('ACTIVE').toArray());
  const bundles = useLiveQuery(() => db.bundles.where('status').equals('ACTIVE').toArray());

  const allItems = useMemo(() => {
    const pItems: ShelfTalkerItem[] = (products || []).map(p => ({
      id: p.productId,
      name: p.name,
      price: p.normalPrice,
      unit: p.baseUnit,
      tags: p.tags || [],
      type: 'PRODUCT'
    }));

    const bItems: ShelfTalkerItem[] = (bundles || []).map(b => ({
      id: b.bundleId,
      name: b.name,
      price: b.price,
      unit: 'PAKET',
      tags: ['BUNDLE', 'PROMO'],
      type: 'BUNDLE'
    }));

    return [...pItems, ...bItems];
  }, [products, bundles]);

  const filteredItems = useMemo(() => {
    return allItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
      const matchesTag = !selectedTag || item.tags.includes(selectedTag);
      return matchesSearch && matchesTag;
    });
  }, [allItems, search, selectedTag]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    allItems.forEach(item => item.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [allItems]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectedItems = useMemo(() => {
    return allItems.filter(item => selectedIds.includes(item.id));
  }, [allItems, selectedIds]);

  const handlePrint = () => {
    window.print();
  };

  if (isPreviewOpen) {
    return (
      <div className="fixed inset-0 z-[200] bg-white overflow-y-auto">
        <div className="print:hidden p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-10">
          <div>
            <h3 className="font-black text-slate-900 uppercase tracking-tight">Print Preview: Shelf Talkers</h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{selectedItems.length} Tags Prepared</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => setIsPreviewOpen(false)}
              className="px-6 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-100 rounded-2xl transition-all"
            >
              Back to Edit
            </button>
            <button 
              onClick={handlePrint}
              className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
            >
              <Printer size={18} />
              Print Now
            </button>
          </div>
        </div>

        <div className="p-8 max-w-[800px] mx-auto print:p-0">
          <div className="grid grid-cols-2 gap-8 print:gap-4">
            {selectedItems.map((item) => (
              <div 
                key={item.id} 
                className="aspect-[4/3] border-4 border-slate-900 rounded-[2rem] p-6 flex flex-col relative overflow-hidden bg-white shadow-xl print:shadow-none print:break-inside-avoid"
              >
                {/* Header Badge */}
                <div className="absolute top-0 right-0 bg-slate-900 text-white px-6 py-2 rounded-bl-3xl font-black text-[10px] uppercase tracking-widest">
                  {item.tags[0] || 'BEST VALUE'}
                </div>

                <div className="flex-1 flex flex-col">
                  <h4 className="text-xl font-black text-slate-900 uppercase leading-tight mb-2 pr-12 line-clamp-2">
                    {item.name}
                  </h4>
                  
                  <div className="mt-auto flex items-end justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">HARGA TERBAIK</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-slate-900">Rp</span>
                        <span className="text-5xl font-black text-slate-900 tracking-tighter">
                          {item.price.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">per {item.unit}</p>
                    </div>
                    
                    <div className="w-24 h-24 p-2 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100">
                      <QRCodeSVG 
                        value={`https://toko-rido.app/product/${item.id}`} 
                        size={80}
                        level="H"
                        includeMargin={false}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Sparkle */}
                <div className="absolute bottom-4 right-28 opacity-10 text-slate-900">
                  <Sparkles size={60} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <style>{`
          @media print {
            @page {
              size: A4;
              margin: 1cm;
            }
            body {
              background: white;
            }
            .no-print {
              display: none;
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <TagIcon size={20} className="text-blue-600" />
              Shelf Talker Generator
            </h3>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Cetak label promosi & bundle visibilitas tinggi</p>
          </div>
          <button 
            disabled={selectedIds.length === 0}
            onClick={() => setIsPreviewOpen(true)}
            className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center gap-2 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
          >
            <Layout size={18} />
            Preview {selectedIds.length} Tags
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari produk atau paket..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-sm"
              value={search ?? ''}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border ${
                !selectedTag ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              ALL
            </button>
            {availableTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border ${
                  selectedTag === tag ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-white text-slate-400 border-slate-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              onClick={() => toggleSelect(item.id)}
              className={`p-4 rounded-2xl border-2 text-left transition-all relative ${
                selectedIds.includes(item.id) 
                  ? 'border-blue-600 bg-blue-50/50 shadow-md' 
                  : 'border-slate-100 bg-white hover:border-blue-200'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.type === 'BUNDLE' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                  {item.type === 'BUNDLE' ? <Layers size={20} /> : <Package size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black text-slate-900 uppercase truncate">{item.name}</h4>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Rp {item.price.toLocaleString()}</p>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-1">
                {item.tags.map(tag => (
                  <span key={tag} className="text-[7px] font-black px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded uppercase tracking-tighter">
                    {tag}
                  </span>
                ))}
              </div>

              {selectedIds.includes(item.id) && (
                <div className="absolute top-2 right-2 text-blue-600">
                  <CheckCircle2 size={18} />
                </div>
              )}
            </button>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="py-20 text-center text-slate-300">
            <TagIcon size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm font-bold uppercase tracking-widest">Tidak ada item ditemukan</p>
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-8 py-4 bg-slate-900 text-white rounded-3xl shadow-2xl flex items-center gap-6 z-50 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-blue-400" />
            <span className="font-bold text-sm uppercase tracking-widest">{selectedIds.length} Items Selected</span>
          </div>
          <div className="h-6 w-px bg-slate-700" />
          <div className="flex gap-3">
            <button 
              onClick={() => setSelectedIds([])}
              className="text-[10px] font-black uppercase tracking-widest hover:text-slate-300"
            >
              Clear All
            </button>
            <button 
              onClick={() => setIsPreviewOpen(true)}
              className="px-6 py-2 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-500 transition-all"
            >
              Generate Tags
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
