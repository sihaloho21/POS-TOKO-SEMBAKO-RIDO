import React, { useState, useEffect } from 'react';
import { db } from '@/core/database';
import { useAuthStore } from '@/core/auth-store';
import { TransactionEngine } from '@/core/transaction-engine';
import { PrintService } from '@/core/utils/print-service';
import type { Transaction } from '@/core/types';
import { 
  RotateCcw, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  Unlock, 
  ShieldCheck, 
  Printer, 
  Package, 
  Layers, 
  ArrowRight,
  Info,
  DollarSign
} from 'lucide-react';

interface ReturnItemState {
  productId: string;
  nameSnapshot: string;
  originalQty: number;
  quantityToReturn: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  restock: boolean;
  isBundle?: boolean;
  bundleComponentsSnapshot?: any[];
  selected: boolean;
}

interface QuickRefundModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onSuccess?: (returnTx: Transaction) => void;
}

export function QuickRefundModal({
  isOpen,
  transaction,
  onClose,
  onSuccess
}: QuickRefundModalProps) {
  const { currentUser } = useAuthStore();
  const isDirectlyAuthorized = currentUser?.role === 'OWNER' || currentUser?.role === 'MANAGER';

  // Items to refund state
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([]);
  const [reasonCategory, setReasonCategory] = useState<string>('Barang Rusak / Cacat');
  const [customReason, setCustomReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [refundPaymentMethod, setRefundPaymentMethod] = useState<string>('TUNAI');
  const [refundStorageId, setRefundStorageId] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL'>('WARUNG');

  // PIN Authorization for Cashier/Staff
  const [supervisorPin, setSupervisorPin] = useState<string>('');
  const [isPinVerified, setIsPinVerified] = useState<boolean>(false);
  const [verifiedAuthorizerName, setVerifiedAuthorizerName] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');

  // Execution state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [completedReturnTx, setCompletedReturnTx] = useState<Transaction | null>(null);

  // Initialize modal state when opened
  useEffect(() => {
    if (transaction && isOpen) {
      const initialItems: ReturnItemState[] = transaction.items.map(item => ({
        productId: item.productId,
        nameSnapshot: item.nameSnapshot,
        originalQty: item.quantity,
        quantityToReturn: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
        restock: true, // Default to restock
        isBundle: !!item.isBundle,
        bundleComponentsSnapshot: item.bundleComponentsSnapshot,
        selected: true // Select all by default for convenience
      }));

      setReturnItems(initialItems);
      setRefundPaymentMethod(transaction.paymentMethodId || 'TUNAI');
      setRefundStorageId(transaction.moneyStorageId || 'WARUNG');
      setReasonCategory('Barang Rusak / Cacat');
      setCustomReason('');
      setNotes('');
      setSupervisorPin('');
      setIsPinVerified(isDirectlyAuthorized);
      setVerifiedAuthorizerName(isDirectlyAuthorized ? (currentUser?.name || 'Owner') : '');
      setPinError('');
      setErrorMessage('');
      setCompletedReturnTx(null);
    }
  }, [transaction, isOpen, isDirectlyAuthorized, currentUser]);

  if (!isOpen || !transaction) return null;

  // Toggle item selection
  const handleToggleSelect = (index: number) => {
    setReturnItems(prev => prev.map((item, i) => {
      if (i === index) {
        return { ...item, selected: !item.selected };
      }
      return item;
    }));
  };

  // Toggle Select All
  const handleToggleSelectAll = (select: boolean) => {
    setReturnItems(prev => prev.map(item => ({ ...item, selected: select })));
  };

  // Change return quantity
  const handleQtyChange = (index: number, newQty: number) => {
    setReturnItems(prev => prev.map((item, i) => {
      if (i === index) {
        // Enforce bounds: min 1 (or 0.1 for KG), max originalQty
        const clampedQty = Math.max(
          item.unit === 'KG' ? 0.05 : 1,
          Math.min(item.originalQty, newQty)
        );
        return {
          ...item,
          quantityToReturn: clampedQty,
          subtotal: Math.round(clampedQty * item.unitPrice)
        };
      }
      return item;
    }));
  };

  // Toggle restock status
  const handleToggleRestock = (index: number) => {
    setReturnItems(prev => prev.map((item, i) => {
      if (i === index) {
        return { ...item, restock: !item.restock };
      }
      return item;
    }));
  };

  // Verify supervisor PIN
  const handleVerifyPin = async () => {
    setPinError('');
    const cleanPin = supervisorPin.trim();
    if (!cleanPin) {
      setPinError('Masukkan PIN 6-digit.');
      return;
    }

    try {
      // Check for Owner/Manager in db.users or fallback master PIN 123456
      const supervisor = await db.users
        .filter(u => (u.role === 'OWNER' || u.role === 'MANAGER') && u.pinHash === cleanPin)
        .first();

      if (supervisor || cleanPin === '123456') {
        const authName = supervisor ? `${supervisor.name} (${supervisor.role})` : 'Owner Otorisasi (PIN 123456)';
        setIsPinVerified(true);
        setVerifiedAuthorizerName(authName);
        setPinError('');
      } else {
        setPinError('PIN Otorisasi salah! Hanya Owner/Manager yang dapat menyetujui refund.');
      }
    } catch {
      if (cleanPin === '123456') {
        setIsPinVerified(true);
        setVerifiedAuthorizerName('Owner Otorisasi (PIN 123456)');
        setPinError('');
      } else {
        setPinError('Gagal memverifikasi PIN.');
      }
    }
  };

  // Selected items calculation
  const selectedItems = returnItems.filter(i => i.selected);
  const totalCalculatedRefund = selectedItems.reduce((acc, i) => acc + i.subtotal, 0);

  // Submit Quick Refund
  const handleProcessRefund = async () => {
    if (selectedItems.length === 0) {
      setErrorMessage('Pilih minimal 1 barang untuk diretur.');
      return;
    }

    if (!isPinVerified && !isDirectlyAuthorized) {
      setErrorMessage('Otorisasi Owner/Manager diperlukan sebelum memproses refund.');
      return;
    }

    const effectiveReason = reasonCategory === 'Lainnya' 
      ? (customReason.trim() || 'Pengembalian barang')
      : reasonCategory + (customReason.trim() ? ` - ${customReason.trim()}` : '');

    const authorizer = isDirectlyAuthorized 
      ? `${currentUser?.name || 'Authorized'} (${currentUser?.role || 'STAFF'})`
      : verifiedAuthorizerName;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const itemsToReturnPayload = selectedItems.map(item => ({
        productId: item.productId,
        nameSnapshot: item.nameSnapshot,
        quantity: item.quantityToReturn,
        unit: item.unit,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        restock: item.restock,
        isBundle: item.isBundle,
        bundleComponentsSnapshot: item.bundleComponentsSnapshot
      }));

      const returnTx = await TransactionEngine.processQuickRefund({
        originalTransactionId: transaction.transactionId,
        staffId: currentUser?.userId || 'staff-1',
        staffName: currentUser?.name || 'Kasir',
        staffRole: currentUser?.role || 'KASIR',
        authorizedBy: authorizer,
        reason: effectiveReason,
        itemsToReturn: itemsToReturnPayload,
        refundAmount: totalCalculatedRefund,
        refundStorageId: refundStorageId,
        refundPaymentMethod: refundPaymentMethod,
        notes: notes.trim() || undefined
      });

      setCompletedReturnTx(returnTx);
      if (onSuccess) {
        onSuccess(returnTx);
      }
    } catch (err: any) {
      console.error('Quick refund error:', err);
      setErrorMessage(err.message || 'Gagal memproses Quick Refund.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintReturnReceipt = () => {
    if (completedReturnTx) {
      PrintService.printReceipt(completedReturnTx);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <RotateCcw size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">
                  Quick Refund & Retur Penjualan
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-mono font-black uppercase">
                  {transaction.receiptNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Pilih barang yang diretur, tentukan pengembalian kas, dan perbarui stok otomatis.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* Success Screen if completed */}
          {completedReturnTx ? (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center border-4 border-emerald-50">
                <CheckCircle2 size={36} />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  Quick Refund Berhasil Diproses!
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Nota retur telah dibuat dan saldo kas/stok telah disesuaikan secara real-time.
                </p>
              </div>

              {/* Receipt Summary Card */}
              <div className="w-full max-w-md bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left text-xs space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">No. Nota Retur:</span>
                  <span className="font-mono font-black text-purple-700 text-sm">
                    {completedReturnTx.receiptNumber}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Ref Transaksi Asal:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {completedReturnTx.originalReceiptNumber}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Total Dana Direfund:</span>
                  <span className="font-black text-rose-600 text-sm">
                    Rp {completedReturnTx.total.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Metode / Penyimpanan:</span>
                  <span className="font-bold text-slate-800">
                    {completedReturnTx.paymentMethodId} ({completedReturnTx.moneyStorageId})
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Diverifikasi Oleh:</span>
                  <span className="font-bold text-slate-800">
                    {completedReturnTx.authorizedBy}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 w-full max-w-md pt-2">
                <button
                  type="button"
                  onClick={handlePrintReturnReceipt}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-blue-200 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Printer size={16} />
                  <span>Cetak Struk Retur</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  Selesai & Tutup
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Original Transaction Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-xs">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Pelanggan
                  </span>
                  <span className="font-bold text-slate-800 truncate block">
                    {transaction.customerId ? 'Pelanggan Terdaftar' : 'Pelanggan Umum'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Kasir Asal
                  </span>
                  <span className="font-bold text-slate-800 truncate block">
                    {transaction.cashierId.slice(-6).toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Pembayaran Asal
                  </span>
                  <span className="font-bold text-slate-800 block">
                    {transaction.paymentMethodId}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Total Penjualan
                  </span>
                  <span className="font-black text-slate-900 block tabular-nums">
                    Rp {transaction.total.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Error Message banner */}
              {errorMessage && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Items Selection Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Package size={15} className="text-blue-600" />
                    Pilih Barang Yang Diretur
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleSelectAll(true)}
                      className="text-[11px] font-bold text-blue-600 hover:underline"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => handleToggleSelectAll(false)}
                      className="text-[11px] font-bold text-slate-500 hover:underline"
                    >
                      Hapus Pilihan
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                  {returnItems.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 transition-colors ${
                        item.selected ? 'bg-purple-50/30' : 'bg-white opacity-70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => handleToggleSelect(idx)}
                            className="mt-1 w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 cursor-pointer"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-xs">
                                {item.nameSnapshot}
                              </span>
                              {item.isBundle && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase flex items-center gap-1">
                                  <Layers size={10} />
                                  Paket Bundle
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500">
                              Dibeli: {item.originalQty} {item.unit} @ Rp {item.unitPrice.toLocaleString()}
                            </span>
                            {item.isBundle && (
                              <p className="text-[10px] text-indigo-700 font-medium mt-0.5">
                                * Retur paket wajib 1 paket utuh (semua item komponen dikembalikan).
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Item Subtotal */}
                        <div className="text-right">
                          <span className="font-black text-slate-900 text-xs tabular-nums block">
                            Rp {item.subtotal.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            Subtotal Retur
                          </span>
                        </div>
                      </div>

                      {/* Controls when selected */}
                      {item.selected && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                          {/* Qty Controls */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">
                              Jumlah Retur:
                            </span>
                            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                              <button
                                type="button"
                                disabled={item.isBundle || item.quantityToReturn <= (item.unit === 'KG' ? 0.1 : 1)}
                                onClick={() => handleQtyChange(idx, item.quantityToReturn - (item.unit === 'KG' ? 0.25 : 1))}
                                className="px-2 py-1 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-600 font-black"
                              >
                                -
                              </button>
                              <span className="px-3 py-1 font-mono font-bold text-slate-800 text-xs min-w-[40px] text-center">
                                {item.quantityToReturn} {item.unit}
                              </span>
                              <button
                                type="button"
                                disabled={item.isBundle || item.quantityToReturn >= item.originalQty}
                                onClick={() => handleQtyChange(idx, item.quantityToReturn + (item.unit === 'KG' ? 0.25 : 1))}
                                className="px-2 py-1 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-600 font-black"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Restock vs Damaged Toggle */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleRestock(idx)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                                item.restock
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm'
                              }`}
                            >
                              {item.restock ? '✓ Restock ke Gudang' : '✗ Rusak / Tidak Restock'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial & Storage Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Metode Pengembalian Dana
                  </label>
                  <select
                    value={refundPaymentMethod}
                    onChange={(e) => setRefundPaymentMethod(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-purple-500"
                  >
                    <option value="TUNAI">TUNAI (Cash Fisik Laci)</option>
                    <option value="TRANSFER">TRANSFER BANK</option>
                    <option value="QRIS">QRIS / DIGITAL</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Sumber Kas Pengeluaran
                  </label>
                  <select
                    value={refundStorageId}
                    onChange={(e) => setRefundStorageId(e.target.value as any)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-purple-500"
                  >
                    <option value="WARUNG">Kas Utama Warung</option>
                    <option value="IKAN">Kas Ikan Segar</option>
                    <option value="UANG_DIGITAL">Kas Digital / Bank</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Alasan Retur / Refund *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <select
                      value={reasonCategory}
                      onChange={(e) => setReasonCategory(e.target.value)}
                      className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-purple-500"
                    >
                      <option value="Barang Rusak / Cacat">Barang Rusak / Cacat</option>
                      <option value="Produk Kadaluarsa / Basi">Produk Kadaluarsa / Basi</option>
                      <option value="Pelanggan Salah Beli">Pelanggan Salah Beli / Tukar</option>
                      <option value="Komplain Kualitas">Komplain Kualitas / Tidak Segar</option>
                      <option value="Salah Input / Overcharge">Salah Input Kasir / Overcharge</option>
                      <option value="Lainnya">Lainnya (Ketik Manual)</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Keterangan tambahan (opsional)..."
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Staff Authorization Section */}
              <div className="p-4 rounded-2xl border transition-all ${
                isPinVerified
                  ? 'bg-emerald-50/60 border-emerald-200'
                  : 'bg-amber-50/60 border-amber-200'
              }">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isPinVerified ? (
                      <ShieldCheck size={18} className="text-emerald-600" />
                    ) : (
                      <Lock size={18} className="text-amber-600" />
                    )}
                    <span className="text-xs font-black uppercase tracking-tight text-slate-900">
                      Otorisasi Staf / Supervisor
                    </span>
                  </div>
                  {isPinVerified && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                      ✓ Terotorisasi
                    </span>
                  )}
                </div>

                {isDirectlyAuthorized ? (
                  <p className="text-xs text-emerald-800 font-medium flex items-center gap-1.5">
                    <span>Otorisasi langsung sebagai</span>
                    <strong className="underline">{currentUser?.name}</strong>
                    <span>({currentUser?.role})</span>
                  </p>
                ) : isPinVerified ? (
                  <p className="text-xs text-emerald-800 font-medium">
                    Diotorisasi oleh: <strong>{verifiedAuthorizerName}</strong>
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-amber-800 font-medium">
                      Sebagai Kasir, proses Quick Refund membutuhkan verifikasi PIN Owner / Manager (atau PIN 123456).
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        maxLength={6}
                        placeholder="PIN Owner (123456)"
                        value={supervisorPin}
                        onChange={(e) => setSupervisorPin(e.target.value)}
                        className="p-2 bg-white border border-amber-300 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 flex-1 max-w-[200px]"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyPin}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                      >
                        Verifikasi PIN
                      </button>
                    </div>
                    {pinError && (
                      <p className="text-[11px] text-rose-600 font-bold">{pinError}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Total Refund Summary & Confirm Footer */}
              <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                    Total Dana Yang Dikembalikan (Refund):
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-purple-400 tabular-nums">
                      Rp {totalCalculatedRefund.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400">
                      ({selectedItems.length} barang terpilih)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 sm:flex-none px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleProcessRefund}
                    disabled={isSubmitting || selectedItems.length === 0 || (!isPinVerified && !isDirectlyAuthorized)}
                    className="flex-1 sm:flex-none px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmitting ? (
                      'Memproses...'
                    ) : (
                      <>
                        <RotateCcw size={15} />
                        <span>Eksekusi Quick Refund</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
