import { db } from '@/core/database';
import type { PayrollRecord, BonusCategory, PayrollBonusItem, FinanceEvent } from '@/core/types';
import { cloudSetDoc, cloudDeleteDoc, cloudUpdateDoc } from '@/core/firestore-realtime';

export const DEFAULT_BONUS_CATEGORIES: Array<{ name: string; description: string }> = [
  { name: 'Bonus Kebersihan', description: 'Kerapian, kebersihan lapak & lingkungan toko' },
  { name: 'Bonus Penjualan Ikan', description: 'Insentif penjualan & penanganan ikan basah' },
  { name: 'Bonus Penjualan Digital', description: 'Komisi transaksi produk digital & PPOB' },
  { name: 'Bonus Disiplin', description: 'Presensi tepat waktu, nihil keterlambatan & kepatuhan SOP' },
  { name: 'Bonus Lembur', description: 'Kompensasi jam kerja ekstra saat pembongkaran muatan atau jam sibuk' },
];

export class PayrollService {
  /**
   * Seed default bonus categories to both local database and Cloud Firestore if none exist yet.
   */
  static async ensureDefaultBonusCategories(): Promise<void> {
    try {
      const count = await db.bonusCategories.count();
      if (count === 0) {
        const now = new Date().toISOString();
        const initialCategories: BonusCategory[] = DEFAULT_BONUS_CATEGORIES.map((item, idx) => ({
          id: `bonus-cat-${idx + 1}`,
          name: item.name,
          description: item.description,
          isSystem: true,
          isActive: true,
          createdAt: now,
          updatedAt: now
        }));
        await db.bonusCategories.bulkPut(initialCategories);

        // Upload default categories directly to Cloud Firestore
        for (const cat of initialCategories) {
          await cloudSetDoc('bonusCategories', cat.id, cat);
        }
      }
    } catch (err) {
      console.warn('Failed to ensure default bonus categories:', err);
    }
  }

  /**
   * Get all active bonus categories for selection in forms
   */
  static async getActiveBonusCategories(): Promise<BonusCategory[]> {
    await this.ensureDefaultBonusCategories();
    return await db.bonusCategories.filter(c => c.isActive).toArray();
  }

  /**
   * Get all bonus categories (including disabled ones) for management
   */
  static async getAllBonusCategories(): Promise<BonusCategory[]> {
    await this.ensureDefaultBonusCategories();
    return await db.bonusCategories.toArray();
  }

