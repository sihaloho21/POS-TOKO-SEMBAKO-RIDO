import { db } from '../database';
import type { CashierShift, FinanceEvent, BusinessConflict, Receivable, Customer } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuditEngine } from '../audit-engine';
import { StoreStatusService } from './store-status-service';
import { DiscrepancyNotificationService } from './discrepancy-notification-service';
import { cloudSetDoc } from '../firestore-realtime';

export interface ShiftClosingMetrics {
  shift: CashierShift;
  transactionCount: number;
  omzet: number;
  cashIn: number;
  cashOut: number;
  cashSales: number;
  paymentBreakdown: Record<string, number>;
  storageBreakdown: Record<string, number>;
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
    startingCashBills?: number;
    startingCashCoins?: number;
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
      startingCashBills: params.startingCashBills,
      startingCashCoins: params.startingCashCoins,
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
    await cloudSetDoc('financeEvents', financeEvent.financeEventId, financeEvent);

    await AuditEngine.log({
      userId: params.userId,
      role: 'SYSTEM',
      deviceId: params.deviceId,
      action: 'OPEN_SHIFT',
      module: 'SHIFT',
      referenceId: shiftId,
      after: shift
    });

    // Add to cloud sync
    await cloudSetDoc('shifts', shiftId, shift);

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

    const storageBreakdown: Record<string, number> = {
      WARUNG: 0,
      IKAN: 0,
      BUAH: 0,
      UANG_DIGITAL: 0
    };

    let cashSales = 0;
    let cashReturns = 0;
    for (const tx of transactions) {
      const storage = tx.moneyStorageId || 'WARUNG';
      if (tx.type === 'GAJIAN') {
        paymentBreakdown.HUTANG = (paymentBreakdown.HUTANG || 0) + (tx.total || 0);
        storageBreakdown[storage] = (storageBreakdown[storage] || 0) + (tx.total || 0);
        continue;
      }
      if (tx.type === 'RETURN') {
        const method = (tx.paymentMethodId || 'CASH').toUpperCase();
        if (method === 'CASH' && (storage === 'WARUNG' || storage === 'IKAN' || storage === 'BUAH')) {
          cashReturns += (tx.total || 0);
        }
        storageBreakdown[storage] = (storageBreakdown[storage] || 0) - (tx.total || 0);
        continue;
      }
      const method = (tx.paymentMethodId || 'CASH').toUpperCase();
      paymentBreakdown[method] = (paymentBreakdown[method] || 0) + (tx.total || 0);
      storageBreakdown[storage] = (storageBreakdown[storage] || 0) + (tx.total || 0);
      if (method === 'CASH' && (storage === 'WARUNG' || storage === 'IKAN' || storage === 'BUAH')) {
        cashSales += (tx.total || 0);
      }
    }

    // Cash in from receivable payments during this shift into drawer (WARUNG, IKAN, BUAH)
    const shiftPayments = await db.receivablePayments
      .filter(p => Boolean(p.timestamp >= shift.startTime && (!shift.endTime || p.timestamp <= shift.endTime)))
      .toArray();
    
    let cashFromReceivables = 0;
    for (const p of shiftPayments) {
      const storage = p.moneyStorageId || 'WARUNG';
      if ((p.paymentMethodId || 'CASH').toUpperCase() === 'CASH' && (storage === 'WARUNG' || storage === 'IKAN' || storage === 'BUAH')) {
        cashFromReceivables += (p.amount || 0);
      }
    }

