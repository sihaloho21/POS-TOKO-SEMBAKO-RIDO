import { useState, useEffect } from 'react';

const DEVICE_STORAGE_KEY = 'pos_device_id';
const DEFAULT_DEVICE_ID = 'terminal-1';

export function getDeviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved.trim();
    }
    localStorage.setItem(DEVICE_STORAGE_KEY, DEFAULT_DEVICE_ID);
    return DEFAULT_DEVICE_ID;
  } catch {
    return DEFAULT_DEVICE_ID;
  }
}

export function setDeviceId(id: string): void {
  const cleanId = id.trim() || DEFAULT_DEVICE_ID;
  try {
    localStorage.setItem(DEVICE_STORAGE_KEY, cleanId);
    window.dispatchEvent(new CustomEvent('pos_device_changed', { detail: cleanId }));
  } catch {
    // Ignore storage errors
  }
}

export function useDeviceId(): string {
  const [deviceId, setDeviceIdState] = useState<string>(getDeviceId());

  useEffect(() => {
    const handleDeviceChange = (e: any) => {
      setDeviceIdState(e.detail || getDeviceId());
    };
    window.addEventListener('pos_device_changed', handleDeviceChange);
    return () => {
      window.removeEventListener('pos_device_changed', handleDeviceChange);
    };
  }, []);

  return deviceId;
}
