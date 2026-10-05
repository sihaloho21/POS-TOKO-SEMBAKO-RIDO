import { useEffect, useState } from 'react';
import { useAuthStore } from './core/auth-store';
import Login from './app/auth/Login';
import DashboardLayout from './app/layout/DashboardLayout';
import Dashboard from './app/dashboard/Dashboard';
import POS from './app/pos/POS';
import Inventory from './app/inventory/Inventory';
import Finance from './app/finance/Finance';
import Customers from './app/customers/Customers';
import SystemHealth from './app/system/SystemHealth';
import AuditLog from './app/audit/AuditLog';
import DigitalServices from './app/digital/DigitalServices';
import BundleManagement from './app/inventory/BundleManagement';
import FishManagement from './app/inventory/FishManagement';
import ConflictCenter from './app/conflicts/ConflictCenter';
import Shift from './app/shift/Shift';
import ShiftHistory from './app/shift/ShiftHistory';
import StockOpname from './app/inventory/StockOpname';
import SupplierReturn from './app/purchases/SupplierReturn';
import Purchases from './app/purchases/Purchases';
import Suppliers from './app/suppliers/Suppliers';
import ReceiptSettings from './app/settings/ReceiptSettings';
import TransactionHistory from './app/transactions/TransactionHistory';
import KasirDashboard from './app/dashboard/KasirDashboard';
import ToastContainer from './app/components/ToastContainer';
import { SyncEngine } from './core/sync-engine';
import { ProductService } from './core/services/product-service';

export default function App() {
  const { currentUser, isAuthenticated, initializeAuth } = useAuthStore();
  const [currentTab, setCurrentTab] = useState('dashboard');

  useEffect(() => {
    // Ensure Firebase Auth is ready
    initializeAuth().catch(err => console.warn('Auth init failed:', err));
  }, [initializeAuth]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Start background sync
    SyncEngine.start();

    // Check low stock
    ProductService.checkLowStock().catch(err => console.warn('checkLowStock failed:', err));
    const stockInterval = setInterval(() => {
      ProductService.checkLowStock().catch(err => console.warn('checkLowStock failed:', err));
    }, 5 * 60 * 1000);

    return () => {
      SyncEngine.stop();
      clearInterval(stockInterval);
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Login />;
  }

  // Owner-only modules that Kasir must never access (PRD 5.2, 82, 96, 114)
  const OWNER_ONLY_MODULES = [
    'inventory',
    'fish',
    'bundles',
    'suppliers',
    'purchases',
    'supplier-return',
    'receivables',
    'finance',
    'audit',
    'conflicts',
    'system-health',
    'settings'
  ];

  const renderContent = () => {
    // Role boundary enforcement
    if (currentUser?.role === 'KASIR' && OWNER_ONLY_MODULES.includes(currentTab)) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8 bg-white rounded-3xl border border-slate-200">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-4">
            <span className="text-2xl font-black">🔒</span>
          </div>
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">
            Akses Ditolak (Owner Only)
          </h3>
          <p className="text-sm text-slate-500 font-medium max-w-md mb-6">
            Role Anda adalah <span className="font-bold text-emerald-600">KASIR</span>. Sesuai regulasi sistem bisnis, modul finansial, HPP, margin, dan manajemen inventori hanya dapat diakses oleh <span className="font-bold text-blue-600">OWNER</span>.
          </p>
          <button
            onClick={() => setCurrentTab('pos')}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 shadow-lg shadow-blue-200 transition-all"
          >
            Buka Kasir POS
          </button>
        </div>
      );
    }

    switch (currentTab) {
      case 'dashboard':
        return currentUser?.role === 'KASIR' 
          ? <KasirDashboard onNavigate={setCurrentTab} /> 
          : <Dashboard onTabChange={setCurrentTab} />;
      case 'pos':
        return <POS />;
      case 'transactions':
        return <TransactionHistory />;
      case 'inventory':
        return <Inventory />;
      case 'fish':
        return <FishManagement />;
      case 'bundles':
        return <BundleManagement />;
      case 'finance':
        return <Finance />;
      case 'customers':
        return <Customers />;
      case 'digital':
        return <DigitalServices />;
      case 'shift':
        return <Shift />;
      case 'shift-history':
        return <ShiftHistory />;
      case 'stock-opname':
        return <StockOpname />;
      case 'suppliers':
        return <Suppliers onNavigate={setCurrentTab} />;
      case 'purchases':
        return <Purchases />;
      case 'supplier-return':
        return <SupplierReturn />;
      case 'conflicts':
        return <ConflictCenter />;
      case 'audit':
        return <AuditLog />;
      case 'system-health':
        return <SystemHealth />;
      case 'settings':
        return <ReceiptSettings />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <h2 className="text-xl font-bold mb-2">{currentTab} Module</h2>
            <p>Coming soon...</p>
          </div>
        );
    }
  };

  return (
    <>
      <DashboardLayout currentTab={currentTab} onTabChange={setCurrentTab}>
        {renderContent()}
      </DashboardLayout>
      <ToastContainer />
    </>
  );
}
