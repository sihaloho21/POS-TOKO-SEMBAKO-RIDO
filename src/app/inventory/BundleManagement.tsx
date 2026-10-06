import React, { useState, useEffect } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Layers, 
  Search, 
  Plus, 
  Trash2, 
  Edit3,
  Package, 
  ArrowRight,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Percent,
  Boxes,
  ShieldAlert,
  Eye,
  CornerDownRight
} from 'lucide-react';
import type { Bundle, BundleComponent, Product } from '@/core/types';
import { useAuthStore } from '@/core/auth-store';
import { BundleService, type FlattenedBundleComponent } from '@/core/services/bundle-service';

export default function BundleManagement() {
  const { currentUser } = useAuthStore();
  const isOwner = currentUser?.role === 'OWNER';

  const [search, setSearch] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);

  // Form State
  const [bundleName, setBundleName] = useState('');
  const [bundlePrice, setBundlePrice] = useState<number>(0);
  const [bundleBarcode, setBundleBarcode] = useState('');
  const [bundleStatus, setBundleStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [components, setComponents] = useState<BundleComponent[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [candidateQty, setCandidateQty] = useState<number>(1);
  const [candidateUnit, setCandidateUnit] = useState<string>('PCS');

  // Error & Status feedback
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successToast, setSuccessToast] = useState('');

  // Selected bundle for detailed view modal (Kasir or Owner)
  const [viewingBundle, setViewingBundle] = useState<Bundle | null>(null);
  const [viewingBreakdown, setViewingBreakdown] = useState<FlattenedBundleComponent[]>([]);

  // Queries
  const rawBundles = useLiveQuery(() => db.bundles.toArray()) || [];
  const allProducts = useLiveQuery(() => db.products.toArray()) || [];
  const productCosts = useLiveQuery(() => db.productCosts.toArray()) || [];

  const costMap = new Map(productCosts.map(c => [c.productId, c.hpp]));

  // Filtered bundles
  const filteredBundles = rawBundles.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    (b.status && b.status.toLowerCase().includes(search.toLowerCase()))
  );

  // Available candidate items for components:
  // 1) Physical products (productType !== 'BUNDLE')
  // 2) Other bundles (productType === 'BUNDLE' or in db.bundles, except currently editing bundle)
  const candidatePhysicalProducts = allProducts.filter(p => p.productType !== 'BUNDLE');
  const candidateBundles = rawBundles.filter(b => b.bundleId !== editingBundleId);

  // Open editor for Create
  const handleOpenCreate = () => {
    setEditingBundleId(null);
    setBundleName('');
    setBundlePrice(0);
    setBundleBarcode(`BNDL-${Date.now().toString().slice(-6)}`);
    setBundleStatus('ACTIVE');
    setComponents([]);
    setFormError('');
    setIsEditorOpen(true);
  };

  // Open editor for Edit
  const handleOpenEdit = (bundle: Bundle) => {
    setEditingBundleId(bundle.bundleId);
    setBundleName(bundle.name);
    setBundlePrice(bundle.price);
    const existingProduct = allProducts.find(p => p.productId === bundle.bundleId);
    setBundleBarcode(existingProduct?.barcode || `BNDL-${Date.now().toString().slice(-6)}`);
    setBundleStatus(bundle.status || 'ACTIVE');
    setComponents(bundle.components || []);
    setFormError('');
    setIsEditorOpen(true);
  };

  // Add Component with Circular Reference and Inactivity Check
  const handleAddComponent = async () => {
    setFormError('');
    if (!selectedCandidateId) {
      setFormError('Pilih produk atau sub-paket terlebih dahulu.');
      return;
    }

    if (candidateQty <= 0) {
      setFormError('Jumlah komponen harus lebih dari 0.');
      return;
    }

    // Check if already in components list
    const alreadyExists = components.some(c => 
      (c.componentProductId || c.productId) === selectedCandidateId
    );
    if (alreadyExists) {
      setFormError('Komponen ini sudah ada di dalam paket.');
      return;
    }

    // Check if candidate is a bundle and check circular reference
    const isCandidateBundle = candidateBundles.some(b => b.bundleId === selectedCandidateId);
    if (isCandidateBundle && editingBundleId) {
      const isCircular = await BundleService.hasCircularReference(editingBundleId, selectedCandidateId);
      if (isCircular) {
        setFormError('Peringatan: Sub-paket ini menyebabkan circular reference (referensi melingkar) dan tidak boleh ditambahkan!');
        return;
      }
    }

    // Inactive component check
    const candidateProduct = allProducts.find(p => p.productId === selectedCandidateId);
    const candidateBundle = rawBundles.find(b => b.bundleId === selectedCandidateId);
    const isInactive = candidateProduct?.status === 'INACTIVE' || candidateBundle?.status === 'INACTIVE';
    if (isInactive) {
      setFormError('Perhatian: Produk/paket ini berstatus NONAKTIF. Komponen nonaktif tidak boleh digunakan untuk paket baru.');
      return;
    }

    const compName = candidateBundle?.name || candidateProduct?.name || 'Komponen';
    const compUnit = candidateUnit || candidateProduct?.baseUnit || 'PCS';

    setComponents([
      ...components,
      {
        componentProductId: selectedCandidateId,
        productId: selectedCandidateId,
        qtyPerBundle: candidateQty,
        qty: candidateQty,
        unit: compUnit,
        isNestedBundle: isCandidateBundle,
        nestedBundleId: isCandidateBundle ? selectedCandidateId : undefined,
        nameSnapshot: compName
      }
    ]);

    setSelectedCandidateId('');
    setCandidateQty(1);
  };

  // Remove Component
  const handleRemoveComponent = (id: string) => {
    setComponents(components.filter(c => (c.componentProductId || c.productId) !== id));
  };

  // Update Component Qty
  const handleUpdateQty = (id: string, qty: number) => {
    if (qty <= 0) return;
    setComponents(components.map(c => {
      const cId = c.componentProductId || c.productId;
      if (cId === id) {
        return { ...c, qtyPerBundle: qty, qty };
      }
      return c;
    }));
  };

  // Calculate live HPP breakdown for the current form state
  const liveComponentBreakdown = components.map(comp => {
    const compId = comp.componentProductId || comp.productId || '';
    const product = allProducts.find(p => p.productId === compId);
    const subBundle = rawBundles.find(b => b.bundleId === compId);
    const isNested = !!subBundle;
    const name = subBundle?.name || product?.name || comp.nameSnapshot || 'Komponen';
    const status = subBundle ? subBundle.status : (product?.status || 'ACTIVE');
    const wac = isNested ? (subBundle.calculatedHpp || subBundle.price * 0.9) : (costMap.get(compId) ?? product?.hpp ?? 0);
    const qty = comp.qtyPerBundle || comp.qty || 1;
    const subtotalHpp = Number((qty * wac).toFixed(2));

    return {
      compId,
      name,
      isNested,
      qty,
      unit: comp.unit || product?.baseUnit || 'PAKET',
      wac,
      subtotalHpp,
      status
    };
  });

  const totalCalculatedHpp = liveComponentBreakdown.reduce((sum, item) => sum + item.subtotalHpp, 0);
  const profitMarginRp = bundlePrice - totalCalculatedHpp;
  const profitMarginPercent = bundlePrice > 0 ? ((profitMarginRp / bundlePrice) * 100) : 0;
  const hasInactiveComponents = liveComponentBreakdown.some(c => c.status === 'INACTIVE');

  // Save Bundle (Owner only)
  const handleSaveBundle = async () => {
    if (!isOwner) return;
    if (!bundleName.trim()) {
      setFormError('Nama paket wajib diisi.');
      return;
    }
    if (components.length === 0) {
      setFormError('Paket harus memiliki minimal 1 komponen.');
      return;
    }
    if (bundlePrice <= 0) {
      setFormError('Harga jual paket harus lebih dari Rp 0.');
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      await BundleService.saveBundle({
        bundleId: editingBundleId || undefined,
        name: bundleName.trim(),
        barcode: bundleBarcode.trim(),
        price: bundlePrice,
        components,
        status: bundleStatus,
        userId: currentUser?.userId,
        role: currentUser?.role,
        deviceId: 'device-1'
      });

      setSuccessToast(`Paket '${bundleName}' berhasil disimpan!`);
      setTimeout(() => setSuccessToast(''), 4000);
      setIsEditorOpen(false);
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'Gagal menyimpan paket bundle.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Bundle (Owner only)
  const handleDeleteBundle = async (bundle: Bundle) => {
    if (!isOwner) return;
    if (!confirm(`Hapus paket '${bundle.name}'? Produk paket akan dinonaktifkan.`)) return;

    try {
      await BundleService.deleteBundle({
        bundleId: bundle.bundleId,
        userId: currentUser?.userId,
        role: currentUser?.role,
        deviceId: 'device-1'
      });
      setSuccessToast(`Paket '${bundle.name}' berhasil dihapus.`);
      setTimeout(() => setSuccessToast(''), 4000);
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus paket.');
    }
  };

  // Open Detailed Bundle Viewer Modal
  const handleOpenView = async (bundle: Bundle) => {
    setViewingBundle(bundle);
    try {
      const breakdown = await BundleService.flattenComponents(bundle.bundleId, 1);
      setViewingBreakdown(breakdown);
    } catch (err) {
      console.error(err);
      setViewingBreakdown([]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
              {isOwner ? 'Manajemen Paket & Bundling (PRD 12)' : 'Katalog Paket Sembako'}
            </h2>
            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
              isOwner ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {isOwner ? 'Owner Mode (HPP & Margin Active)' : 'Kasir Mode (View Only)'}
            </span>
          </div>
          <p className="text-slate-500 text-sm font-medium">
            {isOwner 
              ? 'Konfigurasi paket sembako, nested bundle, kalkulasi HPP otomatis dari WAC, dan pencegahan circular reference.' 
              : 'Daftar paket sembako aktif beserta rincian komponen untuk informasi pelanggan.'}
          </p>
        </div>

        {isOwner && (
          <button 
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-200"
          >
            <Plus size={18} />
            Buat Paket Baru
          </button>
        )}
      </div>

      {/* Success Notification */}
      {successToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-2 font-bold text-xs animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm max-w-md">
        <Search size={18} className="text-slate-400 shrink-0" />
        <input 
          type="text"
          placeholder="Cari nama paket sembako..."
          value={search ?? ''}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-xs font-bold text-slate-800 outline-none placeholder:text-slate-400"
        />
      </div>

      {/* Bundle Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredBundles.map(bundle => {
          const isInactive = bundle.status === 'INACTIVE';
          const calculatedHpp = bundle.calculatedHpp || 0;
          const grossProfit = bundle.price - calculatedHpp;
          const marginPct = bundle.price > 0 ? ((grossProfit / bundle.price) * 100) : 0;

          return (
            <div 
              key={bundle.bundleId} 
              className={`bg-white p-6 rounded-3xl border transition-all relative flex flex-col justify-between group ${
                isInactive ? 'border-slate-200 bg-slate-50/50 opacity-80' : 'border-slate-200 shadow-sm hover:shadow-md'
              }`}
            >
              <div>
                {/* Top Card Info */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                      isInactive ? 'bg-slate-200 text-slate-500' : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      <Layers size={22} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 uppercase tracking-tight text-sm line-clamp-1">{bundle.name}</h3>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isInactive ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {bundle.status || 'ACTIVE'}
                      </span>
                    </div>
                  </div>

                  {/* Actions for Owner */}
                  {isOwner && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleOpenEdit(bundle)}
                        title="Edit Paket"
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button 
                        onClick={() => handleDeleteBundle(bundle)}
                        title="Hapus Paket"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Price & HPP (Owner vs Kasir) */}
                <div className="p-3 bg-slate-50 rounded-2xl mb-4 border border-slate-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Harga Jual Paket</span>
                    <span className="text-base font-black text-blue-600 tabular-nums">
                      Rp {bundle.price.toLocaleString()}
                    </span>
                  </div>

                  {/* Owner-only HPP breakdown preview */}
                  {isOwner ? (
                    <div className="pt-2 border-t border-slate-200/80 mt-2 space-y-1 text-[11px]">
                      <div className="flex justify-between text-slate-500">
                        <span>HPP Derived (WAC):</span>
                        <span className="font-bold text-slate-800 tabular-nums">Rp {calculatedHpp.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Laba Kotor:</span>
                        <span className={`font-black tabular-nums ${grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          Rp {grossProfit.toLocaleString()} ({marginPct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 font-medium italic mt-1">
                      Paket sembako siap jual di POS kasir
                    </p>
                  )}
                </div>

                {/* Component List */}
                <div className="space-y-1.5 mb-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Isi Paket ({bundle.components.length} Item):
                  </p>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {bundle.components.map((comp, idx) => {
                      const compId = comp.componentProductId || comp.productId;
                      const product = allProducts.find(p => p.productId === compId);
                      const subBundle = rawBundles.find(b => b.bundleId === compId);
                      const isNested = !!subBundle;
                      const name = subBundle?.name || product?.name || comp.nameSnapshot || 'Komponen';
                      const unit = comp.unit || product?.baseUnit || 'PCS';
                      const qty = comp.qtyPerBundle || comp.qty || 1;
                      const isCompInactive = (subBundle ? subBundle.status : product?.status) === 'INACTIVE';

                      return (
                        <div 
                          key={idx} 
                          className="flex items-center justify-between text-xs font-bold text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100"
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            {isNested ? (
                              <span title="Nested Sub-Paket" className="shrink-0 flex items-center">
                                <Boxes size={13} className="text-purple-500" />
                              </span>
                            ) : (
                              <ArrowRight size={13} className="text-slate-400 shrink-0" />
                            )}
                            <span className="truncate">{name}</span>
                            {isCompInactive && (
                              <span className="text-[9px] bg-rose-100 text-rose-700 px-1 rounded uppercase font-black">
                                Nonaktif
                              </span>
                            )}
                          </div>
                          <span className="text-blue-600 shrink-0 font-black tabular-nums">
                            {qty} {unit}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* View Breakdown Button */}
              <button
                onClick={() => handleOpenView(bundle)}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
              >
                <Eye size={14} />
                <span>{isOwner ? 'Lihat Breakdown HPP Komponen' : 'Lihat Rincian Paket'}</span>
              </button>
            </div>
          );
        })}

        {filteredBundles.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
            <Layers size={40} className="mx-auto mb-2 text-slate-300" />
            <p className="font-bold text-sm uppercase tracking-wide">Belum ada paket sembako</p>
            <p className="text-xs text-slate-400 mt-1">
              {isOwner ? 'Klik tombol "Buat Paket Baru" untuk membuat bundling produk.' : 'Belum ada paket sembako yang terdaftar.'}
            </p>
          </div>
        )}
      </div>

      {/* Editor Modal (Create / Edit - Owner only) */}
      {isEditorOpen && isOwner && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-5">
              <div>
                <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">
                  {editingBundleId ? 'Edit Konfigurasi Paket' : 'Buat Paket Sembako Baru'}
                </h3>
                <span className="text-xs text-slate-500 font-medium">
                  Aturan: Bundle HPP derived murni dari WAC komponen saat transaksi.
                </span>
              </div>
              <button 
                onClick={() => setIsEditorOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                ✕
              </button>
            </div>

            {/* Error Message */}
            {formError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-start gap-2.5 text-xs font-bold mb-4">
                <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Inactive Component Warning */}
            {hasInactiveComponents && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl flex items-start gap-2.5 text-xs mb-4">
                <ShieldAlert size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black block uppercase text-[10px]">Peringatan Komponen Nonaktif</span>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Salah satu komponen berstatus <strong>NONAKTIF</strong>. Sesuai aturan PRD 12, transaksi baru tidak dapat dibuat jika komponen tidak aktif.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* Name & Barcode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Nama Paket Sembako *
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Paket Sembako Berkah Ramadhan"
                    value={bundleName ?? ''}
                    onChange={(e) => setBundleName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Status Paket
                  </label>
                  <select
                    value={bundleStatus ?? 'ACTIVE'}
                    onChange={(e) => setBundleStatus(e.target.value as any)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
                  >
                    <option value="ACTIVE">ACTIVE (Dapat Dijual)</option>
                    <option value="INACTIVE">INACTIVE (Nonaktif / Ditutup)</option>
                  </select>
                </div>
              </div>

              {/* Price & Estimated HPP Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Harga Jual Paket (Rp) *
                  </label>
                  <input
                    type="number"
                    value={bundlePrice ?? 0}
                    onChange={(e) => setBundlePrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black text-blue-600 outline-none focus:border-blue-500 tabular-nums"
                  />
                </div>

                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Total HPP (Derived WAC)
                  </span>
                  <div className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 tabular-nums">
                    Rp {totalCalculatedHpp.toLocaleString()}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Estimasi Margin
                  </span>
                  <div className={`px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black tabular-nums ${
                    profitMarginRp >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    Rp {profitMarginRp.toLocaleString()} ({profitMarginPercent.toFixed(1)}%)
                  </div>
                </div>
              </div>

              {/* Explanatory Rule Note */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl text-[11px] text-blue-900 flex items-start gap-2">
                <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Aturan Inventaris PRD 12:</strong> Bundle tidak memiliki physical stock mandiri. HPP bundle dihitung murni: <code>HPP = SUM(componentQty × componentWACAtFinalization)</code>. Harga jual tidak menentukan HPP dan diskon tidak mengubah WAC.
                </p>
              </div>

              {/* Component Builder */}
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Daftar Komponen Paket ({components.length})
                </label>

                {/* Selected Components Table */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Komponen</th>
                        <th className="py-2.5 px-3 text-center">Qty / Bundle</th>
                        <th className="py-2.5 px-3 text-right">WAC Satuan</th>
                        <th className="py-2.5 px-3 text-right">Subtotal HPP</th>
                        <th className="py-2.5 px-2 text-center w-10">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {liveComponentBreakdown.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-bold text-slate-800">
                            <div className="flex items-center gap-1.5">
                              {item.isNested ? (
                                <span className="bg-purple-100 text-purple-700 text-[9px] font-black px-1.5 py-0.5 rounded">
                                  SUB-PAKET
                                </span>
                              ) : (
                                <span className="bg-slate-100 text-slate-600 text-[9px] font-black px-1.5 py-0.5 rounded">
                                  PRODUK
                                </span>
                              )}
                              <span>{item.name}</span>
                              {item.status === 'INACTIVE' && (
                                <span className="text-[9px] bg-rose-100 text-rose-700 font-bold px-1 rounded">
                                  NONAKTIF
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={item.qty ?? 0}
                                onChange={(e) => handleUpdateQty(item.compId, Number(e.target.value))}
                                className="w-16 px-1.5 py-1 text-center font-bold bg-slate-50 border border-slate-200 rounded-lg text-xs"
                              />
                              <span className="text-[10px] text-slate-400 font-bold">{item.unit}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-600 tabular-nums">
                            Rp {item.wac.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-slate-900 tabular-nums">
                            Rp {item.subtotalHpp.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <button
                              onClick={() => handleRemoveComponent(item.compId)}
                              className="p-1 text-slate-300 hover:text-rose-600 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {components.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                            Belum ada komponen yang ditambahkan. Pilih komponen di bawah ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add Component Form */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                    + Tambahkan Komponen (Produk Fisik atau Sub-Paket Lain)
                  </span>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={selectedCandidateId ?? ''}
                      onChange={(e) => {
                        setSelectedCandidateId(e.target.value);
                        const prod = allProducts.find(p => p.productId === e.target.value);
                        if (prod) setCandidateUnit(prod.baseUnit || 'PCS');
                      }}
                      className="flex-1 p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value="">-- Pilih Produk atau Sub-Paket --</option>
                      
                      <optgroup label="📦 Produk Fisik">
                        {candidatePhysicalProducts.map(p => (
                          <option key={p.productId} value={p.productId}>
                            {p.name} {p.status === 'INACTIVE' ? '(NONAKTIF)' : ''} (WAC: Rp {(costMap.get(p.productId) ?? p.hpp).toLocaleString()})
                          </option>
                        ))}
                      </optgroup>

                      {candidateBundles.length > 0 && (
                        <optgroup label="🗂️ Sub-Paket (Nested Bundle)">
                          {candidateBundles.map(b => (
                            <option key={b.bundleId} value={b.bundleId}>
                              [Paket] {b.name} (HPP: Rp {(b.calculatedHpp || b.price * 0.9).toLocaleString()})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0.1"
                        step="any"
                        placeholder="Qty"
                        value={candidateQty ?? 1}
                        onChange={(e) => setCandidateQty(Number(e.target.value))}
                        className="w-20 p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-center outline-none focus:border-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Satuan"
                        value={candidateUnit ?? 'PCS'}
                        onChange={(e) => setCandidateUnit(e.target.value)}
                        className="w-20 p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-center outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddComponent}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                      >
                        Tambah
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Historical Safety Notice */}
              <p className="text-[10px] text-slate-400 italic">
                * Perubahan komposisi paket tidak akan mengubah data struk atau riwayat transaksi lama karena transaksi menyimpan snapshot komponen secara permanen.
              </p>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="flex-1 py-3 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-100 rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveBundle}
                  disabled={isSaving}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan Konfigurasi Paket'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Breakdown Viewer Modal (Kasir vs Owner View) */}
      {viewingBundle && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">
                  {isOwner ? 'Breakdown HPP Komponen Paket' : 'Rincian Isi Paket Sembako'}
                </h3>
                <span className="text-xs text-blue-600 font-bold">{viewingBundle.name}</span>
              </div>
              <button 
                onClick={() => setViewingBundle(null)} 
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl mb-4 text-xs space-y-1.5 border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Harga Jual:</span>
                <span className="font-black text-blue-600 tabular-nums text-sm">Rp {viewingBundle.price.toLocaleString()}</span>
              </div>
              {isOwner && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Total Derived HPP:</span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      Rp {(viewingBundle.calculatedHpp || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Estimasi Margin Kotor:</span>
                    <span className="font-black text-emerald-600 tabular-nums">
                      Rp {(viewingBundle.price - (viewingBundle.calculatedHpp || 0)).toLocaleString()}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2 mb-6">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Komponen Fisik Terurai (Leaf Components):
              </p>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {viewingBreakdown.map((comp, idx) => (
                  <div key={idx} className="p-2.5 bg-white rounded-xl border border-slate-200 text-xs shadow-sm">
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900">{comp.name}</span>
                        {comp.isFromNestedBundle && (
                          <span className="text-[9px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded font-black">
                            via {comp.parentBundleName}
                          </span>
                        )}
                      </div>
                      <span className="font-black text-blue-600 tabular-nums">
                        {comp.totalQty} {comp.unit}
                      </span>
                    </div>

                    {isOwner && (
                      <div className="flex justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                        <span>WAC: Rp {comp.wac.toLocaleString()}</span>
                        <span className="font-bold text-slate-700">Subtotal HPP: Rp {comp.subtotalHpp.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setViewingBundle(null)}
              className="w-full py-3 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-all"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
