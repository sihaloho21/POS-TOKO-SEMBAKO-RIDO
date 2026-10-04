import Dexie, { type Table } from 'dexie';
import type { 
  User, 
  Product, 
  Bundle,
  Customer,
  Supplier,
  Transaction, 
  Receivable,
  ReceivablePayment,
  Purchase,
  FinanceEvent, 
  StockMovement, 
  AuditLog,
  BusinessConflict,
  Notification,
  CashierShift,
  DigitalService,
  SyncQueueItem 
} from './types';

export class LocalDatabase extends Dexie {
  users!: Table<User>;
  products!: Table<Product>;
  bundles!: Table<Bundle>;
  customers!: Table<Customer>;
  suppliers!: Table<Supplier>;
  transactions!: Table<Transaction>;
  receivables!: Table<Receivable>;
  receivablePayments!: Table<ReceivablePayment>;
  purchases!: Table<Purchase>;
  financeEvents!: Table<FinanceEvent>;
  stockMovements!: Table<StockMovement>;
  auditLogs!: Table<AuditLog>;
  conflicts!: Table<BusinessConflict>;
  notifications!: Table<Notification>;
  shifts!: Table<CashierShift>;
  digitalServices!: Table<DigitalService>;
  syncQueue!: Table<SyncQueueItem>;

  constructor() {
    super('HarapanJayaDB');
    this.version(3).stores({
      users: 'userId, role, status',
      products: 'productId, barcode, sku, categoryId, productType, status',
      bundles: 'bundleId, status',
      customers: 'customerId, name, phone, status',
      suppliers: 'supplierId, name, status',
      transactions: 'transactionId, receiptNumber, type, status, cashierId, deviceId, shiftId, clientTimestamp',
      receivables: 'receivableId, transactionId, customerId, status, dueDate',
      receivablePayments: 'paymentId, receivableId, timestamp',
      purchases: 'purchaseId, supplierId, invoiceNumber, status, timestamp',
      financeEvents: 'financeEventId, storageId, referenceId, referenceType, timestamp',
      stockMovements: 'stockMovementId, productId, type, reason, referenceId, timestamp',
      auditLogs: 'auditId, userId, action, module, referenceId, timestamp',
      conflicts: 'conflictId, type, entityId, status, timestamp',
      notifications: 'notificationId, severity, isRead, createdAt',
      shifts: 'shiftId, userId, deviceId, status',
      digitalServices: 'serviceId, transactionId, serviceType, status',
      syncQueue: '++queueId, entityType, entityId, status, createdAt'
    });
  }
}

export const db = new LocalDatabase();
