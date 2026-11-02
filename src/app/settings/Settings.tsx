import React, { useState } from 'react';
import ReceiptSettings from './ReceiptSettings';
import PaymentMethods from './PaymentMethods';
import LoyaltySettings from './LoyaltySettings';
import SystemHealth from '../system/SystemHealth';
import { Printer, CreditCard, Trophy, Cpu } from 'lucide-react';
import { useDevModeStore } from '@/core/dev-mode-store';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'RECEIPT' | 'PAYMENT' | 'LOYALTY' | 'DIAGNOSTICS'>('RECEIPT');
  const { isDevMode, toggleDevMode } = useDevModeStore();
  const [clickCount, setClickCount] = useState(0);

  const handleHeaderClick = () => {
    const newCount = clickCount + 1;
    if (newCount >= 7) {
      toggleDevMode();
      setClickCount(0);
    } else {
      setClickCount(newCount);
      // Reset after 3 seconds of inactivity
      setTimeout(() => setClickCount(0), 3000);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 
          className="text-2xl font-black text-slate-900 uppercase tracking-tight cursor-default select-none"
          onClick={handleHeaderClick}
        >
          Pengaturan Toko
        </h2>
      </div>

      <div className="flex flex-wrap gap-4 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('RECEIPT')}
          className={`pb-4 px-2 font-black text-xs uppercase tracking-widest transition-all relative ${
            activeTab === 'RECEIPT' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <Printer size={16} />
            Receipt & Branding
          </div>
          {activeTab === 'RECEIPT' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />
          )}
        </button>

        <button 
          onClick={() => setActiveTab('PAYMENT')}
          className={`pb-4 px-2 font-black text-xs uppercase tracking-widest transition-all relative ${
            activeTab === 'PAYMENT' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <CreditCard size={16} />
            Payment Methods
          </div>
          {activeTab === 'PAYMENT' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />
          )}
        </button>

        <button 
          onClick={() => setActiveTab('LOYALTY')}
          className={`pb-4 px-2 font-black text-xs uppercase tracking-widest transition-all relative ${
            activeTab === 'LOYALTY' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <Trophy size={16} />
            Loyalty & Membership
          </div>
          {activeTab === 'LOYALTY' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />
          )}
        </button>

        {isDevMode && (
          <button 
            onClick={() => setActiveTab('DIAGNOSTICS')}
            className={`pb-4 px-2 font-black text-xs uppercase tracking-widest transition-all relative ${
              activeTab === 'DIAGNOSTICS' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className="flex items-center gap-2">
              <Cpu size={16} />
              Diagnostik Sistem (Dev)
            </div>
            {activeTab === 'DIAGNOSTICS' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full" />
            )}
          </button>
        )}
      </div>

      <div>
        {activeTab === 'RECEIPT' ? (
          <ReceiptSettings />
        ) : activeTab === 'PAYMENT' ? (
          <PaymentMethods />
        ) : activeTab === 'LOYALTY' ? (
          <LoyaltySettings />
        ) : isDevMode ? (
          <SystemHealth />
        ) : (
          <ReceiptSettings />
        )}
      </div>
    </div>
  );
}
