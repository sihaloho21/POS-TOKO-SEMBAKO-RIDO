import React, { useRef } from 'react';
import { X, Printer, Calendar, Clock, User, Phone, CheckSquare, Square, Fish } from 'lucide-react';
import type { PrepOrder, PrepCuttingStyle } from '@/core/types';

interface PrepTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PrepOrder | null;
}

const CUTTING_STYLE_LABELS: Record<PrepCuttingStyle, string> = {
  UTUH: 'Ikan Utuh (Tidak Dipotong)',
  BELAH_BAKAR: 'Belah Punggung (Model Ikan Bakar)',
  POTONG_2: 'Potong 2 Bagian',
  POTONG_3: 'Potong 3 Bagian',
  POTONG_4: 'Potong 4 Bagian',
  KERAT_GORENG: 'Kerat Sayat Badan (Siap Goreng)',
  FILLET: 'Fillet Daging (Tanpa Tulang)',
  CUSTOM: 'Potongan Khusus'
};

export function PrepTicketModal({ isOpen, onClose, order }: PrepTicketModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !order) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Controls (Not printed) */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Tiket Instruksi Olah Ikan
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-blue-100 text-blue-800 rounded">
              {order.orderNumber}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-xs"
            >
              <Printer size={15} /> Cetak Tiket
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Ticket */}
        <div ref={printRef} className="p-6 bg-white text-slate-900 font-sans print:p-0 print:m-0">
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
              [ref="printRef"], [ref="printRef"] * {
                visibility: visible;
              }
              .print-ticket-box {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 8px;
              }
            }
          `}} />

          <div className="print-ticket-box border border-slate-200 print:border-none p-5 rounded-2xl">
            {/* Header */}
            <div className="text-center border-b-2 border-dashed border-slate-300 pb-3 mb-3">
              <h3 className="text-base font-black uppercase tracking-tight text-slate-900">
                TOKO SEMBAKO RIAMA
              </h3>
              <p className="text-[10px] text-slate-500 font-medium">
                SURAT PERINTAH KERJA (SPK) LAPAK IKAN
              </p>
              <div className="mt-1.5 inline-block px-3 py-0.5 bg-slate-100 font-mono text-xs font-black text-slate-800 rounded">
                {order.orderNumber}
              </div>
            </div>

            {/* Target Schedule */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 mb-3 text-xs space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target Selesai</span>
                <span className="font-black text-blue-700 text-sm">
                  {order.scheduledDate} • {order.scheduledTime} WIB
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pemesan</span>
                <span className="font-extrabold uppercase">{order.customerName}</span>
              </div>
              {order.customerPhone && (
                <div className="flex justify-between items-center text-slate-600 text-[11px]">
                  <span>No. HP/WA</span>
                  <span className="font-mono">{order.customerPhone}</span>
                </div>
              )}
            </div>

            {/* Fish Items & Cutting Checklist */}
            <div className="space-y-3 mb-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Detail Ikan &amp; Instruksi Pengolahan
              </span>

              {order.items?.map((item, idx) => (
                <div key={idx} className="p-3 bg-blue-50/40 border border-blue-200/60 rounded-xl space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-black text-xs text-blue-950 uppercase block">
                        {item.productName}
                      </span>
                      <span className="text-[11px] font-bold text-indigo-700 block">
                        Ukuran: {item.sizeSpec}
                      </span>
                    </div>
                    <span className="text-base font-black text-slate-900 bg-white px-2 py-0.5 rounded-lg border border-blue-200 tabular-nums">
                      {item.weightKg} Kg
                    </span>
                  </div>

                  {/* Checklist options */}
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-1.5 border-t border-blue-100">
                    <div className="flex items-center gap-1.5 font-bold text-slate-700">
                      {item.cleanScale ? <CheckSquare size={14} className="text-emerald-600" /> : <Square size={14} className="text-slate-400" />}
                      <span>Buang Sisik</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-bold text-slate-700">
                      {item.cleanGut ? <CheckSquare size={14} className="text-emerald-600" /> : <Square size={14} className="text-slate-400" />}
                      <span>Buang Isi Perut</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-bold text-slate-700">
                      {item.cleanGills ? <CheckSquare size={14} className="text-emerald-600" /> : <Square size={14} className="text-slate-400" />}
                      <span>Buang Insang</span>
                    </div>
                  </div>

                  {/* Cutting style badge */}
                  <div className="bg-white p-2 rounded-lg border border-blue-200/80 text-[11px]">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Jenis Potongan:</span>
                    <span className="font-extrabold text-slate-900">
                      {item.cuttingStyle ? (CUTTING_STYLE_LABELS[item.cuttingStyle] || item.cuttingStyle) : 'Utuh Bersih'}
                    </span>
                    {item.customCuttingNotes && (
                      <p className="text-[10px] text-slate-600 mt-0.5 italic">
                        "{item.customCuttingNotes}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* General notes */}
            {order.generalNotes && (
              <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 mb-3">
                <span className="font-bold">Catatan Pesanan: </span>
                {order.generalNotes}
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-dashed border-slate-300 pt-3 text-center text-[10px] text-slate-500 space-y-1">
              <div className="flex justify-between font-bold">
                <span>Total Berat: {order.totalWeightKg} Kg</span>
                <span>Status: {order.status}</span>
              </div>
              <p className="text-[9px] text-slate-400 pt-1">
                Tempelkan tiket ini pada wadah/kantong ikan pesanan.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
