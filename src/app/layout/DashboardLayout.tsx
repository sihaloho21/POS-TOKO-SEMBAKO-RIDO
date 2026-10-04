import React, { useState } from 'react';
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
  Smartphone
} from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'motion/react';
import { ShiftService } from '@/core/services/shift-service';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  hidden?: boolean;
}

function NavItem({ icon, label, active, onClick, hidden }: NavItemProps) {
  if (hidden) return null;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
        active 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="font-medium text-sm truncate">{label}</span>
    </button>
  );
}

export default function DashboardLayout({ children, currentTab, onTabChange }: { 
  children: React.ReactNode;
  currentTab: string;
  onTabChange: (tab: string) => void;
}) {
  const { currentUser, logout } = useAuthStore();
  const isOnline = useOnlineStatus();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const pendingSyncCount = useLiveQuery(
    () => db.syncQueue.where('status').anyOf(['PENDING', 'FAILED', 'SYNCING']).count()
  );

  const conflictCount = useLiveQuery(
    () => db.conflicts.where('status').equals('PENDING').count()
  );

  const currentShift = useLiveQuery(() => ShiftService.getCurrentShift('device-1'), []);

  const userRole = currentUser?.role || 'KASIR';
  const isOwner = userRole === 'OWNER';
  const isManager = userRole === 'MANAGER' || isOwner;
  const isWarehouse = userRole === 'WAREHOUSE' || isManager;
  const isKasir = userRole === 'KASIR' || isManager;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, hidden: !isWarehouse && !isKasir },
    { id: 'pos', label: 'POS', icon: <ShoppingCart size={18} />, hidden: !isKasir },
    { id: 'transactions', label: 'Transactions', icon: <History size={18} />, hidden: !isKasir && !isManager },
    { id: 'inventory', label: 'Inventory', icon: <Package size={18} />, hidden: !isWarehouse },
    { id: 'fish', label: 'Fish Management', icon: <Fish size={18} />, hidden: !isWarehouse },
    { id: 'bundles', label: 'Bundles & Packages', icon: <Layers size={18} />, hidden: !isWarehouse },
    { id: 'customers', label: 'Customers', icon: <Users size={18} />, hidden: !isKasir },
    { id: 'digital', label: 'Digital Services', icon: <Smartphone size={18} />, hidden: !isKasir },
    { id: 'shift', label: 'Cashier Shift', icon: <ClipboardList size={18} />, hidden: !isKasir },
    { id: 'stock-opname', label: 'Stock Opname', icon: <ClipboardList size={18} />, hidden: !isWarehouse },
    { id: 'suppliers', label: 'Suppliers', icon: <Truck size={18} />, hidden: !isWarehouse },
    { id: 'purchases', label: 'Purchases', icon: <ShoppingBag size={18} />, hidden: !isWarehouse },
    { id: 'supplier-return', label: 'Supplier Return', icon: <Archive size={18} />, hidden: !isWarehouse },
    { id: 'receivables', label: 'Receivables', icon: <CreditCard size={18} />, hidden: !isKasir },
    { id: 'finance', label: 'Finance', icon: <TrendingUp size={18} />, hidden: !isManager },
    { id: 'audit', label: 'Audit Log', icon: <ShieldCheck size={18} />, hidden: !isOwner },
    { id: 'conflicts', label: 'Conflicts', icon: <AlertTriangle size={18} />, badge: conflictCount, hidden: !isManager },
    { id: 'system-health', label: 'System Health', icon: <Activity size={18} />, hidden: !isOwner },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-slate-200">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <RefreshCw className="text-white" size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 leading-none tracking-tight">HARAPAN JAYA</h2>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Business System</span>
            </div>
          </div>

          <nav className="space-y-1 overflow-y-auto max-h-[calc(100vh-250px)] custom-scrollbar">
            {navItems.map((item) => (
              <div key={item.id} className="relative">
                <NavItem 
                  {...item}
                  active={currentTab === item.id}
                  onClick={() => onTabChange(item.id)}
                />
                {item.badge ? (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {item.badge}
                  </span>
                ) : null}
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-white rounded-full border border-slate-200 flex items-center justify-center text-blue-600 font-bold shadow-sm">
              {currentUser?.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 truncate text-sm">{currentUser?.name}</p>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{currentUser?.role}</p>
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
          </div>

          <div className="flex items-center gap-3">
            {/* Detailed Status Bar (PRD 98) */}
            <div className="hidden md:flex items-center gap-3 px-3 py-1 bg-slate-50 rounded-full border border-slate-200">
              <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3">
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                <span className="text-[10px] font-bold text-slate-600 uppercase">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              
              <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3 text-[10px] font-bold text-slate-500">
                <ClipboardList size={12} />
                {currentShift ? currentShift.shiftId.slice(-6).toUpperCase() : 'NO SHIFT'}
              </div>

              {pendingSyncCount !== undefined && pendingSyncCount > 0 && (
                <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3 text-[10px] font-bold text-blue-600 animate-pulse">
                  <RefreshCw size={12} className="animate-spin-slow" />
                  SYNC: {pendingSyncCount}
                </div>
              )}

              {conflictCount !== undefined && conflictCount > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600">
                  <AlertTriangle size={12} />
                  {conflictCount} CONFLICT
                </div>
              )}
            </div>

            <button className="p-2 text-slate-400 hover:text-slate-600 relative">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </button>
          </div>
        </header>

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
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><RefreshCw size={16} /></div>
                  <h2 className="font-bold text-slate-900">Harapan Jaya</h2>
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
                      onTabChange(item.id);
                      setIsSidebarOpen(false);
                    }}
                  />
                ))}
              </nav>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
