import { db } from './database';
import type { LoyaltyEvent, Transaction, Customer, MemberTierConfig } from './types';
import { v4 as uuidv4 } from 'uuid';
import { LoyaltySettingsService, DEFAULT_LOYALTY_SETTINGS } from './services/loyalty-settings-service';

export interface CustomerLoyaltyStats {
  currentPoints: number;
  totalEarned: number;
  totalRedeemed: number;
  totalSpend: number;
  tier: string;
  tierId: string;
  tierDiscountPercent: number;
  tierColorScheme: string;
  nextTier: string | null;
  pointsToNextTier: number;
  spendToNextTier: number;
  progressPercent: number;
  tierPerks: string[];
  pointRedemptionValue: number;
  pointsRupiahValue: number;
  qualificationBasis: 'LIFETIME_POINTS' | 'LIFETIME_SPEND';
}

export class LoyaltyEngine {
  /**
   * Calculate loyalty points based on transaction total and dynamic settings.
   */
  static async calculatePoints(transaction: Transaction): Promise<number> {
    if (!transaction.customerId) return 0;
    const settings = await LoyaltySettingsService.getSettings();
    if (!settings.isEnabled) return 0;

    const customer = await db.customers.get(transaction.customerId);
    if (!customer) return 0;
    if (settings.excludeReseller && customer.isReseller) return 0;

    const pointsRatio = Math.max(1, settings.pointsPerAmount);
    return Math.floor(Math.max(0, transaction.total) / pointsRatio);
  }

  /**
   * Calculate potential loyalty points preview from an amount directly.
   */
  static calculatePointsForAmount(
    amount: number,
    isReseller: boolean = false,
    pointsPerAmount: number = DEFAULT_LOYALTY_SETTINGS.pointsPerAmount,
    excludeReseller: boolean = true
  ): number {
    if (excludeReseller && isReseller) return 0;
    if (amount <= 0) return 0;
    const ratio = Math.max(1, pointsPerAmount);
    return Math.floor(amount / ratio);
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
   * Record manual adjustment or point redemption by authorized staff or POS.
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
   * Get comprehensive customer loyalty statistics and tier level evaluated against dynamic settings.
   */
  static async getCustomerStats(customerId: string): Promise<CustomerLoyaltyStats> {
    const [customer, events, settings, transactions] = await Promise.all([
      db.customers.get(customerId),
      db.loyaltyEvents.where('customerId').equals(customerId).toArray(),
      LoyaltySettingsService.getSettings(),
      db.transactions.where('customerId').equals(customerId).toArray().catch(() =>
        db.transactions.filter(t => t.customerId === customerId).toArray()
      )
    ]);

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

    // Total spend in completed sales
    const totalSpend = transactions
      .filter(tx => tx.status === 'COMPLETED' && tx.type !== 'RETURN')
      .reduce((sum, tx) => sum + (tx.total || 0), 0);

    // Score for tier qualification
    const qualificationScore = settings.qualificationBasis === 'LIFETIME_SPEND'
      ? totalSpend
      : Math.max(totalEarned, currentPoints);

    // Sort tiers by minThreshold ascending
    const sortedTiers = [...(settings.tiers || [])].sort((a, b) => a.minThreshold - b.minThreshold);

    // Find current tier
    let activeTier: MemberTierConfig = sortedTiers[0] || {
      id: 'tier-default',
      name: 'MEMBER',
      minThreshold: 0,
      discountPercent: 0,
      colorScheme: 'BRONZE',
      perks: ['Akses Promo Sembako']
    };
    let nextTierConfig: MemberTierConfig | null = null;

    for (let i = 0; i < sortedTiers.length; i++) {
      if (qualificationScore >= sortedTiers[i].minThreshold) {
        activeTier = sortedTiers[i];
        nextTierConfig = sortedTiers[i + 1] || null;
      } else {
        if (!nextTierConfig) nextTierConfig = sortedTiers[i];
        break;
      }
    }

    let pointsToNextTier = 0;
    let spendToNextTier = 0;
    let progressPercent = 100;

    if (nextTierConfig) {
      const currentTierThreshold = activeTier.minThreshold;
      const nextThreshold = nextTierConfig.minThreshold;
      const span = Math.max(1, nextThreshold - currentTierThreshold);
      const progressAmount = Math.max(0, qualificationScore - currentTierThreshold);

      progressPercent = Math.min(100, Math.max(0, Math.round((progressAmount / span) * 100)));

      if (settings.qualificationBasis === 'LIFETIME_SPEND') {
        spendToNextTier = Math.max(0, nextThreshold - qualificationScore);
        pointsToNextTier = Math.ceil(spendToNextTier / Math.max(1, settings.pointsPerAmount));
      } else {
        pointsToNextTier = Math.max(0, nextThreshold - qualificationScore);
        spendToNextTier = pointsToNextTier * Math.max(1, settings.pointsPerAmount);
      }
    }

    const pointsRupiahValue = currentPoints * settings.pointRedemptionValue;

    return {
      currentPoints,
      totalEarned,
      totalRedeemed,
      totalSpend,
      tier: activeTier.name,
      tierId: activeTier.id,
      tierDiscountPercent: activeTier.discountPercent || 0,
      tierColorScheme: activeTier.colorScheme || 'BRONZE',
      nextTier: nextTierConfig ? `${nextTierConfig.name} (${settings.qualificationBasis === 'LIFETIME_SPEND' ? `Rp ${nextTierConfig.minThreshold.toLocaleString()}` : `${nextTierConfig.minThreshold} Pts`})` : null,
      pointsToNextTier,
      spendToNextTier,
      progressPercent,
      tierPerks: activeTier.perks || [],
      pointRedemptionValue: settings.pointRedemptionValue,
      pointsRupiahValue,
      qualificationBasis: settings.qualificationBasis
    };
  }

  /**
   * Determine member tier discount applicable for customer during POS sale
   */
  static async getCustomerTierDiscount(customerId: string): Promise<{
    tierName: string;
    discountPercent: number;
    colorScheme: string;
  }> {
    const stats = await this.getCustomerStats(customerId);
    return {
      tierName: stats.tier,
      discountPercent: stats.tierDiscountPercent,
      colorScheme: stats.tierColorScheme
    };
  }
}
