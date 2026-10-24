import React, { useState } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Search, 
  History, 
  Undo2, 
  XCircle, 
  ChevronRight, 
  ChevronDown,
  Printer,
  Calendar,
  User as UserIcon,
  Package,
  AlertCircle,
  Wallet
} from 'lucide-react';
import { format } from 'date-fns';
import { TransactionEngine } from '@/core/transaction-engine';
import { useAuthStore } from '@/core/auth-store';
import { PrintService } from '@/core/utils/print-service';
import { DebtCorrectionModal } from './DebtCorrectionModal';
import type { Transaction } from '@/core/types';

export function SalesHistory() {
  const { currentUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [expandedId, setViewingId] = useState<string | null>(null);
  const [txToCorrect, setTxToCorrect] = useState<Transaction | null>(null);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [isVoiding, setIsVoiding] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const transactions = useLiveQuery(
    () => {
      let coll = db.transactions.orderBy('clientTimestamp').reverse();
      if (search) {
        return coll.filter(t => t.receiptNumber.toLowerCase().includes(search.toLowerCase())).toArray();
      }
      return coll.limit(50).toArray();
    },
    [search]
  );

  const handleVoid = async (txId: string) => {
    if (!currentUser || !voidReason) return;
    try {
      await TransactionEngine.voidTransaction(txId, currentUser.userId, 'device-1', voidReason);
      setIsVoiding(null);
      setVoidReason('');
      alert('Transaksi berhasil di-void.');
    } catch (err: any) {
      alert('Gagal void: ' + err.message);
    }
  };

  const handlePrint = async (txId: string) => {
    const tx = await db.transactions.get(txId);
    if (tx) PrintService.printReceipt(tx);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <History size={24} className="text-blue-600" />
            Riwayat Transaksi
          </h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Lacak & Kelola Penjualan (Void/Return)</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Cari No. Struk..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm text-sm font-bold"
            value={search ?? ''}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                <th className="px-6 py-4">Waktu</th>
                <th className="px-6 py-4">No. Struk</th>
                <th className="px-6 py-4">Pelanggan</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions?.map((tx) => (
                <React.Fragment key={tx.transactionId}>
                  <tr className={`hover:bg-slate-50/50 transition-colors ${expandedId === tx.transactionId ? 'bg-slate-50' : ''}`}>
                    <td className="px-6 py-4">
                      <p className="text-xs font-bold text-slate-700">{format(new Date(tx.clientTimestamp), 'dd/MM HH:mm')}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{tx.receiptNumber}</p>
                      <p className="text-[9px] font-black text-slate-400 uppercase">{tx.type} • {tx.moneyStorageId}</p>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-600 uppercase">
                      {tx.customerId ? `ID: ${tx.customerId.slice(-6)}` : 'Umum'}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-black text-slate-900 tabular-nums">
                        Rp {tx.total.toLocaleString()}
                      </p>
                      {tx.remainingDebtAmount && tx.remainingDebtAmount > 0 ? (
                        <p className="text-[10px] font-bold text-rose-600">
                          Sisa Bon: Rp {tx.remainingDebtAmount.toLocaleString()}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${
                          tx.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          tx.status === 'VOIDED' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-slate-50 text-slate-500'
                        }`}>
                          {tx.status}
                        </span>
                        {tx.remainingDebtAmount && tx.remainingDebtAmount > 0 ? (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 uppercase">
                            Ada Utang
                          </span>
                        ) : (tx.status === 'COMPLETED' && tx.type !== 'RETURN' && !tx.receivableId) && (
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-100/50 text-amber-800 border border-amber-200 uppercase mt-0.5" title="Bisa dikoreksi jadi Bon">
                            Bisa Koreksi
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setViewingId(expandedId === tx.transactionId ? null : tx.transactionId)} className="p-2 text-slate-400 hover:text-blue-600 transition-all">
                          {expandedId === tx.transactionId ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === tx.transactionId && (
                    <tr>
                      <td colSpan={6} className="px-8 py-6 bg-slate-50/30">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              <Package size={14} /> Item Terjual
                            </h4>
                            <div className="space-y-2">
                              {tx.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                                  <div>
                                    <p className="text-xs font-bold text-slate-900 uppercase">{item.nameSnapshot}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{item.quantity} {item.unit} @ Rp {item.unitPrice.toLocaleString()}</p>
                                  </div>
                                  <p className="text-xs font-black text-slate-900 tabular-nums">Rp {item.subtotal.toLocaleString()}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          <div className="space-y-6">
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detail Transaksi</h4>
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs font-bold">
                                  <span className="text-slate-400 uppercase">Kasir</span>
                                  <span className="text-slate-900 uppercase">{tx.cashierId}</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold">
                                  <span className="text-slate-400 uppercase">Metode</span>
                                  <span className="text-slate-900 uppercase">{tx.paymentMethodId}</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold border-t border-slate-50 pt-2">
                                  <span className="text-slate-400 uppercase">Subtotal</span>
                                  <span className="text-slate-900 tabular-nums">Rp {tx.subtotal.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold">
                                  <span className="text-slate-400 uppercase">Diskon</span>
                                  <span className="text-rose-500 tabular-nums">- Rp {tx.discount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm font-black border-t border-slate-900 pt-2">
                                  <span className="text-slate-900 uppercase">Total</span>
                                  <span className="text-blue-600 tabular-nums">Rp {tx.total.toLocaleString()}</span>
                                </div>
                                {tx.remainingDebtAmount && tx.remainingDebtAmount > 0 ? (
                                  <>
                                    <div className="flex justify-between text-xs font-bold border-t border-slate-100 pt-2">
                                      <span className="text-slate-500 uppercase">Dibayar Tunai:</span>
                                      <span className="text-emerald-600 tabular-nums">Rp {(tx.paidAmount || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-xs font-black text-rose-600">
                                      <span className="uppercase">Sisa Utang (Bon):</span>
                                      <span className="tabular-nums">Rp {tx.remainingDebtAmount.toLocaleString()}</span>
                                    </div>
                                  </>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap gap-2 pt-4">
                                <button 
                                  onClick={() => handlePrint(tx.transactionId)}
                                  className="flex-1 min-w-[110px] flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                                >
                                  <Printer size={16} /> Print Struk
                                </button>
                                {tx.status === 'COMPLETED' && !tx.receivableId && (
                                  <button 
                                    onClick={() => {
                                      setTxToCorrect(tx);
                                      setIsCorrectionModalOpen(true);
                                    }}
                                    className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md shadow-amber-200"
                                    title="Koreksi transaksi ini menjadi bayar sebagian & catat sisa utang (bon)"
                                  >
                                    <Wallet size={14} /> Koreksi Jadi Bon
                                  </button>
                                )}
                                {tx.status === 'COMPLETED' && (
                                  <button 
                                    onClick={() => setIsVoiding(tx.transactionId)}
                                    className="flex-1 min-w-[90px] flex items-center justify-center gap-2 py-3 bg-white border border-rose-200 text-rose-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 transition-all"
                                  >
                                    <XCircle size={16} /> Void
                                  </button>
                                )}
                              </div>
                            </div>

                            {isVoiding === tx.transactionId && (
                              <div className="bg-rose-50 border border-rose-100 p-6 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2">
                                <h4 className="text-[10px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-2">
                                  <AlertCircle size={14} /> Konfirmasi Void
                                </h4>
                                <textarea 
                                  className="w-full px-4 py-3 bg-white border border-rose-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none font-bold text-xs"
                                  placeholder="Alasan pembatalan (Wajib)..."
                                  value={voidReason ?? ''}
                                  onChange={(e) => setVoidReason(e.target.value)}
                                />
                                <div className="flex gap-2">
                                  <button onClick={() => setIsVoiding(null)} className="flex-1 py-3 text-slate-500 font-bold text-[10px] uppercase">Batal</button>
                                  <button 
                                    onClick={() => handleVoid(tx.transactionId)}
                                    disabled={!voidReason}
                                    className="flex-[2] py-3 bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400"
                                  >
                                    Ya, Batalkan Transaksi
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {transactions?.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-300 opacity-20">
                      <History size={64} className="mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest">Belum ada riwayat transaksi</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Debt Correction Modal */}
      <DebtCorrectionModal
        isOpen={isCorrectionModalOpen}
        onClose={() => {
          setIsCorrectionModalOpen(false);
          setTxToCorrect(null);
        }}
        transaction={txToCorrect}
        onSuccess={() => {
          // Modal will close and refresh list
        }}
      />
    </div>
  );
}
