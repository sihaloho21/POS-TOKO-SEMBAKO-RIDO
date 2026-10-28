import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  ExternalLink, 
  Copy, 
  Check, 
  ShieldCheck, 
  Globe, 
  Key, 
  LogIn, 
  AlertTriangle, 
  Sparkles, 
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  RefreshCw,
  Info
} from 'lucide-react';
import { CloudAuthService, useCloudAuthStore } from '@/core/services/cloud-auth-service';
import { useAuthStore } from '@/core/auth-store';
import firebaseConfig from '../../../firebase-applet-config.json';

interface FirebaseAuthGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStep?: number;
}

export default function FirebaseAuthGuideModal({ isOpen, onClose, initialStep = 1 }: FirebaseAuthGuideModalProps) {
  const { currentUser } = useAuthStore();
  const { firebaseUser, isCloudConnected } = useCloudAuthStore();

  const [activeStep, setActiveStep] = useState<number>(initialStep);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isTestingAuth, setIsTestingAuth] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; code?: string } | null>(null);

  // Checklists saved in localStorage
  const [checklist, setChecklist] = useState<{ [key: string]: boolean }>(() => {
    try {
      const saved = localStorage.getItem('firebase_auth_wizard_checklist');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('firebase_auth_wizard_checklist', JSON.stringify(checklist));
    } catch (e) {
      console.warn('Failed to save checklist:', e);
    }
  }, [checklist]);

  useEffect(() => {
    if (isOpen) {
      setActiveStep(initialStep);
      setTestResult(null);
    }
  }, [isOpen, initialStep]);

  if (!isOpen) return null;

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const projectId = firebaseConfig.projectId || 'gen-lang-client-0877581905';
  const authDomain = firebaseConfig.authDomain || `${projectId}.firebaseapp.com`;
  const oauthClientId = firebaseConfig.oAuthClientId || '';
  const redirectUri = `https://${authDomain}/__/auth/handler`;

  // Standard domains for this environment
  const recommendedDomains = [
    currentHost,
    'ais-dev-szbpzi2lvtrsak5aozfftn-688145430200.asia-southeast1.run.app',
    'ais-pre-szbpzi2lvtrsak5aozfftn-688145430200.asia-southeast1.run.app',
    'localhost'
  ].filter((d, i, arr) => d && arr.indexOf(d) === i);

  const handleCopy = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const toggleCheck = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleTestConnection = async () => {
    setIsTestingAuth(true);
    setTestResult(null);
    try {
      const user = await CloudAuthService.loginWithGoogle(currentUser?.role || 'OWNER', currentUser?.name);
      setTestResult({
        success: true,
        message: `Koneksi Google Auth berhasil! Terhubung sebagai: ${user.email || user.displayName || user.uid}`
      });
      setChecklist(prev => ({ ...prev, 'step1': true, 'step2': true, 'step3': true, 'step4': true }));
    } catch (err: any) {
      console.error('Test connection error:', err);
      let errorMsg = err?.message || 'Gagal login Google';
      let code = 'UNKNOWN';

      if (errorMsg.includes('Authorized Domains') || errorMsg.includes('unauthorized-domain')) {
        code = 'UNAUTHORIZED_DOMAIN';
        errorMsg = `Domain ${currentHost} belum terdaftar di Firebase Console Authorized Domains. Silakan selesaikan Langkah 2.`;
      } else if (errorMsg.includes('popup-blocked')) {
        code = 'POPUP_BLOCKED';
        errorMsg = 'Jendela pop-up diblokir oleh browser. Harap izinkan pop-up pada tab browser ini.';
      } else if (errorMsg.includes('operation-not-allowed')) {
        code = 'OPERATION_NOT_ALLOWED';
        errorMsg = 'Google Sign-in Provider belum diaktifkan di Firebase Console. Harap selesaikan Langkah 1.';
      } else if (errorMsg.includes('popup-closed-by-user')) {
        code = 'POPUP_CLOSED';
        errorMsg = 'Jendela login ditutup sebelum selesai.';
      }

      setTestResult({
        success: false,
        message: errorMsg,
        code
      });
    } finally {
      setIsTestingAuth(false);
    }
  };

  const steps = [
    { number: 1, title: 'Aktifkan Google Provider', subtitle: 'Firebase Console' },
    { number: 2, title: 'Daftarkan Domain', subtitle: 'Authorized Domains' },
    { number: 3, title: 'OAuth Client ID', subtitle: 'Google Cloud Console' },
    { number: 4, title: 'Uji Koneksi', subtitle: 'Verifikasi Live' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center">
              <Sparkles size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black uppercase tracking-tight text-slate-900">
                  Panduan Konfigurasi Firebase Authentication
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                  Google Login &amp; Cloud Sync
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Panduan interaktif langkah demi langkah untuk mengonfigurasi domain resmi &amp; OAuth Client ID.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-2xl transition-all cursor-pointer"
            title="Tutup panduan"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stepper Navigation */}
        <div className="grid grid-cols-2 md:grid-cols-4 border-b border-slate-100 bg-white">
          {steps.map((s) => {
            const isActive = activeStep === s.number;
            const isCompleted = checklist[`step${s.number}`] || (s.number === 4 && isCloudConnected);
            return (
              <button
                key={s.number}
                onClick={() => setActiveStep(s.number)}
                className={`p-4 text-left border-r last:border-r-0 border-slate-100 transition-all flex items-center gap-3 cursor-pointer ${
                  isActive ? 'bg-indigo-50/60 border-b-2 border-b-indigo-600' : 'hover:bg-slate-50'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0 ${
                  isCompleted 
                    ? 'bg-emerald-500 text-white' 
                    : isActive 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {isCompleted ? <Check size={16} /> : s.number}
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-black uppercase tracking-tight truncate ${isActive ? 'text-indigo-900' : 'text-slate-800'}`}>
                    {s.title}
                  </p>
                  <p className="text-[10px] font-medium text-slate-400 truncate">
                    {s.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Modal Body / Step Content */}
        <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1">
          {/* ================= STEP 1 ================= */}
          {activeStep === 1 && (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Langkah 1 dari 4</span>
                  <h4 className="text-xl font-black text-slate-900 tracking-tight">
                    Aktifkan Google Sign-in Provider di Firebase Console
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Firebase Authentication memerlukan provider <strong>Google</strong> diaktifkan terlebih dahulu di konsol agar tombol login di aplikasi dapat memproses akun Google.
                  </p>
                </div>
                <a
                  href={`https://console.firebase.google.com/project/${projectId}/authentication/providers`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-indigo-200 cursor-pointer"
                >
                  <span>Buka Sign-in Method</span>
                  <ExternalLink size={14} />
                </a>
              </div>

              {/* Instructions Box */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4">
                <h5 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Info size={16} className="text-indigo-600" />
                  Instruksi di Firebase Console:
                </h5>
                <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-600 leading-relaxed font-medium">
                  <li>
                    Klik tombol <strong>"Buka Sign-in Method"</strong> di atas atau navigasi ke: <br />
                    <code className="text-[11px] font-mono text-indigo-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      Firebase Console &gt; Build &gt; Authentication &gt; Sign-in method
                    </code>
                  </li>
                  <li>
                    Di daftar <strong>Sign-in providers</strong>, klik <strong>Google</strong>.
                  </li>
                  <li>
                    Aktifkan toggle switch <strong>Enable</strong> (Aktif).
                  </li>
                  <li>
                    Pada kolom <strong>Project support email</strong>, pilih alamat email Anda (misal: <code className="font-mono text-slate-800">ridohaloho@gmail.com</code>).
                  </li>
                  <li>
                    Klik tombol <strong>Save</strong> (Simpan).
                  </li>
                </ol>
              </div>

              {/* Interactive Checkbox */}
              <div 
                onClick={() => toggleCheck('step1')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  checklist['step1'] ? 'bg-emerald-50/70 border-emerald-300' : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                    checklist['step1'] ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {checklist['step1'] && <Check size={14} />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      Saya sudah mengaktifkan Google Provider di Firebase Console
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Email support telah dipilih dan perubahan telah disimpan.
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                  checklist['step1'] ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                }`}>
                  {checklist['step1'] ? 'Selesai' : 'Belum'}
                </span>
              </div>
            </div>
          )}

          {/* ================= STEP 2 ================= */}
          {activeStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Langkah 2 dari 4</span>
                  <h4 className="text-xl font-black text-slate-900 tracking-tight">
                    Tambahkan Domain Aplikasi ke Authorized Domains
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Untuk mencegah domain asing membajak Firebase Anda, Google memblokir login dari domain yang belum didaftarkan di <strong>Authorized Domains</strong>.
                  </p>
                </div>
                <a
                  href={`https://console.firebase.google.com/project/${projectId}/authentication/settings`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-indigo-200 cursor-pointer"
                >
                  <span>Buka Authorized Domains</span>
                  <ExternalLink size={14} />
                </a>
              </div>

              {/* Domains to Copy Cards */}
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">
                  Domain yang Harus Anda Daftarkan (Klik untuk Salin):
                </label>

                {recommendedDomains.map((dom, idx) => (
                  <div 
                    key={dom}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-4 hover:border-indigo-300 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-indigo-600 flex items-center justify-center shrink-0">
                        <Globe size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono font-bold text-slate-800 truncate">
                            {dom}
                          </code>
                          {dom === currentHost && (
                            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              Domain Aktif Saat Ini
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {idx === 0 ? 'Domain utama tempat Anda menjalankan aplikasi' : 'Domain alternatif / preview'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleCopy(dom, dom)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                    >
                      {copiedKey === dom ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      <span>{copiedKey === dom ? 'Tersalin!' : 'Salin Domain'}</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Instructions Box */}
              <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3 text-xs text-amber-900 leading-relaxed font-medium">
                <h5 className="font-bold uppercase tracking-wider text-amber-800 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600" />
                  Cara Memasukkan ke Firebase:
                </h5>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>Buka tautan <strong>"Buka Authorized Domains"</strong> di atas.</li>
                  <li>Gulir ke bawah ke tabel <strong>Authorized domains</strong>.</li>
                  <li>Klik tombol <strong>"Add domain"</strong>.</li>
                  <li>Tempelkan (Paste) domain yang sudah disalin di atas (tanpa <code className="text-slate-700 bg-white/70 px-1 rounded">https://</code>).</li>
                  <li>Klik <strong>Save</strong>.</li>
                </ol>
              </div>

              {/* Interactive Checkbox */}
              <div 
                onClick={() => toggleCheck('step2')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  checklist['step2'] ? 'bg-emerald-50/70 border-emerald-300' : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                    checklist['step2'] ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {checklist['step2'] && <Check size={14} />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      Saya sudah menambahkan domain aktif ke Authorized Domains
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Domain {currentHost} telah terdaftar dan berstatus tersimpan.
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                  checklist['step2'] ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                }`}>
                  {checklist['step2'] ? 'Selesai' : 'Belum'}
                </span>
              </div>
            </div>
          )}

          {/* ================= STEP 3 ================= */}
          {activeStep === 3 && (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Langkah 3 dari 4</span>
                  <h4 className="text-xl font-black text-slate-900 tracking-tight">
                    Konfigurasi OAuth Client ID &amp; Origins (Google Cloud Console)
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Google OAuth memerlukan <strong>Authorized JavaScript Origins</strong> dan <strong>Authorized Redirect URIs</strong> agar otentikasi browser diizinkan Google.
                  </p>
                </div>
                <a
                  href={`https://console.cloud.google.com/apis/credentials?project=${projectId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-indigo-200 cursor-pointer"
                >
                  <span>Buka Google Cloud Credentials</span>
                  <ExternalLink size={14} />
                </a>
              </div>

              {/* Credentials Parameter Reference */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Origins */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Authorized JavaScript Origins
                    </span>
                    <button
                      onClick={() => handleCopy(currentOrigin, 'origin')}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === 'origin' ? <Check size={12} /> : <Copy size={12} />}
                      {copiedKey === 'origin' ? 'Tersalin' : 'Salin Origin'}
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <code className="text-xs font-mono font-bold text-slate-800 block p-2 bg-white rounded-lg border border-slate-200 break-all">
                      {currentOrigin}
                    </code>
                    <code className="text-xs font-mono font-bold text-slate-500 block p-2 bg-white rounded-lg border border-slate-200 break-all">
                      https://{authDomain}
                    </code>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Masukkan URL di atas ke daftar Authorized JavaScript Origins pada OAuth Client Anda.
                  </p>
                </div>

                {/* 2. Redirect URIs */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Authorized Redirect URIs
                    </span>
                    <button
                      onClick={() => handleCopy(redirectUri, 'redirect')}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === 'redirect' ? <Check size={12} /> : <Copy size={12} />}
                      {copiedKey === 'redirect' ? 'Tersalin' : 'Salin Redirect URI'}
                    </button>
                  </div>
                  <code className="text-xs font-mono font-bold text-slate-800 block p-2 bg-white rounded-lg border border-slate-200 break-all">
                    {redirectUri}
                  </code>
                  <p className="text-[10px] text-slate-400">
                    Ini adalah URL resmi handler Firebase Auth tempat Google mengembalikan token kredensial.
                  </p>
                </div>
              </div>

              {/* Instructions Box */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs text-slate-600 leading-relaxed font-medium">
                <h5 className="font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Key size={16} className="text-indigo-600" />
                  Langkah Verifikasi OAuth Client:
                </h5>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>Buka tautan <strong>"Buka Google Cloud Credentials"</strong> di atas.</li>
                  <li>Di tabel <strong>OAuth 2.0 Client IDs</strong>, klik client ID tipe <strong>Web application</strong> (biasanya otomatis dibuatkan oleh Firebase bertuliskan <em>Web client</em>).</li>
                  <li>Di bagian <strong>Authorized JavaScript origins</strong>, pastikan <code className="text-indigo-600 font-mono">{currentOrigin}</code> telah tercantum. Jika belum, klik <strong>ADD URI</strong>.</li>
                  <li>Di bagian <strong>Authorized redirect URIs</strong>, pastikan <code className="text-indigo-600 font-mono">{redirectUri}</code> telah tercantum.</li>
                  <li>Klik tombol <strong>Save</strong> (Simpan).</li>
                </ol>
              </div>

              {/* Interactive Checkbox */}
              <div 
                onClick={() => toggleCheck('step3')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  checklist['step3'] ? 'bg-emerald-50/70 border-emerald-300' : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                    checklist['step3'] ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {checklist['step3'] && <Check size={14} />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      Saya sudah memastikan Authorized Origins &amp; Redirect URIs tersimpan
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Kredensial OAuth 2.0 web client siap menerima permintaan login dari browser.
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                  checklist['step3'] ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                }`}>
                  {checklist['step3'] ? 'Selesai' : 'Belum'}
                </span>
              </div>
            </div>
          )}

          {/* ================= STEP 4 ================= */}
          {activeStep === 4 && (
            <div className="space-y-6">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Langkah 4 dari 4</span>
                <h4 className="text-xl font-black text-slate-900 tracking-tight">
                  Verifikasi &amp; Uji Koneksi Langsung (Live Test)
                </h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Lakukan uji coba login langsung untuk memverifikasi apakah seluruh pengaturan Firebase Authentication dan OAuth telah berfungsi tanpa kendala.
                </p>
              </div>

              {/* Summary Checklist Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={`p-4 rounded-2xl border flex items-center gap-3 ${checklist['step1'] ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                  {checklist['step1'] ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-slate-400" />}
                  <span className="text-xs font-bold">1. Google Provider Aktif</span>
                </div>
                <div className={`p-4 rounded-2xl border flex items-center gap-3 ${checklist['step2'] ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                  {checklist['step2'] ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-slate-400" />}
                  <span className="text-xs font-bold">2. Domain Terdaftar</span>
                </div>
                <div className={`p-4 rounded-2xl border flex items-center gap-3 ${checklist['step3'] ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                  {checklist['step3'] ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-slate-400" />}
                  <span className="text-xs font-bold">3. OAuth Origins Siap</span>
                </div>
              </div>

              {/* Test Action Card */}
              <div className="p-6 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 rounded-3xl text-white border border-indigo-500/20 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                      <LogIn size={24} />
                    </div>
                    <div>
                      <h5 className="font-black text-sm uppercase tracking-wide">Tes Login Akun Google Sekarang</h5>
                      <p className="text-xs text-slate-300">
                        Klik tombol di bawah untuk membuka pop-up autentikasi Google resmi.
                      </p>
                    </div>
                  </div>
                  {isCloudConnected && (
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 size={13} /> Cloud Terhubung
                    </span>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={isTestingAuth}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={isTestingAuth ? 'animate-spin' : ''} />
                    <span>{isTestingAuth ? 'Menghubungkan...' : 'Jalankan Tes Hubungkan Akun Google'}</span>
                  </button>
                </div>

                {/* Test Result Feedback */}
                {testResult && (
                  <div className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2 animate-in fade-in duration-200 ${
                    testResult.success 
                      ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200' 
                      : 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                  }`}>
                    <div className="flex items-center gap-2 font-black uppercase tracking-wider">
                      {testResult.success ? <CheckCircle2 size={16} className="text-emerald-400" /> : <AlertTriangle size={16} className="text-rose-400" />}
                      <span>{testResult.success ? 'Hasil Uji Coba: Berhasil!' : 'Hasil Uji Coba: Terjadi Kendala'}</span>
                    </div>
                    <p className="font-medium text-slate-200">{testResult.message}</p>

                    {!testResult.success && testResult.code === 'UNAUTHORIZED_DOMAIN' && (
                      <div className="pt-2">
                        <button
                          onClick={() => setActiveStep(2)}
                          className="px-3 py-1.5 bg-white text-slate-900 rounded-lg font-bold text-[10px] uppercase tracking-wider hover:bg-slate-100 transition-all cursor-pointer"
                        >
                          &larr; Buka Langkah 2 untuk Mendaftarkan Domain
                        </button>
                      </div>
                    )}
                    {!testResult.success && testResult.code === 'OPERATION_NOT_ALLOWED' && (
                      <div className="pt-2">
                        <button
                          onClick={() => setActiveStep(1)}
                          className="px-3 py-1.5 bg-white text-slate-900 rounded-lg font-bold text-[10px] uppercase tracking-wider hover:bg-slate-100 transition-all cursor-pointer"
                        >
                          &larr; Buka Langkah 1 untuk Mengaktifkan Google Provider
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Already Connected Info */}
              {isCloudConnected && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldCheck size={20} className="text-emerald-600" />
                    <div>
                      <p className="text-xs font-bold text-emerald-950">
                        Akun Google Sedang Aktif: <span className="font-mono">{firebaseUser?.email}</span>
                      </p>
                      <p className="text-[11px] text-emerald-700">
                        Otorisasi Cloud Firestore aktif. Anda dapat menarik dan mengunggah antrian data kasir.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                  >
                    Selesai &amp; Tutup
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            onClick={() => setActiveStep(prev => Math.max(1, prev - 1))}
            disabled={activeStep === 1}
            className="flex items-center gap-1.5 px-4 py-2 text-slate-600 hover:text-slate-900 font-bold text-xs uppercase tracking-wider disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Kembali</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400">
              Langkah {activeStep} dari 4
            </span>
          </div>

          {activeStep < 4 ? (
            <button
              onClick={() => setActiveStep(prev => Math.min(4, prev + 1))}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-indigo-200 transition-all cursor-pointer"
            >
              <span>Selanjutnya</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer"
            >
              <span>Selesai</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
