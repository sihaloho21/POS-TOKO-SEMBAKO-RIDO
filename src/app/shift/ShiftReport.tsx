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
  FileText
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

  const totalRevenue = transactions.reduce((acc, tx) => acc + tx.total, 0);
  const totalItems = transactions.reduce((acc, tx) => 
    acc + tx.items.reduce((sum, item) => sum + item.quantity, 0)
  , 0);
  
  const paymentBreakdown = transactions.reduce((acc, tx) => {
    acc[tx.paymentMethodId] = (acc[tx.paymentMethodId] || 0) + tx.total;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 uppercase tracking-tight">Ringkasan Laporan Shift</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ID SHIFT: {shiftId.slice(-8).toUpperCase()}</p>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${shift.status === 'CLOSED' ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700 animate-pulse'}`}>
            {shift.status}
          </div>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3">
              <User size={18} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-600 uppercase">Kasir Bertugas</span>
            </div>
            <span className="text-sm font-black text-slate-900 uppercase">{cashier?.name || 'Unknown'}</span>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3">
              <Clock size={18} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-600 uppercase">Durasi Sesi</span>
            </div>
            <span className="text-xs font-black text-slate-900 uppercase">
              {format(new Date(shift.startTime), 'HH:mm')} - {shift.endTime ? format(new Date(shift.endTime), 'HH:mm') : 'NOW'}
            </span>
          </div>

          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
            <div className="flex items-center gap-2 mb-3 text-indigo-700">
              <TrendingUp size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Ringkasan Pendapatan</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-xs font-bold text-slate-500 uppercase">Total Penjualan</span>
                <span className="text-xl font-black text-slate-900 tabular-nums">Rp {totalRevenue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-400 uppercase">Jumlah Transaksi</span>
                <span className="font-black text-slate-700">{transactions.length}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
            <div className="flex items-center gap-2 mb-3 text-emerald-700">
              <Package size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Statistik Produk</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-xs font-bold text-slate-500 uppercase">Produk Terjual</span>
              <span className="text-xl font-black text-slate-900 tabular-nums">{totalItems} <span className="text-[10px] text-slate-400">Unit</span></span>
            </div>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-2xl">
            <div className="flex items-center gap-2 mb-3 text-slate-500">
              <ShoppingCart size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Metode Pembayaran</span>
            </div>
            <div className="space-y-2">
              {Object.entries(paymentBreakdown).map(([method, amount]) => (
                <div key={method} className="flex justify-between text-xs">
                  <span className="font-bold text-slate-400 uppercase">{method}</span>
                  <span className="font-black text-slate-700 tabular-nums">Rp {amount.toLocaleString()}</span>
                </div>
              ))}
              {Object.keys(paymentBreakdown).length === 0 && (
                <p className="text-[10px] text-slate-400 italic">Belum ada transaksi</p>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {shift.notes && (
        <div className="px-6 pb-6">
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
            <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest block mb-1">Catatan Shift</span>
            <p className="text-xs text-amber-900 italic">"{shift.notes}"</p>
          </div>
        </div>
      )}
    </div>
  );
}
