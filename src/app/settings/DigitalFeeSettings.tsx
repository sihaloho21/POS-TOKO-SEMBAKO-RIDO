import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import type { 
  DigitalFeeSettings as IDigitalFeeSettings, 
  DigitalServiceConfigItem, 
  DigitalFeeTier, 
  DigitalServiceType,
  DigitalPricingModel 
} from '@/core/types';
import { 
  DigitalFeeService, 
  DIGITAL_FEE_SETTINGS_ID, 
  DEFAULT_DIGITAL_FEE_SETTINGS 
} from '@/core/services/digital-fee-service';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';
import { 
  Send, 
  Smartphone, 
  ArrowDownToLine, 
  Zap, 
  Wifi, 
  Save, 
  RotateCcw, 
  Plus, 
  Trash2, 
  ShieldCheck, 
  Sparkles, 
  Info, 
  Calculator, 
  CheckCircle2, 
  Layers, 
  Lock, 
  Unlock,
  Sliders,
  DollarSign
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface ServiceTabMeta {
  type: DigitalServiceType;
  label: string;
  shortDesc: string;
  icon: any;
  accentColor: string;
  bgLight: string;
}

const SERVICE_TABS: ServiceTabMeta[] = [
  { 
    type: 'TRANSFER', 
    label: 'Transfer Bank', 
    shortDesc: 'Antar & Sesama Bank',
    icon: <Send size={18} />, 
    accentColor: 'text-emerald-700 border-emerald-500 bg-emerald-500', 
    bgLight: 'bg-emerald-50 text-emerald-800 border-emerald-200' 
  },
  { 
    type: 'TOPUP', 
    label: 'Top Up E-Wallet', 
    shortDesc: 'DANA, OVO, GoPay, ShopeePay',
    icon: <Smartphone size={18} />, 
    accentColor: 'text-purple-700 border-purple-500 bg-purple-500', 
    bgLight: 'bg-purple-50 text-purple-800 border-purple-200' 
  },
  { 
    type: 'TARIK_TUNAI', 
    label: 'Tarik Tunai', 
    shortDesc: 'Penarikan Kas Fisik',
    icon: <ArrowDownToLine size={18} />, 
    accentColor: 'text-rose-700 border-rose-500 bg-rose-500', 
    bgLight: 'bg-rose-50 text-rose-800 border-rose-200' 
  },
  { 
    type: 'TOKEN_LISTRIK', 
    label: 'Token PLN', 
    shortDesc: 'Listrik Prabayar',
    icon: <Zap size={18} />, 
    accentColor: 'text-amber-700 border-amber-500 bg-amber-500', 
    bgLight: 'bg-amber-50 text-amber-800 border-amber-200' 
  },
  { 
    type: 'PULSA', 
    label: 'Pulsa Seluler', 
    shortDesc: 'All Operator',
    icon: <Smartphone size={18} />, 
    accentColor: 'text-blue-700 border-blue-500 bg-blue-500', 
    bgLight: 'bg-blue-50 text-blue-800 border-blue-200' 
  },
  { 
    type: 'PAKET_DATA', 
    label: 'Paket Data', 
    shortDesc: 'Internet & Kuota',
    icon: <Wifi size={18} />, 
    accentColor: 'text-indigo-700 border-indigo-500 bg-indigo-500', 
    bgLight: 'bg-indigo-50 text-indigo-800 border-indigo-200' 
  },
];

export default function DigitalFeeSettings() {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const isOwner = currentUser?.role === 'OWNER';

  const savedSettings = useLiveQuery(() => db.settings.get(DIGITAL_FEE_SETTINGS_ID));

  const [formData, setFormData] = useState<IDigitalFeeSettings>(DEFAULT_DIGITAL_FEE_SETTINGS);
  const [activeService, setActiveService] = useState<DigitalServiceType>('TRANSFER');
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedSuccess, setShowSavedSuccess] = useState(false);

  // Live Simulation Test State
  const [simTestNominal, setSimTestNominal] = useState<number>(75000);

  // Load from Dexie settings when query resolves
  useEffect(() => {
    if (savedSettings && savedSettings.id === DIGITAL_FEE_SETTINGS_ID && savedSettings.configs) {
      setFormData({
        id: DIGITAL_FEE_SETTINGS_ID,
        allowCashierManualOverride: Boolean(savedSettings.allowCashierManualOverride),
        updatedAt: savedSettings.updatedAt || new Date().toISOString(),
        updatedBy: savedSettings.updatedBy || 'SYSTEM',
        configs: {
          ...DEFAULT_DIGITAL_FEE_SETTINGS.configs,
          ...savedSettings.configs
        }
      });
    }
  }, [savedSettings]);

  const currentConfig: DigitalServiceConfigItem = useMemo(() => {
    return formData.configs[activeService] || DEFAULT_DIGITAL_FEE_SETTINGS.configs[activeService];
  }, [formData, activeService]);

  const formatRupiah = (val: number) => {
    if (val === 0) return 'Rp 0';
    if (!val || val === Infinity) return 'Tanpa Batas (∞)';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  };

  // Helper to update current service configuration
  const updateCurrentConfig = (updates: Partial<DigitalServiceConfigItem>) => {
    setFormData(prev => ({
      ...prev,
      configs: {
        ...prev.configs,
        [activeService]: {
          ...prev.configs[activeService],
          ...updates
        }
      }
    }));
  };

  // Add new tier row
  const handleAddTier = () => {
    const existingTiers = currentConfig.tiers || [];
    let nextMin = 0;
    if (existingTiers.length > 0) {
      const lastTier = existingTiers[existingTiers.length - 1];
      nextMin = lastTier.maxAmount > 0 ? lastTier.maxAmount + 1 : lastTier.minAmount + 50000;
    }

    const nextMax = nextMin > 0 ? nextMin + 50000 : 50000;
    const newTier: DigitalFeeTier = {
      id: `tier-${uuidv4().slice(0, 8)}`,
      minAmount: nextMin,
      maxAmount: nextMax,
      feeAmount: existingTiers.length > 0 ? (existingTiers[existingTiers.length - 1].feeAmount || 3000) + 2000 : 3000,
      label: `${Math.round(nextMin / 1000)}k - ${Math.round(nextMax / 1000)}k`
    };

    updateCurrentConfig({
      tiers: [...existingTiers, newTier]
    });
  };

  // Update specific tier row
  const handleUpdateTier = (tierId: string, updates: Partial<DigitalFeeTier>) => {
    const updatedTiers = (currentConfig.tiers || []).map(t => {
      if (t.id === tierId) {
        const merged = { ...t, ...updates };
        // Auto-generate helper label if none
        if (!updates.label) {
          const minK = Math.round(merged.minAmount / 1000);
          const maxK = merged.maxAmount > 0 ? `${Math.round(merged.maxAmount / 1000)}k` : '+ (Tanpa Batas)';
          merged.label = `${minK}k - ${maxK}`;
        }
        return merged;
      }
      return t;
    });

    updateCurrentConfig({ tiers: updatedTiers });
  };

  // Delete specific tier row
  const handleDeleteTier = (tierId: string) => {
    const filtered = (currentConfig.tiers || []).filter(t => t.id !== tierId);
    updateCurrentConfig({ tiers: filtered });
  };

  // Apply Quick Preset (e.g. 0-50k, 50k-100k, 100k+)
  const handleApplyPreset0_50k_100k = () => {
    let presetTiers: DigitalFeeTier[] = [];
    if (activeService === 'TOPUP') {
      presetTiers = [
        { id: `tier-p1-${uuidv4().slice(0, 6)}`, minAmount: 0, maxAmount: 50000, feeAmount: 2000, label: '0 - 50k' },
        { id: `tier-p2-${uuidv4().slice(0, 6)}`, minAmount: 50001, maxAmount: 100000, feeAmount: 3000, label: '50k - 100k' },
        { id: `tier-p3-${uuidv4().slice(0, 6)}`, minAmount: 100001, maxAmount: 0, feeAmount: 5000, label: '100k+ (Tanpa Batas)' }
      ];
    } else {
      presetTiers = [
        { id: `tier-p1-${uuidv4().slice(0, 6)}`, minAmount: 0, maxAmount: 50000, feeAmount: 3000, label: '0 - 50k' },
        { id: `tier-p2-${uuidv4().slice(0, 6)}`, minAmount: 50001, maxAmount: 100000, feeAmount: 5000, label: '50k - 100k' },
        { id: `tier-p3-${uuidv4().slice(0, 6)}`, minAmount: 100001, maxAmount: 500000, feeAmount: 7500, label: '100k - 500k' },
        { id: `tier-p4-${uuidv4().slice(0, 6)}`, minAmount: 500001, maxAmount: 0, feeAmount: 10000, label: '500k+ (Tanpa Batas)' }
      ];
    }

    updateCurrentConfig({
      pricingModel: 'TIERED',
      tiers: presetTiers
    });
    addToast(`Template nominal bertingkat (0-50k, 50k-100k, 100k+) diterapkan untuk ${currentConfig.label}!`, 'info');
  };

  // Reset to recommended defaults
  const handleResetDefaults = () => {
    if (confirm(`Kembalikan pengaturan tarif ${currentConfig.label} ke rekomendasi default toko?`)) {
      setFormData(prev => ({
        ...prev,
        configs: {
          ...prev.configs,
          [activeService]: DEFAULT_DIGITAL_FEE_SETTINGS.configs[activeService]
        }
      }));
      addToast(`Tarif ${currentConfig.label} dikembalikan ke default.`, 'info');
    }
  };

  // Save Settings to Dexie & Firestore
  const handleSaveAll = async () => {
    if (!isOwner) {
      addToast('Akses ditolak: Hanya OWNER yang dapat mengubah konfigurasi biaya admin.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await DigitalFeeService.saveSettings(formData, currentUser?.userId || 'OWNER');
      setShowSavedSuccess(true);
      addToast('Pengaturan tarif biaya admin berhasil disimpan dan disinkronkan ke Cloud!', 'success');
      setTimeout(() => setShowSavedSuccess(false), 4000);
    } catch (err: any) {
      console.error('Error saving digital fee settings:', err);
      addToast('Gagal menyimpan tarif: ' + (err?.message || 'Kesalahan sistem'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Live test calculation result
  const simResult = useMemo(() => {
    return DigitalFeeService.calculateFee(activeService, simTestNominal, formData);
  }, [activeService, simTestNominal, formData]);

  const activeTabMeta = SERVICE_TABS.find(t => t.type === activeService) || SERVICE_TABS[0];

  return (
    <div className="space-y-6">
      {/* Top Banner / Role Notice */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-indigo-900/50 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-indigo-500/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-wider uppercase bg-amber-400 text-slate-950">
                Fitur Khusus Owner
              </span>
              <span className="flex items-center gap-1 text-xs text-indigo-200">
                <ShieldCheck size={14} className="text-emerald-400" />
                Pemisahan Storage Kas Digital Terjamin
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <Sliders className="text-indigo-400" size={26} />
              Pengaturan Biaya Admin (Fee) Layanan Digital
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Tentukan tarif admin tetap (flat) atau tarif bertingkat berdasarkan nominal transaksi (contoh: 0-50k, 50k-100k, 100k+) untuk Transfer Bank, E-Wallet, dan Tarik Tunai.
            </p>
          </div>

          <button
            onClick={handleSaveAll}
            disabled={isSaving || !isOwner}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-900/40 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Save size={16} />
                Simpan Tarif Baru
              </>
            )}
          </button>
        </div>

        {showSavedSuccess && (
          <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-400/50 rounded-xl flex items-center gap-2 text-emerald-200 text-xs font-bold animate-fadeIn">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            Pengaturan biaya admin berhasil disimpan dan aktif seketika di kasir seluruh perangkat!
          </div>
        )}
      </div>

      {/* Cashier Override Guard Option */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl ${formData.allowCashierManualOverride ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
            {formData.allowCashierManualOverride ? <Unlock size={20} /> : <Lock size={20} />}
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              Kebijakan Perubahan Fee Manual di Kasir
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {formData.allowCashierManualOverride 
                ? 'Kasir diizinkan mengubah nominal biaya admin secara manual saat transaksi jika ada diskon khusus.'
                : 'Terkunci (Direkomendasikan): Kasir tidak dapat mengubah biaya admin. Nilai fee selalu dihitung otomatis sesuai rumus Owner.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFormData(p => ({ ...p, allowCashierManualOverride: !p.allowCashierManualOverride }))}
          className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
            formData.allowCashierManualOverride
              ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
          }`}
        >
          {formData.allowCashierManualOverride ? '🔓 Buka Kunci (Boleh Ubah)' : '🔒 Terkunci Otomatis (Aman)'}
        </button>
      </div>

      {/* Service Selector Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {SERVICE_TABS.map(tab => {
            const isSelected = activeService === tab.type;
            const tabConfig = formData.configs[tab.type];
            const isTiered = tabConfig?.pricingModel === 'TIERED';

            return (
              <button
                key={tab.type}
                onClick={() => setActiveService(tab.type)}
                className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-500/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {tab.icon}
                  </div>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                    isTiered ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {isTiered ? 'Bertingkat' : 'Flat'}
                  </span>
                </div>
                <span className={`text-xs font-bold truncate w-full ${isSelected ? 'text-indigo-950 font-black' : 'text-slate-700'}`}>
                  {tab.label}
                </span>
                <span className="text-[10px] text-slate-400 truncate w-full">
                  {tab.shortDesc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Service Editor Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        {/* Card Header & Model Selector */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-100 gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl text-white ${activeTabMeta.accentColor.split(' ')[2] || 'bg-indigo-600'}`}>
              {activeTabMeta.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">
                  {currentConfig.label}
                </h3>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                  currentConfig.isEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {currentConfig.isEnabled ? 'Layanan Aktif' : 'Layanan Nonaktif'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Pilih apakah layanan ini menggunakan tarif admin tetap (flat) atau bertingkat menurut rentang nominal.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => updateCurrentConfig({ pricingModel: 'TIERED' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                currentConfig.pricingModel === 'TIERED'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={14} />
              Bertingkat (Tiered)
            </button>
            <button
              type="button"
              onClick={() => updateCurrentConfig({ pricingModel: 'FLAT' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                currentConfig.pricingModel === 'FLAT'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <DollarSign size={14} />
              Tarif Tetap (Flat)
            </button>
          </div>
        </div>

        {/* Pricing Model Details */}
        {currentConfig.pricingModel === 'FLAT' ? (
          /* FLAT FEE EDITOR */
          <div className="space-y-4 max-w-xl">
            <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-4 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Info size={16} className="text-blue-600" />
                Model Tarif Flat (Tetap)
              </div>
              <p className="text-blue-800">
                Biaya admin yang sama akan otomatis dikenakan ke setiap transaksi {currentConfig.label}, berapa pun nominal yang dimasukkan kasir.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Besaran Biaya Admin Flat (Rp)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">Rp</span>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={currentConfig.flatFee || 0}
                  onChange={(e) => updateCurrentConfig({ flatFee: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-slate-500 font-medium">Pilihan Cepat:</span>
              {[1500, 2000, 2500, 3000, 5000].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => updateCurrentConfig({ flatFee: amt })}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  Rp {amt.toLocaleString('id-ID')}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* TIERED FEE EDITOR */
          <div className="space-y-6">
            {/* Header / Preset helper */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers size={14} className="text-indigo-600" />
                  Pemetaan Rentang Nominal (Tiers)
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Atur batas nominal Dari (Min) dan Sampai (Max), serta biaya admin yang dikenakan untuk rentang tersebut.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleApplyPreset0_50k_100k}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-colors"
                  title="Terapkan preset 0-50k, 50k-100k, 100k+"
                >
                  <Sparkles size={13} className="text-indigo-600" />
                  Preset Cepat 0-50k / 50k-100k / 100k+
                </button>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors"
                  title="Kembalikan ke default"
                >
                  <RotateCcw size={13} />
                  Reset Default
                </button>
              </div>
            </div>

            {/* Tiers Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 uppercase font-black tracking-wider text-[11px]">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4 min-w-[160px]">Nominal Dari (Min)</th>
                    <th className="py-3 px-4 min-w-[200px]">Nominal Sampai (Max)</th>
                    <th className="py-3 px-4 min-w-[160px]">Biaya Admin (Fee)</th>
                    <th className="py-3 px-4 min-w-[140px]">Label / Ringkasan</th>
                    <th className="py-3 px-4 w-16 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(currentConfig.tiers || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Belum ada rentang nominal yang dibuat. Klik tombol "+ Tambah Rentang Nominal" di bawah untuk memulai.
                      </td>
                    </tr>
                  ) : (
                    currentConfig.tiers.map((tier, index) => {
                      const isUnlimited = tier.maxAmount <= 0;

                      return (
                        <tr key={tier.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 text-center text-slate-400 font-bold">
                            {index + 1}
                          </td>

                          {/* Min Amount */}
                          <td className="py-3 px-4">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">Rp</span>
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                value={tier.minAmount}
                                onChange={(e) => handleUpdateTier(tier.id, { minAmount: Math.max(0, Number(e.target.value) || 0) })}
                                className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          </td>

                          {/* Max Amount */}
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">Rp</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1000"
                                  disabled={isUnlimited}
                                  value={isUnlimited ? '' : tier.maxAmount}
                                  placeholder={isUnlimited ? 'Tanpa Batas (∞)' : 'Maksimal'}
                                  onChange={(e) => handleUpdateTier(tier.id, { maxAmount: Math.max(0, Number(e.target.value) || 0) })}
                                  className={`w-full pl-8 pr-2 py-1.5 rounded-lg border text-xs font-bold ${
                                    isUnlimited 
                                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                      : 'border-slate-200 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500'
                                  }`}
                                />
                              </div>

                              <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={isUnlimited}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      handleUpdateTier(tier.id, { maxAmount: 0 });
                                    } else {
                                      handleUpdateTier(tier.id, { maxAmount: tier.minAmount + 50000 });
                                    }
                                  }}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                />
                                Tanpa batas atas (100k+ / ke atas)
                              </label>
                            </div>
                          </td>

                          {/* Fee Amount */}
                          <td className="py-3 px-4">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-emerald-600">Rp</span>
                              <input
                                type="number"
                                min="0"
                                step="500"
                                value={tier.feeAmount}
                                onChange={(e) => handleUpdateTier(tier.id, { feeAmount: Math.max(0, Number(e.target.value) || 0) })}
                                className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 text-xs font-black text-emerald-700 bg-emerald-50/30 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                          </td>

                          {/* Label / Summary */}
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={tier.label || ''}
                              placeholder="e.g. 0 - 50k"
                              onChange={(e) => handleUpdateTier(tier.id, { label: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Action */}
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteTier(tier.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Hapus rentang ini"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Add Tier & Fallback controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2">
              <button
                type="button"
                onClick={handleAddTier}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black uppercase tracking-wider transition-colors border border-indigo-200"
              >
                <Plus size={15} />
                Tambah Rentang Nominal Baru
              </button>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600 font-bold whitespace-nowrap">
                  Biaya Cadangan (Fallback):
                </span>
                <div className="relative w-36">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={currentConfig.fallbackFee || 0}
                    onChange={(e) => updateCurrentConfig({ fallbackFee: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Live Simulation Sandbox */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-inner space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs uppercase tracking-wider">
                <Calculator size={16} />
                Simulator Uji Coba Kalkulasi Realtime Kasir
              </div>
              <span className="text-[11px] text-slate-400">
                Uji coba instan tanpa menyimpan data transaksi
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div>
                <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                  Masukkan Nominal Percobaan (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">Rp</span>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={simTestNominal}
                    onChange={(e) => setSimTestNominal(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[25000, 50000, 75000, 100000, 250000, 1000000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setSimTestNominal(amt)}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                    >
                      {amt >= 1000000 ? `${amt / 1000000}jt` : `${amt / 1000}k`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Matched Tier Info */}
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Hasil Deteksi Tier:
                </div>
                <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse" />
                  {simResult.matchedTier?.label || (simResult.isFallback ? 'Biaya Cadangan (Fallback)' : 'Tarif Flat')}
                </div>
                <div className="text-[11px] text-slate-400">
                  {simResult.matchedTier 
                    ? `Rentang: ${formatRupiah(simResult.matchedTier.minAmount)} s/d ${formatRupiah(simResult.matchedTier.maxAmount)}`
                    : 'Tidak ada tier yang cocok, menggunakan cadangan'}
                </div>
              </div>

              {/* Calculated Fee & Total */}
              <div className="p-3 bg-emerald-950/60 rounded-xl border border-emerald-700/60 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                    Biaya Admin Terhitung:
                  </div>
                  <div className="text-xl font-black text-emerald-300">
                    {formatRupiah(simResult.fee)}
                  </div>
                  <div className="text-[11px] text-emerald-400/80">
                    Total: {formatRupiah(simTestNominal + simResult.fee)}
                  </div>
                </div>
                <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-400">
                  <CheckCircle2 size={24} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
