import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { ConsignmentService } from '@/core/services/consignment-service';
import { useAuthStore } from '@/core/auth-store';
import { useDeviceId } from '@/core/device-store';
import { useToastStore } from '@/core/toast-store';
import type { ConsignmentItem, ConsignmentSettlement, MoneyStorageId } from '@/core/types';
import { 
  Package, 
  Truck, 
  Banknote, 
  History, 
  Plus, 
  ArrowUpRight, 
  Calculator,
  User,
  Search,
  TrendingUp,
  AlertCircle,
  X,
  Edit,
  Trash2,
  RotateCcw,
  Copy,
  Check,
  MessageCircle,
  Layers,
  ArrowRight,
  Filter
} from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

export default function ConsignmentPage() {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const deviceId = useDeviceId();
  const isOwner = currentUser?.role === 'OWNER';

  // Navigation Tabs: 'items' | 'settlements' | 'arrivals'
  const [activeTab, setActiveTab] = useState<'items' | 'settlements' | 'arrivals'>('items');

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isArrivalModalOpen, setIsArrivalModalOpen] = useState(false);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [isResetHistoryModalOpen, setIsResetHistoryModalOpen] = useState(false);
  const [recapModalData, setRecapModalData] = useState<{
    settlement: ConsignmentSettlement;
    item?: ConsignmentItem;
    supplierName?: string;
  } | null>(null);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ConsignmentItem | null>(null);
  const [deletingSettlementId, setDeletingSettlementId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedRecap, setCopiedRecap] = useState(false);

  // Settlement Form State
  const [remainingStockInput, setRemainingStockInput] = useState<number>(0);
  const [newStockInput, setNewStockInput] = useState<number>(0);
  const [keepRemaining, setKeepRemaining] = useState<boolean>(true);
  const [storageChoice, setStorageChoice] = useState<MoneyStorageId>('WARUNG');
  const [settlementNotes, setSettlementNotes] = useState<string>('');

  // Add Item Margin Preview
  const [addCostPrice, setAddCostPrice] = useState<number>(0);
  const [addSalePrice, setAddSalePrice] = useState<number>(0);

  // Data Queries via Dexie LiveQuery
  const items = useLiveQuery(
    () => db.consignmentItems.toArray(),
    []
  );

  const settlements = useLiveQuery(
    () => db.consignmentSettlements.orderBy('timestamp').reverse().toArray(),
    []
  );

  const arrivals = useLiveQuery(
    () => db.consignmentArrivals.orderBy('timestamp').reverse().toArray(),
    []
  );

  const suppliers = useLiveQuery(
    () => db.suppliers.toArray(),
    []
  );

  const supplierMap = useMemo(() => {
    const map = new Map<string, string>();
    suppliers?.forEach(s => map.set(s.supplierId, s.name));
    return map;
  }, [suppliers]);

  const itemsMap = useMemo(() => {
    const map = new Map<string, ConsignmentItem>();
    items?.forEach(i => map.set(i.id, i));
    return map;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    return items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.barcode && item.barcode.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchSupplier = supplierFilter === 'ALL' || item.supplierId === supplierFilter;
      return matchSearch && matchSupplier;
    });
  }, [items, searchTerm, supplierFilter]);

  const selectedItem = items?.find(i => i.id === selectedItemId);

  // Perhitungan Settlement Preview
  const currentStock = selectedItem?.currentStock || 0;
  const soldQtyPreview = Math.max(0, currentStock - remainingStockInput);
  const totalPaymentPreview = selectedItem ? soldQtyPreview * selectedItem.costPrice : 0;
  const totalProfitPreview = selectedItem ? soldQtyPreview * (selectedItem.salePrice - selectedItem.costPrice) : 0;
  const nextCycleStockPreview = (keepRemaining ? remainingStockInput : 0) + newStockInput;

  // Stats
  const totalItemsCount = items?.length || 0;
  const totalSoldUnits = items?.reduce((acc, curr) => acc + (curr.totalSold || 0), 0) || 0;
  const totalStoreProfit = items?.reduce((acc, curr) => {
    const profitPerUnit = curr.salePrice - curr.costPrice;
    return acc + ((curr.totalSold || 0) * profitPerUnit);
  }, 0) || 0;
  const totalSettlementsPaid = settlements?.reduce((acc, curr) => acc + curr.totalPayment, 0) || 0;

  // Storage Name Formatter
  const formatStorageName = (storageId?: string) => {
    switch (storageId) {
      case 'WARUNG': return 'Kas Warung';
      case 'IKAN': return 'Kas Ikan';
      case 'BUAH': return 'Kas Buah';
      case 'UANG_DIGITAL': return 'Kas Digital';
      default: return storageId || 'Kas Warung';
    }
  };

  // Add Item Handler
  const handleAddItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser) return;
    const formData = new FormData(e.currentTarget);
    const cost = Number(formData.get('costPrice'));
    const sale = Number(formData.get('salePrice'));

    if (cost > sale) {
      addToast('Harga modal tidak boleh lebih besar dari harga jual', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await ConsignmentService.addItem({
        name: formData.get('name') as string,
        supplierId: formData.get('supplierId') as string,
        costPrice: cost,
        salePrice: sale,
        initialStock: Number(formData.get('initialStock')) || 0,
        barcode: (formData.get('barcode') as string) || undefined,
        description: (formData.get('description') as string) || undefined,
        userId: currentUser.userId,
        deviceId,
        role: currentUser.role
      });
      setIsAddModalOpen(false);
      setAddCostPrice(0);
      setAddSalePrice(0);
      addToast('Barang titipan berhasil didaftarkan', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Gagal menambahkan barang', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit Item Handler
  const handleEditItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || !editingItem) return;
    const formData = new FormData(e.currentTarget);
    const cost = Number(formData.get('costPrice'));
    const sale = Number(formData.get('salePrice'));

    if (cost > sale) {
      addToast('Harga modal tidak boleh lebih besar dari harga jual', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await ConsignmentService.updateItem({
        id: editingItem.id,
        name: formData.get('name') as string,
        supplierId: formData.get('supplierId') as string,
        costPrice: cost,
        salePrice: sale,
        status: formData.get('status') as 'ACTIVE' | 'INACTIVE',
        barcode: (formData.get('barcode') as string) || undefined,
        description: (formData.get('description') as string) || undefined,
        userId: currentUser.userId,
        deviceId,
        role: currentUser.role
      });
      setIsEditModalOpen(false);
      setEditingItem(null);
      addToast('Informasi barang titipan berhasil diperbarui', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Gagal memperbarui barang', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Item Handler
  const handleDeleteItem = async (id: string, name: string) => {
    if (!currentUser) return;
    if (!isOwner) {
      addToast('Akses Ditolak: Hanya Owner yang dapat menghapus barang titipan', 'error');
      return;
    }
    if (!confirm(`Hapus barang titipan "${name}"? Seluruh histori setoran & kedatangan terkait juga akan dibersihkan.`)) {
      return;
    }
    
    try {
      await ConsignmentService.deleteItem(id, currentUser.userId, deviceId, currentUser.role);
      addToast(`Barang titipan "${name}" berhasil dihapus`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Gagal menghapus barang', 'error');
    }
  };

  // Record Arrival Handler
  const handleArrival = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || !selectedItemId) return;
    const formData = new FormData(e.currentTarget);
    const qty = Number(formData.get('qty'));

    if (isNaN(qty) || qty <= 0) {
      addToast('Jumlah stok masuk harus lebih dari 0', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await ConsignmentService.recordArrival({
        itemId: selectedItemId,
        qty: qty,
        notes: (formData.get('notes') as string) || undefined,
        userId: currentUser.userId,
        deviceId,
        role: currentUser.role
      });
      setIsArrivalModalOpen(false);
      setSelectedItemId(null);
      addToast(`Stok datang (+${qty} pcs) berhasil ditambahkan`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Gagal mencatat stok datang', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Process Settlement Handler
  const handleSettlement = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || !selectedItemId || !selectedItem) return;

    if (remainingStockInput < 0) {
      addToast('Sisa stok tidak boleh bernilai negatif', 'error');
      return;
    }
    if (remainingStockInput > selectedItem.currentStock) {
      addToast(`Sisa stok (${remainingStockInput}) tidak boleh lebih besar dari stok aktif (${selectedItem.currentStock})`, 'error');
      return;
    }
    if (newStockInput < 0) {
      addToast('Stok baru tidak boleh negatif', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const settlement = await ConsignmentService.processSettlement({
        itemId: selectedItemId,
        remainingStock: remainingStockInput,
        newStock: newStockInput,
        keepRemaining: keepRemaining,
        storageId: storageChoice,
        notes: settlementNotes,
        userId: currentUser.userId,
        deviceId,
        role: currentUser.role
      });

      setIsSettlementModalOpen(false);
      
      // Auto open recap receipt so owner can copy WhatsApp summary immediately
      const supplierName = supplierMap.get(selectedItem.supplierId) || 'Supplier / Sales';
      setRecapModalData({
        settlement,
        item: selectedItem,
        supplierName
      });

      setRemainingStockInput(0);
      setNewStockInput(0);
      setSettlementNotes('');
      setKeepRemaining(true);
      setSelectedItemId(null);
      addToast('Setoran berhasil dicatat & saldo kas terpotong', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Gagal memproses setoran', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Individual Settlement Handler
  const handleDeleteSettlement = async (settlementId: string) => {
    if (!currentUser || !isOwner) {
      addToast('Akses Ditolak: Hanya Owner yang dapat menghapus data setoran', 'error');
      return;
    }
    if (!confirm('Hapus transaksi setoran ini? Saldo kas akan dikembalikan (refund) jika setoran memiliki nominal bayar.')) {
      return;
    }

    try {
      await ConsignmentService.deleteSettlement({
        settlementId,
        rollbackFinance: true,
        userId: currentUser.userId,
        deviceId,
        role: currentUser.role
      });
      setDeletingSettlementId(null);
      addToast('Data setoran berhasil dihapus dan saldo kas dikembalikan', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Gagal menghapus setoran', 'error');
    }
  };

  // Reset Consignment History Handler
  const handleResetHistory = async () => {
    if (!currentUser || !isOwner) {
      addToast('Akses Ditolak: Hanya Owner yang dapat mereset histori', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await ConsignmentService.resetConsignmentHistory({
        userId: currentUser.userId,
        deviceId,
        role: currentUser.role
      });
      setIsResetHistoryModalOpen(false);
      addToast(`Histori berhasil direset (${res.settlementsDeleted} setoran & ${res.arrivalsDeleted} stok masuk dibersihkan)`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Gagal mereset data histori', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Build WhatsApp Recap Text
  const buildWhatsAppText = (data: { settlement: ConsignmentSettlement; item?: ConsignmentItem; supplierName?: string }) => {
    const s = data.settlement;
    const item = data.item;
    const supp = data.supplierName || 'Sales Titipan';
    const tgl = format(new Date(s.timestamp), 'dd MMMM yyyy, HH:mm', { locale: id });
    const storage = formatStorageName(s.storageId);

    return `*NOTA SETORAN TITIPAN BARANG*
Toko Sembako Riama
Tanggal: ${tgl}
Sales / Supplier: ${supp}
Barang: ${item?.name || 'Produk Titipan'}
------------------------------------
- Stok Siklus Lalu: ${s.previousStock} pcs
- Sisa Stok di Toko: ${s.remainingStock} pcs ${s.keepRemaining ? '(Masih Dipajang)' : '(Diretur/Tarik)'}
- *Jumlah Terjual: ${s.soldQty} pcs*
- Harga Modal Sales: Rp ${(item?.costPrice || 0).toLocaleString()} / pcs
- *TOTAL SETORAN BAYAR: Rp ${s.totalPayment.toLocaleString()}*
- Sumber Pembayaran: ${storage}
------------------------------------
- Stok Baru Dititipkan: ${s.addedStock} pcs
- *Total Stok Toko Aktif Sekarang: ${((s.keepRemaining ? s.remainingStock : 0) + s.addedStock)} pcs*
${s.notes ? `Catatan: ${s.notes}\n` : ''}
Status: *LUNAS*
Terima kasih atas kerja samanya.`;
  };

  const handleCopyRecap = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRecap(true);
    setTimeout(() => setCopiedRecap(false), 2000);
    addToast('Nota rekap berhasil disalin ke clipboard', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Titipan Barang</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-700">
              Bagi Hasil & Konsinyasi
            </span>
          </div>
          <p className="text-slate-500 font-medium text-sm mt-0.5">
            Manajemen produk konsinyasi, kalkulasi setoran bagi hasil, dan sinkronisasi kas multi-vault
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isOwner && (
            <button
              onClick={() => setIsResetHistoryModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl font-bold hover:bg-red-100 transition-all text-xs uppercase tracking-wider"
              title="Reset data histori percobaan sebelum launching resmi"
            >
              <RotateCcw size={15} />
              Reset Histori Percobaan
            </button>
          )}
          <button
            onClick={() => {
              setAddCostPrice(0);
              setAddSalePrice(0);
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all text-sm uppercase tracking-wider"
          >
            <Plus size={18} />
            Tambah Barang
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <Package size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Produk</p>
              <p className="text-xl font-black text-slate-900">{totalItemsCount} <span className="text-xs font-semibold text-slate-400">item</span></p>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Barang Terjual</p>
              <p className="text-xl font-black text-slate-900">{totalSoldUnits} <span className="text-xs font-semibold text-slate-400">pcs</span></p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 rounded-3xl text-white shadow-lg shadow-emerald-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 text-white rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/30">
              <Banknote size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-white/70 uppercase tracking-widest">Laba Bersih Toko</p>
              <p className="text-xl font-black">Rp {totalStoreProfit.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
              <History size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Bayar Sales</p>
              <p className="text-lg font-black text-slate-900 truncate">
                Rp {totalSettlementsPaid.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('items')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'items'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          <Package size={16} />
          Daftar Barang Titipan ({totalItemsCount})
        </button>

        <button
          onClick={() => setActiveTab('settlements')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'settlements'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          <Calculator size={16} />
          Riwayat Setoran ({settlements?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab('arrivals')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'arrivals'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-100'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          <Truck size={16} />
          Riwayat Stok Masuk ({arrivals?.length || 0})
        </button>
      </div>

      {/* TAB 1: DAFTAR BARANG TITIPAN */}
      {activeTab === 'items' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Cari nama barang atau barcode..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter size={16} className="text-slate-400" />
                <select
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ALL">Semua Supplier / Sales</option>
                  {suppliers?.map(s => (
                    <option key={s.supplierId} value={s.supplierId}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                  <th className="px-6 py-4">Barang & Supplier</th>
                  <th className="px-6 py-4 text-center">Stok Aktif</th>
                  <th className="px-6 py-4">Harga (Modal / Jual)</th>
                  <th className="px-6 py-4 text-center">Terjual</th>
                  <th className="px-6 py-4 text-center text-emerald-600 bg-emerald-50/30">Total Laba Toko</th>
                  <th className="px-6 py-4 text-right">Aksi Operasional</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const supplierName = supplierMap.get(item.supplierId) || 'Supplier Tidak Diketahui';
                  const profitPerUnit = item.salePrice - item.costPrice;
                  const itemProfit = (item.totalSold || 0) * profitPerUnit;
                  const marginPercent = item.salePrice > 0 ? Math.round((profitPerUnit / item.salePrice) * 100) : 0;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                            <Package size={20} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-900 leading-tight">{item.name}</p>
                              {item.status === 'INACTIVE' && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-100 text-slate-500 uppercase">Nonaktif</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 font-semibold flex items-center gap-1 mt-0.5">
                              <User size={11} />
                              {supplierName}
                            </p>
                            {item.barcode && (
                              <p className="text-[10px] text-slate-400 font-mono">Barcode: {item.barcode}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-xl text-xs font-black ${
                          item.currentStock > 10 
                            ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                            : item.currentStock > 0 
                            ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {item.currentStock} pcs
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-xs space-y-0.5">
                          <p className="text-slate-500 font-medium">Modal: <span className="text-slate-900 font-bold">Rp{item.costPrice.toLocaleString()}</span></p>
                          <p className="text-slate-500 font-medium">Jual: <span className="text-blue-600 font-bold">Rp{item.salePrice.toLocaleString()}</span></p>
                          <p className="text-[10px] text-emerald-600 font-bold">Laba: Rp{profitPerUnit.toLocaleString()} ({marginPercent}%)</p>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <p className="text-sm font-black text-slate-900">{item.totalSold || 0} <span className="text-[10px] font-medium text-slate-400">pcs</span></p>
                        {item.lastSettlementAt && (
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            Setor: {format(new Date(item.lastSettlementAt), 'dd/MM/yy')}
                          </p>
                        )}
                      </td>

                      <td className="px-6 py-4 text-center bg-emerald-50/20">
                        <p className="text-sm font-black text-emerald-600">Rp{itemProfit.toLocaleString()}</p>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Tambah Stok Datang */}
                          <button
                            onClick={() => {
                              setSelectedItemId(item.id);
                              setIsArrivalModalOpen(true);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-blue-100"
                            title="Tambah Stok Masuk (Kedatangan Baru)"
                          >
                            <Truck size={17} />
                          </button>

                          {/* Proses Setoran & Reset Stok */}
                          <button
                            onClick={() => {
                              setSelectedItemId(item.id);
                              setRemainingStockInput(0);
                              setNewStockInput(0);
                              setKeepRemaining(true);
                              setStorageChoice('WARUNG');
                              setSettlementNotes('');
                              setIsSettlementModalOpen(true);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-700 shadow-sm shadow-emerald-200 transition-all"
                            title="Kalkulasi Setoran Bagi Hasil ke Sales"
                          >
                            <Calculator size={14} />
                            Setoran
                          </button>

                          {/* Edit Item */}
                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setIsEditModalOpen(true);
                            }}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-all"
                            title="Edit Data Barang"
                          >
                            <Edit size={17} />
                          </button>

                          {/* Hapus Item (Owner only) */}
                          {isOwner && (
                            <button
                              onClick={() => handleDeleteItem(item.id, item.name)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                              title="Hapus Barang Titipan"
                            >
                              <Trash2 size={17} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      <AlertCircle className="mx-auto mb-2 text-slate-300" size={36} />
                      <p className="text-sm font-bold text-slate-600">Tidak ada barang titipan ditemukan</p>
                      <p className="text-xs text-slate-400 mt-1">Gunakan tombol "Tambah Barang" di atas untuk mendaftarkan barang titipan baru.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: RIWAYAT SETORAN */}
      {activeTab === 'settlements' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Riwayat Setoran & Bagi Hasil</h3>
              <p className="text-xs text-slate-400">Catatan pembayaran setoran ke sales & profit toko yang tercatat di ledger</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                  <th className="px-6 py-4">Waktu Setor</th>
                  <th className="px-6 py-4">Barang & Supplier</th>
                  <th className="px-6 py-4 text-center">Siklus Stok</th>
                  <th className="px-6 py-4 text-center">Terjual</th>
                  <th className="px-6 py-4 text-right">Bayar ke Sales</th>
                  <th className="px-6 py-4 text-right text-emerald-600 bg-emerald-50/30">Laba Toko</th>
                  <th className="px-6 py-4 text-center">Sumber Kas</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements?.map((s) => {
                  const item = itemsMap.get(s.itemId);
                  const supplierName = item ? supplierMap.get(item.supplierId) || 'Sales / Supplier' : 'Item Dihapus';

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-xs font-semibold text-slate-600">
                        <p className="text-slate-900 font-bold">
                          {format(new Date(s.timestamp), 'dd MMM yyyy', { locale: id })}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {format(new Date(s.timestamp), 'HH:mm')} WIB
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-slate-900">{item?.name || 'Produk'}</p>
                        <p className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                          <User size={10} />
                          {supplierName}
                        </p>
                      </td>

                      <td className="px-6 py-4 text-center text-xs">
                        <div className="inline-flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 font-medium">
                          <span title="Stok Awal">{s.previousStock}</span>
                          <span className="text-slate-300">→</span>
                          <span title="Sisa Stok" className="text-amber-600 font-bold">{s.remainingStock} sisa</span>
                          <span className="text-slate-300">+</span>
                          <span title="Stok Baru" className="text-blue-600 font-bold">{s.addedStock} baru</span>
                        </div>
                        {s.keepRemaining === false && (
                          <p className="text-[9px] text-red-500 font-semibold mt-0.5">Sisa diretur/tarik</p>
                        )}
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-black text-xs rounded-lg border border-emerald-100">
                          {s.soldQty} pcs
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <p className="text-sm font-black text-slate-900">Rp {s.totalPayment.toLocaleString()}</p>
                      </td>

                      <td className="px-6 py-4 text-right bg-emerald-50/20">
                        <p className="text-sm font-black text-emerald-600">Rp {s.totalProfit.toLocaleString()}</p>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700">
                          {formatStorageName(s.storageId)}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Nota Rekap WhatsApp */}
                          <button
                            onClick={() => {
                              setRecapModalData({
                                settlement: s,
                                item,
                                supplierName
                              });
                            }}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Lihat & Salin Nota WhatsApp"
                          >
                            <MessageCircle size={16} />
                          </button>

                          {/* Delete Settlement (Owner only) */}
                          {isOwner && (
                            <button
                              onClick={() => handleDeleteSettlement(s.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Hapus Catatan Setoran Ini & Kembalikan Saldo Kas"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {(!settlements || settlements.length === 0) && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                      <Calculator className="mx-auto mb-2 text-slate-300" size={32} />
                      <p className="text-sm font-bold text-slate-600">Belum ada riwayat setoran</p>
                      <p className="text-xs text-slate-400 mt-1">Setoran yang diproses akan tercatat otomatis di sini.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: RIWAYAT STOK MASUK */}
      {activeTab === 'arrivals' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Log Kedatangan Stok Titipan</h3>
              <p className="text-xs text-slate-400">Pencatatan penambahan stok barang titipan dari sales</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                  <th className="px-6 py-4">Waktu Masuk</th>
                  <th className="px-6 py-4">Barang & Supplier</th>
                  <th className="px-6 py-4 text-center">Jumlah Masuk</th>
                  <th className="px-6 py-4">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {arrivals?.map((a) => {
                  const item = itemsMap.get(a.itemId);
                  const supplierName = item ? supplierMap.get(item.supplierId) || 'Sales' : 'Item Dihapus';

                  return (
                    <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-xs font-semibold text-slate-600">
                        <p className="text-slate-900 font-bold">
                          {format(new Date(a.timestamp), 'dd MMM yyyy', { locale: id })}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {format(new Date(a.timestamp), 'HH:mm')} WIB
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-slate-900">{item?.name || 'Produk'}</p>
                        <p className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                          <User size={10} />
                          {supplierName}
                        </p>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className="px-3 py-1 bg-blue-50 text-blue-700 font-black text-xs rounded-xl border border-blue-200">
                          +{a.qty} pcs
                        </span>
                      </td>

                      <td className="px-6 py-4 text-xs text-slate-500">
                        {a.notes || '-'}
                      </td>
                    </tr>
                  );
                })}

                {(!arrivals || arrivals.length === 0) && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                      <Truck className="mx-auto mb-2 text-slate-300" size={32} />
                      <p className="text-sm font-bold text-slate-600">Belum ada riwayat kedatangan stok</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH BARANG TITIPAN */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Tambah Barang Titipan</h2>
                <p className="text-xs text-slate-400">Daftarkan produk konsinyasi baru untuk bagi hasil</p>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddItem} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Barang *</label>
                <input 
                  required 
                  name="name" 
                  type="text" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                  placeholder="Contoh: Roti Aoka Cokelat" 
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sales / Supplier *</label>
                <select 
                  required 
                  name="supplierId" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Pilih Supplier</option>
                  {suppliers?.map(s => <option key={s.supplierId} value={s.supplierId}>{s.name} ({s.phone || 'No Telp'})</option>)}
                </select>
                {(!suppliers || suppliers.length === 0) && (
                  <p className="text-[10px] text-amber-600 font-semibold">Belum ada supplier terdaftar di menu Supplier.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga Modal / Setor ke Sales *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                    <input 
                      required 
                      name="costPrice" 
                      type="number" 
                      min="0"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                      placeholder="1500"
                      onChange={(e) => setAddCostPrice(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga Jual / Ecer Toko *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                    <input 
                      required 
                      name="salePrice" 
                      type="number" 
                      min="1"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                      placeholder="2000"
                      onChange={(e) => setAddSalePrice(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>

              {/* Profit calculation hint */}
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-between text-xs">
                <span className="text-emerald-800 font-bold">Laba Bersih per Unit:</span>
                <span className="font-black text-emerald-700">
                  Rp {Math.max(0, addSalePrice - addCostPrice).toLocaleString()}
                  {addSalePrice > 0 && ` (${Math.round((Math.max(0, addSalePrice - addCostPrice) / addSalePrice) * 100)}%)`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stok Awal Titipan</label>
                  <input 
                    name="initialStock" 
                    type="number" 
                    min="0"
                    defaultValue="0" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Barcode (Opsional)</label>
                  <input 
                    name="barcode" 
                    type="text" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                    placeholder="Contoh: 8991234567" 
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Catatan / Keterangan</label>
                <input 
                  name="description" 
                  type="text" 
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                  placeholder="Contoh: Titipan tiap hari Rabu" 
                />
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan & Monitor'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT BARANG TITIPAN */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Edit Barang Titipan</h2>
                <p className="text-xs text-slate-400">Perbarui harga modal, jual, atau status barang</p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleEditItem} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Barang *</label>
                <input 
                  required 
                  name="name" 
                  type="text" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" 
                  defaultValue={editingItem.name} 
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sales / Supplier *</label>
                <select 
                  required 
                  name="supplierId" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" 
                  defaultValue={editingItem.supplierId}
                >
                  {suppliers?.map(s => <option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga Modal (Sales) *</label>
                  <input 
                    required 
                    name="costPrice" 
                    type="number" 
                    min="0"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" 
                    defaultValue={editingItem.costPrice} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga Jual (Toko) *</label>
                  <input 
                    required 
                    name="salePrice" 
                    type="number" 
                    min="1"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-blue-600" 
                    defaultValue={editingItem.salePrice} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Barang</label>
                  <select 
                    name="status" 
                    defaultValue={editingItem.status || 'ACTIVE'}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold"
                  >
                    <option value="ACTIVE">Aktif (Dijual)</option>
                    <option value="INACTIVE">Nonaktif (Dihentikan)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Barcode</label>
                  <input 
                    name="barcode" 
                    type="text" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" 
                    defaultValue={editingItem.barcode || ''}
                    placeholder="Opsional" 
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Keterangan</label>
                <input 
                  name="description" 
                  type="text" 
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" 
                  defaultValue={editingItem.description || ''}
                />
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
              >
                {isSubmitting ? 'Memperbarui...' : 'Update Data Barang'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH STOK DATANG */}
      {isArrivalModalOpen && selectedItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Catat Stok Masuk</h2>
                <p className="text-xs text-slate-400">Penambahan stok kiriman dari sales</p>
              </div>
              <button onClick={() => setIsArrivalModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleArrival} className="p-6 space-y-4">
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-0.5">Barang Titipan</p>
                <p className="text-sm font-bold text-blue-900">{selectedItem.name}</p>
                <p className="text-xs font-semibold text-blue-700 mt-1">
                  Stok saat ini: <span className="font-black text-blue-900">{selectedItem.currentStock} pcs</span>
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Jumlah Tambahan (pcs) *</label>
                <input 
                  required 
                  name="qty" 
                  type="number" 
                  min="1"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                  placeholder="Contoh: 30" 
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Catatan Kedatangan</label>
                <input 
                  name="notes" 
                  type="text" 
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" 
                  placeholder="Contoh: Kiriman sales pagi" 
                />
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
              >
                {isSubmitting ? 'Menyimpan...' : 'Konfirmasi Kedatangan Stok'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PROSES SETORAN & RESET SIKLUS (REFINED & BUG-FREE) */}
      {isSettlementModalOpen && selectedItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 my-8">
            <div className="p-6 border-b border-slate-100 bg-emerald-600 text-white flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Proses Setoran & Reset Stok</h2>
                <p className="text-xs text-white/80">Kalkulasi bagi hasil, potong kas toko, dan mulai siklus baru</p>
              </div>
              <button onClick={() => setIsSettlementModalOpen(false)} className="text-white/70 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSettlement} className="p-6 space-y-4">
              {/* Product Info Bar */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-0.5">Nama Barang</p>
                  <p className="text-sm font-bold text-slate-900 truncate">{selectedItem.name}</p>
                  <p className="text-[10px] text-slate-500 font-semibold">{supplierMap.get(selectedItem.supplierId) || 'Sales'}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-black text-blue-500 uppercase mb-0.5">Stok Aktif Toko</p>
                  <p className="text-lg font-black text-blue-900">{selectedItem.currentStock} <span className="text-xs font-semibold text-blue-600">pcs</span></p>
                </div>
              </div>

              {/* Input Sisa Stok Fisik */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Input Sisa Stok di Rak Toko (Fisik) *
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setRemainingStockInput(0)}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                    >
                      Habis (0)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemainingStockInput(selectedItem.currentStock)}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                    >
                      Utuh ({selectedItem.currentStock})
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <input 
                    required 
                    type="number" 
                    min="0"
                    max={selectedItem.currentStock}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-emerald-200 rounded-2xl text-lg font-black text-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all" 
                    value={remainingStockInput}
                    onChange={(e) => setRemainingStockInput(Math.min(selectedItem.currentStock, Math.max(0, Number(e.target.value) || 0)))}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">pcs</div>
                </div>
              </div>

              {/* Calculation Preview Summary */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-2.5 shadow-xl">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Jumlah Terjual</span>
                  <span className="font-black text-lg text-emerald-400">
                    {soldQtyPreview} <span className="text-xs font-normal text-slate-400">pcs ({selectedItem.currentStock} - {remainingStockInput})</span>
                  </span>
                </div>

                <div className="h-px bg-white/10 w-full" />

                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Bayar ke Sales</span>
                    <span className="text-[9px] text-slate-400">({soldQtyPreview} pcs × Rp{selectedItem.costPrice.toLocaleString()})</span>
                  </div>
                  <span className="text-lg font-black text-amber-400">Rp {totalPaymentPreview.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Laba Bersih Toko</span>
                    <span className="text-[9px] text-slate-400">({soldQtyPreview} pcs × Rp{(selectedItem.salePrice - selectedItem.costPrice).toLocaleString()})</span>
                  </div>
                  <span className="text-lg font-black text-emerald-400">Rp {totalProfitPreview.toLocaleString()}</span>
                </div>
              </div>

              {/* Vault / Kas Selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Sumber Kas untuk Bayar Setoran Sales
                </label>
                <select
                  value={storageChoice}
                  onChange={(e) => setStorageChoice(e.target.value as MoneyStorageId)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="WARUNG">Kas Warung (Default Pembukuan Toko)</option>
                  <option value="IKAN">Kas Ikan</option>
                  <option value="BUAH">Kas Buah</option>
                  <option value="UANG_DIGITAL">Kas Digital</option>
                </select>
              </div>

              {/* Stok Baru & Rollover Settings (CRITICAL BUG FIX) */}
              <div className="p-4 bg-blue-50/70 rounded-2xl border-2 border-dashed border-blue-200 space-y-3">
                <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-1">
                  <ArrowUpRight size={14} />
                  Siklus Baru: Pengaturan Stok Toko
                </p>

                {/* Sisa Stok Checkbox */}
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={keepRemaining}
                    onChange={(e) => setKeepRemaining(e.target.checked)}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <div className="text-xs">
                    <p className="font-bold text-slate-800">
                      Sisa stok ({remainingStockInput} pcs) tetap dipajang di toko
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Jika tidak dicentang, sisa stok dianggap ditarik/diretur oleh sales.
                    </p>
                  </div>
                </label>

                {/* Input Stok Baru yang Dititipkan Hari Ini */}
                <div className="space-y-1 pt-1">
                  <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest">
                    Stok Baru yang Dititipkan Sales Hari Ini (pcs)
                  </label>
                  <input 
                    type="number" 
                    min="0"
                    className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-xl text-sm font-bold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                    placeholder="Contoh: 50 (isi 0 jika tidak ada kiriman baru hari ini)"
                    value={newStockInput}
                    onChange={(e) => setNewStockInput(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>

                {/* Preview Total Stok Toko Selanjutnya */}
                <div className="p-2.5 bg-white rounded-xl border border-blue-100 flex items-center justify-between text-xs font-bold text-blue-900">
                  <span>Stok Aktif Setelah Setoran:</span>
                  <span className="text-sm font-black text-blue-700">{nextCycleStockPreview} pcs</span>
                </div>
              </div>

              {/* Catatan Setoran */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Catatan Setoran (Opsional)</label>
                <input 
                  type="text" 
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" 
                  placeholder="Contoh: Setoran minggu ke-1, sales Pak Budi" 
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2.5">
                <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                <p className="text-[11px] font-medium text-amber-900 leading-tight">
                  Saldo <span className="font-black">{formatStorageName(storageChoice)}</span> akan dipotong sebesar <span className="font-black">Rp {totalPaymentPreview.toLocaleString()}</span> dan dicatat di Buku Kas.
                </p>
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 disabled:opacity-50"
              >
                {isSubmitting ? 'Memproses Setoran...' : 'Bayar Setoran & Mulai Siklus Baru'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOTA REKAP WHATSAPP */}
      {recapModalData && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <MessageCircle size={20} className="text-emerald-400" />
                <h2 className="text-lg font-black uppercase tracking-tight">Nota Rekap Konsinyasi</h2>
              </div>
              <button onClick={() => setRecapModalData(null)} className="text-slate-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                Gunakan nota ini untuk dikirimkan ke sales/supplier sebagai bukti rekap penjualan dan pembayaran.
              </p>

              <pre className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {buildWhatsAppText(recapModalData)}
              </pre>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyRecap(buildWhatsAppText(recapModalData))}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5"
                >
                  {copiedRecap ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  {copiedRecap ? 'Tersalin!' : 'Salin Teks'}
                </button>

                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(buildWhatsAppText(recapModalData))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-200"
                >
                  <MessageCircle size={16} />
                  Kirim ke WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESET HISTORI PERCOBAAN (OWNER ONLY) */}
      {isResetHistoryModalOpen && isOwner && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100">
            <div className="p-6 border-b border-red-100 bg-red-50 text-red-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw size={20} className="text-red-600" />
                <h2 className="text-lg font-black uppercase tracking-tight">Reset Histori Titipan</h2>
              </div>
              <button onClick={() => setIsResetHistoryModalOpen(false)} className="text-red-400 hover:text-red-700">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Fitur ini dikhususkan untuk <span className="font-bold text-slate-900">Owner</span> sebelum toko launching resmi. Tindakan ini akan:
              </p>

              <ul className="text-xs space-y-2 text-slate-700 list-disc list-inside bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <li>Menghapus semua catatan riwayat setoran konsinyasi percobaan.</li>
                <li>Menghapus semua log kedatangan stok masuk percobaan.</li>
                <li>Mereset hitungan akumulasi <span className="font-bold">Total Terjual</span> pada semua produk titipan menjadi 0.</li>
                <li><span className="font-bold text-emerald-700">Stok aktif saat ini & master produk TIDAK akan dihapus.</span></li>
              </ul>

              <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-700 font-semibold">
                Peringatan: Tindakan ini permanen dan tercatat di audit log.
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsResetHistoryModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleResetHistory}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-red-700 transition-all shadow-md shadow-red-200 disabled:opacity-50"
                >
                  {isSubmitting ? 'Mereset...' : 'Ya, Reset Histori'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
