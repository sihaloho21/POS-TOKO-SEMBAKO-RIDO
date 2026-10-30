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
  Layers,
  Eye,
  AlertOctagon,
  Store,
  Clock,
  Camera,
  Zap,
  Trophy,
  Sparkles,
  Wallet,
  Calendar,
  History,
  Apple
} from 'lucide-react';
import { addDays, format } from 'date-fns';
import { CameraBarcodeScanner } from '@/components/CameraBarcodeScanner';
import { QuickSaleModal } from './QuickSaleModal';
import { DebtCorrectionModal } from './DebtCorrectionModal';
import { SalesHistory } from './SalesHistory';
import { LoyaltyEngine } from '@/core/loyalty-engine';
import { formatMultiUnitBreakdown, getProductAvailableUnits } from '@/core/utils/unit-helper';
import { motion, AnimatePresence } from 'motion/react';
import type { Product, TransactionItem, Customer, Transaction, Bundle, GajianTempoType, MoneyStorageId } from '@/core/types';
import { calculateGajianDueDate, formatGajianDueDateLabel } from '@/core/utils/gajian-tempo';
import { v4 as uuidv4 } from 'uuid';
import { ShiftService } from '@/core/services/shift-service';
import { StoreStatusService } from '@/core/services/store-status-service';
import { StockService } from '@/core/services/stock-service';
import { ProductService } from '@/core/services/product-service';
import { useDeviceId } from '@/core/device-store';
import { PrintService } from '@/core/utils/print-service';
import { useToastStore } from '@/core/toast-store';
import { BundleService, type FlattenedBundleComponent } from '@/core/services/bundle-service';
import ShiftSummaryWidget from './ShiftSummaryWidget';
import ClockInModal from '@/app/shift/ClockInModal';

