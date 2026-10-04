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
  User as UserIcon,
  CreditCard,
  Banknote,
  Weight,
  PauseCircle,
  X,
  PlayCircle,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Product, TransactionItem, Customer, Transaction } from '@/core/types';
import { v4 as uuidv4 } from 'uuid';
import { ShiftService } from '@/core/services/shift-service';
import { PrintService } from '@/core/utils/print-service';

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
          value={weight}
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
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<TransactionItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactionType, setTransactionType] = useState<'SALE' | 'GAJIAN'>('SALE');
  const [moneyStorageId, setMoneyStorageId] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL'>('WARUNG');
  
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);

  const currentShift = useLiveQuery(() => ShiftService.getCurrentShift('device-1'), []);

  // Hotkeys handling (PRD 97)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        document.getElementById('pos-search')?.focus();
      }
      if (e.key === 'F4') {
        e.preventDefault();
        // focus customer selector
      }
      if (e.key === 'F8') {
        e.preventDefault();
        handleCheckout();
      }
      if (e.key === 'Escape') {
        setWeightProduct(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, selectedCustomer, transactionType]);

  const products = useLiveQuery(
    () => db.products.filter(p => 
      p.name.toLowerCase().includes(search.toLowerCase()) || 
      p.barcode.includes(search) ||
      !!(p.sku && p.sku.includes(search))
    ).toArray(),
    [search]
  );

  const customers = useLiveQuery(() => db.customers.toArray());
  const heldTransactions = useLiveQuery(() => db.transactions.where('status').equals('HOLD').toArray());

  const addToCart = (product: Product, kg?: number) => {
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
      setCart(cart.map(item => 
        item.productId === product.productId 
          ? { ...item, quantity: item.quantity + quantity, subtotal: (item.quantity + quantity) * item.unitPrice } 
          : item
      ));
    } else {
      setCart([...cart, {
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
        hppSnapshot: product.hpp
      }]);
    }
    
    setWeightProduct(null);
  };

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

  const handleCheckout = async () => {
    if (cart.length === 0 || !currentUser || isProcessing || !currentShift) return;
    if (transactionType === 'GAJIAN' && !selectedCustomer) {
      alert('Pilih pelanggan untuk transaksi Gajian');
      return;
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
        paymentMethodId: 'CASH',
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
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    
    // Auto-add logic for barcode scanners (PRD 6)
    if (val && products) {
      const exactMatch = products.find(p => p.barcode === val);
      if (exactMatch) {
        addToCart(exactMatch);
        setSearch(''); // Clear for next scan
      }
    }
  };

  return (
    <div className="flex flex-col h-full gap-6">
      {!currentShift && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 text-amber-800">
            <AlertTriangle className="animate-pulse" />
            <span className="font-bold text-sm">SHIFT BELUM DIBUKA. Buka shift terlebih dahulu untuk mulai berjualan.</span>
          </div>
          <button 
            className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-amber-700 transition-all"
            onClick={() => { /* This would ideally trigger a redirect to Shift tab but the UI structure uses state in App.tsx */ }}
          >
            Buka Shift
          </button>
        </div>
      )}
      <div className="flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
        {/* Left Area: Product Search & Browse */}
        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  id="pos-search"
                  type="text" 
                  placeholder="Cari (F2) / Scan Barcode..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
              </div>
              <select 
                className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm shadow-sm"
                value={selectedCustomer?.customerId || ''}
                onChange={(e) => {
                  const cust = customers?.find(c => c.customerId === e.target.value);
                  setSelectedCustomer(cust || null);
                }}
              >
                <option value="">PELANGGAN UMUM (F4)</option>
                {customers?.map(c => (
                  <option key={c.customerId} value={c.customerId}>{c.name} {c.isReseller ? '🌟' : ''}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => setTransactionType('SALE')}
                className={`flex-1 py-2 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                  transactionType === 'SALE' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                <Banknote size={16} /> CASH
              </button>
              <button 
                onClick={() => setTransactionType('GAJIAN')}
                className={`flex-1 py-2 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                  transactionType === 'GAJIAN' ? 'bg-amber-500 text-white shadow-lg shadow-amber-200' : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                <CreditCard size={16} /> GAJIAN
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {products?.map((product) => (
                <button
                  key={product.productId}
                  onClick={() => addToCart(product)}
                  className="group flex flex-col p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-500 hover:shadow-xl transition-all text-left relative overflow-hidden"
                >
                  <div className="w-full aspect-square bg-slate-50 rounded-xl mb-3 flex items-center justify-center text-slate-300 group-hover:text-blue-500 transition-colors">
                    {product.productType === 'FISH' ? <Weight size={40} /> : <Package size={40} />}
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm line-clamp-2 mb-1">{product.name}</h3>
                  <div className="mt-auto">
                    <p className="text-lg font-black text-blue-600 tabular-nums">
                      Rp {product.normalPrice.toLocaleString()}
                    </p>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{product.baseUnit}</span>
                      <span className={`text-[10px] font-bold ${product.stock < product.minimumStock ? 'text-red-500' : 'text-slate-400'}`}>
                        STOK: {product.stock}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Area: Cart & Checkout */}
        <div className="w-full lg:w-[420px] flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xl relative">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <ShoppingCart size={20} className="text-blue-600" />
              KERANJANG
            </h2>
            <div className="flex gap-2">
              <button onClick={handleHold} disabled={cart.length === 0} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors" title="Hold Transaction (F6)">
                <PauseCircle size={20} />
              </button>
              <button onClick={() => setCart([])} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {heldTransactions && heldTransactions.length > 0 && cart.length === 0 && (
              <div className="mb-6 space-y-2">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tertunda (Hold)</h3>
                {heldTransactions.map(tx => (
                  <button 
                    key={tx.transactionId}
                    onClick={() => resumeHold(tx)}
                    className="w-full flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-xl hover:bg-amber-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-amber-700">
                      <PlayCircle size={16} />
                      <span className="text-xs font-bold">{tx.receiptNumber}</span>
                    </div>
                    <span className="text-xs font-bold text-amber-700">Rp {tx.total.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20 opacity-50">
                  <ShoppingCart size={80} strokeWidth={1} className="mb-4" />
                  <p className="text-sm font-bold uppercase tracking-widest">Kosong</p>
                </div>
              ) : (
                cart.map((item) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={item.productId} 
                    className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate uppercase">{item.nameSnapshot}</h4>
                      <p className="text-[10px] text-slate-500 font-bold">Rp {item.unitPrice.toLocaleString()} / {item.unit}</p>
                    </div>
                    <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                      <button onClick={() => updateQuantity(item.productId, -1)} className="p-1 hover:text-blue-600 transition-colors"><Minus size={14} /></button>
                      <span className="text-xs font-black w-6 text-center tabular-nums">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.productId, 1)} className="p-1 hover:text-blue-600 transition-colors"><Plus size={14} /></button>
                    </div>
                    <div className="text-right min-w-[90px]">
                      <p className="text-sm font-black text-slate-900 tabular-nums">
                        Rp {item.subtotal.toLocaleString()}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          <div className="p-6 bg-slate-900 text-white rounded-t-3xl shadow-[0_-8px_30px_rgb(0,0,0,0.12)]">
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
                <span>Subtotal</span>
                <span className="tabular-nums">Rp {subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-2xl font-black pt-3 border-t border-slate-800">
                <span className="text-slate-500 text-sm flex items-center gap-2">TOTAL <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded">IDR</span></span>
                <span className="text-blue-400 tabular-nums">Rp {subtotal.toLocaleString()}</span>
              </div>
            </div>
            
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || isProcessing || !currentShift}
              className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all relative overflow-hidden ${
                cart.length === 0 || isProcessing || !currentShift
                  ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-2xl shadow-blue-900/50 active:scale-[0.98]'
              }`}
            >
              {isProcessing ? (
                <div className="flex items-center gap-2">
                  <RefreshCw size={18} className="animate-spin" />
                  PROSES...
                </div>
              ) : (
                <>
                  <CheckCircle size={20} />
                  BAYAR (F8)
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-10 py-5 rounded-3xl shadow-2xl flex items-center gap-4 z-[100] border-4 border-emerald-500"
          >
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <CheckCircle size={24} />
            </div>
            <div>
              <span className="font-black text-lg uppercase tracking-wider block">BERHASIL</span>
              <span className="text-xs font-bold text-emerald-100">Transaksi telah dicatat secara lokal.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {weightProduct && (
        <WeightModal 
          product={weightProduct} 
          onConfirm={(kg) => addToCart(weightProduct, kg)}
          onClose={() => setWeightProduct(null)}
        />
      )}
    </div>
  );
}

function RefreshCw({ size, className }: { size?: number, className?: string }) {
  return <svg className={className} width={size || "20"} height={size || "20"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>;
}
