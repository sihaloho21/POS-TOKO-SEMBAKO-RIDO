import { doc, writeBatch, collection, getDocs, limit, query } from 'firebase/firestore';
import { db as firestoreDb, auth } from '@/firebase/config';
import { db as localDb } from '@/core/database';

export class CloudMigrationService {
  private static readonly MIGRATION_FLAG_KEY = 'harapan_jaya_cloud_migrated_v2';
  private static isRunning = false;

  /**
   * Run one-time idempotent migration of local Dexie data to Firestore cloud
   */
  static async migrateLocalToCloud(force: boolean = false): Promise<{ success: boolean; totalUploaded: number; reason?: string }> {
    if (this.isRunning) {
      return { success: false, totalUploaded: 0, reason: 'ALREADY_RUNNING' };
    }

    if (!force && localStorage.getItem(this.MIGRATION_FLAG_KEY) === 'true') {
      return { success: true, totalUploaded: 0, reason: 'ALREADY_MIGRATED' };
    }

    if (!navigator.onLine) {
      console.warn('Cannot run cloud migration while offline');
      return { success: false, totalUploaded: 0, reason: 'OFFLINE' };
    }

    // Wait until Firebase Auth is established to avoid Missing or insufficient permissions
    if (!auth.currentUser) {
      console.info('Cloud migration ditunda: Menunggu sesi login Firebase/Google aktif.');
      return { success: false, totalUploaded: 0, reason: 'AWAITING_AUTH' };
    }

    this.isRunning = true;
    let totalUploaded = 0;

    try {
      console.log('Starting Cloud Migration from IndexedDB to Firestore for user:', auth.currentUser.email || auth.currentUser.uid);

      // 1. Products
      const localProducts = await localDb.products.toArray();
      if (localProducts.length > 0) {
        totalUploaded += await this.batchUploadCollection('products', localProducts, 'productId');
      }

      // 2. Prep Orders (Jadwal & To-Do)
      const localPrepOrders = await localDb.prepOrders.toArray();
      if (localPrepOrders.length > 0) {
        totalUploaded += await this.batchUploadCollection('prepOrders', localPrepOrders, 'orderId');
      }

      // 3. Customers
      const localCustomers = await localDb.customers.toArray();
      if (localCustomers.length > 0) {
        totalUploaded += await this.batchUploadCollection('customers', localCustomers, 'customerId');
      }

      // 4. Bundles
      const localBundles = await localDb.bundles.toArray();
      if (localBundles.length > 0) {
        totalUploaded += await this.batchUploadCollection('bundles', localBundles, 'bundleId');
      }

      // 5. Suppliers
      const localSuppliers = await localDb.suppliers.toArray();
      if (localSuppliers.length > 0) {
        totalUploaded += await this.batchUploadCollection('suppliers', localSuppliers, 'supplierId');
      }

      // 6. Shifts
      const localShifts = await localDb.shifts.toArray();
      if (localShifts.length > 0) {
        totalUploaded += await this.batchUploadCollection('shifts', localShifts, 'shiftId');
      }

      // 7. Transactions
      const localTransactions = await localDb.transactions.toArray();
      if (localTransactions.length > 0) {
        totalUploaded += await this.batchUploadCollection('transactions', localTransactions, 'transactionId');
      }

      // 8. Receivables (Kasbon)
      const localReceivables = await localDb.receivables.toArray();
      if (localReceivables.length > 0) {
        totalUploaded += await this.batchUploadCollection('receivables', localReceivables, 'receivableId');
      }

      localStorage.setItem(this.MIGRATION_FLAG_KEY, 'true');
      console.log(`Cloud Migration finished successfully. Total records mirrored: ${totalUploaded}`);
      return { success: true, totalUploaded };
    } catch (err: any) {
      console.warn('Notice during cloud migration:', err?.message || err);
      return { success: false, totalUploaded, reason: err?.message };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Helper to write records in chunks of 50 via Firestore writeBatch
   */
  private static async batchUploadCollection(
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
}
