import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { ShiftService } from '@/core/services/shift-service';
import { useAuthStore } from '@/core/auth-store';
import { 
  ClipboardList, 
  Receipt, 
  Wallet, 
  ChevronUp, 
  ChevronDown, 
  Clock, 
  PauseCircle, 
  Banknote, 
  CreditCard,
  PlusCircle,
  TrendingUp,
  UserCheck
} from 'lucide-react';
import { format } from 'date-fns';

export default function ShiftSummaryWidget({ onOpenShiftTab }: { onOpenShiftTab?: () => void }) {
  const { currentUser } = useAuthStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOpeningShift, setIsOpeningShift] = useState(false);
  const [startingCashInput, setStartingCashInput] = useState('50000');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const deviceId = 'device-1';
  
  // Current active shift for this device
  const currentShift = useLiveQuery(
    () => ShiftService.getCurrentShift(deviceId),
    [deviceId]
  );

  const activeShifts = useLiveQuery(() => ShiftService.getActiveShifts(), []);
  const otherDeviceShift = activeShifts?.find(s => s.userId === currentUser?.userId && s.deviceId !== deviceId);

  // Resolve cashier name if different from current user
  const shiftCashier = useLiveQuery(async () => {
    if (!currentShift) return null;
    if (currentShift.userId === currentUser?.userId) return currentUser;
    return db.users.get(currentShift.userId);
  }, [currentShift, currentUser]);

  // Completed transactions for this shift and cashier
  const shiftMetrics = useLiveQuery(async () => {
    if (!currentShift) {
      return {
        count: 0,
        totalSales: 0,
        cashSales: 0,
        nonCashSales: 0,
        gajianSales: 0,
        heldCount: 0,
        avgBasket: 0,
      };
    }

    const txs = await db.transactions
      .where('shiftId')
      .equals(currentShift.shiftId)
      .filter(tx => tx.status === 'COMPLETED' && (!currentUser || tx.cashierId === currentUser.userId))
      .toArray();

    const held = await db.transactions
      .where('status')
      .equals('HOLD')
      .count();

    let total = 0;
    let cash = 0;
    let nonCash = 0;
    let gajian = 0;

    for (const tx of txs) {
      const amt = Number(tx.total || 0);
      total += amt;
      if (tx.paymentMethodId === 'CASH') {
        cash += amt;
      } else {
        nonCash += amt;
      }
      if (tx.type === 'GAJIAN') {
        gajian += amt;
      }
    }

    const count = txs.length;
    const avgBasket = count > 0 ? Math.round(total / count) : 0;

    return {
      count,
      totalSales: total,
      cashSales: cash,
      nonCashSales: nonCash,
      gajianSales: gajian,
      heldCount: held,
      avgBasket,
    };
  }, [currentShift, currentUser]);

  const handleQuickOpenShift = async () => {
    if (!currentUser) return;
    setIsSubmitting(true);
    try {
      await ShiftService.openShift({
        userId: currentUser.userId,
        deviceId,
        startingCash: Number(startingCashInput) || 0
      });
      setIsOpeningShift(false);
    } catch (err: any) {
      alert(err.message || 'Gagal membuka shift');
    } finally {
      setIsSubmitting(false);
    }
  };

  // If no shift is open
  if (!currentShift) {
    return (
      <div className="bg-slate-900 text-white rounded-2xl p-3 border border-slate-800 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${otherDeviceShift ? 'bg-amber-500' : 'bg-amber-400 animate-ping'}`} />
          <div className="flex items-center gap-2">
            <span className={`font-black uppercase tracking-wider text-[11px] ${otherDeviceShift ? 'text-amber-500' : 'text-amber-400'}`}>
              {otherDeviceShift ? 'Overlap Terdeteksi' : 'Shift Belum Aktif'}
            </span>
            <span className="text-slate-400 hidden sm:inline">•</span>
            <span className="text-slate-400">
              {otherDeviceShift 
                ? `Harap tutup shift di ${otherDeviceShift.deviceId} terlebih dahulu.`
                : `Kasir ${currentUser?.name} belum membuka sesi kasir.`}
            </span>
          </div>
        </div>

        {isOpeningShift && !otherDeviceShift ? (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">Rp</span>
              <input
                type="number"
                value={startingCashInput ?? ''}
                onChange={(e) => setStartingCashInput(e.target.value)}
                placeholder="Modal Awal"
                className="pl-7 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-bold text-xs w-28 focus:border-blue-500 outline-none"
              />
            </div>
            <button
              onClick={handleQuickOpenShift}
              disabled={isSubmitting}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] tracking-wider rounded-xl transition-all shadow-md shadow-emerald-900/30"
            >
              {isSubmitting ? 'Buka...' : 'Mulai Shift'}
            </button>
            <button
              onClick={() => setIsOpeningShift(false)}
              className="px-2 py-1.5 text-slate-400 hover:text-white font-bold text-[10px]"
            >
              Batal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsOpeningShift(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] tracking-wider rounded-xl transition-all shadow-md shadow-emerald-900/30"
          >
            <Clock size={13} />
            Clock In (Mulai Shift)
          </button>
        )}
      </div>
    );
  }

  const {
    count = 0,
    totalSales = 0,
    cashSales = 0,
    nonCashSales = 0,
    gajianSales = 0,
    heldCount = 0,
    avgBasket = 0
  } = shiftMetrics || {};

  const startingCash = currentShift.startingCash || 0;
  const cashInDrawer = startingCash + cashSales;
  const startTimeFormatted = currentShift.startTime 
    ? format(new Date(currentShift.startTime), 'HH:mm')
    : '--:--';

  return (
    <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-xl overflow-hidden transition-all">
      {/* Primary Compact Bar */}
      <div className="p-3 sm:px-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Active Shift & Cashier Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Shift Aktif
          </div>

          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400">
            <Clock size={12} className="text-slate-500" />
            <span>Mulai: <strong className="text-slate-200 tabular-nums">{startTimeFormatted}</strong></span>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <UserCheck size={12} className="text-slate-500" />
            <span className="font-bold text-slate-200 truncate max-w-[110px] sm:max-w-none">
              {shiftCashier?.name || 'Loading...'}
            </span>
          </div>
        </div>

        {/* Center/Right: Key Metrics (Count & Running Totals) */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          {/* Transaction Count */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 px-2.5 py-1 rounded-xl">
            <Receipt size={13} className="text-blue-400 shrink-0" />
            <span className="text-[10px] uppercase font-bold text-slate-400">Trx:</span>
            <span className="font-black text-white tabular-nums text-xs">{count}</span>
            {heldCount > 0 && (
              <span className="text-[9px] font-black bg-amber-500/20 text-amber-400 px-1 py-0.2 rounded ml-0.5" title={`${heldCount} transaksi tertunda`}>
                {heldCount} hold
              </span>
            )}
          </div>

          {/* Running Total Sales */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 px-2.5 py-1 rounded-xl">
            <TrendingUp size={13} className="text-emerald-400 shrink-0" />
            <span className="text-[10px] uppercase font-bold text-slate-400">Omzet:</span>
            <span className="font-black text-emerald-400 tabular-nums text-xs">
              Rp {totalSales.toLocaleString()}
            </span>
          </div>

          {/* Cash In Drawer (Uang di Laci) */}
          <div className="hidden md:flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 px-2.5 py-1 rounded-xl">
            <Wallet size={13} className="text-purple-400 shrink-0" />
            <span className="text-[10px] uppercase font-bold text-slate-400">Kas Laci:</span>
            <span className="font-black text-purple-300 tabular-nums text-xs">
              Rp {cashInDrawer.toLocaleString()}
            </span>
          </div>

          {/* Expand/Collapse Toggle */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-xl transition-all"
            title="Lihat rincian modal & metode bayar"
          >
            <span>{isExpanded ? 'Tutup' : 'Rincian'}</span>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded Breakdown Drawer */}
      {isExpanded && (
        <div className="px-4 py-3 bg-slate-950/70 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs animate-in fade-in duration-150">
          <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">
              Modal Awal (Kasir)
            </span>
            <span className="font-black text-slate-200 tabular-nums text-sm">
              Rp {startingCash.toLocaleString()}
            </span>
          </div>

          <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 block mb-0.5">
              Penjualan Tunai (Cash)
            </span>
            <span className="font-black text-emerald-400 tabular-nums text-sm">
              Rp {cashSales.toLocaleString()}
            </span>
          </div>

          <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 block mb-0.5">
              Non-Tunai / Gajian
            </span>
            <span className="font-black text-blue-300 tabular-nums text-sm">
              Rp {nonCashSales.toLocaleString()}
            </span>
          </div>

          <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[9px] font-black uppercase tracking-widest text-purple-400 block mb-0.5">
              Total Fisik di Laci
            </span>
            <span className="font-black text-purple-300 tabular-nums text-sm">
              Rp {cashInDrawer.toLocaleString()}
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5">
              (Modal + Tunai)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
