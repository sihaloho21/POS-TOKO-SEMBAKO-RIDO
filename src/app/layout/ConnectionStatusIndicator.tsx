import React, { useState } from 'react';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Cloud, 
  CloudOff, 
  Clock,
  ChevronDown
} from 'lucide-react';
import { useFirestoreConnection } from '@/hooks/useFirestoreConnection';
import { useCloudAuthStore, CloudAuthService } from '@/core/services/cloud-auth-service';
import { useAuthStore } from '@/core/auth-store';

export function ConnectionStatusIndicator() {
  const { state, isOnline, isRetrying, latencyMs, lastConnectedAt, errorMessage, retryConnection } = useFirestoreConnection();
  const { firebaseUser, isCloudConnected } = useCloudAuthStore();
  const { currentUser } = useAuthStore();
  const [showDetails, setShowDetails] = useState(false);
  const [isLoggingInGoogle, setIsLoggingInGoogle] = useState(false);

  const handleConnectGoogle = async () => {
    setIsLoggingInGoogle(true);
    try {
      await CloudAuthService.loginWithGoogle(currentUser?.role || 'OWNER', currentUser?.name);
    } catch (err: any) {
      console.warn('Google connection notice:', err?.message || err);
    } finally {
      setIsLoggingInGoogle(false);
    }
  };

  // Formatting last connected time
  const formattedLastTime = lastConnectedAt 
    ? lastConnectedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '-';

  return (
    <div className="relative inline-block text-left">
      {/* Pill Trigger Button */}
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all border cursor-pointer select-none ${
          state === 'ONLINE'
            ? 'bg-emerald-50/70 border-emerald-200/70 text-emerald-800 hover:bg-emerald-100/70 hover:border-emerald-300'
            : state === 'RECONNECTING'
            ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 animate-pulse'
            : 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100 shadow-xs'
        }`}
        title={
          state === 'ONLINE'
            ? `Cloud Firestore Terhubung${latencyMs ? ` (${latencyMs}ms)` : ''} — Klik untuk detail`
            : state === 'RECONNECTING'
            ? 'Menyambungkan kembali ke Firestore Cloud...'
            : 'Koneksi Firestore terputus — Klik untuk info'
        }
      >
        {/* State Icon & Indicator Dot */}
        {state === 'ONLINE' ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <Wifi size={13} className="text-emerald-600 shrink-0" />
            <span className="text-[11px] font-bold tracking-tight">Online</span>
          </>
        ) : state === 'RECONNECTING' ? (
          <>
            <RefreshCw size={12} className="animate-spin text-amber-600 shrink-0" />
            <span className="text-[11px] font-bold text-amber-800 tracking-tight">Menghubungkan...</span>
          </>
        ) : (
          <>
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 animate-pulse" />
            </span>
            <WifiOff size={13} className="text-rose-600 shrink-0" />
            <span className="text-[11px] font-extrabold text-rose-800 tracking-tight">Offline</span>
          </>
        )}

        <ChevronDown size={11} className="text-slate-400 opacity-70 ml-0.5" />
      </button>

      {/* Subtle Details Popover */}
      {showDetails && (
        <>
          {/* Backdrop click dismiss */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowDetails(false)} 
          />

          <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-4 z-50 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-150">
            {/* Popover Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                <Cloud size={14} className={state === 'ONLINE' ? 'text-emerald-600' : 'text-slate-400'} />
                Status Database Cloud
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                state === 'ONLINE'
                  ? 'bg-emerald-100 text-emerald-800'
                  : state === 'RECONNECTING'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}>
                {state}
              </span>
            </div>

            {/* Status Information */}
            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between items-center text-slate-600">
                <span>Konektivitas Jaringan:</span>
                <span className="font-bold flex items-center gap-1">
                  {navigator.onLine ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Internet Aktif
                    </span>
                  ) : (
                    <span className="text-rose-600 flex items-center gap-1">
                      <AlertCircle size={12} /> Terputus
                    </span>
                  )}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>Google Cloud Firestore:</span>
                <span className="font-bold">
                  {state === 'ONLINE' ? (
                    <span className="text-emerald-600">Terhubung (Realtime)</span>
                  ) : (
                    <span className="text-rose-600">Terputus</span>
                  )}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>Akun Google Cloud:</span>
                <span className="font-bold">
                  {firebaseUser ? (
                    <span className="text-emerald-600 truncate max-w-[140px] inline-block" title={firebaseUser.email || firebaseUser.uid}>
                      {firebaseUser.email || 'Terhubung'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConnectGoogle}
                      disabled={isLoggingInGoogle}
                      className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded text-[10px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      {isLoggingInGoogle ? 'Menghubungkan...' : 'Login Google'}
                    </button>
                  )}
                </span>
              </div>

              {latencyMs !== null && state === 'ONLINE' && (
                <div className="flex justify-between items-center text-slate-600">
                  <span>Respon Ping Cloud:</span>
                  <span className="font-mono font-bold text-blue-600">{latencyMs} ms</span>
                </div>
              )}

              <div className="flex justify-between items-center text-slate-600">
                <span>Sinkronisasi Terakhir:</span>
                <span className="font-mono text-slate-700 flex items-center gap-1">
                  <Clock size={11} className="text-slate-400" />
                  {formattedLastTime} WIB
                </span>
              </div>
            </div>

            {/* Error or Warning Message if any */}
            {state !== 'ONLINE' && (
              <div className="p-2.5 bg-rose-50/80 rounded-xl border border-rose-200/80 text-[11px] text-rose-800 space-y-1">
                <div className="flex items-start gap-1.5 font-bold">
                  <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>Koneksi Realtime Terputus</span>
                </div>
                <p className="text-[10px] text-rose-700 leading-relaxed pl-5">
                  {errorMessage || 'Periksa koneksi Wi-Fi atau data seluler Anda. Data akan langsung ter-update begitu internet terhubung kembali.'}
                </p>
              </div>
            )}

            {/* Popover Footer Action */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
              <span>Auto-reconnect aktif</span>
              <button
                type="button"
                onClick={() => retryConnection()}
                disabled={isRetrying}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={11} className={isRetrying ? 'animate-spin' : ''} />
                <span>{isRetrying ? 'Menyambungkan...' : 'Retry Connection'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
