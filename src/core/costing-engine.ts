import { db } from './database';
import type { Product, ProductCost } from './types';

export class CostingEngine {
  /**
   * Calculates new Weighted Average Cost (WAC) based on incoming purchase.
   * New HPP = ((Current Stock * Current HPP) + (Purchase Qty * Purchase Price)) / (Current Stock + Purchase Qty)
   */
  static async calculateNewWac(productId: string, purchaseQty: number, purchasePrice: number): Promise<number> {
    const product = await db.products.get(productId);
    const cost = await db.productCosts.get(productId);
    
    if (!product) throw new Error('Product not found');
    
    const currentStock = Math.max(0, product.stock); // Ignore negative stock for HPP calculation
    const currentHpp = cost?.hpp || 0;
    
    if (currentStock === 0) {
      return purchasePrice;
    }
    
    const totalCurrentValue = currentStock * currentHpp;
    const totalNewValue = purchaseQty * purchasePrice;
    const totalNewStock = currentStock + purchaseQty;
    
    const newWac = (totalCurrentValue + totalNewValue) / totalNewStock;
    return Math.round(newWac); // Rounding for financial ledger simplicity
  }

  static async updateHpp(productId: string, newHpp: number): Promise<void> {
    const timestamp = new Date().toISOString();
    await db.productCosts.put({
      productId,
      hpp: newHpp,
      updatedAt: timestamp
    });
  }
}