  /**
   * Add or update a bonus category with realtime Cloud Firestore sync
   */
  static async saveBonusCategory(cat: {
    id?: string;
    name: string;
    description?: string;
    isActive?: boolean;
  }): Promise<string> {
    const now = new Date().toISOString();
    const id = cat.id || `bonus-cat-${Date.now()}`;
    const existing = cat.id ? await db.bonusCategories.get(cat.id) : null;

    const data: BonusCategory = {
      id,
      name: cat.name.trim(),
      description: cat.description?.trim() || '',
      isSystem: existing ? existing.isSystem : false,
      isActive: cat.isActive !== undefined ? cat.isActive : true,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    // 1. Direct Cloud Firestore write
    await cloudSetDoc('bonusCategories', id, data);

    // 2. Local mirror
    await db.bonusCategories.put(data);

    return id;
  }

  /**
   * Toggle category active state
   */
  static async toggleCategoryActive(id: string): Promise<void> {
    const cat = await db.bonusCategories.get(id);
    if (!cat) return;
    const updatedAt = new Date().toISOString();
    const newActive = !cat.isActive;

    // 1. Direct Cloud Firestore write
    await cloudUpdateDoc('bonusCategories', id, {
      isActive: newActive,
      updatedAt
    });

    // 2. Local mirror
    await db.bonusCategories.update(id, {
      isActive: newActive,
      updatedAt
    });
  }

  /**
   * Delete category (only non-system or deactivates if in use)
   */
  static async deleteCategory(id: string): Promise<void> {
    const cat = await db.bonusCategories.get(id);
    if (!cat) return;
    if (cat.isSystem) {
      // Just deactivate system categories rather than hard delete
      const updatedAt = new Date().toISOString();
      await cloudUpdateDoc('bonusCategories', id, { isActive: false, updatedAt });
      await db.bonusCategories.update(id, { isActive: false, updatedAt });
    } else {
      await cloudDeleteDoc('bonusCategories', id);
      await db.bonusCategories.delete(id);
    }
  }

  /**
   * Create a new payroll record with Real-Time Cloud Firestore Sync
   */
  static async createPayroll(params: {
    employeeId?: string;
    employeeName: string;
    periodMonth: number;
    periodYear: number;
    paymentDate: string;
    baseSalary: number;
    bonuses: PayrollBonusItem[];
    deductions: number;
    paymentMethod: 'CASH_WARUNG' | 'CASH_IKAN' | 'TRANSFER' | 'DIGITAL';
    notes?: string;
    isBackdated: boolean;
    affectCashBalance: boolean;
    currentUserId: string;
    deviceId?: string;
  }): Promise<PayrollRecord> {
    const now = new Date().toISOString();
    const payrollId = `pr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const totalBonus = params.bonuses.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    const totalAmount = Math.max(0, (Number(params.baseSalary) || 0) + totalBonus - (Number(params.deductions) || 0));

    let financeEventId: string | undefined = undefined;

    // Only create a finance event if owner explicitly wants it to affect current cash balance
    if (params.affectCashBalance && totalAmount > 0) {
      financeEventId = `fe-pay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      
      let storageId: 'WARUNG' | 'IKAN' | 'UANG_DIGITAL' = 'WARUNG';
      if (params.paymentMethod === 'CASH_IKAN') {
        storageId = 'IKAN';
      } else if (params.paymentMethod === 'DIGITAL') {
        storageId = 'UANG_DIGITAL';
      }

      const financeEvent: FinanceEvent = {
        financeEventId,
        amount: totalAmount,
        storageId,
        direction: 'OUT',
        referenceId: payrollId,
        referenceType: 'EXPENSE',
        description: `Penggajian ${params.employeeName} (${params.periodMonth}/${params.periodYear}) - ${params.isBackdated ? 'Histori Lampau' : 'Reguler'}`,
        userId: params.currentUserId,
        deviceId: params.deviceId || 'main-pos',
        timestamp: params.paymentDate ? new Date(params.paymentDate).toISOString() : now
      };

      // Realtime Cloud Firestore write for Finance Event
      await cloudSetDoc('financeEvents', financeEventId, financeEvent);
      await db.financeEvents.put(financeEvent);
    }

    const record: PayrollRecord = {
      id: payrollId,
      employeeId: params.employeeId,
      employeeName: params.employeeName.trim(),
      periodMonth: Number(params.periodMonth),
      periodYear: Number(params.periodYear),
      paymentDate: params.paymentDate || now.split('T')[0],
      baseSalary: Number(params.baseSalary) || 0,
      bonuses: params.bonuses.map(b => ({
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        amount: Number(b.amount) || 0,
        notes: b.notes?.trim()
      })),
      totalBonus,
      deductions: Number(params.deductions) || 0,
      totalAmount,
      paymentMethod: params.paymentMethod,
      notes: params.notes?.trim(),
      isBackdated: Boolean(params.isBackdated),
      affectCashBalance: Boolean(params.affectCashBalance),
      financeEventId,
      createdBy: params.currentUserId,
      createdAt: now,
      updatedAt: now
    };

    // 1. Direct Realtime Cloud Firestore write
    await cloudSetDoc('payrolls', payrollId, record);

    // 2. Local Dexie mirror
    await db.payrolls.put(record);

    return record;
  }

  /**
   * Delete a payroll record and roll back any associated financeEvent from both Cloud & Local
   */
  static async deletePayroll(payrollId: string): Promise<void> {
    const record = await db.payrolls.get(payrollId);
    
    // Delete associated finance event if exists
    if (record?.financeEventId) {
      await cloudDeleteDoc('financeEvents', record.financeEventId);
      await db.financeEvents.delete(record.financeEventId);
    }

    // Delete payroll from Cloud Firestore & local Dexie
    await cloudDeleteDoc('payrolls', payrollId);
    await db.payrolls.delete(payrollId);
  }

  /**
   * Get all registered staff/users for the dropdown selection
   */
  static async getRegisteredStaff(): Promise<Array<{ id: string; name: string; role: string }>> {
    const users = await db.users.toArray();
    return users.map(u => ({ id: u.userId, name: u.name, role: u.role }));
  }

