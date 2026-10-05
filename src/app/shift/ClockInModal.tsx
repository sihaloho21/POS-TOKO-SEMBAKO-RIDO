import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuthStore } from '@/core/auth-store';
import { ShiftService } from '@/core/services/shift-service';
import { useToastStore } from '@/core/toast-store';
import { 
  Clock, 
  Banknote, 
  X, 
  CheckCircle, 
  User, 
  ShieldCheck, 
  Calendar,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface ClockInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (shiftId: string) => void;
}

export default function ClockInModal({ isOpen, onClose, onSuccess }: ClockInModalProps) {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const [startingCash, setStartingCash] = useState<string>('50000');
  const [notes, setNotes] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const deviceId = 'device-1';

  // Live query active shifts to detect overlap
  const activeShifts = useLiveQuery(() => ShiftService.getActiveShifts(), []);
  const currentDeviceShift = activeShifts?.find(s => s.deviceId === deviceId);
  const currentUserShift = activeShifts?.find(s => s.userId === currentUser?.userId);
  const hasOverlap = !!currentDeviceShift || !!currentUserShift;
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const quickCashOptions = [0, 50000, 100000, 200000, 500000];

  const handleClockIn = async () => {
    if (!currentUser) return;
    setErrorMsg('');
    setIsLoading(true);

    try {
      const shiftId = await ShiftService.openShift({
        userId: currentUser.userId,
        deviceId: 'device-1',
        startingCash: Number(startingCash) || 0,
        notes: notes.trim()
      });

      if (notes.trim()) {
        addToast('Catatan pembukaan shift berhasil disimpan.', 'success');
      }
      addToast('Berhasil Clock In!', 'success');

      if (onSuccess) {
        onSuccess(shiftId);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memulai shift. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative overflow-hidden"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 ${hasOverlap ? 'bg-amber-100 text-amber-600' : 'bg-emerald-600 text-white'} rounded-2xl flex items-center justify-center shadow-lg`}>
              <Clock size={24} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">
                {hasOverlap ? 'Overlap Shift Terdeteksi' : 'Clock In Kasir'}
              </h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                {hasOverlap ? 'Harap Tutup Shift Sebelumnya' : 'Buka Sesi Shift Baru'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {hasOverlap ? (
          <div className="space-y-6">
            <div className="p-5 bg-amber-50 border-2 border-amber-100 rounded-3xl space-y-4">
              <div className="flex items-start gap-3 text-amber-800">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-black text-xs uppercase tracking-tight">Peringatan Overlap</p>
                  <p className="text-[11px] font-medium leading-relaxed">
                    {currentDeviceShift 
                      ? `Terdapat shift yang masih aktif di perangkat ini (Terminal ${deviceId}).` 
                      : `Anda terdeteksi memiliki shift aktif di perangkat lain.`}
                    Sistem tidak mengizinkan dua shift aktif secara bersamaan untuk menjaga integritas data performa.
                  </p>
                </div>
              </div>

              <div className="bg-white/60 p-3 rounded-2xl text-[10px] font-bold space-y-2 border border-amber-200/50">
                <div className="flex justify-between">
                  <span className="text-slate-400 uppercase">Status</span>
                  <span className="text-amber-600 uppercase">SHIFT MASIH TERBUKA</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 uppercase">Mulai Sejak</span>
                  <span className="text-slate-900 uppercase">
                    {format(new Date((currentDeviceShift || currentUserShift)!.startTime), 'dd MMM yyyy HH:mm')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 uppercase">Perangkat</span>
                  <span className="text-slate-900 uppercase">{(currentDeviceShift || currentUserShift)!.deviceId}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 text-center px-4">
              Silakan tutup (Clock Out) shift sebelumnya di menu Manajemen Shift sebelum memulai sesi kerja baru.
            </p>

            <button
              onClick={onClose}
              className="w-full py-4 bg-slate-900 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl transition-all active:scale-[0.98]"
            >
              Kembali & Cek Status
            </button>
          </div>
        ) : (
          <>
            {/* Cashier & Timestamp Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5 space-y-2.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-bold flex items-center gap-1.5">
              <User size={14} className="text-slate-400" />
              Kasir Bertugas
            </span>
            <span className="font-black text-slate-900">{currentUser?.name}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-bold flex items-center gap-1.5">
              <Calendar size={14} className="text-slate-400" />
              Waktu Clock In
            </span>
            <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
              {format(currentTime, 'dd/MM/yyyy HH:mm:ss')}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-bold flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-slate-400" />
              Perangkat POS
            </span>
            <span className="font-bold text-slate-700">device-1 (Terminal Utama)</span>
          </div>
        </div>

        {/* Starting Cash Input */}
        <div className="space-y-3 mb-6">
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">
              Modal Awal di Laci Kasir (Starting Cash)
            </label>
            <p className="text-[10px] text-slate-400 font-medium mb-2">
              Masukkan jumlah uang receh/pecahan kasir awal yang diterima sebelum memulai penjualan.
            </p>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">
                Rp
              </span>
              <input
                type="number"
                value={startingCash}
                onChange={(e) => setStartingCash(e.target.value)}
                placeholder="0"
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-xl font-black text-slate-900 focus:bg-white focus:border-emerald-500 outline-none tabular-nums transition-all"
              />
            </div>
          </div>

          {/* Quick Cash Chips */}
          <div className="flex flex-wrap gap-1.5">
            {quickCashOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setStartingCash(opt.toString())}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  startingCash === opt.toString()
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {opt === 0 ? 'Tanpa Modal (Rp 0)' : `Rp ${opt.toLocaleString()}`}
              </button>
            ))}
          </div>

          {/* Contextual Notes / Catatan Kasir */}
          <div className="pt-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">
              Catatan Pembukaan Shift (Notes / Konteks)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Ada selisih modal awal Rp 5.000, pecahan kecil terbatas, dll."
              className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 outline-none resize-none transition-all"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-bold">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 text-slate-500 hover:bg-slate-100 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleClockIn}
            disabled={isLoading}
            className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-emerald-200 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span>Memproses...</span>
            ) : (
              <>
                <CheckCircle size={17} />
                <span>Clock In Sekarang</span>
              </>
            )}
          </button>
        </div>
      </>
    )}
  </motion.div>
</div>
  );
}
