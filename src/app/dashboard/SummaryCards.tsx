import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { 
  ShoppingCart, 
  AlertCircle, 
  History, 
  RefreshCw,
  TrendingUp,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  AlertTriangle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';
import { subDays, startOfDay, format, eachDayOfInterval, differenceInDays } from 'date-fns';

function SparklineCard({ label, value, subtext, icon, color, data, type = 'area' }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col h-full">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-2xl ${color} bg-opacity-10 ${color.replace('text', 'bg')}`}>
          {icon}
        </div>
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-2xl font-black text-slate-900 tabular-nums">{value}</p>
        {subtext && <p className="text-[10px] font-bold text-slate-400 mt-1">{subtext}</p>}
      </div>
      
      <div className="h-16 w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'area' ? (
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`color-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color.includes('blue') ? '#3b82f6' : '#10b981'} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={color.includes('blue') ? '#3b82f6' : '#10b981'} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={color.includes('blue') ? '#3b82f6' : '#10b981'} 
                strokeWidth={2} 
                fillOpacity={1} 
                fill={`url(#color-${label})`} 
              />
            </AreaChart>
          ) : (
            <BarChart data={data}>
              <Bar 
                dataKey="value" 
                fill={color.includes('amber') ? '#f59e0b' : '#8b5cf6'} 
                radius={[4, 4, 0, 0]} 
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function SummaryCards({ onTabChange }: { onTabChange?: (tab: string) => void } = {}) {
  const stats = useLiveQuery(async () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // 1. Weekly Trend Data
    const last7Days = eachDayOfInterval({
      start: subDays(now, 6),
      end: now
    });

    const transactions = await db.transactions
      .where('status')
      .equals('COMPLETED')
      .toArray();

    const revenueTrend = last7Days.map(date => {
      const d = date.toISOString().split('T')[0];
      const dayTxs = transactions.filter(tx => tx.clientTimestamp.startsWith(d));
      return {
        name: format(date, 'EEE'),
        value: dayTxs.reduce((sum, tx) => sum + tx.total, 0)
      };
    });

    const volumeTrend = last7Days.map(date => {
      const d = date.toISOString().split('T')[0];
      const dayTxs = transactions.filter(tx => tx.clientTimestamp.startsWith(d));
      return {
        name: format(date, 'EEE'),
        value: dayTxs.length
      };
    });

    // 2. Current Stats
    const totalSalesToday = revenueTrend[revenueTrend.length - 1].value;
    const todayVolume = volumeTrend[volumeTrend.length - 1].value;

    // 3. Low Stock Items
    const lowStockCount = await db.products
      .filter(p => p.status === 'ACTIVE' && p.stock <= p.minimumStock)
      .count();

    // 4. Top Selling Item Today
    const todayTxs = transactions.filter(tx => tx.clientTimestamp.startsWith(today));
    const itemSales: Record<string, { name: string; count: number }> = {};
    todayTxs.forEach(tx => {
      tx.items.forEach(item => {
        if (!itemSales[item.productId]) {
          itemSales[item.productId] = { name: item.nameSnapshot, count: 0 };
        }
        itemSales[item.productId].count += item.quantity;
      });
    });

    const topItem = Object.values(itemSales).sort((a, b) => b.count - a.count)[0];

    // 5. Total Outstanding Debt (Total Piutang)
    const receivables = await db.receivables.toArray();
    let totalOutstandingDebt = 0;
    let activeReceivablesCount = 0;
    let overdueDebtCount = 0;
    let overdueDebtAmount = 0;
    const nowTime = new Date();

    receivables.forEach(r => {
      const rem = Number(r.remainingAmount || 0);
      if (rem > 0 && r.status !== 'PAID' && r.status !== 'VOIDED') {
        totalOutstandingDebt += rem;
        activeReceivablesCount++;
        const due = new Date(r.dueDate);
        if (due < nowTime && differenceInDays(nowTime, due) >= 1) {
          overdueDebtCount++;
          overdueDebtAmount += rem;
        }
      }
    });

    return {
      totalSalesToday,
      todayVolume,
      lowStockCount,
      revenueTrend,
      volumeTrend,
      topItemName: topItem?.name || 'Belum Ada',
      topItemVolume: topItem?.count || 0,
      totalOutstandingDebt,
      activeReceivablesCount,
      overdueDebtCount,
      overdueDebtAmount
    };
  });

  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
      <SparklineCard 
        label="Penjualan Hari Ini" 
        value={`Rp ${stats.totalSalesToday.toLocaleString()}`} 
        subtext="7 Hari Terakhir"
        icon={<TrendingUp size={24} />} 
        color="text-blue-600"
        data={stats.revenueTrend}
        type="area"
      />
      <SparklineCard 
        label="Volume Transaksi" 
        value={`${stats.todayVolume} Trx`} 
        subtext="Frekuensi Penjualan"
        icon={<ShoppingCart size={24} />} 
        color="text-emerald-600"
        data={stats.volumeTrend}
        type="bar"
      />

      {/* Total Outstanding Debt (Total Piutang) Summary Card */}
      <div 
        onClick={() => onTabChange?.('receivables')}
        className={`bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${onTabChange ? 'cursor-pointer hover:border-amber-300' : ''}`}
      >
        <div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600">
              <CreditCard size={24} />
            </div>
            <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${
              stats.overdueDebtCount > 0 
                ? 'bg-rose-50 text-rose-700 border border-rose-200/50' 
                : 'bg-amber-50 text-amber-700'
            }`}>
              {stats.overdueDebtCount > 0 ? `${stats.overdueDebtCount} Overdue` : 'Exposure'}
            </div>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            Total Piutang (Debt)
          </p>
          <p className="text-xl font-black text-slate-900 tabular-nums truncate">
            Rp {stats.totalOutstandingDebt.toLocaleString()}
          </p>
          <p className="text-[10px] font-bold text-slate-400 mt-1">
            {stats.activeReceivablesCount} Nota Tempo Aktif
          </p>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
          {stats.overdueDebtAmount > 0 ? (
            <span className="text-rose-600 flex items-center gap-1">
              <AlertTriangle size={13} />
              Rp {stats.overdueDebtAmount.toLocaleString()} Lewat Tempo
            </span>
          ) : (
            <span className="text-amber-600 flex items-center gap-1">
              <ArrowUpRight size={13} />
              Kredit Terkontrol
            </span>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-2xl bg-amber-50 text-amber-600">
              <Package size={24} />
            </div>
            <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-1 rounded-lg">
              Top Seller
            </div>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Produk Terlaris Hari Ini</p>
          <p className="text-lg font-black text-slate-900 truncate" title={stats.topItemName}>{stats.topItemName}</p>
          <p className="text-[10px] font-bold text-slate-400 mt-1">{stats.topItemVolume} Unit Terjual</p>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-50">
          <div className="flex items-center gap-2 text-emerald-500 font-bold text-[10px] uppercase tracking-widest">
            <ArrowUpRight size={14} /> High Demand
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-2xl bg-rose-50 text-rose-600">
              <AlertCircle size={24} />
            </div>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Stok Menipis</p>
          <p className="text-2xl font-black text-slate-900 tabular-nums">{stats.lowStockCount}</p>
          <p className="text-[10px] font-bold text-slate-400 mt-1">Produk Butuh Restock</p>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-50">
          <div className="flex items-center gap-2 text-rose-500 font-bold text-[10px] uppercase tracking-widest">
            <RefreshCw size={14} className="animate-spin-slow" /> Perlu Tindakan
          </div>
        </div>
      </div>
    </div>
  );
}
