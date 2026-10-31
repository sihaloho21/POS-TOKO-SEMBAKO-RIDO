import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  X, 
  Plus, 
  Trash2, 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  Fish, 
  Scale, 
  Scissors, 
  CheckSquare, 
  Square, 
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { db } from '@/core/database';
import { PrepOrderService } from '@/core/services/prep-order-service';
import { useToastStore } from '@/core/toast-store';
import type { PrepOrder, PrepCuttingStyle, PrepOrderPriority, PrepPaymentStatus } from '@/core/types';

interface PrepOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderToEdit?: PrepOrder | null;
  currentUserId: string;
}

const COMMON_FISH = ['Ikan Nila', 'Ikan Mas', 'Ikan Gurame', 'Ikan Lele', 'Ikan Patin', 'Ikan Bawal'];

const SIZE_PRESETS = [
  '1 kg isi 1-2 ekor (Besar / Jumbo)',
  '1 kg isi 3-4 ekor (Sedang / Standar Bakar)',
  '1 kg isi 5-6 ekor (Kecil)',
  '1 kg isi 7-10 ekor (Pecel / Goreng)'
];

const CUTTING_STYLES: Array<{ value: PrepCuttingStyle; label: string }> = [
  { value: 'UTUH', label: 'Ikan Utuh (Hanya Dibersihkan)' },
  { value: 'BELAH_BAKAR', label: 'Belah Punggung (Model Bakar)' },
  { value: 'POTONG_2', label: 'Potong 2 Bagian' },
  { value: 'POTONG_3', label: 'Potong 3 Bagian' },
  { value: 'POTONG_4', label: 'Potong 4 Bagian' },
  { value: 'KERAT_GORENG', label: 'Kerat Sayat Badan (Siap Bumbu Goreng)' },
  { value: 'FILLET', label: 'Fillet Daging (Tanpa Duri)' },
  { value: 'CUSTOM', label: 'Potongan Khusus (Tulis di Catatan)' }
];

