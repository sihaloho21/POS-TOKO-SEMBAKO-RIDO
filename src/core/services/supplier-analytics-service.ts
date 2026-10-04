import { db } from '../database';
import type { Supplier, Purchase } from '../types';

export interface SupplierReliability {
  supplierId: string;
  name: string;
  reliabilityScore: number; // 0-100
  avgDeliveryDays: number;
  priceStability: number; // 0-1 (higher is better)
  totalOrders: number;
}

export class SupplierAnalyticsService {
  static async getVendorReliability(): Promise<SupplierReliability[]> {
    const suppliers = await db.suppliers.toArray();
    const allPurchases = await db.purchases.toArray();

    return suppliers.map(supplier => {
      const vendorPurchases = allPurchases.filter(p => p.supplierId === supplier.supplierId && p.status === 'PAID');
      
      if (vendorPurchases.length === 0) {
        return {
          supplierId: supplier.supplierId,
          name: supplier.name,
          reliabilityScore: 0,
          avgDeliveryDays: 0,
          priceStability: 1,
          totalOrders: 0
        };
      }

      // 1. Calculate Avg Delivery Days (Time between Created and Confirmed/Paid)
      // For this simple mock/system, we'll assume a delivery cycle if we had more timestamps
      // Let's assume stability based on price changes
      
      const priceChanges: number[] = [];
      const productPriceHistory: Record<string, number[]> = {};

      vendorPurchases.forEach(p => {
        p.items.forEach(item => {
          if (!productPriceHistory[item.productId]) productPriceHistory[item.productId] = [];
          productPriceHistory[item.productId].push(item.purchasePrice);
        });
      });

      let stabilityScore = 0;
      let trackedProducts = 0;

      Object.values(productPriceHistory).forEach(prices => {
        if (prices.length < 2) return;
        trackedProducts++;
        const variances: number[] = [];
        for (let i = 1; i < prices.length; i++) {
          variances.push(Math.abs(prices[i] - prices[i-1]) / prices[i-1]);
        }
        const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
        stabilityScore += Math.max(0, 1 - avgVariance);
      });

      const finalStability = trackedProducts > 0 ? (stabilityScore / trackedProducts) : 1;
      
      // Delivery score is hard without "receivedAt" field, so we prioritize stability and volume
      const volumeScore = Math.min(1, vendorPurchases.length / 10);
      const reliabilityScore = Math.round((finalStability * 0.7 + volumeScore * 0.3) * 100);

      return {
        supplierId: supplier.supplierId,
        name: supplier.name,
        reliabilityScore,
        avgDeliveryDays: 2.5, // Placeholder as we lack separate tracking for delivery time
        priceStability: finalStability,
        totalOrders: vendorPurchases.length
      };
    }).sort((a, b) => b.reliabilityScore - a.reliabilityScore);
  }
}
