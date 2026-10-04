import React, { useState } from 'react';
import type { Product, ProductType } from '@/core/types';
import { ProductService } from '@/core/services/product-service';
import { Save, Package, Barcode, Trash2, CheckCircle, XCircle } from 'lucide-react';

interface ProductFormProps {
  product?: Product;
  onSave: (productId: string) => void;
  onCancel: () => void;
}

export function ProductForm({ product, onSave, onCancel }: ProductFormProps) {
  const [formData, setFormData] = useState<Partial<Product>>(
    product || {
      productType: 'SEMBAKO',
      baseUnit: 'PCS',
      status: 'ACTIVE',
      normalPrice: 0,
      hpp: 0,
      stock: 0,
      minimumStock: 5,
      targetStock: 20,
      saleUnits: ['PCS'],
      conversionRules: []
    }
  );

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const productId = await ProductService.saveProduct(formData);
      onSave(productId);
    } catch (error) {
      console.error('Failed to save product:', error);
      alert('Gagal menyimpan produk.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Name Field */}
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Produk</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Package size={18} />
              </div>
              <input
                required
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 shadow-sm transition-all"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Masukkan nama produk..."
              />
            </div>
          </div>

          {/* SKU Field */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SKU (Internal ID)</label>
            <input
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 shadow-sm"
              value={formData.sku || ''}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              placeholder="Auto-generate jika kosong"
            />
          </div>

          {/* Barcode Field */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Barcode (Scanner)</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Barcode size={18} />
              </div>
              <input
                className="w-full pl-11 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 shadow-sm"
                value={formData.barcode || ''}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                placeholder="Scan barcode..."
              />
              <button 
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Trigger Scanner"
              >
                <Barcode size={18} />
              </button>
            </div>
          </div>

          {/* Price Field */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga Jual (Base)</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">Rp</div>
              <input
                type="number"
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 tabular-nums shadow-sm"
                value={formData.normalPrice || ''}
                onChange={(e) => setFormData({ ...formData, normalPrice: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* Status Toggle */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Aktif</label>
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1 h-[50px]">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, status: 'ACTIVE' })}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${
                  formData.status === 'ACTIVE' 
                    ? 'bg-white text-emerald-600 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-500'
                }`}
              >
                <CheckCircle size={14} />
                Aktif
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, status: 'INACTIVE' })}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${
                  formData.status === 'INACTIVE' 
                    ? 'bg-white text-rose-600 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-500'
                }`}
              >
                <XCircle size={14} />
                Nonaktif
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-8 py-3 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-blue-500 shadow-lg shadow-blue-200 transition-all flex items-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Menyimpan...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save size={18} />
                Simpan Produk
              </span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
