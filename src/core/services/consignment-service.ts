import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { cloudSetDoc, cloudUpdateDoc, cloudDeleteDoc } from '../firestore-realtime';
import type { 
  ConsignmentItem, 
  ConsignmentArrival, 
  ConsignmentSettlement,
  MoneyStorageId
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
    barcode?: string;
    description?: string;
    userId: string;
    deviceId: string;
    role?: string;
  }): Promise<ConsignmentItem> {
    const role = params.role || 'OWNER';
    if (role !== 'OWNER') {
      throw new Error('Akses Ditolak: Hanya Owner yang dapat menambah barang titipan.');
    }

    const trimmedName = params.name ? params.name.trim() : '';
    if (!trimmedName) {
      throw new Error('Nama barang titipan tidak boleh kosong');
    }
    if (!params.supplierId) {
      throw new Error('Pilih supplier/sales barang titipan');
    }
    if (isNaN(params.costPrice) || params.costPrice < 0) {
      throw new Error('Harga modal tidak valid (minimal Rp 0)');
    }
    if (isNaN(params.salePrice) || params.salePrice <= 0) {
      throw new Error('Harga ecer/jual tidak valid (harus lebih dari Rp 0)');
    }
    if (params.costPrice > params.salePrice) {
      throw new Error('Harga modal tidak boleh melebihi harga jual toko');
    }

    const initialStock = Math.max(0, Number(params.initialStock) || 0);
    const now = new Date().toISOString();

    const item: ConsignmentItem = {
      id: uuidv4(),
      name: trimmedName,
      supplierId: params.supplierId,
      costPrice: Number(params.costPrice),
      salePrice: Number(params.salePrice),
      currentStock: initialStock,
      totalSold: 0,
      status: 'ACTIVE',
      barcode: params.barcode ? params.barcode.trim() : undefined,
      description: params.description ? params.description.trim() : undefined,
      createdAt: now,
      updatedAt: now
    };

    // cloudSetDoc mirrors directly to local Dexie and queues to Cloud Firestore
    await cloudSetDoc('consignmentItems', item.id, item);
    
    await AuditEngine.log({
      userId: params.userId,
      role: role,
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
    notes?: string;
    userId: string;
    deviceId: string;
    role?: string;
  }): Promise<ConsignmentArrival> {
    const role = params.role || 'OWNER';
    if (role !== 'OWNER') {
      throw new Error('Akses Ditolak: Hanya Owner yang dapat mencatat stok datang titipan.');
    }

    const item = await db.consignmentItems.get(params.itemId);
    if (!item) throw new Error('Barang titipan tidak ditemukan');

    const qty = Number(params.qty);
    if (isNaN(qty) || qty <= 0) {
      throw new Error('Jumlah stok masuk harus lebih besar dari 0');
    }

    const now = new Date().toISOString();
    const arrival: ConsignmentArrival = {
      id: uuidv4(),
      itemId: params.itemId,
      qty: qty,
      notes: params.notes ? params.notes.trim() : undefined,
      userId: params.userId,
      timestamp: now
    };

    const updatedItem: ConsignmentItem = {
      ...item,
      currentStock: item.currentStock + qty,
      updatedAt: now
    };

    await cloudSetDoc('consignmentArrivals', arrival.id, arrival);
    await cloudUpdateDoc('consignmentItems', params.itemId, updatedItem);

    await AuditEngine.log({
      userId: params.userId,
      role: role,
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
    keepRemaining?: boolean; // Default true: physical unsold stock stays in shop
    storageId?: MoneyStorageId; // Default 'WARUNG'
    notes?: string;
    userId: string;
    deviceId: string;
    role?: string;
  }): Promise<ConsignmentSettlement> {
    const role = params.role || 'OWNER';
    if (role !== 'OWNER') {
      throw new Error('Akses Ditolak: Hanya Owner yang dapat memproses setoran konsinyasi.');
    }

    const item = await db.consignmentItems.get(params.itemId);
    if (!item) throw new Error('Barang titipan tidak ditemukan');

    const remainingStock = Math.max(0, Number(params.remainingStock) || 0);
    const newStock = Math.max(0, Number(params.newStock) || 0);
    const previousStock = item.currentStock;

    if (remainingStock > previousStock) {
      throw new Error(`Sisa stok (${remainingStock}) tidak boleh melebihi stok aktif saat ini (${previousStock})`);
    }

    const soldQty = previousStock - remainingStock;
    const totalPayment = soldQty * item.costPrice;
    const totalProfit = soldQty * (item.salePrice - item.costPrice);

    if (totalPayment < 0) {
      throw new Error('Perhitungan pembayaran tidak valid');
    }

    const selectedStorage: MoneyStorageId = params.storageId || 'WARUNG';
    const keepRemaining = params.keepRemaining !== false; // Default: true
    // Next active stock = (remaining unsold goods kept) + (new batch brought today)
    const nextStock = (keepRemaining ? remainingStock : 0) + newStock;

    const now = new Date().toISOString();
    
    // Create Finance Event: Expense from the chosen money storage
    let financeEventId = '';
    if (totalPayment > 0) {
      const storageLabelMap: Record<MoneyStorageId, string> = {
        WARUNG: 'Kas Warung',
        IKAN: 'Kas Ikan',
        BUAH: 'Kas Buah',
        UANG_DIGITAL: 'Kas Digital'
      };
      const storageLabel = storageLabelMap[selectedStorage] || selectedStorage;

      const event = await FinanceService.recordLedgerEntry({
        amount: totalPayment,
        storageId: selectedStorage,
        direction: 'OUT',
        referenceId: params.itemId,
        referenceType: 'EXPENSE',
        description: `Setoran Barang Titipan: ${item.name} (${soldQty} terjual @ Rp${item.costPrice.toLocaleString()}) [${storageLabel}]`,
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
      addedStock: newStock,
      remainingStock: remainingStock,
      soldQty: soldQty,
      totalPayment: totalPayment,
      totalProfit: totalProfit,
      financeEventId: financeEventId,
      storageId: selectedStorage,
      keepRemaining: keepRemaining,
      notes: params.notes ? params.notes.trim() : undefined,
      userId: params.userId,
      timestamp: now
    };

    const updatedItem: ConsignmentItem = {
      ...item,
      currentStock: nextStock,
      totalSold: (item.totalSold || 0) + soldQty,
      lastSettlementAt: now,
      updatedAt: now
    };

    await cloudSetDoc('consignmentSettlements', settlement.id, settlement);
    await cloudUpdateDoc('consignmentItems', params.itemId, updatedItem);

    await AuditEngine.log({
      userId: params.userId,
      role: role,
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
    status?: 'ACTIVE' | 'INACTIVE';
    barcode?: string;
    description?: string;
    userId: string;
    deviceId: string;
    role?: string;
  }): Promise<void> {
    const role = params.role || 'OWNER';
    if (role !== 'OWNER') {
      throw new Error('Akses Ditolak: Hanya Owner yang dapat mengedit barang titipan.');
    }

    const item = await db.consignmentItems.get(params.id);
    if (!item) throw new Error('Item titipan tidak ditemukan');

    const trimmedName = params.name ? params.name.trim() : '';
    if (!trimmedName) {
      throw new Error('Nama barang titipan tidak boleh kosong');
    }
    if (!params.supplierId) {
      throw new Error('Pilih supplier/sales barang titipan');
    }
    if (isNaN(params.costPrice) || params.costPrice < 0) {
      throw new Error('Harga modal tidak valid');
    }
    if (isNaN(params.salePrice) || params.salePrice <= 0) {
      throw new Error('Harga jual tidak valid');
    }
    if (params.costPrice > params.salePrice) {
      throw new Error('Harga modal tidak boleh melebihi harga jual');
    }

    const updatedItem: ConsignmentItem = {
      ...item,
      name: trimmedName,
      supplierId: params.supplierId,
      costPrice: Number(params.costPrice),
      salePrice: Number(params.salePrice),
      status: params.status || item.status,
      barcode: params.barcode !== undefined ? (params.barcode.trim() || undefined) : item.barcode,
      description: params.description !== undefined ? (params.description.trim() || undefined) : item.description,
      updatedAt: new Date().toISOString()
    };

    await cloudUpdateDoc('consignmentItems', params.id, updatedItem);
    
    await AuditEngine.log({
      userId: params.userId,
      role: role,
      deviceId: params.deviceId,
      action: 'UPDATE_CONSIGNMENT_ITEM',
      module: 'CONSIGNMENT',
      referenceId: params.id,
      after: updatedItem
    });
  }

  static async deleteItem(id: string, userId: string, deviceId: string, role?: string): Promise<void> {
    const actualRole = role || 'OWNER';
    if (actualRole !== 'OWNER') {
      throw new Error('Akses Ditolak: Hanya Owner yang dapat menghapus barang titipan konsinyasi.');
    }
    
    const existing = await db.consignmentItems.get(id);
    if (!existing) {
      throw new Error('Barang titipan tidak ditemukan');
    }

    try {
      // Also delete associated settlement and arrival records for clean state
      const settlements = await db.consignmentSettlements.where('itemId').equals(id).toArray();
      for (const s of settlements) {
        await cloudDeleteDoc('consignmentSettlements', s.id);
      }

      const arrivals = await db.consignmentArrivals.where('itemId').equals(id).toArray();
      for (const a of arrivals) {
        await cloudDeleteDoc('consignmentArrivals', a.id);
      }

      await cloudDeleteDoc('consignmentItems', id);
      
      await AuditEngine.log({
        userId,
        role: actualRole,
        deviceId,
        action: 'DELETE_CONSIGNMENT_ITEM',
        module: 'CONSIGNMENT',
        referenceId: id,
        before: existing
      });
    } catch (err) {
      console.error('[ConsignmentService] deleteItem error:', err);
      throw err;
    }
  }

  /**
   * Delete an individual settlement record (e.g. test transaction or mistake)
   */
  static async deleteSettlement(params: {
    settlementId: string;
    rollbackFinance?: boolean;
    userId: string;
    deviceId: string;
    role?: string;
  }): Promise<void> {
    const role = params.role || 'OWNER';
    if (role !== 'OWNER') {
      throw new Error('Akses Ditolak: Hanya Owner yang dapat menghapus data setoran konsinyasi.');
    }

    const settlement = await db.consignmentSettlements.get(params.settlementId);
    if (!settlement) {
      throw new Error('Data setoran tidak ditemukan');
    }

    // Rollback finance entry if requested and exists
    if (params.rollbackFinance && settlement.financeEventId && settlement.totalPayment > 0) {
      const storageId: MoneyStorageId = (settlement.storageId as MoneyStorageId) || 'WARUNG';
      await FinanceService.recordLedgerEntry({
        amount: settlement.totalPayment,
        storageId: storageId,
        direction: 'IN', // Refund back to vault
        referenceId: settlement.id,
        referenceType: 'ADJUSTMENT',
        description: `Koreksi/Pembatalan Setoran Titipan: ${settlement.id.slice(0, 8)} (+Rp${settlement.totalPayment.toLocaleString()})`,
        userId: params.userId,
        deviceId: params.deviceId,
        timestamp: new Date().toISOString()
      });
    }

    // Decrement totalSold on the item if item exists
    const item = await db.consignmentItems.get(settlement.itemId);
    if (item) {
      const updatedSold = Math.max(0, (item.totalSold || 0) - settlement.soldQty);
      await cloudUpdateDoc('consignmentItems', item.id, {
        ...item,
        totalSold: updatedSold,
        updatedAt: new Date().toISOString()
      });
    }

    await cloudDeleteDoc('consignmentSettlements', settlement.id);

    await AuditEngine.log({
      userId: params.userId,
      role: role,
      deviceId: params.deviceId,
      action: 'DELETE_CONSIGNMENT_SETTLEMENT',
      module: 'CONSIGNMENT',
      referenceId: settlement.id,
      before: settlement
    });
  }

  /**
   * Reset all consignment trial/history data (Settlements & Arrivals), zeroing totalSold.
   * Exclusively for Store Owner before official launch.
   */
  static async resetConsignmentHistory(params: {
    userId: string;
    deviceId: string;
    role?: string;
  }): Promise<{ settlementsDeleted: number; arrivalsDeleted: number }> {
    const role = params.role || 'OWNER';
    if (role !== 'OWNER') {
      throw new Error('Akses Ditolak: Hanya Owner yang dapat mereset data histori konsinyasi.');
    }

    const settlements = await db.consignmentSettlements.toArray();
    for (const s of settlements) {
      await cloudDeleteDoc('consignmentSettlements', s.id);
    }

    const arrivals = await db.consignmentArrivals.toArray();
    for (const a of arrivals) {
      await cloudDeleteDoc('consignmentArrivals', a.id);
    }

    // Reset totalSold to 0 on all items
    const allItems = await db.consignmentItems.toArray();
    for (const item of allItems) {
      await cloudUpdateDoc('consignmentItems', item.id, {
        ...item,
        totalSold: 0,
        lastSettlementAt: undefined,
        updatedAt: new Date().toISOString()
      });
    }

    await AuditEngine.log({
      userId: params.userId,
      role: role,
      deviceId: params.deviceId,
      action: 'RESET_CONSIGNMENT_HISTORY',
      module: 'CONSIGNMENT',
      referenceId: 'ALL',
      after: {
        settlementsDeleted: settlements.length,
        arrivalsDeleted: arrivals.length,
        itemsReset: allItems.length
      }
    });

    return {
      settlementsDeleted: settlements.length,
      arrivalsDeleted: arrivals.length
    };
  }
}
