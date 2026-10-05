import React, { useState } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Layers, 
  Search, 
  Plus, 
  Trash2, 
  Save, 
  Package, 
  ArrowRight,
  Boxes
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { Bundle, BundleComponent, Product } from '@/core/types';

export default function BundleManagement() {
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newBundle, setNewBundle] = useState<Partial<Bundle>>({
    name: '',
    components: [],
    price: 0,
    status: 'ACTIVE'
  });

  const bundles = useLiveQuery(() => db.bundles.toArray());
  const allProducts = useLiveQuery(() => db.products.filter(p => p.productType !== 'BUNDLE').toArray());

  const addComponent = (product: Product) => {
    const exists = newBundle.components?.find(c => c.productId === product.productId);
    if (exists) return;

    setNewBundle({
      ...newBundle,
      components: [...(newBundle.components || []), {
        productId: product.productId,
        qty: 1,
        unit: product.baseUnit
      }]
    });
  };

  const removeComponent = (productId: string) => {
    setNewBundle({
      ...newBundle,
      components: newBundle.components?.filter(c => c.productId !== productId)
    });
  };

  const updateCompQty = (productId: string, qty: number) => {
    setNewBundle({
      ...newBundle,
      components: newBundle.components?.map(c => 
        c.productId === productId ? { ...c, qty } : c
      )
    });
  };

  const handleSave = async () => {
    if (!newBundle.name || !newBundle.components?.length) return;

    const bundleId = uuidv4();
    const bundle: Bundle = {
      ...(newBundle as Bundle),
      bundleId,
      status: 'ACTIVE'
    };

    // 1. Save to Bundle Store
    await db.bundles.add(bundle);

    // 2. Also register as a PRODUCT (PRD 10: Bundle is a product type)
    const productEntry: Product = {
      productId: bundleId,
      barcode: `BNDL-${Date.now()}`,
      name: bundle.name,
      categoryId: 'BUNDLES',
      productType: 'BUNDLE',
      baseUnit: 'PAKET',
      saleUnits: ['PAKET'],
      conversionRules: [],
      normalPrice: bundle.price,
      hpp: bundle.price * 0.9, // Default estimated HPP for bundles
      minimumStock: 0,
      targetStock: 0,
      stock: 0, // No physical stock for bundles
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.products.add(productEntry);

    // 3. Sync
    await db.syncQueue.add({
      entityType: 'bundles',
      entityId: bundleId,
      action: 'CREATE',
      payload: bundle,
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date().toISOString()
    });

    setIsAdding(false);
    setNewBundle({ name: '', components: [], price: 0 });
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Bundles & Packages</h2>
          <p className="text-slate-500 text-sm font-medium">Kelola paket bundling produk (Multi-item SKU).</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-200"
        >
          <Plus size={18} />
          Buat Paket Baru
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* List */}
        <div className="space-y-4">
          {bundles?.map(bundle => (
            <div key={bundle.bundleId} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                    <Layers size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 uppercase tracking-tight">{bundle.name}</h3>
                    <p className="text-xs text-indigo-600 font-bold">Harga Paket: Rp {bundle.price.toLocaleString()}</p>
                  </div>
                </div>
                <button className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 size={18} />
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Isi Paket:</p>
                {bundle.components.map((comp, idx) => {
                  const p = allProducts?.find(item => item.productId === comp.productId);
                  return (
                    <div key={idx} className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg">
                      <ArrowRight size={12} className="text-slate-400" />
                      {comp.qty}x {p?.name || 'Unknown Product'}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Add Section */}
        {isAdding && (
          <div className="bg-white rounded-3xl border-2 border-blue-500 p-8 shadow-2xl h-fit space-y-6 sticky top-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Konfigurator Paket</h3>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600"><Plus className="rotate-45" /></button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Paket</label>
                <input
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900"
                  placeholder="Contoh: Paket Sembako Hemat"
                  value={newBundle.name || ''}
                  onChange={e => setNewBundle({ ...newBundle, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga Jual Paket (Set)</label>
                <input
                  type="number"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 tabular-nums"
                  value={newBundle.price ?? 0}
                  onChange={e => setNewBundle({ ...newBundle, price: Number(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Komponen Produk</label>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 min-h-[100px] space-y-2">
                  {newBundle.components?.map((comp, idx) => {
                    const p = allProducts?.find(item => item.productId === comp.productId);
                    return (
                      <div key={idx} className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{p?.name}</p>
                        </div>
                        <input 
                          type="number"
                          className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center"
                          value={comp.qty ?? 1}
                          onChange={e => updateCompQty(comp.productId, Number(e.target.value))}
                        />
                        <button onClick={() => removeComponent(comp.productId)} className="text-red-500 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                  {newBundle.components?.length === 0 && (
                    <p className="text-[10px] text-slate-400 text-center py-4">Belum ada komponen terpilih</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pilih Produk Untuk Ditambah</label>
                <div className="max-h-[200px] overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                  {allProducts?.map(p => (
                    <button 
                      key={p.productId}
                      onClick={() => addComponent(p)}
                      className="w-full flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg text-left transition-colors border border-transparent hover:border-slate-200"
                    >
                      <span className="text-xs font-bold text-slate-700">{p.name}</span>
                      <Plus size={14} className="text-blue-500" />
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleSave}
                className="w-full py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-500 shadow-lg shadow-blue-200 transition-all mt-4"
              >
                Simpan Konfigurasi Paket
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
