import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Printer, 
  Trash2, 
  Edit, 
  CheckCircle2, 
  Play, 
  PackageCheck, 
  Search, 
  Filter, 
  Fish, 
  Scale, 
  Phone, 
  AlertTriangle, 
  CheckSquare, 
  Scissors, 
  Layers,
  ChevronRight,
  TrendingUp,
  FileText
} from 'lucide-react';
import { db } from '@/core/database';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';
import { PrepOrderService } from '@/core/services/prep-order-service';
import { PrepOrderModal } from './PrepOrderModal';
import { PrepTicketModal } from './PrepTicketModal';
import type { PrepOrder, PrepOrderStatus, PrepCuttingStyle } from '@/core/types';

const CUTTING_STYLE_SHORT: Record<PrepCuttingStyle, string> = {
  UTUH: 'Utuh Bersih',
  BELAH_BAKAR: 'Belah Punggung (Bakar)',
  POTONG_2: 'Potong 2',
  POTONG_3: 'Potong 3',
  POTONG_4: 'Potong 4',
  KERAT_GORENG: 'Kerat Sayat',
  FILLET: 'Fillet',
  CUSTOM: 'Potong Khusus'
};

export function PrepScheduleBoard() {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  // UI state
  const [activeDateTab, setActiveDateTab] = useState<'TODAY' | 'TOMORROW' | 'UPCOMING' | 'ALL'>('TODAY');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<PrepOrder | null>(null);
  const [orderToPrint, setOrderToPrint] = useState<PrepOrder | null>(null);

  // Load all prep orders from Dexie
  const allOrders = useLiveQuery(async () => {
    return await db.prepOrders.toArray();
  }, []);

  // Filter orders according to date tab, status, and search query
  const filteredOrders = useMemo(() => {
    if (!allOrders) return [];

    return allOrders.filter(order => {
      // Date tab filter
      if (activeDateTab === 'TODAY' && order.scheduledDate !== todayStr) return false;
      if (activeDateTab === 'TOMORROW' && order.scheduledDate !== tomorrowStr) return false;
      if (activeDateTab === 'UPCOMING' && order.scheduledDate <= todayStr) return false;

      // Status filter
      if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = order.customerName.toLowerCase().includes(q);
        const matchNum = order.orderNumber.toLowerCase().includes(q);
        const matchFish = order.items.some(it => it.productName.toLowerCase().includes(q) || it.sizeSpec.toLowerCase().includes(q));
        const matchNotes = (order.generalNotes || '').toLowerCase().includes(q);
        if (!matchName && !matchNum && !matchFish && !matchNotes) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort by scheduledDate then scheduledTime
      if (a.scheduledDate !== b.scheduledDate) {
        return a.scheduledDate.localeCompare(b.scheduledDate);
      }
      return a.scheduledTime.localeCompare(b.scheduledTime);
    });
  }, [allOrders, activeDateTab, statusFilter, searchQuery, todayStr, tomorrowStr]);

  // Daily Summary metrics for the active tab date
  const summaryMetrics = useMemo(() => {
    if (!allOrders) return { totalOrders: 0, totalKg: 0, breakdown: {} };

    const targetOrders = allOrders.filter(o => {
      if (activeDateTab === 'TODAY') return o.scheduledDate === todayStr;
      if (activeDateTab === 'TOMORROW') return o.scheduledDate === tomorrowStr;
      return true;
    }).filter(o => o.status !== 'CANCELLED');

    const totalOrders = targetOrders.length;
    const totalKg = targetOrders.reduce((acc, o) => acc + (o.totalWeightKg || 0), 0);
    const breakdown: Record<string, number> = {};

    targetOrders.forEach(o => {
      o.items?.forEach(it => {
        const f = it.productName || 'Ikan Lain';
        breakdown[f] = (breakdown[f] || 0) + (Number(it.weightKg) || 0);
      });
    });

    return { totalOrders, totalKg, breakdown };
  }, [allOrders, activeDateTab, todayStr, tomorrowStr]);

  // Quick status transitions
  const handleNextStatus = async (order: PrepOrder) => {
    let nextStatus: PrepOrderStatus = 'IN_PROGRESS';
    if (order.status === 'PENDING') nextStatus = 'IN_PROGRESS';
    else if (order.status === 'IN_PROGRESS') nextStatus = 'READY';
    else if (order.status === 'READY') nextStatus = 'COMPLETED';

    try {
      await PrepOrderService.updateStatus(order.orderId, nextStatus, currentUser?.name);
      addToast(
        nextStatus === 'IN_PROGRESS' 
          ? `Pesanan ${order.customerName} mulai dikerjakan!` 
          : nextStatus === 'READY' 
          ? `Pesanan ${order.customerName} SIAP DIAMBIL!` 
          : `Pesanan ${order.customerName} selesai & lunas!`,
        'success'
      );
    } catch (err: any) {
      addToast('Gagal mengubah status: ' + (err?.message || ''), 'error');
    }
  };

  const handleDelete = async (order: PrepOrder) => {
    if (!confirm(`Hapus jadwal pesanan ${order.orderNumber} untuk ${order.customerName}?`)) return;
    try {
      await PrepOrderService.deleteOrder(order.orderId);
      addToast('Jadwal pesanan berhasil dihapus', 'success');
    } catch (err: any) {
      addToast('Gagal menghapus jadwal: ' + (err?.message || ''), 'error');
    }
  };

  const statusBadge = (status: PrepOrderStatus) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">Menunggu</span>;
      case 'IN_PROGRESS':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200 animate-pulse">Sedang Diolah</span>;
      case 'READY':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">Siap Diambil</span>;
      case 'COMPLETED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">Selesai / Lunas</span>;
      case 'CANCELLED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">Dibatalkan</span>;
    }
  };

  // Counts for tabs
  const todayCount = (allOrders || []).filter(o => o.scheduledDate === todayStr && o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;
  const tomorrowCount = (allOrders || []).filter(o => o.scheduledDate === tomorrowStr && o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-800 rounded-lg">
              To-Do List &amp; Penjadwalan
            </span>
            <span className="text-xs text-slate-400 font-bold">•</span>
            <span className="text-xs text-slate-500 font-semibold">Pengolahan Ikan Basah</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            Jadwal Pemesanan &amp; Olah Ikan
          </h2>
          <p className="text-slate-500 text-sm font-medium">
            Perencanaan pesanan ikan: tanggal, jenis ikan, bobot (kg), grading ukuran, dan instruksi potong.
          </p>
        </div>

        <button
          onClick={() => { setOrderToEdit(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-200 cursor-pointer"
        >
          <Plus size={16} /> + Buat Jadwal Pemesanan
        </button>
      </div>

      {/* Date Tabs Filter */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveDateTab('TODAY')}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeDateTab === 'TODAY'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Calendar size={15} />
          <span>Hari Ini</span>
          {todayCount > 0 && (
            <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
              activeDateTab === 'TODAY' ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700'
            }`}>
              {todayCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveDateTab('TOMORROW')}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeDateTab === 'TOMORROW'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock size={15} />
          <span>Besok</span>
          {tomorrowCount > 0 && (
            <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
              activeDateTab === 'TOMORROW' ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {tomorrowCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveDateTab('UPCOMING')}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeDateTab === 'UPCOMING'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <TrendingUp size={15} />
          <span>Mendatang</span>
        </button>

        <button
          onClick={() => setActiveDateTab('ALL')}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeDateTab === 'ALL'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Layers size={15} />
          <span>Semua Jadwal</span>
        </button>
      </div>

      {/* Daily Summary Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-5 rounded-3xl shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-bold text-blue-200">
              <Scale size={18} />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">
                Beban Kerja {activeDateTab === 'TODAY' ? 'Hari Ini' : activeDateTab === 'TOMORROW' ? 'Besok' : 'Terpilih'}
              </span>
              <p className="text-base font-black">
                {summaryMetrics.totalOrders} Pesanan • Total {summaryMetrics.totalKg} Kg Ikan
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {Object.entries(summaryMetrics.breakdown).map(([fish, kg]) => (
              <span key={fish} className="px-2.5 py-1 bg-white/10 rounded-xl text-xs font-bold text-blue-100 border border-white/10">
                {fish}: <strong className="text-white">{kg} kg</strong>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari pemesan, nomor tiket, atau jenis ikan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800"
          >
            <option value="ALL">Semua Status Pengerjaan</option>
            <option value="PENDING">Menunggu</option>
            <option value="IN_PROGRESS">Sedang Diolah</option>
            <option value="READY">Siap Diambil</option>
            <option value="COMPLETED">Selesai / Lunas</option>
            <option value="CANCELLED">Dibatalkan</option>
          </select>
        </div>
      </div>

      {/* Task Cards Grid */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-3xl border border-slate-200 space-y-3">
          <div className="w-14 h-14 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto">
            <Fish size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            Tidak Ada Jadwal Pemesanan Ikan
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
            Belum ada tugas pengolahan ikan untuk filter ini. Klik tombol di bawah untuk membuat jadwal baru.
          </p>
          <button
            onClick={() => { setOrderToEdit(null); setIsModalOpen(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
          >
            <Plus size={15} /> + Buat Jadwal Baru
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const isToday = order.scheduledDate === todayStr;

            return (
              <div 
                key={order.orderId}
                className={`bg-white rounded-3xl border transition-all flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-md ${
                  order.status === 'READY' 
                    ? 'border-emerald-300 ring-2 ring-emerald-500/10' 
                    : order.status === 'IN_PROGRESS'
                    ? 'border-blue-300 ring-2 ring-blue-500/10'
                    : 'border-slate-200'
                }`}
              >
                {/* Card Header */}
                <div className="p-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/60">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-black text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {order.orderNumber}
                      </span>
                      {statusBadge(order.status)}
                    </div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight pt-1">
                      {order.customerName}
                    </h4>
                    {order.customerPhone && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                        <Phone size={11} className="text-blue-600" />
                        {order.customerPhone}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs font-black text-blue-700 bg-blue-50 px-2 py-1 rounded-xl border border-blue-100">
                      <Clock size={13} />
                      <span>{order.scheduledTime}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 block mt-0.5">
                      {order.scheduledDate}
                    </span>
                  </div>
                </div>

                {/* Card Body: Fish Items & Specs */}
                <div className="p-4 space-y-3 flex-1">
                  {order.items?.map((item, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-black text-slate-900 uppercase">
                            {item.productName}
                          </span>
                          <span className="text-[11px] font-bold text-indigo-700 block">
                            {item.sizeSpec}
                          </span>
                        </div>
                        <span className="text-sm font-black text-slate-900 bg-white px-2.5 py-1 rounded-xl border border-slate-200 tabular-nums">
                          {item.weightKg} Kg
                        </span>
                      </div>

                      {/* Cleaning & Cutting badges */}
                      <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                        {item.cleanScale && (
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                            Sisik ✓
                          </span>
                        )}
                        {item.cleanGut && (
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                            Isi Perut ✓
                          </span>
                        )}
                        {item.cleanGills && (
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                            Insang ✓
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                          {CUTTING_STYLE_SHORT[item.cuttingStyle] || item.cuttingStyle}
                        </span>
                      </div>

                      {item.customCuttingNotes && (
                        <p className="text-[10px] text-slate-500 italic">
                          "{item.customCuttingNotes}"
                        </p>
                      )}
                    </div>
                  ))}

                  {/* General notes */}
                  {order.generalNotes && (
                    <div className="p-2 bg-amber-50 rounded-xl text-[10px] text-amber-900 border border-amber-200/70">
                      <span className="font-bold">Catatan: </span>
                      {order.generalNotes}
                    </div>
                  )}
                </div>

                {/* Card Footer: Status Action Buttons & Controls */}
                <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setOrderToPrint(order)}
                      title="Cetak Tiket Kerja"
                      className="p-2 text-slate-600 hover:text-blue-600 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                    >
                      <Printer size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOrderToEdit(order); setIsModalOpen(true); }}
                      title="Ubah Jadwal"
                      className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                    >
                      <Edit size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(order)}
                      title="Hapus Jadwal"
                      className="p-2 text-slate-600 hover:text-rose-600 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* Progressive Action Button */}
                  {order.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() => handleNextStatus(order)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      <Play size={13} /> Mulai Olah
                    </button>
                  )}
                  {order.status === 'IN_PROGRESS' && (
                    <button
                      type="button"
                      onClick={() => handleNextStatus(order)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer"
                    >
                      <PackageCheck size={14} /> Siap Diambil
                    </button>
                  )}
                  {order.status === 'READY' && (
                    <button
                      type="button"
                      onClick={() => handleNextStatus(order)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      <CheckCircle2 size={13} className="text-emerald-400" /> Selesai / Lunas
                    </button>
                  )}
                  {order.status === 'COMPLETED' && (
                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                      <CheckCircle2 size={13} className="text-emerald-600" /> Tuntas
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Input / Edit Modal */}
      <PrepOrderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        orderToEdit={orderToEdit}
        currentUserId={currentUser?.userId || 'staff-1'}
      />

      {/* Ticket Print Modal */}
      <PrepTicketModal
        isOpen={Boolean(orderToPrint)}
        onClose={() => setOrderToPrint(null)}
        order={orderToPrint}
      />
    </div>
  );
}
