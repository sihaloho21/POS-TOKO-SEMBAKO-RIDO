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
  Camera
} from 'lucide-react';
import { CameraBarcodeScanner } from '@/components/CameraBarcodeScanner';
import { useToastStore } from '@/core/toast-store';
import type { Product, ProductCost } from '@/core/types';
import { ProductService } from '@/core/services/product-service';
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
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [adjustmentProductId, setAdjustmentProductId] = useState<string | undefined>(undefined);
  
  const products = useLiveQuery(
    () => {
      let collection = db.products.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) || 
        p.barcode.includes(search) || 
        !!(p.sku && p.sku.includes(search))
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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCameraScan = (scannedCode: string) => {
    if (!products) return;
    const match = products.find(p => p.barcode === scannedCode || (p.sku && p.sku === scannedCode));
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
      alert(`Berhasil menyesuaikan harga untuk ${selectedIds.length} produk.`);
    } catch (error) {
      console.error('Bulk adjustment failed:', error);
      alert('Gagal melakukan penyesuaian harga massal.');
    }
  };

  const handleExport = async () => {
    try {
      await ProductService.exportToCSV();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Gagal mengekspor data.');
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

  const handleDelete = async (productId: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus produk ini? History transaksi mungkin akan terpengaruh.')) {
      await ProductService.deleteProduct(productId);
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
                          Rp {product.normalPrice.toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2">
                          {isOwner && (
                            <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">
                              WAC: Rp {costs?.find(c => c.productId === product.productId)?.hpp.toLocaleString() || 0}
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
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-black tabular-nums ${product.stock < product.minimumStock ? 'text-red-500' : 'text-slate-900'}`}>
                            {product.stock.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{product.baseUnit}</span>
                          {product.stock < product.minimumStock && <AlertCircle size={14} className="text-red-500 animate-pulse" />}
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
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
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
