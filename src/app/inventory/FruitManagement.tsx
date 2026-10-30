import React, { useState } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuthStore } from '@/core/auth-store';
import { useDeviceId } from '@/core/device-store';
import { useToastStore } from '@/core/toast-store';
import { FruitService, DEFAULT_FRUIT_SPECIES } from '@/core/services/fruit-service';
import { ProductService } from '@/core/services/product-service';
import { FinanceService } from '@/core/services/finance-service';
import type { Product } from '@/core/types';
import { 
  Apple, 
  Plus, 
  Trash2, 
  Edit3, 
  TrendingUp, 
  AlertTriangle, 
  Package, 
  Scale, 
  ShoppingBag, 
  Wallet, 
  Search,
  RefreshCw,
  X,
  CheckCircle,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';

export default function FruitManagement() {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const deviceId = useDeviceId();
  const isOwner = currentUser?.role === 'OWNER';

  const [search, setSearch] = useState('');
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [isProcurementModalOpen, setIsProcurementModalOpen] = useState(false);
  const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);

  // Add/Edit Form State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formNormalPrice, setFormNormalPrice] = useState('');
  const [formHpp, setFormHpp] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formMinStock, setFormMinStock] = useState('10');
  const [formBaseUnit, setFormBaseUnit] = useState('KG');

  // Procurement Form State
  const [procureProductId, setProcureProductId] = useState('');
  const [procureKg, setProcureKg] = useState('');
  const [procurePricePerKg, setProcurePricePerKg] = useState('');
  const [procureSupplier, setProcureSupplier] = useState('');
  const [procureNotes, setProcureNotes] = useState('');
  const [isSubmittingProcure, setIsSubmittingProcure] = useState(false);

  // Waste Form State
  const [wasteProductId, setWasteProductId] = useState('');
  const [wasteKg, setWasteKg] = useState('');
  const [wasteReason, setWasteReason] = useState<'Buah busuk / rusak' | 'Susut timbangan alami' | 'Sortir afkir'>('Buah busuk / rusak');
  const [wasteNotes, setWasteNotes] = useState('');
  const [isSubmittingWaste, setIsSubmittingWaste] = useState(false);

  // Cash Adjustment Form State
  const [cashDirection, setCashDirection] = useState<'IN' | 'OUT'>('IN');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDesc, setCashDesc] = useState('');
  const [isSubmittingCash, setIsSubmittingCash] = useState(false);

  // Live Query Fruit Products
  const fruits = useLiveQuery(
    () => db.products.filter(p => 
      p.productType === 'FRUIT' && Boolean(
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode.includes(search) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
      )
    ).toArray(),
    [search]
  );

  // Live Query Fruit Ledger Balances & Summaries
  const summary = useLiveQuery(() => FruitService.getFruitSummary(), []);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormBarcode(Math.floor(100000 + Math.random() * 900000).toString());
    setFormSku(`BUAH-${Date.now().toString().slice(-4)}`);
    setFormNormalPrice('');
    setFormHpp('');
    setFormStock('0');
    setFormMinStock('10');
    setFormBaseUnit('KG');
    setIsAddEditModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormBarcode(p.barcode);
    setFormSku(p.sku || '');
    setFormNormalPrice(p.normalPrice.toString());
    setFormHpp(p.hpp.toString());
    setFormStock(p.stock.toString());
    setFormMinStock(p.minimumStock.toString());
    setFormBaseUnit(p.baseUnit || 'KG');
    setIsAddEditModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      addToast('Nama buah wajib diisi', 'error');
      return;
    }
    const price = Number(formNormalPrice);
    const hpp = Number(formHpp);
    if (price <= 0 || hpp < 0) {
      addToast('Harga jual dan harga modal harus valid', 'error');
      return;
    }

    try {
      const now = new Date().toISOString();
      if (editingProduct) {
        // Update product
        await db.products.update(editingProduct.productId, {
          name: formName.trim(),
          barcode: formBarcode.trim(),
          sku: formSku.trim() || undefined,
          normalPrice: price,
          hpp,
          minimumStock: Number(formMinStock) || 5,
          baseUnit: formBaseUnit,
          updatedAt: now
        });
        await db.productCosts.put({
          productId: editingProduct.productId,
          hpp,
          updatedAt: now
        });
        addToast(`Produk buah ${formName} berhasil diperbarui!`, 'success');
      } else {
        // Create product
        const newId = `fruit_${uuidv4().slice(0, 8)}`;
        const initialStockNum = Number(formStock) || 0;
        const newProduct: Product = {
          productId: newId,
          name: formName.trim(),
          barcode: formBarcode.trim(),
          sku: formSku.trim() || undefined,
          categoryId: 'BUAH',
          productType: 'FRUIT',
          baseUnit: formBaseUnit,
          saleUnits: ['KG', 'GRAM'],
          conversionRules: [{ fromUnit: 'GRAM', toUnit: 'KG', factor: 0.001 }],
          normalPrice: price,
          hpp,
          stock: initialStockNum,
          minimumStock: Number(formMinStock) || 5,
          targetStock: (Number(formMinStock) || 5) * 3,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now
        };

        await db.products.put(newProduct);
        await db.productCosts.put({
          productId: newId,
          hpp,
          updatedAt: now
        });

        if (initialStockNum > 0) {
          const { StockService } = await import('@/core/services/stock-service');
          await StockService.recordMovement({
            productId: newId,
            movementType: 'OPENING_BALANCE',
            qty: initialStockNum,
            unit: formBaseUnit,
            baseQty: initialStockNum,
            referenceId: `init_${newId}`,
            segmentId: 'BUAH',
            reason: `Stok Awal Buah: ${newProduct.name}`,
            costSnapshot: hpp,
            userId: currentUser?.userId || 'SYSTEM',
            deviceId,
            timestamp: now
          });
        }
        addToast(`Buah baru ${formName} berhasil didaftarkan!`, 'success');
      }
      setIsAddEditModalOpen(false);
    } catch (err: any) {
      addToast(err.message || 'Gagal menyimpan produk buah', 'error');
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!isOwner) {
      addToast('Hanya OWNER yang diizinkan menghapus data produk buah.', 'error');
      return;
    }

    if (window.confirm(`Yakin ingin menghapus master data buah "${product.name}"? Data penjualan historis tetap tersimpan.`)) {
      try {
        await ProductService.deleteProduct(product.productId);
        addToast(`Master buah ${product.name} berhasil dihapus.`, 'success');
      } catch (err: any) {
        addToast(err.message || 'Gagal menghapus produk.', 'error');
      }
    }
  };

  const handleSeedDefaults = async () => {
    try {
      const added = await FruitService.ensureMinimalFruitProducts(currentUser?.userId);
      if (added > 0) {
        addToast(`${added} jenis buah bawaan (Mangga & Jeruk) berhasil dimuat!`, 'success');
      } else {
        addToast('Data buah bawaan (Mangga & Jeruk) sudah aktif di sistem.', 'info');
      }
    } catch (err: any) {
      addToast(err.message || 'Gagal memuat buah default.', 'error');
    }
  };

  const handleSubmitProcurement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!procureProductId) {
      addToast('Pilih jenis buah yang dikulak.', 'error');
      return;
    }
    const kg = Number(procureKg);
    const pricePerKg = Number(procurePricePerKg);
    if (kg <= 0 || pricePerKg <= 0) {
      addToast('Masukkan berat kg dan harga beli per kg yang valid.', 'error');
      return;
    }

    setIsSubmittingProcure(true);
    try {
      const res = await FruitService.recordFruitProcurement({
        productId: procureProductId,
        incomingKg: kg,
        purchasePricePerKg: pricePerKg,
        supplierName: procureSupplier.trim() || undefined,
        notes: procureNotes.trim() || undefined,
        userId: currentUser?.userId || 'SYSTEM',
        role: currentUser?.role,
        deviceId
      });

      addToast(`Kulakan buah berhasil! Stok bertambah ${kg} kg, total belanja Rp ${res.totalCost.toLocaleString()} dipotong dari Kas Buah. HPP baru: Rp ${res.newHpp.toLocaleString()}/kg`, 'success');
      setProcureKg('');
      setProcurePricePerKg('');
      setProcureSupplier('');
      setProcureNotes('');
      setIsProcurementModalOpen(false);
    } catch (err: any) {
      addToast(err.message || 'Gagal memproses kulakan buah.', 'error');
    } finally {
      setIsSubmittingProcure(false);
    }
  };

  const handleSubmitWaste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wasteProductId) {
      addToast('Pilih jenis buah yang susut / rusak.', 'error');
      return;
    }
    const kg = Number(wasteKg);
    if (kg <= 0) {
      addToast('Masukkan berat susut yang valid (lebih dari 0 kg).', 'error');
      return;
    }

    setIsSubmittingWaste(true);
    try {
      await FruitService.recordFruitWaste({
        productId: wasteProductId,
        qtyKg: kg,
        reason: wasteReason,
        notes: wasteNotes.trim() || undefined,
        userId: currentUser?.userId || 'SYSTEM',
        role: currentUser?.role,
        deviceId
      });

      addToast(`Penyesuaian susut berhasil! Stok buah dikurangi ${kg} kg dan tercatat dalam log audit.`, 'success');
      setWasteKg('');
      setWasteNotes('');
      setIsWasteModalOpen(false);
    } catch (err: any) {
      addToast(err.message || 'Gagal mencatat penyusutan buah.', 'error');
    } finally {
      setIsSubmittingWaste(false);
    }
  };

  const handleSubmitCash = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(cashAmount);
    if (!amt || amt <= 0) {
      addToast('Masukkan nominal kas yang valid.', 'error');
      return;
    }

    setIsSubmittingCash(true);
    try {
      const now = new Date().toISOString();
      const ref = `mutasi_kas_buah_${uuidv4().slice(0, 8)}`;
      await FinanceService.recordLedgerEntry({
        amount: amt,
        storageId: 'BUAH',
        direction: cashDirection,
        referenceId: ref,
        referenceType: cashDirection === 'IN' ? 'CAPITAL' : 'EXPENSE',
        description: cashDesc.trim() ? `Kas Buah (${cashDirection === 'IN' ? 'Setor Modal' : 'Tarik Kas'}): ${cashDesc.trim()}` : `Mutasi Kas Buah (${cashDirection})`,
        userId: currentUser?.userId || 'SYSTEM',
        role: currentUser?.role,
        deviceId,
        timestamp: now
      });

      addToast(`Mutasi Kas Buah sebesar Rp ${amt.toLocaleString()} (${cashDirection === 'IN' ? 'Masuk' : 'Keluar'}) berhasil dicatat!`, 'success');
      setCashAmount('');
      setCashDesc('');
      setIsCashModalOpen(false);
    } catch (err: any) {
      addToast(err.message || 'Gagal mencatat mutasi kas buah.', 'error');
    } finally {
      setIsSubmittingCash(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-emerald-600 to-teal-700 p-6 rounded-3xl text-white shadow-xl shadow-emerald-900/10">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-3xl shadow-inner border border-white/20">
            🍎
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">MANAJEMEN PENJUALAN BUAH</h1>
              <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-400 text-emerald-950 px-2 py-0.5 rounded-md">
                Fresh Produce
              </span>
            </div>
            <p className="text-emerald-100 text-xs mt-1 font-medium">
              Katalog Buah Segar, Timbangan Desimal POS, Storage Kas Buah, &amp; Kontrol Susut
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleSeedDefaults}
            className="px-3.5 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold flex items-center gap-2 border border-white/20 transition-all"
            title="Muat Ulang Mangga Arum Manis & Jeruk Berastagi jika belum ada"
          >
            <RefreshCw size={14} />
            <span>Reset Buah Bawaan</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCashModalOpen(true)}
            className="px-3.5 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold flex items-center gap-2 border border-white/20 transition-all"
            title="Kelola Saldo Kas Khusus Buah"
          >
            <Wallet size={14} />
            <span>Mutasi Kas Buah</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (fruits && fruits.length > 0) setProcureProductId(fruits[0].productId);
              setIsProcurementModalOpen(true);
            }}
            className="px-3.5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-amber-900/20 transition-all cursor-pointer"
          >
            <ShoppingBag size={14} />
            <span>📦 Catat Kulakan Buah</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (fruits && fruits.length > 0) setWasteProductId(fruits[0].productId);
              setIsWasteModalOpen(true);
            }}
            className="px-3.5 py-2.5 bg-rose-500 hover:bg-rose-400 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-rose-900/20 transition-all cursor-pointer"
          >
            <AlertTriangle size={14} />
            <span>⚠️ Catat Buah Susut/Busuk</span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-2.5 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            <Plus size={16} />
            <span>+ Tambah Buah</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Storage Kas Buah */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Saldo Kas Buah</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Wallet size={16} />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900 tabular-nums">
            Rp {(summary?.cashFruitBalance || 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">Kantong Kas Keuangan 'BUAH'</span>
        </div>

        {/* Omset Buah */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Penjualan</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-xl font-black text-blue-600 tabular-nums">
            Rp {(summary?.fruitRevenue || 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">
            Terjual: {(summary?.totalFruitKgSold || 0).toFixed(1)} kg buah
          </span>
        </div>

        {/* Laba Kotor Buah */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Laba Kotor Buah</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <Scale size={16} />
            </div>
          </div>
          <div className="text-xl font-black text-teal-600 tabular-nums">
            Rp {(summary?.fruitGrossProfit || 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">
            Margin: {summary?.fruitRevenue ? Math.round((summary.fruitGrossProfit / summary.fruitRevenue) * 100) : 0}%
          </span>
        </div>

        {/* Valuasi Aset Stok */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Valuasi Stok Buah</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Package size={16} />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900 tabular-nums">
            Rp {(summary?.totalValuationRp || 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">
            Total Stok: {(summary?.totalCurrentKg || 0).toFixed(1)} kg
          </span>
        </div>

        {/* Kerugian Susut / Busuk */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Susut / Waste</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="text-xl font-black text-rose-600 tabular-nums">
            -Rp {(summary?.wasteLossRp || 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">
            Terbuang: {(summary?.wasteKg || 0).toFixed(1)} kg
          </span>
        </div>
      </div>

      {/* Main Content: Search & Fruit Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input 
              type="text"
              placeholder="Cari Buah (Mangga, Jeruk, Barcode)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span>Daftar Buah Aktif: <strong className="text-slate-900">{fruits?.length || 0}</strong> item</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Nama Buah</th>
                <th className="py-3 px-4">SKU / Barcode</th>
                <th className="py-3 px-4">Satuan</th>
                <th className="py-3 px-4 text-right">Modal (HPP)</th>
                <th className="py-3 px-4 text-right">Harga Jual</th>
                <th className="py-3 px-4 text-center">Margin</th>
                <th className="py-3 px-4 text-right">Stok Fisik</th>
                <th className="py-3 px-4 text-right">Nilai Aset</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fruits && fruits.length > 0 ? (
                fruits.map((item) => {
                  const marginPct = item.normalPrice > 0 ? Math.round(((item.normalPrice - item.hpp) / item.normalPrice) * 100) : 0;
                  const isLow = (item.stock || 0) <= (item.minimumStock || 5);
                  const totalAsset = Math.round((item.stock || 0) * (item.hpp || 0));

                  return (
                    <tr key={item.productId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl">
                            {item.name.toLowerCase().includes('jeruk') ? '🍊' : item.name.toLowerCase().includes('mangga') ? '🥭' : '🍎'}
                          </span>
                          <div>
                            <p className="font-black text-slate-900 text-sm leading-tight">{item.name}</p>
                            <span className="text-[10px] text-slate-400 font-medium">Kategori: Buah Segar</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 font-medium">
                        <div>{item.sku || '-'}</div>
                        <div className="text-[10px] text-slate-400">{item.barcode}</div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-700">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px]">
                          {item.baseUnit || 'KG'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-700 tabular-nums">
                        Rp {item.hpp.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-emerald-600 tabular-nums">
                        Rp {item.normalPrice.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${marginPct >= 20 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {marginPct}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums">
                        <span className={`font-black text-sm ${isLow ? 'text-rose-600' : 'text-slate-900'}`}>
                          {Number(item.stock || 0).toFixed(2)} {item.baseUnit}
                        </span>
                        {isLow && (
                          <span className="block text-[9px] font-bold text-rose-500 uppercase tracking-tight">
                            Low (Min: {item.minimumStock})
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-slate-800 tabular-nums">
                        Rp {totalAsset.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                          <CheckCircle size={10} /> Aktif
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Buah"
                          >
                            <Edit3 size={15} />
                          </button>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(item)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Hapus Buah (Owner Only)"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Apple size={36} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-bold text-sm text-slate-600">Belum ada katalog buah</p>
                    <p className="text-xs text-slate-400 mt-1">Klik tombol "Reset Buah Bawaan" untuk memuat Mangga Arum Manis & Jeruk Berastagi.</p>
                    <button
                      type="button"
                      onClick={handleSeedDefaults}
                      className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm"
                    >
                      Muat Mangga & Jeruk Sekarang
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Add / Edit Product */}
      <AnimatePresence>
        {isAddEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center font-black">
                    🍎
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base">{editingProduct ? 'Edit Data Buah' : 'Tambah Buah Baru'}</h3>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Katalog Komoditas Segar</p>
                  </div>
                </div>
                <button onClick={() => setIsAddEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveProduct} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nama Buah &amp; Varietas *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Mangga Arum Manis, Jeruk Berastagi..."
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Barcode</label>
                    <input
                      type="text"
                      required
                      value={formBarcode}
                      onChange={(e) => setFormBarcode(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">SKU Produk</label>
                    <input
                      type="text"
                      value={formSku}
                      onChange={(e) => setFormSku(e.target.value)}
                      placeholder="BUAH-001"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Harga Modal / HPP (Rp) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      placeholder="20000"
                      value={formHpp}
                      onChange={(e) => setFormHpp(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold tabular-nums focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Harga Jual per Satuan (Rp) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      placeholder="28000"
                      value={formNormalPrice}
                      onChange={(e) => setFormNormalPrice(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-emerald-700 tabular-nums focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Satuan Dasar</label>
                    <select
                      value={formBaseUnit}
                      onChange={(e) => setFormBaseUnit(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white outline-none"
                    >
                      <option value="KG">KG (Kilogram)</option>
                      <option value="PCS">PCS (Satuan Buah)</option>
                      <option value="SISIR">SISIR</option>
                      <option value="KERANJANG">KERANJANG</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {editingProduct ? 'Stok Terkini' : 'Stok Awal'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!!editingProduct}
                      value={formStock}
                      onChange={(e) => setFormStock(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold tabular-nums focus:bg-white outline-none disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Batas Min Stok</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formMinStock}
                      onChange={(e) => setFormMinStock(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold tabular-nums focus:bg-white outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2.5 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddEditModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-200"
                  >
                    Simpan Buah
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 2: Catat Kulakan Buah */}
      <AnimatePresence>
        {isProcurementModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 text-amber-800 rounded-xl flex items-center justify-center font-black">
                    📦
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base">Catat Kulakan / Pengadaan Buah</h3>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Potong Saldo Kas Buah &amp; Tambah Stok</p>
                  </div>
                </div>
                <button onClick={() => setIsProcurementModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmitProcurement} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Jenis Buah *</label>
                  <select
                    required
                    value={procureProductId}
                    onChange={(e) => setProcureProductId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    <option value="">-- Pilih Buah --</option>
                    {fruits?.map(f => (
                      <option key={f.productId} value={f.productId}>
                        {f.name} (Stok Saat Ini: {f.stock} {f.baseUnit})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Jumlah Kulakan (KG) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0.1"
                      placeholder="Misal: 50"
                      value={procureKg}
                      onChange={(e) => setProcureKg(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold tabular-nums focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Harga Beli per KG (Rp) *</label>
                    <input
                      type="number"
                      required
                      min="1000"
                      placeholder="Misal: 19000"
                      value={procurePricePerKg}
                      onChange={(e) => setProcurePricePerKg(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-amber-800 tabular-nums focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>

                {/* Subtotal Preview */}
                {Number(procureKg) > 0 && Number(procurePricePerKg) > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs font-black text-amber-900">
                    <span>Total Uang Keluar (Kas Buah):</span>
                    <span className="text-base tabular-nums">
                      Rp {(Number(procureKg) * Number(procurePricePerKg)).toLocaleString()}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Pemasok / Pasar Induk</label>
                    <input
                      type="text"
                      placeholder="Pasar Induk Buah, Petani..."
                      value={procureSupplier}
                      onChange={(e) => setProcureSupplier(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Keterangan Tambahan</label>
                    <input
                      type="text"
                      placeholder="Grade super, peti kayu..."
                      value={procureNotes}
                      onChange={(e) => setProcureNotes(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2.5 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsProcurementModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingProcure}
                    className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-md shadow-amber-200 disabled:opacity-50"
                  >
                    {isSubmittingProcure ? 'Memproses...' : 'Konfirmasi Kulakan Buah'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 3: Catat Buah Rusak / Susut */}
      <AnimatePresence>
        {isWasteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-rose-100 text-rose-700 rounded-xl flex items-center justify-center font-black">
                    ⚠️
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base">Catat Buah Susut / Busuk</h3>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Potong Stok Fisik &amp; Audit Nilai Kerugian</p>
                  </div>
                </div>
                <button onClick={() => setIsWasteModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmitWaste} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Jenis Buah *</label>
                  <select
                    required
                    value={wasteProductId}
                    onChange={(e) => setWasteProductId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-rose-500 outline-none"
                  >
                    <option value="">-- Pilih Buah --</option>
                    {fruits?.map(f => (
                      <option key={f.productId} value={f.productId}>
                        {f.name} (Stok: {f.stock} {f.baseUnit} | HPP: Rp {f.hpp.toLocaleString()}/kg)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Berat Susut/Rusak (KG) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0.01"
                      placeholder="Contoh: 1.5"
                      value={wasteKg}
                      onChange={(e) => setWasteKg(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-rose-700 tabular-nums focus:bg-white focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Kategori Alasan *</label>
                    <select
                      value={wasteReason}
                      onChange={(e: any) => setWasteReason(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white outline-none"
                    >
                      <option value="Buah busuk / rusak">Buah busuk / rusak</option>
                      <option value="Susut timbangan alami">Susut timbangan alami</option>
                      <option value="Sortir afkir">Sortir afkir (tidak layak jual)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Catatan Tambahan</label>
                  <input
                    type="text"
                    placeholder="Kondisi matang berlebih, jatuh saat display..."
                    value={wasteNotes}
                    onChange={(e) => setWasteNotes(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>

                <div className="flex gap-2.5 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsWasteModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingWaste}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black shadow-md shadow-rose-200 disabled:opacity-50"
                  >
                    {isSubmittingWaste ? 'Memproses...' : 'Catat Penurunan Stok'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 4: Mutasi Kas Buah */}
      <AnimatePresence>
        {isCashModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-800 rounded-xl flex items-center justify-center font-black">
                    <Wallet size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base">Mutasi Saldo Kas Buah</h3>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Setoran Modal / Penarikan Kas</p>
                  </div>
                </div>
                <button onClick={() => setIsCashModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmitCash} className="space-y-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCashDirection('IN')}
                    className={`flex-1 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                      cashDirection === 'IN' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <ArrowDownLeft size={14} /> Kas Masuk (Setor)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashDirection('OUT')}
                    className={`flex-1 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                      cashDirection === 'OUT' ? 'bg-rose-600 text-white shadow-md shadow-rose-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <ArrowUpRight size={14} /> Kas Keluar (Tarik)
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nominal (Rp) *</label>
                  <input
                    type="number"
                    required
                    min="1000"
                    placeholder="Contoh: 500000"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-black tabular-nums focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Keterangan / Keperluan *</label>
                  <input
                    type="text"
                    required
                    placeholder="Setoran modal awal dagang buah, beli plastik..."
                    value={cashDesc}
                    onChange={(e) => setCashDesc(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div className="flex gap-2.5 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCashModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingCash}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-200 disabled:opacity-50"
                  >
                    {isSubmittingCash ? 'Menyimpan...' : 'Simpan Mutasi Kas'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
