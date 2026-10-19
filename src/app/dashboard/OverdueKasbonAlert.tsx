import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { StaffDebtService, type StaffDebtItem } from '@/core/services/staff-debt-service';
import { db } from '@/core/database';
import { format, isPast, parseISO, differenceInDays } from 'date-fns';
import {
  AlertTriangle,
  Wallet,
  ArrowRight,
  Clock,
  User,
  DollarSign,
  AlertOctagon,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';

interface OverdueKasbonAlertProps {
  onNavigateToKasbon: () => void;
}

export function OverdueKasbonAlert({ onNavigateToKasbon }: OverdueKasbonAlertProps) {
  const staffDebts = useLiveQuery(() => StaffDebtService.getStaffDebts(), []);

  // Filter overdue and active debts
  const overdueDebts = React.useMemo(() => {
    if (!staffDebts) return [];
    return staffDebts.filter(d => d.remainingAmount > 0 && isPast(parseISO(d.dueDate)));
  }, [staffDebts]);

  const activeNonOverdueDebts = React.useMemo(() => {
    if (!staffDebts) return [];
    return staffDebts.filter(d => d.remainingAmount > 0 && !isPast(parseISO(d.dueDate)));
  }, [staffDebts]);

  const totalOverdueAmount = overdueDebts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const totalActiveAmount = (staffDebts || []).reduce((sum, d) => sum + d.remainingAmount, 0);

  // If there are no active debts at all, don't show the banner
  if (!staffDebts || (overdueDebts.length === 0 && activeNonOverdueDebts.length === 0)) {
    return null;
  }

  const handleAction = () => {
    // Dispatch event to activate Kasbon tab in Receivables
    window.dispatchEvent(new CustomEvent('open_kasbon_tab'));
    onNavigateToKasbon();
  };

  return (
    <div className="space-y-3">
      {/* 1. Urgent Overdue Kasbon Banner */}
      {overdueDebts.length > 0 && (
        <div className="bg-gradient-to-r from-rose-50 via-rose-50/80 to-amber-50/60 border-2 border-rose-300 rounded-3xl p-5 shadow-sm relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-200 flex-shrink-0 animate-pulse">
                <ShieldAlert size={26} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white">
                    Peringatan Tagihan Kasbon
                  </span>
                  <span className="text-xs font-bold text-rose-700">
                    {overdueDebts.length} Kasir Melewati Jatuh Tempo
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mt-1">
                  Tunggakan Kasbon Kasir: Rp {totalOverdueAmount.toLocaleString()}
                </h3>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  Terdapat tanggungan kasbon kasir (termasuk selisih uang laci shift yang dibebankan) yang telah melewati tanggal kesepakatan potong gaji.
                </p>
              </div>
            </div>

            <button
              onClick={handleAction}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-md shadow-rose-200 flex items-center gap-2 transition-all flex-shrink-0 cursor-pointer"
            >
              <Wallet size={15} />
              <span>Tagih & Buka Modul Kasbon</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {/* List of Overdue Cashiers */}
          <div className="mt-4 pt-3 border-t border-rose-200/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {overdueDebts.slice(0, 3).map((item) => {
              const daysLate = differenceInDays(new Date(), parseISO(item.dueDate));
              return (
                <div
                  key={item.receivable.receivableId}
                  onClick={handleAction}
                  className="bg-white/90 hover:bg-white p-3 rounded-2xl border border-rose-200 shadow-xs flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01]"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xs font-black uppercase">
                      {item.customer.name.replace('Kasir - ', '')[0] || 'K'}
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase">
                        {item.customer.name}
                      </h4>
                      <span className="text-[10px] text-rose-600 font-bold flex items-center gap-1">
                        <Clock size={10} /> Lewat {daysLate} hari ({format(parseISO(item.dueDate), 'dd/MM')})
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-black text-rose-600 tabular-nums block">
                      Rp {item.remainingAmount.toLocaleString()}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">
                      {item.sourceType === 'SHIFT_DISCREPANCY' ? 'Selisih Laci' : 'Pinjaman'}
                    </span>
                  </div>
                </div>
              );
            })}

            {overdueDebts.length > 3 && (
              <div
                onClick={handleAction}
                className="bg-rose-100/60 hover:bg-rose-100 p-3 rounded-2xl border border-rose-200 flex items-center justify-center text-xs font-black text-rose-800 uppercase tracking-wider cursor-pointer transition-all"
              >
                +{overdueDebts.length - 3} Kasir Lainnya...
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Informational Active Kasbon Reminder if not overdue */}
      {overdueDebts.length === 0 && activeNonOverdueDebts.length > 0 && (
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-3xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Wallet size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-tight text-indigo-950">
                  Monitoring Kasbon Kasir Aktif
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-200 text-indigo-800">
                  {activeNonOverdueDebts.length} Tanggungan
                </span>
              </div>
              <p className="text-xs text-indigo-900 font-medium">
                Total kasbon kasir berjalan: <strong>Rp {totalActiveAmount.toLocaleString()}</strong>. Pastikan terjadwal untuk pemotongan gaji / cicilan kasir.
              </p>
            </div>
          </div>

          <button
            onClick={handleAction}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm flex items-center gap-1.5 transition-all self-end sm:self-auto cursor-pointer"
          >
            <span>Buka Modul Kasbon</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
