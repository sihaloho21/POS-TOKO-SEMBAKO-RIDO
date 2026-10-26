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
  History,
  Camera,
  Sparkles,
  CreditCard
} from 'lucide-react';
import { PurchaseService } from '@/core/services/purchase-service';
import { PayLaterService } from '@/core/services/paylater-service';
import { useAuthStore } from '@/core/auth-store';
import { useDeviceId } from '@/core/device-store';
import { useToastStore } from '@/core/toast-store';
import type { Product, Supplier, Purchase, PayLaterBill, PayLaterInstallment } from '@/core/types';
import { SupplierModal } from '@/app/suppliers/SupplierModal';
import { ReceiptScannerModal } from '@/app/purchases/ReceiptScannerModal';

export default function Purchases() {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const deviceId = useDeviceId();
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'PAYABLE' | 'SPAYLATER'>('PAID');
  const [payLaterTenor, setPayLaterTenor] = useState<1 | 3>(1);
  const [currentTab, setCurrentTab] = useState<'NEW' | 'HISTORY' | 'PAYLATER'>('NEW');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [items, setItems] = useState<{ productId: string; name: string; quantity: number; unit: string; purchasePrice: number; discount: number }[]>([]);
  const [additionalCost, setAdditionalCost] = useState<number>(0);
  const [additionalCostAllocation, setAdditionalCostAllocation] = useState<'CAPITALIZE_INTO_WAC' | 'OPERATIONAL_EXPENSE'>('CAPITALIZE_INTO_WAC');
  const [additionalCostNotes, setAdditionalCostNotes] = useState<string>('');
  const [moneyStorageId, setMoneyStorageId] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL'>('WARUNG');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [settlePurchaseTarget, setSettlePurchaseTarget] = useState<Purchase | null>(null);
  const [settleStorageId, setSettleStorageId] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL'>('WARUNG');

  const suppliers = useLiveQuery(() => db.suppliers.where('status').equals('ACTIVE').toArray());
  const products = useLiveQuery(() => db.products.where('status').equals('ACTIVE').toArray());
  const purchaseHistory = useLiveQuery(() => db.purchases.orderBy('timestamp').reverse().toArray());
  const payLaterBills = useLiveQuery(() => db.payLaterBills.toArray());
  const payLaterInstallments = useLiveQuery(() => db.payLaterInstallments.orderBy('dueDate').toArray());
  
  const [settleInstallmentTarget, setSettleInstallmentTarget] = useState<PayLaterInstallment | null>(null);
  const [settleInstallmentBill, setSettleInstallmentBill] = useState<PayLaterBill | null>(null);

  const handleApplyScannedReceipt = (result: {
    supplierId?: string;
    invoiceNumber: string;
    items: {
      productId: string;
      name: string;
      quantity: number;
      unit: string;
      purchasePrice: number;
      discount: number;
    }[];
  }) => {
    if (result.supplierId) {
      setSelectedSupplierId(result.supplierId);
    }
    if (result.invoiceNumber) {
      setInvoiceNumber(result.invoiceNumber);
    }

    // Merge scanned items into current purchase items list
    const currentList = [...items];
    for (const scItem of result.items) {
      const idx = currentList.findIndex(i => i.productId === scItem.productId);
      if (idx >= 0) {
        currentList[idx] = {
          ...currentList[idx],
          quantity: scItem.quantity,
          purchasePrice: scItem.purchasePrice,
          unit: scItem.unit,
          discount: scItem.discount
        };
      } else {
        currentList.push({
          productId: scItem.productId,
          name: scItem.name,
          quantity: scItem.quantity,
          unit: scItem.unit,
          purchasePrice: scItem.purchasePrice,
          discount: scItem.discount
        });
      }
    }

    setItems(currentList);
    addToast(`${result.items.length} barang dari struk berhasil dimasukkan ke Daftar Barang Masuk! Silakan periksa kembali sebelum menyimpan.`, 'success');
  };

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
      addToast('Lengkapi data pembelian (Supplier, No. Invoice, & Item).', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      await PurchaseService.createPurchase({
        supplierId: selectedSupplierId,
        invoiceNumber,
        items,
        additionalCost: Number(additionalCost) || 0,
        additionalCostAllocation,
        additionalCostNotes,
        paymentStatus,
        tenor: paymentStatus === 'SPAYLATER' ? payLaterTenor : undefined,
        moneyStorageId: paymentStatus === 'PAID' ? moneyStorageId : undefined,
        userId: currentUser.userId,
        deviceId
      });
      addToast('Pembelian berhasil dicatat & HPP/WAC telah diperbarui sesuai aturan costing.', 'success');
      setItems([]);
      setInvoiceNumber('');
      setSelectedSupplierId('');
      setAdditionalCost(0);
      setAdditionalCostNotes('');
    } catch (err: any) {
      addToast('Gagal: ' + err.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmSettlePayable = async () => {
    if (!settlePurchaseTarget || !currentUser) return;
    setIsProcessing(true);
    try {
      await PurchaseService.payPurchasePayable({
        purchaseId: settlePurchaseTarget.purchaseId,
        moneyStorageId: settleStorageId,
        userId: currentUser.userId,
        deviceId
      });
      addToast(`Hutang supplier Faktur #${settlePurchaseTarget.invoiceNumber} berhasil dilunasi!`, 'success');
      setSettlePurchaseTarget(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayInstallment = async () => {
    if (!settleInstallmentTarget || !currentUser) return;
    setIsProcessing(true);
    try {
      await PayLaterService.payInstallment({
        installmentId: settleInstallmentTarget.installmentId,
        moneyStorageId: settleStorageId,
        userId: currentUser.userId,
        role: currentUser.role,
        deviceId
      });
      addToast('Cicilan SPayLater berhasil dibayar!', 'success');
      setSettleInstallmentTarget(null);
      setSettleInstallmentBill(null);
    } catch (err: any) {
      addToast(err.message || 'Gagal membayar cicilan.', 'error');
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
          <button 
            onClick={() => setCurrentTab('PAYLATER')}
            className={`px-6 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${currentTab === 'PAYLATER' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
          >
            Hutang PayLater
          </button>
        </div>
      </div>

      {currentTab === 'NEW' && (
        <div className="space-y-6">
          {/* Smart Receipt Scanner Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-5 border border-blue-500/20">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-600/30 text-blue-400 flex items-center justify-center border border-blue-400/30 shrink-0">
                <Camera size={28} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black uppercase tracking-tight text-white">
                    Pindai Struk / Faktur Kulakan
                  </h3>
                  <span className="text-[9px] font-black tracking-widest text-blue-300 bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 rounded-md flex items-center gap-1 uppercase">
                    <Sparkles size={10} /> AI OCR
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-medium max-w-xl">
                  Foto langsung dari kamera atau unggah struk belanja grosir. AI akan mengekstrak barang, jumlah, dan harga satuan secara otomatis ke Daftar Barang Masuk.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsScannerModalOpen(true)}
              className="px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-600/30 transition-all transform active:scale-95 flex items-center gap-2.5 shrink-0"
            >
              <Camera size={18} />
              Scan Foto Struk
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Supplier</label>
                  <button
                    type="button"
                    onClick={() => setIsSupplierModalOpen(true)}
                    className="text-[10px] font-black text-blue-600 hover:text-blue-500 uppercase tracking-wider flex items-center gap-1"
                  >
                    <Plus size={12} />
                    Tambah Baru
                  </button>
                </div>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedSupplierId ?? ''}
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
                  value={invoiceNumber ?? ''}
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
                  <button 
                    onClick={() => setPaymentStatus('SPAYLATER')}
                    className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all ${paymentStatus === 'SPAYLATER' ? 'bg-orange-50 text-orange-600 border-orange-200 shadow-sm' : 'bg-white text-slate-400 border-slate-200'}`}
                  >
                    SPayLater
                  </button>
                </div>
              </div>
              {paymentStatus === 'SPAYLATER' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pilih Tenor Cicilan</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setPayLaterTenor(1)}
                      className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all ${payLaterTenor === 1 ? 'bg-orange-600 text-white border-orange-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200'}`}
                    >
                      1 Bulan (0%)
                    </button>
                    <button 
                      onClick={() => setPayLaterTenor(3)}
                      className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all ${payLaterTenor === 3 ? 'bg-orange-600 text-white border-orange-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200'}`}
                    >
                      3 Bulan (0%)
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium italic">
                    * Jatuh tempo otomatis setiap tanggal 25 per bulan.
                  </p>
                </div>
              )}
              {paymentStatus === 'PAID' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sumber Dana</label>
                  <select 
                    className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl font-bold text-blue-900 outline-none focus:ring-2 focus:ring-blue-500"
                    value={moneyStorageId ?? 'WARUNG'}
                    onChange={e => setMoneyStorageId(e.target.value as any)}
                  >
                    <option value="WARUNG">Kas Warung</option>
                    <option value="IKAN">Kas Ikan</option>
                    <option value="UANG_DIGITAL">Kas Uang Digital</option>
                  </select>
                </div>
              )}

              {/* Additional Purchase Cost (Owner choice: WAC vs Opex) */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Biaya Tambahan / Ongkir (Rp)
                  </label>
                  <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    Costing Rule
                  </span>
                </div>
                <input 
                  type="number"
                  min="0"
                  step="1000"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0 (Contoh: 50.000)"
                  value={additionalCost || ''}
                  onChange={e => setAdditionalCost(Number(e.target.value) || 0)}
                />

                {additionalCost > 0 && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                      Perlakuan Biaya Tambahan (Owner Choice):
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAdditionalCostAllocation('CAPITALIZE_INTO_WAC')}
                        className={`p-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all text-center ${
                          additionalCostAllocation === 'CAPITALIZE_INTO_WAC'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Masuk WAC / HPP
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdditionalCostAllocation('OPERATIONAL_EXPENSE')}
                        className={`p-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all text-center ${
                          additionalCostAllocation === 'OPERATIONAL_EXPENSE'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Beban Opex Toko
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {additionalCostAllocation === 'CAPITALIZE_INTO_WAC' 
                        ? 'Biaya dikapitalisasi menambah HPP rata-rata barang secara proporsional & diaudit.' 
                        : 'Biaya dicatat sebagai beban operasional (tidak menaikkan HPP produk) & diaudit.'}
                    </p>
                    <input
                      type="text"
                      placeholder="Catatan biaya (e.g. Ongkir truk / bongkar muat)..."
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-800 outline-none"
                      value={additionalCostNotes ?? ''}
                      onChange={e => setAdditionalCostNotes(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Cari Produk</h4>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input 
                  type="text"
                  placeholder="Ketik nama produk..." 
                  value={productSearch ?? ''}
                  onChange={e => setProductSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {products
                  ?.filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.barcode.includes(productSearch) || (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase())))
                  .slice(0, 10)
                  .map(p => (
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
              <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0"><Package size={20} /></div>
                  <div>
                    <h3 className="font-black text-slate-900 uppercase tracking-tight">Daftar Barang Masuk</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{items.length} Macam Barang</p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => setIsScannerModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-black uppercase tracking-wider transition-colors border border-blue-200/60"
                  >
                    <Camera size={14} />
                    Scan Struk
                  </button>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Barang: Rp {items.reduce((acc, i) => acc + (i.quantity * i.purchasePrice - i.discount), 0).toLocaleString()}
                      {additionalCost > 0 && ` + Biaya: Rp ${additionalCost.toLocaleString()} (${additionalCostAllocation === 'CAPITALIZE_INTO_WAC' ? 'Masuk WAC' : 'Beban Opex'})`}
                    </p>
                    <p className="text-sm font-black text-blue-600 tabular-nums">
                      Total Faktur: Rp {(items.reduce((acc, i) => acc + (i.quantity * i.purchasePrice - i.discount), 0) + (additionalCost || 0)).toLocaleString()}
                    </p>
                  </div>
                </div>
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
                            <input 
                              type="number" 
                              step="any"
                              className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-center" 
                              value={item.quantity ?? 1} 
                              onChange={e => updateItem(item.productId, 'quantity', Number(e.target.value))} 
                            />
                            <span className="text-[10px] font-black text-slate-400 uppercase">{item.unit}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <input 
                            type="number" 
                            className="w-28 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-right" 
                            value={item.purchasePrice ?? 0} 
                            onChange={e => updateItem(item.productId, 'purchasePrice', Number(e.target.value))} 
                          />
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
      </div>
    )}

      {currentTab === 'HISTORY' && (
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
                        {p.status === 'PAID' ? 'PAID (LUNAS)' : 'HUTANG SUPPLIER'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {p.status !== 'PAID' && p.status !== 'CANCELLED' ? (
                        <button
                          onClick={() => {
                            setSettlePurchaseTarget(p);
                            setSettleStorageId('WARUNG');
                          }}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                        >
                          Lunasi Hutang
                        </button>
                      ) : (
                        <ChevronRight size={18} className="text-slate-300 ml-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {currentTab === 'PAYLATER' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-orange-600 rounded-3xl p-6 text-white shadow-lg shadow-orange-200">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Total Limit Terpakai</p>
              <h3 className="text-2xl font-black tabular-nums">
                Rp {(payLaterInstallments?.filter(i => i.status === 'PENDING').reduce((acc, i) => acc + i.amount, 0) || 0).toLocaleString()}
              </h3>
              <div className="mt-4 flex items-center gap-2 text-[10px] font-bold bg-white/20 w-fit px-3 py-1 rounded-full">
                <CreditCard size={12} />
                <span>SPayLater 0% Interest</span>
              </div>
            </div>
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Jatuh Tempo Bulan Ini</p>
              <h3 className="text-2xl font-black text-slate-900 tabular-nums">
                Rp {(payLaterInstallments?.filter(i => {
                  if (i.status !== 'PENDING') return false;
                  const d = new Date(i.dueDate);
                  const now = new Date();
                  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                }).reduce((acc, i) => acc + i.amount, 0) || 0).toLocaleString()}
              </h3>
              <p className="mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Clock size={12} className="text-amber-500" />
                Bayar sebelum tanggal 25
              </p>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Jadwal Cicilan SPayLater</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                    <th className="px-6 py-4">Jatuh Tempo</th>
                    <th className="px-6 py-4">Supplier / Faktur</th>
                    <th className="px-6 py-4">Cicilan Ke</th>
                    <th className="px-6 py-4">Jumlah</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payLaterInstallments?.map(inst => {
                    const bill = payLaterBills?.find(b => b.billId === inst.billId);
                    const purchase = purchaseHistory?.find(p => p.purchaseId === bill?.purchaseId);
                    const supplier = suppliers?.find(s => s.supplierId === bill?.supplierId);
                    const instsOfBill = payLaterInstallments.filter(i => i.billId === inst.billId).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
                    const instIndex = instsOfBill.findIndex(i => i.installmentId === inst.installmentId) + 1;

                    return (
                      <tr key={inst.installmentId} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-slate-900">{new Date(inst.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            {new Date(inst.dueDate) < new Date() && inst.status === 'PENDING' && (
                              <span className="text-[9px] font-black text-rose-600 uppercase tracking-tighter">Terlambat</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-700 uppercase truncate max-w-[150px]">{supplier?.name || 'Unknown'}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">#{purchase?.invoiceNumber.slice(0, 10) || '---'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{instIndex} dari {bill?.tenor}</span>
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-slate-900 tabular-nums">Rp {inst.amount.toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${inst.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                            {inst.status === 'PAID' ? 'DIBAYAR' : 'BELUM BAYAR'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {inst.status === 'PENDING' ? (
                            <button
                              onClick={() => {
                                setSettleInstallmentTarget(inst);
                                setSettleInstallmentBill(bill || null);
                                setSettleStorageId('WARUNG');
                              }}
                              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all"
                            >
                              Bayar Cicilan
                            </button>
                          ) : (
                            <div className="flex flex-col items-end">
                              <span className="text-[9px] text-slate-400 font-bold uppercase">Lunas pada:</span>
                              <span className="text-[9px] text-slate-500 font-black uppercase">{inst.paidAt ? new Date(inst.paidAt).toLocaleDateString() : '-'}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(!payLaterInstallments || payLaterInstallments.length === 0) && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-2 opacity-20">
                          <History size={48} />
                          <p className="text-xs font-black uppercase tracking-[0.2em]">Belum ada riwayat PayLater</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pelunasan Hutang Supplier */}
      {settlePurchaseTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <h3 className="font-black text-slate-900 text-base uppercase tracking-tight mb-2">
              Pelunasan Hutang Supplier
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Faktur <strong>#{settlePurchaseTarget.invoiceNumber}</strong> • Total Tagihan:{' '}
              <strong className="text-slate-900">Rp {settlePurchaseTarget.total.toLocaleString()}</strong>
            </p>

            <div className="space-y-3 mb-5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Pilih Sumber Kas Pembayaran
              </label>
              <select
                value={settleStorageId ?? 'WARUNG'}
                onChange={(e) => setSettleStorageId(e.target.value as any)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="WARUNG">Kas Warung</option>
                <option value="IKAN">Kas Ikan</option>
                <option value="UANG_DIGITAL">Kas Uang Digital</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSettlePurchaseTarget(null)}
                className="flex-1 py-3 font-bold text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmSettlePayable}
                disabled={isProcessing}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-200 disabled:opacity-50"
              >
                {isProcessing ? 'Memproses...' : 'Bayar & Lunasi'}
              </button>
            </div>
          </div>
        </div>
      )}
      {settleInstallmentTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <h3 className="font-black text-slate-900 text-base uppercase tracking-tight mb-2">
              Bayar Cicilan SPayLater
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Cicilan untuk Supplier <strong>{suppliers?.find(s => s.supplierId === settleInstallmentBill?.supplierId)?.name}</strong><br/>
              Sebesar: <strong className="text-slate-900">Rp {settleInstallmentTarget.amount.toLocaleString()}</strong><br/>
              Jatuh Tempo: <strong>{new Date(settleInstallmentTarget.dueDate).toLocaleDateString()}</strong>
            </p>

            <div className="space-y-3 mb-5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Pilih Sumber Kas Pembayaran
              </label>
              <select
                value={settleStorageId ?? 'WARUNG'}
                onChange={(e) => setSettleStorageId(e.target.value as any)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="WARUNG">Kas Warung</option>
                <option value="IKAN">Kas Ikan</option>
                <option value="UANG_DIGITAL">Kas Uang Digital</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSettleInstallmentTarget(null);
                  setSettleInstallmentBill(null);
                }}
                className="flex-1 py-3 font-bold text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handlePayInstallment}
                disabled={isProcessing}
                className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-orange-200 disabled:opacity-50"
              >
                {isProcessing ? 'Memproses...' : 'Bayar Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReceiptScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        products={products || []}
        suppliers={suppliers || []}
        onApply={handleApplyScannedReceipt}
      />

      <SupplierModal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
      />
    </div>
  );
}
