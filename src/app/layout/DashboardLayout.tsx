import React, { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/core/auth-store';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Settings, 
  LogOut,
  RefreshCw,
  TrendingUp,
  CreditCard,
  Menu,
  X,
  Truck,
  History,
  AlertTriangle,
  ClipboardList,
  Activity,
  ShieldCheck,
  Bell,
  Archive,
  Layers,
  ShoppingBag,
  Fish,
  Smartphone,
  Lock,
  Clock,
  CalendarClock,
  Receipt,
  Store,
  CheckCircle2,
  AlertOctagon,
  Banknote,
  Apple
} from 'lucide-react';
import { useFirestoreConnection } from '@/hooks/useFirestoreConnection';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'motion/react';
import { ShiftService } from '@/core/services/shift-service';
import { StoreStatusService } from '@/core/services/store-status-service';
import { StaffDebtService } from '@/core/services/staff-debt-service';
import { isPast, parseISO } from 'date-fns';
import { useDeviceId } from '@/core/device-store';
import { useFirestoreCollection } from '@/core/firestore-realtime';
import ClockInModal from '@/app/shift/ClockInModal';
import ClockOutModal from '@/app/shift/ClockOutModal';
import StoreStatusModal from '@/app/settings/StoreStatusModal';
import { NotificationCenter } from './NotificationCenter';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  badge?: number;
}

