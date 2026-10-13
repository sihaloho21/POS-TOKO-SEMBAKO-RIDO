import { db } from './database';
import type { LoyaltyEvent, Transaction, Customer } from './types';
import { v4 as uuidv4 } from 'uuid';

export interface CustomerLoyaltyStats {
  currentPoints: number;
  totalEarned: number;
  totalRedeemed: number;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  nextTier: string | null;
  pointsToNextTier: number;
  progressPercent: number;
  tierPerks: string[];
}

export class LoyaltyEngine {
  static readonly POINTS_PER_AMOUNT = 10000; // 1 Poin per Rp 10.000 total belanja

  /**
   * Calculate loyalty points based on transaction total.
   * Reseller accounts are excluded from loyalty program (PRD 37).
   */
  static async calculatePoints(transaction: Transaction): Promise<number> {
    if (!transaction.customerId) return 0;
    const customer = await db.customers.get(transaction.customerId);
    if (!customer || customer.isReseller) return 0;

    // Calculate points strictly based on transaction total
    return Math.floor(Math.max(0, transaction.total) / this.POINTS_PER_AMOUNT);
  }

  /**
   * Calculate potential loyalty points preview from an amount directly.
   */
  static calculatePointsForAmount(amount: number, isReseller: boolean = false): number {
    if (isReseller || amount <= 0) return 0;
    return Math.floor(amount / this.POINTS_PER_AMOUNT);
  }

  /**
   * Record earn event when transaction is completed in POS.
   */
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

  /**
   * Record reversal event when a transaction is refunded/returned.
   */
  static async recordReversalEvent(customerId: string, points: number, transactionId: string): Promise<void> {
    if (points <= 0) return;

    const timestamp = new Date().toISOString();
    const event: LoyaltyEvent = {
      loyaltyEventId: uuidv4(),
      customerId,
      type: 'REVERSAL',
      points: -points,
      referenceId: transactionId,
      referenceType: 'TRANSACTION',
      timestamp
    };

    await db.loyaltyEvents.add(event);

    const customer = await db.customers.get(customerId);
    if (customer) {
      const newTotal = Math.max(0, (customer.loyaltyPoints || 0) - points);
      await db.customers.update(customerId, { loyaltyPoints: newTotal });

      await db.syncQueue.add({
        entityType: 'customers',
        entityId: customerId,
        action: 'UPDATE',
        payload: { ...customer, loyaltyPoints: newTotal },
        status: 'PENDING',
        retryCount: 0,
        createdAt: timestamp
      });
    }

    await db.syncQueue.add({
      entityType: 'loyaltyEvents',
      entityId: event.loyaltyEventId,
      action: 'CREATE',
      payload: event,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });
  }

  /**
   * Record manual adjustment or point redemption by authorized staff.
   */
  static async recordAdjustmentEvent(params: {
    customerId: string;
    type: 'EARN' | 'REDEEM';
    points: number;
    reason: string;
    referenceId?: string;
  }): Promise<void> {
    const { customerId, type, points, reason, referenceId } = params;
    if (points <= 0) return;

    const timestamp = new Date().toISOString();
    const eventPoints = type === 'EARN' ? points : -points;

    const event: LoyaltyEvent = {
      loyaltyEventId: uuidv4(),
      customerId,
      type,
      points: eventPoints,
      referenceId: referenceId || `ADJ-${Date.now().toString().slice(-6)}`,
      referenceType: type === 'REDEEM' ? 'REDEEM' : 'ADJUSTMENT',
      timestamp,
      notes: reason
    };

    await db.loyaltyEvents.add(event);

    const customer = await db.customers.get(customerId);
    if (customer) {
      const newTotal = Math.max(0, (customer.loyaltyPoints || 0) + eventPoints);
      await db.customers.update(customerId, { loyaltyPoints: newTotal });

      await db.syncQueue.add({
        entityType: 'customers',
        entityId: customerId,
        action: 'UPDATE',
        payload: { ...customer, loyaltyPoints: newTotal },
        status: 'PENDING',
        retryCount: 0,
        createdAt: timestamp
      });
    }

    await db.syncQueue.add({
      entityType: 'loyaltyEvents',
      entityId: event.loyaltyEventId,
      action: 'CREATE',
      payload: event,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });
  }

  /**
   * Get full audit history of loyalty events for customer.
   */
  static async getHistory(customerId: string): Promise<LoyaltyEvent[]> {
    return db.loyaltyEvents
      .where('customerId')
      .equals(customerId)
      .reverse()
      .sortBy('timestamp');
  }

  /**
   * Get comprehensive customer loyalty statistics and tier level.
   */
  static async getCustomerStats(customerId: string): Promise<CustomerLoyaltyStats> {
    const customer = await db.customers.get(customerId);
    const events = await db.loyaltyEvents.where('customerId').equals(customerId).toArray();

    const currentPoints = customer?.loyaltyPoints || 0;
    let totalEarned = 0;
    let totalRedeemed = 0;

    for (const ev of events) {
      if (ev.type === 'EARN') {
        totalEarned += ev.points;
      } else if (ev.type === 'REDEEM') {
        totalRedeemed += Math.abs(ev.points);
      }
    }

    // Determine tier
    let tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' = 'BRONZE';
    let nextTier: string | null = 'SILVER';
    let pointsToNextTier = 50 - currentPoints;
    let progressPercent = Math.min(100, Math.round((currentPoints / 50) * 100));
    let tierPerks = ['Akses Promo Sembako Reguler', 'Kupon Belanja Bulanan'];

    if (currentPoints >= 500) {
      tier = 'PLATINUM';
      nextTier = null;
      pointsToNextTier = 0;
      progressPercent = 100;
      tierPerks = ['VIP Bebas Antri Prioritas', 'Harga Grosir Khusus', 'Hadiah Sembako Tahunan', 'Layanan Pesan Antar Bebas Biaya'];
    } else if (currentPoints >= 200) {
      tier = 'GOLD';
      nextTier = 'PLATINUM (500 Pts)';
      pointsToNextTier = 500 - currentPoints;
      progressPercent = Math.min(100, Math.round(((currentPoints - 200) / 300) * 100));
      tierPerks = ['Diskon Member 5% Terpilih', 'Prioritas Pemesanan Stok', 'Bonus Dobel Poin Hari Tertentu'];
    } else if (currentPoints >= 50) {
      tier = 'SILVER';
      nextTier = 'GOLD (200 Pts)';
      pointsToNextTier = 200 - currentPoints;
      progressPercent = Math.min(100, Math.round(((currentPoints - 50) / 150) * 100));
      tierPerks = ['Diskon Member 2%', 'Bonus Poin Produk Sponsor'];
    }

    return {
      currentPoints,
      totalEarned,
      totalRedeemed,
      tier,
      nextTier,
      pointsToNextTier: Math.max(0, pointsToNextTier),
      progressPercent: Math.max(0, Math.min(100, progressPercent)),
      tierPerks
    };
  }
}
