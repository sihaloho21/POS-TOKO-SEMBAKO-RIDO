import React, { useRef } from 'react';
import { X, Printer, Banknote, Calendar, UserCheck, ShieldCheck } from 'lucide-react';
import type { PayrollRecord } from '@/core/types';

interface PayrollSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: PayrollRecord | null;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function PayrollSlipModal({ isOpen, onClose, record }: PayrollSlipModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !record) return null;

  const handlePrint = () => {
    window.print();
  };

  const periodLabel = `${MONTH_NAMES[record.periodMonth - 1] || record.periodMonth} ${record.periodYear}`;

  const formatRupiah = (val: number) => {
    return 'Rp ' + (Number(val) || 0).toLocaleString('id-ID');
  };

  const methodLabel: Record<string, string> = {
    CASH_WARUNG: 'Tunai (Kas Warung)',
    CASH_IKAN: 'Tunai (Kas Ikan)',
    TRANSFER: 'Transfer Bank',
    DIGITAL: 'Saldo Uang Digital'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Controls (Not printed) */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Preview Slip Gaji Karyawan
            </span>
            {record.isBackdated && (
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 rounded-md border border-amber-200">
                Histori Lampau
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-xs"
            >
              <Printer size={15} /> Cetak Slip
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Slip Area */}
        <div ref={printAreaRef} className="p-6 md:p-8 bg-white text-slate-900 print:p-0 print:m-0 font-sans">
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body * {
                visibility: hidden;
              }
              .fixed {
                position: static !important;
                background: white !important;
                padding: 0 !important;
              }
              [ref="printAreaRef"], [ref="printAreaRef"] * {
                visibility: visible;
              }
              .print-container {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 16px;
              }
            }
          `}} />

          <div className="print-container border border-slate-200 print:border-none p-6 rounded-2xl">
            {/* Header */}
            <div className="text-center border-b-2 border-dashed border-slate-300 pb-4 mb-4">
              <h2 className="text-lg font-black tracking-tight text-slate-900 uppercase">
                TOKO SEMBAKO RIAMA
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Penyedia Sembako, Ikan Basah & Layanan Digital
              </p>
              <div className="mt-2 inline-block px-3 py-1 bg-slate-100 rounded-full text-[11px] font-black text-slate-700 uppercase tracking-widest">
                SLIP GAJI & INSENTIF KARYAWAN
              </div>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 text-xs gap-y-1.5 mb-5 pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Karyawan</span>
                <span className="font-extrabold text-slate-900 uppercase">{record.employeeName}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Periode</span>
                <span className="font-extrabold text-blue-600 uppercase">{periodLabel}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tanggal Bayar</span>
                <span className="font-semibold text-slate-700">{record.paymentDate}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Metode Bayar</span>
                <span className="font-semibold text-slate-700">{methodLabel[record.paymentMethod] || record.paymentMethod}</span>
              </div>
            </div>

            {/* Salary Breakdown */}
            <div className="space-y-3 mb-5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Rincian Pendapatan
              </span>

              {/* Base Salary */}
              <div className="flex justify-between items-center py-1.5 px-3 bg-slate-50 rounded-xl text-xs">
                <span className="font-bold text-slate-800">Gaji Pokok</span>
                <span className="font-black text-slate-900">{formatRupiah(record.baseSalary)}</span>
              </div>

              {/* Bonuses List */}
              {record.bonuses && record.bonuses.length > 0 && (
                <div className="space-y-1.5 pl-2 border-l-2 border-blue-400">
                  <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                    Bonus & Insentif Kinerja:
                  </div>
                  {record.bonuses.map((bonus, idx) => (
                    <div key={idx} className="flex justify-between items-start text-xs py-1 px-2 rounded-lg bg-blue-50/50">
                      <div>
                        <span className="font-bold text-slate-800">{bonus.categoryName}</span>
                        {bonus.notes && (
                          <span className="text-[10px] text-slate-500 block italic">({bonus.notes})</span>
                        )}
                      </div>
                      <span className="font-bold text-blue-700 shrink-0">{formatRupiah(bonus.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs pt-1 px-2 font-bold text-slate-600 border-t border-blue-100">
                    <span>Subtotal Bonus</span>
                    <span>{formatRupiah(record.totalBonus)}</span>
                  </div>
                </div>
              )}

              {/* Deductions if any */}
              {record.deductions > 0 && (
                <div className="flex justify-between items-center py-1.5 px-3 bg-rose-50 rounded-xl text-xs text-rose-700">
                  <span className="font-bold">Potongan / Kasbon</span>
                  <span className="font-black">- {formatRupiah(record.deductions)}</span>
                </div>
              )}

              {/* Total Take Home Pay */}
              <div className="pt-3 border-t-2 border-slate-900 flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                    Total Gaji Bersih
                  </span>
                  <span className="text-sm font-black text-slate-900 uppercase">
                    Take Home Pay
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-emerald-600 tabular-nums">
                    {formatRupiah(record.totalAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {record.notes && (
              <div className="mb-6 p-2.5 bg-slate-50 rounded-xl text-[11px] text-slate-600 border border-slate-200">
                <span className="font-bold text-slate-800">Catatan: </span>
                {record.notes}
              </div>
            )}

            {/* Signature Area */}
            <div className="grid grid-cols-2 gap-6 pt-6 border-t border-dashed border-slate-300 text-center text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-12">
                  Penerima (Karyawan)
                </span>
                <span className="font-bold text-slate-900 border-t border-slate-400 pt-1 px-4 inline-block uppercase">
                  {record.employeeName}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-12">
                  Mengetahui (Owner Toko)
                </span>
                <span className="font-bold text-slate-900 border-t border-slate-400 pt-1 px-4 inline-block uppercase">
                  Toko Sembako Riama
                </span>
              </div>
            </div>

            {/* Footer watermark */}
            <div className="mt-6 text-center text-[9px] text-slate-400">
              ID Slip: {record.id} • Dicetak via POS Toko Sembako Riama
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
