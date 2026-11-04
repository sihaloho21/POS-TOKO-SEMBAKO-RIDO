import React, { useState, useMemo } from 'react';
import { db } from '@/core/database';
import { FinanceService } from '@/core/services/finance-service';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuthStore } from '@/core/auth-store';
import { useDeviceId } from '@/core/device-store';
import { useToastStore } from '@/core/toast-store';
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
  ArrowDownRight,
  AlertTriangle,
  Receipt,
  Scale,
  X,
  ArrowLeftRight,
  Trash2,
  RotateCcw
} from 'lucide-react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import FinanceCharts from './FinanceCharts';
import { DataResetService } from '@/core/services/data-reset-service';

export default function Finance() {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const deviceId = useDeviceId();
  const isOwner = currentUser?.role === 'OWNER';

  const [filterStorage, setFilterStorage] = useState('ALL');
  const [search, setSearch] = useState('');

  // Multi-select & Reset State (OWNER only)
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [isDeletingEvents, setIsDeletingEvents] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showResetAllModal, setShowResetAllModal] = useState(false);
  const [resetConfirmWord, setResetConfirmWord] = useState('');

  // Prive / Capital / Expense Modal State
  const [isPriveModalOpen, setIsPriveModalOpen] = useState(false);
  const [entryType, setEntryType] = useState<'CAPITAL' | 'PRIVE' | 'EXPENSE'>('CAPITAL');
  const [entryStorage, setEntryStorage] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL' | 'BUAH'>('WARUNG');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDesc, setEntryDesc] = useState('');
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);

  // Internal Transfer Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [fromStorage, setFromStorage] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL' | 'BUAH'>('WARUNG');
  const [toStorage, setToStorage] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL' | 'BUAH'>('BUAH');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const amt = Number(entryAmount);
    if (!amt || amt <= 0) {
      addToast('Masukkan nominal yang valid (lebih dari Rp 0).', 'error');
      return;
    }

    setIsSubmittingEntry(true);
    try {
      const direction = entryType === 'CAPITAL' ? 'IN' : 'OUT';
      const defaultLabel =
        entryType === 'CAPITAL'
          ? 'Setoran Modal Tambahan (Capital)'
          : entryType === 'PRIVE'
          ? 'Penarikan Prive Owner'
          : 'Pengeluaran Operasional Toko';

      await FinanceService.recordLedgerEntry({
        amount: amt,
        storageId: entryStorage,
        direction,
        referenceId: `${entryType.toLowerCase()}_${uuidv4().slice(0, 8)}`,
        referenceType: entryType,
        description: entryDesc.trim() ? `${defaultLabel} • ${entryDesc.trim()}` : defaultLabel,
        userId: currentUser.userId,
        role: currentUser.role,
        deviceId
      });

      addToast(`${defaultLabel} sebesar Rp ${amt.toLocaleString()} berhasil dicatat!`, 'success');
      setEntryAmount('');
      setEntryDesc('');
      setIsPriveModalOpen(false);
    } catch (err: any) {
      addToast(err.message || 'Gagal mencatat transaksi kas.', 'error');
    } finally {
      setIsSubmittingEntry(false);
    }
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (fromStorage === toStorage) {
      addToast('Kas asal dan kas tujuan tidak boleh sama.', 'error');
      return;
    }
    const amt = Number(transferAmount);
    if (!amt || amt <= 0) {
      addToast('Masukkan nominal transfer yang valid (lebih dari Rp 0).', 'error');
      return;
    }

    setIsSubmittingTransfer(true);
    try {
      const transferRef = `trf_${uuidv4().slice(0, 8)}`;
      const noteSuffix = transferNotes.trim() ? ` • ${transferNotes.trim()}` : '';

      await FinanceService.recordLedgerEntry({
        amount: amt,
        storageId: fromStorage,
        direction: 'OUT',
        referenceId: transferRef,
        referenceType: 'INTERNAL_TRANSFER',
        description: `Transfer Keluar ke ${toStorage.replace('_', ' ')}${noteSuffix}`,
        userId: currentUser.userId,
        role: currentUser.role,
        deviceId
      });

      await FinanceService.recordLedgerEntry({
        amount: amt,
        storageId: toStorage,
        direction: 'IN',
        referenceId: transferRef,
        referenceType: 'INTERNAL_TRANSFER',
        description: `Transfer Masuk dari ${fromStorage.replace('_', ' ')}${noteSuffix}`,
        userId: currentUser.userId,
        role: currentUser.role,
        deviceId
      });

      addToast(`Transfer Rp ${amt.toLocaleString()} dari ${fromStorage} ke ${toStorage} berhasil!`, 'success');
      setTransferAmount('');
      setTransferNotes('');
      setIsTransferModalOpen(false);
    } catch (err: any) {
      addToast(err.message || 'Gagal memproses transfer antar kas.', 'error');
    } finally {
      setIsSubmittingTransfer(false);
    }
  };
  
  const events = useLiveQuery(() => {
    let coll = db.financeEvents.orderBy('timestamp').reverse();
    return coll.filter(e => {
      const matchStorage = filterStorage === 'ALL' || e.storageId === filterStorage;
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        e.referenceType.toLowerCase().includes(q) ||
        e.userId.toLowerCase().includes(q) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        e.referenceId.toLowerCase().includes(q);
      return matchStorage && matchSearch;
    }).toArray();
  }, [filterStorage, search]);

  const allFilteredEventIds = useMemo(() => events?.map(e => e.financeEventId) || [], [events]);
  const isAllSelected = allFilteredEventIds.length > 0 && allFilteredEventIds.every(id => selectedEventIds.has(id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedEventIds(new Set());
    } else {
      setSelectedEventIds(new Set(allFilteredEventIds));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedEventIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedEventIds(next);
  };

  const handleBulkDeleteEvents = async () => {
    if (!currentUser || !isOwner) return;
    setIsDeletingEvents(true);
    try {
      const res = await DataResetService.deleteFinanceEvents(
        Array.from(selectedEventIds),
        currentUser.userId,
        currentUser.role,
        deviceId
      );
      addToast(res.message, 'success');
      setSelectedEventIds(new Set());
      setShowBulkDeleteModal(false);
    } catch (err: any) {
      addToast(err.message || 'Gagal menghapus entri buku kas.', 'error');
    } finally {
      setIsDeletingEvents(false);
    }
  };

  const handleResetFinanceLedger = async () => {
    if (!currentUser || !isOwner) return;
    if (resetConfirmWord !== 'RESET') {
      addToast('Ketik kata konfirmasi "RESET" dengan tepat.', 'error');
      return;
    }
    setIsDeletingEvents(true);
    try {
      const res = await DataResetService.resetFinanceLedger(
        currentUser.userId,
        currentUser.role,
        deviceId
      );
      addToast(res.message, 'success');
      setSelectedEventIds(new Set());
      setShowResetAllModal(false);
      setResetConfirmWord('');
    } catch (err: any) {
      addToast(err.message || 'Gagal me-reset buku kas.', 'error');
    } finally {
      setIsDeletingEvents(false);
    }
  };
  
  const balances = useLiveQuery(async () => {
    return await FinanceService.getLedgerBalances();
  });

  const users = useLiveQuery(() => db.users.toArray(), []);
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users?.forEach(u => map.set(u.userId, u.name));
    return map;
  }, [users]);

  // Calculate Net Profit & Stock Loss (including Fish Death Loss, Service Revenue & Operational Expense)
  const pnlSummary = useLiveQuery(async () => {
    const txs = await db.transactions.where('status').equals('COMPLETED').toArray();
    const movements = await db.stockMovements.toArray();
    const allFinanceEvents = await db.financeEvents.toArray();

    let totalRevenue = 0;
    let totalHpp = 0;

    for (const tx of txs) {
      totalRevenue += Number(tx.total || 0);
      if (tx.items) {
        for (const item of tx.items) {
          const itemHpp = item.hppSnapshot || 0;
          totalHpp += (item.quantity * itemHpp);
        }
      }
    }

    let serviceRevenue = 0;
    let operationalExpense = 0;
    for (const fe of allFinanceEvents) {
      if (fe.referenceType === 'SERVICE_REVENUE' && fe.direction === 'IN') {
        serviceRevenue += Number(fe.amount || 0);
      } else if (fe.referenceType === 'EXPENSE' && fe.direction === 'OUT') {
        operationalExpense += Number(fe.amount || 0);
      }
    }

    const grossProfit = (totalRevenue - totalHpp) + serviceRevenue;

    let fishDeathLossRp = 0;
    let fishDeathLossKg = 0;
    let fruitLossRp = 0;
    let fruitLossKg = 0;
    let otherLossRp = 0;

    for (const m of movements) {
      const qty = m.baseQty || m.qty || 0;
      const cost = m.costSnapshot || 0;

      if (m.movementType === 'FISH_DEAD_OUT' || (m.segmentId === 'IKAN' && m.reason?.toLowerCase().includes('ikan mati'))) {
        fishDeathLossKg += qty;
        fishDeathLossRp += (qty * cost);
      } else if (m.segmentId === 'BUAH' || m.reason?.toLowerCase().includes('buah')) {
        fruitLossKg += qty;
        fruitLossRp += (qty * cost);
      } else if (['DAMAGED_OUT', 'LOST_OUT', 'EXPIRED_OUT'].includes(m.movementType)) {
        otherLossRp += (qty * cost);
      }
    }

    const totalStockLossRp = fishDeathLossRp + fruitLossRp + otherLossRp;
    const netProfit = grossProfit - totalStockLossRp - operationalExpense;

    return {
      totalRevenue,
      serviceRevenue,
      operationalExpense,
      totalHpp,
      grossProfit,
      fishDeathLossKg,
      fishDeathLossRp,
      fruitLossKg,
      fruitLossRp,
      otherLossRp,
      totalStockLossRp,
      netProfit
    };
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Finance Ledger</h2>
          <p className="text-slate-500 text-sm font-medium">Buku kas append-only (Source of Truth) untuk seluruh aliran uang.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsPriveModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all cursor-pointer"
          >
            <Plus size={18} /> Prive / Capital
          </button>
          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 shadow-lg shadow-blue-200 transition-all cursor-pointer"
          >
            <ArrowLeftRight size={18} /> Transfer Antar Kas
          </button>
        </div>
      </div>

      {/* Storage Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { id: 'WARUNG', label: 'Kas Warung', color: 'bg-blue-500', text: 'text-blue-600', icon: '🏪' },
          { id: 'BUAH', label: 'Kas Buah', color: 'bg-teal-500', text: 'text-teal-600', icon: '🍎' },
          { id: 'IKAN', label: 'Kas Ikan', color: 'bg-emerald-500', text: 'text-emerald-600', icon: '🐟' },
          { id: 'UANG_DIGITAL', label: 'Kas Uang Digital', color: 'bg-purple-500', text: 'text-purple-600', icon: '📱' },
        ].map((s) => (
          <div key={s.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-24 h-24 ${s.color} opacity-[0.03] rounded-bl-full`} />
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
              <span className="text-base">{s.icon}</span>
            </div>
            <p className={`text-2xl font-black ${s.text} tabular-nums`}>
              Rp {balances?.[s.id]?.toLocaleString() || 0}
            </p>
          </div>
        ))}
      </div>

      {/* Profit & Loss (Laba Rugi) Summary */}
      {pnlSummary && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight flex items-center gap-2">
                <Receipt className="text-blue-600" size={18} />
                Ringkasan Laba Rugi & Dampak Kerugian Stok
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Kalkulasi Laba Bersih riil: Laba Kotor dikurangi Kerugian Stok (Mortalitas Ikan Mati & Barang Rusak).
              </p>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
              Prinsip Akuntansi POS
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                Omzet Penjualan
              </span>
              <p className="text-xl font-black text-slate-900 tabular-nums">
                Rp {pnlSummary.totalRevenue.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Total pendapatan transaksi</p>
            </div>

            <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-500 block mb-0.5">
                Laba Kotor (Gross Profit)
              </span>
              <p className="text-xl font-black text-blue-700 tabular-nums">
                Rp {pnlSummary.grossProfit.toLocaleString()}
              </p>
              <p className="text-[10px] text-blue-500 mt-1">Omzet - Total HPP Snapshot</p>
            </div>

            <div className="p-4 bg-rose-50/60 rounded-2xl border border-rose-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-500 block mb-0.5">
                Ikan Mati (Death Loss)
              </span>
              <p className="text-xl font-black text-rose-600 tabular-nums">
                - Rp {pnlSummary.fishDeathLossRp.toLocaleString()}
              </p>
              <p className="text-[10px] font-bold text-rose-600 mt-1">
                {pnlSummary.fishDeathLossKg.toFixed(2)} KG @ current WAC
              </p>
            </div>

            <div className={`p-4 rounded-2xl border ${pnlSummary.netProfit >= 0 ? 'bg-emerald-50/80 border-emerald-200' : 'bg-rose-50/80 border-rose-200'}`}>
              <span className={`text-[10px] font-black uppercase tracking-wider block mb-0.5 ${pnlSummary.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                Laba Bersih (Net Profit)
              </span>
              <p className={`text-xl font-black tabular-nums ${pnlSummary.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                Rp {pnlSummary.netProfit.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Laba Kotor - Total Stock Loss
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Financial Analytics & Visualizations */}
      <FinanceCharts />

      {/* Ledger Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <div className="flex gap-1">
              {['ALL', 'WARUNG', 'BUAH', 'IKAN', 'UANG_DIGITAL'].map(s => (
                <button 
                  key={s}
                  onClick={() => setFilterStorage(s)}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                    filterStorage === s ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'
                  }`}
                >
                  {s === 'BUAH' ? '🍎 BUAH' : s}
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

        {/* Owner Bulk Action Bar */}
        {isOwner && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border-b border-slate-100 p-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-black uppercase text-slate-700">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                />
                <span>Pilih Semua ({events?.length || 0} Entri Kas)</span>
              </label>
              {selectedEventIds.size > 0 && (
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                  {selectedEventIds.size} dipilih
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedEventIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteModal(true)}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-sm transition-all flex items-center gap-1.5 cursor-pointer animate-pulse"
                >
                  <Trash2 size={13} />
                  <span>Hapus ({selectedEventIds.size}) Entri</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowResetAllModal(true)}
                className="px-3.5 py-1.5 bg-white hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-300 text-slate-600 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                title="Reset seluruh buku kas ke saldo nol untuk peluncuran resmi"
              >
                <RotateCcw size={13} />
                <span>Reset Buku Kas (Ledger)</span>
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black">
                {isOwner && (
                  <th className="px-4 py-4 w-12 text-center">
                    <input 
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer accent-blue-600"
                      title="Pilih Semua Entri"
                    />
                  </th>
                )}
                <th className="px-6 py-4">Waktu</th>
                <th className="px-6 py-4">Penyimpanan</th>
                <th className="px-6 py-4">Tipe Event</th>
                <th className="px-6 py-4">Jumlah</th>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4 text-right">Referensi & Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events?.length === 0 ? (
                <tr>
                  <td colSpan={isOwner ? 7 : 6} className="px-6 py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                    Tidak ada transaksi kas ditemukan.
                  </td>
                </tr>
              ) : (
                events?.map((e) => (
                  <tr key={e.financeEventId} className={`hover:bg-slate-50/50 transition-colors group ${selectedEventIds.has(e.financeEventId) ? 'bg-blue-50/50' : ''}`}>
                    {isOwner && (
                      <td className="px-4 py-4 text-center">
                        <input 
                          type="checkbox"
                          checked={selectedEventIds.has(e.financeEventId)}
                          onChange={() => toggleSelect(e.financeEventId)}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer accent-blue-600"
                        />
                      </td>
                    )}
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
                        <div>
                          <span className="text-xs font-bold text-slate-700 uppercase block">{e.referenceType.replace('_', ' ')}</span>
                          {e.description && (
                            <span className="text-[11px] text-slate-500 font-medium block mt-0.5">{e.description}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-1 text-sm font-black tabular-nums ${e.direction === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {e.direction === 'IN' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        Rp {e.amount.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-500 uppercase">
                        {userMap.get(e.userId) || e.userId}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 text-[10px] font-mono text-slate-400">
                        <span>{e.referenceId.slice(0, 8)}...</span>
                        {isOwner && (
                          <button
                            onClick={() => {
                              setSelectedEventIds(new Set([e.financeEventId]));
                              setShowBulkDeleteModal(true);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            title="Hapus Entri Kas Ini"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Prive / Capital / Expense */}
      {isPriveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <Wallet size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                    Catat Modal / Prive / Biaya
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Transaksi Kas Manual
                  </p>
                </div>
              </div>
              <button onClick={() => setIsPriveModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  Jenis Transaksi
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'CAPITAL', label: 'Setor Modal (IN)', color: 'bg-emerald-600 border-emerald-600 text-white' },
                    { id: 'PRIVE', label: 'Tarik Prive (OUT)', color: 'bg-rose-600 border-rose-600 text-white' },
                    { id: 'EXPENSE', label: 'Biaya Opex (OUT)', color: 'bg-amber-600 border-amber-600 text-white' },
                  ].map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setEntryType(t.id as any)}
                      className={`py-2.5 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                        entryType === t.id ? t.color : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  Pilih Penyimpanan Kas (Storage)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['WARUNG', 'BUAH', 'IKAN', 'UANG_DIGITAL'] as const).map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setEntryStorage(s)}
                      className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                        entryStorage === s
                          ? s === 'BUAH' ? 'bg-teal-600 border-teal-600 text-white' : 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {s === 'BUAH' ? '🍎 BUAH' : s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  Nominal (Rp) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="Contoh: 500000"
                  value={entryAmount ?? ''}
                  onChange={(e) => setEntryAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  Keterangan / Catatan
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Tambahan modal kembalian / Bayar listrik toko"
                  value={entryDesc ?? ''}
                  onChange={(e) => setEntryDesc(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPriveModalOpen(false)}
                  className="flex-1 py-3 font-bold text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEntry || !entryAmount}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-200 disabled:opacity-50"
                >
                  {isSubmittingEntry ? 'Menyimpan...' : 'Simpan ke Buku Kas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transfer Antar Kas */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center">
                  <ArrowLeftRight size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                    Transfer Antar Kas (Internal)
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Mutasi Saldo Kas Warung / Ikan / Digital
                  </p>
                </div>
              </div>
              <button onClick={() => setIsTransferModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                    Dari Kas (OUT)
                  </label>
                  <select
                    value={fromStorage ?? 'WARUNG'}
                    onChange={(e) => setFromStorage(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="WARUNG">Kas Warung</option>
                    <option value="BUAH">Kas Buah 🍎</option>
                    <option value="IKAN">Kas Ikan</option>
                    <option value="UANG_DIGITAL">Kas Uang Digital</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                    Ke Kas (IN)
                  </label>
                  <select
                    value={toStorage ?? 'BUAH'}
                    onChange={(e) => setToStorage(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="WARUNG">Kas Warung</option>
                    <option value="BUAH">Kas Buah 🍎</option>
                    <option value="IKAN">Kas Ikan</option>
                    <option value="UANG_DIGITAL">Kas Uang Digital</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  Nominal Transfer (Rp) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="Contoh: 250000"
                  value={transferAmount ?? ''}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  Catatan Mutasi (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Top up saldo agen digital dari uang kas warung"
                  value={transferNotes ?? ''}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="flex-1 py-3 font-bold text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTransfer || !transferAmount || fromStorage === toStorage}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-200 disabled:opacity-50"
                >
                  {isSubmittingTransfer ? 'Memproses...' : 'Proses Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Bulk Delete Confirmation */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Hapus Entri Buku Kas?</h3>
                <p className="text-xs font-medium text-slate-500 leading-relaxed">
                  Apakah Anda yakin ingin menghapus <span className="font-black text-rose-600">{selectedEventIds.size}</span> entri transaksi kas terpilih? Tindakan ini akan menghapus log jurnal kas secara permanen.
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingEvents}
                onClick={() => setShowBulkDeleteModal(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingEvents}
                onClick={handleBulkDeleteEvents}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 size={16} />
                {isDeletingEvents ? 'Menghapus...' : `Ya, Hapus (${selectedEventIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Reset All Finance Ledger Confirmation */}
      {showResetAllModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Reset Semua Buku Kas?</h3>
                <p className="text-xs font-medium text-slate-500 leading-relaxed">
                  Tindakan ini ditujukan untuk membersihkan buku kas dari data percobaan ({events?.length || 0} entri) dan mengembalikan saldo kas (Warung, Buah, Ikan, Uang Digital) ke Rp 0 sebelum operasional resmi.
                </p>
              </div>
            </div>

            <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                Ketik <span className="text-rose-600 font-bold">RESET</span> untuk konfirmasi:
              </label>
              <input 
                type="text"
                placeholder="Ketik RESET"
                value={resetConfirmWord}
                onChange={(e) => setResetConfirmWord(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingEvents}
                onClick={() => {
                  setShowResetAllModal(false);
                  setResetConfirmWord('');
                }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingEvents || resetConfirmWord !== 'RESET'}
                onClick={handleResetFinanceLedger}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw size={16} />
                {isDeletingEvents ? 'Mereset...' : 'Reset Bersih Buku Kas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
