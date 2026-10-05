import React, { useState, useEffect } from 'react';
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
  AlertTriangle,
  QrCode,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Printer,
  Share2,
  PlusCircle,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Product, TransactionItem, Customer, Transaction } from '@/core/types';
import { v4 as uuidv4 } from 'uuid';
import { ShiftService } from '@/core/services/shift-service';
import { PrintService } from '@/core/utils/print-service';
import { useToastStore } from '@/core/toast-store';
import ShiftSummaryWidget from './ShiftSummaryWidget';

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
          value={weight ?? ''}
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
  const { addToast } = useToastStore();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<TransactionItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastTx, setLastTx] = useState<Transaction | null>(null);
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactionType, setTransactionType] = useState<'SALE' | 'GAJIAN'>('SALE');
  const [moneyStorageId, setMoneyStorageId] = useState<'WARUNG' | 'IKAN' | 'UANG_DIGITAL'>('WARUNG');
  
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);

  // Modals
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'QRIS' | 'TRANSFER'>('CASH');
  const [cashTendered, setCashTendered] = useState<number>(0);
  
  const [isQuickAddProductOpen, setIsQuickAddProductOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductCategory, setNewProductCategory] = useState<'SEMBAKO' | 'FISH' | 'MINUMAN' | 'LAINNYA'>('SEMBAKO');
  const [newProductUnit, setNewProductUnit] = useState('PCS');

  const [isHeldModalOpen, setIsHeldModalOpen] = useState(false);

  // Gajian Owner Approval Modal
  const [isGajianApprovalOpen, setIsGajianApprovalOpen] = useState(false);
  const [ownerPinInput, setOwnerPinInput] = useState('');
  const [approvalError, setApprovalError] = useState('');

  const currentShift = useLiveQuery(() => ShiftService.getCurrentShift('device-1'), []);

  // Hotkeys handling (PRD 97)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        document.getElementById('pos-search')?.focus();
      }
      if (e.key === 'F6') {
        e.preventDefault();
        handleHold();
      }
      if (e.key === 'F8') {
        e.preventDefault();
        triggerCheckout();
      }
      if (e.key === 'Escape') {
        setWeightProduct(null);
        setIsPaymentModalOpen(false);
        setIsQuickAddProductOpen(false);
        setIsHeldModalOpen(false);
        setIsGajianApprovalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, selectedCustomer, transactionType, isPaymentModalOpen]);

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

  const subtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);

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
      customerId: selectedCustomer?.customerId,
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
    setSelectedCustomer(null);
  };

  const resumeHold = (tx: Transaction) => {
    setCart(tx.items);
    setTransactionType(tx.type as any);
    if (tx.customerId) {
      const cust = customers?.find(c => c.customerId === tx.customerId);
      setSelectedCustomer(cust || null);
    }
    db.transactions.delete(tx.transactionId);
    setIsHeldModalOpen(false);
  };

  const deleteHold = async (txId: string) => {
    await db.transactions.delete(txId);
  };

  // Open Checkout or Gajian Approval
  const triggerCheckout = () => {
    if (cart.length === 0 || !currentUser || isProcessing || !currentShift) return;

    if (transactionType === 'GAJIAN') {
      if (!selectedCustomer) {
        addToast('Pilih pelanggan terlebih dahulu untuk transaksi Gajian!', 'error');
        return;
      }

      // Check customer permission for Gajian (credit limit > 0)
      const hasPermission = selectedCustomer.creditLimit && selectedCustomer.creditLimit >= subtotal;
      if (!hasPermission) {
        // Requires Owner Approval
        setApprovalError('');
        setOwnerPinInput('');
        setIsGajianApprovalOpen(true);
        return;
      }

      // Direct gajian payment
      executeFinalSale('GAJIAN');
      return;
    }

    // Normal Sale Payment Modal
    setCashTendered(subtotal);
    setIsPaymentModalOpen(true);
  };

  const handleOwnerApproveGajian = async () => {
    const ownerUser = await db.users.filter(u => u.role === 'OWNER' && u.pinHash === ownerPinInput).first();
    if (!ownerUser) {
      setApprovalError('PIN Owner salah! Otorisasi gajian ditolak.');
      return;
    }

    setIsGajianApprovalOpen(false);
    executeFinalSale('GAJIAN');
  };

  const executeFinalSale = async (finalMethod: string) => {
    if (!currentUser || !currentShift) return;

    setIsProcessing(true);
    try {
      const transactionId = await TransactionEngine.createSale({
        cashierId: currentUser.userId,
        deviceId: 'device-1',
        shiftId: currentShift.shiftId,
        customerId: selectedCustomer?.customerId,
        items: cart,
        discount: 0,
        paymentMethodId: finalMethod,
        moneyStorageId: moneyStorageId,
        type: transactionType
      });
      
      const transaction = await db.transactions.get(transactionId);
      if (transaction) {
        setLastTx(transaction);
        PrintService.printReceipt(transaction);
      }

      setCart([]);
      setSelectedCustomer(null);
      setTransactionType('SALE');
      setIsPaymentModalOpen(false);
      addToast(`Transaksi ${transaction?.receiptNumber || ''} Berhasil!`, 'success');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Checkout failed:', error);
      addToast('Gagal memproses transaksi. Cek riwayat atau coba lagi.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    
    // Auto-add logic for barcode scanners
    if (val && products) {
      const exactMatch = products.find(p => p.barcode === val);
      if (exactMatch) {
        addToCart(exactMatch);
        setSearch(''); // Clear for next scan
      }
    }
  };

  // Quick Add Product by Kasir
  const handleQuickAddProduct = async () => {
    if (!newProductName.trim() || !newProductPrice) return;

    const prodId = uuidv4();
    const priceNum = Number(newProductPrice) || 0;
    const barcodeVal = newProductBarcode.trim() || `888${Date.now().toString().slice(-6)}`;

    const newProd: Product = {
      productId: prodId,
      sku: `PROD-${Date.now().toString().slice(-4)}`,
      barcode: barcodeVal,
      name: newProductName.trim(),
      categoryId: newProductCategory,
      productType: newProductCategory === 'FISH' ? 'FISH' : 'SEMBAKO',
      baseUnit: newProductUnit,
      saleUnits: [newProductUnit],
      conversionRules: [],
      normalPrice: priceNum,
      hpp: priceNum * 0.85, // estimated default
      stock: 20,
      minimumStock: 5,
      targetStock: 25,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.products.add(newProd);

    // Auto add to cart
    addToCart(newProd);

    // Reset & Close
    setNewProductName('');
    setNewProductBarcode('');
    setNewProductPrice('');
    setIsQuickAddProductOpen(false);
  };

  const quickCashOptions = [
    subtotal,
    Math.ceil(subtotal / 10000) * 10000,
    Math.ceil(subtotal / 50000) * 50000,
    100000,
    200000,
    500000
  ].filter((v, idx, arr) => v >= subtotal && arr.indexOf(v) === idx);

  const changeDue = Math.max(0, cashTendered - subtotal);

  return (
    <div className="flex flex-col h-full gap-3 overflow-hidden">
      {!currentShift && (
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 text-amber-800">
            <AlertTriangle size={18} className="animate-pulse shrink-0" />
            <span className="font-bold text-xs">SHIFT BELUM DIBUKA. Buka shift kasir terlebih dahulu untuk mulai melayani transaksi.</span>
          </div>
        </div>
      )}

      {/* Main Catalog & Cart Area */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 overflow-hidden">
        {/* Left Area: Product Search, Filter & Catalog */}
        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-3.5 border-b border-slate-100 bg-slate-50/50 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input 
                  id="pos-search"
                  type="text" 
                  placeholder="Cari (F2) / Scan Barcode Produk..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs shadow-sm font-medium"
                  value={search ?? ''}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
              </div>

              {/* Quick Add Product Button for Kasir */}
              <button
                onClick={() => {
                  setNewProductBarcode(search);
                  setIsQuickAddProductOpen(true);
                }}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-200 transition-all shrink-0"
                title="Daftarkan produk cepat langsung dari POS"
              >
                <PlusCircle size={15} />
                <span>+ Produk Cepat</span>
              </button>

              <select 
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-xs shadow-sm max-w-[200px]"
                value={selectedCustomer?.customerId || ''}
                onChange={(e) => {
                  const cust = customers?.find(c => c.customerId === e.target.value);
                  setSelectedCustomer(cust || null);
                }}
              >
                <option value="">PELANGGAN UMUM (F4)</option>
                {customers?.map(c => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.name} {c.isReseller ? '★ Reseller' : ''} {c.creditLimit > 0 ? `(Gajian: Rp ${c.creditLimit.toLocaleString()})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => setTransactionType('SALE')}
                className={`flex-1 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                  transactionType === 'SALE' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Banknote size={15} /> PENJUALAN BIASA (CASH/QRIS)
              </button>

              <button 
                onClick={() => setTransactionType('GAJIAN')}
                className={`flex-1 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                  transactionType === 'GAJIAN' ? 'bg-amber-500 text-white shadow-md shadow-amber-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <CreditCard size={15} /> TRANSAKSI GAJIAN (TEMPO)
              </button>
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {products && products.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {products.map((product) => (
                  <button
                    key={product.productId}
                    onClick={() => addToCart(product)}
                    className="group flex flex-col p-3 bg-white border border-slate-100 rounded-2xl hover:border-blue-500 hover:shadow-lg transition-all text-left relative overflow-hidden"
                  >
                    <div className="w-full aspect-square bg-slate-50 rounded-xl mb-2 flex items-center justify-center text-slate-300 group-hover:text-blue-500 transition-colors">
                      {product.productType === 'FISH' ? <Weight size={32} /> : <Package size={32} />}
                    </div>
                    <h3 className="font-bold text-slate-900 text-xs line-clamp-2 leading-tight mb-1">{product.name}</h3>
                    <div className="mt-auto flex justify-between items-center pt-1 border-t border-slate-50">
                      <span className="font-black text-blue-600 text-xs tabular-nums">
                        Rp {product.normalPrice.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold">
                        Stok: {product.stock} {product.baseUnit}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 text-slate-400">
                <Package size={40} className="mb-2 text-slate-300" />
                <p className="font-bold text-xs uppercase tracking-wider">Produk tidak ditemukan</p>
                <button
                  onClick={() => {
                    setNewProductBarcode(search);
                    setIsQuickAddProductOpen(true);
                  }}
                  className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-500 shadow-sm"
                >
                  + Daftarkan "{search}" Sekarang
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Area: Cart & Checkout */}
        <div className="w-full lg:w-[400px] flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xl relative shrink-0">
          <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <ShoppingCart size={18} className="text-blue-600" />
              KERANJANG ({cart.length})
            </h2>

            <div className="flex items-center gap-1.5">
              {/* Hold Transaction Button */}
              <button 
                onClick={handleHold} 
                disabled={cart.length === 0} 
                className="px-2.5 py-1 text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-40" 
                title="Hold Keranjang (F6)"
              >
                <PauseCircle size={14} />
                <span>Hold</span>
              </button>

              {/* View Held Carts */}
              {heldTransactions && heldTransactions.length > 0 && (
                <button
                  onClick={() => setIsHeldModalOpen(true)}
                  className="px-2.5 py-1 bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm hover:bg-amber-600 transition-all"
                  title="Lihat transaksi tertunda"
                >
                  <PlayCircle size={14} />
                  <span>{heldTransactions.length} Hold</span>
                </button>
              )}

              {/* Clear Cart */}
              <button 
                onClick={() => setCart([])} 
                disabled={cart.length === 0}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                title="Kosongkan Keranjang"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 py-16 opacity-50">
                  <ShoppingCart size={60} strokeWidth={1} className="mb-2" />
                  <p className="text-xs font-bold uppercase tracking-widest">Keranjang Kosong</p>
                  <span className="text-[11px] text-slate-400 mt-1">Scan barcode atau pilih barang di kiri</span>
                </div>
              ) : (
                cart.map((item) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={item.productId} 
                    className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate uppercase">{item.nameSnapshot}</h4>
                      <p className="text-[10px] text-slate-500 font-bold">
                        Rp {item.unitPrice.toLocaleString()} / {item.unit}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                      <button onClick={() => updateQuantity(item.productId, -1)} className="p-0.5 text-slate-500 hover:text-blue-600 transition-colors">
                        <Minus size={13} />
                      </button>
                      <span className="text-xs font-black w-6 text-center tabular-nums">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.productId, 1)} className="p-0.5 text-slate-500 hover:text-blue-600 transition-colors">
                        <Plus size={13} />
                      </button>
                    </div>

                    <div className="text-right min-w-[75px]">
                      <p className="text-xs font-black text-slate-900 tabular-nums">
                        Rp {item.subtotal.toLocaleString()}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Cart Bottom Checkout Panel */}
          <div className="p-4 bg-slate-900 text-white rounded-t-2xl shadow-xl shrink-0">
            <div className="space-y-1.5 mb-3">
              <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                <span>Subtotal ({cart.reduce((a, c) => a + c.quantity, 0)} item)</span>
                <span className="tabular-nums">Rp {subtotal.toLocaleString()}</span>
              </div>

              {selectedCustomer && (
                <div className="flex justify-between text-[11px] text-blue-400 font-bold">
                  <span>Pelanggan:</span>
                  <span>{selectedCustomer.name}</span>
                </div>
              )}

              <div className="flex justify-between text-xl font-black pt-2 border-t border-slate-800">
                <span className="text-slate-400 text-xs flex items-center gap-1.5">
                  TOTAL <span className="text-[9px] bg-slate-800 px-1 py-0.5 rounded">IDR</span>
                </span>
                <span className="text-blue-400 tabular-nums">Rp {subtotal.toLocaleString()}</span>
              </div>
            </div>
            
            <button
              onClick={triggerCheckout}
              disabled={cart.length === 0 || isProcessing || !currentShift}
              className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all shadow-xl ${
                cart.length === 0 || isProcessing || !currentShift
                  ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/50 active:scale-[0.98]'
              }`}
            >
              {isProcessing ? (
                <span>MEMPROSES...</span>
              ) : (
                <>
                  <CheckCircle size={18} />
                  <span>BAYAR (F8)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Compact Shift Summary Widget at the bottom */}
      <div className="shrink-0">
        <ShiftSummaryWidget />
      </div>

      {/* Normal Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">Pembayaran Kasir</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {/* Total Display */}
            <div className="bg-blue-50 p-4 rounded-2xl mb-4 text-center border border-blue-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-500 block mb-1">Total Tagihan</span>
              <span className="text-3xl font-black text-blue-600 tabular-nums">
                Rp {subtotal.toLocaleString()}
              </span>
            </div>

            {/* Payment Method Selector */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {(['CASH', 'QRIS', 'TRANSFER'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2.5 rounded-xl font-black text-xs uppercase tracking-wider border transition-all ${
                    paymentMethod === method
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {method === 'CASH' ? 'Tunai (Cash)' : method}
                </button>
              ))}
            </div>

            {paymentMethod === 'CASH' && (
              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Uang Diterima (Rp)
                  </label>
                  <input
                    type="number"
                    value={cashTendered ?? 0}
                    onChange={(e) => setCashTendered(Number(e.target.value))}
                    className="w-full text-xl font-black text-center p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 tabular-nums"
                  />
                </div>

                {/* Quick Cash Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {quickCashOptions.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setCashTendered(opt)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black tabular-nums transition-all ${
                        cashTendered === opt
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {opt === subtotal ? 'Uang Pas' : `Rp ${opt.toLocaleString()}`}
                    </button>
                  ))}
                </div>

                {/* Kembalian */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-600">Kembalian:</span>
                  <span className={`font-black text-base tabular-nums ${changeDue >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    Rp {changeDue.toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="flex-1 py-3 font-bold text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={() => executeFinalSale(paymentMethod)}
                disabled={paymentMethod === 'CASH' && cashTendered < subtotal}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-200 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none transition-all flex items-center justify-center gap-1.5"
              >
                <CheckCircle size={16} />
                Selesai & Cetak Struk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Product Modal */}
      {isQuickAddProductOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 text-emerald-600 font-black text-sm uppercase">
                <PlusCircle size={18} />
                <span>Tambah Produk Cepat (Kasir)</span>
              </div>
              <button onClick={() => setIsQuickAddProductOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 mb-5 text-xs">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Nama Barang *
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Minyak Goreng 1L"
                  value={newProductName ?? ''}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Barcode / SKU
                  </label>
                  <input
                    type="text"
                    placeholder="Scan / Ketik"
                    value={newProductBarcode ?? ''}
                    onChange={(e) => setNewProductBarcode(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Harga Jual (Rp) *
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={newProductPrice ?? ''}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-blue-600 tabular-nums outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Kategori
                  </label>
                  <select
                    value={newProductCategory}
                    onChange={(e) => setNewProductCategory(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                  >
                    <option value="SEMBAKO">SEMBAKO</option>
                    <option value="FISH">IKAN (KG)</option>
                    <option value="MINUMAN">MINUMAN</option>
                    <option value="LAINNYA">LAINNYA</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Satuan
                  </label>
                  <select
                    value={newProductUnit}
                    onChange={(e) => setNewProductUnit(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                  >
                    <option value="PCS">PCS</option>
                    <option value="KG">KG</option>
                    <option value="DUS">DUS</option>
                    <option value="BUNGKUS">BUNGKUS</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setIsQuickAddProductOpen(false)}
                className="flex-1 py-3 font-bold text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleQuickAddProduct}
                disabled={!newProductName.trim() || !newProductPrice}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-200 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none transition-all flex items-center justify-center gap-1.5"
              >
                <Plus size={16} />
                Simpan & Masukkan Keranjang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Held Transactions Modal */}
      {isHeldModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-black text-slate-900 text-base uppercase tracking-tight flex items-center gap-2">
                <PlayCircle className="text-amber-500" />
                Daftar Transaksi Tertunda (Hold)
              </h3>
              <button onClick={() => setIsHeldModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 mb-5">
              {heldTransactions && heldTransactions.length > 0 ? (
                heldTransactions.map((tx) => (
                  <div key={tx.transactionId} className="flex items-center justify-between p-3 bg-amber-50/70 border border-amber-200 rounded-2xl">
                    <div>
                      <span className="font-mono font-bold text-xs text-amber-900 block">{tx.receiptNumber}</span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {tx.items.length} item • Rp {tx.total.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => deleteHold(tx.transactionId)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded-xl transition-all"
                        title="Hapus"
                      >
                        <Trash2 size={15} />
                      </button>

                      <button
                        onClick={() => resumeHold(tx)}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1 transition-all"
                      >
                        <PlayCircle size={14} />
                        Lanjutkan
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center py-8 text-slate-400 text-xs">Tidak ada transaksi yang di-hold.</p>
              )}
            </div>

            <button
              onClick={() => setIsHeldModalOpen(false)}
              className="w-full py-2.5 font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl uppercase tracking-wider"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Gajian Owner Approval Modal */}
      {isGajianApprovalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4 text-amber-600">
              <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">
                  Otorisasi Gajian
                </h3>
                <span className="text-xs text-slate-500">Izin Owner Diperlukan</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Pelanggan <strong className="text-slate-900">{selectedCustomer?.name}</strong> belum memiliki limit gajian otomatis (atau batas terlampaui).
            </p>

            <div className="p-3 bg-slate-50 rounded-2xl mb-4 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Tagihan:</span>
                <span className="font-black text-slate-900 tabular-nums">Rp {subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Limit Saat Ini:</span>
                <span className="font-bold text-slate-700 tabular-nums">
                  Rp {(selectedCustomer?.creditLimit || 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-2 mb-5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block text-center">
                Masukkan PIN Owner (123456)
              </label>
              <input
                type="password"
                maxLength={6}
                value={ownerPinInput ?? ''}
                onChange={(e) => setOwnerPinInput(e.target.value)}
                placeholder="6 Digit PIN Owner"
                className="w-full p-3 bg-slate-50 border border-amber-300 rounded-xl text-center font-black text-lg tracking-widest outline-none focus:ring-2 focus:ring-amber-500"
              />

              {approvalError && (
                <p className="text-rose-600 text-[11px] font-bold text-center">
                  {approvalError}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setIsGajianApprovalOpen(false)}
                className="flex-1 py-3 font-bold text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleOwnerApproveGajian}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-200 transition-all"
              >
                Setujui Transaksi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-16 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-4 z-[100] border-4 border-emerald-500"
          >
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <CheckCircle size={22} />
            </div>
            <div>
              <span className="font-black text-base uppercase tracking-wider block">TRANSAKSI BERHASIL</span>
              <span className="text-xs font-bold text-emerald-100">
                Struk {lastTx?.receiptNumber} dicatat & dicetak.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Weight Modal for Fish items */}
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
