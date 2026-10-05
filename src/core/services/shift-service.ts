import { db } from '../database';
import type { CashierShift, FinanceEvent } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuditEngine } from '../audit-engine';

export class ShiftService {
  static async openShift(params: {
    userId: string;
    deviceId: string;
    startingCash: number;
    notes?: string;
    startNotes?: string;
  }): Promise<string> {
    // Check if there's already an open shift for this device
    const existingOnDevice = await db.shifts
      .where('status')
      .equals('OPEN')
      .filter(s => s.deviceId === params.deviceId)
      .first();

    if (existingOnDevice) {
      throw new Error(`OVERLAP: Shift masih aktif di perangkat ini (Terminal ${params.deviceId}). Harap tutup shift sebelumnya sebelum memulai yang baru.`);
    }

    // Check if this user has an open shift on ANY device
    const existingForUser = await db.shifts
      .where('status')
      .equals('OPEN')
      .filter(s => s.userId === params.userId)
      .first();

    if (existingForUser) {
      throw new Error(`OVERLAP: Anda masih memiliki shift aktif di perangkat ${existingForUser.deviceId}. Harap tutup shift tersebut terlebih dahulu.`);
    }

    const shiftId = uuidv4();
    const timestamp = new Date().toISOString();
    const startNotes = params.startNotes || params.notes || '';

    const shift: CashierShift = {
      shiftId,
      userId: params.userId,
      deviceId: params.deviceId,
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
      storageId: 'WARUNG', // Default for cashier drawer
      direction: 'IN',
      referenceId: shiftId,
      referenceType: 'CAPITAL', // Or a new type 'SHIFT_START'
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

  static async clockOut(params: {
    shiftId: string;
    actualCash?: number;
    transactionCount?: number;
    notes?: string;
    endNotes?: string;
  }): Promise<CashierShift> {
    const shift = await db.shifts.get(params.shiftId);
    if (!shift || shift.status === 'CLOSED') {
      throw new Error('Shift tidak ditemukan atau sudah ditutup.');
    }

    const endTimestamp = new Date().toISOString();
    const endNotes = params.endNotes || params.notes || '';
    const combinedNotes = shift.notes 
      ? (endNotes ? `${shift.notes} | Tutup: ${endNotes}` : shift.notes)
      : endNotes;

    // Query all completed transactions during this shift
    const shiftTxs = await db.transactions
      .where('shiftId')
      .equals(params.shiftId)
      .filter(tx => tx.status === 'COMPLETED')
      .toArray();

    const totalTransactionCount = params.transactionCount !== undefined 
      ? params.transactionCount 
      : shiftTxs.length;

    const totalSales = shiftTxs.reduce((acc, tx) => acc + tx.total, 0);

    const cashSales = shiftTxs
      .filter(tx => tx.paymentMethodId === 'CASH')
      .reduce((acc, tx) => acc + tx.total, 0);

    const expectedCash = shift.startingCash + cashSales;
    const actualCash = params.actualCash !== undefined ? params.actualCash : expectedCash;

    const updatedShift: CashierShift = {
      ...shift,
      status: 'CLOSED',
      endTime: endTimestamp,
      totalTransactionCount,
      totalSales,
      expectedCash,
      actualCash,
      endNotes: endNotes || shift.endNotes,
      notes: combinedNotes
    };

    await db.shifts.update(params.shiftId, {
      status: 'CLOSED',
      endTime: endTimestamp,
      totalTransactionCount,
      totalSales,
      expectedCash,
      actualCash,
      endNotes: endNotes || shift.endNotes,
      notes: combinedNotes
    });

    await AuditEngine.log({
      userId: shift.userId,
      role: 'SYSTEM',
      deviceId: shift.deviceId,
      action: 'CLOCK_OUT',
      module: 'SHIFT',
      referenceId: params.shiftId,
      after: updatedShift
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

  static async closeShift(shiftId: string, actualCash: number, transactionCount?: number, notes?: string): Promise<void> {
    await this.clockOut({ shiftId, actualCash, transactionCount, notes });
  }

  static async getCurrentShift(deviceId: string): Promise<CashierShift | undefined> {
    return db.shifts
      .where('status')
      .equals('OPEN')
      .filter(s => s.deviceId === deviceId)
      .first();
  }

  static async getActiveShifts(): Promise<CashierShift[]> {
    return db.shifts
      .where('status')
      .equals('OPEN')
      .toArray();
  }
}
