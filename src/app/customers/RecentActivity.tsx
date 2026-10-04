import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { format } from 'date-fns';
import { 
  ShoppingBag, 
  ArrowRight,
  Calendar,
  Wallet,
  CheckCircle2
} from 'lucide-react';

interface RecentActivityProps {
  customerId: string;
}

export function RecentActivity({ customerId }: RecentActivityProps) {
  const transactions = useLiveQuery(
    () => db.transactions
      .where('customerId')
      .equals(customerId)
      .reverse()
      .limit(10)
      .toArray()
  , [customerId]);

  if (!transactions) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Aktivitas Transaksi Terakhir</h4>
      </div>
      
      {transactions.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-100">
          <ShoppingBag size={32} className="mx-auto text-slate-200 mb-2" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Belum ada riwayat transaksi</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {transactions.map(tx => (
            <div key={tx.transactionId} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 hover:border-blue-200 transition-all group">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tx.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                  <ShoppingBag size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black text-slate-900 tracking-tight">{tx.receiptNumber}</p>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest ${
                      tx.type === 'SALE' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {tx.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      <Calendar size={12} />
                      {format(new Date(tx.clientTimestamp), 'dd MMM yyyy, HH:mm')}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <Wallet size={12} />
                      {tx.paymentMethodId}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-slate-900 tabular-nums">Rp {tx.total.toLocaleString()}</p>
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest flex items-center justify-end gap-1">
                  <CheckCircle2 size={10} />
                  {tx.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
