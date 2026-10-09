import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { FinanceEvent, ReceivablePayment, SyncQueueItem } from '../types';
import { AuditEngine } from '../audit-engine';

export interface LedgerBalances {
  WARUNG: number;
  IKAN: number;
  UANG_DIGITAL: number;
  TOTAL: number;
  [key: string]: number;
}

export interface RecordReceivablePaymentParams {
  cashierId: string;
  role?: string;
  deviceId: string;
  shiftId?: string;
  customerId: string;
  receivableId: string;
  amount: number;
  paymentMethodId: string;
  moneyStorageId: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
  paymentDate?: string;
  notes?: string;
}

export interface RecordReceivablePaymentResult {
  financeEventId: string;
  paymentId: string;
  remainingAmount: number;
  status: 'PARTIAL' | 'PAID';
  storageBalanceAfter: number;
  balances: LedgerBalances;
}

export interface AddFinanceTransactionParams {
  amount: number;
  storageId: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
  direction?: 'IN' | 'OUT';
  referenceId: string;
  referenceType?: FinanceEvent['referenceType'];
  description?: string;
  userId: string;
  role?: string;
  deviceId: string;
  timestamp?: string;
  // Optional fields when settling a receivable simultaneously
  receivableId?: string;
  customerId?: string;
  paymentMethodId?: string;
  paymentDate?: string;
  shiftId?: string;
  notes?: string;
}

export class FinanceService {
  /**
   * Logs a transaction to the Finance Ledger with the given referenceId (e.g. receivable record),
   * and if receivableId is provided or referenceType === 'RECEIVABLE_PAYMENT', atomically updates
   * the receivable balance, payment history, and audit logs.
   */
  static async addTransaction(
    params: AddFinanceTransactionParams
  ): Promise<RecordReceivablePaymentResult> {
    const targetReceivableId = params.receivableId || params.referenceId;
    const isReceivableRef =
      Boolean(params.receivableId) ||
      params.referenceType === 'RECEIVABLE_PAYMENT' ||
      Boolean(await db.receivables.get(targetReceivableId));

    if (isReceivableRef) {
      const existingRec = await db.receivables.get(targetReceivableId);
      if (existingRec) {
        return this.recordReceivablePayment({
          cashierId: params.userId,
          role: params.role,
          deviceId: params.deviceId,
          shiftId: params.shiftId,
          customerId: params.customerId || existingRec.customerId,
          receivableId: existingRec.receivableId,
          amount: params.amount,
          paymentMethodId: params.paymentMethodId || params.storageId,
          moneyStorageId: params.storageId,
          paymentDate: params.paymentDate || (params.timestamp ? params.timestamp.slice(0, 10) : undefined),
          notes: params.notes || params.description
        });
      }
    }

    const event = await this.recordLedgerEntry({
      amount: params.amount,
      storageId: params.storageId,
      direction: params.direction || 'IN',
      referenceId: params.referenceId,
      referenceType: params.referenceType || 'RECEIVABLE_PAYMENT',
      description: params.description || params.notes,
      userId: params.userId,
      role: params.role,
      deviceId: params.deviceId,
      timestamp: params.timestamp
    });

    const balances = await this.getLedgerBalances();
    return {
      financeEventId: event.financeEventId,
      paymentId: event.financeEventId,
      remainingAmount: 0,
      status: 'PAID',
      storageBalanceAfter: balances[params.storageId],
      balances
    };
  }

  /**
   * Computes current derived ledger balances across all three money storages
   * (WARUNG, IKAN, UANG_DIGITAL) directly from immutable FinanceEvent entries.
   */
  static async getLedgerBalances(): Promise<LedgerBalances> {
    const allEvents = await db.financeEvents.toArray();
    const balances: LedgerBalances = {
      WARUNG: 0,
      IKAN: 0,
      UANG_DIGITAL: 0,
      TOTAL: 0
    };

    for (const event of allEvents) {
      const amount = Number(event.amount || 0);
      if (event.direction === 'IN') {
        balances[event.storageId] = (balances[event.storageId] || 0) + amount;
      } else {
        balances[event.storageId] = (balances[event.storageId] || 0) - amount;
      }
    }

    balances.TOTAL = balances.WARUNG + balances.IKAN + balances.UANG_DIGITAL;
    return balances;
  }

