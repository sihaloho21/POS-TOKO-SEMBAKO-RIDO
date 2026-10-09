import { db } from '../database';
import type { CashierShift, FinanceEvent, BusinessConflict } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuditEngine } from '../audit-engine';
import { StoreStatusService } from './store-status-service';
import { DiscrepancyNotificationService } from './discrepancy-notification-service';

export interface ShiftClosingMetrics {
  shift: CashierShift;
  transactionCount: number;
  omzet: number;
  cashIn: number;
  cashOut: number;
  cashSales: number;
  paymentBreakdown: Record<string, number>;
  expectedCash: number;
}

export class ShiftService {
  /**
   * Opens a new shift for a user and device.
   * Enforces: "Satu user maksimal satu active shift".
   * Supports: "Satu shift dapat menggunakan beberapa device".
   */
  static async openShift(params: {
    userId: string;
    deviceId: string;
    startingCash: number;
    notes?: string;
    startNotes?: string;
  }): Promise<string> {
    // Check if this user already has an active shift on ANY device
    const existingForUser = await db.shifts
      .where('status')
      .equals('OPEN')
      .filter(s => s.userId === params.userId)
      .first();

    if (existingForUser) {
      // If user already has an active shift, attach this device to it!
      const currentDevices = existingForUser.deviceIds || [existingForUser.deviceId];
      if (!currentDevices.includes(params.deviceId)) {
        currentDevices.push(params.deviceId);
        await db.shifts.update(existingForUser.shiftId, { deviceIds: currentDevices });
      }
      return existingForUser.shiftId;
    }

    // Check if another user has an active shift on this specific device
    const existingOnDevice = await db.shifts
      .where('status')
      .equals('OPEN')
      .filter(s => Boolean(s.deviceId === params.deviceId || (s.deviceIds && s.deviceIds.includes(params.deviceId))))
      .first();

    if (existingOnDevice && existingOnDevice.userId !== params.userId) {
      throw new Error(`OVERLAP: Terdapat shift aktif oleh kasir lain di perangkat ${params.deviceId}. Harap selesaikan shift tersebut terlebih dahulu.`);
    }

    const shiftId = uuidv4();
    const timestamp = new Date().toISOString();
    const startNotes = params.startNotes || params.notes || '';

    const shift: CashierShift = {
      shiftId,
      userId: params.userId,
      deviceId: params.deviceId,
      deviceIds: [params.deviceId],
      startTime: timestamp,
      startingCash: params.startingCash,
      startNotes,
      notes: startNotes,
      status: 'OPEN'
    };

    await db.shifts.add(shift);

    // Record Finance Event for Starting Cash
    const financeEvent: FinanceEvent = {
      financeEventId: uuidv4(),
      amount: params.startingCash,
      storageId: 'WARUNG',
      direction: 'IN',
      referenceId: shiftId,
      referenceType: 'CAPITAL',
      userId: params.userId,
      deviceId: params.deviceId,
      timestamp
    };

    await db.financeEvents.add(financeEvent);

    await AuditEngine.log({
      userId: params.userId,
      role: 'SYSTEM',
      deviceId: params.deviceId,
      action: 'OPEN_SHIFT',
      module: 'SHIFT',
      referenceId: shiftId,
      after: shift
    });

    // Add to sync queue
    await db.syncQueue.add({
      entityType: 'shifts',
      entityId: shiftId,
      action: 'CREATE',
      payload: shift,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    return shiftId;
  }

  /**
   * Attaches an additional device to an active shift.
   * "Satu shift dapat menggunakan beberapa device."
   */
  static async attachDeviceToShift(shiftId: string, deviceId: string): Promise<void> {
    const shift = await db.shifts.get(shiftId);
    if (!shift || shift.status !== 'OPEN') return;

    const deviceIds = shift.deviceIds || [shift.deviceId];
    if (!deviceIds.includes(deviceId)) {
      deviceIds.push(deviceId);
      await db.shifts.update(shiftId, { deviceIds });
    }
  }

  /**
   * Calculates closing metrics for a shift.
   * Displays:
   * - transaction count
   * - omzet
   * - cash in
   * - cash out
   * - payment breakdown
   * - expected cash
   */
  static async getShiftClosingMetrics(shiftId: string): Promise<ShiftClosingMetrics> {
    const shift = await db.shifts.get(shiftId);
    if (!shift) {
      throw new Error('Shift tidak ditemukan.');
    }

    const transactions = await db.transactions
      .where('shiftId')
      .equals(shiftId)
      .filter(tx => tx.status === 'COMPLETED')
      .toArray();

    const transactionCount = transactions.length;
    const omzet = transactions.reduce((acc, tx) => acc + (tx.total || 0), 0);

    const paymentBreakdown: Record<string, number> = {
      CASH: 0,
      QRIS: 0,
      TRANSFER: 0,
      CARD: 0,
      HUTANG: 0
    };

    let cashSales = 0;
    for (const tx of transactions) {
      const method = (tx.paymentMethodId || 'CASH').toUpperCase();
      paymentBreakdown[method] = (paymentBreakdown[method] || 0) + (tx.total || 0);
      if (method === 'CASH') {
        cashSales += (tx.total || 0);
      }
    }

    // Cash in from receivable payments during this shift if any
    const shiftPayments = await db.receivablePayments
      .filter(p => Boolean(p.timestamp >= shift.startTime && (!shift.endTime || p.timestamp <= shift.endTime)))
      .toArray();
    
    let cashFromReceivables = 0;
    for (const p of shiftPayments) {
      if ((p.paymentMethodId || 'CASH').toUpperCase() === 'CASH') {
        cashFromReceivables += (p.amount || 0);
      }
    }

    // Cash out: expenses or petty cash out during this shift
    const expenses = await db.financeEvents
      .filter(e => Boolean(e.referenceId === shiftId && e.direction === 'OUT' && e.storageId === 'WARUNG'))
      .toArray();
    const cashOut = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);

    const cashIn = shift.startingCash + cashSales + cashFromReceivables;
    const expectedCash = shift.startingCash + cashSales + cashFromReceivables - cashOut;

    return {
      shift,
      transactionCount,
      omzet,
      cashIn,
      cashOut,
      cashSales,
      paymentBreakdown,
      expectedCash
    };
  }

  /**
   * Performs clock out / closing with full discrepancy audit and reconciliation.
   * Enforces:
   * - discrepancy reason required
   * - owner approval required if discrepancy exceeds threshold
   * - generates reconciliation/adjustment event without directly modifying the transactions ledger
   */
  static async clockOut(params: {
    shiftId: string;
    actualCash: number;
    transactionCount?: number;
    discrepancyReason?: string;
    ownerPinApproval?: string;
    approvedByOwner?: string;
    endNotes?: string;
    notes?: string;
    currentDeviceId?: string;
  }): Promise<CashierShift> {
    const shift = await db.shifts.get(params.shiftId);
    if (!shift || shift.status === 'CLOSED') {
      throw new Error('Shift tidak ditemukan atau sudah ditutup.');
    }

    const metrics = await this.getShiftClosingMetrics(params.shiftId);
    const expectedCash = metrics.expectedCash;
    const actualCash = Number(params.actualCash) || 0;
    const discrepancy = actualCash - expectedCash;

    // Discrepancy validation
    if (discrepancy !== 0) {
      if (!params.discrepancyReason || !params.discrepancyReason.trim()) {
        throw new Error('Selisih kas terdeteksi. Alasan / Reason selisih wajib diisi!');
      }

      const threshold = await StoreStatusService.getDiscrepancyThreshold();
      if (Math.abs(discrepancy) > threshold && !params.approvedByOwner) {
        // Must verify owner PIN
        if (!params.ownerPinApproval) {
          throw new Error(`APPROVAL_REQUIRED: Selisih kas (Rp ${Math.abs(discrepancy).toLocaleString()}) melebihi toleransi (Rp ${threshold.toLocaleString()}). Memerlukan PIN Owner untuk persetujuan.`);
        }

        const ownerUser = await db.users.filter(u => u.role === 'OWNER' && u.pinHash === params.ownerPinApproval).first();
        if (!ownerUser) {
          throw new Error('PIN Owner salah! Otorisasi selisih ditolak.');
        }
        params.approvedByOwner = ownerUser.name;
      }
    }

    const endTimestamp = new Date().toISOString();
    const endNotes = params.endNotes || params.notes || '';
    const combinedNotes = shift.notes 
      ? (endNotes ? `${shift.notes} | Tutup: ${endNotes}` : shift.notes)
      : endNotes;

    // Generate reconciliation/adjustment event if discrepancy !== 0
    let reconciliationEventId: string | undefined;
    if (discrepancy !== 0) {
      reconciliationEventId = uuidv4();
      const reconciliationEvent: FinanceEvent = {
        financeEventId: reconciliationEventId,
        amount: Math.abs(discrepancy),
        storageId: 'WARUNG',
        direction: discrepancy > 0 ? 'IN' : 'OUT',
        referenceId: params.shiftId,
        referenceType: 'ADJUSTMENT',
        userId: shift.userId,
        deviceId: params.currentDeviceId || shift.deviceId,
        timestamp: endTimestamp
      };

      await db.financeEvents.add(reconciliationEvent);
    }

    const updatedShift: CashierShift = {
      ...shift,
      status: 'CLOSED',
      endTime: endTimestamp,
      totalTransactionCount: params.transactionCount ?? metrics.transactionCount,
      totalSales: metrics.omzet,
      cashIn: metrics.cashIn,
      cashOut: metrics.cashOut,
      paymentBreakdown: metrics.paymentBreakdown,
      expectedCash,
      actualCash,
      discrepancy,
      discrepancyReason: params.discrepancyReason?.trim(),
      discrepancyApprovalStatus: discrepancy === 0 ? undefined : (params.approvedByOwner ? 'APPROVED' : 'PENDING'),
      discrepancyApprovedBy: params.approvedByOwner,
      discrepancyApprovedAt: params.approvedByOwner ? endTimestamp : undefined,
      reconciliationEventId,
      endNotes: endNotes || shift.endNotes,
      notes: combinedNotes
    };

    await db.shifts.put(updatedShift);

    // Register conflict & trigger browser notification if discrepancy exists
    if (discrepancy !== 0) {
      const conflictId = uuidv4();
      const conflict: BusinessConflict = {
        conflictId,
        type: 'SHIFT_DISCREPANCY',
        entityType: 'SHIFT',
        entityId: params.shiftId,
        deviceId: params.currentDeviceId || shift.deviceId,
        userId: shift.userId,
        timestamp: endTimestamp,
        details: {
          shiftId: params.shiftId,
          discrepancy,
          expectedCash,
          actualCash,
          discrepancyReason: params.discrepancyReason?.trim(),
          paymentBreakdown: metrics.paymentBreakdown,
          transactionCount: metrics.transactionCount,
          totalSales: metrics.omzet,
          cashIn: metrics.cashIn,
          cashOut: metrics.cashOut,
          message: `Selisih kasir ${shift.userId} sebesar ${discrepancy > 0 ? '+Rp ' : '-Rp '}${Math.abs(discrepancy).toLocaleString()}. Alasan: "${params.discrepancyReason?.trim()}"`
        },
        status: params.approvedByOwner ? 'RESOLVED' : 'PENDING',
        resolvedBy: params.approvedByOwner,
        resolvedAt: params.approvedByOwner ? endTimestamp : undefined
      };

      try {
        await db.conflicts.add(conflict);
      } catch (err) {
        console.warn('Failed to add discrepancy conflict:', err);
      }

      // Notify owner of significant discrepancy via Web Notification API & In-App
      const cashierUser = await db.users.get(shift.userId);
      DiscrepancyNotificationService.notifyOwnerSignificantDiscrepancy({
        shiftId: params.shiftId,
        cashierId: shift.userId,
        cashierName: cashierUser?.name,
        deviceId: params.currentDeviceId || shift.deviceId,
        expectedCash,
        actualCash,
        discrepancy,
        reason: params.discrepancyReason?.trim() || 'Tidak ada alasan'
      }).catch(err => console.warn('Error sending discrepancy notification:', err));
    }

    await AuditEngine.log({
      userId: shift.userId,
      role: 'SYSTEM',
      deviceId: params.currentDeviceId || shift.deviceId,
      action: 'CLOCK_OUT_CLOSED',
      module: 'SHIFT',
      referenceId: params.shiftId,
      after: {
        shiftId: params.shiftId,
        metrics,
        actualCash,
        discrepancy,
        discrepancyReason: params.discrepancyReason,
        approvedByOwner: params.approvedByOwner,
        reconciliationEventId
      }
    });

    await db.syncQueue.add({
      entityType: 'shifts',
      entityId: params.shiftId,
      action: 'UPDATE',
      payload: updatedShift,
      status: 'PENDING',
      retryCount: 0,
      createdAt: endTimestamp
    });

    return updatedShift;
  }

  /**
   * Approves a shift discrepancy during the Owner Approval Workflow.
   */
  static async approveShiftDiscrepancy(params: {
    shiftId: string;
    ownerUserId: string;
    ownerName: string;
    notes?: string;
  }): Promise<CashierShift> {
    const shift = await db.shifts.get(params.shiftId);
    if (!shift) throw new Error('Shift tidak ditemukan.');

    const timestamp = new Date().toISOString();
    const updatedShift: CashierShift = {
      ...shift,
      discrepancyApprovalStatus: 'APPROVED',
      discrepancyApprovedBy: params.ownerName,
      discrepancyApprovedAt: timestamp,
      endNotes: params.notes 
        ? (shift.endNotes ? `${shift.endNotes} | Disetujui Owner: ${params.notes}` : `Disetujui Owner: ${params.notes}`) 
        : shift.endNotes
    };

    await db.shifts.put(updatedShift);

    // Resolve corresponding conflict in db.conflicts
    const conflict = await db.conflicts
      .where('entityId')
      .equals(params.shiftId)
      .first();

    if (conflict) {
      await db.conflicts.update(conflict.conflictId, {
        status: 'RESOLVED',
        resolvedBy: params.ownerName,
        resolvedAt: timestamp
      });
    }

    await AuditEngine.log({
      userId: params.ownerUserId,
      role: 'OWNER',
      deviceId: 'system',
      action: 'SHIFT_DISCREPANCY_APPROVED',
      module: 'SHIFT_RECONCILIATION',
      referenceId: params.shiftId,
      after: {
        shiftId: params.shiftId,
        approvedBy: params.ownerName,
        timestamp,
        notes: params.notes
      }
    });

    await db.syncQueue.add({
      entityType: 'shifts',
      entityId: params.shiftId,
      action: 'UPDATE',
      payload: updatedShift,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    return updatedShift;
  }

  /**
   * Requests a manual investigation for a shift discrepancy in the Owner Approval Workflow.
   */
  static async requestManualInvestigation(params: {
    shiftId: string;
    ownerUserId: string;
    ownerName: string;
    investigationNotes: string;
  }): Promise<CashierShift> {
    const shift = await db.shifts.get(params.shiftId);
    if (!shift) throw new Error('Shift tidak ditemukan.');

    if (!params.investigationNotes?.trim()) {
      throw new Error('Instruksi / Catatan investigasi wajib diisi.');
    }

    const timestamp = new Date().toISOString();
    const updatedShift: CashierShift = {
      ...shift,
      discrepancyApprovalStatus: 'INVESTIGATION_REQUESTED',
      investigationNotes: params.investigationNotes.trim(),
      investigationRequestedBy: params.ownerName,
      investigationRequestedAt: timestamp
    };

    await db.shifts.put(updatedShift);

    // Update conflict details if exists, keep PENDING
    const conflict = await db.conflicts
      .where('entityId')
      .equals(params.shiftId)
      .first();

    if (conflict) {
      await db.conflicts.update(conflict.conflictId, {
        details: {
          ...conflict.details,
          investigationRequested: true,
          investigationNotes: params.investigationNotes.trim(),
          investigationRequestedBy: params.ownerName,
          investigationRequestedAt: timestamp
        }
      });
    }

    // Add alert notification for cashier and store
    await db.notifications.add({
      notificationId: uuidv4(),
      severity: 'WARNING',
      referenceId: params.shiftId,
      message: `Investigasi Manual Diminta: Owner ${params.ownerName} meminta audit shift ${params.shiftId.slice(-6).toUpperCase()}. Catatan: "${params.investigationNotes.trim()}".`,
      isRead: false,
      createdAt: timestamp
    });

    await AuditEngine.log({
      userId: params.ownerUserId,
      role: 'OWNER',
      deviceId: 'system',
      action: 'SHIFT_INVESTIGATION_REQUESTED',
      module: 'SHIFT_RECONCILIATION',
      referenceId: params.shiftId,
      after: {
        shiftId: params.shiftId,
        investigationNotes: params.investigationNotes,
        requestedBy: params.ownerName,
        timestamp
      }
    });

    await db.syncQueue.add({
      entityType: 'shifts',
      entityId: params.shiftId,
      action: 'UPDATE',
      payload: updatedShift,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    return updatedShift;
  }

  static async closeShift(shiftId: string, actualCash: number, transactionCount?: number, notes?: string): Promise<void> {
    await this.clockOut({ shiftId, actualCash, transactionCount, notes });
  }

  /**
   * Retrieves current active shift.
   * If userId is provided, checks if the user has an active shift across ANY device,
   * attaching deviceId to the active shift if needed.
   */
  static async getCurrentShift(deviceId: string, userId?: string): Promise<CashierShift | undefined> {
    if (userId) {
      const userShift = await db.shifts
        .where('status')
        .equals('OPEN')
        .filter(s => s.userId === userId)
        .first();

      if (userShift) {
        return userShift;
      }
    }

    if (deviceId) {
      const deviceShift = await db.shifts
        .where('status')
        .equals('OPEN')
        .filter(s => Boolean(s.deviceId === deviceId || (s.deviceIds && s.deviceIds.includes(deviceId))))
        .first();

      if (deviceShift) return deviceShift;
    }

    return undefined;
  }

  static async getActiveShifts(): Promise<CashierShift[]> {
    return db.shifts
      .where('status')
      .equals('OPEN')
      .toArray();
  }
}
