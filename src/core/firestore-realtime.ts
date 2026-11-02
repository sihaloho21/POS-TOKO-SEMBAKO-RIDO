import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  writeBatch,
  getDocs,
  getDoc,
  type QueryConstraint,
  type DocumentData
} from 'firebase/firestore';
import { db as firestoreDb, auth, handleFirestoreError, OperationType } from '@/firebase/config';
import { db as localDb } from '@/core/database';
import { SyncEngine } from './sync-engine';

export { firestoreDb, auth };

const PRIMARY_KEYS: Record<string, string> = {
  products: 'productId',
  transactions: 'transactionId',
  customers: 'customerId',
  shifts: 'shiftId',
  prepOrders: 'orderId',
  financeEvents: 'financeEventId',
  receivables: 'receivableId',
  receivablePayments: 'paymentId',
  bundles: 'bundleId',
  suppliers: 'supplierId',
  settings: 'id',
  payrolls: 'id',
  bonusCategories: 'id',
  consignmentItems: 'id',
  consignmentArrivals: 'id',
  consignmentSettlements: 'id'
};

/**
 * Custom React Hook for Realtime Sub-Second Firestore Collection Listening
 * Automatically triggers across all devices when any change occurs in the cloud.
 */
export function useFirestoreCollection<T = any>(
  collectionName: string, 
  constraints: QueryConstraint[] = [],
  syncToLocal: boolean = true
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Prefill from local Dexie for instant UI rendering
  useEffect(() => {
    try {
      const table = (localDb as any)[collectionName];
      if (table && typeof table.toArray === 'function') {
        table.toArray().then((localItems: T[]) => {
          if (localItems && localItems.length > 0) {
            setData(prev => (prev.length === 0 ? localItems : prev));
            setLoading(false);
          }
        }).catch(() => {});
      }
    } catch {
      // Non-blocking
    }
  }, [collectionName]);

  useEffect(() => {
    try {
      const colRef = collection(firestoreDb, collectionName);
      const q = constraints.length > 0 ? query(colRef, ...constraints) : query(colRef);
      const idField = PRIMARY_KEYS[collectionName] || 'id';

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items: T[] = [];
          const snapshotIds = new Set<string>();

          snapshot.forEach((d) => {
            const raw = d.data();
            const recordId = raw[idField] || raw.id || d.id;
            const fullItem = {
              ...(raw as any),
              id: d.id,
              [idField]: recordId
            };
            items.push(fullItem);
            snapshotIds.add(recordId);
          });
          // Filter out items that are currently pending DELETE in sync queue
          // to prevent them from "reappearing" before the sync engine finishes.
          localDb.syncQueue.where('entityType').equals(collectionName).toArray().then(async (pendingItems) => {
            const pendingDeleteIds = new Set(
              pendingItems.filter(p => p.action === 'DELETE').map(p => p.entityId)
            );
            
            const filteredItems = items.filter((item: any) => {
              const id = item[idField] || item.id;
              return !pendingDeleteIds.has(id);
            });

            // Set UI data with deleted items strictly excluded
            setData(filteredItems);
            setLoading(false);

            // Mirror into local Dexie for seamless offline backup
            if (syncToLocal && localDb[collectionName as keyof typeof localDb]) {
              const table = (localDb as any)[collectionName];

              // 1. Upsert filtered items from cloud snapshot
              if (filteredItems.length > 0) {
                await table.bulkPut(filteredItems).catch(() => {});
              }

              // 2. Identify and remove local records that no longer exist in Cloud
              const snapshotIds = new Set(filteredItems.map((item: any) => item[idField] || item.id));
              const localItems: any[] = await table.toArray();
              const pendingIds = new Set(pendingItems.map(p => p.entityId));

              const idsToRemove = localItems
                .filter((li: any) => {
                  const id = li[idField] || li.id;
                  // Remove if not in Cloud AND not pending creation/update locally
                  return !snapshotIds.has(id) && !pendingIds.has(id);
                })
                .map((li: any) => li[idField] || li.id);

              if (idsToRemove.length > 0) {
                await table.bulkDelete(idsToRemove).catch(() => {});
              }
            }
          }).catch(() => {
            setData(items);
            setLoading(false);
          });
        },
        (err) => {
          console.warn(`Firestore onSnapshot notice for [${collectionName}]:`, err);
          setError(err);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err: any) {
      console.warn(`Error setting up Firestore listener for [${collectionName}]:`, err);
      setError(err);
      setLoading(false);
    }
  }, [collectionName, JSON.stringify(constraints.map(c => c.type))]);

  return { data, loading, error };
}

