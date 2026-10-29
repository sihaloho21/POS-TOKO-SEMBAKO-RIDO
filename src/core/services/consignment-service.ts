import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { 
  ConsignmentItem, 
  ConsignmentArrival, 
  ConsignmentSettlement,
  SyncQueueItem 
} from '../types';
import { FinanceService } from './finance-service';
import { AuditEngine } from '../audit-engine';

export class ConsignmentService {
  static async getItems(): Promise<ConsignmentItem[]> {
    return db.consignmentItems.toArray();
  }

  static async addItem(params: {
    name: string;
    supplierId: string;
    costPrice: number;
    salePrice: number;
    initialStock?: number;
    userId: string;
    deviceId: string;
  }): Promise<ConsignmentItem> {
    const now = new Date().toISOString();
    const item: ConsignmentItem = {
      id: uuidv4(),
      name: params.name,
      supplierId: params.supplierId,
      costPrice: params.costPrice,
      salePrice: params.salePrice,
      currentStock: params.initialStock || 0,
      totalSold: 0,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    };

    await db.transaction('rw', [db.consignmentItems, db.syncQueue, db.auditLogs], async () => {
      await db.consignmentItems.add(item);
      await this.addToQueue('consignmentItems', item.id, 'CREATE', item);
      
      await AuditEngine.log({
        userId: params.userId,
        role: 'OWNER',
        deviceId: params.deviceId,
        action: 'CREATE_CONSIGNMENT_ITEM',
        module: 'CONSIGNMENT',
        referenceId: item.id,
        after: item
      });
    });

    return item;
  }

  static async recordArrival(params: {
    itemId: string;
    qty: number;
    userId: string;
    deviceId: string;
  }): Promise<ConsignmentArrival> {
    const item = await db.consignmentItems.get(params.itemId);
    if (!item) throw new Error('Barang titipan tidak ditemukan');

    const arrival: ConsignmentArrival = {
      id: uuidv4(),
      itemId: params.itemId,
      qty: params.qty,
      timestamp: new Date().toISOString()
    };

    const updatedItem = {
      ...item,
      currentStock: item.currentStock + params.qty,
      updatedAt: new Date().toISOString()
    };

    await db.transaction('rw', [db.consignmentItems, db.consignmentArrivals, db.syncQueue, db.auditLogs], async () => {
      await db.consignmentArrivals.add(arrival);
      await db.consignmentItems.update(params.itemId, updatedItem);
      
      await this.addToQueue('consignmentArrivals', arrival.id, 'CREATE', arrival);
      await this.addToQueue('consignmentItems', item.id, 'UPDATE', updatedItem);

      await AuditEngine.log({
        userId: params.userId,
        role: 'OWNER',
        deviceId: params.deviceId,
        action: 'RECORD_CONSIGNMENT_ARRIVAL',
        module: 'CONSIGNMENT',
        referenceId: arrival.id,
        after: arrival
      });
    });

    return arrival;
  }

