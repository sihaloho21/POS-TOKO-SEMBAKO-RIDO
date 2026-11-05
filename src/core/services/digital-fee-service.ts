import { db } from '../database';
import type { 
  DigitalFeeSettings, 
  DigitalServiceConfigItem, 
  DigitalFeeTier, 
  DigitalServiceType 
} from '../types';
import { AuditEngine } from '../audit-engine';
import { cloudSetDoc } from '../firestore-realtime';

export const DIGITAL_FEE_SETTINGS_ID = 'digital_fee_settings';

export const DEFAULT_DIGITAL_FEE_SETTINGS: DigitalFeeSettings = {
  id: 'digital_fee_settings',
  allowCashierManualOverride: false,
  updatedAt: new Date().toISOString(),
  updatedBy: 'SYSTEM',
  configs: {
    TRANSFER: {
      serviceType: 'TRANSFER',
      label: 'Transfer Bank',
      pricingModel: 'TIERED',
      flatFee: 5000,
      fallbackFee: 5000,
      isEnabled: true,
      tiers: [
        { id: 'tier-trf-1', minAmount: 0, maxAmount: 50000, feeAmount: 3000, label: '0 - 50k' },
        { id: 'tier-trf-2', minAmount: 50001, maxAmount: 100000, feeAmount: 5000, label: '50k - 100k' },
        { id: 'tier-trf-3', minAmount: 100001, maxAmount: 500000, feeAmount: 7500, label: '100k - 500k' },
        { id: 'tier-trf-4', minAmount: 500001, maxAmount: 1000000, feeAmount: 10000, label: '500k - 1 Juta' },
        { id: 'tier-trf-5', minAmount: 1000001, maxAmount: 0, feeAmount: 15000, label: '100k+ / > 1 Juta (Tanpa Batas)' }
      ]
    },
    TOPUP: {
      serviceType: 'TOPUP',
      label: 'Top Up E-Wallet',
      pricingModel: 'TIERED',
      flatFee: 3000,
      fallbackFee: 3000,
      isEnabled: true,
      tiers: [
        { id: 'tier-top-1', minAmount: 0, maxAmount: 50000, feeAmount: 2000, label: '0 - 50k' },
        { id: 'tier-top-2', minAmount: 50001, maxAmount: 100000, feeAmount: 3000, label: '50k - 100k' },
        { id: 'tier-top-3', minAmount: 100001, maxAmount: 0, feeAmount: 5000, label: '100k+ (Tanpa Batas)' }
      ]
    },
    TARIK_TUNAI: {
      serviceType: 'TARIK_TUNAI',
      label: 'Tarik Tunai',
      pricingModel: 'TIERED',
      flatFee: 5000,
      fallbackFee: 5000,
      isEnabled: true,
      tiers: [
        { id: 'tier-trk-1', minAmount: 0, maxAmount: 50000, feeAmount: 3000, label: '0 - 50k' },
        { id: 'tier-trk-2', minAmount: 50001, maxAmount: 100000, feeAmount: 5000, label: '50k - 100k' },
        { id: 'tier-trk-3', minAmount: 100001, maxAmount: 500000, feeAmount: 8000, label: '100k - 500k' },
        { id: 'tier-trk-4', minAmount: 500001, maxAmount: 1000000, feeAmount: 10000, label: '500k - 1 Juta' },
        { id: 'tier-trk-5', minAmount: 1000001, maxAmount: 0, feeAmount: 15000, label: '100k+ / > 1 Juta (Tanpa Batas)' }
      ]
    },
    PULSA: {
      serviceType: 'PULSA',
      label: 'Pulsa',
      pricingModel: 'FLAT',
      flatFee: 2000,
      fallbackFee: 2000,
      isEnabled: true,
      tiers: []
    },
    PAKET_DATA: {
      serviceType: 'PAKET_DATA',
      label: 'Paket Data',
      pricingModel: 'FLAT',
      flatFee: 2000,
      fallbackFee: 2000,
      isEnabled: true,
      tiers: []
    },
    TOKEN_LISTRIK: {
      serviceType: 'TOKEN_LISTRIK',
      label: 'Token PLN',
      pricingModel: 'FLAT',
      flatFee: 3000,
      fallbackFee: 3000,
      isEnabled: true,
      tiers: []
    }
  }
};

export class DigitalFeeService {
  /**
   * Get active digital fee settings with resilient fallback & auto-seeding
   */
  static async getSettings(): Promise<DigitalFeeSettings> {
    try {
      const doc = await db.settings.get(DIGITAL_FEE_SETTINGS_ID);
      if (doc && doc.id === DIGITAL_FEE_SETTINGS_ID && doc.configs) {
        return {
          id: DIGITAL_FEE_SETTINGS_ID,
          allowCashierManualOverride: Boolean(doc.allowCashierManualOverride),
          updatedAt: doc.updatedAt || new Date().toISOString(),
          updatedBy: doc.updatedBy || 'SYSTEM',
          configs: {
            ...DEFAULT_DIGITAL_FEE_SETTINGS.configs,
            ...doc.configs
          }
        };
      }
    } catch (err) {
      console.warn('Gagal memuat digital fee settings dari database lokal, menggunakan default:', err);
    }

    // Auto-seed default settings into Dexie if absent
    try {
      await db.settings.put(DEFAULT_DIGITAL_FEE_SETTINGS);
    } catch {
      // Ignore if db is busy
    }

    return DEFAULT_DIGITAL_FEE_SETTINGS;
  }

