import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { History, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';

interface StockHistoryProps {
  productId: string;
}

const ITEMS_PER_PAGE = 10;

export function StockHistory({ productId }: StockHistoryProps) {
  const [page, setPage] = useState(1);

  const product = useLiveQuery(() => db.products.get(productId), [productId]);
  
  const movements = useLiveQuery(async () => {
    const all = await db.stockMovements
      .where('productId')
      .equals(productId)
      .reverse()
      .sortBy('timestamp');
    
    return {
      items: all.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
      total: all.length
    };
  }, [productId, page]);

  if (!product || !movements) return null;

  const totalPages = Math.ceil(movements.total / ITEMS_PER_PAGE);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
            <History size={16} />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Riwayat Stok: {product.name}</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stock Movement Ledger</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black">
              <th className="px-6 py-4">Waktu</th>
              <th className="px-6 py-4">Tipe / Alasan</th>
              <th className="px-6 py-4 text-center">Perubahan</th>
              <th className="px-6 py-4 text-right">Referensi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {movements.items.map((m) => (
              <tr key={m.stockMovementId} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <p className="text-xs font-bold text-slate-900">{format(new Date(m.timestamp), 'dd/MM/yyyy HH:mm')}</p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest ${
                      m.type === 'IN' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {m.type}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{m.reason}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className={`flex items-center justify-center gap-1 font-black tabular-nums ${
                    m.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {m.type === 'IN' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span className="text-sm">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span>
                    <span className="text-[10px] uppercase tracking-widest">{product.baseUnit}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[120px]" title={m.referenceId}>
                    {m.referenceId.slice(-8).toUpperCase()}
                  </p>
                </td>
              </tr>
            ))}
            {movements.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-300">
                    <RefreshCcw size={40} className="mb-2 opacity-20" />
                    <p className="text-xs font-black uppercase tracking-widest">Belum ada riwayat stok</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Halaman {page} dari {totalPages}
          </p>
          <div className="flex gap-2">
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-all shadow-sm"
            >
              <ChevronLeft size={16} />
            </button>
            <button 
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-all shadow-sm"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
