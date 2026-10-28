import { db } from '@/core/database';
import type { PrepOrder, PrepOrderItem, PrepOrderStatus, PrepOrderPriority, PrepPaymentStatus } from '@/core/types';

export class PrepOrderService {
  /**
   * Generate next order number, e.g. SPK-20261028-001
   */
  static async generateOrderNumber(dateStr?: string): Promise<string> {
    const targetDate = dateStr || new Date().toISOString().split('T')[0];
    const prefix = `SPK-${targetDate.replace(/-/g, '')}`;
    
    try {
      const todayOrders = await db.prepOrders
        .where('scheduledDate')
        .equals(targetDate)
        .toArray();
      
      const nextSeq = (todayOrders.length + 1).toString().padStart(3, '0');
      return `${prefix}-${nextSeq}`;
    } catch {
      const rand = Math.floor(100 + Math.random() * 900);
      return `${prefix}-${rand}`;
    }
  }

  /**
   * Create a new preparation / pre-order task
   */
  static async createOrder(params: {
    scheduledDate: string;
    scheduledTime: string;
    customerName: string;
    customerPhone?: string;
    customerAddress?: string;
    priority?: PrepOrderPriority;
    items: Omit<PrepOrderItem, 'itemId'>[];
    paymentStatus?: PrepPaymentStatus;
    downPaymentAmount?: number;
    generalNotes?: string;
    createdBy: string;
  }): Promise<PrepOrder> {
    const now = new Date().toISOString();
    const orderId = `po-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const orderNumber = await this.generateOrderNumber(params.scheduledDate);

    const items: PrepOrderItem[] = params.items.map((item, idx) => ({
      ...item,
      itemId: `item-${orderId}-${idx + 1}`,
      weightKg: Number(item.weightKg) || 0,
      cleanScale: Boolean(item.cleanScale),
      cleanGills: Boolean(item.cleanGills),
      cleanGut: Boolean(item.cleanGut),
      cuttingStyle: item.cuttingStyle || 'UTUH',
      sizeSpec: item.sizeSpec || 'Standar',
      estimatedPrice: Number(item.estimatedPrice) || 0
    }));

    const totalWeightKg = items.reduce((sum, item) => sum + (Number(item.weightKg) || 0), 0);
    const totalEstimatedPrice = items.reduce((sum, item) => sum + (Number(item.estimatedPrice) || 0), 0);

    const newOrder: PrepOrder = {
      orderId,
      orderNumber,
      customerName: params.customerName.trim(),
      customerPhone: params.customerPhone?.trim(),
      customerAddress: params.customerAddress?.trim(),
      scheduledDate: params.scheduledDate,
      scheduledTime: params.scheduledTime || '09:00',
      priority: params.priority || 'NORMAL',
      status: 'PENDING',
      items,
      totalWeightKg,
      totalEstimatedPrice,
      paymentStatus: params.paymentStatus || 'UNPAID',
      downPaymentAmount: Number(params.downPaymentAmount) || 0,
      generalNotes: params.generalNotes?.trim(),
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now
    };

    await db.prepOrders.put(newOrder);

    // Queue for sync engine
    try {
      await db.syncQueue.put({
        entityType: 'TRANSACTION',
        entityId: orderId,
        payload: {
          type: 'PREP_ORDER',
          ...newOrder
        },
        action: 'CREATE',
        status: 'PENDING',
        retryCount: 0,
        createdAt: now
      });
    } catch (e) {
      console.warn('Sync queue error for prepOrder:', e);
    }

    return newOrder;
  }

  /**
   * Update the status of a preparation order
   */
  static async updateStatus(orderId: string, status: PrepOrderStatus, staffName?: string): Promise<void> {
    const existing = await db.prepOrders.get(orderId);
    if (!existing) return;

    const now = new Date().toISOString();
    const updates: Partial<PrepOrder> = {
      status,
      updatedAt: now
    };

    if (status === 'IN_PROGRESS' && !existing.startedAt) {
      updates.startedAt = now;
      if (staffName) updates.assignedStaffName = staffName;
    } else if (status === 'READY') {
      updates.readyAt = now;
    } else if (status === 'COMPLETED') {
      updates.completedAt = now;
      updates.paymentStatus = 'PAID';
    }

    await db.prepOrders.update(orderId, updates);
  }

  /**
   * Update order details
   */
  static async updateOrder(orderId: string, updates: Partial<PrepOrder>): Promise<void> {
    const existing = await db.prepOrders.get(orderId);
    if (!existing) return;

    const totalWeightKg = updates.items 
      ? updates.items.reduce((sum, item) => sum + (Number(item.weightKg) || 0), 0)
      : existing.totalWeightKg;

    await db.prepOrders.update(orderId, {
      ...updates,
      totalWeightKg,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Delete an order
   */
  static async deleteOrder(orderId: string): Promise<void> {
    await db.prepOrders.delete(orderId);
  }

  /**
   * Calculate daily summary metrics
   */
  static async getDailySummary(dateStr: string): Promise<{
    totalOrders: number;
    totalKg: number;
    pendingCount: number;
    inProgressCount: number;
    readyCount: number;
    completedCount: number;
    fishBreakdown: Record<string, number>;
  }> {
    const orders = await db.prepOrders.where('scheduledDate').equals(dateStr).toArray();
    
    let totalKg = 0;
    let pendingCount = 0;
    let inProgressCount = 0;
    let readyCount = 0;
    let completedCount = 0;
    const fishBreakdown: Record<string, number> = {};

    orders.forEach(order => {
      if (order.status !== 'CANCELLED') {
        totalKg += order.totalWeightKg;
      }
      if (order.status === 'PENDING') pendingCount++;
      else if (order.status === 'IN_PROGRESS') inProgressCount++;
      else if (order.status === 'READY') readyCount++;
      else if (order.status === 'COMPLETED') completedCount++;

      order.items?.forEach(item => {
        const fishName = item.productName || 'Ikan Lain';
        fishBreakdown[fishName] = (fishBreakdown[fishName] || 0) + (Number(item.weightKg) || 0);
      });
    });

    return {
      totalOrders: orders.filter(o => o.status !== 'CANCELLED').length,
      totalKg,
      pendingCount,
      inProgressCount,
      readyCount,
      completedCount,
      fishBreakdown
    };
  }
}
