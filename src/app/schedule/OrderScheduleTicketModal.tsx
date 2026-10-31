import React from 'react';
import { Printer, X, Check, Clock, Calendar, MapPin, Phone, User, Package, AlertCircle } from 'lucide-react';
import type { PrepOrder } from '@/core/types';

interface OrderScheduleTicketModalProps {
  order: PrepOrder | null;
  isOpen: boolean;
  onClose: () => void;
}

export function OrderScheduleTicketModal({ order, isOpen, onClose }: OrderScheduleTicketModalProps) {
  if (!isOpen || !order) return null;

  const handlePrint = () => {
    window.print();
  };

  const isDelivery = order.fulfillmentType === 'DELIVERY';
  const remaining = (order.totalEstimatedPrice || 0) - (order.downPaymentAmount || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Printer size={18} className="text-blue-400" />
            <h3 className="font-bold text-sm tracking-wide uppercase">Surat Perintah Kerja (SPK) & Label</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Printable Ticket Area */}
        <div className="p-6 overflow-y-auto flex-1 font-mono text-xs bg-slate-50">
          <div 
            id="spk-printable-area" 
            className="bg-white p-6 rounded-xl border border-dashed border-slate-300 shadow-sm space-y-4"
          >
            {/* Header Store */}
            <div className="text-center pb-3 border-b border-dashed border-slate-300">
              <h2 className="text-base font-black tracking-tight text-slate-900 uppercase">HARAPAN JAYA</h2>
              <p className="text-[10px] text-slate-500 font-sans">Ikan Segar • Buah Segar • Sembako Murah</p>
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full font-sans font-bold text-[11px] text-slate-800">
                <span>{order.orderNumber}</span>
                <span>•</span>
                <span className={order.priority === 'URGENT' ? 'text-red-600' : order.priority === 'VIP_EVENT' ? 'text-purple-600' : 'text-slate-600'}>
                  {order.priority}
                </span>
              </div>
            </div>

            {/* Target Schedule & Fulfillment */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg text-[11px]">
              <div>
                <span className="text-slate-400 uppercase text-[9px] font-sans block">Jadwal Selesai</span>
                <span className="font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                  <Calendar size={12} className="text-slate-400" />
                  {order.scheduledDate}
                </span>
                <span className="font-bold text-blue-700 flex items-center gap-1 mt-0.5">
                  <Clock size={12} className="text-blue-500" />
                  {order.scheduledTime} WIB
                </span>
              </div>
              <div>
                <span className="text-slate-400 uppercase text-[9px] font-sans block">Metode Penyerahan</span>
                <span className={`inline-block px-2 py-0.5 mt-1 rounded text-[10px] font-bold ${
                  isDelivery ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {isDelivery ? '🚗 DIANTAR KE ALAMAT' : '🏪 AMBIL DI TOKO'}
                </span>
              </div>
            </div>

            {/* Customer Details */}
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Pemesan:</span>
                <span className="font-bold text-slate-900">{order.customerName}</span>
              </div>
              {order.customerPhone && (
                <div className="flex justify-between">
                  <span className="text-slate-500">No. Kontak:</span>
                  <span className="font-medium text-slate-800">{order.customerPhone}</span>
                </div>
              )}
              {isDelivery && order.customerAddress && (
                <div className="pt-1 border-t border-slate-100 text-[10px]">
                  <span className="text-slate-500 block">Alamat Pengiriman:</span>
                  <span className="font-semibold text-slate-900">{order.customerAddress}</span>
                </div>
              )}
            </div>

            {/* Item Specifics */}
            <div className="pt-3 border-t border-dashed border-slate-300">
              <span className="font-sans font-bold text-[10px] text-slate-400 uppercase tracking-wider block mb-2">
                DAFTAR ITEM & SPESIFIKASI PENGERJAAN:
              </span>

              <div className="space-y-3">
                {order.items.map((item, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] space-y-1.5">
                    <div className="flex justify-between items-start font-bold text-slate-900">
                      <span>{idx + 1}. {item.productName}</span>
                      <span className="text-blue-700 font-black">
                        {item.quantityValue || item.weightKg} {item.quantityUnit || 'KG'}
                      </span>
                    </div>

                    {/* Spesifikasi Ikan */}
                    {(item.category === 'IKAN' || item.cleanScale || item.cleanGills || item.cleanGut || item.cuttingStyle) && (
                      <div className="pl-3 border-l-2 border-cyan-400 text-[10px] text-slate-700 space-y-0.5">
                        <div className="text-cyan-800 font-bold">Instruksi Ikan:</div>
                        {item.sizeSpec && <div>• Ukuran: <span className="font-semibold">{item.sizeSpec}</span></div>}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.cleanScale && <span className="bg-cyan-100 text-cyan-800 px-1 rounded">Sisik Bersih ✓</span>}
                          {item.cleanGills && <span className="bg-cyan-100 text-cyan-800 px-1 rounded">Buang Insang ✓</span>}
                          {item.cleanGut && <span className="bg-cyan-100 text-cyan-800 px-1 rounded">Buang Isi Perut ✓</span>}
                        </div>
                        {item.cuttingStyle && (
                          <div className="font-bold text-slate-900 mt-1">
                            Model: <span className="bg-amber-100 text-amber-900 px-1 rounded">{item.cuttingStyle}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Spesifikasi Buah */}
                    {item.fruitSpecs && (
                      <div className="pl-3 border-l-2 border-amber-400 text-[10px] text-slate-700 space-y-0.5">
                        <div className="text-amber-800 font-bold">Instruksi Buah:</div>
                        {item.fruitSpecs.ripeness && (
                          <div>• Kematangan: <span className="font-semibold">{item.fruitSpecs.ripeness.replace(/_/g, ' ')}</span></div>
                        )}
                        {item.fruitSpecs.grade && (
                          <div>• Grade/Sortir: <span className="font-semibold">{item.fruitSpecs.grade}</span></div>
                        )}
                        {item.fruitSpecs.packaging && (
                          <div>• Kemasan: <span className="font-semibold">{item.fruitSpecs.packaging.replace(/_/g, ' ')}</span></div>
                        )}
                        {item.fruitSpecs.notes && <div className="italic text-slate-600">Catatan: {item.fruitSpecs.notes}</div>}
                      </div>
                    )}

                    {/* Spesifikasi Sembako */}
                    {item.sembakoSpecs && (
                      <div className="pl-3 border-l-2 border-emerald-400 text-[10px] text-slate-700 space-y-0.5">
                        <div className="text-emerald-800 font-bold">Instruksi Sembako:</div>
                        {item.sembakoSpecs.packagingType && (
                          <div>• Kemasan: <span className="font-semibold">{item.sembakoSpecs.packagingType.replace(/_/g, ' ')}</span></div>
                        )}
                        {item.sembakoSpecs.repackSpec && (
                          <div>• Repack: <span className="font-semibold">{item.sembakoSpecs.repackSpec}</span></div>
                        )}
                        {item.sembakoSpecs.sealCheck && (
                          <div className="text-emerald-700 font-bold">✓ Cek Segel Pabrik & Tanggal Kedaluwarsa</div>
                        )}
                        {item.sembakoSpecs.notes && <div className="italic text-slate-600">Catatan: {item.sembakoSpecs.notes}</div>}
                      </div>
                    )}

                    {item.packagingNotes && (
                      <div className="text-[10px] text-slate-500 italic">
                        Pengemasan: {item.packagingNotes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* General Notes */}
            {order.generalNotes && (
              <div className="p-2.5 bg-yellow-50 rounded-lg border border-yellow-200 text-[10px] text-yellow-900">
                <span className="font-bold block">CATATAN KHUSUS PELANGGAN:</span>
                <p className="mt-0.5">{order.generalNotes}</p>
              </div>
            )}

            {/* Financial Summary */}
            <div className="pt-3 border-t border-dashed border-slate-300 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Estimasi Total:</span>
                <span className="font-bold text-slate-900">Rp {(order.totalEstimatedPrice || 0).toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status Bayar:</span>
                <span className={`font-bold ${order.paymentStatus === 'PAID' ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {order.paymentStatus === 'PAID' ? 'LUNAS' : order.paymentStatus === 'DOWN_PAYMENT' ? 'UANG MUKA (DP)' : 'BELUM BAYAR'}
                </span>
              </div>
              {order.paymentStatus === 'DOWN_PAYMENT' && (
                <>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">DP Diterima:</span>
                    <span>Rp {(order.downPaymentAmount || 0).toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between font-black text-red-600 text-[11px]">
                    <span>Sisa Pelunasan:</span>
                    <span>Rp {remaining.toLocaleString('id-ID')}</span>
                  </div>
                </>
              )}
            </div>

            {/* Footer Sign-off */}
            <div className="pt-4 border-t border-dashed border-slate-300 grid grid-cols-2 text-center text-[9px] text-slate-500 font-sans">
              <div>
                <p>Petugas Pengerjaan</p>
                <div className="h-10"></div>
                <p className="font-semibold text-slate-800">({order.assignedStaffName || '....................'})</p>
              </div>
              <div>
                <p>Penerima / Pelanggan</p>
                <div className="h-10"></div>
                <p className="font-semibold text-slate-800">({order.customerName})</p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
          >
            Tutup
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-200 transition-all"
          >
            <Printer size={16} />
            Cetak SPK / Label
          </button>
        </div>
      </div>
    </div>
  );
}
