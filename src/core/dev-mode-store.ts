import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DevModeState {
  isDevMode: boolean;
  toggleDevMode: () => void;
  enableDevMode: () => void;
  disableDevMode: () => void;
}

export const useDevModeStore = create<DevModeState>()(
  persist(
    (set) => ({
      isDevMode: false,
      toggleDevMode: () => set((state) => ({ isDevMode: !state.isDevMode })),
      enableDevMode: () => set({ isDevMode: true }),
      disableDevMode: () => set({ isDevMode: false }),
    }),
    {
      name: 'riama-dev-mode',
    }
  )
);
