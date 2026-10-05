import React, { useState } from 'react';
import { 
  X, 
  Building2, 
  Phone, 
  MapPin, 
  FileText, 
  ShoppingBag, 
  TrendingUp, 
  Calendar, 
  Plus, 
  Archive, 
  CheckCircle2, 
  Clock, 
  ExternalLink,
  MessageCircle,
  AlertCircle
} from 'lucide-react';
import type { Supplier, Purchase } from '@/core/types';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import type { SupplierReliability } from '@/core/services/supplier-analytics-service';

interface SupplierDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
  reliability?: SupplierReliability;
  onEdit: (supplier: Supplier) => void;
  onNewPurchase: (supplierId: string) => void;
  onReturnProduct: (supplierId: string) => void;
}

export function SupplierDetailModal({
  isOpen,
  onClose,
  supplier,
  reliability,
  onEdit,
  onNewPurchase,
  onReturnProduct,
}: SupplierDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'INVOICES' | 'INFO'>('INVOICES');

  const purchases = useLiveQuery(
    () => {
      if (!supplier) return [];
      return db.purchases
        .where('supplierId')
        .equals(supplier.supplierId)
        .reverse()
        .sortBy('timestamp');
    },
    [supplier?.supplierId]
  );

  if (!isOpen || !supplier) return null;

  const totalPurchaseValue = purchases?.reduce((acc, p) => acc + (p.total || 0), 0) || 0;
  const paidCount = purchases?.filter(p => p.status === 'PAID').length || 0;
  const payableCount = purchases?.filter(p => p.status === 'CONFIRMED' || p.status === 'DRAFT').length || 0;

  // Clean phone number for WhatsApp
  const cleanPhone = supplier.phone?.replace(/[^0-9]/g, '') || '';
  const waPhone = cleanPhone.startsWith('0') 
    ? '62' + cleanPhone.slice(1) 
    : cleanPhone.startsWith('62') 
      ? cleanPhone 
      : cleanPhone;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div 
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-800 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pr-10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-2xl shadow-lg shadow-blue-500/30 shrink-0">
                {supplier.name[0]?.toUpperCase() || 'S'}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl font-black uppercase tracking-tight text-white">
                    {supplier.name}
                  </h3>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    supplier.status === 'ACTIVE' 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}>
                    {supplier.status === 'ACTIVE' ? 'Aktif' : 'Non-Aktif'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 flex items-center gap-2">
                  <span>ID: <code className="text-blue-300 font-mono text-[11px]">{supplier.supplierId.slice(0, 8)}</code></span>
                  <span>•</span>
                  <span>Terdaftar: {new Date(supplier.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </p>
              </div>
            </div>

            {/* Direct Contact Buttons */}
            <div className="flex items-center gap-2">
              {supplier.phone && (
                <>
                  <a
                    href={`https://wa.me/${waPhone}?text=Halo%20${encodeURIComponent(supplier.name)},%20kami%20dari%20Toko%20Harapan%20Jaya`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-900/30"
                  >
                    <MessageCircle size={14} />
                    WhatsApp
                  </a>
                  <a
                    href={`tel:${supplier.phone}`}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all"
                  >
                    <Phone size={14} />
                    Telepon
                  </a>
                </>
              )}
              <button
                onClick={() => {
                  onEdit(supplier);
                  onClose();
                }}
                className="px-3 py-2 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-all"
              >
                Edit
              </button>
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-6 bg-slate-50 border-b border-slate-100">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
              Total Pembelian
            </span>
            <span className="text-base font-black text-slate-900">
              Rp {totalPurchaseValue.toLocaleString('id-ID')}
            </span>
            <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
              {purchases?.length || 0} faktur tercatat
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
              Status Faktur
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                {paidCount} Lunas
              </span>
              {payableCount > 0 && (
                <span className="text-xs font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
                  {payableCount} Tempo
                </span>
              )}
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
              Skor Reliabilitas
            </span>
            <div className="flex items-center gap-2 mt-1">
              <div className={`text-base font-black ${
                (reliability?.reliabilityScore || 0) >= 80 
                  ? 'text-emerald-600' 
                  : (reliability?.reliabilityScore || 0) >= 50 
                    ? 'text-amber-600' 
                    : 'text-slate-600'
              }`}>
                {reliability?.reliabilityScore || 0}/100
              </div>
              <span className="text-[10px] text-slate-400 font-bold">
                {(reliability?.priceStability ? Math.round(reliability.priceStability * 100) : 100)}% Stabil
              </span>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <button
              onClick={() => {
                onNewPurchase(supplier.supplierId);
                onClose();
              }}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-blue-200 transition-all"
            >
              <Plus size={14} />
              Input Belanja
            </button>
            <button
              onClick={() => {
                onReturnProduct(supplier.supplierId);
                onClose();
              }}
              className="w-full mt-1.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all"
            >
              <Archive size={12} />
              Retur Barang
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="px-6 border-b border-slate-200 flex items-center gap-6 bg-white">
          <button
            onClick={() => setActiveTab('INVOICES')}
            className={`py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'INVOICES'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <ShoppingBag size={14} />
            Riwayat Faktur Pembelian ({purchases?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('INFO')}
            className={`py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'INFO'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <FileText size={14} />
            Info Detail & Syarat
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'INVOICES' ? (
            <div className="space-y-3">
              {!purchases || purchases.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl">
                  <ShoppingBag size={36} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-bold text-slate-700 uppercase tracking-tight">Belum Ada Riwayat Pembelian</p>
                  <p className="text-xs text-slate-400 mt-1 mb-4">Catat faktur masuk atau kulakan dari supplier ini.</p>
                  <button
                    onClick={() => {
                      onNewPurchase(supplier.supplierId);
                      onClose();
                    }}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-blue-200 hover:bg-blue-500 transition-all inline-flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    Catat Faktur Pertama
                  </button>
                </div>
              ) : (
                purchases.map((purchase) => (
                  <div
                    key={purchase.purchaseId}
                    className="p-4 rounded-2xl border border-slate-200 hover:border-blue-300 bg-white transition-all shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                        <FileText size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-black text-slate-900">
                            #{purchase.invoiceNumber}
                          </span>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                            purchase.status === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {purchase.status === 'PAID' ? 'LUNAS' : purchase.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {new Date(purchase.timestamp).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <span>•</span>
                          <span>{purchase.items?.length || 0} macam produk</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-left sm:text-right w-full sm:w-auto">
                      <span className="text-xs text-slate-400 block font-bold">Total Nilai</span>
                      <span className="text-base font-black text-slate-900">
                        Rp {(purchase.total || 0).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                  <MapPin size={14} className="text-blue-600" />
                  Alamat Lengkap
                </h4>
                <p className="text-sm text-slate-700 font-medium">
                  {supplier.address || 'Belum ada alamat terdaftar.'}
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                  <Phone size={14} className="text-blue-600" />
                  Kontak & Narahubung
                </h4>
                <div className="text-sm text-slate-700 space-y-1">
                  <p><span className="text-slate-400 font-bold">Nomor HP/WA:</span> {supplier.phone || '-'}</p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                  <FileText size={14} className="text-blue-600" />
                  Catatan Khusus & Term of Payment
                </h4>
                <p className="text-sm text-slate-700 font-medium whitespace-pre-line">
                  {supplier.notes || 'Tidak ada catatan tambahan untuk supplier ini.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Terakhir diperbarui: {new Date(supplier.updatedAt).toLocaleDateString('id-ID')}
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
