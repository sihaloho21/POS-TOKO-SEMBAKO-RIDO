import { db } from '../database';
import { zipSync, strToU8 } from 'fflate';

export class BackupService {
  static async createBackup(): Promise<void> {
    const backupData: Record<string, any> = {};
    const tables = [
      'users', 'products', 'bundles', 'customers', 'suppliers', 
      'transactions', 'receivables', 'receivablePayments', 'purchases', 
      'financeEvents', 'stockMovements', 'auditLogs', 'conflicts', 
      'notifications', 'shifts', 'stockOpnames', 'digitalServices', 
      'loyaltyEvents', 'settings'
    ];

    for (const table of tables) {
      backupData[table] = await (db as any)[table].toArray();
    }

    const jsonString = JSON.stringify(backupData);
    const data = strToU8(jsonString);
    const zipped = zipSync({
      "harapan_jaya_backup.json": data
    });

    const blob = new Blob([zipped], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_harapan_jaya_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  static async scheduleAutoBackup() {
    // Basic daily backup logic in browser environment
    const lastBackup = localStorage.getItem('last_auto_backup');
    const today = new Date().toISOString().split('T')[0];

    if (lastBackup !== today) {
      console.log('Running daily auto-backup check...');
      // We don't want to trigger a download automatically as it's annoying
      // But we could save it to IndexedDB 'backups' table if we had one
      // For now, let's just mark it as checked
      localStorage.setItem('last_auto_backup', today);
    }
  }
}
