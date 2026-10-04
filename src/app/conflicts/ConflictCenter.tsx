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
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { AuditEngine } from '@/core/audit-engine';

export default function ConflictCenter() {
  const [search, setSearch] = useState('');
  
  const conflicts = useLiveQuery(
    () => db.conflicts.where('status').equals('PENDING').toArray()
  );

  const resolveConflict = async (conflictId: string, resolution: 'RESOLVE' | 'REJECT') => {
    const conflict = await db.conflicts.get(conflictId);
    if (!conflict) return;

    const timestamp = new Date().toISOString();
    
    // 1. Update Conflict Status
    await db.conflicts.update(conflictId, {
      status: resolution === 'RESOLVE' ? 'RESOLVED' : 'REJECTED',
      resolvedAt: timestamp,
      resolvedBy: 'OWNER_RIDO' // Should be from store
    });

    // 2. Audit Resolution
    await AuditEngine.log({
      userId: 'OWNER_RIDO',
      role: 'OWNER',
      deviceId: 'device-1',
      action: `CONFLICT_${resolution}`,
      module: 'CONFLICT',
      referenceId: conflictId,
      after: { resolution, resolvedAt: timestamp }
    });

    // 3. Sync Resolution
    await db.syncQueue.add({
      entityType: 'conflicts',
      entityId: conflictId,
      action: 'UPDATE',
      payload: { status: resolution === 'RESOLVE' ? 'RESOLVED' : 'REJECTED' },
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Conflict Center</h2>
        <p className="text-slate-500 text-sm font-medium">Review dan selesaikan tabrakan data antar perangkat (Offline Conflicts).</p>
      </div>

      <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-6 flex gap-4 items-start">
        <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-lg shadow-amber-200">
          <AlertTriangle size={24} />
        </div>
        <div>
          <h3 className="font-bold text-amber-900 uppercase tracking-tight">Peringatan Integritas</h3>
          <p className="text-sm text-amber-700 leading-relaxed font-medium">
            Sistem mendeteksi {conflicts?.length || 0} konflik data. Harapan Jaya POS tidak menggunakan 
            <em> "Last Write Wins"</em> — semua event yang bertabrakan dipertahankan agar Anda dapat memilih 
            resolusi yang paling tepat sesuai fakta di lapangan.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {conflicts?.length === 0 ? (
          <div className="py-20 bg-white rounded-3xl border border-slate-200 text-center text-slate-300">
            <CheckCircle size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm font-bold uppercase tracking-widest">Tidak ada konflik pending</p>
          </div>
        ) : (
          conflicts?.map((conflict) => (
            <div key={conflict.conflictId} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row gap-6">
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black px-2 py-1 bg-rose-100 text-rose-600 rounded uppercase tracking-widest">
                    {conflict.type.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-bold text-slate-400">ID: {conflict.conflictId}</span>
                </div>
                
                <h4 className="font-bold text-slate-900 uppercase tracking-tight">
                  Tabrakan Data pada {conflict.entityType} ({conflict.entityId})
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Perangkat</p>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <Smartphone size={14} className="text-slate-400" />
                      {conflict.deviceId}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">User</p>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <User size={14} className="text-slate-400" />
                      {conflict.userId}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Waktu</p>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <Clock size={14} className="text-slate-400" />
                      {format(new Date(conflict.timestamp), 'dd/MM HH:mm')}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Payload Details:</p>
                  <pre className="text-[10px] font-mono text-slate-600 overflow-x-auto">
                    {JSON.stringify(conflict.details, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="md:w-48 flex flex-col gap-2 justify-center">
                <button 
                  onClick={() => resolveConflict(conflict.conflictId, 'RESOLVE')}
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle size={14} /> Teriman Event
                </button>
                <button 
                  onClick={() => resolveConflict(conflict.conflictId, 'REJECT')}
                  className="w-full py-3 bg-white text-rose-500 border border-rose-100 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 transition-all flex items-center justify-center gap-2"
                >
                  <XCircle size={14} /> Tolak / Abaikan
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
