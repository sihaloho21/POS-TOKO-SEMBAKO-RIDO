import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { 
  RefreshCw,
  Package,
  Users
} from 'lucide-react';
import { SummaryCards } from './SummaryCards';
import { LowStockBanner } from './LowStockBanner';
import { SalesTrendChart } from './SalesTrendChart';
import { InventoryProjectionsWidget } from './InventoryProjectionsWidget';
import { VisualAnalyticsSection } from './VisualAnalyticsSection';

export default function Dashboard({ onTabChange }: { onTabChange: (tab: string) => void }) {
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const customers = useLiveQuery(() => db.customers.toArray());
  
  const lowStockProducts = useLiveQuery(() => 
    db.products.filter(p => p.status === 'ACTIVE' && p.stock <= p.minimumStock).toArray()
  );

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

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
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

      <LowStockBanner 
        products={lowStockProducts || []} 
        onAction={() => onTabChange('inventory')} 
      />

      <SummaryCards />

      <VisualAnalyticsSection transactions={transactions || []} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <SalesTrendChart transactions={transactions || []} />
        </div>

        <InventoryProjectionsWidget />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-slate-900 p-8 rounded-3xl text-white relative overflow-hidden flex flex-col min-h-[400px]">
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
