import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Save, 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  MapPin, 
  Fish, 
  Apple, 
  Package, 
  Scissors, 
  CheckSquare, 
  Sparkles,
  ShoppingBag,
  DollarSign
} from 'lucide-react';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';
import { PrepOrderService } from '@/core/services/prep-order-service';
import type { 
  PrepOrder, 
  PrepOrderItem, 
  ScheduleCategory, 
  ScheduleFulfillmentType, 
  PrepOrderPriority, 
  PrepPaymentStatus,
  PrepCuttingStyle,
  ScheduleQuantityUnit
} from '@/core/types';

interface OrderScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderToEdit?: PrepOrder | null;
  onSaved?: () => void;
}

const FISH_PRESETS = [
  'Ikan Nila Segar',
  'Ikan Lele Segar',
  'Ikan Mas',
  'Ikan Gurame',
  'Ikan Patin',
  'Ikan Bawal',
  'Ikan Bandeng'
];

const FRUIT_PRESETS = [
  'Mangga Arum Manis',
  'Jeruk Berastagi',
  'Semangka Merah Manis',
  'Melon Madu',
  'Apel Fuji',
  'Pisang Barangan',
  'Alpukat Mentega'
];

const SEMBAKO_PRESETS = [
  'Beras Ramos Super (5 Kg)',
  'Beras Ramos Super (10 Kg)',
  'Minyak Goreng 2L Pouch',
  'Minyak Goreng 1 Dus (6x2L)',
  'Gula Pasir Kristal (1 Kg)',
  'Tepung Terigu Segitiga',
  'Telur Ayam Ras (1 Papan)'
];