  /**
   * Records a general FinanceEvent entry, logs an audit entry, and queues for sync.
   */
  static async recordLedgerEntry(params: {
    amount: number;
    storageId: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
    direction: 'IN' | 'OUT';
    referenceId: string;
    referenceType: FinanceEvent['referenceType'];
    description?: string;
    userId: string;
    role?: string;
    deviceId: string;
    timestamp?: string;
  }): Promise<FinanceEvent> {
    if (params.amount <= 0) {
      throw new Error('Nominal transaksi kas harus lebih dari Rp 0');
    }

    const effectiveTimestamp = params.timestamp || new Date().toISOString();
    const financeEvent: FinanceEvent = {
      financeEventId: uuidv4(),
      amount: params.amount,
      storageId: params.storageId,
      direction: params.direction,
      referenceId: params.referenceId,
      referenceType: params.referenceType,
      description: params.description,
      userId: params.userId,
      deviceId: params.deviceId,
      timestamp: effectiveTimestamp
    };

    await db.transaction('rw', [db.financeEvents, db.auditLogs, db.syncQueue], async () => {
      await db.financeEvents.add(financeEvent);
      await this.addToQueue('financeEvents', financeEvent.financeEventId, 'CREATE', financeEvent);

      await AuditEngine.log({
        userId: params.userId,
        role: params.role || 'OWNER',
        deviceId: params.deviceId,
        action: `FINANCE_LEDGER_${params.direction}`,
        module: 'FINANCE',
        referenceId: financeEvent.financeEventId,
        reason: params.description || `${params.referenceType} (${params.direction})`,
        after: financeEvent
      });
    });

    return financeEvent;
  }

