import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { ShiftService } from '@/core/services/shift-service';
import { DiscrepancyNotificationService } from '@/core/services/discrepancy-notification-service';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';
import type { CashierShift } from '@/core/types';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Clock, 
  User, 
  Smartphone, 
  Banknote, 
  FileSearch, 
  ShieldCheck, 
  Receipt, 
  CreditCard, 
  TrendingUp, 
  MinusCircle, 
  PlusCircle, 
  Bell, 
  BellRing, 
  X, 
  ChevronRight,
  Filter,
  AlertOctagon
} from 'lucide-react';
import { format } from 'date-fns';

interface ShiftApprovalWorkflowProps {
  highlightShiftId?: string;
}

export function ShiftApprovalWorkflow({ highlightShiftId }: ShiftApprovalWorkflowProps) {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const isOwner = currentUser?.role === 'OWNER';

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'INVESTIGATION_REQUESTED' | 'APPROVED'>('ALL');
  
  // Investigation Modal State
  const [investigatingShift, setInvestigatingShift] = useState<CashierShift | null>(null);
  const [investigationNotes, setInvestigationNotes] = useState('');
  const [isSubmittingInvestigation, setIsSubmittingInvestigation] = useState(false);

  // Approval Modal State
  const [approvingShift, setApprovingShift] = useState<CashierShift | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  // Browser Notification Permission State
  const [notificationPerm, setNotificationPerm] = useState<NotificationPermission | 'unsupported'>(
    DiscrepancyNotificationService.getPermissionStatus()
  );

  // Fetch all closed shifts with discrepancy !== 0
  const discrepancyShifts = useLiveQuery(async () => {
    try {
      const list = await db.shifts
        .where('status')
        .equals('CLOSED')
        .filter(s => Boolean(s.discrepancy && s.discrepancy !== 0))
        .toArray();

      // Sort newest first
      return list.sort((a, b) => new Date(b.endTime || b.startTime).getTime() - new Date(a.endTime || a.startTime).getTime());
    } catch (err) {
      console.warn('discrepancyShifts query warning:', err);
      return [];
    }
  }, [], []);

  const handleEnableNotification = async () => {
    const res = await DiscrepancyNotificationService.requestBrowserPermission();
    setNotificationPerm(res);
    if (res === 'granted') {
      addToast('Notifikasi browser aktif untuk deteksi selisih kasir!', 'success');
    } else {
      addToast('Izin notifikasi browser belum diberikan oleh peramban.', 'warning');
    }
  };

  const handleApprove = async () => {
    if (!approvingShift || !currentUser) return;
    setIsSubmittingApproval(true);
    try {
      await ShiftService.approveShiftDiscrepancy({
        shiftId: approvingShift.shiftId,
        ownerUserId: currentUser.userId,
        ownerName: currentUser.name,
        notes: approvalNotes.trim()
      });

      addToast(`Selisih shift ${approvingShift.shiftId.slice(-6).toUpperCase()} berhasil disetujui!`, 'success');
      setApprovingShift(null);
      setApprovalNotes('');
    } catch (err: any) {
      addToast(err.message || 'Gagal menyetujui selisih shift.', 'error');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleRequestInvestigation = async () => {
    if (!investigatingShift || !currentUser) return;
    if (!investigationNotes.trim()) {
      addToast('Catatan / Instruksi investigasi wajib diisi.', 'error');
      return;
    }

    setIsSubmittingInvestigation(true);
    try {
      await ShiftService.requestManualInvestigation({
        shiftId: investigatingShift.shiftId,
        ownerUserId: currentUser.userId,
        ownerName: currentUser.name,
        investigationNotes: investigationNotes.trim()
      });

      addToast(`Investigasi manual untuk shift ${investigatingShift.shiftId.slice(-6).toUpperCase()} telah diajukan!`, 'warning');
      setInvestigatingShift(null);
      setInvestigationNotes('');
    } catch (err: any) {
      addToast(err.message || 'Gagal mengajukan investigasi.', 'error');
    } finally {
      setIsSubmittingInvestigation(false);
    }
  };

  const filteredShifts = discrepancyShifts?.filter((shift) => {
    // Status filter
    const status = shift.discrepancyApprovalStatus || 'PENDING';
    if (filterStatus !== 'ALL' && status !== filterStatus) {
      return false;
    }

    // Search filter
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const idMatch = shift.shiftId.toLowerCase().includes(q);
    const userMatch = shift.userId.toLowerCase().includes(q);
    const deviceMatch = shift.deviceId.toLowerCase().includes(q);
    const reasonMatch = (shift.discrepancyReason || '').toLowerCase().includes(q);
    const notesMatch = (shift.investigationNotes || '').toLowerCase().includes(q);

    return idMatch || userMatch || deviceMatch || reasonMatch || notesMatch;
  });

  const pendingCount = discrepancyShifts?.filter(s => (s.discrepancyApprovalStatus || 'PENDING') === 'PENDING').length || 0;
  const investigationCount = discrepancyShifts?.filter(s => s.discrepancyApprovalStatus === 'INVESTIGATION_REQUESTED').length || 0;

  return (
    <div className="space-y-6">
      {/* Top Banner & Browser Notification Status */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <ShieldCheck size={20} />
            </span>
            <h3 className="text-xl font-black uppercase tracking-tight">
              Shift Reconciliation Approval Workflow
            </h3>
          </div>
          <p className="text-xs text-slate-300 max-w-xl font-medium leading-relaxed">
            Pusat tinjauan resmi bagi Owner untuk menyetujui selisih kas fisik laci atau menginstruksikan investigasi manual (audit fisik/CCTV) sebelum rekonsiliasi dibukukan.
          </p>
        </div>

        {/* Browser Notification Switcher */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          {notificationPerm === 'granted' ? (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-950/80 border border-emerald-500/40 rounded-2xl text-emerald-400 text-xs font-bold shadow-inner">
              <BellRing size={16} />
              <span>Notifikasi Browser Aktif</span>
            </div>
          ) : (
            <button
              onClick={handleEnableNotification}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              <Bell size={16} />
              <span>Aktifkan Notifikasi Browser</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-amber-50/70 border border-amber-200 p-5 rounded-2xl">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">
              Menunggu Review Owner
            </span>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <p className="text-2xl font-black text-amber-950 tabular-nums">{pendingCount}</p>
          <span className="text-[10px] font-bold text-amber-600">Shift dengan selisih belum diapprove</span>
        </div>

        <div className="bg-rose-50/70 border border-rose-200 p-5 rounded-2xl">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-700">
              Investigasi Manual Aktif
            </span>
            <FileSearch size={14} className="text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-950 tabular-nums">{investigationCount}</p>
          <span className="text-[10px] font-bold text-rose-600">Menunggu audit fisik atau klarifikasi kasir</span>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200 p-5 rounded-2xl">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
              Total Riwayat Selisih
            </span>
            <CheckCircle2 size={14} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-950 tabular-nums">{discrepancyShifts?.length || 0}</p>
          <span className="text-[10px] font-bold text-emerald-600">Total seluruh shift dengan selisih</span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Cari ID shift, nama kasir, alasan selisih..."
            value={search ?? ''}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Filter size={12} /> Status:
          </span>
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1 text-[11px] font-bold">
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`px-3 py-1 rounded-lg transition-all ${
                filterStatus === 'ALL' ? 'bg-white text-slate-900 shadow-xs font-black' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setFilterStatus('PENDING')}
              className={`px-3 py-1 rounded-lg transition-all ${
                filterStatus === 'PENDING' ? 'bg-amber-500 text-white shadow-xs font-black' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => setFilterStatus('INVESTIGATION_REQUESTED')}
              className={`px-3 py-1 rounded-lg transition-all ${
                filterStatus === 'INVESTIGATION_REQUESTED' ? 'bg-rose-500 text-white shadow-xs font-black' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Investigasi ({investigationCount})
            </button>
            <button
              onClick={() => setFilterStatus('APPROVED')}
              className={`px-3 py-1 rounded-lg transition-all ${
                filterStatus === 'APPROVED' ? 'bg-emerald-600 text-white shadow-xs font-black' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Disetujui
            </button>
          </div>
        </div>
      </div>

      {/* Shifts Discrepancies List */}
      <div className="space-y-4">
        {filteredShifts?.length === 0 ? (
          <div className="py-20 bg-white rounded-3xl border border-slate-200 text-center text-slate-300">
            <CheckCircle2 size={48} className="mx-auto mb-4 opacity-20 text-emerald-500" />
            <p className="text-sm font-bold uppercase tracking-widest text-slate-400">
              Tidak ada selisih kasir yang memerlukan tindakan
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Semua shift kasir dalam kondisi klop atau sudah selesai direview oleh Owner.
            </p>
          </div>
        ) : (
          filteredShifts?.map((shift) => {
            const status = shift.discrepancyApprovalStatus || 'PENDING';
            const discrepancy = shift.discrepancy || 0;
            const isHighlighted = highlightShiftId === shift.shiftId;

            return (
              <div
                key={shift.shiftId}
                className={`bg-white rounded-3xl border p-6 shadow-sm hover:shadow-md transition-all flex flex-col lg:flex-row gap-6 ${
                  isHighlighted ? 'ring-2 ring-blue-500 border-blue-300' : 'border-slate-200'
                } ${
                  status === 'PENDING' 
                    ? 'border-l-4 border-l-amber-500' 
                    : status === 'INVESTIGATION_REQUESTED'
                    ? 'border-l-4 border-l-rose-500 bg-rose-50/10'
                    : 'border-l-4 border-l-emerald-500'
                }`}
              >
                {/* Main Shift Details */}
                <div className="flex-1 space-y-4">
                  {/* Status & ID Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 ${
                        status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : status === 'INVESTIGATION_REQUESTED'
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {status === 'PENDING' && <AlertTriangle size={12} />}
                        {status === 'INVESTIGATION_REQUESTED' && <FileSearch size={12} />}
                        {status === 'APPROVED' && <CheckCircle2 size={12} />}
                        {status === 'PENDING' ? 'Menunggu Approval' : status === 'INVESTIGATION_REQUESTED' ? 'Investigasi Manual Diminta' : 'Disetujui Owner'}
                      </span>

                      <span className="text-xs font-mono font-bold text-slate-400">
                        ID: {shift.shiftId.slice(-8).toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                      <Clock size={14} className="text-slate-400" />
                      <span>{format(new Date(shift.startTime), 'dd/MM/yyyy HH:mm')}</span>
                      <span>—</span>
                      <span>{shift.endTime ? format(new Date(shift.endTime), 'HH:mm') : 'Masih Buka'}</span>
                    </div>
                  </div>

                  {/* Header Highlight: Discrepancy Amount & Reason */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        Alasan Kasir (Reason):
                      </span>
                      <p className="text-sm font-black text-slate-800">
                        "{shift.discrepancyReason || 'Kasir tidak menyertakan alasan spesifik.'}"
                      </p>
                    </div>

                    <div className="text-left md:text-right shrink-0">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        Nominal Selisih:
                      </span>
                      <p className={`text-xl font-black tabular-nums ${
                        discrepancy > 0 ? 'text-blue-600' : 'text-rose-600'
                      }`}>
                        {discrepancy > 0 ? '+Rp ' : '-Rp '}{Math.abs(discrepancy).toLocaleString()}
                        <span className="text-[10px] font-bold uppercase ml-1 tracking-wider">
                          ({discrepancy > 0 ? 'Surplus' : 'Defisit'})
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Operational & Financial Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                        Kasir / User
                      </span>
                      <div className="flex items-center gap-1 text-xs font-bold text-slate-800 truncate">
                        <User size={13} className="text-slate-400 shrink-0" />
                        <span className="truncate">{shift.userId}</span>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                        Perangkat Terminal
                      </span>
                      <div className="flex items-center gap-1 text-xs font-bold text-slate-800 uppercase">
                        <Smartphone size={13} className="text-slate-400 shrink-0" />
                        <span>{shift.deviceId}</span>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                        Expected Cash (Sistem)
                      </span>
                      <p className="text-xs font-black text-slate-900 tabular-nums">
                        Rp {(shift.expectedCash || 0).toLocaleString()}
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                        Actual Cash (Laci Kasir)
                      </span>
                      <p className="text-xs font-black text-slate-900 tabular-nums">
                        Rp {(shift.actualCash || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Payment Breakdown Pills */}
                  {shift.paymentBreakdown && (
                    <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-100">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1.5 flex items-center gap-1">
                        <CreditCard size={11} /> Rincian Metode Pembayaran:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(shift.paymentBreakdown).map(([method, amt]) => (
                          <div key={method} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold">
                            <span className="text-slate-400 uppercase mr-1">{method}:</span>
                            <span className="text-slate-800 font-mono">Rp {Number(amt).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Investigation Notes Display if present */}
                  {shift.investigationNotes && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                      <div className="flex items-center gap-1.5 text-rose-800 text-xs font-black uppercase tracking-wider">
                        <FileSearch size={14} />
                        <span>Instruksi Investigasi Owner:</span>
                      </div>
                      <p className="text-xs font-semibold text-rose-900 leading-relaxed">
                        {shift.investigationNotes}
                      </p>
                      {shift.investigationRequestedBy && (
                        <p className="text-[9px] text-rose-500 font-bold">
                          Oleh {shift.investigationRequestedBy} pada {shift.investigationRequestedAt ? format(new Date(shift.investigationRequestedAt), 'dd/MM/yyyy HH:mm') : ''}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Approval Record if already approved */}
                  {status === 'APPROVED' && shift.discrepancyApprovedBy && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>
                        Telah disetujui oleh <strong>{shift.discrepancyApprovedBy}</strong> pada{' '}
                        {shift.discrepancyApprovedAt ? format(new Date(shift.discrepancyApprovedAt), 'dd/MM/yyyy HH:mm') : '-'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Owner Actions Column */}
                <div className="lg:w-56 flex flex-col justify-center gap-2.5 shrink-0 border-t lg:border-t-0 lg:border-l border-slate-100 pt-4 lg:pt-0 lg:pl-6">
                  {status === 'APPROVED' ? (
                    <div className="w-full py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-center font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5">
                      <CheckCircle2 size={14} />
                      <span>Rekonsiliasi Selesai</span>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setApprovingShift(shift)}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CheckCircle2 size={16} />
                        <span>Setujui Selisih</span>
                      </button>

                      <button
                        onClick={() => {
                          setInvestigatingShift(shift);
                          setInvestigationNotes(shift.investigationNotes || '');
                        }}
                        className="w-full py-3 bg-white hover:bg-rose-50 text-rose-600 border border-rose-300 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <FileSearch size={16} />
                        <span>Minta Investigasi</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Approve Confirmation Modal */}
      {approvingShift && (
        <div className="fixed inset-0 z-[280] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                    Setujui Selisih Kasir
                  </h4>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                    Shift {approvingShift.shiftId.slice(-6).toUpperCase()} • Kasir: {approvingShift.userId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setApprovingShift(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                Nominal Selisih Disetujui:
              </span>
              <p className="text-xl font-black text-emerald-900 tabular-nums">
                {(approvingShift.discrepancy || 0) > 0 ? '+Rp ' : '-Rp '}
                {Math.abs(approvingShift.discrepancy || 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-emerald-700 font-medium">
                Alasan kasir: "{approvingShift.discrepancyReason || '-'}"
              </p>
            </div>

            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                Catatan Persetujuan Owner (Opsional)
              </label>
              <textarea
                rows={2}
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Contoh: Selisih diterima, selisih receh wajar operasional..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setApprovingShift(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase tracking-wider transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSubmittingApproval}
                onClick={handleApprove}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 size={16} />
                <span>{isSubmittingApproval ? 'Memproses...' : 'Konfirmasi Setuju'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Investigation Modal */}
      {investigatingShift && (
        <div className="fixed inset-0 z-[280] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
                  <FileSearch size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                    Minta Investigasi Manual
                  </h4>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                    Shift {investigatingShift.shiftId.slice(-6).toUpperCase()} • Kasir: {investigatingShift.userId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInvestigatingShift(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-800">
                Selisih Perlu Diaudit:
              </span>
              <p className="text-xl font-black text-rose-900 tabular-nums">
                {(investigatingShift.discrepancy || 0) > 0 ? '+Rp ' : '-Rp '}
                {Math.abs(investigatingShift.discrepancy || 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-rose-700 font-medium">
                Alasan kasir: "{investigatingShift.discrepancyReason || '-'}"
              </p>
            </div>

            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 block mb-1">
                Instruksi Audit / Catatan Investigasi (Wajib) *
              </label>
              <textarea
                rows={3}
                required
                value={investigationNotes}
                onChange={(e) => setInvestigationNotes(e.target.value)}
                placeholder="Contoh: Cek rekaman CCTV pukul 14:00 - 15:00, hitung ulang fisik brankas bersama supervisor toko..."
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-rose-500 resize-none shadow-xs"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setInvestigatingShift(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase tracking-wider transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSubmittingInvestigation}
                onClick={handleRequestInvestigation}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-rose-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <FileSearch size={16} />
                <span>{isSubmittingInvestigation ? 'Mengirim...' : 'Kirim Instruksi Audit'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
