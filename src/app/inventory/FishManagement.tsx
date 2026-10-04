import React, { useState } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Fish as FishIcon, 
  Search, 
  Plus, 
  AlertTriangle,
  Weight,
  TrendingUp,
  History,
  Trash2
} from 'lucide-react';
import { ProductModal } from './ProductModal';
import type { Product } from '@/core/types';

export default function FishManagement() {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const fishProducts = useLiveQuery(
    () => db.products.filter(p => 
      p.productType === 'FISH' && 
      (p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search))
    ).toArray(),
    [search]
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Fish Management</h2>
          <p className="text-slate-500 text-sm font-medium">Manajemen stok ikan hidup dan kalkulasi WAC per KG.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-200"
        >
          <Plus size={18} />
          Tambah Jenis Ikan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
            <Weight size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Stok Ikan</p>
            <p className="text-xl font-black text-slate-900 tabular-nums">
              {fishProducts?.reduce((acc, p) => acc + p.stock, 0).toFixed(2)} KG
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estimasi Nilai Stok</p>
            <p className="text-xl font-black text-slate-900 tabular-nums">
              Rp {fishProducts?.reduce((acc, p) => acc + (p.stock * p.hpp), 0).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ikan Mati (Loss)</p>
            <p className="text-xl font-black text-slate-900 tabular-nums">0.00 KG</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari jenis ikan..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black">
                <th className="px-6 py-4">Jenis Ikan</th>
                <th className="px-6 py-4">Harga Jual / KG</th>
                <th className="px-6 py-4">WAC / KG (Modal)</th>
                <th className="px-6 py-4">Stok (KG)</th>
                <th className="px-6 py-4">Margin / KG</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fishProducts?.map((p) => (
                <tr key={p.productId} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                        <FishIcon size={20} />
                      </div>
                      <p className="text-sm font-bold text-slate-900 uppercase tracking-tight">{p.name}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-black text-slate-900 tabular-nums">Rp {p.normalPrice.toLocaleString()}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-black text-blue-600 tabular-nums">Rp {p.hpp.toLocaleString()}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-900 tabular-nums">{p.stock.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">KG</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                      + Rp {(p.normalPrice - p.hpp).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button className="p-2 text-slate-400 hover:text-blue-600"><History size={18} /></button>
                      <button className="p-2 text-slate-400 hover:text-rose-600"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <ProductModal onClose={() => setIsModalOpen(false)} />
      )}
    </div>
  );
}
