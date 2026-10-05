import React, { useMemo } from 'react';
import { 
  AreaChart, 
  Area, 
  ResponsiveContainer,
  Tooltip,
  XAxis
} from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import type { Transaction } from '@/core/types';
import { TrendingUp, Package, Wallet } from 'lucide-react';
import { TopSellingItemsChart } from './TopSellingItemsChart';

interface VisualAnalyticsSectionProps {
  transactions: Transaction[];
}

export function VisualAnalyticsSection({ transactions }: VisualAnalyticsSectionProps) {
  const trendData = useMemo(() => {
    if (!transactions) return [];
    
    const last7Days = eachDayOfInterval({
      start: subDays(new Date(), 6),
      end: new Date()
    });

    return last7Days.map(date => {
      const dayStart = startOfDay(date);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      
      const dayTransactions = transactions.filter(tx => {
        const txDate = new Date(tx.clientTimestamp);
        return txDate >= dayStart && txDate <= dayEnd && tx.status === 'COMPLETED';
      });

      return {
        name: format(date, 'EEE'),
        revenue: dayTransactions.reduce((sum, tx) => sum + tx.total, 0)
      };
    });
  }, [transactions]);

  const totalWeekRevenue = trendData.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Weekly Revenue Trend Card */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-blue-600">
              <TrendingUp size={18} />
              <h3 className="font-black text-slate-900 uppercase tracking-tight">Tren Pendapatan 7 Hari</h3>
            </div>
            <p className="text-2xl font-black text-slate-900 tabular-nums">
              Rp {totalWeekRevenue.toLocaleString()}
            </p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total 1 Minggu Terakhir</p>
          </div>
          <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest">
            Weekly View
          </div>
        </div>

        <div className="flex-1 min-h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 'black', fill: '#94a3b8' }}
              />
              <Tooltip 
                formatter={(val: any) => [`Rp ${Number(val).toLocaleString()}`, 'Revenue']}
                contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }}
                itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
              />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="#3b82f6" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorRevenue)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products Card */}
      <TopSellingItemsChart transactions={transactions} />
    </div>
  );
}
