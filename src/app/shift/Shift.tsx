import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { ShiftService } from '@/core/services/shift-service';
import { StoreStatusService } from '@/core/services/store-status-service';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';
import { useDeviceId } from '@/core/device-store';
import ClockOutModal from '@/app/shift/ClockOutModal';
import { 
  Clock, 
  Unlock, 
  Lock, 
  Banknote, 
  History, 
  ArrowRight,
  CheckCircle, 
  AlertTriangle, 
  CalendarClock,
  Store,
  Smartphone,
  Receipt,
  TrendingUp,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';

export default function Shift({ onNavigate }: { onNavigate?: (tab: string) => void } = {}) {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const deviceId = useDeviceId();
  
  const storeConfig = useLiveQuery(() => StoreStatusService.getStoreStatus(), []);
  const currentShift = useLiveQuery(
    () => ShiftService.getCurrentShift(deviceId, currentUser?.userId),
    [deviceId, currentUser?.userId]
  );
  
  // Resolve cashier name if different from current user
  const shiftCashier = useLiveQuery(async () => {
    if (!currentShift) return null;
    if (currentShift.userId === currentUser?.userId) return currentUser;
    return db.users.get(currentShift.userId);
  }, [currentShift, currentUser]);

  const activeShifts = useLiveQuery(() => ShiftService.getActiveShifts(), []);
  const otherDeviceShift = activeShifts?.find(s => s.userId === currentUser?.userId && s.deviceId !== deviceId);

  const shiftHistory = useLiveQuery(async () => {
    try {
      const all = await db.shifts.toArray();
      return all.sort((a, b) => (b.startTime || '').localeCompare(a.startTime || '')).slice(0, 10);
    } catch {
      return [];
    }
  }, []);

  const [startingCash, setStartingCash] = useState('50000');
  const [openShiftNotes, setOpenShiftNotes] = useState('');
  const [isClockOutModalOpen, setIsClockOutModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleOpenShift = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      await ShiftService.openShift({
        userId: currentUser.userId,
        deviceId,
        startingCash: Number(startingCash) || 0,
        notes: openShiftNotes.trim()
      });
      if (openShiftNotes.trim()) {
        addToast('Catatan pembukaan shift berhasil disimpan.', 'success');
      }
      addToast('Shift berhasil dibuka!', 'success');
      setOpenShiftNotes('');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Top Header & Store Status */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Manajemen Shift Kasir</h2>
            <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
              storeConfig?.status === 'BUKA' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800 animate-pulse'
            }`}>
              <Store size={14} />
              <span>TOKO {storeConfig?.status || 'BUKA'}</span>
            </span>
          </div>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Buka sesi kasir (Clock In) dan tutup sesi dengan rekonsiliasi kas laci (Clock Out).
          </p>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate('shift-history')}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-xs"
          >
            <CalendarClock size={16} />
            <span>Menu Shift History</span>
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Shift Card */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                currentShift ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-slate-100 text-slate-400'
              }`}>
                {currentShift ? <Unlock size={24} /> : <Lock size={24} />}
              </div>
              <div>
                <h3 className="font-black text-slate-900 uppercase tracking-tight">Status Sesi Kasir</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <span>{currentShift ? `AKTIF SEJAK ${format(new Date(currentShift.startTime), 'HH:mm')}` : 'Sesi Tertutup (Closed)'}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><Smartphone size={10} /> {deviceId}</span>
                </p>
              </div>
            </div>

            {currentShift && (
              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-black uppercase tracking-wider">
                ID: {currentShift.shiftId.slice(-6).toUpperCase()}
              </span>
            )}
          </div>

          {!currentShift ? (
            <div className="space-y-6">
              {otherDeviceShift && (
                <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800">
                  <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-black uppercase">Shift Aktif Terdeteksi di Perangkat Lain</p>
                    <p className="font-medium mt-1">
                      Anda memiliki sesi shift di perangkat <strong>{otherDeviceShift.deviceId}</strong>. 
                      Satu shift dapat digunakan di beberapa terminal atau Anda dapat melanjutkan sesi kasir di terminal ini.
                    </p>
                  </div>
                </div>
              )}

              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">
                  Modal Awal Kas (Laci)
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Rp</div>
                  <input 
                    type="number"
                    className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-black text-xl tabular-nums"
                    value={startingCash ?? ''}
                    onChange={(e) => setStartingCash(e.target.value)}
                  />
                </div>
                <p className="text-[10px] text-slate-400 font-bold mt-4">
                  Pastikan jumlah uang di laci sama dengan yang diinput.
                </p>

                <div className="mt-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                    Catatan Modal Awal / Notes (Opsional)
                  </label>
                  <textarea 
                    rows={2}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-medium text-xs resize-none"
                    placeholder="Contoh: Ada selisih modal awal, kembalian receh kurang..."
                    value={openShiftNotes ?? ''}
                    onChange={(e) => setOpenShiftNotes(e.target.value)}
                  />
                </div>
              </div>

              <button 
                onClick={handleOpenShift}
                disabled={isLoading}
                className="w-full py-5 bg-emerald-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-500 shadow-xl shadow-emerald-200 transition-all flex items-center justify-center gap-3 cursor-pointer"
              >
                <Clock size={20} />
                {isLoading ? 'Processing...' : 'Clock In (Mulai Shift Kasir)'}
                <ArrowRight size={20} />
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Modal Awal</p>
                  <p className="text-lg font-black text-slate-900 tabular-nums">
                    Rp {currentShift.startingCash.toLocaleString()}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Kasir Bertugas</p>
                  <p className="text-lg font-black text-blue-600 uppercase truncate">
                    {shiftCashier?.name || 'Loading...'}
                  </p>
                </div>
              </div>

              <div className="p-6 bg-gradient-to-br from-rose-50 to-amber-50 rounded-2xl border border-rose-100 space-y-4">
                <div className="flex items-center gap-2 text-rose-800">
                  <Lock size={18} className="text-rose-600" />
                  <span className="text-xs font-black uppercase tracking-wider">Penutupan Sesi & Rekonsiliasi Kas</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  Saat menutup shift, sistem akan menghitung seluruh transaksi kasir:
                  <strong> Omzet, Cash In, Cash Out, Breakdown Pembayaran, Expected Cash, Actual Cash</strong>, dan <strong>Selisih (Discrepancy)</strong> secara otomatis.
                </p>

                <button 
                  onClick={() => setIsClockOutModalOpen(true)}
                  className="w-full py-4 bg-rose-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-rose-500 shadow-xl shadow-rose-200 transition-all flex items-center justify-center gap-3 cursor-pointer"
                >
                  <Lock size={20} />
                  <span>Clock Out / Tutup Shift</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Shift History Card */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
                <History size={20} />
              </div>
              <div>
                <h3 className="font-black text-slate-900 uppercase tracking-tight">Riwayat Sesi Shift</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">10 Sesi Terakhir</p>
              </div>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('shift-history')}
                className="text-xs font-black text-blue-600 hover:text-blue-700 uppercase tracking-wider flex items-center gap-1"
              >
                <span>Lihat Semua</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>

          <div className="space-y-4">
            {shiftHistory?.map((s) => (
              <div key={s.shiftId} className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-100 transition-colors flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-xs text-slate-900 uppercase">
                      {format(new Date(s.startTime), 'dd MMM yyyy, HH:mm')}
                    </span>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      s.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {s.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Kasir: <strong>{s.userId}</strong> • Terminal: <strong>{s.deviceId}</strong>
                  </p>
                  {s.discrepancy !== undefined && s.discrepancy !== 0 && (
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                      s.discrepancy > 0 ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      Selisih: {s.discrepancy > 0 ? '+' : ''}Rp {s.discrepancy.toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-xs font-black text-slate-900 tabular-nums">
                    Modal: Rp {s.startingCash.toLocaleString()}
                  </p>
                  {s.totalSales !== undefined && (
                    <p className="text-[11px] font-bold text-emerald-600 tabular-nums">
                      Omzet: Rp {s.totalSales.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {shiftHistory?.length === 0 && (
              <div className="py-12 text-center text-slate-400 font-bold uppercase tracking-wider text-xs">
                Belum ada riwayat shift
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comprehensive Clock Out Modal */}
      <ClockOutModal
        isOpen={isClockOutModalOpen}
        onClose={() => setIsClockOutModalOpen(false)}
      />
    </div>
  );
}
