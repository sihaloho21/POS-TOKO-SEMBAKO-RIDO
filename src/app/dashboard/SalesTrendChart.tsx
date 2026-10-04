import React, { useMemo } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import type { Transaction } from '@/core/types';

interface SalesTrendChartProps {
  transactions: Transaction[];
}

export function SalesTrendChart({ transactions }: SalesTrendChartProps) {
  const chartData = useMemo(() => {
    if (!transactions) return [];
    
    const last30Days = eachDayOfInterval({
      start: subDays(new Date(), 29),
      end: new Date()
    });

    return last30Days.map(date => {
      const dayStart = startOfDay(date);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      
      const dayTransactions = transactions.filter(tx => {
        const txDate = new Date(tx.clientTimestamp);
        return txDate >= dayStart && txDate <= dayEnd && tx.status === 'COMPLETED';
      });

      const totalVolume = dayTransactions.reduce((sum, tx) => sum + tx.total, 0);

      return {
        name: format(date, 'dd MMM'),
        value: totalVolume
      };
    });
  }, [transactions]);

  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
      <div className="flex justify-between items-center mb-8">
        <h3 className="font-black text-slate-900 uppercase tracking-tight">Daily Sales Volume (Last 30 Days)</h3>
        <div className="flex gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Sales (IDR)</span>
        </div>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} 
              interval="preserveStartEnd"
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} 
              tickFormatter={(val) => `Rp${(val/1000).toFixed(0)}k`} 
            />
            <Tooltip 
              formatter={(val: any) => [`Rp ${Number(val).toLocaleString()}`, 'Total Sales']}
              contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }}
              itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="#3b82f6" 
              strokeWidth={4} 
              dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
