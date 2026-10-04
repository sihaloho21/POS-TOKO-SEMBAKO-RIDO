import React, { useState } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  ShoppingCart, 
  Search, 
  Plus, 
  Trash2, 
  Save, 
  Truck, 
  Package, 
  ChevronRight,
  ArrowUpRight,
  Banknote,
  Clock,
  History
} from 'lucide-react';
import { PurchaseService } from '@/core/services/purchase-service';
import { useAuthStore } from '@/core/auth-store';
import type { Product, Supplier } from '@/core/types';

export default function Purchases() {
  const { currentUser } = useAuthStore();
  const [currentTab, setCurrentTab] = useState<'NEW' | 'HISTORY'>('NEW');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [items, setItems] = useState<{ productId: string; name: string; quantity: number; unit: string; purchasePrice: number; discount: number }[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'PAYABLE'>('PAID');
  const [moneyStorageId, setMoneyStorageId] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL'>('WARUNG');
  const [isProcessing, setIsProcessing] = useState(false);

  const suppliers = useLiveQuery(() => db.suppliers.where('status').equals('ACTIVE').toArray());
  const products = useLiveQuery(() => db.products.where('status').equals('ACTIVE').toArray());
  const purchaseHistory = useLiveQuery(() => db.purchases.orderBy('timestamp').reverse().toArray());

  const addItem = (product: Product) => {
    if (items.find(i => i.productId === product.productId)) return;
    setItems([...items, { 
      productId: product.productId, 
      name: product.name, 
      quantity: 1, 
      unit: product.baseUnit, 
      purchasePrice: 0,
      discount: 0
    }]);
  };

  const removeItem = (productId: string) => setItems(items.filter(i => i.productId !== productId));

  const updateItem = (productId: string, field: string, value: any) => {
    setItems(items.map(i => i.productId === productId ? { ...i, [field]: value } : i));
  };

  const handleSubmit = async () => {
    if (!selectedSupplierId || !invoiceNumber || items.length === 0 || !currentUser) {
      alert('Lengkapi data pembelian (Supplier, No. Invoice, & Item).');
      return;
    }

    setIsProcessing(true);
    try {
      await PurchaseService.createPurchase({
        supplierId: selectedSupplierId,
        invoiceNumber,
        items,
        paymentStatus,
        moneyStorageId: paymentStatus === 'PAID' ? moneyStorageId : undefined,
        userId: currentUser.userId,
        deviceId: 'device-1'
      });
      alert('Pembelian berhasil dicatat & stok telah diperbarui.');
      setItems([]);
      setInvoiceNumber('');
      setSelectedSupplierId('');
    } catch (err: any) {
      alert('Gagal: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Procurement & Purchases</h2>
          <p className="text-slate-500 text-sm font-medium">Catat pembelian barang dari supplier dan perbarui HPP otomatis.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setCurrentTab('NEW')}
            className={`px-6 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${currentTab === 'NEW' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
          >
            Input Baru
          </button>
          <button 
            onClick={() => setCurrentTab('HISTORY')}
            className={`px-6 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${currentTab === 'HISTORY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
          >
            Riwayat
          </button>
        </div>
      </div>

      {currentTab === 'NEW' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Supplier</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedSupplierId}
                  onChange={e => setSelectedSupplierId(e.target.value)}
                >
                  <option value="">-- Pilih Supplier --</option>
                  {suppliers?.map(s => <option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No. Invoice Supplier</label>
                <input 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: INV/2026/001"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Pembayaran</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setPaymentStatus('PAID')}
                    className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all ${paymentStatus === 'PAID' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm' : 'bg-white text-slate-400 border-slate-200'}`}
                  >
                    Lunas (Paid)
                  </button>
                  <button 
                    onClick={() => setPaymentStatus('PAYABLE')}
                    className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all ${paymentStatus === 'PAYABLE' ? 'bg-amber-50 text-amber-600 border-amber-200 shadow-sm' : 'bg-white text-slate-400 border-slate-200'}`}
                  >
                    Hutang (Credit)
                  </button>
                </div>
              </div>
              {paymentStatus === 'PAID' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sumber Dana</label>
                  <select 
                    className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl font-bold text-blue-900 outline-none focus:ring-2 focus:ring-blue-500"
                    value={moneyStorageId}
                    onChange={e => setMoneyStorageId(e.target.value as any)}
                  >
                    <option value="WARUNG">Kas Warung</option>
                    <option value="IKAN">Kas Ikan</option>
                    <option value="UANG_DIGITAL">Kas Uang Digital</option>
                  </select>
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Cari Produk</h4>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input placeholder="Ketik nama produk..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {products?.slice(0, 10).map(p => (
                  <button key={p.productId} onClick={() => addItem(p)} className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-blue-50 transition-colors group text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 uppercase truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{p.sku || p.barcode}</p>
                    </div>
                    <Plus size={16} className="text-slate-300 group-hover:text-blue-500 transition-all" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><Package size={20} /></div>
                  <h3 className="font-black text-slate-900 uppercase tracking-tight">Daftar Barang Masuk</h3>
                </div>
                <p className="text-sm font-black text-blue-600 tabular-nums">
                  Total Purchase: Rp {items.reduce((acc, i) => acc + (i.quantity * i.purchasePrice - i.discount), 0).toLocaleString()}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                      <th className="px-6 py-4">Produk</th>
                      <th className="px-6 py-4 text-center">Qty</th>
                      <th className="px-6 py-4 text-right">Harga Satuan</th>
                      <th className="px-6 py-4 text-right">Subtotal</th>
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map(item => (
                      <tr key={item.productId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4"><span className="text-xs font-bold text-slate-900 uppercase">{item.name}</span></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <input type="number" className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-center" value={item.quantity} onChange={e => updateItem(item.productId, 'quantity', Number(e.target.value))} />
                            <span className="text-[10px] font-black text-slate-400 uppercase">{item.unit}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <input type="number" className="w-28 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-right" value={item.purchasePrice} onChange={e => updateItem(item.productId, 'purchasePrice', Number(e.target.value))} />
                        </td>
                        <td className="px-6 py-4 text-right font-black text-slate-900 text-xs tabular-nums">
                          Rp {(item.quantity * item.purchasePrice - item.discount).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => removeItem(item.productId)} className="text-slate-300 hover:text-rose-500 transition-all"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-8 border-t border-slate-100 bg-slate-50/30">
                <button 
                  onClick={handleSubmit}
                  disabled={isProcessing || items.length === 0}
                  className="w-full py-4 bg-blue-600 text-white font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-blue-500 shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3 disabled:bg-slate-200"
                >
                  {isProcessing ? 'Processing...' : 'Selesaikan Pembelian'}
                  <ArrowUpRight size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                  <th className="px-6 py-4">Waktu</th>
                  <th className="px-6 py-4">No. Invoice</th>
                  <th className="px-6 py-4">Supplier</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchaseHistory?.map(p => (
                  <tr key={p.purchaseId} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">{new Date(p.timestamp).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-black text-xs text-slate-900 uppercase">{p.invoiceNumber}</td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-600 uppercase">{suppliers?.find(s => s.supplierId === p.supplierId)?.name || 'Unknown'}</td>
                    <td className="px-6 py-4 text-sm font-black text-slate-900 tabular-nums">Rp {p.total.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${p.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right"><ChevronRight size={18} className="text-slate-300 ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
