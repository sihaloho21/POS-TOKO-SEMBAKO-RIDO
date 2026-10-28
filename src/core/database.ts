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
  StockOpname,
  ProductCost,
  PaymentMethod,
  DigitalService,
  LoyaltyEvent,
  PayLaterBill,
  PayLaterInstallment,
  SyncQueueItem,
  PayrollRecord,
  BonusCategory,
  PrepOrder
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
  stockOpnames!: Table<StockOpname>;
  productCosts!: Table<ProductCost>;
  paymentMethods!: Table<PaymentMethod>;
  digitalServices!: Table<DigitalService>;
  loyaltyEvents!: Table<LoyaltyEvent>;
  payLaterBills!: Table<PayLaterBill>;
  payLaterInstallments!: Table<PayLaterInstallment>;
  payrolls!: Table<PayrollRecord>;
  bonusCategories!: Table<BonusCategory>;
  prepOrders!: Table<PrepOrder>;
  settings!: Table<any>;
  syncQueue!: Table<SyncQueueItem>;

  constructor() {
    super('HarapanJayaDB');
    this.version(7).stores({
      users: 'userId, role, status',
      products: 'productId, barcode, sku, categoryId, productType, status',
      productCosts: 'productId',
      paymentMethods: 'id, type, status',
      bundles: 'bundleId, status',
      customers: 'customerId, name, phone, status',
      suppliers: 'supplierId, name, status',
      transactions: 'transactionId, receiptNumber, type, status, cashierId, deviceId, shiftId, clientTimestamp, originalTransactionId, customerId, receivableId',
      receivables: 'receivableId, transactionId, customerId, status, dueDate',
      receivablePayments: 'paymentId, receivableId, timestamp',
      purchases: 'purchaseId, supplierId, invoiceNumber, status, timestamp',
      financeEvents: 'financeEventId, storageId, referenceId, referenceType, timestamp',
      stockMovements: 'stockMovementId, productId, type, reason, referenceId, timestamp',
      auditLogs: 'auditId, userId, action, module, referenceId, timestamp',
      conflicts: 'conflictId, type, entityId, status, timestamp',
      notifications: 'notificationId, severity, isRead, createdAt',
      shifts: 'shiftId, userId, deviceId, status, startTime',
      stockOpnames: 'opnameId, status, createdAt',
      digitalServices: 'serviceId, transactionId, serviceType, status',
      loyaltyEvents: 'loyaltyEventId, customerId, referenceId, timestamp',
      payLaterBills: 'billId, purchaseId, supplierId, status',
      payLaterInstallments: 'installmentId, billId, dueDate, status',
      settings: 'id',
      syncQueue: '++queueId, entityType, entityId, status, createdAt'
    });

    this.version(8).stores({
      stockMovements: 'stockMovementId, productId, movementType, referenceId, clientTimestamp, timestamp, segmentId'
    });

    this.version(9).stores({
      receivables: 'receivableId, transactionId, customerId, status, dueDate, createdAt'
    });

    this.version(10).stores({
      transactions: 'transactionId, receiptNumber, type, status, cashierId, deviceId, shiftId, clientTimestamp, originalTransactionId, customerId, receivableId'
    });

    this.version(11).stores({
      payrolls: 'id, employeeId, periodYear, periodMonth, paymentDate, isBackdated, createdAt',
      bonusCategories: 'id, name, isActive, isSystem'
    });

    this.version(12).stores({
      prepOrders: 'orderId, orderNumber, customerId, scheduledDate, status, priority, paymentStatus, createdAt'
    });
  }
}

export const db = new LocalDatabase();