  static async processSettlement(params: {
    itemId: string;
    remainingStock: number;
    newStock: number;
    userId: string;
    deviceId: string;
  }): Promise<ConsignmentSettlement> {
    const item = await db.consignmentItems.get(params.itemId);
    if (!item) throw new Error('Barang titipan tidak ditemukan');

    const previousStock = item.currentStock;
    if (params.remainingStock > previousStock) {
      throw new Error('Stok sisa tidak boleh lebih besar dari stok saat ini');
    }

    const soldQty = previousStock - params.remainingStock;
    const totalPayment = soldQty * item.costPrice;
    const totalProfit = soldQty * (item.salePrice - item.costPrice);

    if (totalPayment < 0) throw new Error('Perhitungan pembayaran tidak valid');

    const now = new Date().toISOString();
    
    // Create Finance Event
    let financeEventId = '';
    if (totalPayment > 0) {
      const event = await FinanceService.recordLedgerEntry({
        amount: totalPayment,
        storageId: 'WARUNG',
        direction: 'OUT',
        referenceId: params.itemId,
        referenceType: 'EXPENSE',
        description: `Setoran Barang Titipan: ${item.name} (${soldQty} terjual)`,
        userId: params.userId,
        deviceId: params.deviceId,
        timestamp: now
      });
      financeEventId = event.financeEventId;
    }

    const settlement: ConsignmentSettlement = {
      id: uuidv4(),
      itemId: params.itemId,
      previousStock: previousStock,
      addedStock: params.newStock,
      remainingStock: params.remainingStock,
      soldQty: soldQty,
      totalPayment: totalPayment,
      totalProfit: totalProfit,
      financeEventId: financeEventId,
      timestamp: now
    };

    // Reset old cycle (remainingStock is implicitly returned/ignored)
    // and start new cycle with newStock
    const updatedItem: ConsignmentItem = {
      ...item,
      currentStock: params.newStock,
      totalSold: item.totalSold + soldQty,
      lastSettlementAt: now,
      updatedAt: now
    };

    await db.transaction('rw', [db.consignmentItems, db.consignmentSettlements, db.syncQueue, db.auditLogs], async () => {
      await db.consignmentSettlements.add(settlement);
      await db.consignmentItems.update(params.itemId, updatedItem);
      
      await this.addToQueue('consignmentSettlements', settlement.id, 'CREATE', settlement);
      await this.addToQueue('consignmentItems', item.id, 'UPDATE', updatedItem);

      await AuditEngine.log({
        userId: params.userId,
        role: 'OWNER',
        deviceId: params.deviceId,
        action: 'PROCESS_CONSIGNMENT_SETTLEMENT',
        module: 'CONSIGNMENT',
        referenceId: settlement.id,
        after: settlement
      });
    });

    return settlement;
  }

  static async updateItem(params: {
    id: string;
    name: string;
    supplierId: string;
    costPrice: number;
    salePrice: number;
    userId: string;
    deviceId: string;
  }): Promise<void> {
    const item = await db.consignmentItems.get(params.id);
    if (!item) throw new Error('Item tidak ditemukan');

    const updatedItem = {
      ...item,
      name: params.name,
      supplierId: params.supplierId,
      costPrice: params.costPrice,
      salePrice: params.salePrice,
      updatedAt: new Date().toISOString()
    };

    await db.transaction('rw', [db.consignmentItems, db.syncQueue, db.auditLogs], async () => {
      await db.consignmentItems.update(params.id, updatedItem);
      await this.addToQueue('consignmentItems', params.id, 'UPDATE', updatedItem);
      
      await AuditEngine.log({
        userId: params.userId,
        role: 'OWNER',
        deviceId: params.deviceId,
        action: 'UPDATE_CONSIGNMENT_ITEM',
        module: 'CONSIGNMENT',
        referenceId: params.id,
        after: updatedItem
      });
    });
  }

  static async deleteItem(id: string, userId: string, deviceId: string): Promise<void> {
    console.log('[ConsignmentService] deleteItem called with ID:', id);
    try {
      await db.transaction('rw', [db.consignmentItems, db.syncQueue, db.auditLogs], async () => {
        await db.consignmentItems.delete(id);
        console.log('[ConsignmentService] Deleted from local DB');
        
        await ConsignmentService.addToQueue('consignmentItems', id, 'DELETE', null);
        console.log('[ConsignmentService] Added to sync queue');
        
        await AuditEngine.log({
          userId,
          role: 'OWNER',
          deviceId,
          action: 'DELETE_CONSIGNMENT_ITEM',
          module: 'CONSIGNMENT',
          referenceId: id
        });
        console.log('[ConsignmentService] Audit log created');
      });
      console.log('[ConsignmentService] Transaction committed');
    } catch (error) {
      console.error('[ConsignmentService] Transaction failed:', error);
      throw error;
    }
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
