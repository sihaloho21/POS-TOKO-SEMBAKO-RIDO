import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { TransactionEngine } from '@/core/transaction-engine';
import { X, CreditCard, CheckCircle2, Loader2, Wallet } from 'lucide-react';
import { format } from 'date-fns';

interface DebtSettlementModalProps {
  customerId: string;
  cashierId: string;
  shiftId: string;
  onClose: () => void;
}

export function DebtSettlementModal({ customerId, cashierId, shiftId, onClose }: DebtSettlementModalProps) {
  const [amount, setAmount] = useState<number>(0);
  const [selectedReceivableId, setSelectedReceivableId] = useState<string | null>(null);
  const [moneyStorageId, setMoneyStorageId] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL'>('WARUNG');
  const [isProcessing, setIsProcessing] = useState(false);

  const customer = useLiveQuery(() => db.customers.get(customerId), [customerId]);
  const receivables = useLiveQuery(
    () => db.receivables
      .where('customerId')
      .equals(customerId)
      .filter(r => r.status === 'OPEN' || r.status === 'PARTIAL' || r.status === 'OVERDUE')
      .toArray(),
    [customerId]
  );

  const handleSettle = async () => {
    if (!selectedReceivableId || amount <= 0 || isProcessing) return;

    setIsProcessing(true);
    try {
      await TransactionEngine.settleReceivable({
        cashierId,
        deviceId: 'device-1',
        shiftId,
        customerId,
        receivableId: selectedReceivableId,
        amount,
        paymentMethodId: 'CASH',
        moneyStorageId
      });
      onClose();
    } catch (error) {
      console.error('Settlement failed:', error);
      alert('Gagal memproses pelunasan.');
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedReceivable = receivables?.find(r => r.receivableId === selectedReceivableId);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <CreditCard size={20} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 uppercase tracking-tight">Pelunasan Hutang</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{customer?.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pilih Nota Hutang</label>
            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
              {receivables?.map(r => (
                <button
                  key={r.receivableId}
                  onClick={() => {
                    setSelectedReceivableId(r.receivableId);
                    setAmount(r.remainingAmount);
                  }}
                  className={`w-full p-3 rounded-xl border text-left transition-all ${
                    selectedReceivableId === r.receivableId 
                      ? 'border-blue-500 bg-blue-50/50 shadow-sm' 
                      : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700">{r.receivableId.slice(-8).toUpperCase()}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{format(new Date(r.createdAt), 'dd/MM/yy')}</span>
                  </div>
                  <div className="flex justify-between items-end mt-1">
                    <span className="text-sm font-black text-slate-900">Rp {r.remainingAmount.toLocaleString()}</span>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                      r.status === 'OVERDUE' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {r.status}
                    </span>
                  </div>
                </button>
              ))}
              {receivables?.length === 0 && (
                <div className="p-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                  <p className="text-[10px] font-black uppercase tracking-widest">Tidak ada hutang aktif</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Jumlah Bayar (Rp)</label>
            <input 
              type="number"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-lg text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              value={amount ?? 0}
              onChange={(e) => setAmount(Number(e.target.value))}
              max={selectedReceivable?.remainingAmount}
            />
            {selectedReceivable && (
              <p className="text-[10px] font-bold text-slate-500 text-right">
                Sisa Hutang: Rp {(selectedReceivable.remainingAmount - amount).toLocaleString()}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Penyimpanan Uang</label>
            <div className="grid grid-cols-3 gap-2">
              {['WARUNG', 'IKAN', 'UANG_DIGITAL'].map(s => (
                <button
                  key={s}
                  onClick={() => setMoneyStorageId(s as any)}
                  className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                    moneyStorageId === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200'
                  }`}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100">
          <button
            onClick={handleSettle}
            disabled={!selectedReceivableId || amount <= 0 || isProcessing}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-emerald-200 hover:bg-emerald-500 transition-all disabled:bg-slate-200 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                MEMPROSES...
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                BAYAR HUTANG
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
