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
  SearchCheck
} from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

function HealthItem({ icon, label, status, detail, color }: any) {
  const StatusIcon = status === 'OK' || status === 'PASS' ? CheckCircle2 : status === 'WARNING' ? AlertTriangle : XCircle;
  const statusColor = status === 'OK' || status === 'PASS' ? 'text-emerald-500' : status === 'WARNING' ? 'text-amber-500' : 'text-red-500';
  const bgColor = status === 'OK' || status === 'PASS' ? 'bg-emerald-50' : status === 'WARNING' ? 'bg-amber-50' : 'bg-red-50';

  return (
    <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl shadow-sm group hover:shadow-md transition-all">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${color} bg-opacity-10 ${color.replace('text', 'bg')}`}>
          {icon}
        </div>
        <div>
          <h4 className="font-bold text-slate-900 text-sm">{label}</h4>
          <p className="text-xs text-slate-400 font-medium">{detail}</p>
        </div>
      </div>
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${bgColor} ${statusColor} text-[10px] font-black uppercase tracking-widest`}>
        <StatusIcon size={14} />
        {status}
      </div>
    </div>
  );
}

export default function SystemHealth() {
  const isOnline = useOnlineStatus();
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  
  const pendingSync = useLiveQuery(() => db.syncQueue.where('status').anyOf(['PENDING', 'FAILED', 'SYNCING']).count());
  const conflictCount = useLiveQuery(() => db.conflicts.where('status').equals('PENDING').count());
  const auditCount = useLiveQuery(() => db.auditLogs.count());
  const productCount = useLiveQuery(() => db.products.count());

  const runCheck = async () => {
    setIsChecking(true);
    const res = await IntegrityService.runFullCheck();
    setReport(res);
    setIsChecking(false);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">System Health</h2>
          <p className="text-slate-500 text-sm font-medium">Monitoring real-time integritas dan status sinkronisasi sistem.</p>
        </div>
        <button 
          onClick={runCheck}
          disabled={isChecking}
          className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg disabled:bg-slate-200"
        >
          {isChecking ? (
            <RefreshCw size={18} className="animate-spin" />
          ) : (
            <SearchCheck size={18} />
          )}
          {isChecking ? 'Checking...' : 'Run Full Integrity Check'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <HealthItem 
          icon={<Wifi size={20} />}
          label="Konektivitas Internet"
          status={isOnline ? 'OK' : 'WARNING'}
          detail={isOnline ? 'Terhubung ke jaringan' : 'Bekerja secara offline'}
          color="text-blue-600"
        />
        <HealthItem 
          icon={<Cloud size={20} />}
          label="Firebase Cloud"
          status={isOnline ? 'OK' : 'ERROR'}
          detail={isOnline ? 'Sinkronisasi cloud aktif' : 'Gagal terhubung ke Firebase'}
          color="text-amber-600"
        />
        <HealthItem 
          icon={<Database size={20} />}
          label="Local Database"
          status="OK"
          detail={`IndexedDB aktif (${productCount || 0} entitas produk)`}
          color="text-emerald-600"
        />
        <HealthItem 
          icon={<RefreshCw size={20} />}
          label="Sync Queue"
          status={pendingSync === 0 ? 'OK' : 'WARNING'}
          detail={`${pendingSync || 0} antrian tertunda`}
          color="text-indigo-600"
        />
        <HealthItem 
          icon={<AlertTriangle size={20} />}
          label="Data Conflicts"
          status={conflictCount === 0 ? 'OK' : 'ERROR'}
          detail={`${conflictCount || 0} konflik butuh review`}
          color="text-rose-600"
        />
        <HealthItem 
          icon={<Archive size={20} />}
          label="Audit Log"
          status="OK"
          detail={`${auditCount || 0} event tercatat`}
          color="text-slate-600"
        />
      </div>

      {report && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">Integrity Report - {new Date(report.timestamp).toLocaleTimeString()}</h3>
            <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${report.status === 'OK' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
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
                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${check.status === 'PASS' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {check.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden">
        <Activity className="absolute right-[-20px] top-[-20px] w-48 h-48 text-white/5 rotate-12" />
        <div className="relative z-10">
          <h3 className="text-xl font-black uppercase tracking-widest mb-2">Automated Integrity System</h3>
          <p className="text-slate-400 text-sm max-w-xl leading-relaxed font-medium">
            Sistem Harapan Jaya POS secara otomatis memverifikasi setiap transaksi menggunakan 
            <strong> Event-Based Ledger</strong>. Saldo tidak pernah di-overwrite secara langsung, 
            melainkan dikalkulasi ulang dari histori event untuk menjamin validitas data finansial dan stok.
          </p>
        </div>
      </div>
    </div>
  );
}
