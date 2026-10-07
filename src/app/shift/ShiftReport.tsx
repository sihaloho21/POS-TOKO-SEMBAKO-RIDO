import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { CashierShift, Transaction } from '@/core/types';
import { 
  TrendingUp, 
  ShoppingCart, 
  Package, 
  Clock, 
  User, 
  Receipt,
  FileText,
  Banknote,
  MinusCircle,
  PlusCircle,
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import { format } from 'date-fns';

interface ShiftReportProps {
  shiftId: string;
}

export default function ShiftReport({ shiftId }: ShiftReportProps) {
  const shift = useLiveQuery(() => db.shifts.get(shiftId), [shiftId]);
  
  const transactions = useLiveQuery(async () => {
    return db.transactions
      .where('shiftId')
      .equals(shiftId)
      .filter(tx => tx.status === 'COMPLETED')
      .toArray();
  }, [shiftId]);

  const cashier = useLiveQuery(async () => {
    if (!shift) return undefined;
    return db.users.get(shift.userId);
  }, [shift?.userId]);

  if (!shift || !transactions) return (
    <div className="bg-white rounded-3xl border border-slate-200 p-8 flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-2">
        <div className="w-10 h-10 bg-slate-100 rounded-xl" />
        <div className="h-4 w-32 bg-slate-100 rounded" />
      </div>
    </div>
  );

  const totalRevenue = shift.totalSales !== undefined 
    ? shift.totalSales 
    : transactions.reduce((acc, tx) => acc + (tx.total || 0), 0);

  const totalItems = transactions.reduce((acc, tx) => 
    acc + tx.items.reduce((sum, item) => sum + item.quantity, 0)
  , 0);
  
  const paymentBreakdown = shift.paymentBreakdown || transactions.reduce((acc, tx) => {
    const m = (tx.paymentMethodId || 'CASH').toUpperCase();
    acc[m] = (acc[m] || 0) + (tx.total || 0);
    return acc;
  }, {} as Record<string, number>);

  const cashIn = shift.cashIn ?? (shift.startingCash + (paymentBreakdown['CASH'] || 0));
  const cashOut = shift.cashOut ?? 0;
  const expectedCash = shift.expectedCash ?? (shift.startingCash + (paymentBreakdown['CASH'] || 0) - cashOut);
  const actualCash = shift.actualCash;
  const discrepancy = shift.discrepancy ?? (actualCash !== undefined ? actualCash - expectedCash : undefined);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 uppercase tracking-tight">Ringkasan Laporan Shift Kasir</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <span>ID: {shiftId.slice(-8).toUpperCase()}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Smartphone size={11} /> {shift.deviceId}</span>
              </p>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
            shift.status === 'CLOSED' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700 animate-pulse'
          }`}>
            {shift.status}
          </div>
        </div>
      </div>

      {/* 8 Closing Metrics Grid */}
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              Jumlah Transaksi
            </span>
            <p className="text-xl font-black text-slate-900 tabular-nums">
              {shift.totalTransactionCount ?? transactions.length}
            </p>
            <span className="text-[10px] font-bold text-slate-400">Total struk</span>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block mb-1">
              Omzet Penjualan
            </span>
            <p className="text-xl font-black text-blue-900 tabular-nums">
              Rp {totalRevenue.toLocaleString()}
            </p>
            <span className="text-[10px] font-bold text-blue-500">Gross revenue</span>
          </div>

          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block mb-1">
              Cash In (Masuk)
            </span>
            <p className="text-xl font-black text-emerald-900 tabular-nums">
              Rp {cashIn.toLocaleString()}
            </p>
            <span className="text-[10px] font-bold text-emerald-600">Modal + Kas Masuk</span>
          </div>

          <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 block mb-1">
              Cash Out (Keluar)
            </span>
            <p className="text-xl font-black text-rose-900 tabular-nums">
              Rp {cashOut.toLocaleString()}
            </p>
            <span className="text-[10px] font-bold text-rose-500">Pengeluaran laci</span>
          </div>
        </div>

        {/* Expected vs Actual & Discrepancy */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
              Expected Cash (Seharusnya)
            </span>
            <p className="text-2xl font-black text-slate-900 tabular-nums">
              Rp {expectedCash.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400 font-medium">Uang kas seharusnya di laci</span>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
              Actual Cash Input (Fisik)
            </span>
            <p className="text-2xl font-black text-slate-900 tabular-nums">
              {actualCash !== undefined ? `Rp ${actualCash.toLocaleString()}` : 'Belum Input'}
            </p>
            <span className="text-[10px] text-slate-400 font-medium">Hitungan uang fisik kasir</span>
          </div>

          <div className={`p-4 rounded-2xl border ${
            discrepancy === undefined
              ? 'bg-slate-50 border-slate-200 text-slate-600'
              : discrepancy === 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : discrepancy > 0
              ? 'bg-blue-50 border-blue-200 text-blue-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <span className="text-[10px] font-black uppercase tracking-wider block mb-1 opacity-75">
              Selisih Kas (Discrepancy)
            </span>
            <p className="text-2xl font-black tabular-nums">
              {discrepancy === undefined
                ? '-'
                : discrepancy === 0
                ? '✓ Pas (Rp 0)'
                : `${discrepancy > 0 ? '+Rp ' : '-Rp '}${Math.abs(discrepancy).toLocaleString()}`}
            </p>
            <span className="text-[10px] font-bold">
              {discrepancy === undefined
                ? 'Sesi masih aktif'
                : discrepancy === 0
                ? 'Kas Sesuai'
                : discrepancy > 0
                ? 'Surplus (Lebih Kasir)'
                : 'Defisit (Kurang Kasir)'}
            </span>
          </div>
        </div>

        {/* Discrepancy Reason & Owner Approval Details */}
        {shift.discrepancyReason && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-600" />
                Alasan Selisih Kasir:
              </span>
              {shift.discrepancyApprovedBy && (
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded flex items-center gap-1">
                  <ShieldCheck size={12} />
                  Disetujui Owner: {shift.discrepancyApprovedBy}
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-amber-950 italic">
              "{shift.discrepancyReason}"
            </p>
            {shift.reconciliationEventId && (
              <p className="text-[10px] text-slate-500 font-mono">
                Event Rekonsiliasi: {shift.reconciliationEventId} (Tidak mengubah ledger transaksi langsung)
              </p>
            )}
          </div>
        )}

        {/* Two Columns: Cashier/Time Info & Payment Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-3">
                <User size={18} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-600 uppercase">Kasir Bertugas</span>
              </div>
              <span className="text-sm font-black text-slate-900 uppercase">{cashier?.name || shift.userId}</span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-3">
                <Clock size={18} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-600 uppercase">Waktu Shift</span>
              </div>
              <span className="text-xs font-black text-slate-900 uppercase">
                {format(new Date(shift.startTime), 'dd/MM HH:mm')} - {shift.endTime ? format(new Date(shift.endTime), 'HH:mm') : 'AKTIF'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-3">
                <Package size={18} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-600 uppercase">Produk Terjual</span>
              </div>
              <span className="text-sm font-black text-slate-900 tabular-nums">{totalItems} Unit</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-slate-600">
              <ShoppingCart size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Rincian Metode Pembayaran</span>
            </div>
            <div className="space-y-2">
              {Object.entries(paymentBreakdown).map(([method, amount]) => (
                <div key={method} className="flex justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                  <span className="font-bold text-slate-500 uppercase">{method}</span>
                  <span className="font-black text-slate-900 tabular-nums">Rp {amount.toLocaleString()}</span>
                </div>
              ))}
              {Object.keys(paymentBreakdown).length === 0 && (
                <p className="text-[10px] text-slate-400 italic">Belum ada transaksi</p>
              )}
            </div>
          </div>
        </div>

        {shift.notes && (
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Catatan Shift:</span>
            <p className="text-xs text-slate-700 italic">"{shift.notes}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
