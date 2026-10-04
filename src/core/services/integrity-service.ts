import { db } from '../database';

export interface IntegrityReport {
  timestamp: string;
  status: 'OK' | 'ISSUES_FOUND';
  checks: {
    name: string;
    status: 'PASS' | 'FAIL';
    message: string;
  }[];
}

export class IntegrityService {
  static async runFullCheck(): Promise<IntegrityReport> {
    const checks: IntegrityReport['checks'] = [];
    const timestamp = new Date().toISOString();

    // 1. Stock Integrity Check
    try {
      const products = await db.products.toArray();
      let stockIssues = 0;
      for (const p of products) {
        const movements = await db.stockMovements.where('productId').equals(p.productId).toArray();
        const calculatedStock = movements.reduce((acc, m) => acc + m.quantity, 0);
        
        // Allow for some minor deviation if initial stock wasn't from a movement (though in this system it should be)
        if (Math.abs(calculatedStock - p.stock) > 0.001) {
          stockIssues++;
        }
      }
      checks.push({
        name: 'Stock Consistency',
        status: stockIssues === 0 ? 'PASS' : 'FAIL',
        message: stockIssues === 0 
          ? 'Semua stok produk konsisten dengan histori mutasi.' 
          : `Ditemukan ${stockIssues} produk dengan ketidaksesuaian histori stok.`
      });
    } catch (err) {
      checks.push({ name: 'Stock Consistency', status: 'FAIL', message: 'Gagal memproses pengecekan stok.' });
    }

    // 2. Finance Integrity Check
    try {
      const financeEvents = await db.financeEvents.toArray();
      const storageTotals: Record<string, number> = {
        'WARUNG': 0,
        'IKAN': 0,
        'UANG_DIGITAL': 0
      };

      for (const event of financeEvents) {
        if (event.direction === 'IN') {
          storageTotals[event.storageId] += event.amount;
        } else {
          storageTotals[event.storageId] -= event.amount;
        }
      }

      // In this app, we don't store "currentBalance" in a separate table yet, 
      // it's always derived from events. So it's inherently consistent with itself,
      // but we check if any storage has negative balance which might be an operational issue.
      const negativeStorages = Object.entries(storageTotals).filter(([_, bal]) => bal < 0);
      
      checks.push({
        name: 'Finance Health',
        status: negativeStorages.length === 0 ? 'PASS' : 'FAIL',
        message: negativeStorages.length === 0
          ? 'Semua saldo penyimpanan uang valid.'
          : `Peringatan: Saldo negatif terdeteksi pada ${negativeStorages.map(s => s[0]).join(', ')}.`
      });
    } catch (err) {
      checks.push({ name: 'Finance Health', status: 'FAIL', message: 'Gagal memproses pengecekan finansial.' });
    }

    // 3. Orphaned Transactions Check
    try {
      const transactions = await db.transactions.toArray();
      const syncQueue = await db.syncQueue.toArray();
      const unsyncedTx = transactions.filter(tx => 
        tx.status === 'COMPLETED' && !syncQueue.find(q => q.entityId === tx.transactionId)
      );

      checks.push({
        name: 'Sync Integrity',
        status: unsyncedTx.length === 0 ? 'PASS' : 'FAIL',
        message: unsyncedTx.length === 0
          ? 'Semua transaksi terdaftar di antrian sinkronisasi.'
          : `${unsyncedTx.length} transaksi tidak ditemukan di antrian sinkronisasi (Data Loss Risk).`
      });
    } catch (err) {
      checks.push({ name: 'Sync Integrity', status: 'FAIL', message: 'Gagal memproses pengecekan sinkronisasi.' });
    }

    return {
      timestamp,
      status: checks.every(c => c.status === 'PASS') ? 'OK' : 'ISSUES_FOUND',
      checks
    };
  }
}
