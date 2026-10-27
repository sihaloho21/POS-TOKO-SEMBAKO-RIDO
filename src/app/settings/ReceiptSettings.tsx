import React, { useState, useEffect } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ReceiptSettings as ReceiptSettingsType } from '@/core/types';
import { BackupService } from '@/core/services/backup-service';
import { useToastStore } from '@/core/toast-store';
import { 
  Printer, 
  Store, 
  MapPin, 
  Phone, 
  Save, 
  CheckCircle,
  FileText,
  AlignLeft,
  Layout,
  Database,
  Download,
  RefreshCw,
  CloudDownload,
  CloudUpload,
  Sparkles,
  LogIn,
  LogOut,
  ShieldAlert
} from 'lucide-react';
import { CloudSyncService } from '@/core/services/cloud-sync-service';
import { CloudAuthService, useCloudAuthStore } from '@/core/services/cloud-auth-service';
import { auth } from '@/firebase/config';
import { useAuthStore } from '@/core/auth-store';
import { useDeviceId } from '@/core/device-store';

const DEFAULT_SETTINGS: ReceiptSettingsType = {
  id: 'current',
  storeName: 'PAKET SEMBAKO',
  address: 'Jl. Raya Cikande No. 123',
  phone: '0812-3456-7890',
  footerMessage: 'Terima kasih telah berbelanja!',
  showPoints: true,
  showSavings: true,
  paperWidth: '58mm'
};

