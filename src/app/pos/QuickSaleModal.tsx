import React, { useState, useMemo, useEffect } from 'react';
import type { Product } from '@/core/types';
import { db } from '@/core/database';
import { v4 as uuidv4 } from 'uuid';
import { 
  Zap, 
  X, 
  Plus, 
  Minus, 
  ShoppingBag, 
  DollarSign, 
  Sparkles, 
  Check, 
  Flame, 
  Tag, 
  Layers,
  ArrowRight,
  Banknote,
  CheckCircle2,
  BookmarkPlus
} from 'lucide-react';

interface QuickSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: (item: {
    productId?: string;
    name: string;
    price: number;
    quantity: number;
    unit: string;
    category?: string;
  }) => void;
  onAddAndCheckout?: (item: {
    productId?: string;
    name: string;
    price: number;
    quantity: number;
    unit: string;
    category?: string;
  }, cashTendered?: number) => void;
  catalogProducts?: Product[];
}

interface CommonItemDef {
  id: string;
  name: string;
  defaultPrice: number;
  unit: string;
  category: 'LARIS' | 'SEMBAKO' | 'MINUMAN' | 'DAPUR' | 'LAINNYA';
  iconColor: string;
  salesCount?: number;
}

const COMMON_ITEMS: CommonItemDef[] = [
  { id: 'ci-beras-1kg', name: 'Beras Premium 1kg', defaultPrice: 15000, unit: 'KG', category: 'SEMBAKO', iconColor: 'bg-amber-100 text-amber-800' },
  { id: 'ci-minyak-1l', name: 'Minyak Goreng 1L', defaultPrice: 18000, unit: 'PCS', category: 'SEMBAKO', iconColor: 'bg-yellow-100 text-yellow-800' },
  { id: 'ci-telur-1kg', name: 'Telur Ayam 1kg', defaultPrice: 28000, unit: 'KG', category: 'SEMBAKO', iconColor: 'bg-orange-100 text-orange-800' },
  { id: 'ci-gula-1kg', name: 'Gula Pasir 1kg', defaultPrice: 17500, unit: 'KG', category: 'SEMBAKO', iconColor: 'bg-blue-100 text-blue-800' },
  { id: 'ci-mie-goreng', name: 'Mie Instan Goreng', defaultPrice: 3500, unit: 'PCS', category: 'SEMBAKO', iconColor: 'bg-rose-100 text-rose-800' },
  { id: 'ci-mie-kuah', name: 'Mie Instan Kuah', defaultPrice: 3500, unit: 'PCS', category: 'SEMBAKO', iconColor: 'bg-red-100 text-red-800' },
  { id: 'ci-kopi-sachet', name: 'Kopi Sachet Seduh', defaultPrice: 4000, unit: 'PCS', category: 'MINUMAN', iconColor: 'bg-amber-100 text-amber-900' },
  { id: 'ci-air-mineral', name: 'Air Mineral 600ml', defaultPrice: 3500, unit: 'PCS', category: 'MINUMAN', iconColor: 'bg-sky-100 text-sky-800' },
  { id: 'ci-galon-isi', name: 'Air Galon Isi Ulang', defaultPrice: 6000, unit: 'GALON', category: 'MINUMAN', iconColor: 'bg-cyan-100 text-cyan-800' },
  { id: 'ci-es-batu', name: 'Es Batu Kristal', defaultPrice: 2000, unit: 'BKS', category: 'MINUMAN', iconColor: 'bg-indigo-100 text-indigo-800' },
  { id: 'ci-garam', name: 'Garam Dapur 250g', defaultPrice: 3000, unit: 'BKS', category: 'DAPUR', iconColor: 'bg-slate-100 text-slate-800' },
  { id: 'ci-kerupuk', name: 'Kerupuk Warung', defaultPrice: 2000, unit: 'BKS', category: 'LAINNYA', iconColor: 'bg-emerald-100 text-emerald-800' },
  { id: 'ci-gas-3kg', name: 'Gas LPG 3kg', defaultPrice: 22000, unit: 'TABUNG', category: 'LAINNYA', iconColor: 'bg-green-100 text-green-800' },
  { id: 'ci-kresek', name: 'Kantong Kresek', defaultPrice: 1000, unit: 'PCS', category: 'LAINNYA', iconColor: 'bg-neutral-100 text-neutral-800' },
];

