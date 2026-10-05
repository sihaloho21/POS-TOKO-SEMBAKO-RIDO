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
  seedKasir: (name: string, pin: string) => Promise<void>;
  seedDefaultUsers: () => Promise<void>;
  initializeAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  isAuthenticated: false,

  initializeAuth: async () => {
    try {
      // Attempt anonymous sign-in to satisfy authenticated Firestore rules if enabled
      if (!auth.currentUser) {
        await signInAnonymously(auth).catch(err => {
          console.warn('Anonymous Auth is disabled or restricted in Firebase Console:', err?.code || err?.message || err);
        });
      }
    } catch (error) {
      console.warn('Firebase Auth initialize warning:', error);
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
  },

  seedKasir: async (name: string, pin: string) => {
    const kasir: User = {
      userId: 'kasir-1',
      name,
      role: 'KASIR',
      pinHash: pin,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.users.put(kasir);
  },

  seedDefaultUsers: async () => {
    const hasOwner = await db.users.where('role').equals('OWNER').first();
    if (!hasOwner) {
      await get().seedOwner('Owner Rido', '123456');
    }
    const hasKasir = await db.users.where('role').equals('KASIR').first();
    if (!hasKasir) {
      await get().seedKasir('Kasir Harapan', '654321');
    }
  }
}));
