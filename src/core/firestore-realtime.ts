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

export { firestoreDb, auth };

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

  useEffect(() => {
    try {
      const colRef = collection(firestoreDb, collectionName);
      const q = constraints.length > 0 ? query(colRef, ...constraints) : query(colRef);

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items: T[] = [];
          snapshot.forEach((d) => {
            items.push({ ...(d.data() as any), id: d.id });
          });
          setData(items);
          setLoading(false);

          // Optionally mirror into local Dexie for seamless offline backup
          if (syncToLocal && localDb[collectionName as keyof typeof localDb]) {
            try {
              const table = (localDb as any)[collectionName];
              if (table && typeof table.bulkPut === 'function' && items.length > 0) {
                table.bulkPut(items).catch(() => {});
              }
            } catch {
              // Ignore local mirror errors
            }
          }
        },
        (err) => {
          console.warn(`Firestore onSnapshot error for [${collectionName}]:`, err);
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
 * DIRECT FIRESTORE WRITE HELPERS (Bypass Sync Queue - Zero Latency)
 */

export async function cloudSetDoc(collectionName: string, docId: string, data: any): Promise<void> {
  const cleanData = JSON.parse(JSON.stringify({
    ...data,
    updatedAt: new Date().toISOString()
  }));

  try {
    const docRef = doc(firestoreDb, collectionName, docId);
    await setDoc(docRef, cleanData, { merge: true });
  } catch (err: any) {
    console.warn(`cloudSetDoc notice for [${collectionName}/${docId}]:`, err?.message || err);
  }

  // Update local Dexie table in background for consistency
  try {
    const table = (localDb as any)[collectionName];
    if (table) {
      await table.put(cleanData);
    }
  } catch (e) {
    // Local mirror is non-blocking
  }
}

export async function cloudUpdateDoc(collectionName: string, docId: string, updates: any): Promise<void> {
  const cleanUpdates = JSON.parse(JSON.stringify({
    ...updates,
    updatedAt: new Date().toISOString()
  }));

  try {
    const docRef = doc(firestoreDb, collectionName, docId);
    await updateDoc(docRef, cleanUpdates);
  } catch (err: any) {
    console.warn(`cloudUpdateDoc notice for [${collectionName}/${docId}]:`, err?.message || err);
  }

  // Update local Dexie table in background
  try {
    const table = (localDb as any)[collectionName];
    if (table) {
      await table.update(docId, cleanUpdates);
    }
  } catch (e) {
    // Local mirror is non-blocking
  }
}

export async function cloudDeleteDoc(collectionName: string, docId: string): Promise<void> {
  try {
    const docRef = doc(firestoreDb, collectionName, docId);
    await deleteDoc(docRef);
  } catch (err: any) {
    console.warn(`cloudDeleteDoc notice for [${collectionName}/${docId}]:`, err?.message || err);
  }

  // Delete from local Dexie table in background
  try {
    const table = (localDb as any)[collectionName];
    if (table) {
      await table.delete(docId);
    }
  } catch (e) {
    // Local mirror is non-blocking
  }
}

export async function cloudAddDoc(collectionName: string, data: any): Promise<string> {
  const cleanData = JSON.parse(JSON.stringify({
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  let docId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  try {
    const colRef = collection(firestoreDb, collectionName);
    const docRef = await addDoc(colRef, cleanData);
    docId = docRef.id;
  } catch (err: any) {
    console.warn(`cloudAddDoc notice for [${collectionName}]:`, err?.message || err);
  }

  // Update local Dexie table in background
  try {
    const table = (localDb as any)[collectionName];
    if (table) {
      await table.put({ ...cleanData, id: docId });
    }
  } catch (e) {
    // Local mirror is non-blocking
  }

  return docId;
}
