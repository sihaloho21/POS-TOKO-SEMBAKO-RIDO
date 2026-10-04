import { v4 as uuidv4 } from 'uuid';
import { db } from './database';
import type { AuditLog, User } from './types';

export class AuditEngine {
  static async log(params: {
    userId: string;
    role: string;
    deviceId: string;
    action: string;
    module: string;
    referenceId?: string;
    before?: any;
    after?: any;
    reason?: string;
  }) {
    const auditId = uuidv4();
    const timestamp = new Date().toISOString();

    const entry: AuditLog = {
      auditId,
      timestamp,
      ...params
    };

    // 1. Save to Local DB (Append Only)
    await db.auditLogs.add(entry);

    // 2. Queue for Sync
    await db.syncQueue.add({
      entityType: 'auditLogs',
      entityId: auditId,
      action: 'CREATE',
      payload: entry,
      status: 'PENDING',
      retryCount: 0,
      createdAt: timestamp
    });

    console.log(`[AUDIT] ${params.module} - ${params.action} by ${params.userId}`);
  }
}
