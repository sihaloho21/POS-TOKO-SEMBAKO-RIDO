import { create } from 'zustand';
import type { User } from './types';
import { db } from './database';
import { auth } from '../firebase/config';
import { CloudAuthService } from './services/cloud-auth-service';

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
      await CloudAuthService.ensureAuthenticated();
    } catch (error) {
      console.warn('Cloud Auth initialize warning:', error);
    }
  },

  login: async (pin: string) => {
    // 1. Local Check
    const user = await db.users.filter(u => u.pinHash === pin).first();
    if (user) {
      set({ currentUser: user, isAuthenticated: true });
      
      // 2. Ensure cloud session has user doc ready for Firestore rules
      await CloudAuthService.ensureAuthenticated(user.role as any, user.name).catch(() => {});

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
      await get().seedOwner('Owner Rido', '240595');
    } else if (hasOwner.pinHash !== '240595') {
      await db.users.update(hasOwner.userId, { pinHash: '240595', updatedAt: new Date().toISOString() });
    }
    const hasKasir = await db.users.where('role').equals('KASIR').first();
    if (!hasKasir) {
      await get().seedKasir('Kasir Romuel', '123456');
    } else if (hasKasir.pinHash !== '123456' || hasKasir.name === 'Kasir Harapan' || hasKasir.name === 'Kasir Riama') {
      await db.users.update(hasKasir.userId, { name: 'Kasir Romuel', pinHash: '123456', updatedAt: new Date().toISOString() });
    }
  }
}));