export function PrepOrderModal({
  isOpen,
  onClose,
  orderToEdit,
  currentUserId
}: PrepOrderModalProps) {
  const { addToast } = useToastStore();

  const todayStr = new Date().toISOString().split('T')[0];

  // Form states
  const [scheduledDate, setScheduledDate] = useState<string>(orderToEdit?.scheduledDate || todayStr);
  const [scheduledTime, setScheduledTime] = useState<string>(orderToEdit?.scheduledTime || '09:00');
  const [customerName, setCustomerName] = useState<string>(orderToEdit?.customerName || '');
  const [customerPhone, setCustomerPhone] = useState<string>(orderToEdit?.customerPhone || '');
  const [customerAddress, setCustomerAddress] = useState<string>(orderToEdit?.customerAddress || '');
  const [priority, setPriority] = useState<PrepOrderPriority>(orderToEdit?.priority || 'NORMAL');
  const [paymentStatus, setPaymentStatus] = useState<PrepPaymentStatus>(orderToEdit?.paymentStatus || 'UNPAID');
  const [downPayment, setDownPayment] = useState<string>(orderToEdit?.downPaymentAmount?.toString() || '0');
  const [generalNotes, setGeneralNotes] = useState<string>(orderToEdit?.generalNotes || '');

  // Items list
  const [items, setItems] = useState<Array<{
    productName: string;
    weightKg: string;
    sizeSpec: string;
    cleanScale: boolean;
    cleanGills: boolean;
    cleanGut: boolean;
    cuttingStyle: PrepCuttingStyle;
    customCuttingNotes: string;
  }>>(orderToEdit?.items?.map(it => ({
    productName: it.productName,
    weightKg: (it.weightKg ?? 1).toString(),
    sizeSpec: it.sizeSpec || 'Standar',
    cleanScale: Boolean(it.cleanScale),
    cleanGills: Boolean(it.cleanGills),
    cleanGut: Boolean(it.cleanGut),
    cuttingStyle: it.cuttingStyle || 'UTUH',
    customCuttingNotes: it.customCuttingNotes || ''
  })) || [
    {
      productName: 'Ikan Nila',
      weightKg: '5',
      sizeSpec: '1 kg isi 3-4 ekor (Sedang / Standar Bakar)',
      cleanScale: true,
      cleanGills: true,
      cleanGut: true,
      cuttingStyle: 'BELAH_BAKAR',
      customCuttingNotes: ''
    }
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch registered customers for auto-completion
  const customers = useLiveQuery(() => db.customers.toArray(), []);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        productName: 'Ikan Nila',
        weightKg: '3',
        sizeSpec: '1 kg isi 3-4 ekor (Sedang / Standar Bakar)',
        cleanScale: true,
        cleanGills: true,
        cleanGut: true,
        cuttingStyle: 'UTUH',
        customCuttingNotes: ''
      }
    ]);
  };

  const handleUpdateItem = (index: number, field: string, value: any) => {
    setItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      addToast('Minimal harus ada 1 jenis ikan yang dipesan', 'warning');
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSelectCustomer = (cId: string) => {
    const cust = customers?.find(c => c.customerId === cId);
    if (cust) {
      setCustomerName(cust.name);
      setCustomerPhone(cust.phone || '');
    }
  };

  const totalWeightKg = items.reduce((acc, it) => acc + (parseFloat(it.weightKg) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim()) {
      addToast('Nama pemesan harus diisi', 'warning');
      return;
    }

    if (!scheduledDate) {
      addToast('Tanggal jadwal harus diisi', 'warning');
      return;
    }

    for (const item of items) {
      const w = parseFloat(item.weightKg);
      if (isNaN(w) || w <= 0) {
        addToast(`Berat untuk ${item.productName} harus lebih dari 0 kg`, 'warning');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (orderToEdit) {
        await PrepOrderService.updateOrder(orderToEdit.orderId, {
          scheduledDate,
          scheduledTime,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerAddress: customerAddress.trim(),
          priority,
          paymentStatus,
          downPaymentAmount: parseFloat(downPayment) || 0,
          generalNotes: generalNotes.trim(),
          items: items.map((it, idx) => ({
            itemId: orderToEdit.items[idx]?.itemId || `item-${Date.now()}-${idx}`,
            productName: it.productName,
            weightKg: parseFloat(it.weightKg) || 0,
            sizeSpec: it.sizeSpec,
            cleanScale: it.cleanScale,
            cleanGills: it.cleanGills,
            cleanGut: it.cleanGut,
            cuttingStyle: it.cuttingStyle,
            customCuttingNotes: it.customCuttingNotes.trim()
          }))
        });
        addToast('Jadwal pemesanan berhasil diperbarui', 'success');
      } else {
        await PrepOrderService.createOrder({
          scheduledDate,
          scheduledTime,
          customerName,
          customerPhone,
          customerAddress,
          priority,
          paymentStatus,
          downPaymentAmount: parseFloat(downPayment) || 0,
          generalNotes,
          createdBy: currentUserId,
          items: items.map(it => ({
            productName: it.productName,
            weightKg: parseFloat(it.weightKg) || 0,
            sizeSpec: it.sizeSpec,
            cleanScale: it.cleanScale,
            cleanGills: it.cleanGills,
            cleanGut: it.cleanGut,
            cuttingStyle: it.cuttingStyle,
            customCuttingNotes: it.customCuttingNotes.trim()
          }))
        });
        addToast('Jadwal pemesanan ikan berhasil ditambahkan ke To-Do List!', 'success');
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || 'Gagal menyimpan pesanan', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-xs">
              <Calendar size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                {orderToEdit ? 'Ubah Jadwal Pemesanan Ikan' : 'Buat Jadwal Pemesanan Ikan (To-Do List)'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Catat rencana pesanan: tanggal, jenis ikan, bobot, grading ukuran &amp; jenis potong.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Section 1: Target Waktu & Prioritas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-blue-50/40 border border-blue-200/50 rounded-2xl">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Tanggal Pengambilan
              </label>
              <input
                type="date"
                required
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Jam Target Selesai
              </label>
              <input
                type="time"
                required
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Tingkat Prioritas
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PrepOrderPriority)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
              >
                <option value="NORMAL">Normal</option>
                <option value="URGENT">Mendesak (Urgent)</option>
                <option value="VIP_EVENT">Acara Pesta / Hajatan</option>
              </select>
            </div>
          </div>

          {/* Section 2: Data Pemesan */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <User size={15} className="text-blue-600" />
                Data Pemesan
              </label>
              {customers && customers.length > 0 && (
                <select
                  onChange={(e) => handleSelectCustomer(e.target.value)}
                  className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200"
                  defaultValue=""
                >
                  <option value="" disabled>-- Pilih dari Database Pelanggan --</option>
                  {customers.map(c => (
                    <option key={c.customerId} value={c.customerId}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Nama Pemesan (contoh: Ibu Ratna / Rumah Makan Sedap)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Nomor Telepon / WhatsApp (opsional)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Section 3: Daftar Ikan & Instruksi Pengolahan */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Fish size={16} className="text-indigo-600" />
                  Rincian Ikan &amp; Instruksi Pengolahan
                </label>
                <p className="text-[11px] text-slate-500">
                  Total Berat: <strong className="text-indigo-700 font-bold">{totalWeightKg} Kg</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-xs"
              >
                <Plus size={15} /> Tambah Ikan Lain
              </button>
            </div>

            {items.map((item, idx) => (
              <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 relative">
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="absolute right-3 top-3 p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Hapus baris ini"
                  >
                    <Trash2 size={16} />
                  </button>
                )}

                {/* Jenis Ikan & Bobot */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                      Komoditas Ikan #{idx + 1}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Nama Ikan (misal: Ikan Nila Hitam)"
                      value={item.productName}
                      onChange={(e) => handleUpdateItem(idx, 'productName', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                    />
                    {/* Quick Fish Chips */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {COMMON_FISH.map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => handleUpdateItem(idx, 'productName', f)}
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-md border transition-all ${
                            item.productName === f 
                              ? 'bg-blue-600 text-white border-blue-600' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                      Jumlah Berat (Kg)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        required
                        placeholder="0"
                        value={item.weightKg}
                        onChange={(e) => handleUpdateItem(idx, 'weightKg', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-900 tabular-nums"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                        Kg
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ukuran Grading (Berapa ekor per kg) */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Scale size={13} className="text-blue-600" />
                    Spesifikasi Ukuran / Grading (Berapa Ekor per Kg)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 1 kg isi 3-4 ekor"
                    value={item.sizeSpec}
                    onChange={(e) => handleUpdateItem(idx, 'sizeSpec', e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                  />
                  {/* Preset grading chips */}
                  <div className="flex flex-wrap gap-1">
                    {SIZE_PRESETS.map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleUpdateItem(idx, 'sizeSpec', preset)}
                        className={`text-[9px] font-semibold px-2 py-0.5 rounded border transition-colors ${
                          item.sizeSpec === preset
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {preset.split(' (')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Checklist Kebersihan & Potongan */}
                <div className="pt-2 border-t border-slate-200/80 space-y-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                    Instruksi Pembersihan &amp; Jenis Potongan:
                  </span>

                  <div className="flex flex-wrap gap-4 text-xs font-bold text-slate-700">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.cleanScale}
                        onChange={(e) => handleUpdateItem(idx, 'cleanScale', e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>Dibersihkan Sisik</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.cleanGut}
                        onChange={(e) => handleUpdateItem(idx, 'cleanGut', e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>Dikeluarkan Isi Perut</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.cleanGills}
                        onChange={(e) => handleUpdateItem(idx, 'cleanGills', e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>Dibuang Insang</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Jenis Potongan</label>
                      <select
                        value={item.cuttingStyle}
                        onChange={(e) => handleUpdateItem(idx, 'cuttingStyle', e.target.value as PrepCuttingStyle)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                      >
                        {CUTTING_STYLES.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Catatan Khusus Potong (Opsional)</label>
                      <input
                        type="text"
                        placeholder="Contoh: Kepala dibelah, badan sayat 3 kali"
                        value={item.customCuttingNotes}
                        onChange={(e) => handleUpdateItem(idx, 'customCuttingNotes', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Section 4: Uang Muka (DP) & Catatan Umum */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                Status Pembayaran / DP
              </label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PrepPaymentStatus)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
              >
                <option value="UNPAID">Belum Bayar (Bayar saat ambil)</option>
                <option value="DOWN_PAYMENT">Ada Uang Muka (DP)</option>
                <option value="PAID">Lunas (Sudah Dibayar)</option>
              </select>

              {paymentStatus === 'DOWN_PAYMENT' && (
                <div className="pt-1">
                  <input
                    type="number"
                    placeholder="Nominal DP (Rp)"
                    value={downPayment}
                    onChange={(e) => setDownPayment(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-blue-700"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                Catatan Umum Pesanan
              </label>
              <textarea
                rows={2}
                placeholder="Catatan packing, jam antar kurir, dll..."
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-blue-200 disabled:opacity-50"
            >
              {isSubmitting ? 'Menyimpan...' : (orderToEdit ? 'Simpan Perubahan' : 'Jadwalkan Pesanan')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
