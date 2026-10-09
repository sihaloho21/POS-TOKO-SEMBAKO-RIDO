import React from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Bell, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Info,
  Trash2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function NotificationCenter({ onClose, onNavigate }: { onClose: () => void; onNavigate?: (tab: string) => void }) {
  const notifications = useLiveQuery(
    async () => {
      try {
        const all = await db.notifications.toArray();
        return all
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          .slice(0, 50);
      } catch (err) {
        console.warn('Notifications query warning:', err);
        return [];
      }
    },
    [],
    []
  );
  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  const handleClickItem = async (n: any) => {
    await db.notifications.update(n.notificationId, { isRead: true });
    if (n.message.toLowerCase().includes('selisih') || n.message.toLowerCase().includes('shift')) {
      window.dispatchEvent(new CustomEvent('quick_navigate_approval', { detail: { subTab: 'approvals', shiftId: n.referenceId } }));
      if (onNavigate) onNavigate('conflicts');
      onClose();
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications?.filter(n => !n.isRead) || [];
    for (const n of unread) {
      await db.notifications.update(n.notificationId, { isRead: true });
    }
  };

  const clearAll = async () => {
    if (confirm('Hapus semua notifikasi?')) {
      await db.notifications.clear();
    }
  };

  const getIcon = (severity: string) => {
    switch (severity) {
      case 'URGENT': return <AlertTriangle size={16} className="text-rose-500" />;
      case 'WARNING': return <AlertTriangle size={16} className="text-amber-500" />;
      case 'INFO': return <Info size={16} className="text-blue-500" />;
      default: return <CheckCircle2 size={16} className="text-emerald-500" />;
    }
  };

  return (
    <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-slate-200 z-[100] overflow-hidden flex flex-col max-h-[500px]">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-blue-600" />
          <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded-full uppercase">
              {unreadCount} New
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <button onClick={markAllAsRead} className="p-2 text-slate-400 hover:text-blue-600 transition-all" title="Mark all as read">
            <CheckCircle2 size={18} />
          </button>
          <button onClick={clearAll} className="p-2 text-slate-400 hover:text-rose-600 transition-all" title="Clear all">
            <Trash2 size={18} />
          </button>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-all">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-50 custom-scrollbar">
        {notifications?.length === 0 ? (
          <div className="py-20 text-center text-slate-300">
            <Bell size={48} className="mx-auto mb-4 opacity-10" />
            <p className="text-xs font-bold uppercase tracking-widest">No notifications</p>
          </div>
        ) : (
          notifications?.map((n) => (
            <div 
              key={n.notificationId} 
              className={`p-4 flex gap-4 transition-all hover:bg-slate-50 cursor-pointer ${n.isRead ? 'opacity-60' : 'bg-blue-50/30'}`}
              onClick={() => handleClickItem(n)}
            >
              <div className="shrink-0 mt-1">
                {getIcon(n.severity)}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium leading-relaxed ${n.isRead ? 'text-slate-500' : 'text-slate-900'}`}>
                  {n.message}
                </p>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-2">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
