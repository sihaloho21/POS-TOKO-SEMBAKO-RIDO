import React, { useState } from 'react';
import ReceiptSettings from './ReceiptSettings';
import PaymentMethods from './PaymentMethods';
import LoyaltySettings from './LoyaltySettings';
import SystemHealth from '../system/SystemHealth';
import { Printer, CreditCard, Trophy, Cpu } from 'lucide-react';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'RECEIPT' | 'PAYMENT' | 'LOYALTY' | 'DIAGNOSTICS'>('RECEIPT');

  return (
    <div className="space-y-8">
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
      </div>

      <div>
        {activeTab === 'RECEIPT' ? (
          <ReceiptSettings />
        ) : activeTab === 'PAYMENT' ? (
          <PaymentMethods />
        ) : activeTab === 'LOYALTY' ? (
          <LoyaltySettings />
        ) : (
          <SystemHealth />
        )}
      </div>
    </div>
  );
}
