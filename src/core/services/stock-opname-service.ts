import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { StockOpname, StockMovement, AuditLog } from '../types';
import { AuditEngine } from '../audit-engine';
import { StockService } from './stock-service';

export class StockOpnameService {
  static async startOpname(userId: string, deviceId: string): Promise<string> {
    const products = await db.products.toArray();
    const opnameId = uuidv4();
    const timestamp = new Date().toISOString();

    const opname: any = {
      opnameId,
      status: 'DRAFT',
      createdBy: userId,
      deviceId,
      items: products.map(p => ({
        productId: p.productId,
        nameSnapshot: p.name,
        expectedQty: p.stock,
        physicalQty: p.stock, // Default to expected, user will edit
      })),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await db.stockOpnames.add(opname);
    
    await db.syncQueue.add({
      entityType: 'stockOpnames',
      entityId: opnameId,
      action: 'CREATE',
      payload: opname,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    return opnameId;
  }

  static async finalizeOpname(opnameId: string, userId: string, deviceId: string): Promise<void> {
    const opname = await db.stockOpnames.get(opnameId);
    if (!opname || opname.status === 'COMPLETED') return;

    const timestamp = new Date().toISOString();

    for (const item of opname.items) {
      const diff = item.physicalQty - item.expectedQty;
      if (diff !== 0) {
        const product = await db.products.get(item.productId);
        const movementType = diff > 0 ? 'STOCK_OPNAME_IN' : 'STOCK_OPNAME_OUT';
        
        await StockService.recordMovement({
          productId: item.productId,
          movementType,
          qty: Math.abs(diff),
          unit: product?.baseUnit || 'PCS',
          baseQty: Math.abs(diff),
          referenceId: opnameId,
          segmentId: product?.productType === 'FISH' ? 'IKAN' : 'WARUNG',
          reason: `Hasil Stock Opname (${diff > 0 ? 'Surplus' : 'Defisit'} ${Math.abs(diff)})`,
          userId,
          deviceId,
          timestamp
        });
      }
    }

    await db.stockOpnames.update(opnameId, {
      status: 'COMPLETED',
      finalizedBy: userId,
      finalizedAt: timestamp,
      updatedAt: timestamp
    });

    await AuditEngine.log({
      userId,
      role: 'OWNER',
      deviceId,
      action: 'FINALIZE_OPNAME',
      module: 'INVENTORY',
      referenceId: opnameId
    });
  }
}
