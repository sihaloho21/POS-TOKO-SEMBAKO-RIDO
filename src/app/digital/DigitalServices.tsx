import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Smartphone, 
  Zap, 
  Wifi, 
  Send, 
  ArrowDownToLine, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Banknote,
  Sliders,
  X,
  Lock,
  Sparkles,
  Info
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAuthStore } from '@/core/auth-store';
import { AuditEngine } from '@/core/audit-engine';
import { useDeviceId } from '@/core/device-store';
import { useToastStore } from '@/core/toast-store';
import type { DigitalServiceType } from '@/core/types';
import { 
  DigitalFeeService, 
  DIGITAL_FEE_SETTINGS_ID, 
  DEFAULT_DIGITAL_FEE_SETTINGS 
} from '@/core/services/digital-fee-service';
import DigitalFeeSettings from '../settings/DigitalFeeSettings';

type ServiceType = DigitalServiceType;

const SERVICES: { type: ServiceType; label: string; icon: any; color: string }[] = [
  { type: 'PULSA', label: 'Pulsa', icon: <Smartphone size={24} />, color: 'bg-blue-500' },
  { type: 'PAKET_DATA', label: 'Paket Data', icon: <Wifi size={24} />, color: 'bg-indigo-500' },
  { type: 'TOKEN_LISTRIK', label: 'Token PLN', icon: <Zap size={24} />, color: 'bg-amber-500' },
  { type: 'TRANSFER', label: 'Transfer Bank', icon: <Send size={24} />, color: 'bg-emerald-500' },
  { type: 'TOPUP', label: 'Top Up E-Wallet', icon: <Smartphone size={24} />, color: 'bg-purple-500' },
  { type: 'TARIK_TUNAI', label: 'Tarik Tunai', icon: <ArrowDownToLine size={24} />, color: 'bg-rose-500' },
];

