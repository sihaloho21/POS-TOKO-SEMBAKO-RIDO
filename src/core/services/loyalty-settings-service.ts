import { db } from '../database';
import type { LoyaltySettingsConfig, MemberTierConfig } from '../types';
import { AuditEngine } from '../audit-engine';

export const LOYALTY_SETTINGS_ID = 'loyalty';

export const DEFAULT_MEMBER_TIERS: MemberTierConfig[] = [
  {
    id: 'tier-bronze',
    name: 'BRONZE',
    minThreshold: 0,
    discountPercent: 0,
    colorScheme: 'BRONZE',
    perks: ['Akses Promo Sembako Reguler', 'Kupon Belanja Bulanan']
  },
  {
    id: 'tier-silver',
    name: 'SILVER',
    minThreshold: 50,
    discountPercent: 2,
    colorScheme: 'SILVER',
    perks: ['Diskon Member 2%', 'Bonus Poin Produk Sponsor']
  },
  {
    id: 'tier-gold',
    name: 'GOLD',
    minThreshold: 200,
    discountPercent: 5,
    colorScheme: 'GOLD',
    perks: ['Diskon Member 5%', 'Prioritas Pemesanan Stok', 'Bonus Dobel Poin Hari Tertentu']
  },
  {
    id: 'tier-platinum',
    name: 'PLATINUM',
    minThreshold: 500,
    discountPercent: 8,
    colorScheme: 'PLATINUM',
    perks: ['VIP Bebas Antri Prioritas', 'Harga Grosir Khusus', 'Hadiah Sembako Tahunan', 'Layanan Pesan Antar Bebas Biaya']
  }
];

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettingsConfig = {
  id: 'loyalty',
  isEnabled: true,
  pointsPerAmount: 10000,
  pointRedemptionValue: 100,
  minRedemptionPoints: 50,
  qualificationBasis: 'LIFETIME_POINTS',
  excludeReseller: true,
  tiers: DEFAULT_MEMBER_TIERS,
  updatedAt: new Date().toISOString(),
  updatedBy: 'SYSTEM'
};

export class LoyaltySettingsService {
  /**
   * Retrieve active loyalty settings with resilient fallback
   */
  static async getSettings(): Promise<LoyaltySettingsConfig> {
    try {
      const doc = await db.settings.get(LOYALTY_SETTINGS_ID);
      if (doc && doc.id === LOYALTY_SETTINGS_ID) {
        return {
          id: LOYALTY_SETTINGS_ID,
          isEnabled: doc.isEnabled ?? DEFAULT_LOYALTY_SETTINGS.isEnabled,
          pointsPerAmount: Math.max(100, Number(doc.pointsPerAmount) || DEFAULT_LOYALTY_SETTINGS.pointsPerAmount),
          pointRedemptionValue: Math.max(1, Number(doc.pointRedemptionValue) || DEFAULT_LOYALTY_SETTINGS.pointRedemptionValue),
          minRedemptionPoints: Math.max(0, Number(doc.minRedemptionPoints) ?? DEFAULT_LOYALTY_SETTINGS.minRedemptionPoints),
          qualificationBasis: doc.qualificationBasis === 'LIFETIME_SPEND' ? 'LIFETIME_SPEND' : 'LIFETIME_POINTS',
          excludeReseller: doc.excludeReseller ?? DEFAULT_LOYALTY_SETTINGS.excludeReseller,
          tiers: Array.isArray(doc.tiers) && doc.tiers.length > 0 ? doc.tiers : DEFAULT_MEMBER_TIERS,
          updatedAt: doc.updatedAt || new Date().toISOString(),
          updatedBy: doc.updatedBy || 'SYSTEM'
        };
      }
    } catch (err) {
      console.warn('Failed to load loyalty settings from database, using defaults:', err);
    }

    return { ...DEFAULT_LOYALTY_SETTINGS, updatedAt: new Date().toISOString() };
  }

  /**
   * Save or update loyalty settings, emit audit log, and queue for Firestore sync
   */
  static async updateSettings(
    newSettings: Partial<LoyaltySettingsConfig>,
    userId: string
  ): Promise<LoyaltySettingsConfig> {
    const current = await this.getSettings();
    const timestamp = new Date().toISOString();

    // Sort tiers ascending by minThreshold to ensure tiered progression
    let sortedTiers = current.tiers;
    if (newSettings.tiers) {
      sortedTiers = [...newSettings.tiers].sort((a, b) => a.minThreshold - b.minThreshold);
    }

    const updated: LoyaltySettingsConfig = {
      ...current,
      ...newSettings,
      id: LOYALTY_SETTINGS_ID,
      tiers: sortedTiers,
      updatedAt: timestamp,
      updatedBy: userId
    };

    await db.settings.put(updated);

    // Audit log
    await AuditEngine.log({
      userId,
      role: 'OWNER',
      deviceId: 'system',
      action: 'UPDATE_LOYALTY_SETTINGS',
      module: 'SETTINGS',
      referenceId: LOYALTY_SETTINGS_ID,
      before: current,
      after: updated
    });

    // Add to sync queue for Firestore replication
    await db.syncQueue.add({
      entityType: 'settings',
      entityId: LOYALTY_SETTINGS_ID,
      action: 'UPDATE',
      payload: updated,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    return updated;
  }

  /**
   * Reset loyalty settings to factory default
   */
  static async resetToDefaults(userId: string): Promise<LoyaltySettingsConfig> {
    const current = await this.getSettings();
    const timestamp = new Date().toISOString();

    const resetDoc: LoyaltySettingsConfig = {
      ...DEFAULT_LOYALTY_SETTINGS,
      updatedAt: timestamp,
      updatedBy: userId
    };

    await db.settings.put(resetDoc);

    await AuditEngine.log({
      userId,
      role: 'OWNER',
      deviceId: 'system',
      action: 'RESET_LOYALTY_SETTINGS',
      module: 'SETTINGS',
      referenceId: LOYALTY_SETTINGS_ID,
      before: current,
      after: resetDoc
    });

    await db.syncQueue.add({
      entityType: 'settings',
      entityId: LOYALTY_SETTINGS_ID,
      action: 'UPDATE',
      payload: resetDoc,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    return resetDoc;
  }
}