  /**
   * Save or update digital fee settings, record audit log, and queue for Firestore sync
   */
  static async saveSettings(
    newSettings: Partial<DigitalFeeSettings>,
    userId: string
  ): Promise<DigitalFeeSettings> {
    const current = await this.getSettings();
    const timestamp = new Date().toISOString();

    const mergedConfigs = {
      ...current.configs,
      ...(newSettings.configs || {})
    };

    // Sanitize and sort tiers by minAmount for every tiered service
    (Object.keys(mergedConfigs) as DigitalServiceType[]).forEach(type => {
      const item = mergedConfigs[type];
      if (item && item.tiers && Array.isArray(item.tiers)) {
        item.tiers = [...item.tiers]
          .filter(t => t && typeof t.minAmount === 'number')
          .sort((a, b) => a.minAmount - b.minAmount);
      }
    });

    const updated: DigitalFeeSettings = {
      id: DIGITAL_FEE_SETTINGS_ID,
      allowCashierManualOverride: newSettings.allowCashierManualOverride ?? current.allowCashierManualOverride,
      updatedAt: timestamp,
      updatedBy: userId || 'OWNER',
      configs: mergedConfigs
    };

    // 1. Save locally to Dexie
    await db.settings.put(updated);

    // 2. Queue sync to Firestore
    try {
      await db.syncQueue.add({
        entityType: 'settings',
        entityId: DIGITAL_FEE_SETTINGS_ID,
        action: 'UPDATE',
        payload: updated,
        status: 'PENDING',
        retryCount: 0,
        createdAt: timestamp
      });
      // Fire-and-forget direct cloud push
      await cloudSetDoc('settings', DIGITAL_FEE_SETTINGS_ID, updated);
    } catch (e) {
      console.warn('Cloud sync for digital fee settings deferred to queue:', e);
    }

    // 3. Audit log
    try {
      await AuditEngine.log({
        userId: userId || 'OWNER',
        role: 'OWNER',
        deviceId: 'LOCAL_SETTINGS',
        action: 'UPDATE_DIGITAL_FEE_SETTINGS',
        module: 'DIGITAL_SERVICES',
        referenceId: DIGITAL_FEE_SETTINGS_ID,
        before: { updatedAt: current.updatedAt },
        after: { updatedAt: updated.updatedAt, updatedServices: Object.keys(newSettings.configs || {}) }
      });
    } catch (auditErr) {
      console.warn('Audit log failed:', auditErr);
    }

    return updated;
  }

  /**
   * Calculate admin fee dynamically based on service type and principal amount
   */
  static calculateFee(
    serviceType: DigitalServiceType,
    principal: number,
    settings?: DigitalFeeSettings | null
  ): { fee: number; matchedTier?: DigitalFeeTier; isFallback: boolean; pricingModel: 'FLAT' | 'TIERED' } {
    const config = settings?.configs?.[serviceType] || DEFAULT_DIGITAL_FEE_SETTINGS.configs[serviceType];

    if (!config) {
      return { fee: 2000, isFallback: true, pricingModel: 'FLAT' };
    }

    if (config.pricingModel === 'FLAT') {
      return { 
        fee: Math.max(0, config.flatFee), 
        isFallback: false, 
        pricingModel: 'FLAT' 
      };
    }

    // Tiered pricing
    const tiers = config.tiers || [];
    if (tiers.length === 0) {
      return { 
        fee: Math.max(0, config.fallbackFee), 
        isFallback: true, 
        pricingModel: 'TIERED' 
      };
    }

    // Find the tier that matches the principal amount
    const matchedTier = tiers.find(tier => {
      const minOk = principal >= tier.minAmount;
      const maxOk = tier.maxAmount <= 0 || tier.maxAmount === Infinity || principal <= tier.maxAmount;
      return minOk && maxOk;
    });

    if (matchedTier) {
      return {
        fee: Math.max(0, matchedTier.feeAmount),
        matchedTier,
        isFallback: false,
        pricingModel: 'TIERED'
      };
    }

    // If principal is higher than any maxAmount, match the highest tier with maxAmount === 0 or highest maxAmount
    const highestTier = [...tiers].sort((a, b) => {
      const aMax = a.maxAmount <= 0 ? Infinity : a.maxAmount;
      const bMax = b.maxAmount <= 0 ? Infinity : b.maxAmount;
      return bMax - aMax;
    })[0];

    if (highestTier && principal >= highestTier.minAmount) {
      return {
        fee: Math.max(0, highestTier.feeAmount),
        matchedTier: highestTier,
        isFallback: false,
        pricingModel: 'TIERED'
      };
    }

    return {
      fee: Math.max(0, config.fallbackFee),
      isFallback: true,
      pricingModel: 'TIERED'
    };
  }
}
