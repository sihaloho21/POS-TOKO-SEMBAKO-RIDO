import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { db } from '../database';
import type { Receivable, Customer, FinanceEvent, User, CashierShift, ReceivablePayment } from '../types';
import { AuditEngine } from '../audit-engine';

export interface CreateStaffKasbonParams {
  cashierUserId: string;
  sourceType: 'SHIFT_DISCREPANCY' | 'DIRECT_CASH_ADVANCE';
  amount: number;
  shiftId?: string;
  dueDate: string;
  notes: string;
  ownerUserId: string;
  ownerPin: string;
  moneyStorageId?: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
  deviceId?: string;
}

export interface StaffDebtItem {
  receivable: Receivable;
  customer: Customer;
  cashierUser?: User;
  shift?: CashierShift;
  sourceType: 'SHIFT_DISCREPANCY' | 'DIRECT_CASH_ADVANCE';
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string;
  status: Receivable['status'];
  createdAt: string;
}

export class StaffDebtService {
  /**
   * Verifies Owner PIN.
   */
  static async verifyOwnerPin(pin: string): Promise<User> {
    const owner = await db.users
      .filter(u => u.role === 'OWNER' && (u.pinHash === pin || (u as any).pin === pin))
      .first();
    if (!owner) {
      throw new Error('PIN Owner salah atau Anda tidak memiliki akses Owner.');
    }
    return owner;
  }

