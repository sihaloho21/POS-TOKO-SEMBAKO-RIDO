import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Product } from '@/core/types';

interface LowStockBannerProps {
  products: Product[];
  onAction: () => void;
}

export function LowStockBanner({ products, onAction }: LowStockBannerProps) {
  if (!products || products.length === 0) return null;

  return (
    <div className="bg-rose-50 border-2 border-rose-100 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-rose-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-200">
          <AlertTriangle size={24} />
        </div>
        <div>
          <h4 className="font-black text-rose-900 uppercase tracking-tight">Stok Menipis Terdeteksi</h4>
          <p className="text-rose-600 text-xs font-bold uppercase tracking-widest">
            {products.length} Produk membutuhkan pengisian stok segera.
          </p>
        </div>
      </div>
      <button 
        onClick={onAction}
        className="px-6 py-3 bg-rose-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-rose-800 transition-all shadow-xl shadow-rose-900/20 active:scale-95"
      >
        Replenish Now
      </button>
    </div>
  );
}