export default function ReceiptSettings() {
  const { addToast } = useToastStore();
  const { currentUser } = useAuthStore();
  const { firebaseUser, isCloudConnected } = useCloudAuthStore();
  const deviceId = useDeviceId();
  const [formData, setFormData] = useState<ReceiptSettingsType>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isPullingCloud, setIsPullingCloud] = useState(false);
  const [isPushingCloud, setIsPushingCloud] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);

  const pendingQueueCount = useLiveQuery(() => db.syncQueue.where('status').anyOf(['PENDING', 'FAILED', 'SYNCING']).count());

  const handleConnectGoogle = async () => {
    setIsConnectingGoogle(true);
    try {
      await CloudAuthService.loginWithGoogle(currentUser?.role || 'OWNER', currentUser?.name);
      addToast('Akun Google berhasil terhubung! Izin Cloud Firestore aktif.', 'success');
    } catch (err: any) {
      if (err?.message?.includes('popup-closed-by-user')) {
        addToast('Login Google dibatalkan.', 'info');
      } else {
        addToast(err?.message || 'Gagal menghubungkan Google Cloud.', 'error');
      }
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handlePullCloud = async () => {
    setIsPullingCloud(true);
    try {
      if (!auth.currentUser) {
        addToast('Menghubungkan akun Cloud...', 'info');
        await CloudAuthService.loginWithGoogle(currentUser?.role || 'OWNER', currentUser?.name);
      }
      const stats = await CloudSyncService.pullAllFromCloud(currentUser?.userId, deviceId);
      addToast(`Sinkronisasi Sukses! ${stats.totalDocs} data telah diselaraskan dari Cloud.`, 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes('popup-closed-by-user')) {
        addToast('Login Google dibatalkan. Hubungkan Google agar dapat menarik data Cloud.', 'error');
      } else {
        addToast(err?.message || 'Gagal menarik data dari Cloud.', 'error');
      }
    } finally {
      setIsPullingCloud(false);
    }
  };

  const handlePushQueue = async () => {
    setIsPushingCloud(true);
    try {
      if (!auth.currentUser) {
        addToast('Menghubungkan akun Cloud...', 'info');
        await CloudAuthService.loginWithGoogle(currentUser?.role || 'OWNER', currentUser?.name);
      }
      const res = await CloudSyncService.pushAllPendingQueue();
      if (res.remainingCount === 0) {
        addToast(`Seluruh ${res.processedCount} antrian berhasil diunggah ke Cloud!`, 'success');
      } else {
        addToast(`${res.processedCount} terunggah. Tersisa ${res.remainingCount} antrian.`, 'info');
      }
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes('popup-closed-by-user')) {
        addToast('Login Google dibatalkan. Hubungkan Google agar dapat mengunggah antrian.', 'error');
      } else {
        addToast(err?.message || 'Gagal mengunggah antrian ke Cloud.', 'error');
      }
    } finally {
      setIsPushingCloud(false);
    }
  };

  const existingSettings = useLiveQuery(() => db.settings.get('current'));

  useEffect(() => {
    if (existingSettings) {
      const normalizedStoreName =
        !existingSettings.storeName || existingSettings.storeName === 'TOKO HARAPAN JAYA'
          ? DEFAULT_SETTINGS.storeName
          : existingSettings.storeName;
      setFormData({
        ...DEFAULT_SETTINGS,
        ...existingSettings,
        storeName: normalizedStoreName,
        address: existingSettings.address || DEFAULT_SETTINGS.address,
        phone: existingSettings.phone || DEFAULT_SETTINGS.phone,
        footerMessage: existingSettings.footerMessage || DEFAULT_SETTINGS.footerMessage,
        paperWidth: existingSettings.paperWidth || DEFAULT_SETTINGS.paperWidth
      });
    }
  }, [existingSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await db.settings.put(formData);
      setShowSuccess(true);
      addToast('Pengaturan struk berhasil disimpan!', 'success');
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      addToast('Gagal menyimpan pengaturan.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Receipt Settings</h2>
          <p className="text-slate-500 text-sm font-medium">Atur tampilan struk dan branding toko Anda.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-200 disabled:bg-slate-200"
        >
          {isSaving ? 'Menyimpan...' : (
            <>
              <Save size={18} />
              Simpan Pengaturan
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Store size={20} className="text-blue-600" />
              Informasi Toko
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Toko</label>
                <input 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.storeName ?? ''}
                  onChange={e => setFormData({ ...formData, storeName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alamat</label>
                <textarea 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                  value={formData.address ?? ''}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nomor Telepon</label>
                <input 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.phone ?? ''}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Printer size={20} className="text-blue-600" />
              Thermal Printer
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lebar Kertas</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['58mm', '80mm'] as const).map(w => (
                    <button
                      key={w}
                      onClick={() => setFormData({ ...formData, paperWidth: w })}
                      className={`py-3 rounded-xl font-black text-xs uppercase tracking-widest border transition-all ${
                        formData.paperWidth === w ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pesan Penutup (Footer)</label>
                <textarea 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                  value={formData.footerMessage ?? ''}
                  onChange={e => setFormData({ ...formData, footerMessage: e.target.value })}
                />
              </div>
            </div>
          </div>
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Database size={20} className="text-blue-600" />
              Data Management
            </h3>
            
            <div className="space-y-4">
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight mb-2">Local Backup</h4>
                <p className="text-[10px] text-slate-500 font-medium mb-6 leading-relaxed">
                  Ekspor seluruh basis data lokal (IndexedDB) ke dalam format ZIP terkompresi. Simpan file ini sebagai cadangan manual di perangkat Anda.
                </p>
                <button 
                  onClick={() => BackupService.createBackup()}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-white border border-slate-200 text-slate-900 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm mb-3"
                >
                  <Download size={18} className="text-blue-600" />
                  Backup Now (.zip)
                </button>

                <div className="relative">
                  <input 
                    type="file" 
                    accept=".zip"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          await BackupService.restoreBackup(file);
                          addToast('Data berhasil direstorasi! Memuat ulang aplikasi...', 'success');
                          setTimeout(() => window.location.reload(), 1200);
                        } catch (err) {
                          console.error(err);
                          addToast('Gagal merestorasi data: ' + (err as Error).message, 'error');
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <button className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-slate-100 border border-slate-200 text-slate-500 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">
                    <RefreshCw size={18} />
                    Restore From Backup
                  </button>
                </div>
              </div>

              {/* Cloud Sync Multi-Perangkat */}
              <div className="p-6 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 rounded-2xl border border-indigo-500/30 text-white space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CloudDownload size={18} className="text-indigo-400" />
                    <h4 className="text-xs font-black uppercase tracking-tight text-white">Cloud Sync (PC & Laptop)</h4>
                  </div>
                  <span className="text-[9px] font-black tracking-widest text-emerald-300 bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 rounded-md flex items-center gap-1 uppercase">
                    <Sparkles size={9} /> Firestore
                  </span>
                </div>
                
                <p className="text-[10px] text-slate-300 font-medium leading-relaxed">
                  Sinkronkan data secara langsung tanpa perlu kirim file ZIP. Gunakan tombol di bawah pada laptop untuk menarik data terbaru dari PC kasir.
                </p>

                {/* Cloud Auth Status */}
                {isCloudConnected ? (
                  <div className="p-3 bg-emerald-500/15 border border-emerald-400/30 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-emerald-300 font-bold truncate max-w-[200px]">
                      ✓ {firebaseUser?.email || 'Cloud Terhubung'}
                    </span>
                    <button 
                      onClick={() => CloudAuthService.logout()}
                      className="text-[10px] text-slate-400 hover:text-rose-300 font-bold uppercase tracking-wider transition-colors"
                    >
                      Putuskan
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleConnectGoogle}
                    disabled={isConnectingGoogle}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer disabled:opacity-50"
                  >
                    <LogIn size={14} />
                    <span>{isConnectingGoogle ? 'Menghubungkan...' : 'Hubungkan Akun Google'}</span>
                  </button>
                )}

                <div className="space-y-2">
                  <button 
                    onClick={handlePullCloud}
                    disabled={isPullingCloud}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md shadow-indigo-600/30 disabled:opacity-50 cursor-pointer"
                  >
                    <CloudDownload size={16} className={isPullingCloud ? 'animate-bounce' : ''} />
                    <span>{isPullingCloud ? 'Menarik Data...' : 'Tarik Data dari Cloud'}</span>
                  </button>

                  <button 
                    onClick={handlePushQueue}
                    disabled={isPushingCloud || (pendingQueueCount === 0)}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-40 cursor-pointer"
                  >
                    <CloudUpload size={16} className={isPushingCloud ? 'animate-spin' : ''} />
                    <span>{isPushingCloud ? 'Mengunggah...' : `Unggah Antrian (${pendingQueueCount || 0})`}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Receipt Preview */}
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 sticky top-8">
            <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Layout size={20} className="text-blue-600" />
              Preview Struk
            </h3>
            
            <div className={`mx-auto bg-white border border-slate-100 shadow-2xl p-6 font-mono text-[11px] leading-tight text-slate-800 ${formData.paperWidth === '58mm' ? 'max-w-[220px]' : 'max-w-[300px]'}`}>
              <div className="text-center space-y-1 mb-4">
                <p className="font-bold text-sm uppercase">{formData.storeName}</p>
                <p className="whitespace-pre-line">{formData.address}</p>
                <p>Telp: {formData.phone}</p>
              </div>
              
              <div className="border-b border-dashed border-slate-200 my-2" />
              
              <div className="flex justify-between mb-1">
                <span>03/10/2026</span>
                <span>22:30</span>
              </div>
              <p className="mb-2">No: REC-172798...</p>
              
              <div className="border-b border-dashed border-slate-200 my-2" />
              
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between">
                    <span className="uppercase">BERAS PANDAN 5KG</span>
                    <span>1.00</span>
                  </div>
                  <div className="flex justify-between pl-2">
                    <span>@ 75,000</span>
                    <span>75,000</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between">
                    <span className="uppercase">TELUR AYAM</span>
                    <span>2.00</span>
                  </div>
                  <div className="flex justify-between pl-2">
                    <span>@ 30,000</span>
                    <span>60,000</span>
                  </div>
                </div>
              </div>

              <div className="border-b border-dashed border-slate-200 my-2" />

              <div className="space-y-1 font-bold">
                <div className="flex justify-between">
                  <span>TOTAL</span>
                  <span>135,000</span>
                </div>
                <div className="flex justify-between">
                  <span>CASH</span>
                  <span>150,000</span>
                </div>
                <div className="flex justify-between">
                  <span>CHANGE</span>
                  <span>15,000</span>
                </div>
              </div>

              <div className="border-b border-dashed border-slate-200 my-2" />
              
              <div className="text-center space-y-1 mt-4 italic">
                <p className="whitespace-pre-line">{formData.footerMessage}</p>
                <p className="mt-2 text-[8px] opacity-50">PAKET SEMBAKO</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSuccess && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle size={20} />
          <span className="font-bold text-sm uppercase tracking-widest">Pengaturan Berhasil Disimpan</span>
        </div>
      )}
    </div>
  );
}
