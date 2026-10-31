import React from 'react';
import { 
  Clock, 
  Calendar, 
  MapPin, 
  Phone, 
  User, 
  Printer, 
  Edit, 
  Trash2, 
  Play, 
  CheckCircle2, 
  MessageCircle, 
  AlertTriangle,
  Sparkles,
  Fish,
  Apple,
  Package,
  ShoppingBag,
  ExternalLink
} from 'lucide-react';
import { PrepOrderService } from '@/core/services/prep-order-service';
import type { PrepOrder, PrepOrderStatus } from '@/core/types';

interface OrderScheduleCardProps {
  order: PrepOrder;
  onEdit: (order: PrepOrder) => void;
  onPrint: (order: PrepOrder) => void;
  onDelete: (orderId: string) => void;
  onStatusChange: (orderId: string, status: PrepOrderStatus) => void;
}

export function OrderScheduleCard({
  order,
  onEdit,
  onPrint,
  onDelete,
  onStatusChange
}: OrderScheduleCardProps) {
  const isDelivery = order.fulfillmentType === 'DELIVERY';
  const remaining = (order.totalEstimatedPrice || 0) - (order.downPaymentAmount || 0);

  const getCategoryBadge = () => {
    switch (order.category) {
      case 'BUAH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
            <Apple size={11} /> BUAH
          </span>
        );
      case 'SEMBAKO':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
            <Package size={11} /> SEMBAKO
          </span>
        );
      case 'CAMPURAN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
            <ShoppingBag size={11} /> CAMPURAN
          </span>
        );
      case 'IKAN':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-100 text-cyan-800 border border-cyan-200">
            <Fish size={11} /> IKAN
          </span>
        );
    }
  };

  const getPriorityBadge = () => {
    if (order.priority === 'URGENT') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-red-100 text-red-700 animate-pulse border border-red-200">
          🔥 Mendesak
        </span>
      );
    }
    if (order.priority === 'VIP_EVENT') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-purple-100 text-purple-700 border border-purple-200 flex items-center gap-1">
          <Sparkles size={10} /> VIP Event
        </span>
      );
    }
    return null;
  };

  const getStatusBadge = () => {
    switch (order.status) {
      case 'PENDING':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            ⏳ Menunggu
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            ⚙ Sedang Dikerjakan
          </span>
        );
      case 'READY':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            ✓ Siap Ambil / Kirim
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
            ✔ Selesai
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
            ✕ Dibatalkan
          </span>
        );
    }
  };

  const handleWhatsApp = () => {
    if (!order.customerPhone) return;
    let phone = order.customerPhone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) {
      phone = '62' + phone.slice(1);
    }
    const msg = PrepOrderService.getWhatsAppMessage(order);
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  return (
    <div className={`bg-white rounded-2xl border transition-all duration-200 p-4 space-y-3.5 shadow-sm hover:shadow-md ${
      order.status === 'READY' 
        ? 'border-emerald-300 ring-2 ring-emerald-100' 
        : order.status === 'IN_PROGRESS' 
        ? 'border-blue-300 ring-2 ring-blue-50' 
        : 'border-slate-200 hover:border-slate-300'
    }`}>
      {/* Top Header: Category, Order #, Priority, Status */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {getCategoryBadge()}
          <span className="font-mono text-xs font-bold text-slate-700">
            {order.orderNumber}
          </span>
          {getPriorityBadge()}
        </div>
        <div>
          {getStatusBadge()}
        </div>
      </div>

      {/* Target Schedule & Fulfillment Mode */}
      <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-semibold text-slate-700">
            <Calendar size={13} className="text-slate-400" />
            {order.scheduledDate}
          </span>
          <span className="flex items-center gap-1 font-black text-blue-700">
            <Clock size={13} className="text-blue-500" />
            {order.scheduledTime} WIB
          </span>
        </div>

        <div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
            isDelivery ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {isDelivery ? '🚗 Antar' : '🏪 Ambil'}
          </span>
        </div>
      </div>

      {/* Customer Info */}
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-900 flex items-center gap-1.5">
            <User size={13} className="text-slate-400" />
            {order.customerName}
          </span>
          {order.customerPhone && (
            <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
              <Phone size={11} className="text-slate-400" />
              {order.customerPhone}
            </span>
          )}
        </div>

        {isDelivery && order.customerAddress && (
          <div className="flex items-start gap-1 text-[11px] text-slate-600 bg-amber-50/70 p-2 rounded-lg border border-amber-200/50">
            <MapPin size={12} className="text-amber-600 shrink-0 mt-0.5" />
            <span className="truncate">{order.customerAddress}</span>
          </div>
        )}
      </div>

      {/* Items List & Specs Chips */}
      <div className="space-y-2 pt-1 border-t border-slate-100">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Instruksi Pengerjaan ({order.items.length} Item):
        </div>

        <div className="space-y-2">
          {order.items.map((item, idx) => (
            <div key={idx} className="p-2 bg-slate-50/80 rounded-lg border border-slate-200/80 text-[11px] space-y-1">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span className="truncate">{item.productName}</span>
                <span className="text-blue-700 shrink-0 font-black ml-2">
                  {item.quantityValue || item.weightKg} {item.quantityUnit || 'KG'}
                </span>
              </div>

              {/* Tags / Badges for Fish */}
              {(item.category === 'IKAN' || item.cleanScale || item.cleanGills || item.cleanGut || item.cuttingStyle) && (
                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  {item.sizeSpec && (
                    <span className="bg-slate-200/80 text-slate-700 px-1.5 py-0.5 rounded">
                      {item.sizeSpec}
                    </span>
                  )}
                  {item.cleanScale && <span className="bg-cyan-100 text-cyan-800 px-1.5 py-0.5 rounded font-medium">Sisik✓</span>}
                  {item.cleanGills && <span className="bg-cyan-100 text-cyan-800 px-1.5 py-0.5 rounded font-medium">Insang✓</span>}
                  {item.cleanGut && <span className="bg-cyan-100 text-cyan-800 px-1.5 py-0.5 rounded font-medium">Perut✓</span>}
                  {item.cuttingStyle && (
                    <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                      {item.cuttingStyle}
                    </span>
                  )}
                </div>
              )}

              {/* Tags / Badges for Fruit */}
              {item.fruitSpecs && (
                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  {item.fruitSpecs.ripeness && (
                    <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
                      {item.fruitSpecs.ripeness.replace(/_/g, ' ')}
                    </span>
                  )}
                  {item.fruitSpecs.grade && (
                    <span className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-semibold">
                      {item.fruitSpecs.grade}
                    </span>
                  )}
                  {item.fruitSpecs.packaging && (
                    <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                      {item.fruitSpecs.packaging.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              )}

              {/* Tags / Badges for Sembako */}
              {item.sembakoSpecs && (
                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  {item.sembakoSpecs.packagingType && (
                    <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-semibold">
                      {item.sembakoSpecs.packagingType.replace(/_/g, ' ')}
                    </span>
                  )}
                  {item.sembakoSpecs.repackSpec && (
                    <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                      {item.sembakoSpecs.repackSpec}
                    </span>
                  )}
                  {item.sembakoSpecs.sealCheck && (
                    <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                      Segel✓
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* General Notes if any */}
      {order.generalNotes && (
        <div className="text-[11px] text-slate-600 bg-yellow-50/80 p-2 rounded-lg border border-yellow-200/60 italic">
          "{order.generalNotes}"
        </div>
      )}

      {/* Payment & Financial Info */}
      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
        <div>
          <span className="text-[10px] text-slate-400 block">Total Estimasi</span>
          <span className="font-black text-slate-900">
            Rp {(order.totalEstimatedPrice || 0).toLocaleString('id-ID')}
          </span>
        </div>

        <div className="text-right">
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
            order.paymentStatus === 'PAID'
              ? 'bg-emerald-100 text-emerald-800'
              : order.paymentStatus === 'DOWN_PAYMENT'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-red-100 text-red-700'
          }`}>
            {order.paymentStatus === 'PAID' 
              ? 'Lunas' 
              : order.paymentStatus === 'DOWN_PAYMENT' 
              ? `DP Rp ${(order.downPaymentAmount || 0).toLocaleString('id-ID')}` 
              : 'Belum Bayar'}
          </span>
          {order.paymentStatus === 'DOWN_PAYMENT' && remaining > 0 && (
            <span className="block text-[10px] font-bold text-red-600">
              Sisa Rp {remaining.toLocaleString('id-ID')}
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons: 1-Click Status Progression */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPrint(order)}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            title="Cetak SPK & Label"
          >
            <Printer size={15} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(order)}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            title="Edit Detail"
          >
            <Edit size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(order.orderId)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
            title="Hapus"
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* Status transition button */}
        <div className="flex items-center gap-1.5">
          {order.status === 'PENDING' && (
            <button
              type="button"
              onClick={() => onStatusChange(order.orderId, 'IN_PROGRESS')}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-200 transition-all"
            >
              <Play size={12} fill="currentColor" />
              Mulai Kerjakan
            </button>
          )}

          {order.status === 'IN_PROGRESS' && (
            <button
              type="button"
              onClick={() => onStatusChange(order.orderId, 'READY')}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-emerald-200 transition-all"
            >
              <CheckCircle2 size={13} />
              Tandai Siap
            </button>
          )}

          {order.status === 'READY' && (
            <div className="flex items-center gap-1">
              {order.customerPhone && (
                <button
                  type="button"
                  onClick={handleWhatsApp}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                  title="Kirim pesan WhatsApp bahwa pesanan siap"
                >
                  <MessageCircle size={13} />
                  WA
                </button>
              )}
              <button
                type="button"
                onClick={() => onStatusChange(order.orderId, 'COMPLETED')}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
              >
                <CheckCircle2 size={13} />
                Diserahkan
              </button>
            </div>
          )}

          {order.status === 'COMPLETED' && (
            <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg">
              <CheckCircle2 size={12} />
              Selesai
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
