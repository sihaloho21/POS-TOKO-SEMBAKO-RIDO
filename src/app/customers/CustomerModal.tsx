import React, { useState, useEffect } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Customer, LoyaltySettingsConfig } from '@/core/types';
import { 
  X, 
  User, 
  Phone, 
  MapPin, 
  CreditCard, 
  Save, 
  Loader2, 
  Trash2, 
  Trophy, 
  Award, 
  Sparkles, 
  CheckCircle2, 
  ShieldCheck, 
  Coins 
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useToastStore } from '@/core/toast-store';
import { LoyaltyEngine, CustomerLoyaltyStats } from '@/core/loyalty-engine';

interface CustomerModalProps {
  customer?: Customer;
  onClose: () => void;
}

const TIER_THEME: Record<string, {
  badge: string;
  bg: string;
  border: string;
  text: string;
  bar: string;
  accent: string;
}> = {
  BRONZE: {
    badge: 'bg-amber-100 text-amber-900 border-amber-300',
    bg: 'from-amber-700 via-amber-800 to-amber-950',
    border: 'border-amber-600/40',
    text: 'text-amber-100',
    bar: 'bg-gradient-to-r from-amber-400 to-amber-200',
    accent: 'text-amber-400'
  },
  SILVER: {
    badge: 'bg-slate-100 text-slate-800 border-slate-300',
    bg: 'from-slate-500 via-slate-600 to-slate-800',
    border: 'border-slate-300/40',
    text: 'text-slate-100',
    bar: 'bg-gradient-to-r from-slate-200 to-white',
    accent: 'text-slate-200'
  },
  GOLD: {
    badge: 'bg-amber-100 text-amber-900 border-yellow-400',
    bg: 'from-amber-400 via-yellow-500 to-yellow-700',
    border: 'border-yellow-300/60',
    text: 'text-yellow-950',
    bar: 'bg-gradient-to-r from-yellow-200 to-white',
    accent: 'text-yellow-200'
  },
  PLATINUM: {
    badge: 'bg-purple-100 text-purple-900 border-purple-300',
    bg: 'from-purple-700 via-indigo-800 to-slate-900',
    border: 'border-purple-400/40',
    text: 'text-purple-100',
    bar: 'bg-gradient-to-r from-purple-300 to-indigo-200',
    accent: 'text-purple-300'
  },
  EMERALD: {
    badge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    bg: 'from-emerald-600 via-teal-700 to-emerald-950',
    border: 'border-emerald-400/40',
    text: 'text-emerald-100',
    bar: 'bg-gradient-to-r from-emerald-300 to-teal-100',
    accent: 'text-emerald-300'
  },
  BLUE: {
    badge: 'bg-blue-100 text-blue-900 border-blue-300',
    bg: 'from-blue-600 via-indigo-700 to-blue-950',
    border: 'border-blue-400/40',
    text: 'text-blue-100',
    bar: 'bg-gradient-to-r from-sky-300 to-blue-200',
    accent: 'text-sky-300'
  },
  ROSE: {
    badge: 'bg-rose-100 text-rose-900 border-rose-300',
    bg: 'from-rose-600 via-pink-700 to-rose-950',
    border: 'border-rose-400/40',
    text: 'text-rose-100',
    bar: 'bg-gradient-to-r from-rose-300 to-pink-200',
    accent: 'text-rose-300'
  }
};

