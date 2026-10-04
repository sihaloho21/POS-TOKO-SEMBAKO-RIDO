import { v4 as uuidv4 } from 'uuid';
import { db } from './database';
import type { CashierShift, AuditLog } from './types';
import { AuditEngine } from './audit-engine';

export class ShiftEngine {
  static async clockIn(userId: string, deviceId: string, startingCash: number): Promise<string> {
    const shiftId = `SH-${Date.now()}`;
    const startTime = new Date().toISOString();

    const shift: CashierShift = {
      shiftId,
      userId,
      deviceId,
      startTime,
      startingCash,
      status: 'OPEN'
    };

    await db.shifts.add(shift);
    
    // Audit log
    await AuditEngine.log({
      userId,
      role: 'KASIR', // simplified, should get from store
      deviceId,
      action: 'CLOCK_IN',
      module: 'SHIFT',
      referenceId: shiftId,
      after: shift
    });

    // Queue for sync
    await db.syncQueue.add({
      entityType: 'shifts',
      entityId: shiftId,
      action: 'CREATE',
      payload: shift,
      status: 'PENDING',
      retryCount: 0,
      createdAt: startTime
    });

    return shiftId;
  }

  static async clockOut(shiftId: string, actualCash: number, userId: string, deviceId: string): Promise<void> {
    const shift = await db.shifts.get(shiftId);
    if (!shift) throw new Error('Shift not found');

    const endTime = new Date().toISOString();
    
    // In a real app, we would calculate expectedCash from FinanceEvents
    // For now, let's assume it's calculated
    const expectedCash = shift.startingCash; // Placeholder for logic

    const updatedShift: CashierShift = {
      ...shift,
      endTime,
      expectedCash,
      actualCash,
      status: 'CLOSED'
    };

    await db.shifts.put(updatedShift);

    await AuditEngine.log({
      userId,
      role: 'KASIR',
      deviceId,
      action: 'CLOCK_OUT',
      module: 'SHIFT',
      referenceId: shiftId,
      before: shift,
      after: updatedShift
    });

    await db.syncQueue.add({
      entityType: 'shifts',
      entityId: shiftId,
      action: 'UPDATE',
      payload: updatedShift,
      status: 'PENDING',
      retryCount: 0,
      createdAt: endTime
    });
  }
}
