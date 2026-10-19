import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';
import { useDeviceId } from '@/core/device-store';
import { StaffDebtService, type StaffDebtItem } from '@/core/services/staff-debt-service';
import type { CashierShift, Receivable, ReceivablePayment } from '@/core/types';
import { format, isPast, parseISO, differenceInDays } from 'date-fns';
import { KasbonRepaymentModal } from './KasbonRepaymentModal';
import {
  Wallet,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Filter,
  DollarSign,
  User,
  Users,
  FileText,
  Lock,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  X,
  CreditCard,
  Building,
  RotateCcw,
  AlertOctagon,
  Eye,
  Calendar,
  History,
  Receipt,
  ArrowUpRight
} from 'lucide-react';

interface StaffDebtManagerProps {
  onOpenPaymentModal: (receivable: Receivable) => void;
}

export function StaffDebtManager({ onOpenPaymentModal }: StaffDebtManagerProps) {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const deviceId = useDeviceId();

  const [activeTab, setActiveTab] = useState<'KASBON_LIST' | 'REPAYMENT_HISTORY'>('KASBON_LIST');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAID' | 'OVERDUE'>('ACTIVE');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'SHIFT_DISCREPANCY' | 'DIRECT_CASH_ADVANCE'>('ALL');
  const [refreshKey, setRefreshKey] = useState(0);

  // Repayment Modal
  const [isRepaymentModalOpen, setIsRepaymentModalOpen] = useState(false);
  const [debtForRepayment, setDebtForRepayment] = useState<StaffDebtItem | null>(null);

  // History Tab Filters
  const [historySearch, setHistorySearch] = useState('');
  const [historyMethodFilter, setHistoryMethodFilter] = useState<'ALL' | 'POTONG_GAJI' | 'CASH' | 'TRANSFER' | 'QRIS'>('ALL');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedStaffDebt, setSelectedStaffDebt] = useState<StaffDebtItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Pre-fill state when clicking from Unassigned Differences
  const [prefilledShift, setPrefilledShift] = useState<CashierShift | null>(null);

  // Form states for creating kasbon
  const [formSourceType, setFormSourceType] = useState<'SHIFT_DISCREPANCY' | 'DIRECT_CASH_ADVANCE'>('DIRECT_CASH_ADVANCE');
  const [formCashierId, setFormCashierId] = useState('');
  const [formShiftId, setFormShiftId] = useState('');
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formDueDate, setFormDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return format(d, 'yyyy-MM-dd');
  });
  const [formNotes, setFormNotes] = useState('');
  const [formOwnerPin, setFormOwnerPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // 1. Fetch Staff Debts
  const staffDebts = useLiveQuery(
    () => StaffDebtService.getStaffDebts(),
    [refreshKey]
  );

  // 2. Fetch Users (Cashiers/Staff)
  const users = useLiveQuery(() => db.users.toArray(), []);
  const cashierUsers = useMemo(() => {
    return users?.filter(u => u.status === 'ACTIVE' && (u.role === 'KASIR' || u.role === 'MANAGER' || u.role === 'WAREHOUSE')) || [];
  }, [users]);

  // 3. Fetch Unassigned Shift Discrepancies
  const unassignedShiftDiscrepancies = useLiveQuery(async () => {
    const shifts = await db.shifts
      .where('status')
      .equals('CLOSED')
      .filter(s => Boolean(
        s.discrepancy &&
        s.discrepancy < 0 &&
        (!s.discrepancyApprovalStatus || s.discrepancyApprovalStatus === 'PENDING' || s.discrepancyApprovalStatus === 'INVESTIGATION_REQUESTED')
      ))
      .toArray();

    // Attach cashier user names
    const userList = await db.users.toArray();
    const userMap = new Map(userList.map(u => [u.userId, u.name]));

    return shifts.map(s => ({
      ...s,
      cashierName: userMap.get(s.userId) || s.userId
    })).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [refreshKey]);

  // 4. Filtered Staff Debts
  const filteredDebts = useMemo(() => {
    if (!staffDebts) return [];

    return staffDebts.filter(item => {
      // Search
      const q = search.toLowerCase().trim();
      const matchesSearch = !q ||
        item.customer.name.toLowerCase().includes(q) ||
        item.receivable.transactionId.toLowerCase().includes(q) ||
        (item.cashierUser?.name || '').toLowerCase().includes(q);

      // Status
      let matchesStatus = true;
      const isOverdue = item.remainingAmount > 0 && isPast(parseISO(item.dueDate));
      if (statusFilter === 'ACTIVE') {
        matchesStatus = item.remainingAmount > 0;
      } else if (statusFilter === 'PAID') {
        matchesStatus = item.remainingAmount <= 0;
      } else if (statusFilter === 'OVERDUE') {
        matchesStatus = isOverdue;
      }

      // Source
      const matchesSource = sourceFilter === 'ALL' || item.sourceType === sourceFilter;

      return matchesSearch && matchesStatus && matchesSource;
    });
  }, [staffDebts, search, statusFilter, sourceFilter]);

  // Summary Metrics
  const summary = useMemo(() => {
    if (!staffDebts) return { totalOutstanding: 0, totalPaid: 0, activeStaffCount: 0, overdueCount: 0 };

    let totalOutstanding = 0;
    let totalPaid = 0;
    let overdueCount = 0;
    const activeStaffSet = new Set<string>();

    for (const d of staffDebts) {
      totalOutstanding += d.remainingAmount;
      totalPaid += d.paidAmount;
      if (d.remainingAmount > 0) {
        activeStaffSet.add(d.customer.customerId);
        if (isPast(parseISO(d.dueDate))) {
          overdueCount++;
        }
      }
    }

    return {
      totalOutstanding,
      totalPaid,
      activeStaffCount: activeStaffSet.size,
      overdueCount
    };
  }, [staffDebts]);

  // 5. Fetch Repayment History (linked to original cash differences)
  const repaymentHistory = useLiveQuery(
    () => StaffDebtService.getStaffRepaymentHistory(),
    [refreshKey]
  );

  // 6. Selected Debt Payments (for detail modal)
  const selectedDebtPayments = useLiveQuery(
    async () => {
      if (!selectedStaffDebt) return [];
      const list = await db.receivablePayments
        .where('receivableId')
        .equals(selectedStaffDebt.receivable.receivableId)
        .toArray();
      return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    [selectedStaffDebt, refreshKey]
  );

  // 7. Filtered Repayment History
  const filteredHistory = useMemo(() => {
    if (!repaymentHistory) return [];
    return repaymentHistory.filter(item => {
      const q = historySearch.toLowerCase().trim();
      const matchSearch = !q ||
        item.customer.name.toLowerCase().includes(q) ||
        (item.cashierUser?.name || '').toLowerCase().includes(q) ||
        item.receivable.transactionId.toLowerCase().includes(q) ||
        (item.shift?.shiftId || '').toLowerCase().includes(q) ||
        (item.payment.notes || '').toLowerCase().includes(q);

      const matchMethod = historyMethodFilter === 'ALL' || item.payment.paymentMethodId === historyMethodFilter;

      return matchSearch && matchMethod;
    });
  }, [repaymentHistory, historySearch, historyMethodFilter]);

  // Repayment Stats
  const repaymentStats = useMemo(() => {
    if (!repaymentHistory) return { totalPaid: 0, count: 0, salaryDeductionTotal: 0, cashTotal: 0, digitalTotal: 0 };
    let totalPaid = 0;
    let salaryDeductionTotal = 0;
    let cashTotal = 0;
    let digitalTotal = 0;

    for (const h of repaymentHistory) {
      totalPaid += h.payment.amount;
      if (h.payment.paymentMethodId === 'POTONG_GAJI') {
        salaryDeductionTotal += h.payment.amount;
      } else if (h.payment.paymentMethodId === 'CASH') {
        cashTotal += h.payment.amount;
      } else {
        digitalTotal += h.payment.amount;
      }
    }

    return {
      totalPaid,
      count: repaymentHistory.length,
      salaryDeductionTotal,
      cashTotal,
      digitalTotal
    };
  }, [repaymentHistory]);

  // Handle open create modal from an unassigned shift
  const handleAssignShiftDiscrepancy = (shift: any) => {
    setPrefilledShift(shift);
    setFormSourceType('SHIFT_DISCREPANCY');
    setFormCashierId(shift.userId);
    setFormShiftId(shift.shiftId);
    setFormAmount(Math.abs(shift.discrepancy || 0));
    setFormNotes(`Selisih kas laci shift ${shift.shiftId.slice(-6).toUpperCase()} tanggal ${format(new Date(shift.startTime), 'dd/MM/yyyy')}`);
    setFormOwnerPin('');
    setFormError('');
    setIsCreateModalOpen(true);
  };

  const handleOpenGeneralCreateModal = () => {
    setPrefilledShift(null);
    setFormSourceType('DIRECT_CASH_ADVANCE');
    setFormCashierId(cashierUsers[0]?.userId || '');
    setFormShiftId('');
    setFormAmount(0);
    setFormNotes('');
    setFormOwnerPin('');
    setFormError('');
    setIsCreateModalOpen(true);
  };

  const handleSubmitCreateKasbon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setFormError('');

    if (!formCashierId) {
      setFormError('Pilih kasir yang bersangkutan.');
      return;
    }

    if (formAmount <= 0) {
      setFormError('Nominal kasbon harus lebih dari Rp 0.');
      return;
    }

    if (!formOwnerPin.trim()) {
      setFormError('Masukkan PIN Owner untuk mengotorisasi kasbon.');
      return;
    }

    setIsSubmitting(true);
    try {
      await StaffDebtService.createStaffKasbon({
        cashierUserId: formCashierId,
        sourceType: formSourceType,
        amount: formAmount,
        shiftId: formSourceType === 'SHIFT_DISCREPANCY' ? formShiftId : undefined,
        dueDate: formDueDate,
        notes: formNotes.trim() || (formSourceType === 'SHIFT_DISCREPANCY' ? 'Beban selisih kas laci' : 'Kasbon pinjaman karyawan'),
        ownerUserId: currentUser.userId,
        ownerPin: formOwnerPin.trim(),
        deviceId
      });

      addToast(
        formSourceType === 'SHIFT_DISCREPANCY'
          ? `Selisih kas shift Rp ${formAmount.toLocaleString()} berhasil dibebankan ke akun kasir!`
          : `Kasbon langsung Rp ${formAmount.toLocaleString()} berhasil dicatat dan dipotong dari laci warung!`,
        'success'
      );

      setRefreshKey(prev => prev + 1);
      setIsCreateModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Gagal mencatat kasbon.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-Tabs: Daftar Kasbon vs Log Riwayat Pembayaran */}
      <div className="flex border-b border-slate-200 gap-3 pb-0">
        <button
          type="button"
          onClick={() => setActiveTab('KASBON_LIST')}
          className={`pb-3 px-3 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'KASBON_LIST'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          <Wallet size={16} />
          <span>Daftar Kasbon & Beban Kasir</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            activeTab === 'KASBON_LIST' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {filteredDebts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('REPAYMENT_HISTORY')}
          className={`pb-3 px-3 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'REPAYMENT_HISTORY'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          <History size={16} />
          <span>Log Riwayat Pembayaran & Pelunasan</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            activeTab === 'REPAYMENT_HISTORY' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {repaymentHistory?.length || 0}
          </span>
        </button>
      </div>

      {activeTab === 'KASBON_LIST' ? (
        <div className="space-y-6">
          {/* KPI Cards for Kasbon */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Total Kasbon Aktif
                </span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <Wallet size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 tabular-nums">
            Rp {summary.totalOutstanding.toLocaleString()}
          </p>
          <p className="text-[11px] font-bold text-slate-500 mt-1">
            Tanggungan aktif kasir / staff
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Kasir Bertanggung Jawab
            </span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Users size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 tabular-nums">
            {summary.activeStaffCount} Orang
          </p>
          <p className="text-[11px] font-bold text-indigo-600 mt-1">
            Memiliki tanggungan kasbon aktif
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-emerald-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
              Kasbon Terlunasi
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 tabular-nums">
            Rp {summary.totalPaid.toLocaleString()}
          </p>
          <p className="text-[11px] font-bold text-emerald-600 mt-1">
            Total pemotongan gaji / cicilan kasir
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-amber-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">
              Selisih Belum Dibebankan
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <AlertTriangle size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-700 tabular-nums">
            {unassignedShiftDiscrepancies?.length || 0} Sesi
          </p>
          <p className="text-[11px] font-bold text-amber-600 mt-1">
            Shift dengan selisih belum diselesaikan
          </p>
        </div>
      </div>

      {/* Unassigned Shift Discrepancies Alert Panel */}
      {unassignedShiftDiscrepancies && unassignedShiftDiscrepancies.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-300 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="font-black text-amber-950 uppercase text-sm tracking-tight">
                  Perhatian: Terdapat {unassignedShiftDiscrepancies.length} Sesi Kasir Mengalami Selisih Kas Belum Ditindaklanjuti
                </h3>
                <p className="text-xs text-amber-800 font-medium">
                  Sesuai kebijakan toko: jika selisih kas fisik di laci tidak ditemukan penyebabnya, bebankan ke kasir sebagai kasbon.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {unassignedShiftDiscrepancies.map((s: any) => (
              <div key={s.shiftId} className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs flex flex-col justify-between space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">
                      Shift ID: {s.shiftId.slice(-6).toUpperCase()}
                    </span>
                    <h4 className="text-xs font-black text-slate-900 uppercase">
                      Kasir: {s.cashierName}
                    </h4>
                    <span className="text-[10px] text-slate-500">
                      {format(new Date(s.startTime), 'dd MMM yyyy HH:mm')}
                    </span>
                  </div>
                  <span className="text-xs font-black text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg tabular-nums">
                    -Rp {Math.abs(s.discrepancy || 0).toLocaleString()}
                  </span>
                </div>

                {s.discrepancyReason && (
                  <p className="text-[10px] text-slate-600 italic bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                    Alasan: "{s.discrepancyReason}"
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => handleAssignShiftDiscrepancy(s)}
                  className="w-full mt-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-xs flex items-center justify-center gap-1 transition-all"
                >
                  <Plus size={12} /> Bebankan ke Kasir Ini
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Filter and Action Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Cari nama kasir atau No. Ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-2xl border border-slate-200 text-xs font-black">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl uppercase tracking-wider transition-all ${
                statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-xl uppercase tracking-wider transition-all ${
                statusFilter === 'ACTIVE' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Belum Lunas
            </button>
            <button
              onClick={() => setStatusFilter('OVERDUE')}
              className={`px-3 py-1.5 rounded-xl uppercase tracking-wider transition-all ${
                statusFilter === 'OVERDUE' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Terlambat
            </button>
            <button
              onClick={() => setStatusFilter('PAID')}
              className={`px-3 py-1.5 rounded-xl uppercase tracking-wider transition-all ${
                statusFilter === 'PAID' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Lunas
            </button>
          </div>

          {/* Source Filter */}
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-2xl border border-slate-200 text-xs font-black">
            <button
              onClick={() => setSourceFilter('ALL')}
              className={`px-2.5 py-1.5 rounded-xl uppercase tracking-wider transition-all ${
                sourceFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Semua Sumber
            </button>
            <button
              onClick={() => setSourceFilter('SHIFT_DISCREPANCY')}
              className={`px-2.5 py-1.5 rounded-xl uppercase tracking-wider transition-all ${
                sourceFilter === 'SHIFT_DISCREPANCY' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Selisih Shift
            </button>
            <button
              onClick={() => setSourceFilter('DIRECT_CASH_ADVANCE')}
              className={`px-2.5 py-1.5 rounded-xl uppercase tracking-wider transition-all ${
                sourceFilter === 'DIRECT_CASH_ADVANCE' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Pinjaman Langsung
            </button>
          </div>
        </div>

        {/* Create Kasbon Action Button */}
        <button
          onClick={handleOpenGeneralCreateModal}
          className="w-full md:w-auto px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-md shadow-rose-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus size={16} />
          <span>Catat Kasbon / Bebankan Selisih</span>
        </button>
      </div>

      {/* Staff Debt Table */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <th className="py-4 px-6">Tanggal & Ref</th>
                <th className="py-4 px-6">Kasir Bertanggung Jawab</th>
                <th className="py-4 px-6">Sumber Kasbon</th>
                <th className="py-4 px-6 text-right">Total Kasbon</th>
                <th className="py-4 px-6 text-right">Sudah Dibayar</th>
                <th className="py-4 px-6 text-right">Sisa Tanggungan</th>
                <th className="py-4 px-6 text-center">Jatuh Tempo</th>
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDebts.length > 0 ? (
                filteredDebts.map((item) => {
                  const isPaid = item.remainingAmount <= 0;
                  const isOverdue = !isPaid && isPast(parseISO(item.dueDate));

                  return (
                    <tr key={item.receivable.receivableId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-6">
                        <span className="font-mono font-black text-slate-900 block">
                          {item.receivable.transactionId}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {format(new Date(item.createdAt), 'dd MMM yyyy HH:mm')}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black uppercase">
                            {item.customer.name.replace('Kasir - ', '')[0] || 'K'}
                          </div>
                          <div>
                            <span className="font-black text-slate-900 uppercase block">
                              {item.customer.name}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {item.cashierUser?.role || 'KASIR'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        {item.sourceType === 'SHIFT_DISCREPANCY' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-black uppercase">
                            <AlertTriangle size={11} className="text-amber-600" />
                            Selisih Kas Laci
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-black uppercase">
                            <Wallet size={11} className="text-blue-600" />
                            Pinjaman Langsung
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-right font-black text-slate-900 tabular-nums">
                        Rp {item.totalAmount.toLocaleString()}
                      </td>

                      <td className="py-4 px-6 text-right font-black text-emerald-600 tabular-nums">
                        Rp {item.paidAmount.toLocaleString()}
                      </td>

                      <td className="py-4 px-6 text-right font-black tabular-nums">
                        <span className={item.remainingAmount > 0 ? 'text-rose-600 text-sm' : 'text-slate-400'}>
                          Rp {item.remainingAmount.toLocaleString()}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-center">
                        <span className={`text-[11px] font-bold block ${isOverdue ? 'text-rose-600' : 'text-slate-700'}`}>
                          {format(new Date(item.dueDate), 'dd/MM/yyyy')}
                        </span>
                        {isOverdue && (
                          <span className="text-[9px] font-black uppercase text-rose-500 block">
                            Terlambat
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          isPaid
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.paidAmount > 0
                            ? 'bg-amber-100 text-amber-800'
                            : isOverdue
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {isPaid ? '✓ Lunas' : item.paidAmount > 0 ? 'Cicil Sebagian' : isOverdue ? 'Lewat Tempo' : 'Belum Lunas'}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!isPaid && (
                            <button
                              type="button"
                              onClick={() => {
                                setDebtForRepayment(item);
                                setIsRepaymentModalOpen(true);
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                              title="Catat Pelunasan atau Potong Gaji"
                            >
                              <DollarSign size={11} /> Bayar / Potong
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStaffDebt(item);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                            title="Lihat Detail Kasbon"
                          >
                            <Eye size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-300">
                      <Wallet size={40} className="mb-2 opacity-30" />
                      <p className="text-xs font-bold uppercase tracking-wider">
                        Tidak ada data kasbon kasir yang sesuai filter
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ) : (
    /* REPAYMENT HISTORY TAB */
    <div className="space-y-6">
      {/* Summary KPI Cards for Repayments */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-emerald-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
              Total Tertagih / Lunas
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 tabular-nums">
            Rp {repaymentStats.totalPaid.toLocaleString()}
          </p>
          <p className="text-[11px] font-bold text-slate-500 mt-1">
            Dari {repaymentStats.count} pembayaran kasbon
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-indigo-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
              Via Potong Gaji
            </span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Receipt size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-indigo-900 tabular-nums">
            Rp {repaymentStats.salaryDeductionTotal.toLocaleString()}
          </p>
          <p className="text-[11px] font-bold text-indigo-600 mt-1">
            Pemotongan gaji payroll langsung
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-blue-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">
              Via Tunai & Non-Tunai
            </span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Wallet size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-blue-900 tabular-nums">
            Rp {(repaymentStats.cashTotal + repaymentStats.digitalTotal).toLocaleString()}
          </p>
          <p className="text-[11px] font-bold text-blue-600 mt-1">
            Masuk ke kas fisik warung / digital
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Total Transaksi Bayar
            </span>
            <div className="p-2 bg-slate-100 text-slate-600 rounded-xl">
              <History size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 tabular-nums">
            {repaymentStats.count} Transaksi
          </p>
          <p className="text-[11px] font-bold text-slate-500 mt-1">
            Catatan cicilan & pelunasan kasir
          </p>
        </div>
      </div>

      {/* Filter Bar for Repayments */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Cari kasir, shift ID, atau catatan..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-2xl border border-slate-200 text-xs font-black self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setHistoryMethodFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl uppercase tracking-wider transition-all cursor-pointer ${
              historyMethodFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Semua Metode
          </button>
          <button
            type="button"
            onClick={() => setHistoryMethodFilter('POTONG_GAJI')}
            className={`px-3 py-1.5 rounded-xl uppercase tracking-wider transition-all cursor-pointer ${
              historyMethodFilter === 'POTONG_GAJI' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Potong Gaji
          </button>
          <button
            type="button"
            onClick={() => setHistoryMethodFilter('CASH')}
            className={`px-3 py-1.5 rounded-xl uppercase tracking-wider transition-all cursor-pointer ${
              historyMethodFilter === 'CASH' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Tunai
          </button>
          <button
            type="button"
            onClick={() => setHistoryMethodFilter('TRANSFER')}
            className={`px-3 py-1.5 rounded-xl uppercase tracking-wider transition-all cursor-pointer ${
              historyMethodFilter === 'TRANSFER' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Transfer / QRIS
          </button>
        </div>
      </div>

      {/* Repayment History Table */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <th className="py-4 px-6">Waktu Pembayaran</th>
                <th className="py-4 px-6">Kasir Yang Membayar</th>
                <th className="py-4 px-6">Terkait Selisih Kasir / Kasbon</th>
                <th className="py-4 px-6 text-right">Nominal Dibayar</th>
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6 text-center">Metode Pembayaran</th>
                <th className="py-4 px-6">Otorisasi</th>
                <th className="py-4 px-6">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.length > 0 ? (
                filteredHistory.map((h) => {
                  const method = h.payment.paymentMethodId;
                  return (
                    <tr key={h.payment.paymentId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-6">
                        <span className="font-bold text-slate-900 block">
                          {format(new Date(h.payment.timestamp), 'dd MMM yyyy HH:mm')}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ID: {h.payment.paymentId.slice(-8).toUpperCase()}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black uppercase">
                            {h.customer.name.replace('Kasir - ', '')[0] || 'K'}
                          </div>
                          <div>
                            <span className="font-black text-slate-900 uppercase block">
                              {h.customer.name}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {h.cashierUser?.role || 'KASIR'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Linked Original Discrepancy Column */}
                      <td className="py-4 px-6">
                        {h.shift ? (
                          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-2 space-y-0.5">
                            <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-900 uppercase">
                              <AlertTriangle size={12} className="text-amber-600" />
                              <span>Shift #{h.shift.shiftId.slice(-6).toUpperCase()}</span>
                              <span className="text-rose-600 font-mono">
                                (-Rp {Math.abs(h.shift.discrepancy || 0).toLocaleString()})
                              </span>
                            </div>
                            <span className="text-[9px] text-slate-500 block">
                              {format(new Date(h.shift.startTime), 'dd/MM/yyyy HH:mm')}
                            </span>
                            {h.shift.discrepancyReason && (
                              <span className="text-[9px] text-slate-600 italic block">
                                "{h.shift.discrepancyReason}"
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-2">
                            <span className="text-[10px] font-black text-blue-900 uppercase flex items-center gap-1">
                              <Wallet size={12} className="text-blue-600" />
                              Pinjaman Kasbon Langsung
                            </span>
                            <span className="text-[9px] text-slate-500 block font-mono">
                              Ref: {h.receivable.transactionId}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="py-4 px-6 text-right font-black text-emerald-600 tabular-nums text-sm">
                        + Rp {h.payment.amount.toLocaleString()}
                      </td>

                      <td className="py-4 px-6 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          h.isFullSettlement
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {h.isFullSettlement ? '✓ Pelunasan Penuh' : 'Cicilan Parsial'}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-center">
                        {method === 'POTONG_GAJI' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-[10px] font-black uppercase">
                            <Receipt size={11} className="text-indigo-600" />
                            Potong Gaji
                          </span>
                        ) : method === 'CASH' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-black uppercase">
                            <Wallet size={11} className="text-emerald-600" />
                            Tunai ({h.payment.moneyStorageId})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-black uppercase">
                            <CreditCard size={11} className="text-blue-600" />
                            Transfer / QRIS
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <span className="font-bold text-slate-700 block">
                          {h.recorderName}
                        </span>
                        <span className="text-[9px] text-slate-400 uppercase font-black">
                          Owner / Otorisator
                        </span>
                      </td>

                      <td className="py-4 px-6 text-slate-600 font-medium text-[11px] max-w-xs">
                        {h.payment.notes || '-'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-300">
                      <History size={40} className="mb-2 opacity-30" />
                      <p className="text-xs font-bold uppercase tracking-wider">
                        Belum ada riwayat pembayaran atau pemotongan gaji kasir
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )}

      {/* Modal: Catat Kasbon / Bebankan Selisih */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[400] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-6">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-200">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">
                    Catat Kasbon / Bebankan Selisih Kasir
                  </h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Pencatatan resmi tanggung jawab kasbon & pemotongan kasir
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitCreateKasbon} className="py-4 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-2">
                  <AlertTriangle size={14} />
                  <span>{formError}</span>
                </div>
              )}

              {/* Source Type Selector */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1.5">
                  Sumber Tanggungan Kasbon *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormSourceType('SHIFT_DISCREPANCY');
                    }}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                      formSourceType === 'SHIFT_DISCREPANCY'
                        ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase text-indigo-700 flex items-center gap-1.5">
                      <AlertTriangle size={13} /> Selisih Kas Laci Shift
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium mt-1">
                      Bebankan defisit uang laci kasir saat clock out
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormSourceType('DIRECT_CASH_ADVANCE');
                      setFormShiftId('');
                    }}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                      formSourceType === 'DIRECT_CASH_ADVANCE'
                        ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase text-indigo-700 flex items-center gap-1.5">
                      <Wallet size={13} /> Pinjaman Kasbon Langsung
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium mt-1">
                      Uang tunai diambil dari laci warung
                    </span>
                  </button>
                </div>
              </div>

              {/* Cashier Selector */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                  Pilih Kasir Bertanggung Jawab *
                </label>
                <select
                  required
                  value={formCashierId}
                  onChange={(e) => setFormCashierId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Pilih Kasir / Karyawan --</option>
                  {cashierUsers.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.name} ({u.role}) - ID: {u.userId.slice(-6).toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {/* If Shift Discrepancy, option to select shift if not prefilled */}
              {formSourceType === 'SHIFT_DISCREPANCY' && unassignedShiftDiscrepancies && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                    Hubungkan ke Sesi Shift (Opsional)
                  </label>
                  <select
                    value={formShiftId}
                    onChange={(e) => {
                      const sid = e.target.value;
                      setFormShiftId(sid);
                      const target = unassignedShiftDiscrepancies.find((s: any) => s.shiftId === sid);
                      if (target) {
                        setFormAmount(Math.abs(target.discrepancy || 0));
                        setFormCashierId(target.userId);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Hubungkan dengan Shift Selisih --</option>
                    {unassignedShiftDiscrepancies.map((s: any) => (
                      <option key={s.shiftId} value={s.shiftId}>
                        Shift #{s.shiftId.slice(-6).toUpperCase()} ({s.cashierName}) - Kurang Rp {Math.abs(s.discrepancy || 0).toLocaleString()} ({format(new Date(s.startTime), 'dd/MM HH:mm')})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Amount & Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                    Nominal Kasbon / Tanggungan (Rp) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="0"
                    value={formAmount || ''}
                    onChange={(e) => setFormAmount(Number(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-black text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                    Target Jatuh Tempo / Potong Gaji *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                  Catatan Kesepakatan / Keterangan Kasbon
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Selisih uang kas laci disepakati potong gaji akhir bulan"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Owner PIN Authorization */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-800">
                  <Lock size={14} className="text-indigo-600" />
                  Otorisasi PIN Owner *
                </div>
                <input
                  type="password"
                  maxLength={6}
                  required
                  placeholder="Masukkan 6-digit PIN Owner"
                  value={formOwnerPin}
                  onChange={(e) => setFormOwnerPin(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 tracking-widest text-center"
                />
                <p className="text-[10px] text-slate-400 text-center">
                  Hanya Owner toko yang berwenang mencatat dan membebankan kasbon kasir.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-rose-200 flex items-center gap-1.5 transition-all"
                >
                  {isSubmitting ? 'Menyimpan...' : '✓ Simpan & Sahkan Kasbon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Detail Kasbon & Riwayat Pembayaran */}
      {isDetailModalOpen && selectedStaffDebt && (
        <div className="fixed inset-0 z-[400] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-6">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">
                    Rincian Kasbon: {selectedStaffDebt.receivable.transactionId}
                  </h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {selectedStaffDebt.customer.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X size={20} />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Total Kasbon</span>
                  <p className="text-base font-black text-slate-900 tabular-nums">
                    Rp {selectedStaffDebt.totalAmount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Sisa Tanggungan</span>
                  <p className="text-base font-black text-rose-600 tabular-nums">
                    Rp {selectedStaffDebt.remainingAmount.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-bold">Sumber Kasbon:</span>
                  <span className="font-black text-slate-800">
                    {selectedStaffDebt.sourceType === 'SHIFT_DISCREPANCY' ? 'Selisih Kas Laci Shift' : 'Pinjaman Langsung'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-bold">Tanggal Dicatat:</span>
                  <span className="font-black text-slate-800">
                    {format(new Date(selectedStaffDebt.createdAt), 'dd MMMM yyyy HH:mm')}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-bold">Jatuh Tempo (Potong Gaji):</span>
                  <span className="font-black text-slate-800">
                    {format(new Date(selectedStaffDebt.dueDate), 'dd MMMM yyyy')}
                  </span>
                </div>
                {selectedStaffDebt.shift && (
                  <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 space-y-1.5 mt-2">
                    <div className="flex justify-between items-center text-amber-900 font-black text-xs uppercase">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle size={13} className="text-amber-600" />
                        Asal Selisih: Shift #{selectedStaffDebt.shift.shiftId.slice(-6).toUpperCase()}
                      </span>
                      <span className="text-rose-600 font-mono">
                        -Rp {Math.abs(selectedStaffDebt.shift.discrepancy || 0).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 font-medium">
                      Waktu Shift: {format(new Date(selectedStaffDebt.shift.startTime), 'dd MMMM yyyy HH:mm')}
                    </p>
                    {selectedStaffDebt.shift.discrepancyReason && (
                      <p className="text-[10px] text-slate-700 italic bg-white/70 p-2 rounded-xl border border-amber-200/60">
                        Alasan Kasir: "{selectedStaffDebt.shift.discrepancyReason}"
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Riwayat Pembayaran untuk Kasbon Ini */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <History size={13} className="text-indigo-600" />
                    Riwayat Pembayaran Kasbon Ini ({selectedDebtPayments?.length || 0})
                  </h4>
                  <span className="text-[10px] font-bold text-slate-400">
                    Total: Rp {selectedStaffDebt.paidAmount.toLocaleString()}
                  </span>
                </div>

                {(!selectedDebtPayments || selectedDebtPayments.length === 0) ? (
                  <div className="p-3 bg-slate-50 rounded-2xl text-center text-xs text-slate-400 font-medium">
                    Belum ada pembayaran atau cicilan tercatat untuk kasbon ini.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedDebtPayments.map((p) => (
                      <div
                        key={p.paymentId}
                        className="p-2.5 bg-emerald-50/60 border border-emerald-100 rounded-xl text-xs flex justify-between items-start"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-emerald-950">
                              {format(new Date(p.timestamp), 'dd MMM yyyy HH:mm')}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                              p.paymentMethodId === 'POTONG_GAJI'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {p.paymentMethodId === 'POTONG_GAJI' ? 'Potong Gaji' : p.paymentMethodId}
                            </span>
                          </div>
                          {p.notes && (
                            <p className="text-[10px] text-slate-600 mt-0.5 font-medium">
                              {p.notes}
                            </p>
                          )}
                        </div>
                        <span className="font-black text-emerald-700 tabular-nums">
                          + Rp {p.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedStaffDebt.remainingAmount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    setDebtForRepayment(selectedStaffDebt);
                    setIsRepaymentModalOpen(true);
                  }}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-emerald-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <DollarSign size={15} /> Catat Pembayaran / Potong Gaji (Cicilan/Lunas)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Repayment Khusus Kasbon */}
      <KasbonRepaymentModal
        isOpen={isRepaymentModalOpen}
        onClose={() => {
          setIsRepaymentModalOpen(false);
          setDebtForRepayment(null);
        }}
        staffDebt={debtForRepayment}
        onSuccess={() => {
          setRefreshKey(prev => prev + 1);
        }}
      />
    </div>
  );
}
