import React, { useState } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  AlertTriangle, 
  Search, 
  CheckCircle, 
  XCircle,
  Smartphone,
  User,
  Clock,
  ArrowRight,
  Store,
  Receipt,
  AlertOctagon
} from 'lucide-react';
import { format } from 'date-fns';
import { AuditEngine } from '@/core/audit-engine';
import { useAuthStore } from '@/core/auth-store';
import { useToastStore } from '@/core/toast-store';

export default function ConflictCenter() {
  const { currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const [search, setSearch] = useState('');
  
  const conflicts = useLiveQuery(
    () => db.conflicts.where('status').equals('PENDING').toArray()
  );

  const resolveConflict = async (conflictId: string, resolution: 'RESOLVE' | 'REJECT') => {
    const conflict = await db.conflicts.get(conflictId);
    if (!conflict) return;

    const timestamp = new Date().toISOString();
    const resolvedBy = currentUser?.name || 'OWNER_RIDO';
    
    // 1. If it's a STORE_STATUS_CONFLICT on a transaction and rejected:
    if (conflict.type === 'STORE_STATUS_CONFLICT' && conflict.entityType === 'TRANSACTION') {
      if (resolution === 'REJECT') {
        await db.transactions.update(conflict.entityId, {
          status: 'VOIDED',
          voidReason: 'Ditolak Owner: Transaksi offline dibuat saat status toko TUTUP',
          voidRequestedBy: resolvedBy,
          voidRequestedAt: timestamp
        });
      }
    }

    // 2. Update Conflict Status
    await db.conflicts.update(conflictId, {
      status: resolution === 'RESOLVE' ? 'RESOLVED' : 'REJECTED',
      resolvedAt: timestamp,
      resolvedBy
    });

    // 3. Audit Resolution
    await AuditEngine.log({
      userId: currentUser?.userId || 'OWNER_RIDO',
      role: 'OWNER',
      deviceId: 'device-1',
      action: `CONFLICT_${resolution}`,
      module: 'CONFLICT',
      referenceId: conflictId,
      after: { resolution, resolvedAt: timestamp, conflictType: conflict.type }
    });

    // 4. Sync Resolution
    await db.syncQueue.add({
      entityType: 'conflicts',
      entityId: conflictId,
      action: 'UPDATE',
      payload: { status: resolution === 'RESOLVE' ? 'RESOLVED' : 'REJECTED' },
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    addToast(
      resolution === 'RESOLVE' 
        ? 'Konflik berhasil diterima & disetujui!' 
        : 'Konflik berhasil ditolak / dibatalkan!',
      resolution === 'RESOLVE' ? 'success' : 'info'
    );
  };

  const filteredConflicts = conflicts?.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.conflictId.toLowerCase().includes(q) ||
      c.type.toLowerCase().includes(q) ||
      c.entityId.toLowerCase().includes(q) ||
      (c.details?.receiptNumber && c.details.receiptNumber.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Conflict Center</h2>
          <p className="text-slate-500 text-sm font-medium">Review dan selesaikan tabrakan data antar perangkat (Offline Conflicts & Store Status).</p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Cari ID, Tipe, atau Struk..."
            value={search ?? ''}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-6 flex gap-4 items-start shadow-xs">
        <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-lg shadow-amber-200 shrink-0">
          <AlertTriangle size={24} />
        </div>
        <div>
          <h3 className="font-bold text-amber-900 uppercase tracking-tight">Peringatan Integritas Bisnis</h3>
          <p className="text-sm text-amber-800 leading-relaxed font-medium mt-1">
            Sistem mendeteksi <strong>{conflicts?.length || 0} konflik pending</strong>. Harapan Jaya POS tidak menggunakan 
            <em> "Last Write Wins"</em> — semua event offline yang bertabrakan (termasuk transaksi offline saat toko TUTUP) 
            dipertahankan agar Owner dapat memilih resolusi yang paling akurat sesuai kondisi faktual.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredConflicts?.length === 0 ? (
          <div className="py-20 bg-white rounded-3xl border border-slate-200 text-center text-slate-300">
            <CheckCircle size={48} className="mx-auto mb-4 opacity-20 text-emerald-500" />
            <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Tidak ada konflik pending</p>
            <p className="text-xs text-slate-400 mt-1">Semua data sinkron dan tidak ada tabrakan operasional.</p>
          </div>
        ) : (
          filteredConflicts?.map((conflict) => {
            const isStoreConflict = conflict.type === 'STORE_STATUS_CONFLICT';

            return (
              <div 
                key={conflict.conflictId} 
                className={`bg-white rounded-3xl border p-6 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row gap-6 ${
                  isStoreConflict ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200'
                }`}
              >
                <div className="flex-1 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded uppercase tracking-wider flex items-center gap-1.5 ${
                      isStoreConflict ? 'bg-rose-600 text-white shadow-xs' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {isStoreConflict ? <AlertOctagon size={12} /> : <AlertTriangle size={12} />}
                      {conflict.type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs font-bold text-slate-400">ID: {conflict.conflictId.slice(-8).toUpperCase()}</span>
                  </div>
                  
                  <div>
                    <h4 className="font-bold text-slate-900 uppercase tracking-tight text-base">
                      {isStoreConflict 
                        ? `Transaksi Offline Saat Toko TUTUP: ${conflict.details?.receiptNumber || conflict.entityId}`
                        : `Tabrakan Data pada ${conflict.entityType} (${conflict.entityId})`}
                    </h4>
                    {isStoreConflict && conflict.details?.message && (
                      <p className="text-xs font-medium text-rose-700 mt-1">
                        {conflict.details.message}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Perangkat</p>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <Smartphone size={14} className="text-slate-400" />
                        {conflict.deviceId}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">User Kasir</p>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <User size={14} className="text-slate-400" />
                        {conflict.userId}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Waktu Transaksi</p>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <Clock size={14} className="text-slate-400" />
                        {format(new Date(conflict.timestamp), 'dd/MM HH:mm')}
                      </div>
                    </div>
                    {isStoreConflict && conflict.details?.total && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nominal Struk</p>
                        <p className="text-xs font-black text-rose-600 tabular-nums">
                          Rp {Number(conflict.details.total).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Detail Payload Event:</p>
                    <pre className="text-[10px] font-mono text-slate-600 overflow-x-auto max-h-36">
                      {JSON.stringify(conflict.details, null, 2)}
                    </pre>
                  </div>
                </div>

                <div className="md:w-52 flex flex-col gap-2.5 justify-center shrink-0">
                  <button 
                    onClick={() => resolveConflict(conflict.conflictId, 'RESOLVE')}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 shadow-md shadow-emerald-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CheckCircle size={15} />
                    <span>Terima Transaksi</span>
                  </button>
                  <button 
                    onClick={() => resolveConflict(conflict.conflictId, 'REJECT')}
                    className="w-full py-3 bg-white text-rose-600 border border-rose-200 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <XCircle size={15} />
                    <span>Tolak & Batalkan</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
