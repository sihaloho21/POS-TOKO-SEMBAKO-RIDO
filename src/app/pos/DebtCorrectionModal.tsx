import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  AlertCircle, 
  CheckCircle2, 
  User as UserIcon, 
  Calendar, 
  Lock, 
  Wallet, 
  Receipt, 
  ShieldCheck, 
  Plus, 
  DollarSign, 
  ArrowRight,
  Printer
} from 'lucide-react';
import { db } from '@/core/database';
import { useAuthStore } from '@/core/auth-store';
import { useDeviceId } from '@/core/device-store';
import { useToastStore } from '@/core/toast-store';
import { TransactionEngine } from '@/core/transaction-engine';
import { PrintService } from '@/core/utils/print-service';
import type { Transaction, Customer } from '@/core/types';
import { addDays, format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

interface DebtCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  onSuccess?: (result: { receiptNumber: string; remainingDebt: number; customerName: string }) => void;
}

export function DebtCorrectionModal({
  isOpen,
  onClose,
  transaction,
  onSuccess
}: DebtCorrectionModalProps) {
  const { currentUser } = useAuthStore();
  const deviceId = useDeviceId();
  const { addToast } = useToastStore();

  const [actualPaidAmount, setActualPaidAmount] = useState<number>(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isQuickAddCustomer, setIsQuickAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  
  const [dueDateOption, setDueDateOption] = useState<number>(1); // 1 = besok
  const [customDueDate, setCustomDueDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('Uang fisik pembeli kurang saat transaksi, dicatat sebagai bon piutang.');
  
  const [ownerPinInput, setOwnerPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customersList, setCustomersList] = useState<Customer[]>([]);

  // Load customers
  useEffect(() => {
    if (!isOpen) return;
    db.customers.toArray().then(data => {
      setCustomersList(data);
    });
  }, [isOpen]);

  // Initialize values when modal opens with a transaction
  useEffect(() => {
    if (transaction && isOpen) {
      // Default actualPaid to 0 or transaction.paidAmount if already partial, or 95% of total
      setActualPaidAmount(0);
      setSelectedCustomerId(transaction.customerId || '');
      setIsQuickAddCustomer(!transaction.customerId);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setDueDateOption(1); // default besok
      setCustomDueDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
      setNotes('Uang fisik pembeli kurang saat transaksi, dicatat sebagai bon piutang.');
      setOwnerPinInput('');
      setPinError('');
    }
  }, [transaction, isOpen]);

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customersList.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return customersList.filter(c => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))).slice(0, 8);
  }, [customersList, customerSearch]);

  const selectedCustomer = useMemo(() => {
    return customersList.find(c => c.customerId === selectedCustomerId) || null;
  }, [customersList, selectedCustomerId]);

  if (!isOpen || !transaction) return null;

  const totalBill = transaction.total;
  const remainingDebt = Math.max(0, totalBill - (actualPaidAmount || 0));
  const isOwner = currentUser?.role === 'OWNER';

  // Quick preset buttons for actual paid amount
  const presetOptions = [
    Math.round(totalBill * 0.95), // 95% (misal 95.000 dari 100.000)
    Math.round(totalBill * 0.9),  // 90%
    Math.round(totalBill * 0.5),  // 50%
    0                             // 0 (belum bayar sama sekali)
  ].filter(val => val >= 0 && val < totalBill);

  const handleSubmit = async () => {
    if (!currentUser) return;
    setPinError('');

    if (actualPaidAmount < 0) {
      addToast('Nominal uang yang diterima tidak boleh negatif.', 'error');
      return;
    }

    if (actualPaidAmount >= totalBill) {
      addToast('Nominal yang diterima harus lebih kecil dari total belanja untuk mencatat sisa utang.', 'error');
      return;
    }

    // Resolve Customer ID
    let finalCustId = selectedCustomerId;
    let finalCustName = selectedCustomer?.name || '';

    if (isQuickAddCustomer) {
      if (!newCustomerName.trim()) {
        addToast('Nama pelanggan wajib diisi untuk mencatat data utang/bon.', 'error');
        return;
      }
      // Check existing by name or create new
      const existing = customersList.find(c => c.name.toLowerCase() === newCustomerName.trim().toLowerCase());
      if (existing) {
        finalCustId = existing.customerId;
        finalCustName = existing.name;
      } else {
        finalCustId = uuidv4();
        finalCustName = newCustomerName.trim();
        const newCust: Customer = {
          customerId: finalCustId,
          name: finalCustName,
          phone: newCustomerPhone.trim(),
          isReseller: false,
          creditLimit: 500000,
          defaultDueDateDays: dueDateOption || 7,
          loyaltyPoints: 0,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await db.customers.add(newCust);
      }
    } else {
      if (!finalCustId) {
        addToast('Pilih pelanggan atau masukkan nama pelanggan baru.', 'error');
        return;
      }
    }

    // If Kasir, check Owner PIN
    if (!isOwner) {
      if (!ownerPinInput.trim()) {
        setPinError('PIN Owner diperlukan untuk otorisasi koreksi transaksi ke piutang.');
        return;
      }
      const ownerUser = await db.users.filter(u => u.role === 'OWNER' && u.pinHash === ownerPinInput.trim()).first();
      if (!ownerUser) {
        setPinError('PIN Owner salah! Otorisasi koreksi piutang ditolak.');
        return;
      }
    }

    // Determine Due Date
    let finalDueDateStr: string;
    if (customDueDate) {
      finalDueDateStr = new Date(customDueDate).toISOString();
    } else {
      finalDueDateStr = addDays(new Date(), dueDateOption || 1).toISOString();
    }

    setIsSubmitting(true);
    try {
      const result = await TransactionEngine.convertToPartialPaymentWithReceivable({
        transactionId: transaction.transactionId,
        actualPaidAmount: actualPaidAmount,
        customerId: finalCustId,
        dueDate: finalDueDateStr,
        notes: notes.trim(),
        userId: currentUser.userId,
        role: currentUser.role,
        deviceId: deviceId
      });

      addToast(
        `Koreksi Sukses! Nota #${transaction.receiptNumber} diubah: Diterima Rp ${actualPaidAmount.toLocaleString()}, Sisa Rp ${remainingDebt.toLocaleString()} dicatat jadi Piutang ${finalCustName}.`,
        'success'
      );

      // Print updated receipt
      const updatedTx = await db.transactions.get(transaction.transactionId);
      if (updatedTx) {
        PrintService.printReceipt(updatedTx);
      }

      if (onSuccess) {
        onSuccess({
          receiptNumber: transaction.receiptNumber,
          remainingDebt: remainingDebt,
          customerName: finalCustName
        });
      }

      onClose();
    } catch (err: any) {
      console.error('Failed to convert to partial receivable:', err);
      addToast(err?.message || 'Gagal mengoreksi transaksi ke piutang.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 animate-in zoom-in-95 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-black">
              <Wallet size={20} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">
                Koreksi Transaksi Jadi Piutang (Bon)
              </h3>
              <p className="text-xs text-slate-500">
                Uang pembeli kurang setelah transaksi terlanjur dikonfirmasi
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Info Box Nota Asal */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 mb-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-bold uppercase tracking-wider">No. Struk Penjualan</span>
            <span className="font-mono font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
              {transaction.receiptNumber}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-bold">Waktu Transaksi</span>
            <span className="font-medium text-slate-700">
              {format(new Date(transaction.clientTimestamp), 'dd MMM yyyy, HH:mm')}
            </span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-200">
            <span className="font-black text-slate-800 text-xs uppercase tracking-wider">Total Tagihan Belanja</span>
            <span className="text-lg font-black text-blue-600 tabular-nums">
              Rp {totalBill.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Input: Uang Fisik yang Sebenarnya Diterima */}
        <div className="space-y-3 mb-5">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                1. Uang Fisik yang Sebenarnya Diterima di Kasir (Rp) *
              </label>
              <span className="text-[10px] text-slate-400">Contoh: Rp 95.000</span>
            </div>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">Rp</div>
              <input
                type="number"
                min={0}
                max={totalBill - 1}
                step={1000}
                value={actualPaidAmount === 0 ? '' : actualPaidAmount}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setActualPaidAmount(val >= 0 ? val : 0);
                }}
                placeholder="0"
                className="w-full pl-10 pr-4 py-3 bg-white border-2 border-amber-300 rounded-2xl text-xl font-black text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] text-slate-400 font-bold mr-1">Opsi Cepat:</span>
            {presetOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setActualPaidAmount(opt)}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-black tabular-nums transition-all ${
                  actualPaidAmount === opt
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {opt === 0 ? 'Belum Bayar (Rp 0)' : `Rp ${opt.toLocaleString()}`}
              </button>
            ))}
          </div>

          {/* Automatic Calculation Card */}
          <div className="grid grid-cols-2 gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Masuk ke Kas Laci</span>
              <span className="text-sm font-black text-emerald-600 tabular-nums">
                Rp {actualPaidAmount.toLocaleString()}
              </span>
              <p className="text-[9px] text-slate-500">Saldo kasir disesuaikan otomatis</p>
            </div>
            <div className="space-y-0.5 border-l border-amber-200 pl-3">
              <span className="text-[10px] uppercase font-black text-amber-900 block">Sisa Utang (Bon) Otomatis</span>
              <span className="text-base font-black text-rose-600 tabular-nums">
                Rp {remainingDebt.toLocaleString()}
              </span>
              <p className="text-[9px] text-amber-700 font-medium">Masuk ke daftar Piutang</p>
            </div>
          </div>
        </div>

        {/* Customer Assignment */}
        <div className="space-y-2 mb-5">
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <UserIcon size={14} className="text-blue-600" />
              2. Data Pelanggan yang Berutang *
            </label>
            <button
              type="button"
              onClick={() => setIsQuickAddCustomer(!isQuickAddCustomer)}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
            >
              {isQuickAddCustomer ? 'Pilih dari Daftar' : '+ Tambah Pelanggan Baru'}
            </button>
          </div>

          {isQuickAddCustomer ? (
            <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-2xl space-y-2.5">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                  Nama Pelanggan / Pembeli *
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pak Budi / Bu Siti / Tetangga Depan"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                  Nomor HP / WhatsApp (Opsional untuk reminder)
                </label>
                <input
                  type="tel"
                  placeholder="0812xxxx"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
              >
                <option value="">-- Pilih Pelanggan Terdaftar --</option>
                {customersList.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Due Date Selector */}
        <div className="space-y-2 mb-5">
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Calendar size={14} className="text-amber-600" />
            3. Janji Bayar / Jatuh Tempo Pelunasan
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: 'Besok (+1 Hr)', days: 1 },
              { label: '3 Hari', days: 3 },
              { label: '7 Hari (1 Mgg)', days: 7 },
              { label: '14 Hari', days: 14 }
            ].map((d) => (
              <button
                key={d.days}
                type="button"
                onClick={() => {
                  setDueDateOption(d.days);
                  setCustomDueDate(format(addDays(new Date(), d.days), 'yyyy-MM-dd'));
                }}
                className={`py-2 px-1 rounded-xl text-[10px] font-bold text-center border transition-all ${
                  dueDateOption === d.days
                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] text-slate-500 font-bold shrink-0">Tanggal Jatuh Tempo:</span>
            <input
              type="date"
              value={customDueDate}
              onChange={(e) => {
                setCustomDueDate(e.target.value);
                setDueDateOption(0);
              }}
              className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1 mb-5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Catatan Tambahan (Opsional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contoh: Janji bayar saat dapat transfer besok sore"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-blue-500"
          />
        </div>

        {/* Owner PIN Authorization for Kasir */}
        {!isOwner && (
          <div className="p-3.5 bg-slate-50 border border-amber-300/80 rounded-2xl mb-5 space-y-2">
            <div className="flex items-center gap-2 text-amber-800">
              <ShieldCheck size={16} />
              <span className="text-xs font-black uppercase tracking-wider">Otorisasi Owner Diperlukan</span>
            </div>
            <p className="text-[11px] text-slate-600">
              Koreksi transaksi mengubah saldo kas laci kasir dan mencatat piutang baru. Masukkan 6 digit PIN Owner.
            </p>
            <input
              type="password"
              maxLength={6}
              placeholder="PIN Owner"
              value={ownerPinInput}
              onChange={(e) => {
                setOwnerPinInput(e.target.value);
                setPinError('');
              }}
              className="w-full text-center py-2 bg-white border border-slate-300 rounded-xl font-mono text-lg font-black tracking-widest outline-none focus:border-amber-500"
            />
            {pinError && (
              <p className="text-rose-600 text-[11px] font-bold text-center">{pinError}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl uppercase tracking-wider transition-all"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || actualPaidAmount >= totalBill}
            className="flex-[2] py-3 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-200 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <span>Memproses...</span>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>Simpan Koreksi (Sisa Rp {remainingDebt.toLocaleString()})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
