import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { ShiftService, type ShiftClosingMetrics } from '@/core/services/shift-service';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';
import type { CashierShift, Transaction, FinanceEvent, Receivable } from '@/core/types';
import { CashDenominationCounter } from './CashDenominationCounter';
import { format } from 'date-fns';
import {
  X,
  AlertTriangle,
  ShieldCheck,
  User,
  Clock,
  Smartphone,
  Banknote,
  TrendingUp,
  Receipt,
  FileText,
  DollarSign,
  ArrowRight,
  CheckCircle,
  HelpCircle,
  Calculator,
  UserMinus,
  Store,
  Calendar,
  Lock,
  ChevronRight,
  Info
} from 'lucide-react';

interface CashDiscrepancyAuditModalProps {
  shiftId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

type TabType = 'SUMMARY' | 'DENOMINATIONS' | 'TRANSACTIONS';

export function CashDiscrepancyAuditModal({ shiftId, onClose, onSuccess }: CashDiscrepancyAuditModalProps) {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();

  const [activeTab, setActiveTab] = useState<TabType>('SUMMARY');
  const [metrics, setMetrics] = useState<ShiftClosingMetrics | null>(null);
  const [actionType, setActionType] = useState<'CHARGE_CASHIER' | 'STORE_EXPENSE' | null>(null);

  // Form states for Owner Resolution
  const [ownerPin, setOwnerPin] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return format(d, 'yyyy-MM-dd');
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch shift
  const shift = useLiveQuery(() => db.shifts.get(shiftId), [shiftId]);

  // Fetch cashier user
  const cashier = useLiveQuery(async () => {
    if (!shift) return null;
    return db.users.get(shift.userId);
  }, [shift?.userId]);

  // Fetch staff receivable if already charged
  const staffReceivable = useLiveQuery(async () => {
    if (!shift?.staffReceivableId) return null;
    return db.receivables.get(shift.staffReceivableId);
  }, [shift?.staffReceivableId]);

  // Fetch transactions for this shift
  const transactions = useLiveQuery(async () => {
    if (!shiftId) return [];
    const list = await db.transactions
      .where('shiftId')
      .equals(shiftId)
      .toArray();
    return list.sort((a, b) => new Date(b.clientTimestamp).getTime() - new Date(a.clientTimestamp).getTime());
  }, [shiftId]);

  // Fetch petty cash expenses for this shift
  const shiftExpenses = useLiveQuery(async () => {
    if (!shiftId) return [];
    return db.financeEvents
      .filter(e => e.referenceId === shiftId && e.storageId === 'WARUNG')
      .toArray();
  }, [shiftId]);

  // Load closing metrics
  useEffect(() => {
    if (!shiftId) return;
    ShiftService.getShiftClosingMetrics(shiftId)
      .then(setMetrics)
      .catch(err => console.error('Error fetching closing metrics:', err));
  }, [shiftId]);

  if (!shift) return null;

  const discrepancy = shift.discrepancy ?? (shift.actualCash !== undefined && shift.expectedCash !== undefined ? shift.actualCash - shift.expectedCash : 0);
  const hasDiscrepancy = discrepancy !== 0;
  const isDeficit = discrepancy < 0;
  const amountDiscrepancy = Math.abs(discrepancy);

  const isResolved = shift.discrepancyApprovalStatus === 'CHARGED_TO_CASHIER' ||
    shift.discrepancyApprovalStatus === 'STORE_EXPENSE' ||
    shift.discrepancyApprovalStatus === 'APPROVED';

  const handleChargeToCashier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setErrorMsg('');

    if (!ownerPin.trim()) {
      setErrorMsg('Masukkan PIN Owner untuk mengotorisasi pembebanan ke kasir.');
      return;
    }

    setIsSubmitting(true);
    try {
      await ShiftService.resolveDiscrepancyToStaffReceivable({
        shiftId,
        ownerUserId: currentUser.userId,
        ownerPin: ownerPin.trim(),
        dueDate,
        notes: resolutionNotes.trim()
      });

      addToast(`Selisih kas Rp ${amountDiscrepancy.toLocaleString()} berhasil dibebankan ke kasir dan dicatat di buku piutang!`, 'success');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membebankan selisih ke kasir.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStoreExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setErrorMsg('');

    if (!ownerPin.trim()) {
      setErrorMsg('Masukkan PIN Owner untuk konfirmasi beban toko.');
      return;
    }

    setIsSubmitting(true);
    try {
      await ShiftService.resolveDiscrepancyToStoreExpense({
        shiftId,
        ownerUserId: currentUser.userId,
        ownerPin: ownerPin.trim(),
        notes: resolutionNotes.trim()
      });

      addToast('Selisih kas disetujui sebagai beban toleransi toko.', 'success');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyetujui beban toko.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-6 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex justify-between items-start pb-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
              isDeficit
                ? 'bg-rose-600 text-white shadow-rose-200'
                : discrepancy > 0
                ? 'bg-blue-600 text-white shadow-blue-200'
                : 'bg-emerald-600 text-white shadow-emerald-200'
            }`}>
              <AlertTriangle size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 text-xl uppercase tracking-tight">
                  Audit Selisih Kas Laci Kasir
                </h3>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                  shift.discrepancyApprovalStatus === 'CHARGED_TO_CASHIER'
                    ? 'bg-purple-100 text-purple-800'
                    : shift.discrepancyApprovalStatus === 'STORE_EXPENSE'
                    ? 'bg-slate-100 text-slate-700'
                    : shift.discrepancyApprovalStatus === 'APPROVED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800 animate-pulse'
                }`}>
                  {shift.discrepancyApprovalStatus === 'CHARGED_TO_CASHIER'
                    ? '✓ Dibebankan ke Kasir'
                    : shift.discrepancyApprovalStatus === 'STORE_EXPENSE'
                    ? '✓ Beban Toko'
                    : shift.discrepancyApprovalStatus === 'APPROVED'
                    ? '✓ Disetujui'
                    : '⚠️ Butuh Tindakan Owner'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Shift ID: {shift.shiftId.slice(-8).toUpperCase()}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <User size={12} /> Kasir: {cashier?.name || shift.userId}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock size={12} /> {format(new Date(shift.startTime), 'dd/MM HH:mm')} - {shift.endTime ? format(new Date(shift.endTime), 'HH:mm') : 'AKTIF'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Highlight Banner: Discrepancy Amount */}
        <div className={`mt-4 p-4 rounded-2xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 flex-shrink-0 ${
          isDeficit
            ? 'bg-rose-50/80 border-rose-200 text-rose-950'
            : discrepancy > 0
            ? 'bg-blue-50/80 border-blue-200 text-blue-950'
            : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
        }`}>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider block opacity-75">
              Status Selisih Kas Laci:
            </span>
            <p className="text-2xl font-black tabular-nums">
              {discrepancy === 0
                ? 'Pas / Tidak Ada Selisih (Rp 0)'
                : `${isDeficit ? 'Defisit / Uang Kurang: -Rp ' : 'Surplus / Uang Lebih: +Rp '}${amountDiscrepancy.toLocaleString()}`}
            </p>
            <p className="text-xs font-medium mt-0.5">
              Uang Seharusnya (Expected): <strong>Rp {(shift.expectedCash || 0).toLocaleString()}</strong> | Fisik Kasir: <strong>Rp {(shift.actualCash || 0).toLocaleString()}</strong>
            </p>
          </div>

          {shift.discrepancyReason && (
            <div className="sm:text-right max-w-sm bg-white/70 backdrop-blur-xs p-2.5 rounded-xl border border-slate-200/60">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
                Klarifikasi / Alasan Kasir:
              </span>
              <p className="text-xs font-semibold text-slate-800 italic">
                "{shift.discrepancyReason}"
              </p>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mt-4 border-b border-slate-200 pb-2 flex-shrink-0">
          <button
            onClick={() => setActiveTab('SUMMARY')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'SUMMARY'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <TrendingUp size={14} /> Rekap Arus Kas
          </button>
          <button
            onClick={() => setActiveTab('DENOMINATIONS')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'DENOMINATIONS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Calculator size={14} /> Hitung Fisik Uang
          </button>
          <button
            onClick={() => setActiveTab('TRANSACTIONS')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'TRANSACTIONS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Receipt size={14} /> Daftar Struk Shift ({transactions?.length || 0})
          </button>
        </div>

        {/* Tab Contents (Scrollable) */}
        <div className="py-4 overflow-y-auto flex-1 space-y-4 pr-1">
          {activeTab === 'SUMMARY' && (
            <div className="space-y-4">
              {/* Formula Flow Cards */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-3">
                  Rumus Rekonsiliasi Kas Laci (Drawer Reconciliation Formula)
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">1. Modal Awal</span>
                    <p className="text-sm font-black text-slate-800 tabular-nums">
                      Rp {shift.startingCash.toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
                    <span className="text-[9px] font-bold text-emerald-600 uppercase block">+ 2. Penjualan Tunai</span>
                    <p className="text-sm font-black text-emerald-900 tabular-nums">
                      Rp {(metrics?.cashSales || 0).toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200">
                    <span className="text-[9px] font-bold text-blue-600 uppercase block">+ 3. Bayar Piutang Tunai</span>
                    <p className="text-sm font-black text-blue-900 tabular-nums">
                      Rp {((metrics?.cashIn || 0) - shift.startingCash - (metrics?.cashSales || 0)).toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-rose-50/70 p-3 rounded-xl border border-rose-200">
                    <span className="text-[9px] font-bold text-rose-600 uppercase block">- 4. Kas Keluar / Beban</span>
                    <p className="text-sm font-black text-rose-900 tabular-nums">
                      Rp {(metrics?.cashOut || 0).toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-indigo-50/80 p-3 rounded-xl border border-indigo-200">
                    <span className="text-[9px] font-bold text-indigo-600 uppercase block">= Kas Seharusnya</span>
                    <p className="text-sm font-black text-indigo-900 tabular-nums">
                      Rp {(shift.expectedCash || metrics?.expectedCash || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Already Resolved Banner if applicable */}
              {isResolved && (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-start gap-3">
                  <CheckCircle size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-emerald-900 uppercase">
                      Selisih Telah Ditindaklanjuti & Diselesaikan
                    </h4>
                    <p className="text-xs text-emerald-800">
                      Diselesaikan oleh Owner: <strong>{shift.discrepancyResolvedBy || shift.discrepancyApprovedBy}</strong> pada{' '}
                      {shift.discrepancyResolvedAt ? format(new Date(shift.discrepancyResolvedAt), 'dd MMM yyyy HH:mm') : '-'}
                    </p>
                    {shift.discrepancyResolutionNotes && (
                      <p className="text-xs italic text-emerald-950 font-medium">
                        Catatan: "{shift.discrepancyResolutionNotes}"
                      </p>
                    )}
                    {staffReceivable && (
                      <div className="mt-2 p-2.5 bg-white/80 rounded-xl border border-emerald-300 text-xs font-bold text-slate-800 flex items-center justify-between">
                        <span>Piutang Karyawan: ID {staffReceivable.receivableId.slice(-8).toUpperCase()}</span>
                        <span className="text-purple-700 uppercase">
                          Sisa Hutang: Rp {staffReceivable.remainingAmount.toLocaleString()} ({staffReceivable.status})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Expenses Breakdown if any */}
              {shiftExpenses && shiftExpenses.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
                    Daftar Pengeluaran / Kas Keluar dari Laci ({shiftExpenses.length} transaksi)
                  </h4>
                  <div className="divide-y divide-slate-100 text-xs">
                    {shiftExpenses.map((exp) => (
                      <div key={exp.financeEventId} className="py-2 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800">{exp.description || 'Pengeluaran Kas'}</p>
                          <span className="text-[10px] text-slate-400">
                            {format(new Date(exp.timestamp), 'HH:mm')} • {exp.referenceType}
                          </span>
                        </div>
                        <span className="font-black text-rose-600 tabular-nums">
                          -Rp {exp.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'DENOMINATIONS' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-900">
                <Info size={16} className="text-indigo-600 flex-shrink-0" />
                <span>
                  Hitung ulang lembaran uang kertas dan koin di laci kasir bersama kasir untuk memastikan tidak ada lembaran yang terselip atau salah hitung.
                </span>
              </div>

              <CashDenominationCounter
                counts={shift.cashDenominations || {}}
                onChange={() => {}}
                readOnly={isResolved}
              />
            </div>
          )}

          {activeTab === 'TRANSACTIONS' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Waktu</th>
                      <th className="py-3 px-4">No. Struk</th>
                      <th className="py-3 px-4">Metode Bayar</th>
                      <th className="py-3 px-4">Barang</th>
                      <th className="py-3 px-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions && transactions.length > 0 ? (
                      transactions.map((tx) => (
                        <tr key={tx.transactionId} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-4 font-medium text-slate-600">
                            {format(new Date(tx.clientTimestamp), 'HH:mm')}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                            {tx.receiptNumber}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              (tx.paymentMethodId || 'CASH').toUpperCase() === 'CASH'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {tx.paymentMethodId || 'CASH'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">
                            {tx.items?.length || 0} item ({tx.items?.map(i => i.nameSnapshot).slice(0, 2).join(', ')}{tx.items?.length > 2 ? '...' : ''})
                          </td>
                          <td className="py-2.5 px-4 text-right font-black text-slate-900 tabular-nums">
                            Rp {(tx.total || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          Tidak ada transaksi yang tercatat dalam shift ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Owner Resolution Action Section (Bottom) */}
        {!isResolved && hasDiscrepancy && (
          <div className="pt-4 border-t border-slate-200 flex-shrink-0 space-y-3">
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertTriangle size={14} />
                <span>{errorMsg}</span>
              </div>
            )}

            {actionType === null ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                    Tindak Lanjut & Keputusan Owner
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Sesuai kebijakan toko: jika selisih tidak ditemukan struknya, bebankan ke kasir sebagai piutang (kasbon).
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {isDeficit && (
                    <button
                      type="button"
                      onClick={() => setActionType('CHARGE_CASHIER')}
                      className="flex-1 sm:flex-initial px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md shadow-rose-200 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <UserMinus size={15} /> Bebankan ke Kasir (Catat Piutang)
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setActionType('STORE_EXPENSE')}
                    className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Store size={15} /> Toleransi Toko
                  </button>
                </div>
              </div>
            ) : actionType === 'CHARGE_CASHIER' ? (
              <form onSubmit={handleChargeToCashier} className="p-4 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black uppercase tracking-wider text-rose-950 flex items-center gap-1.5">
                    <UserMinus size={16} className="text-rose-600" />
                    Konfirmasi Pembebanan ke Kasir ({cashier?.name || shift.userId})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setActionType(null)}
                    className="text-[10px] font-bold text-slate-500 hover:text-slate-800"
                  >
                    Batal
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-600 block mb-1">
                      Nominal Piutang yang Dibebankan
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={`Rp ${amountDiscrepancy.toLocaleString()}`}
                      className="w-full bg-rose-100/70 border border-rose-300 font-black text-rose-950 px-3 py-2 rounded-xl text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-600 block mb-1">
                      Target Jatuh Tempo / Potong Gaji
                    </label>
                    <input
                      type="date"
                      required
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 font-bold text-slate-900 px-3 py-2 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-600 block mb-1">
                      PIN Owner (Otorisasi) *
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      required
                      placeholder="Masukkan PIN Owner"
                      value={ownerPin}
                      onChange={(e) => setOwnerPin(e.target.value)}
                      className="w-full bg-white border border-slate-300 font-black text-slate-900 px-3 py-2 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-600 block mb-1">
                    Catatan Kesepakatan / Alasan Pembebanan
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Selisih tidak ditemukan, disepakati potong gaji akhir bulan"
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    className="w-full bg-white border border-slate-300 font-medium text-slate-900 px-3 py-2 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActionType(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md shadow-rose-200 transition-all flex items-center gap-1.5"
                  >
                    {isSubmitting ? 'Memproses...' : '✓ Simpan & Catat Piutang Kasir'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleStoreExpense} className="p-4 bg-slate-100 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <Store size={16} className="text-indigo-600" />
                    Konfirmasi Toleransi / Beban Operasional Toko
                  </h4>
                  <button
                    type="button"
                    onClick={() => setActionType(null)}
                    className="text-[10px] font-bold text-slate-500 hover:text-slate-800"
                  >
                    Batal
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-600 block mb-1">
                      Catatan Toleransi Toko
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Selisih uang koin/kembalian pembulatan receh"
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      className="w-full bg-white border border-slate-300 font-medium text-slate-900 px-3 py-2 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-600 block mb-1">
                      PIN Owner (Otorisasi) *
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      required
                      placeholder="Masukkan PIN Owner"
                      value={ownerPin}
                      onChange={(e) => setOwnerPin(e.target.value)}
                      className="w-full bg-white border border-slate-300 font-black text-slate-900 px-3 py-2 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActionType(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center gap-1.5"
                  >
                    {isSubmitting ? 'Memproses...' : '✓ Setujui Sebagai Beban Toko'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
