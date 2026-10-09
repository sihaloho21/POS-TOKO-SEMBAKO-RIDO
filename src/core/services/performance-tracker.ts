import { v4 as uuidv4 } from 'uuid';
import { db as localDb } from '../database';
import { db as firestoreDb, auth } from '../../firebase/config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export interface TransactionPerformanceMetric {
  id: string;
  transactionId: string;
  receiptNumber?: string;
  type: 'SALE' | 'GAJIAN' | 'VOID' | 'RECEIVABLE_PAYMENT' | 'BENCHMARK';
  durationMs: number;
  itemCount: number;
  timestamp: string;
  status: 'OPTIMAL' | 'NORMAL' | 'SLOW';
}

export interface SyncPerformanceMetric {
  id: string;
  entityType: string;
  entityId: string;
  networkDurationMs: number;
  queueWaitLatencyMs: number;
  totalLatencyMs: number;
  success: boolean;
  error?: string;
  timestamp: string;
  status: 'OPTIMAL' | 'NORMAL' | 'SLOW';
}

export interface BottleneckDiagnosis {
  id: string;
  category: 'TRANSACTION' | 'SYNC' | 'DATABASE' | 'NETWORK';
  severity: 'OPTIMAL' | 'WARNING' | 'CRITICAL';
  title: string;
  description: string;
  recommendation: string;
  metricValue: string;
}

export interface PerformanceSummary {
  transactionCount: number;
  avgTransactionDurationMs: number;
  minTransactionDurationMs: number;
  maxTransactionDurationMs: number;
  recentTransactions: TransactionPerformanceMetric[];

  syncCount: number;
  avgSyncLatencyMs: number;
  avgQueueWaitLatencyMs: number;
  minSyncLatencyMs: number;
  maxSyncLatencyMs: number;
  recentSyncs: SyncPerformanceMetric[];
  syncSuccessRate: number;

  bottlenecks: BottleneckDiagnosis[];
  overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  lastUpdated: string;
}

const STORAGE_KEY = 'harapan_jaya_performance_metrics_v2';
const MAX_SAMPLES = 50;

// Threshold constants (in milliseconds)
export const PERFORMANCE_THRESHOLDS = {
  TRANSACTION_OPTIMAL: 120, // < 120ms is optimal
  TRANSACTION_NORMAL: 300,  // 120-300ms is normal, > 300ms is slow
  SYNC_NETWORK_OPTIMAL: 350, // < 350ms network roundtrip is optimal
  SYNC_NETWORK_NORMAL: 1200, // 350-1200ms is normal, > 1200ms is slow
  QUEUE_WAIT_OPTIMAL: 5000,  // < 5s waiting in sync queue
  QUEUE_WAIT_NORMAL: 30000,  // 5-30s is acceptable for offline-first
};

