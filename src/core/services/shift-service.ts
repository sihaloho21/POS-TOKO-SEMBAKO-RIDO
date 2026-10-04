import { db } from '../database';
import type { CashierShift, FinanceEvent } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuditEngine } from '../audit-engine';

export class ShiftService {
  static async openShift(params: {
    userId: string;
    deviceId: string;
    startingCash: number;
  }): Promise<string> {
    // Check if there's already an open shift for this user/device
    const existing = await db.shifts
      .where('status')
      .equals('OPEN')
      .filter(s => s.deviceId === params.deviceId)
      .first();

    if (existing) {
      throw new Error('Shift sudah terbuka di perangkat ini.');
    }

    const shiftId = uuidv4();
    const timestamp = new Date().toISOString();

    const shift: CashierShift = {
      shiftId,
      userId: params.userId,
      deviceId: params.deviceId,
      startTime: timestamp,
      startingCash: params.startingCash,
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

  static async closeShift(shiftId: string, actualCash: number): Promise<void> {
    const shift = await db.shifts.get(shiftId);
    if (!shift || shift.status === 'CLOSED') return;

    const timestamp = new Date().toISOString();

    // Calculate Expected Cash
    // 1. Starting Cash
    // 2. + All cash sales in this shift
    // 3. + All gajian payments in this shift (if cash)
    const shiftTxs = await db.transactions
      .where('shiftId')
      .equals(shiftId)
      .filter(tx => tx.status === 'COMPLETED' && tx.paymentMethodId === 'CASH')
      .toArray();

    const cashSales = shiftTxs.reduce((acc, tx) => acc + tx.total, 0);
    const expectedCash = shift.startingCash + cashSales;

    await db.shifts.update(shiftId, {
      status: 'CLOSED',
      endTime: timestamp,
      expectedCash,
      actualCash
    });

    const updatedShift = { ...shift, status: 'CLOSED', endTime: timestamp, expectedCash, actualCash };

    await AuditEngine.log({
      userId: shift.userId,
      role: 'SYSTEM',
      deviceId: shift.deviceId,
      action: 'CLOSE_SHIFT',
      module: 'SHIFT',
      referenceId: shiftId,
      after: updatedShift
    });

    await db.syncQueue.add({
      entityType: 'shifts',
      entityId: shiftId,
      action: 'UPDATE',
      payload: updatedShift,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });
  }

  static async getCurrentShift(deviceId: string): Promise<CashierShift | undefined> {
    return db.shifts
      .where('status')
      .equals('OPEN')
      .filter(s => s.deviceId === deviceId)
      .first();
  }
}
