import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { InventoryPredictionService, type InventoryPrediction } from '@/core/services/inventory-prediction-service';
import { TrendingUp, AlertCircle, ShoppingCart, Calendar, Zap, Clock } from 'lucide-react';
import { format } from 'date-fns';

export function InventoryProjectionsWidget() {
  const [priority, setPriority] = useState<'URGENT' | 'VELOCITY'>('URGENT');
  const projections = useLiveQuery(() => InventoryPredictionService.getPredictions(), []);

  if (!projections) return (
    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-pulse h-[400px]">
      <div className="h-6 w-48 bg-slate-100 rounded-lg mb-6" />
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-50 rounded-2xl" />)}
      </div>
    </div>
  );

  const displayItems = [...projections]
    .sort((a, b) => priority === 'URGENT' ? a.daysRemaining - b.daysRemaining : b.dailyBurnRate - a.dailyBurnRate)
    .slice(0, 10);

  const urgentCount = projections.filter(p => p.daysRemaining <= 7).length;

  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[500px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <TrendingUp size={20} className="text-blue-600" /> Inventory Projections
          </h3>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Smart Restock suggestions</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
          <button 
            onClick={() => setPriority('URGENT')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${
              priority === 'URGENT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'
            }`}
          >
            <Clock size={12} /> Urgent
          </button>
          <button 
            onClick={() => setPriority('VELOCITY')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${
              priority === 'VELOCITY' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400'
            }`}
          >
            <Zap size={12} /> Velocity
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
        {displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4">
              <TrendingUp size={32} />
            </div>
            <p className="text-xs font-bold text-slate-900 uppercase">Stock Levels Stable</p>
            <p className="text-[10px] text-slate-400 font-medium mt-1">No items predicted to run out soon.</p>
          </div>
        ) : (
          displayItems.map((p) => {
            const isDanger = p.daysRemaining <= 3;
            const isWarning = p.daysRemaining <= 7;
            const isVelocity = priority === 'VELOCITY' && p.dailyBurnRate > 5;

            return (
              <div 
                key={p.productId} 
                className={`p-4 rounded-2xl border transition-all hover:shadow-md ${
                  isDanger ? 'bg-rose-50 border-rose-100' : isWarning ? 'bg-amber-50 border-amber-100' : isVelocity ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="max-w-[180px]">
                    <h4 className="text-xs font-black text-slate-900 uppercase truncate">{p.name}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className={`text-[9px] font-black uppercase tracking-widest ${
                        isDanger ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-slate-400'
                      }`}>
                        {p.daysRemaining > 365 ? '1 Year+' : `${p.daysRemaining} days left`}
                      </p>
                      {isVelocity && (
                        <span className="text-[7px] font-black px-1 py-0.5 bg-blue-600 text-white rounded uppercase tracking-widest">High Velocity</span>
                      )}
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded-lg flex items-center gap-1.5 ${
                    isDanger ? 'bg-rose-600 text-white' : isWarning ? 'bg-amber-500 text-white' : 'bg-slate-900 text-white'
                  }`}>
                    <ShoppingCart size={12} />
                    <span className="text-[10px] font-black tabular-nums">+{p.suggestedReorderQty}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="space-y-0.5">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Daily Burn</p>
                      <p className="text-[10px] font-bold text-slate-900 tabular-nums">{p.dailyBurnRate} / Day</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Expected Outage</p>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-900">
                        <Calendar size={10} className="text-slate-400" />
                        {format(new Date(p.nextOutageDate), 'MMM dd')}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex -space-x-1">
                    {[...Array(Math.min(5, Math.ceil(p.dailyBurnRate)))].map((_, i) => (
                      <div key={i} className={`w-1.5 h-4 rounded-full ${isDanger ? 'bg-rose-300' : isWarning ? 'bg-amber-300' : 'bg-blue-300'}`} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-rose-500">
          <AlertCircle size={14} />
          <span className="text-[10px] font-black uppercase tracking-widest">{urgentCount} Urgent Issues</span>
        </div>
        <button 
          className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all flex items-center gap-2"
          onClick={() => window.location.hash = '#/inventory'}
        >
          View Full Report
        </button>
      </div>
    </div>
  );
}