export function OrderScheduleModal({ isOpen, onClose, orderToEdit, onSaved }: OrderScheduleModalProps) {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();

  const isOwner = currentUser?.role === 'OWNER';

  // Basic Details
  const [selectedCategory, setSelectedCategory] = useState<ScheduleCategory>('IKAN');
  const [fulfillmentType, setFulfillmentType] = useState<ScheduleFulfillmentType>('PICKUP');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState('10:00');
  const [priority, setPriority] = useState<PrepOrderPriority>('NORMAL');
  const [assignedStaffName, setAssignedStaffName] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');

  // Payment Details
  const [paymentStatus, setPaymentStatus] = useState<PrepPaymentStatus>('UNPAID');
  const [downPaymentAmount, setDownPaymentAmount] = useState<number>(0);

  // Items
  const [items, setItems] = useState<Omit<PrepOrderItem, 'itemId'>[]>([]);

  // Initialize or Reset
  useEffect(() => {
    if (orderToEdit) {
      setSelectedCategory(orderToEdit.category || 'IKAN');
      setFulfillmentType(orderToEdit.fulfillmentType || 'PICKUP');
      setCustomerName(orderToEdit.customerName || '');
      setCustomerPhone(orderToEdit.customerPhone || '');
      setCustomerAddress(orderToEdit.customerAddress || '');
      setDeliveryFee(orderToEdit.deliveryFee || 0);
      setScheduledDate(orderToEdit.scheduledDate || new Date().toISOString().split('T')[0]);
      setScheduledTime(orderToEdit.scheduledTime || '10:00');
      setPriority(orderToEdit.priority || 'NORMAL');
      setAssignedStaffName(orderToEdit.assignedStaffName || '');
      setGeneralNotes(orderToEdit.generalNotes || '');
      setPaymentStatus(orderToEdit.paymentStatus || 'UNPAID');
      setDownPaymentAmount(orderToEdit.downPaymentAmount || 0);
      setItems(orderToEdit.items || []);
    } else {
      // Create defaults
      setSelectedCategory('IKAN');
      setFulfillmentType('PICKUP');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setDeliveryFee(0);
      setScheduledDate(new Date().toISOString().split('T')[0]);
      setScheduledTime('10:00');
      setPriority('NORMAL');
      setAssignedStaffName(currentUser?.name || '');
      setGeneralNotes('');
      setPaymentStatus('UNPAID');
      setDownPaymentAmount(0);

      // Default 1 item based on initial category
      setItems([
        {
          productName: 'Ikan Nila Segar',
          category: 'IKAN',
          weightKg: 2,
          quantityValue: 2,
          quantityUnit: 'KG',
          sizeSpec: '1 kg isi 2-3 ekor',
          cleanScale: true,
          cleanGills: true,
          cleanGut: true,
          cuttingStyle: 'POTONG_2',
          packagingNotes: 'Plastik rangkap',
          estimatedPrice: 70000
        }
      ]);
    }
  }, [orderToEdit, isOpen, currentUser]);

  if (!isOpen) return null;

  // Add Item to list
  const handleAddItem = () => {
    const defaultProduct = selectedCategory === 'IKAN' 
      ? 'Ikan Nila Segar' 
      : selectedCategory === 'BUAH' 
      ? 'Mangga Arum Manis' 
      : 'Beras Ramos Super (5 Kg)';

    const newItem: Omit<PrepOrderItem, 'itemId'> = {
      productName: defaultProduct,
      category: selectedCategory,
      weightKg: selectedCategory === 'IKAN' ? 1 : selectedCategory === 'BUAH' ? 2 : 5,
      quantityValue: selectedCategory === 'IKAN' ? 1 : selectedCategory === 'BUAH' ? 2 : 1,
      quantityUnit: selectedCategory === 'SEMBAKO' ? 'SAK' : 'KG',
      sizeSpec: selectedCategory === 'IKAN' ? '1 kg isi 2-3 ekor' : '',
      cleanScale: selectedCategory === 'IKAN',
      cleanGills: selectedCategory === 'IKAN',
      cleanGut: selectedCategory === 'IKAN',
      cuttingStyle: selectedCategory === 'IKAN' ? 'UTUH' : undefined,
      fruitSpecs: selectedCategory === 'BUAH' ? {
        ripeness: 'MATANG_POHON',
        grade: 'SUPER_A',
        packaging: 'KANTONG_PLASTIK'
      } : undefined,
      sembakoSpecs: selectedCategory === 'SEMBAKO' ? {
        packagingType: 'SAK_UTUH',
        sealCheck: true
      } : undefined,
      estimatedPrice: 0
    };

    setItems([...items, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      addToast('Minimal harus ada 1 item pesanan', 'warning');
      return;
    }
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleUpdateItem = (index: number, updates: Partial<Omit<PrepOrderItem, 'itemId'>>) => {
    setItems(prev => prev.map((item, idx) => idx === index ? { ...item, ...updates } : item));
  };

  const calculateTotalEstimated = () => {
    const itemsTotal = items.reduce((sum, it) => sum + (Number(it.estimatedPrice) || 0), 0);
    return itemsTotal + (fulfillmentType === 'DELIVERY' ? Number(deliveryFee) || 0 : 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim()) {
      addToast('Nama pemesan wajib diisi', 'error');
      return;
    }

    if (items.length === 0) {
      addToast('Tambahkan minimal 1 item produk', 'error');
      return;
    }

    if (fulfillmentType === 'DELIVERY' && !customerAddress.trim()) {
      addToast('Alamat pengiriman wajib diisi untuk pesanan antar / delivery', 'warning');
      return;
    }

    try {
      if (orderToEdit) {
        await PrepOrderService.updateOrder(orderToEdit.orderId, {
          category: selectedCategory,
          fulfillmentType,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerAddress: customerAddress.trim(),
          deliveryFee: Number(deliveryFee) || 0,
          scheduledDate,
          scheduledTime,
          priority,
          assignedStaffName: assignedStaffName.trim(),
          generalNotes: generalNotes.trim(),
          paymentStatus,
          downPaymentAmount: Number(downPaymentAmount) || 0,
          items: items.map((it, idx) => ({
            ...it,
            itemId: (orderToEdit.items[idx]?.itemId) || `item-${Date.now()}-${idx}`
          })) as PrepOrderItem[]
        });
        addToast('Jadwal pemesanan berhasil diperbarui', 'success');
      } else {
        await PrepOrderService.createOrder({
          scheduledDate,
          scheduledTime,
          category: selectedCategory,
          fulfillmentType,
          customerName,
          customerPhone,
          customerAddress,
          deliveryFee: Number(deliveryFee) || 0,
          priority,
          paymentStatus,
          downPaymentAmount: Number(downPaymentAmount) || 0,
          generalNotes,
          assignedStaffName,
          createdBy: currentUser?.name || 'Kasir',
          items
        });
        addToast('Jadwal pemesanan / to-do baru berhasil disimpan', 'success');
      }

      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      addToast('Gagal menyimpan jadwal pemesanan', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Calendar className="text-blue-400" size={18} />
              {orderToEdit ? 'Edit Jadwal Pemesanan & To-Do' : 'Tambah Jadwal Pemesanan / To-Do Baru'}
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Penjadwalan pengerjaan khusus untuk Ikan Segar, Buah, dan Produk Sembako
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Main Category Selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
              Kategori Lini Pengerjaan
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('IKAN')}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border text-xs font-bold transition-all ${
                  selectedCategory === 'IKAN'
                    ? 'bg-cyan-50 border-cyan-500 text-cyan-900 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Fish size={16} className={selectedCategory === 'IKAN' ? 'text-cyan-600' : 'text-slate-400'} />
                <span>🐟 Ikan Segar</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCategory('BUAH')}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border text-xs font-bold transition-all ${
                  selectedCategory === 'BUAH'
                    ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Apple size={16} className={selectedCategory === 'BUAH' ? 'text-amber-600' : 'text-slate-400'} />
                <span>🍎 Buah Segar</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCategory('SEMBAKO')}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border text-xs font-bold transition-all ${
                  selectedCategory === 'SEMBAKO'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Package size={16} className={selectedCategory === 'SEMBAKO' ? 'text-emerald-600' : 'text-slate-400'} />
                <span>📦 Sembako</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCategory('CAMPURAN')}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border text-xs font-bold transition-all ${
                  selectedCategory === 'CAMPURAN'
                    ? 'bg-purple-50 border-purple-500 text-purple-900 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ShoppingBag size={16} className={selectedCategory === 'CAMPURAN' ? 'text-purple-600' : 'text-slate-400'} />
                <span>🛒 Campuran</span>
              </button>
            </div>
          </div>

          {/* Customer & Fulfillment Info */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <User size={14} className="text-blue-600" />
              Informasi Pemesan & Metode Penyerahan
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  Nama Pemesan / Pelanggan <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Ibu Hj. Aminah (Resto Minang)"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  Nomor HP / WhatsApp (Untuk Konfirmasi)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 081234567890"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Fulfillment Type Radio */}
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">
                Metode Penyerahan Pesanan
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFulfillmentType('PICKUP')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    fulfillmentType === 'PICKUP'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>🏪 Ambil di Tempat (Toko)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFulfillmentType('DELIVERY')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    fulfillmentType === 'DELIVERY'
                      ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>🚗 Diantar ke Alamat (Delivery)</span>
                </button>
              </div>
            </div>

            {/* Delivery address & fee if Delivery */}
            {fulfillmentType === 'DELIVERY' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Alamat Lengkap Pengiriman <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nama jalan, nomor rumah, RT/RW, patokan..."
                    value={customerAddress}
                    onChange={e => setCustomerAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Ongkos Kirim (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={deliveryFee || ''}
                    onChange={e => setDeliveryFee(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>
            )}

            {/* Target Schedule Date & Time & Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  Tanggal {fulfillmentType === 'DELIVERY' ? 'Kirim' : 'Diambil'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  Jam Target Selesai <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  Tingkat Prioritas
                </label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as PrepOrderPriority)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                >
                  <option value="NORMAL">Biasa (Normal)</option>
                  <option value="URGENT">Mendesak (Urgent)</option>
                  <option value="VIP_EVENT">Acara Penting / VIP</option>
                </select>
              </div>
            </div>
          </div>

          {/* Order Items & Specifications */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Daftar Produk & Instruksi Kerja ({items.length} Item)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Tentukan jumlah (kg / pcs), pembersihan, model potongan, tingkat kematangan, atau kemasan.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold border border-blue-200 transition-all"
              >
                <Plus size={14} />
                Tambah Produk
              </button>
            </div>

            {/* Preset quick buttons */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-400 font-medium">Contoh Cepat:</span>
              {(selectedCategory === 'IKAN' ? FISH_PRESETS : selectedCategory === 'BUAH' ? FRUIT_PRESETS : SEMBAKO_PRESETS).slice(0, 4).map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    if (items.length > 0) {
                      handleUpdateItem(0, { productName: preset });
                    }
                  }}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[10px] font-medium transition-all"
                >
                  + {preset}
                </button>
              ))}
            </div>

            {/* Items Loop */}
            <div className="space-y-3">
              {items.map((item, index) => {
                const itemCat = item.category || selectedCategory;

                return (
                  <div 
                    key={index} 
                    className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 relative group"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {item.productName || 'Produk Baru'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-all"
                            title="Hapus baris"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Product Name & Quantity */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-6">
                        <label className="text-[11px] font-medium text-slate-600 block mb-1">
                          Nama Produk
                        </label>
                        <input
                          type="text"
                          required
                          value={item.productName}
                          onChange={e => handleUpdateItem(index, { productName: e.target.value })}
                          placeholder="Nama Ikan / Buah / Sembako"
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="text-[11px] font-medium text-slate-600 block mb-1">
                          Jumlah / Kuantitas
                        </label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            required
                            value={item.quantityValue || item.weightKg || ''}
                            onChange={e => {
                              const val = Number(e.target.value) || 0;
                              handleUpdateItem(index, { quantityValue: val, weightKg: val });
                            }}
                            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                          />
                          <select
                            value={item.quantityUnit || 'KG'}
                            onChange={e => handleUpdateItem(index, { quantityUnit: e.target.value as ScheduleQuantityUnit })}
                            className="px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold outline-none"
                          >
                            <option value="KG">Kg</option>
                            <option value="PCS">Pcs</option>
                            <option value="SAK">Sak</option>
                            <option value="DUS">Dus</option>
                            <option value="IKAT">Ikat</option>
                            <option value="KERANJANG">Kjg</option>
                            <option value="PAKET">Paket</option>
                          </select>
                        </div>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="text-[11px] font-medium text-slate-600 block mb-1">
                          Estimasi Harga (Rp)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={item.estimatedPrice || ''}
                          onChange={e => handleUpdateItem(index, { estimatedPrice: Number(e.target.value) || 0 })}
                          placeholder="0"
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                        />
                      </div>
                    </div>

                    {/* DYNAMIC SPECIFICATIONS: IKAN */}
                    {(itemCat === 'IKAN' || selectedCategory === 'IKAN') && (
                      <div className="p-3 bg-cyan-50/50 rounded-xl border border-cyan-200/70 space-y-3">
                        <div className="text-[11px] font-bold text-cyan-900 flex items-center gap-1.5">
                          <Fish size={14} className="text-cyan-700" />
                          <span>Spesifikasi Penanganan Ikan:</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                              Ukuran Ikan (Ekor per Kg)
                            </label>
                            <input
                              type="text"
                              value={item.sizeSpec || ''}
                              onChange={e => handleUpdateItem(index, { sizeSpec: e.target.value })}
                              placeholder="Misal: 1 kg 2-3 ekor, Jumbo 1 ekor/kg"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-cyan-500"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                              Model Potongan
                            </label>
                            <select
                              value={item.cuttingStyle || 'UTUH'}
                              onChange={e => handleUpdateItem(index, { cuttingStyle: e.target.value as PrepCuttingStyle })}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-cyan-500"
                            >
                              <option value="UTUH">Utuh Bersih</option>
                              <option value="BELAH_BAKAR">Belah Punggung (Bakar)</option>
                              <option value="POTONG_2">Potong 2 Bagian</option>
                              <option value="POTONG_3">Potong 3 Bagian</option>
                              <option value="POTONG_4">Potong 4 Bagian</option>
                              <option value="KERAT_GORENG">Kerat Sayat (Goreng Crispy)</option>
                              <option value="FILLET">Fillet Tanpa Tulang</option>
                              <option value="CUSTOM">Potongan Kustom Lainnya</option>
                            </select>
                          </div>
                        </div>

                        {/* Clean checkboxes */}
                        <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
                          <label className="flex items-center gap-1.5 text-slate-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(item.cleanScale)}
                              onChange={e => handleUpdateItem(index, { cleanScale: e.target.checked })}
                              className="rounded text-cyan-600 focus:ring-cyan-500"
                            />
                            <span className="font-medium">Bersihkan Sisik</span>
                          </label>

                          <label className="flex items-center gap-1.5 text-slate-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(item.cleanGills)}
                              onChange={e => handleUpdateItem(index, { cleanGills: e.target.checked })}
                              className="rounded text-cyan-600 focus:ring-cyan-500"
                            />
                            <span className="font-medium">Buang Insang</span>
                          </label>

                          <label className="flex items-center gap-1.5 text-slate-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(item.cleanGut)}
                              onChange={e => handleUpdateItem(index, { cleanGut: e.target.checked })}
                              className="rounded text-cyan-600 focus:ring-cyan-500"
                            />
                            <span className="font-medium">Buang Isi Perut & Empedu</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {/* DYNAMIC SPECIFICATIONS: BUAH */}
                    {(itemCat === 'BUAH' || selectedCategory === 'BUAH') && (
                      <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/70 space-y-3">
                        <div className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                          <Apple size={14} className="text-amber-700" />
                          <span>Spesifikasi Penanganan Buah:</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                              Tingkat Kematangan
                            </label>
                            <select
                              value={item.fruitSpecs?.ripeness || 'MATANG_POHON'}
                              onChange={e => handleUpdateItem(index, {
                                fruitSpecs: {
                                  ...(item.fruitSpecs || {}),
                                  ripeness: e.target.value as any
                                }
                              })}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              <option value="MATANG_POHON">Matang Pohon (Manis Empuk)</option>
                              <option value="SIAP_KONSUMSI">Siap Makan Hari Ini</option>
                              <option value="MENGKAL">Mengkal / Renyah (Asam Manis)</option>
                              <option value="SETENGAH_MATANG">Setengah Matang (Simpan 2-3 hari)</option>
                              <option value="MENTAH">Mentah (Untuk rujak / awet)</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                              Grade / Sortir Kualitas
                            </label>
                            <select
                              value={item.fruitSpecs?.grade || 'SUPER_A'}
                              onChange={e => handleUpdateItem(index, {
                                fruitSpecs: {
                                  ...(item.fruitSpecs || {}),
                                  grade: e.target.value as any
                                }
                              })}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              <option value="SUPER_A">Super Grade A (Mulus Tanpa Cacat)</option>
                              <option value="JUMBO">Ukuran Jumbo / Pilihan</option>
                              <option value="STANDARD">Standar Pasar</option>
                              <option value="GRADE_B">Grade B (Eceran Ekonomis)</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                              Pengemasan Buah
                            </label>
                            <select
                              value={item.fruitSpecs?.packaging || 'KANTONG_PLASTIK'}
                              onChange={e => handleUpdateItem(index, {
                                fruitSpecs: {
                                  ...(item.fruitSpecs || {}),
                                  packaging: e.target.value as any
                                }
                              })}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              <option value="KANTONG_PLASTIK">Kantong Plastik Khusus Buah</option>
                              <option value="MIKA_BUAH">Mika Buah Rapi</option>
                              <option value="KERANJANG_PARCEL">Keranjang / Parcel Cantik</option>
                              <option value="KARTON_DUS">Kardus / Karton Buah</option>
                              <option value="CUSTOM">Kemasan Khusus</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <input
                            type="text"
                            placeholder="Catatan tambahan buah (misal: bungkus jaring busa, jangan ditindih)"
                            value={item.fruitSpecs?.notes || ''}
                            onChange={e => handleUpdateItem(index, {
                              fruitSpecs: {
                                ...(item.fruitSpecs || {}),
                                notes: e.target.value
                              }
                            })}
                            className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-[11px] outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* DYNAMIC SPECIFICATIONS: SEMBAKO */}
                    {(itemCat === 'SEMBAKO' || selectedCategory === 'SEMBAKO') && (
                      <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200/70 space-y-3">
                        <div className="text-[11px] font-bold text-emerald-900 flex items-center gap-1.5">
                          <Package size={14} className="text-emerald-700" />
                          <span>Spesifikasi Penanganan Sembako:</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                              Tipe Kemasan / Penyiapan
                            </label>
                            <select
                              value={item.sembakoSpecs?.packagingType || 'SAK_UTUH'}
                              onChange={e => handleUpdateItem(index, {
                                sembakoSpecs: {
                                  ...(item.sembakoSpecs || {}),
                                  packagingType: e.target.value as any
                                }
                              })}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                            >
                              <option value="SAK_UTUH">Sak / Karung Utuh Pabrik</option>
                              <option value="DUS_UTUH">Karton / Dus Utuh Segel</option>
                              <option value="REPACK_ECER">Repack Eceran (Timbang Ulang)</option>
                              <option value="PAKET_BANSOS_SEDEKAH">Paket Sembako Sedekah / Bansos</option>
                              <option value="CUSTOM">Kemasan Kustom</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                              Detail Repack / Bundling
                            </label>
                            <input
                              type="text"
                              placeholder="Misal: Repack 1kg x 20 bks, campur beras+minyak"
                              value={item.sembakoSpecs?.repackSpec || ''}
                              onChange={e => handleUpdateItem(index, {
                                sembakoSpecs: {
                                  ...(item.sembakoSpecs || {}),
                                  repackSpec: e.target.value
                                }
                              })}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-4 pt-1">
                          <label className="flex items-center gap-1.5 text-xs text-slate-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.sembakoSpecs?.sealCheck ?? true}
                              onChange={e => handleUpdateItem(index, {
                                sembakoSpecs: {
                                  ...(item.sembakoSpecs || {}),
                                  sealCheck: e.target.checked
                                }
                              })}
                              className="rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="font-semibold text-emerald-900">
                              Pastikan Segel Utuh & Cek Expired Date Aman
                            </span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment & Staff Assignment */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <DollarSign size={14} className="text-emerald-600" />
              Keuangan, Uang Muka (DP) & Petugas
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  Status Pembayaran
                </label>
                <select
                  value={paymentStatus}
                  onChange={e => setPaymentStatus(e.target.value as PrepPaymentStatus)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="UNPAID">Belum Bayar (Bayar Nanti)</option>
                  <option value="DOWN_PAYMENT">Uang Muka (DP)</option>
                  <option value="PAID">Sudah Lunas</option>
                </select>
              </div>

              {paymentStatus === 'DOWN_PAYMENT' && (
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Nominal DP (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={downPaymentAmount || ''}
                    onChange={e => setDownPaymentAmount(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  Petugas Penanggung Jawab
                </label>
                <input
                  type="text"
                  value={assignedStaffName}
                  onChange={e => setAssignedStaffName(e.target.value)}
                  placeholder="Nama Kasir / Petugas Prep"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">
                Catatan Umum / Instruksi Khusus
              </label>
              <textarea
                rows={2}
                value={generalNotes}
                onChange={e => setGeneralNotes(e.target.value)}
                placeholder="Catatan tambahan pemesan atau hal yang perlu diwaspadai..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 flex flex-wrap items-center justify-between text-xs font-medium">
              <div>
                <span className="text-slate-500">Estimasi Total Tagihan:</span>
                <span className="ml-2 font-black text-slate-900 text-sm">
                  Rp {calculateTotalEstimated().toLocaleString('id-ID')}
                </span>
                {fulfillmentType === 'DELIVERY' && deliveryFee > 0 && (
                  <span className="text-[10px] text-amber-700 ml-1">
                    (Termasuk Ongkir Rp {deliveryFee.toLocaleString('id-ID')})
                  </span>
                )}
              </div>
              {paymentStatus === 'DOWN_PAYMENT' && (
                <div className="text-red-600 font-bold">
                  Sisa Pelunasan: Rp {Math.max(0, calculateTotalEstimated() - (downPaymentAmount || 0)).toLocaleString('id-ID')}
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer / Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-200 transition-all"
            >
              <Save size={16} />
              Simpan Jadwal & To-Do
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
