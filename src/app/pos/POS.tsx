import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { TransactionEngine } from '@/core/transaction-engine';
import { PricingEngine } from '@/core/pricing-engine';
import { useAuthStore } from '@/core/auth-store';
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  CheckCircle,
  Package,
  CreditCard,
  Banknote,
  Weight,
  PauseCircle,
  X,
  PlayCircle,
  AlertTriangle,
  Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Product, TransactionItem, Customer, Transaction } from '@/core/types';
import { v4 as uuidv4 } from 'uuid';
import { ShiftService } from '@/core/services/shift-service';
import { PrintService } from '@/core/utils/print-service';
import { DebtSettlementModal } from './DebtSettlementModal';
import { SalesHistory } from './SalesHistory';

export function WeightModal({ product, onConfirm, onClose }: { product: Product, onConfirm: (kg: number) => void, onClose: () => void }) {
  const [weight, setWeight] = useState('');
  
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white"><Weight size={20} /></div>
          <div>
            <h3 className="font-black text-slate-900 uppercase tracking-tight">{product.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Masukkan Berat (KG)</p>
          </div>
        </div>
        <input 
          autoFocus
          type="number" step="0.01"
          className="w-full text-4xl font-black text-center py-6 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-blue-500 outline-none tabular-nums mb-6"
          placeholder="0.00"
          value={weight || ''}
          onChange={(e) => setWeight(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onConfirm(Number(weight))}
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all">Batal</button>
          <button 
            onClick={() => onConfirm(Number(weight))}
            disabled={!weight || Number(weight) <= 0}
            className="flex-1 py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-xl hover:bg-blue-500 shadow-lg shadow-blue-200 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none transition-all"
          >
            Konfirmasi
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function POS() {
  const { currentUser } = useAuthStore();
  const [currentTab, setCurrentTab] = useState<'POS' | 'HISTORY'>('POS');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<TransactionItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSettlingDebt, setIsSettlingDebt] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactionType, setTransactionType] = useState<'SALE' | 'GAJIAN'>('SALE');
  const [moneyStorageId, setMoneyStorageId] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL'>('WARUNG');
  const [paymentMethodId, setPaymentMethodId] = useState('CASH');
  
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);

  const currentShift = useLiveQuery(() => ShiftService.getCurrentShift('device-1'), []);
  const customers = useLiveQuery(() => db.customers.toArray());
  const heldTransactions = useLiveQuery(() => db.transactions.where('status').equals('HOLD').toArray());
  const costs = useLiveQuery(() => db.productCosts.toArray());
  const paymentMethods = useLiveQuery(() => db.paymentMethods.where('status').equals('ACTIVE').toArray());

  const handleLogout = useCallback(() => {
    if (confirm('Yakin ingin Switch User? Sesi saat ini akan ditutup.')) {
      useAuthStore.getState().logout();
    }
  }, []);

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0 || !currentUser || isProcessing || !currentShift) return;
    if (transactionType === 'GAJIAN' && !selectedCustomer) {
      alert('Pilih pelanggan untuk transaksi Gajian');
      return;
    }

    if (transactionType === 'GAJIAN' && selectedCustomer) {
      const subtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);
      const creditCheck = await TransactionEngine.checkCreditLimit(selectedCustomer.customerId, subtotal);
      if (!creditCheck.allowed) {
        alert(creditCheck.message);
        setIsProcessing(false);
        return;
      }
    }
    
    setIsProcessing(true);
    try {
      const transactionId = await TransactionEngine.createSale({
        cashierId: currentUser.userId,
        deviceId: 'device-1',
        shiftId: currentShift.shiftId,
        customerId: selectedCustomer?.customerId,
        items: cart,
        discount: 0,
        paymentMethodId,
        moneyStorageId: moneyStorageId,
        type: transactionType
      });
      
      const transaction = await db.transactions.get(transactionId);
      if (transaction) {
        PrintService.printReceipt(transaction);
      }

      setCart([]);
      setSelectedCustomer(null);
      setTransactionType('SALE');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Checkout failed:', error);
      alert('Gagal memproses transaksi. Cek riwayat atau coba lagi.');
    } finally {
      setIsProcessing(false);
    }
  }, [cart, currentUser, currentShift, isProcessing, moneyStorageId, selectedCustomer, transactionType, paymentMethodId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); handleLogout(); }
      if (e.key === 'F2') { e.preventDefault(); document.getElementById('pos-search')?.focus(); }
      if (e.key === 'F4') { e.preventDefault(); document.getElementById('customer-select')?.focus(); }
      if (e.key === 'F8') { e.preventDefault(); handleCheckout(); }
      if (e.key === 'Escape') { setWeightProduct(null); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleLogout, handleCheckout]);

  const products = useLiveQuery(
    () => {
      let query = db.products.toCollection();
      return query.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search) || !!(p.sku && p.sku.includes(search));
        const matchesTag = !selectedTag || !!(p.tags && p.tags.includes(selectedTag));
        return matchesSearch && matchesTag;
      }).toArray();
    },
    [search, selectedTag]
  );

  const availableTags = useLiveQuery(
    async () => {
      const allProducts = await db.products.toArray();
      const tags = new Set<string>();
      allProducts.forEach(p => p.tags?.forEach(t => tags.add(t)));
      return Array.from(tags).sort();
    },
    []
  );

  const addToCart = useCallback((product: Product, kg?: number) => {
    if (product.productType === 'FISH' && kg === undefined) {
      setWeightProduct(product);
      return;
    }
    const pricing = PricingEngine.calculateItemPrice({
      product,
      customer: selectedCustomer || undefined,
      transactionType,
      unit: product.baseUnit
    });
    const quantity = kg || 1;
    const existing = cart.find(item => item.productId === product.productId);
    if (existing && product.productType !== 'FISH') {
      setCart(prev => prev.map(item => item.productId === product.productId ? { ...item, quantity: item.quantity + quantity, subtotal: (item.quantity + quantity) * item.unitPrice } : item));
    } else {
      setCart(prev => [...prev, {
        productId: product.productId,
        nameSnapshot: product.name,
        barcodeSnapshot: product.barcode,
        quantity: quantity,
        unit: product.baseUnit,
        unitPrice: pricing.price,
        priceSource: pricing.priceSource,
        discount: 0,
        netPrice: pricing.price,
        subtotal: pricing.price * quantity,
        hppSnapshot: costs?.find(c => c.productId === product.productId)?.hpp
      }]);
    }
    setWeightProduct(null);
  }, [cart, selectedCustomer, transactionType, costs]);

  const updateQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(0, item.quantity + delta);
        if (newQty === 0) return null;
        return { ...item, quantity: newQty, subtotal: newQty * item.unitPrice };
      }
      return item;
    }).filter(Boolean) as TransactionItem[]);
  };

  const subtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);

  const handleHold = async () => {
    if (cart.length === 0 || !currentUser || !currentShift) return;
    const holdTx: Transaction = {
      transactionId: uuidv4(),
      receiptNumber: `HOLD-${Date.now()}`,
      type: transactionType,
      status: 'HOLD',
      cashierId: currentUser.userId,
      deviceId: 'device-1',
      shiftId: currentShift.shiftId,
      items: cart,
      subtotal,
      discount: 0,
      total: subtotal,
      paymentMethodId: 'CASH',
      moneyStorageId: 'WARUNG',
      loyaltyPointsEarned: 0,
      clientTimestamp: new Date().toISOString()
    };
    await db.transactions.add(holdTx);
    setCart([]);
  };

  const resumeHold = (tx: Transaction) => {
    setCart(tx.items);
    setTransactionType(tx.type as any);
    db.transactions.delete(tx.transactionId);
  };

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex gap-4">
          <button onClick={() => setCurrentTab('POS')} className={`pb-4 px-2 font-black text-xs uppercase tracking-widest transition-all relative ${currentTab === 'POS' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
            Checkout {currentTab === 'POS' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />}
          </button>
          <button onClick={() => setCurrentTab('HISTORY')} className={`pb-4 px-2 font-black text-xs uppercase tracking-widest transition-all relative ${currentTab === 'HISTORY' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
            History & Void {currentTab === 'HISTORY' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />}
          </button>
        </div>
      </div>

      {currentTab === 'POS' ? (
        <>
          {!currentShift && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center justify-between mb-2">
              <div className="flex items-center gap-3 text-amber-800">
                <AlertTriangle className="animate-pulse" />
                <span className="font-bold text-sm">SHIFT BELUM DIBUKA. Buka shift untuk berjualan.</span>
              </div>
            </div>
          )}
          <div className="flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input id="pos-search" type="text" placeholder="Cari (F2)..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <select id="customer-select" className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm shadow-sm" value={selectedCustomer?.customerId || ''} onChange={(e) => setSelectedCustomer(customers?.find(c => c.customerId === e.target.value) || null)}>
                    <option value="">PELANGGAN UMUM (F4)</option>
                    {customers?.map(c => <option key={c.customerId} value={c.customerId}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setTransactionType('SALE')} className={`flex-1 py-2 rounded-xl font-bold text-xs uppercase transition-all ${transactionType === 'SALE' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}><Banknote size={16} className="inline mr-2" /> CASH</button>
                  <button onClick={() => setTransactionType('GAJIAN')} className={`flex-1 py-2 rounded-xl font-bold text-xs uppercase transition-all ${transactionType === 'GAJIAN' ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}><CreditCard size={16} className="inline mr-2" /> GAJIAN</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {products?.map(p => (
                    <button key={p.productId} onClick={() => addToCart(p)} className="group flex flex-col p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-500 transition-all text-left">
                      <div className="w-full aspect-square bg-slate-50 rounded-xl mb-3 flex items-center justify-center text-slate-300">{p.productType === 'FISH' ? <Weight size={30} /> : <Package size={30} />}</div>
                      <h3 className="font-bold text-slate-900 text-xs truncate uppercase">{p.name}</h3>
                      <p className="text-sm font-black text-blue-600 mt-1">Rp {p.normalPrice.toLocaleString()}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="w-full lg:w-[420px] flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xl">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-slate-900 flex items-center gap-2"><ShoppingCart size={20} className="text-blue-600" /> KERANJANG</h2>
                <div className="flex gap-2">
                  <button onClick={handleHold} disabled={cart.length === 0} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg"><PauseCircle size={20} /></button>
                  <button onClick={() => setCart([])} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={20} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {cart.length === 0 ? <div className="py-20 text-center opacity-20"><ShoppingCart size={60} className="mx-auto" /><p className="text-xs font-black uppercase mt-4">Keranjang Kosong</p></div> : cart.map(item => (
                  <div key={item.productId} className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex-1 min-w-0"><h4 className="text-xs font-bold text-slate-900 truncate uppercase">{item.nameSnapshot}</h4><p className="text-[10px] text-slate-400 font-bold">Rp {item.unitPrice.toLocaleString()}</p></div>
                    <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 p-1"><button onClick={() => updateQuantity(item.productId, -1)}><Minus size={14} /></button><span className="text-xs font-black w-6 text-center">{item.quantity}</span><button onClick={() => updateQuantity(item.productId, 1)}><Plus size={14} /></button></div>
                    <div className="text-right min-w-[80px] font-black text-xs">Rp {item.subtotal.toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div className="p-6 bg-slate-900 text-white rounded-t-3xl">
                <div className="flex justify-between text-2xl font-black mb-6"><span>TOTAL</span><span className="text-blue-400">Rp {subtotal.toLocaleString()}</span></div>
                <div className="mb-6 space-y-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Metode Bayar</p>
                  <div className="grid grid-cols-3 gap-2">
                    {paymentMethods?.map(pm => (
                      <button key={pm.id} onClick={() => setPaymentMethodId(pm.id)} className={`py-2 rounded-xl text-[9px] font-black uppercase border transition-all ${paymentMethodId === pm.id ? 'bg-blue-600 border-blue-600' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>{pm.name.split(' ')[0]}</button>
                    ))}
                  </div>
                </div>
                <button onClick={handleCheckout} disabled={cart.length === 0 || isProcessing || !currentShift} className="w-full py-4 bg-blue-600 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl disabled:bg-slate-800">
                  {isProcessing ? 'PROSES...' : 'BAYAR (F8)'}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <SalesHistory />
      )}

      <AnimatePresence>
        {showSuccess && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-8 py-4 rounded-2xl shadow-2xl z-[200]">
            <span className="font-black text-sm uppercase">Transaksi Berhasil</span>
          </motion.div>
        )}
      </AnimatePresence>

      {weightProduct && <WeightModal product={weightProduct} onConfirm={(kg) => addToCart(weightProduct, kg)} onClose={() => setWeightProduct(null)} />}
      {isSettlingDebt && selectedCustomer && currentShift && currentUser && (
        <DebtSettlementModal customerId={selectedCustomer.customerId} cashierId={currentUser.userId} shiftId={currentShift.shiftId} onClose={() => setIsSettlingDebt(false)} />
      )}
    </div>
  );
}
