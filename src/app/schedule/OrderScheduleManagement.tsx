import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Search, 
  Filter, 
  Fish, 
  Apple, 
  Package, 
  ShoppingBag, 
  CheckCircle2, 
  Printer, 
  MapPin, 
  Phone, 
  AlertTriangle, 
  LayoutGrid, 
  List, 
  RotateCcw,
  Sparkles,
  Layers,
  ArrowRight,
  Edit,
  Trash2
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { db } from '@/core/database';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';
import { useFirestoreCollection } from '@/core/firestore-realtime';
import { PrepOrderService } from '@/core/services/prep-order-service';
import { DataResetService } from '@/core/services/data-reset-service';
import { OrderScheduleCard } from './OrderScheduleCard';
import { OrderScheduleModal } from './OrderScheduleModal';
import { OrderScheduleTicketModal } from './OrderScheduleTicketModal';
import type { PrepOrder, PrepOrderStatus, ScheduleCategory, ScheduleFulfillmentType } from '@/core/types';

export function OrderScheduleManagement() {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();

  const isOwner = currentUser?.role === 'OWNER';

  // Seed initial realistic sample orders for Fish, Fruit, and Sembako on first load if table is empty
  useEffect(() => {
    PrepOrderService.seedInitialOrdersIfEmpty();
  }, []);

  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const tomorrowStr = useMemo(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'), []);

  // UI state
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'ALL'>('TODAY');
  const [customDate, setCustomDate] = useState<string>('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<'ALL' | 'PICKUP' | 'DELIVERY'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'KANBAN' | 'TABLE'>('KANBAN');

  // Multi-select & Data Reset State (Owner Only)
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showResetAllModal, setShowResetAllModal] = useState(false);
  const [resetConfirmWord, setResetConfirmWord] = useState('');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<PrepOrder | null>(null);
  const [orderToPrint, setOrderToPrint] = useState<PrepOrder | null>(null);

  // Live data from Cloud Firestore (Realtime onSnapshot - Zero Interval)
  const { data: cloudOrders } = useFirestoreCollection<PrepOrder>('prepOrders');
  const localOrders = useLiveQuery(async () => await db.prepOrders.toArray(), []);
  const allOrders = cloudOrders && cloudOrders.length > 0 ? cloudOrders : (localOrders || []);

  // Today Summary Metrics
  const todaySummary = useMemo(() => {
    if (!allOrders) return { totalToday: 0, pending: 0, inProgress: 0, ready: 0, completed: 0 };
    const todayOrders = allOrders.filter(o => o.scheduledDate === todayStr && o.status !== 'CANCELLED');
    return {
      totalToday: todayOrders.length,
      pending: todayOrders.filter(o => o.status === 'PENDING').length,
      inProgress: todayOrders.filter(o => o.status === 'IN_PROGRESS').length,
      ready: todayOrders.filter(o => o.status === 'READY').length,
      completed: todayOrders.filter(o => o.status === 'COMPLETED').length,
    };
  }, [allOrders, todayStr]);

  // Category counts
  const categoryCounts = useMemo(() => {
    if (!allOrders) return { ALL: 0, IKAN: 0, BUAH: 0, SEMBAKO: 0, CAMPURAN: 0 };
    return {
      ALL: allOrders.filter(o => o.status !== 'CANCELLED').length,
      IKAN: allOrders.filter(o => (o.category || 'IKAN') === 'IKAN' && o.status !== 'CANCELLED').length,
      BUAH: allOrders.filter(o => o.category === 'BUAH' && o.status !== 'CANCELLED').length,
      SEMBAKO: allOrders.filter(o => o.category === 'SEMBAKO' && o.status !== 'CANCELLED').length,
      CAMPURAN: allOrders.filter(o => o.category === 'CAMPURAN' && o.status !== 'CANCELLED').length,
    };
  }, [allOrders]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    if (!allOrders) return [];

    return allOrders.filter(order => {
      // Category filter
      if (selectedCategory !== 'ALL' && (order.category || 'IKAN') !== selectedCategory) {
        return false;
      }

      // Fulfillment filter
      if (fulfillmentFilter !== 'ALL' && (order.fulfillmentType || 'PICKUP') !== fulfillmentFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'ALL' && order.status !== statusFilter) {
        return false;
      }

      // Date filter
      if (customDate) {
        if (order.scheduledDate !== customDate) return false;
      } else {
        if (dateFilter === 'TODAY' && order.scheduledDate !== todayStr) return false;
        if (dateFilter === 'TOMORROW' && order.scheduledDate !== tomorrowStr) return false;
        if (dateFilter === 'THIS_WEEK') {
          // within 7 days
          const now = new Date(todayStr);
          const sched = new Date(order.scheduledDate);
          const diffDays = (sched.getTime() - now.getTime()) / (1000 * 3600 * 24);
          if (diffDays < 0 || diffDays > 7) return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = order.customerName.toLowerCase().includes(q);
        const matchNum = order.orderNumber.toLowerCase().includes(q);
        const matchPhone = (order.customerPhone || '').toLowerCase().includes(q);
        const matchStatus = (order.status || '').toLowerCase().includes(q);
        const matchStaff = (order.assignedStaffName || '').toLowerCase().includes(q);
        const matchItems = order.items.some(it => 
          it.productName.toLowerCase().includes(q) || 
          (it.sizeSpec || '').toLowerCase().includes(q)
        );
        const matchNotes = (order.generalNotes || '').toLowerCase().includes(q);
        const matchAddress = (order.customerAddress || '').toLowerCase().includes(q);
        if (!matchName && !matchNum && !matchPhone && !matchStatus && !matchStaff && !matchItems && !matchNotes && !matchAddress) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      // Sort by scheduledDate then scheduledTime
      if (a.scheduledDate !== b.scheduledDate) {
        return a.scheduledDate.localeCompare(b.scheduledDate);
      }
      return a.scheduledTime.localeCompare(b.scheduledTime);
    });
  }, [allOrders, selectedCategory, fulfillmentFilter, statusFilter, dateFilter, customDate, searchQuery, todayStr, tomorrowStr]);

  // Multi-select helpers
  const allFilteredOrderIds = useMemo(() => filteredOrders.map(o => o.orderId), [filteredOrders]);
  const isAllSelected = allFilteredOrderIds.length > 0 && allFilteredOrderIds.every(id => selectedOrderIds.has(id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(allFilteredOrderIds));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedOrderIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedOrderIds(next);
  };

  const handleBulkDelete = async () => {
    if (!currentUser || !isOwner) return;
    setIsDeleting(true);
    try {
      const res = await DataResetService.deletePrepOrders(
        Array.from(selectedOrderIds),
        currentUser.userId,
        currentUser.role
      );
      addToast(res.message, 'success');
      setSelectedOrderIds(new Set());
      setShowBulkDeleteModal(false);
    } catch (err: any) {
      addToast(err.message || 'Gagal menghapus jadwal pesanan.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetAll = async () => {
    if (!currentUser || !isOwner) return;
    if (resetConfirmWord !== 'RESET') {
      addToast('Ketik kata konfirmasi "RESET" dengan tepat.', 'error');
      return;
    }
    setIsDeleting(true);
    try {
      const res = await DataResetService.resetAllPrepOrders(
        currentUser.userId,
        currentUser.role
      );
      addToast(res.message, 'success');
      setSelectedOrderIds(new Set());
      setShowResetAllModal(false);
      setResetConfirmWord('');
    } catch (err: any) {
      addToast(err.message || 'Gagal me-reset jadwal pesanan.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Status handlers
  const handleStatusChange = async (orderId: string, newStatus: PrepOrderStatus) => {
    try {
      await PrepOrderService.updateStatus(orderId, newStatus, currentUser?.name);
      addToast(`Status pesanan berhasil diubah menjadi ${newStatus}`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Gagal mengubah status pesanan', 'error');
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus jadwal pesanan ini?')) {
      return;
    }
    try {
      await PrepOrderService.deleteOrder(orderId);
      addToast('Jadwal pesanan berhasil dihapus', 'success');
    } catch (err) {
      console.error(err);
      addToast('Gagal menghapus pesanan', 'error');
    }
  };

  const handleOpenCreateModal = (category: ScheduleCategory = 'IKAN') => {
    setOrderToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (order: PrepOrder) => {
    setOrderToEdit(order);
    setIsModalOpen(true);
  };

  const handleOpenPrintModal = (order: PrepOrder) => {
    setOrderToPrint(order);
  };

  // Grouping for Kanban Board
  const kanbanColumns = useMemo(() => {
    return [
      {
        id: 'PENDING',
        title: 'Menunggu Pengerjaan',
        color: 'slate',
        count: filteredOrders.filter(o => o.status === 'PENDING').length,
        orders: filteredOrders.filter(o => o.status === 'PENDING')
      },
      {
        id: 'IN_PROGRESS',
        title: 'Sedang Dikerjakan',
        color: 'blue',
        count: filteredOrders.filter(o => o.status === 'IN_PROGRESS').length,
        orders: filteredOrders.filter(o => o.status === 'IN_PROGRESS')
      },
      {
        id: 'READY',
        title: 'Siap Diambil / Diantar',
        color: 'emerald',
        count: filteredOrders.filter(o => o.status === 'READY').length,
        orders: filteredOrders.filter(o => o.status === 'READY')
      },
      {
        id: 'COMPLETED',
        title: 'Selesai Diserahkan',
        color: 'purple',
        count: filteredOrders.filter(o => o.status === 'COMPLETED').length,
        orders: filteredOrders.filter(o => o.status === 'COMPLETED')
      }
    ];
  }, [filteredOrders]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 flex-wrap text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">
            <Calendar size={14} />
            <span>Modul Operasional & Penjadwalan Kerja</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Cloud Realtime Active (Zero Interval)
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Jadwal Pemesanan & To-Do List
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Perencanaan harian & instruksi penanganan untuk <span className="font-bold text-cyan-700">Ikan Segar</span>, <span className="font-bold text-amber-700">Buah-buahan</span>, dan <span className="font-bold text-emerald-700">Produk Sembako</span>.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => handleOpenCreateModal('IKAN')}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-blue-200 hover:shadow-xl transition-all"
          >
            <Plus size={16} />
            <span>Tambah Jadwal / To-Do Baru</span>
          </button>
        </div>
      </div>

      {/* Real-time KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Hari Ini ({todayStr})
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{todaySummary.totalToday}</span>
            <span className="text-xs font-bold text-slate-500">Pesanan</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            ⏳ Menunggu (Pending)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-700">{todaySummary.pending}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">To-Do</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-sm bg-blue-50/20">
          <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block mb-1">
            ⚙ Sedang Dikerjakan
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-blue-700">{todaySummary.inProgress}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Proses</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm bg-emerald-50/20">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">
            ✓ Siap Ambil / Kirim
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-700">{todaySummary.ready}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Ready</span>
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            ✔ Selesai (Completed)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{todaySummary.completed}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Lunas</span>
          </div>
        </div>
      </div>

      {/* Main Filter & Navigation Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
        {/* Category Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Semua Lini</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              selectedCategory === 'ALL' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {categoryCounts.ALL}
            </span>
          </button>

          <button
            onClick={() => setSelectedCategory('IKAN')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
              selectedCategory === 'IKAN'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-200'
                : 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100'
            }`}
          >
            <Fish size={14} />
            <span>🐟 Ikan Segar</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              selectedCategory === 'IKAN' ? 'bg-cyan-700 text-white' : 'bg-cyan-200 text-cyan-800'
            }`}>
              {categoryCounts.IKAN}
            </span>
          </button>

          <button
            onClick={() => setSelectedCategory('BUAH')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
              selectedCategory === 'BUAH'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-200'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <Apple size={14} />
            <span>🍎 Buah-buahan</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              selectedCategory === 'BUAH' ? 'bg-amber-700 text-white' : 'bg-amber-200 text-amber-800'
            }`}>
              {categoryCounts.BUAH}
            </span>
          </button>

          <button
            onClick={() => setSelectedCategory('SEMBAKO')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
              selectedCategory === 'SEMBAKO'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <Package size={14} />
            <span>📦 Produk Sembako</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              selectedCategory === 'SEMBAKO' ? 'bg-emerald-700 text-white' : 'bg-emerald-200 text-emerald-800'
            }`}>
              {categoryCounts.SEMBAKO}
            </span>
          </button>

          <button
            onClick={() => setSelectedCategory('CAMPURAN')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
              selectedCategory === 'CAMPURAN'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
            }`}
          >
            <ShoppingBag size={14} />
            <span>🛒 Campuran</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              selectedCategory === 'CAMPURAN' ? 'bg-purple-700 text-white' : 'bg-purple-200 text-purple-800'
            }`}>
              {categoryCounts.CAMPURAN}
            </span>
          </button>
        </div>

        {/* Secondary Filters: Dates, Fulfillment, Search, View Mode */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Preset Buttons */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => { setDateFilter('TODAY'); setCustomDate(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  dateFilter === 'TODAY' && !customDate ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hari Ini
              </button>
              <button
                onClick={() => { setDateFilter('TOMORROW'); setCustomDate(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  dateFilter === 'TOMORROW' && !customDate ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Besok
              </button>
              <button
                onClick={() => { setDateFilter('THIS_WEEK'); setCustomDate(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  dateFilter === 'THIS_WEEK' && !customDate ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Minggu Ini
              </button>
              <button
                onClick={() => { setDateFilter('ALL'); setCustomDate(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  dateFilter === 'ALL' && !customDate ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua
              </button>
            </div>

            {/* Custom Date Picker */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-xl text-xs">
              <Calendar size={13} className="text-slate-400" />
              <input
                type="date"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                className="bg-transparent text-slate-700 text-xs font-medium outline-none cursor-pointer"
                title="Pilih tanggal kustom"
              />
              {customDate && (
                <button 
                  onClick={() => setCustomDate('')}
                  className="text-[10px] text-slate-400 hover:text-red-600 font-bold ml-1"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Fulfillment Filter */}
            <select
              value={fulfillmentFilter}
              onChange={e => setFulfillmentFilter(e.target.value as any)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
            >
              <option value="ALL">Semua Penyerahan</option>
              <option value="PICKUP">🏪 Ambil di Toko</option>
              <option value="DELIVERY">🚗 Diantar (Delivery)</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
            >
              <option value="ALL">Semua Status</option>
              <option value="PENDING">Menunggu (Pending)</option>
              <option value="IN_PROGRESS">Sedang Dikerjakan</option>
              <option value="READY">Siap Ambil / Kirim</option>
              <option value="COMPLETED">Selesai (Completed)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari pemesan, produk, SPK..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0">
              <button
                onClick={() => setViewMode('KANBAN')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'KANBAN' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Tampilan Papan Kanban"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setViewMode('TABLE')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'TABLE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Tampilan Tabel Rinci"
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Owner Bulk Action Bar */}
      {isOwner && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 p-3 rounded-2xl">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-black uppercase text-slate-700">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
              />
              <span>Pilih Semua ({filteredOrders.length} Jadwal)</span>
            </label>
            {selectedOrderIds.size > 0 && (
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                {selectedOrderIds.size} dipilih
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedOrderIds.size > 0 && (
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(true)}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-sm transition-all flex items-center gap-1.5 cursor-pointer animate-pulse"
              >
                <Trash2 size={14} />
                <span>Hapus ({selectedOrderIds.size}) Jadwal Terpilih</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowResetAllModal(true)}
              className="px-3.5 py-2 bg-white hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-300 text-slate-600 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
              title="Reset bersih seluruh jadwal pesanan untuk launching resmi"
            >
              <RotateCcw size={14} />
              <span>Reset Semua Jadwal Pesanan</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area: Kanban or Table */}
      {viewMode === 'KANBAN' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {kanbanColumns.map(column => (
            <div 
              key={column.id} 
              className="bg-slate-100/70 p-3.5 rounded-3xl border border-slate-200/80 space-y-3"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    column.id === 'PENDING' ? 'bg-slate-500' :
                    column.id === 'IN_PROGRESS' ? 'bg-blue-600' :
                    column.id === 'READY' ? 'bg-emerald-600' : 'bg-purple-600'
                  }`} />
                  <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                    {column.title}
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-black bg-white text-slate-700 border border-slate-200 shadow-xs">
                  {column.count}
                </span>
              </div>

              {/* Cards List */}
              <div className="space-y-3 min-h-[150px]">
                {column.orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center bg-white/60 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                    <CheckCircle2 size={24} className="opacity-40 mb-1" />
                    <span className="text-xs font-medium">Tidak ada tugas</span>
                  </div>
                ) : (
                  column.orders.map(order => (
                    <OrderScheduleCard
                      key={order.orderId}
                      order={order}
                      onEdit={handleOpenEditModal}
                      onPrint={handleOpenPrintModal}
                      onDelete={handleDeleteOrder}
                      onStatusChange={handleStatusChange}
                      showCheckbox={isOwner}
                      isSelected={selectedOrderIds.has(order.orderId)}
                      onToggleSelect={toggleSelect}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                <tr>
                  {isOwner && (
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                      />
                    </th>
                  )}
                  <th className="py-3 px-4">No. Order & Jadwal</th>
                  <th className="py-3 px-4">Kategori & Produk</th>
                  <th className="py-3 px-4">Pemesan</th>
                  <th className="py-3 px-4">Penyerahan</th>
                  <th className="py-3 px-4">Status & Progres</th>
                  <th className="py-3 px-4">Total & DP</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={isOwner ? 8 : 7} className="text-center py-12 text-slate-400">
                      Tidak ada jadwal pesanan yang sesuai dengan filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(order => {
                    const isDelivery = order.fulfillmentType === 'DELIVERY';
                    const remaining = (order.totalEstimatedPrice || 0) - (order.downPaymentAmount || 0);

                    return (
                      <tr 
                        key={order.orderId} 
                        className={`hover:bg-slate-50/80 transition-all ${
                          selectedOrderIds.has(order.orderId) ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        {isOwner && (
                          <td className="py-3.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedOrderIds.has(order.orderId)}
                              onChange={() => toggleSelect(order.orderId)}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                            />
                          </td>
                        )}
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-slate-900">{order.orderNumber}</div>
                          <div className="flex items-center gap-1.5 text-slate-500 font-medium mt-0.5">
                            <Calendar size={12} />
                            <span>{order.scheduledDate}</span>
                            <span className="font-bold text-blue-700">{order.scheduledTime}</span>
                          </div>
                          {order.priority === 'URGENT' && (
                            <span className="inline-block mt-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-100 text-red-700">
                              🔥 URGENT
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="space-y-1">
                            {order.items.map((it, idx) => (
                              <div key={idx} className="flex items-baseline gap-1 text-[11px]">
                                <span className="font-bold text-slate-800">{it.productName}:</span>
                                <span className="text-blue-700 font-black">
                                   {it.quantityValue || it.weightKg} {it.quantityUnit || 'KG'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{order.customerName}</div>
                          {order.customerPhone && (
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                              <Phone size={10} />
                              {order.customerPhone}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            isDelivery ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {isDelivery ? '🚗 Antar ke Alamat' : '🏪 Ambil di Toko'}
                          </span>
                          {isDelivery && order.customerAddress && (
                            <div className="text-[10px] text-slate-500 truncate max-w-[180px] mt-0.5">
                              {order.customerAddress}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              order.status === 'PENDING' ? 'bg-slate-100 text-slate-700' :
                              order.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                              order.status === 'READY' ? 'bg-emerald-100 text-emerald-800 font-black' :
                              'bg-slate-200 text-slate-600'
                            }`}>
                              {order.status}
                            </span>

                            {/* 1-click status advance */}
                            {order.status === 'PENDING' && (
                              <button
                                onClick={() => handleStatusChange(order.orderId, 'IN_PROGRESS')}
                                className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold hover:bg-blue-700"
                              >
                                Kerjakan ▶
                              </button>
                            )}
                            {order.status === 'IN_PROGRESS' && (
                              <button
                                onClick={() => handleStatusChange(order.orderId, 'READY')}
                                className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700"
                              >
                                Siap ✓
                              </button>
                            )}
                            {order.status === 'READY' && (
                              <button
                                onClick={() => handleStatusChange(order.orderId, 'COMPLETED')}
                                className="px-2 py-0.5 bg-slate-900 text-white rounded text-[10px] font-bold hover:bg-slate-800"
                              >
                                Selesai
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-black text-slate-900">
                            Rp {(order.totalEstimatedPrice || 0).toLocaleString('id-ID')}
                          </div>
                          <div className="text-[10px]">
                            {order.paymentStatus === 'PAID' ? (
                              <span className="text-emerald-700 font-bold">Lunas</span>
                            ) : order.paymentStatus === 'DOWN_PAYMENT' ? (
                              <span className="text-amber-700 font-bold">DP: Rp {(order.downPaymentAmount || 0).toLocaleString('id-ID')}</span>
                            ) : (
                              <span className="text-red-600 font-bold">Belum Bayar</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenPrintModal(order)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Cetak SPK"
                            >
                              <Printer size={14} />
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(order)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Edit"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteOrder(order.orderId)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Hapus"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <OrderScheduleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        orderToEdit={orderToEdit}
      />

      <OrderScheduleTicketModal
        isOpen={Boolean(orderToPrint)}
        onClose={() => setOrderToPrint(null)}
        order={orderToPrint}
      />

      {/* MODAL: Bulk Delete Confirmation */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Hapus Jadwal Pesanan?</h3>
                <p className="text-xs font-medium text-slate-500 leading-relaxed">
                  Apakah Anda yakin ingin menghapus <span className="font-black text-rose-600">{selectedOrderIds.size}</span> jadwal pesanan terpilih? Data yang dihapus tidak dapat dipulihkan.
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowBulkDeleteModal(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleBulkDelete}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 size={16} />
                {isDeleting ? 'Menghapus...' : `Ya, Hapus (${selectedOrderIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Reset All Prep Orders Confirmation */}
      {showResetAllModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Reset Semua Jadwal Pesanan?</h3>
                <p className="text-xs font-medium text-slate-500 leading-relaxed">
                  Tindakan ini ditujukan untuk membersihkan seluruh data pesanan percobaan ({allOrders.length} data) sebelum peluncuran resmi. Jadwal pesanan akan dihapus bersih permanen.
                </p>
              </div>
            </div>

            <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                Ketik <span className="text-rose-600 font-bold">RESET</span> untuk konfirmasi:
              </label>
              <input 
                type="text"
                placeholder="Ketik RESET"
                value={resetConfirmWord}
                onChange={(e) => setResetConfirmWord(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setShowResetAllModal(false);
                  setResetConfirmWord('');
                }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting || resetConfirmWord !== 'RESET'}
                onClick={handleResetAll}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw size={16} />
                {isDeleting ? 'Mereset...' : 'Reset Bersih Semua'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
