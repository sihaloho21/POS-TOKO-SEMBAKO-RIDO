import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ShoppingCart, 
  Users, 
  Package, 
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  RefreshCw
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';

function StatCard({ label, value, trend, icon, color }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-2xl ${color} bg-opacity-10 ${color.replace('text', 'bg')}`}>
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ${trend > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {trend > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}

import { SummaryCards } from './SummaryCards';

export default function Dashboard() {
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const financeEvents = useLiveQuery(() => db.financeEvents.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const customers = useLiveQuery(() => db.customers.toArray());
  const conflicts = useLiveQuery(() => db.conflicts.where('status').equals('PENDING').count());

  // Real-time Storage Balances
  const balances = useLiveQuery(async () => {
    const all = await db.financeEvents.toArray();
    const store: Record<string, number> = { WARUNG: 0, IKAN: 0, UANG_DIGITAL: 0 };
    all.forEach(e => {
      const amt = Number(e.amount);
      if (e.direction === 'IN') store[e.storageId] += amt;
      else store[e.storageId] -= amt;
    });
    return store;
  });

  const chartData = [
    { name: '06:00', value: 4000 },
    { name: '09:00', value: 3000 },
    { name: '12:00', value: 2000 },
    { name: '15:00', value: 2780 },
    { name: '18:00', value: 1890 },
    { name: '21:00', value: 2390 },
  ];

  return (
    <div className="space-y-8 pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Owner Dashboard</h2>
          <p className="text-slate-500 text-sm font-medium">Monitoring performa bisnis Harapan Jaya secara real-time.</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">
            <RefreshCw size={16} /> Rebuild Metrics
          </button>
        </div>
      </div>

      <SummaryCards />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-black text-slate-900 uppercase tracking-tight">Sales Analytics (By Hour)</h3>
            <div className="flex gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transactions</span>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-3xl text-white relative overflow-hidden flex flex-col">
          <h3 className="font-black uppercase tracking-widest text-sm mb-8">Storage Balances</h3>
          <div className="space-y-6 flex-1">
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <span>WARUNG STORAGE</span>
                <span className="text-blue-400">Rp {balances?.WARUNG.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 w-[65%]" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <span>IKAN STORAGE</span>
                <span className="text-emerald-400">Rp {balances?.IKAN.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-[40%]" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <span>UANG DIGITAL</span>
                <span className="text-purple-400">Rp {balances?.UANG_DIGITAL.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 w-[20%]" />
              </div>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Liquid Assets</p>
            <p className="text-2xl font-black tabular-nums">
              Rp {( (balances?.WARUNG || 0) + (balances?.IKAN || 0) + (balances?.UANG_DIGITAL || 0) ).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="font-black text-slate-900 uppercase tracking-tight mb-6 flex items-center gap-2">
            <Package size={20} className="text-blue-600" /> Top Performing Products
          </h3>
          <div className="space-y-4">
            {products?.slice(0, 5).map((p, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-slate-400 w-4">{idx + 1}</span>
                  <span className="text-xs font-bold text-slate-900 uppercase">{p.name}</span>
                </div>
                <span className="text-xs font-black text-blue-600">421 Sold</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="font-black text-slate-900 uppercase tracking-tight mb-6 flex items-center gap-2">
            <Users size={20} className="text-emerald-600" /> Active Customers
          </h3>
          <div className="space-y-4">
            {customers?.slice(0, 5).map((c, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-[10px] font-black text-emerald-600 shadow-sm">
                    {c.name[0]}
                  </div>
                  <span className="text-xs font-bold text-slate-900 uppercase">{c.name}</span>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{c.loyaltyPoints} Pts</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
