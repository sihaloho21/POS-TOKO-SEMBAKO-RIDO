import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import type { Supplier } from '../types';
import { AuditEngine } from '../audit-engine';

export class SupplierService {
  static async getAllSuppliers(): Promise<Supplier[]> {
    return await db.suppliers.toArray();
  }

  static async getSupplierById(supplierId: string): Promise<Supplier | undefined> {
    return await db.suppliers.get(supplierId);
  }

  static async createSupplier(params: {
    name: string;
    phone?: string;
    address?: string;
    notes?: string;
    status?: 'ACTIVE' | 'INACTIVE';
    userId: string;
    deviceId?: string;
  }): Promise<Supplier> {
    const supplierId = uuidv4();
    const now = new Date().toISOString();

    const supplier: Supplier = {
      supplierId,
      name: params.name.trim(),
      phone: params.phone?.trim() || undefined,
      address: params.address?.trim() || undefined,
      notes: params.notes?.trim() || undefined,
      status: params.status || 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    // 1. Save to local Dexie
    await db.suppliers.add(supplier);

    // 2. Queue for Cloud Sync
    await db.syncQueue.add({
      entityType: 'suppliers',
      entityId: supplierId,
      action: 'CREATE',
      payload: supplier,
      status: 'PENDING',
      retryCount: 0,
      createdAt: now,
    });

    // 3. Audit trail
    await AuditEngine.log({
      userId: params.userId,
      role: 'OWNER',
      deviceId: params.deviceId || 'device-1',
      action: 'CREATE_SUPPLIER',
      module: 'SUPPLIERS',
      referenceId: supplierId,
      after: supplier,
      reason: `Menambahkan supplier baru: ${supplier.name}`,
    });

    return supplier;
  }

  static async updateSupplier(
    supplierId: string,
    updates: Partial<Omit<Supplier, 'supplierId' | 'createdAt'>>,
    userId: string,
    deviceId = 'device-1'
  ): Promise<Supplier> {
    const existing = await db.suppliers.get(supplierId);
    if (!existing) {
      throw new Error('Supplier tidak ditemukan');
    }

    const now = new Date().toISOString();
    const updated: Supplier = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    // 1. Update local Dexie
    await db.suppliers.update(supplierId, updated);

    // 2. Queue for sync
    await db.syncQueue.add({
      entityType: 'suppliers',
      entityId: supplierId,
      action: 'UPDATE',
      payload: updated,
      status: 'PENDING',
      retryCount: 0,
      createdAt: now,
    });

    // 3. Audit log
    await AuditEngine.log({
      userId,
      role: 'OWNER',
      deviceId,
      action: 'UPDATE_SUPPLIER',
      module: 'SUPPLIERS',
      referenceId: supplierId,
      before: existing,
      after: updated,
      reason: `Memperbarui data supplier: ${updated.name}`,
    });

    return updated;
  }

  static async deleteSupplier(
    supplierId: string,
    userId: string,
    deviceId = 'device-1'
  ): Promise<{ deleted: boolean; deactivated: boolean; message: string }> {
    const existing = await db.suppliers.get(supplierId);
    if (!existing) {
      throw new Error('Supplier tidak ditemukan');
    }

    // Check if supplier has purchase transactions
    const purchaseCount = await db.purchases.where('supplierId').equals(supplierId).count();

    const now = new Date().toISOString();

    if (purchaseCount > 0) {
      // Cannot hard delete because of ledger integrity - deactivate instead
      await db.suppliers.update(supplierId, {
        status: 'INACTIVE',
        updatedAt: now,
      });

      await db.syncQueue.add({
        entityType: 'suppliers',
        entityId: supplierId,
        action: 'UPDATE',
        payload: { ...existing, status: 'INACTIVE', updatedAt: now },
        status: 'PENDING',
        retryCount: 0,
        createdAt: now,
      });

      await AuditEngine.log({
        userId,
        role: 'OWNER',
        deviceId,
        action: 'DEACTIVATE_SUPPLIER',
        module: 'SUPPLIERS',
        referenceId: supplierId,
        reason: `Menonaktifkan supplier ${existing.name} (Memiliki riwayat ${purchaseCount} faktur pembelian)`,
      });

      return {
        deleted: false,
        deactivated: true,
        message: `Supplier "${existing.name}" memiliki ${purchaseCount} riwayat faktur pembelian, sehingga dinonaktifkan (status INACTIVE) untuk menjaga integritas pembukuan.`,
      };
    }

    // Hard delete safely if no purchase history exists
    await db.suppliers.delete(supplierId);

    await db.syncQueue.add({
      entityType: 'suppliers',
      entityId: supplierId,
      action: 'DELETE',
      payload: { supplierId },
      status: 'PENDING',
      retryCount: 0,
      createdAt: now,
    });

    await AuditEngine.log({
      userId,
      role: 'OWNER',
      deviceId,
      action: 'DELETE_SUPPLIER',
      module: 'SUPPLIERS',
      referenceId: supplierId,
      before: existing,
      reason: `Menghapus supplier ${existing.name}`,
    });

    return {
      deleted: true,
      deactivated: false,
      message: `Supplier "${existing.name}" berhasil dihapus.`,
    };
  }

  static async seedSampleSuppliersIfEmpty(userId: string): Promise<boolean> {
    const count = await db.suppliers.count();
    if (count > 0) return false;

    const samples = [
      {
        name: 'CV Beras Sumber Makmur Cipinang',
        phone: '081234567890',
        address: 'Pasar Induk Beras Cipinang Blok A2 No. 12, Jakarta Timur',
        notes: 'Pemasok beras Setra Ramos, Pandan Wangi, & Ketan. Pembayaran tempo 14 hari.',
        status: 'ACTIVE' as const,
      },
      {
        name: 'PT Wings Surya Distributor',
        phone: '081398765432',
        address: 'Kawasan Industri Pulogadung Kav. 18, Jakarta',
        notes: 'Distributor resmi minyak goreng Tropical, sabun cuci, mie Sedaap, dan deterjen.',
        status: 'ACTIVE' as const,
      },
      {
        name: 'Grosir Telur Ayam Berkah Jaya',
        phone: '085712345678',
        address: 'Jl. Raya Bogor KM 28, Cibubur, Ciracas',
        notes: 'Pasokan telur ayam ras per peti (10 kg/peti) dan telur bebek. Pengiriman tiap Selasa & Jumat.',
        status: 'ACTIVE' as const,
      },
      {
        name: 'TPI Muara Angke (Ikan Basah & Segar)',
        phone: '082188776655',
        address: 'Dermaga TPI Muara Angke, Pluit, Penjaringan, Jakarta Utara',
        notes: 'Pemasok ikan mas, nila, lele hidup, cumi, dan udang vaname segar langsung dari nelayan.',
        status: 'ACTIVE' as const,
      },
      {
        name: 'PT Indofood Sukses Makmur Tbk (Distribusi)',
        phone: '081122334455',
        address: 'Jl. Jend. Sudirman Kav. 76-78, Jakarta Selatan',
        notes: 'Pemasok tepung terigu Segitiga Biru, Cakra Kembar, Indomie, dan minyak goreng Bimoli.',
        status: 'ACTIVE' as const,
      },
      {
        name: 'UD Bawang & Bumbu Dapur Brebes',
        phone: '087855443322',
        address: 'Pasar Induk Kramat Jati Blok C No. 44, Jakarta Timur',
        notes: 'Bawang merah Brebes super, bawang putih honan, cabai rawit merah, dan rempah bumbu sembako.',
        status: 'ACTIVE' as const,
      },
    ];

    for (const sample of samples) {
      await this.createSupplier({
        ...sample,
        userId,
      });
    }

    return true;
  }
}
