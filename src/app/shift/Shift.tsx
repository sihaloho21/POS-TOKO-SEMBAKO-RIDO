import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { ShiftService } from '@/core/services/shift-service';
import { useAuthStore } from '@/core/auth-store';
import { 
  Clock, 
  Unlock, 
  Lock, 
  Banknote, 
  History, 
  ArrowRight,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';

export default function Shift() {
  const { currentUser } = useAuthStore();
  const deviceId = 'device-1'; // Should ideally be from a device store
  
  const currentShift = useLiveQuery(() => ShiftService.getCurrentShift(deviceId), [deviceId]);
  const shiftHistory = useLiveQuery(() => db.shifts.orderBy('startTime').reverse().limit(10).toArray());

  const [startingCash, setStartingCash] = useState('50000');
  const [actualCash, setActualCash] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleOpenShift = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      await ShiftService.openShift({
        userId: currentUser.userId,
        deviceId,
        startingCash: Number(startingCash)
      });
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseShift = async () => {
    if (!currentShift) return;
    if (!actualCash) {
      alert('Masukkan jumlah uang fisik di laci.');
      return;
    }
    setIsLoading(true);
    try {
      await ShiftService.closeShift(currentShift.shiftId, Number(actualCash));
      setActualCash('');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Manajemen Shift</h2>
          <p className="text-slate-500 text-sm font-medium">Buka dan tutup sesi kasir untuk rekonsiliasi uang.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Shift Status */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-4 mb-8">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${currentShift ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
              {currentShift ? <Unlock size={24} /> : <Lock size={24} />}
            </div>
            <div>
              <h3 className="font-black text-slate-900 uppercase tracking-tight">Status Kasir</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {currentShift ? `AKTIF SEJAK ${format(new Date(currentShift.startTime), 'HH:mm')}` : 'Sesi Tertutup'}
              </p>
            </div>
          </div>

          {!currentShift ? (
            <div className="space-y-6">
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Modal Awal Kas (Laci)</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Rp</div>
                  <input 
                    type="number"
                    className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-black text-xl tabular-nums"
                    value={startingCash}
                    onChange={(e) => setStartingCash(e.target.value)}
                  />
                </div>
                <p className="text-[10px] text-slate-400 font-bold mt-4">Pastikan jumlah uang di laci sama dengan yang diinput.</p>
              </div>
              <button 
                onClick={handleOpenShift}
                disabled={isLoading}
                className="w-full py-5 bg-blue-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-500 shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3"
              >
                {isLoading ? 'Processing...' : 'Buka Shift Baru'}
                <ArrowRight size={20} />
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Modal Awal</p>
                  <p className="text-lg font-black text-slate-900 tabular-nums">Rp {currentShift.startingCash.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Kasir Aktif</p>
                  <p className="text-lg font-black text-blue-600 uppercase truncate">{currentUser?.name}</p>
                </div>
              </div>

              <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100">
                <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-4">Total Uang Fisik Saat Ini</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-400 font-bold">Rp</div>
                  <input 
                    type="number"
                    className="w-full pl-12 pr-4 py-4 bg-white border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-black text-xl tabular-nums"
                    placeholder="Hitung uang di laci..."
                    value={actualCash}
                    onChange={(e) => setActualCash(e.target.value)}
                  />
                </div>
                <p className="text-[10px] text-amber-600 font-bold mt-4 flex items-center gap-2">
                  <AlertTriangle size={12} /> Tutup shift akan menghitung selisih otomatis.
                </p>
              </div>

              <button 
                onClick={handleCloseShift}
                disabled={isLoading}
                className="w-full py-5 bg-rose-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-rose-500 shadow-xl shadow-rose-200 transition-all flex items-center justify-center gap-3"
              >
                {isLoading ? 'Processing...' : 'Tutup Shift (Clock Out)'}
                <Lock size={20} />
              </button>
            </div>
          )}
        </div>

        {/* Shift History */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
              <History size={20} />
            </div>
            <h3 className="font-black text-slate-900 uppercase tracking-tight">Riwayat Sesi</h3>
          </div>

          <div className="space-y-4">
            {shiftHistory?.map(s => (
              <div key={s.shiftId} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.status === 'CLOSED' ? 'bg-white text-slate-400' : 'bg-emerald-500 text-white animate-pulse'}`}>
                    <Clock size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 uppercase">{format(new Date(s.startTime), 'dd MMM yyyy')}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {format(new Date(s.startTime), 'HH:mm')} - {s.endTime ? format(new Date(s.endTime), 'HH:mm') : 'AKTIF'}
                    </p>
                  </div>
                </div>
                {s.status === 'CLOSED' && (
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <p className="text-xs font-black text-slate-900 tabular-nums">Rp {s.actualCash?.toLocaleString()}</p>
                      {s.actualCash !== s.expectedCash ? (
                        <AlertTriangle size={14} className="text-amber-500" />
                      ) : (
                        <CheckCircle size={14} className="text-emerald-500" />
                      )}
                    </div>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${s.actualCash === s.expectedCash ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {s.actualCash === s.expectedCash ? 'RECONCILED' : `SELISIH: Rp ${( (s.actualCash || 0) - (s.expectedCash || 0) ).toLocaleString()}`}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
