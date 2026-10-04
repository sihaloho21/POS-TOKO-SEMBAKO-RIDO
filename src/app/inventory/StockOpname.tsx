import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { StockOpnameService } from '@/core/services/stock-opname-service';
import { useAuthStore } from '@/core/auth-store';
import type { StockOpname as StockOpnameType } from '@/core/types';
import { 
  ClipboardList, 
  Plus, 
  Save, 
  CheckCircle, 
  AlertTriangle,
  Package,
  ArrowRight,
  Search
} from 'lucide-react';
import { format } from 'date-fns';

export default function StockOpname() {
  const { currentUser } = useAuthStore();
  const [isCreating, setIsCreating] = useState(false);
  const [activeOpnameId, setActiveOpnameId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  const opnames = useLiveQuery(() => db.stockOpnames.orderBy('createdAt').reverse().toArray());
  const activeOpname = useLiveQuery(
    () => activeOpnameId ? db.stockOpnames.get(activeOpnameId) : undefined,
    [activeOpnameId]
  );

  const handleStart = async () => {
    if (!currentUser) return;
    const id = await StockOpnameService.startOpname(currentUser.userId, 'device-1');
    setActiveOpnameId(id);
    setIsCreating(true);
  };

  const handleUpdateQty = async (productId: string, qty: number) => {
    if (!activeOpname) return;
    const newItems = activeOpname.items.map((item: any) => 
      item.productId === productId ? { ...item, physicalQty: qty } : item
    );
    await db.stockOpnames.update(activeOpname.opnameId, { items: newItems, updatedAt: new Date().toISOString() });
  };

  const handleFinalize = async () => {
    if (!activeOpname || !currentUser) return;
    if (!confirm('Finalisasi Stock Opname akan mengubah saldo stok fisik secara permanen. Lanjutkan?')) return;
    
    await StockOpnameService.finalizeOpname(activeOpname.opnameId, currentUser.userId, 'device-1');
    setIsCreating(false);
    setActiveOpnameId(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Stock Opname</h2>
          <p className="text-slate-500 text-sm font-medium">Verifikasi stok fisik dan sesuaikan perbedaan sistem.</p>
        </div>
        {!isCreating && (
          <button 
            onClick={handleStart}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-200"
          >
            <Plus size={18} />
            Mulai Opname Baru
          </button>
        )}
      </div>

      {isCreating && activeOpname ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[70vh]">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                <ClipboardList size={20} />
              </div>
              <div>
                <h3 className="font-black text-slate-900 uppercase tracking-tight">Opname Berjalan</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ID: {activeOpname.opnameId.slice(-8).toUpperCase()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Cari produk..." 
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button 
                onClick={handleFinalize}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-200"
              >
                <CheckCircle size={18} />
                Finalisasi
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                  <th className="px-6 py-4">Produk</th>
                  <th className="px-6 py-4 text-center">Ekspektasi</th>
                  <th className="px-6 py-4 text-center">Fisik (Input)</th>
                  <th className="px-6 py-4 text-right">Selisih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeOpname.items
                  .filter((item: any) => item.nameSnapshot.toLowerCase().includes(search.toLowerCase()))
                  .map((item: any) => {
                    const diff = item.physicalQty - item.expectedQty;
                    return (
                      <tr key={item.productId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 border border-slate-100">
                              <Package size={16} />
                            </div>
                            <span className="text-xs font-bold text-slate-900 uppercase truncate max-w-[200px]">{item.nameSnapshot}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-xs font-black text-slate-400 tabular-nums">{item.expectedQty}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <input 
                            type="number"
                            className={`w-24 px-3 py-2 border rounded-xl text-center text-xs font-black tabular-nums transition-all ${
                              diff === 0 ? 'bg-slate-50 border-slate-200' : diff > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-rose-50 border-rose-200 text-rose-600'
                            }`}
                            value={item.physicalQty}
                            onChange={(e) => handleUpdateQty(item.productId, Number(e.target.value))}
                          />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`text-xs font-black tabular-nums ${
                            diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {opnames?.map((op: StockOpnameType) => (
            <div 
              key={op.opnameId}
              onClick={() => {
                if (op.status === 'DRAFT') {
                  setActiveOpnameId(op.opnameId);
                  setIsCreating(true);
                }
              }}
              className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-6">
                <div className={`p-3 rounded-2xl ${op.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                  <ClipboardList size={24} />
                </div>
                <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${
                  op.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-blue-50 text-blue-600 border border-blue-100'
                }`}>
                  {op.status}
                </span>
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Stock Opname Session</p>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-4">
                {format(new Date(op.createdAt), 'dd MMMM yyyy')}
              </h3>
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                <div className="flex items-center gap-2">
                  <Package size={14} className="text-slate-400" />
                  <span className="text-xs font-bold text-slate-600">{op.items.length} SKU</span>
                </div>
                <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-all" />
              </div>
            </div>
          ))}
          {opnames?.length === 0 && (
            <div className="col-span-full py-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400">
              <ClipboardList size={48} className="mb-4 opacity-20" />
              <p className="text-sm font-bold uppercase tracking-widest">Belum ada riwayat opname</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
