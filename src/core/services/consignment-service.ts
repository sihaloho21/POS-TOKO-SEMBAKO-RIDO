import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { cloudSetDoc, cloudUpdateDoc, cloudDeleteDoc } from '../firestore-realtime';
import type { 
  ConsignmentItem, 
  ConsignmentArrival, 
  ConsignmentSettlement 
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

    // cloudSetDoc mirrors directly to local Dexie and queues to Cloud Firestore
    await cloudSetDoc('consignmentItems', item.id, item);
    
    await AuditEngine.log({
      userId: params.userId,
      role: 'OWNER',
      deviceId: params.deviceId,
      action: 'CREATE_CONSIGNMENT_ITEM',
      module: 'CONSIGNMENT',
      referenceId: item.id,
      after: item
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

    await cloudSetDoc('consignmentArrivals', arrival.id, arrival);
    await cloudUpdateDoc('consignmentItems', params.itemId, updatedItem);

    await AuditEngine.log({
      userId: params.userId,
      role: 'OWNER',
      deviceId: params.deviceId,
      action: 'RECORD_CONSIGNMENT_ARRIVAL',
      module: 'CONSIGNMENT',
      referenceId: arrival.id,
      after: arrival
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

    const updatedItem: ConsignmentItem = {
      ...item,
      currentStock: params.newStock,
      totalSold: item.totalSold + soldQty,
      lastSettlementAt: now,
      updatedAt: now
    };

    await cloudSetDoc('consignmentSettlements', settlement.id, settlement);
    await cloudUpdateDoc('consignmentItems', params.itemId, updatedItem);

    await AuditEngine.log({
      userId: params.userId,
      role: 'OWNER',
      deviceId: params.deviceId,
      action: 'PROCESS_CONSIGNMENT_SETTLEMENT',
      module: 'CONSIGNMENT',
      referenceId: settlement.id,
      after: settlement
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

    await cloudUpdateDoc('consignmentItems', params.id, updatedItem);
    
    await AuditEngine.log({
      userId: params.userId,
      role: 'OWNER',
      deviceId: params.deviceId,
      action: 'UPDATE_CONSIGNMENT_ITEM',
      module: 'CONSIGNMENT',
      referenceId: params.id,
      after: updatedItem
    });
  }

  static async deleteItem(id: string, userId: string, deviceId: string, role?: string): Promise<void> {
    if (role && role !== 'OWNER') {
      throw new Error('Akses Ditolak: Hanya Owner yang dapat menghapus barang titipan konsinyasi.');
    }
    console.log('[ConsignmentService] deleteItem called with ID:', id);
    try {
      await cloudDeleteDoc('consignmentItems', id);
      
      await AuditEngine.log({
        userId,
        role: role || 'OWNER',
        deviceId,
        action: 'DELETE_CONSIGNMENT_ITEM',
        module: 'CONSIGNMENT',
        referenceId: id
      });
    } catch (err) {
      console.error('[ConsignmentService] deleteItem error:', err);
      throw err;
    }
  }
}
