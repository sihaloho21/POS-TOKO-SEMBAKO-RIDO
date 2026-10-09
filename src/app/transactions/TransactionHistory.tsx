import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { useAuthStore } from '@/core/auth-store';
import { TransactionEngine } from '@/core/transaction-engine';
import { PrintService } from '@/core/utils/print-service';
import { AuditEngine } from '@/core/audit-engine';
import type { Transaction } from '@/core/types';
import { 
  Search, 
  Printer, 
  Share2, 
  RotateCcw, 
  ShieldAlert, 
  CheckCircle, 
  Clock, 
  User, 
  CreditCard, 
  Banknote, 
  X, 
  AlertTriangle,
  Receipt,
  Eye,
  Check,
  Hourglass,
  FileQuestion,
  Layers
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

export default function TransactionHistory() {
  const { currentUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'approval_pending' | 'HOLD' | 'VOIDED'>('ALL');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  
  // Kasir Request Modal
  const [requestTx, setRequestTx] = useState<Transaction | null>(null);
  const [actionType, setActionType] = useState<'VOID' | 'RETURN' | 'REFUND'>('VOID');
  const [reason, setReason] = useState('Salah input barang');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // Owner Review Modal
  const [reviewTx, setReviewTx] = useState<Transaction | null>(null);

  const isOwner = currentUser?.role === 'OWNER';

  const pendingApprovalsCount = useLiveQuery(
    () => db.transactions.where('status').equals('approval_pending').count()
  );

  const transactions = useLiveQuery(async () => {
    let query = db.transactions.orderBy('clientTimestamp').reverse();
    const all = await query.toArray();

    return all.filter(tx => {
      // Status filter
      if (statusFilter !== 'ALL' && tx.status !== statusFilter) return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const receiptMatch = tx.receiptNumber.toLowerCase().includes(q);
        const cashierMatch = tx.cashierId.toLowerCase().includes(q);
        const itemMatch = tx.items.some(i => i.nameSnapshot.toLowerCase().includes(q));
        return receiptMatch || cashierMatch || itemMatch;
      }
      return true;
    });
  }, [search, statusFilter]);

  const customers = useLiveQuery(() => db.customers.toArray());

  const getCustomerName = (customerId?: string) => {
    if (!customerId) return 'Pelanggan Umum';
    const found = customers?.find(c => c.customerId === customerId);
    return found ? found.name : customerId;
  };

  const handlePrint = (tx: Transaction) => {
    PrintService.printReceipt(tx);
    setFeedbackMsg(`Struk ${tx.receiptNumber} dikirim ke antrian cetak.`);
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  const handleShare = (tx: Transaction) => {
    const custName = getCustomerName(tx.customerId);
    const itemList = tx.items.map(i => `• ${i.nameSnapshot} (${i.quantity} ${i.unit}) = Rp ${i.subtotal.toLocaleString()}`).join('\n');
    const text = `*TOKO SEMBAKO HARAPAN JAYA*\nStruk: ${tx.receiptNumber}\nTanggal: ${format(new Date(tx.clientTimestamp), 'dd/MM/yyyy HH:mm')}\nPelanggan: ${custName}\n------------------------\n${itemList}\n------------------------\n*TOTAL: Rp ${tx.total.toLocaleString()}*\nMetode: ${tx.paymentMethodId} (${tx.type})\nTerima kasih atas kunjungan Anda!`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setFeedbackMsg(`Ringkasan struk ${tx.receiptNumber} berhasil disalin ke Clipboard (siap ditempel ke WhatsApp)!`);
      setTimeout(() => setFeedbackMsg(''), 4000);
    }
  };

  // KASIR ACTION: Flag transaction for Owner review with status 'approval_pending'
  const handleSubmitVoidRequest = async () => {
    if (!requestTx || !currentUser) return;
    setIsProcessing(true);

    try {
      const now = new Date().toISOString();
      const updatedFields = {
        status: 'approval_pending' as const,
        approvalStatus: 'approval_pending' as const,
        voidReason: reason,
        voidRequestedBy: currentUser.name,
        voidRequestedAt: now,
        voidActionType: actionType
      };

      await db.transactions.update(requestTx.transactionId, updatedFields);

      // Audit Log
      await AuditEngine.log({
        userId: currentUser.userId,
        role: currentUser.role,
        deviceId: requestTx.deviceId || 'device-1',
        action: 'REQUEST_VOID_REFUND',
        module: 'TRANSACTIONS',
        referenceId: requestTx.transactionId,
        reason: `${actionType}: ${reason}`,
        after: { ...requestTx, ...updatedFields }
      });

      // Sync queue
      await db.syncQueue.add({
        entityType: 'transactions',
        entityId: requestTx.transactionId,
        action: 'UPDATE',
        payload: { ...requestTx, ...updatedFields },
        status: 'PENDING',
        retryCount: 0,
        createdAt: now
      });

      setFeedbackMsg(`Transaksi ${requestTx.receiptNumber} berhasil diajukan untuk review Owner dengan status 'approval_pending'.`);
      setTimeout(() => setFeedbackMsg(''), 4500);
      setRequestTx(null);
    } catch (err: any) {
      setFeedbackMsg(err.message || 'Gagal mengajukan pembatalan');
      setTimeout(() => setFeedbackMsg(''), 4000);
    } finally {
      setIsProcessing(false);
    }
  };

  // OWNER ACTION: Approve Void / Refund
  const handleOwnerApprove = async (tx: Transaction) => {
    if (!currentUser || currentUser.role !== 'OWNER') return;
    setIsProcessing(true);

    try {
      await TransactionEngine.processReturnOrVoid({
        transactionId: tx.transactionId,
        userId: currentUser.userId,
        role: currentUser.role,
        actionType: tx.voidActionType || 'VOID',
        reason: `Disetujui Owner: ${tx.voidReason || 'Persetujuan Owner'}`
      });

      await db.transactions.update(tx.transactionId, {
        approvalStatus: 'APPROVED'
      });

      setFeedbackMsg(`Pengajuan ${tx.receiptNumber} telah disetujui. Status diubah menjadi VOIDED dan stok/kas dipulihkan.`);
      setTimeout(() => setFeedbackMsg(''), 4500);
      setReviewTx(null);
    } catch (err: any) {
      setFeedbackMsg(err.message || 'Gagal memproses persetujuan');
      setTimeout(() => setFeedbackMsg(''), 4000);
    } finally {
      setIsProcessing(false);
    }
  };

  // OWNER ACTION: Reject Void / Refund
  const handleOwnerReject = async (tx: Transaction) => {
    if (!currentUser || currentUser.role !== 'OWNER') return;
    setIsProcessing(true);

    try {
      const now = new Date().toISOString();
      await db.transactions.update(tx.transactionId, {
        status: 'COMPLETED',
        approvalStatus: 'REJECTED'
      });

      await db.syncQueue.add({
        entityType: 'transactions',
        entityId: tx.transactionId,
        action: 'UPDATE',
        payload: { ...tx, status: 'COMPLETED', approvalStatus: 'REJECTED' },
        status: 'PENDING',
        retryCount: 0,
        createdAt: now
      });

      await AuditEngine.log({
        userId: currentUser.userId,
        role: currentUser.role,
        deviceId: tx.deviceId || 'device-1',
        action: 'REJECT_VOID_REFUND',
        module: 'TRANSACTIONS',
        referenceId: tx.transactionId,
        reason: 'Pengajuan void ditolak oleh Owner.'
      });

      setFeedbackMsg(`Pengajuan ${tx.receiptNumber} ditolak oleh Owner. Transaksi tetap aktif (COMPLETED).`);
      setTimeout(() => setFeedbackMsg(''), 4500);
      setReviewTx(null);
    } catch (err: any) {
      setFeedbackMsg(err.message || 'Gagal menolak permohonan');
      setTimeout(() => setFeedbackMsg(''), 4000);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2.5">
            <Receipt className="text-blue-600" />
            Riwayat Transaksi & Struk
          </h2>
          <p className="text-slate-500 text-xs font-medium mt-0.5">
            Kelola transaksi kasir, cetak ulang struk, dan ajukan permohonan void/refund untuk review Owner.
          </p>
        </div>

        {feedbackMsg && (
          <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle size={16} className="text-emerald-600 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Cari No. Struk, Barang, atau Kasir..."
            value={search ?? ''}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:border-blue-500 outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {(['ALL', 'COMPLETED', 'approval_pending', 'HOLD', 'VOIDED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === st
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>
                {st === 'ALL' ? 'Semua' : st === 'approval_pending' ? 'Review Owner' : st}
              </span>
              {st === 'approval_pending' && pendingApprovalsCount && pendingApprovalsCount > 0 ? (
                <span className="w-4 h-4 bg-amber-500 text-white rounded-full text-[9px] font-black flex items-center justify-center">
                  {pendingApprovalsCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="py-4 px-6">Waktu & Struk</th>
                <th className="py-4 px-6">Pelanggan</th>
                <th className="py-4 px-6">Tipe & Bayar</th>
                <th className="py-4 px-6">Item Dibeli</th>
                <th className="py-4 px-6 text-right">Total Transaksi</th>
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {transactions && transactions.length > 0 ? (
                transactions.map((tx) => {
                  const isVoided = tx.status === 'VOIDED' || tx.status === 'CANCELLED';
                  const isPendingApproval = tx.status === 'approval_pending';

                  return (
                    <tr 
                      key={tx.transactionId} 
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isPendingApproval 
                          ? 'bg-amber-50/40' 
                          : isVoided 
                            ? 'opacity-60 bg-red-50/20' 
                            : ''
                      }`}
                    >
                      <td className="py-4 px-6">
                        <span className="font-mono font-bold text-slate-900 block text-sm">
                          {tx.receiptNumber}
                        </span>
                        <span className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                          <Clock size={11} />
                          {format(new Date(tx.clientTimestamp), 'dd MMM yyyy, HH:mm')}
                        </span>
                        {isPendingApproval && tx.voidReason && (
                          <span className="text-[10px] text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded mt-1 inline-block font-bold">
                            Catatan Kasir: "{tx.voidReason}"
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6 font-bold text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <User size={13} className="text-slate-400" />
                          <span>{getCustomerName(tx.customerId)}</span>
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider mb-1 ${
                          tx.type === 'GAJIAN' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {tx.type}
                        </span>
                        <span className="block text-[11px] text-slate-500 font-medium">
                          {tx.paymentMethodId}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        <div className="max-w-[220px]">
                          <span className="font-bold text-slate-800 line-clamp-1">
                            {tx.items[0]?.nameSnapshot} {tx.items.length > 1 ? `+${tx.items.length - 1} lainnya` : ''}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {tx.items.reduce((acc, i) => acc + i.quantity, 0)} unit total
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-6 text-right font-black text-sm tabular-nums text-slate-900">
                        Rp {tx.total.toLocaleString()}
                      </td>

                      <td className="py-4 px-6 text-center">
                        {isPendingApproval ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                            <Hourglass size={10} />
                            APPROVAL PENDING
                          </span>
                        ) : tx.status === 'COMPLETED' ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700">
                            COMPLETED
                          </span>
                        ) : tx.status === 'HOLD' ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700">
                            HOLD
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700">
                            {tx.status}
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handlePrint(tx)}
                            title="Cetak Ulang Struk"
                            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          >
                            <Printer size={15} />
                          </button>

                          <button
                            onClick={() => handleShare(tx)}
                            title="Bagikan Struk WhatsApp / Salin"
                            className="p-2 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                          >
                            <Share2 size={15} />
                          </button>

                          <button
                            onClick={() => setSelectedTx(tx)}
                            title="Lihat Rincian Item"
                            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
                          >
                            <Eye size={15} />
                          </button>

                          {/* KASIR: Request Void/Refund button on COMPLETED transactions */}
                          {!isVoided && tx.status === 'COMPLETED' && (
                            <button
                              onClick={() => {
                                setRequestTx(tx);
                                setActionType('VOID');
                                setReason('Salah input kasir');
                              }}
                              title="Ajukan Void / Refund ke Owner"
                              className="px-2.5 py-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
                            >
                              <RotateCcw size={12} />
                              Request Void
                            </button>
                          )}

                          {/* Pending Approval Badges & Owner Action */}
                          {isPendingApproval && (
                            isOwner ? (
                              <button
                                onClick={() => setReviewTx(tx)}
                                className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm transition-all"
                                title="Review dan setujui permohonan void/refund"
                              >
                                <Check size={12} />
                                Review
                              </button>
                            ) : (
                              <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-[9px] font-bold">
                                Menunggu Owner
                              </span>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    Tidak ada transaksi yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Details Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">Rincian Struk</h3>
                <span className="font-mono text-xs text-blue-600 font-bold">{selectedTx.receiptNumber}</span>
              </div>
              <button onClick={() => setSelectedTx(null)} className="p-2 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 mb-6 max-h-60 overflow-y-auto pr-1">
              {selectedTx.items.map((it, idx) => {
                const hasBundleSnapshot = it.isBundle && it.bundleComponentsSnapshot && it.bundleComponentsSnapshot.length > 0;
                return (
                  <div key={idx} className="p-2.5 bg-slate-50 rounded-xl space-y-1 text-xs border border-slate-100">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800">{it.nameSnapshot}</span>
                        {it.isBundle && (
                          <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded font-black uppercase">
                            PAKET
                          </span>
                        )}
                      </div>
                      <span className="font-black text-slate-900 tabular-nums">
                        Rp {it.subtotal.toLocaleString()}
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-500">
                      {it.quantity} {it.unit} @ Rp {it.unitPrice.toLocaleString()}
                    </div>

                    {!it.isBundle && isOwner && it.hppSnapshot !== undefined && (
                      <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium mt-1">
                        <span>HPP Snapshot: Rp {it.hppSnapshot.toLocaleString()}/{it.unit}</span>
                        <span className="text-emerald-700 font-bold">
                          Laba: Rp {(it.subtotal - (it.quantity * it.hppSnapshot)).toLocaleString()}
                        </span>
                      </div>
                    )}

                    {/* Bundle Breakdown: Kasir sees contents, Owner sees breakdown and HPP */}
                    {hasBundleSnapshot && (
                      <div className="mt-2 pt-1.5 border-t border-slate-200/80 space-y-1">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                          {isOwner ? 'Breakdown Komponen & HPP (Owner View):' : 'Rincian Isi Paket:'}
                        </span>
                        <div className="space-y-1 pl-2">
                          {it.bundleComponentsSnapshot!.map((comp, cIdx) => (
                            <div key={cIdx} className="text-[11px] text-slate-700 flex justify-between items-center">
                              <span>• {comp.totalQty} {comp.unit} {comp.nameSnapshot}</span>
                              {isOwner && (
                                <span className="text-slate-500 font-mono text-[10px]">
                                  WAC: Rp {comp.wacSnapshot.toLocaleString()} = Rp {comp.subtotalHpp.toLocaleString()}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        {isOwner && it.hppSnapshot && (
                          <div className="flex justify-between items-center pt-1 border-t border-dashed border-slate-200 text-[10px] text-slate-500 font-semibold">
                            <span>Total HPP Paket: Rp {it.hppSnapshot.toLocaleString()}</span>
                            <span className="text-emerald-700 font-bold">
                              Laba: Rp {(it.subtotal - it.hppSnapshot).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="bg-slate-100/70 p-3.5 rounded-2xl space-y-1.5 text-xs mb-6">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-bold tabular-nums">Rp {selectedTx.subtotal.toLocaleString()}</span>
              </div>
              {selectedTx.discount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Diskon</span>
                  <span className="font-bold tabular-nums">-Rp {selectedTx.discount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-900 font-black text-sm pt-2 border-t border-slate-200">
                <span>Total Akhir</span>
                <span className="text-blue-600 tabular-nums">Rp {selectedTx.total.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handlePrint(selectedTx)}
                className="flex-1 py-3 bg-blue-600 text-white font-black text-xs uppercase tracking-wider rounded-xl hover:bg-blue-500 shadow-md shadow-blue-200 flex items-center justify-center gap-2"
              >
                <Printer size={16} />
                Cetak Struk
              </button>
              <button
                onClick={() => handleShare(selectedTx)}
                className="flex-1 py-3 bg-emerald-600 text-white font-black text-xs uppercase tracking-wider rounded-xl hover:bg-emerald-500 shadow-md shadow-emerald-200 flex items-center justify-center gap-2"
              >
                <Share2 size={16} />
                Bagikan WA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KASIR: Request Void/Refund Modal */}
      {requestTx && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4 text-rose-600">
              <div className="w-10 h-10 bg-rose-100 rounded-2xl flex items-center justify-center">
                <RotateCcw size={20} />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">
                  Request Void / Refund (Kasir)
                </h3>
                <span className="text-xs text-slate-500 font-mono font-bold">{requestTx.receiptNumber}</span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl mb-4 text-xs text-amber-800 flex items-start gap-2">
              <Hourglass size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-black block uppercase text-[10px]">Status: approval_pending</span>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Tindakan ini akan menandai transaksi dengan status <strong>approval_pending</strong> untuk ditinjau dan disetujui oleh Owner.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl mb-4 text-xs border border-slate-200 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Nilai Transaksi:</span>
                <span className="font-black text-slate-900 tabular-nums">Rp {requestTx.total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Metode Bayar:</span>
                <span className="font-bold text-slate-700">{requestTx.paymentMethodId} ({requestTx.type})</span>
              </div>
            </div>

            {/* Bundle Return/Void Notice */}
            {requestTx.items.some(i => i.isBundle) && (
              <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-2xl mb-4 text-xs text-indigo-900 flex items-start gap-2">
                <Layers size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black block uppercase text-[10px]">Aturan Retur / Void Paket Bundle</span>
                  <p className="text-[11px] text-indigo-800 mt-0.5">
                    Transaksi ini berisi paket bundle. Sesuai aturan PRD 12, retur komponen parsial <strong>TIDAK DIPERBOLEHKAN</strong>. Hanya pengembalian/pembatalan seluruh paket utuh yang diizinkan (semua movement komponen dibalik ke stok).
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Jenis Pengajuan
                </label>
                <select
                  value={actionType ?? 'VOID'}
                  onChange={(e) => setActionType(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                >
                  <option value="VOID">VOID (Pembatalan Struk Salah Input)</option>
                  <option value="RETURN">RETURN (Retur Barang dari Pelanggan)</option>
                  <option value="REFUND">REFUND (Pengembalian Uang Pelanggan)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Alasan Pembatalan / Retur *
                </label>
                <textarea
                  rows={3}
                  value={reason ?? ''}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Jelaskan alasan mengapa transaksi ini perlu di-void/refund..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRequestTx(null)}
                className="flex-1 py-3 text-slate-500 font-bold text-xs uppercase tracking-wider hover:bg-slate-100 rounded-xl transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitVoidRequest}
                disabled={isProcessing || !reason.trim()}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isProcessing ? 'Mengirim...' : 'Kirim Pengajuan ke Owner'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OWNER: Review & Approval Modal */}
      {reviewTx && isOwner && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4 text-amber-600">
              <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center">
                <FileQuestion size={20} />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">
                  Review Permintaan Void/Refund
                </h3>
                <span className="text-xs text-slate-500 font-mono font-bold">{reviewTx.receiptNumber}</span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Transaksi:</span>
                <span className="font-black text-slate-900 tabular-nums">Rp {reviewTx.total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tipe Pengajuan:</span>
                <span className="font-black text-rose-600 uppercase">{reviewTx.voidActionType || 'VOID'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Diajukan Oleh:</span>
                <span className="font-bold text-slate-800">{reviewTx.voidRequestedBy || 'Kasir'}</span>
              </div>
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 block mb-0.5">Alasan dari Kasir:</span>
                <p className="font-bold text-slate-900 italic">"{reviewTx.voidReason || 'Tidak ada alasan'}"</p>
              </div>
            </div>

            {/* Bundle Whole Reversal Notice */}
            {reviewTx.items.some(i => i.isBundle) && (
              <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-2xl mb-4 text-xs text-indigo-900 flex items-start gap-2">
                <Layers size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black block uppercase text-[10px]">Paket Bundle Utuh</span>
                  <p className="text-[11px] text-indigo-800 mt-0.5">
                    Transaksi ini berisi paket bundle. Persetujuan void/retur akan membalikkan stok <strong>seluruh komponen paket</strong> ke inventaris secara otomatis (tidak ada retur parsial).
                  </p>
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-500 mb-5 text-center">
              Persetujuan akan membatalkan struk secara permanen, memulihkan saldo stok ke gudang, dan mencatat pengeluaran pengembalian kas.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleOwnerReject(reviewTx)}
                disabled={isProcessing}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
              >
                Tolak Pengajuan
              </button>
              <button
                type="button"
                onClick={() => handleOwnerApprove(reviewTx)}
                disabled={isProcessing}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-1.5"
              >
                {isProcessing ? 'Memproses...' : 'Setujui & Void Transaksi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
