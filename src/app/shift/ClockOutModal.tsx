import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { ShiftService, type ShiftClosingMetrics } from '@/core/services/shift-service';
import { StoreStatusService } from '@/core/services/store-status-service';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';
import { getDeviceId } from '@/core/device-store';
import { 
  Lock, 
  X, 
  Receipt, 
  TrendingUp, 
  DollarSign, 
  CreditCard, 
  AlertTriangle, 
  CheckCircle, 
  ShieldCheck, 
  KeyRound, 
  Banknote,
  MinusCircle,
  PlusCircle,
  Clock,
  Smartphone
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface ClockOutModalProps {
  isOpen: boolean;
  shiftId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ClockOutModal({ isOpen, shiftId, onClose, onSuccess }: ClockOutModalProps) {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const deviceId = getDeviceId();

  const [metrics, setMetrics] = useState<ShiftClosingMetrics | null>(null);
  const [actualCashInput, setActualCashInput] = useState<string>('');
  const [discrepancyReason, setDiscrepancyReason] = useState<string>('');
  const [ownerPin, setOwnerPin] = useState<string>('');
  const [endNotes, setEndNotes] = useState<string>('');
  const [threshold, setThreshold] = useState<number>(25000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Fetch target shift
  const targetShift = useLiveQuery(async () => {
    if (!isOpen) return null;
    if (shiftId) {
      return db.shifts.get(shiftId);
    }
    return ShiftService.getCurrentShift(deviceId, currentUser?.userId);
  }, [isOpen, shiftId, deviceId, currentUser?.userId]);

  // Load metrics when target shift is available
  useEffect(() => {
    if (!targetShift || !isOpen) return;

    let isMounted = true;
    ShiftService.getShiftClosingMetrics(targetShift.shiftId)
      .then((res) => {
        if (isMounted) {
          setMetrics(res);
          // Set initial input to expected cash or empty
          if (actualCashInput === '') {
            setActualCashInput(res.expectedCash.toString());
          }
        }
      })
      .catch((err) => {
        console.error('Error fetching closing metrics:', err);
      });

    StoreStatusService.getDiscrepancyThreshold().then((t) => {
      if (isMounted) setThreshold(t);
    });

    return () => {
      isMounted = false;
    };
  }, [targetShift?.shiftId, isOpen]);

  // Reset states on open
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setDiscrepancyReason('');
      setOwnerPin('');
    }
  }, [isOpen]);

  if (!isOpen || !targetShift || !metrics) return null;

  const actualCashNum = Number(actualCashInput) || 0;
  const discrepancy = actualCashNum - metrics.expectedCash;
  const hasDiscrepancy = discrepancy !== 0;
  const requiresOwnerApproval = Math.abs(discrepancy) > threshold;

  const handleConfirmClose = async () => {
    setErrorMsg('');

    if (actualCashInput.trim() === '') {
      setErrorMsg('Masukkan jumlah uang fisik aktual di laci.');
      return;
    }

    if (hasDiscrepancy && !discrepancyReason.trim()) {
      setErrorMsg('Selisih kas terdeteksi. Alasan / Reason wajib diisi!');
      return;
    }

    if (hasDiscrepancy && requiresOwnerApproval && !ownerPin.trim()) {
      setErrorMsg(`Selisih kas (Rp ${Math.abs(discrepancy).toLocaleString()}) melebihi toleransi (Rp ${threshold.toLocaleString()}). Masukkan PIN Owner untuk otorisasi.`);
      return;
    }

    setIsSubmitting(true);
    try {
      let approvedOwnerName: string | undefined = undefined;

      if (requiresOwnerApproval) {
        const owner = await db.users.filter(u => u.role === 'OWNER' && u.pinHash === ownerPin.trim()).first();
        if (!owner) {
          throw new Error('PIN Owner salah! Otorisasi selisih ditolak.');
        }
        approvedOwnerName = owner.name;
      }

      await ShiftService.clockOut({
        shiftId: targetShift.shiftId,
        actualCash: actualCashNum,
        discrepancyReason: discrepancyReason.trim(),
        ownerPinApproval: ownerPin.trim(),
        approvedByOwner: approvedOwnerName,
        endNotes: endNotes.trim(),
        currentDeviceId: deviceId
      });

      addToast('Shift berhasil ditutup dan kas direkonsiliasi!', 'success');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menutup shift.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[260] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-8"
      >
        {/* Header */}
        <div className="flex justify-between items-start pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-rose-200">
              <Lock size={24} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-xl uppercase tracking-tight">
                Clock Out / Closing Kasir
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Shift ID: {targetShift.shiftId.slice(-8).toUpperCase()}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Smartphone size={12} /> {deviceId}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock size={12} /> Mulai: {format(new Date(targetShift.startTime), 'HH:mm')}
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

        {/* Content Body */}
        <div className="py-6 space-y-6 max-h-[calc(85vh-160px)] overflow-y-auto pr-1">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                <Receipt size={12} /> Transaksi
              </div>
              <p className="text-xl font-black text-slate-900 tabular-nums">
                {metrics.transactionCount}
              </p>
              <span className="text-[10px] font-bold text-slate-400">Total struk selesai</span>
            </div>

            <div className="p-3.5 bg-blue-50/70 border border-blue-200/60 rounded-2xl">
              <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-600 mb-1">
                <TrendingUp size={12} /> Omzet
              </div>
              <p className="text-xl font-black text-blue-900 tabular-nums">
                Rp {metrics.omzet.toLocaleString()}
              </p>
              <span className="text-[10px] font-bold text-blue-500">Total penjualan</span>
            </div>

            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/60 rounded-2xl">
              <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 mb-1">
                <PlusCircle size={12} /> Cash In
              </div>
              <p className="text-xl font-black text-emerald-900 tabular-nums">
                Rp {metrics.cashIn.toLocaleString()}
              </p>
              <span className="text-[10px] font-bold text-emerald-600">Modal + Kas Tunai</span>
            </div>

            <div className="p-3.5 bg-rose-50/70 border border-rose-200/60 rounded-2xl">
              <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-rose-600 mb-1">
                <MinusCircle size={12} /> Cash Out
              </div>
              <p className="text-xl font-black text-rose-900 tabular-nums">
                Rp {metrics.cashOut.toLocaleString()}
              </p>
              <span className="text-[10px] font-bold text-rose-500">Pengeluaran kasir</span>
            </div>
          </div>

          {/* Payment Breakdown Cards */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <CreditCard size={14} /> Rincian Metode Pembayaran (Payment Breakdown)
              </span>
              <span className="text-[10px] font-bold text-slate-400">Modal Awal: Rp {targetShift.startingCash.toLocaleString()}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {Object.entries(metrics.paymentBreakdown).map(([method, amt]) => (
                <div key={method} className="bg-white p-2.5 rounded-xl border border-slate-200 text-center">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                    {method}
                  </span>
                  <span className="text-xs font-black text-slate-900 tabular-nums">
                    Rp {amt.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Cash Calculation & Actual Input */}
          <div className="bg-gradient-to-br from-indigo-50/50 to-blue-50/40 p-5 rounded-2xl border border-blue-100 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">
                  Expected Cash (Uang Kas Yang Diharapkan)
                </span>
                <p className="text-2xl font-black text-slate-900 tabular-nums">
                  Rp {metrics.expectedCash.toLocaleString()}
                </p>
                <p className="text-[10px] font-medium text-slate-400">
                  (Modal Rp {targetShift.startingCash.toLocaleString()} + Tunai Rp {metrics.cashSales.toLocaleString()} - Pengeluaran Rp {metrics.cashOut.toLocaleString()})
                </p>
              </div>

              <div className="w-full sm:w-60">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-700 block mb-1">
                  Input Uang Fisik Aktual (Laci) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">Rp</span>
                  <input
                    type="number"
                    autoFocus
                    placeholder="0"
                    value={actualCashInput ?? ''}
                    onChange={(e) => setActualCashInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-3 bg-white border-2 border-blue-400 rounded-xl text-lg font-black text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Live Discrepancy Preview */}
            <div className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${
              discrepancy === 0
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : discrepancy > 0
                ? 'bg-blue-50 border-blue-300 text-blue-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}>
              <div className="flex items-center gap-2">
                {discrepancy === 0 ? (
                  <CheckCircle size={18} className="text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle size={18} className={discrepancy > 0 ? 'text-blue-600 shrink-0' : 'text-rose-600 shrink-0'} />
                )}
                <div>
                  <span className="font-bold text-xs">Status Selisih (Discrepancy):</span>
                  <span className="font-black text-sm ml-2 tabular-nums">
                    {discrepancy === 0
                      ? '✓ PAS / SESUAI (Rp 0)'
                      : `${discrepancy > 0 ? '+Rp ' : '-Rp '}${Math.abs(discrepancy).toLocaleString()} (${discrepancy > 0 ? 'SURPLUS / LEBIH' : 'DEFISIT / KURANG'})`}
                  </span>
                </div>
              </div>

              {hasDiscrepancy && (
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                  requiresOwnerApproval ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800'
                }`}>
                  {requiresOwnerApproval ? 'Butuh Approval Owner' : 'Dalam Batas Toleransi'}
                </span>
              )}
            </div>
          </div>

          {/* Discrepancy Reason Input (Required when discrepancy !== 0) */}
          {hasDiscrepancy && (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-3">
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-amber-900 block mb-1">
                  Alasan Selisih Kasir / Reason (Wajib Diisi) *
                </label>
                <textarea
                  rows={2}
                  value={discrepancyReason ?? ''}
                  onChange={(e) => setDiscrepancyReason(e.target.value)}
                  placeholder="Contoh: Salah pengembalian uang receh struk #42, uang kembalian sobek diganti..."
                  className="w-full p-3 bg-white border border-amber-300 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none shadow-sm"
                />
              </div>

              {/* Owner Approval Section when discrepancy > threshold */}
              {requiresOwnerApproval && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-800 text-xs font-bold">
                    <ShieldCheck size={16} className="text-rose-600 shrink-0" />
                    <span>Otorisasi PIN Owner Diperlukan (Batas Toleransi: Rp {threshold.toLocaleString()})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        maxLength={6}
                        placeholder="Masukkan 6 Digit PIN Owner (123456)"
                        value={ownerPin ?? ''}
                        onChange={(e) => setOwnerPin(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-rose-300 rounded-xl text-center font-black tracking-widest text-slate-900 outline-none focus:ring-2 focus:ring-rose-500 text-sm shadow-sm"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 italic">
                    * Penyesuaian selisih akan dicatat sebagai rekonsiliasi kas terpisah dan tidak mengubah transaksi penjualan di buku besar (ledger).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* General End Notes */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block mb-1">
              Catatan Penutupan Shift (Opsional)
            </label>
            <textarea
              rows={2}
              value={endNotes ?? ''}
              onChange={(e) => setEndNotes(e.target.value)}
              placeholder="Catatan umum kondisi laci, pergantian shift, stok menipis, dll."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-400 resize-none"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-bold">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirmClose}
            disabled={isSubmitting}
            className="flex-2 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2"
          >
            <Lock size={16} />
            {isSubmitting ? 'Memproses Closing...' : 'Tutup Shift & Rekonsiliasi Kas'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
