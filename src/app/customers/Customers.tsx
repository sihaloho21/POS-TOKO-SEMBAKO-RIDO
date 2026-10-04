import React, { useState } from 'react';
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
  Edit
} from 'lucide-react';
import { LoyaltyHistory } from './LoyaltyHistory';
import { RecentActivity } from './RecentActivity';
import { CustomerBalance } from './CustomerBalance';
import { CustomerModal } from './CustomerModal';
import type { Customer } from '@/core/types';

export default function Customers() {
  const [search, setSearch] = useState('');
  const [viewingLoyaltyId, setViewingLoyaltyId] = useState<string | null>(null);
  const [viewingActivityId, setViewingActivityId] = useState<string | null>(null);
  const [viewingBalanceId, setViewingBalanceId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>(undefined);

  const customers = useLiveQuery(
    () => db.customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search)).toArray(),
    [search]
  );

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
              value={search}
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
                <th className="px-6 py-4">Total Poin</th>
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
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-black shadow-sm">
                            {customer.name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 uppercase tracking-tight">{customer.name}</p>
                            {customer.isReseller && <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-widest">Reseller</span>}
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
                        <div className="flex items-center gap-2">
                          <Trophy size={16} className="text-amber-500" />
                          <span className="text-sm font-black text-slate-900 tabular-nums">{(customer.loyaltyPoints || 0).toLocaleString()} <span className="text-[10px] text-slate-400 uppercase tracking-widest">Pts</span></span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${customer.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                          {customer.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
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
      {isModalOpen && (
        <CustomerModal 
          customer={editingCustomer}
          onClose={() => {
            setIsModalOpen(false);
            setEditingCustomer(undefined);
          }}
        />
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
