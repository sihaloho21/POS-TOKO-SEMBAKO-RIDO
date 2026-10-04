import { db } from './database';
import type { LoyaltyEvent, Transaction, Customer } from './types';
import { v4 as uuidv4 } from 'uuid';

export class LoyaltyEngine {
  static readonly POINTS_PER_AMOUNT = 10000;

  static async calculatePoints(transaction: Transaction): Promise<number> {
    // PRD 37: Reseller does not get loyalty
    const customer = transaction.customerId ? await db.customers.get(transaction.customerId) : null;
    if (!customer || customer.isReseller) return 0;

    // Filter items based on product type (exclude FISH, DIGITAL)
    let eligibleAmount = 0;
    for (const item of transaction.items) {
      const product = await db.products.get(item.productId);
      if (product && product.productType === 'SEMBAKO') {
        eligibleAmount += item.subtotal;
      }
    }

    return Math.floor(eligibleAmount / this.POINTS_PER_AMOUNT);
  }

  static async recordEarnEvent(customerId: string, points: number, transactionId: string): Promise<void> {
    if (points <= 0) return;

    const event: LoyaltyEvent = {
      loyaltyEventId: uuidv4(),
      customerId,
      type: 'EARN',
      points,
      referenceId: transactionId,
      referenceType: 'TRANSACTION',
      timestamp: new Date().toISOString()
    };

    await db.loyaltyEvents.add(event);

    // Update customer total points
    const customer = await db.customers.get(customerId);
    if (customer) {
      const newTotal = (customer.loyaltyPoints || 0) + points;
      await db.customers.update(customerId, { loyaltyPoints: newTotal });
      
      // Sync queue
      await db.syncQueue.add({
        entityType: 'customers',
        entityId: customerId,
        action: 'UPDATE',
        payload: { ...customer, loyaltyPoints: newTotal },
        status: 'PENDING',
        retryCount: 0,
        createdAt: new Date().toISOString()
      });
    }

    await db.syncQueue.add({
      entityType: 'loyaltyEvents',
      entityId: event.loyaltyEventId,
      action: 'CREATE',
      payload: event,
      status: 'PENDING',
      retryCount: 0,
      createdAt: event.timestamp
    });
  }

  static async getHistory(customerId: string): Promise<LoyaltyEvent[]> {
    return db.loyaltyEvents
      .where('customerId')
      .equals(customerId)
      .reverse()
      .sortBy('timestamp');
  }
}
