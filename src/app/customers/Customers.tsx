import React, { useState, useEffect } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Users, 
  Search, 
  Plus, 
  UserPlus,
  Phone,
  CreditCard,
  History,
  Trophy,
  ShoppingBag,
  Edit,
  Trash2,
  AlertTriangle,
  Award,
  User,
  Sparkles
} from 'lucide-react';
import { LoyaltyHistory } from './LoyaltyHistory';
import { RecentActivity } from './RecentActivity';
import { CustomerBalance } from './CustomerBalance';
import { CustomerModal } from './CustomerModal';
import { CustomerProfileModal } from './CustomerProfileModal';
import { LoyaltyEngine, CustomerLoyaltyStats } from '@/core/loyalty-engine';
import type { Customer } from '@/core/types';
import { useToastStore } from '@/core/toast-store';

const TIER_BADGE_STYLE: Record<string, { badge: string; bar: string; text: string }> = {
  BRONZE: {
    badge: 'bg-amber-100 text-amber-900 border-amber-300',
    bar: 'bg-amber-600',
    text: 'text-amber-700'
  },
  SILVER: {
    badge: 'bg-slate-200 text-slate-800 border-slate-300',
    bar: 'bg-slate-500',
    text: 'text-slate-700'
  },
  GOLD: {
    badge: 'bg-yellow-100 text-yellow-900 border-yellow-400',
    bar: 'bg-amber-500',
    text: 'text-amber-800'
  },
  PLATINUM: {
    badge: 'bg-purple-100 text-purple-900 border-purple-300',
    bar: 'bg-purple-600',
    text: 'text-purple-700'
  },
  EMERALD: {
    badge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    bar: 'bg-emerald-600',
    text: 'text-emerald-700'
  },
  BLUE: {
    badge: 'bg-blue-100 text-blue-900 border-blue-300',
    bar: 'bg-blue-600',
    text: 'text-blue-700'
  },
  ROSE: {
    badge: 'bg-rose-100 text-rose-900 border-rose-300',
    bar: 'bg-rose-600',
    text: 'text-rose-700'
  }
};

