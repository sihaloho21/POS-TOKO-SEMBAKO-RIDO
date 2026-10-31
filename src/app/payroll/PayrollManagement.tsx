import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Banknote, 
  Plus, 
  Printer, 
  Trash2, 
  Search, 
  Filter, 
  Coins, 
  Sparkles, 
  Calendar, 
  ShieldAlert, 
  History, 
  Tag, 
  CreditCard,
  Building,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { db } from '@/core/database';
import { useAuthStore } from '@/core/auth-store';
import { useDeviceId } from '@/core/device-store';
import { useToastStore } from '@/core/toast-store';
import { PayrollService } from '@/core/services/payroll-service';
import { PayrollInputModal } from './PayrollInputModal';
import { BonusCategoryModal } from './BonusCategoryModal';
import { PayrollSlipModal } from './PayrollSlipModal';
import type { PayrollRecord } from '@/core/types';
import { useFirestoreCollection } from '@/core/firestore-realtime';

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function PayrollManagement({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { currentUser } = useAuthStore();
  const deviceId = useDeviceId();
  const { addToast } = useToastStore();

  // Modals state
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedSlipRecord, setSelectedSlipRecord] = useState<PayrollRecord | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState<number | 'ALL'>('ALL');
  const [filterYear, setFilterYear] = useState<number | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'REGULAR' | 'BACKDATED'>('ALL');

  // Real-Time Cloud Firestore Listener + Local Dexie Fallback
  const { data: cloudPayrolls, loading: cloudLoading } = useFirestoreCollection<PayrollRecord>('payrolls');
  const localPayrolls = useLiveQuery(async () => {
    return await db.payrolls.reverse().sortBy('paymentDate');
  }, []);

  const allRecords = React.useMemo(() => {
    const list = (cloudPayrolls && cloudPayrolls.length > 0) ? cloudPayrolls : (localPayrolls || []);
    return [...list].sort((a, b) => {
      const dateA = a.paymentDate || a.createdAt || '';
      const dateB = b.paymentDate || b.createdAt || '';
      return dateB.localeCompare(dateA);
    });
  }, [cloudPayrolls, localPayrolls]);

  // Ensure default bonus categories in Cloud Firestore on mount
  React.useEffect(() => {
    PayrollService.ensureDefaultBonusCategories().catch(() => {});
  }, []);

  // Strict Owner Access Guard
  if (currentUser?.role !== 'OWNER') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center bg-white rounded-3xl border border-slate-200 shadow-xs">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mb-4 shadow-sm">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">
          Akses Terbatas: Khusus Pemilik Toko (Owner)
        </h2>
        <p className="text-slate-500 text-sm max-w-md mb-6 font-medium">
          Halaman Penggajian Karyawan & Bonus bersifat rahasia dan hanya dapat diakses oleh akun dengan wewenang Owner.
        </p>
        <button
          onClick={() => onNavigate?.('pos')}
          className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
        >
          Kembali ke Menu Utama
        </button>
      </div>
    );
  }

  // Filter records
  const filteredRecords = (allRecords || []).filter(record => {
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = record.employeeName.toLowerCase().includes(q);
      const matchNotes = (record.notes || '').toLowerCase().includes(q);
      const matchBonus = record.bonuses.some(b => b.categoryName.toLowerCase().includes(q));
      if (!matchName && !matchNotes && !matchBonus) return false;
    }

    // Filter month
    if (filterMonth !== 'ALL' && record.periodMonth !== filterMonth) {
      return false;
    }

    // Filter year
    if (filterYear !== 'ALL' && record.periodYear !== filterYear) {
      return false;
    }

    // Filter type (Regular vs Backdated)
    if (filterType === 'REGULAR' && record.isBackdated) return false;
    if (filterType === 'BACKDATED' && !record.isBackdated) return false;

    return true;
  });

  // Calculate summary metrics on filtered results
  const totalPayrollAmount = filteredRecords.reduce((sum, r) => sum + r.totalAmount, 0);
  const totalBaseSalary = filteredRecords.reduce((sum, r) => sum + r.baseSalary, 0);
  const totalBonusAmount = filteredRecords.reduce((sum, r) => sum + r.totalBonus, 0);
  const backdatedCount = filteredRecords.filter(r => r.isBackdated).length;
  const regularCount = filteredRecords.filter(r => !r.isBackdated).length;

  const handleDeleteRecord = async (record: PayrollRecord) => {
    if (!confirm(`Hapus catatan penggajian ${record.employeeName} untuk periode ${MONTH_NAMES[record.periodMonth - 1]} ${record.periodYear}?`)) {
      return;
    }

    try {
      await PayrollService.deletePayroll(record.id);
      addToast(`Catatan penggajian ${record.employeeName} berhasil dihapus`, 'success');
    } catch (err: any) {
      addToast('Gagal menghapus data: ' + (err?.message || ''), 'error');
    }
  };

  const formatRupiah = (val: number) => {
    return 'Rp ' + (Number(val) || 0).toLocaleString('id-ID');
  };

  const methodBadge: Record<string, string> = {
    CASH_WARUNG: 'Tunai Warung',
    CASH_IKAN: 'Tunai Ikan',
    TRANSFER: 'Transfer Bank',
    DIGITAL: 'Uang Digital'
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 rounded-lg">
              Owner Exclusive
            </span>
            <span className="text-xs text-slate-400 font-bold">•</span>
            <span className="text-xs text-slate-500 font-semibold">Toko Sembako Riama</span>
            <span className="text-xs text-slate-400 font-bold">•</span>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Cloud Realtime
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            Penggajian Karyawan & Bonus
          </h2>
          <p className="text-slate-500 text-sm font-medium">
            Kelola gaji pokok manual, bonus performa (ikan, digital, kebersihan, lembur), & arsip histori lampau.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all shadow-xs"
          >
            <Tag size={16} /> Kelola Kategori Bonus
          </button>
          <button
            onClick={() => setIsInputModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-200"
          >
            <Plus size={16} /> + Input Gaji Karyawan
          </button>
        </div>
      </div>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Payroll */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Total Beban Gaji
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Banknote size={18} />
            </div>
          </div>
          <p className="text-xl font-black text-slate-900 tabular-nums">
            {formatRupiah(totalPayrollAmount)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">
            {filteredRecords.length} transaksi penggajian
          </p>
        </div>

        {/* Total Base Salary */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Total Gaji Pokok
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Coins size={18} />
            </div>
          </div>
          <p className="text-xl font-black text-slate-900 tabular-nums">
            {formatRupiah(totalBaseSalary)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">
            Ditentukan manual oleh Owner
          </p>
        </div>

        {/* Total Bonuses */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Total Bonus Diberikan
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Sparkles size={18} />
            </div>
          </div>
          <p className="text-xl font-black text-purple-700 tabular-nums">
            {formatRupiah(totalBonusAmount)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">
            Insentif performa & lembur
          </p>
        </div>

        {/* Historical vs Regular */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Rekap Catatan
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <History size={18} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-emerald-700">
              {regularCount} Reguler
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-sm font-black text-amber-700">
              {backdatedCount} Lampau
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">
            Arsip lengkap histori masa lalu
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama karyawan, jenis bonus, atau catatan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Month */}
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800"
            >
              <option value="ALL">Semua Bulan</option>
              {MONTH_NAMES.map((m, idx) => (
                <option key={idx} value={idx + 1}>{m}</option>
              ))}
            </select>

            {/* Filter Year */}
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800"
            >
              <option value="ALL">Semua Tahun</option>
              {[2023, 2024, 2025, 2026, 2027].map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>

            {/* Filter Type */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800"
            >
              <option value="ALL">Semua Tipe Catatan</option>
              <option value="REGULAR">Penggajian Reguler Saja</option>
              <option value="BACKDATED">Histori Masa Lalu Saja</option>
            </select>
          </div>
        </div>
      </div>

      {/* Payroll Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
              <Banknote size={26} />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              Tidak Ada Catatan Penggajian
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
              Belum ada data gaji yang sesuai dengan filter atau kata kunci pencarian Anda.
            </p>
            <button
              onClick={() => setIsInputModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shadow-xs"
            >
              <Plus size={15} /> + Input Gaji Sekarang
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Tgl Bayar</th>
                  <th className="py-3.5 px-4">Karyawan</th>
                  <th className="py-3.5 px-4">Periode</th>
                  <th className="py-3.5 px-4">Gaji Pokok</th>
                  <th className="py-3.5 px-4">Rincian Bonus</th>
                  <th className="py-3.5 px-4">Total Diterima</th>
                  <th className="py-3.5 px-4">Metode & Kas</th>
                  <th className="py-3.5 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredRecords.map((record) => {
                  const periodText = `${MONTH_NAMES[record.periodMonth - 1] || record.periodMonth} ${record.periodYear}`;

                  return (
                    <tr key={record.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Tanggal Bayar */}
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        {record.paymentDate}
                      </td>

                      {/* Karyawan & Badge Tipe */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-slate-900 uppercase">
                            {record.employeeName}
                          </span>
                          <div className="flex items-center gap-1 mt-0.5">
                            {record.isBackdated ? (
                              <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 rounded border border-amber-200">
                                Histori Lampau
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                                Reguler
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Periode */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                          {periodText}
                        </span>
                      </td>

                      {/* Gaji Pokok */}
                      <td className="py-3.5 px-4 font-bold text-slate-800 tabular-nums whitespace-nowrap">
                        {formatRupiah(record.baseSalary)}
                      </td>

                      {/* Rincian Bonus */}
                      <td className="py-3.5 px-4">
                        {record.bonuses && record.bonuses.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {record.bonuses.map((b, idx) => (
                              <span 
                                key={idx}
                                title={b.notes ? `${b.categoryName}: ${formatRupiah(b.amount)} (${b.notes})` : `${b.categoryName}: ${formatRupiah(b.amount)}`}
                                className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[10px] font-bold border border-blue-200"
                              >
                                {b.categoryName}: {formatRupiah(b.amount)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Tanpa Bonus</span>
                        )}
                      </td>

                      {/* Total Diterima */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-black text-emerald-700 text-sm tabular-nums">
                          {formatRupiah(record.totalAmount)}
                        </span>
                        {record.deductions > 0 && (
                          <span className="text-[10px] text-rose-500 block">
                            (Potongan: -{formatRupiah(record.deductions)})
                          </span>
                        )}
                      </td>

                      {/* Metode Bayar & Status Kas */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <span className="text-xs font-semibold text-slate-700 block">
                            {methodBadge[record.paymentMethod] || record.paymentMethod}
                          </span>
                          {record.affectCashBalance ? (
                            <span className="inline-block text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                              ✓ Potong Saldo Kas
                            </span>
                          ) : (
                            <span className="inline-block text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              • Arsip Saja
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Aksi */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedSlipRecord(record)}
                            title="Lihat & Cetak Slip Gaji"
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
                          >
                            <Printer size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRecord(record)}
                            title="Hapus Catatan"
                            className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 transition-colors"
                          >
                            <Trash2 size={15} />
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

      {/* Input Modal */}
      <PayrollInputModal
        isOpen={isInputModalOpen}
        onClose={() => setIsInputModalOpen(false)}
        currentUserId={currentUser?.userId || 'owner-1'}
        deviceId={deviceId}
      />

      {/* Category Manager Modal */}
      <BonusCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
      />

      {/* Slip Modal */}
      <PayrollSlipModal
        isOpen={Boolean(selectedSlipRecord)}
        onClose={() => setSelectedSlipRecord(null)}
        record={selectedSlipRecord}
      />
    </div>
  );
}