  /**
   * Atomically processes a debt/receivable repayment:
   * 1. Validates amount & paymentDate against receivable constraints
   * 2. Commits an inbound (IN) FinanceEvent to the Finance Ledger
   * 3. Updates Receivable paidAmount, remainingAmount, and status (PARTIAL / PAID)
   * 4. Appends a ReceivablePayment history record
   * 5. Records comprehensive Audit Logs for both RECEIVABLES and FINANCE modules with before/after ledger balances
   * 6. Enqueues all changes for offline/cloud sync
   */
  static async recordReceivablePayment(
    params: RecordReceivablePaymentParams
  ): Promise<RecordReceivablePaymentResult> {
    if (!params.amount || Number.isNaN(params.amount) || params.amount <= 0) {
      throw new Error('Nominal pembayaran harus lebih dari Rp 0');
    }

    const receivable = await db.receivables.get(params.receivableId);
    if (!receivable) {
      throw new Error('Data piutang tidak ditemukan');
    }
    if (params.amount > receivable.remainingAmount) {
      throw new Error('Nominal pembayaran melebihi sisa tagihan piutang');
    }

    // Validate paymentDate if provided
    const now = new Date();
    let effectiveTimestamp = now.toISOString();

    if (params.paymentDate) {
      const parsedDate = new Date(
        params.paymentDate.includes('T') ? params.paymentDate : `${params.paymentDate}T00:00:00`
      );
      if (Number.isNaN(parsedDate.getTime())) {
        throw new Error('Format tanggal pembayaran tidak valid');
      }

      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      if (parsedDate.getTime() > todayEnd.getTime()) {
        throw new Error('Tanggal pembayaran tidak boleh di masa depan');
      }

      const invoiceCreatedDate = new Date(receivable.createdAt);
      const invoiceStartOfDay = new Date(
        invoiceCreatedDate.getFullYear(),
        invoiceCreatedDate.getMonth(),
        invoiceCreatedDate.getDate(),
        0,
        0,
        0,
        0
      );
      if (parsedDate.getTime() < invoiceStartOfDay.getTime()) {
        throw new Error('Tanggal pembayaran tidak boleh mendahului tanggal pembuatan nota piutang');
      }

      const isSameDay =
        parsedDate.getFullYear() === now.getFullYear() &&
        parsedDate.getMonth() === now.getMonth() &&
        parsedDate.getDate() === now.getDate();

      if (!isSameDay) {
        parsedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        effectiveTimestamp = parsedDate.toISOString();
      }
    }

    const customer = await db.customers.get(params.customerId);
    const tx = await db.transactions.get(receivable.transactionId);
    const receiptRef = tx?.receiptNumber || receivable.transactionId.slice(0, 8).toUpperCase();
    const customerLabel = customer?.name || 'Pelanggan';

    const paymentId = uuidv4();
    const newPaidAmount = receivable.paidAmount + params.amount;
    const newRemainingAmount = Math.max(0, receivable.totalAmount - newPaidAmount);
    const newStatus: 'PARTIAL' | 'PAID' = newRemainingAmount <= 0 ? 'PAID' : 'PARTIAL';

    const defaultDesc = `${
      newRemainingAmount <= 0 ? 'Pelunasan' : 'Cicilan'
    } Piutang #${receiptRef} - ${customerLabel} (${params.paymentMethodId})`;
    const finalDescription = params.notes?.trim()
      ? `${defaultDesc} • Catatan: ${params.notes.trim()}`
      : defaultDesc;

    const financeEvent: FinanceEvent = {
      financeEventId: uuidv4(),
      amount: params.amount,
      storageId: params.moneyStorageId,
      direction: 'IN',
      referenceId: params.receivableId,
      referenceType: 'RECEIVABLE_PAYMENT',
      description: finalDescription,
      userId: params.cashierId,
      deviceId: params.deviceId,
      timestamp: effectiveTimestamp
    };

    const paymentRecord: ReceivablePayment = {
      paymentId,
      receivableId: params.receivableId,
      amount: params.amount,
      paymentMethodId: params.paymentMethodId,
      moneyStorageId: params.moneyStorageId,
      userId: params.cashierId,
      timestamp: effectiveTimestamp,
      paymentDate: params.paymentDate || effectiveTimestamp.slice(0, 10),
      notes: params.notes?.trim() || undefined
    };

    const balancesBefore = await this.getLedgerBalances();
    const storageBalanceBefore = balancesBefore[params.moneyStorageId] || 0;
    const storageBalanceAfter = storageBalanceBefore + params.amount;

    await db.transaction(
      'rw',
      [db.financeEvents, db.receivables, db.receivablePayments, db.auditLogs, db.syncQueue],
      async () => {
        // 1. Append Finance Event to Ledger
        await db.financeEvents.add(financeEvent);

        // 2. Update Receivable Balance & Status
        await db.receivables.update(params.receivableId, {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus
        });

        // 3. Append Receivable Payment History
        await db.receivablePayments.add(paymentRecord);

        // 4. Audit Log: Receivable Debt Settlement
        await AuditEngine.log({
          userId: params.cashierId,
          role: params.role || 'OWNER',
          deviceId: params.deviceId,
          action: 'SETTLE_RECEIVABLE',
          module: 'RECEIVABLES',
          referenceId: params.receivableId,
          reason: finalDescription,
          before: {
            paidAmount: receivable.paidAmount,
            remainingAmount: receivable.remainingAmount,
            status: receivable.status,
            storageId: params.moneyStorageId,
            storageBalanceBefore
          },
          after: {
            paymentId,
            amount: params.amount,
            paymentMethodId: params.paymentMethodId,
            paymentDate: paymentRecord.paymentDate,
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            status: newStatus,
            financeEventId: financeEvent.financeEventId,
            storageId: params.moneyStorageId,
            storageBalanceAfter
          }
        });

        // 5. Audit Log: Finance Ledger Inbound Cash Flow
        await AuditEngine.log({
          userId: params.cashierId,
          role: params.role || 'OWNER',
          deviceId: params.deviceId,
          action: 'FINANCE_LEDGER_RECEIVABLE_REPAYMENT',
          module: 'FINANCE',
          referenceId: financeEvent.financeEventId,
          reason: finalDescription,
          before: {
            storageId: params.moneyStorageId,
            balance: storageBalanceBefore
          },
          after: {
            storageId: params.moneyStorageId,
            balance: storageBalanceAfter,
            delta: params.amount,
            direction: 'IN',
            receivableId: params.receivableId,
            paymentId,
            paymentMethodId: params.paymentMethodId
          }
        });

        // 6. Enqueue Sync Operations
        await this.addToQueue('financeEvents', financeEvent.financeEventId, 'CREATE', financeEvent);
        await this.addToQueue('receivables', params.receivableId, 'UPDATE', {
          ...receivable,
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus
        });
        await this.addToQueue('receivablePayments', paymentId, 'CREATE', paymentRecord);
      }
    );

    const updatedBalances: LedgerBalances = {
      ...balancesBefore,
      [params.moneyStorageId]: storageBalanceAfter,
      TOTAL: balancesBefore.TOTAL + params.amount
    };

    return {
      financeEventId: financeEvent.financeEventId,
      paymentId,
      remainingAmount: newRemainingAmount,
      status: newStatus,
      storageBalanceAfter,
      balances: updatedBalances
    };
  }

  private static async addToQueue(
    entityType: string,
    entityId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    payload: any
  ) {
    const queueItem: SyncQueueItem = {
      entityType,
      entityId,
      action,
      payload,
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date().toISOString()
    };
    await db.syncQueue.add(queueItem);
  }
}
