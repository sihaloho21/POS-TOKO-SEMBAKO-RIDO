import React, { useState } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { InventoryPredictionService, type InventoryPrediction } from '@/core/services/inventory-prediction-service';
import { 
  Package, 
  Search, 
  Plus, 
  Edit, 
  Trash2,
  AlertCircle,
  Weight,
  Tags,
  Download,
  Upload,
  History,
  Filter,
  QrCode,
  Barcode,
  TrendingUp,
  Calendar,
  RefreshCw,
  Flame,
  Scale,
  Camera,
  X,
  Layers
} from 'lucide-react';
import { CameraBarcodeScanner } from '@/components/CameraBarcodeScanner';
import { useToastStore } from '@/core/toast-store';
import type { Product, ProductCost } from '@/core/types';
import { ProductService } from '@/core/services/product-service';
import { formatMultiUnitBreakdown } from '@/core/utils/unit-helper';
import { VisualUnitConversionHelper } from './VisualUnitConversionHelper';
import { ProductModal } from './ProductModal';
import { StockHistory } from './StockHistory';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { InventoryHeatmap } from './InventoryHeatmap';
import { ShelfTalkerModule } from './ShelfTalkerModule';
import { useAuthStore } from '@/core/auth-store';

import { QRLabelModal } from './QRLabelModal';
import { BulkBarcodeModal } from './BulkBarcodeModal';
import { ImportModal } from './ImportModal';
import { format } from 'date-fns';

