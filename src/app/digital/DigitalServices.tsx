import React, { useState } from 'react';
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
  Banknote
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAuthStore } from '@/core/auth-store';
import { AuditEngine } from '@/core/audit-engine';
import { useDeviceId } from '@/core/device-store';
import { useToastStore } from '@/core/toast-store';

type ServiceType = 'PULSA' | 'PAKET_DATA' | 'TOKEN_LISTRIK' | 'TOPUP' | 'TRANSFER' | 'TARIK_TUNAI';

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
  const [selectedType, setSelectedType] = useState<ServiceType | null>(null);
  const [formData, setFormData] = useState({ ref: '', principal: '', fee: '2000' });
  const [isProcessing, setIsProcessing] = useState(false);

  const recentServices = useLiveQuery(() => db.digitalServices.orderBy('serviceId').reverse().limit(10).toArray());

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

      // 2. Finance Events (PRD 29 & 64: Proper Double-Entry Cash vs Digital Storage Accounting)
      const financeEvents: any[] = [];
      const serviceLabel = SERVICES.find(s => s.type === selectedType)?.label || selectedType;

      if (selectedType === 'TARIK_TUNAI') {
        // Tarik Tunai: Customer transfers (principal + fee) into UANG_DIGITAL, receives physical cash (principal) from WARUNG
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
          storageId: 'WARUNG',
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
        // Customer pays cash (principal + fee) into WARUNG, store deducts principal from UANG_DIGITAL
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
          storageId: 'WARUNG',
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
            storageId: 'WARUNG',
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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Layanan Digital</h2>
        <p className="text-slate-500 text-sm font-medium">Pulsa, Paket Data, Token Listrik, dan Top-up.</p>
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
              <div className="flex items-center gap-3 mb-6">
                <div className={`p-3 rounded-xl bg-blue-500 text-white`}>
                  {SERVICES.find(s => s.type === selectedType)?.icon}
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  {SERVICES.find(s => s.type === selectedType)?.label}
                </h3>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nomor Tujuan / Referensi</label>
                <input
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900"
                  value={formData.ref ?? ''}
                  onChange={(e) => setFormData({ ...formData, ref: e.target.value })}
                  placeholder="0812xxxx atau ID Pelanggan"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nominal (Principal)</label>
                  <input
                    type="number"
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 tabular-nums"
                    value={formData.principal ?? ''}
                    onChange={(e) => setFormData({ ...formData, principal: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Biaya Admin (Fee)</label>
                  <input
                    type="number"
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 tabular-nums"
                    value={formData.fee ?? ''}
                    onChange={(e) => setFormData({ ...formData, fee: e.target.value })}
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-900 rounded-2xl text-white flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Bayar</span>
                <span className="text-xl font-black tabular-nums">
                  Rp {(Number(formData.principal || 0) + Number(formData.fee || 0)).toLocaleString()}
                </span>
              </div>

              <button
                disabled={isProcessing}
                className="w-full py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-500 shadow-lg shadow-blue-200 transition-all disabled:bg-slate-200 disabled:text-slate-400"
              >
                {isProcessing ? 'Memproses...' : 'Kirim / Proses'}
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
                    <div className={`p-2 rounded-lg ${SERVICES.find(serv => serv.type === s.serviceType)?.color} text-white`}>
                      {SERVICES.find(serv => serv.type === s.serviceType)?.icon}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{s.customerReference}</p>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{s.serviceType}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-900 tabular-nums">Rp {s.total.toLocaleString()}</p>
                    <div className="flex items-center gap-1 justify-end text-[10px] font-bold text-emerald-500 uppercase">
                      <CheckCircle size={10} />
                      {s.status}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
