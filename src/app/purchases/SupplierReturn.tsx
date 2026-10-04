import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { SupplierReturnService } from '@/core/services/supplier-return-service';
import { useAuthStore } from '@/core/auth-store';
import { 
  Undo2, 
  Search, 
  Trash2, 
  Save, 
  Truck, 
  Package, 
  Plus,
  ArrowDownLeft,
  ChevronRight
} from 'lucide-react';

export default function SupplierReturn() {
  const { currentUser } = useAuthStore();
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedStorage, setSelectedStorage] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL'>('WARUNG');
  const [items, setItems] = useState<{ productId: string; name: string; quantity: number; unit: string; price: number }[]>([]);
  const [reason, setReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const suppliers = useLiveQuery(() => db.suppliers.where('status').equals('ACTIVE').toArray());
  const products = useLiveQuery(() => db.products.where('status').equals('ACTIVE').toArray());
  const costs = useLiveQuery(() => db.productCosts.toArray());

  const addItem = (product: any) => {
    if (items.find(i => i.productId === product.productId)) return;
    const hpp = costs?.find(c => c.productId === product.productId)?.hpp || 0;
    setItems([...items, { 
      productId: product.productId, 
      name: product.name, 
      quantity: 1, 
      unit: product.baseUnit, 
      price: hpp 
    }]);
  };

  const updateItem = (productId: string, field: string, value: any) => {
    setItems(items.map(i => i.productId === productId ? { ...i, [field]: value } : i));
  };

  const removeItem = (productId: string) => {
    setItems(items.filter(i => i.productId !== productId));
  };

  const handleSubmit = async () => {
    if (!selectedSupplierId || items.length === 0 || !currentUser) {
      alert('Pilih supplier dan tambahkan item.');
      return;
    }

    setIsProcessing(true);
    try {
      await SupplierReturnService.processReturn({
        supplierId: selectedSupplierId,
        items,
        moneyStorageId: selectedStorage,
        userId: currentUser.userId,
        deviceId: 'device-1',
        reason
      });
      alert('Retur berhasil dicatat.');
      setItems([]);
      setReason('');
    } catch (error: any) {
      alert('Gagal mencatat retur: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Retur Supplier</h2>
          <p className="text-slate-500 text-sm font-medium">Kembalikan stok ke supplier dan terima refund uang.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Config Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pilih Supplier</label>
              <select 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
              >
                <option value="">-- Pilih Supplier --</option>
                {suppliers?.map(s => <option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Penyimpanan Refund (Storage)</label>
              <div className="grid grid-cols-3 gap-2">
                {(['WARUNG', 'IKAN', 'UANG_DIGITAL'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSelectedStorage(s)}
                    className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
                      selectedStorage === s ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {s.split('_')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alasan Retur</label>
              <textarea 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all min-h-[100px]"
                placeholder="Contoh: Barang rusak / expired..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Cari Produk Untuk Diretur</h4>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
              <input type="text" placeholder="Scan / Cari..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
              {products?.slice(0, 10).map(p => (
                <button 
                  key={p.productId}
                  onClick={() => addItem(p)}
                  className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-blue-50 transition-colors group text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 uppercase truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">HPP: Rp {(costs?.find(c => c.productId === p.productId)?.hpp || 0).toLocaleString()}</p>
                  </div>
                  <Plus size={16} className="text-slate-300 group-hover:text-blue-500 transition-all" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Items Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                  <Undo2 size={20} />
                </div>
                <h3 className="font-black text-slate-900 uppercase tracking-tight">Daftar Barang Retur</h3>
              </div>
              <p className="text-sm font-black text-blue-600 tabular-nums">
                Total Refund: Rp {items.reduce((acc, i) => acc + (i.quantity * i.price), 0).toLocaleString()}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                    <th className="px-6 py-4">Produk</th>
                    <th className="px-6 py-4 text-center">Jumlah</th>
                    <th className="px-6 py-4 text-right">Harga Refund</th>
                    <th className="px-6 py-4 text-right">Subtotal</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map(item => (
                    <tr key={item.productId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-slate-900 uppercase">{item.name}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <input 
                            type="number"
                            className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-center"
                            value={item.quantity ?? 1}
                            onChange={(e) => updateItem(item.productId, 'quantity', Number(e.target.value))}
                          />
                          <span className="text-[10px] font-black text-slate-400 uppercase">{item.unit}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <input 
                          type="number"
                          className="w-24 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-right"
                          value={item.price ?? 0}
                          onChange={(e) => updateItem(item.productId, 'price', Number(e.target.value))}
                        />
                      </td>
                      <td className="px-6 py-4 text-right font-black text-slate-900 text-xs tabular-nums">
                        Rp {(item.quantity * item.price).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => removeItem(item.productId)} className="text-slate-300 hover:text-rose-500 transition-all"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-300">
                          <Package size={48} className="mb-4 opacity-20" />
                          <p className="text-sm font-bold uppercase tracking-widest">Belum ada item ditambahkan</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-8 border-t border-slate-100 bg-slate-50/30">
              <button 
                onClick={handleSubmit}
                disabled={isProcessing || items.length === 0}
                className="w-full py-4 bg-blue-600 text-white font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-blue-500 shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {isProcessing ? 'Memproses...' : 'Konfirmasi Retur Supplier'}
                <ArrowDownLeft size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