export function WeightModal({ product, onConfirm, onClose }: { product: Product, onConfirm: (kg: number) => void, onClose: () => void }) {
  const [weight, setWeight] = useState('');
  const isFruit = product.productType === 'FRUIT' || product.categoryId === 'BUAH';
  const numericWeight = Number(weight) || 0;
  const estimatedSubtotal = Math.round(numericWeight * product.normalPrice);

  const addPreset = (delta: number) => {
    const cur = Number(weight) || 0;
    const next = Math.max(0, Number((cur + delta).toFixed(2)));
    setWeight(next.toString());
  };

  const setExact = (val: number) => {
    setWeight(val.toString());
  };
  
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-sm shadow-2xl border border-slate-200">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md ${isFruit ? 'bg-emerald-600 shadow-emerald-200' : 'bg-blue-600 shadow-blue-200'}`}>
            {isFruit ? <Apple size={24} /> : <Weight size={24} />}
          </div>
          <div>
            <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">{product.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Timbangan Kasir ({product.baseUnit || 'KG'}) • Rp {product.normalPrice.toLocaleString()}/kg
            </p>
          </div>
        </div>

        {/* Input Berat */}
        <div className="relative mb-3">
          <input 
            autoFocus
            type="number" 
            step="0.01"
            className="w-full text-4xl font-black text-center py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-emerald-500 outline-none tabular-nums"
            placeholder="0.00"
            value={weight ?? ''}
            onChange={(e) => setWeight(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && numericWeight > 0 && onConfirm(numericWeight)}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
            {product.baseUnit || 'KG'}
          </span>
        </div>

        {/* Live Subtotal Preview */}
        {numericWeight > 0 && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl mb-4 text-center">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Estimasi Total Harga</span>
            <span className="text-xl font-black text-emerald-800 tabular-nums">
              Rp {estimatedSubtotal.toLocaleString()}
            </span>
          </div>
        )}

        {/* Quick Timbangan Presets */}
        <div className="mb-4 space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Tombol Pintas Berat Cepat:</span>
          <div className="grid grid-cols-4 gap-1.5">
            {[0.25, 0.5, 1.0, 2.0].map((kg) => (
              <button
                key={kg}
                type="button"
                onClick={() => addPreset(kg)}
                className="py-1.5 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 text-slate-700 rounded-lg text-xs font-black transition-colors"
              >
                +{kg} kg
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {[0.5, 1.0, 1.5, 2.0].map((kg) => (
              <button
                key={`exact-${kg}`}
                type="button"
                onClick={() => setExact(kg)}
                className="py-1 bg-slate-50 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition-colors"
              >
                ={kg} kg
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setWeight('')}
            className="w-full py-1 text-slate-400 hover:text-rose-600 text-[10px] font-bold transition-colors text-center"
          >
            Reset / Bersihkan (C)
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-xs text-slate-500 uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all">Batal</button>
          <button 
            onClick={() => onConfirm(numericWeight)}
            disabled={!weight || numericWeight <= 0}
            className="flex-1 py-3 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-emerald-500 shadow-lg shadow-emerald-200 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none transition-all cursor-pointer"
          >
            Masukkan Cart
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
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'ALL' | 'FRUIT' | 'FISH' | 'BUNDLE' | 'SEMBAKO'>('ALL');
  const [cart, setCart] = useState<TransactionItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastTx, setLastTx] = useState<Transaction | null>(null);
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactionType, setTransactionType] = useState<'SALE' | 'GAJIAN'>('SALE');
  const [moneyStorageId, setMoneyStorageId] = useState<MoneyStorageId>('WARUNG');
  const [activeGajianTempoType, setActiveGajianTempoType] = useState<GajianTempoType>('TANGGAL_6_7');
  const [activeGajianDay, setActiveGajianDay] = useState<number>(7);
  
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);

  // Modals
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'QRIS' | 'TRANSFER'>('CASH');
  const [cashTendered, setCashTendered] = useState<number>(0);

  // Partial Payment / Bon Kasir States (Uang Pembeli Kurang)
  const [allowPartialDebt, setAllowPartialDebt] = useState(false);
  const [partialDueDateDays, setPartialDueDateDays] = useState<number>(1); // Default 1 Hari (Besok)
  const [customPartialDueDate, setCustomPartialDueDate] = useState<string>('');
  const [partialDebtCustomerName, setPartialDebtCustomerName] = useState<string>('');
  const [partialDebtCustomerPhone, setPartialDebtCustomerPhone] = useState<string>('');
  const [isQuickAddCustomerInCheckout, setIsQuickAddCustomerInCheckout] = useState(false);
  const [selectedCustomerIdInCheckout, setSelectedCustomerIdInCheckout] = useState<string>('');
  const [partialDebtNotes, setPartialDebtNotes] = useState<string>('');
  const [partialOwnerPin, setPartialOwnerPin] = useState<string>('');
  const [partialPinError, setPartialPinError] = useState<string>('');

  // Retroactive Debt Correction Modal (Transaksi Terlanjur Selesai / Terlanjur Lunas)
  const [txToCorrect, setTxToCorrect] = useState<Transaction | null>(null);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [isSalesHistoryModalOpen, setIsSalesHistoryModalOpen] = useState(false);
  
  const [isQuickAddProductOpen, setIsQuickAddProductOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductCategory, setNewProductCategory] = useState<'SEMBAKO' | 'FISH' | 'MINUMAN' | 'LAINNYA'>('SEMBAKO');
  const [newProductUnit, setNewProductUnit] = useState('PCS');

  // Camera Barcode Scanner
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [lastScannedProduct, setLastScannedProduct] = useState<{ name: string; price?: number; barcode: string } | null>(null);

  // Quick Sale Modal
  const [isQuickSaleOpen, setIsQuickSaleOpen] = useState(false);

  const [isHeldModalOpen, setIsHeldModalOpen] = useState(false);

  // Gajian Owner Approval Modal
  const [isGajianApprovalOpen, setIsGajianApprovalOpen] = useState(false);
  const [ownerPinInput, setOwnerPinInput] = useState('');
  const [approvalError, setApprovalError] = useState('');

  // Owner Stock Override Modal
  const [overrideStockPrompt, setOverrideStockPrompt] = useState<{ message: string; method: string } | null>(null);
  const [overrideOwnerPin, setOverrideOwnerPin] = useState('');
  const [overridePinError, setOverridePinError] = useState('');

  // Bundle Availability & Preview
  const [bundleStocks, setBundleStocks] = useState<Record<string, number>>({});
  const [inspectBundle, setInspectBundle] = useState<{
    bundle: Bundle;
    breakdown: FlattenedBundleComponent[];
  } | null>(null);

  const [isClockInModalOpen, setIsClockInOpen] = useState(false);
  const deviceId = useDeviceId();
  const storeConfig = useLiveQuery(() => StoreStatusService.getStoreStatus(), []);
  const currentShift = useLiveQuery(
    () => ShiftService.getCurrentShift(deviceId, currentUser?.userId),
    [deviceId, currentUser?.userId]
  );
  const isStoreClosedForCashier = storeConfig?.status === 'TUTUP' && currentUser?.role !== 'OWNER';

  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Auto-focus search on mount and after certain actions
  useEffect(() => {
    const focusSearch = () => {
      // Don't focus if a modal is open or another input is focused
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA' || activeEl?.tagName === 'SELECT';
      const hasModal = !!(isPaymentModalOpen || isQuickAddProductOpen || isHeldModalOpen || isGajianApprovalOpen || isSalesHistoryModalOpen || weightProduct || overrideStockPrompt || isQuickSaleOpen || isClockInModalOpen);
      
      if (!isInput && !hasModal) {
        searchInputRef.current?.focus();
      }
    };

    focusSearch();
    const interval = setInterval(focusSearch, 2000); // Re-focus every 2s if lost
    return () => clearInterval(interval);
  }, [isPaymentModalOpen, isQuickAddProductOpen, isHeldModalOpen, isGajianApprovalOpen, isSalesHistoryModalOpen, weightProduct, overrideStockPrompt, isQuickSaleOpen, isClockInModalOpen]);

  // Hotkeys handling (PRD 97) + Global Scanner Redirect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Hotkeys
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'F3') {
        e.preventDefault();
        setIsCameraScannerOpen(prev => !prev);
      }
      if (e.key === 'F4') {
        e.preventDefault();
        setIsSalesHistoryModalOpen(prev => !prev);
      }
      if (e.key === 'F6') {
        e.preventDefault();
        setIsQuickSaleOpen(prev => !prev);
      }
      if (e.key === 'F7') {
        e.preventDefault();
        handleHold();
      }
      if (e.key === 'F8') {
        e.preventDefault();
        triggerCheckout();
      }
      if (e.key === 'Escape') {
        setWeightProduct(null);
        setIsCameraScannerOpen(false);
        setIsQuickSaleOpen(false);
        setIsPaymentModalOpen(false);
        setIsQuickAddProductOpen(false);
        setIsHeldModalOpen(false);
        setIsGajianApprovalOpen(false);
        setIsSalesHistoryModalOpen(false);
      }

      // 2. Global Scanner Redirect:
      // If user types a character and no input is focused, redirect to search
      const activeEl = document.activeElement;
      const isInputFocused = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA' || activeEl?.tagName === 'SELECT';
      const hasModal = !!(isPaymentModalOpen || isQuickAddProductOpen || isHeldModalOpen || isGajianApprovalOpen || isSalesHistoryModalOpen || weightProduct || overrideStockPrompt || isQuickSaleOpen || isClockInModalOpen);

      if (!isInputFocused && !hasModal && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Only printable characters or specific scanner triggers
        if (e.key.length === 1 || e.key === 'Enter') {
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, selectedCustomer, transactionType, isPaymentModalOpen, isQuickAddProductOpen, isHeldModalOpen, isGajianApprovalOpen, isSalesHistoryModalOpen, weightProduct, overrideStockPrompt, isQuickSaleOpen, isClockInModalOpen]);

  const products = useLiveQuery(
    () => db.products.filter(p => {
      if (p.status !== 'ACTIVE') return false;
      if (selectedCategoryTab === 'FRUIT' && p.productType !== 'FRUIT') return false;
      if (selectedCategoryTab === 'FISH' && p.productType !== 'FISH') return false;
      if (selectedCategoryTab === 'BUNDLE' && p.productType !== 'BUNDLE') return false;
      if (selectedCategoryTab === 'SEMBAKO' && (p.productType === 'FRUIT' || p.productType === 'FISH' || p.productType === 'BUNDLE')) return false;

      return (
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) || 
        p.barcode.includes(search) ||
        !!(p.sku && p.sku.includes(search)) ||
        Boolean(p.conversionRules && p.conversionRules.some(r => r.barcode && r.barcode.includes(search)))
      );
    }).toArray(),
    [search, selectedCategoryTab]
  );

  const customers = useLiveQuery(() => db.customers.toArray());
  const heldTransactions = useLiveQuery(() => db.transactions.where('status').equals('HOLD').toArray());

  // Dynamically calculate assemblable bundle availability from component stock
  useEffect(() => {
    let isMounted = true;
    const calculateStocks = async () => {
      if (!products) return;
      const bundleProds = products.filter(p => p.productType === 'BUNDLE');
      const stocks: Record<string, number> = {};
      for (const bp of bundleProds) {
        try {
          stocks[bp.productId] = await BundleService.getAvailableBundleStock(bp.productId);
        } catch {
          stocks[bp.productId] = 0;
        }
      }
      if (isMounted) setBundleStocks(stocks);
    };
    calculateStocks();
    return () => { isMounted = false; };
  }, [products]);

  const handleInspectBundle = async (bundleId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const bundle = await db.bundles.get(bundleId);
    if (!bundle) return;
    try {
      const breakdown = await BundleService.flattenComponents(bundleId, 1);
      setInspectBundle({ bundle, breakdown });
    } catch {
      setInspectBundle({ bundle, breakdown: [] });
    }
  };

  const subtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);

  // Dynamic Loyalty & Member Tier Configuration
  const loyaltyConfig = useLiveQuery(() => db.settings.get('loyalty'));
  const [customerLoyaltyStats, setCustomerLoyaltyStats] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    if (selectedCustomer?.customerId) {
      LoyaltyEngine.getCustomerStats(selectedCustomer.customerId).then(stats => {
        if (isMounted) setCustomerLoyaltyStats(stats);
      });
    } else {
      setCustomerLoyaltyStats(null);
    }
    return () => { isMounted = false; };
  }, [selectedCustomer?.customerId, selectedCustomer?.loyaltyPoints, loyaltyConfig]);

  const POINT_VALUE = loyaltyConfig?.pointRedemptionValue || 100;
  const MIN_REDEEM_PTS = loyaltyConfig?.minRedemptionPoints || 50;
  const isLoyaltyEnabled = loyaltyConfig?.isEnabled ?? true;
  const excludeReseller = loyaltyConfig?.excludeReseller ?? true;

  // Member Tier Discount (Non-reseller retail only)
  const memberTierDiscountPercent = (isLoyaltyEnabled && !selectedCustomer?.isReseller && customerLoyaltyStats?.tierDiscountPercent) 
    ? customerLoyaltyStats.tierDiscountPercent 
    : 0;
  const memberTierDiscountAmount = Math.round((subtotal * memberTierDiscountPercent) / 100);
  const subtotalAfterTierDiscount = Math.max(0, subtotal - memberTierDiscountAmount);

  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState<number>(0);
  const availableCustomerPoints = (isLoyaltyEnabled && !(excludeReseller && selectedCustomer?.isReseller) && selectedCustomer?.loyaltyPoints) 
    ? selectedCustomer.loyaltyPoints 
    : 0;
  const maxRedeemablePoints = availableCustomerPoints >= MIN_REDEEM_PTS
    ? Math.min(availableCustomerPoints, Math.floor(subtotalAfterTierDiscount / POINT_VALUE))
    : 0;
  const activeRedeemPoints = Math.min(loyaltyPointsToRedeem, maxRedeemablePoints);
  const loyaltyDiscount = activeRedeemPoints * POINT_VALUE;
  const totalCartDiscount = memberTierDiscountAmount + loyaltyDiscount;
  const payableTotal = Math.max(0, subtotalAfterTierDiscount - loyaltyDiscount);

  // Reset redeemed points and sync customer gajian tempo settings when customer changes
  useEffect(() => {
    setLoyaltyPointsToRedeem(0);
    if (selectedCustomer) {
      setActiveGajianTempoType(selectedCustomer.gajianTempoType || 'TANGGAL_6_7');
      setActiveGajianDay(selectedCustomer.gajianDate || 7);
    } else {
      setActiveGajianTempoType('TANGGAL_6_7');
      setActiveGajianDay(7);
    }
  }, [selectedCustomer?.customerId]);

  // Recalculate cart item prices when customer or transactionType (SALE <-> GAJIAN) changes
  useEffect(() => {
    if (cart.length === 0 || !products) return;
    setCart(prevCart =>
      prevCart.map(item => {
        const prod = products.find(p => p.productId === item.productId);
        if (!prod) return item;
        const pricing = PricingEngine.calculateItemPrice({
          product: prod,
          customer: selectedCustomer || undefined,
          transactionType,
          unit: item.unit || prod.baseUnit
        });
        return {
          ...item,
          unitPrice: pricing.price,
          priceSource: pricing.priceSource,
          netPrice: pricing.price,
          subtotal: Math.round(pricing.price * item.quantity)
        };
      })
    );
  }, [selectedCustomer, transactionType]);

  const addToCart = (product: Product, qtyOrKg?: number, preferredUnit?: string) => {
    const isWeightedItem = product.productType === 'FISH' || product.productType === 'FRUIT' || (product.baseUnit === 'KG' && !product.productType);
    if (isWeightedItem && qtyOrKg === undefined) {
      setWeightProduct(product);
      return;
    }

    const targetUnit = preferredUnit || product.baseUnit;

    const pricing = PricingEngine.calculateItemPrice({
      product,
      customer: selectedCustomer || undefined,
      transactionType,
      unit: targetUnit
    });

    const quantity = qtyOrKg || 1;
    // Distinguish cart items by productId AND unit (e.g. 1 BUNGKUS + 2 BATANG in the same cart)
    const existing = cart.find(item => item.productId === product.productId && item.unit === targetUnit);
    
    if (existing) {
      const isWeighted = product.productType === 'FISH' || product.productType === 'FRUIT' || targetUnit === 'KG';
      const newTotalQty = isWeighted
        ? Number((existing.quantity + quantity).toFixed(2))
        : existing.quantity + quantity;
      setCart(cart.map(item => 
        (item.productId === product.productId && item.unit === targetUnit)
          ? { ...item, quantity: newTotalQty, subtotal: Math.round(newTotalQty * item.unitPrice) } 
          : item
      ));
    } else {
      setCart([...cart, {
        productId: product.productId,
        nameSnapshot: product.name,
        barcodeSnapshot: product.barcode,
        quantity: quantity,
        unit: targetUnit,
        unitPrice: pricing.price,
        priceSource: pricing.priceSource,
        discount: 0,
        netPrice: pricing.price,
        subtotal: Math.round(pricing.price * quantity),
        hppSnapshot: product.hpp,
        isBundle: product.productType === 'BUNDLE'
      }]);
    }

    if (product.productType === 'FRUIT' && (cart.length === 0 || moneyStorageId === 'WARUNG')) {
      setMoneyStorageId('BUAH');
    } else if (product.productType === 'FISH' && (cart.length === 0 || moneyStorageId === 'WARUNG')) {
      setMoneyStorageId('IKAN');
    }
    
    setWeightProduct(null);
  };

  const updateQuantity = (productId: string, delta: number, unit?: string) => {
    setCart(cart.map(item => {
      if (item.productId === productId && (!unit || item.unit === unit)) {
        const isKg = item.unit === 'KG';
        const step = isKg ? (delta > 0 ? 0.25 : -0.25) : delta;
        const newQty = Math.max(0, Number((item.quantity + step).toFixed(2)));
        if (newQty <= 0) return null;
        return { ...item, quantity: newQty, subtotal: Math.round(newQty * item.unitPrice) };
      }
      return item;
    }).filter(Boolean) as TransactionItem[]);
  };

  const handleUnitChange = (productId: string, currentUnit: string, newUnit: string) => {
    if (currentUnit === newUnit || !products) return;
    const prod = products.find(p => p.productId === productId);
    if (!prod) return;

    const pricing = PricingEngine.calculateItemPrice({
      product: prod,
      customer: selectedCustomer || undefined,
      transactionType,
      unit: newUnit
    });

    setCart(prevCart => {
      const currentItem = prevCart.find(i => i.productId === productId && i.unit === currentUnit);
      if (!currentItem) return prevCart;

      const existingNewUnitItem = prevCart.find(i => i.productId === productId && i.unit === newUnit);

      if (existingNewUnitItem) {
        // Merge quantities if item with target unit already in cart
        return prevCart
          .filter(i => !(i.productId === productId && i.unit === currentUnit))
          .map(i => {
            if (i.productId === productId && i.unit === newUnit) {
              const combinedQty = i.quantity + currentItem.quantity;
              return {
                ...i,
                quantity: combinedQty,
                unitPrice: pricing.price,
                netPrice: pricing.price,
                subtotal: Math.round(combinedQty * pricing.price)
              };
            }
            return i;
          });
      } else {
        // Switch unit in-place
        return prevCart.map(i => {
          if (i.productId === productId && i.unit === currentUnit) {
            return {
              ...i,
              unit: newUnit,
              unitPrice: pricing.price,
              netPrice: pricing.price,
              priceSource: pricing.priceSource,
              subtotal: Math.round(currentItem.quantity * pricing.price)
            };
          }
          return i;
        });
      }
    });
  };

  const handleHold = async () => {
    if (cart.length === 0 || !currentUser || !currentShift) return;
    const holdTx: Transaction = {
      transactionId: uuidv4(),
      receiptNumber: `HOLD-${Date.now()}`,
      type: transactionType,
      status: 'HOLD',
      cashierId: currentUser.userId,
      deviceId: deviceId,
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
  const triggerCheckout = async (presetCash?: number) => {
    if (cart.length === 0 || !currentUser || isProcessing) return;

    // Store Status Check (Requirement 8)
    if (storeConfig?.status === 'TUTUP') {
      const isOwner = currentUser.role === 'OWNER';
      if (!isOwner) {
        addToast('Toko sedang TUTUP. Kasir tidak dapat membuat transaksi normal baru.', 'error');
        return;
      }
    }

    if (!currentShift) {
      addToast('Harap buka sesi shift kasir (Clock In) terlebih dahulu.', 'warning');
      setIsClockInOpen(true);
      return;
    }

    if (transactionType === 'GAJIAN') {
      if (!selectedCustomer) {
        addToast('Pilih pelanggan terlebih dahulu untuk transaksi Gajian!', 'error');
        return;
      }

      // Check customer remaining credit limit (creditLimit - activeDebt)
      const activeReceivables = await db.receivables
        .where('customerId')
        .equals(selectedCustomer.customerId)
        .filter(r => r.status === 'OPEN' || r.status === 'PARTIAL' || r.status === 'OVERDUE')
        .toArray();
      const activeDebt = activeReceivables.reduce((sum, r) => sum + (r.remainingAmount || 0), 0);
      const remainingLimit = (selectedCustomer.creditLimit || 0) - activeDebt;

      const hasPermission = remainingLimit >= payableTotal && (selectedCustomer.creditLimit || 0) > 0;
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
    setCashTendered(presetCash !== undefined ? presetCash : payableTotal);
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

  const executeFinalSale = async (
    finalMethod: string, 
    allowInsufficientStock: boolean = false,
    partialConfig?: {
      paidCashAmount: number;
      remainingDebtAmount: number;
      dueDate?: string;
      customerId?: string;
      customerName?: string;
    },
    shouldPrint: boolean = true
  ) => {
    if (!currentUser || !currentShift) return;

    setIsProcessing(true);
    try {
      const targetCustomerId = partialConfig?.customerId || selectedCustomer?.customerId;
      const gajianDueDate = transactionType === 'GAJIAN'
        ? calculateGajianDueDate(activeGajianTempoType, activeGajianDay).toISOString()
        : undefined;

      const transactionId = await TransactionEngine.createSale({
        cashierId: currentUser.userId,
        deviceId: deviceId,
        shiftId: currentShift.shiftId,
        customerId: targetCustomerId,
        items: cart,
        discount: totalCartDiscount,
        paymentMethodId: finalMethod,
        moneyStorageId: moneyStorageId,
        type: transactionType,
        allowInsufficientStock,
        allowStoreClosedOverride: currentUser.role === 'OWNER',
        gajianDueDate,
        partialPayment: partialConfig ? {
          paidCashAmount: partialConfig.paidCashAmount,
          remainingDebtAmount: partialConfig.remainingDebtAmount,
          dueDate: partialConfig.dueDate
        } : undefined
      });
      const transaction = await db.transactions.get(transactionId);
      if (transaction) {
        setLastTx(transaction);
        if (shouldPrint) {
          PrintService.printReceipt(transaction);
        }
      }

      // Deduct redeemed points if used
      if (activeRedeemPoints > 0 && targetCustomerId) {
        await LoyaltyEngine.recordAdjustmentEvent({
          customerId: targetCustomerId,
          type: 'REDEEM',
          points: activeRedeemPoints,
          reason: `Tukar Poin Diskon Belanja Nota #${transaction?.receiptNumber || transactionId}`
        });
      }

      const pointsEarned = transaction?.loyaltyPointsEarned || 0;
      let successMsg = `Transaksi ${transaction?.receiptNumber || ''} Berhasil!`;
      if (partialConfig) {
        successMsg = `Transaksi ${transaction?.receiptNumber || ''} Berhasil! Diterima Tunai Rp ${partialConfig.paidCashAmount.toLocaleString()}, Sisa Rp ${partialConfig.remainingDebtAmount.toLocaleString()} otomatis dicatat jadi Piutang/Bon ${partialConfig.customerName || 'Pelanggan'}.`;
      } else {
        if (memberTierDiscountAmount > 0) {
          successMsg += ` (Diskon Member ${customerLoyaltyStats?.tier || ''} ${memberTierDiscountPercent}%: -Rp ${memberTierDiscountAmount.toLocaleString()})`;
        }
        if (activeRedeemPoints > 0) {
          successMsg += ` (Tukar ${activeRedeemPoints} Pts = Diskon Rp ${loyaltyDiscount.toLocaleString()})`;
        }
        if (pointsEarned > 0) {
          successMsg += ` (+${pointsEarned} Pts untuk ${selectedCustomer?.name || 'Member'})`;
        }
      }

      setCart([]);
      setSelectedCustomer(null);
      setLoyaltyPointsToRedeem(0);
      setTransactionType('SALE');
      setIsPaymentModalOpen(false);
      setAllowPartialDebt(false);
      setPartialDebtCustomerName('');
      setPartialDebtCustomerPhone('');
      setSelectedCustomerIdInCheckout('');
      setOverrideStockPrompt(null);
      addToast(successMsg, 'success');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (error: any) {
      const errMsg = error?.message || 'Gagal memproses transaksi.';
      const isShortage = errMsg.toLowerCase().includes('stok') || 
                         errMsg.toLowerCase().includes('mencukupi') || 
                         errMsg.toLowerCase().includes('shortage');
      if (isShortage) {
        console.warn('Checkout stock shortage detected:', errMsg);
        setOverrideStockPrompt({
          message: errMsg,
          method: finalMethod
        });
        setOverrideOwnerPin('');
        setOverridePinError('');
      } else {
        console.error('Checkout failed:', error);
        addToast(errMsg, 'error');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmPartialPayment = async (shouldPrint: boolean = true) => {
    if (!currentUser || !currentShift) return;
    setPartialPinError('');

    const shortage = Math.max(0, payableTotal - cashTendered);
    if (shortage <= 0) {
      executeFinalSale(paymentMethod, false, undefined, shouldPrint);
      return;
    }

    if (cashTendered < 0) {
      addToast('Nominal uang diterima tidak valid.', 'error');
      return;
    }

    // Resolve Customer
    let custId = selectedCustomer?.customerId || selectedCustomerIdInCheckout;
    let custName = selectedCustomer?.name || '';

    if (isQuickAddCustomerInCheckout || !custId) {
      if (!partialDebtCustomerName.trim()) {
        addToast('Nama pelanggan wajib diisi untuk mencatat data utang/bon.', 'error');
        return;
      }
      custName = partialDebtCustomerName.trim();
      const existing = customers?.find(c => c.name.toLowerCase() === custName.toLowerCase());
      if (existing) {
        custId = existing.customerId;
        custName = existing.name;
      } else {
        custId = uuidv4();
        const newCust: Customer = {
          customerId: custId,
          name: custName,
          phone: partialDebtCustomerPhone.trim(),
          isReseller: false,
          creditLimit: 500000,
          defaultDueDateDays: partialDueDateDays || 1,
          loyaltyPoints: 0,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await db.customers.add(newCust);
      }
    } else {
      const found = customers?.find(c => c.customerId === custId);
      if (found) custName = found.name;
    }

    // Check PIN if Kasir and policy requires it
    if (currentUser.role === 'KASIR' && partialOwnerPin) {
      const ownerUser = await db.users.filter(u => u.role === 'OWNER' && u.pinHash === partialOwnerPin.trim()).first();
      if (!ownerUser) {
        setPartialPinError('PIN Owner salah! Otorisasi ditolak.');
        return;
      }
    }

    // Determine Due Date
    let dueDateStr: string;
    if (customPartialDueDate) {
      dueDateStr = new Date(customPartialDueDate).toISOString();
    } else {
      dueDateStr = addDays(new Date(), partialDueDateDays || 1).toISOString();
    }

    await executeFinalSale('CASH', false, {
      paidCashAmount: cashTendered,
      remainingDebtAmount: shortage,
      dueDate: dueDateStr,
      customerId: custId,
      customerName: custName
    }, shouldPrint);
  };

  const handleKasirStockOverride = async () => {
    if (!overrideStockPrompt) return;
    const ownerUser = await db.users.filter(u => u.role === 'OWNER' && u.pinHash === overrideOwnerPin).first();
    if (!ownerUser) {
      setOverridePinError('PIN Owner salah! Otorisasi ditolak.');
      return;
    }
    const method = overrideStockPrompt.method;
    setOverrideStockPrompt(null);
    executeFinalSale(method, true);
  };

  const handleQuickRestockFromModal = async () => {
    if (!overrideStockPrompt) return;
    setIsProcessing(true);
    try {
      const nowStr = new Date().toISOString();
      for (const item of cart) {
        const prod = await db.products.get(item.productId);
        if (!prod) continue;
        if (prod.productType === 'BUNDLE') {
          const bundle = await db.bundles.get(item.productId);
          if (bundle) {
            for (const comp of bundle.components) {
              const compId = comp.componentProductId || comp.productId;
              if (compId) {
                const compProd = await db.products.get(compId);
                await StockService.recordMovement({
                  productId: compId,
                  movementType: 'ADJUSTMENT_IN',
                  qty: 100,
                  unit: compProd?.baseUnit || 'PCS',
                  baseQty: 100,
                  referenceId: `restock_b_${uuidv4().slice(0, 6)}`,
                  segmentId: compProd?.productType === 'FISH' ? 'IKAN' : 'WARUNG',
                  reason: `Restock Cepat Kasir POS untuk Komponen Paket ${prod.name}`,
                  costSnapshot: compProd?.hpp || 10000,
                  userId: currentUser?.userId || 'SYSTEM',
                  deviceId: 'LOCAL',
                  timestamp: nowStr
                });
                await StockService.reconcileProductStock(compId);
              }
            }
          }
        } else {
          await StockService.recordMovement({
            productId: item.productId,
            movementType: 'ADJUSTMENT_IN',
            qty: 100,
            unit: item.unit || prod.baseUnit,
            baseQty: 100,
            referenceId: `restock_pos_${uuidv4().slice(0, 6)}`,
            segmentId: prod.productType === 'FISH' ? 'IKAN' : 'WARUNG',
            reason: `Restock Cepat Kasir POS: ${prod.name}`,
            costSnapshot: prod.hpp || 10000,
            userId: currentUser?.userId || 'SYSTEM',
            deviceId: 'LOCAL',
            timestamp: nowStr
          });
          await StockService.reconcileProductStock(item.productId);
        }
      }
      addToast('Stok berhasil dipulihkan (+100)! Memproses transaksi...', 'success');
      const method = overrideStockPrompt.method;
      setOverrideStockPrompt(null);
      await executeFinalSale(method, false);
    } catch (err: any) {
      console.warn('Restock failed:', err);
      addToast(err?.message || 'Gagal menambah stok', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    
    // Auto-add logic for high-speed barcode scanners (keystroke-based)
    if (val && products) {
      // 1. Exact match on main barcode
      const exactMatch = products.find(p => p.barcode === val);
      if (exactMatch) {
        addToCart(exactMatch);
        setSearch(''); // Clear for next scan
        return;
      }

      // 2. Exact match on pack unit barcode in conversionRules
      for (const p of products) {
        const matchedRule = p.conversionRules?.find(r => r.barcode === val);
        if (matchedRule) {
          addToCart(p, 1, matchedRule.toUnit);
          addToast(`"${p.name}" (${matchedRule.toUnit}) otomatis ditambahkan!`, 'success');
          setSearch('');
          return;
        }
      }
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = search.trim();
      if (!val) return;

      // Try one last exhaustive search if found 0 results or no auto-add triggered
      const match = products?.find(p => 
        p.barcode === val || 
        (p.sku && p.sku === val) || 
        p.conversionRules?.some(r => r.barcode === val)
      );

      if (match) {
        // match might have already been added by handleSearchChange, 
        // but if timing varies, this ensures it's added.
        // We only add if it's still in the search box (not yet cleared by handleSearchChange)
        if (search === val) {
          const rule = match.conversionRules?.find(r => r.barcode === val);
          addToCart(match, 1, rule?.toUnit);
          setSearch('');
        }
      } else {
        // PRODUCT NOT FOUND -> Prompt registration modal
        addToast(`Barcode "${val}" tidak ditemukan.`, 'warning');
        setNewProductBarcode(val);
        setIsQuickAddProductOpen(true);
      }
    }
  };

  const handleCameraScan = (scannedCode: string) => {
    if (!products) return;
    const match = products.find(p => p.barcode === scannedCode || (p.sku && p.sku === scannedCode));
    if (match) {
      if (match.productType === 'FISH') {
        setWeightProduct(match);
        addToast(`Ikan "${match.name}" terdeteksi. Masukkan timbangan KG.`, 'info');
      } else {
        addToCart(match);
        addToast(`"${match.name}" ditambahkan ke keranjang!`, 'success');
      }
      setLastScannedProduct({ name: match.name, price: match.normalPrice, barcode: scannedCode });
      return;
    }

    // Check if barcode belongs to a pack conversion rule
    for (const p of products) {
      const matchedRule = p.conversionRules?.find(r => r.barcode === scannedCode);
      if (matchedRule) {
        addToCart(p, 1, matchedRule.toUnit);
        addToast(`"${p.name}" (${matchedRule.toUnit}) ditambahkan ke keranjang!`, 'success');
        setLastScannedProduct({ 
          name: `${p.name} (${matchedRule.toUnit})`, 
          price: matchedRule.price || (p.normalPrice * matchedRule.factor), 
          barcode: scannedCode 
        });
        return;
      }
    }

    addToast(`Barcode "${scannedCode}" tidak ditemukan. Silakan daftarkan produk.`, 'warning');
    setNewProductBarcode(scannedCode);
    setIsQuickAddProductOpen(true);
  };

  // Quick Sale Item Handlers
  const handleQuickSaleAddItem = (item: {
    productId?: string;
    name: string;
    price: number;
    quantity: number;
    unit: string;
    category?: string;
  }) => {
    // If it's a real catalog product, find and add through standard addToCart
    if (item.productId && products) {
      const match = products.find(p => p.productId === item.productId);
      if (match) {
        if (match.productType === 'FISH') {
          setWeightProduct(match);
          return;
        }
        addToCart(match, item.quantity);
        return;
      }
    }

    // Otherwise, create or increment custom item in cart
    const existing = cart.find(c => c.nameSnapshot === item.name && c.unitPrice === item.price);
    if (existing) {
      const newTotalQty = existing.quantity + item.quantity;
      setCart(cart.map(c => 
        (c.nameSnapshot === item.name && c.unitPrice === item.price)
          ? { ...c, quantity: newTotalQty, subtotal: Math.round(newTotalQty * c.unitPrice) }
          : c
      ));
    } else {
      const quickProdId = `quick-${uuidv4()}`;
      const newItem: TransactionItem = {
        productId: quickProdId,
        nameSnapshot: item.name,
        barcodeSnapshot: '',
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.price,
        priceSource: 'NORMAL',
        discount: 0,
        netPrice: item.price,
        subtotal: Math.round(item.price * item.quantity)
      };
      setCart(prev => [...prev, newItem]);
    }

    addToast(`"${item.name}" (${item.quantity} ${item.unit}) ditambahkan ke keranjang!`, 'success');
  };

  const handleQuickSaleAddAndCheckout = (item: {
    productId?: string;
    name: string;
    price: number;
    quantity: number;
    unit: string;
    category?: string;
  }, cashTendered?: number) => {
    handleQuickSaleAddItem(item);
    setTimeout(() => {
      triggerCheckout(cashTendered);
    }, 150);
  };

  // Quick Add Product by Kasir
  const handleQuickAddProduct = async () => {
    if (!newProductName.trim() || !newProductPrice) return;

    const prodId = uuidv4();
    const priceNum = Number(newProductPrice) || 0;
    const hppEst = Math.round(priceNum * 0.85);
    const barcodeVal = newProductBarcode.trim() || `888${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();
    const initialStock = 20;

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
      hpp: hppEst,
      stock: 0, // Will be derived from OPENING_BALANCE movement below
      minimumStock: 5,
      targetStock: 25,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    };

    await db.products.add(newProd);
    await db.productCosts.put({
      productId: prodId,
      hpp: hppEst,
      updatedAt: now
    });

    // Record Opening Balance Stock Movement so getDerivedStock matches 20
    await StockService.recordMovement({
      productId: prodId,
      movementType: 'OPENING_BALANCE',
      qty: initialStock,
      unit: newProductUnit,
      baseQty: initialStock,
      referenceId: `quick_add_${prodId}`,
      segmentId: newProductCategory === 'FISH' ? 'IKAN' : 'WARUNG',
      reason: 'Stok Awal Tambah Produk Cepat (POS)',
      costSnapshot: hppEst,
      userId: currentUser?.userId || 'SYSTEM',
      deviceId: deviceId,
      timestamp: now
    });

    const updatedProd = (await db.products.get(prodId)) || { ...newProd, stock: initialStock };

    await db.syncQueue.add({
      entityType: 'products',
      entityId: prodId,
      action: 'CREATE',
      payload: updatedProd,
      status: 'PENDING',
      retryCount: 0,
      createdAt: now
    });

    // Auto add to cart
    addToCart(updatedProd);

    // Reset & Close
    setNewProductName('');
    setNewProductBarcode('');
    setNewProductPrice('');
    setIsQuickAddProductOpen(false);
  };

  const quickCashOptions = [
    payableTotal,
    Math.ceil(payableTotal / 10000) * 10000,
    Math.ceil(payableTotal / 50000) * 50000,
    100000,
    200000,
    500000
  ].filter((v, idx, arr) => v >= payableTotal && arr.indexOf(v) === idx);

  const changeDue = Math.max(0, cashTendered - payableTotal);

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

      {/* STORE STATUS CLOSED ALERT BANNER (PRD Req 8) */}
      {storeConfig?.status === 'TUTUP' && (
        <div className="shrink-0 p-3.5 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-center justify-between gap-3 text-rose-950 shadow-sm animate-pulse">
          <div className="flex items-center gap-2.5">
            <AlertOctagon size={22} className="text-rose-600 shrink-0" />
            <div>
              <p className="font-black text-xs uppercase tracking-wider text-rose-900">
                Status Operasional Toko: TUTUP
              </p>
              <p className="text-[11px] font-medium text-rose-700">
                Kasir tidak dapat memproses transaksi normal baru saat toko tutup.{' '}
                {storeConfig.closedReason ? `(Alasan: ${storeConfig.closedReason})` : ''}
              </p>
            </div>
          </div>
          {currentUser?.role === 'OWNER' ? (
            <span className="px-3 py-1 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 shadow-sm">
              👑 Owner Override Aktif
            </span>
          ) : (
            <span className="px-3 py-1 bg-rose-200 text-rose-900 rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0">
              Transaksi Dinonaktifkan
            </span>
          )}
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
                  ref={searchInputRef}
                  type="text" 
                  placeholder="Cari (F2) / Scan Barcode Produk..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs shadow-sm font-medium"
                  value={search ?? ''}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
              </div>

              {/* Camera Barcode Scanner Button */}
              <button
                type="button"
                onClick={() => setIsCameraScannerOpen(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm shadow-blue-200 transition-all shrink-0 cursor-pointer"
                title="Scan Barcode via Kamera Device (F3)"
              >
                <Camera size={15} />
                <span>Scan Kamera (F3)</span>
              </button>

              {/* Quick Sale Button for High-Volume Checkout */}
              <button
                type="button"
                onClick={() => setIsQuickSaleOpen(true)}
                className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm shadow-amber-200 transition-all shrink-0 cursor-pointer"
                title="Quick Sale: 1-Klik Item Favorit & Input Harga Bebas (F6)"
              >
                <Zap size={15} className="fill-current text-slate-950" />
                <span>⚡ Quick Sale (F6)</span>
              </button>

              {/* Quick Add Product Button for Kasir */}
              <button
                onClick={() => {
                  setNewProductBarcode(search);
                  setIsQuickAddProductOpen(true);
                }}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-200 transition-all shrink-0 cursor-pointer"
                title="Daftarkan produk cepat langsung dari POS"
              >
                <PlusCircle size={15} />
                <span>+ Produk Cepat</span>
              </button>

              {/* Riwayat Struk / Penjualan Button (F4) */}
              <button
                type="button"
                onClick={() => setIsSalesHistoryModalOpen(true)}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all shrink-0 cursor-pointer"
                title="Lihat Riwayat Struk & Koreksi Jadi Bon (F4)"
              >
                <History size={15} className="text-amber-400" />
                <span>Riwayat Struk (F4)</span>
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

            {/* Gajian Tempo 2-Type Selector & Live Preview */}
            {transactionType === 'GAJIAN' && (
              <div className="mt-2.5 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                  <span className="flex items-center gap-1.5 font-black uppercase text-[10px] tracking-wider text-amber-800">
                    <Calendar size={13} className="text-amber-600" />
                    Skema Tempo Gajian:
                  </span>
                  <span className="text-[11px] font-black text-amber-950 bg-amber-100 px-2.5 py-0.5 rounded-lg border border-amber-300">
                    📅 Jatuh Tempo: {formatGajianDueDateLabel(calculateGajianDueDate(activeGajianTempoType, activeGajianDay))}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveGajianTempoType('TANGGAL_6_7')}
                    className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                      activeGajianTempoType === 'TANGGAL_6_7'
                        ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm font-black'
                        : 'bg-white text-slate-700 border-amber-200/80 hover:bg-amber-50/50 text-xs font-semibold'
                    }`}
                  >
                    <div className="text-[11px] font-black">1. Tanggal 6-7 Setiap Bulan (Default)</div>
                    <div className="text-[10px] opacity-80 font-medium">Jatuh tempo tgl 6 atau 7 rutin bulanan</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveGajianTempoType('SAME_DATE_NEXT_MONTH')}
                    className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                      activeGajianTempoType === 'SAME_DATE_NEXT_MONTH'
                        ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm font-black'
                        : 'bg-white text-slate-700 border-amber-200/80 hover:bg-amber-50/50 text-xs font-semibold'
                    }`}
                  >
                    <div className="text-[11px] font-black">2. Sama Tanggal Ambil Bulan Depan</div>
                    <div className="text-[10px] opacity-80 font-medium">
                      Ambil tgl {new Date().getDate()} → Tempo tgl {new Date().getDate()} bulan depan
                    </div>
                  </button>
                </div>

                {activeGajianTempoType === 'TANGGAL_6_7' && (
                  <div className="flex items-center gap-2 pt-0.5 text-[11px] text-amber-900">
                    <span className="text-[10px] font-black uppercase text-amber-800">Pilihan Tanggal:</span>
                    <button
                      type="button"
                      onClick={() => setActiveGajianDay(6)}
                      className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black cursor-pointer transition-all ${
                        activeGajianDay === 6 ? 'bg-amber-600 text-white shadow-sm' : 'bg-white border border-amber-300 text-amber-900'
                      }`}
                    >
                      Tanggal 6
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveGajianDay(7)}
                      className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black cursor-pointer transition-all ${
                        activeGajianDay === 7 ? 'bg-amber-600 text-white shadow-sm' : 'bg-white border border-amber-300 text-amber-900'
                      }`}
                    >
                      Tanggal 7 (Standar)
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* Quick Category Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-slate-100 custom-scrollbar">
              {[
                { id: 'ALL', label: 'Semua', icon: '🛒' },
                { id: 'FRUIT', label: 'Buah Segar', icon: '🍎' },
                { id: 'FISH', label: 'Ikan Hidup', icon: '🐟' },
                { id: 'BUNDLE', label: 'Paket Sembako', icon: '📦' },
                { id: 'SEMBAKO', label: 'Sembako & Toko', icon: '🌾' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCategoryTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedCategoryTab === tab.id
                      ? tab.id === 'FRUIT'
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                        : 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                      : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid - Compact High-Density View */}
          <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
            {products && products.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2">
                {products.map((product) => {
                  const isBundle = product.productType === 'BUNDLE';
                  const isFruit = product.productType === 'FRUIT' || product.categoryId === 'BUAH';
                  const availableBundles = isBundle ? (bundleStocks[product.productId] ?? 0) : 0;

                  return (
                    <div
                      key={product.productId}
                      role="button"
                      tabIndex={0}
                      onClick={() => addToCart(product)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          addToCart(product);
                        }
                      }}
                      className="group flex flex-col p-2 bg-white border border-slate-100 rounded-xl hover:border-emerald-500 hover:shadow-md transition-all text-left relative overflow-hidden cursor-pointer select-none"
                    >
                      {isBundle ? (
                        <span className="absolute top-1.5 right-1.5 text-[7px] font-black uppercase tracking-wider bg-indigo-600 text-white px-1 py-0.5 rounded shadow-sm z-10">
                          PAKET
                        </span>
                      ) : isFruit ? (
                        <span className="absolute top-1.5 right-1.5 text-[7px] font-black uppercase tracking-wider bg-emerald-600 text-white px-1 py-0.5 rounded shadow-sm z-10">
                          BUAH
                        </span>
                      ) : null}

                      <div className="w-full aspect-square bg-slate-50 rounded-lg mb-1.5 flex items-center justify-center text-slate-300 group-hover:text-emerald-500 transition-colors">
                        {isFruit ? (
                          <span className="text-2xl">
                            {product.name.toLowerCase().includes('jeruk') ? '🍊' : product.name.toLowerCase().includes('mangga') ? '🥭' : '🍎'}
                          </span>
                        ) : product.productType === 'FISH' ? (
                          <Weight size={24} />
                        ) : isBundle ? (
                          <Layers size={24} className="text-indigo-500 group-hover:text-indigo-600" />
                        ) : (
                          <Package size={24} />
                        )}
                      </div>
                      <h3 className="font-bold text-slate-900 text-[10px] line-clamp-1 leading-tight mb-0.5 uppercase tracking-tight" title={product.name}>
                        {product.name}
                      </h3>
                      
                      <div className="mt-auto pt-1 border-t border-slate-50 space-y-0.5">
                        <div className="flex justify-between items-center">
                          <span className="font-black text-blue-600 text-[10px] tabular-nums">
                            Rp {product.normalPrice.toLocaleString()}
                          </span>
                        </div>

                        <div className="text-[9px] font-bold">
                          {isBundle ? (
                            <span className="text-indigo-600 bg-indigo-50 px-1 rounded truncate block">
                              Sisa: {availableBundles}
                            </span>
                          ) : (
                            <span className="text-slate-500 font-bold block truncate" title={`${product.stock} ${product.baseUnit}`}>
                              Stok: {formatMultiUnitBreakdown(product.stock, product.baseUnit, product.conversionRules)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                cart.map((item) => {
                  const prod = products?.find(p => p.productId === item.productId);
                  const availableUnits = prod ? getProductAvailableUnits(prod) : [{ unit: item.unit, price: item.unitPrice, factor: 1 }];

                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={`${item.productId}-${item.unit}`} 
                      className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-slate-900 truncate uppercase">{item.nameSnapshot}</h4>
                          {item.isBundle && (
                            <span className="text-[8px] bg-indigo-100 text-indigo-700 font-black px-1 py-0.5 rounded uppercase shrink-0">
                              PAKET
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-slate-500 font-bold">
                            Rp {item.unitPrice.toLocaleString()} / <span className="text-blue-700 font-black">{item.unit}</span>
                          </p>
                          {item.isBundle && (
                            <button
                              type="button"
                              onClick={() => handleInspectBundle(item.productId)}
                              className="text-[9px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5 hover:underline"
                            >
                              <Eye size={10} /> Isi
                            </button>
                          )}
                        </div>

                        {/* Multi-Unit Switcher for Retail Items (e.g. BUNGKUS vs BATANG) */}
                        {availableUnits.length > 1 && (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Satuan:</span>
                            {availableUnits.map(u => (
                              <button
                                key={u.unit}
                                type="button"
                                onClick={() => handleUnitChange(item.productId, item.unit, u.unit)}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase transition-all cursor-pointer ${
                                  item.unit === u.unit
                                    ? 'bg-blue-600 text-white shadow-xs'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-blue-600'
                                }`}
                                title={`Ganti satuan ke ${u.unit} (Rp ${u.price.toLocaleString()})`}
                              >
                                {u.unit}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                        <button onClick={() => updateQuantity(item.productId, -1, item.unit)} className="p-0.5 text-slate-500 hover:text-blue-600 transition-colors cursor-pointer">
                          <Minus size={13} />
                        </button>
                        <span className="text-xs font-black min-w-8 text-center tabular-nums px-0.5">
                          {item.unit === 'KG' ? item.quantity.toFixed(2) : item.quantity}
                        </span>
                        <button onClick={() => updateQuantity(item.productId, 1, item.unit)} className="p-0.5 text-slate-500 hover:text-blue-600 transition-colors cursor-pointer">
                          <Plus size={13} />
                        </button>
                      </div>

                      <div className="text-right min-w-[75px]">
                        <p className="text-xs font-black text-slate-900 tabular-nums">
                          Rp {item.subtotal.toLocaleString()}
                        </p>
                      </div>
                    </motion.div>
                  );
                })
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
                <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs my-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Trophy size={16} className="text-amber-400 shrink-0" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-xs">{selectedCustomer.name}</span>
                          {selectedCustomer.isReseller && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded uppercase font-black">
                              Reseller
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-300">
                          Saldo: <strong className="text-amber-400">{(selectedCustomer.loyaltyPoints || 0).toLocaleString()} Pts</strong>
                          {customerLoyaltyStats && (
                            <span className="text-blue-300 font-bold ml-1.5">
                              • Tier {customerLoyaltyStats.tier} {memberTierDiscountPercent > 0 ? `(Diskon ${memberTierDiscountPercent}%)` : ''}
                            </span>
                          )}
                          {!selectedCustomer.isReseller && (
                            <span className="text-emerald-400 font-bold ml-1.5">
                              • Poin Baru: +{LoyaltyEngine.calculatePointsForAmount(payableTotal, selectedCustomer.isReseller, loyaltyConfig?.pointsPerAmount || 10000, excludeReseller)} Pts
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {!selectedCustomer.isReseller && LoyaltyEngine.calculatePointsForAmount(payableTotal, selectedCustomer.isReseller, loyaltyConfig?.pointsPerAmount || 10000, excludeReseller) > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider animate-pulse shrink-0">
                        +{LoyaltyEngine.calculatePointsForAmount(payableTotal, selectedCustomer.isReseller, loyaltyConfig?.pointsPerAmount || 10000, excludeReseller)} PTS
                      </span>
                    )}
                  </div>

                  {/* Pay-with-Points (Redemption) Selector */}
                  {!selectedCustomer.isReseller && maxRedeemablePoints >= MIN_REDEEM_PTS && (
                    <div className="pt-2 border-t border-amber-500/20">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-amber-200 font-bold">Tukar Poin Diskon (1 Pts = Rp {POINT_VALUE}):</span>
                        {activeRedeemPoints > 0 && (
                          <span className="font-mono font-black text-emerald-400">-Rp {loyaltyDiscount.toLocaleString()}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setLoyaltyPointsToRedeem(0)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            activeRedeemPoints === 0 ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }`}
                        >
                          Batal (0 Pts)
                        </button>
                        {Array.from(new Set([MIN_REDEEM_PTS, MIN_REDEEM_PTS * 2, MIN_REDEEM_PTS * 4]))
                          .filter(pts => pts > 0 && pts <= maxRedeemablePoints)
                          .map(pts => (
                            <button
                              key={pts}
                              type="button"
                              onClick={() => setLoyaltyPointsToRedeem(pts)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                activeRedeemPoints === pts ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 text-amber-300 hover:bg-slate-700'
                              }`}
                            >
                              {pts} Pts (-Rp {(pts * POINT_VALUE).toLocaleString()})
                            </button>
                          ))}
                        {maxRedeemablePoints >= MIN_REDEEM_PTS && (
                          <button
                            type="button"
                            onClick={() => setLoyaltyPointsToRedeem(maxRedeemablePoints)}
                            className={`px-2 py-0.5 rounded text-[10px] font-black transition-all cursor-pointer ${
                              activeRedeemPoints === maxRedeemablePoints ? 'bg-emerald-400 text-slate-950 font-black' : 'bg-slate-800 text-emerald-300 hover:bg-slate-700'
                            }`}
                          >
                            Max ({maxRedeemablePoints} Pts)
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Upselling Tier Nudge Banner */}
                  {!selectedCustomer.isReseller && customerLoyaltyStats?.nextTier && customerLoyaltyStats.spendToNextTier > 0 && customerLoyaltyStats.spendToNextTier <= 250000 && (
                    <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-400/30 text-[10px] text-purple-200 flex items-center gap-1.5">
                      <Sparkles size={13} className="text-amber-400 shrink-0" />
                      <span>💡 <strong>Nudge:</strong> Belanja Rp {customerLoyaltyStats.spendToNextTier.toLocaleString()} lagi untuk naik ke <strong>Tier {customerLoyaltyStats.nextTier}</strong>!</span>
                    </div>
                  )}
                </div>
              )}

              {memberTierDiscountAmount > 0 && (
                <div className="flex justify-between text-[11px] font-bold text-blue-400">
                  <span>Diskon Member Tier {customerLoyaltyStats?.tier || ''} ({memberTierDiscountPercent}%)</span>
                  <span className="tabular-nums">-Rp {memberTierDiscountAmount.toLocaleString()}</span>
                </div>
              )}

              {loyaltyDiscount > 0 && (
                <div className="flex justify-between text-[11px] font-bold text-emerald-400">
                  <span>Diskon Poin ({activeRedeemPoints} Pts)</span>
                  <span className="tabular-nums">-Rp {loyaltyDiscount.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between text-xl font-black pt-2 border-t border-slate-800">
                <span className="text-slate-400 text-xs flex items-center gap-1.5">
                  TOTAL <span className="text-[9px] bg-slate-800 px-1 py-0.5 rounded">IDR</span>
                </span>
                <span className="text-blue-400 tabular-nums">Rp {payableTotal.toLocaleString()}</span>
              </div>
            </div>
            
            <button
              onClick={() => triggerCheckout()}
              disabled={cart.length === 0 || isProcessing || !currentShift || isStoreClosedForCashier}
              className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all shadow-xl ${
                cart.length === 0 || isProcessing || !currentShift || isStoreClosedForCashier
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/50 active:scale-[0.98]'
              }`}
            >
              {isProcessing ? (
                <span>MEMPROSES...</span>
              ) : isStoreClosedForCashier ? (
                <>
                  <AlertOctagon size={18} className="text-rose-400" />
                  <span>TOKO TUTUP (KASIR TERKUNCI)</span>
                </>
              ) : !currentShift ? (
                <>
                  <Clock size={18} />
                  <span>BUKA SHIFT DAHULU (F8)</span>
                </>
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
                Rp {payableTotal.toLocaleString()}
              </span>
              {(memberTierDiscountAmount > 0 || loyaltyDiscount > 0) && (
                <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-bold">
                  <span className="text-slate-500 line-through">Rp {subtotal.toLocaleString()}</span>
                  {memberTierDiscountAmount > 0 && (
                    <span className="text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-black">
                      Diskon {customerLoyaltyStats?.tier || 'Member'} ({memberTierDiscountPercent}%): -Rp {memberTierDiscountAmount.toLocaleString()}
                    </span>
                  )}
                  {loyaltyDiscount > 0 && (
                    <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-black">
                      Diskon Poin: -Rp {loyaltyDiscount.toLocaleString()}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Customer Loyalty Points in Checkout */}
            {selectedCustomer && (
              <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 p-3.5 rounded-2xl mb-4 text-xs">
                <div className="flex items-center justify-between text-amber-950 font-bold mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Trophy size={15} className="text-amber-600" />
                    Member: {selectedCustomer.name} {customerLoyaltyStats && `(Tier ${customerLoyaltyStats.tier})`}
                  </span>
                  <span>Saldo: {(selectedCustomer.loyaltyPoints || 0).toLocaleString()} Pts</span>
                </div>
                {!selectedCustomer.isReseller ? (
                  <div className="flex items-center justify-between pt-1.5 border-t border-amber-200/80 text-[11px]">
                    <span className="text-slate-600 font-medium">Poin Diperoleh dari Belanja Ini:</span>
                    <span className="font-black text-emerald-600 tabular-nums">
                      +{LoyaltyEngine.calculatePointsForAmount(payableTotal, selectedCustomer.isReseller, loyaltyConfig?.pointsPerAmount || 10000, excludeReseller)} Pts
                    </span>
                  </div>
                ) : (
                  <p className="text-[10px] text-amber-700 italic">
                    * Akun Reseller menikmati harga grosir dan tidak mengumpulkan poin.
                  </p>
                )}
              </div>
            )}

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
                    value={cashTendered === 0 && !allowPartialDebt ? '' : cashTendered}
                    onChange={(e) => setCashTendered(Number(e.target.value))}
                    className="w-full text-xl font-black text-center p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 tabular-nums"
                  />
                </div>

                {/* Quick Cash Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {quickCashOptions.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        setCashTendered(opt);
                        if (opt >= payableTotal) {
                          setAllowPartialDebt(false);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black tabular-nums transition-all ${
                        cashTendered === opt
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {opt === payableTotal ? 'Uang Pas' : `Rp ${opt.toLocaleString()}`}
                    </button>
                  ))}
                </div>

                {/* Kembalian / Status Kurang */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-600">
                    {cashTendered >= payableTotal ? 'Kembalian:' : 'Kekurangan Uang:'}
                  </span>
                  <span className={`font-black text-base tabular-nums ${cashTendered >= payableTotal ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {cashTendered >= payableTotal ? `Rp ${(cashTendered - payableTotal).toLocaleString()}` : `-Rp ${(payableTotal - cashTendered).toLocaleString()}`}
                  </span>
                </div>

                {/* Opsi Pembayaran Sebagian / Bon Utang Pelanggan jika Uang Kurang */}
                {cashTendered < payableTotal && (
                  <div className="bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-3.5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black shrink-0">
                          <Wallet size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-black text-amber-950">
                            Uang Kurang Rp {(payableTotal - cashTendered).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-amber-800">
                            Izinkan bayar sebagian & catat sisa jadi utang (bon)?
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAllowPartialDebt(!allowPartialDebt);
                          if (!selectedCustomer && customers && customers.length > 0 && !selectedCustomerIdInCheckout) {
                            setSelectedCustomerIdInCheckout(customers[0].customerId);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                          allowPartialDebt 
                            ? 'bg-amber-600 text-white shadow-sm' 
                            : 'bg-white border border-amber-300 text-amber-800 hover:bg-amber-100'
                        }`}
                      >
                        {allowPartialDebt ? 'Aktif (Bon)' : 'Catat Bon'}
                      </button>
                    </div>

                    {allowPartialDebt && (
                      <div className="pt-2 border-t border-amber-200 space-y-3 animate-in fade-in">
                        {/* Summary perhitungan otomatis */}
                        <div className="grid grid-cols-2 gap-2 bg-white/80 p-2.5 rounded-xl border border-amber-200 text-xs">
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Uang Diterima</span>
                            <span className="font-black text-emerald-600 tabular-nums">Rp {cashTendered.toLocaleString()}</span>
                          </div>
                          <div className="border-l border-amber-100 pl-2">
                            <span className="text-[10px] font-black text-amber-900 uppercase block">Sisa Jadi Utang (Otomatis)</span>
                            <span className="font-black text-rose-600 tabular-nums">Rp {(payableTotal - cashTendered).toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Pilih / Input Pelanggan */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                              Pelanggan yang Berutang *
                            </label>
                            <button
                              type="button"
                              onClick={() => setIsQuickAddCustomerInCheckout(!isQuickAddCustomerInCheckout)}
                              className="text-[10px] font-bold text-blue-600 hover:underline"
                            >
                              {isQuickAddCustomerInCheckout ? 'Pilih Terdaftar' : '+ Tambah Nama Baru'}
                            </button>
                          </div>

                          {selectedCustomer ? (
                            <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-amber-300 text-xs">
                              <span className="font-bold text-slate-800">{selectedCustomer.name} (Pelanggan Keranjang)</span>
                              <span className="text-[10px] text-slate-400">Terpilih</span>
                            </div>
                          ) : isQuickAddCustomerInCheckout ? (
                            <div className="space-y-1.5">
                              <input
                                type="text"
                                placeholder="Nama Pembeli / Pelanggan (misal: Pak Budi)"
                                value={partialDebtCustomerName}
                                onChange={(e) => setPartialDebtCustomerName(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500"
                              />
                              <input
                                type="tel"
                                placeholder="No. HP / WhatsApp (opsional)"
                                value={partialDebtCustomerPhone}
                                onChange={(e) => setPartialDebtCustomerPhone(e.target.value)}
                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-amber-500"
                              />
                            </div>
                          ) : (
                            <select
                              value={selectedCustomerIdInCheckout}
                              onChange={(e) => setSelectedCustomerIdInCheckout(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500"
                            >
                              <option value="">-- Pilih Pelanggan --</option>
                              {customers?.map((c) => (
                                <option key={c.customerId} value={c.customerId}>
                                  {c.name} {c.phone ? `(${c.phone})` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Jatuh Tempo */}
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                            Janji Bayar / Jatuh Tempo Pelunasan
                          </label>
                          <div className="grid grid-cols-4 gap-1 mb-1.5">
                            {[
                              { label: 'Besok (+1 Hr)', days: 1 },
                              { label: '3 Hari', days: 3 },
                              { label: '7 Hari', days: 7 },
                              { label: '14 Hari', days: 14 }
                            ].map((d) => (
                              <button
                                key={d.days}
                                type="button"
                                onClick={() => {
                                  setPartialDueDateDays(d.days);
                                  setCustomPartialDueDate(format(addDays(new Date(), d.days), 'yyyy-MM-dd'));
                                }}
                                className={`py-1.5 px-1 rounded-lg text-[10px] font-bold text-center border transition-all ${
                                  partialDueDateDays === d.days
                                    ? 'bg-amber-600 text-white border-amber-600'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                {d.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 font-bold shrink-0">Tanggal:</span>
                            <input
                              type="date"
                              value={customPartialDueDate}
                              onChange={(e) => {
                                setCustomPartialDueDate(e.target.value);
                                setPartialDueDateDays(0);
                              }}
                              className="flex-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500"
                            />
                          </div>
                        </div>

                        {/* PIN Owner jika Kasir (opsional / otorisasi) */}
                        {currentUser?.role === 'KASIR' && (
                          <div className="pt-2 border-t border-amber-200">
                            <label className="text-[10px] font-bold text-slate-600 block mb-1">
                              PIN Owner Otorisasi (Jika Diwajibkan Toko)
                            </label>
                            <input
                              type="password"
                              maxLength={6}
                              placeholder="PIN Owner (opsional)"
                              value={partialOwnerPin}
                              onChange={(e) => {
                                setPartialOwnerPin(e.target.value);
                                setPartialPinError('');
                              }}
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-center tracking-widest outline-none focus:border-amber-500"
                            />
                            {partialPinError && (
                              <p className="text-[10px] text-rose-600 font-bold text-center mt-1">{partialPinError}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Money Storage Destination Selector */}
            <div className="mb-4 pt-3 border-t border-slate-100">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1.5">
                Alokasi Kantong Kas (Storage Keuangan):
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'WARUNG', label: 'Kas Warung', icon: '🏪' },
                  { id: 'BUAH', label: 'Kas Buah', icon: '🍎' },
                  { id: 'IKAN', label: 'Kas Ikan', icon: '🐟' },
                  { id: 'UANG_DIGITAL', label: 'Digital', icon: '📱' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setMoneyStorageId(s.id as MoneyStorageId)}
                    className={`py-2 px-1 rounded-xl text-[10px] font-black border text-center transition-all cursor-pointer ${
                      moneyStorageId === s.id
                        ? s.id === 'BUAH'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200'
                          : 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="block text-xs">{s.icon}</span>
                    <span className="truncate block mt-0.5">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="flex-1 py-3 font-bold text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>

              {allowPartialDebt && cashTendered < payableTotal ? (
                <>
                  <button
                    onClick={() => handleConfirmPartialPayment(false)}
                    disabled={
                      isProcessing ||
                      cashTendered < 0 ||
                      (!selectedCustomer && !selectedCustomerIdInCheckout && !partialDebtCustomerName.trim())
                    }
                    className="flex-1 py-3 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>Selesai & Bon</span>
                  </button>
                  <button
                    onClick={() => handleConfirmPartialPayment(true)}
                    disabled={
                      isProcessing ||
                      cashTendered < 0 ||
                      (!selectedCustomer && !selectedCustomerIdInCheckout && !partialDebtCustomerName.trim())
                    }
                    className="flex-[1.5] py-3 bg-amber-600 hover:bg-amber-500 text-white font-black text-[10px] uppercase tracking-wider rounded-xl shadow-lg shadow-amber-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle size={14} />
                    <span>Cetak Struk & Bon</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => executeFinalSale(paymentMethod, false, undefined, false)}
                    disabled={paymentMethod === 'CASH' && cashTendered < payableTotal}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>Hanya Selesai</span>
                  </button>
                  <button
                    onClick={() => executeFinalSale(paymentMethod, false, undefined, true)}
                    disabled={paymentMethod === 'CASH' && cashTendered < payableTotal}
                    className="flex-[1.5] py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] uppercase tracking-wider rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle size={14} />
                    <span>Cetak Struk</span>
                  </button>
                </>
              )}
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
                    value={newProductCategory ?? 'SEMBAKO'}
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
                    value={newProductUnit ?? 'PCS'}
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
                Masukkan PIN Owner
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
              <span className="text-xs font-bold text-emerald-100 block mb-1">
                Struk {lastTx?.receiptNumber} dicatat & dicetak.
              </span>
              {lastTx && !lastTx.receivableId && (
                <button
                  type="button"
                  onClick={() => {
                    setTxToCorrect(lastTx);
                    setIsCorrectionModalOpen(true);
                  }}
                  className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] font-black rounded-lg uppercase tracking-wider shadow transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Wallet size={12} />
                  <span>Uang Kurang? Catat Jadi Bon Utang</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Owner / Kasir Stock Shortage Override Modal */}
      {overrideStockPrompt && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 text-amber-600 font-black text-sm uppercase">
                <AlertTriangle size={18} />
                <span>Otorisasi Stok Kurang (Stock Override)</span>
              </div>
              <button onClick={() => setOverrideStockPrompt(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-2">
                <p className="font-bold">{overrideStockPrompt.message}</p>
                <p className="text-[11px] text-amber-700">
                  Sesuai aturan PRD 11 & 12, sistem normal mencegah stok negatif. Namun, penjualan dengan stok kurang dapat diizinkan melalui <strong>Owner Override</strong> dan akan otomatis dicatat sebagai <strong>STOCK_PENDING_REVIEW</strong>.
                </p>
              </div>

              {currentUser?.role === 'KASIR' ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                    Masukkan PIN Owner untuk Otorisasi
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="PIN Owner"
                    value={overrideOwnerPin ?? ''}
                    onChange={(e) => {
                      setOverrideOwnerPin(e.target.value);
                      setOverridePinError('');
                    }}
                    className="w-full text-center tracking-widest text-xl font-black py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-amber-500"
                  />
                  {overridePinError && (
                    <p className="text-[11px] text-rose-600 font-bold text-center">{overridePinError}</p>
                  )}
                  <p className="text-[10px] text-slate-400 text-center">
                    Minta Owner untuk memasukkan PIN otorisasi langsung di kasir.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-600 italic">
                  Sebagai Owner, Anda dapat langsung mengonfirmasi override ini.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setOverrideStockPrompt(null)}
                  className="flex-1 py-3 font-bold text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                {currentUser?.role === 'KASIR' ? (
                  <button
                    disabled={isProcessing || !overrideOwnerPin}
                    onClick={handleKasirStockOverride}
                    className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <ShieldCheck size={16} />
                    <span>Verifikasi & Proses</span>
                  </button>
                ) : (
                  <button
                    disabled={isProcessing}
                    onClick={() => executeFinalSale(overrideStockPrompt.method, true)}
                    className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-200 transition-all flex items-center justify-center gap-2"
                  >
                    <ShieldCheck size={16} />
                    <span>Izinkan & Proses</span>
                  </button>
                )}
              </div>

              {/* Quick Restock Option */}
              <button
                disabled={isProcessing}
                onClick={handleQuickRestockFromModal}
                className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5"
              >
                <Plus size={15} />
                <span>Restock Cepat (+100 Unit) & Selesaikan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Bundle Contents Modal (Kasir vs Owner View) */}
      {inspectBundle && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                    {currentUser?.role === 'OWNER' ? 'Breakdown Paket & HPP' : 'Rincian Isi Paket'}
                  </h3>
                  <span className="text-xs font-bold text-indigo-600">{inspectBundle.bundle.name}</span>
                </div>
              </div>
              <button onClick={() => setInspectBundle(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl mb-3 text-xs flex justify-between items-center border border-slate-100">
              <span className="text-slate-500 font-medium">Harga Jual Paket:</span>
              <span className="font-black text-blue-600 tabular-nums text-sm">
                Rp {inspectBundle.bundle.price.toLocaleString()}
              </span>
            </div>

            <div className="space-y-1.5 mb-4 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Isi Komponen ({inspectBundle.breakdown.length}):
              </p>
              {inspectBundle.breakdown.map((comp, idx) => (
                <div key={idx} className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs space-y-1 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800">{comp.name}</span>
                    <span className="font-black text-blue-600 tabular-nums">
                      {comp.totalQty} {comp.unit}
                    </span>
                  </div>
                  {/* Kasir sees only contents, Owner sees breakdown and HPP */}
                  {currentUser?.role === 'OWNER' && (
                    <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                      <span>WAC: Rp {comp.wac.toLocaleString()}</span>
                      <span className="font-bold text-slate-700">Subtotal HPP: Rp {comp.subtotalHpp.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {currentUser?.role === 'OWNER' && (
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-xs space-y-1 mb-4">
                <div className="flex justify-between text-slate-700">
                  <span>Total Derived HPP:</span>
                  <span className="font-bold tabular-nums">
                    Rp {inspectBundle.breakdown.reduce((s, c) => s + c.subtotalHpp, 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Laba Kotor:</span>
                  <span className="tabular-nums">
                    Rp {(inspectBundle.bundle.price - inspectBundle.breakdown.reduce((s, c) => s + c.subtotalHpp, 0)).toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={() => setInspectBundle(null)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Weight Modal for Fish items */}
      {weightProduct && (
        <WeightModal 
          product={weightProduct} 
          onConfirm={(kg) => addToCart(weightProduct, kg)}
          onClose={() => setWeightProduct(null)}
        />
      )}

      {/* Clock In Modal for Cashier */}
      <ClockInModal
        isOpen={isClockInModalOpen}
        onClose={() => setIsClockInOpen(false)}
      />

      {/* Camera Barcode Scanner for POS */}
      <CameraBarcodeScanner
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScan={handleCameraScan}
        title="POS Camera Barcode Scanner"
        subtitle="Arahkan kamera ke barcode untuk langsung tambah ke keranjang"
        continuous={true}
        lastScannedInfo={lastScannedProduct}
        sampleBarcodes={products?.slice(0, 6).map(p => ({
          barcode: p.barcode,
          label: p.name.length > 16 ? p.name.slice(0, 16) + '...' : p.name
        })) || []}
      />

      {/* Quick Sale Modal (F6) */}
      <QuickSaleModal
        isOpen={isQuickSaleOpen}
        onClose={() => setIsQuickSaleOpen(false)}
        onAddItem={handleQuickSaleAddItem}
        onAddAndCheckout={handleQuickSaleAddAndCheckout}
        catalogProducts={products || []}
      />

      {/* Retroactive Debt Correction Modal (Untuk transaksi yang sudah terlanjur selesai) */}
      <DebtCorrectionModal
        isOpen={isCorrectionModalOpen}
        onClose={() => {
          setIsCorrectionModalOpen(false);
          setTxToCorrect(null);
        }}
        transaction={txToCorrect}
        onSuccess={() => {
          addToast('Transaksi berhasil dikoreksi menjadi bon piutang!', 'success');
        }}
      />

      {/* Sales History Modal within POS (F4) */}
      {isSalesHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <History size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">
                    Riwayat Transaksi & Struk Kasir
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cari nota, cetak ulang struk, atau klik "Koreksi Jadi Bon" jika uang pembeli kurang
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsSalesHistoryModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
              <SalesHistory />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
