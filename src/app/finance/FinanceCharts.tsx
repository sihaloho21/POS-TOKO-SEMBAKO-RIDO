import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { 
  TrendingUp, 
  PieChart as PieIcon, 
  Calendar, 
  DollarSign, 
  ShoppingBag,
  ArrowUpRight,
  Sparkles,
  Info
} from 'lucide-react';
import { 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  format, 
  isWithinInterval, 
  parseISO 
} from 'date-fns';

const CATEGORY_COLORS: Record<string, string> = {
  SEMBAKO: '#2563eb',       // Blue 600
  FISH: '#059669',          // Emerald 600
  DIGITAL: '#7c3aed',       // Violet 600
  SIDE_PRODUCT: '#d97706',  // Amber 600
  BUNDLE: '#e11d48',        // Rose 600
  PACKAGE: '#0891b2',       // Cyan 600
  LAINNYA: '#64748b',       // Slate 500
};

const CATEGORY_NAMES: Record<string, string> = {
  SEMBAKO: 'Sembako & Beras',
  FISH: 'Ikan Hidup Konsumsi',
  DIGITAL: 'Layanan Digital & Pulsa',
  SIDE_PRODUCT: 'Produk Sampingan',
  BUNDLE: 'Paket Bundle',
  PACKAGE: 'Paket Sembako',
  LAINNYA: 'Kategori Lain',
};

const DAY_NAMES_ID: Record<string, string> = {
  Mon: 'Sen',
  Tue: 'Sel',
  Wed: 'Rab',
  Thu: 'Kam',
  Fri: 'Jum',
  Sat: 'Sab',
  Sun: 'Min'
};

const FULL_DAY_NAMES_ID: Record<string, string> = {
  Mon: 'Senin',
  Tue: 'Selasa',
  Wed: 'Rabu',
  Thu: 'Kamis',
  Fri: 'Jumat',
  Sat: 'Sabtu',
  Sun: 'Minggu'
};