export default function Inventory() {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const isOwner = currentUser?.role === 'OWNER';

  const [currentTab, setCurrentTab] = useState<'MASTER' | 'PREDICTIONS' | 'HEATMAP' | 'SHELF_TALKERS'>('MASTER');
  const [search, setSearch] = useState('');
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  
  const predictions = useLiveQuery(() => InventoryPredictionService.getPredictions(), []);
  const costs = useLiveQuery(() => isOwner ? db.productCosts.toArray() : Promise.resolve([] as ProductCost[]), [isOwner]);

  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkBarcodeOpen, setIsBulkBarcodeOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkPriceOpen, setIsBulkPriceOpen] = useState(false);
  const [bulkAdjustment, setBulkAdjustment] = useState({ percentage: 5, type: 'INCREASE' as 'INCREASE' | 'DECREASE' });
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);
  const [viewingQRProduct, setViewingQRProduct] = useState<Product | null>(null);
  const [viewingConversionProduct, setViewingConversionProduct] = useState<Product | null>(null);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [adjustmentProductId, setAdjustmentProductId] = useState<string | undefined>(undefined);
  
  const products = useLiveQuery(
    () => {
      let collection = db.products.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) || 
        p.barcode.includes(search) || 
        !!(p.sku && p.sku.includes(search)) ||
        Boolean(p.conversionRules && p.conversionRules.some(r => r.barcode && r.barcode.includes(search)))
      );

      if (filterType !== 'ALL') {
        collection = collection.filter(p => p.productType === filterType);
      }

      if (filterStatus !== 'ALL') {
        collection = collection.filter(p => p.status === filterStatus);
      }

      return collection.toArray();
    },
    [search, filterType, filterStatus]
  );

  // Real-time Inventory Summary Statistics (Owner Only)
  const stats = React.useMemo(() => {
    if (!products) return { totalModal: 0, totalSkus: 0, totalUnits: 0, lowStockPercent: 0 };
    
    const totalSkus = products.length;
    let totalModal = 0;
    let totalUnits = 0;
    let lowStockCount = 0;

    products.forEach(p => {
      totalUnits += (p.stock || 0);
      if ((p.stock || 0) < (p.minimumStock || 0)) {
        lowStockCount++;
      }
      
      if (isOwner) {
        const productCost = costs?.find(c => c.productId === p.productId)?.hpp ?? p.hpp ?? 0;
        totalModal += (p.stock || 0) * productCost;
      }
    });

    const lowStockPercent = totalSkus > 0 ? (lowStockCount / totalSkus) * 100 : 0;

    return { totalModal, totalSkus, totalUnits, lowStockPercent };
  }, [products, costs, isOwner]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCameraScan = (scannedCode: string) => {
    if (!products) return;
    const match = products.find(p => 
      p.barcode === scannedCode || 
      (p.sku && p.sku === scannedCode) ||
      (p.conversionRules && p.conversionRules.some(r => r.barcode === scannedCode))
    );
    if (match) {
      setSearch(match.barcode || match.name);
      addToast(`Produk "${match.name}" ditemukan!`, 'success');
      setEditingProduct(match);
      setIsModalOpen(true);
    } else {
      setSearch(scannedCode);
      addToast(`Barcode "${scannedCode}" tidak ditemukan di inventaris.`, 'warning');
    }
  };

  const toggleSelectAll = () => {
    if (!products) return;
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map(p => p.productId));
    }
  };

  const handleBulkPriceAdjust = async () => {
    if (selectedIds.length === 0) return;
    try {
      await ProductService.bulkAdjustPrice(selectedIds, bulkAdjustment.percentage, bulkAdjustment.type);
      setIsBulkPriceOpen(false);
      setSelectedIds([]);
      addToast(`Berhasil menyesuaikan harga untuk ${selectedIds.length} produk.`, 'success');
    } catch (error) {
      console.error('Bulk adjustment failed:', error);
      addToast('Gagal melakukan penyesuaian harga massal.', 'error');
    }
  };

  const handleExport = async () => {
    try {
      await ProductService.exportToCSV();
      addToast('Berhasil mengekspor data produk ke CSV.', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      addToast('Gagal mengekspor data.', 'error');
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditingProduct(undefined);
    setIsModalOpen(true);
  };

  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  const handleDelete = async (productId: string) => {
    setDeletingProductId(productId);
  };

  const confirmDelete = async () => {
    if (!deletingProductId) return;
    try {
      await ProductService.deleteProduct(deletingProductId);
      addToast('Produk berhasil dihapus.', 'success');
    } catch (err: any) {
      addToast('Gagal menghapus produk: ' + err.message, 'error');
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleToggleStatus = async (productId: string) => {
    await ProductService.toggleStatus(productId);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Inventory Management</h2>
          <p className="text-slate-500 text-sm font-medium">Kelola master data, stok, dan konversi unit.</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <button 
              onClick={() => setIsBulkPriceOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-amber-600 transition-all shadow-lg shadow-amber-200"
            >
              <Filter size={18} />
              Penyesuaian Harga ({selectedIds.length})
            </button>
          )}
          <button 
            onClick={() => {
              setAdjustmentProductId(undefined);
              setIsAdjustmentOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-100 transition-all shadow-xs"
            title="Catat pergerakan stok manual (Rusak, Hilang, Kadaluarsa, dll)"
          >
            <Scale size={16} />
            Penyesuaian Stok
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button 
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
          >
            <Upload size={18} />
            Import CSV
          </button>
          <button 
            onClick={() => setIsBulkBarcodeOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
          >
            <Barcode size={18} />
            Bulk Barcodes
          </button>
          <button 
            onClick={handleAdd}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-200"
          >
            <Plus size={18} />
            Tambah Produk
          </button>
        </div>
      </div>

      {/* Inventory Summary Cards (Owner Only) */}
      {isOwner && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-blue-500 transition-all group">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Scale size={14} className="text-blue-500" /> 
              Total Modal (WAC)
            </span>
            <div>
              <span className="text-2xl font-black text-slate-900 tabular-nums">
                Rp {stats.totalModal.toLocaleString()}
              </span>
              <p className="text-[10px] text-slate-400 font-medium mt-1 italic">* Stok Terkini × Harga Beli</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-indigo-500 transition-all">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Package size={14} className="text-indigo-500" /> 
              Varian Produk
            </span>
            <div>
              <span className="text-2xl font-black text-slate-900 tabular-nums">
                {stats.totalSkus.toLocaleString()}
              </span>
              <p className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-tight">Total SKU Terdaftar</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-emerald-500 transition-all">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Layers size={14} className="text-emerald-500" /> 
              Volume Unit Fisik
            </span>
            <div>
              <span className="text-2xl font-black text-slate-900 tabular-nums">
                {stats.totalUnits.toLocaleString()}
              </span>
              <p className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-tight">Akumulasi Seluruh Stok</p>
            </div>
          </div>

          <div className={`p-5 rounded-3xl border shadow-sm flex flex-col justify-between transition-all ${
            stats.lowStockPercent > 20 
              ? 'bg-rose-50 border-rose-200' 
              : stats.lowStockPercent > 0 
                ? 'bg-amber-50 border-amber-200' 
                : 'bg-white border-slate-200'
          }`}>
            <span className={`text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 ${
              stats.lowStockPercent > 0 ? 'text-rose-600' : 'text-slate-400'
            }`}>
              <AlertCircle size={14} className={stats.lowStockPercent > 0 ? 'animate-pulse' : ''} /> 
              Alert Restock
            </span>
            <div>
              <span className={`text-2xl font-black tabular-nums ${
                stats.lowStockPercent > 20 
                  ? 'text-rose-700' 
                  : stats.lowStockPercent > 0 
                    ? 'text-amber-700' 
                    : 'text-slate-900'
              }`}>
                {stats.lowStockPercent.toFixed(1)}%
              </span>
              <p className={`text-[10px] font-medium mt-1 ${
                stats.lowStockPercent > 0 ? 'text-rose-600' : 'text-slate-400'
              }`}>
                Di bawah limit minimal
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-4 border-b border-slate-200">
        <button 
          onClick={() => setCurrentTab('MASTER')}
          className={`pb-4 px-2 font-black text-xs uppercase tracking-widest transition-all relative ${
            currentTab === 'MASTER' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Master Inventory
          {currentTab === 'MASTER' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />}
        </button>
        <button 
          onClick={() => setCurrentTab('PREDICTIONS')}
          className={`pb-4 px-2 font-black text-xs uppercase tracking-widest transition-all relative ${
            currentTab === 'PREDICTIONS' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Predictive Analytics
          {currentTab === 'PREDICTIONS' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />}
        </button>
        <button 
          onClick={() => setCurrentTab('HEATMAP')}
          className={`pb-4 px-2 font-black text-xs uppercase tracking-widest transition-all relative ${
            currentTab === 'HEATMAP' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Movement Heatmap
          {currentTab === 'HEATMAP' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />}
        </button>
        <button 
          onClick={() => setCurrentTab('SHELF_TALKERS')}
          className={`pb-4 px-2 font-black text-xs uppercase tracking-widest transition-all relative ${
            currentTab === 'SHELF_TALKERS' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Shelf Talkers
          {currentTab === 'SHELF_TALKERS' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />}
        </button>
      </div>

      {currentTab === 'MASTER' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center gap-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Cari SKU, Barcode, atau Nama Produk..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-sm"
                value={search ?? ''}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {/* Camera Barcode Scanner Button for Lookup */}
            <button
              type="button"
              onClick={() => setIsCameraScannerOpen(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-blue-200 transition-all shrink-0 cursor-pointer w-full sm:w-auto"
              title="Scan Barcode Kamera untuk Lookup Produk"
            >
              <Camera size={16} />
              <span>Scan Kamera</span>
            </button>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm overflow-hidden shrink-0">
                {['ALL', 'ACTIVE', 'INACTIVE'].map(status => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                      filterStatus === status ? 'bg-slate-900 text-white shadow-lg' : 'bg-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
              <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm overflow-hidden shrink-0">
                {['ALL', 'SEMBAKO', 'FISH', 'BUNDLE'].map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                      filterType === type ? 'bg-blue-600 text-white shadow-lg' : 'bg-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black">
                  <th className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={Boolean(products && products.length > 0 && selectedIds.length === products.length)}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-2 py-4">Produk / SKU</th>
                  <th className="px-6 py-4">Tipe</th>
                  <th className="px-6 py-4">Harga Jual</th>
                  <th className="px-6 py-4">Stok (Base)</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products?.map((product) => (
                  <React.Fragment key={product.productId}>
                    <tr className={`hover:bg-slate-50/50 transition-colors group ${selectedIds.includes(product.productId) ? 'bg-blue-50/30' : ''} ${viewingHistoryId === product.productId ? 'bg-slate-50' : ''}`}>
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={selectedIds.includes(product.productId)}
                          onChange={() => toggleSelect(product.productId)}
                        />
                      </td>
                      <td className="px-2 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 shadow-sm">
                            {product.productType === 'FISH' ? <Weight size={20} /> : <Package size={20} />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 uppercase tracking-tight">{product.name}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-[10px] text-slate-400 font-black tracking-widest uppercase">{product.sku || product.barcode}</p>
                              {product.tags && product.tags.length > 0 && (
                                <div className="flex gap-1">
                                  {product.tags.map(tag => (
                                    <span key={tag} className="text-[8px] font-black text-blue-600 bg-blue-50 px-1 py-0.5 rounded border border-blue-100 uppercase tracking-widest">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[10px] font-black px-2 py-1 bg-blue-50 text-blue-600 rounded-md uppercase tracking-widest">
                          {product.productType}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-slate-900 tabular-nums">
                          Rp {(product.normalPrice ?? 0).toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2">
                          {isOwner && (
                            <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">
                              WAC: Rp {(costs?.find(c => c.productId === product.productId)?.hpp ?? product.hpp ?? 0).toLocaleString()}
                            </p>
                          )}
                          {isOwner && product.priceAlertThreshold && (
                            <div className="flex items-center gap-1 text-[8px] font-black text-rose-500 bg-rose-50 px-1 py-0.5 rounded border border-rose-100" title={`Threshold: ${product.priceAlertThreshold}%`}>
                              <AlertCircle size={10} />
                              {product.priceAlertThreshold}% ALERT
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-black tabular-nums ${(product.stock ?? 0) < (product.minimumStock ?? 0) ? 'text-red-500' : 'text-slate-900'}`}>
                              {(product.stock ?? 0).toLocaleString()}
                            </span>
                            <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{product.baseUnit}</span>
                            {(product.stock ?? 0) < (product.minimumStock ?? 0) && <AlertCircle size={14} className="text-red-500 animate-pulse" />}
                          </div>
                          {product.conversionRules && product.conversionRules.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setViewingConversionProduct(product)}
                              className="text-[9px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 border border-indigo-100 px-2 py-0.5 rounded-md mt-1 w-fit shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer text-left group/pill"
                              title="Klik untuk melihat visual rantai konversi satuan (misal: 1 Slop = 10 Bungkus = 200 Batang)"
                            >
                              <span>📦 {formatMultiUnitBreakdown(product.stock ?? 0, product.baseUnit, product.conversionRules)}</span>
                              <Layers size={10} className="text-indigo-400 group-hover/pill:text-indigo-700 shrink-0" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => handleToggleStatus(product.productId)}
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border transition-all hover:scale-105 active:scale-95 ${
                            product.status === 'ACTIVE' 
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                              : 'bg-red-50 text-red-600 border-red-100'
                          }`}
                        >
                          {product.status}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 sm:opacity-60 group-hover:opacity-100 transition-all">
                          {product.conversionRules && product.conversionRules.length > 0 && (
                            <button 
                              onClick={() => setViewingConversionProduct(product)}
                              className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                              title="Lihat Visual Rantai Konversi Satuan"
                            >
                              <Layers size={18} />
                            </button>
                          )}
                          <button 
                            onClick={() => {
                              setAdjustmentProductId(product.productId);
                              setIsAdjustmentOpen(true);
                            }}
                            className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                            title="Penyesuaian Stok (Stock Movement)"
                          >
                            <Scale size={18} />
                          </button>
                          <button 
                            onClick={() => setViewingHistoryId(viewingHistoryId === product.productId ? null : product.productId)}
                            className={`p-2 transition-colors ${viewingHistoryId === product.productId ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}
                            title="Lihat Riwayat Stok"
                          >
                            <History size={18} />
                          </button>
                          <button 
                            onClick={() => setViewingQRProduct(product)}
                            className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                            title="Print QR Label"
                          >
                            <QrCode size={18} />
                          </button>
                          <button 
                            onClick={() => handleEdit(product)}
                            className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit size={18} />
                          </button>
                          <button 
                            onClick={() => handleDelete(product.productId)}
                            className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {viewingHistoryId === product.productId && (
                      <tr>
                        <td colSpan={7} className="px-6 py-6 bg-slate-50/30">
                          <div className="max-w-4xl mx-auto">
                            <StockHistory productId={product.productId} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : currentTab === 'PREDICTIONS' ? (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
            <h3 className="font-black text-slate-900 uppercase tracking-tight mb-8 flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-600" />
              Depletion & Reorder Suggestions
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-black">
                    <th className="px-6 py-4">Product</th>
                    <th className="px-6 py-4">Daily Burn Rate</th>
                    <th className="px-6 py-4">Estimated Outage</th>
                    <th className="px-6 py-4">Suggested Reorder</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {predictions?.map(p => (
                    <tr key={p.productId} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-slate-900 uppercase">{p.name}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-slate-700 tabular-nums">
                          {p.dailyBurnRate} <span className="text-[10px] text-slate-400">units / day</span>
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-black uppercase tracking-widest ${p.daysRemaining < 3 ? 'text-rose-600 animate-pulse' : p.daysRemaining < 7 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {p.daysRemaining > 365 ? '> 1 Year' : `${p.daysRemaining} Days Left`}
                            </span>
                            {p.daysRemaining < 3 && <AlertCircle size={14} className="text-rose-500" />}
                          </div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                            Approx {format(new Date(p.nextOutageDate), 'dd MMM yyyy')}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
                          <Plus size={12} className="stroke-[3]" />
                          <span className="text-xs font-black tabular-nums">{p.suggestedReorderQty.toLocaleString()} Units</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                          <RefreshCw size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : currentTab === 'HEATMAP' ? (
        <InventoryHeatmap />
      ) : (
        <ShelfTalkerModule />
      )}

      {isModalOpen && (
        <ProductModal 
          product={editingProduct} 
          onClose={() => setIsModalOpen(false)} 
        />
      )}

      {deletingProductId && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Hapus Produk?</h3>
            <p className="text-slate-600 text-xs font-medium">
              Apakah Anda yakin ingin menghapus produk ini? Riwayat stok dan transaksi tetap tersimpan untuk keperluan audit.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingProductId(null)}
                className="px-4 py-2.5 text-slate-600 font-bold text-xs uppercase rounded-xl hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase rounded-xl shadow-md shadow-rose-200"
              >
                Hapus Produk
              </button>
            </div>
          </div>
        </div>
      )}

      {isBulkPriceOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col p-8">
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-4">Penyesuaian Harga Massal</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">Anda akan menyesuaikan harga untuk {selectedIds.length} produk yang dipilih.</p>
            
            <div className="space-y-4">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                <button 
                  onClick={() => setBulkAdjustment({ ...bulkAdjustment, type: 'INCREASE' })}
                  className={`flex-1 py-3 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${
                    bulkAdjustment.type === 'INCREASE' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'
                  }`}
                >
                  Naikkan (+)
                </button>
                <button 
                  onClick={() => setBulkAdjustment({ ...bulkAdjustment, type: 'DECREASE' })}
                  className={`flex-1 py-3 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${
                    bulkAdjustment.type === 'DECREASE' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400'
                  }`}
                >
                  Turunkan (-)
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Persentase (%)</label>
                <input 
                  type="number"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 tabular-nums shadow-sm"
                  value={bulkAdjustment.percentage ?? 0}
                  onChange={(e) => setBulkAdjustment({ ...bulkAdjustment, percentage: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button 
                onClick={() => setIsBulkPriceOpen(false)}
                className="px-6 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all"
              >
                Batal
              </button>
              <button 
                onClick={handleBulkPriceAdjust}
                className="px-8 py-3 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-blue-500 shadow-lg shadow-blue-200 transition-all"
              >
                Terapkan
              </button>
            </div>
          </div>
        </div>
      )}
      {viewingQRProduct && (
        <QRLabelModal 
          product={viewingQRProduct} 
          onClose={() => setViewingQRProduct(null)} 
        />
      )}
      {isBulkBarcodeOpen && (
        <BulkBarcodeModal 
          onClose={() => setIsBulkBarcodeOpen(false)} 
        />
      )}
      {isImportModalOpen && (
        <ImportModal 
          onClose={() => setIsImportModalOpen(false)} 
          onSuccess={() => {
            // No action needed, live query handles it
          }}
        />
      )}
      {isAdjustmentOpen && (
        <StockAdjustmentModal 
          initialProductId={adjustmentProductId}
          onClose={() => {
            setIsAdjustmentOpen(false);
            setAdjustmentProductId(undefined);
          }}
          onSuccess={() => {
            // Live queries handle updates
          }}
        />
      )}

      {/* Visual Unit Conversion Helper Modal */}
      {viewingConversionProduct && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                  <Layers size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                    {viewingConversionProduct.name}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Rantai Konversi Satuan & Kalkulator Multi-Unit
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setViewingConversionProduct(null)} 
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
              <VisualUnitConversionHelper
                baseUnit={viewingConversionProduct.baseUnit}
                basePrice={viewingConversionProduct.normalPrice}
                conversionRules={viewingConversionProduct.conversionRules}
              />
            </div>
          </div>
        </div>
      )}

      {/* Camera Barcode Scanner for Inventory Lookup */}
      <CameraBarcodeScanner 
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScan={handleCameraScan}
        title="Inventory Barcode Lookup"
        subtitle="Arahkan kamera ke barcode untuk membuka data produk"
        continuous={false}
        sampleBarcodes={products?.slice(0, 6).map(p => ({
          barcode: p.barcode,
          label: p.name.length > 16 ? p.name.slice(0, 16) + '...' : p.name
        })) || []}
      />
    </div>
  );
}