    // Cash out: expenses or petty cash out during this shift
    const expenses = await db.financeEvents
      .filter(e => Boolean(e.referenceId === shiftId && e.direction === 'OUT' && (e.storageId === 'WARUNG' || e.storageId === 'IKAN' || e.storageId === 'BUAH')))
      .toArray();
    const cashOut = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);

    const cashIn = shift.startingCash + cashSales + cashFromReceivables;
    const expectedCash = shift.startingCash + cashSales - cashReturns + cashFromReceivables - cashOut;

    return {
      shift,
      transactionCount,
      omzet,
      cashIn,
      cashOut,
      cashSales,
      paymentBreakdown,
      storageBreakdown,
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
    cashDenominations?: Record<string, number>;
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
      await cloudSetDoc('financeEvents', reconciliationEvent.financeEventId, reconciliationEvent);
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
      storageBreakdown: metrics.storageBreakdown,
      expectedCash,
      actualCash,
      discrepancy,
      discrepancyReason: params.discrepancyReason?.trim(),
      discrepancyApprovalStatus: discrepancy === 0 ? undefined : (params.approvedByOwner ? 'APPROVED' : 'PENDING'),
      discrepancyApprovedBy: params.approvedByOwner,
      discrepancyApprovedAt: params.approvedByOwner ? endTimestamp : undefined,
      cashDenominations: params.cashDenominations,
      reconciliationEventId,
      endNotes: endNotes || shift.endNotes,
      notes: combinedNotes
    };

    await db.shifts.put(updatedShift);
    await cloudSetDoc('shifts', params.shiftId, updatedShift);

    // If discrepancy occurred, dispatch notification and create business conflict if not approved yet
    if (discrepancy !== 0) {
      try {
        const cashierUser = await db.users.get(shift.userId);
        await DiscrepancyNotificationService.notifyOwnerSignificantDiscrepancy({
          shiftId: params.shiftId,
          cashierId: shift.userId,
          cashierName: cashierUser?.name,
          deviceId: params.currentDeviceId || shift.deviceId,
          expectedCash,
          actualCash,
          discrepancy,
          reason: params.discrepancyReason || 'Selisih penutupan shift kasir'
        });
      } catch (notifyErr) {
        console.warn('Failed to dispatch discrepancy alert:', notifyErr);
      }

      if (!params.approvedByOwner) {
        try {
          const conflictId = uuidv4();
          const conflict: BusinessConflict = {
            conflictId,
            type: 'SHIFT_DISCREPANCY',
            entityType: 'shift',
            entityId: params.shiftId,
            timestamp: endTimestamp,
            deviceId: params.currentDeviceId || shift.deviceId,
            userId: shift.userId,
            details: {
              shiftId: params.shiftId,
              cashierId: shift.userId,
              expectedCash,
              actualCash,
              discrepancy,
              reason: params.discrepancyReason
            },
            status: 'PENDING'
          };
          await db.conflicts.add(conflict);
        } catch (conflictErr) {
          console.warn('Failed to record shift discrepancy conflict:', conflictErr);
        }
      }
    }

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
    await cloudSetDoc('shifts', params.shiftId, updatedShift);

    // Resolve corresponding conflict in db.conflicts
    const conflict = await db.conflicts
      .where('entityId')
      .equals(params.shiftId)
      .first();

    if (conflict) {
      await db.conflicts.update(conflict.conflictId, {
        status: 'RESOLVED',
        resolvedBy: params.ownerName,
        resolvedAt: timestamp,
        details: {
          ...conflict.details,
          resolution: 'APPROVED',
          notes: params.notes
        }
      });
    }

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
    await cloudSetDoc('shifts', params.shiftId, updatedShift);

    return updatedShift;
  }

  /**
   * Resolves an unresolved cash discrepancy by charging it to the cashier as a staff debt / receivable.
   * Owner-confirmed policy: "Bebankan ke kasir atau catat piutang kasir".
   */
  static async resolveDiscrepancyToStaffReceivable(params: {
    shiftId: string;
    ownerUserId: string;
    ownerPin: string;
    dueDate?: string;
    notes?: string;
  }): Promise<{ shift: CashierShift; receivable: Receivable }> {
    const shift = await db.shifts.get(params.shiftId);
    if (!shift) throw new Error('Shift tidak ditemukan.');

    const ownerUser = await db.users
      .filter(u => u.role === 'OWNER' && (u.pinHash === params.ownerPin || (u as any).pin === params.ownerPin))
      .first();
    if (!ownerUser) {
      throw new Error('PIN Owner tidak valid atau bukan akun Owner.');
    }

    const cashierUser = await db.users.get(shift.userId);
    const cashierName = cashierUser?.name || shift.userId;

    const discrepancy = shift.discrepancy || 0;
    const amountToCharge = Math.abs(discrepancy);
    if (amountToCharge <= 0) {
      throw new Error('Tidak ada selisih kas minus untuk dibebankan ke kasir.');
    }

    const timestamp = new Date().toISOString();

    // Find or create customer entity for this staff member
    let staffCustomer = await db.customers
      .filter(c => Boolean(c.name.toLowerCase() === `kasir - ${cashierName}`.toLowerCase() || (c.notes && c.notes.includes(shift.userId))))
      .first();

    if (!staffCustomer) {
      const customerId = uuidv4();
      staffCustomer = {
        customerId,
        name: `Kasir - ${cashierName}`,
        phone: (cashierUser as any)?.phone || '',
        notes: `Akun Piutang Karyawan / Kasir: ${cashierName} (ID: ${shift.userId})`,
        isReseller: false,
        creditLimit: 10000000,
        defaultDueDateDays: 30,
        loyaltyPoints: 0,
        status: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp
      };
      await db.customers.add(staffCustomer);
      await cloudSetDoc('customers', customerId, staffCustomer);
    }

    // Default due date: +30 days or specified
    let targetDueDate = params.dueDate;
    if (!targetDueDate) {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      targetDueDate = d.toISOString().split('T')[0];
    }

    // Create Receivable record
    const receivableId = uuidv4();
    const staffReceivable: Receivable = {
      receivableId,
      transactionId: `SHIFT-${shift.shiftId.slice(-8).toUpperCase()}`,
      customerId: staffCustomer.customerId,
      totalAmount: amountToCharge,
      paidAmount: 0,
      remainingAmount: amountToCharge,
      dueDate: targetDueDate,
      status: 'OPEN',
      createdAt: timestamp
    };

    await db.receivables.add(staffReceivable);
    await cloudSetDoc('receivables', receivableId, staffReceivable);

    const resolutionNotes = params.notes?.trim() || `Dibebankan ke kasir ${cashierName} atas selisih kas shift senilai Rp ${amountToCharge.toLocaleString()}`;

    const updatedShift: CashierShift = {
      ...shift,
      discrepancyApprovalStatus: 'CHARGED_TO_CASHIER',
      discrepancyResolvedBy: ownerUser.name,
      discrepancyResolvedAt: timestamp,
      discrepancyResolutionNotes: resolutionNotes,
      staffReceivableId: receivableId,
      endNotes: shift.endNotes 
        ? `${shift.endNotes} | Tanggungan Kasir: Rp ${amountToCharge.toLocaleString()} (${resolutionNotes})` 
        : `Tanggungan Kasir: Rp ${amountToCharge.toLocaleString()} (${resolutionNotes})`
    };

    await db.shifts.put(updatedShift);
    await cloudSetDoc('shifts', params.shiftId, updatedShift);

    // Resolve corresponding conflict in db.conflicts if exists
    const conflict = await db.conflicts
      .where('entityId')
      .equals(params.shiftId)
      .first();

    if (conflict) {
      await db.conflicts.update(conflict.conflictId, {
        status: 'RESOLVED',
        resolvedBy: ownerUser.name,
        resolvedAt: timestamp,
        details: {
          ...conflict.details,
          resolution: 'CHARGED_TO_CASHIER',
          notes: resolutionNotes
        }
      });
    }

    return { shift: updatedShift, receivable: staffReceivable };
  }

  /**
   * Resolves a shift discrepancy by accepting it as a store operational expense/allowance (e.g., small coin rounding).
   */
  static async resolveDiscrepancyToStoreExpense(params: {
    shiftId: string;
    ownerUserId: string;
    ownerPin: string;
    notes?: string;
  }): Promise<CashierShift> {
    const shift = await db.shifts.get(params.shiftId);
    if (!shift) throw new Error('Shift tidak ditemukan.');

    const ownerUser = await db.users
      .filter(u => u.role === 'OWNER' && (u.pinHash === params.ownerPin || (u as any).pin === params.ownerPin))
      .first();
    if (!ownerUser) {
      throw new Error('PIN Owner tidak valid atau bukan akun Owner.');
    }

    const timestamp = new Date().toISOString();
    const resolutionNotes = params.notes?.trim() || 'Disetujui sebagai beban toleransi operasional / pembulatan toko';

    const updatedShift: CashierShift = {
      ...shift,
      discrepancyApprovalStatus: 'STORE_EXPENSE',
      discrepancyResolvedBy: ownerUser.name,
      discrepancyResolvedAt: timestamp,
      discrepancyResolutionNotes: resolutionNotes,
      endNotes: shift.endNotes 
        ? `${shift.endNotes} | Beban Toko: ${resolutionNotes}` 
        : `Beban Toko: ${resolutionNotes}`
    };

    await db.shifts.put(updatedShift);
    await cloudSetDoc('shifts', params.shiftId, updatedShift);

    // Resolve corresponding conflict in db.conflicts if exists
    const conflict = await db.conflicts
      .where('entityId')
      .equals(params.shiftId)
      .first();

    if (conflict) {
      await db.conflicts.update(conflict.conflictId, {
        status: 'RESOLVED',
        resolvedBy: ownerUser.name,
        resolvedAt: timestamp,
        details: {
          ...conflict.details,
          resolution: 'STORE_EXPENSE',
          notes: resolutionNotes
        }
      });
    }

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
