import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { PayLaterBill, PayLaterInstallment, FinanceEvent } from '../types';
import { FinanceService } from './finance-service';
import { AuditEngine } from '../audit-engine';
import { addMonths, setDate } from 'date-fns';

export class PayLaterService {
  /**
   * Generates a ShopeePayLater bill and its scheduled installments.
   * Due date is automatically set to the 25th of the following month(s).
   */
  static async createPayLaterBill(params: {
    purchaseId: string;
    supplierId: string;
    totalAmount: number;
    tenor: 1 | 3;
    createdAt: string;
  }): Promise<string> {
    const billId = uuidv4();
    const bill: PayLaterBill = {
      billId,
      purchaseId: params.purchaseId,
      supplierId: params.supplierId,
      totalAmount: params.totalAmount,
      tenor: params.tenor,
      status: 'ACTIVE',
      createdAt: params.createdAt
    };

    const installments: PayLaterInstallment[] = [];
    const installmentAmount = Math.round(params.totalAmount / params.tenor);
    const purchaseDate = new Date(params.createdAt);

    for (let i = 1; i <= params.tenor; i++) {
      // Logic: 25th of next month(s)
      const dueDate = setDate(addMonths(purchaseDate, i), 25);
      
      installments.push({
        installmentId: uuidv4(),
        billId,
        amount: i === params.tenor 
          ? params.totalAmount - (installmentAmount * (params.tenor - 1)) // Adjust last installment for rounding
          : installmentAmount,
        dueDate: dueDate.toISOString(),
        status: 'PENDING'
      });
    }

    await db.transaction('rw', [db.payLaterBills, db.payLaterInstallments, db.syncQueue], async () => {
      await db.payLaterBills.add(bill);
      for (const inst of installments) {
        await db.payLaterInstallments.add(inst);
      }
      
      await db.syncQueue.add({
        entityType: 'payLaterBills',
        entityId: billId,
        action: 'CREATE',
        payload: bill,
        status: 'PENDING',
        retryCount: 0,
        createdAt: params.createdAt
      });
    });

    return billId;
  }

  /**
   * Records payment for a specific installment and deducts from the chosen cash storage.
   */
  static async payInstallment(params: {
    installmentId: string;
    moneyStorageId: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
    userId: string;
    role: string;
    deviceId: string;
  }): Promise<void> {
    const inst = await db.payLaterInstallments.get(params.installmentId);
    if (!inst) throw new Error('Installment not found');
    if (inst.status === 'PAID') throw new Error('Installment already paid');

    const bill = await db.payLaterBills.get(inst.billId);
    if (!bill) throw new Error('Associated bill not found');

    const now = new Date().toISOString();
    const financeEventId = uuidv4();

    await db.transaction('rw', [
      db.payLaterInstallments, 
      db.payLaterBills,
      db.financeEvents, 
      db.auditLogs, 
      db.syncQueue
    ], async () => {
      // 1. Mark installment as PAID
      await db.payLaterInstallments.update(params.installmentId, {
        status: 'PAID',
        paidAt: now,
        moneyStorageId: params.moneyStorageId,
        financeEventId
      });

      // 2. Record Finance Outflow
      const financeEvent: FinanceEvent = {
        financeEventId,
        amount: inst.amount,
        storageId: params.moneyStorageId,
        direction: 'OUT',
        referenceId: params.installmentId,
        referenceType: 'EXPENSE', // Or a new type if we want to be specific
        description: `Bayar Cicilan SPayLater Faktur Purchase #${bill.purchaseId.slice(0, 8)}`,
        userId: params.userId,
        deviceId: params.deviceId,
        timestamp: now
      };
      await db.financeEvents.add(financeEvent);

      // 3. Audit Log
      await AuditEngine.log({
        userId: params.userId,
        role: params.role,
        deviceId: params.deviceId,
        action: 'PAYLATER_INSTALLMENT_PAID',
        module: 'FINANCE',
        referenceId: params.installmentId,
        after: { installment: inst, storage: params.moneyStorageId }
      });

      // 4. Check if all installments are paid to close the bill
      const allInsts = await db.payLaterInstallments.where('billId').equals(inst.billId).toArray();
      const allPaid = allInsts.every(it => it.installmentId === params.installmentId ? true : it.status === 'PAID');
      
      if (allPaid) {
        await db.payLaterBills.update(inst.billId, { status: 'PAID' });
      }

      // 5. Sync
      await db.syncQueue.add({
        entityType: 'financeEvents',
        entityId: financeEventId,
        action: 'CREATE',
        payload: financeEvent,
        status: 'PENDING',
        retryCount: 0,
        createdAt: now
      });
    });
  }
}