export default function FinanceCharts() {
  const [metricView, setMetricView] = useState<'revenue' | 'volume'>('revenue');

  // Query completed transactions and products
  const transactions = useLiveQuery(() => 
    db.transactions
      .filter(tx => tx.status === 'COMPLETED')
      .toArray()
  );

  const products = useLiveQuery(() => db.products.toArray());

  // Compute Current Week Boundaries (Monday to Sunday)
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  // Map product ID to product type/category
  const productMap = useMemo(() => {
    const map = new Map<string, { type: string; name: string }>();
    if (products) {
      for (const p of products) {
        map.set(p.productId, {
          type: p.productType || 'SEMBAKO',
          name: p.name
        });
      }
    }
    return map;
  }, [products]);

  // Aggregate daily revenue and category distribution for current week
  const {
    dailyData,
    categoryData,
    totalWeekRevenue,
    totalWeekOrders,
    peakDay,
    topCategory
  } = useMemo(() => {
    const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });
    
    // Initialize day buckets
    const dayMap = new Map<string, { dateStr: string; label: string; fullLabel: string; revenue: number; orders: number }>();
    for (const d of daysInWeek) {
      const dateKey = format(d, 'yyyy-MM-dd');
      const dayShort = format(d, 'EEE');
      dayMap.set(dateKey, {
        dateStr: dateKey,
        label: DAY_NAMES_ID[dayShort] || dayShort,
        fullLabel: `${FULL_DAY_NAMES_ID[dayShort] || dayShort}, ${format(d, 'dd MMM')}`,
        revenue: 0,
        orders: 0
      });
    }

    // Category revenue accumulator
    const categoryTotals: Record<string, number> = {
      SEMBAKO: 0,
      FISH: 0,
      DIGITAL: 0,
      SIDE_PRODUCT: 0,
      BUNDLE: 0,
      PACKAGE: 0,
    };

    let totalRev = 0;
    let totalOrd = 0;

    if (transactions && transactions.length > 0) {
      for (const tx of transactions) {
        const txDate = tx.clientTimestamp ? parseISO(tx.clientTimestamp) : null;
        if (!txDate) continue;

        if (isWithinInterval(txDate, { start: weekStart, end: weekEnd })) {
          const dateKey = format(txDate, 'yyyy-MM-dd');
          const dayEntry = dayMap.get(dateKey);
          if (dayEntry) {
            dayEntry.revenue += Number(tx.total || 0);
            dayEntry.orders += 1;
          }

          totalRev += Number(tx.total || 0);
          totalOrd += 1;

          // Categorize items
          if (tx.items && tx.items.length > 0) {
            for (const item of tx.items) {
              const prod = productMap.get(item.productId);
              const pType = prod?.type || 'SEMBAKO';
              const itemTotal = Number(item.subtotal || item.netPrice * item.quantity || 0);
              categoryTotals[pType] = (categoryTotals[pType] || 0) + itemTotal;
            }
          } else {
            // Default allocation if no line items
            categoryTotals.SEMBAKO += Number(tx.total || 0);
          }
        }
      }
    }

    const dailyResult = Array.from(dayMap.values());

    // Format category distribution for PieChart
    const pieList = Object.entries(categoryTotals)
      .filter(([_, value]) => value > 0)
      .map(([key, value]) => ({
        key,
        name: CATEGORY_NAMES[key] || key,
        value,
        color: CATEGORY_COLORS[key] || '#94a3b8'
      }))
      .sort((a, b) => b.value - a.value);

    // Find peak revenue day
    let peak = { label: '-', revenue: 0 };
    for (const d of dailyResult) {
      if (d.revenue > peak.revenue) {
        peak = { label: d.fullLabel, revenue: d.revenue };
      }
    }

    // Top Category
    const topCat = pieList.length > 0 ? pieList[0] : null;

    return {
      dailyData: dailyResult,
      categoryData: pieList,
      totalWeekRevenue: totalRev,
      totalWeekOrders: totalOrd,
      peakDay: peak,
      topCategory: topCat
    };
  }, [transactions, productMap, weekStart, weekEnd]);

  const hasData = totalWeekRevenue > 0 || totalWeekOrders > 0;

  // Custom Tooltip for Line Chart
  const CustomLineTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-800 text-xs">
          <p className="font-bold text-slate-300 mb-1.5">{data.fullLabel}</p>
          <div className="flex items-center justify-between gap-4 py-0.5">
            <span className="text-slate-400">Total Pendapatan:</span>
            <span className="font-black text-emerald-400 tabular-nums">
              Rp {data.revenue.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 py-0.5">
            <span className="text-slate-400">Jumlah Transaksi:</span>
            <span className="font-bold text-blue-400 tabular-nums">
              {data.orders} transaksi
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom Tooltip for Pie Chart
  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const percentage = totalWeekRevenue > 0 
        ? ((data.value / totalWeekRevenue) * 100).toFixed(1) 
        : '0';

      return (
        <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-xl border border-slate-800 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <div 
              className="w-2.5 h-2.5 rounded-full" 
              style={{ backgroundColor: data.payload.color }} 
            />
            <span className="font-bold">{data.name}</span>
          </div>
          <p className="text-emerald-400 font-black tabular-nums text-sm">
            Rp {data.value.toLocaleString()}
          </p>
          <p className="text-slate-400 text-[10px] font-bold mt-0.5">
            Kontribusi: {percentage}% dari total omzet minggu ini
          </p>
        </div>
      );
    }
    return null;
  };

  const weekRangeLabel = `${format(weekStart, 'dd MMM')} - ${format(weekEnd, 'dd MMM yyyy')}`;

  return (
    <div className="space-y-6">
      {/* Overview Metric Highlights */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 sm:p-7 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 text-blue-400 mb-1">
              <Calendar size={15} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Analitik Finansial Minggu Ini ({weekRangeLabel})
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              Rp {totalWeekRevenue.toLocaleString()}
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-1">
              Total omzet penjualan bersih terakumulasi dari {totalWeekOrders} transaksi kasir.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap gap-3">
            <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700/60 rounded-2xl px-4 py-3 min-w-[140px]">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">
                Hari Tersibuk
              </span>
              <span className="text-xs font-black text-amber-400 truncate block">
                {peakDay.revenue > 0 ? peakDay.label.split(',')[0] : 'Belum ada data'}
              </span>
              <span className="text-[10px] font-bold text-slate-300 tabular-nums">
                {peakDay.revenue > 0 ? `Rp ${peakDay.revenue.toLocaleString()}` : '-'}
              </span>
            </div>

            <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700/60 rounded-2xl px-4 py-3 min-w-[140px]">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">
                Kategori Utama
              </span>
              <span className="text-xs font-black text-emerald-400 truncate block">
                {topCategory ? topCategory.name : 'Sembako'}
              </span>
              <span className="text-[10px] font-bold text-slate-300 tabular-nums">
                {topCategory ? `${((topCategory.value / (totalWeekRevenue || 1)) * 100).toFixed(0)}% pangsa` : '-'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts Grid: Line Chart (Daily Revenue) & Donut Chart (Category Distribution) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line Chart: Daily Revenue */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <TrendingUp size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                    Tren Pendapatan Harian
                  </h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Daily Revenue Breakdown (Senin - Minggu)
                  </p>
                </div>
              </div>
            </div>

            {/* Toggle metric */}
            <div className="flex bg-slate-100 p-1 rounded-xl text-[10px] font-black uppercase tracking-wider">
              <button
                onClick={() => setMetricView('revenue')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  metricView === 'revenue' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Nominal (Rp)
              </button>
              <button
                onClick={() => setMetricView('volume')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  metricView === 'volume' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Vol. Transaksi
              </button>
            </div>
          </div>

          {/* Recharts LineChart */}
          <div className="h-64 sm:h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueLineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="label" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fontWeight: 'bold', fill: '#64748b' }}
                  dy={8}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }}
                  tickFormatter={(val) => 
                    metricView === 'revenue'
                      ? val >= 1000000 
                        ? `${(val / 1000000).toFixed(1)}M` 
                        : val >= 1000 
                          ? `${(val / 1000).toFixed(0)}k` 
                          : `${val}`
                      : `${val}`
                  }
                />
                <Tooltip content={<CustomLineTooltip />} />
                <Line
                  type="monotone"
                  dataKey={metricView === 'revenue' ? 'revenue' : 'orders'}
                  stroke="url(#revenueLineGrad)"
                  strokeWidth={3.5}
                  dot={{ r: 4, stroke: '#2563eb', strokeWidth: 2.5, fill: '#ffffff' }}
                  activeDot={{ r: 7, stroke: '#1d4ed8', strokeWidth: 3, fill: '#60a5fa' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
              Garis kurva memperlihatkan fluktuasi penjualan harian kasir
            </span>
            <span className="font-bold text-slate-700 tabular-nums">
              Rata-rata: Rp {(totalWeekRevenue / 7).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} /hari
            </span>
          </div>
        </div>

        {/* Pie / Donut Chart: Top-Selling Product Categories */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <PieIcon size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                    Kategori Terlaris
                  </h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Top Product Categories (Minggu Ini)
                  </p>
                </div>
              </div>
            </div>

            {/* Donut Chart */}
            <div className="h-48 sm:h-52 w-full relative flex items-center justify-center">
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip content={<CustomPieTooltip />} />
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={80}
                      paddingAngle={4}
                      strokeWidth={2}
                      stroke="#ffffff"
                    >
                      {categoryData.map((entry) => (
                        <Cell key={`cell-${entry.key}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-300">
                  <PieIcon size={44} className="opacity-20 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Belum Ada Transaksi Minggu Ini
                  </p>
                </div>
              )}

              {/* Center Donut Label */}
              {categoryData.length > 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Total
                  </span>
                  <span className="text-xs font-black text-slate-800 tabular-nums">
                    {categoryData.length} Kategori
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Category Breakdown List */}
          <div className="space-y-2.5 pt-4 border-t border-slate-100 max-h-40 overflow-y-auto custom-scrollbar pr-1">
            {categoryData.length > 0 ? (
              categoryData.map((cat) => {
                const percent = totalWeekRevenue > 0 
                  ? ((cat.value / totalWeekRevenue) * 100).toFixed(0) 
                  : 0;

                return (
                  <div key={cat.key} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0" 
                        style={{ backgroundColor: cat.color }} 
                      />
                      <span className="font-bold text-slate-700 truncate text-[11px]">
                        {cat.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded tabular-nums">
                        {percent}%
                      </span>
                      <span className="font-black text-slate-900 text-[11px] tabular-nums">
                        Rp {cat.value.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-2 text-slate-400 text-xs">
                Data kategori akan muncul saat kasir memproses penjualan.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
