import { db } from '../database';
import type { StoreStatusConfig, StoreStatus, Transaction, BusinessConflict } from '../types';
import { AuditEngine } from '../audit-engine';
import { v4 as uuidv4 } from 'uuid';

const STORE_STATUS_KEY = 'store_status';
const DEFAULT_DISCREPANCY_THRESHOLD = 25000; // Rp 25.000 default threshold

export class StoreStatusService {
  static async getStoreStatus(): Promise<StoreStatusConfig> {
    try {
      const config = await db.settings.get(STORE_STATUS_KEY);
      if (config) {
        return {
          id: STORE_STATUS_KEY,
          status: config.status || 'BUKA',
          updatedAt: config.updatedAt || new Date().toISOString(),
          updatedBy: config.updatedBy || 'SYSTEM',
          openedAt: config.openedAt,
          closedAt: config.closedAt,
          closedReason: config.closedReason,
          discrepancyApprovalThreshold: config.discrepancyApprovalThreshold ?? DEFAULT_DISCREPANCY_THRESHOLD
        };
      }
    } catch {
      // Fallback
    }

    return {
      id: STORE_STATUS_KEY,
      status: 'BUKA',
      updatedAt: new Date().toISOString(),
      updatedBy: 'SYSTEM',
      openedAt: new Date().toISOString(),
      discrepancyApprovalThreshold: DEFAULT_DISCREPANCY_THRESHOLD
    };
  }

  static async ensureInitialized(): Promise<void> {
    try {
      const existing = await db.settings.get(STORE_STATUS_KEY);
      if (!existing) {
        await db.settings.put({
          id: STORE_STATUS_KEY,
          status: 'BUKA',
          updatedAt: new Date().toISOString(),
          updatedBy: 'SYSTEM',
          openedAt: new Date().toISOString(),
          discrepancyApprovalThreshold: DEFAULT_DISCREPANCY_THRESHOLD
        });
      }
    } catch {
      // Ignore
    }
  }

  static async isStoreOpen(): Promise<boolean> {
    const config = await this.getStoreStatus();
    return config.status === 'BUKA';
  }

  static async setStoreStatus(
    status: StoreStatus,
    userId: string,
    closedReason?: string
  ): Promise<StoreStatusConfig> {
    const current = await this.getStoreStatus();
    const timestamp = new Date().toISOString();

    const updatedConfig: StoreStatusConfig = {
      ...current,
      id: STORE_STATUS_KEY,
      status,
      updatedAt: timestamp,
      updatedBy: userId,
      closedReason: status === 'TUTUP' ? (closedReason || current.closedReason || 'Tutup Operasional') : undefined,
      openedAt: status === 'BUKA' ? timestamp : current.openedAt,
      closedAt: status === 'TUTUP' ? timestamp : current.closedAt,
    };

    await db.settings.put(updatedConfig);

    await AuditEngine.log({
      userId,
      role: 'OWNER',
      deviceId: 'system',
      action: status === 'BUKA' ? 'STORE_OPENED' : 'STORE_CLOSED',
      module: 'STORE_STATUS',
      referenceId: STORE_STATUS_KEY,
      before: { status: current.status },
      after: { status, reason: closedReason, timestamp }
    });

    // Add to sync queue
    await db.syncQueue.add({
      entityType: 'settings',
      entityId: STORE_STATUS_KEY,
      action: 'UPDATE',
      payload: updatedConfig,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    return updatedConfig;
  }

  static async setDiscrepancyThreshold(threshold: number, userId: string): Promise<void> {
    const current = await this.getStoreStatus();
    const timestamp = new Date().toISOString();
    const updated = {
      ...current,
      discrepancyApprovalThreshold: Math.max(0, threshold),
      updatedAt: timestamp,
      updatedBy: userId
    };
    await db.settings.put(updated);
  }

  static async getDiscrepancyThreshold(): Promise<number> {
    const current = await this.getStoreStatus();
    return current.discrepancyApprovalThreshold ?? DEFAULT_DISCREPANCY_THRESHOLD;
  }

  /**
   * Evaluates if an offline transaction was made while the store was closed,
   * and creates a STORE_STATUS_CONFLICT if so.
   */
  static async evaluateTransactionForConflict(tx: Transaction): Promise<BusinessConflict | null> {
    const storeConfig = await this.getStoreStatus();

    // If store was closed at the time or currently closed when syncing
    const txTime = new Date(tx.clientTimestamp).getTime();
    const isStoreCurrentlyClosed = storeConfig.status === 'TUTUP';
    const storeClosedTime = storeConfig.closedAt ? new Date(storeConfig.closedAt).getTime() : 0;
    
    // Conflict trigger: transaction created while store was recorded as closed
    const wasCreatedDuringClosed = (storeClosedTime > 0 && txTime >= storeClosedTime && (!storeConfig.openedAt || txTime <= new Date(storeConfig.openedAt).getTime()));
    
    if (wasCreatedDuringClosed || isStoreCurrentlyClosed) {
      const conflictId = uuidv4();
      const conflict: BusinessConflict = {
        conflictId,
        type: 'STORE_STATUS_CONFLICT',
        entityType: 'TRANSACTION',
        entityId: tx.transactionId,
        deviceId: tx.deviceId,
        userId: tx.cashierId,
        timestamp: tx.clientTimestamp,
        details: {
          receiptNumber: tx.receiptNumber,
          total: tx.total,
          itemCount: tx.items.length,
          paymentMethod: tx.paymentMethodId,
          storeStatusAtSync: storeConfig.status,
          closedAt: storeConfig.closedAt,
          closedReason: storeConfig.closedReason || 'Toko Tutup',
          message: 'Transaksi offline dibuat saat status toko sedang TUTUP. Membutuhkan persetujuan Owner untuk rekonsiliasi.'
        },
        status: 'PENDING'
      };

      // Check if conflict already exists for this transaction
      const existing = await db.conflicts
        .where('entityId')
        .equals(tx.transactionId)
        .first();

      if (!existing) {
        await db.conflicts.add(conflict);
        
        await db.notifications.add({
          notificationId: uuidv4(),
          severity: 'URGENT',
          referenceId: conflictId,
          message: `Konflik Toko Tutup: Transaksi offline ${tx.receiptNumber} dibuat saat toko TUTUP.`,
          isRead: false,
          createdAt: new Date().toISOString()
        });

        return conflict;
      }
    }

    return null;
  }
}
