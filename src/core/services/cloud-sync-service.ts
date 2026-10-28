import { collection, getDocs } from 'firebase/firestore';
import { db as firestoreDb, auth, handleFirestoreError, OperationType } from '../../firebase/config';
import { db as localDb } from '../database';
import { SyncEngine } from '../sync-engine';
import { AuditEngine } from '../audit-engine';
import { CloudAuthService } from './cloud-auth-service';

export interface CloudPullStats {
  totalDocs: number;
  collectionBreakdown: Record<string, number>;
  timestamp: string;
}

export class CloudSyncService {
  private static isPulling = false;

  // Collections to synchronize from Firestore into IndexedDB
  private static readonly SYNC_COLLECTIONS: { collectionName: string; localTable: string }[] = [
    { collectionName: 'products', localTable: 'products' },
    { collectionName: 'productCosts', localTable: 'productCosts' },
    { collectionName: 'bundles', localTable: 'bundles' },
    { collectionName: 'customers', localTable: 'customers' },
    { collectionName: 'suppliers', localTable: 'suppliers' },
    { collectionName: 'purchases', localTable: 'purchases' },
    { collectionName: 'payLaterBills', localTable: 'payLaterBills' },
    { collectionName: 'payLaterInstallments', localTable: 'payLaterInstallments' },
    { collectionName: 'transactions', localTable: 'transactions' },
    { collectionName: 'receivables', localTable: 'receivables' },
    { collectionName: 'receivablePayments', localTable: 'receivablePayments' },
    { collectionName: 'stockMovements', localTable: 'stockMovements' },
    { collectionName: 'financeEvents', localTable: 'financeEvents' },
    { collectionName: 'shifts', localTable: 'shifts' },
    { collectionName: 'stockOpnames', localTable: 'stockOpnames' },
    { collectionName: 'digitalServices', localTable: 'digitalServices' },
    { collectionName: 'loyaltyEvents', localTable: 'loyaltyEvents' },
    { collectionName: 'settings', localTable: 'settings' }
  ];

  /**
   * Pulls all collections from Firestore down into local IndexedDB using idempotent bulkPut.
   */
  static async pullAllFromCloud(userId?: string, deviceId?: string): Promise<CloudPullStats> {
    if (this.isPulling) {
      throw new Error('Proses penarikan data dari Cloud sedang berjalan. Harap tunggu...');
    }

    if (!navigator.onLine) {
      throw new Error('Koneksi internet tidak terdeteksi. Harap hubungkan perangkat ke internet untuk menarik data dari Cloud.');
    }

    // Ensure device has active authenticated cloud session
    let currentUser = auth.currentUser;
    if (!currentUser) {
      currentUser = await CloudAuthService.ensureAuthenticated('OWNER', userId);
    }

    if (!currentUser) {
      throw new Error('Perangkat belum terhubung ke Google Cloud. Silakan klik tombol "Hubungkan Akun Google" terlebih dahulu.');
    }

    this.isPulling = true;
    const breakdown: Record<string, number> = {};
    let grandTotal = 0;

    try {
      for (const { collectionName, localTable } of this.SYNC_COLLECTIONS) {
        try {
          const colRef = collection(firestoreDb, collectionName);
          const snapshot = await getDocs(colRef);
          
          if (!snapshot.empty) {
            const items: any[] = [];
            snapshot.forEach(docSnap => {
              const data = docSnap.data();
              // Clean cloud metadata
              const { syncStatus, serverTimestamp, ...cleanData } = data;
              items.push(cleanData);
            });

            // Upsert directly into local table
            const table = (localDb as any)[localTable];
            if (table && items.length > 0) {
              await table.bulkPut(items);
              breakdown[collectionName] = items.length;
              grandTotal += items.length;
            }
          } else {
            breakdown[collectionName] = 0;
          }
        } catch (colErr: any) {
          console.warn(`Peringatan: Gagal menarik koleksi ${collectionName}:`, colErr?.message || colErr);
          // Only throw if critical collections fail completely
          if (['products', 'transactions', 'purchases'].includes(collectionName)) {
            handleFirestoreError(colErr, OperationType.LIST, collectionName);
          }
        }
      }

      // Log audit
      if (userId) {
        await AuditEngine.log({
          userId,
          role: 'OWNER',
          deviceId: deviceId || 'DEVICE',
          action: 'CLOUD_DATA_PULL_SYNC',
          module: 'SYSTEM',
          after: {
            totalDocs: grandTotal,
            breakdown,
            pulledAt: new Date().toISOString()
          }
        }).catch(() => {});
      }

      return {
        totalDocs: grandTotal,
        collectionBreakdown: breakdown,
        timestamp: new Date().toISOString()
      };
    } finally {
      this.isPulling = false;
    }
  }

  /**
   * Immediately flushes and pushes all pending sync queue items to Firestore.
   */
  static async pushAllPendingQueue(): Promise<{ processedCount: number; remainingCount: number }> {
    const res = await SyncEngine.forcePushAll();
    return {
      processedCount: res.success,
      remainingCount: res.remaining
    };
  }
}
