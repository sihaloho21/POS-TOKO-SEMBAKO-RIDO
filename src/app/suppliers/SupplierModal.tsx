import React, { useState, useEffect } from 'react';
import { X, Building2, Phone, MapPin, FileText, CheckCircle2 } from 'lucide-react';
import type { Supplier } from '@/core/types';
import { SupplierService } from '@/core/services/supplier-service';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier?: Supplier;
  onSuccess?: () => void;
}

export function SupplierModal({ isOpen, onClose, supplier, onSuccess }: SupplierModalProps) {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (supplier) {
      setName(supplier.name || '');
      setPhone(supplier.phone || '');
      setAddress(supplier.address || '');
      setNotes(supplier.notes || '');
      setStatus(supplier.status || 'ACTIVE');
    } else {
      setName('');
      setPhone('');
      setAddress('');
      setNotes('');
      setStatus('ACTIVE');
    }
    setErrorMessage('');
  }, [supplier, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Nama supplier wajib diisi');
      return;
    }

    if (!currentUser) {
      setErrorMessage('Pengguna tidak terautentikasi');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      if (supplier) {
        // Update existing
        await SupplierService.updateSupplier(
          supplier.supplierId,
          {
            name: name.trim(),
            phone: phone.trim() || undefined,
            address: address.trim() || undefined,
            notes: notes.trim() || undefined,
            status,
          },
          currentUser.userId
        );
        addToast(`Supplier "${name}" berhasil diperbarui`, 'success');
      } else {
        // Create new
        await SupplierService.createSupplier({
          name: name.trim(),
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          notes: notes.trim() || undefined,
          status,
          userId: currentUser.userId,
        });
        addToast(`Supplier "${name}" berhasil ditambahkan`, 'success');
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan supplier');
      addToast(err.message || 'Gagal menyimpan supplier', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div 
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-200">
              <Building2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                {supplier ? 'Edit Data Supplier' : 'Tambah Supplier Baru'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {supplier ? 'Perbarui informasi distributor & kontak' : 'Daftarkan mitra pemasok sembako atau ikan'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold">
              {errorMessage}
            </div>
          )}

          {/* Supplier Name */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
              Nama Supplier / Distributor <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                value={name ?? ''}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: PT Wings Surya Distributor / CV Beras Cipinang"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
          </div>

          {/* Phone / WhatsApp */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
              Nomor Telepon / WhatsApp
            </label>
            <div className="relative">
              <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={phone ?? ''}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Contoh: 081234567890"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Dapat digunakan untuk tombol chat WhatsApp langsung.</p>
          </div>

          {/* Address */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
              Alamat Kantor / Gudang
            </label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3.5 top-3 text-slate-400" />
              <textarea
                rows={2}
                value={address ?? ''}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Contoh: Pasar Induk Beras Cipinang Blok A No. 12"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
              />
            </div>
          </div>

          {/* Notes / Terms */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
              Catatan / Syarat Pembayaran (Term of Payment)
            </label>
            <div className="relative">
              <FileText size={16} className="absolute left-3.5 top-3 text-slate-400" />
              <textarea
                rows={3}
                value={notes ?? ''}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Pembayaran tempo 14 hari, minimal order 10 peti telur, pengiriman Selasa & Jumat."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
              Status Supplier
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStatus('ACTIVE')}
                className={`py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all flex items-center justify-center gap-2 ${
                  status === 'ACTIVE'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <CheckCircle2 size={16} className={status === 'ACTIVE' ? 'text-emerald-600' : 'text-slate-400'} />
                Aktif
              </button>
              <button
                type="button"
                onClick={() => setStatus('INACTIVE')}
                className={`py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all flex items-center justify-center gap-2 ${
                  status === 'INACTIVE'
                    ? 'bg-amber-50 border-amber-500 text-amber-700 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <X size={16} className={status === 'INACTIVE' ? 'text-amber-600' : 'text-slate-400'} />
                Non-Aktif
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-200 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Menyimpan...</span>
              ) : (
                <span>{supplier ? 'Simpan Perubahan' : 'Tambah Supplier'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
