import { db } from '../database';
import { cloudDeleteDoc } from '../firestore-realtime';
import { AuditEngine } from '../audit-engine';

export interface DataResetResult {
  success: boolean;
  count: number;
  message: string;
}

export class DataResetService {
  private static assertOwner(role?: string) {
    if (role !== 'OWNER') {
      throw new Error('Akses ditolak: Operasi reset dan penghapusan massal hanya diizinkan untuk peran OWNER.');
    }
  }

  // ==========================================
  // 1. SHIFT MANAGEMENT
  // ==========================================

  /**
   * Delete specific shifts by their IDs.
   */
  static async deleteShifts(
    shiftIds: string[],
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);
    if (!shiftIds || shiftIds.length === 0) {
      return { success: true, count: 0, message: 'Tidak ada shift yang dipilih.' };
    }

    let deletedCount = 0;
    for (const shiftId of shiftIds) {
      await db.shifts.delete(shiftId);
      await cloudDeleteDoc('shifts', shiftId).catch((err) =>
        console.warn(`Cloud delete error shift ${shiftId}:`, err)
      );
      deletedCount++;
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'BULK_DELETE_SHIFTS',
      module: 'SHIFT_MANAGEMENT',
      after: { shiftIds, count: deletedCount }
    });

    return {
      success: true,
      count: deletedCount,
      message: `Berhasil menghapus ${deletedCount} riwayat shift.`
    };
  }

  /**
   * Reset all shift history (clean state for official launch).
   */
  static async resetAllShifts(
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);

    const allShifts = await db.shifts.toArray();
    const count = allShifts.length;

    for (const shift of allShifts) {
      await db.shifts.delete(shift.shiftId);
      await cloudDeleteDoc('shifts', shift.shiftId).catch((err) =>
        console.warn(`Cloud delete error shift ${shift.shiftId}:`, err)
      );
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'RESET_ALL_SHIFTS',
      module: 'SHIFT_MANAGEMENT',
      after: { count }
    });

    return {
      success: true,
      count,
      message: `Seluruh riwayat shift (${count} data) berhasil di-reset bersih.`
    };
  }

  // ==========================================
  // 2. TRANSACTION / SALES HISTORY
  // ==========================================

  /**
   * Delete specific sales transactions by their IDs.
   * Also cleans up any receivables linked to these test transactions.
   */
  static async deleteTransactions(
    transactionIds: string[],
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);
    if (!transactionIds || transactionIds.length === 0) {
      return { success: true, count: 0, message: 'Tidak ada transaksi yang dipilih.' };
    }

    let deletedCount = 0;
    for (const txId of transactionIds) {
      // 1. Delete associated receivables and payments
      const linkedReceivables = await db.receivables
        .filter((r) => r.transactionId === txId)
        .toArray();

      for (const rec of linkedReceivables) {
        const payments = await db.receivablePayments
          .filter((p) => p.receivableId === rec.receivableId)
          .toArray();

        for (const p of payments) {
          await db.receivablePayments.delete(p.paymentId);
          await cloudDeleteDoc('receivablePayments', p.paymentId).catch(() => {});
        }

        await db.receivables.delete(rec.receivableId);
        await cloudDeleteDoc('receivables', rec.receivableId).catch(() => {});
      }

      // 2. Delete transaction from local Dexie & Cloud
      await db.transactions.delete(txId);
      await cloudDeleteDoc('transactions', txId).catch((err) =>
        console.warn(`Cloud delete error tx ${txId}:`, err)
      );
      deletedCount++;
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'BULK_DELETE_TRANSACTIONS',
      module: 'SALES_TRANSACTIONS',
      after: { transactionIds, count: deletedCount }
    });

    return {
      success: true,
      count: deletedCount,
      message: `Berhasil menghapus ${deletedCount} riwayat transaksi penjualan.`
    };
  }

  /**
   * Reset all sales transactions (clean state for official launch).
   */
  static async resetAllTransactions(
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);

    const allTxs = await db.transactions.toArray();
    const count = allTxs.length;

    for (const tx of allTxs) {
      // Clean linked receivables
      const linkedReceivables = await db.receivables
        .filter((r) => r.transactionId === tx.transactionId)
        .toArray();

      for (const rec of linkedReceivables) {
        const payments = await db.receivablePayments
          .filter((p) => p.receivableId === rec.receivableId)
          .toArray();

        for (const p of payments) {
          await db.receivablePayments.delete(p.paymentId);
          await cloudDeleteDoc('receivablePayments', p.paymentId).catch(() => {});
        }

        await db.receivables.delete(rec.receivableId);
        await cloudDeleteDoc('receivables', rec.receivableId).catch(() => {});
      }

      await db.transactions.delete(tx.transactionId);
      await cloudDeleteDoc('transactions', tx.transactionId).catch(() => {});
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'RESET_ALL_TRANSACTIONS',
      module: 'SALES_TRANSACTIONS',
      after: { count }
    });

    return {
      success: true,
      count,
      message: `Seluruh riwayat transaksi penjualan (${count} transaksi) berhasil di-reset bersih.`
    };
  }

  // ==========================================
  // 3. CUSTOMER DATABASE
  // ==========================================

  /**
   * Delete specific customers by their IDs.
   * Also cleans up linked loyalty events.
   */
  static async deleteCustomers(
    customerIds: string[],
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);
    if (!customerIds || customerIds.length === 0) {
      return { success: true, count: 0, message: 'Tidak ada pelanggan yang dipilih.' };
    }

    let deletedCount = 0;
    for (const custId of customerIds) {
      // 1. Clean linked loyalty events
      const loyaltyEvents = await db.loyaltyEvents
        .filter((l) => l.customerId === custId)
        .toArray();

      for (const le of loyaltyEvents) {
        await db.loyaltyEvents.delete(le.loyaltyEventId);
        await cloudDeleteDoc('loyaltyEvents', le.loyaltyEventId).catch(() => {});
      }

      // 2. Delete customer
      await db.customers.delete(custId);
      await cloudDeleteDoc('customers', custId).catch((err) =>
        console.warn(`Cloud delete error customer ${custId}:`, err)
      );
      deletedCount++;
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'BULK_DELETE_CUSTOMERS',
      module: 'CUSTOMER_DATABASE',
      after: { customerIds, count: deletedCount }
    });

    return {
      success: true,
      count: deletedCount,
      message: `Berhasil menghapus ${deletedCount} data pelanggan.`
    };
  }

  /**
   * Reset all customers and loyalty points.
   */
  static async resetAllCustomers(
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);

    const allCustomers = await db.customers.toArray();
    const count = allCustomers.length;

    for (const cust of allCustomers) {
      const loyaltyEvents = await db.loyaltyEvents
        .filter((l) => l.customerId === cust.customerId)
        .toArray();

      for (const le of loyaltyEvents) {
        await db.loyaltyEvents.delete(le.loyaltyEventId);
        await cloudDeleteDoc('loyaltyEvents', le.loyaltyEventId).catch(() => {});
      }

      await db.customers.delete(cust.customerId);
      await cloudDeleteDoc('customers', cust.customerId).catch(() => {});
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'RESET_ALL_CUSTOMERS',
      module: 'CUSTOMER_DATABASE',
      after: { count }
    });

    return {
      success: true,
      count,
      message: `Seluruh database pelanggan (${count} pelanggan) berhasil di-reset bersih.`
    };
  }

  // ==========================================
  // 4. FISH MANAGEMENT (DEATH LOGS & PROCUREMENTS)
  // ==========================================

  /**
   * Delete specific fish death log movements.
   */
  static async deleteFishDeathLogs(
    movementIds: string[],
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);
    if (!movementIds || movementIds.length === 0) {
      return { success: true, count: 0, message: 'Tidak ada log kematian ikan yang dipilih.' };
    }

    let deletedCount = 0;
    for (const id of movementIds) {
      await db.stockMovements.delete(id);
      await cloudDeleteDoc('stockMovements', id).catch(() => {});
      deletedCount++;
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'BULK_DELETE_FISH_DEATH_LOGS',
      module: 'FISH_MANAGEMENT',
      after: { movementIds, count: deletedCount }
    });

    return {
      success: true,
      count: deletedCount,
      message: `Berhasil menghapus ${deletedCount} catatan kematian ikan.`
    };
  }

  /**
   * Reset all fish mortality logs and procurement cycle history.
   * Note: This cleans historical loss records and procurement graphs without deleting fish SKU masters.
   */
  static async resetFishHistory(
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);

    // 1. Delete all fish mortality stock movements
    const deathMovements = await db.stockMovements
      .filter(
        (m) =>
          m.movementType === 'FISH_DEAD_OUT' ||
          (m.segmentId === 'IKAN' && !!m.reason?.toLowerCase().includes('ikan mati'))
      )
      .toArray();

    for (const m of deathMovements) {
      await db.stockMovements.delete(m.stockMovementId);
      await cloudDeleteDoc('stockMovements', m.stockMovementId).catch(() => {});
    }

    // 2. Reset fish procurement cycles in settings
    await db.settings.put({
      id: 'fish_procurement_cycles',
      data: []
    });

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'RESET_FISH_HISTORY',
      module: 'FISH_MANAGEMENT',
      after: {
        deletedDeathLogsCount: deathMovements.length,
        cyclesReset: true
      }
    });

    return {
      success: true,
      count: deathMovements.length,
      message: `Riwayat kematian ikan (${deathMovements.length} log) dan siklus pengadaan WAC berhasil di-reset.`
    };
  }

  // ==========================================
  // 5. FINANCE LEDGER
  // ==========================================

  /**
   * Delete specific finance events by their IDs.
   */
  static async deleteFinanceEvents(
    eventIds: string[],
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);
    if (!eventIds || eventIds.length === 0) {
      return { success: true, count: 0, message: 'Tidak ada entri buku kas yang dipilih.' };
    }

    let deletedCount = 0;
    for (const eventId of eventIds) {
      await db.financeEvents.delete(eventId);
      await cloudDeleteDoc('financeEvents', eventId).catch(() => {});
      deletedCount++;
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'BULK_DELETE_FINANCE_EVENTS',
      module: 'FINANCE_LEDGER',
      after: { eventIds, count: deletedCount }
    });

    return {
      success: true,
      count: deletedCount,
      message: `Berhasil menghapus ${deletedCount} catatan buku kas.`
    };
  }

  /**
   * Reset all finance events (buku kas) to zero state.
   */
  static async resetFinanceLedger(
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);

    const allEvents = await db.financeEvents.toArray();
    const count = allEvents.length;

    for (const evt of allEvents) {
      await db.financeEvents.delete(evt.financeEventId);
      await cloudDeleteDoc('financeEvents', evt.financeEventId).catch(() => {});
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'RESET_FINANCE_LEDGER',
      module: 'FINANCE_LEDGER',
      after: { count }
    });

    return {
      success: true,
      count,
      message: `Seluruh buku kas (${count} transaksi finansial) berhasil di-reset bersih ke saldo awal.`
    };
  }

  // ==========================================
  // 6. ORDER SCHEDULE & TO-DO LIST
  // ==========================================

  /**
   * Delete specific scheduled prep orders by their IDs.
   */
  static async deletePrepOrders(
    orderIds: string[],
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);
    if (!orderIds || orderIds.length === 0) {
      return { success: true, count: 0, message: 'Tidak ada jadwal pesanan yang dipilih.' };
    }

    let deletedCount = 0;
    for (const orderId of orderIds) {
      await db.prepOrders.delete(orderId);
      await cloudDeleteDoc('prepOrders', orderId).catch(() => {});
      deletedCount++;
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'BULK_DELETE_PREP_ORDERS',
      module: 'SCHEDULE_TO_DO',
      after: { orderIds, count: deletedCount }
    });

    return {
      success: true,
      count: deletedCount,
      message: `Berhasil menghapus ${deletedCount} jadwal pesanan.`
    };
  }

  /**
   * Reset all prep orders / to-do list (clean slate for official launch).
   */
  static async resetAllPrepOrders(
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);

    const allOrders = await db.prepOrders.toArray();
    const count = allOrders.length;

    for (const order of allOrders) {
      await db.prepOrders.delete(order.orderId);
      await cloudDeleteDoc('prepOrders', order.orderId).catch(() => {});
    }

    // Mark as seeded so initial sample orders are not recreated after reset
    if (typeof window !== 'undefined') {
      localStorage.setItem('riama_prep_orders_seeded_v1', 'true');
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'RESET_ALL_PREP_ORDERS',
      module: 'SCHEDULE_TO_DO',
      after: { count }
    });

    return {
      success: true,
      count,
      message: `Seluruh jadwal pesanan & to-do (${count} data) berhasil di-reset bersih untuk peluncuran resmi.`
    };
  }
}
