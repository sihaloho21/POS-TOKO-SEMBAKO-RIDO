import { db } from '../database';
import { v4 as uuidv4 } from 'uuid';
import { StoreStatusService } from './store-status-service';

export interface DiscrepancyAlertParams {
  shiftId: string;
  cashierId: string;
  cashierName?: string;
  deviceId: string;
  expectedCash: number;
  actualCash: number;
  discrepancy: number;
  reason: string;
}

export class DiscrepancyNotificationService {
  /**
   * Request browser notification permission from user.
   */
  static async requestBrowserPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('Browser does not support desktop notifications.');
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return 'denied';
    }
  }

  /**
   * Get current browser notification permission status.
   */
  static getPermissionStatus(): NotificationPermission | 'unsupported' {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  }

  /**
   * Dispatches browser notification and in-app alert when a significant discrepancy is detected.
   */
  static async notifyOwnerSignificantDiscrepancy(params: DiscrepancyAlertParams): Promise<void> {
    const { shiftId, cashierId, cashierName, deviceId, discrepancy, reason } = params;
    const absDiscrepancy = Math.abs(discrepancy);
    const threshold = await StoreStatusService.getDiscrepancyThreshold();
    const isSignificant = absDiscrepancy >= threshold || absDiscrepancy > 0;

    const formattedDiff = `${discrepancy > 0 ? '+Rp ' : '-Rp '}${absDiscrepancy.toLocaleString()}`;
    const cashierLabel = cashierName || cashierId;

    // 1. Add In-App Notification (always recorded for persistent audit)
    const timestamp = new Date().toISOString();
    try {
      await db.notifications.add({
        notificationId: uuidv4(),
        severity: absDiscrepancy >= threshold ? 'URGENT' : 'WARNING',
        referenceId: shiftId,
        message: `Peringatan Selisih Kasir: Shift ${shiftId.slice(-6).toUpperCase()} (${cashierLabel}) mencatat selisih ${formattedDiff}. Alasan: "${reason}".`,
        isRead: false,
        createdAt: timestamp
      });
    } catch (err) {
      console.warn('Failed to record in-app notification:', err);
    }

    // 2. Dispatch Quick Navigation Event to any active listeners
    const quickNavDetail = {
      tab: 'conflicts',
      subTab: 'approvals',
      shiftId
    };

    // 3. Trigger Browser Web Notification if permitted
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted' && isSignificant) {
        try {
          const title = `🚨 Selisih Kasir Signifikan: ${formattedDiff}`;
          const body = `Shift ${shiftId.slice(-6).toUpperCase()} (${cashierLabel} di ${deviceId}). Alasan: "${reason}". Klik untuk membuka Approval Workflow.`;

          const notification = new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: `discrepancy-${shiftId}`,
            requireInteraction: true
          });

          notification.onclick = () => {
            try {
              window.focus();
              window.dispatchEvent(new CustomEvent('quick_navigate_approval', { detail: quickNavDetail }));
              notification.close();
            } catch (e) {
              console.warn('Notification click handling failed:', e);
            }
          };
        } catch (error) {
          console.warn('Failed to display browser notification:', error);
        }
      } else if (Notification.permission === 'default') {
        // Auto-request permission on first significant discrepancy detection
        this.requestBrowserPermission().then(perm => {
          if (perm === 'granted') {
            this.notifyOwnerSignificantDiscrepancy(params);
          }
        }).catch(err => console.warn('Notification permission request error:', err));
      }
    }
  }
}
