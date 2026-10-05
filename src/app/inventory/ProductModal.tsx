import React from 'react';
import type { Product } from '@/core/types';
import { X, Package } from 'lucide-react';
import { ProductForm } from './ProductForm';

interface ProductModalProps {
  product?: Product;
  productId?: string;
  initialProductType?: any;
  initialBaseUnit?: string;
  onClose: () => void;
}

export function ProductModal({ product, productId, initialProductType, initialBaseUnit, onClose }: ProductModalProps) {
  const [loadedProduct, setLoadedProduct] = React.useState<Product | undefined>(product);

  React.useEffect(() => {
    if (!product && productId) {
      import('@/core/database').then(({ db }) => {
        db.products.get(productId).then(p => setLoadedProduct(p));
      });
    } else {
      setLoadedProduct(product);
    }
  }, [product, productId]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Package size={20} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                {loadedProduct ? 'Edit Product' : 'Tambah Product'}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Master Data Management</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <ProductForm 
            product={loadedProduct} 
            initialProductType={initialProductType}
            initialBaseUnit={initialBaseUnit}
            onSave={() => onClose()} 
            onCancel={onClose} 
          />
        </div>
      </div>
    </div>
  );
}
