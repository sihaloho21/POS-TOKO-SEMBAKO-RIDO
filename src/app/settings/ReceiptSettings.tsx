import React, { useState, useEffect } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ReceiptSettings as ReceiptSettingsType } from '@/core/types';
import { BackupService } from '@/core/services/backup-service';
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
  Download
} from 'lucide-react';

const DEFAULT_SETTINGS: ReceiptSettingsType = {
  id: 'current',
  storeName: 'TOKO HARAPAN JAYA',
  address: 'Jl. Raya Cikande No. 123',
  phone: '0812-3456-7890',
  footerMessage: 'Terima kasih telah berbelanja!',
  showPoints: true,
  showSavings: true,
  paperWidth: '58mm'
};

export default function ReceiptSettings() {
  const [formData, setFormData] = useState<ReceiptSettingsType>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const existingSettings = useLiveQuery(() => db.settings.get('current'));

  useEffect(() => {
    if (existingSettings) {
      setFormData(existingSettings);
    }
  }, [existingSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await db.settings.put(formData);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Gagal menyimpan pengaturan.');
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
                  value={formData.storeName || ''}
                  onChange={e => setFormData({ ...formData, storeName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alamat</label>
                <textarea 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                  value={formData.address || ''}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nomor Telepon</label>
                <input 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.phone || ''}
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
                  value={formData.footerMessage || ''}
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
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-white border border-slate-200 text-slate-900 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                >
                  <Download size={18} className="text-blue-600" />
                  Backup Now (.zip)
                </button>
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
                <p className="mt-2 text-[8px] opacity-50">Powered by Harapan Jaya POS</p>
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
