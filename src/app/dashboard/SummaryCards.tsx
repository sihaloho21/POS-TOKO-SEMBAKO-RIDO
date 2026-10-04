import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { 
  ShoppingCart, 
  AlertCircle, 
  History, 
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

function StatCard({ label, value, subtext, icon, color, trend }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-2xl ${color} bg-opacity-10 ${color.replace('text', 'bg')}`}>
          {icon}
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ${trend >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-900 tabular-nums">{value}</p>
      {subtext && <p className="text-[10px] font-bold text-slate-400 mt-1">{subtext}</p>}
    </div>
  );
}

export function SummaryCards() {
  const stats = useLiveQuery(async () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // 1. Total Sales Today
    const todayTxs = await db.transactions
      .where('status')
      .equals('COMPLETED')
      .filter(tx => tx.clientTimestamp.startsWith(today))
      .toArray();
    const totalSalesToday = todayTxs.reduce((acc, tx) => acc + tx.total, 0);

    // 2. Low Stock Items
    const lowStockCount = await db.products
      .filter(p => p.status === 'ACTIVE' && p.stock <= p.minimumStock)
      .count();

    // 3. Active Shift Balance
    const activeShift = await db.shifts.where('status').equals('OPEN').first();
    let shiftBalance = 0;
    if (activeShift) {
      const shiftTxs = await db.transactions
        .where('shiftId')
        .equals(activeShift.shiftId)
        .filter(tx => tx.status === 'COMPLETED' && tx.paymentMethodId === 'CASH')
        .toArray();
      const txTotal = shiftTxs.reduce((acc, tx) => acc + tx.total, 0);
      shiftBalance = activeShift.startingCash + txTotal;
    }

    // 4. Pending Sync Tasks
    const pendingSyncCount = await db.syncQueue
      .filter(item => item.status === 'PENDING' || item.status === 'FAILED')
      .count();

    return {
      totalSalesToday,
      lowStockCount,
      shiftBalance,
      pendingSyncCount
    };
  });

  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard 
        label="Penjualan Hari Ini" 
        value={`Rp ${stats.totalSalesToday.toLocaleString()}`} 
        subtext="Total transaksi sukses"
        icon={<ShoppingCart size={24} />} 
        color="text-blue-600" 
      />
      <StatCard 
        label="Stok Menipis" 
        value={stats.lowStockCount} 
        subtext="Produk butuh restock"
        icon={<AlertCircle size={24} />} 
        color="text-rose-600" 
      />
      <StatCard 
        label="Saldo Shift Aktif" 
        value={`Rp ${stats.shiftBalance.toLocaleString()}`} 
        subtext="Estimasi kas di laci"
        icon={<History size={24} />} 
        color="text-emerald-600" 
      />
      <StatCard 
        label="Pending Sync" 
        value={stats.pendingSyncCount} 
        subtext="Data mengantri ke cloud"
        icon={<RefreshCw size={24} />} 
        color="text-amber-600" 
      />
    </div>
  );
}
