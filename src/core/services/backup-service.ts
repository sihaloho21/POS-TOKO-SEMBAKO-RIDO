import { db } from '../database';
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';

export class BackupService {
  static async createBackup(): Promise<void> {
    const backupData: Record<string, any> = {};
    const tables = [
      'users', 'products', 'bundles', 'customers', 'suppliers', 
      'transactions', 'receivables', 'receivablePayments', 'purchases', 
      'financeEvents', 'stockMovements', 'auditLogs', 'conflicts', 
      'notifications', 'shifts', 'stockOpnames', 'digitalServices', 
      'loyaltyEvents', 'settings', 'productCosts', 'paymentMethods'
    ];

    for (const table of tables) {
      backupData[table] = await (db as any)[table].toArray();
    }

    const jsonString = JSON.stringify(backupData);
    const data = strToU8(jsonString);
    const zipped = zipSync({
      "toko_sembako_riama_backup.json": data
    });

    const blob = new Blob([zipped], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_toko_sembako_riama_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  static async restoreBackup(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = new Uint8Array(e.target?.result as ArrayBuffer);
          const unzipped = unzipSync(buffer);
          const jsonFile = unzipped['toko_sembako_riama_backup.json'] || unzipped['harapan_jaya_backup.json'];
          
          if (!jsonFile) {
            throw new Error('File backup tidak valid: data JSON tidak ditemukan di dalam ZIP.');
          }

          const jsonString = strFromU8(jsonFile);
          const data = JSON.parse(jsonString);

          // Clear and Restore tables
          for (const [tableName, rows] of Object.entries(data)) {
            if ((db as any)[tableName]) {
              await (db as any)[tableName].clear();
              await (db as any)[tableName].bulkAdd(rows);
            }
          }

          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsArrayBuffer(file);
    });
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