  /**
   * Formally creates or records a Kasbon (Cash Advance / Staff Debt)
   * assigned to a specific cashier account.
   */
  static async createStaffKasbon(params: CreateStaffKasbonParams): Promise<{
    receivable: Receivable;
    customer: Customer;
  }> {
    const owner = await this.verifyOwnerPin(params.ownerPin);

    const cashierUser = await db.users.get(params.cashierUserId);
    if (!cashierUser) {
      throw new Error('Data kasir tidak ditemukan.');
    }

    if (params.amount <= 0) {
      throw new Error('Nominal kasbon harus lebih besar dari 0.');
    }

    const timestamp = new Date().toISOString();
    const cashierName = cashierUser.name;

    // 1. Find or create staff customer profile
    let staffCustomer = await db.customers
      .filter(c => Boolean(
        c.name.toLowerCase() === `kasir - ${cashierName}`.toLowerCase() ||
        (c.notes && c.notes.includes(params.cashierUserId))
      ))
      .first();

    if (!staffCustomer) {
      const customerId = uuidv4();
      staffCustomer = {
        customerId,
        name: `Kasir - ${cashierName}`,
        phone: (cashierUser as any)?.phone || '',
        notes: `Akun Piutang Karyawan / Kasir: ${cashierName} (ID: ${params.cashierUserId})`,
        isReseller: false,
        creditLimit: 10000000,
        defaultDueDateDays: 30,
        loyaltyPoints: 0,
        status: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp
      };
      await db.customers.add(staffCustomer);
      await db.syncQueue.add({
        entityType: 'customers',
        entityId: customerId,
        action: 'CREATE',
        payload: staffCustomer,
        status: 'PENDING',
        retryCount: 0,
        createdAt: timestamp
      });
    }

    // 2. Determine reference and create Receivable
    const receivableId = uuidv4();
    let transactionId = `KASBON-${receivableId.slice(-8).toUpperCase()}`;

    if (params.sourceType === 'SHIFT_DISCREPANCY' && params.shiftId) {
      const shift = await db.shifts.get(params.shiftId);
      if (shift) {
        transactionId = `SHIFT-${shift.shiftId.slice(-8).toUpperCase()}`;
      }
    }

    const staffReceivable: Receivable = {
      receivableId,
      transactionId,
      customerId: staffCustomer.customerId,
      totalAmount: params.amount,
      paidAmount: 0,
      remainingAmount: params.amount,
      dueDate: params.dueDate,
      status: 'OPEN',
      createdAt: timestamp
    };

    await db.receivables.add(staffReceivable);
    await db.syncQueue.add({
      entityType: 'receivables',
      entityId: receivableId,
      action: 'CREATE',
      payload: staffReceivable,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    // 3. If direct cash advance, register cash out finance event from storage
    if (params.sourceType === 'DIRECT_CASH_ADVANCE') {
      const financeEventId = uuidv4();
      const storageId = params.moneyStorageId || 'WARUNG';
      const financeEvent: FinanceEvent = {
        financeEventId,
        amount: params.amount,
        storageId,
        direction: 'OUT',
        referenceId: receivableId,
        referenceType: 'EXPENSE',
        description: `Pemberian Kasbon Karyawan kepada ${cashierName}: ${params.notes.trim()}`,
        userId: params.ownerUserId,
        deviceId: params.deviceId || 'system',
        timestamp
      };

      await db.financeEvents.add(financeEvent);
      await db.syncQueue.add({
        entityType: 'financeEvents',
        entityId: financeEventId,
        action: 'CREATE',
        payload: financeEvent,
        status: 'PENDING',
        retryCount: 0,
        createdAt: timestamp
      });
    }

    // 4. If from shift discrepancy, update shift resolution status
    if (params.sourceType === 'SHIFT_DISCREPANCY' && params.shiftId) {
      const shift = await db.shifts.get(params.shiftId);
      if (shift) {
        const resolutionNotes = params.notes.trim() || `Selisih kas laci dibebankan ke kasir ${cashierName}`;
        const updatedShift: CashierShift = {
          ...shift,
          discrepancyApprovalStatus: 'CHARGED_TO_CASHIER',
          discrepancyResolvedBy: owner.name,
          discrepancyResolvedAt: timestamp,
          discrepancyResolutionNotes: resolutionNotes,
          staffReceivableId: receivableId,
          endNotes: shift.endNotes 
            ? `${shift.endNotes} | Tanggungan Kasir: Rp ${params.amount.toLocaleString()} (${resolutionNotes})` 
            : `Tanggungan Kasir: Rp ${params.amount.toLocaleString()} (${resolutionNotes})`
        };
        await db.shifts.put(updatedShift);

        // Resolve conflict
        const conflict = await db.conflicts
          .where('entityId')
          .equals(params.shiftId)
          .first();

        if (conflict) {
          await db.conflicts.update(conflict.conflictId, {
            status: 'RESOLVED',
            resolvedBy: owner.name,
            resolvedAt: timestamp,
            details: {
              ...conflict.details,
              resolution: 'CHARGED_TO_CASHIER',
              receivableId,
              resolutionNotes
            }
          });
        }

        await db.syncQueue.add({
          entityType: 'shifts',
          entityId: params.shiftId,
          action: 'UPDATE',
          payload: updatedShift,
          status: 'PENDING',
          retryCount: 0,
          createdAt: timestamp
        });
      }
    }

    // 5. Audit Log
    await AuditEngine.log({
      userId: params.ownerUserId,
      role: 'OWNER',
      deviceId: params.deviceId || 'system',
      action: 'CREATE_STAFF_KASBON',
      module: 'KASBON_MANAGEMENT',
      referenceId: receivableId,
      after: {
        receivableId,
        cashierId: params.cashierUserId,
        cashierName,
        sourceType: params.sourceType,
        amount: params.amount,
        dueDate: params.dueDate,
        notes: params.notes,
        authorizedBy: owner.name,
        timestamp
      }
    });

    return { receivable: staffReceivable, customer: staffCustomer };
  }

  /**
   * Fetches all staff debt / kasbon items with linked customers and shifts.
   */
  static async getStaffDebts(): Promise<StaffDebtItem[]> {
    const receivables = await db.receivables.toArray();
    const customers = await db.customers.toArray();
    const customerMap = new Map(customers.map(c => [c.customerId, c]));

    const users = await db.users.toArray();
    const userMap = new Map(users.map(u => [u.userId, u]));

    const shifts = await db.shifts.toArray();
    const shiftMap = new Map(shifts.map(s => [s.shiftId, s]));

    const items: StaffDebtItem[] = [];

    for (const r of receivables) {
      const customer = customerMap.get(r.customerId);
      const isStaffCustomer = Boolean(
        customer &&
        (customer.name.toLowerCase().startsWith('kasir') ||
         customer.notes?.includes('Akun Piutang Karyawan') ||
         customer.notes?.includes('Kasbon'))
      );

      const isShiftReceivable = r.transactionId.startsWith('SHIFT-') || r.transactionId.startsWith('KASBON-');

      if (isStaffCustomer || isShiftReceivable) {
        let matchedShift: CashierShift | undefined = undefined;
        let matchedUser: User | undefined = undefined;

        // Try to match shift by staffReceivableId or transactionId
        for (const s of shifts) {
          if (s.staffReceivableId === r.receivableId || (s.shiftId && r.transactionId.includes(s.shiftId.slice(-8).toUpperCase()))) {
            matchedShift = s;
            matchedUser = userMap.get(s.userId);
            break;
          }
        }

        // If no user matched via shift, try parsing from customer notes or name
        if (!matchedUser && customer) {
          for (const u of users) {
            if (customer.name.toLowerCase().includes(u.name.toLowerCase()) || customer.notes?.includes(u.userId)) {
              matchedUser = u;
              break;
            }
          }
        }

        const isDiscrepancy = Boolean(matchedShift || r.transactionId.startsWith('SHIFT-'));

        items.push({
          receivable: r,
          customer: customer || {
            customerId: r.customerId,
            name: matchedUser ? `Kasir - ${matchedUser.name}` : 'Kasir Toko',
            isReseller: false,
            creditLimit: 0,
            defaultDueDateDays: 30,
            loyaltyPoints: 0,
            status: 'ACTIVE',
            createdAt: r.createdAt,
            updatedAt: r.createdAt
          },
          cashierUser: matchedUser,
          shift: matchedShift,
          sourceType: isDiscrepancy ? 'SHIFT_DISCREPANCY' : 'DIRECT_CASH_ADVANCE',
          totalAmount: r.totalAmount,
          paidAmount: r.paidAmount,
          remainingAmount: r.remainingAmount,
          dueDate: r.dueDate,
          status: r.status,
          createdAt: r.createdAt
        });
      }
    }

    // Sort newest first
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Records a partial or full repayment for a Staff Kasbon,
   * linking the payment directly back to the original cash difference / shift.
   */
  static async recordStaffKasbonPayment(params: {
    receivableId: string;
    amount: number;
    paymentMethod: 'POTONG_GAJI' | 'CASH' | 'TRANSFER' | 'QRIS';
    moneyStorageId?: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
    paymentDate?: string;
    notes?: string;
    ownerUserId: string;
    ownerPin?: string;
    deviceId?: string;
  }): Promise<{
    payment: ReceivablePayment;
    receivable: Receivable;
    isFullSettlement: boolean;
  }> {
    if (params.ownerPin) {
      await this.verifyOwnerPin(params.ownerPin);
    }

    if (!params.amount || params.amount <= 0) {
      throw new Error('Nominal pembayaran / cicilan harus lebih dari Rp 0.');
    }

    const receivable = await db.receivables.get(params.receivableId);
    if (!receivable) {
      throw new Error('Data kasbon piutang tidak ditemukan.');
    }

    if (params.amount > receivable.remainingAmount) {
      throw new Error(
        `Nominal pembayaran (Rp ${params.amount.toLocaleString()}) melebihi sisa tanggungan kasbon (Rp ${receivable.remainingAmount.toLocaleString()}).`
      );
    }

    const now = new Date();
    const timestamp = now.toISOString();
    const effectivePaymentDate = params.paymentDate || format(now, 'yyyy-MM-dd');

    const newPaidAmount = receivable.paidAmount + params.amount;
    const newRemainingAmount = Math.max(0, receivable.totalAmount - newPaidAmount);
    const isFullSettlement = newRemainingAmount <= 0;
    const newStatus: Receivable['status'] = isFullSettlement ? 'PAID' : 'PARTIAL';

    // Retrieve shift details if linked to an original cash difference
    let linkedShift: CashierShift | undefined = undefined;
    const shifts = await db.shifts.toArray();
    for (const s of shifts) {
      if (
        s.staffReceivableId === params.receivableId ||
        (s.shiftId && receivable.transactionId.includes(s.shiftId.slice(-8).toUpperCase()))
      ) {
        linkedShift = s;
        break;
      }
    }

    const paymentId = uuidv4();
    const storageId = params.moneyStorageId || 'WARUNG';

    // Create payment record
    const paymentRecord: ReceivablePayment = {
      paymentId,
      receivableId: params.receivableId,
      amount: params.amount,
      paymentMethodId: params.paymentMethod,
      moneyStorageId: storageId,
      userId: params.ownerUserId,
      timestamp,
      paymentDate: effectivePaymentDate,
      notes: params.notes?.trim() || (
        isFullSettlement
          ? `Pelunasan penuh kasbon ${receivable.transactionId} via ${params.paymentMethod}`
          : `Pembayaran cicilan kasbon ${receivable.transactionId} via ${params.paymentMethod}`
      )
    };

    await db.transaction(
      'rw',
      [db.receivables, db.receivablePayments, db.financeEvents, db.shifts, db.auditLogs, db.syncQueue],
      async () => {
        // 1. Update Receivable
        const updatedReceivable: Receivable = {
          ...receivable,
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus
        };
        await db.receivables.put(updatedReceivable);

        // 2. Add Payment Record
        await db.receivablePayments.add(paymentRecord);

        // 3. If Cash or Bank/QRIS, record FinanceEvent (Kas Masuk)
        if (params.paymentMethod === 'CASH' || params.paymentMethod === 'TRANSFER' || params.paymentMethod === 'QRIS') {
          const financeEventId = uuidv4();
          const targetStorage = params.paymentMethod === 'CASH' ? storageId : 'UANG_DIGITAL';
          const financeEvent: FinanceEvent = {
            financeEventId,
            amount: params.amount,
            storageId: targetStorage,
            direction: 'IN',
            referenceId: params.receivableId,
            referenceType: 'RECEIVABLE_PAYMENT',
            description: `${isFullSettlement ? 'Pelunasan' : 'Cicilan'} Kasbon Kasir #${receivable.transactionId} (${params.paymentMethod})${
              linkedShift ? ` [Shift #${linkedShift.shiftId.slice(-6).toUpperCase()}]` : ''
            }`,
            userId: params.ownerUserId,
            deviceId: params.deviceId || 'system',
            timestamp
          };
          await db.financeEvents.add(financeEvent);

          await db.syncQueue.add({
            entityType: 'financeEvents',
            entityId: financeEventId,
            action: 'CREATE',
            payload: financeEvent,
            status: 'PENDING',
            retryCount: 0,
            createdAt: timestamp
          });
        }

        // 4. If linked to shift, append repayment note to shift
        if (linkedShift) {
          const shiftNote = `[${format(now, 'dd/MM/yyyy HH:mm')}] ${
            isFullSettlement ? 'LUNAS' : 'Cicilan'
          } Rp ${params.amount.toLocaleString()} (${params.paymentMethod})`;
          
          const updatedShift: CashierShift = {
            ...linkedShift,
            endNotes: linkedShift.endNotes ? `${linkedShift.endNotes} | ${shiftNote}` : shiftNote
          };
          await db.shifts.put(updatedShift);

          await db.syncQueue.add({
            entityType: 'shifts',
            entityId: linkedShift.shiftId,
            action: 'UPDATE',
            payload: updatedShift,
            status: 'PENDING',
            retryCount: 0,
            createdAt: timestamp
          });
        }

        // 5. Audit Log
        await AuditEngine.log({
          userId: params.ownerUserId,
          role: 'OWNER',
          deviceId: params.deviceId || 'system',
          action: isFullSettlement ? 'FULL_SETTLE_STAFF_KASBON' : 'PARTIAL_REPAY_STAFF_KASBON',
          module: 'KASBON_MANAGEMENT',
          referenceId: params.receivableId,
          before: {
            paidAmount: receivable.paidAmount,
            remainingAmount: receivable.remainingAmount,
            status: receivable.status
          },
          after: {
            paymentId,
            amount: params.amount,
            paymentMethod: params.paymentMethod,
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            status: newStatus,
            linkedShiftId: linkedShift?.shiftId,
            originalDiscrepancy: linkedShift?.discrepancy,
            notes: params.notes,
            timestamp
          }
        });

        // 6. Sync queues
        await db.syncQueue.add({
          entityType: 'receivables',
          entityId: params.receivableId,
          action: 'UPDATE',
          payload: updatedReceivable,
          status: 'PENDING',
          retryCount: 0,
          createdAt: timestamp
        });

        await db.syncQueue.add({
          entityType: 'receivablePayments',
          entityId: paymentId,
          action: 'CREATE',
          payload: paymentRecord,
          status: 'PENDING',
          retryCount: 0,
          createdAt: timestamp
        });
      }
    );

    const finalReceivable = (await db.receivables.get(params.receivableId))!;
    return {
      payment: paymentRecord,
      receivable: finalReceivable,
      isFullSettlement
    };
  }

  /**
   * Fetches the complete payment and repayment history for all staff kasbon,
   * linking each payment transaction back to the original cash differences and shifts.
   */
  static async getStaffRepaymentHistory(): Promise<{
    payment: ReceivablePayment;
    receivable: Receivable;
    customer: Customer;
    cashierUser?: User;
    shift?: CashierShift;
    originalDiscrepancy?: number;
    sourceType: 'SHIFT_DISCREPANCY' | 'DIRECT_CASH_ADVANCE';
    isFullSettlement: boolean;
    recorderName: string;
  }[]> {
    const allStaffDebts = await this.getStaffDebts();
    const staffReceivableIds = new Set(allStaffDebts.map(d => d.receivable.receivableId));
    const debtMap = new Map(allStaffDebts.map(d => [d.receivable.receivableId, d]));

    const allPayments = await db.receivablePayments.toArray();
    const users = await db.users.toArray();
    const userMap = new Map(users.map(u => [u.userId, u.name]));

    const staffPayments = allPayments.filter(p => staffReceivableIds.has(p.receivableId));

    // Sort newest first
    staffPayments.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return staffPayments.map(p => {
      const debt = debtMap.get(p.receivableId)!;
      const isFull = debt.receivable.remainingAmount <= 0;
      const recorderName = userMap.get(p.userId) || p.userId;

      return {
        payment: p,
        receivable: debt.receivable,
        customer: debt.customer,
        cashierUser: debt.cashierUser,
        shift: debt.shift,
        originalDiscrepancy: debt.shift ? debt.shift.discrepancy : undefined,
        sourceType: debt.sourceType,
        isFullSettlement: isFull,
        recorderName
      };
    });
  }
}
