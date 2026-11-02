import { db } from '../database';
import { cloudSetDoc, cloudUpdateDoc, cloudDeleteDoc } from '../firestore-realtime';
import { AuditEngine } from '../audit-engine';
import type { Receivable, ReceivablePayment, FinanceEvent } from '../types';

export class ReceivableService {
  /**
   * Updates the due date of a receivable.
   */
  static async updateDueDate(
    receivableId: string, 
    newDueDate: string, 
    reason: string, 
    userId: string,
    deviceId: string,
    role: string
  ): Promise<void> {
    const receivable = await db.receivables.get(receivableId);
    if (!receivable) throw new Error('Piutang tidak ditemukan');

    const timestamp = new Date().toISOString();
    const updates = {
      dueDate: newDueDate,
      updatedAt: timestamp
    };

    // 1. Cloud Firestore update
    await cloudUpdateDoc('receivables', receivableId, updates);

    // 2. Local database update
    await db.receivables.update(receivableId, updates);

    // 3. Audit log
    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'UPDATE_RECEIVABLE_DUE_DATE',
      module: 'RECEIVABLES',
      referenceId: receivableId,
      before: { dueDate: receivable.dueDate },
      after: { dueDate: newDueDate, reason }
    });
  }

  /**
   * Deletes a receivable and all associated payments/finance events.
   * Restricted to Owner as per user request.
   */
  static async deleteReceivable(
    receivableId: string, 
    userId: string, 
    deviceId: string,
    role: string
  ): Promise<void> {
    if (role !== 'OWNER') {
      throw new Error('Hanya Owner yang diperbolehkan menghapus data piutang.');
    }

    // 1. Try to get receivable from local, fallback to Firestore
    let receivable = await db.receivables.get(receivableId);
    
    // If not in local, try to fetch from cloud to get transactionId for voiding
    if (!receivable) {
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db: firestoreDb } = await import('@/firebase/config');
        const docSnap = await getDoc(doc(firestoreDb, 'receivables', receivableId));
        if (docSnap.exists()) {
          receivable = docSnap.data() as Receivable;
        }
      } catch (err) {
        console.error('Cloud fallback lookup failed:', err);
      }
    }

    // 2. Delete the receivable itself in Cloud FIRST
    await cloudDeleteDoc('receivables', receivableId);
    await db.receivables.delete(receivableId);

    // 3. Get and delete all associated payments (Cloud & Local)
    // We try local first, but we should also check cloud if possible.
    // For now, local is usually in sync due to real-time listeners.
    const payments = await db.receivablePayments
      .where('receivableId')
      .equals(receivableId)
      .toArray();

    for (const payment of payments) {
      // Find finance events that reference this payment
      const financeEvents = await db.financeEvents
        .where('referenceId')
        .equals(payment.paymentId)
        .toArray();
      
      for (const fe of financeEvents) {
        await cloudDeleteDoc('financeEvents', fe.financeEventId);
        await db.financeEvents.delete(fe.financeEventId);
      }

      await cloudDeleteDoc('receivablePayments', payment.paymentId);
      await db.receivablePayments.delete(payment.paymentId);
    }

    // 4. Update the source transaction if it exists (remove receivableId reference)
    if (receivable?.transactionId) {
      const transaction = await db.transactions.get(receivable.transactionId);
      if (transaction) {
        await cloudUpdateDoc('transactions', transaction.transactionId, {
          receivableId: null,
          status: 'VOIDED' // Mark as voided since the piutang is deleted
        });
        await db.transactions.update(transaction.transactionId, {
          receivableId: undefined,
          status: 'VOIDED'
        });
      }
    }

    // 5. Audit log
    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'DELETE_RECEIVABLE',
      module: 'RECEIVABLES',
      referenceId: receivableId,
      before: receivable || { receivableId },
      reason: 'Dihapus secara manual oleh Owner'
    });
  }

  /**
   * Deletes a single payment record.
   * Recalculates the receivable balance.
   */
  static async deletePayment(
    paymentId: string, 
    userId: string, 
    deviceId: string,
    role: string
  ): Promise<void> {
    if (role !== 'OWNER') {
      throw new Error('Hanya Owner yang diperbolehkan menghapus data pembayaran.');
    }

    let payment = await db.receivablePayments.get(paymentId);
    
    // Cloud fallback for payment
    if (!payment) {
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db: firestoreDb } = await import('@/firebase/config');
        const docSnap = await getDoc(doc(firestoreDb, 'receivablePayments', paymentId));
        if (docSnap.exists()) {
          payment = docSnap.data() as ReceivablePayment;
        }
      } catch (err) {
        console.error('Cloud fallback lookup for payment failed:', err);
      }
    }

    if (!payment) {
      // If still not found, we can't do much about recalculating balance, 
      // but we should still try to delete from cloud if it exists there
      await cloudDeleteDoc('receivablePayments', paymentId);
      await db.receivablePayments.delete(paymentId);
      return;
    }

    const receivableId = payment.receivableId;
    let receivable = await db.receivables.get(receivableId);

    // 1. Delete associated finance events
    const financeEvents = await db.financeEvents
      .where('referenceId')
      .equals(paymentId)
      .toArray();
    
    for (const fe of financeEvents) {
      await cloudDeleteDoc('financeEvents', fe.financeEventId);
      await db.financeEvents.delete(fe.financeEventId);
    }

    // 2. Delete the payment record
    await cloudDeleteDoc('receivablePayments', paymentId);
    await db.receivablePayments.delete(paymentId);

    // 3. Recalculate receivable balance
    if (!receivable) {
      // Cloud fallback for receivable
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db: firestoreDb } = await import('@/firebase/config');
        const docSnap = await getDoc(doc(firestoreDb, 'receivables', receivableId));
        if (docSnap.exists()) {
          receivable = docSnap.data() as Receivable;
        }
      } catch (err) {}
    }

    if (receivable) {
      const remainingPayments = await db.receivablePayments
        .where('receivableId')
        .equals(receivableId)
        .toArray();
      
      const newPaidAmount = remainingPayments.reduce((sum, p) => sum + p.amount, 0);
      const newRemainingAmount = receivable.totalAmount - newPaidAmount;
      const newStatus: 'PAID' | 'PARTIAL' | 'OPEN' = newRemainingAmount <= 0 ? 'PAID' : newPaidAmount > 0 ? 'PARTIAL' : 'OPEN';

      const updates = {
        paidAmount: newPaidAmount,
        remainingAmount: newRemainingAmount,
        status: newStatus,
        updatedAt: new Date().toISOString()
      };

      await cloudUpdateDoc('receivables', receivableId, updates);
      await db.receivables.update(receivableId, updates);
    }

    // 4. Audit log
    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'DELETE_RECEIVABLE_PAYMENT',
      module: 'RECEIVABLES',
      referenceId: paymentId,
      before: payment,
      reason: 'Dihapus secara manual oleh Owner'
    });
  }
}
