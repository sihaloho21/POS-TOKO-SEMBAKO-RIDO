import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Truck, 
  Search, 
  Plus, 
  Building2, 
  Phone, 
  MapPin, 
  ShoppingBag, 
  TrendingUp, 
  Edit3, 
  Trash2, 
  Eye, 
  MessageCircle, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  ArrowUpDown,
  Filter,
  Layers,
  Archive,
  RefreshCw
} from 'lucide-react';
import type { Supplier } from '@/core/types';
import { SupplierService } from '@/core/services/supplier-service';
import { SupplierAnalyticsService, type SupplierReliability } from '@/core/services/supplier-analytics-service';
import { SupplierModal } from './SupplierModal';
import { SupplierDetailModal } from './SupplierDetailModal';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';

interface SuppliersProps {
  onNavigate?: (tab: string) => void;
}

export default function Suppliers({ onNavigate }: SuppliersProps) {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'purchases' | 'reliability'>('recent');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | undefined>(undefined);
  const [selectedDetailSupplier, setSelectedDetailSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Live queries
  const allSuppliers = useLiveQuery(() => db.suppliers.toArray(), []) || [];
  const allPurchases = useLiveQuery(() => db.purchases.toArray(), []) || [];

  // Vendor Reliability map from analytics service
  const [reliabilityMap, setReliabilityMap] = useState<Record<string, SupplierReliability>>({});

  useEffect(() => {
    SupplierAnalyticsService.getVendorReliability()
      .then(results => {
        const map: Record<string, SupplierReliability> = {};
        results.forEach(r => {
          map[r.supplierId] = r;
        });
        setReliabilityMap(map);
      })
      .catch(err => console.warn('Failed to calculate vendor reliability:', err));
  }, [allSuppliers.length, allPurchases.length]);

  // Aggregate purchases per supplier
  const supplierPurchaseStats = useMemo(() => {
    const stats: Record<string, { totalValue: number; count: number }> = {};
    allPurchases.forEach(p => {
      if (!stats[p.supplierId]) {
        stats[p.supplierId] = { totalValue: 0, count: 0 };
      }
      stats[p.supplierId].totalValue += (p.total || 0);
      stats[p.supplierId].count += 1;
    });
    return stats;
  }, [allPurchases]);

  // Filter & Sort
  const filteredSuppliers = useMemo(() => {
    return allSuppliers
      .filter(s => {
        const matchSearch = 
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          (s.phone || '').includes(search) ||
          (s.address || '').toLowerCase().includes(search.toLowerCase()) ||
          (s.notes || '').toLowerCase().includes(search.toLowerCase());

        const matchStatus = statusFilter === 'ALL' || s.status === statusFilter;

        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'purchases') {
          const valA = supplierPurchaseStats[a.supplierId]?.totalValue || 0;
          const valB = supplierPurchaseStats[b.supplierId]?.totalValue || 0;
          return valB - valA;
        }
        if (sortBy === 'reliability') {
          const scoreA = reliabilityMap[a.supplierId]?.reliabilityScore || 0;
          const scoreB = reliabilityMap[b.supplierId]?.reliabilityScore || 0;
          return scoreB - scoreA;
        }
        // recent
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [allSuppliers, search, statusFilter, sortBy, supplierPurchaseStats, reliabilityMap]);

  // KPIs
  const activeCount = allSuppliers.filter(s => s.status === 'ACTIVE').length;
  const totalPurchasesValue = allPurchases.reduce((acc, p) => acc + (p.total || 0), 0);
  const payablePurchasesValue = allPurchases
    .filter(p => p.status === 'DRAFT' || p.status === 'CONFIRMED')
    .reduce((acc, p) => acc + (p.total || 0), 0);
  const avgReliability = Object.values(reliabilityMap).length > 0
    ? Math.round(Object.values(reliabilityMap).reduce((a, b) => a + b.reliabilityScore, 0) / Object.values(reliabilityMap).length)
    : 0;

  const handleSeedSamples = async () => {
    if (!currentUser) return;
    setIsSeeding(true);
    try {
      const seeded = await SupplierService.seedSampleSuppliersIfEmpty(currentUser.userId);
      if (seeded) {
        addToast('Berhasil memuat 6 data supplier sembako & ikan sampel!', 'success');
      } else {
        addToast('Database supplier sudah memiliki data.', 'info');
      }
    } catch (err: any) {
      addToast(err.message || 'Gagal memuat data sampel', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingSupplier || !currentUser) return;
    try {
      const res = await SupplierService.deleteSupplier(deletingSupplier.supplierId, currentUser.userId);
      addToast(res.message, res.deactivated ? 'warning' : 'success');
      setDeletingSupplier(null);
    } catch (err: any) {
      addToast(err.message || 'Gagal memproses penghapusan supplier', 'error');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Truck size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                Manajemen Supplier & Pemasok
              </h2>
              <p className="text-slate-500 text-sm font-medium">
                Pencatatan distributor kulakan, syarat tempo, kontak WhatsApp, dan evaluasi reliabilitas pasokan.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {allSuppliers.length === 0 && (
            <button
              onClick={handleSeedSamples}
              disabled={isSeeding}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
            >
              <Sparkles size={16} />
              {isSeeding ? 'Memuat...' : 'Muat Supplier Sampel'}
            </button>
          )}

          <button
            onClick={() => {
              setEditingSupplier(undefined);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-200 transition-all"
          >
            <Plus size={18} />
            Tambah Supplier
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Building2 size={24} />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Supplier Terdaftar
            </span>
            <span className="text-2xl font-black text-slate-900">
              {allSuppliers.length}
            </span>
            <span className="text-xs text-emerald-600 font-bold block mt-0.5">
              {activeCount} Aktif
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <ShoppingBag size={24} />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Total Nilai Belanja
            </span>
            <span className="text-xl font-black text-slate-900">
              Rp {totalPurchasesValue.toLocaleString('id-ID')}
            </span>
            <span className="text-xs text-slate-400 font-medium block mt-0.5">
              {allPurchases.length} total faktur kulakan
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Layers size={24} />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Hutang Belanja (Tempo)
            </span>
            <span className="text-xl font-black text-amber-600">
              Rp {payablePurchasesValue.toLocaleString('id-ID')}
            </span>
            <span className="text-xs text-slate-400 font-medium block mt-0.5">
              Faktur belum lunas
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <TrendingUp size={24} />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Rata-rata Reliabilitas
            </span>
            <span className="text-2xl font-black text-purple-600">
              {avgReliability}/100
            </span>
            <span className="text-xs text-slate-400 font-medium block mt-0.5">
              Stabilitas harga & pengiriman
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:max-w-md">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama supplier, telepon, atau alamat..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          {/* Status Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Semua ({allSuppliers.length})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all ${
                statusFilter === 'ACTIVE'
                  ? 'bg-white text-emerald-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Aktif ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all ${
                statusFilter === 'INACTIVE'
                  ? 'bg-white text-amber-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Non-Aktif ({allSuppliers.length - activeCount})
            </button>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-2xl text-xs">
            <ArrowUpDown size={14} className="text-slate-400" />
            <span className="text-slate-400 font-bold uppercase text-[9px]">Urutkan:</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="recent">Terbaru Ditambahkan</option>
              <option value="name">Nama (A-Z)</option>
              <option value="purchases">Total Belanja Tertinggi</option>
              <option value="reliability">Skor Reliabilitas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table & Cards */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredSuppliers.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <Truck size={32} />
            </div>
            <h3 className="text-base font-black text-slate-800 uppercase tracking-tight mb-1">
              Tidak Ada Data Supplier Ditemukan
            </h3>
            <p className="text-xs text-slate-400 font-medium max-w-sm mx-auto mb-6">
              {search || statusFilter !== 'ALL'
                ? 'Tidak ada supplier yang sesuai dengan kata kunci pencarian atau filter Anda.'
                : 'Mulai dengan menambahkan distributor kulakan sembako atau ikan Anda, atau gunakan data sampel.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              {allSuppliers.length === 0 && (
                <button
                  onClick={handleSeedSamples}
                  disabled={isSeeding}
                  className="px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-black text-xs uppercase tracking-wider transition-all"
                >
                  <Sparkles size={16} className="inline mr-1.5" />
                  Isi Supplier Sampel
                </button>
              )}
              <button
                onClick={() => {
                  setEditingSupplier(undefined);
                  setIsModalOpen(true);
                }}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-blue-200 transition-all inline-flex items-center gap-1.5"
              >
                <Plus size={16} />
                Tambah Supplier
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                  <th className="px-6 py-4">Nama Supplier</th>
                  <th className="px-6 py-4">Kontak & WA</th>
                  <th className="px-6 py-4">Alamat Gudang / Kantor</th>
                  <th className="px-6 py-4">Total Belanja</th>
                  <th className="px-6 py-4 text-center">Keandalan</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredSuppliers.map((supplier) => {
                  const stats = supplierPurchaseStats[supplier.supplierId] || { totalValue: 0, count: 0 };
                  const reliability = reliabilityMap[supplier.supplierId];
                  const score = reliability?.reliabilityScore ?? 0;

                  // Clean phone for WhatsApp
                  const rawPhone = supplier.phone?.replace(/[^0-9]/g, '') || '';
                  const waNumber = rawPhone.startsWith('0') 
                    ? '62' + rawPhone.slice(1) 
                    : rawPhone.startsWith('62') 
                      ? rawPhone 
                      : rawPhone;

                  return (
                    <tr
                      key={supplier.supplierId}
                      className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                      onClick={() => setSelectedDetailSupplier(supplier)}
                    >
                      {/* Name & Notes */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-sm uppercase shadow-xs shrink-0">
                            {supplier.name[0]}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 uppercase tracking-tight block">
                              {supplier.name}
                            </span>
                            {supplier.notes && (
                              <span className="text-xs text-slate-400 line-clamp-1 max-w-xs font-normal">
                                {supplier.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Phone & WhatsApp */}
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        {supplier.phone ? (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-700 text-xs font-mono">
                              {supplier.phone}
                            </span>
                            <a
                              href={`https://wa.me/${waNumber}?text=Halo%20${encodeURIComponent(supplier.name)},%20dari%20Toko%20Harapan%20Jaya`}
                              target="_blank"
                              rel="noreferrer"
                              title="Kirim pesan WhatsApp"
                              className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                            >
                              <MessageCircle size={14} />
                            </a>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300 italic">Tidak ada nomor</span>
                        )}
                      </td>

                      {/* Address */}
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-600 line-clamp-2 max-w-xs font-medium">
                          {supplier.address || '-'}
                        </span>
                      </td>

                      {/* Total Purchases */}
                      <td className="px-6 py-4">
                        <div>
                          <span className="font-black text-slate-900 block">
                            Rp {stats.totalValue.toLocaleString('id-ID')}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {stats.count} kali kulakan
                          </span>
                        </div>
                      </td>

                      {/* Reliability */}
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className={`text-xs font-black px-2 py-0.5 rounded-md ${
                            score >= 80 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : score >= 50 
                                ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                                : 'bg-slate-100 text-slate-600'
                          }`}>
                            {score}/100
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          supplier.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {supplier.status === 'ACTIVE' ? 'Aktif' : 'Non-Aktif'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedDetailSupplier(supplier)}
                            title="Lihat Detail & Riwayat Faktur"
                            className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Eye size={16} />
                          </button>

                          {onNavigate && (
                            <button
                              onClick={() => onNavigate('purchases')}
                              title="Input Pembelian Baru"
                              className="p-2 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                            >
                              <ShoppingBag size={16} />
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setEditingSupplier(supplier);
                              setIsModalOpen(true);
                            }}
                            title="Edit Data Supplier"
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            <Edit3 size={16} />
                          </button>

                          <button
                            onClick={() => setDeletingSupplier(supplier)}
                            title="Hapus / Nonaktifkan Supplier"
                            className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Supplier Modal */}
      <SupplierModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSupplier(undefined);
        }}
        supplier={editingSupplier}
      />

      {/* Supplier Detail Modal */}
      <SupplierDetailModal
        isOpen={!!selectedDetailSupplier}
        onClose={() => setSelectedDetailSupplier(null)}
        supplier={selectedDetailSupplier}
        reliability={selectedDetailSupplier ? reliabilityMap[selectedDetailSupplier.supplierId] : undefined}
        onEdit={(sup) => {
          setEditingSupplier(sup);
          setIsModalOpen(true);
        }}
        onNewPurchase={() => {
          if (onNavigate) onNavigate('purchases');
        }}
        onReturnProduct={() => {
          if (onNavigate) onNavigate('supplier-return');
        }}
      />

      {/* Delete / Deactivate Confirmation Dialog */}
      {deletingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md p-6 overflow-hidden">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">
              Hapus / Nonaktifkan Supplier?
            </h3>
            <p className="text-sm text-slate-500 font-medium mb-6">
              Apakah Anda yakin ingin menghapus supplier <strong className="text-slate-800 font-bold">{deletingSupplier.name}</strong>? Jika supplier sudah memiliki riwayat faktur pembelian, sistem akan menonaktifkannya (status INACTIVE) untuk menjaga validitas pembukuan.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingSupplier(null)}
                className="px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-red-200 transition-all"
              >
                Ya, Proses
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
