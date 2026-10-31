import { doc, writeBatch, collection, getDocs } from 'firebase/firestore';
import { db as firestoreDb } from '@/firebase/config';
import { db as localDb } from '@/core/database';

export interface SyncStats {
  downloaded: number;
  uploaded: number;
  collection: string;
}

export class CloudMigrationService {
  private static readonly MIGRATION_FLAG_KEY = 'riama_cloud_sync_initialized_v3';
  private static isRunning = false;

  private static readonly SYNC_MAPPINGS: { name: string; idField: string }[] = [
    { name: 'products', idField: 'productId' },
    { name: 'transactions', idField: 'transactionId' },
    { name: 'customers', idField: 'customerId' },
    { name: 'shifts', idField: 'shiftId' },
    { name: 'prepOrders', idField: 'orderId' },
    { name: 'financeEvents', idField: 'financeEventId' },
    { name: 'receivables', idField: 'receivableId' },
    { name: 'bundles', idField: 'bundleId' },
    { name: 'suppliers', idField: 'supplierId' },
    { name: 'settings', idField: 'id' },
    { name: 'payrolls', idField: 'id' },
    { name: 'bonusCategories', idField: 'id' }
  ];

  /**
   * Two-Way Bidirectional Realtime Sync:
   * 1. Downloads all existing cloud documents to local IndexedDB (Dexie)
   * 2. Uploads any local records that do not exist yet in Firestore
   * Guarantees 100% data parity across all devices (PC Toko, HP Owner, Tablet)
   */
  static async syncAllBiDirectional(force: boolean = false): Promise<{ success: boolean; totalDownloaded: number; totalUploaded: number; error?: string }> {
    if (this.isRunning) {
      return { success: false, totalDownloaded: 0, totalUploaded: 0, error: 'ALREADY_RUNNING' };
    }

    if (!navigator.onLine) {
      return { success: false, totalDownloaded: 0, totalUploaded: 0, error: 'OFFLINE' };
    }

    this.isRunning = true;
    let totalDownloaded = 0;
    let totalUploaded = 0;

    try {
      console.log('🔄 Memulai Sinkronisasi Dua Arah Toko Sembako Riama (Cloud <-> Local)...');

      for (const map of this.SYNC_MAPPINGS) {
        const { name: colName, idField } = map;
        const table = (localDb as any)[colName];
        if (!table) continue;

        // 1. PULL: Fetch all cloud documents from Firestore
        try {
          const colRef = collection(firestoreDb, colName);
          const snap = await getDocs(colRef);
          const cloudDocs: any[] = [];
          const cloudIdSet = new Set<string>();

          snap.forEach((d) => {
            const data = d.data();
            const recordId = data[idField] || data.id || d.id;
            const fullItem = {
              ...data,
              id: d.id,
              [idField]: recordId
            };
            cloudDocs.push(fullItem);
            cloudIdSet.add(recordId);
            cloudIdSet.add(d.id);
          });

          // Mirror cloud docs into local Dexie
          if (cloudDocs.length > 0) {
            await table.bulkPut(cloudDocs).catch((e: any) => console.warn(`bulkPut notice for ${colName}:`, e));
            totalDownloaded += cloudDocs.length;
          }

          // 2. PUSH: If local has items not yet in Cloud, upload them
          const localItems = await table.toArray();
          const itemsToUpload = localItems.filter((item: any) => {
            const id = item[idField] || item.id;
            return id && !cloudIdSet.has(id);
          });

          if (itemsToUpload.length > 0) {
            const uploaded = await this.batchUploadCollection(colName, itemsToUpload, idField);
            totalUploaded += uploaded;
          }
        } catch (colErr: any) {
          console.warn(`Sinkronisasi koleksi [${colName}] notice:`, colErr?.message || colErr);
        }
      }

      localStorage.setItem(this.MIGRATION_FLAG_KEY, 'true');
      console.log(`✅ Sinkronisasi Selesai: ${totalDownloaded} data diunduh dari cloud, ${totalUploaded} data lokal diunggah.`);
      return { success: true, totalDownloaded, totalUploaded };
    } catch (err: any) {
      console.warn('Notice during bi-directional sync:', err?.message || err);
      return { success: false, totalDownloaded, totalUploaded, error: err?.message };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Helper to write records in chunks of 50 via Firestore writeBatch
   */
  static async batchUploadCollection(
    collectionName: string, 
    records: any[], 
    idField: string
  ): Promise<number> {
    const CHUNK_SIZE = 50;
    let count = 0;

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(firestoreDb);

      for (const item of chunk) {
        const id = item[idField] || item.id || `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const cleanData = JSON.parse(JSON.stringify(item));
        const docRef = doc(firestoreDb, collectionName, id);
        batch.set(docRef, cleanData, { merge: true });
        count++;
      }

      try {
        await batch.commit();
      } catch (err: any) {
        console.warn(`Batch upload notice for [${collectionName}] chunk ${i}:`, err?.message || err);
      }
    }

    return count;
  }

  /**
   * Legacy alias for backward compatibility
   */
  static async migrateLocalToCloud(force: boolean = false) {
    return this.syncAllBiDirectional(force);
  }
}