export default function DigitalServices() {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const deviceId = useDeviceId();
  const isOwner = currentUser?.role === 'OWNER';

  const [selectedType, setSelectedType] = useState<ServiceType | null>(null);
  const [formData, setFormData] = useState({ ref: '', principal: '', fee: '2000' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Live subscription to digital fee settings from database
  const liveSettings = useLiveQuery(() => db.settings.get(DIGITAL_FEE_SETTINGS_ID));
  const feeSettings = liveSettings || DEFAULT_DIGITAL_FEE_SETTINGS;

  const recentServices = useLiveQuery(() => db.digitalServices.orderBy('serviceId').reverse().limit(10).toArray());

  // Realtime fee calculation based on selectedType and principal
  const calculatedFeeInfo = useMemo(() => {
    if (!selectedType) return null;
    const principalNum = Number(formData.principal) || 0;
    return DigitalFeeService.calculateFee(selectedType, principalNum, feeSettings);
  }, [selectedType, formData.principal, feeSettings]);

  // Automatically sync fee input when service or principal changes
  useEffect(() => {
    if (calculatedFeeInfo && selectedType) {
      setFormData(prev => ({
        ...prev,
        fee: String(calculatedFeeInfo.fee)
      }));
    }
  }, [selectedType, formData.principal, calculatedFeeInfo?.fee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !currentUser) return;

    const principal = Number(formData.principal);
    const fee = Number(formData.fee);
    if (principal <= 0 || fee < 0) {
      addToast('Masukkan nominal pokok dan biaya admin yang valid.', 'error');
      return;
    }

    setIsProcessing(true);
    const serviceId = uuidv4();
    const transactionId = uuidv4();
    const timestamp = new Date().toISOString();
    const total = principal + fee;

    try {
      const serviceData = {
        serviceId,
        transactionId,
        serviceType: selectedType,
        customerReference: formData.ref,
        principal,
        fee,
        total,
        status: 'SUCCESS' as const
      };

      // 1. Save Service Record
      await db.digitalServices.add(serviceData);

      // 2. Finance Events: Strictly UANG_DIGITAL storage vault (Pemisahan 4 Kas Toko: WARUNG, IKAN, BUAH, UANG_DIGITAL)
      const financeEvents: any[] = [];
      const serviceLabel = SERVICES.find(s => s.type === selectedType)?.label || selectedType;

      if (selectedType === 'TARIK_TUNAI') {
        // Tarik Tunai: Uang masuk saldo rekening/e-wallet pos digital & uang fisik ditarik dari kas digital toko
        financeEvents.push({
          financeEventId: uuidv4(),
          amount: principal,
          storageId: 'UANG_DIGITAL',
          direction: 'IN',
          referenceId: serviceId,
          referenceType: 'INTERNAL_TRANSFER',
          description: `Tarik Tunai Masuk Saldo Digital (${formData.ref})`,
          userId: currentUser.userId,
          deviceId,
          timestamp
        });
        financeEvents.push({
          financeEventId: uuidv4(),
          amount: principal,
          storageId: 'UANG_DIGITAL',
          direction: 'OUT',
          referenceId: serviceId,
          referenceType: 'INTERNAL_TRANSFER',
          description: `Penyerahan Tunai Tarik Tunai (${formData.ref})`,
          userId: currentUser.userId,
          deviceId,
          timestamp
        });
        if (fee > 0) {
          financeEvents.push({
            financeEventId: uuidv4(),
            amount: fee,
            storageId: 'UANG_DIGITAL',
            direction: 'IN',
            referenceId: serviceId,
            referenceType: 'SERVICE_REVENUE',
            description: `Biaya Admin Tarik Tunai (${formData.ref})`,
            userId: currentUser.userId,
            deviceId,
            timestamp
          });
        }
      } else {
        // PULSA / PAKET_DATA / TOKEN_LISTRIK / TOPUP / TRANSFER:
        // Seluruh mutasi pokok dan fee admin masuk eksklusif ke storage UANG_DIGITAL (Kas Digital)
        financeEvents.push({
          financeEventId: uuidv4(),
          amount: principal,
          storageId: 'UANG_DIGITAL',
          direction: 'OUT',
          referenceId: serviceId,
          referenceType: 'INTERNAL_TRANSFER',
          description: `Potong Saldo Digital ${serviceLabel} (${formData.ref})`,
          userId: currentUser.userId,
          deviceId,
          timestamp
        });
        financeEvents.push({
          financeEventId: uuidv4(),
          amount: principal,
          storageId: 'UANG_DIGITAL',
          direction: 'IN',
          referenceId: serviceId,
          referenceType: 'INTERNAL_TRANSFER',
          description: `Terima Tunai Pokok ${serviceLabel} (${formData.ref})`,
          userId: currentUser.userId,
          deviceId,
          timestamp
        });
        if (fee > 0) {
          financeEvents.push({
            financeEventId: uuidv4(),
            amount: fee,
            storageId: 'UANG_DIGITAL',
            direction: 'IN',
            referenceId: serviceId,
            referenceType: 'SERVICE_REVENUE',
            description: `Pendapatan Jasa / Fee ${serviceLabel} (${formData.ref})`,
            userId: currentUser.userId,
            deviceId,
            timestamp
          });
        }
      }

      for (const fe of financeEvents) {
        await db.financeEvents.add(fe);
        await db.syncQueue.add({
          entityType: 'financeEvents',
          entityId: fe.financeEventId,
          action: 'CREATE',
          payload: fe,
          status: 'PENDING',
          retryCount: 0,
          createdAt: timestamp
        });
      }

      // 3. Audit
      await AuditEngine.log({
        userId: currentUser.userId,
        role: currentUser.role,
        deviceId,
        action: 'CREATE_DIGITAL_SERVICE',
        module: 'DIGITAL',
        referenceId: serviceId,
        after: { ...serviceData, financeEventsCount: financeEvents.length }
      });

      // 4. Queue Sync
      await db.syncQueue.add({
        entityType: 'digitalServices',
        entityId: serviceId,
        action: 'CREATE',
        payload: serviceData,
        status: 'PENDING',
        retryCount: 0,
        createdAt: timestamp
      });

      setFormData({ ref: '', principal: '', fee: '2000' });
      setSelectedType(null);
      addToast(`Layanan Digital (${serviceLabel}) berhasil dicatat ke buku kas!`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Gagal memproses layanan digital.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const isFeeLocked = !feeSettings?.allowCashierManualOverride && !isOwner;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Layanan Digital</h2>
          <p className="text-slate-500 text-sm font-medium">Pulsa, Paket Data, Token Listrik, dan Transaksi Finansial (Transfer, Top-up, Tarik Tunai).</p>
        </div>

        {isOwner && (
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md shadow-indigo-200 transition-all hover:scale-105 active:scale-95 shrink-0"
          >
            <Sliders size={16} />
            ⚙️ Atur Tarif & Biaya Admin (Tiered)
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        {SERVICES.map((s) => (
          <button
            key={s.type}
            onClick={() => setSelectedType(s.type)}
            className={`flex flex-col items-center justify-center p-6 rounded-3xl border-2 transition-all ${
              selectedType === s.type ? 'border-blue-500 bg-blue-50 shadow-lg' : 'border-slate-100 bg-white hover:border-blue-200'
            }`}
          >
            <div className={`w-12 h-12 ${s.color} text-white rounded-2xl flex items-center justify-center mb-3 shadow-lg`}>
              {s.icon}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form */}
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm h-fit">
          {!selectedType ? (
            <div className="py-20 text-center text-slate-300">
              <Banknote size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-sm font-bold uppercase tracking-widest">Pilih jenis layanan di atas</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl bg-blue-500 text-white`}>
                    {SERVICES.find(s => s.type === selectedType)?.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                      {SERVICES.find(s => s.type === selectedType)?.label}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {calculatedFeeInfo?.pricingModel === 'TIERED' ? 'Model Tarif Bertingkat (Nominal-Based)' : 'Model Tarif Flat'}
                    </p>
                  </div>
                </div>

                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(true)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 p-1 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Ubah aturan tarif untuk layanan ini"
                  >
                    <Sliders size={13} />
                    Ubah Tarif
                  </button>
                )}
              </div>

              {/* Dynamic Tier Indicator Banner */}
              {calculatedFeeInfo && (
                <div className="p-3 bg-gradient-to-r from-slate-50 to-indigo-50/50 rounded-2xl border border-indigo-100 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-amber-500 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        {calculatedFeeInfo.pricingModel === 'TIERED' ? (
                          <>
                            <span>Tier Aktif:</span>
                            <span className="text-indigo-700 font-black">
                              {calculatedFeeInfo.matchedTier?.label || 'Rentang Standar'}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-800">Tarif Flat Tetap</span>
                        )}
                      </div>
                      {calculatedFeeInfo.matchedTier && (
                        <div className="text-[10px] text-slate-500">
                          Rentang Rp {Number(calculatedFeeInfo.matchedTier.minAmount).toLocaleString('id-ID')} s/d {calculatedFeeInfo.matchedTier.maxAmount > 0 ? `Rp ${Number(calculatedFeeInfo.matchedTier.maxAmount).toLocaleString('id-ID')}` : 'Tanpa Batas (∞)'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-black text-[11px] inline-block">
                      Fee: Rp {calculatedFeeInfo.fee.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nomor Tujuan / Referensi</label>
                <input
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900"
                  value={formData.ref ?? ''}
                  onChange={(e) => setFormData({ ...formData, ref: e.target.value })}
                  placeholder="0812xxxx atau ID Pelanggan / Rekening"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nominal Pokok (Principal)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Contoh: 50000"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 tabular-nums"
                    value={formData.principal ?? ''}
                    onChange={(e) => setFormData({ ...formData, principal: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Biaya Admin (Fee)</label>
                    {isFeeLocked && (
                      <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Lock size={10} /> Auto
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    required
                    readOnly={isFeeLocked}
                    className={`w-full px-4 py-3 rounded-xl border tabular-nums font-bold text-slate-900 ${
                      isFeeLocked
                        ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                        : 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none'
                    }`}
                    value={formData.fee ?? ''}
                    onChange={(e) => {
                      if (!isFeeLocked) {
                        setFormData({ ...formData, fee: e.target.value });
                      }
                    }}
                  />
                  {isFeeLocked && (
                    <p className="text-[10px] text-slate-400">
                      Terkunci sesuai pengaturan tarif Owner.
                    </p>
                  )}
                </div>
              </div>

              <div className="p-4 bg-slate-900 rounded-2xl text-white flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Transaksi</span>
                <span className="text-xl font-black tabular-nums text-emerald-400">
                  Rp {(Number(formData.principal || 0) + Number(formData.fee || 0)).toLocaleString('id-ID')}
                </span>
              </div>

              <button
                disabled={isProcessing}
                className="w-full py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-500 shadow-lg shadow-blue-200 transition-all disabled:bg-slate-200 disabled:text-slate-400"
              >
                {isProcessing ? 'Memproses...' : 'Kirim / Proses Transaksi'}
              </button>
            </form>
          )}
        </div>

        {/* History */}
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">Aktivitas Terakhir</h3>
            <Clock size={18} className="text-slate-400" />
          </div>
          <div className="divide-y divide-slate-100">
            {recentServices?.length === 0 ? (
              <div className="py-10 text-center text-slate-300 text-xs font-bold uppercase tracking-widest">Belum ada aktivitas</div>
            ) : (
              recentServices?.map((s) => (
                <div key={s.serviceId} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-100 text-slate-600">
                      {SERVICES.find(srv => srv.type === s.serviceType)?.icon || <Banknote size={16} />}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900">{s.customerReference}</div>
                      <div className="text-[10px] text-slate-400 font-semibold">{s.serviceType}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-xs text-slate-900 tabular-nums">Rp {s.total?.toLocaleString('id-ID')}</div>
                    <div className="text-[10px] text-emerald-600 font-bold tabular-nums">+Fee Rp {s.fee?.toLocaleString('id-ID')}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal Pengaturan Biaya Admin (Owner Only) */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-50 rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => setShowSettingsModal(false)}
              className="absolute top-6 right-6 p-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors z-20"
              title="Tutup Modal Pengaturan"
            >
              <X size={20} />
            </button>

            <div className="mt-2">
              <DigitalFeeSettings />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
