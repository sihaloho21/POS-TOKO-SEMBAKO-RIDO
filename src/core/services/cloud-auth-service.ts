import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged,
  browserPopupRedirectResolver,
  type User as FirebaseUser 
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db as firestoreDb } from '../../firebase/config';
import { create } from 'zustand';

interface CloudAuthState {
  firebaseUser: FirebaseUser | null;
  isCloudConnected: boolean;
  isAuthenticating: boolean;
  cloudError: string | null;
  setFirebaseUser: (user: FirebaseUser | null) => void;
  setIsAuthenticating: (val: boolean) => void;
  setCloudError: (err: string | null) => void;
}

export const useCloudAuthStore = create<CloudAuthState>((set) => ({
  firebaseUser: auth.currentUser,
  isCloudConnected: !!auth.currentUser,
  isAuthenticating: false,
  cloudError: null,
  setFirebaseUser: (user) => set({ firebaseUser: user, isCloudConnected: !!user, cloudError: null }),
  setIsAuthenticating: (val) => set({ isAuthenticating: val }),
  setCloudError: (err) => set({ cloudError: err })
}));

// Listen to Firebase auth state changes
onAuthStateChanged(auth, async (user) => {
  useCloudAuthStore.getState().setFirebaseUser(user);
  if (user) {
    // Ensure user record in Firestore satisfies security rules (isOwner/isKasir)
    try {
      await setDoc(doc(firestoreDb, 'users', user.uid), {
        userId: user.uid,
        name: user.displayName || 'Owner Rido',
        email: user.email || '',
        role: 'OWNER',
        status: 'ACTIVE',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn('Auto-upsert cloud user doc warning:', e);
    }
  }
});

import type { UserRole } from '../types';

export class CloudAuthService {
  /**
   * Ensures that the current device is authenticated with Firebase.
   * Attempts anonymous sign-in first (if enabled in console), and verifies the Firestore role doc.
   */
  static async ensureAuthenticated(role: UserRole = 'OWNER', name?: string): Promise<FirebaseUser | null> {
    if (auth.currentUser) {
      await this.ensureUserDoc(auth.currentUser, role, name);
      return auth.currentUser;
    }

    try {
      const cred = await signInAnonymously(auth);
      if (cred.user) {
        await this.ensureUserDoc(cred.user, role, name);
        return cred.user;
      }
    } catch (err: any) {
      console.warn('Anonymous Cloud Auth unavailable:', err?.code || err?.message || err);
    }

    return null;
  }

  /**
   * Signs in using Google Popup provider with browserPopupRedirectResolver.
   */
  static async loginWithGoogle(role: UserRole = 'OWNER', name?: string): Promise<FirebaseUser> {
    const store = useCloudAuthStore.getState();
    store.setIsAuthenticating(true);
    store.setCloudError(null);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      // Pass browserPopupRedirectResolver explicitly to prevent auth/argument-error
      const cred = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      
      await this.ensureUserDoc(cred.user, role, name);
      store.setFirebaseUser(cred.user);
      return cred.user;
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      let userFriendlyMsg = err?.message || 'Gagal login dengan akun Google';
      if (err?.code === 'auth/popup-blocked') {
        userFriendlyMsg = 'Jendela pop-up login Google diblokir oleh browser. Harap izinkan pop-up (Allow pop-ups) pada browser Anda.';
      } else if (err?.code === 'auth/popup-closed-by-user') {
        userFriendlyMsg = 'Login dibatalkan (jendela pop-up ditutup sebelum selesai).';
      } else if (err?.code === 'auth/unauthorized-domain') {
        userFriendlyMsg = 'Domain aplikasi ini belum terdaftar di Firebase Console > Authentication > Settings > Authorized Domains.';
      }
      store.setCloudError(userFriendlyMsg);
      throw new Error(userFriendlyMsg);
    } finally {
      store.setIsAuthenticating(false);
    }
  }

  /**
   * Disconnects/signs out from Firebase Cloud.
   */
  static async logout(): Promise<void> {
    await signOut(auth);
    useCloudAuthStore.getState().setFirebaseUser(null);
  }

  /**
   * Upserts the user doc into Firestore /users/{uid} to satisfy firestore.rules
   */
  private static async ensureUserDoc(user: FirebaseUser, role: UserRole = 'OWNER', name?: string) {
    try {
      await setDoc(doc(firestoreDb, 'users', user.uid), {
        userId: user.uid,
        name: name || user.displayName || 'Owner Rido',
        email: user.email || '',
        role,
        status: 'ACTIVE',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn('Failed to ensure user doc in Firestore:', err);
    }
  }
}
