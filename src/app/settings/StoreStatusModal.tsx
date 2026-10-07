import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { StoreStatusService } from '@/core/services/store-status-service';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';
import { 
  Store, 
  X, 
  CheckCircle, 
  AlertOctagon, 
  Clock, 
  User, 
  Sliders, 
  Info,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'motion/react';

interface StoreStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StoreStatusModal({ isOpen, onClose }: StoreStatusModalProps) {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const isOwner = currentUser?.role === 'OWNER';

  const storeConfig = useLiveQuery(() => StoreStatusService.getStoreStatus(), [isOpen]);
  
  const [selectedStatus, setSelectedStatus] = useState<'BUKA' | 'TUTUP'>('BUKA');
  const [closedReason, setClosedReason] = useState<string>('');
  const [thresholdInput, setThresholdInput] = useState<string>('25000');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (storeConfig) {
      setSelectedStatus(storeConfig.status);
      setClosedReason(storeConfig.closedReason || '');
      setThresholdInput((storeConfig.discrepancyApprovalThreshold || 25000).toString());
    }
  }, [storeConfig]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!currentUser) return;
    setErrorMsg('');
    setIsSaving(true);

    try {
      if (selectedStatus === 'TUTUP' && !closedReason.trim()) {
        throw new Error('Harap masukkan alasan penutupan toko.');
      }

      const newThreshold = Number(thresholdInput) || 25000;
      await StoreStatusService.setDiscrepancyThreshold(newThreshold, currentUser.userId);
      await StoreStatusService.setStoreStatus(
        selectedStatus,
        currentUser.userId,
        selectedStatus === 'TUTUP' ? closedReason.trim() : undefined
      );

      addToast(
        `Status toko berhasil diubah menjadi ${selectedStatus}!`,
        selectedStatus === 'BUKA' ? 'success' : 'info'
      );
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengubah status toko.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[270] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative overflow-hidden"
      >
        {/* Header */}
        <div className="flex justify-between items-start pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
              storeConfig?.status === 'BUKA' 
                ? 'bg-emerald-600 text-white shadow-emerald-200' 
                : 'bg-rose-600 text-white shadow-rose-200'
            }`}>
              <Store size={24} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">
                Status Operasional Toko
              </h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                Kontrol Buka / Tutup & Aturan Selisih
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="py-6 space-y-6">
          {/* Status Selector */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-2">
              Pilih Status Toko
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedStatus('BUKA')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all font-black text-xs uppercase tracking-wider ${
                  selectedStatus === 'BUKA'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100'
                }`}
              >
                <CheckCircle size={24} className={selectedStatus === 'BUKA' ? 'text-emerald-600' : 'text-slate-300'} />
                <span>TOKO BUKA</span>
                <span className="text-[10px] font-bold opacity-75 lowercase tracking-normal">kasir siap transaksi</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStatus('TUTUP')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all font-black text-xs uppercase tracking-wider ${
                  selectedStatus === 'TUTUP'
                    ? 'border-rose-500 bg-rose-50 text-rose-800 shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100'
                }`}
              >
                <AlertOctagon size={24} className={selectedStatus === 'TUTUP' ? 'text-rose-600' : 'text-slate-300'} />
                <span>TOKO TUTUP</span>
                <span className="text-[10px] font-bold opacity-75 lowercase tracking-normal">transaksi diblokir</span>
              </button>
            </div>
          </div>

          {/* Impact Rules Notice */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-2 text-slate-600">
            <div className="flex items-center gap-2 font-black text-[11px] uppercase tracking-wider text-slate-700">
              <Info size={14} className="text-blue-500" />
              <span>Aturan Operasional Saat TUTUP:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] font-medium text-slate-500">
              <li>Kasir tidak dapat membuat transaksi normal baru di POS.</li>
              <li>Owner tetap dapat melakukan otorisasi khusus sesuai izin.</li>
              <li>Transaksi offline yang dibuat saat toko tutup masuk ke <strong>STORE_STATUS_CONFLICT</strong> saat sinkronisasi.</li>
            </ul>
          </div>

          {/* Reason if closed */}
          {selectedStatus === 'TUTUP' && (
            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 block mb-1">
                Alasan Penutupan Toko *
              </label>
              <input
                type="text"
                placeholder="Contoh: Tutup harian pukul 21:00, Istirahat makan siang, Audit stok"
                value={closedReason ?? ''}
                onChange={(e) => setClosedReason(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          )}

          {/* Discrepancy Approval Threshold (Owner Config) */}
          {isOwner && (
            <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <Sliders size={14} /> Toleransi Selisih Kasir (Threshold)
                </label>
                <span className="text-[10px] font-bold text-indigo-600">Rule Approval</span>
              </div>
              <p className="text-[10px] text-slate-500">
                Jika selisih kas saat clock out melebihi nominal ini, sistem mewajibkan PIN Owner untuk approval.
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">Rp</span>
                <input
                  type="number"
                  placeholder="25000"
                  value={thresholdInput ?? ''}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-indigo-200 rounded-xl font-black text-sm text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-bold">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-3 text-slate-500 hover:bg-slate-100 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-2 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
          >
            <ShieldCheck size={16} />
            {isSaving ? 'Menyimpan...' : 'Simpan Status Toko'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
