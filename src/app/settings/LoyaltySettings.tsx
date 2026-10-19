import React, { useState, useEffect } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import type { LoyaltySettingsConfig, MemberTierConfig, MemberTierColorScheme } from '@/core/types';
import { 
  LoyaltySettingsService, 
  DEFAULT_LOYALTY_SETTINGS, 
  DEFAULT_MEMBER_TIERS,
  LOYALTY_SETTINGS_ID 
} from '@/core/services/loyalty-settings-service';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';
import { 
  Trophy, 
  Award, 
  Coins, 
  Sparkles, 
  Save, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Copy,
  ArrowUpDown,
  CheckCircle2, 
  Percent, 
  TrendingUp, 
  Check, 
  Info,
  Layers,
  LayoutGrid,
  Table as TableIcon
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const COLOR_SCHEME_OPTIONS: { id: MemberTierColorScheme; label: string; badgeClass: string; borderClass: string; bgSoft: string }[] = [
  { id: 'BRONZE', label: 'Bronze Amber', badgeClass: 'bg-amber-800/15 text-amber-900 border-amber-600/40', borderClass: 'border-l-amber-700', bgSoft: 'bg-amber-50' },
  { id: 'SILVER', label: 'Silver Slate', badgeClass: 'bg-slate-200 text-slate-800 border-slate-300', borderClass: 'border-l-slate-400', bgSoft: 'bg-slate-50' },
  { id: 'GOLD', label: 'Gold Yellow', badgeClass: 'bg-amber-100 text-amber-900 border-amber-400', borderClass: 'border-l-amber-400', bgSoft: 'bg-amber-50/60' },
  { id: 'PLATINUM', label: 'Platinum Indigo', badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300', borderClass: 'border-l-indigo-600', bgSoft: 'bg-indigo-50/50' },
  { id: 'EMERALD', label: 'Emerald Green', badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300', borderClass: 'border-l-emerald-600', bgSoft: 'bg-emerald-50/50' },
  { id: 'BLUE', label: 'Sky Blue', badgeClass: 'bg-sky-100 text-sky-900 border-sky-300', borderClass: 'border-l-sky-600', bgSoft: 'bg-sky-50/50' },
  { id: 'ROSE', label: 'Rose Pink', badgeClass: 'bg-rose-100 text-rose-900 border-rose-300', borderClass: 'border-l-rose-500', bgSoft: 'bg-rose-50/50' }
];

const RATIO_PRESETS = [5000, 10000, 20000, 25000, 50000];
const RATE_PRESETS = [25, 50, 100, 200, 500];

export default function LoyaltySettings() {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();

  const savedSettings = useLiveQuery(() => db.settings.get(LOYALTY_SETTINGS_ID));

  const [formData, setFormData] = useState<LoyaltySettingsConfig>(DEFAULT_LOYALTY_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessNotice, setShowSuccessNotice] = useState(false);
  const [tierViewMode, setTierViewMode] = useState<'cards' | 'table'>('cards');

  // New Perk Temp inputs for each tier card
  const [newPerkInputs, setNewPerkInputs] = useState<Record<string, string>>({});

  // Simulation calculator states
  const [simSpend, setSimSpend] = useState<number>(100000);
  const [simPointsToRedeem, setSimPointsToRedeem] = useState<number>(50);

  // Sync state when database loads
  useEffect(() => {
    if (savedSettings && savedSettings.id === LOYALTY_SETTINGS_ID) {
      setFormData({
        ...DEFAULT_LOYALTY_SETTINGS,
        ...savedSettings,
        tiers: Array.isArray(savedSettings.tiers) && savedSettings.tiers.length > 0 
          ? savedSettings.tiers 
          : DEFAULT_MEMBER_TIERS
      });
    }
  }, [savedSettings]);

  const handleFieldChange = <K extends keyof LoyaltySettingsConfig>(key: K, value: LoyaltySettingsConfig[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleUpdateTier = (tierId: string, updates: Partial<MemberTierConfig>) => {
    setFormData(prev => ({
      ...prev,
      tiers: prev.tiers.map(t => (t.id === tierId ? { ...t, ...updates } : t))
    }));
  };

  const handleAddTier = () => {
    const highestThreshold = formData.tiers.reduce((max, t) => Math.max(max, t.minThreshold), 0);
    const newTier: MemberTierConfig = {
      id: `tier-${uuidv4().slice(0, 8)}`,
      name: `TIER BARU ${formData.tiers.length + 1}`,
      minThreshold: formData.qualificationBasis === 'LIFETIME_SPEND' 
        ? highestThreshold + 1000000 
        : highestThreshold + 250,
      discountPercent: 0,
      colorScheme: 'EMERALD',
      perks: ['Akses Promo Spesial']
    };

    setFormData(prev => ({
      ...prev,
      tiers: [...prev.tiers, newTier].sort((a, b) => a.minThreshold - b.minThreshold)
    }));
    addToast('Tingkatan member tier baru berhasil ditambahkan.', 'info');
  };

  const handleDuplicateTier = (tierId: string) => {
    const sourceTier = formData.tiers.find(t => t.id === tierId);
    if (!sourceTier) return;

    const duplicatedTier: MemberTierConfig = {
      ...sourceTier,
      id: `tier-${uuidv4().slice(0, 8)}`,
      name: `${sourceTier.name} PLUS`,
      minThreshold: sourceTier.minThreshold + (formData.qualificationBasis === 'LIFETIME_SPEND' ? 500000 : 100),
      discountPercent: Math.min(100, sourceTier.discountPercent + 1),
      perks: [...sourceTier.perks]
    };

    setFormData(prev => ({
      ...prev,
      tiers: [...prev.tiers, duplicatedTier].sort((a, b) => a.minThreshold - b.minThreshold)
    }));
    addToast(`Tier ${duplicatedTier.name} berhasil diduplikasi.`, 'info');
  };

  const handleDeleteTier = (tierId: string) => {
    if (formData.tiers.length <= 1) {
      addToast('Minimal harus ada 1 tingkatan member tier!', 'error');
      return;
    }
    const targetTier = formData.tiers.find(t => t.id === tierId);
    if (!confirm(`Hapus tingkatan member tier "${targetTier?.name || 'ini'}"?`)) return;

    setFormData(prev => ({
      ...prev,
      tiers: prev.tiers.filter(t => t.id !== tierId)
    }));
    addToast('Tingkatan tier telah dihapus.', 'info');
  };

  const handleSortTiers = () => {
    setFormData(prev => ({
      ...prev,
      tiers: [...prev.tiers].sort((a, b) => a.minThreshold - b.minThreshold)
    }));
    addToast('Daftar Member Tier diurutkan berdasarkan Min Points.', 'info');
  };

  const handleResetTiersToDefault = () => {
    if (!confirm('Muat ulang daftar tingkatan member tier ke standar (Bronze, Silver, Gold, Platinum)?')) {
      return;
    }
    setFormData(prev => ({
      ...prev,
      tiers: DEFAULT_MEMBER_TIERS
    }));
    addToast('Daftar member tier dikembalikan ke preset standar.', 'info');
  };

  const handleAddPerk = (tierId: string) => {
    const perkText = (newPerkInputs[tierId] || '').trim();
    if (!perkText) return;

    setFormData(prev => ({
      ...prev,
      tiers: prev.tiers.map(t => {
        if (t.id === tierId) {
          return {
            ...t,
            perks: [...(t.perks || []), perkText]
          };
        }
        return t;
      })
    }));

    setNewPerkInputs(prev => ({ ...prev, [tierId]: '' }));
  };

  const handleRemovePerk = (tierId: string, index: number) => {
    setFormData(prev => ({
      ...prev,
      tiers: prev.tiers.map(t => {
        if (t.id === tierId) {
          const perks = [...t.perks];
          perks.splice(index, 1);
          return { ...t, perks };
        }
        return t;
      })
    }));
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      if (formData.pointsPerAmount <= 0) {
        throw new Error('Spending-to-Point ratio (nominal belanja per 1 poin) harus lebih besar dari 0!');
      }
      if (formData.pointRedemptionValue <= 0) {
        throw new Error('Point-to-IDR exchange rate (nilai tukar rupiah per 1 poin) harus lebih besar dari 0!');
      }

      await LoyaltySettingsService.updateSettings(formData, currentUser?.userId || 'OWNER');
      setShowSuccessNotice(true);
      addToast('Pengaturan Loyalty & Membership berhasil disimpan!', 'success');
      setTimeout(() => setShowSuccessNotice(false), 4000);
    } catch (err: any) {
      addToast(err?.message || 'Gagal menyimpan pengaturan loyalty.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Kembalikan seluruh aturan loyalty & membership ke konfigurasi awal bawaan toko?')) {
      return;
    }
    setIsSaving(true);
    try {
      const resetDoc = await LoyaltySettingsService.resetToDefaults(currentUser?.userId || 'OWNER');
      setFormData(resetDoc);
      addToast('Pengaturan loyalty & membership berhasil dikembalikan ke nilai awal.', 'info');
    } catch (err: any) {
      addToast(err?.message || 'Gagal mengembalikan pengaturan.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Calculations for interactive simulation preview
  const simEarnedPoints = formData.isEnabled && formData.pointsPerAmount > 0
    ? Math.floor(simSpend / formData.pointsPerAmount)
    : 0;
  const simRedeemRupiah = simPointsToRedeem * formData.pointRedemptionValue;

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-500/30">
              <Trophy size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
                  Loyalty &amp; Membership
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  Settings Panel
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300">
                Kelola spending-to-point ratio, point-to-IDR exchange rate, serta daftar dinamis Member Tier (nama, min points, diskon %).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-center shrink-0">
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer"
          >
            <RotateCcw size={15} />
            Reset Default
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-900/40 flex items-center gap-2 transition-all cursor-pointer disabled:bg-slate-700"
          >
            <Save size={16} />
            {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </div>

      {showSuccessNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 text-sm font-semibold animate-in fade-in duration-300">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          <span>Pengaturan Loyalty &amp; Membership berhasil diperbarui dan tersinkronisasi langsung!</span>
        </div>
      )}

      {/* Grid: Main Rules & Interactive Live Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (2 Cols): Earning & Redemption Parameters */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                  <Coins size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                    Rasio Poin &amp; Nilai Tukar Rupiah
                  </h3>
                  <p className="text-xs text-slate-500">
                    Atur perolehan poin per nominal belanja serta nilai rupiah saat penukaran di kasir POS.
                  </p>
                </div>
              </div>

              {/* Master Toggle */}
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-600">
                  {formData.isEnabled ? 'Program Aktif' : 'Nonaktif'}
                </span>
                <input
                  type="checkbox"
                  checked={formData.isEnabled}
                  onChange={(e) => handleFieldChange('isEnabled', e.target.checked)}
                  className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Spending-to-Point Ratio */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                    Spending-to-Point Ratio
                  </label>
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                    Rasio Belanja
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="100"
                    step="500"
                    value={formData.pointsPerAmount || ''}
                    onChange={(e) => handleFieldChange('pointsPerAmount', Number(e.target.value))}
                    className="w-full pl-10 pr-14 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-500 outline-none tabular-nums"
                    placeholder="10000"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    = 1 Pts
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Nominal belanja untuk meraih 1 poin (Contoh: Rp 10.000 belanja = 1 Poin).
                </p>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[10px] font-semibold text-slate-400 self-center mr-1">Preset:</span>
                  {RATIO_PRESETS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => handleFieldChange('pointsPerAmount', amount)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                        formData.pointsPerAmount === amount
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      Rp {amount.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Point-to-IDR Exchange Rate */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                    Point-to-IDR Exchange Rate
                  </label>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    Nilai Tukar Rupiah
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                    1 Pts = Rp
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="5"
                    value={formData.pointRedemptionValue || ''}
                    onChange={(e) => handleFieldChange('pointRedemptionValue', Number(e.target.value))}
                    className="w-full pl-24 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-500 outline-none tabular-nums"
                    placeholder="100"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Nilai potongan harga saat 1 poin ditukarkan di kasir (Contoh: 1 Pts = Rp 100).
                </p>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[10px] font-semibold text-slate-400 self-center mr-1">Preset:</span>
                  {RATE_PRESETS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleFieldChange('pointRedemptionValue', val)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                        formData.pointRedemptionValue === val
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      Rp {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Minimal Poin untuk Redeem */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                  Minimal Poin untuk Penukaran
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={formData.minRedemptionPoints || ''}
                    onChange={(e) => handleFieldChange('minRedemptionPoints', Number(e.target.value))}
                    className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-500 outline-none tabular-nums"
                    placeholder="50"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                    Pts
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Batas minimum saldo poin sebelum tombol tukar poin dapat digunakan pelanggan di kasir.
                </p>
              </div>

              {/* Pengecualian Reseller */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                  Pengecualian Tipe Akun
                </label>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Kecualikan Pelanggan Reseller</span>
                    <span className="text-[10px] text-slate-500">
                      Reseller telah mendapatkan harga grosir terendah, tidak mengumpulkan poin.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.excludeReseller}
                    onChange={(e) => handleFieldChange('excludeReseller', e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Tolak Ukur Kualifikasi Tier (Radio choice) */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                  Tolak Ukur Kualifikasi Level Member Tier
                </label>
                <span className="text-[11px] text-slate-400">
                  Menentukan acuan perhitungan naik level
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleFieldChange('qualificationBasis', 'LIFETIME_POINTS')}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    formData.qualificationBasis === 'LIFETIME_POINTS'
                      ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
                      <Trophy size={15} className="text-amber-500" />
                      Akumulasi Poin Seumur Hidup
                    </span>
                    {formData.qualificationBasis === 'LIFETIME_POINTS' && (
                      <CheckCircle2 size={16} className="text-blue-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Tier dihitung dari total akumulasi poin yang pernah diraih. Pelanggan tidak turun tier meskipun poin ditukarkan.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleFieldChange('qualificationBasis', 'LIFETIME_SPEND')}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    formData.qualificationBasis === 'LIFETIME_SPEND'
                      ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
                      <TrendingUp size={15} className="text-blue-600" />
                      Total Belanja Seumur Hidup (Rp)
                    </span>
                    {formData.qualificationBasis === 'LIFETIME_SPEND' && (
                      <CheckCircle2 size={16} className="text-blue-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Tier dihitung langsung dari total rupiah riwayat belanja selesai yang dibayarkan pelanggan di toko.
                  </p>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): Live Simulation & Calculator */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-lg border border-slate-800 space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black">
                <Sparkles size={18} />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  Simulasi Kalkulator Loyalty
                </h4>
                <p className="text-[10px] text-slate-400">
                  Uji coba perolehan poin dan penukaran secara real-time
                </p>
              </div>
            </div>

            {/* Test Spend */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Contoh Transaksi Belanja Kasir:
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">Rp</span>
                <input
                  type="number"
                  step="10000"
                  value={simSpend || ''}
                  onChange={(e) => setSimSpend(Number(e.target.value))}
                  className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-mono font-bold text-white outline-none tabular-nums focus:border-amber-400"
                />
              </div>
            </div>

            {/* Result Earning */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Poin Didapat:</span>
                <span className="font-mono font-black text-amber-400 text-sm">
                  +{simEarnedPoints} Pts
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Nilai Rupiah Poin:</span>
                <span className="font-mono font-bold text-emerald-400 text-xs">
                  Rp {(simEarnedPoints * formData.pointRedemptionValue).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Test Redemption */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Contoh Penukaran Poin di Kasir:
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="10"
                  value={simPointsToRedeem || ''}
                  onChange={(e) => setSimPointsToRedeem(Number(e.target.value))}
                  className="w-full pl-3 pr-10 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-mono font-bold text-white outline-none tabular-nums focus:border-blue-400"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">Pts</span>
              </div>
            </div>

            {/* Result Redemption */}
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/40 space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold block">
                Potongan Harga di Nota:
              </span>
              <span className="text-xl font-mono font-black text-emerald-300 block">
                -Rp {simRedeemRupiah.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400 block">
                {simPointsToRedeem < formData.minRedemptionPoints 
                  ? `⚠️ Di bawah batas minimal (${formData.minRedemptionPoints} Pts)`
                  : `✓ Memenuhi syarat penukaran`
                }
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Member Tier List Component */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <Award className="text-amber-500" size={22} />
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                Daftar Dinamis Member Tiers
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                {formData.tiers.length} Tingkatan
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Tentukan dan edit tingkatan Member Tier: <strong>Nama Tier</strong>, <strong>Min Points / Batas Capaian</strong>, dan <strong>Diskon Persen (%)</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* View Switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setTierViewMode('cards')}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  tierViewMode === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Tampilan Kartu"
              >
                <LayoutGrid size={15} />
                <span className="hidden md:inline">Kartu</span>
              </button>
              <button
                type="button"
                onClick={() => setTierViewMode('table')}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  tierViewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Tampilan Tabel Ringkas"
              >
                <TableIcon size={15} />
                <span className="hidden md:inline">Tabel</span>
              </button>
            </div>

            {/* Sort Tiers */}
            <button
              type="button"
              onClick={handleSortTiers}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Urutkan tingkatan tier berdasarkan batas minimal terendah ke tertinggi"
            >
              <ArrowUpDown size={14} />
              Urutkan
            </button>

            {/* Reset to standard tiers */}
            <button
              type="button"
              onClick={handleResetTiersToDefault}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Muat kembali 4 tier standar: Bronze, Silver, Gold, Platinum"
            >
              <RotateCcw size={14} />
              Preset Standar
            </button>

            {/* Add New Tier */}
            <button
              type="button"
              onClick={handleAddTier}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus size={16} />
              Tambah Tier
            </button>
          </div>
        </div>

        {/* Table View Mode */}
        {tierViewMode === 'table' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-black tracking-widest text-slate-400 border-b border-slate-100">
                    <th className="py-3 px-4">Level</th>
                    <th className="py-3 px-4">Nama Tier</th>
                    <th className="py-3 px-4">Min Points / Batas</th>
                    <th className="py-3 px-4">Diskon Belanja (%)</th>
                    <th className="py-3 px-4">Warna Badge</th>
                    <th className="py-3 px-4">Keuntungan / Perks</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {formData.tiers.map((tier, idx) => {
                    const schemeInfo = COLOR_SCHEME_OPTIONS.find(c => c.id === tier.colorScheme) || COLOR_SCHEME_OPTIONS[0];
                    return (
                      <tr key={tier.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-400">
                          #{idx + 1}
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={tier.name}
                            onChange={(e) => handleUpdateTier(tier.id, { name: e.target.value.toUpperCase() })}
                            className="font-black uppercase tracking-tight text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none px-1 py-0.5 rounded"
                            placeholder="NAMA TIER"
                          />
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              value={tier.minThreshold ?? 0}
                              onChange={(e) => handleUpdateTier(tier.id, { minThreshold: Number(e.target.value) })}
                              className="w-24 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 outline-none focus:bg-white focus:border-blue-500"
                            />
                            <span className="text-[11px] text-slate-400 font-bold">
                              {formData.qualificationBasis === 'LIFETIME_SPEND' ? 'Rp' : 'Pts'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-600">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={tier.discountPercent ?? 0}
                              onChange={(e) => handleUpdateTier(tier.id, { discountPercent: Number(e.target.value) })}
                              className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 outline-none focus:bg-white focus:border-blue-500"
                            />
                            <span className="text-[11px] text-slate-400 font-bold">%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase tracking-wider inline-block ${schemeInfo.badgeClass}`}>
                            {tier.name || 'TIER'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-slate-500 max-w-xs truncate">
                          {tier.perks && tier.perks.length > 0 
                            ? tier.perks.join(', ')
                            : 'Tidak ada benefit khusus'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleDuplicateTier(tier.id)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all cursor-pointer"
                              title="Duplikasi Tier"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTier(tier.id)}
                              disabled={formData.tiers.length <= 1}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent"
                              title="Hapus Tier"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Dynamic Card Grid View */}
        {tierViewMode === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {formData.tiers.map((tier, idx) => {
              const schemeInfo = COLOR_SCHEME_OPTIONS.find(c => c.id === tier.colorScheme) || COLOR_SCHEME_OPTIONS[0];

              return (
                <div 
                  key={tier.id}
                  className={`bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-5 border-l-4 ${schemeInfo.borderClass} relative overflow-hidden transition-all hover:shadow-md`}
                >
                  {/* Card Header & Preview Badge */}
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-mono text-xs font-black flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Nama Member Tier
                        </span>
                        <input
                          type="text"
                          value={tier.name}
                          onChange={(e) => handleUpdateTier(tier.id, { name: e.target.value.toUpperCase() })}
                          className="font-black text-base uppercase tracking-tight text-slate-900 bg-transparent border-b border-slate-200 hover:border-slate-400 focus:border-blue-500 outline-none px-1 py-0.5 rounded w-full"
                          placeholder="CONTOH: GOLD"
                        />
                      </div>
                    </div>

                    {/* Live Badge Preview */}
                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black border uppercase tracking-wider ${schemeInfo.badgeClass}`}>
                        {tier.name || 'TIER'} {tier.discountPercent > 0 ? `• ${tier.discountPercent}% OFF` : ''}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleDuplicateTier(tier.id)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all cursor-pointer"
                        title="Duplikasi Tingkatan Tier"
                      >
                        <Copy size={15} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteTier(tier.id)}
                        disabled={formData.tiers.length <= 1}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Hapus Tier"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Form Controls: Min Points (Threshold) & Discount Percentage */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Min Points / Ambang Batas Minimum */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                          Min Points / Ambang Batas
                        </label>
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded">
                          {formData.qualificationBasis === 'LIFETIME_SPEND' ? 'Total Belanja' : 'Poin Minimal'}
                        </span>
                      </div>
                      <div className="relative">
                        {formData.qualificationBasis === 'LIFETIME_SPEND' && (
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                        )}
                        <input
                          type="number"
                          min="0"
                          value={tier.minThreshold ?? 0}
                          onChange={(e) => handleUpdateTier(tier.id, { minThreshold: Number(e.target.value) })}
                          className={`w-full py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900 focus:bg-white focus:border-blue-500 outline-none tabular-nums ${
                            formData.qualificationBasis === 'LIFETIME_SPEND' ? 'pl-9 pr-3' : 'pl-3 pr-12'
                          }`}
                        />
                        {formData.qualificationBasis === 'LIFETIME_POINTS' && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Pts</span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        {tier.minThreshold === 0 ? 'Tingkat dasar saat pelanggan baru terdaftar' : `Syarat tercapai mulai ${tier.minThreshold.toLocaleString()} ${formData.qualificationBasis === 'LIFETIME_SPEND' ? 'Rp' : 'Pts'}`}
                      </span>
                    </div>

                    {/* Diskon Belanja Member (%) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                          Diskon Member Belanja
                        </label>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded">
                          Potongan Kasir
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={tier.discountPercent ?? 0}
                          onChange={(e) => handleUpdateTier(tier.id, { discountPercent: Number(e.target.value) })}
                          className="w-full pl-3 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900 focus:bg-white focus:border-blue-500 outline-none tabular-nums"
                          placeholder="0"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">%</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        Diskon otomatis memotong subtotal kasir POS
                      </span>
                    </div>
                  </div>

                  {/* Theme Color Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider block">
                      Warna Aksen Badge Tier
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {COLOR_SCHEME_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleUpdateTier(tier.id, { colorScheme: opt.id })}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                            tier.colorScheme === opt.id
                              ? `${opt.badgeClass} ring-2 ring-slate-900 font-black`
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Perks / Benefits List */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                      Daftar Keuntungan / Benefit ({tier.perks?.length || 0})
                    </label>
                    
                    <div className="space-y-1.5">
                      {tier.perks?.map((perk, pIdx) => (
                        <div 
                          key={pIdx}
                          className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800"
                        >
                          <div className="flex items-center gap-2">
                            <Check size={14} className="text-emerald-600 shrink-0" />
                            <span className="font-medium">{perk}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePerk(tier.id, pIdx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-all cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add New Perk Input */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Tambah keuntungan tier ini..."
                        value={newPerkInputs[tier.id] || ''}
                        onChange={(e) => setNewPerkInputs(prev => ({ ...prev, [tier.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddPerk(tier.id);
                          }
                        }}
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddPerk(tier.id)}
                        disabled={!(newPerkInputs[tier.id] || '').trim()}
                        className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 transition-all cursor-pointer disabled:opacity-40"
                      >
                        + Tambah
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Bottom Save Action Bar */}
      <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Info size={18} className="text-blue-400 shrink-0" />
          <span className="text-xs text-slate-300">
            Perubahan aturan loyalty &amp; membership langsung diterapkan pada transaksi kasir POS, perhitungan diskon belanja, dan profil pelanggan.
          </span>
        </div>

        <button
          type="button"
          onClick={() => handleSave()}
          disabled={isSaving}
          className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-900/40 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:bg-slate-700"
        >
          <Save size={16} />
          {isSaving ? 'Menyimpan...' : 'Simpan Semua Pengaturan'}
        </button>
      </div>
    </div>
  );
}