export function CustomerModal({ customer, onClose }: CustomerModalProps) {
  const { addToast } = useToastStore();
  const loyaltyConfig = useLiveQuery(() => db.settings.get('loyalty')) as LoyaltySettingsConfig | undefined;
  const [stats, setStats] = useState<CustomerLoyaltyStats | null>(null);

  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    address: '',
    isReseller: false,
    creditLimit: 1000000,
    defaultDueDateDays: 30,
    status: 'ACTIVE'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (customer) {
      setFormData(customer);
      if (customer.customerId) {
        LoyaltyEngine.getCustomerStats(customer.customerId).then(setStats);
      }
    }
  }, [customer]);

  const handleDelete = async () => {
    if (!customer?.customerId) return;
    setIsDeleting(true);
    try {
      const unpaidReceivables = await db.receivables
        .where('customerId')
        .equals(customer.customerId)
        .filter(r => r.status !== 'PAID' && (r.remainingAmount || 0) > 0)
        .count();

      if (unpaidReceivables > 0) {
        addToast(`Tidak dapat menghapus ${customer.name} karena masih memiliki ${unpaidReceivables} tagihan piutang belum lunas.`, 'error');
        setConfirmDelete(false);
        return;
      }

      const timestamp = new Date().toISOString();
      await db.customers.delete(customer.customerId);
      await db.syncQueue.add({
        entityType: 'customers',
        entityId: customer.customerId,
        action: 'DELETE',
        payload: { customerId: customer.customerId },
        status: 'PENDING',
        retryCount: 0,
        createdAt: timestamp
      });

      addToast(`Pelanggan "${customer.name}" berhasil dihapus.`, 'success');
      onClose();
    } catch (error) {
      console.error('Failed to delete customer:', error);
      addToast('Gagal menghapus data pelanggan.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name) return;
    setIsSaving(true);
    try {
      const timestamp = new Date().toISOString();
      const customerId = formData.customerId || uuidv4();
      const finalData: Customer = {
        ...(formData as Customer),
        customerId,
        loyaltyPoints: formData.loyaltyPoints || 0,
        createdAt: formData.createdAt || timestamp,
        updatedAt: timestamp
      };

      await db.customers.put(finalData);
      
      await db.syncQueue.add({
        entityType: 'customers',
        entityId: customerId,
        action: formData.customerId ? 'UPDATE' : 'CREATE',
        payload: finalData,
        status: 'PENDING',
        retryCount: 0,
        createdAt: timestamp
      });

      addToast(formData.customerId ? 'Data pelanggan berhasil diperbarui.' : 'Pelanggan baru berhasil ditambahkan.', 'success');
      onClose();
    } catch (error) {
      console.error('Failed to save customer:', error);
      addToast('Gagal menyimpan data pelanggan.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <User size={20} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 uppercase tracking-tight">{customer ? 'Edit Pelanggan' : 'Tambah Pelanggan'}</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Informasi member & limit kredit</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Lengkap</label>
            <input 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.name || ''}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Masukkan nama pelanggan..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nomor HP</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.phone || ''}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="0812..."
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Member</label>
              <div className="flex gap-2">
                <button 
                  onClick={() => setFormData({ ...formData, isReseller: !formData.isReseller })}
                  className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all ${
                    formData.isReseller ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-400 border-slate-200'
                  }`}
                >
                  Reseller
                </button>
                <button 
                  onClick={() => setFormData({ ...formData, status: formData.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
                  className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all ${
                    formData.status === 'ACTIVE' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-rose-500 text-white border-rose-500'
                  }`}
                >
                  {formData.status}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alamat</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 text-slate-400" size={16} />
              <textarea 
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                value={formData.address || ''}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                placeholder="Alamat lengkap..."
              />
            </div>
          </div>

          <div className="p-6 bg-slate-900 rounded-3xl space-y-4">
            <div className="flex items-center gap-2 text-white">
              <CreditCard size={18} className="text-blue-400" />
              <h4 className="text-xs font-black uppercase tracking-widest">Pengaturan Kredit</h4>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Limit Kredit (IDR)</label>
                <input 
                  type="number"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl font-black text-white outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                  value={formData.creditLimit ?? 0}
                  onChange={e => setFormData({ ...formData, creditLimit: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Termin Jatuh Tempo (Hari)</label>
                <input 
                  type="number"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl font-black text-white outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                  value={formData.defaultDueDateDays ?? 30}
                  onChange={e => setFormData({ ...formData, defaultDueDateDays: Number(e.target.value) })}
                />
              </div>

              {/* 2 Tipe Skema Tempo Gajian */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                  Skema Tempo Gajian
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    (formData.gajianTempoType || 'TANGGAL_6_7') === 'TANGGAL_6_7'
                      ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}>
                    <input
                      type="radio"
                      name="gajianTempoType"
                      value="TANGGAL_6_7"
                      checked={(formData.gajianTempoType || 'TANGGAL_6_7') === 'TANGGAL_6_7'}
                      onChange={() => setFormData({ ...formData, gajianTempoType: 'TANGGAL_6_7' })}
                      className="mt-1 text-blue-500"
                    />
                    <div className="space-y-1 text-xs">
                      <div className="font-bold flex items-center gap-2">
                        <span>1. Tanggal 6-7 Setiap Bulan (Default)</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Jatuh tempo otomatis di tanggal 6 atau 7 setiap bulannya sesuai siklus gajian bulanan.
                      </p>
                      {(formData.gajianTempoType || 'TANGGAL_6_7') === 'TANGGAL_6_7' && (
                        <div className="flex items-center gap-2 pt-1.5">
                          <span className="text-[10px] text-slate-400">Pilih Tanggal:</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setFormData({ ...formData, gajianDate: 6 });
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                              (formData.gajianDate || 7) === 6 ? 'bg-blue-500 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                            }`}
                          >
                            Tanggal 6
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setFormData({ ...formData, gajianDate: 7 });
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                              (formData.gajianDate || 7) === 7 ? 'bg-blue-500 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                            }`}
                          >
                            Tanggal 7 (Standar)
                          </button>
                        </div>
                      )}
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    formData.gajianTempoType === 'SAME_DATE_NEXT_MONTH'
                      ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}>
                    <input
                      type="radio"
                      name="gajianTempoType"
                      value="SAME_DATE_NEXT_MONTH"
                      checked={formData.gajianTempoType === 'SAME_DATE_NEXT_MONTH'}
                      onChange={() => setFormData({ ...formData, gajianTempoType: 'SAME_DATE_NEXT_MONTH' })}
                      className="mt-1 text-blue-500"
                    />
                    <div className="space-y-1 text-xs">
                      <div className="font-bold flex items-center gap-2">
                        <span>2. Sama Tanggal Ambil Bulan Depan</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Contoh: Ambil barang tgl 15, maka jatuh tempo pada tgl 15 bulan depannya.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Loyalty Points & Member Tier Section */}
          <div className="space-y-4">
            {stats && (
              <div className={`p-5 rounded-3xl bg-gradient-to-br ${
                stats.tierColorScheme && TIER_THEME[stats.tierColorScheme] 
                  ? TIER_THEME[stats.tierColorScheme].bg 
                  : TIER_THEME.BRONZE.bg
              } text-white shadow-lg border border-white/10 space-y-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-xl bg-white/20 backdrop-blur-md text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border border-white/20">
                      <Award size={14} className={
                        stats.tierColorScheme && TIER_THEME[stats.tierColorScheme]
                          ? TIER_THEME[stats.tierColorScheme].accent
                          : 'text-amber-300'
                      } />
                      <span>Member Tier {stats.tier}</span>
                    </span>

                    {stats.tierDiscountPercent > 0 && (
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-500/90 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                        <Sparkles size={11} />
                        Diskon {stats.tierDiscountPercent}%
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase opacity-80 block">Saldo Poin</span>
                    <span className="text-lg font-black tabular-nums">
                      {(formData.loyaltyPoints ?? 0).toLocaleString()} <span className="text-xs opacity-75">PTS</span>
                    </span>
                  </div>
                </div>

                {/* Progress to Next Tier */}
                <div className="space-y-1.5 pt-2 border-t border-white/20">
                  <div className="flex justify-between text-xs font-bold">
                    <span>
                      {stats.nextTier ? (
                        <>Menuju <strong className="underline underline-offset-2">{stats.nextTier}</strong></>
                      ) : (
                        <span className="flex items-center gap-1">
                          <ShieldCheck size={14} className="text-amber-300" />
                          Tier Tertinggi Tercapai
                        </span>
                      )}
                    </span>
                    <span className="bg-black/25 px-2 py-0.5 rounded-lg text-[11px] font-black">
                      {stats.progressPercent}%
                    </span>
                  </div>

                  <div className="w-full bg-black/30 h-2.5 rounded-full overflow-hidden p-0.5">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        stats.tierColorScheme && TIER_THEME[stats.tierColorScheme]
                          ? TIER_THEME[stats.tierColorScheme].bar
                          : 'bg-white'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(3, stats.progressPercent))}%` }}
                    />
                  </div>

                  {stats.nextTier ? (
                    <p className="text-[11px] opacity-90 font-medium">
                      {stats.qualificationBasis === 'LIFETIME_SPEND' ? (
                        <>Butuh belanja <strong>Rp {stats.spendToNextTier.toLocaleString()}</strong> lagi untuk naik level.</>
                      ) : (
                        <>Butuh <strong>{stats.pointsToNextTier.toLocaleString()} Pts</strong> lagi (setara belanja ~Rp {stats.spendToNextTier.toLocaleString()}) untuk naik tier.</>
                      )}
                    </p>
                  ) : (
                    <p className="text-[11px] opacity-80">
                      Pelanggan telah mencapai tingkat loyalitas tertinggi dengan keuntungan belanja maksimal.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-3xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-900">
                  <Trophy size={18} className="text-amber-500" />
                  <h4 className="text-xs font-black uppercase tracking-widest">Penyesuaian Saldo Poin</h4>
                </div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                  1 Pts / Rp {(loyaltyConfig?.pointsPerAmount || 10000).toLocaleString()}
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Saldo Poin Loyalty (Pts)
                </label>
                <input 
                  type="number"
                  min={0}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-black text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 tabular-nums"
                  value={formData.loyaltyPoints ?? 0}
                  onChange={e => setFormData({ ...formData, loyaltyPoints: Math.max(0, Number(e.target.value)) })}
                />
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                  <span>Nilai Tukar: <strong>Rp {((formData.loyaltyPoints ?? 0) * (loyaltyConfig?.pointRedemptionValue || 100)).toLocaleString()}</strong> (Rp {loyaltyConfig?.pointRedemptionValue || 100}/Pts)</span>
                  <span>Otomatis dihitung saat transaksi POS</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
          {customer?.customerId && (
            confirmDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || isSaving}
                className="px-4 py-4 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-500 transition-all shadow-lg shadow-rose-200 flex items-center justify-center gap-1.5"
              >
                <Trash2 size={16} />
                {isDeleting ? 'Menghapus...' : 'Konfirmasi Hapus'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={isDeleting || isSaving}
                className="px-4 py-4 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center justify-center gap-1.5"
                title="Hapus Pelanggan"
              >
                <Trash2 size={16} />
                Hapus
              </button>
            )
          )}
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
          >
            Batal
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving || !formData.name}
            className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-xl shadow-blue-200 disabled:bg-slate-200 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                MENYIMPAN...
              </>
            ) : (
              <>
                <Save size={18} />
                SIMPAN DATA
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
