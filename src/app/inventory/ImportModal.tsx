import React, { useState } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { ImportService, type ImportResult } from '@/core/services/import-service';

interface ImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportModal({ onClose, onSuccess }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setIsImporting(true);
    try {
      const res = await ImportService.importProductsFromCSV(file);
      setResult(res);
      if (res.success > 0) {
        onSuccess();
      }
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <Upload size={20} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 uppercase tracking-tight">Bulk Import Produk</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Unggah file CSV untuk tambah produk masal</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto">
          {!result ? (
            <div className="space-y-6">
              <div 
                className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center transition-all ${
                  file ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  id="csv-upload" 
                  onChange={handleFileChange}
                />
                <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${file ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    <FileText size={32} />
                  </div>
                  <div className="text-center">
                    <p className="font-black text-slate-900 uppercase tracking-tight">
                      {file ? file.name : 'Pilih File CSV'}
                    </p>
                    <p className="text-xs text-slate-500 font-medium mt-1">Klik untuk menelusuri atau seret file ke sini</p>
                  </div>
                </label>
              </div>

              <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl">
                <h4 className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <AlertCircle size={14} /> Petunjuk Import
                </h4>
                <ul className="text-[10px] text-amber-800 space-y-1 font-medium list-disc pl-4">
                  <li>Gunakan format CSV (Comma Separated Values).</li>
                  <li>Header kolom harus sesuai dengan template.</li>
                  <li>Kolom <b>name</b> dan <b>normalPrice</b> wajib diisi.</li>
                  <li>Initial stock akan langsung dicatat ke inventaris.</li>
                </ul>
                <button 
                  onClick={() => ImportService.downloadTemplate()}
                  className="mt-4 text-[10px] font-black text-amber-700 uppercase tracking-widest hover:underline"
                >
                  Download Template CSV
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center gap-4 p-6 rounded-3xl bg-slate-50 border border-slate-100">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${result.success > 0 ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                  {result.success > 0 ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                </div>
                <div>
                  <h4 className="font-black text-slate-900 uppercase tracking-tight">Import Selesai</h4>
                  <p className="text-xs font-bold text-slate-500">
                    <span className="text-emerald-600">{result.success} Berhasil</span>, 
                    <span className="text-rose-600"> {result.failed} Gagal</span>
                  </p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detail Kesalahan:</h5>
                  <div className="max-h-[200px] overflow-y-auto p-4 bg-rose-50 border border-rose-100 rounded-2xl space-y-1">
                    {result.errors.map((err, i) => (
                      <p key={i} className="text-[10px] font-bold text-rose-700">{err}</p>
                    ))}
                  </div>
                </div>
              )}

              <button 
                onClick={onClose}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl"
              >
                Tutup
              </button>
            </div>
          )}
        </div>

        {!result && (
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 py-3 px-6 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
            >
              Batal
            </button>
            <button 
              onClick={handleImport}
              disabled={!file || isImporting}
              className="flex-[2] py-3 px-6 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-200 disabled:bg-slate-200 flex items-center justify-center gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Mulai Import
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
