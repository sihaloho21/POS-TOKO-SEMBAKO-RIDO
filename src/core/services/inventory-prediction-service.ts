import { db } from '../database';
import type { Product, Transaction } from '../types';
import { subDays, startOfDay } from 'date-fns';

export interface InventoryPrediction {
  productId: string;
  name: string;
  dailyBurnRate: number;
  daysRemaining: number;
  suggestedReorderQty: number;
  nextOutageDate: string;
}

export class InventoryPredictionService {
  static async getPredictions(): Promise<InventoryPrediction[]> {
    const products = await db.products.filter(p => p.status === 'ACTIVE').toArray();
    const transactions = await db.transactions
      .where('clientTimestamp')
      .above(subDays(new Date(), 30).toISOString())
      .filter(tx => tx.status === 'COMPLETED')
      .toArray();

    return products.map(product => {
      // 1. Calculate Daily Burn Rate (last 30 days)
      let totalSold = 0;
      transactions.forEach(tx => {
        const item = tx.items.find(i => i.productId === product.productId);
        if (item) totalSold += item.quantity;
      });

      const dailyBurnRate = totalSold / 30;
      const daysRemaining = dailyBurnRate > 0 ? Math.floor(product.stock / dailyBurnRate) : 999;
      
      // Suggested Reorder: Bring stock back to Target + 7 days buffer
      const bufferQty = dailyBurnRate * 7;
      const suggestedReorderQty = Math.max(0, Math.ceil(product.targetStock - product.stock + bufferQty));
      
      const outageDate = new Date();
      outageDate.setDate(outageDate.getDate() + (daysRemaining > 999 ? 999 : daysRemaining));

      return {
        productId: product.productId,
        name: product.name,
        dailyBurnRate: Number(dailyBurnRate.toFixed(2)),
        daysRemaining,
        suggestedReorderQty,
        nextOutageDate: outageDate.toISOString()
      };
    }).sort((a, b) => a.daysRemaining - b.daysRemaining);
  }
}
