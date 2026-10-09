import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  X,
  Wallet,
  Calendar,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { Receivable } from '@/core/types';
import { FinanceService } from '@/core/services/finance-service';
import { useAuthStore } from '@/core/auth-store';
import { useDeviceId } from '@/core/device-store';
import { useToastStore } from '@/core/toast-store';

export interface EnrichedReceivableItem extends Receivable {
  effectiveStatus: string;
  customerName: string;
  customerPhone: string;
  receiptNumber: string;
}

export interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialReceivable: EnrichedReceivableItem | null;
  availableReceivables: EnrichedReceivableItem[];
  shiftId?: string;
  onSuccess?: (info: { amount: number; isFullSettlement: boolean; receivableId: string }) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  initialReceivable,
  availableReceivables,
  shiftId,
  onSuccess
}) => {
  const { currentUser } = useAuthStore();
  const deviceId = useDeviceId();
  const { addToast } = useToastStore();

  const activeReceivables = useMemo(
    () => availableReceivables.filter(r => r.remainingAmount > 0 && r.effectiveStatus !== 'VOIDED'),
    [availableReceivables]
  );

  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  const [selectedReceivableId, setSelectedReceivableId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(todayStr);
  const [paymentMethodId, setPaymentMethodId] = useState<'CASH' | 'TRANSFER' | 'QRIS'>('CASH');
  const [moneyStorageId, setMoneyStorageId] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL'>('WARUNG');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const ledgerBalances = useLiveQuery(() => FinanceService.getLedgerBalances(), []);
  const currentStorageBalance = ledgerBalances ? ledgerBalances[moneyStorageId] : 0;
  const projectedStorageBalance = currentStorageBalance + (amount > 0 ? amount : 0);

  const selectedReceivable = useMemo(() => {
    return (
      activeReceivables.find(r => r.receivableId === selectedReceivableId) ||
      initialReceivable ||
      activeReceivables[0] ||
      null
    );
  }, [activeReceivables, selectedReceivableId, initialReceivable]);

  useEffect(() => {
    if (isOpen) {
      const target = initialReceivable || activeReceivables[0] || null;
      setSelectedReceivableId(target?.receivableId || '');
      setAmount(target ? target.remainingAmount : 0);
      setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
      setPaymentMethodId('CASH');
      setMoneyStorageId('WARUNG');
      setNotes('');
    }
  }, [isOpen, initialReceivable]);

  const invoiceMinDateStr = useMemo(() => {
    if (!selectedReceivable?.createdAt) return '';
    try {
      return format(new Date(selectedReceivable.createdAt), 'yyyy-MM-dd');
    } catch {
      return '';
    }
  }, [selectedReceivable]);

  // Validation logic for Payment Date & Amount
  const validation = useMemo(() => {
    const errors: { amount?: string; paymentDate?: string } = {};

    if (!selectedReceivable) {
      return { isValid: false, errors };
    }

    // Amount validation
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      errors.amount = 'Nominal pembayaran wajib lebih besar dari Rp 0.';
    } else if (amount > selectedReceivable.remainingAmount) {
      errors.amount = `Nominal melebihi sisa tagihan (Maks: Rp ${selectedReceivable.remainingAmount.toLocaleString()}).`;
    }

    // Payment Date validation
    if (!paymentDate) {
      errors.paymentDate = 'Tanggal pembayaran wajib diisi.';
    } else {
      const parsed = new Date(`${paymentDate}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        errors.paymentDate = 'Format tanggal pembayaran tidak valid.';
      } else {
        const now = new Date();
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        if (parsed.getTime() > todayEnd.getTime()) {
          errors.paymentDate = 'Tanggal pembayaran tidak boleh di masa depan.';
        } else if (invoiceMinDateStr && paymentDate < invoiceMinDateStr) {
          errors.paymentDate = `Tanggal pembayaran tidak boleh sebelum tanggal nota dibuat (${format(
            new Date(selectedReceivable.createdAt),
            'dd MMM yyyy'
          )}).`;
        }
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }, [selectedReceivable, amount, paymentDate, invoiceMinDateStr]);

  if (!isOpen || !selectedReceivable) return null;

  const remainingAfterPayment = Math.max(0, selectedReceivable.remainingAmount - (amount || 0));
  const isFullSettlement = amount >= selectedReceivable.remainingAmount && selectedReceivable.remainingAmount > 0;

  const handleReceivableChange = (newId: string) => {
    setSelectedReceivableId(newId);
    const found = activeReceivables.find(r => r.receivableId === newId);
    if (found) {
      setAmount(found.remainingAmount);
    }
  };

  const handleStorageMethodChange = (storage: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL') => {
    setMoneyStorageId(storage);
    if (storage === 'UANG_DIGITAL') {
      if (paymentMethodId === 'CASH') {
        setPaymentMethodId('TRANSFER');
      }
    } else {
      setPaymentMethodId('CASH');
    }
  };

  const handleMethodChange = (method: 'CASH' | 'TRANSFER' | 'QRIS') => {
    setPaymentMethodId(method);
    if (method === 'QRIS' || method === 'TRANSFER') {
      setMoneyStorageId('UANG_DIGITAL');
    } else {
      setMoneyStorageId('WARUNG');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedReceivable) return;

    if (!validation.isValid) {
      const firstError = validation.errors.amount || validation.errors.paymentDate || 'Data pembayaran belum valid';
      addToast(firstError, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await FinanceService.addTransaction({
        userId: currentUser.userId,
        role: currentUser.role,
        deviceId,
        shiftId: shiftId || 'OWNER-DIRECT',
        customerId: selectedReceivable.customerId,
        receivableId: selectedReceivable.receivableId,
        referenceId: selectedReceivable.receivableId,
        referenceType: 'RECEIVABLE_PAYMENT',
        amount,
        storageId: moneyStorageId,
        direction: 'IN',
        paymentMethodId,
        paymentDate,
        notes,
        description: notes
      });

      addToast(
        isFullSettlement
          ? `Piutang #${selectedReceivable.receiptNumber} lunas! Saldo Kas ${moneyStorageId.replace('_', ' ')}: Rp ${result.storageBalanceAfter.toLocaleString()}`
          : `Pembayaran Rp ${amount.toLocaleString()} tercatat ke Finance Ledger & Audit Log!`,
        'success'
      );

      onSuccess?.({
        amount,
        isFullSettlement,
        receivableId: selectedReceivable.receivableId
      });
      onClose();
    } catch (err: any) {
      addToast(err.message || 'Gagal mencatat pembayaran piutang', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 max-h-[92vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <DollarSign size={20} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                Catat Pembayaran Piutang (Record Payment)
              </h3>
              <span className="text-[11px] font-bold text-slate-400">
                Potong saldo tagihan & catat arus kas masuk ke Finance Ledger
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Selector Nota Piutang */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1.5">
              Pilih Nota Piutang Aktif
            </label>
            <select
              value={selectedReceivable.receivableId ?? ''}
              onChange={(e) => handleReceivableChange(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
            >
              {activeReceivables.map(r => (
                <option key={r.receivableId} value={r.receivableId}>
                  #{r.receiptNumber} — {r.customerName} (Sisa: Rp {r.remainingAmount.toLocaleString()})
                </option>
              ))}
            </select>
          </div>

          {/* Ringkasan Saldo Nota */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Pelanggan & No. Nota:</span>
              <span className="font-black text-slate-900 uppercase flex items-center gap-1.5">
                <FileText size={13} className="text-blue-600" />
                {selectedReceivable.customerName} (#{selectedReceivable.receiptNumber})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Tanggal Nota / Jatuh Tempo:</span>
              <span className="font-bold text-slate-700">
                {format(new Date(selectedReceivable.createdAt), 'dd MMM yyyy')} • JT:{' '}
                {format(new Date(selectedReceivable.dueDate), 'dd MMM yyyy')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Total Tagihan Awal:</span>
              <span className="font-bold text-slate-700 tabular-nums">
                Rp {selectedReceivable.totalAmount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Sudah Dibayar Sebelumnya:</span>
              <span className="font-bold text-emerald-600 tabular-nums">
                Rp {selectedReceivable.paidAmount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 text-sm">
              <span className="font-black text-slate-900 uppercase">Sisa Tagihan Saat Ini:</span>
              <span className="font-black text-rose-600 tabular-nums">
                Rp {selectedReceivable.remainingAmount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Input Nominal & Tanggal Pembayaran */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-7">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1.5">
                Nominal Pembayaran (Rp) *
              </label>
              <input
                type="number"
                required
                min={1}
                max={selectedReceivable.remainingAmount}
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                placeholder="Masukkan nominal..."
                className={`w-full p-2.5 bg-white border rounded-xl text-lg font-black tabular-nums outline-none transition-all ${
                  validation.errors.amount
                    ? 'border-rose-400 text-rose-600 focus:ring-2 focus:ring-rose-500'
                    : 'border-slate-200 text-blue-600 focus:ring-2 focus:ring-blue-500'
                }`}
              />
            </div>

            <div className="sm:col-span-5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1.5">
                Tanggal Pembayaran *
              </label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  required
                  min={invoiceMinDateStr || undefined}
                  max={todayStr}
                  value={paymentDate ?? ''}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className={`w-full pl-8 pr-2.5 py-3 bg-white border rounded-xl text-xs font-bold outline-none transition-all ${
                    validation.errors.paymentDate
                      ? 'border-rose-400 text-rose-600 focus:ring-2 focus:ring-rose-500'
                      : 'border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Quick Amount Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Nominal Cepat:</span>
            <button
              type="button"
              onClick={() => setAmount(selectedReceivable.remainingAmount)}
              className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-[10px] font-black uppercase transition-colors"
            >
              Lunasi Penuh (100%)
            </button>
            <button
              type="button"
              onClick={() => setAmount(Math.round(selectedReceivable.remainingAmount / 2))}
              className="px-2.5 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-[10px] font-black uppercase transition-colors"
            >
              Cicil 50%
            </button>
            {selectedReceivable.remainingAmount >= 100000 && (
              <button
                type="button"
                onClick={() => setAmount(100000)}
                className="px-2.5 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-[10px] font-black uppercase transition-colors"
              >
                Rp 100.000
              </button>
            )}
            {selectedReceivable.remainingAmount >= 50000 && (
              <button
                type="button"
                onClick={() => setAmount(50000)}
                className="px-2.5 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-[10px] font-black uppercase transition-colors"
              >
                Rp 50.000
              </button>
            )}
          </div>

          {/* Validation Feedback Alerts */}
          {(validation.errors.amount || validation.errors.paymentDate) && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs font-bold">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-600" />
              <div className="space-y-0.5">
                {validation.errors.amount && <p>{validation.errors.amount}</p>}
                {validation.errors.paymentDate && <p>{validation.errors.paymentDate}</p>}
              </div>
            </div>
          )}

          {/* Metode Pembayaran & Tujuan Kas Finance Ledger (Warung, Ikan, Uang Digital) */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1.5">
                Metode & Buku Kas Tujuan (Warung, Ikan, atau Uang Digital) *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'WARUNG', label: 'Kas Warung', sub: 'Tunai Warung' },
                    { id: 'IKAN', label: 'Kas Ikan', sub: 'Tunai Ikan' },
                    { id: 'UANG_DIGITAL', label: 'Uang Digital', sub: 'Transfer / QRIS' }
                  ] as const
                ).map((item) => {
                  const isActive = moneyStorageId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleStorageMethodChange(item.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        isActive
                          ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 text-blue-900'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-xs font-black uppercase block">{item.label}</span>
                      <span className="text-[10px] font-medium text-slate-500 block">{item.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Saluran Pembayaran
                </label>
                <select
                  value={paymentMethodId ?? 'CASH'}
                  onChange={(e) => handleMethodChange(e.target.value as 'CASH' | 'TRANSFER' | 'QRIS')}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                >
                  <option value="CASH">TUNAI (CASH)</option>
                  <option value="TRANSFER">TRANSFER BANK</option>
                  <option value="QRIS">QRIS</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Buku Kas (Finance Ledger)
                </label>
                <select
                  value={moneyStorageId ?? 'WARUNG'}
                  onChange={(e) => handleStorageMethodChange(e.target.value as 'WARUNG' | 'IKAN' | 'UANG_DIGITAL')}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                >
                  <option value="WARUNG">WARUNG</option>
                  <option value="IKAN">IKAN</option>
                  <option value="UANG_DIGITAL">UANG DIGITAL</option>
                </select>
              </div>
            </div>
          </div>

          {/* Catatan Referensi */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
              Catatan / Referensi Bukti Bayar (Opsional)
            </label>
            <input
              type="text"
              placeholder="Contoh: Cicilan ke-1 via Transfer BCA / Diterima tunai..."
              value={notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
            />
          </div>

          {/* Preview Integrasi Finance Ledger */}
          <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-emerald-900">Sisa Piutang Setelah Pembayaran:</span>
              <span className="font-black text-emerald-700 text-sm tabular-nums flex items-center gap-1">
                {remainingAfterPayment === 0 && validation.isValid && <CheckCircle2 size={14} />}
                Rp {remainingAfterPayment.toLocaleString()} ({remainingAfterPayment === 0 ? 'LUNAS' : 'PARTIAL'})
              </span>
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-emerald-200/60 text-[11px]">
              <span className="font-bold text-emerald-800 flex items-center gap-1">
                <Wallet size={13} />
                Jurnal Kas Masuk ({paymentMethodId}):
              </span>
              <span className="font-black text-emerald-700 uppercase flex items-center gap-0.5 tabular-nums">
                <ArrowUpRight size={13} />
                + Rp {(amount || 0).toLocaleString()} → KAS {moneyStorageId.replace('_', ' ')}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-emerald-200/40 text-[11px]">
              <span className="font-medium text-emerald-800">
                Estimasi Saldo Kas {moneyStorageId.replace('_', ' ')} (Awal → Akhir):
              </span>
              <span className="font-black text-emerald-900 tabular-nums">
                Rp {currentStorageBalance.toLocaleString()} → Rp {projectedStorageBalance.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-100 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !validation.isValid}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-200 disabled:opacity-50 transition-all"
            >
              {isSubmitting ? 'Memproses...' : 'Simpan & Catat ke Kas'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
