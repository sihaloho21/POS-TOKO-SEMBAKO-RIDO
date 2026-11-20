import { v4 as uuidv4 } from 'uuid';
import { collection, doc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../database';
import { db as firestoreDb, auth } from '../../firebase/config';
import { cloudDeleteDoc } from '../firestore-realtime';
import { AuditEngine } from '../audit-engine';
import { SyncEngine } from '../sync-engine';
import { CloudAuthService } from './cloud-auth-service';
import { PerformanceTracker } from './performance-tracker';
import type { StockMovement } from '../types';

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
      // 1. Clean linked receivables
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

      // 2. Clean associated stock movements (SALE_OUT, SALE_RETURN_IN, etc.)
      const movements = await db.stockMovements
        .filter((m) => m.transactionId === tx.transactionId || m.referenceId === tx.transactionId)
        .toArray();
      
      for (const m of movements) {
        await db.stockMovements.delete(m.stockMovementId);
        await cloudDeleteDoc('stockMovements', m.stockMovementId).catch(() => {});
      }

      // 3. Delete transaction
      await db.transactions.delete(tx.transactionId);
      await cloudDeleteDoc('transactions', tx.transactionId).catch(() => {});
    }

    // 4. Reconcile all product stocks after clearing sales movements
    const products = await db.products.toArray();
    for (const p of products) {
      const movements = await db.stockMovements.where('productId').equals(p.productId).toArray();
      let derived = 0;
      for (const m of movements) {
        // Need to import getMovementDelta or implement locally
        const rawBase = m.baseQty ?? m.qty ?? (m.quantity !== undefined ? Math.abs(m.quantity) : 0);
        const base = isNaN(rawBase) ? 0 : Math.abs(rawBase);
        const mType = (m.movementType || '').toUpperCase();
        
        if (['OPENING_BALANCE', 'PURCHASE_IN', 'SALE_RETURN_IN', 'STOCK_OPNAME_IN', 'ADJUSTMENT_IN', 'VOID_REVERSAL_IN', 'IN'].includes(mType)) {
          derived += base;
        } else if (['SALE_OUT', 'SALE', 'STOCK_OPNAME_OUT', 'DAMAGED_OUT', 'LOST_OUT', 'EXPIRED_OUT', 'FISH_DEAD_OUT', 'ADJUSTMENT_OUT', 'VOID_REVERSAL_OUT', 'SUPPLIER_RETURN_OUT', 'OUT'].includes(mType)) {
          derived -= base;
        }
      }
      await db.products.update(p.productId, { stock: Number(derived.toFixed(4)), updatedAt: new Date().toISOString() });
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
      message: `Seluruh riwayat transaksi penjualan (${count} transaksi) dan mutasi stok terkait berhasil di-reset bersih.`
    };
  }

  // ==========================================
  // 3. INVENTORY & STOCK HISTORY
  // ==========================================

  /**
   * Reset all stock levels and clear stock movement history.
   * Option to keep Opening Balances (baseline stock).
   */
  static async resetInventoryStock(
    keepOpeningBalance: boolean,
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);

    const allMovements = await db.stockMovements.toArray();
    let deletedCount = 0;

    for (const m of allMovements) {
      if (keepOpeningBalance && m.movementType === 'OPENING_BALANCE') {
        continue;
      }
      await db.stockMovements.delete(m.stockMovementId);
      await cloudDeleteDoc('stockMovements', m.stockMovementId).catch(() => {});
      deletedCount++;
    }

    // Reconcile all products
    const allProducts = await db.products.toArray();
    for (const p of allProducts) {
      const movements = await db.stockMovements.where('productId').equals(p.productId).toArray();
      let derived = 0;
      for (const m of movements) {
        const rawBase = m.baseQty ?? m.qty ?? (m.quantity !== undefined ? Math.abs(m.quantity) : 0);
        const base = isNaN(rawBase) ? 0 : Math.abs(rawBase);
        const mType = (m.movementType || '').toUpperCase();
        if (['OPENING_BALANCE', 'PURCHASE_IN', 'SALE_RETURN_IN', 'STOCK_OPNAME_IN', 'ADJUSTMENT_IN', 'VOID_REVERSAL_IN', 'IN'].includes(mType)) {
          derived += base;
        } else {
          derived -= base;
        }
      }
      await db.products.update(p.productId, { stock: Number(derived.toFixed(4)), updatedAt: new Date().toISOString() });
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'RESET_INVENTORY_STOCK',
      module: 'INVENTORY',
      after: { movementsDeleted: deletedCount, keptOpeningBalance: keepOpeningBalance }
    });

    return {
      success: true,
      count: deletedCount,
      message: `Riwayat mutasi stok berhasil dibersihkan (${deletedCount} log dihapus). Stok produk telah direkonsiliasi.`
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

  // ==========================================
  // 7. PURCHASES & FAKTUR PEMBELIAN
  // ==========================================

  /**
   * Delete specific purchases by their IDs.
   * Also cleans up linked payLater bills/installments.
   */
  static async deletePurchases(
    purchaseIds: string[],
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);
    if (!purchaseIds || purchaseIds.length === 0) {
      return { success: true, count: 0, message: 'Tidak ada faktur pembelian yang dipilih.' };
    }

    let deletedCount = 0;
    for (const pId of purchaseIds) {
      // Clean linked payLater bills
      const bills = await db.payLaterBills.filter(b => b.purchaseId === pId).toArray();
      for (const b of bills) {
        const insts = await db.payLaterInstallments.filter(i => i.billId === b.billId).toArray();
        for (const inst of insts) {
          await db.payLaterInstallments.delete(inst.installmentId);
          await cloudDeleteDoc('payLaterInstallments', inst.installmentId).catch(() => {});
        }
        await db.payLaterBills.delete(b.billId);
        await cloudDeleteDoc('payLaterBills', b.billId).catch(() => {});
      }

      await db.purchases.delete(pId);
      await cloudDeleteDoc('purchases', pId).catch(() => {});
      deletedCount++;
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'BULK_DELETE_PURCHASES',
      module: 'PURCHASES',
      after: { purchaseIds, count: deletedCount }
    });

    return {
      success: true,
      count: deletedCount,
      message: `Berhasil menghapus ${deletedCount} faktur pembelian.`
    };
  }

  /**
   * Reset all purchases (clean slate for official launch).
   */
  static async resetAllPurchases(
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);

    const allPurchases = await db.purchases.toArray();
    const count = allPurchases.length;

    for (const p of allPurchases) {
      // 1. Clean linked payLater bills
      const bills = await db.payLaterBills.filter(b => b.purchaseId === p.purchaseId).toArray();
      for (const b of bills) {
        const insts = await db.payLaterInstallments.filter(i => i.billId === b.billId).toArray();
        for (const inst of insts) {
          await db.payLaterInstallments.delete(inst.installmentId);
          await cloudDeleteDoc('payLaterInstallments', inst.installmentId).catch(() => {});
        }
        await db.payLaterBills.delete(b.billId);
        await cloudDeleteDoc('payLaterBills', b.billId).catch(() => {});
      }

      // 2. Clean associated stock movements (PURCHASE_IN, etc.)
      const movements = await db.stockMovements
        .filter((m) => m.referenceId === p.purchaseId || m.transactionId === p.purchaseId)
        .toArray();
      
      for (const m of movements) {
        await db.stockMovements.delete(m.stockMovementId);
        await cloudDeleteDoc('stockMovements', m.stockMovementId).catch(() => {});
      }

      // 3. Delete purchase
      await db.purchases.delete(p.purchaseId);
      await cloudDeleteDoc('purchases', p.purchaseId).catch(() => {});
    }

    // 4. Reconcile all product stocks after clearing purchase movements
    const allProds = await db.products.toArray();
    for (const prod of allProds) {
      const movements = await db.stockMovements.where('productId').equals(prod.productId).toArray();
      let derived = 0;
      for (const m of movements) {
        const rawBase = m.baseQty ?? m.qty ?? (m.quantity !== undefined ? Math.abs(m.quantity) : 0);
        const base = isNaN(rawBase) ? 0 : Math.abs(rawBase);
        const mType = (m.movementType || '').toUpperCase();
        if (['OPENING_BALANCE', 'PURCHASE_IN', 'SALE_RETURN_IN', 'STOCK_OPNAME_IN', 'ADJUSTMENT_IN', 'VOID_REVERSAL_IN', 'IN'].includes(mType)) {
          derived += base;
        } else {
          derived -= base;
        }
      }
      await db.products.update(prod.productId, { stock: Number(derived.toFixed(4)), updatedAt: new Date().toISOString() });
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'RESET_ALL_PURCHASES',
      module: 'PURCHASES',
      after: { count }
    });

    return {
      success: true,
      count,
      message: `Seluruh riwayat pembelian (${count} faktur) dan mutasi stok terkait berhasil di-reset bersih.`
    };
  }

  // ==========================================
  // 8. STOCK OPNAME HISTORY
  // ==========================================

  /**
   * Reset all stock opname records.
   */
  static async resetAllStockOpnames(
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);

    const allOpnames = await db.stockOpnames.toArray();
    const count = allOpnames.length;

    for (const op of allOpnames) {
      await db.stockOpnames.delete(op.opnameId);
      await cloudDeleteDoc('stockOpnames', op.opnameId).catch(() => {});
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'RESET_ALL_STOCK_OPNAMES',
      module: 'INVENTORY',
      after: { count }
    });

    return {
      success: true,
      count,
      message: `Seluruh riwayat stock opname (${count} data) berhasil di-reset bersih.`
    };
  }

  // ==========================================
  // 9. DIGITAL SERVICES
  // ==========================================

  /**
   * Delete specific digital service transactions by their IDs.
   */
  static async deleteDigitalServices(
    serviceIds: string[],
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);
    if (!serviceIds || serviceIds.length === 0) {
      return { success: true, count: 0, message: 'Tidak ada transaksi digital yang dipilih.' };
    }

    let deletedCount = 0;
    for (const sId of serviceIds) {
      await db.digitalServices.delete(sId);
      await cloudDeleteDoc('digitalServices', sId).catch(() => {});
      deletedCount++;
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'BULK_DELETE_DIGITAL_SERVICES',
      module: 'DIGITAL_SERVICES',
      after: { serviceIds, count: deletedCount }
    });

    return {
      success: true,
      count: deletedCount,
      message: `Berhasil menghapus ${deletedCount} transaksi layanan digital.`
    };
  }

  /**
   * Reset all digital service records.
   */
  static async resetAllDigitalServices(
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);

    const allServices = await db.digitalServices.toArray();
    const count = allServices.length;

    for (const s of allServices) {
      await db.digitalServices.delete(s.serviceId);
      await cloudDeleteDoc('digitalServices', s.serviceId).catch(() => {});
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'RESET_ALL_DIGITAL_SERVICES',
      module: 'DIGITAL_SERVICES',
      after: { count }
    });

    return {
      success: true,
      count,
      message: `Seluruh riwayat layanan digital (${count} transaksi) berhasil di-reset bersih.`
    };
  }

  // ==========================================
  // 10. CONSIGNMENT (TITIPAN BARANG)
  // ==========================================

  /**
   * Reset all consignment history (settlements and arrivals).
   */
  static async resetConsignmentHistory(
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);

    const settlements = await db.consignmentSettlements.toArray();
    for (const s of settlements) {
      await db.consignmentSettlements.delete(s.id);
      await cloudDeleteDoc('consignmentSettlements', s.id).catch(() => {});
    }

    const arrivals = await db.consignmentArrivals.toArray();
    for (const a of arrivals) {
      await db.consignmentArrivals.delete(a.id);
      await cloudDeleteDoc('consignmentArrivals', a.id).catch(() => {});
    }

    // Reset totalSold on all items
    const allItems = await db.consignmentItems.toArray();
    for (const item of allItems) {
      await db.consignmentItems.update(item.id, {
        totalSold: 0,
        lastSettlementAt: undefined,
        updatedAt: new Date().toISOString()
      });
    }

    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'RESET_CONSIGNMENT_HISTORY',
      module: 'CONSIGNMENT',
      after: { 
        settlementsDeleted: settlements.length, 
        arrivalsDeleted: arrivals.length 
      }
    });

    return {
      success: true,
      count: settlements.length + arrivals.length,
      message: `Riwayat konsinyasi (${settlements.length} setoran & ${arrivals.length} stok masuk) berhasil di-reset.`
    };
  }

  // ==========================================
  // 11. AUDIT LOGS
  // ==========================================

  /**
   * Reset all audit logs.
   */
  static async resetAuditLogs(
    userId: string,
    role: string,
    deviceId: string = 'device-1'
  ): Promise<DataResetResult> {
    this.assertOwner(role);

    const allLogs = await db.auditLogs.toArray();
    const count = allLogs.length;

    for (const log of allLogs) {
      await db.auditLogs.delete(log.auditId);
      await cloudDeleteDoc('auditLogs', log.auditId).catch(() => {});
    }

    // Log the reset action itself as the only remaining log
    await AuditEngine.log({
      userId,
      role,
      deviceId,
      action: 'RESET_AUDIT_LOGS',
      module: 'SYSTEM',
      after: { count }
    });

    return {
      success: true,
      count,
      message: `Seluruh log audit (${count} data) berhasil dibersihkan.`
    };
  }

  // ==========================================
  // 12. GLOBAL LAUNCH RESET (KEEP INVENTORY/PRODUCTS & PAYROLL)
  // ==========================================

  /**
   * Reset ALL operational/example data across BOTH Local IndexedDB and Cloud Firestore,
   * while strictly preserving:
   * - Inventory Management & Products (products, productCosts, bundles + clean OPENING_BALANCE stock baselines)
   * - Penggajian Karyawan (payrolls, bonusCategories)
   * - User login accounts, payment methods, and store configuration settings
   */
  static async resetAllExceptInventoryAndPayroll(
    userId: string,
    role: string,
    deviceId: string = 'device-1',
    onProgress?: (statusText: string) => void
  ): Promise<DataResetResult & {
    localDeleted: number;
    cloudDeleted: number;
    preservedProducts: number;
    preservedPayrolls: number;
    rebaselinedStockMovements: number;
  }> {
    this.assertOwner(role);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error(
        'Koneksi internet diperlukan untuk mereset database Cloud Firestore sekaligus dengan data lokal.'
      );
    }

    if (!auth.currentUser) {
      await CloudAuthService.ensureAuthenticated('OWNER', userId).catch(() => null);
    }

    SyncEngine.stop();

    try {
      onProgress?.('Membersihkan antrian sinkronisasi...');
      await db.syncQueue.clear();

      // Snapshot preserved Inventory & Payroll data before clearing operational ledgers
      const preservedProductsList = await db.products.toArray();
      const preservedCosts = await db.productCosts.toArray();
      const costMap = new Map(preservedCosts.map((c) => [c.productId, c.hpp]));
      const preservedPayrollsCount = await db.payrolls.count();

      // 1. Wipe all non-inventory, non-payroll collections directly in Cloud Firestore
      const CLOUD_COLLECTIONS_TO_WIPE = [
        'transactions',
        'TRANSACTION',
        'TRANSACTIONS',
        'transaction',
        'receivables',
        'receivablePayments',
        'shifts',
        'customers',
        'loyaltyEvents',
        'suppliers',
        'purchases',
        'payLaterBills',
        'payLaterInstallments',
        'financeEvents',
        'stockOpnames',
        'digitalServices',
        'prepOrders',
        'consignmentItems',
        'consignmentArrivals',
        'consignmentSettlements',
        'conflicts',
        'notifications',
        'auditLogs',
        'stockMovements',
        '_health'
      ];

      let cloudDeleted = 0;
      const BATCH_LIMIT = 400;

      for (const colName of CLOUD_COLLECTIONS_TO_WIPE) {
        onProgress?.(`Menghapus koleksi Cloud: ${colName}...`);
        const snap = await getDocs(collection(firestoreDb, colName));
        if (!snap.empty) {
          const docs = snap.docs;
          for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
            const chunk = docs.slice(i, i + BATCH_LIMIT);
            const batch = writeBatch(firestoreDb);
            for (const d of chunk) {
              batch.delete(d.ref);
            }
            await batch.commit();
            cloudDeleted += chunk.length;
          }
        }
      }

      // Clean sample-tracking settings docs in Firestore
      await deleteDoc(doc(firestoreDb, 'settings', 'fish_procurement_cycles')).catch(() => {});
      await deleteDoc(doc(firestoreDb, 'settings', 'minimal_fish_seeded')).catch(() => {});

      // 2. Wipe all corresponding local IndexedDB tables
      onProgress?.('Membersihkan database lokal perangkat...');
      const LOCAL_TABLES_TO_CLEAR = [
        'transactions',
        'receivables',
        'receivablePayments',
        'shifts',
        'customers',
        'loyaltyEvents',
        'suppliers',
        'purchases',
        'payLaterBills',
        'payLaterInstallments',
        'financeEvents',
        'stockOpnames',
        'digitalServices',
        'prepOrders',
        'consignmentItems',
        'consignmentArrivals',
        'consignmentSettlements',
        'conflicts',
        'notifications',
        'auditLogs',
        'stockMovements'
      ] as const;

      let localDeleted = 0;
      for (const tableName of LOCAL_TABLES_TO_CLEAR) {
        const table = db[tableName];
        localDeleted += await table.count();
        await table.clear();
      }

      await db.settings.bulkDelete(['fish_procurement_cycles', 'minimal_fish_seeded']).catch(() => {});

      // 3. Re-baseline stockMovements for preserved non-zero-stock products so derived stock stays exact
      onProgress?.('Menjaga konsistensi stok awal Inventory Management...');
      const now = new Date().toISOString();
      const baselineMovements: StockMovement[] = [];

      for (const p of preservedProductsList) {
        if (p.productType === 'BUNDLE') continue;
        const stockVal = Number(p.stock || 0);
        if (stockVal === 0) continue;

        const isPositive = stockVal > 0;
        const absQty = Math.abs(stockVal);
        const hppSnapshot = costMap.get(p.productId) ?? p.hpp ?? 0;

        baselineMovements.push({
          stockMovementId: uuidv4(),
          productId: p.productId,
          referenceId: 'reset_opening_balance',
          movementType: isPositive ? 'OPENING_BALANCE' : 'ADJUSTMENT_OUT',
          qty: absQty,
          unit: p.baseUnit || 'PCS',
          baseQty: absQty,
          segmentId: p.productType === 'FISH' ? 'IKAN' : p.productType === 'FRUIT' ? 'BUAH' : 'WARUNG',
          clientTimestamp: now,
          serverTimestamp: null,
          deviceId,
          userId,
          reason: 'Stok Awal (Dipertahankan saat Reset Sistem)',
          costSnapshot: hppSnapshot,
          createdAt: now,
          quantity: stockVal,
          type: isPositive ? 'IN' : 'OUT',
          referenceType: 'STOCK_ADJUSTMENT',
          timestamp: now
        });
      }

      if (baselineMovements.length > 0) {
        await db.stockMovements.bulkPut(baselineMovements);

        for (let i = 0; i < baselineMovements.length; i += BATCH_LIMIT) {
          const chunk = baselineMovements.slice(i, i + BATCH_LIMIT);
          const batch = writeBatch(firestoreDb);
          for (const mv of chunk) {
            const cleanMv = JSON.parse(JSON.stringify(mv));
            batch.set(doc(firestoreDb, 'stockMovements', mv.stockMovementId), cleanMv);
          }
          await batch.commit();
        }
      }

      // 4. Clear cached diagnostic/seeder localStorage entries
      PerformanceTracker.clearMetrics();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('last_auto_backup');
        localStorage.removeItem('riama_prep_orders_seeded_v1');
      }

      // 5. Clear syncQueue again so no residual ops survive, then log clean reset audit
      await db.syncQueue.clear();
      await AuditEngine.log({
        userId,
        role,
        deviceId,
        action: 'RESET_ALL_EXCEPT_INVENTORY_AND_PAYROLL',
        module: 'SYSTEM',
        after: {
          localDeleted,
          cloudDeleted,
          preservedProducts: preservedProductsList.length,
          preservedPayrolls: preservedPayrollsCount,
          rebaselinedStockMovements: baselineMovements.length
        }
      });

      return {
        success: true,
        count: localDeleted + cloudDeleted,
        localDeleted,
        cloudDeleted,
        preservedProducts: preservedProductsList.length,
        preservedPayrolls: preservedPayrollsCount,
        rebaselinedStockMovements: baselineMovements.length,
        message: `Reset selesai! ${localDeleted} data lokal & ${cloudDeleted} dokumen Cloud dihapus. ${preservedProductsList.length} Produk Inventory & ${preservedPayrollsCount} data Penggajian Karyawan tetap aman.`
      };
    } finally {
      SyncEngine.start();
    }
  }
}

