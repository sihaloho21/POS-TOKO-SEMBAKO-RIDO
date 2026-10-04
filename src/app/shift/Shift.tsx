import React, { useState } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  ClipboardList, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Banknote,
  ArrowRight,
  LogOut,
  LogIn
} from 'lucide-react';
import { ShiftEngine } from '@/core/shift-engine';
import { useAuthStore } from '@/core/auth-store';
import { format } from 'date-fns';

export default function Shift() {
  const { currentUser } = useAuthStore();
  const [startingCash, setStartingCash] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const activeShift = useLiveQuery(
    () => db.shifts.where('userId').equals(currentUser?.userId || '').and(s => s.status === 'OPEN').first(),
    [currentUser]
  );

  const lastClosedShifts = useLiveQuery(
    () => db.shifts.where('status').equals('CLOSED').reverse().limit(5).toArray()
  );

  const handleClockIn = async () => {
    if (!currentUser || !startingCash) return;
    setIsProcessing(true);
    try {
      await ShiftEngine.clockIn(currentUser.userId, 'device-1', Number(startingCash));
      setStartingCash('');
    } catch (err) {
      alert('Gagal Clock In');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClockOut = async () => {
    if (!currentUser || !activeShift || !actualCash) return;
    setIsProcessing(true);
    try {
      await ShiftEngine.clockOut(activeShift.shiftId, Number(actualCash), currentUser.userId, 'device-1');
      setActualCash('');
    } catch (err) {
      alert('Gagal Clock Out');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Manajemen Shift</h2>
        <p className="text-slate-500 text-sm font-medium">Lakukan Clock-in sebelum mulai berjualan dan Clock-out saat selesai.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Shift Area */}
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm h-fit">
          {!activeShift ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-xl bg-blue-600 text-white shadow-lg">
                  <LogIn size={24} />
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Clock In Baru</h3>
              </div>
              <p className="text-sm text-slate-500 font-medium">Masukkan saldo awal di laci kasir (Modal Tunai) untuk memulai shift.</p>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Modal Awal (IDR)</label>
                <input 
                  type="number"
                  className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 text-xl"
                  placeholder="0"
                  value={startingCash}
                  onChange={(e) => setStartingCash(e.target.value)}
                />
              </div>

              <button
                onClick={handleClockIn}
                disabled={isProcessing || !startingCash}
                className="w-full py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-500 shadow-lg shadow-blue-200 transition-all"
              >
                {isProcessing ? 'Memproses...' : 'Mulai Shift (Clock In)'}
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-emerald-500 text-white shadow-lg">
                    <Clock size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Shift Aktif</h3>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Terbuka sejak {format(new Date(activeShift.startTime), 'HH:mm')}</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                  Running
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ID Shift</p>
                  <p className="text-sm font-bold text-slate-900">{activeShift.shiftId}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Modal Awal</p>
                  <p className="text-sm font-bold text-slate-900">Rp {activeShift.startingCash.toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-slate-100">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Tutup Shift (Clock Out)</h4>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Jumlah Uang Fisik Saat Ini</label>
                  <input 
                    type="number"
                    className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-rose-500 outline-none font-bold text-slate-900 text-xl"
                    placeholder="Hitung uang di laci..."
                    value={actualCash}
                    onChange={(e) => setActualCash(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleClockOut}
                  disabled={isProcessing || !actualCash}
                  className="w-full py-4 bg-slate-900 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-slate-800 shadow-xl transition-all"
                >
                  {isProcessing ? 'Memproses...' : 'Tutup Shift & Rekonsiliasi'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* History Area */}
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">Histori Shift Terakhir</h3>
            <ClipboardList size={18} className="text-slate-400" />
          </div>
          <div className="divide-y divide-slate-100">
            {lastClosedShifts?.length === 0 ? (
              <div className="py-10 text-center text-slate-300 text-xs font-bold uppercase tracking-widest">Belum ada data shift</div>
            ) : (
              lastClosedShifts?.map((s) => (
                <div key={s.shiftId} className="p-6 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{format(new Date(s.startTime), 'EEEE, dd MMM yyyy')}</p>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                        {format(new Date(s.startTime), 'HH:mm')} — {s.endTime ? format(new Date(s.endTime), 'HH:mm') : '??'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-900 tabular-nums">Rp {s.actualCash?.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Actual Cash</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase">
                      User: {s.userId}
                    </span>
                    <span className="text-[10px] font-black px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded uppercase">
                      Closed
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
