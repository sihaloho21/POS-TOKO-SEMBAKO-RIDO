import React, { useState, useEffect } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Customer, LoyaltySettingsConfig } from '@/core/types';
import { LoyaltyEngine, CustomerLoyaltyStats } from '@/core/loyalty-engine';
import { format } from 'date-fns';
import { 
  X, 
  User, 
  Phone, 
  MapPin, 
  CreditCard, 
  Trophy, 
  Award, 
  Sparkles, 
  CheckCircle2, 
  Coins, 
  TrendingUp, 
  History, 
  ShoppingBag, 
  Edit,
  ArrowRight,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

interface CustomerProfileModalProps {
  customerId: string;
  onClose: () => void;
  onEditCustomer?: (customer: Customer) => void;
  onOpenLoyaltyHistory?: (customerId: string) => void;
  onOpenShoppingHistory?: (customerId: string) => void;
  onOpenReceivables?: (customerId: string) => void;
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

export function CustomerProfileModal({
  customerId,
  onClose,
  onEditCustomer,
  onOpenLoyaltyHistory,
  onOpenShoppingHistory,
  onOpenReceivables
}: CustomerProfileModalProps) {
  const customer = useLiveQuery(() => db.customers.get(customerId), [customerId]);
  const loyaltyConfig = useLiveQuery(() => db.settings.get('loyalty')) as LoyaltySettingsConfig | undefined;
  const [stats, setStats] = useState<CustomerLoyaltyStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Active receivables for debt summary
  const receivables = useLiveQuery(
    () => db.receivables.where('customerId').equals(customerId).toArray(),
    [customerId]
  );

  useEffect(() => {
    let mounted = true;
    setLoadingStats(true);
    LoyaltyEngine.getCustomerStats(customerId).then(s => {
      if (mounted) {
        setStats(s);
        setLoadingStats(false);
      }
    }).catch(err => {
      console.error('Failed to load customer loyalty stats:', err);
      if (mounted) setLoadingStats(false);
    });

    return () => { mounted = false; };
  }, [customerId, customer?.loyaltyPoints, loyaltyConfig]);

  if (!customer) return null;

  const totalDebt = (receivables || [])
    .filter(r => r.status === 'OPEN' || r.status === 'PARTIAL' || r.status === 'OVERDUE')
    .reduce((acc, r) => acc + (r.remainingAmount || 0), 0);

  const remainingCredit = Math.max(0, (customer.creditLimit || 0) - totalDebt);

  const theme = stats?.tierColorScheme && TIER_THEME[stats.tierColorScheme] 
    ? TIER_THEME[stats.tierColorScheme] 
    : TIER_THEME.BRONZE;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black text-lg shadow-md shadow-blue-200">
              {customer.name[0]?.toUpperCase() || 'P'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">
                  {customer.name}
                </h3>
                {customer.isReseller && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-wider border border-amber-200">
                    Reseller
                  </span>
                )}
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${
                  customer.status === 'ACTIVE' 
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                    : 'bg-rose-50 text-rose-600 border-rose-200'
                }`}>
                  {customer.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Profil Pelanggan & Kartu Member Loyalitas
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-full transition-colors cursor-pointer"
            title="Tutup"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          
          {/* Member Tier & Next Tier Progress Card */}
          <div className={`p-6 rounded-3xl bg-gradient-to-br ${theme.bg} text-white shadow-xl ${theme.border} border relative overflow-hidden`}>
            {/* Background ambient pattern */}
            <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
              <Trophy size={160} />
            </div>

            <div className="relative z-10 space-y-5">
              {/* Tier Header & Badges */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="px-3 py-1 rounded-xl bg-white/20 backdrop-blur-md text-xs font-black uppercase tracking-wider border border-white/20 flex items-center gap-1.5 shadow-sm">
                    <Award size={14} className={theme.accent} />
                    <span>Member Tier {stats?.tier || 'BRONZE'}</span>
                  </span>

                  {stats && stats.tierDiscountPercent > 0 && (
                    <span className="px-2.5 py-1 rounded-xl bg-emerald-500/90 text-white text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1">
                      <Sparkles size={11} />
                      Diskon Member {stats.tierDiscountPercent}%
                    </span>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold opacity-75 tracking-wider block">
                    Saldo Poin
                  </span>
                  <span className="text-xl font-black tracking-tight tabular-nums">
                    {(customer.loyaltyPoints || 0).toLocaleString()} <span className="text-xs font-bold opacity-80">PTS</span>
                  </span>
                </div>
              </div>

              {/* Progress to Next Tier */}
              <div className="space-y-2 pt-2 border-t border-white/20">
                <div className="flex justify-between items-end text-xs font-black">
                  <div className="flex items-center gap-1.5">
                    <span className="opacity-90">
                      {stats?.nextTier ? (
                        <>Menuju <strong className="underline underline-offset-2">{stats.nextTier}</strong></>
                      ) : (
                        <span className="flex items-center gap-1">
                          <ShieldCheck size={14} className="text-amber-300" />
                          Tingkat Member Tertinggi
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="text-sm font-black tabular-nums bg-black/20 px-2 py-0.5 rounded-lg">
                    {stats?.progressPercent || 0}%
                  </span>
                </div>

                {/* Progress Track */}
                <div className="w-full bg-black/30 h-3.5 rounded-full overflow-hidden p-0.5 border border-white/10 shadow-inner">
                  <div 
                    className={`${theme.bar} h-full rounded-full transition-all duration-700 shadow-sm`}
                    style={{ width: `${Math.min(100, Math.max(3, stats?.progressPercent || 0))}%` }}
                  />
                </div>

                {/* Next Tier Requirements Description */}
                {stats?.nextTier ? (
                  <div className="flex items-center gap-2 text-xs opacity-95 font-medium pt-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span>
                      {stats.qualificationBasis === 'LIFETIME_SPEND' ? (
                        <>
                          Butuh belanja <strong className="font-black text-white">Rp {stats.spendToNextTier.toLocaleString()}</strong> lagi untuk naik level.
                        </>
                      ) : (
                        <>
                          Kumpulkan <strong className="font-black text-white">{stats.pointsToNextTier.toLocaleString()} Pts</strong> lagi (setara belanja ~Rp {stats.spendToNextTier.toLocaleString()}) untuk naik tier.
                        </>
                      )}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs opacity-90 font-medium pt-1">
                    Pelanggan telah mencapai tier eksklusif tertinggi dengan benefit belanja maksimal!
                  </p>
                )}
              </div>

              {/* Tier Perks Checklist */}
              {stats?.tierPerks && stats.tierPerks.length > 0 && (
                <div className="pt-2 border-t border-white/15">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2">
                    Keuntungan Tier {stats.tier}:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {stats.tierPerks.map((perk, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/20 text-[11px] font-bold border border-white/10">
                        <CheckCircle2 size={12} className="text-emerald-300 shrink-0" />
                        <span>{perk}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Metrics: Saldo Poin & Nilai Tukar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Saldo Poin
              </span>
              <p className="text-lg font-black text-amber-600 tabular-nums">
                {(customer.loyaltyPoints || 0).toLocaleString()} <span className="text-[10px] font-bold text-slate-500">Pts</span>
              </p>
              <span className="text-[10px] text-slate-400 font-medium">Dapat ditukarkan</span>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Nilai Tukar
              </span>
              <p className="text-lg font-black text-slate-900 tabular-nums">
                Rp {((customer.loyaltyPoints || 0) * (loyaltyConfig?.pointRedemptionValue || 100)).toLocaleString()}
              </p>
              <span className="text-[10px] text-slate-400 font-medium">1 Pts = Rp {loyaltyConfig?.pointRedemptionValue || 100}</span>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Total Belanja
              </span>
              <p className="text-lg font-black text-blue-600 tabular-nums">
                Rp {(stats?.totalSpend || 0).toLocaleString()}
              </p>
              <span className="text-[10px] text-slate-400 font-medium">Akumulasi transaksi</span>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Total Poin Didapat
              </span>
              <p className="text-lg font-black text-emerald-600 tabular-nums">
                +{(stats?.totalEarned || 0).toLocaleString()} <span className="text-[10px] font-bold text-slate-500">Pts</span>
              </p>
              <span className="text-[10px] text-slate-400 font-medium">Reward seumur hidup</span>
            </div>
          </div>

          {/* Contact & Credit Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Contact Card */}
            <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-3">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <User size={15} className="text-blue-500" />
                Informasi Kontak & Akun
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Phone size={14} className="text-slate-400 shrink-0" />
                  <span className="font-bold text-slate-800">{customer.phone || 'Belum ada nomor HP'}</span>
                </div>
                <div className="flex items-start gap-2.5 text-slate-600">
                  <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                  <span className="font-medium text-slate-700">{customer.address || 'Alamat belum diatur'}</span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between text-[11px]">
                  <span className="text-slate-400 font-bold uppercase">Terdaftar Pada</span>
                  <span className="font-black text-slate-700">
                    {customer.createdAt ? format(new Date(customer.createdAt), 'dd MMMM yyyy') : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Credit & Receivable Card */}
            <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <CreditCard size={15} className="text-amber-500" />
                  Limit Piutang & Kredit
                </h4>
                {onOpenReceivables && (
                  <button 
                    onClick={() => {
                      onClose();
                      onOpenReceivables(customerId);
                    }}
                    className="text-[10px] font-black text-blue-600 hover:underline uppercase"
                  >
                    Detail Piutang
                  </button>
                )}
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Limit Kredit Toko:</span>
                  <span className="font-black text-slate-900">Rp {(customer.creditLimit || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Hutang Aktif Saat Ini:</span>
                  <span className={`font-black ${totalDebt > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                    Rp {totalDebt.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Sisa Kredit Tersedia:</span>
                  <span className="font-black text-emerald-600">Rp {remainingCredit.toLocaleString()}</span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between text-[11px]">
                  <span className="text-slate-400 font-bold uppercase">Jatuh Tempo Default</span>
                  <span className="font-black text-slate-700">{customer.defaultDueDateDays || 30} Hari</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer / Navigation Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-2 justify-between items-center">
          <div className="flex gap-2">
            {onOpenLoyaltyHistory && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLoyaltyHistory(customerId);
                }}
                className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 border border-amber-200 cursor-pointer"
              >
                <History size={14} className="text-amber-600" />
                <span>Riwayat Poin & Tukar</span>
              </button>
            )}

            {onOpenShoppingHistory && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenShoppingHistory(customerId);
                }}
                className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 border border-emerald-200 cursor-pointer"
              >
                <ShoppingBag size={14} className="text-emerald-600" />
                <span>Riwayat Belanja</span>
              </button>
            )}
          </div>

          <div className="flex gap-2">
            {onEditCustomer && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditCustomer(customer);
                }}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-blue-200 cursor-pointer"
              >
                <Edit size={14} />
                <span>Edit Pelanggan</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
