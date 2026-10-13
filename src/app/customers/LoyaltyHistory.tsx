import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { LoyaltyEngine, CustomerLoyaltyStats } from '@/core/loyalty-engine';
import { format } from 'date-fns';
import { 
  Trophy, 
  ArrowUpRight, 
  ArrowDownRight, 
  RefreshCcw, 
  Award, 
  Sparkles, 
  Gift, 
  PlusCircle, 
  MinusCircle, 
  X, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Clock
} from 'lucide-react';

interface LoyaltyHistoryProps {
  customerId: string;
}

export function LoyaltyHistory({ customerId }: LoyaltyHistoryProps) {
  const customer = useLiveQuery(() => db.customers.get(customerId), [customerId]);
  const history = useLiveQuery(() => LoyaltyEngine.getHistory(customerId), [customerId]);

  const [stats, setStats] = useState<CustomerLoyaltyStats | null>(null);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<'EARN' | 'REDEEM'>('REDEEM');
  const [adjustPoints, setAdjustPoints] = useState<number>(50);
  const [adjustReason, setAdjustReason] = useState<string>('Penukaran Hadiah Voucher / Sembako');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // Refresh stats whenever customer or history changes
  useEffect(() => {
    let isMounted = true;
    LoyaltyEngine.getCustomerStats(customerId).then(s => {
      if (isMounted) setStats(s);
    });
    return () => { isMounted = false; };
  }, [customerId, customer?.loyaltyPoints, history]);

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adjustPoints <= 0 || !adjustReason.trim()) return;

    if (adjustType === 'REDEEM' && (customer?.loyaltyPoints || 0) < adjustPoints) {
      alert(`Saldo poin tidak mencukupi! Saldo saat ini hanya ${(customer?.loyaltyPoints || 0).toLocaleString()} Pts.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await LoyaltyEngine.recordAdjustmentEvent({
        customerId,
        type: adjustType,
        points: adjustPoints,
        reason: adjustReason.trim()
      });

      setFeedbackMsg(
        adjustType === 'EARN'
          ? `Berhasil menambahkan +${adjustPoints} Pts untuk ${customer?.name}!`
          : `Berhasil menukarkan -${adjustPoints} Pts untuk ${customer?.name}!`
      );
      setTimeout(() => setFeedbackMsg(''), 4000);
      setIsAdjustmentModalOpen(false);
      setAdjustPoints(50);
    } catch (err: any) {
      alert(err.message || 'Gagal memperbarui poin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!customer) return null;

  const tierColors = {
    BRONZE: 'from-amber-700/80 to-amber-900 border-amber-600/40 text-amber-200',
    SILVER: 'from-slate-400 to-slate-600 border-slate-300/40 text-slate-100',
    GOLD: 'from-amber-400 to-yellow-600 border-yellow-300/50 text-yellow-950',
    PLATINUM: 'from-purple-600 to-indigo-800 border-purple-400/40 text-purple-100'
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-6 p-6">
      {/* Top Header & Quick Action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center border border-amber-500/20">
            <Trophy size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Loyalty Point Tracker & Member Tier
              </h3>
              {customer.isReseller && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase">
                  Reseller (Non-Poin)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Riwayat pengumpulan poin belanja otomatis (1 Pts tiap Rp 10.000) dan penukaran reward.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAdjustmentModalOpen(true)}
          className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-amber-200 flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <Gift size={15} />
          <span>Tukar Hadiah / Sesuaikan Poin</span>
        </button>
      </div>

      {feedbackMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Hero Loyalty Card: Tier, Progress & Summary Stats */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Tier Card */}
          <div className={`p-5 rounded-2xl bg-gradient-to-br ${tierColors[stats.tier]} shadow-md border flex flex-col justify-between text-white`}>
            <div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
                  Status Member
                </span>
                <span className="px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <Award size={12} />
                  Tier {stats.tier}
                </span>
              </div>
              <h4 className="text-2xl font-black tracking-tight mb-1">
                {stats.currentPoints.toLocaleString()} <span className="text-sm font-bold opacity-80">PTS</span>
              </h4>
              <p className="text-xs opacity-90 font-medium">
                Saldo Poin Tersedia
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/20 space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold opacity-90">
                <span>{stats.nextTier ? `Menuju ${stats.nextTier}` : 'Level Maksimal'}</span>
                <span>{stats.progressPercent}%</span>
              </div>
              <div className="w-full bg-black/20 h-2 rounded-full overflow-hidden p-0.5">
                <div 
                  className="bg-white h-full rounded-full transition-all duration-500"
                  style={{ width: `${stats.progressPercent}%` }}
                />
              </div>
              {stats.nextTier && (
                <p className="text-[10px] opacity-80 italic">
                  Butuh {stats.pointsToNextTier} Pts lagi untuk naik ke tingkat berikutnya.
                </p>
              )}
            </div>
          </div>

          {/* Metric Stats Cards */}
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Total Poin Diperoleh
              </span>
              <div className="my-2">
                <span className="text-xl font-black text-emerald-600 tabular-nums">
                  +{stats.totalEarned.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 ml-1 font-bold">PTS</span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium">
                Akumulasi belanja seumur hidup
              </span>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Poin Ditukarkan
              </span>
              <div className="my-2">
                <span className="text-xl font-black text-amber-600 tabular-nums">
                  -{stats.totalRedeemed.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 ml-1 font-bold">PTS</span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium">
                Klaim hadiah sembako/diskon
              </span>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col justify-between col-span-2 sm:col-span-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Keuntungan Tier
              </span>
              <ul className="my-1.5 space-y-1">
                {stats.tierPerks.slice(0, 2).map((perk, idx) => (
                  <li key={idx} className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 truncate">
                    <Sparkles size={11} className="text-amber-500 shrink-0" />
                    <span className="truncate">{perk}</span>
                  </li>
                ))}
              </ul>
              <span className="text-[10px] text-amber-600 font-bold">
                ✓ Otomatis aktif di kasir
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Ledger Table Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            <Clock size={15} className="text-slate-400" />
            Buku Catatan Poin (Loyalty Ledger)
          </h4>
          <span className="text-[11px] text-slate-400 font-medium">
            {history?.length || 0} riwayat transaksi tercatat
          </span>
        </div>

        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider font-black border-b border-slate-200">
                <th className="py-3 px-4">Waktu</th>
                <th className="py-3 px-4">Tipe Aksi</th>
                <th className="py-3 px-4">Keterangan / Alasan</th>
                <th className="py-3 px-4 text-center">Perubahan Poin</th>
                <th className="py-3 px-4 text-right">No. Referensi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history && history.length > 0 ? (
                history.map((h) => (
                  <tr key={h.loyaltyEventId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-600 whitespace-nowrap">
                      {format(new Date(h.timestamp), 'dd/MM/yyyy HH:mm')}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        h.type === 'EARN' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : h.type === 'REDEEM'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {h.type === 'EARN' ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                        {h.type === 'EARN' ? 'DIPEROLEH' : h.type === 'REDEEM' ? 'DITUKARKAN' : 'DIBALIKKAN'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {h.notes || (h.type === 'EARN' ? 'Poin dari belanja kasir POS' : h.type === 'REVERSAL' ? 'Retur pembelian' : 'Penukaran poin')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-black tabular-nums ${
                        h.points > 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {h.points > 0 ? `+${h.points}` : h.points} Pts
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[11px] text-slate-500">
                      {h.referenceId}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    <RefreshCcw size={32} className="mx-auto mb-2 opacity-30 animate-spin-slow" />
                    <p className="font-bold">Belum ada riwayat poin loyalty.</p>
                    <p className="text-[11px] mt-0.5">Poin akan otomatis tercatat setiap kali pelanggan ini bertransaksi di POS.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Point Adjustment / Redemption Modal */}
      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 text-amber-600">
                <Gift size={20} />
                <h4 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                  Sesuaikan Poin / Tukar Hadiah
                </h4>
              </div>
              <button 
                onClick={() => setIsAdjustmentModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="space-y-4">
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs">
                <div className="flex justify-between items-center text-amber-900 font-bold">
                  <span>Pelanggan:</span>
                  <span>{customer.name}</span>
                </div>
                <div className="flex justify-between items-center text-amber-900 font-black mt-1">
                  <span>Saldo Saat Ini:</span>
                  <span className="text-sm">{(customer.loyaltyPoints || 0).toLocaleString()} Pts</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Jenis Penyesuaian
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('REDEEM')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      adjustType === 'REDEEM'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Tukar Hadiah / Kurangi
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('EARN')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      adjustType === 'EARN'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Tambah Bonus / Koreksi
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Jumlah Poin (Pts) *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={adjustPoints}
                  onChange={(e) => setAdjustPoints(Math.max(1, Number(e.target.value)))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 outline-none focus:border-amber-500 tabular-nums"
                />
                {/* Quick Presets */}
                <div className="flex gap-1.5 mt-1.5">
                  {[10, 25, 50, 100, 200].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAdjustPoints(preset)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold"
                    >
                      {preset} Pts
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Keterangan / Alasan *
                </label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Contoh: Tukar Minyak Goreng 1L, Bonus Ultah, dll"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-amber-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Penyesuaian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
