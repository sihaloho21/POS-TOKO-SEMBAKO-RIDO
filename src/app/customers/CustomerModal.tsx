import React, { useState, useEffect } from 'react';
import { db } from '@/core/database';
import type { Customer } from '@/core/types';
import { X, User, Phone, MapPin, CreditCard, Save, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface CustomerModalProps {
  customer?: Customer;
  onClose: () => void;
}

export function CustomerModal({ customer, onClose }: CustomerModalProps) {
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

  useEffect(() => {
    if (customer) {
      setFormData(customer);
    }
  }, [customer]);

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

      onClose();
    } catch (error) {
      console.error('Failed to save customer:', error);
      alert('Gagal menyimpan data pelanggan.');
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
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
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
