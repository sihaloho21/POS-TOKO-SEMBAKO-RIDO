import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { StockOpname, StockMovement, AuditLog } from '../types';
import { AuditEngine } from '../audit-engine';

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
        // Create Adjustment Movement
        const movement: StockMovement = {
          stockMovementId: uuidv4(),
          productId: item.productId,
          quantity: diff,
          type: diff > 0 ? 'IN' : 'OUT',
          reason: 'OPNAME',
          referenceId: opnameId,
          referenceType: 'OPNAME',
          timestamp
        };
        await db.stockMovements.add(movement);

        // Update Product Stock
        const product = await db.products.get(item.productId);
        if (product) {
          await db.products.update(item.productId, {
            stock: product.stock + diff,
            updatedAt: timestamp
          });
        }

        await db.syncQueue.add({
          entityType: 'stockMovements',
          entityId: movement.stockMovementId,
          action: 'CREATE',
          payload: movement,
          status: 'PENDING',
          retryCount: 0,
          createdAt: timestamp
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
