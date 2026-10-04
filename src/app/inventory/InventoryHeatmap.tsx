import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/database';
import { Flame, Snowflake, Info, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { subDays } from 'date-fns';

export function InventoryHeatmap() {
  const products = useLiveQuery(() => db.products.toArray());
  const transactions = useLiveQuery(() => 
    db.transactions
      .where('clientTimestamp')
      .above(subDays(new Date(), 30).toISOString())
      .filter(tx => tx.status === 'COMPLETED')
      .toArray()
  );

  const heatmapData = useMemo(() => {
    if (!products || !transactions) return [];

    const stats = products.map(product => {
      let totalSold = 0;
      let transactionCount = 0;
      
      transactions.forEach(tx => {
        const item = tx.items.find(i => i.productId === product.productId);
        if (item) {
          totalSold += item.quantity;
          transactionCount++;
        }
      });

      return {
        ...product,
        totalSold,
        transactionCount,
        // Intensity score: combination of volume and frequency
        intensity: (totalSold * 0.7) + (transactionCount * 30 * 0.3) 
      };
    });

    return stats.sort((a, b) => b.intensity - a.intensity);
  }, [products, transactions]);

  const maxIntensity = Math.max(...heatmapData.map(d => d.intensity), 1);

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Flame size={20} className="text-orange-500" />
              Product Movement Heatmap
            </h3>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Intensity Analysis (Last 30 Days)</p>
          </div>
          <div className="flex items-center gap-4 p-2 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-rose-500 rounded-full shadow-lg shadow-rose-200" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hot</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-400 rounded-full shadow-lg shadow-blue-100" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cold</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {heatmapData.map((item) => {
            const ratio = item.intensity / maxIntensity;
            // Calculate color based on intensity
            // High = Rose/Orange, Low = Blue/Slate
            const opacity = Math.max(0.1, ratio);
            
            return (
              <div 
                key={item.productId}
                className="group relative flex flex-col p-4 rounded-2xl border border-slate-100 bg-white hover:shadow-xl transition-all cursor-default overflow-hidden"
              >
                {/* Heat Overlay */}
                <div 
                  className="absolute inset-0 pointer-events-none transition-opacity duration-500"
                  style={{ 
                    backgroundColor: ratio > 0.6 ? '#f43f5e' : ratio > 0.3 ? '#f59e0b' : '#38bdf8',
                    opacity: opacity * 0.15
                  }}
                />

                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${
                      ratio > 0.6 ? 'bg-rose-100 text-rose-600' : ratio > 0.3 ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-500'
                    }`}>
                      {ratio > 0.6 ? 'HOT' : ratio > 0.3 ? 'WARM' : 'COLD'}
                    </span>
                    {ratio > 0.5 ? <ArrowUpRight size={14} className="text-emerald-500" /> : <ArrowDownRight size={14} className="text-slate-300" />}
                  </div>

                  <h4 className="text-xs font-black text-slate-900 uppercase truncate mb-1" title={item.name}>
                    {item.name}
                  </h4>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-4">
                    {item.sku || item.barcode}
                  </p>

                  <div className="mt-auto pt-3 border-t border-slate-50 flex justify-between items-end">
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Volume</p>
                      <p className="text-xs font-black text-slate-900 tabular-nums">{item.totalSold}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Freq</p>
                      <p className="text-xs font-black text-slate-900 tabular-nums">{item.transactionCount}x</p>
                    </div>
                  </div>
                </div>

                {/* Tooltip-like Info on Hover */}
                <div className="absolute inset-0 bg-slate-900/95 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center text-white">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-2">Performance</p>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[8px] font-bold text-slate-400 uppercase">Intensity</span>
                      <span className="text-[10px] font-black">{Math.round(ratio * 100)}%</span>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${ratio * 100}%` }} />
                    </div>
                    <p className="text-[9px] text-slate-300 leading-tight mt-2">
                      {ratio > 0.8 ? 'This product is a top performer. Keep stock levels high.' : 
                       ratio < 0.2 ? 'Slow movement. Consider promotional tagging.' : 
                       'Steady demand observed.'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {heatmapData.length === 0 && (
          <div className="py-20 text-center text-slate-300">
            <Snowflake size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm font-bold uppercase tracking-widest">No transaction data yet</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-emerald-600 p-8 rounded-3xl text-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-white/20 rounded-2xl">
              <Flame size={24} />
            </div>
            <div>
              <h4 className="font-black uppercase tracking-tight text-lg">Top 3 Heat Leaders</h4>
              <p className="text-[10px] text-white/60 font-black uppercase tracking-widest">Highest Inventory Turnover</p>
            </div>
          </div>
          <div className="space-y-4">
            {heatmapData.slice(0, 3).map((item, idx) => (
              <div key={item.productId} className="flex items-center justify-between p-4 bg-white/10 rounded-2xl border border-white/10">
                <div className="flex items-center gap-4">
                  <span className="text-lg font-black opacity-40">0{idx + 1}</span>
                  <span className="font-bold uppercase text-sm">{item.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black">{item.totalSold}</p>
                  <p className="text-[8px] font-black uppercase opacity-60">Sold in 30d</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-3xl text-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-white/10 rounded-2xl text-blue-400">
              <Snowflake size={24} />
            </div>
            <div>
              <h4 className="font-black uppercase tracking-tight text-lg text-blue-400">Cold Stock Alert</h4>
              <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Lowest Movement Intensity</p>
            </div>
          </div>
          <div className="space-y-4">
            {heatmapData.slice(-3).reverse().map((item, idx) => (
              <div key={item.productId} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-4 text-slate-400">
                  <span className="text-lg font-black opacity-20">0{idx + 1}</span>
                  <span className="font-bold uppercase text-sm">{item.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-slate-400">{item.totalSold}</p>
                  <p className="text-[8px] font-black uppercase opacity-20 text-slate-500">Sold in 30d</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
