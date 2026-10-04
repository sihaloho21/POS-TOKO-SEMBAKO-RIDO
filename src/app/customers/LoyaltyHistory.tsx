import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { LoyaltyEngine } from '@/core/loyalty-engine';
import { format } from 'date-fns';
import { Trophy, ArrowUpRight, ArrowDownRight, RefreshCcw } from 'lucide-react';

interface LoyaltyHistoryProps {
  customerId: string;
}

export function LoyaltyHistory({ customerId }: LoyaltyHistoryProps) {
  const history = useLiveQuery(() => LoyaltyEngine.getHistory(customerId), [customerId]);

  if (!history) return null;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
        <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center">
          <Trophy size={16} />
        </div>
        <div>
          <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Riwayat Poin Loyalty</h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loyalty Points Ledger</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
              <th className="px-6 py-4">Waktu</th>
              <th className="px-6 py-4">Tipe</th>
              <th className="px-6 py-4 text-center">Poin</th>
              <th className="px-6 py-4 text-right">Referensi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {history.map((h) => (
              <tr key={h.loyaltyEventId} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <p className="text-xs font-bold text-slate-900">{format(new Date(h.timestamp), 'dd/MM/yyyy HH:mm')}</p>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest ${
                    h.type === 'EARN' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}>
                    {h.type}
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className={`flex items-center justify-center gap-1 font-black tabular-nums ${
                    h.type === 'EARN' ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {h.type === 'EARN' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span className="text-sm">{h.points > 0 ? `+${h.points}` : h.points}</span>
                    <span className="text-[10px] uppercase tracking-widest">Pts</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[120px]">
                    {h.referenceId.slice(-8).toUpperCase()}
                  </p>
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-300">
                    <RefreshCcw size={40} className="mb-2 opacity-20" />
                    <p className="text-xs font-black uppercase tracking-widest">Belum ada riwayat poin</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
