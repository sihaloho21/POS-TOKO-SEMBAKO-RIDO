import React, { useState } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  ShieldCheck, 
  Search, 
  User, 
  Smartphone, 
  Clock,
  Eye,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';

export default function AuditLog() {
  const [search, setSearch] = useState('');
  
  const logs = useLiveQuery(
    () => db.auditLogs.orderBy('timestamp').reverse().filter(log => 
      log.module.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      log.userId.toLowerCase().includes(search.toLowerCase())
    ).limit(100).toArray(),
    [search]
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Audit Log</h2>
          <p className="text-slate-500 text-sm font-medium">Histori aktivitas sistem append-only untuk transparansi penuh.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari user, modul, atau aksi..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-sm"
              value={search ?? ''}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black">
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Modul</th>
                <th className="px-6 py-4">Aksi</th>
                <th className="px-6 py-4">Device</th>
                <th className="px-6 py-4 text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-300 font-bold uppercase tracking-widest opacity-50">
                    Belum ada data audit
                  </td>
                </tr>
              ) : (
                logs?.map((log) => (
                  <tr key={log.auditId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Clock size={14} />
                        <span className="text-xs font-bold tabular-nums">
                          {format(new Date(log.timestamp), 'dd/MM HH:mm:ss')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-blue-500" />
                        <span className="text-xs font-bold text-slate-900">{log.userId}</span>
                        <span className="text-[10px] font-black px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase">
                          {log.role}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-black px-2 py-1 bg-blue-50 text-blue-600 rounded-md uppercase tracking-widest">
                        {log.module}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-700">{log.action.replace('_', ' ')}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Smartphone size={14} />
                        <span className="text-[10px] font-bold">{log.deviceId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
