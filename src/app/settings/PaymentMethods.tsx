import React, { useState } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  CreditCard, 
  Plus, 
  Trash2, 
  Save, 
  CheckCircle,
  XCircle,
  Percent,
  Banknote,
  QrCode
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { PaymentMethod } from '@/core/types';

export default function PaymentMethods() {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Partial<PaymentMethod>>({
    name: '',
    type: 'QRIS',
    mdrPercent: 0,
    status: 'ACTIVE'
  });

  const paymentMethods = useLiveQuery(() => db.paymentMethods.toArray());

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = uuidv4();
    await db.paymentMethods.add({
      ...formData,
      id,
      name: formData.name || 'NEW METHOD',
      type: formData.type || 'QRIS',
      mdrPercent: formData.mdrPercent || 0,
      status: 'ACTIVE'
    } as PaymentMethod);
    setIsAdding(false);
    setFormData({ name: '', type: 'QRIS', mdrPercent: 0, status: 'ACTIVE' });
  };

  const toggleStatus = async (method: PaymentMethod) => {
    await db.paymentMethods.update(method.id, {
      status: method.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    });
  };

  const deleteMethod = async (id: string) => {
    if (confirm('Hapus metode pembayaran ini?')) {
      await db.paymentMethods.delete(id);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'CASH': return <Banknote size={20} />;
      case 'QRIS': return <QrCode size={20} />;
      case 'CARD': return <CreditCard size={20} />;
      default: return <CreditCard size={20} />;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Metode Pembayaran</h2>
          <p className="text-slate-500 text-sm font-medium">Kelola opsi pembayaran dan biaya MDR.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-200"
        >
          <Plus size={18} />
          Tambah Metode
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {paymentMethods?.map((pm) => (
          <div key={pm.id} className={`bg-white p-6 rounded-3xl border-2 transition-all ${pm.status === 'ACTIVE' ? 'border-slate-100 shadow-sm' : 'border-slate-50 opacity-60 grayscale'}`}>
            <div className="flex justify-between items-start mb-6">
              <div className={`p-3 rounded-2xl ${pm.status === 'ACTIVE' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'}`}>
                {getIcon(pm.type)}
              </div>
              <div className="flex gap-1">
                <button 
                  onClick={() => toggleStatus(pm)}
                  className={`p-2 rounded-xl transition-all ${pm.status === 'ACTIVE' ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
                >
                  {pm.status === 'ACTIVE' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                </button>
                <button 
                  onClick={() => deleteMethod(pm.id)}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-1 mb-6">
              <h3 className="font-black text-slate-900 uppercase tracking-tight leading-none">{pm.name}</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{pm.type}</p>
            </div>

            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <Percent size={14} className="text-blue-600" />
              <span className="text-xs font-black text-slate-600 uppercase tracking-widest">MDR: {pm.mdrPercent}%</span>
            </div>
          </div>
        ))}
      </div>

      {isAdding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6">
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Tambah Metode Baru</h3>
            
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Metode</label>
                <input 
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Misal: BCA QRIS, Mandiri Card"
                  value={formData.name ?? ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipe</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.type ?? 'QRIS'}
                  onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                >
                  <option value="QRIS">QRIS</option>
                  <option value="CARD">DEBIT/CREDIT CARD</option>
                  <option value="TRANSFER">BANK TRANSFER</option>
                  <option value="CASH">TUNAI (CASH)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Biaya MDR (%)</label>
                <div className="relative">
                  <input 
                    type="number" step="0.01"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.7"
                    value={formData.mdrPercent ?? 0}
                    onChange={e => setFormData({ ...formData, mdrPercent: Number(e.target.value) })}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="flex-1 py-4 font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-xl hover:bg-blue-500 shadow-lg shadow-blue-200 transition-all"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
