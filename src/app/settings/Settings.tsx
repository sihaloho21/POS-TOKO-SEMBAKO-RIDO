import React, { useState } from 'react';
import ReceiptSettings from './ReceiptSettings';
import PaymentMethods from './PaymentMethods';
import { Printer, CreditCard } from 'lucide-react';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'RECEIPT' | 'PAYMENT'>('RECEIPT');

  return (
    <div className="space-y-8">
      <div className="flex gap-4 border-b border-slate-200">
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
      </div>

      <div>
        {activeTab === 'RECEIPT' ? <ReceiptSettings /> : <PaymentMethods />}
      </div>
    </div>
  );
}
