import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { useAuthStore } from '@/core/auth-store';
import { ShiftService } from '@/core/services/shift-service';
import { PrintService } from '@/core/utils/print-service';
import { useToastStore } from '@/core/toast-store';
import type { CashierShift } from '@/core/types';
import ClockInModal from '@/app/shift/ClockInModal';
import ShiftReport from '@/app/shift/ShiftReport';
import { 
  Clock, 
  ShoppingCart, 
  Receipt, 
  RotateCcw, 
  Banknote, 
  CreditCard, 
  QrCode, 
  LogOut, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp, 
  ArrowRight, 
  Hourglass, 
  Calendar,
  X,
  ShieldAlert,
  Wallet,
  Coins,
  Printer,
  FileText,
  History
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface KasirDashboardProps {
  onNavigate?: (tab: string) => void;
}

export default function KasirDashboard({ onNavigate }: KasirDashboardProps) {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const deviceId = 'device-1';

  // Live query active shift
  const currentShift = useLiveQuery(() => ShiftService.getCurrentShift(deviceId), [deviceId]);

  // Monitor shift expiration
  useEffect(() => {
    if (!currentShift) return;
    const startTime = new Date(currentShift.startTime);
    const interval = setInterval(() => {
      const hours = (new Date().getTime() - startTime.getTime()) / (1000 * 60 * 60);
      if (hours >= 7.5 && hours < 8) {
        addToast('Shift Anda akan berakhir dalam 30 menit.', 'warning');
      }
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currentShift?.shiftId]);

  // Live query latest shift for reference or printing after close
  const latestShift = useLiveQuery(async () => {
    const all = await db.shifts.toArray();
    return all.sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''))[0];
  });

  // Live query transactions in current shift
  const shiftTransactions = useLiveQuery(async () => {
    if (!currentShift) return [];
    return db.transactions
      .where('shiftId')
      .equals(currentShift.shiftId)
      .toArray();
  }, [currentShift?.shiftId]);

  // Live query pending void/refund requests
  const pendingVoidRequests = useLiveQuery(async () => {
    const list = await db.transactions
      .where('status')
      .equals('approval_pending')
      .toArray();
    return list.sort((a, b) => new Date(b.clientTimestamp).getTime() - new Date(a.clientTimestamp).getTime());
  });

  // Clock Out Modal State
  const [isClockOutModalOpen, setIsClockOutModalOpen] = useState(false);
  const [actualCashInput, setActualCashInput] = useState('');
  const [clockOutNotes, setClockOutNotes] = useState('');
  const [isClosingShift, setIsClosingShift] = useState(false);
  const [closeSuccessMsg, setCloseSuccessMsg] = useState('');
  const [clockOutError, setClockOutError] = useState('');
  const [lastClosedShiftRecord, setLastClosedShiftRecord] = useState<CashierShift | null>(null);

  // Print Summary State
  const [isPrintingSummary, setIsPrintingSummary] = useState(false);
  const [printSuccessToast, setPrintSuccessToast] = useState('');

  // Clock In Modal State
  const [isClockInModalOpen, setIsClockInModalOpen] = useState(false);
  const [viewingShiftId, setViewingShiftId] = useState<string | null>(null);

  // Live timer for shift duration
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute shift financial & operational stats
  const completedTxs = shiftTransactions?.filter(tx => tx.status === 'COMPLETED') || [];
  const totalCompletedCount = completedTxs.length;
  const totalSalesVolume = completedTxs.reduce((acc, tx) => acc + tx.total, 0);

  const cashSales = completedTxs
    .filter(tx => tx.paymentMethodId === 'CASH')
    .reduce((acc, tx) => acc + tx.total, 0);

  const nonCashSales = completedTxs
    .filter(tx => tx.paymentMethodId !== 'CASH')
    .reduce((acc, tx) => acc + tx.total, 0);

  const startingCash = currentShift?.startingCash || 0;
  const expectedDrawerCash = startingCash + cashSales;

  // Clock Out Discrepancy calculation
  const actualCashNum = Number(actualCashInput) || 0;
  const discrepancy = actualCashNum - expectedDrawerCash;

  const handlePrintShiftSummary = async (targetShift?: CashierShift | null) => {
    const shift = targetShift || currentShift || latestShift;
    if (!shift) {
      setPrintSuccessToast('Tidak ada data shift yang dapat dicetak.');
      setTimeout(() => setPrintSuccessToast(''), 3000);
      return;
    }

    setIsPrintingSummary(true);
    try {
      // Query completed transactions in this shift
      const txs = await db.transactions
        .where('shiftId')
        .equals(shift.shiftId)
        .filter(t => t.status === 'COMPLETED')
        .toArray();

      const txCount = shift.totalTransactionCount !== undefined ? shift.totalTransactionCount : txs.length;
      const sales = shift.totalSales !== undefined ? shift.totalSales : txs.reduce((acc, t) => acc + t.total, 0);

      const cash = txs
        .filter(t => t.paymentMethodId === 'CASH')
        .reduce((acc, t) => acc + t.total, 0);

      const nonCash = txs
        .filter(t => t.paymentMethodId !== 'CASH')
        .reduce((acc, t) => acc + t.total, 0);

      const expected = shift.expectedCash !== undefined ? shift.expectedCash : (shift.startingCash + cash);
      const actual = shift.actualCash;
      const disc = actual !== undefined ? actual - expected : undefined;

      await PrintService.printShiftSummary({
        shiftId: shift.shiftId,
        cashierName: currentUser?.name || 'Kasir',
        deviceId: shift.deviceId || deviceId,
        startTime: shift.startTime,
        endTime: shift.endTime,
        status: shift.status,
        totalTransactions: txCount,
        totalSales: sales,
        cashSales: cash,
        nonCashSales: nonCash,
        startingCash: shift.startingCash,
        expectedCash: expected,
        actualCash: actual,
        discrepancy: disc,
        notes: shift.notes || shift.startNotes || shift.endNotes
      });

      setPrintSuccessToast('Struk Ringkasan Shift thermal berhasil dibuat!');
      setTimeout(() => setPrintSuccessToast(''), 4000);
    } catch (err: any) {
      console.error('Print summary error:', err);
    } finally {
      setIsPrintingSummary(false);
    }
  };

  const handleConfirmClockOut = async () => {
    if (!currentShift) return;
    if (!actualCashInput) {
      setClockOutError('Masukkan jumlah uang fisik di laci kasir.');
      return;
    }

    setIsClosingShift(true);
    setClockOutError('');

    try {
      const closedShift = await ShiftService.clockOut({
        shiftId: currentShift.shiftId,
        actualCash: actualCashNum,
        transactionCount: totalCompletedCount,
        notes: clockOutNotes.trim()
      });

      if (closedShift.notes) {
        addToast('Catatan shift penutupan berhasil disimpan.', 'success');
      }
      addToast('Berhasil Clock Out!', 'success');
      
      setLastClosedShiftRecord(closedShift);

      const formattedEndTime = format(new Date(closedShift.endTime || new Date()), 'HH:mm:ss');
      setCloseSuccessMsg(
        `Clock Out berhasil pada ${formattedEndTime}! Total ${closedShift.totalTransactionCount || totalCompletedCount} transaksi telah tersimpan di database.`
      );
      setIsClockOutModalOpen(false);
      setActualCashInput('');
      setClockOutNotes('');
      setTimeout(() => setCloseSuccessMsg(''), 6000);
    } catch (err: any) {
      setClockOutError(err.message || 'Gagal memproses Clock Out.');
    } finally {
      setIsClosingShift(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Cashier Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 rounded-3xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-black uppercase tracking-wider">
              Kasir Dashboard
            </span>
            <span className="text-slate-400 text-xs font-mono">• Terminal {deviceId}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Halo, {currentUser?.name} 👋
          </h1>
          <p className="text-slate-400 text-xs font-medium">
            Pantau status shift aktif, kelola transaksi kasir, dan pantau pengajuan void Anda di sini.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={() => handlePrintShiftSummary()}
            disabled={isPrintingSummary || (!currentShift && !latestShift)}
            className="w-full sm:w-auto px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl border border-slate-700 shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
            title="Cetak Ringkasan Shift ke Printer Thermal"
          >
            <Printer size={16} className="text-amber-400" />
            <span>{isPrintingSummary ? 'Mencetak...' : 'Cetak Shift'}</span>
          </button>

          {currentShift ? (
            <button
              onClick={() => {
                setActualCashInput('');
                setClockOutError('');
                setIsClockOutModalOpen(true);
              }}
              className="w-full sm:w-auto px-5 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-rose-900/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <LogOut size={16} />
              <span>Clock Out (Tutup Shift)</span>
            </button>
          ) : (
            <button
              onClick={() => setIsClockInModalOpen(true)}
              className="w-full sm:w-auto px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98] animate-pulse"
            >
              <Clock size={16} />
              <span>Clock In (Mulai Shift)</span>
            </button>
          )}

          <button
            onClick={() => onNavigate?.('pos')}
            className="w-full sm:w-auto px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <ShoppingCart size={16} />
            <span>Buka Kasir POS</span>
          </button>
        </div>
      </div>

      {closeSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle size={18} className="text-emerald-600 shrink-0" />
            <span>{closeSuccessMsg}</span>
          </div>
          {lastClosedShiftRecord && (
            <button
              onClick={() => handlePrintShiftSummary(lastClosedShiftRecord)}
              disabled={isPrintingSummary}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm flex items-center gap-1.5 transition-all"
            >
              <Printer size={14} />
              <span>Cetak Struk Penutupan Shift</span>
            </button>
          )}
        </div>
      )}

      {printSuccessToast && (
        <div className="p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-sm animate-in fade-in">
          <Printer size={18} className="text-blue-600 shrink-0" />
          <span>{printSuccessToast}</span>
        </div>
      )}

      {/* Main Grid: Shift Stats & Shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Shift Stats Card */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                    Ringkasan Shift Berjalan
                  </h2>
                  {currentShift ? (
                    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      Aktif
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-500">
                      Belum Dibuka
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Statistik kasir real-time selama sesi kerja Anda hari ini.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handlePrintShiftSummary()}
                  disabled={isPrintingSummary || (!currentShift && !latestShift)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-40"
                  title="Cetak Ringkasan ke Printer Thermal"
                >
                  <Printer size={14} className="text-slate-600" />
                  <span>Cetak Ringkasan</span>
                </button>

                {currentShift && (
                  <div className="text-right">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                      Durasi Sesi
                    </span>
                    <span className="text-xs font-bold text-blue-600 font-mono">
                      {formatDistanceToNow(new Date(currentShift.startTime))}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {currentShift && (currentShift.startNotes || currentShift.notes) && (
              <div className="mb-4 px-3.5 py-2.5 bg-amber-50/80 border border-amber-200/90 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5 shadow-xs">
                <span className="font-black text-amber-700 uppercase tracking-wider text-[10px] bg-amber-200/60 px-2 py-0.5 rounded-lg shrink-0 mt-0.5">
                  Catatan Sesi
                </span>
                <span className="font-medium italic text-slate-700">
                  "{currentShift.startNotes || currentShift.notes}"
                </span>
              </div>
            )}

            {currentShift ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
                {/* Total Transactions */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider">Transaksi</span>
                    <Receipt size={16} className="text-blue-500" />
                  </div>
                  <span className="text-2xl font-black text-slate-900 tabular-nums block">
                    {totalCompletedCount}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 mt-1 block">Struk Berhasil</span>
                </div>

                {/* Total Penjualan */}
                <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100">
                  <div className="flex items-center justify-between text-blue-600 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider">Total Omzet</span>
                    <TrendingUp size={16} />
                  </div>
                  <span className="text-xl font-black text-blue-700 tabular-nums block truncate">
                    Rp {totalSalesVolume.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold text-blue-500 mt-1 block">Penjualan Shift</span>
                </div>

                {/* Penjualan Tunai */}
                <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100">
                  <div className="flex items-center justify-between text-emerald-600 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider">Tunai Masuk</span>
                    <Banknote size={16} />
                  </div>
                  <span className="text-xl font-black text-emerald-700 tabular-nums block truncate">
                    Rp {cashSales.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-500 mt-1 block">Uang Fisik Kas</span>
                </div>

                {/* Non-Tunai */}
                <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-100">
                  <div className="flex items-center justify-between text-purple-600 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider">Non-Tunai</span>
                    <QrCode size={16} />
                  </div>
                  <span className="text-xl font-black text-purple-700 tabular-nums block truncate">
                    Rp {nonCashSales.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold text-purple-500 mt-1 block">QRIS / Transfer</span>
                </div>
              </div>
            ) : (
              <div className="p-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl text-center mb-6">
                <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">
                  Shift Belum Dibuka
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
                  Anda belum membuka sesi kerja kasir hari ini. Silakan Clock In dan masukkan modal awal laci untuk mulai bertransaksi.
                </p>
                <button
                  onClick={() => setIsClockInModalOpen(true)}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-emerald-200"
                >
                  Clock In Sekarang
                </button>
              </div>
            )}
          </div>

          {/* Cash Drawer Status Bar */}
          {currentShift && (
            <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-amber-400">
                  <Wallet size={20} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Uang Fisik Kasir Seharusnya di Laci (Expected Drawer)
                  </span>
                  <span className="text-xl font-black text-emerald-400 tabular-nums">
                    Rp {expectedDrawerCash.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-400 flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-slate-800 pt-2 sm:pt-0">
                <div>
                  <span className="block text-[10px] text-slate-500 font-bold">Modal Awal</span>
                  <span className="font-bold text-white tabular-nums">Rp {startingCash.toLocaleString()}</span>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] text-slate-500 font-bold">Penjualan Kas</span>
                  <span className="font-bold text-white tabular-nums">+Rp {cashSales.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Quick Actions & Shift Shortcut */}
        <div className="space-y-4">
          {/* Quick Actions Card */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider text-slate-400">
              Pintasan Operasional
            </h3>

            <button
              onClick={() => onNavigate?.('pos')}
              className="w-full flex items-center justify-between p-3.5 bg-blue-50/60 hover:bg-blue-100/70 border border-blue-100 rounded-2xl transition-all group text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-sm">
                  <ShoppingCart size={18} />
                </div>
                <div>
                  <span className="font-black text-slate-900 text-xs block group-hover:text-blue-700">
                    Buka Kasir POS
                  </span>
                  <span className="text-[10px] text-slate-500">Scan barcode & layani pelanggan</span>
                </div>
              </div>
              <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => onNavigate?.('transactions')}
              className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl transition-all group text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center text-white shadow-sm">
                  <Receipt size={18} />
                </div>
                <div>
                  <span className="font-black text-slate-900 text-xs block group-hover:text-blue-700">
                    Riwayat Transaksi
                  </span>
                  <span className="text-[10px] text-slate-500">Cetak ulang struk & ajukan void</span>
                </div>
              </div>
              <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => currentShift && setViewingShiftId(currentShift.shiftId)}
              disabled={!currentShift}
              className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl transition-all group text-left disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-sm transition-all">
                  <FileText size={18} />
                </div>
                <div>
                  <span className="font-black text-slate-900 text-xs block group-hover:text-indigo-700">
                    Lihat Laporan Sesi
                  </span>
                  <span className="text-[10px] text-slate-500">Detail performa shift aktif</span>
                </div>
              </div>
              <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => handlePrintShiftSummary()}
              disabled={isPrintingSummary || (!currentShift && !latestShift)}
              className="w-full flex items-center justify-between p-3.5 bg-amber-50/70 hover:bg-amber-100/80 border border-amber-200/80 rounded-2xl transition-all group text-left disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center text-white shadow-sm">
                  <Printer size={18} />
                </div>
                <div>
                  <span className="font-black text-slate-900 text-xs block group-hover:text-amber-800">
                    Cetak Ringkasan Shift
                  </span>
                  <span className="text-[10px] text-slate-500">Struk thermal omzet & transaksi</span>
                </div>
              </div>
              <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => onNavigate?.('shift-history')}
              className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl transition-all group text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shadow-sm transition-all group-hover:bg-indigo-600 group-hover:text-white">
                  <History size={18} />
                </div>
                <div>
                  <span className="font-black text-slate-900 text-xs block group-hover:text-indigo-700">
                    Riwayat Shift
                  </span>
                  <span className="text-[10px] text-slate-500">Analisis performa & log sesi</span>
                </div>
              </div>
              <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => onNavigate?.('stock-opname')}
              className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl transition-all group text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-sm">
                  <Coins size={18} />
                </div>
                <div>
                  <span className="font-black text-slate-900 text-xs block group-hover:text-emerald-700">
                    Stock Count / Opname
                  </span>
                  <span className="text-[10px] text-slate-500">Input hitungan fisik barang</span>
                </div>
              </div>
              <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-all" />
            </button>
          </div>

          {/* Clock Out Shortcut Box */}
          {currentShift ? (
            <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 text-center">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-500 block mb-1">
                Sesi Kasir Berlangsung
              </span>
              <p className="text-xs text-slate-600 font-medium mb-3">
                Sudah selesai jam kerja? Lakukan rekonsiliasi dan tutup shift kasir.
              </p>
              <button
                onClick={() => {
                  setActualCashInput('');
                  setClockOutError('');
                  setIsClockOutModalOpen(true);
                }}
                className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-rose-200 flex items-center justify-center gap-2 transition-all"
              >
                <LogOut size={16} />
                <span>Clock Out Sekarang</span>
              </button>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 text-center">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block mb-1">
                Sesi Kasir Belum Dibuka
              </span>
              <p className="text-xs text-slate-600 font-medium mb-3">
                Mulai shift baru untuk dapat memproses penjualan di POS.
              </p>
              <button
                onClick={() => setIsClockInModalOpen(true)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-emerald-200 flex items-center justify-center gap-2 transition-all"
              >
                <Clock size={16} />
                <span>Clock In Sekarang</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Pending Void / Refund Requests */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Pengajuan Void & Refund Menunggu Review Owner
              </h2>
              {pendingVoidRequests && pendingVoidRequests.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                  {pendingVoidRequests.length} Pending
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Daftar struk yang telah Anda ajukan dengan status <span className="font-mono font-bold text-amber-700">approval_pending</span> untuk ditinjau oleh Owner.
            </p>
          </div>

          <button
            onClick={() => onNavigate?.('transactions')}
            className="text-xs font-black text-blue-600 hover:text-blue-500 flex items-center gap-1 uppercase tracking-wider"
          >
            <span>Semua Transaksi</span>
            <ArrowRight size={14} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="py-3.5 px-6">No. Struk & Waktu</th>
                <th className="py-3.5 px-6">Tipe Permohonan</th>
                <th className="py-3.5 px-6">Alasan Pengajuan</th>
                <th className="py-3.5 px-6 text-right">Nilai Struk</th>
                <th className="py-3.5 px-6 text-center">Status</th>
                <th className="py-3.5 px-6 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingVoidRequests && pendingVoidRequests.length > 0 ? (
                pendingVoidRequests.map((tx) => (
                  <tr key={tx.transactionId} className="hover:bg-slate-50/80 transition-colors bg-amber-50/20">
                    <td className="py-4 px-6">
                      <span className="font-mono font-bold text-slate-900 block text-xs">
                        {tx.receiptNumber}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {format(new Date(tx.clientTimestamp), 'dd/MM/yyyy HH:mm')}
                      </span>
                    </td>

                    <td className="py-4 px-6">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200">
                        {tx.voidActionType || 'VOID'}
                      </span>
                    </td>

                    <td className="py-4 px-6">
                      <p className="font-medium text-slate-800 italic max-w-sm line-clamp-2">
                        "{tx.voidReason || 'Tidak ada catatan'}"
                      </p>
                    </td>

                    <td className="py-4 px-6 text-right font-black text-slate-900 tabular-nums">
                      Rp {tx.total.toLocaleString()}
                    </td>

                    <td className="py-4 px-6 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                        <Hourglass size={11} className="animate-spin-slow" />
                        approval_pending
                      </span>
                    </td>

                    <td className="py-4 px-6 text-center">
                      <button
                        onClick={() => onNavigate?.('transactions')}
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all"
                      >
                        Buka Struk
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                    Tidak ada pengajuan void/refund yang sedang menunggu review. Semua transaksi bersih.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clock Out Reconciliation Modal */}
      {isClockOutModalOpen && currentShift && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5 text-rose-600 font-black text-base uppercase">
                <LogOut size={20} />
                <span>Clock Out & Tutup Shift</span>
              </div>
              <button onClick={() => setIsClockOutModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {/* Calculations Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 text-xs space-y-2">
              <div className="flex justify-between items-center text-slate-600">
                <span>Waktu Clock Out (End Timestamp):</span>
                <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                  {format(now, 'dd/MM/yyyy HH:mm:ss')}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Total Transaksi Shift:</span>
                <span className="font-bold text-blue-600">{totalCompletedCount} Transaksi Selesai</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Modal Awal Kasir:</span>
                <span className="font-bold tabular-nums">Rp {startingCash.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Total Penjualan Tunai:</span>
                <span className="font-bold tabular-nums text-emerald-600">+Rp {cashSales.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-900 font-black text-sm pt-2 border-t border-slate-200">
                <span>Uang Seharusnya di Laci (Expected):</span>
                <span className="text-blue-600 tabular-nums">Rp {expectedDrawerCash.toLocaleString()}</span>
              </div>
            </div>

            {/* Input actual cash */}
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Hitung Uang Fisik Aktual di Laci (Rp) *
                </label>
                <input
                  type="number"
                  autoFocus
                  placeholder="0"
                  value={actualCashInput ?? ''}
                  onChange={(e) => setActualCashInput(e.target.value)}
                  className="w-full text-2xl font-black text-center p-3 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-blue-500 outline-none tabular-nums"
                />
              </div>

              {/* Live discrepancy preview */}
              {actualCashInput && (
                <div className={`p-3 rounded-xl border flex justify-between items-center text-xs ${
                  discrepancy === 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : discrepancy > 0
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <span className="font-bold">Selisih Kasir:</span>
                  <span className="font-black text-sm tabular-nums">
                    {discrepancy === 0
                      ? '✓ Pas (Rp 0)'
                      : `${discrepancy > 0 ? '+' : ''}Rp ${discrepancy.toLocaleString()} (${discrepancy > 0 ? 'Lebih' : 'Kurang'})`}
                  </span>
                </div>
              )}

              {/* Contextual Notes on Shift End */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Catatan Penutupan Shift (Notes / Alasan Selisih Kasir)
                </label>
                <textarea
                  rows={2}
                  value={clockOutNotes ?? ''}
                  onChange={(e) => setClockOutNotes(e.target.value)}
                  placeholder="Contoh: Selisih uang kasir karena salah kembalian struk #102, pecahan kecil diganti, dll."
                  className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-rose-500 outline-none resize-none transition-all"
                />
              </div>

              {clockOutError && (
                <p className="text-rose-600 text-[11px] font-bold text-center">
                  {clockOutError}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsClockOutModalOpen(false)}
                className="flex-1 py-3 text-slate-500 font-bold text-xs uppercase tracking-wider hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmClockOut}
                disabled={isClosingShift || !actualCashInput}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isClosingShift ? 'Menutup Shift...' : `Konfirmasi Clock Out (${totalCompletedCount} Transaksi)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clock In Modal */}
      <ClockInModal
        isOpen={isClockInModalOpen}
        onClose={() => setIsClockInModalOpen(false)}
      />
      {/* Shift Report Modal */}
      {viewingShiftId && (
        <div className="fixed inset-0 z-[300] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-2xl w-full relative">
            <button 
              onClick={() => setViewingShiftId(null)}
              className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
            <ShiftReport shiftId={viewingShiftId} />
          </div>
        </div>
      )}
    </div>
  );
}
