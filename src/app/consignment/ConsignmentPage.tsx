import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { ConsignmentService } from '@/core/services/consignment-service';
import { useAuthStore } from '@/core/auth-store';
import { useDeviceId } from '@/core/device-store';
import { useToastStore } from '@/core/toast-store';
import { 
  Package, 
  Truck, 
  Banknote, 
  History, 
  Plus, 
  ArrowUpRight, 
  Calculator,
  User,
  Search,
  TrendingUp,
  AlertCircle,
  X,
  Edit
} from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

export default function ConsignmentPage() {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const deviceId = useDeviceId();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isArrivalModalOpen, setIsArrivalModalOpen] = useState(false);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Settlement Preview States
  const [remainingStockInput, setRemainingStockInput] = useState<number>(0);
  const [newStockInput, setNewStockInput] = useState<number>(0);

  const items = useLiveQuery(
    () => db.consignmentItems.toArray(),
    []
  );

  const suppliers = useLiveQuery(
    () => db.suppliers.where('status').equals('ACTIVE').toArray(),
    []
  );

  const filteredItems = items?.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedItem = items?.find(i => i.id === selectedItemId);

  // Perhitungan Settlement Preview
  const soldQtyPreview = selectedItem ? Math.max(0, selectedItem.currentStock - remainingStockInput) : 0;
  const totalPaymentPreview = selectedItem ? soldQtyPreview * selectedItem.costPrice : 0;
  const totalProfitPreview = selectedItem ? soldQtyPreview * (selectedItem.salePrice - selectedItem.costPrice) : 0;

  const handleAddItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser) return;
    const formData = new FormData(e.currentTarget);
    try {
      await ConsignmentService.addItem({
        name: formData.get('name') as string,
        supplierId: formData.get('supplierId') as string,
        costPrice: Number(formData.get('costPrice')),
        salePrice: Number(formData.get('salePrice')),
        initialStock: Number(formData.get('initialStock')),
        userId: currentUser.userId,
        deviceId
      });
      setIsAddModalOpen(false);
      addToast('Barang titipan berhasil ditambahkan', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Gagal menambahkan barang', 'error');
    }
  };

  const handleEditItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || !editingItem) return;
    const formData = new FormData(e.currentTarget);
    try {
      await ConsignmentService.updateItem({
        id: editingItem.id,
        name: formData.get('name') as string,
        supplierId: formData.get('supplierId') as string,
        costPrice: Number(formData.get('costPrice')),
        salePrice: Number(formData.get('salePrice')),
        userId: currentUser.userId,
        deviceId
      });
      setIsEditModalOpen(false);
      addToast('Informasi barang berhasil diperbarui', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Gagal memperbarui barang', 'error');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!currentUser) return;
    console.log('Attempting to delete item:', id);
    if (!confirm('Apakah Anda yakin ingin menghapus barang ini? Data histori tidak akan hilang dari audit log.')) {
      console.log('Delete cancelled by user');
      return;
    }
    
    try {
      await ConsignmentService.deleteItem(id, currentUser.userId, deviceId);
      console.log('Item deleted successfully:', id);
      addToast('Barang titipan berhasil dihapus', 'success');
    } catch (err) {
      console.error('Delete error in UI:', err);
      addToast(err instanceof Error ? err.message : 'Gagal menghapus barang', 'error');
    }
  };

  const handleArrival = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || !selectedItemId) return;
    const formData = new FormData(e.currentTarget);
    try {
      await ConsignmentService.recordArrival({
        itemId: selectedItemId,
        qty: Number(formData.get('qty')),
        userId: currentUser.userId,
        deviceId
      });
      setIsArrivalModalOpen(false);
      addToast('Stok datang berhasil dicatat', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Gagal mencatat stok datang', 'error');
    }
  };

  const handleSettlement = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || !selectedItemId) return;
    try {
      await ConsignmentService.processSettlement({
        itemId: selectedItemId,
        remainingStock: remainingStockInput,
        newStock: newStockInput,
        userId: currentUser.userId,
        deviceId
      });
      setIsSettlementModalOpen(false);
      setRemainingStockInput(0);
      setNewStockInput(0);
      addToast('Setoran berhasil diproses & siklus di-reset', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Gagal memproses setoran', 'error');
    }
  };

  const totalStoreProfit = items?.reduce((acc, curr) => {
    const profitPerUnit = curr.salePrice - curr.costPrice;
    return acc + (curr.totalSold * profitPerUnit);
  }, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Titipan Barang</h1>
          <p className="text-slate-500 font-medium text-sm italic">Manajemen barang bagi hasil & Sistem Reset Stok Baru</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all text-sm uppercase tracking-wider"
        >
          <Plus size={18} />
          Tambah Barang
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <Package size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Produk</p>
              <p className="text-xl font-black text-slate-900">{items?.length || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Barang Terjual</p>
              <p className="text-xl font-black text-slate-900">{items?.reduce((acc, curr) => acc + curr.totalSold, 0) || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-none shadow-emerald-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 text-white rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/30">
              <Banknote size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-white/70 uppercase tracking-widest">Total Untung Toko</p>
              <p className="text-xl font-black">Rp {totalStoreProfit.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
              <History size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Update Terakhir</p>
              <p className="text-sm font-bold text-slate-900 truncate">
                {items?.length && items.some(i => i.lastSettlementAt) 
                  ? format(new Date(Math.max(...items.filter(i => i.lastSettlementAt).map(i => new Date(i.lastSettlementAt!).getTime()))), 'dd MMM HH:mm', { locale: id })
                  : '-'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Cari nama barang..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                <th className="px-6 py-4">Barang & Sales</th>
                <th className="px-6 py-4 text-center">Stok Aktif</th>
                <th className="px-6 py-4">Harga (Modal/Jual)</th>
                <th className="px-6 py-4 text-center">Terjual</th>
                <th className="px-6 py-4 text-center text-emerald-600 bg-emerald-50/30">Total Untung</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredItems?.map((item) => {
                const supplier = suppliers?.find(s => s.supplierId === item.supplierId);
                const itemProfit = item.totalSold * (item.salePrice - item.costPrice);
                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                          <Package size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 leading-tight">{item.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight flex items-center gap-1">
                            <User size={10} />
                            {supplier?.name || 'Unknown Sales'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                        item.currentStock > 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {item.currentStock}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs space-y-0.5">
                        <p className="text-slate-400 font-medium">M: <span className="text-slate-900 font-bold tracking-tight">Rp{item.costPrice.toLocaleString()}</span></p>
                        <p className="text-slate-400 font-medium">J: <span className="text-blue-600 font-bold tracking-tight">Rp{item.salePrice.toLocaleString()}</span></p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <p className="text-sm font-black text-slate-900">{item.totalSold}</p>
                    </td>
                    <td className="px-6 py-4 text-center bg-emerald-50/10">
                      <p className="text-sm font-black text-emerald-600">Rp{itemProfit.toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setIsEditModalOpen(true);
                          }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit Info Barang"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItemId(item.id);
                            setIsArrivalModalOpen(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Tambah Stok (Log Kedatangan)"
                        >
                          <Truck size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItemId(item.id);
                            setRemainingStockInput(0);
                            setNewStockInput(0);
                            setIsSettlementModalOpen(true);
                          }}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="PROSES SETORAN & RESET"
                        >
                          <Calculator size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Hapus"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredItems?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <AlertCircle className="mx-auto mb-2" size={32} />
                    <p className="text-sm font-bold">Belum ada data barang titipan.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Tambah Barang Titipan</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddItem} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Barang</label>
                <input required name="name" type="text" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Contoh: Roti Aoka" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sales / Supplier</label>
                <select required name="supplierId" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option value="">Pilih Supplier</option>
                  {suppliers?.map(s => <option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga Modal (Sales)</label>
                  <input required name="costPrice" type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="1500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga Jual (Toko)</label>
                  <input required name="salePrice" type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="2000" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stok Titipan Awal</label>
                <input required name="initialStock" type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" defaultValue="0" />
              </div>
              <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                Simpan & Monitor
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Edit Barang Titipan</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleEditItem} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Barang</label>
                <input required name="name" type="text" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" defaultValue={editingItem.name} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sales / Supplier</label>
                <select required name="supplierId" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" defaultValue={editingItem.supplierId}>
                  {suppliers?.map(s => <option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga Modal (Sales)</label>
                  <input required name="costPrice" type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" defaultValue={editingItem.costPrice} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga Jual (Toko)</label>
                  <input required name="salePrice" type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" defaultValue={editingItem.salePrice} />
                </div>
              </div>
              <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                Update Data
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Arrival Modal */}
      {isArrivalModalOpen && selectedItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Stok Datang</h2>
              <button onClick={() => setIsArrivalModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleArrival} className="p-6 space-y-4">
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Barang</p>
                <p className="text-sm font-bold text-blue-900">{selectedItem.name}</p>
                <p className="text-xs font-medium text-blue-700 mt-1">Stok saat ini: <span className="font-black">{selectedItem.currentStock}</span></p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Jumlah Tambahan</label>
                <input required name="qty" type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" placeholder="Input jumlah barang baru" />
              </div>
              <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                Konfirmasi Kedatangan
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Settlement Modal (REFINED) */}
      {isSettlementModalOpen && selectedItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-emerald-600 flex items-center justify-between">
              <h2 className="text-lg font-black text-white uppercase tracking-tight">Proses Setoran & Reset</h2>
              <button onClick={() => setIsSettlementModalOpen(false)} className="text-white/70 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSettlement} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Nama Barang</p>
                  <p className="text-sm font-bold text-slate-900 truncate">{selectedItem.name}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-black text-blue-400 uppercase mb-1">Stok Siklus Ini</p>
                  <p className="text-sm font-black text-blue-900">{selectedItem.currentStock}</p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Input Sisa Stok Toko (Barang Sisa)</label>
                <div className="relative">
                  <input 
                    required 
                    type="number" 
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-emerald-100 rounded-2xl text-lg font-black text-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all" 
                    max={selectedItem.currentStock}
                    value={remainingStockInput}
                    onChange={(e) => setRemainingStockInput(Number(e.target.value))}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">Input Manual</div>
                </div>
              </div>

              <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-3 shadow-xl">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-widest">Jumlah Terjual</span>
                  <span className="font-black text-lg text-emerald-400">{soldQtyPreview} <span className="text-[10px] font-medium text-slate-500">pcs</span></span>
                </div>
                <div className="h-px bg-white/10 w-full" />
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Bayar Sales</span>
                    <span className="text-[9px] text-slate-500">({soldQtyPreview} x Rp{selectedItem.costPrice.toLocaleString()})</span>
                  </div>
                  <span className="text-lg font-black text-amber-400">Rp {totalPaymentPreview.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Laba Bersih Toko</span>
                    <span className="text-[9px] text-slate-500">(Profit Bagihasil)</span>
                  </div>
                  <span className="text-lg font-black text-emerald-400">Rp {totalProfitPreview.toLocaleString()}</span>
                </div>
              </div>

              <div className="p-4 bg-blue-50/50 rounded-2xl border-2 border-dashed border-blue-200">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <ArrowUpRight size={12} />
                  Siklus Baru: Stok Baru yang Dititipkan
                </p>
                <input 
                  required 
                  type="number" 
                  className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-xl text-sm font-bold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                  placeholder="Jumlah stok baru (e.g. 50)"
                  value={newStockInput}
                  onChange={(e) => setNewStockInput(Number(e.target.value))}
                />
                <p className="text-[9px] text-blue-400 mt-1.5">* Setelah bayar, stok lama di-reset & stok baru ini akan aktif.</p>
              </div>

              <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-3">
                <AlertCircle className="text-amber-500 shrink-0" size={16} />
                <p className="text-[10px] font-medium text-amber-800 leading-normal">
                  Klik tombol di bawah akan memotong saldo <span className="font-bold">Kas Warung</span> dan mereset siklus stok barang ini.
                </p>
              </div>

              <button 
                type="submit" 
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200"
              >
                Bayar Setoran & Mulai Baru
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
