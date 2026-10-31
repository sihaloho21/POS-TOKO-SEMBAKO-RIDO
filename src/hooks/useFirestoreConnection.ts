import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, enableNetwork } from 'firebase/firestore';
import { db as firestoreDb } from '@/firebase/config';

export type FirestoreConnectionState = 'ONLINE' | 'RECONNECTING' | 'OFFLINE';

export interface FirestoreConnectionInfo {
  state: FirestoreConnectionState;
  isOnline: boolean;
  isRetrying: boolean;
  latencyMs: number | null;
  lastConnectedAt: Date | null;
  errorMessage: string | null;
  retryConnection: () => Promise<boolean>;
}

export function useFirestoreConnection(): FirestoreConnectionInfo {
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [state, setState] = useState<FirestoreConnectionState>('ONLINE');
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastConnectedAt, setLastConnectedAt] = useState<Date | null>(new Date());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Force reconnection to Firestore using enableNetwork()
   */
  const retryConnection = useCallback(async (): Promise<boolean> => {
    setIsRetrying(true);
    setState('RECONNECTING');
    setErrorMessage('Menghubungkan kembali ke database cloud Firestore...');

    try {
      // Force Firestore reconnection attempt
      await enableNetwork(firestoreDb);
      
      // Allow brief handshake window
      await new Promise((resolve) => setTimeout(resolve, 600));

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        setState('ONLINE');
        setErrorMessage(null);
        setLastConnectedAt(new Date());
      }
      return true;
    } catch (err: any) {
      console.warn('Firestore enableNetwork retry error:', err);
      setErrorMessage(err?.message || 'Gagal menyambungkan kembali ke Firestore');
      return false;
    } finally {
      setIsRetrying(false);
    }
  }, []);

  // 1. Browser network listeners + automatic reconnection attempt when internet is restored
  useEffect(() => {
    const handleOnline = async () => {
      setIsBrowserOnline(true);
      setState('RECONNECTING');
      // Automatically trigger enableNetwork() when internet connection is restored
      try {
        await enableNetwork(firestoreDb);
        setState('ONLINE');
        setErrorMessage(null);
        setLastConnectedAt(new Date());
      } catch (err) {
        console.warn('Auto enableNetwork upon online event error:', err);
      }
    };

    const handleOffline = () => {
      setIsBrowserOnline(false);
      setState('OFFLINE');
      setErrorMessage('Koneksi internet perangkat terputus');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 2. Real-time Firestore snapshot connection check
  useEffect(() => {
    if (!isBrowserOnline) {
      setState('OFFLINE');
      return;
    }

    let isMounted = true;
    let startPing = performance.now();

    try {
      // Listen to the store settings doc as connection anchor
      const settingsRef = doc(firestoreDb, 'settings', 'store');
      
      const unsubscribe = onSnapshot(
        settingsRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!isMounted) return;
          const pingTime = Math.round(performance.now() - startPing);
          setLatencyMs(pingTime > 0 && pingTime < 5000 ? pingTime : null);
          startPing = performance.now();

          // snapshot.metadata.fromCache indicates whether data is local or acknowledged by cloud server
          if (snapshot.metadata.fromCache && !navigator.onLine) {
            setState('OFFLINE');
            setErrorMessage('Tersambung ke cache lokal (Server Firestore offline)');
          } else {
            setState('ONLINE');
            setErrorMessage(null);
            setLastConnectedAt(new Date());
          }
        },
        (error) => {
          if (!isMounted) return;
          console.warn('Firestore connection listener error:', error);
          if (!navigator.onLine) {
            setState('OFFLINE');
            setErrorMessage('Koneksi internet terputus');
          } else {
            setState('RECONNECTING');
            setErrorMessage('Menyambungkan kembali ke database cloud...');
          }
        }
      );

      return () => {
        isMounted = false;
        unsubscribe();
      };
    } catch (err: any) {
      setState('RECONNECTING');
      setErrorMessage(err?.message || 'Menghubungkan ke cloud...');
    }
  }, [isBrowserOnline]);

  return {
    state,
    isOnline: state === 'ONLINE',
    isRetrying,
    latencyMs,
    lastConnectedAt,
    errorMessage,
    retryConnection
  };
}
