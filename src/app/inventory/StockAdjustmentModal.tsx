import React, { useState, useEffect } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuthStore } from '@/core/auth-store';
import { StockService } from '@/core/services/stock-service';
import type { Product, StockAdjustmentReason, StockMovementType } from '@/core/types';
import { 
  X, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowDownRight, 
  Package, 
  ShieldAlert, 
  CheckCircle,
  Scale
} from 'lucide-react';

interface StockAdjustmentModalProps {
  initialProductId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const ADJUSTMENT_REASONS: StockAdjustmentReason[] = [
  'Rusak',
  'Hilang',
  'Kadaluarsa',
  'Ikan mati/tidak layak jual',
  'Kesalahan stok opname',
  'Salah Input',
  'Lainnya'
];

export function StockAdjustmentModal({ initialProductId, onClose, onSuccess }: StockAdjustmentModalProps) {
  const { currentUser } = useAuthStore();
  const isOwner = currentUser?.role === 'OWNER';

  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductId || '');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('OUT');
  const [reason, setReason] = useState<StockAdjustmentReason>('Rusak');
  const [qty, setQty] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isOwnerOverride, setIsOwnerOverride] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  const products = useLiveQuery(() => db.products.filter(p => p.status === 'ACTIVE').toArray());
  const selectedProduct = useLiveQuery<Product | undefined>(
    async () => {
      if (!selectedProductId) return undefined;
      return db.products.get(selectedProductId);
    },
    [selectedProductId]
  );

  const [derivedStock, setDerivedStock] = useState<number>(0);

  useEffect(() => {
    if (selectedProductId) {
      StockService.getDerivedStock(selectedProductId)
        .then(s => setDerivedStock(s))
        .catch(() => setDerivedStock(0));
    }
  }, [selectedProductId]);

  // Determine movementType preview
  const getMovementType = (): StockMovementType => {
    if (direction === 'IN') {
      return reason === 'Kesalahan stok opname' ? 'STOCK_OPNAME_IN' : 'ADJUSTMENT_IN';
    }
    switch (reason) {
      case 'Rusak':
        return 'DAMAGED_OUT';
      case 'Hilang':
        return 'LOST_OUT';
      case 'Kadaluarsa':
        return 'EXPIRED_OUT';
      case 'Ikan mati/tidak layak jual':
        return 'FISH_DEAD_OUT';
      case 'Kesalahan stok opname':
        return 'STOCK_OPNAME_OUT';
      default:
        return 'ADJUSTMENT_OUT';
    }
  };

  const parsedQty = Math.abs(Number(qty) || 0);
  const projectedStock = direction === 'IN' 
    ? derivedStock + parsedQty 
    : derivedStock - parsedQty;
  const isShortage = direction === 'OUT' && projectedStock < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      setErrorMessage('Pilih produk terlebih dahulu.');
      return;
    }
    if (parsedQty <= 0) {
      setErrorMessage('Jumlah perubahan stok harus lebih besar dari 0.');
      return;
    }

    if (isShortage && !isOwnerOverride) {
      setErrorMessage('Stok tidak mencukupi untuk pengurangan ini. Hanya Owner yang dapat mengizinkan override.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await StockService.recordAdjustment({
        productId: selectedProductId,
        adjustmentReason: reason,
        qty: parsedQty,
        unit: selectedProduct?.baseUnit || 'PCS',
        direction,
        userId: currentUser?.userId || 'SYSTEM',
        deviceId: 'device-1',
        notes: notes.trim(),
        isOwnerOverride: isOwnerOverride && isOwner
      });

      setSuccessMessage(`Berhasil mencatat Stock Movement: ${getMovementType()} sebanyak ${parsedQty} ${selectedProduct?.baseUnit || 'unit'}.`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan penyesuaian stok.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <Scale size={20} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">
                Penyesuaian Stok (Stock Movement)
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Derived Balance Ledger Entry
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {successMessage ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto animate-bounce" />
            <p className="font-black text-slate-900 text-sm">{successMessage}</p>
            <p className="text-xs text-slate-400">Saldo stok derived berhasil diperbarui.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            {/* Product Selector */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                Pilih Produk *
              </label>
              <select
                value={selectedProductId ?? ''}
                onChange={(e) => setSelectedProductId(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Pilih Produk --</option>
                {products?.map((p) => (
                  <option key={p.productId} value={p.productId ?? ''}>
                    {p.name} ({p.sku}) - Stok Saat Ini: {p.stock} {p.baseUnit}
                  </option>
                ))}
              </select>
            </div>

            {/* Current Derived Stock Card */}
            {selectedProduct && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex justify-between items-center text-xs">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Stok Derived Saat Ini
                  </span>
                  <span className="font-black text-slate-900 text-base tabular-nums">
                    {derivedStock ?? 0} {selectedProduct.baseUnit}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Proyeksi Setelah Penyesuaian
                  </span>
                  <span className={`font-black text-base tabular-nums ${projectedStock < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {projectedStock ?? 0} {selectedProduct.baseUnit}
                  </span>
                </div>
              </div>
            )}

            {/* Direction IN / OUT */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                Arah Pergerakan Stok *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('OUT')}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider transition-all ${
                    direction === 'OUT'
                      ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <ArrowDownRight size={16} />
                  <span>Pengurangan (OUT)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('IN')}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider transition-all ${
                    direction === 'IN'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <ArrowUpRight size={16} />
                  <span>Penambahan (IN)</span>
                </button>
              </div>
            </div>

            {/* Reason Selection */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                Alasan Penyesuaian (Adjustment Reason) *
              </label>
              <select
                value={reason ?? 'Rusak'}
                onChange={(e) => setReason(e.target.value as StockAdjustmentReason)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {ADJUSTMENT_REASONS.map((r) => (
                  <option key={r} value={r ?? ''}>
                    {r}
                  </option>
                ))}
              </select>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <span>Movement Ledger Type:</span>
                <span className="font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                  {getMovementType()}
                </span>
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                Jumlah Kuantitas ({selectedProduct?.baseUnit || 'Unit'}) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0"
                value={qty ?? ''}
                onChange={(e) => setQty(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                Catatan / Keterangan Penyesuaian
              </label>
              <textarea
                rows={2}
                value={notes ?? ''}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detail penyebab (misal: pecah saat bongkar muat, kadaluarsa rak 2, ikan lele mati 3 ekor...)"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* Shortage & Owner Override Notice */}
            {isShortage && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs space-y-2">
                <div className="flex items-start gap-2 text-rose-800">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-600" />
                  <div>
                    <p className="font-black uppercase tracking-tight">Peringatan: Stok Menjadi Negatif ({projectedStock})</p>
                    <p className="text-[11px] font-medium text-rose-700 mt-0.5">
                      Normal flow mencegah stok negatif. Pengurangan ini akan menghasilkan shortage stok.
                    </p>
                  </div>
                </div>

                {isOwner ? (
                  <label className="flex items-center gap-2 pt-1 border-t border-rose-200/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isOwnerOverride}
                      onChange={(e) => setIsOwnerOverride(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-600 border-rose-300 focus:ring-rose-500"
                    />
                    <span className="text-[11px] font-black text-rose-900 uppercase tracking-wider">
                      Owner Override: Izinkan Shortage (Akan dicatat di STOCK_PENDING_REVIEW)
                    </span>
                  </label>
                ) : (
                  <p className="text-[10px] font-bold text-rose-600 italic">
                    Hanya pengguna dengan role OWNER yang dapat mengaktifkan override stok negatif.
                  </p>
                )}
              </div>
            )}

            {errorMessage && (
              <p className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold">
                {errorMessage}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (isShortage && !isOwnerOverride)}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-200 transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Memproses...' : 'Simpan Stock Movement'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
export default StockAdjustmentModal;
