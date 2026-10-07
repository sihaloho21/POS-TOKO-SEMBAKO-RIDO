import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db as localDb } from './database';
import { db as firestoreDb, auth, handleFirestoreError, OperationType } from '../firebase/config';
import type { SyncQueueItem } from './types';
import { addMinutes } from 'date-fns';
import { StoreStatusService } from './services/store-status-service';

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
    try {
      await localDb.syncQueue.update(item.queueId!, { status: 'SYNCING' });

      const collectionName = item.entityType;

      // Evaluate offline transaction for STORE_STATUS_CONFLICT
      if (item.entityType === 'transactions' && item.payload) {
        await StoreStatusService.evaluateTransactionForConflict(item.payload);
      }

      const docRef = doc(firestoreDb, collectionName, item.entityId);
      
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

      await localDb.syncQueue.update(item.queueId!, { 
        status: 'SYNCED',
        lastError: undefined
      });
    } catch (error: any) {
      console.error(`Sync failure for ${item.entityType}/${item.entityId}:`, error);
      
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

  static async manualRetry(queueId: number) {
    const item = await localDb.syncQueue.get(queueId);
    if (item) {
      await this.syncItem(item);
    }
  }
}
