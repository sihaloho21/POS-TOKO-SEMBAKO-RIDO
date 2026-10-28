import { db } from '@/core/database';
import type { PayrollRecord, BonusCategory, PayrollBonusItem, FinanceEvent } from '@/core/types';

export const DEFAULT_BONUS_CATEGORIES: Array<{ name: string; description: string }> = [
  { name: 'Bonus Kebersihan', description: 'Kerapian, kebersihan lapak & lingkungan toko' },
  { name: 'Bonus Penjualan Ikan', description: 'Insentif penjualan & penanganan ikan basah' },
  { name: 'Bonus Penjualan Digital', description: 'Komisi transaksi produk digital & PPOB' },
  { name: 'Bonus Disiplin', description: 'Presensi tepat waktu, nihil keterlambatan & kepatuhan SOP' },
  { name: 'Bonus Lembur', description: 'Kompensasi jam kerja ekstra saat pembongkaran muatan atau jam sibuk' },
];

export class PayrollService {
  /**
   * Seed default bonus categories if none exist yet.
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
   * Add or update a bonus category
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

    await db.bonusCategories.put(data);
    return id;
  }

  /**
   * Toggle category active state
   */
  static async toggleCategoryActive(id: string): Promise<void> {
    const cat = await db.bonusCategories.get(id);
    if (!cat) return;
    await db.bonusCategories.update(id, {
      isActive: !cat.isActive,
      updatedAt: new Date().toISOString()
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
      await db.bonusCategories.update(id, { isActive: false, updatedAt: new Date().toISOString() });
    } else {
      await db.bonusCategories.delete(id);
    }
  }

  /**
   * Create a new payroll record (current or backdated historical)
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

    await db.payrolls.put(record);

    // Queue for cloud sync
    try {
      await db.syncQueue.put({
        entityType: 'TRANSACTION', // Sync engine compatible
        entityId: payrollId,
        payload: {
          type: 'PAYROLL',
          ...record
        },
        action: 'CREATE',
        status: 'PENDING',
        retryCount: 0,
        createdAt: now
      });
    } catch (e) {
      console.warn('Could not enqueue payroll sync:', e);
    }

    return record;
  }

  /**
   * Delete a payroll record and roll back any associated financeEvent
   */
  static async deletePayroll(payrollId: string): Promise<void> {
    const record = await db.payrolls.get(payrollId);
    if (!record) return;

    if (record.financeEventId) {
      await db.financeEvents.delete(record.financeEventId);
    }

    await db.payrolls.delete(payrollId);
  }

  /**
   * Get all registered staff/users for the dropdown selection
   */
  static async getRegisteredStaff(): Promise<Array<{ id: string; name: string; role: string }>> {
    const users = await db.users.toArray();
    return users.map(u => ({ id: u.userId, name: u.name, role: u.role }));
  }
}
