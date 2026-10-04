import { create } from 'zustand';
import type { User } from './types';
import { db } from './database';
import { auth } from '../firebase/config';
import { signInAnonymously } from 'firebase/auth';

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (pin: string) => Promise<boolean>;
  logout: () => void;
  seedOwner: (name: string, pin: string) => Promise<void>;
  initializeAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  isAuthenticated: false,

  initializeAuth: async () => {
    try {
      // Ensure we are signed into Firebase to satisfy Firestore rules
      // Note: If this fails with auth/admin-restricted-operation, it means
      // Anonymous Auth is disabled in the Firebase Console.
      if (!auth.currentUser) {
        await signInAnonymously(auth).catch(err => {
          if (err.code === 'auth/admin-restricted-operation') {
            console.warn('Anonymous Auth is disabled in Firebase Console. Using public rules fallback.');
          } else {
            throw err;
          }
        });
      }
    } catch (error) {
      console.error('Firebase Auth failed:', error);
    }
  },

  login: async (pin: string) => {
    // 1. Local Check
    const user = await db.users.filter(u => u.pinHash === pin).first();
    if (user) {
      // 2. Firebase Check
      await get().initializeAuth();
      
      set({ currentUser: user, isAuthenticated: true });
      
      // 3. Ensure user doc exists in Firestore for rules (isKasir/isOwner)
      if (auth.currentUser) {
        await db.syncQueue.add({
          entityType: 'users',
          entityId: auth.currentUser.uid, // Map local session to Firebase Auth UID
          action: 'UPDATE',
          payload: { ...user, userId: auth.currentUser.uid },
          status: 'PENDING',
          retryCount: 0,
          createdAt: new Date().toISOString()
        });
      }

      return true;
    }
    return false;
  },

  logout: () => {
    set({ currentUser: null, isAuthenticated: false });
  },

  seedOwner: async (name: string, pin: string) => {
    const owner: User = {
      userId: 'owner-1',
      name,
      role: 'OWNER',
      pinHash: pin,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.users.put(owner);
  }
}));