function NavItem({ icon, label, active, onClick, disabled, disabledReason, badge }: NavItemProps) {
  if (disabled) {
    return (
      <div 
        className="w-full cursor-not-allowed select-none" 
        title={disabledReason || `${label} dikunci (Hanya untuk Owner - Read Only)`}
      >
        <button
          type="button"
          disabled
          tabIndex={-1}
          aria-disabled="true"
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all pointer-events-none opacity-40 grayscale text-slate-400 bg-slate-100/50 border border-slate-200/40"
        >
          <span className="shrink-0 text-slate-400">{icon}</span>
          <span className="font-medium text-sm truncate text-slate-400">{label}</span>
          <span className="ml-auto flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-slate-400 bg-slate-200/80 px-1.5 py-0.5 rounded shrink-0">
            <Lock size={10} />
            Lock
          </span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
        active 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="font-medium text-sm truncate">{label}</span>
      {badge ? (
        <span className="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export default function DashboardLayout({ children, currentTab, onTabChange }: { 
  children: React.ReactNode;
  currentTab: string;
  onTabChange: (tab: string) => void;
}) {
  const { currentUser, logout } = useAuthStore();
  const { isOnline, isRetrying, retryConnection } = useFirestoreConnection();
  const deviceId = useDeviceId();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isClockInOpen, setIsClockInOpen] = useState(false);
  const [isClockOutOpen, setIsClockOutOpen] = useState(false);
  const [isStoreStatusOpen, setIsStoreStatusOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  
  const unreadNotificationCount = useLiveQuery(
    () => db.notifications.filter(n => !n.isRead).count()
  );

  const pendingSyncCount = useLiveQuery(
    async () => {
      try {
        return await db.syncQueue.where('status').anyOf(['PENDING', 'FAILED', 'SYNCING']).count();
      } catch {
        return 0;
      }
    },
    [],
    0
  );

  const conflictCount = useLiveQuery(
    async () => {
      try {
        return await db.conflicts.where('status').equals('PENDING').count();
      } catch {
        return 0;
      }
    },
    [],
    0
  );

  const pendingDiscrepanciesCount = useLiveQuery(
    async () => {
      try {
        const list = await db.shifts
          .where('status')
          .equals('CLOSED')
          .filter(s => Boolean(s.discrepancy && s.discrepancy !== 0 && (s.discrepancyApprovalStatus || 'PENDING') !== 'APPROVED'))
          .toArray();
        return list.length;
      } catch {
        return 0;
      }
    },
    [],
    0
  );

  const overdueKasbonCount = useLiveQuery(
    async () => {
      try {
        const debts = await StaffDebtService.getStaffDebts();
        return debts.filter(d => d.remainingAmount > 0 && isPast(parseISO(d.dueDate))).length;
      } catch {
        return 0;
      }
    },
    [],
    0
  );

  const totalConflictsAndApprovals = (conflictCount || 0) + (pendingDiscrepanciesCount || 0);

  // Quick navigation listener from browser notifications
  useEffect(() => {
    const handleQuickNav = () => {
      onTabChange('conflicts');
    };
    window.addEventListener('quick_navigate_approval', handleQuickNav);
    return () => {
      window.removeEventListener('quick_navigate_approval', handleQuickNav);
    };
  }, [onTabChange]);

  const storeConfig = useLiveQuery(() => StoreStatusService.getStoreStatus(), []);
  const currentShift = useLiveQuery(() => ShiftService.getCurrentShift(deviceId, currentUser?.userId), [deviceId, currentUser?.userId]);

  const { data: cloudPrepOrders } = useFirestoreCollection<any>('prepOrders');
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const pendingPrepCount = useMemo(() => {
    if (!cloudPrepOrders || cloudPrepOrders.length === 0) return 0;
    return cloudPrepOrders.filter(o => 
      o.scheduledDate === todayStr && (o.status === 'PENDING' || o.status === 'IN_PROGRESS')
    ).length;
  }, [cloudPrepOrders, todayStr]);

  const isOwner = currentUser?.role === 'OWNER';

  // All navbar menus are displayed for Kasir, with Owner-only menus disabled/read-only
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'pos', label: 'POS', icon: <ShoppingCart size={18} /> },
    { 
      id: 'order-schedule', 
      label: 'Jadwal & To-Do', 
      icon: <CalendarClock size={18} />, 
      badge: (pendingPrepCount && pendingPrepCount > 0) ? pendingPrepCount : undefined 
    },
    { id: 'shift', label: 'Cashier Shift', icon: <ClipboardList size={18} /> },
    { id: 'shift-history', label: 'Shift History', icon: <CalendarClock size={18} /> },
    { id: 'transactions', label: 'Riwayat Transaksi (Sales)', icon: <Receipt size={18} /> },
    { id: 'customers', label: 'Customers', icon: <Users size={18} /> },
    { id: 'digital', label: 'Digital Services', icon: <Smartphone size={18} /> },
    { id: 'inventory', label: 'Inventory', icon: <Package size={18} />, disabled: !isOwner },
    { id: 'fish', label: 'Fish Management', icon: <Fish size={18} />, disabled: !isOwner },
    { id: 'fruit', label: 'Penjualan Buah', icon: <Apple size={18} />, disabled: !isOwner },
    { id: 'bundles', label: 'Bundles & Packages', icon: <Layers size={18} /> },
    { id: 'stock-opname', label: 'Stock Opname / Count', icon: <ClipboardList size={18} /> },
    { id: 'suppliers', label: 'Suppliers', icon: <Truck size={18} />, disabled: !isOwner },
    { id: 'purchases', label: 'Purchases', icon: <ShoppingBag size={18} />, disabled: !isOwner },
    { id: 'supplier-return', label: 'Supplier Return', icon: <Archive size={18} />, disabled: !isOwner },
    { id: 'receivables', label: 'Receivables & Kasbon', icon: <CreditCard size={18} />, badge: overdueKasbonCount > 0 ? overdueKasbonCount : undefined, disabled: !isOwner },
    { id: 'finance', label: 'Finance', icon: <TrendingUp size={18} />, disabled: !isOwner },
    ...(isOwner ? [{ id: 'payroll', label: 'Penggajian Karyawan', icon: <Banknote size={18} /> }] : []),
    { id: 'audit', label: 'Audit Log', icon: <ShieldCheck size={18} />, disabled: !isOwner },
    { id: 'conflicts', label: 'Conflicts & Approvals', icon: <AlertTriangle size={18} />, badge: totalConflictsAndApprovals, disabled: !isOwner },
    { id: 'consignment', label: 'Titipan Barang (Bagi Hasil)', icon: <TrendingUp size={18} />, disabled: !isOwner },
    { id: 'system-health', label: 'System Health', icon: <Activity size={18} />, disabled: !isOwner },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} />, disabled: !isOwner },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-slate-200">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-md border border-slate-100 overflow-hidden p-1">
              <img 
                src="/assets/aistudio/LOGO_PS_0fc4cc95.png" 
                alt="Logo" 
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 leading-none tracking-tight">PAKET SEMBAKO</h2>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Business System</span>
            </div>
          </div>

          <nav className="space-y-1 overflow-y-auto max-h-[calc(100vh-250px)] custom-scrollbar">
            {navItems.map((item) => (
              <div key={item.id} className="relative">
                <NavItem 
                  {...item}
                  active={currentTab === item.id}
                  onClick={() => {
                    if (!item.disabled) {
                      onTabChange(item.id);
                    }
                  }}
                />
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center font-black shadow-sm text-sm ${
              isOwner ? 'bg-blue-600 text-white border-blue-600 shadow-blue-200' : 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-200'
            }`}>
              {currentUser?.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 truncate text-sm leading-tight">{currentUser?.name}</p>
              <div className="flex items-center gap-1 mt-1">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                  isOwner ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                }`}>
                  {currentUser?.role === 'OWNER' ? '👑 OWNER' : '💼 KASIR'}
                </span>
              </div>
            </div>
          </div>
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-all text-sm font-bold"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header / Status Bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <button className="lg:hidden p-2 text-slate-600" onClick={() => setIsSidebarOpen(true)}><Menu /></button>
            <h1 className="text-sm font-bold text-slate-900 uppercase tracking-wider">{currentTab.replace('-', ' ')}</h1>

            {/* STORE STATUS BADGE & OWNER TOGGLE (PRD Req 8) */}
            <button
              type="button"
              onClick={() => isOwner && setIsStoreStatusOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider transition-all border shadow-xs ${
                storeConfig?.status === 'BUKA'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100 animate-pulse'
              } ${isOwner ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'}`}
              title={isOwner ? 'Klik untuk mengubah status toko (Buka / Tutup)' : `Status Toko: ${storeConfig?.status}`}
            >
              <span className={`w-2 h-2 rounded-full ${storeConfig?.status === 'BUKA' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <Store size={13} />
              <span>TOKO {storeConfig?.status || 'BUKA'}</span>
              {isOwner && (
                <span className="text-[9px] bg-white/80 px-1 rounded font-bold lowercase text-slate-500 border border-slate-200">
                  edit
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Subtle, Real-Time Online/Offline Firestore Status Indicator */}
            <ConnectionStatusIndicator />

            {/* Detailed Status Bar (PRD 98 & Req 8) */}
            <div className="hidden md:flex items-center gap-3 px-3 py-1 bg-slate-50 rounded-full border border-slate-200">

              {/* Device ID (Terminal) */}
              <div className="flex items-center gap-1 border-r border-slate-200 pr-3 text-[10px] font-bold text-slate-600" title={`Perangkat POS: ${deviceId}`}>
                <Smartphone size={12} className="text-slate-400" />
                <span className="uppercase">{deviceId}</span>
              </div>
              
              <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3 text-[10px] font-bold text-slate-500">
                <ClipboardList size={12} />
                {currentShift ? `SHIFT: ${currentShift.shiftId.slice(-6).toUpperCase()}` : 'NO SHIFT'}
              </div>

              {pendingSyncCount !== undefined && pendingSyncCount > 0 && (
                <button
                  type="button"
                  onClick={() => isOwner && onTabChange('system-health')}
                  className={`flex items-center gap-1.5 border-r border-slate-200 pr-3 text-[10px] font-bold text-blue-600 animate-pulse ${isOwner ? 'hover:underline cursor-pointer' : ''}`}
                  title={isOwner ? "Ada antrian data lokal. Klik untuk buka System Health & Push Sync" : "Antrian sync aktif"}
                >
                  <RefreshCw size={12} className="animate-spin-slow" />
                  SYNC: {pendingSyncCount}
                </button>
              )}

              {conflictCount !== undefined && conflictCount > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600">
                  <AlertTriangle size={12} />
                  {conflictCount} CONFLICT
                </div>
              )}
            </div>

            {/* Shift Actions: Clock In or Clock Out */}
            {!currentShift ? (
              <button
                type="button"
                onClick={() => setIsClockInOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-xs font-black uppercase tracking-wider shadow-sm shadow-emerald-200 transition-all animate-pulse"
                title="Mulai Shift Kerja Kasir (Clock In)"
              >
                <Clock size={13} />
                <span>Clock In</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsClockOutOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-full text-xs font-black uppercase tracking-wider transition-all"
                title="Tutup Shift Kerja Kasir (Clock Out)"
              >
                <Lock size={13} />
                <span>Clock Out</span>
              </button>
            )}

            <div className="relative">
              <button 
                type="button"
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl relative transition-all cursor-pointer"
                title="Pusat Notifikasi"
              >
                <Bell size={20} />
                {unreadNotificationCount !== undefined && unreadNotificationCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                )}
              </button>

              {isNotificationOpen && (
                <NotificationCenter 
                  onClose={() => setIsNotificationOpen(false)} 
                  onNavigate={onTabChange}
                />
              )}
            </div>
          </div>
        </header>

        {/* Subtle, Non-Intrusive Offline Warning Strip */}
        {!isOnline && (
          <div className="bg-amber-500/10 border-b border-amber-200/80 text-amber-900 px-4 py-2 text-xs font-medium flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-xs animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="text-[11px]">
                <strong className="font-bold">Perhatian:</strong> Koneksi Firestore terputus. Sistem akan otomatis menyambungkan kembali saat internet pulih.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => retryConnection()}
                disabled={isRetrying}
                className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                title="Paksa sambungkan ulang Firestore menggunakan enableNetwork()"
              >
                <RefreshCw size={12} className={isRetrying ? 'animate-spin' : ''} />
                <span>{isRetrying ? 'Menghubungkan...' : 'Retry Connection'}</span>
              </button>
              <span className="text-[10px] text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0">
                Offline
              </span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0 overflow-y-auto p-6 scroll-smooth">
            {children}
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <div className="fixed inset-0 z-[100] lg:hidden">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setIsSidebarOpen(false)}
            />
            <motion.aside 
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 left-0 bottom-0 w-80 bg-white shadow-2xl flex flex-col p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-slate-100 overflow-hidden p-1">
                    <img src="/assets/aistudio/LOGO_PS_0fc4cc95.png" alt="Logo" className="w-full h-full object-contain" />
                  </div>
                  <h2 className="font-bold text-slate-900 uppercase">PAKET SEMBAKO</h2>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-400"><X /></button>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto">
                {navItems.map((item) => (
                  <NavItem 
                    key={item.id}
                    {...item}
                    active={currentTab === item.id}
                    onClick={() => {
                      if (!item.disabled) {
                        onTabChange(item.id);
                        setIsSidebarOpen(false);
                      }
                    }}
                  />
                ))}
              </nav>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Clock In Modal */}
      <ClockInModal 
        isOpen={isClockInOpen} 
        onClose={() => setIsClockInOpen(false)} 
      />

      {/* Clock Out Modal */}
      <ClockOutModal
        isOpen={isClockOutOpen}
        onClose={() => setIsClockOutOpen(false)}
      />

      {/* Store Status Modal for Owner */}
      <StoreStatusModal
        isOpen={isStoreStatusOpen}
        onClose={() => setIsStoreStatusOpen(false)}
      />
    </div>
  );
}
