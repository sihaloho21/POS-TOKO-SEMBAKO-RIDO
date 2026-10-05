import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { getMovementDelta, isMovementIn } from '@/core/services/stock-service';
import { History, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, RefreshCcw, Tag } from 'lucide-react';
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
      .toArray();
    
    // Sort descending by timestamp
    all.sort((a, b) => {
      const timeA = a.clientTimestamp || a.timestamp || a.createdAt || '';
      const timeB = b.clientTimestamp || b.timestamp || b.createdAt || '';
      return timeB.localeCompare(timeA);
    });

    // Calculate derived balance
    let currentBalance = 0;
    for (const m of all) {
      if (m.movementType) {
        currentBalance += getMovementDelta(m);
      } else if (m.quantity !== undefined) {
        currentBalance += m.quantity;
      }
    }
    
    return {
      items: all.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
      total: all.length,
      derivedBalance: Number(currentBalance.toFixed(4))
    };
  }, [productId, page]);

  if (!product || !movements) return null;

  const totalPages = Math.ceil(movements.total / ITEMS_PER_PAGE);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-sm">
            <History size={18} />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight">
              Stock Movement Ledger: {product.name}
            </h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Audit Trail Pergerakan Stok (Derived)
            </p>
          </div>
        </div>

        <div className="bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Saldo Derived:</span>
          <span className="text-sm font-black text-slate-900 tabular-nums">
            {movements.derivedBalance} {product.baseUnit}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
              <th className="px-6 py-3.5">Waktu</th>
              <th className="px-6 py-3.5">Tipe Movement</th>
              <th className="px-6 py-3.5">Alasan / Catatan</th>
              <th className="px-6 py-3.5 text-center">Perubahan (Delta)</th>
              <th className="px-6 py-3.5 text-right">Referensi & Terminal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {movements.items.map((m) => {
              const delta = m.movementType 
                ? getMovementDelta(m)
                : (m.quantity !== undefined ? m.quantity : 0);
              const isPositive = delta > 0;
              const displayTime = m.clientTimestamp || m.timestamp || m.createdAt || new Date().toISOString();

              return (
                <tr key={m.stockMovementId} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <p className="text-xs font-bold text-slate-900">
                      {format(new Date(displayTime), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </td>

                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider font-mono border ${
                      isPositive 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {m.movementType || (m.type === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT')}
                    </span>
                  </td>

                  <td className="px-6 py-3.5">
                    <p className="text-xs font-medium text-slate-800 line-clamp-1 max-w-xs" title={m.reason}>
                      {m.reason || '-'}
                    </p>
                  </td>

                  <td className="px-6 py-3.5 text-center whitespace-nowrap">
                    <div className={`inline-flex items-center justify-center gap-1 font-black tabular-nums text-xs ${
                      isPositive ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      <span>{isPositive ? `+${delta}` : delta}</span>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                        {m.unit || product.baseUnit}
                      </span>
                    </div>
                  </td>

                  <td className="px-6 py-3.5 text-right whitespace-nowrap">
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider truncate max-w-[130px] ml-auto" title={m.referenceId}>
                      {m.referenceId ? m.referenceId.slice(-10).toUpperCase() : '-'}
                    </p>
                    <span className="text-[9px] text-slate-400 font-mono">
                      {m.userId || 'SYS'} • {m.deviceId || 'LOCAL'}
                    </span>
                  </td>
                </tr>
              );
            })}

            {movements.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-300">
                    <RefreshCcw size={40} className="mb-2 opacity-20" />
                    <p className="text-xs font-black uppercase tracking-widest">Belum ada riwayat stock movement</p>
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
export default StockHistory;
