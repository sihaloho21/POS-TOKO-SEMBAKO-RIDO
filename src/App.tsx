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
import { SyncEngine } from './core/sync-engine';
import { ProductService } from './core/services/product-service';

export default function App() {
  const { isAuthenticated, initializeAuth } = useAuthStore();
  const [currentTab, setCurrentTab] = useState('dashboard');

  useEffect(() => {
    // Ensure Firebase Auth is ready
    initializeAuth();
    
    // Start background sync
    SyncEngine.start();

    // Check low stock
    ProductService.checkLowStock();
    const stockInterval = setInterval(() => ProductService.checkLowStock(), 5 * 60 * 1000);

    return () => {
      SyncEngine.stop();
      clearInterval(stockInterval);
    };
  }, [initializeAuth]);

  if (!isAuthenticated) {
    return <Login />;
  }

  const renderContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'pos':
        return <POS />;
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
      case 'conflicts':
        return <ConflictCenter />;
      case 'audit':
        return <AuditLog />;
      case 'system-health':
        return <SystemHealth />;
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
    <DashboardLayout currentTab={currentTab} onTabChange={setCurrentTab}>
      {renderContent()}
    </DashboardLayout>
  );
}
