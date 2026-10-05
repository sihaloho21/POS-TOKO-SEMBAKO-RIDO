import React, { useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import type { Transaction } from '@/core/types';

interface TopSellingItemsChartProps {
  transactions: Transaction[];
}

export function TopSellingItemsChart({ transactions }: TopSellingItemsChartProps) {
  const chartData = useMemo(() => {
    if (!transactions) return [];

    const itemSales: Record<string, { name: string; count: number; revenue: number }> = {};

    transactions.forEach(tx => {
      if (tx.status !== 'COMPLETED') return;
      tx.items.forEach(item => {
        if (!itemSales[item.productId]) {
          itemSales[item.productId] = { 
            name: item.nameSnapshot, 
            count: 0, 
            revenue: 0 
          };
        }
        itemSales[item.productId].count += item.quantity;
        itemSales[item.productId].revenue += item.subtotal;
      });
    });

    return Object.values(itemSales)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(item => ({
        name: item.name.substring(0, 15) + (item.name.length > 15 ? '...' : ''),
        fullName: item.name,
        count: item.count,
        revenue: item.revenue
      }));
  }, [transactions]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e'];

  if (chartData.length === 0) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm h-full flex items-center justify-center text-slate-400 font-bold text-xs uppercase tracking-widest">
        Belum ada data penjualan
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm h-full">
      <div className="flex justify-between items-center mb-8">
        <h3 className="font-black text-slate-900 uppercase tracking-tight">Top 5 Produk Terlaris</h3>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Berdasarkan Volume</span>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
            <XAxis type="number" hide />
            <YAxis 
              dataKey="name" 
              type="category" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fontWeight: 'black', fill: '#64748b' }}
              width={100}
            />
            <Tooltip 
              formatter={(val: any) => [`${val.toLocaleString()} Sold`, 'Volume']}
              contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }}
              itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
              labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'black', marginBottom: '4px' }}
            />
            <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={20}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
