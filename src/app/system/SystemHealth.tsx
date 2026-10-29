import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { IntegrityService, type IntegrityReport } from '@/core/services/integrity-service';
import { 
  Activity, 
  Database, 
  Cloud, 
  Wifi, 
  ShieldCheck, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  HardDrive,
  Archive,
  SearchCheck,
  Zap,
  Clock,
  Gauge,
  ArrowUpRight,
  TrendingDown,
  Trash2,
  Play,
  Layers,
  ArrowDownRight,
  AlertOctagon,
  FileText,
  CloudUpload
} from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { PerformanceTracker, usePerformanceTracker, type PerformanceSummary } from '@/core/services/performance-tracker';
import { SyncEngine } from '@/core/sync-engine';
import { useToastStore } from '@/core/toast-store';
import { format } from 'date-fns';

function HealthItem({ icon, label, status, detail, color, action }: any) {
  const StatusIcon = status === 'OK' || status === 'PASS' ? CheckCircle2 : status === 'WARNING' ? AlertTriangle : XCircle;
  const statusColor = status === 'OK' || status === 'PASS' ? 'text-emerald-500' : status === 'WARNING' ? 'text-amber-500' : 'text-red-500';
  const bgColor = status === 'OK' || status === 'PASS' ? 'bg-emerald-50' : status === 'WARNING' ? 'bg-amber-50' : 'bg-red-50';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl shadow-sm group hover:shadow-md transition-all gap-3">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${color} bg-opacity-10 ${color.replace('text', 'bg')}`}>
          {icon}
        </div>
        <div>
          <h4 className="font-bold text-slate-900 text-sm">{label}</h4>
          <p className="text-xs text-slate-400 font-medium">{detail}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-center">
        {action}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${bgColor} ${statusColor} text-[10px] font-black uppercase tracking-widest`}>
          <StatusIcon size={14} />
          {status}
        </div>
      </div>
    </div>
  );
}

export default function SystemHealth() {
  const isOnline = useOnlineStatus();
  const { addToast } = useToastStore();
  const perf = usePerformanceTracker();

  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [activePerfTab, setActivePerfTab] = useState<'BOTTLENECKS' | 'SYNC_QUEUE' | 'TRANSACTIONS' | 'SYNC_LOGS'>('BOTTLENECKS');
  const [isPushingSync, setIsPushingSync] = useState(false);
  const [retryingQueueId, setRetryingQueueId] = useState<number | null>(null);
  const [isClearingSynced, setIsClearingSynced] = useState(false);
  
  const pendingSync = useLiveQuery(() => db.syncQueue.where('status').anyOf(['PENDING', 'FAILED', 'SYNCING']).count());
  const conflictCount = useLiveQuery(() => db.conflicts.where('status').equals('PENDING').count());
  const auditCount = useLiveQuery(() => db.auditLogs.count());
  const productCount = useLiveQuery(() => db.products.count());
  const syncQueueList = useLiveQuery(() => db.syncQueue.orderBy('createdAt').reverse().limit(50).toArray());

  const handleManualSyncPush = async () => {
    if (!isOnline) {
      addToast('Perangkat sedang offline. Sambungkan internet untuk mengunggah ke Cloud Firestore.', 'error');
      return;
    }

    setIsPushingSync(true);
    addToast('Memulai push antrian data lokal ke cloud Firestore (tanpa jeda interval)...', 'info');

    try {
      const res = await SyncEngine.forcePushAll();
      if (res.total === 0) {
        addToast('Semua data lokal telah tersinkronisasi sempurna dengan Cloud Firestore! (Antrian kosong)', 'success');
      } else if (res.failed === 0) {
        addToast(`Berhasil push ${res.success} data ke Cloud Firestore tanpa menunggu interval!`, 'success');
      } else {
        addToast(`Tersinkron ${res.success} dari ${res.total} item. (${res.failed} gagal dicoba ulang).`, 'warning');
      }
    } catch (err: any) {
      addToast(err?.message || 'Gagal melakukan push sync ke cloud.', 'error');
    } finally {
      setIsPushingSync(false);
    }
  };

  const handleManualRetryItem = async (queueId: number) => {
    setRetryingQueueId(queueId);
    try {
      const ok = await SyncEngine.manualRetry(queueId);
      if (ok) {
        addToast(`Item antrian #${queueId} berhasil diunggah ke cloud!`, 'success');
      } else {
        addToast(`Item antrian #${queueId} gagal diunggah, silakan periksa koneksi internet.`, 'error');
      }
    } catch (err: any) {
      addToast(err?.message || 'Gagal retry item.', 'error');
    } finally {
      setRetryingQueueId(null);
    }
  };

  const handleClearSynced = async () => {
    setIsClearingSynced(true);
    try {
      const count = await SyncEngine.clearSyncedLogs();
      addToast(`${count} log antrian berstatus SYNCED berhasil dibersihkan dari penyimpanan lokal.`, 'info');
    } catch (err: any) {
      addToast('Gagal membersihkan log sync.', 'error');
    } finally {
      setIsClearingSynced(false);
    }
  };

  const handleDeleteQueueItem = async (queueId: number) => {
    try {
      await SyncEngine.deleteQueueItem(queueId);
      addToast(`Item antrian #${queueId} telah dihapus dari antrian.`, 'info');
    } catch (err: any) {
      addToast('Gagal menghapus item antrian: ' + (err?.message || ''), 'error');
    }
  };

  const runCheck = async () => {
    setIsChecking(true);
    try {
      const res = await IntegrityService.runFullCheck();
      setReport(res);
      addToast('Integrity check selesai dievaluasi!', 'success');
    } catch (err: any) {
      addToast(err?.message || 'Gagal menjalankan audit integritas.', 'error');
    } finally {
      setIsChecking(false);
    }
  };

  const handleRunBenchmark = async () => {
    setIsRunningBenchmark(true);
    try {
      const res = await PerformanceTracker.runBenchmark();
      const cloudMsg = res.cloudPingMs !== null ? ` • Cloud Sync Ping: ${res.cloudPingMs}ms` : ' (Mode Offline)';
      addToast(`Benchmark Selesai! DB Tulis: ${res.dbWriteMs}ms • DB Baca: ${res.dbReadMs}ms${cloudMsg}`, 'success');
    } catch (err: any) {
      addToast('Gagal menjalankan uji benchmark latensi.', 'error');
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  const handleClearMetrics = () => {
    PerformanceTracker.clearMetrics();
    addToast('Log performa berhasil direset.', 'info');
  };

  const txSpeedBadge =
    perf.avgTransactionDurationMs < 120
      ? { text: '⚡ Sub-120ms (Optimal)', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
      : perf.avgTransactionDurationMs < 300
      ? { text: 'Normal (120-300ms)', bg: 'bg-blue-50 text-blue-700 border-blue-200' }
      : { text: 'Lambat (>300ms Bottleneck)', bg: 'bg-rose-50 text-rose-700 border-rose-200' };

  const syncSpeedBadge =
    perf.avgSyncLatencyMs < 350
      ? { text: '⚡ Cepat (<350ms)', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
      : perf.avgSyncLatencyMs < 1200
      ? { text: 'Wajar (350-1200ms)', bg: 'bg-blue-50 text-blue-700 border-blue-200' }
      : { text: 'Tinggi (>1.2s Network Bottleneck)', bg: 'bg-rose-50 text-rose-700 border-rose-200' };

  return (
    <div className="space-y-8 max-w-5xl pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">System Health & Performance</h2>
          <p className="text-slate-500 text-sm font-medium">Monitoring real-time latensi proses transaksi, sinkronisasi cloud, dan deteksi bottleneck sistem.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleManualSyncPush}
            disabled={isPushingSync}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-md shadow-indigo-200 disabled:opacity-50 cursor-pointer"
            title="Push semua antrian data lokal ke Cloud Firestore tanpa menunggu interval"
          >
            <CloudUpload size={16} className={isPushingSync ? 'animate-bounce' : ''} />
            <span>{isPushingSync ? 'Mengunggah ke Cloud...' : `Push Sync Queue (${pendingSync || 0})`}</span>
          </button>
          <button 
            onClick={runCheck}
            disabled={isChecking}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md disabled:bg-slate-300 cursor-pointer"
          >
            {isChecking ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <SearchCheck size={16} />
            )}
            {isChecking ? 'Checking...' : 'Run Integrity Check'}
          </button>
        </div>
      </div>

      {/* Primary Health Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <HealthItem 
          icon={<Wifi size={20} />}
          label="Konektivitas Internet"
          status={isOnline ? 'OK' : 'WARNING'}
          detail={isOnline ? 'Terhubung ke jaringan aktif' : 'Bekerja secara offline (local-first)'}
          color="text-blue-600"
        />
        <HealthItem 
          icon={<Cloud size={20} />}
          label="Firebase Firestore"
          status={isOnline ? 'OK' : 'ERROR'}
          detail={isOnline ? `Sinkronisasi aktif (Latensi: ${perf.avgSyncLatencyMs}ms)` : 'Antrian offline aktif'}
          color="text-amber-600"
        />
        <HealthItem 
          icon={<Database size={20} />}
          label="Local IndexedDB"
          status="OK"
          detail={`${productCount || 0} entitas produk • ${auditCount || 0} log`}
          color="text-emerald-600"
        />
        <HealthItem 
          icon={<RefreshCw size={20} />}
          label="Sync Queue Status"
          status={pendingSync === 0 ? 'OK' : 'WARNING'}
          detail={`${pendingSync || 0} antrian tertunda (${perf.syncSuccessRate}% success rate)`}
          color="text-indigo-600"
          action={
            <button
              onClick={handleManualSyncPush}
              disabled={isPushingSync}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm shadow-indigo-200 transition-all cursor-pointer disabled:opacity-50"
              title="Push antrian data lokal ke cloud Firestore sekarang tanpa jeda interval"
            >
              <CloudUpload size={13} className={isPushingSync ? 'animate-bounce' : ''} />
              <span>{isPushingSync ? 'Pushing...' : 'Push ke Cloud'}</span>
            </button>
          }
        />
        <HealthItem 
          icon={<AlertTriangle size={20} />}
          label="Data Conflicts"
          status={conflictCount === 0 ? 'OK' : 'ERROR'}
          detail={`${conflictCount || 0} konflik butuh review Owner`}
          color="text-rose-600"
        />
        <HealthItem 
          icon={<Gauge size={20} />}
          label="Engine Throughput"
          status={perf.avgTransactionDurationMs < 300 ? 'OK' : 'WARNING'}
          detail={`Rata-rata proses: ${perf.avgTransactionDurationMs}ms`}
          color="text-teal-600"
        />
      </div>

      {/* PERFORMANCE & BOTTLENECK TRACKING SECTION */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-6 p-6">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-200">
              <Zap size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  Performance & Bottleneck Identifier
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                  perf.overallHealth === 'HEALTHY'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : perf.overallHealth === 'WARNING'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {perf.overallHealth === 'HEALTHY' ? 'Status: Optimal' : perf.overallHealth === 'WARNING' ? 'Status: Perhatian' : 'Status: Bottleneck Kritis'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Pencatatan real-time durasi pemrosesan transaksi penjualan & latensi upload cloud untuk mencegah antrian kasir macet.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleRunBenchmark}
              disabled={isRunningBenchmark}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-200 disabled:opacity-50 cursor-pointer"
            >
              <Play size={14} className={isRunningBenchmark ? 'animate-spin' : ''} />
              <span>{isRunningBenchmark ? 'Menguji...' : 'Uji Benchmark Latensi'}</span>
            </button>
            <button
              onClick={handleClearMetrics}
              className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all border border-slate-200"
              title="Reset data log performa"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* 3 Main Highlight Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Transaction Processing Time */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock size={13} className="text-blue-600" />
                Rata-Rata Waktu Transaksi
              </span>
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${txSpeedBadge.bg}`}>
                {txSpeedBadge.text}
              </span>
            </div>
            <div>
              <p className="text-3xl font-black text-slate-900 tabular-nums">
                {perf.avgTransactionDurationMs} <span className="text-sm font-bold text-slate-400">ms</span>
              </p>
              <p className="text-[11px] font-semibold text-slate-500 mt-1">
                Sampel: {perf.transactionCount} transaksi • Min: {perf.minTransactionDurationMs}ms • Max: {perf.maxTransactionDurationMs}ms
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-medium text-slate-400">
              <span>Target Ambang: &lt; 120 ms</span>
              <span className={perf.avgTransactionDurationMs < 120 ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                {perf.avgTransactionDurationMs < 120 ? '✓ Sangat Cepat' : '! Perlu Pantau'}
              </span>
            </div>
          </div>

          {/* 2. Cloud Sync Latency */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Cloud size={13} className="text-indigo-600" />
                Rata-Rata Latensi Sync Cloud
              </span>
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${syncSpeedBadge.bg}`}>
                {syncSpeedBadge.text}
              </span>
            </div>
            <div>
              <p className="text-3xl font-black text-slate-900 tabular-nums">
                {perf.avgSyncLatencyMs} <span className="text-sm font-bold text-slate-400">ms</span>
              </p>
              <p className="text-[11px] font-semibold text-slate-500 mt-1">
                Roundtrip Firestore • Antrian rata-rata: {perf.avgQueueWaitLatencyMs}ms
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-medium text-slate-400">
              <span>Tingkat Sukses: {perf.syncSuccessRate}%</span>
              <span>Total Upload: {perf.syncCount} item</span>
            </div>
          </div>

          {/* 3. Bottleneck Analysis & Diagnosis Summary */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Gauge size={13} className="text-emerald-600" />
                Diagnosa Bottleneck
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                {perf.bottlenecks.length} Terdeteksi
              </span>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900 flex items-center gap-2">
                {perf.overallHealth === 'HEALTHY' ? (
                  <span className="text-emerald-600 flex items-center gap-1.5">
                    <CheckCircle2 size={24} /> Bebas Hambatan
                  </span>
                ) : perf.overallHealth === 'WARNING' ? (
                  <span className="text-amber-600 flex items-center gap-1.5">
                    <AlertTriangle size={24} /> Resiko Ringan
                  </span>
                ) : (
                  <span className="text-rose-600 flex items-center gap-1.5">
                    <AlertOctagon size={24} /> Terjadi Bottleneck
                  </span>
                )}
              </p>
              <p className="text-[11px] font-medium text-slate-500 mt-1 leading-relaxed">
                {perf.overallHealth === 'HEALTHY'
                  ? 'Arus data transaksi POS & sync antrian cloud berjalan mulus tanpa hambatan.'
                  : 'Terdapat anomali latensi yang berpotensi memperlambat proses kasir.'}
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 text-[10px] text-slate-400">
              Update Terakhir: {new Date(perf.lastUpdated).toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Sub-Tabs for Bottlenecks, Transaction Log, and Sync Log */}
        <div className="space-y-4">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-2 w-full sm:w-max flex-wrap">
            <button
              onClick={() => setActivePerfTab('BOTTLENECKS')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activePerfTab === 'BOTTLENECKS'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle size={15} />
              <span>Diagnosa Bottleneck ({perf.bottlenecks.length})</span>
            </button>
            <button
              onClick={() => setActivePerfTab('SYNC_QUEUE')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activePerfTab === 'SYNC_QUEUE'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={15} />
              <span>Sync Queue Status ({pendingSync || 0})</span>
            </button>
            <button
              onClick={() => setActivePerfTab('TRANSACTIONS')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activePerfTab === 'TRANSACTIONS'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock size={15} />
              <span>Log Waktu Transaksi ({perf.recentTransactions.length})</span>
            </button>
            <button
              onClick={() => setActivePerfTab('SYNC_LOGS')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activePerfTab === 'SYNC_LOGS'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Cloud size={15} />
              <span>Log Latensi Sync ({perf.recentSyncs.length})</span>
            </button>
          </div>

          {/* TAB: SYNC QUEUE STATUS & MANUAL OFFLINE-FIRST PUSH */}
          {activePerfTab === 'SYNC_QUEUE' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 rounded-2xl p-6 text-white border border-indigo-500/20 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                      Local-First Architecture
                    </span>
                    <span className="text-xs font-bold text-slate-300">
                      Auto-sync: tiap 10 detik
                    </span>
                  </div>
                  <h4 className="text-base font-black uppercase tracking-tight text-white">
                    Antrian Sinkronisasi Data Lokal ke Cloud Firestore
                  </h4>
                  <p className="text-xs text-slate-300 font-medium leading-relaxed">
                    Setiap transaksi, barang kulakan, pergerakan stok, dan data pelanggan langsung tersimpan di database lokal browser. Klik tombol di samping untuk <strong>langsung push data ke Cloud Firestore secara instan tanpa menunggu interval waktu</strong>.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={handleManualSyncPush}
                    disabled={isPushingSync}
                    className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer"
                  >
                    <CloudUpload size={16} className={isPushingSync ? 'animate-bounce' : ''} />
                    <span>{isPushingSync ? 'Sedang Mengunggah...' : `Push Semua Sekarang (${pendingSync || 0})`}</span>
                  </button>

                  <button
                    onClick={handleClearSynced}
                    disabled={isClearingSynced}
                    className="flex items-center gap-1.5 px-3.5 py-3 bg-white/10 hover:bg-white/20 text-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border border-white/10 cursor-pointer"
                    title="Bersihkan log data yang telah sukses tersinkronisasi (SYNCED)"
                  >
                    <Trash2 size={14} />
                    <span>Bersihkan SYNCED</span>
                  </button>
                </div>
              </div>

              {/* Table of Sync Queue items */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-indigo-600" />
                    <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                      Daftar Entitas dalam Antrian (50 Terakhir)
                    </h5>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700">
                    Total Pending: {pendingSync || 0}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/70 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                        <th className="px-4 py-3">Queue ID</th>
                        <th className="px-4 py-3">Waktu Antri</th>
                        <th className="px-4 py-3">Entitas</th>
                        <th className="px-4 py-3">ID Dokumen</th>
                        <th className="px-4 py-3">Aksi</th>
                        <th className="px-4 py-3">Percobaan</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Opsi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!syncQueueList || syncQueueList.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-slate-400 font-bold">
                            <div className="flex flex-col items-center gap-2">
                              <CheckCircle2 size={32} className="text-emerald-500 opacity-60" />
                              <p className="text-xs font-bold text-slate-600">Tidak ada data dalam antrian sync.</p>
                              <p className="text-[11px] text-slate-400">Seluruh data lokal telah tersinkronisasi atau belum ada transaksi baru.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        syncQueueList.map((item) => {
                          const isRetrying = retryingQueueId === item.queueId;
                          return (
                            <tr key={item.queueId} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-4 py-3 font-mono font-bold text-slate-500">
                                #{item.queueId}
                              </td>
                              <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                {item.createdAt ? format(new Date(item.createdAt), 'dd/MM HH:mm:ss') : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 uppercase font-mono">
                                  {item.entityType}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-700 font-bold truncate max-w-[120px]" title={item.entityId}>
                                {item.entityId}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                                  item.action === 'CREATE'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : item.action === 'UPDATE'
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'bg-rose-50 text-rose-700'
                                }`}>
                                  {item.action}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-600">
                                {item.retryCount}x
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                  item.status === 'SYNCED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : item.status === 'SYNCING'
                                    ? 'bg-blue-100 text-blue-800'
                                    : item.status === 'FAILED'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {item.status === 'SYNCING' && <RefreshCw size={10} className="animate-spin" />}
                                  {item.status}
                                </span>
                                {item.lastError && (
                                  <p className="text-[10px] text-rose-600 mt-1 max-w-[200px] truncate" title={item.lastError}>
                                    {item.lastError}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {item.status !== 'SYNCED' && (
                                    <button
                                      onClick={() => handleManualRetryItem(item.queueId!)}
                                      disabled={isRetrying || isPushingSync}
                                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                                      title="Paksa upload item ini ke Cloud Firestore"
                                    >
                                      {isRetrying ? '...' : 'Upload'}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteQueueItem(item.queueId!)}
                                    className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                                    title="Hapus dari antrian lokal"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: BOTTLENECK DIAGNOSIS CARDS */}
          {activePerfTab === 'BOTTLENECKS' && (
            <div className="space-y-3">
              {perf.bottlenecks.map((b) => (
                <div
                  key={b.id}
                  className={`p-4 rounded-2xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all ${
                    b.severity === 'OPTIMAL'
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : b.severity === 'WARNING'
                      ? 'bg-amber-50/50 border-amber-200'
                      : 'bg-rose-50/50 border-rose-200'
                  }`}
                >
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                        b.severity === 'OPTIMAL'
                          ? 'bg-emerald-600 text-white'
                          : b.severity === 'WARNING'
                          ? 'bg-amber-500 text-white'
                          : 'bg-rose-600 text-white'
                      }`}>
                        {b.category} • {b.severity}
                      </span>
                      <h4 className="font-bold text-slate-900 text-sm">{b.title}</h4>
                    </div>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      {b.description}
                    </p>
                    <p className="text-xs text-slate-500 font-bold">
                      💡 Saran Solusi: <span className="font-normal text-slate-700">{b.recommendation}</span>
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Nilai Metrik
                    </span>
                    <span className="text-lg font-black text-slate-800 font-mono">
                      {b.metricValue}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: RECENT TRANSACTIONS LOG */}
          {activePerfTab === 'TRANSACTIONS' && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                    <th className="px-4 py-3">Waktu</th>
                    <th className="px-4 py-3">No. Nota / Ref</th>
                    <th className="px-4 py-3">Tipe</th>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Durasi Pemrosesan</th>
                    <th className="px-4 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {perf.recentTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-400 font-bold">
                        Belum ada rekaman metrik transaksi. Buat transaksi di POS atau jalankan Benchmark.
                      </td>
                    </tr>
                  ) : (
                    perf.recentTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {format(new Date(tx.timestamp), 'HH:mm:ss')}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-800 font-mono">
                          {tx.receiptNumber || tx.transactionId.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-bold">
                          {tx.itemCount} qty
                        </td>
                        <td className="px-4 py-3 font-black text-slate-900 tabular-nums">
                          {tx.durationMs} ms
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            tx.status === 'OPTIMAL'
                              ? 'bg-emerald-100 text-emerald-800'
                              : tx.status === 'NORMAL'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: RECENT SYNC LOGS */}
          {activePerfTab === 'SYNC_LOGS' && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                    <th className="px-4 py-3">Waktu</th>
                    <th className="px-4 py-3">Entitas</th>
                    <th className="px-4 py-3">Network Roundtrip</th>
                    <th className="px-4 py-3">Queue Wait</th>
                    <th className="px-4 py-3">Total Latensi</th>
                    <th className="px-4 py-3 text-right">Hasil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {perf.recentSyncs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-400 font-bold">
                        Belum ada rekaman latensi sinkronisasi. Sync engine aktif saat online.
                      </td>
                    </tr>
                  ) : (
                    perf.recentSyncs.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {format(new Date(s.timestamp), 'HH:mm:ss')}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-800 uppercase font-mono">
                          {s.entityType}
                        </td>
                        <td className="px-4 py-3 font-bold text-indigo-600 tabular-nums">
                          {s.networkDurationMs} ms
                        </td>
                        <td className="px-4 py-3 text-slate-500 tabular-nums">
                          {s.queueWaitLatencyMs} ms
                        </td>
                        <td className="px-4 py-3 font-black text-slate-900 tabular-nums">
                          {s.totalLatencyMs} ms
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            s.success
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {s.success ? 'TERKIRIM' : 'GAGAL'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Integrity Report Modal / Card if checked */}
      {report && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">
              Integrity Report - {new Date(report.timestamp).toLocaleTimeString()}
            </h3>
            <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
              report.status === 'OK' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
            }`}>
              Overall: {report.status}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {report.checks.map((check, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {check.status === 'PASS' ? (
                    <CheckCircle2 size={18} className="text-emerald-500" />
                  ) : (
                    <AlertTriangle size={18} className="text-rose-500" />
                  )}
                  <div>
                    <p className="text-sm font-bold text-slate-900">{check.name}</p>
                    <p className="text-xs text-slate-500 font-medium">{check.message}</p>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                  check.status === 'PASS' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {check.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Educational Footer Banner */}
      <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
        <Activity className="absolute right-[-20px] top-[-20px] w-48 h-48 text-white/5 rotate-12 pointer-events-none" />
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-black uppercase tracking-widest">
            <Gauge size={16} />
            <span>High Performance Architecture</span>
          </div>
          <h3 className="text-xl font-black uppercase tracking-widest">
            Event-Based Ledger &amp; Low-Latency Local Cache
          </h3>
          <p className="text-slate-400 text-sm max-w-xl leading-relaxed font-medium">
            Toko Sembako Riama dirancang dengan filosofi <strong>Local-First Offline</strong>: Seluruh transaksi divalidasi dan disimpan secara instan ke IndexedDB lokal (sub-100ms) tanpa menunggu respon jaringan cloud. 
            Sinkronisasi ke Firestore berjalan asinkron di latar belakang (background worker) untuk menjamin kasir dapat melayani pelanggan tanpa jeda antrian.
          </p>
        </div>
      </div>
    </div>
  );
}