export function QuickSaleModal({
  isOpen,
  onClose,
  onAddItem,
  onAddAndCheckout,
  catalogProducts = []
}: QuickSaleModalProps) {
  const [activeTab, setActiveTab] = useState<'COMMON' | 'CUSTOM'>('COMMON');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'LARIS' | 'SEMBAKO' | 'MINUMAN' | 'DAPUR' | 'LAINNYA'>('ALL');

  // Custom Item / Price States
  const [customName, setCustomName] = useState<string>('Item Bebas');
  const [customPrice, setCustomPrice] = useState<number>(5000);
  const [customQty, setCustomQty] = useState<number>(1);
  const [customUnit, setCustomUnit] = useState<string>('PCS');
  const [saveToCatalog, setSaveToCatalog] = useState<boolean>(false);
  const [lastAddedLabel, setLastAddedLabel] = useState<string>('');

  // Top dynamic fast-moving items
  const [dynamicTopItems, setDynamicTopItems] = useState<CommonItemDef[]>([]);

  // Express Cash Drawer State
  const [expressItem, setExpressItem] = useState<{
    productId?: string;
    name: string;
    price: number;
    quantity: number;
    unit: string;
    category?: string;
    total: number;
  } | null>(null);
  const [expressCashTendered, setExpressCashTendered] = useState<number>(0);

  // Load real-time top fast-moving items
  useEffect(() => {
    if (!isOpen) return;

    const loadFastMoving = async () => {
      try {
        const recentTxs = await db.transactions
          .where('status')
          .equals('COMPLETED')
          .reverse()
          .limit(100)
          .toArray();

        const countMap = new Map<string, { qty: number; name: string }>();
        for (const tx of recentTxs) {
          for (const item of tx.items) {
            if (item.productId) {
              const prev = countMap.get(item.productId) || { qty: 0, name: item.nameSnapshot };
              countMap.set(item.productId, { qty: prev.qty + item.quantity, name: item.nameSnapshot });
            }
          }
        }

        const sorted = Array.from(countMap.entries())
          .sort((a, b) => b[1].qty - a[1].qty)
          .slice(0, 8);

        const loaded: CommonItemDef[] = [];
        for (const [prodId, data] of sorted) {
          const prod = catalogProducts.find(p => p.productId === prodId);
          if (prod) {
            loaded.push({
              id: prod.productId,
              name: prod.name,
              defaultPrice: prod.normalPrice,
              unit: prod.baseUnit || 'PCS',
              category: 'LARIS',
              iconColor: 'bg-amber-100 text-amber-900',
              salesCount: data.qty
            });
          }
        }

        // If no past sales found, pick first 6 from catalogProducts
        if (loaded.length === 0 && catalogProducts.length > 0) {
          catalogProducts.slice(0, 6).forEach(p => {
            loaded.push({
              id: p.productId,
              name: p.name,
              defaultPrice: p.normalPrice,
              unit: p.baseUnit || 'PCS',
              category: 'LARIS',
              iconColor: 'bg-amber-100 text-amber-900'
            });
          });
        }

        setDynamicTopItems(loaded);
      } catch (err) {
        console.warn('Error loading fast moving items:', err);
      }
    };

    loadFastMoving();
  }, [isOpen, catalogProducts]);

  // Audio Beep generator
  const playQuickBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {}
  };

  const notifyAdded = (name: string, qty: number) => {
    playQuickBeep();
    setLastAddedLabel(`${qty}x ${name} ditambahkan!`);
    setTimeout(() => setLastAddedLabel(''), 2000);
  };

  // Filtered Common Items
  const filteredCommonItems = useMemo(() => {
    if (categoryFilter === 'LARIS') {
      return dynamicTopItems.length > 0 ? dynamicTopItems : COMMON_ITEMS.slice(0, 6);
    }
    if (categoryFilter === 'ALL') {
      return [...dynamicTopItems, ...COMMON_ITEMS];
    }
    return COMMON_ITEMS.filter(item => item.category === categoryFilter);
  }, [categoryFilter, dynamicTopItems]);

  if (!isOpen) return null;

  // Handle adding common item
  const handleAddCommon = (item: CommonItemDef, multiplier: number = 1) => {
    // Check if matching catalog product exists to keep stock sync
    const matchedCatalogProduct = catalogProducts.find(
      p => p.productId === item.id || p.name.toLowerCase() === item.name.toLowerCase() || p.barcode === item.id
    );

    const price = matchedCatalogProduct ? matchedCatalogProduct.normalPrice : item.defaultPrice;
    const productId = matchedCatalogProduct ? matchedCatalogProduct.productId : (item.id.startsWith('ci-') ? undefined : item.id);

    onAddItem({
      productId,
      name: item.name,
      price,
      quantity: multiplier,
      unit: item.unit,
      category: item.category
    });

    notifyAdded(item.name, multiplier);
  };

  // Handle adding custom price item
  const handleAddCustom = async (andCheckout: boolean = false) => {
    if (customPrice <= 0 || customQty <= 0) return;

    const itemName = customName.trim() || 'Item Bebas';
    let productId: string | undefined = undefined;

    // Optional: Save as new catalog product in db.products
    if (saveToCatalog) {
      try {
        const newProdId = uuidv4();
        const barcodeVal = `888${Date.now().toString().slice(-6)}`;
        await db.products.add({
          productId: newProdId,
          barcode: barcodeVal,
          name: itemName,
          categoryId: 'SEMBAKO',
          productType: 'SEMBAKO',
          baseUnit: customUnit,
          saleUnits: [customUnit],
          conversionRules: [],
          normalPrice: customPrice,
          hpp: Math.round(customPrice * 0.85),
          minimumStock: 5,
          targetStock: 20,
          stock: 20,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        productId = newProdId;
      } catch (err) {
        console.warn('Could not auto-save product to catalog:', err);
      }
    }

    const payload = {
      productId,
      name: itemName,
      price: customPrice,
      quantity: customQty,
      unit: customUnit,
      category: 'CUSTOM'
    };

    if (andCheckout && onAddAndCheckout) {
      const totalAmount = customPrice * customQty;
      setExpressItem({ ...payload, total: totalAmount });
      setExpressCashTendered(totalAmount);
    } else {
      onAddItem(payload);
      notifyAdded(itemName, customQty);
      setCustomQty(1);
    }
  };

  const handleConfirmExpressPayment = () => {
    if (!expressItem || !onAddAndCheckout) return;
    onAddAndCheckout(expressItem, expressCashTendered);
    playQuickBeep();
    setExpressItem(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center font-black shadow-md shadow-amber-500/20">
              <Zap size={20} className="fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">
                  Quick Sale • Penjualan Cepat
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[9px] font-black uppercase">
                  F6
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                1-Klik tambah item terlaris atau input harga bebas tanpa barcode.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lastAddedLabel && (
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black uppercase animate-in zoom-in-90 flex items-center gap-1">
                <Check size={12} />
                {lastAddedLabel}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-3 pb-2 border-b border-slate-100 flex gap-2 bg-slate-50/50">
          <button
            type="button"
            onClick={() => setActiveTab('COMMON')}
            className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'COMMON'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Flame size={15} className={activeTab === 'COMMON' ? 'text-amber-400' : 'text-slate-400'} />
            <span>Barang Terlaris / Favorit</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CUSTOM')}
            className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'CUSTOM'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <DollarSign size={15} className={activeTab === 'CUSTOM' ? 'text-emerald-400' : 'text-slate-400'} />
            <span>Input Harga Bebas (Manual Price)</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {activeTab === 'COMMON' ? (
            <div className="space-y-4">
              {/* Category Filter Chips */}
              <div className="flex flex-wrap gap-1.5 pb-1">
                {(['ALL', 'LARIS', 'SEMBAKO', 'MINUMAN', 'DAPUR', 'LAINNYA'] as const).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      categoryFilter === cat
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat === 'ALL' ? 'Semua Kategori' : cat === 'LARIS' ? '🔥 Top Terlaris' : cat}
                  </button>
                ))}
              </div>

              {/* Grid of Common Items */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredCommonItems.map(item => (
                  <div
                    key={item.id}
                    className="p-3.5 bg-white border border-slate-200 hover:border-amber-400 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${item.iconColor}`}>
                          {item.unit}
                        </span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {item.salesCount !== undefined ? `${item.salesCount}x Terjual` : item.category}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-xs line-clamp-2 min-h-[32px]">
                        {item.name}
                      </h4>
                      <p className="text-sm font-black text-blue-600 tabular-nums mt-1">
                        Rp {item.defaultPrice.toLocaleString()}
                      </p>
                    </div>

                    {/* Quick Add Buttons */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAddCommon(item, 1)}
                        className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                        title="Tambah 1 ke keranjang"
                      >
                        <Plus size={12} />
                        <span>+1</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddCommon(item, 2)}
                        className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer"
                        title="Tambah 2"
                      >
                        +2
                      </button>
                      {onAddAndCheckout && (
                        <button
                          type="button"
                          onClick={() => {
                            const totalAmount = item.defaultPrice;
                            setExpressItem({
                              productId: item.id.startsWith('ci-') ? undefined : item.id,
                              name: item.name,
                              price: item.defaultPrice,
                              quantity: 1,
                              unit: item.unit,
                              category: item.category,
                              total: totalAmount
                            });
                            setExpressCashTendered(totalAmount);
                          }}
                          className="px-2 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-black transition-all active:scale-95 cursor-pointer"
                          title="Langsung Bayar Cepat 1 Item"
                        >
                          ⚡
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* CUSTOM PRICE & KEYPAD MODE */
            <div className="space-y-5">
              {/* Item Name with quick presets */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">
                  Nama Barang / Deskripsi
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Contoh: Sayur Kangkung, Titipan Ongkir, dll..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-amber-500"
                />

                {/* Quick Name Presets */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['Item Bebas', 'Sayur / Buah', 'Ikan Lepas', 'Camilan / Snack', 'Bumbu Dapur', 'Rokok Ecer', 'Jasa Titip / Ongkir'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCustomName(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        customName === preset
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Input & Quick Keypad */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Harga Satuan (IDR)
                  </label>
                  <span className="text-xl font-black text-blue-600 tabular-nums">
                    Rp {customPrice.toLocaleString()}
                  </span>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-slate-400 text-xs">Rp</span>
                  <input
                    type="number"
                    min={100}
                    step={500}
                    value={customPrice || ''}
                    onChange={(e) => setCustomPrice(Math.max(0, Number(e.target.value)))}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-black text-lg text-slate-900 outline-none focus:border-amber-500 tabular-nums shadow-sm"
                  />
                </div>

                {/* Direct Price Presets */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                    Pilihan Nominal Cepat:
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {[2000, 5000, 10000, 15000, 20000, 50000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCustomPrice(amt)}
                        className={`py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                          customPrice === amt
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        Rp {amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Increments Keypad (+1k, +2k, +5k, +10k, +50k) */}
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 self-center mr-1">
                    Tambah:
                  </span>
                  {[1000, 2000, 5000, 10000, 20000, 50000].map(inc => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => setCustomPrice(prev => prev + inc)}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-mono font-bold text-slate-700 transition-all cursor-pointer active:scale-95"
                    >
                      +{inc.toLocaleString()}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomPrice(0)}
                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold transition-all cursor-pointer ml-auto"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Quantity & Unit Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Jumlah / Quantity
                  </label>
                  <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <button
                      type="button"
                      disabled={customQty <= 1}
                      onClick={() => setCustomQty(prev => Math.max(1, prev - 1))}
                      className="px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-black cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={customQty}
                      onChange={(e) => setCustomQty(Math.max(1, Number(e.target.value)))}
                      className="w-full text-center font-mono font-black text-sm text-slate-900 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setCustomQty(prev => prev + 1)}
                      className="px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-black cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Satuan
                  </label>
                  <select
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-amber-500 shadow-sm"
                  >
                    <option value="PCS">PCS (Satuan Buah)</option>
                    <option value="BKS">BKS (Bungkus)</option>
                    <option value="IKAT">IKAT (Sayuran)</option>
                    <option value="KG">KG (Kilogram)</option>
                    <option value="LITER">LITER</option>
                    <option value="PORSI">PORSI</option>
                  </select>
                </div>

                <div className="sm:col-span-2 pt-1 pb-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="saveToCatalogCheck"
                    checked={saveToCatalog}
                    onChange={(e) => setSaveToCatalog(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="saveToCatalogCheck" className="text-xs font-bold text-slate-700 cursor-pointer select-none flex items-center gap-1.5">
                    <BookmarkPlus size={14} className="text-amber-600" />
                    <span>Simpan item ini sebagai produk baru ke katalog</span>
                  </label>
                </div>
              </div>

              {/* Total & Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                <div className="w-full sm:w-auto flex-1 bg-slate-900 text-white p-3 rounded-xl flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Subtotal Item:
                  </span>
                  <span className="text-base font-black text-amber-400 tabular-nums">
                    Rp {(customPrice * customQty).toLocaleString()}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddCustom(false)}
                  disabled={customPrice <= 0 || customQty <= 0}
                  className="w-full sm:w-auto px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-blue-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus size={16} />
                  <span>Tambah Keranjang</span>
                </button>

                {onAddAndCheckout && (
                  <button
                    type="button"
                    onClick={() => handleAddCustom(true)}
                    disabled={customPrice <= 0 || customQty <= 0}
                    className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-amber-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Zap size={16} className="fill-current" />
                    <span>Langsung Bayar</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium">
            <Sparkles size={13} className="text-amber-500" />
            Mode Penjualan Kilat untuk kasir saat antrian ramai
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Tutup (Esc)
          </button>
        </div>

        {/* Express Cash Keypad Drawer Overlay */}
        {expressItem && (
          <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in-95">
            <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
                    <Zap size={16} />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-sm uppercase">Express Checkout Kilat</h4>
                    <p className="text-[10px] text-slate-500">{expressItem.quantity}x {expressItem.name}</p>
                  </div>
                </div>
                <button onClick={() => setExpressItem(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <div className="bg-slate-900 text-white p-4 rounded-2xl text-center">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">Total Tagihan</span>
                <span className="text-3xl font-black text-amber-400 font-mono">Rp {expressItem.total.toLocaleString()}</span>
              </div>

              {/* Quick Cash Presets */}
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Uang Diterima</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[expressItem.total, 5000, 10000, 20000, 50000, 100000].map((cash, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setExpressCashTendered(cash)}
                      className={`py-2 px-1 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                        expressCashTendered === cash
                          ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                      }`}
                    >
                      {cash === expressItem.total ? 'Uang Pas' : `Rp ${cash.toLocaleString()}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kembalian */}
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-800 uppercase tracking-wider text-[10px]">Kembalian:</span>
                <span className="font-mono font-black text-emerald-700 text-base">
                  Rp {Math.max(0, expressCashTendered - expressItem.total).toLocaleString()}
                </span>
              </div>

              <button
                type="button"
                onClick={handleConfirmExpressPayment}
                disabled={expressCashTendered < expressItem.total}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 size={16} />
                <span>Selesaikan Transaksi & Cetak Struk</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