/**
 * Custom React Hook for Realtime Single Document Listening
 */
export function useFirestoreDoc<T = any>(collectionName: string, docId?: string | null) {
  const [docData, setDocData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!docId) {
      setDocData(null);
      setLoading(false);
      return;
    }

    try {
      const docRef = doc(firestoreDb, collectionName, docId);
      const unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (snap.exists()) {
            setDocData({ ...(snap.data() as any), id: snap.id });
          } else {
            setDocData(null);
          }
          setLoading(false);
        },
        (err) => {
          console.warn(`Firestore onSnapshot error for [${collectionName}/${docId}]:`, err);
          setError(err);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err: any) {
      setError(err);
      setLoading(false);
    }
  }, [collectionName, docId]);

  return { data: docData, loading, error };
}

/**
 * DIRECT FIRESTORE WRITE HELPERS (Queued via Sync Engine for 100% Offline Reliability)
 */

async function addToSyncQueue(entityType: string, entityId: string, action: 'CREATE' | 'UPDATE' | 'DELETE', payload: any) {
  const timestamp = new Date().toISOString();
  try {
    await localDb.syncQueue.add({
      entityType,
      entityId,
      action,
      payload,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    // Sub-second sync attempt if online
    if (navigator.onLine) {
      SyncEngine.processQueue().catch(() => {});
    }
  } catch (err) {
    console.warn('Failed to add to sync queue:', err);
  }
}

export async function cloudSetDoc(collectionName: string, docId: string, data: any): Promise<void> {
  const cleanData = JSON.parse(JSON.stringify({
    ...data,
    updatedAt: new Date().toISOString()
  }));

  // 1. Update local Dexie table immediately for zero-latency UI
  try {
    const table = (localDb as any)[collectionName];
    if (table) {
      await table.put(cleanData);
    }
  } catch (e) {
    console.warn(`Local mirror update failed for [${collectionName}]:`, e);
  }

  // 2. Queue for Cloud Sync
  await addToSyncQueue(collectionName, docId, 'UPDATE', cleanData);
}

export async function cloudUpdateDoc(collectionName: string, docId: string, updates: any): Promise<void> {
  const cleanUpdates = JSON.parse(JSON.stringify({
    ...updates,
    updatedAt: new Date().toISOString()
  }));

  // 1. Update local Dexie table immediately
  try {
    const table = (localDb as any)[collectionName];
    if (table) {
      await table.update(docId, cleanUpdates);
    }
  } catch (e) {
    console.warn(`Local mirror update failed for [${collectionName}]:`, e);
  }

  // 2. Queue for Cloud Sync
  // For update, we might need the full doc or just the diff. 
  // SyncEngine.syncItem uses setDoc with merge: true, so sending updates is fine.
  await addToSyncQueue(collectionName, docId, 'UPDATE', cleanUpdates);
}

export async function cloudDeleteDoc(collectionName: string, docId: string): Promise<void> {
  // 1. Delete from local Dexie table immediately
  try {
    const table = (localDb as any)[collectionName];
    if (table) {
      await table.delete(docId);
    }
  } catch (e) {
    console.warn(`Local mirror delete failed for [${collectionName}]:`, e);
  }

  // 2. Queue for Cloud Sync
  await addToSyncQueue(collectionName, docId, 'DELETE', null);
}

export async function cloudAddDoc(collectionName: string, data: any): Promise<string> {
  const docId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const cleanData = JSON.parse(JSON.stringify({
    ...data,
    id: docId,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  // 1. Update local Dexie table immediately
  try {
    const table = (localDb as any)[collectionName];
    if (table) {
      await table.put(cleanData);
    }
  } catch (e) {
    console.warn(`Local mirror add failed for [${collectionName}]:`, e);
  }

  // 2. Queue for Cloud Sync
  await addToSyncQueue(collectionName, docId, 'CREATE', cleanData);

  return docId;
}
