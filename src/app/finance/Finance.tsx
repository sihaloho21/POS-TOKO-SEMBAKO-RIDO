import React, { useState } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Plus, 
  Search,
  Filter,
  ArrowRight,
  ArrowDownRight
} from 'lucide-react';
import { format } from 'date-fns';
import FinanceCharts from './FinanceCharts';

export default function Finance() {
  const [filterStorage, setFilterStorage] = useState('ALL');
  const [search, setSearch] = useState('');
  
  const events = useLiveQuery(() => {
    let coll = db.financeEvents.orderBy('timestamp').reverse();
    return coll.filter(e => {
      const matchStorage = filterStorage === 'ALL' || e.storageId === filterStorage;
      const matchSearch = !search || e.referenceType.toLowerCase().includes(search.toLowerCase()) || e.userId.toLowerCase().includes(search.toLowerCase());
      return matchStorage && matchSearch;
    }).toArray();
  }, [filterStorage, search]);
  
  const balances = useLiveQuery(async () => {
    const all = await db.financeEvents.toArray();
    const storage: Record<string, number> = { WARUNG: 0, IKAN: 0, UANG_DIGITAL: 0 };
    all.forEach(e => {
      const amount = Number(e.amount);
      if (e.direction === 'IN') storage[e.storageId] += amount;
      else storage[e.storageId] -= amount;
    });
    return storage;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Finance Ledger</h2>
          <p className="text-slate-500 text-sm font-medium">Buku kas append-only (Source of Truth) untuk seluruh aliran uang.</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">
            <Plus size={18} /> Prive / Capital
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 shadow-lg shadow-blue-200 transition-all">
            <TrendingUp size={18} /> Transfer Antar Kas
          </button>
        </div>
      </div>

      {/* Storage Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { id: 'WARUNG', label: 'Kas Warung', color: 'bg-blue-500', text: 'text-blue-600' },
          { id: 'IKAN', label: 'Kas Ikan', color: 'bg-emerald-500', text: 'text-emerald-600' },
          { id: 'UANG_DIGITAL', label: 'Kas Uang Digital', color: 'bg-purple-500', text: 'text-purple-600' },
        ].map((s) => (
          <div key={s.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-24 h-24 ${s.color} opacity-[0.03] rounded-bl-full`} />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`text-2xl font-black ${s.text} tabular-nums`}>
              Rp {balances?.[s.id]?.toLocaleString() || 0}
            </p>
          </div>
        ))}
      </div>

      {/* Financial Analytics & Visualizations */}
      <FinanceCharts />

      {/* Ledger Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <div className="flex gap-1">
              {['ALL', 'WARUNG', 'IKAN', 'UANG_DIGITAL'].map(s => (
                <button 
                  key={s}
                  onClick={() => setFilterStorage(s)}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                    filterStorage === s ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Cari transaksi..."
              value={search ?? ''}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none text-xs font-bold shadow-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black">
                <th className="px-6 py-4">Waktu</th>
                <th className="px-6 py-4">Penyimpanan</th>
                <th className="px-6 py-4">Tipe Event</th>
                <th className="px-6 py-4">Jumlah</th>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4 text-right">Referensi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events?.map((e) => (
                <tr key={e.financeEventId} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-500 tabular-nums">
                      {format(new Date(e.timestamp), 'dd/MM HH:mm')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-black px-2 py-1 bg-slate-100 text-slate-500 rounded uppercase tracking-widest">
                      {e.storageId.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${e.direction === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <span className="text-xs font-bold text-slate-700 uppercase">{e.referenceType}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`flex items-center gap-1 text-sm font-black tabular-nums ${e.direction === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {e.direction === 'IN' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      Rp {e.amount.toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-slate-500 uppercase">{e.userId}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 text-[10px] font-mono text-slate-400">
                      {e.referenceId.slice(0, 8)}...
                      <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-all" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
