import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Plus, Trash2, CheckCircle2, XCircle, Tag, ShieldAlert } from 'lucide-react';
import { db } from '@/core/database';
import { PayrollService } from '@/core/services/payroll-service';
import { useToastStore } from '@/core/toast-store';
import type { BonusCategory } from '@/core/types';
import { useFirestoreCollection } from '@/core/firestore-realtime';

interface BonusCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BonusCategoryModal({ isOpen, onClose }: BonusCategoryModalProps) {
  const { addToast } = useToastStore();
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Realtime Cloud Firestore for Bonus Categories
  const { data: cloudCategories } = useFirestoreCollection<BonusCategory>('bonusCategories');
  const localCategories = useLiveQuery(async () => {
    return await PayrollService.getAllBonusCategories();
  }, []);

  const categories = React.useMemo(() => {
    if (cloudCategories && cloudCategories.length > 0) return cloudCategories;
    return localCategories || [];
  }, [cloudCategories, localCategories]);

  if (!isOpen) return null;

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      addToast('Nama kategori bonus tidak boleh kosong', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await PayrollService.saveBonusCategory({
        name: newCatName.trim(),
        description: newCatDesc.trim(),
        isActive: true
      });
      setNewCatName('');
      setNewCatDesc('');
      addToast('Kategori bonus baru berhasil ditambahkan', 'success');
    } catch (err: any) {
      addToast(err?.message || 'Gagal menambahkan kategori', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (cat: BonusCategory) => {
    try {
      await PayrollService.toggleCategoryActive(cat.id);
      addToast(`Kategori ${cat.name} ${cat.isActive ? 'dinonaktifkan' : 'diaktifkan'}`, 'info');
    } catch (err: any) {
      addToast('Gagal mengubah status kategori', 'error');
    }
  };

  const handleDelete = async (cat: BonusCategory) => {
    if (cat.isSystem) {
      addToast('Kategori default sistem tidak dapat dihapus, hanya bisa dinonaktifkan', 'warning');
      return;
    }
    if (!confirm(`Hapus kategori bonus "${cat.name}"?`)) return;

    try {
      await PayrollService.deleteCategory(cat.id);
      addToast('Kategori bonus berhasil dihapus', 'success');
    } catch (err: any) {
      addToast('Gagal menghapus kategori', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-xs">
              <Tag size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                Kelola Kategori Bonus
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Atur jenis insentif & bonus performa karyawan toko
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Add Category Form */}
          <form onSubmit={handleAddCategory} className="bg-blue-50/60 border border-blue-200/60 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-blue-900 uppercase tracking-wider">
                + Tambah Kategori Bonus Baru
              </span>
            </div>
            <div className="space-y-2">
              <input 
                type="text"
                placeholder="Contoh: Bonus THR, Bonus Loyalitas, Bonus Shift Malam"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              <input 
                type="text"
                placeholder="Keterangan singkat (opsional)"
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl text-xs text-slate-700 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting || !newCatName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs"
              >
                <Plus size={16} /> Simpan Kategori
              </button>
            </div>
          </form>

          {/* Categories List */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Daftar Kategori Bonus Aktif & Sistem ({categories?.length || 0})
            </h4>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {categories?.map((cat) => (
                <div 
                  key={cat.id}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                    cat.isActive 
                      ? 'bg-white border-slate-200 shadow-xs' 
                      : 'bg-slate-50 border-slate-200/60 opacity-60'
                  }`}
                >
                  <div className="space-y-0.5 pr-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${cat.isActive ? 'text-slate-900' : 'text-slate-500 line-through'}`}>
                        {cat.name}
                      </span>
                      {cat.isSystem && (
                        <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 rounded-md border border-slate-200">
                          Bawaan
                        </span>
                      )}
                      {!cat.isActive && (
                        <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 rounded-md border border-rose-200">
                          Nonaktif
                        </span>
                      )}
                    </div>
                    {cat.description && (
                      <p className="text-[11px] text-slate-500">{cat.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(cat)}
                      title={cat.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      className={`p-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                        cat.isActive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {cat.isActive ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                    </button>
                    {!cat.isSystem && (
                      <button
                        type="button"
                        onClick={() => handleDelete(cat)}
                        title="Hapus Kategori"
                        className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