class PerformanceTrackerService {
  private transactions: TransactionPerformanceMetric[] = [];
  private syncs: SyncPerformanceMetric[] = [];
  private listeners: Set<(summary: PerformanceSummary) => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.transactions = parsed.transactions || [];
        this.syncs = parsed.syncs || [];
      } else {
        // Seed initial representative baseline for immediate diagnostic visibility
        this.seedInitialMetrics();
      }
    } catch (e) {
      console.warn('Failed to load performance metrics from localStorage:', e);
      this.seedInitialMetrics();
    }
  }

  private seedInitialMetrics() {
    const now = Date.now();
    this.transactions = [
      {
        id: uuidv4(),
        transactionId: 'init-tx-1',
        receiptNumber: 'INV-SAMPLE-01',
        type: 'SALE',
        durationMs: 42,
        itemCount: 3,
        timestamp: new Date(now - 120000).toISOString(),
        status: 'OPTIMAL'
      },
      {
        id: uuidv4(),
        transactionId: 'init-tx-2',
        receiptNumber: 'INV-SAMPLE-02',
        type: 'SALE',
        durationMs: 65,
        itemCount: 6,
        timestamp: new Date(now - 60000).toISOString(),
        status: 'OPTIMAL'
      }
    ];

    this.syncs = [
      {
        id: uuidv4(),
        entityType: 'transactions',
        entityId: 'init-sync-1',
        networkDurationMs: 180,
        queueWaitLatencyMs: 1200,
        totalLatencyMs: 1380,
        success: true,
        timestamp: new Date(now - 90000).toISOString(),
        status: 'OPTIMAL'
      },
      {
        id: uuidv4(),
        entityType: 'stockMovements',
        entityId: 'init-sync-2',
        networkDurationMs: 210,
        queueWaitLatencyMs: 2400,
        totalLatencyMs: 2610,
        success: true,
        timestamp: new Date(now - 30000).toISOString(),
        status: 'OPTIMAL'
      }
    ];
    this.saveToStorage();
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          transactions: this.transactions.slice(0, MAX_SAMPLES),
          syncs: this.syncs.slice(0, MAX_SAMPLES)
        })
      );
    } catch (e) {
      console.warn('Failed to save performance metrics:', e);
    }
    this.notifyListeners();
  }

  private notifyListeners() {
    const summary = this.getSummary();
    this.listeners.forEach((listener) => {
      try {
        listener(summary);
      } catch (e) {
        console.error('Error in performance listener:', e);
      }
    });
  }

  public subscribe(callback: (summary: PerformanceSummary) => void): () => void {
    this.listeners.add(callback);
    // Initial call
    callback(this.getSummary());
    return () => {
      this.listeners.delete(callback);
    };
  }

  public recordTransactionMetric(params: {
    transactionId: string;
    receiptNumber?: string;
    type?: 'SALE' | 'GAJIAN' | 'VOID' | 'RECEIVABLE_PAYMENT' | 'BENCHMARK';
    durationMs: number;
    itemCount?: number;
    timestamp?: string;
  }): TransactionPerformanceMetric {
    const duration = Math.max(1, Math.round(params.durationMs));
    let status: 'OPTIMAL' | 'NORMAL' | 'SLOW' = 'OPTIMAL';
    if (duration > PERFORMANCE_THRESHOLDS.TRANSACTION_NORMAL) {
      status = 'SLOW';
    } else if (duration > PERFORMANCE_THRESHOLDS.TRANSACTION_OPTIMAL) {
      status = 'NORMAL';
    }

    const metric: TransactionPerformanceMetric = {
      id: uuidv4(),
      transactionId: params.transactionId,
      receiptNumber: params.receiptNumber,
      type: params.type || 'SALE',
      durationMs: duration,
      itemCount: params.itemCount || 1,
      timestamp: params.timestamp || new Date().toISOString(),
      status
    };

    this.transactions.unshift(metric);
    if (this.transactions.length > MAX_SAMPLES) {
      this.transactions.pop();
    }

    this.saveToStorage();
    return metric;
  }

  public recordSyncMetric(params: {
    entityType: string;
    entityId: string;
    networkDurationMs: number;
    queueWaitLatencyMs?: number;
    totalLatencyMs?: number;
    success: boolean;
    error?: string;
    timestamp?: string;
  }): SyncPerformanceMetric {
    const netDuration = Math.max(1, Math.round(params.networkDurationMs));
    const waitDuration = Math.max(0, Math.round(params.queueWaitLatencyMs || 0));
    const totalDuration = params.totalLatencyMs ? Math.round(params.totalLatencyMs) : netDuration + waitDuration;

    let status: 'OPTIMAL' | 'NORMAL' | 'SLOW' = 'OPTIMAL';
    if (!params.success || netDuration > PERFORMANCE_THRESHOLDS.SYNC_NETWORK_NORMAL) {
      status = 'SLOW';
    } else if (netDuration > PERFORMANCE_THRESHOLDS.SYNC_NETWORK_OPTIMAL) {
      status = 'NORMAL';
    }

    const metric: SyncPerformanceMetric = {
      id: uuidv4(),
      entityType: params.entityType,
      entityId: params.entityId,
      networkDurationMs: netDuration,
      queueWaitLatencyMs: waitDuration,
      totalLatencyMs: totalDuration,
      success: params.success,
      error: params.error,
      timestamp: params.timestamp || new Date().toISOString(),
      status
    };

    this.syncs.unshift(metric);
    if (this.syncs.length > MAX_SAMPLES) {
      this.syncs.pop();
    }

    this.saveToStorage();
    return metric;
  }

  public getSummary(): PerformanceSummary {
    const txDurations = this.transactions.map((t) => t.durationMs);
    const txCount = txDurations.length;
    const avgTx = txCount > 0 ? Math.round(txDurations.reduce((a, b) => a + b, 0) / txCount) : 0;
    const minTx = txCount > 0 ? Math.min(...txDurations) : 0;
    const maxTx = txCount > 0 ? Math.max(...txDurations) : 0;

    const syncNetDurations = this.syncs.map((s) => s.networkDurationMs);
    const syncWaitDurations = this.syncs.map((s) => s.queueWaitLatencyMs);
    const syncCount = this.syncs.length;
    const avgSync = syncCount > 0 ? Math.round(syncNetDurations.reduce((a, b) => a + b, 0) / syncCount) : 0;
    const avgWait = syncCount > 0 ? Math.round(syncWaitDurations.reduce((a, b) => a + b, 0) / syncCount) : 0;
    const minSync = syncCount > 0 ? Math.min(...syncNetDurations) : 0;
    const maxSync = syncCount > 0 ? Math.max(...syncNetDurations) : 0;

    const successCount = this.syncs.filter((s) => s.success).length;
    const syncSuccessRate = syncCount > 0 ? Math.round((successCount / syncCount) * 100) : 100;

    // Diagnose bottlenecks
    const bottlenecks: BottleneckDiagnosis[] = [];

    // Check Transaction Engine bottleneck
    if (avgTx > PERFORMANCE_THRESHOLDS.TRANSACTION_NORMAL) {
      bottlenecks.push({
        id: 'tx-slow',
        category: 'TRANSACTION',
        severity: 'CRITICAL',
        title: 'Pemrosesan Transaksi Lambat (Latency Tinggi)',
        description: `Rata-rata waktu eksekusi transaksi mencapai ${avgTx}ms (ambang batas normal < 300ms).`,
        recommendation: 'Periksa komputasi HPP FIFO bertingkat atau kurangi operasi disk IndexedDB serial.',
        metricValue: `${avgTx} ms`
      });
    } else if (avgTx > PERFORMANCE_THRESHOLDS.TRANSACTION_OPTIMAL) {
      bottlenecks.push({
        id: 'tx-moderate',
        category: 'TRANSACTION',
        severity: 'WARNING',
        title: 'Pemrosesan Transaksi Mendekati Batas Ideal',
        description: `Rata-rata waktu transaksi berada pada ${avgTx}ms. Wajar untuk keranjang dengan banyak item.`,
        recommendation: 'Pantau ukuran antrian dan hindari query live hooks berlebihan saat kasir checkout.',
        metricValue: `${avgTx} ms`
      });
    } else {
      bottlenecks.push({
        id: 'tx-optimal',
        category: 'TRANSACTION',
        severity: 'OPTIMAL',
        title: 'Pemrosesan Transaksi Sangat Cepat (Sub-120ms)',
        description: `Rata-rata eksekusi transaksi lokal berjalan responsif pada ${avgTx}ms.`,
        recommendation: 'Integritas local-first berjalan optimal tanpa hambatan pada engine transaksi.',
        metricValue: `${avgTx} ms`
      });
    }

    // Check Sync Network Latency
    if (avgSync > PERFORMANCE_THRESHOLDS.SYNC_NETWORK_NORMAL) {
      bottlenecks.push({
        id: 'sync-net-slow',
        category: 'NETWORK',
        severity: 'CRITICAL',
        title: 'Latensi Jaringan Cloud Lambat (> 1.2s)',
        description: `Rata-rata roundtrip write ke Firebase Firestore mencapai ${avgSync}ms.`,
        recommendation: 'Koneksi internet lambat. Data tetap aman di antrian offline local-first.',
        metricValue: `${avgSync} ms`
      });
    } else if (avgSync > PERFORMANCE_THRESHOLDS.SYNC_NETWORK_OPTIMAL) {
      bottlenecks.push({
        id: 'sync-net-warning',
        category: 'NETWORK',
        severity: 'WARNING',
        title: 'Latensi Sinkronisasi Cloud Sedang',
        description: `Rata-rata roundtrip upload adalah ${avgSync}ms. Sinkronisasi bertahap normal.`,
        recommendation: 'Pastikan sinyal Wi-Fi/koneksi terminal stabil untuk menjaga throughput sync.',
        metricValue: `${avgSync} ms`
      });
    } else {
      bottlenecks.push({
        id: 'sync-net-optimal',
        category: 'SYNC',
        severity: 'OPTIMAL',
        title: 'Latensi Sinkronisasi Cloud Cepat (< 350ms)',
        description: `Komunikasi Firestore berjalan lancar dengan rata-rata latensi ${avgSync}ms.`,
        recommendation: 'Koneksi cloud responsif dan antrian sync terselesaikan dengan cepat.',
        metricValue: `${avgSync} ms`
      });
    }

    // Check Queue Backlog Wait Latency
    if (avgWait > PERFORMANCE_THRESHOLDS.QUEUE_WAIT_NORMAL) {
      bottlenecks.push({
        id: 'queue-delay',
        category: 'SYNC',
        severity: 'WARNING',
        title: 'Penundaan Antrian Sinkronisasi (Queue Delay)',
        description: `Item tertahan rata-rata ${(avgWait / 1000).toFixed(1)} detik di antrian sebelum terkirim.`,
        recommendation: 'Periksa status online browser atau periksa apakah terdapat konflik sync bertumpuk.',
        metricValue: `${(avgWait / 1000).toFixed(1)} s`
      });
    }

    // Assess overall health
    const hasCritical = bottlenecks.some((b) => b.severity === 'CRITICAL');
    const hasWarning = bottlenecks.some((b) => b.severity === 'WARNING');
    const overallHealth = hasCritical ? 'CRITICAL' : hasWarning ? 'WARNING' : 'HEALTHY';

    return {
      transactionCount: txCount,
      avgTransactionDurationMs: avgTx,
      minTransactionDurationMs: minTx,
      maxTransactionDurationMs: maxTx,
      recentTransactions: [...this.transactions],

      syncCount,
      avgSyncLatencyMs: avgSync,
      avgQueueWaitLatencyMs: avgWait,
      minSyncLatencyMs: minSync,
      maxSyncLatencyMs: maxSync,
      recentSyncs: [...this.syncs],
      syncSuccessRate,

      bottlenecks,
      overallHealth,
      lastUpdated: new Date().toISOString()
    };
  }

  public clearMetrics() {
    this.transactions = [];
    this.syncs = [];
    this.saveToStorage();
  }

  /**
   * Runs an active, live diagnostic benchmark to measure:
   * 1. IndexedDB write & read throughput
   * 2. Firestore Cloud write latency (if online & authenticated)
   */
  public async runBenchmark(): Promise<{
    dbWriteMs: number;
    dbReadMs: number;
    cloudPingMs: number | null;
  }> {
    // 1. IndexedDB Benchmark
    const benchId = `bench_${Date.now()}`;
    const t0 = performance.now();
    await localDb.settings.put({
      id: benchId,
      benchmarkedAt: new Date().toISOString(),
      payload: 'benchmark_data_payload_string'.repeat(10)
    });
    const dbWriteMs = Math.round(performance.now() - t0);

    const t1 = performance.now();
    await localDb.settings.get(benchId);
    const dbReadMs = Math.round(performance.now() - t1);

    // Clean up bench record
    try {
      await localDb.settings.delete(benchId);
    } catch {}

    // Record synthetic transaction benchmark
    this.recordTransactionMetric({
      transactionId: benchId,
      receiptNumber: 'BENCH-LOCAL-DB',
      type: 'BENCHMARK',
      durationMs: dbWriteMs + dbReadMs,
      itemCount: 1,
      timestamp: new Date().toISOString()
    });

    // 2. Cloud Ping Benchmark (if online)
    let cloudPingMs: number | null = null;
    if (typeof navigator !== 'undefined' && navigator.onLine && auth.currentUser) {
      try {
        const net0 = performance.now();
        const pingRef = doc(firestoreDb, '_health', `ping_${auth.currentUser.uid}`);
        await setDoc(
          pingRef,
          {
            lastPing: serverTimestamp(),
            deviceId: 'BENCHMARK_PROBE'
          },
          { merge: true }
        );
        cloudPingMs = Math.round(performance.now() - net0);

        this.recordSyncMetric({
          entityType: '_health_ping',
          entityId: `ping_${auth.currentUser.uid}`,
          networkDurationMs: cloudPingMs,
          queueWaitLatencyMs: 0,
          totalLatencyMs: cloudPingMs,
          success: true,
          timestamp: new Date().toISOString()
        });
      } catch (err: any) {
        console.warn('Cloud benchmark ping skipped or failed:', err);
      }
    }

    return {
      dbWriteMs,
      dbReadMs,
      cloudPingMs
    };
  }
}

import { useState, useEffect } from 'react';

export function usePerformanceTracker(): PerformanceSummary {
  const [summary, setSummary] = useState<PerformanceSummary>(() => PerformanceTracker.getSummary());

  useEffect(() => {
    return PerformanceTracker.subscribe((latest) => {
      setSummary(latest);
    });
  }, []);

  return summary;
}

export const PerformanceTracker = new PerformanceTrackerService();
