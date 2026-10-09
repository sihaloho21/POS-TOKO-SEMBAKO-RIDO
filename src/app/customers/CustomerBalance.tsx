import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { CreditCard, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';

interface CustomerBalanceProps {
  customerId: string;
}

export function CustomerBalance({ customerId }: CustomerBalanceProps) {
  const customer = useLiveQuery(() => db.customers.get(customerId), [customerId]);
  const activeReceivables = useLiveQuery(
    () => db.receivables
      .where('customerId')
      .equals(customerId)
      .filter(r => r.status === 'OPEN' || r.status === 'PARTIAL' || r.status === 'OVERDUE')
      .toArray(),
    [customerId]
  );

  if (!customer || !activeReceivables) return null;

  const totalDebt = activeReceivables.reduce((acc, r) => acc + r.remainingAmount, 0);
  const remainingLimit = customer.creditLimit - totalDebt;
  const usagePercentage = customer.creditLimit > 0 ? (totalDebt / customer.creditLimit) * 100 : (totalDebt > 0 ? 100 : 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status Piutang</h4>
          <TrendingUp size={16} className="text-blue-500" />
        </div>
        
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Hutang</p>
            <p className={`text-2xl font-black ${totalDebt > 0 ? 'text-rose-600' : 'text-slate-900'} tabular-nums`}>
              Rp {totalDebt.toLocaleString()}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Penggunaan Limit</span>
              <span className={`text-[10px] font-black uppercase ${usagePercentage > 90 ? 'text-rose-600' : 'text-slate-500'}`}>
                {usagePercentage.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${
                  usagePercentage > 90 ? 'bg-rose-500' : usagePercentage > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, usagePercentage)}%` }}
              />
            </div>
            <p className="text-[10px] font-bold text-slate-500 text-right">
              Sisa Limit: Rp {remainingLimit.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Ringkasan Kredit</h4>
          <CreditCard size={16} className="text-slate-400" />
        </div>
        
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-slate-200">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Limit Kredit</span>
            <span className="text-xs font-black text-slate-900">Rp {customer.creditLimit.toLocaleString()}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-200">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nota Terbuka</span>
            <span className="text-xs font-black text-slate-900">{activeReceivables.length} Nota</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Jatuh Tempo</span>
            <span className="text-xs font-black text-amber-600">
              {activeReceivables.some(r => r.status === 'OVERDUE') ? 'ADA TERTUNGGAK' : 'LANCAR'}
            </span>
          </div>
        </div>

        {totalDebt > 0 && (
          <div className="mt-4 p-3 bg-white rounded-xl border border-amber-100 flex items-center gap-3">
            <AlertTriangle size={16} className="text-amber-500" />
            <p className="text-[10px] font-bold text-amber-800 leading-tight">
              Pelanggan memiliki hutang aktif. Pastikan verifikasi limit sebelum transaksi Gajian berikutnya.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
