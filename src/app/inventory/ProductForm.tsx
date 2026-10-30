import React, { useState, useEffect } from 'react';
import type { Product, ProductType, ConversionRule } from '@/core/types';
import { ProductService } from '@/core/services/product-service';
import { CostingEngine, type WacSourceEvent } from '@/core/costing-engine';
import { Save, Package, Barcode, Trash2, CheckCircle, XCircle, Lock, History, AlertTriangle, ShieldCheck, X, Camera, Plus, Scale } from 'lucide-react';
import { CameraBarcodeScanner } from '@/components/CameraBarcodeScanner';
import { VisualUnitConversionHelper } from './VisualUnitConversionHelper';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';
import { db } from '@/core/database';

interface ProductFormProps {
  product?: Product;
  initialProductType?: ProductType;
  initialBaseUnit?: string;
  onSave: (productId: string) => void;
  onCancel: () => void;
}

export function ProductForm({ product, initialProductType, initialBaseUnit, onSave, onCancel }: ProductFormProps) {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const isOwner = currentUser?.role === 'OWNER';
  const isEditing = Boolean(product?.productId);

  const [formData, setFormData] = useState<Partial<Product>>({
    name: product?.name || '',
    sku: product?.sku || '',
    barcode: product?.barcode || '',
    productType: product?.productType || initialProductType || 'SEMBAKO',
    baseUnit: product?.baseUnit || initialBaseUnit || (initialProductType === 'FISH' ? 'KG' : 'PCS'),
    status: product?.status || 'ACTIVE',
    normalPrice: product?.normalPrice ?? 0,
    stock: product?.stock ?? 0,
    minimumStock: product?.minimumStock ?? 5,
    targetStock: product?.targetStock ?? 20,
    saleUnits: product?.saleUnits || [initialBaseUnit || (initialProductType === 'FISH' ? 'KG' : 'PCS')],
    conversionRules: product?.conversionRules || [],
    tags: product?.tags || []
  });

  useEffect(() => {
    if (product) {
      setFormData({
        ...product,
        name: product.name || '',
        sku: product.sku || '',
        barcode: product.barcode || '',
        conversionRules: product.conversionRules || [],
        tags: product.tags || []
      });
    }
  }, [product]);

  const [hpp, setHpp] = useState<number>(product?.hpp ?? 0);
  const [isSaving, setIsSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);

  // Multi-Unit Conversion Rule Input State
  const [newRuleUnit, setNewRuleUnit] = useState('');
  const [newRuleFactor, setNewRuleFactor] = useState('');
  const [newRulePrice, setNewRulePrice] = useState('');
  const [newRuleBarcode, setNewRuleBarcode] = useState('');

  // Cost Adjustment Modal State
  const [isCostModalOpen, setIsCostModalOpen] = useState(false);
  const [newAdjustmentHpp, setNewAdjustmentHpp] = useState<string>('');
  const [adjustmentReason, setAdjustmentReason] = useState<string>('Koreksi Faktur Supplier');
  const [adjustmentNotes, setAdjustmentNotes] = useState<string>('');
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false);

  // WAC Source Traceability Modal State
  const [isTraceModalOpen, setIsTraceModalOpen] = useState(false);
  const [traceEvents, setTraceEvents] = useState<WacSourceEvent[]>([]);
  const [isLoadingTrace, setIsLoadingTrace] = useState(false);

  useEffect(() => {
    async function loadHpp() {
      if (product && isOwner) {
        const cost = await db.productCosts.get(product.productId);
        if (cost && cost.hpp !== undefined) {
          setHpp(cost.hpp);
        } else if (product.hpp !== undefined) {
          setHpp(product.hpp);
        }
      }
    }
    loadHpp();
  }, [product, isOwner]);

  const handleOpenTraceability = async () => {
    if (!product) return;
    setIsLoadingTrace(true);
    setIsTraceModalOpen(true);
    try {
      const trace = await CostingEngine.getWacTraceability(product.productId);
      setTraceEvents(trace.events || []);
    } catch (e: any) {
      addToast('Gagal memuat histori WAC: ' + e.message, 'error');
    } finally {
      setIsLoadingTrace(false);
    }
  };

  const handleSaveCostAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !currentUser || !newAdjustmentHpp) return;

    setIsSubmittingAdjustment(true);
    try {
      const res = await CostingEngine.recordCostAdjustment({
        productId: product.productId,
        newHpp: Number(newAdjustmentHpp),
        reason: adjustmentReason,
        notes: adjustmentNotes,
        userId: currentUser.userId,
        role: currentUser.role,
        deviceId: 'device-1'
      });

      setHpp(res.newHpp);
      setIsCostModalOpen(false);
      setNewAdjustmentHpp('');
      setAdjustmentNotes('');
      addToast(`HPP berhasil disesuaikan menjadi Rp ${(res.newHpp ?? 0).toLocaleString()} dan dicatat pada audit trail.`, 'success');
    } catch (err: any) {
      addToast('Gagal menyesuaikan HPP: ' + err.message, 'error');
    } finally {
      setIsSubmittingAdjustment(false);
    }
  };

  const handleAddConversionRule = () => {
    const unit = newRuleUnit.trim().toUpperCase();
    const factor = Number(newRuleFactor);
    const baseUnit = (formData.baseUnit || 'PCS').toUpperCase();
    if (!unit || factor <= 0 || unit === baseUnit) {
      addToast('Masukkan nama satuan turunan (berbeda dari satuan dasar) dan faktor konversi > 0.', 'warning');
      return;
    }
    const existingRules = formData.conversionRules || [];
    if (existingRules.some(r => r.toUnit === unit)) {
      addToast(`Satuan ${unit} sudah terdaftar.`, 'warning');
      return;
    }
    const parsedPrice = newRulePrice ? Number(newRulePrice) : undefined;
    const parsedBarcode = newRuleBarcode.trim() || undefined;
    const newRule: ConversionRule = {
      fromUnit: baseUnit,
      toUnit: unit,
      factor,
      ...(parsedPrice && parsedPrice > 0 ? { price: parsedPrice } : {}),
      ...(parsedBarcode ? { barcode: parsedBarcode } : {})
    };
    const updatedRules: ConversionRule[] = [...existingRules, newRule];
    const updatedSaleUnits = Array.from(new Set([baseUnit, ...updatedRules.map(r => r.toUnit)]));
    setFormData({
      ...formData,
      conversionRules: updatedRules,
      saleUnits: updatedSaleUnits
    });
    setNewRuleUnit('');
    setNewRuleFactor('');
    setNewRulePrice('');
    setNewRuleBarcode('');
  };

  const handleRemoveConversionRule = (toUnit: string) => {
    const baseUnit = (formData.baseUnit || 'PCS').toUpperCase();
    const updatedRules = (formData.conversionRules || []).filter(r => r.toUnit !== toUnit);
    const updatedSaleUnits = Array.from(new Set([baseUnit, ...updatedRules.map(r => r.toUnit)]));
    setFormData({
      ...formData,
      conversionRules: updatedRules,
      saleUnits: updatedSaleUnits
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const baseUnit = (formData.baseUnit || 'PCS').toUpperCase();
      const rules = (formData.conversionRules || []).map(r => ({ ...r, fromUnit: baseUnit }));
      const saleUnits = Array.from(new Set([baseUnit, ...rules.map(r => r.toUnit)]));

      const payload: Partial<Product> = {
        ...formData,
        baseUnit,
        conversionRules: rules,
        saleUnits
      };

      // For existing product, pass undefined for hpp so it does not trigger No Direct Free Edit error
      const productId = await ProductService.saveProduct(payload, !isEditing && isOwner ? hpp : undefined);
      addToast(isEditing ? 'Data produk berhasil diperbarui!' : 'Produk baru berhasil ditambahkan!', 'success');
      onSave(productId);
    } catch (error: any) {
      console.error('Failed to save product:', error);
      addToast('Gagal menyimpan produk: ' + (error?.message || 'Terjadi kesalahan'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Name Field */}
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Produk *</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Package size={18} />
              </div>
              <input
                required
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 shadow-sm transition-all"
                value={formData.name ?? ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Masukkan nama produk..."
              />
            </div>
          </div>

          {/* Product Type & Base Unit */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Kategori Tipe Produk</label>
            <select
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 shadow-sm"
              value={formData.productType ?? 'SEMBAKO'}
              onChange={(e) => {
                const newType = e.target.value as ProductType;
                const defaultUnit = newType === 'FISH' ? 'KG' : 'PCS';
                setFormData({
                  ...formData,
                  productType: newType,
                  baseUnit: formData.baseUnit || defaultUnit
                });
              }}
            >
              <option value="SEMBAKO">SEMBAKO / WARUNG</option>
              <option value="FRUIT">BUAH SEGAR (KG / PCS) 🍎</option>
              <option value="FISH">IKAN HIDUP / SEGAR (KG)</option>
              <option value="GENERAL">UMUM / LAINNYA</option>
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Satuan Dasar (Base Unit)</label>
              <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">Satuan Paling Kecil</span>
            </div>
            <input
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 uppercase shadow-sm"
              value={formData.baseUnit ?? 'PCS'}
              onChange={(e) => setFormData({ ...formData, baseUnit: e.target.value.toUpperCase() })}
              placeholder="Contoh: BATANG, PCS, GRAM, BUTIR"
            />
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              💡 <strong>Wajib masukkan satuan terkecil</strong> (misal rokok: <span className="font-bold text-slate-700">BATANG</span>). Satuan lebih besar seperti <span className="font-bold text-slate-700">BUNGKUS</span> atau <span className="font-bold text-slate-700">SLOP</span> didaftarkan di bagian <em>"Satuan Tambahan / Grosir (Multi-Satuan)"</em> di bawah.
            </p>
          </div>

          {/* SKU Field */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SKU (Internal ID)</label>
            <input
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 shadow-sm"
              value={formData.sku ?? ''}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              placeholder="Auto-generate jika kosong"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Barcode (Scanner)</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Barcode size={18} />
              </div>
              <input
                className="w-full pl-11 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 shadow-sm"
                value={formData.barcode ?? ''}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                placeholder="Scan barcode..."
              />
              <button 
                type="button"
                onClick={() => setIsCameraScannerOpen(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                title="Scan Barcode via Kamera Device"
              >
                <Camera size={18} />
              </button>
            </div>
          </div>

          {/* Price Field */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga Jual (per {formData.baseUnit || 'Base'}) *</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">Rp</div>
              <input
                type="number"
                required
                min="0"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 tabular-nums shadow-sm"
                value={formData.normalPrice ?? 0}
                onChange={(e) => setFormData({ ...formData, normalPrice: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* HPP Field (Owner Only) */}
          {isOwner && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  WAC / HPP Modal ({isEditing ? 'Protected' : 'Opening Cost'})
                </label>
                {isEditing && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setNewAdjustmentHpp(String(hpp ?? 0));
                        setIsCostModalOpen(true);
                      }}
                      className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1"
                    >
                      <ShieldCheck size={11} />
                      Koreksi HPP Resmi
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenTraceability}
                      className="text-[9px] font-black text-slate-600 hover:text-slate-900 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1"
                    >
                      <History size={11} />
                      Jejak WAC
                    </button>
                  </div>
                )}
              </div>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">Rp</div>
                <input
                  type="number"
                  required
                  min="0"
                  disabled={isEditing}
                  className={`w-full pl-10 pr-4 py-3 border rounded-xl outline-none font-bold tabular-nums shadow-sm ${
                    isEditing
                      ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                      : 'bg-blue-50 border-blue-100 text-blue-900 focus:ring-2 focus:ring-blue-500'
                  }`}
                  value={hpp ?? 0}
                  onChange={(e) => setHpp(Number(e.target.value))}
                />
                {isEditing && (
                  <Lock size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                )}
              </div>
              {isEditing && (
                <p className="text-[9px] text-slate-400 font-medium leading-tight">
                  Sesuai aturan No Direct Free Edit: HPP hanya berubah lewat Pembelian atau tombol <strong>Koreksi HPP Resmi</strong>.
                </p>
              )}
            </div>
          )}

          {/* Stock Thresholds & Opening Balance */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                {isEditing ? 'Stok Saat Ini (Derived)' : 'Stok Awal (Opening)'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  disabled={isEditing}
                  className={`w-full px-3.5 py-2.5 border rounded-xl font-black text-sm tabular-nums outline-none ${
                    isEditing
                      ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                      : 'bg-white border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-500'
                  }`}
                  value={formData.stock ?? 0}
                  onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">
                  {formData.baseUnit || 'PCS'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                Minimum Stok (Alert)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-sm text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.minimumStock ?? 5}
                onChange={(e) => setFormData({ ...formData, minimumStock: Number(e.target.value) })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                Target Stok Ideal
              </label>
              <input
                type="number"
                step="any"
                min="0"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-sm text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.targetStock ?? 20}
                onChange={(e) => setFormData({ ...formData, targetStock: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* Multi-Unit Conversion Rules */}
          <div className="md:col-span-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                  <Scale size={14} className="text-blue-600" />
                  Konversi Multi-Satuan Jual (Multi-Unit Conversion)
                </label>
                <p className="text-[10px] text-slate-400 font-medium">
                  Contoh: 1 DUS = 40 {formData.baseUnit || 'PCS'}, atau 1 KARUNG = 25 {formData.baseUnit || 'KG'}.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">Nama Satuan Turunan</label>
                <input
                  type="text"
                  placeholder="Misal: BUNGKUS, DUS"
                  value={newRuleUnit}
                  onChange={(e) => setNewRuleUnit(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 uppercase outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                  Isi (per 1 Satuan = ... {formData.baseUnit || 'PCS'})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  placeholder="Contoh: 20"
                  value={newRuleFactor}
                  onChange={(e) => setNewRuleFactor(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                  Harga Jual Satuan (Opsional Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder={
                    newRuleFactor && formData.normalPrice
                      ? `Auto: Rp ${(formData.normalPrice * Number(newRuleFactor)).toLocaleString()}`
                      : 'Contoh: 24000'
                  }
                  value={newRulePrice}
                  onChange={(e) => setNewRulePrice(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-blue-600 tabular-nums outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                  Barcode Kemasan (Opsional)
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Barcode bungkus/dus"
                    value={newRuleBarcode}
                    onChange={(e) => setNewRuleBarcode(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddConversionRule}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all shrink-0 cursor-pointer"
                    title="Tambah Satuan Jual"
                  >
                    <Plus size={14} />
                    Tambah
                  </button>
                </div>
              </div>
            </div>

            {formData.conversionRules && formData.conversionRules.length > 0 && (
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-200/60">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Satuan Jual Terdaftar:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {formData.conversionRules.map((rule) => {
                    const effectivePrice = rule.price && rule.price > 0 ? rule.price : (formData.normalPrice || 0) * rule.factor;
                    return (
                      <div
                        key={rule.toUnit}
                        className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 shadow-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[10px] uppercase">
                              1 {rule.toUnit}
                            </span>
                            <span className="text-slate-500 text-[11px] font-bold">
                              = <strong>{rule.factor}</strong> {formData.baseUnit || 'PCS'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="font-black text-emerald-600">
                              Rp {effectivePrice.toLocaleString()}
                              {rule.price && rule.price > 0 && <span className="text-[8px] bg-emerald-100 text-emerald-800 px-1 rounded ml-1 font-bold">HARGA KHUSUS</span>}
                            </span>
                            {rule.barcode && (
                              <span className="text-slate-400 font-mono text-[9px]">
                                🏷️ {rule.barcode}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveConversionRule(rule.toUnit)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Hapus Satuan"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Visual Unit Conversion Helper & Chain Formula */}
            <VisualUnitConversionHelper
              baseUnit={formData.baseUnit || 'PCS'}
              basePrice={formData.normalPrice || 0}
              conversionRules={formData.conversionRules || []}
              draftRule={
                newRuleUnit.trim() && Number(newRuleFactor) > 0
                  ? {
                      unit: newRuleUnit.trim().toUpperCase(),
                      factor: Number(newRuleFactor),
                      price: newRulePrice ? Number(newRulePrice) : undefined
                    }
                  : undefined
              }
            />
          </div>

          {/* Price Alert Threshold */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-rose-500">Alert Harga (%)</label>
            <div className="relative">
              <input
                type="number"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none font-bold text-slate-900 tabular-nums shadow-sm"
                value={formData.priceAlertThreshold ?? ''}
                onChange={(e) => setFormData({ ...formData, priceAlertThreshold: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="Contoh: 10 (10%)"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">%</div>
            </div>
            <p className="text-[9px] text-slate-400 font-medium italic leading-tight">Notifikasi jika HPP berfluktuasi melebihi batas ini.</p>
          </div>

          {/* Status Toggle */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Aktif</label>
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1 h-[50px]">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, status: 'ACTIVE' })}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${
                  formData.status === 'ACTIVE' 
                    ? 'bg-white text-emerald-600 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-500'
                }`}
              >
                <CheckCircle size={14} />
                Aktif
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, status: 'INACTIVE' })}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${
                  formData.status === 'INACTIVE' 
                    ? 'bg-white text-rose-600 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-500'
                }`}
              >
                <XCircle size={14} />
                Nonaktif
              </button>
            </div>
          </div>

          {/* Tags Field */}
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tags (Promosi / Musiman)</label>
            <div className="space-y-3">
              <input
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 shadow-sm"
                placeholder="Ketik tag dan tekan Enter (misal: PROMO, LEBARAN)"
                value={tagInput ?? ''}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = tagInput.trim().toUpperCase();
                    if (val && !formData.tags?.includes(val)) {
                      setFormData({ ...formData, tags: [...(formData.tags || []), val] });
                      setTagInput('');
                    }
                  }
                }}
              />
              <div className="flex flex-wrap gap-2">
                {formData.tags?.map((tag) => (
                  <span key={tag} className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-lg border border-blue-100 uppercase tracking-widest">
                    {tag}
                    <button 
                      type="button"
                      onClick={() => setFormData({ ...formData, tags: formData.tags?.filter(t => t !== tag) })}
                      className="hover:text-rose-600 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-8 py-3 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-blue-500 shadow-lg shadow-blue-200 transition-all flex items-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Menyimpan...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save size={18} />
                Simpan Produk
              </span>
            )}
          </button>
        </div>
      </form>

      {/* Official Cost Adjustment Modal (Owner Only) */}
      {isCostModalOpen && product && (
        <div className="fixed inset-0 z-[200] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 text-blue-600 font-black text-xs uppercase tracking-wider">
                <ShieldCheck size={18} />
                <span>Koreksi HPP / WAC Resmi</span>
              </div>
              <button type="button" onClick={() => setIsCostModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCostAdjustment} className="space-y-4">
              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900">
                <p className="font-bold">{product.name}</p>
                <p className="text-[11px] text-blue-700 mt-0.5">
                  WAC Saat Ini: <strong>Rp {(hpp ?? 0).toLocaleString()}</strong> / {product.baseUnit}
                </p>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Nilai HPP / WAC Baru (Rp) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={newAdjustmentHpp}
                  onChange={(e) => setNewAdjustmentHpp(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-sm text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Alasan Koreksi *
                </label>
                <select
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Koreksi Faktur Supplier">Koreksi Faktur Supplier</option>
                  <option value="Penyesuaian Harga Pasar">Penyesuaian Harga Pasar</option>
                  <option value="Salah Input Saldo Awal">Salah Input Saldo Awal</option>
                  <option value="Rekonsiliasi Audit Akuntansi">Rekonsiliasi Audit Akuntansi</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Catatan Audit Trail
                </label>
                <textarea
                  rows={2}
                  value={adjustmentNotes}
                  onChange={(e) => setAdjustmentNotes(e.target.value)}
                  placeholder="Detail referensi faktur atau alasan penyesuaian..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCostModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs uppercase rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdjustment}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase rounded-xl shadow-md shadow-blue-200 disabled:opacity-50"
                >
                  {isSubmittingAdjustment ? 'Menyimpan...' : 'Simpan & Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WAC Source Traceability Modal */}
      {isTraceModalOpen && product && (
        <div className="fixed inset-0 z-[200] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div>
                <h4 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                  Jejak Historis WAC (Cost Traceability)
                </h4>
                <p className="text-xs text-slate-500 font-bold">{product.name}</p>
              </div>
              <button type="button" onClick={() => setIsTraceModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
              {isLoadingTrace ? (
                <div className="py-12 text-center text-xs font-bold text-slate-400">Memuat riwayat biaya...</div>
              ) : traceEvents.length === 0 ? (
                <div className="py-12 text-center text-xs font-bold text-slate-400">Belum ada riwayat perubahan WAC.</div>
              ) : (
                traceEvents.map((ev) => (
                  <div key={ev.eventId} className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-black text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 uppercase">
                        {ev.eventType}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(ev.timestamp).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <p className="font-bold text-slate-800">{ev.notes}</p>
                    <div className="flex flex-wrap justify-between items-center pt-1 text-[11px] text-slate-600 border-t border-slate-200/60">
                      <span>Qty: <strong>{ev.qty ?? 0}</strong></span>
                      <span>Harga Satuan: <strong>Rp {(ev.unitCost ?? 0).toLocaleString()}</strong></span>
                      <span className="text-blue-700 font-black">WAC Hasil: Rp {(ev.wacResult ?? 0).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 mt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsTraceModalOpen(false)}
                className="w-full py-2.5 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Barcode Scanner for Product Form */}
      <CameraBarcodeScanner
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScan={(code) => {
          setFormData(prev => ({ ...prev, barcode: code }));
        }}
        title="Scan Barcode Produk"
        subtitle="Arahkan kamera ke kemasan produk"
      />
    </div>
  );
}

