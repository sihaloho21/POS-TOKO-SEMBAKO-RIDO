import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db as localDb } from './database';
import { db as firestoreDb, auth, handleFirestoreError, OperationType } from '../firebase/config';
import type { SyncQueueItem } from './types';
import { addMinutes } from 'date-fns';
import { StoreStatusService } from './services/store-status-service';
import { PerformanceTracker } from './services/performance-tracker';

export interface ManualSyncResult {
  total: number;
  success: number;
  failed: number;
  remaining: number;
  errors: string[];
}

export class SyncEngine {
  private static isSyncing = false;
  private static interval: any = null;

  static start() {
    if (this.interval) return;
    this.interval = setInterval(() => this.processQueue(), 10000); // Check every 10 seconds
    this.processQueue();
  }

  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private static async processQueue() {
    if (this.isSyncing || !navigator.onLine || !auth.currentUser) return;
    this.isSyncing = true;

    try {
      const now = new Date().toISOString();
      const pendingItems = await localDb.syncQueue
        .filter(item => 
          (item.status === 'PENDING' || item.status === 'FAILED') && 
          (!item.nextRetryAt || item.nextRetryAt <= now)
        )
        .limit(20)
        .toArray();

      for (const item of pendingItems) {
        await this.syncItem(item);
      }
    } catch (error) {
      console.error('Global Sync Error:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  private static async syncItem(item: SyncQueueItem) {
    const queueWaitLatencyMs = item.createdAt 
      ? Math.max(0, Date.now() - new Date(item.createdAt).getTime())
      : 0;
    const netStart = performance.now();

    try {
      await localDb.syncQueue.update(item.queueId!, { status: 'SYNCING' });

      const collectionName = item.entityType;

      // Evaluate offline transaction for STORE_STATUS_CONFLICT
      if (item.entityType === 'transactions' && item.payload) {
        await StoreStatusService.evaluateTransactionForConflict(item.payload);
      }

      const docRef = doc(firestoreDb, collectionName, item.entityId);
      
      if (item.action === 'DELETE') {
        try {
          await deleteDoc(docRef);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, collectionName);
        }
      } else {
        // Sanitize payload: remove undefined values which Firestore doesn't accept
        const sanitizedPayload = JSON.parse(JSON.stringify(item.payload, (_, v) => v === undefined ? null : v));

        const payload = {
          ...sanitizedPayload,
          syncStatus: 'SYNCED',
          serverTimestamp: serverTimestamp()
        };

        try {
          await setDoc(docRef, payload, { merge: true });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, collectionName);
        }
      }

      const networkDurationMs = Math.round(performance.now() - netStart);

      await localDb.syncQueue.update(item.queueId!, { 
        status: 'SYNCED',
        lastError: undefined
      });

      // Log successful sync metric
      PerformanceTracker.recordSyncMetric({
        entityType: item.entityType,
        entityId: String(item.entityId),
        networkDurationMs,
        queueWaitLatencyMs,
        totalLatencyMs: queueWaitLatencyMs + networkDurationMs,
        success: true,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      const networkDurationMs = Math.round(performance.now() - netStart);
      console.error(`Sync failure for ${item.entityType}/${item.entityId}:`, error);

      // Log failed sync metric
      PerformanceTracker.recordSyncMetric({
        entityType: item.entityType,
        entityId: String(item.entityId),
        networkDurationMs,
        queueWaitLatencyMs,
        totalLatencyMs: queueWaitLatencyMs + networkDurationMs,
        success: false,
        error: error?.message || 'Gagal mengirim ke cloud Firestore',
        timestamp: new Date().toISOString()
      });
      
      const retryCount = item.retryCount + 1;
      const backoffMinutes = Math.pow(2, Math.min(retryCount, 5)); // Exp backoff
      const nextRetryAt = addMinutes(new Date(), backoffMinutes).toISOString();

      await localDb.syncQueue.update(item.queueId!, {
        status: 'FAILED',
        retryCount,
        lastError: error.message,
        nextRetryAt
      });
    }
  }

  /**
   * Pushes all pending, failed, or stalled sync queue items directly to Cloud Firestore
   * without waiting for the 10-second interval or backoff countdown.
   */
  static async forcePushAll(): Promise<ManualSyncResult> {
    if (!navigator.onLine) {
      throw new Error('Perangkat sedang offline. Sambungkan ke jaringan internet untuk mengunggah antrian ke cloud.');
    }

    if (!auth.currentUser) {
      try {
        await signInAnonymously(auth);
      } catch (err: any) {
        console.warn('Anonymous auth sign-in failed during forcePushAll:', err);
      }
    }

    // If an automatic interval cycle is actively syncing, wait briefly
    if (this.isSyncing) {
      let waitCount = 0;
      while (this.isSyncing && waitCount < 10) {
        await new Promise(res => setTimeout(res, 300));
        waitCount++;
      }
    }

    this.isSyncing = true;
    const summary: ManualSyncResult = {
      total: 0,
      success: 0,
      failed: 0,
      remaining: 0,
      errors: []
    };

    try {
      // Find all items not yet marked SYNCED (including PENDING, FAILED, and any stalled SYNCING)
      // We intentionally ignore nextRetryAt so manual push can bypass interval & backoff cooldown!
      const items = await localDb.syncQueue
        .filter(item => item.status !== 'SYNCED')
        .toArray();

      summary.total = items.length;

      if (items.length === 0) {
        return summary;
      }

      for (const item of items) {
        try {
          await this.syncItem(item);
          const updated = await localDb.syncQueue.get(item.queueId!);
          if (updated && updated.status === 'SYNCED') {
            summary.success++;
          } else {
            summary.failed++;
            if (updated?.lastError && !summary.errors.includes(updated.lastError)) {
              summary.errors.push(updated.lastError);
            }
          }
        } catch (err: any) {
          summary.failed++;
          const msg = err?.message || 'Gagal sinkronisasi';
          if (!summary.errors.includes(msg)) {
            summary.errors.push(msg);
          }
        }
      }

      summary.remaining = await localDb.syncQueue
        .filter(item => item.status !== 'SYNCED')
        .count();

      return summary;
    } finally {
      this.isSyncing = false;
    }
  }

  static async manualRetry(queueId: number): Promise<boolean> {
    const item = await localDb.syncQueue.get(queueId);
    if (!item) return false;
    if (!navigator.onLine) {
      throw new Error('Perangkat sedang offline.');
    }
    if (!auth.currentUser) {
      await signInAnonymously(auth).catch(() => {});
    }
    await this.syncItem(item);
    const updated = await localDb.syncQueue.get(queueId);
    return updated?.status === 'SYNCED';
  }

  static async clearSyncedLogs(): Promise<number> {
    const syncedItems = await localDb.syncQueue.where('status').equals('SYNCED').toArray();
    const ids = syncedItems.map(it => it.queueId!).filter(Boolean);
    if (ids.length > 0) {
      await localDb.syncQueue.bulkDelete(ids);
    }
    return ids.length;
  }
}
