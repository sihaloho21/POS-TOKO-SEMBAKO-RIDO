export type UserRole = 'OWNER' | 'MANAGER' | 'KASIR' | 'WAREHOUSE';

export interface User {
  userId: string;
  name: string;
  role: UserRole;
  pinHash: string; // 6 digit hashed
  status: 'ACTIVE' | 'INACTIVE';
  permissions?: string[]; // Granular permissions if needed
  createdAt: string;
  updatedAt: string;
}

export type ProductType = 'SEMBAKO' | 'FISH' | 'SIDE_PRODUCT' | 'DIGITAL' | 'BUNDLE' | 'PACKAGE';

export interface UnitConversion {
  fromUnit: string;
  toUnit: string;
  factor: number; 
}

export interface Product {
  productId: string;
  sku?: string;
  barcode: string;
  name: string;
  categoryId: string;
  productType: ProductType;
  baseUnit: string; 
  saleUnits: string[]; 
  conversionRules: UnitConversion[];
  normalPrice: number;
  hpp: number;
  resellerCashRule?: { discountPercent: number };
  resellerGajianRule?: { markupPercent: number };
  minimumStock: number;
  targetStock: number;
  priceAlertThreshold?: number; // In percent, e.g., 10 for 10%
  stock: number; // In base unit
  status: 'ACTIVE' | 'INACTIVE';
  photoUrl?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductCost {
  productId: string;
  hpp: number;
  updatedAt: string;
}

export interface BundleComponent {
  productId: string;
  qty: number;
  unit: string;
}

export interface Bundle {
  bundleId: string;
  name: string;
  components: BundleComponent[];
  price: number;
  cashPrice?: number;
  gajianPrice?: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Customer {
  customerId: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  isReseller: boolean;
  creditLimit: number;
  defaultDueDateDays: number;
  loyaltyPoints: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  supplierId: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface TransactionItem {
  productId: string;
  nameSnapshot: string;
  barcodeSnapshot: string;
  quantity: number; 
  unit: string;
  unitPrice: number;
  priceSource: 'NORMAL' | 'RESELLER' | 'CUSTOMER_SPECIFIC';
  discount: number;
  netPrice: number;
  subtotal: number;
  hppSnapshot?: number; 
}

export interface Transaction {
  transactionId: string;
  receiptNumber: string;
  type: 'SALE' | 'GAJIAN' | 'RETURN' | 'VOID' | 'DIGITAL_SERVICE';
  status: 'COMPLETED' | 'PENDING' | 'VOIDED' | 'CANCELLED' | 'HOLD' | 'approval_pending';
  customerId?: string;
  cashierId: string;
  deviceId: string;
  shiftId: string;
  items: TransactionItem[];
  subtotal: number;
  discount: number; 
  total: number;
  paymentMethodId: string;
  moneyStorageId: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
  loyaltyPointsEarned: number;
  clientTimestamp: string;
  serverTimestamp?: string;
  approvalStatus?: 'approval_pending' | 'APPROVED' | 'REJECTED';
  voidReason?: string;
  voidRequestedBy?: string;
  voidRequestedAt?: string;
  voidActionType?: 'VOID' | 'RETURN' | 'REFUND';
}

export interface Receivable {
  receivableId: string;
  transactionId: string;
  customerId: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string;
  status: 'OPEN' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOIDED';
  createdAt: string;
}

export interface ReceivablePayment {
  paymentId: string;
  receivableId: string;
  amount: number;
  paymentMethodId: string;
  moneyStorageId: string;
  userId: string;
  timestamp: string;
}

export interface Purchase {
  purchaseId: string;
  supplierId: string;
  invoiceNumber: string;
  status: 'DRAFT' | 'CONFIRMED' | 'PAID' | 'CANCELLED';
  items: PurchaseItem[];
  total: number;
  timestamp: string;
  createdAt: string;
}

export interface PurchaseItem {
  productId: string;
  quantity: number;
  unit: string;
  purchasePrice: number;
  discount: number;
  effectiveCost: number;
  total: number;
}

export interface FinanceEvent {
  financeEventId: string;
  amount: number;
  storageId: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL';
  direction: 'IN' | 'OUT';
  referenceId: string;
  referenceType: 'TRANSACTION' | 'PURCHASE' | 'RECEIVABLE_PAYMENT' | 'ADJUSTMENT' | 'EXPENSE' | 'CAPITAL' | 'PRIVE' | 'INTERNAL_TRANSFER' | 'SERVICE_REVENUE' | 'MDR_COST' | 'VOID' | 'RETURN';
  userId: string;
  deviceId: string;
  timestamp: string;
}

export interface StockMovement {
  stockMovementId: string;
  productId: string;
  quantity: number; 
  type: 'IN' | 'OUT' | 'ADJUST';
  reason: 'SALE' | 'PURCHASE' | 'RETURN' | 'VOID' | 'OPNAME' | 'FISH_DEAD' | 'ADJUSTMENT' | 'BUNDLE_BREAKDOWN';
  referenceId: string;
  referenceType: 'TRANSACTION' | 'PURCHASE' | 'OPNAME' | 'ADJUSTMENT' | 'STOCK_ADJUSTMENT';
  timestamp: string;
}

export interface AuditLog {
  auditId: string;
  timestamp: string;
  userId: string;
  role: string;
  deviceId: string;
  action: string;
  module: string;
  referenceId?: string;
  before?: any;
  after?: any;
  reason?: string;
}

export interface BusinessConflict {
  conflictId: string;
  type: 'STOCK_CONFLICT' | 'PRICE_CONFLICT' | 'STORE_STATUS_CONFLICT' | 'CONFIG_CONFLICT';
  entityType: string;
  entityId: string;
  deviceId: string;
  userId: string;
  timestamp: string;
  details: any;
  status: 'PENDING' | 'RESOLVED' | 'REJECTED';
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface Notification {
  notificationId: string;
  severity: 'URGENT' | 'WARNING' | 'INFO';
  referenceId?: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface StockOpnameItem {
  productId: string;
  nameSnapshot: string;
  expectedQty: number;
  physicalQty: number;
}

export interface StockOpname {
  opnameId: string;
  status: 'DRAFT' | 'COMPLETED';
  createdBy: string;
  deviceId: string;
  items: StockOpnameItem[];
  finalizedBy?: string;
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashierShift {
  shiftId: string;
  userId: string;
  deviceId: string;
  startTime: string;
  endTime?: string;
  startingCash: number;
  expectedCash?: number;
  actualCash?: number;
  totalTransactionCount?: number;
  totalSales?: number;
  startNotes?: string;
  endNotes?: string;
  notes?: string;
  status: 'OPEN' | 'CLOSED';
}

export interface SyncQueueItem {
  queueId?: number;
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  status: 'PENDING' | 'SYNCING' | 'FAILED' | 'SYNCED' | 'CONFLICT';
  retryCount: number;
  lastError?: string;
  nextRetryAt?: string;
  createdAt: string;
}

export interface DigitalService {
  serviceId: string;
  transactionId: string;
  serviceType: 'PULSA' | 'PAKET_DATA' | 'TOKEN_LISTRIK' | 'TOPUP' | 'TRANSFER' | 'TARIK_TUNAI';
  customerReference: string;
  principal: number;
  fee: number;
  total: number;
  providerReference?: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: 'CASH' | 'QRIS' | 'CARD' | 'TRANSFER';
  mdrPercent: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ReceiptSettings {
  id: string; // 'current'
  storeName: string;
  address: string;
  phone: string;
  logoUrl?: string;
  headerMessage?: string;
  footerMessage: string;
  showPoints: boolean;
  showSavings: boolean;
  paperWidth: '58mm' | '80mm';
}

export interface LoyaltyEvent {
  loyaltyEventId: string;
  customerId: string;
  type: 'EARN' | 'REDEEM' | 'REVERSAL';
  points: number;
  referenceId: string; // transactionId or redeemId
  referenceType: 'TRANSACTION' | 'REDEEM' | 'ADJUSTMENT';
  timestamp: string;
}
