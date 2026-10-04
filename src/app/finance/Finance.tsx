import React, { useState } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { SupplierAnalyticsService } from '@/core/services/supplier-analytics-service';
import { 
  TrendingUp, 
  Wallet, 
  ArrowUpRight, 
  Plus, 
  Search,
  Filter,
  ArrowRight,
  ArrowDownRight,
  FileText,
  Download,
  ShieldCheck,
  Zap,
  AlertCircle,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { v4 as uuidv4 } from 'uuid';
import { useAuthStore } from '@/core/auth-store';

export default function Finance() {
  const { currentUser } = useAuthStore();
  const [currentTab, setCurrentTab] = useState<'LEDGER' | 'SUPPLIERS' | 'RECONCILIATION'>('LEDGER');
  const [filterStorage, setFilterStorage] = useState('ALL');
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});
  
  const supplierStats = useLiveQuery(() => SupplierAnalyticsService.getVendorReliability(), []);

  const events = useLiveQuery(() => {
    let coll = db.financeEvents.orderBy('timestamp').reverse();
    if (filterStorage !== 'ALL') {
      return coll.filter(e => e.storageId === filterStorage).toArray();
    }
    return coll.toArray();
  }, [filterStorage]);
  
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

  const handleExportCSV = () => {
    if (!events) return;
    const csv = Papa.unparse(events.map(e => ({
      Waktu: format(new Date(e.timestamp), 'yyyy-MM-dd HH:mm'),
      Penyimpanan: e.storageId,
      Tipe: e.referenceType,
      Arah: e.direction,
      Jumlah: e.amount,
      User: e.userId,
      Referensi: e.referenceId
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `finance_ledger_${format(new Date(), 'yyyyMMdd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (!events) return;
    const doc = new jsPDF();
    const tableData = events.map(e => [
      format(new Date(e.timestamp), 'dd/MM HH:mm'),
      e.storageId,
      e.referenceType,
      e.direction,
      `Rp ${e.amount.toLocaleString()}`,
      e.userId
    ]);

    doc.setFontSize(18);
    doc.text('Finance Ledger Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);

    autoTable(doc, {
      startY: 35,
      head: [['Waktu', 'Penyimpanan', 'Tipe', 'Arah', 'Jumlah', 'User']],
      body: tableData,
    });

    doc.save(`finance_report_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const handleReconcile = async (storageId: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL') => {
    const physical = Number(physicalCounts[storageId]);
    if (isNaN(physical)) return;

    const current = balances?.[storageId] || 0;
    const diff = physical - current;

    if (diff === 0) {
      alert('Saldo sudah sesuai.');
      return;
    }

    if (!confirm(`Terdapat selisih sebesar Rp ${Math.abs(diff).toLocaleString()} (${diff > 0 ? 'Surplus' : 'Defisit'}). Catat penyesuaian?`)) return;

    try {
      await db.financeEvents.add({
        financeEventId: uuidv4(),
        amount: Math.abs(diff),
        storageId,
        direction: diff > 0 ? 'IN' : 'OUT',
        referenceId: `ADJ-${Date.now()}`,
        referenceType: 'ADJUSTMENT',
        userId: currentUser?.userId || 'SYSTEM',
        deviceId: 'device-1',
        timestamp: new Date().toISOString()
      });
      setPhysicalCounts(prev => ({ ...prev, [storageId]: '' }));
      alert('Rekonsiliasi berhasil dicatat.');
    } catch (err) {
      console.error(err);
      alert('Gagal mencatat rekonsiliasi.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Finance Ledger</h2>
          <p className="text-slate-500 text-sm font-medium">Buku kas append-only (Source of Truth) untuk seluruh aliran uang.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">
            <Download size={16} /> CSV
          </button>
          <button onClick={handleExportPDF} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">
            <FileText size={16} /> PDF Report
          </button>
          <button className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
            <Clock size={16} /> Tutup Buku (Period Closing)
          </button>
        </div>
      </div>

      <div className="flex gap-4 border-b border-slate-200">
        <button 
          onClick={() => setCurrentTab('LEDGER')}
          className={`pb-4 px-2 font-black text-xs uppercase tracking-widest transition-all relative ${currentTab === 'LEDGER' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          General Ledger
          {currentTab === 'LEDGER' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />}
        </button>
        <button 
          onClick={() => setCurrentTab('SUPPLIERS')}
          className={`pb-4 px-2 font-black text-xs uppercase tracking-widest transition-all relative ${currentTab === 'SUPPLIERS' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Supplier Reliability
          {currentTab === 'SUPPLIERS' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />}
        </button>
        <button 
          onClick={() => setCurrentTab('RECONCILIATION')}
          className={`pb-4 px-2 font-black text-xs uppercase tracking-widest transition-all relative ${currentTab === 'RECONCILIATION' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Reconciliation
          {currentTab === 'RECONCILIATION' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />}
        </button>
      </div>

      {currentTab === 'LEDGER' ? (
        <>
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
                  Rp {balances?.[s.id as keyof typeof balances]?.toLocaleString() || 0}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-slate-400" />
                <div className="flex gap-1">
                  {['ALL', 'WARUNG', 'IKAN', 'UANG_DIGITAL'].map(s => (
                    <button 
                      key={s}
                      onClick={() => setFilterStorage(s)}
                      className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${filterStorage === s ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input placeholder="Cari transaksi..." className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none text-xs font-bold shadow-sm" />
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
                        <span className="text-xs font-bold text-slate-500 tabular-nums">{format(new Date(e.timestamp), 'dd/MM HH:mm')}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[10px] font-black px-2 py-1 bg-slate-100 text-slate-500 rounded uppercase tracking-widest">{e.storageId.replace('_', ' ')}</span>
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
        </>
      ) : currentTab === 'SUPPLIERS' ? (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="font-black text-slate-900 uppercase tracking-tight mb-8 flex items-center gap-2">
            <ShieldCheck size={20} className="text-emerald-600" />
            Vendor Performance Scorecard
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-black">
                  <th className="px-6 py-4">Supplier</th>
                  <th className="px-6 py-4">Reliability</th>
                  <th className="px-6 py-4">Stability</th>
                  <th className="px-6 py-4">Avg Delivery</th>
                  <th className="px-6 py-4 text-right">Total Orders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierStats?.map(stat => (
                  <tr key={stat.supplierId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4"><p className="text-sm font-black text-slate-900 uppercase">{stat.name}</p></td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full max-w-[100px] overflow-hidden">
                          <div className={`h-full rounded-full ${stat.reliabilityScore > 80 ? 'bg-emerald-500' : stat.reliabilityScore > 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${stat.reliabilityScore}%` }} />
                        </div>
                        <span className="text-xs font-black text-slate-900">{stat.reliabilityScore}/100</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs uppercase tracking-widest">
                        <Zap size={14} /> {Math.round(stat.priceStability * 100)}% Stable
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">{stat.avgDeliveryDays} Days</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{stat.totalOrders} INV</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200"><ShieldCheck size={20} /></div>
            <div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Data Reconciliation</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Verifikasi saldo sistem vs fisik</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {(['WARUNG', 'IKAN', 'UANG_DIGITAL'] as const).map(storageId => {
              const systemBalance = balances?.[storageId] || 0;
              return (
                <div key={storageId} className="space-y-4 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">{storageId.replace('_', ' ')}</h4>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase">Saldo Sistem</p>
                    <p className="text-lg font-black text-slate-900 tabular-nums">Rp {systemBalance.toLocaleString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase">Input Fisik (Manual)</p>
                    <input 
                      type="number" 
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                      placeholder="0"
                      value={physicalCounts[storageId] || ''}
                      onChange={(e) => setPhysicalCounts(prev => ({ ...prev, [storageId]: e.target.value }))}
                    />
                  </div>
                  <button 
                    onClick={() => handleReconcile(storageId)}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all"
                  >
                    Finalisasi & Adjust
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-12 p-6 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-4">
            <AlertCircle className="text-blue-600 shrink-0" size={24} />
            <div>
              <h4 className="text-xs font-black text-blue-900 uppercase tracking-widest mb-2">Penting: Audit Traceability</h4>
              <p className="text-xs text-blue-700 leading-relaxed">Setiap penyesuaian (adjustment) pada tahap rekonsiliasi akan dicatat sebagai Business Event baru dengan referensi audit lengkap. Sistem tidak melakukan edit saldo secara langsung (Direct Balance Edit) demi menjaga integritas WAC dan Finance Ledger.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
