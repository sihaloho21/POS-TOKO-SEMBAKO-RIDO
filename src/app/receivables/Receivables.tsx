import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { useAuthStore } from '@/core/auth-store';
import { useDeviceId } from '@/core/device-store';
import { useToastStore } from '@/core/toast-store';
import { TransactionEngine } from '@/core/transaction-engine';
import { FinanceService } from '@/core/services/finance-service';
import { AuditEngine } from '@/core/audit-engine';
import { ShiftService } from '@/core/services/shift-service';
import type { Receivable, Customer, Transaction, ReceivablePayment } from '@/core/types';
import { RecordPaymentModal } from './RecordPaymentModal';
import { format, differenceInDays, isPast, parseISO } from 'date-fns';
import {
  CreditCard,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Users,
  Receipt,
  Calendar,
  ArrowUpRight,
  ChevronRight,
  Eye,
  Plus,
  X,
  History,
  Wallet,
  TrendingUp,
  AlertOctagon,
  FileText,
  UserCheck,
  Edit3
} from 'lucide-react';

type ViewMode = 'INVOICES' | 'CUSTOMERS' | 'PAYMENTS';
type StatusFilter = 'ALL' | 'ACTIVE' | 'OPEN' | 'PARTIAL' | 'OVERDUE' | 'PAID';