function CustomerTierCell({ 
  customerId, 
  points, 
  isReseller,
  onClick 
}: { 
  customerId: string; 
  points: number; 
  isReseller?: boolean;
  onClick?: () => void;
}) {
  const [stats, setStats] = useState<CustomerLoyaltyStats | null>(null);

  useEffect(() => {
    let active = true;
    LoyaltyEngine.getCustomerStats(customerId).then(s => {
      if (active) setStats(s);
    });
    return () => { active = false; };
  }, [customerId, points]);

  if (!stats) {
    return (
      <div className="flex items-center gap-2">
        <Trophy size={16} className="text-amber-500" />
        <span className="text-sm font-black text-slate-900 tabular-nums">
          {(points || 0).toLocaleString()} <span className="text-[10px] text-slate-400 uppercase tracking-widest">Pts</span>
        </span>
      </div>
    );
  }

  const style = (stats.tierColorScheme && TIER_BADGE_STYLE[stats.tierColorScheme]) || TIER_BADGE_STYLE.BRONZE;

  return (
    <div 
      onClick={onClick} 
      className="space-y-1.5 cursor-pointer group/tier select-none py-1"
      title="Klik untuk melihat profil & detail tier"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-xs ${style.badge}`}>
          <Award size={11} />
          <span>Tier {stats.tier}</span>
        </span>

        {stats.tierDiscountPercent > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Sparkles size={9} />
            -{stats.tierDiscountPercent}%
          </span>
        )}

        <span className="text-xs font-black text-slate-900 tabular-nums ml-auto">
          {(points || 0).toLocaleString()} <span className="text-[9px] text-slate-400 uppercase font-bold">Pts</span>
        </span>
      </div>

      {/* Progress Bar to Next Tier */}
      <div className="space-y-1">
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
            style={{ width: `${Math.min(100, Math.max(4, stats.progressPercent))}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
          {stats.nextTier ? (
            <>
              <span className="truncate max-w-[130px] font-semibold text-slate-500">
                {stats.progressPercent}% ke {stats.nextTier.split(' ')[0]}
              </span>
              <span className="font-bold text-slate-500 shrink-0">
                {stats.qualificationBasis === 'LIFETIME_SPEND' 
                  ? `-Rp ${Math.round(stats.spendToNextTier / 1000)}k` 
                  : `-${stats.pointsToNextTier} Pts`}
              </span>
            </>
          ) : (
            <span className="text-amber-600 font-bold">Level Tertinggi</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Customers() {
  const { addToast } = useToastStore();
  const [search, setSearch] = useState('');
  const [viewingProfileCustomerId, setViewingProfileCustomerId] = useState<string | null>(null);
  const [viewingLoyaltyId, setViewingLoyaltyId] = useState<string | null>(null);
  const [viewingActivityId, setViewingActivityId] = useState<string | null>(null);
  const [viewingBalanceId, setViewingBalanceId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>(undefined);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const customers = useLiveQuery(
    () => db.customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search)).toArray(),
    [search]
  );

  const handleDeleteCustomer = async () => {
    if (!deletingCustomer) return;
    setIsDeleting(true);
    try {
      const customerId = deletingCustomer.customerId;
      // Check if customer has unpaid receivables
      const unpaidReceivables = await db.receivables
        .where('customerId')
        .equals(customerId)
        .filter(r => r.status !== 'PAID' && (r.remainingAmount || 0) > 0)
        .count();

      if (unpaidReceivables > 0) {
        addToast(`Tidak dapat menghapus ${deletingCustomer.name} karena masih memiliki ${unpaidReceivables} tagihan piutang yang belum lunas.`, 'error');
        setDeletingCustomer(null);
        return;
      }

      const timestamp = new Date().toISOString();
      await db.customers.delete(customerId);
      await db.syncQueue.add({
        entityType: 'customers',
        entityId: customerId,
        action: 'DELETE',
        payload: { customerId },
        status: 'PENDING',
        retryCount: 0,
        createdAt: timestamp
      });

      if (viewingLoyaltyId === customerId) setViewingLoyaltyId(null);
      if (viewingActivityId === customerId) setViewingActivityId(null);
      if (viewingBalanceId === customerId) setViewingBalanceId(null);

      addToast(`Data pelanggan "${deletingCustomer.name}" berhasil dihapus.`, 'success');
      setDeletingCustomer(null);
    } catch (error) {
      console.error('Failed to delete customer:', error);
      addToast('Gagal menghapus data pelanggan.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Database Pelanggan</h2>
          <p className="text-slate-500 text-sm font-medium">Kelola member, loyalty poin, dan piutang pelanggan.</p>
        </div>
        <button 
          onClick={() => {
            setEditingCustomer(undefined);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-200"
        >
          <UserPlus size={18} />
          Tambah Pelanggan
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari nama atau nomor HP..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-sm"
              value={search ?? ''}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                <th className="px-6 py-4">Nama Pelanggan</th>
                <th className="px-6 py-4">Kontak</th>
                <th className="px-6 py-4 min-w-[220px]">Member Tier & Loyalitas</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-300">
                      <Users size={48} className="mb-4 opacity-20" />
                      <p className="text-sm font-bold uppercase tracking-widest">Belum ada data pelanggan</p>
                    </div>
                  </td>
                </tr>
              ) : (
                customers?.map((customer) => (
                  <React.Fragment key={customer.customerId}>
                    <tr className={`hover:bg-slate-50/50 transition-colors group ${viewingLoyaltyId === customer.customerId ? 'bg-slate-50' : ''}`}>
                      <td className="px-6 py-4">
                        <div 
                          onClick={() => setViewingProfileCustomerId(customer.customerId)}
                          className="flex items-center gap-3 cursor-pointer group/name select-none"
                          title="Klik untuk membuka profil pelanggan"
                        >
                          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-black shadow-sm group-hover/name:bg-blue-600 group-hover/name:text-white transition-all">
                            {customer.name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 group-hover/name:text-blue-600 transition-colors uppercase tracking-tight flex items-center gap-1.5">
                              <span>{customer.name}</span>
                            </p>
                            {customer.isReseller && (
                              <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-widest border border-amber-200/60 inline-block mt-0.5">
                                Reseller
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 tabular-nums">
                          <Phone size={14} className="text-slate-400" />
                          {customer.phone || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <CustomerTierCell 
                          customerId={customer.customerId} 
                          points={customer.loyaltyPoints || 0}
                          isReseller={customer.isReseller}
                          onClick={() => setViewingProfileCustomerId(customer.customerId)}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${customer.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                          {customer.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 sm:opacity-70 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={() => setViewingProfileCustomerId(customer.customerId)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Lihat Profil & Kartu Member"
                          >
                            <User size={18} />
                          </button>
                          <button 
                            onClick={() => {
                              setViewingBalanceId(viewingBalanceId === customer.customerId ? null : customer.customerId);
                              setViewingActivityId(null);
                              setViewingLoyaltyId(null);
                            }}
                            className={`p-2 rounded-lg transition-all ${viewingBalanceId === customer.customerId ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                            title="Status Piutang & Kredit"
                          >
                            <CreditCard size={18} />
                          </button>
                          <button 
                            onClick={() => {
                              setViewingActivityId(viewingActivityId === customer.customerId ? null : customer.customerId);
                              setViewingLoyaltyId(null);
                              setViewingBalanceId(null);
                            }}
                            className={`p-2 rounded-lg transition-all ${viewingActivityId === customer.customerId ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                            title="Aktivitas Belanja"
                          >
                            <ShoppingBag size={18} />
                          </button>
                          <button 
                            onClick={() => {
                              setViewingLoyaltyId(viewingLoyaltyId === customer.customerId ? null : customer.customerId);
                              setViewingActivityId(null);
                              setViewingBalanceId(null);
                            }}
                            className={`p-2 rounded-lg transition-all ${viewingLoyaltyId === customer.customerId ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
                            title="Riwayat Poin"
                          >
                            <History size={18} />
                          </button>
                          <button 
                            onClick={() => {
                              setEditingCustomer(customer);
                              setIsModalOpen(true);
                            }}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Edit Pelanggan"
                          >
                            <Edit size={18} />
                          </button>
                          <button 
                            onClick={() => setDeletingCustomer(customer)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            title="Hapus Pelanggan"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {viewingBalanceId === customer.customerId && (
                      <tr>
                        <td colSpan={5} className="px-6 py-6 bg-slate-50/30">
                          <div className="max-w-3xl mx-auto">
                            <CustomerBalance customerId={customer.customerId} />
                          </div>
                        </td>
                      </tr>
                    )}
                    {viewingActivityId === customer.customerId && (
                      <tr>
                        <td colSpan={5} className="px-6 py-6 bg-slate-50/30">
                          <div className="max-w-3xl mx-auto">
                            <RecentActivity customerId={customer.customerId} />
                          </div>
                        </td>
                      </tr>
                    )}
                    {viewingLoyaltyId === customer.customerId && (
                      <tr>
                        <td colSpan={5} className="px-6 py-6 bg-slate-50/30">
                          <div className="max-w-3xl mx-auto">
                            <LoyaltyHistory customerId={customer.customerId} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {viewingProfileCustomerId && (
        <CustomerProfileModal 
          customerId={viewingProfileCustomerId}
          onClose={() => setViewingProfileCustomerId(null)}
          onEditCustomer={(cust) => {
            setViewingProfileCustomerId(null);
            setEditingCustomer(cust);
            setIsModalOpen(true);
          }}
          onOpenLoyaltyHistory={(id) => {
            setViewingProfileCustomerId(null);
            setViewingLoyaltyId(id);
            setViewingActivityId(null);
            setViewingBalanceId(null);
          }}
          onOpenShoppingHistory={(id) => {
            setViewingProfileCustomerId(null);
            setViewingActivityId(id);
            setViewingLoyaltyId(null);
            setViewingBalanceId(null);
          }}
          onOpenReceivables={(id) => {
            setViewingProfileCustomerId(null);
            setViewingBalanceId(id);
            setViewingLoyaltyId(null);
            setViewingActivityId(null);
          }}
        />
      )}

      {isModalOpen && (
        <CustomerModal 
          customer={editingCustomer}
          onClose={() => {
            setIsModalOpen(false);
            setEditingCustomer(undefined);
          }}
        />
      )}

      {deletingCustomer && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Hapus Pelanggan?</h3>
                <p className="text-xs font-medium text-slate-500 leading-relaxed">
                  Apakah Anda yakin ingin menghapus pelanggan <span className="font-black text-slate-800">{deletingCustomer.name}</span> dari database? Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingCustomer(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteCustomer}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-200 flex items-center justify-center gap-2"
              >
                <Trash2 size={16} />
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MoreVertical({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
    </svg>
  );
}
