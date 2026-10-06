import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { CashierShift } from '@/core/types';
import { 
  History, 
  Search, 
  Calendar, 
  Clock, 
  User, 
  TrendingUp, 
  FileText,
  ChevronRight,
  Filter,
  ArrowUpDown,
  AlertTriangle,
  CheckCircle,
  X
} from 'lucide-react';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import ShiftReport from './ShiftReport';

export default function ShiftHistory({ onNavigate }: { onNavigate?: (tab: string) => void } = {}) {
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: ''
  });
  const [selectedShiftId, setViewingShiftId] = useState<string | null>(null);

  const shifts = useLiveQuery(async () => {
    let all = await db.shifts.toArray();
    
    // Sort by startTime descending
    all.sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''));

    // Fetch users to resolve names
    const userList = await db.users.toArray();
    const userMap = Object.fromEntries(userList.map(u => [u.userId, u.name]));

    return all.filter(s => {
      const cashierName = userMap[s.userId] || s.userId;
      const matchesSearch = s.userId.toLowerCase().includes(search.toLowerCase()) || 
                           cashierName.toLowerCase().includes(search.toLowerCase()) ||
                           s.shiftId.toLowerCase().includes(search.toLowerCase());
      
      // Date filtering
      let matchesDate = true;
      if (dateRange.start || dateRange.end) {
        const shiftDate = new Date(s.startTime);
        const start = dateRange.start ? startOfDay(new Date(dateRange.start)) : new Date(0);
        const end = dateRange.end ? endOfDay(new Date(dateRange.end)) : new Date(8640000000000000);
        matchesDate = isWithinInterval(shiftDate, { start, end });
      }

      // Add resolved name to the object for UI usage
      (s as any).cashierName = cashierName;

      return matchesSearch && matchesDate;
    });
  }, [search, dateRange]);

  const totalHistoricalRevenue = shifts?.reduce((acc, s) => acc + (s.totalSales || 0), 0) || 0;
  const totalShiftCount = shifts?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header & High-level Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2.5">
            <History className="text-indigo-600" />
            Riwayat & Performa Shift
          </h2>
          <p className="text-slate-500 text-xs font-medium mt-0.5">
            Analisis performa historis sesi kasir dan rekonsiliasi keuangan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onNavigate && (
            <button
              onClick={() => onNavigate('shift')}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-sm shadow-indigo-200 transition-all flex items-center gap-1.5"
            >
              <Clock size={14} />
              <span>Kelola Sesi Kasir</span>
            </button>
          )}
          <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Omzet Filtered</p>
              <p className="text-sm font-black text-slate-900 tabular-nums leading-none">Rp {totalHistoricalRevenue.toLocaleString()}</p>
            </div>
          </div>
          <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center">
              <FileText size={16} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Sesi</p>
              <p className="text-sm font-black text-slate-900 tabular-nums leading-none">{totalShiftCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Cari Kasir atau ID Shift..."
            value={search ?? ''}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-2xl px-3 py-1.5">
            <Calendar size={14} className="text-slate-400" />
            <input 
              type="date" 
              className="bg-transparent text-xs font-bold outline-none text-slate-700"
              value={dateRange.start ?? ''}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            />
            <span className="text-slate-300 mx-1">-</span>
            <input 
              type="date" 
              className="bg-transparent text-xs font-bold outline-none text-slate-700"
              value={dateRange.end ?? ''}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            />
          </div>
          {(dateRange.start || dateRange.end || search) && (
            <button 
              onClick={() => {
                setSearch('');
                setDateRange({ start: '', end: '' });
              }}
              className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
              title="Reset Filters"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="py-5 px-6">Waktu & Sesi</th>
                <th className="py-5 px-6">Kasir Bertugas</th>
                <th className="py-5 px-6 text-right">Omzet (Sales)</th>
                <th className="py-5 px-6 text-right">Rekonsiliasi</th>
                <th className="py-5 px-6 text-center">Status</th>
                <th className="py-5 px-6 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shifts && shifts.length > 0 ? (
                shifts.map((s) => (
                  <tr key={s.shiftId} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.status === 'OPEN' ? 'bg-emerald-100 text-emerald-600 animate-pulse' : 'bg-slate-100 text-slate-400'}`}>
                          <Clock size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900">{format(new Date(s.startTime), 'dd MMM yyyy')}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {format(new Date(s.startTime), 'HH:mm')} - {s.endTime ? format(new Date(s.endTime), 'HH:mm') : 'AKTIF'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-[10px] font-black uppercase">
                          {(s as any).cashierName?.[0] || '?'}
                        </div>
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">{(s as any).cashierName}</span>
                      </div>
                    </td>

                    <td className="py-4 px-6 text-right">
                      <p className="text-sm font-black text-slate-900 tabular-nums">Rp {(s.totalSales || 0).toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{s.totalTransactionCount || 0} Transaksi</p>
                    </td>

                    <td className="py-4 px-6 text-right">
                      {s.status === 'CLOSED' ? (
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-slate-900 tabular-nums">Rp {s.actualCash?.toLocaleString()}</span>
                            {s.actualCash !== s.expectedCash ? (
                              <AlertTriangle size={12} className="text-amber-500" />
                            ) : (
                              <CheckCircle size={12} className="text-emerald-500" />
                            )}
                          </div>
                          <p className={`text-[9px] font-black uppercase tracking-tight ${s.actualCash === s.expectedCash ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {s.actualCash === s.expectedCash ? 'Balanced' : `Selisih: Rp ${( (s.actualCash || 0) - (s.expectedCash || 0) ).toLocaleString()}`}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest italic">Belum Tutup</span>
                      )}
                    </td>

                    <td className="py-4 px-6 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                        s.status === 'CLOSED' ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse'
                      }`}>
                        {s.status}
                      </span>
                    </td>

                    <td className="py-4 px-6 text-center">
                      <button 
                        onClick={() => setViewingShiftId(s.shiftId)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                        title="Lihat Detail Laporan"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-300">
                      <History size={48} className="mb-4 opacity-20" />
                      <p className="text-sm font-bold uppercase tracking-widest">Tidak ada data shift ditemukan</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedShiftId && (
        <div className="fixed inset-0 z-[500] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-2xl w-full relative">
            <button 
              onClick={() => setViewingShiftId(null)}
              className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 rounded-full"
            >
              <X size={24} />
            </button>
            <ShiftReport shiftId={selectedShiftId} />
          </div>
        </div>
      )}
    </div>
  );
}