export default function Receivables() {
  const { currentUser } = useAuthStore();
  const deviceId = useDeviceId();
  const { addToast } = useToastStore();

  const [viewMode, setViewMode] = useState<ViewMode>('INVOICES');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal states
  const [selectedReceivable, setSelectedReceivable] = useState<Receivable | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDueDateModalOpen, setIsDueDateModalOpen] = useState(false);
  const [selectedCustomerForBulk, setSelectedCustomerForBulk] = useState<Customer | null>(null);
  const [isBulkSettleModalOpen, setIsBulkSettleModalOpen] = useState(false);

  // Payment Form States (for Bulk Customer FIFO Settlement)
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [paymentMethodId, setPaymentMethodId] = useState<'CASH' | 'QRIS' | 'TRANSFER'>('CASH');
  const [moneyStorageId, setMoneyStorageId] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL'>('WARUNG');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Due Date Edit State
  const [newDueDate, setNewDueDate] = useState('');
  const [dueDateReason, setDueDateReason] = useState('');

  // Queries
  const receivables = useLiveQuery(
    async () => {
      const list = await db.receivables.toArray();
      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    [refreshKey]
  );
  const customers = useLiveQuery(() => db.customers.toArray(), [refreshKey]);
  const transactions = useLiveQuery(() => db.transactions.toArray(), [refreshKey]);
  const payments = useLiveQuery(() => db.receivablePayments.orderBy('timestamp').reverse().toArray(), [refreshKey]);
  const currentShift = useLiveQuery(
    () => ShiftService.getCurrentShift(deviceId, currentUser?.userId),
    [deviceId, currentUser?.userId]
  );

  // Auto-detect and sync overdue receivables in background
  useEffect(() => {
    if (!receivables) return;
    const now = new Date();
    receivables.forEach(async (r) => {
      if ((r.status === 'OPEN' || r.status === 'PARTIAL') && r.remainingAmount > 0) {
        const due = new Date(r.dueDate);
        if (due < now && differenceInDays(now, due) >= 1) {
          await db.receivables.update(r.receivableId, { status: 'OVERDUE' });
        }
      }
    });
  }, [receivables]);

  // Maps for fast lookup
  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers?.forEach(c => map.set(c.customerId, c));
    return map;
  }, [customers]);

  const transactionMap = useMemo(() => {
    const map = new Map<string, Transaction>();
    transactions?.forEach(t => map.set(t.transactionId, t));
    return map;
  }, [transactions]);

  // Enriched Receivables
  const enrichedReceivables = useMemo(() => {
    if (!receivables) return [];
    const now = new Date();
    return receivables.map(r => {
      const customer = customerMap.get(r.customerId);
      const tx = transactionMap.get(r.transactionId);
      const dueDateObj = new Date(r.dueDate);
      const isOverdue = r.remainingAmount > 0 && dueDateObj < now && differenceInDays(now, dueDateObj) >= 1;
      const effectiveStatus = r.remainingAmount <= 0 ? 'PAID' : isOverdue ? 'OVERDUE' : r.status;
      const daysUntilDue = differenceInDays(dueDateObj, now);

      return {
        ...r,
        effectiveStatus,
        customerName: customer?.name || 'Pelanggan Umum',
        customerPhone: customer?.phone || '-',
        isReseller: customer?.isReseller || false,
        creditLimit: customer?.creditLimit || 0,
        receiptNumber: tx?.receiptNumber || r.transactionId.slice(0, 8).toUpperCase(),
        txItems: tx?.items || [],
        daysUntilDue
      };
    });
  }, [receivables, customerMap, transactionMap]);

  // Summary KPIs & Aging Analysis
  const summary = useMemo(() => {
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let totalCollected = 0;
    let activeCount = 0;
    let overdueCount = 0;

    // Aging buckets
    let agingCurrent = 0; // Not yet due
    let aging1to7 = 0;    // 1 - 7 days overdue
    let aging8to30 = 0;   // 8 - 30 days overdue
    let agingOver30 = 0;  // > 30 days overdue

    const now = new Date();

    enrichedReceivables.forEach(r => {
      totalCollected += Number(r.paidAmount || 0);
      if (r.remainingAmount > 0 && r.effectiveStatus !== 'VOIDED') {
        totalOutstanding += r.remainingAmount;
        activeCount++;

        const overdueDays = differenceInDays(now, new Date(r.dueDate));
        if (overdueDays >= 1) {
          totalOverdue += r.remainingAmount;
          overdueCount++;
          if (overdueDays <= 7) aging1to7 += r.remainingAmount;
          else if (overdueDays <= 30) aging8to30 += r.remainingAmount;
          else agingOver30 += r.remainingAmount;
        } else {
          agingCurrent += r.remainingAmount;
        }
      }
    });

    return {
      totalOutstanding,
      totalOverdue,
      totalCollected,
      activeCount,
      overdueCount,
      agingCurrent,
      aging1to7,
      aging8to30,
      agingOver30
    };
  }, [enrichedReceivables]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return enrichedReceivables.filter(r => {
      if (statusFilter === 'ACTIVE' && (r.remainingAmount <= 0 || r.effectiveStatus === 'PAID' || r.effectiveStatus === 'VOIDED')) {
        return false;
      }
      if (statusFilter !== 'ALL' && statusFilter !== 'ACTIVE' && r.effectiveStatus !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCustomer = r.customerName.toLowerCase().includes(q);
        const matchReceipt = r.receiptNumber.toLowerCase().includes(q);
        const matchPhone = r.customerPhone.toLowerCase().includes(q);
        return matchCustomer || matchReceipt || matchPhone;
      }
      return true;
    });
  }, [enrichedReceivables, statusFilter, searchQuery]);

  // Customer Debt Recap
  const customerDebtRecap = useMemo(() => {
    if (!customers) return [];
    return customers.map(c => {
      const custReceivables = enrichedReceivables.filter(
        r => r.customerId === c.customerId && r.remainingAmount > 0 && r.effectiveStatus !== 'VOIDED'
      );
      const totalDebt = custReceivables.reduce((sum, r) => sum + r.remainingAmount, 0);
      const totalPaid = enrichedReceivables
        .filter(r => r.customerId === c.customerId)
        .reduce((sum, r) => sum + r.paidAmount, 0);
      const overdueCount = custReceivables.filter(r => r.effectiveStatus === 'OVERDUE').length;
      const remainingLimit = c.creditLimit - totalDebt;
      const usagePercent = c.creditLimit > 0 ? (totalDebt / c.creditLimit) * 100 : (totalDebt > 0 ? 100 : 0);

      return {
        customer: c,
        activeInvoicesCount: custReceivables.length,
        totalDebt,
        totalPaid,
        overdueCount,
        remainingLimit,
        usagePercent,
        invoices: custReceivables
      };
    }).filter(item => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.customer.name.toLowerCase().includes(q) || (item.customer.phone || '').includes(q);
      }
      return item.totalDebt > 0 || item.customer.creditLimit > 0 || item.totalPaid > 0;
    }).sort((a, b) => b.totalDebt - a.totalDebt);
  }, [customers, enrichedReceivables, searchQuery]);

  // Handlers
  const openSettleModal = (receivable?: Receivable) => {
    const target = receivable || enrichedReceivables.find(r => r.remainingAmount > 0 && r.effectiveStatus !== 'VOIDED') || null;
    setSelectedReceivable(target);
    setIsPaymentModalOpen(true);
  };

  const openDetailModal = (receivable: Receivable) => {
    setSelectedReceivable(receivable);
    setIsDetailModalOpen(true);
  };

  const openDueDateModal = (receivable: Receivable) => {
    setSelectedReceivable(receivable);
    setNewDueDate(receivable.dueDate.slice(0, 10));
    setDueDateReason('');
    setIsDueDateModalOpen(true);
  };

  const openBulkSettleModal = (customer: Customer, totalDebt: number) => {
    setSelectedCustomerForBulk(customer);
    setPaymentAmount(totalDebt);
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    setPaymentMethodId('CASH');
    setMoneyStorageId('WARUNG');
    setPaymentNotes('');
    setIsBulkSettleModalOpen(true);
  };

  const handleBulkSettleCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerForBulk || !currentUser) return;

    const activeInvoices = enrichedReceivables
      .filter(r => r.customerId === selectedCustomerForBulk.customerId && r.remainingAmount > 0 && r.effectiveStatus !== 'VOIDED')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()); // Oldest due date first (FIFO)

    const totalCustomerDebt = activeInvoices.reduce((s, r) => s + r.remainingAmount, 0);

    if (paymentAmount <= 0 || paymentAmount > totalCustomerDebt) {
      addToast('Nominal pelunasan tidak valid atau melebihi total hutang pelanggan', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      let remainingToAllocate = paymentAmount;
      let settledCount = 0;

      for (const inv of activeInvoices) {
        if (remainingToAllocate <= 0) break;
        const payForThisInvoice = Math.min(remainingToAllocate, inv.remainingAmount);

        await FinanceService.addTransaction({
          userId: currentUser.userId,
          role: currentUser.role,
          deviceId,
          shiftId: currentShift?.shiftId || 'OWNER-DIRECT',
          customerId: selectedCustomerForBulk.customerId,
          receivableId: inv.receivableId,
          referenceId: inv.receivableId,
          referenceType: 'RECEIVABLE_PAYMENT',
          amount: payForThisInvoice,
          storageId: moneyStorageId,
          direction: 'IN',
          paymentMethodId,
          paymentDate,
          notes: paymentNotes
            ? `${paymentNotes} (Kolektif FIFO)`
            : 'Alokasi pelunasan kolektif pelanggan (FIFO)'
        });

        remainingToAllocate -= payForThisInvoice;
        settledCount++;
      }

      addToast(
        `Pembayaran kolektif Rp ${paymentAmount.toLocaleString()} (${settledCount} nota) berhasil dicatat ke Finance Ledger!`,
        'success'
      );
      setRefreshKey(prev => prev + 1);
      setIsBulkSettleModalOpen(false);
      setSelectedCustomerForBulk(null);
    } catch (err: any) {
      addToast(err.message || 'Gagal memproses pelunasan kolektif', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateDueDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReceivable || !currentUser || !newDueDate) return;

    setIsSubmitting(true);
    try {
      const updatedDueDateIso = new Date(newDueDate).toISOString();
      const now = new Date();
      const newStatus = new Date(newDueDate) < now && differenceInDays(now, new Date(newDueDate)) >= 1
        ? 'OVERDUE'
        : selectedReceivable.paidAmount > 0 ? 'PARTIAL' : 'OPEN';

      await db.receivables.update(selectedReceivable.receivableId, {
        dueDate: updatedDueDateIso,
        status: newStatus
      });

      await AuditEngine.log({
        userId: currentUser.userId,
        role: currentUser.role,
        deviceId,
        action: 'UPDATE_RECEIVABLE_DUE_DATE',
        module: 'RECEIVABLES',
        referenceId: selectedReceivable.receivableId,
        before: { dueDate: selectedReceivable.dueDate },
        after: { dueDate: updatedDueDateIso, status: newStatus },
        reason: dueDateReason || 'Penyesuaian tanggal jatuh tempo oleh Owner'
      });

      await db.syncQueue.add({
        entityType: 'receivables',
        entityId: selectedReceivable.receivableId,
        action: 'UPDATE',
        payload: { ...selectedReceivable, dueDate: updatedDueDateIso, status: newStatus },
        status: 'PENDING',
        retryCount: 0,
        createdAt: new Date().toISOString()
      });

      addToast('Tanggal jatuh tempo berhasil diperbarui', 'success');
      setRefreshKey(prev => prev + 1);
      setIsDueDateModalOpen(false);
      setSelectedReceivable(null);
    } catch (err: any) {
      addToast(err.message || 'Gagal mengubah jatuh tempo', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            Manajemen Piutang & Gajian (Receivables)
          </h2>
          <p className="text-slate-500 text-sm font-medium">
            Kelola tagihan kasbon/gajian pelanggan, pembayaran cicilan, umur piutang (aging), dan kontrol limit kredit.
          </p>
        </div>

        {/* View Mode Switcher & Record Payment Action */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => openSettleModal()}
            disabled={summary.activeCount === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-md shadow-emerald-200 transition-all"
          >
            <Plus size={16} />
            <span>Catat Pembayaran (Record Payment)</span>
          </button>

          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-xs">
            <button
              onClick={() => setViewMode('INVOICES')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                viewMode === 'INVOICES'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Receipt size={15} />
              <span>Daftar Nota ({summary.activeCount})</span>
            </button>
            <button
              onClick={() => setViewMode('CUSTOMERS')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                viewMode === 'CUSTOMERS'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Users size={15} />
              <span>Per Pelanggan</span>
            </button>
            <button
              onClick={() => setViewMode('PAYMENTS')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                viewMode === 'PAYMENTS'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <History size={15} />
              <span>Riwayat Cicilan</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Total Piutang Aktif
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <CreditCard size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 tabular-nums">
            Rp {summary.totalOutstanding.toLocaleString()}
          </p>
          <p className="text-[11px] font-bold text-amber-600 mt-1">
            Dari {summary.activeCount} nota belum lunas
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-rose-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-500">
              Jatuh Tempo (Overdue)
            </span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <AlertTriangle size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 tabular-nums">
            Rp {summary.totalOverdue.toLocaleString()}
          </p>
          <p className="text-[11px] font-bold text-rose-500 mt-1">
            {summary.overdueCount} nota melewati batas waktu
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-emerald-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
              Total Tertagih (Lunas/Cicil)
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 tabular-nums">
            Rp {summary.totalCollected.toLocaleString()}
          </p>
          <p className="text-[11px] font-bold text-slate-400 mt-1">
            Masuk ke buku kas Finance Ledger
          </p>
        </div>

        <div className="bg-slate-900 p-5 rounded-3xl text-white shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Rasio Kolektibilitas
            </span>
            <div className="p-2 bg-white/10 text-blue-400 rounded-xl">
              <TrendingUp size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-blue-400 tabular-nums">
            {summary.totalOutstanding + summary.totalCollected > 0
              ? `${((summary.totalCollected / (summary.totalOutstanding + summary.totalCollected)) * 100).toFixed(1)}%`
              : '100%'}
          </p>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            Persentase pelunasan piutang
          </p>
        </div>
      </div>

      {/* Aging Analysis Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-blue-600" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
              Analisis Umur Piutang (Receivable Aging Schedule)
            </h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Klasifikasi Risiko Keterlambatan
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-emerald-50/60 border border-emerald-100 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block">
              Belum Jatuh Tempo (Current)
            </span>
            <span className="text-base font-black text-emerald-800 tabular-nums mt-0.5 block">
              Rp {summary.agingCurrent.toLocaleString()}
            </span>
          </div>

          <div className="p-3.5 bg-amber-50/70 border border-amber-100 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 block">
              Menunggak 1 - 7 Hari
            </span>
            <span className="text-base font-black text-amber-800 tabular-nums mt-0.5 block">
              Rp {summary.aging1to7.toLocaleString()}
            </span>
          </div>

          <div className="p-3.5 bg-orange-50/70 border border-orange-100 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-orange-700 block">
              Menunggak 8 - 30 Hari
            </span>
            <span className="text-base font-black text-orange-800 tabular-nums mt-0.5 block">
              Rp {summary.aging8to30.toLocaleString()}
            </span>
          </div>

          <div className="p-3.5 bg-rose-50/70 border border-rose-100 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 block">
              Macet &gt; 30 Hari
            </span>
            <span className="text-base font-black text-rose-800 tabular-nums mt-0.5 block">
              Rp {summary.agingOver30.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Box */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Toolbar: Filters & Search */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {viewMode === 'INVOICES' ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Filter size={15} className="text-slate-400 mr-1" />
              {(
                [
                  { id: 'ACTIVE', label: 'Belum Lunas' },
                  { id: 'ALL', label: 'Semua' },
                  { id: 'OVERDUE', label: 'Jatuh Tempo' },
                  { id: 'PARTIAL', label: 'Cicilan (Partial)' },
                  { id: 'OPEN', label: 'Baru (Open)' },
                  { id: 'PAID', label: 'Lunas (Paid)' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                    statusFilter === tab.id
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-2">
              {viewMode === 'CUSTOMERS' ? (
                <>
                  <Users size={16} className="text-blue-600" />
                  <span>Rekapitulasi Piutang & Sisa Limit Pelanggan</span>
                </>
              ) : (
                <>
                  <History size={16} className="text-emerald-600" />
                  <span>Log Pembayaran Cicilan & Pelunasan Piutang</span>
                </>
              )}
            </div>
          )}

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Cari nama pelanggan, no struk, HP..."
              value={searchQuery ?? ''}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
            />
          </div>
        </div>

        {/* TAB 1: INVOICES LIST */}
        {viewMode === 'INVOICES' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/60 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                  <th className="px-6 py-4">No. Nota & Tanggal</th>
                  <th className="px-6 py-4">Pelanggan</th>
                  <th className="px-6 py-4">Total Tagihan</th>
                  <th className="px-6 py-4">Sudah Dibayar</th>
                  <th className="px-6 py-4">Sisa Piutang</th>
                  <th className="px-6 py-4">Jatuh Tempo</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <CreditCard size={40} className="mb-3 opacity-30" />
                        <p className="text-xs font-black uppercase tracking-widest">
                          Tidak ada data piutang ditemukan
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Transaksi dengan tipe Gajian di POS akan otomatis tercatat di sini.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => (
                    <tr key={inv.receivableId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono font-black text-xs text-slate-900 block">
                          {inv.receiptNumber}
                        </span>
                        <span className="text-[11px] font-medium text-slate-400">
                          {format(new Date(inv.createdAt), 'dd MMM yyyy HH:mm')}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 font-black text-xs flex items-center justify-center shrink-0">
                            {inv.customerName[0]}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900 uppercase">
                                {inv.customerName}
                              </span>
                              {inv.isReseller && (
                                <span className="text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded uppercase">
                                  Reseller
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 font-medium block">
                              {inv.customerPhone}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-bold text-slate-700 tabular-nums">
                          Rp {inv.totalAmount.toLocaleString()}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-bold text-emerald-600 tabular-nums">
                          Rp {inv.paidAmount.toLocaleString()}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-black tabular-nums ${inv.remainingAmount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          Rp {inv.remainingAmount.toLocaleString()}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-700 tabular-nums">
                            {format(new Date(inv.dueDate), 'dd MMM yyyy')}
                          </span>
                          {inv.remainingAmount > 0 && (
                            <button
                              onClick={() => openDueDateModal(inv)}
                              className="p-1 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all"
                              title="Ubah Tanggal Jatuh Tempo"
                            >
                              <Edit3 size={13} />
                            </button>
                          )}
                        </div>
                        {inv.remainingAmount > 0 && (
                          <span
                            className={`text-[10px] font-bold block ${
                              inv.daysUntilDue < 0
                                ? 'text-rose-600'
                                : inv.daysUntilDue <= 3
                                ? 'text-amber-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {inv.daysUntilDue < 0
                              ? `Terlambat ${Math.abs(inv.daysUntilDue)} hari`
                              : inv.daysUntilDue === 0
                              ? 'Jatuh tempo hari ini'
                              : `${inv.daysUntilDue} hari lagi`}
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border ${
                            inv.effectiveStatus === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : inv.effectiveStatus === 'OVERDUE'
                              ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                              : inv.effectiveStatus === 'PARTIAL'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {inv.effectiveStatus === 'PAID'
                            ? 'LUNAS'
                            : inv.effectiveStatus === 'OVERDUE'
                            ? 'MENUNGGAK'
                            : inv.effectiveStatus === 'PARTIAL'
                            ? 'CICILAN'
                            : 'TERBUKA'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openDetailModal(inv)}
                            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            title="Lihat Rincian Barang & Riwayat Cicilan"
                          >
                            <Eye size={16} />
                          </button>

                          {inv.remainingAmount > 0 && inv.effectiveStatus !== 'VOIDED' && (
                            <button
                              onClick={() => openSettleModal(inv)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-[10px] uppercase tracking-wider shadow-sm shadow-blue-200 transition-all flex items-center gap-1"
                            >
                              <DollarSign size={13} />
                              <span>Bayar</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: CUSTOMERS RECAP */}
        {viewMode === 'CUSTOMERS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/60 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                  <th className="px-6 py-4">Pelanggan</th>
                  <th className="px-6 py-4">Nota Aktif</th>
                  <th className="px-6 py-4">Total Hutang</th>
                  <th className="px-6 py-4">Batas Limit Kredit</th>
                  <th className="px-6 py-4">Penggunaan Limit</th>
                  <th className="px-6 py-4 text-right">Aksi Pelunasan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customerDebtRecap.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-400 text-xs font-bold uppercase">
                      Belum ada data piutang pelanggan
                    </td>
                  </tr>
                ) : (
                  customerDebtRecap.map((item) => (
                    <tr key={item.customer.customerId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 font-black text-xs flex items-center justify-center">
                            {item.customer.name[0]}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900 uppercase">
                                {item.customer.name}
                              </span>
                              {item.customer.isReseller && (
                                <span className="text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded uppercase">
                                  Reseller
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {item.customer.phone || 'Tanpa No. HP'} • Jatuh tempo default: {item.customer.defaultDueDateDays || 30} hr
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-800">
                            {item.activeInvoicesCount} Nota
                          </span>
                          {item.overdueCount > 0 && (
                            <span className="text-[9px] font-black bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full uppercase">
                              {item.overdueCount} Menunggak
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className={`text-sm font-black tabular-nums ${item.totalDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          Rp {item.totalDebt.toLocaleString()}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-slate-700 tabular-nums block">
                          Rp {item.customer.creditLimit.toLocaleString()}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                          Sisa: Rp {Math.max(0, item.remainingLimit).toLocaleString()}
                        </span>
                      </td>

                      <td className="px-6 py-4 w-56">
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-black">
                            <span className={item.usagePercent > 90 ? 'text-rose-600' : 'text-slate-500'}>
                              {item.usagePercent.toFixed(0)}% Terpakai
                            </span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                item.usagePercent > 90
                                  ? 'bg-rose-500'
                                  : item.usagePercent > 65
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, item.usagePercent)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                        {item.totalDebt > 0 ? (
                          <button
                            onClick={() => openBulkSettleModal(item.customer, item.totalDebt)}
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-wider shadow-sm shadow-emerald-200 transition-all inline-flex items-center gap-1.5"
                          >
                            <Wallet size={14} />
                            <span>Bayar Kolektif (FIFO)</span>
                          </button>
                        ) : (
                          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase">
                            Bebas Hutang
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: PAYMENTS HISTORY */}
        {viewMode === 'PAYMENTS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/60 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                  <th className="px-6 py-4">Waktu Pembayaran</th>
                  <th className="px-6 py-4">Pelanggan & No. Nota</th>
                  <th className="px-6 py-4">Metode Bayar</th>
                  <th className="px-6 py-4">Penyimpanan Kas</th>
                  <th className="px-6 py-4">Nominal Masuk</th>
                  <th className="px-6 py-4">Diterima Oleh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!payments || payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-400 text-xs font-bold uppercase">
                      Belum ada riwayat pembayaran cicilan atau pelunasan piutang
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => {
                    const rec = enrichedReceivables.find(r => r.receivableId === p.receivableId);
                    return (
                      <tr key={p.paymentId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-xs font-bold text-slate-700 tabular-nums block">
                            {format(new Date(p.timestamp), 'dd MMM yyyy HH:mm')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-slate-900 uppercase block">
                            {rec?.customerName || 'Pelanggan'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 block">
                            Nota: {rec?.receiptNumber || p.receivableId.slice(0, 8)}
                          </span>
                          {p.notes && (
                            <span className="text-[10px] text-slate-500 italic block mt-0.5">
                              "{p.notes}"
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-black px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg uppercase">
                            {p.paymentMethodId}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-black px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg uppercase inline-flex items-center gap-1">
                            <Wallet size={11} />
                            KAS {p.moneyStorageId.replace('_', ' ')} (IN)
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-black text-emerald-600 tabular-nums flex items-center gap-1">
                            <ArrowUpRight size={14} />
                            Rp {p.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-slate-500 uppercase">
                            {p.userId}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: REUSABLE RECORD PAYMENT MODAL */}
      <RecordPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setSelectedReceivable(null);
        }}
        initialReceivable={
          selectedReceivable
            ? enrichedReceivables.find(r => r.receivableId === selectedReceivable.receivableId) || null
            : null
        }
        availableReceivables={enrichedReceivables}
        shiftId={currentShift?.shiftId}
        onSuccess={() => {
          setRefreshKey(prev => prev + 1);
          setIsPaymentModalOpen(false);
          setSelectedReceivable(null);
        }}
      />

      {/* MODAL 2: BULK CUSTOMER FIFO SETTLEMENT */}
      {isBulkSettleModalOpen && selectedCustomerForBulk && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Wallet size={18} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                    Pelunasan Kolektif Pelanggan
                  </h3>
                  <span className="text-[11px] font-bold text-emerald-600">
                    {selectedCustomerForBulk.name} (Alokasi Otomatis FIFO)
                  </span>
                </div>
              </div>
              <button onClick={() => setIsBulkSettleModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBulkSettleCustomer} className="space-y-4">
              <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl text-xs text-blue-900">
                Pembayaran kolektif akan otomatis melunasi nota piutang dengan <strong>tanggal jatuh tempo paling lama (FIFO)</strong> terlebih dahulu.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-7">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1.5">
                    Nominal Diterima (Rp) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={paymentAmount || ''}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-lg font-black text-emerald-600 tabular-nums outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="sm:col-span-5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1.5">
                    Tanggal Bayar *
                  </label>
                  <input
                    type="date"
                    required
                    max={format(new Date(), 'yyyy-MM-dd')}
                    value={paymentDate ?? ''}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Metode Bayar
                  </label>
                  <select
                    value={paymentMethodId ?? 'CASH'}
                    onChange={(e) => {
                      const val = e.target.value as 'CASH' | 'QRIS' | 'TRANSFER';
                      setPaymentMethodId(val);
                      if (val === 'QRIS' || val === 'TRANSFER') setMoneyStorageId('UANG_DIGITAL');
                      else setMoneyStorageId('WARUNG');
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
                  >
                    <option value="CASH">TUNAI (CASH)</option>
                    <option value="TRANSFER">TRANSFER BANK</option>
                    <option value="QRIS">QRIS</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Buku Kas (Finance Ledger)
                  </label>
                  <select
                    value={moneyStorageId ?? 'WARUNG'}
                    onChange={(e) => setMoneyStorageId(e.target.value as 'WARUNG' | 'IKAN' | 'UANG_DIGITAL')}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
                  >
                    <option value="WARUNG">KAS WARUNG</option>
                    <option value="IKAN">KAS IKAN</option>
                    <option value="UANG_DIGITAL">UANG DIGITAL</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Catatan Pembayaran (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pelunasan gajian bulanan..."
                  value={paymentNotes ?? ''}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBulkSettleModalOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || paymentAmount <= 0}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-200 disabled:opacity-50 transition-all"
                >
                  {isSubmitting ? 'Memproses...' : 'Konfirmasi Pelunasan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: INVOICE DETAIL & PAYMENT HISTORY */}
      {isDetailModalOpen && selectedReceivable && (() => {
        const inv = enrichedReceivables.find(r => r.receivableId === selectedReceivable.receivableId);
        const invPayments = payments?.filter(p => p.receivableId === selectedReceivable.receivableId) || [];
        if (!inv) return null;

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4 shrink-0">
                <div>
                  <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">
                    Detail Nota Piutang #{inv.receiptNumber}
                  </h3>
                  <span className="text-xs font-bold text-blue-600 uppercase">
                    {inv.customerName} • {format(new Date(inv.createdAt), 'dd MMM yyyy HH:mm')}
                  </span>
                </div>
                <button onClick={() => setIsDetailModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto pr-1 custom-scrollbar flex-1">
                {/* Item Belanja */}
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Item Transaksi Gajian ({inv.txItems.length})
                  </h4>
                  <div className="space-y-1.5">
                    {inv.txItems.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Rincian item tidak ditemukan.</p>
                    ) : (
                      inv.txItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs">
                          <div>
                            <span className="font-bold text-slate-800 block">{item.nameSnapshot}</span>
                            <span className="text-[10px] text-slate-500">
                              {item.quantity} {item.unit} @ Rp {item.netPrice.toLocaleString()}
                            </span>
                          </div>
                          <span className="font-black text-slate-900 tabular-nums">
                            Rp {item.subtotal.toLocaleString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Riwayat Pembayaran Cicilan Nota Ini */}
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Riwayat Pembayaran Cicilan ({invPayments.length})
                  </h4>
                  {invPayments.length === 0 ? (
                    <div className="p-4 bg-slate-50 rounded-2xl text-center text-xs text-slate-400 font-medium">
                      Belum ada pembayaran untuk nota ini.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {invPayments.map((p) => (
                        <div key={p.paymentId} className="flex justify-between items-center p-2.5 bg-emerald-50/60 border border-emerald-100 rounded-xl text-xs">
                          <div>
                            <span className="font-bold text-emerald-900 block">
                              {format(new Date(p.timestamp), 'dd MMM yyyy HH:mm')}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700 uppercase">
                              {p.paymentMethodId} • Kas {p.moneyStorageId}
                            </span>
                          </div>
                          <span className="font-black text-emerald-700 tabular-nums">
                            + Rp {p.amount.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 mt-4 shrink-0 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block">Sisa Tagihan</span>
                  <span className="text-lg font-black text-rose-600 tabular-nums">
                    Rp {inv.remainingAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsDetailModalOpen(false)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider"
                  >
                    Tutup
                  </button>
                  {inv.remainingAmount > 0 && (
                    <button
                      onClick={() => {
                        setIsDetailModalOpen(false);
                        openSettleModal(selectedReceivable);
                      }}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-blue-200"
                    >
                      Bayar Sekarang
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 4: EDIT DUE DATE */}
      {isDueDateModalOpen && selectedReceivable && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-blue-600" />
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                  Atur Jatuh Tempo Piutang
                </h3>
              </div>
              <button onClick={() => setIsDueDateModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateDueDate} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Tanggal Jatuh Tempo Baru *
                </label>
                <input
                  type="date"
                  required
                  value={newDueDate ?? ''}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Alasan Perubahan (Audit Log)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Kesepakatan mundur jadwal gajian"
                  value={dueDateReason ?? ''}
                  onChange={(e) => setDueDateReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDueDateModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs uppercase text-slate-500 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newDueDate}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-blue-200"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