  /**
   * SINKRONISASI OTOMATIS BONUS KINERJA
   * Menghitung akumulasi bonus secara otomatis dari data transaksi riil (ikan, digital, shift kasir)
   * untuk periode bulan & tahun yang dipilih.
   */
  static async calculateAutoBonuses(params: {
    employeeId?: string;
    employeeName?: string;
    periodMonth: number;
    periodYear: number;
  }): Promise<PayrollBonusItem[]> {
    const results: PayrollBonusItem[] = [];
    const padMonth = String(params.periodMonth).padStart(2, '0');
    const periodPrefix = `${params.periodYear}-${padMonth}`; // e.g. "2026-10"

    try {
      // 1. Ambil data transaksi pada periode bulan tersebut
      const transactions = await db.transactions
        .filter(t => {
          const tDate = t.clientTimestamp || t.serverTimestamp || '';
          const matchDate = tDate.startsWith(periodPrefix);
          const isCompleted = t.status === 'COMPLETED' || !t.status;
          
          if (!matchDate || !isCompleted) return false;
          
          // Jika ada employeeId spesifik, cocokkan dengan cashierId
          if (params.employeeId) {
            return t.cashierId === params.employeeId;
          }
          return true;
        })
        .toArray();

      // 1A. Hitung Bonus Penjualan Ikan (2% dari omzet ikan)
      let fishTotal = 0;
      let fishTxCount = 0;

      for (const tx of transactions) {
        if (tx.moneyStorageId === 'IKAN') {
          fishTotal += tx.total;
          fishTxCount++;
        } else if (tx.items && Array.isArray(tx.items)) {
          for (const item of tx.items) {
            const nameLower = (item.nameSnapshot || '').toLowerCase();
            if (nameLower.includes('ikan') || nameLower.includes('nila') || nameLower.includes('gurame') || nameLower.includes('lele') || nameLower.includes('tongkol')) {
              fishTotal += item.subtotal || 0;
              fishTxCount++;
            }
          }
        }
      }

      if (fishTotal > 0) {
        const fishBonus = Math.round(fishTotal * 0.02); // 2% insentif penjualan ikan
        results.push({
          categoryId: 'bonus-cat-2',
          categoryName: 'Bonus Penjualan Ikan',
          amount: Math.max(fishBonus, 25000), // minimal Rp 25.000 jika ada penjualan ikan
          notes: `Otomatis: 2% dari total penjualan ikan Rp ${fishTotal.toLocaleString('id-ID')} (${fishTxCount} transaksi)`
        });
      }

      // 1B. Hitung Bonus Penjualan Digital (Rp 1.000 per transaksi digital)
      const digitalTxList = transactions.filter(t => 
        t.type === 'DIGITAL_SERVICE' || 
        t.moneyStorageId === 'UANG_DIGITAL' ||
        (t.items && t.items.some(i => (i.nameSnapshot || '').toLowerCase().includes('pulsa') || (i.nameSnapshot || '').toLowerCase().includes('token') || (i.nameSnapshot || '').toLowerCase().includes('top up')))
      );

      if (digitalTxList.length > 0) {
        const digitalBonus = digitalTxList.length * 1000; // Rp 1.000 per transaksi digital
        results.push({
          categoryId: 'bonus-cat-3',
          categoryName: 'Bonus Penjualan Digital',
          amount: digitalBonus,
          notes: `Otomatis: Komisi Rp 1.000 x ${digitalTxList.length} transaksi digital & PPOB`
        });
      }

      // 2. Ambil data shift kerja karyawan pada periode tersebut
      const shifts = await db.shifts
        .filter(s => {
          const sDate = s.startTime || '';
          const matchDate = sDate.startsWith(periodPrefix);
          const isClosed = s.status === 'CLOSED';
          if (!matchDate || !isClosed) return false;
          if (params.employeeId) {
            return s.userId === params.employeeId;
          }
          return true;
        })
        .toArray();

      if (shifts.length > 0) {
        // Bonus Disiplin & Kehadiran: Rp 10.000 per shift tuntas
        const shiftBonus = shifts.length * 10000;
        results.push({
          categoryId: 'bonus-cat-4',
          categoryName: 'Bonus Disiplin',
          amount: shiftBonus,
          notes: `Otomatis: ${shifts.length} shift kerja terselesaikan dengan tertib & tuntas`
        });
      }

      // 3. Jika belum ada data transaksi spesifik di periode ini (misal di awal bulan), berikan rekomendasi bonus standar
      if (results.length === 0) {
        results.push({
          categoryId: 'bonus-cat-1',
          categoryName: 'Bonus Kebersihan',
          amount: 50000,
          notes: 'Rekomendasi standar kebersihan toko & lingkungan'
        });
        results.push({
          categoryId: 'bonus-cat-4',
          categoryName: 'Bonus Disiplin',
          amount: 50000,
          notes: 'Rekomendasi standar presensi & kedisiplinan kerja'
        });
      }

    } catch (err) {
      console.warn('Gagal menghitung otomatis bonus kinerja:', err);
      // Fallback
      results.push({
        categoryId: 'bonus-cat-4',
        categoryName: 'Bonus Disiplin',
        amount: 50000,
        notes: 'Bonus standar operasional toko'
      });
    }

    return results;
  }
}
