import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  X,
  Wallet,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  ShieldCheck,
  Building,
  CreditCard,
  AlertTriangle,
  Receipt
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuthStore } from '@/core/auth-store';
import { useDeviceId } from '@/core/device-store';
import { useToastStore } from '@/core/toast-store';
import { StaffDebtService, type StaffDebtItem } from '@/core/services/staff-debt-service';

export interface KasbonRepaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffDebt: StaffDebtItem | null;
  onSuccess?: () => void;
}

export const KasbonRepaymentModal: React.FC<KasbonRepaymentModalProps> = ({
  isOpen,
  onClose,
  staffDebt,
  onSuccess
}) => {
  const { currentUser } = useAuthStore();
  const deviceId = useDeviceId();
  const { addToast } = useToastStore();

  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'POTONG_GAJI' | 'CASH' | 'TRANSFER' | 'QRIS'>('POTONG_GAJI');
  const [moneyStorageId, setMoneyStorageId] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL'>('WARUNG');
  const [paymentDate, setPaymentDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState<string>('');
  const [ownerPin, setOwnerPin] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (isOpen && staffDebt) {
      setAmount(staffDebt.remainingAmount);
      setPaymentMethod('POTONG_GAJI');
      setMoneyStorageId('WARUNG');
      setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
      setOwnerPin('');
      setErrorMessage('');

      const isShift = staffDebt.sourceType === 'SHIFT_DISCREPANCY';
      const defaultNote = isShift && staffDebt.shift
        ? `Pelunasan selisih kas shift #${staffDebt.shift.shiftId.slice(-6).toUpperCase()}`
        : `Pembayaran kasbon ${staffDebt.customer.name}`;
      setNotes(defaultNote);
    }
  }, [isOpen, staffDebt]);

  if (!isOpen || !staffDebt) return null;

  const remainingBefore = staffDebt.remainingAmount;
  const remainingAfter = Math.max(0, remainingBefore - (amount || 0));
  const isFullSettlement = amount >= remainingBefore && remainingBefore > 0;

  const handlePreset = (fraction: number) => {
    const calculated = Math.round(remainingBefore * fraction);
    setAmount(calculated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setErrorMessage('');

    if (!amount || amount <= 0) {
      setErrorMessage('Nominal pembayaran harus lebih besar dari Rp 0.');
      return;
    }

    if (amount > remainingBefore) {
      setErrorMessage(`Nominal pembayaran melebihi sisa tanggungan (Maks: Rp ${remainingBefore.toLocaleString()}).`);
      return;
    }

    if (!ownerPin.trim()) {
      setErrorMessage('Masukkan PIN Owner untuk mengotorisasi pembayaran/potong gaji.');
      return;
    }

    setIsSubmitting(true);
    try {
      await StaffDebtService.recordStaffKasbonPayment({
        receivableId: staffDebt.receivable.receivableId,
        amount,
        paymentMethod,
        moneyStorageId: paymentMethod === 'CASH' ? moneyStorageId : 'UANG_DIGITAL',
        paymentDate,
        notes: notes.trim(),
        ownerUserId: currentUser.userId,
        ownerPin: ownerPin.trim(),
        deviceId
      });

      addToast(
        isFullSettlement
          ? `✓ Kasbon ${staffDebt.customer.name} sebesar Rp ${staffDebt.totalAmount.toLocaleString()} telah LUNAS via ${paymentMethod}!`
          : `✓ Pembayaran cicilan kasbon Rp ${amount.toLocaleString()} untuk ${staffDebt.customer.name} berhasil dicatat! Sisa: Rp ${remainingAfter.toLocaleString()}`,
        'success'
      );

      onSuccess?.();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memproses pembayaran kasbon.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-6 animate-in zoom-in-95">
        {/* Header */}
        <div className="flex justify-between items-start pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-200">
              <DollarSign size={24} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">
                Pelunasan & Cicilan Kasbon Kasir
              </h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Pembayaran Parsial / Penuh & Tautkan ke Selisih Asal
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
          >
            <X size={20} />
          </button>
        </div>

        {/* Linked Origin Difference Card */}
        <div className="my-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-black text-sm flex items-center justify-center uppercase">
                {staffDebt.customer.name.replace('Kasir - ', '')[0] || 'K'}
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase">
                  {staffDebt.customer.name}
                </h4>
                <span className="text-[10px] text-slate-500 font-bold block">
                  Ref: <span className="font-mono text-indigo-700">{staffDebt.receivable.transactionId}</span>
                </span>
              </div>
            </div>

            <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase ${
              staffDebt.sourceType === 'SHIFT_DISCREPANCY'
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : 'bg-blue-100 text-blue-900 border border-blue-300'
            }`}>
              {staffDebt.sourceType === 'SHIFT_DISCREPANCY' ? 'Selisih Kas Laci' : 'Pinjaman Langsung'}
            </span>
          </div>

          {staffDebt.shift && (
            <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs">
              <div className="flex justify-between items-center text-amber-900 font-black text-[11px] uppercase">
                <span className="flex items-center gap-1">
                  <AlertTriangle size={13} className="text-amber-600" />
                  Sesi Shift: #{staffDebt.shift.shiftId.slice(-6).toUpperCase()}
                </span>
                <span className="text-rose-600 font-mono">
                  Selisih: -Rp {Math.abs(staffDebt.shift.discrepancy || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-[10px] text-amber-800 mt-1 font-medium">
                Waktu Shift: {format(new Date(staffDebt.shift.startTime), 'dd MMM yyyy HH:mm')}
                {staffDebt.shift.discrepancyReason ? ` • Catatan Kasir: "${staffDebt.shift.discrepancyReason}"` : ''}
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="bg-white p-2 rounded-xl border border-slate-200">
              <span className="text-[9px] font-black uppercase text-slate-400 block">Total Awal</span>
              <span className="text-xs font-black text-slate-800 tabular-nums">
                Rp {staffDebt.totalAmount.toLocaleString()}
              </span>
            </div>
            <div className="bg-white p-2 rounded-xl border border-slate-200">
              <span className="text-[9px] font-black uppercase text-emerald-600 block">Telah Dibayar</span>
              <span className="text-xs font-black text-emerald-600 tabular-nums">
                Rp {staffDebt.paidAmount.toLocaleString()}
              </span>
            </div>
            <div className="bg-white p-2 rounded-xl border border-rose-200">
              <span className="text-[9px] font-black uppercase text-rose-600 block">Sisa Hutang</span>
              <span className="text-xs font-black text-rose-600 tabular-nums">
                Rp {remainingBefore.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Quick Preset Buttons */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                Pilih Jenis Pembayaran
              </label>
              <span className="text-[10px] font-bold text-indigo-600">
                {isFullSettlement ? '✓ Pelunasan Penuh' : 'Cicilan Sebagian'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handlePreset(1.0)}
                className={`py-2 px-1 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                  amount === remainingBefore
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                100% Lunas
              </button>
              <button
                type="button"
                onClick={() => handlePreset(0.5)}
                className={`py-2 px-1 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                  amount === Math.round(remainingBefore * 0.5)
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                50% Cicil
              </button>
              <button
                type="button"
                onClick={() => handlePreset(0.25)}
                className={`py-2 px-1 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                  amount === Math.round(remainingBefore * 0.25)
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                25% Cicil
              </button>
              <button
                type="button"
                onClick={() => setAmount(0)}
                className="py-2 px-1 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
              >
                Kustom
              </button>
            </div>
          </div>

          {/* Amount Input & Projection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                Nominal Pembayaran (Rp) *
              </label>
              <input
                type="number"
                min="1"
                max={remainingBefore}
                required
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-black text-emerald-600 tabular-nums outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="0"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                Sisa Setelah Pembayaran
              </label>
              <div className={`p-2 rounded-xl border text-sm font-black tabular-nums flex items-center justify-between ${
                remainingAfter === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}>
                <span>Rp {remainingAfter.toLocaleString()}</span>
                <span className="text-[10px] uppercase tracking-wider font-extrabold">
                  {remainingAfter === 0 ? '✓ LUNAS' : 'SISA HUTANG'}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1.5">
              Metode Pembayaran Kasbon *
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('POTONG_GAJI')}
                className={`p-2.5 rounded-2xl border text-center transition-all ${
                  paymentMethod === 'POTONG_GAJI'
                    ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Receipt size={18} className="mx-auto mb-1 text-indigo-600" />
                <span className="text-[10px] font-black uppercase block text-indigo-950">
                  Potong Gaji
                </span>
                <span className="text-[9px] text-slate-500 font-medium block">
                  Payroll Deduction
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('CASH')}
                className={`p-2.5 rounded-2xl border text-center transition-all ${
                  paymentMethod === 'CASH'
                    ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Wallet size={18} className="mx-auto mb-1 text-emerald-600" />
                <span className="text-[10px] font-black uppercase block text-emerald-950">
                  Uang Tunai
                </span>
                <span className="text-[9px] text-slate-500 font-medium block">
                  Kas Warung / Fisik
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('TRANSFER')}
                className={`p-2.5 rounded-2xl border text-center transition-all ${
                  paymentMethod === 'TRANSFER'
                    ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <CreditCard size={18} className="mx-auto mb-1 text-blue-600" />
                <span className="text-[10px] font-black uppercase block text-blue-950">
                  Bank / QRIS
                </span>
                <span className="text-[9px] text-slate-500 font-medium block">
                  Kas Uang Digital
                </span>
              </button>
            </div>
          </div>

          {/* If Cash, select storage */}
          {paymentMethod === 'CASH' && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                Laci Penyimpanan Kas Masuk
              </label>
              <select
                value={moneyStorageId}
                onChange={(e) => setMoneyStorageId(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="WARUNG">Kas Warung Sembako (Laci Utama)</option>
                <option value="IKAN">Kas Ikan Basah</option>
              </select>
            </div>
          )}

          {/* Date and Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                Tanggal Transaksi *
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                Keterangan / Ref Tambahan
              </label>
              <input
                type="text"
                placeholder="Contoh: Potong gaji kasir periode Oktober"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Owner PIN Authorization */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-800">
              <Lock size={14} className="text-emerald-600" />
              Otorisasi PIN Owner *
            </div>
            <input
              type="password"
              maxLength={6}
              required
              placeholder="Masukkan 6-digit PIN Owner"
              value={ownerPin}
              onChange={(e) => setOwnerPin(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 tracking-widest text-center"
            />
            <p className="text-[10px] text-slate-400 text-center">
              Pembayaran dan pemotongan kasbon kasir wajib diotorisasi oleh Owner toko.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-emerald-200 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                'Memproses Pembayaran...'
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>{isFullSettlement ? '✓ Simpan Pelunasan Penuh' : '✓ Simpan Pembayaran Cicilan'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
