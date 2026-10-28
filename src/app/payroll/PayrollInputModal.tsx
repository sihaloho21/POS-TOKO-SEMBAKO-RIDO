import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  X, 
  Plus, 
  Trash2, 
  Calendar, 
  DollarSign, 
  AlertCircle, 
  Coins, 
  Sparkles, 
  UserPlus, 
  Building2,
  Info
} from 'lucide-react';
import { db } from '@/core/database';
import { PayrollService } from '@/core/services/payroll-service';
import { useToastStore } from '@/core/toast-store';
import type { PayrollBonusItem, PayrollPaymentMethod, BonusCategory } from '@/core/types';

interface PayrollInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  deviceId?: string;
  onSuccess?: () => void;
}

const MONTH_OPTIONS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

export function PayrollInputModal({
  isOpen,
  onClose,
  currentUserId,
  deviceId,
  onSuccess
}: PayrollInputModalProps) {
  const { addToast } = useToastStore();

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const todayIso = currentDate.toISOString().split('T')[0];

  // Form states
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [customEmployeeName, setCustomEmployeeName] = useState<string>('');
  const [isManualEmployee, setIsManualEmployee] = useState(false);

  const [periodMonth, setPeriodMonth] = useState<number>(currentMonth);
  const [periodYear, setPeriodYear] = useState<number>(currentYear);
  const [paymentDate, setPaymentDate] = useState<string>(todayIso);

  const [baseSalary, setBaseSalary] = useState<string>('');
  const [deductions, setDeductions] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<PayrollPaymentMethod>('CASH_WARUNG');
  const [notes, setNotes] = useState<string>('');

  // Bonuses state
  const [bonuses, setBonuses] = useState<Array<{
    categoryId: string;
    categoryName: string;
    amount: string;
    notes: string;
  }>>([]);

  // Historical / Backdated state
  const [isBackdated, setIsBackdated] = useState(false);
  const [affectCashBalance, setAffectCashBalance] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const activeCategories = useLiveQuery(async () => {
    return await PayrollService.getActiveBonusCategories();
  }, []);

  const registeredUsers = useLiveQuery(async () => {
    return await PayrollService.getRegisteredStaff();
  }, []);

  // When month or year is earlier than current period, prompt backdated recommendation
  useEffect(() => {
    const isEarlier = periodYear < currentYear || (periodYear === currentYear && periodMonth < currentMonth);
    if (isEarlier) {
      setIsBackdated(true);
      setAffectCashBalance(false); // default don't affect cash for past records!
    }
  }, [periodMonth, periodYear, currentYear, currentMonth]);

  if (!isOpen) return null;

  const handleAddBonusRow = () => {
    const firstCat = activeCategories?.[0];
    setBonuses(prev => [
      ...prev,
      {
        categoryId: firstCat ? firstCat.id : 'custom',
        categoryName: firstCat ? firstCat.name : 'Bonus Khusus',
        amount: '',
        notes: ''
      }
    ]);
  };

  const handleUpdateBonus = (index: number, field: string, value: any) => {
    setBonuses(prev => {
      const copy = [...prev];
      if (field === 'categoryId') {
        const cat = activeCategories?.find(c => c.id === value);
        copy[index] = {
          ...copy[index],
          categoryId: value,
          categoryName: cat ? cat.name : 'Bonus Khusus'
        };
      } else {
        copy[index] = {
          ...copy[index],
          [field]: value
        };
      }
      return copy;
    });
  };

  const handleRemoveBonus = (index: number) => {
    setBonuses(prev => prev.filter((_, i) => i !== index));
  };

  // Computations
  const numBaseSalary = Number(baseSalary.replace(/\D/g, '')) || 0;
  const numDeductions = Number(deductions.replace(/\D/g, '')) || 0;
  const numTotalBonus = bonuses.reduce((acc, b) => acc + (Number(b.amount.replace(/\D/g, '')) || 0), 0);
  const totalTakeHomePay = Math.max(0, numBaseSalary + numTotalBonus - numDeductions);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let employeeName = '';
    let employeeId: string | undefined = undefined;

    if (isManualEmployee) {
      if (!customEmployeeName.trim()) {
        addToast('Nama karyawan harus diisi', 'warning');
        return;
      }
      employeeName = customEmployeeName.trim();
    } else {
      if (!selectedStaffId) {
        addToast('Silakan pilih salah satu karyawan', 'warning');
        return;
      }
      const staff = registeredUsers?.find(u => u.id === selectedStaffId);
      employeeName = staff ? staff.name : 'Karyawan';
      employeeId = selectedStaffId;
    }

    if (numBaseSalary <= 0 && numTotalBonus <= 0) {
      addToast('Gaji Pokok atau Bonus harus memiliki nominal yang valid', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const formattedBonuses: PayrollBonusItem[] = bonuses.map(b => ({
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        amount: Number(b.amount.replace(/\D/g, '')) || 0,
        notes: b.notes.trim() || undefined
      })).filter(b => b.amount > 0);

      await PayrollService.createPayroll({
        employeeId,
        employeeName,
        periodMonth,
        periodYear,
        paymentDate,
        baseSalary: numBaseSalary,
        bonuses: formattedBonuses,
        deductions: numDeductions,
        paymentMethod,
        notes,
        isBackdated,
        affectCashBalance: Boolean(affectCashBalance),
        currentUserId,
        deviceId
      });

      addToast(
        isBackdated 
          ? `Histori penggajian ${employeeName} periode ${periodMonth}/${periodYear} berhasil disimpan!`
          : `Gaji ${employeeName} berhasil diproses dan disimpan!`,
        'success'
      );

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || 'Gagal menyimpan data penggajian', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
              <Coins size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                Form Input Gaji & Bonus Karyawan
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Khusus Owner • Tentukan gaji pokok, rincian bonus & histori masa lalu
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Section 1: Karyawan */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider">
                1. Pilih Karyawan
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsManualEmployee(!isManualEmployee);
                  setSelectedStaffId('');
                  setCustomEmployeeName('');
                }}
                className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"
              >
                {isManualEmployee ? 'Pilih dari Daftar Pengguna Toko' : '+ Input Manual Nama Karyawan (Non-Akun)'}
              </button>
            </div>

            {isManualEmployee ? (
              <div>
                <input
                  type="text"
                  placeholder="Ketik nama karyawan (misal: Pak Joko - Pekerja Lepas)"
                  value={customEmployeeName}
                  onChange={(e) => setCustomEmployeeName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            ) : (
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">-- Pilih Karyawan Terdaftar --</option>
                {registeredUsers?.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Section 2: Periode & Tanggal Bayar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50/70 border border-slate-200/60 rounded-2xl">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Bulan Periode
              </label>
              <select
                value={periodMonth}
                onChange={(e) => setPeriodMonth(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
              >
                {MONTH_OPTIONS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Tahun Periode
              </label>
              <select
                value={periodYear}
                onChange={(e) => setPeriodYear(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
              >
                {[2023, 2024, 2025, 2026, 2027, 2028].map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Tanggal Pembayaran
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
              />
            </div>
          </div>

          {/* Section 3: Gaji Pokok (Manual oleh Owner) */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>2. Gaji Pokok (Ditentukan Manual oleh Owner)</span>
              <span className="text-[11px] text-slate-400 font-semibold">Nominal Rupiah</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-xs text-slate-400">Rp</span>
              <input
                type="text"
                placeholder="0"
                value={numBaseSalary > 0 ? numBaseSalary.toLocaleString('id-ID') : baseSalary}
                onChange={(e) => setBaseSalary(e.target.value.replace(/\D/g, ''))}
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-black text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 tabular-nums"
              />
            </div>
          </div>

          {/* Section 4: Rincian Bonus Dinamis */}
          <div className="space-y-3 p-4 bg-blue-50/40 border border-blue-200/50 rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={16} className="text-blue-600" />
                  3. Rincian Bonus & Insentif Kinerja
                </span>
                <p className="text-[10px] text-blue-600/80 font-medium">
                  Kebersihan, Penjualan Ikan, Penjualan Digital, Disiplin, Lembur, dll.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddBonusRow}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-xs"
              >
                <Plus size={15} /> Tambah Bonus
              </button>
            </div>

            {bonuses.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-400 italic bg-white/60 rounded-xl border border-dashed border-slate-200">
                Belum ada bonus ditambahkan. Klik tombol "+ Tambah Bonus" jika karyawan menerima insentif.
              </div>
            ) : (
              <div className="space-y-2.5">
                {bonuses.map((bonus, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center bg-white p-2.5 rounded-xl border border-blue-100 shadow-xs">
                    {/* Category Dropdown */}
                    <select
                      value={bonus.categoryId}
                      onChange={(e) => handleUpdateBonus(idx, 'categoryId', e.target.value)}
                      className="w-full sm:w-48 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                    >
                      {activeCategories?.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>

                    {/* Amount Input */}
                    <div className="relative w-full sm:w-36">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-black text-slate-400">Rp</span>
                      <input
                        type="text"
                        placeholder="0"
                        value={Number(bonus.amount.replace(/\D/g, '') || 0) > 0 ? Number(bonus.amount.replace(/\D/g, '')).toLocaleString('id-ID') : bonus.amount}
                        onChange={(e) => handleUpdateBonus(idx, 'amount', e.target.value.replace(/\D/g, ''))}
                        className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-black text-blue-700 tabular-nums"
                      />
                    </div>

                    {/* Note input */}
                    <input
                      type="text"
                      placeholder="Catatan bonus (opsional)"
                      value={bonus.notes}
                      onChange={(e) => handleUpdateBonus(idx, 'notes', e.target.value)}
                      className="w-full sm:flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 placeholder:text-slate-400"
                    />

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveBonus(idx)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                      title="Hapus baris bonus ini"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 5: Potongan & Metode Pembayaran */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                Potongan / Kasbon (Jika Ada)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">Rp</span>
                <input
                  type="text"
                  placeholder="0"
                  value={numDeductions > 0 ? numDeductions.toLocaleString('id-ID') : deductions}
                  onChange={(e) => setDeductions(e.target.value.replace(/\D/g, ''))}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-rose-600 tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                Metode Pembayaran
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PayrollPaymentMethod)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
              >
                <option value="CASH_WARUNG">Tunai (Kas Warung)</option>
                <option value="CASH_IKAN">Tunai (Kas Ikan)</option>
                <option value="TRANSFER">Transfer Bank</option>
                <option value="DIGITAL">Saldo Uang Digital</option>
              </select>
            </div>
          </div>

          {/* Section 6: Opsi Histori Lampau & Dampak Saldo Kas */}
          <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-amber-900 font-black text-xs uppercase tracking-wider">
              <Info size={17} className="text-amber-600 shrink-0" />
              Opsi Pencatatan Histori & Pengaruh Saldo Kas
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isBackdated}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsBackdated(checked);
                    if (checked) {
                      setAffectCashBalance(false);
                    }
                  }}
                  className="mt-0.5 rounded-sm border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800">
                    Tandai sebagai Histori Gaji Masa Lalu (Backdated Entry)
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Gunakan untuk menginput rekap gaji bulan-bulan sebelumnya sebagai arsip data.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={affectCashBalance}
                  onChange={(e) => setAffectCashBalance(e.target.checked)}
                  className="mt-0.5 rounded-sm border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800">
                    Catat pengeluaran ke Kas Toko Sekarang (Finance Event)
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Jika dicentang, saldo kas toko saat ini akan dipotong sebesar total gaji.
                    <strong className="text-amber-800 block">
                      Rekomendasi untuk data lampau: JANGAN dicentang agar saldo kas laci/brankas hari ini tidak berkurang!
                    </strong>
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Section 7: Catatan Tambahan */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              Catatan Tambahan (Opsional)
            </label>
            <textarea
              rows={2}
              placeholder="Tambahkan catatan khusus penggajian jika ada..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Total Calculation Card */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Gaji Pokok:</span>
              <span className="font-semibold">Rp {numBaseSalary.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between text-xs text-blue-400">
              <span>Total Bonus ({bonuses.length} item):</span>
              <span className="font-semibold">+ Rp {numTotalBonus.toLocaleString('id-ID')}</span>
            </div>
            {numDeductions > 0 && (
              <div className="flex justify-between text-xs text-rose-400">
                <span>Potongan / Kasbon:</span>
                <span className="font-semibold">- Rp {numDeductions.toLocaleString('id-ID')}</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Total Gaji Diterima (Take Home Pay)
                </span>
                <span className="text-xs font-bold text-emerald-400">
                  {isBackdated ? 'Arsip Histori Lampau' : 'Penggajian Berjalan'}
                </span>
              </div>
              <span className="text-xl font-black text-emerald-400 tabular-nums">
                Rp {totalTakeHomePay.toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-200 disabled:opacity-50"
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan Data Gaji'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
