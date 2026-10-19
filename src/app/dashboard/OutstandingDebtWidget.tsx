import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { 
  CreditCard, 
  AlertTriangle, 
  Users, 
  Receipt, 
  Clock, 
  ArrowRight, 
  ShieldAlert,
  CheckCircle2
} from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface OutstandingDebtWidgetProps {
  onNavigate?: (tab: string) => void;
  role?: 'OWNER' | 'KASIR';
  className?: string;
  shiftCreditSales?: number;
}

export function OutstandingDebtWidget({
  onNavigate,
  role = 'OWNER',
  className = '',
  shiftCreditSales
}: OutstandingDebtWidgetProps) {
  const receivables = useLiveQuery(() => db.receivables.toArray());
  const customers = useLiveQuery(() => db.customers.toArray());

  const stats = useMemo(() => {
    if (!receivables) {
      return {
        totalOutstanding: 0,
        totalCollected: 0,
        totalOriginalAmount: 0,
        activeInvoicesCount: 0,
        activeDebtorCount: 0,
        overdueCount: 0,
        overdueAmount: 0,
        topDebtors: []
      };
    }

    const now = new Date();
    let totalOutstanding = 0;
    let totalCollected = 0;
    let totalOriginalAmount = 0;
    let activeInvoicesCount = 0;
    let overdueCount = 0;
    let overdueAmount = 0;

    const debtorMap = new Map<string, number>();

    receivables.forEach(r => {
      totalCollected += Number(r.paidAmount || 0);
      totalOriginalAmount += Number(r.totalAmount || 0);

      const rem = Number(r.remainingAmount || 0);
      if (rem > 0 && r.status !== 'PAID' && r.status !== 'VOIDED') {
        totalOutstanding += rem;
        activeInvoicesCount++;

        // Track debtor amounts
        const currentDebtorAmt = debtorMap.get(r.customerId) || 0;
        debtorMap.set(r.customerId, currentDebtorAmt + rem);

        // Check if overdue
        const dueDate = new Date(r.dueDate);
        if (dueDate < now && differenceInDays(now, dueDate) >= 1) {
          overdueCount++;
          overdueAmount += rem;
        }
      }
    });

    // Top debtors list
    const customerNameMap = new Map<string, string>();
    customers?.forEach(c => customerNameMap.set(c.customerId, c.name));

    const topDebtors = Array.from(debtorMap.entries())
      .map(([customerId, amount]) => ({
        customerId,
        name: customerNameMap.get(customerId) || 'Pelanggan',
        amount
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    return {
      totalOutstanding,
      totalCollected,
      totalOriginalAmount,
      activeInvoicesCount,
      activeDebtorCount: debtorMap.size,
      overdueCount,
      overdueAmount,
      topDebtors
    };
  }, [receivables, customers]);

  const collectionRate = stats.totalOriginalAmount > 0 
    ? Math.round((stats.totalCollected / stats.totalOriginalAmount) * 100) 
    : 100;

  return (
    <div className={`bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${className}`}>
      <div>
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <CreditCard size={20} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                Total Piutang Berjalan
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Total Outstanding Debt & Credit Exposure
              </p>
            </div>
          </div>

          {stats.overdueCount > 0 ? (
            <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200/60 flex items-center gap-1 animate-pulse">
              <AlertTriangle size={12} />
              {stats.overdueCount} Overdue
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center gap-1">
              <CheckCircle2 size={12} />
              Lancar
            </span>
          )}
        </div>

        {/* Main Nominal */}
        <div className="mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
            Total Sisa Tagihan (Belum Lunas)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 tabular-nums tracking-tight">
              Rp {stats.totalOutstanding.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Dari total <strong className="text-slate-800">{stats.activeInvoicesCount} nota tempo</strong> yang belum diselesaikan.
          </p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider">Debitur Aktif</span>
              <Users size={14} className="text-blue-500" />
            </div>
            <span className="text-lg font-black text-slate-800 tabular-nums block">
              {stats.activeDebtorCount}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Pelanggan berutang</span>
          </div>

          <div className={`p-3 rounded-2xl border ${
            stats.overdueAmount > 0 
              ? 'bg-rose-50/70 border-rose-100 text-rose-900' 
              : 'bg-slate-50 border-slate-100 text-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Jatuh Tempo</span>
              <Clock size={14} className={stats.overdueAmount > 0 ? 'text-rose-500' : 'text-slate-400'} />
            </div>
            <span className={`text-lg font-black tabular-nums block truncate ${stats.overdueAmount > 0 ? 'text-rose-700' : 'text-slate-800'}`}>
              Rp {stats.overdueAmount.toLocaleString()}
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              {stats.overdueCount > 0 ? `${stats.overdueCount} nota lewat tempo` : '0 nota overdue'}
            </span>
          </div>
        </div>

        {/* Shift Specific Context (If displayed in Kasir or when shift credit sales are provided) */}
        {shiftCreditSales !== undefined && shiftCreditSales > 0 && (
          <div className="mb-4 p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-xs flex justify-between items-center text-amber-900">
            <span className="font-bold">Tempo Shift Ini:</span>
            <span className="font-black tabular-nums text-amber-800">
              +Rp {shiftCreditSales.toLocaleString()}
            </span>
          </div>
        )}

        {/* Top Debtors Peek (if any) */}
        {stats.topDebtors.length > 0 && (
          <div className="space-y-1.5 mb-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Top Debitur Terbesar:
            </span>
            {stats.topDebtors.map((d, i) => (
              <div key={i} className="flex justify-between items-center text-xs p-2 bg-slate-50/80 rounded-xl">
                <span className="font-bold text-slate-700 truncate max-w-[140px]">{d.name}</span>
                <span className="font-black text-slate-900 tabular-nums">
                  Rp {d.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Navigation / Advisory */}
      <div className="pt-3 border-t border-slate-100">
        {role === 'OWNER' ? (
          <button
            onClick={() => onNavigate?.('receivables')}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            <span>Buka Manajemen Piutang</span>
            <ArrowRight size={14} />
          </button>
        ) : (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <ShieldAlert size={15} className="text-amber-500 shrink-0" />
            <span>Pastikan cek limit kredit pelanggan sebelum memilih tempo.</span>
          </div>
        )}
      </div>
    </div>
  );
}
