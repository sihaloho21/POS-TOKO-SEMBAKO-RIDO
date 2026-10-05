import { db } from '../database';
import { v4 as uuidv4 } from 'uuid';
import type { 
  Bundle, 
  BundleComponent, 
  Product, 
  TransactionBundleComponentSnapshot 
} from '../types';
import { StockService, type StockShortage } from './stock-service';
import { AuditEngine } from '../audit-engine';

export interface FlattenedBundleComponent {
  componentProductId: string;
  name: string;
  qtyPerBundle: number;
  totalQty: number;
  unit: string;
  wac: number;
  subtotalHpp: number;
  status: 'ACTIVE' | 'INACTIVE';
  isFromNestedBundle: boolean;
  parentBundleName?: string;
  availableStock?: number;
}

export class BundleService {
  /**
   * Check if adding candidateComponentId into targetBundleId would cause a circular reference.
   * e.g., Bundle A contains Bundle B, and Bundle B attempts to contain Bundle A.
   */
  static async hasCircularReference(
    targetBundleId: string,
    candidateComponentId: string,
    visited: Set<string> = new Set()
  ): Promise<boolean> {
    if (candidateComponentId === targetBundleId) {
      return true;
    }

    if (visited.has(candidateComponentId)) {
      return false;
    }
    visited.add(candidateComponentId);

    // Check if candidate is a bundle
    const candidateBundle = await db.bundles.get(candidateComponentId);
    if (!candidateBundle) {
      return false;
    }

    for (const comp of candidateBundle.components) {
      const compId = comp.componentProductId || comp.productId;
      if (!compId) continue;

      if (compId === targetBundleId) {
        return true;
      }

      const circular = await this.hasCircularReference(targetBundleId, compId, visited);
      if (circular) return true;
    }

    return false;
  }

  /**
   * Recursively flatten a bundle down to its leaf physical components.
   * Multiplies quantities through nested bundles.
   */
  static async flattenComponents(
    bundleId: string,
    parentMultiplier: number = 1,
    visited: Set<string> = new Set(),
    parentName?: string
  ): Promise<FlattenedBundleComponent[]> {
    if (visited.has(bundleId)) {
      throw new Error(`Circular reference terdeteksi pada Bundle ID: ${bundleId}`);
    }
    visited.add(bundleId);

    const bundle = await db.bundles.get(bundleId);
    if (!bundle) return [];

    const costs = await db.productCosts.toArray();
    const costMap = new Map(costs.map(c => [c.productId, c.hpp]));

    const flattened: FlattenedBundleComponent[] = [];

    for (const comp of bundle.components) {
      const compId = comp.componentProductId || comp.productId;
      if (!compId) continue;

      const qtyPerBundle = Number(comp.qtyPerBundle || comp.qty || 1);
      const effectiveQty = qtyPerBundle * parentMultiplier;

      // Check if this component is itself a bundle (nested bundle)
      const subBundle = await db.bundles.get(compId);
      if (subBundle) {
        const nestedFlattened = await this.flattenComponents(
          compId,
          effectiveQty,
          new Set(visited),
          subBundle.name
        );
        flattened.push(...nestedFlattened);
      } else {
        // Physical component
        const product = await db.products.get(compId);
        const wac = costMap.get(compId) ?? product?.hpp ?? 0;
        const subtotalHpp = Number((effectiveQty * wac).toFixed(2));

        flattened.push({
          componentProductId: compId,
          name: product?.name || comp.nameSnapshot || 'Unknown Product',
          qtyPerBundle,
          totalQty: effectiveQty,
          unit: comp.unit || product?.baseUnit || 'PCS',
          wac,
          subtotalHpp,
          status: product?.status || 'ACTIVE',
          isFromNestedBundle: !!parentName,
          parentBundleName: parentName
        });
      }
    }

    // Merge duplicate leaf components if any
    const mergedMap = new Map<string, FlattenedBundleComponent>();
    for (const item of flattened) {
      const existing = mergedMap.get(item.componentProductId);
      if (existing) {
        existing.totalQty += item.totalQty;
        existing.subtotalHpp = Number((existing.totalQty * existing.wac).toFixed(2));
      } else {
        mergedMap.set(item.componentProductId, { ...item });
      }
    }

    return Array.from(mergedMap.values());
  }

  /**
   * Calculate exact HPP of a bundle from component WAC at finalization.
   * HPP = SUM(componentQty * componentWACAtFinalization)
   */
  static async calculateBundleWac(bundleId: string): Promise<{
    totalHpp: number;
    breakdown: FlattenedBundleComponent[];
  }> {
    const breakdown = await this.flattenComponents(bundleId, 1);
    const totalHpp = breakdown.reduce((sum, item) => sum + item.subtotalHpp, 0);

    return {
      totalHpp: Number(totalHpp.toFixed(2)),
      breakdown
    };
  }

  /**
   * Calculate maximum available whole bundles from component stock.
   */
  static async getAvailableBundleStock(bundleId: string): Promise<number> {
    const components = await this.flattenComponents(bundleId, 1);
    if (components.length === 0) return 0;

    let minBundles = Infinity;

    for (const comp of components) {
      const available = await StockService.getDerivedStock(comp.componentProductId);
      if (comp.totalQty <= 0) continue;
      const canMake = Math.floor(available / comp.totalQty);
      if (canMake < minBundles) {
        minBundles = canMake;
      }
    }

    return minBundles === Infinity ? 0 : Math.max(0, minBundles);
  }

  /**
   * Validate bundle for sale:
   * - Inactive component check (strictly blocked for new bundle sales)
   * - Stock sufficiency check (blocked on normal flow, allowed with shortages if Owner override)
   */
  static async validateBundleForSale(
    bundleId: string,
    bundleQty: number = 1,
    allowInsufficientStock: boolean = false
  ): Promise<{
    valid: boolean;
    bundle?: Bundle;
    totalHpp: number;
    flattenedComponents: FlattenedBundleComponent[];
    shortages: StockShortage[];
    error?: string;
  }> {
    const bundle = await db.bundles.get(bundleId);
    if (!bundle) {
      return { valid: false, totalHpp: 0, flattenedComponents: [], shortages: [], error: 'Paket bundle tidak ditemukan.' };
    }

    if (bundle.status !== 'ACTIVE') {
      return { valid: false, bundle, totalHpp: 0, flattenedComponents: [], shortages: [], error: `Paket '${bundle.name}' sedang NONAKTIF.` };
    }

    const flattened = await this.flattenComponents(bundleId, bundleQty);

    // 1. Check for inactive components
    const inactiveComponents = flattened.filter(c => c.status === 'INACTIVE');
    if (inactiveComponents.length > 0) {
      const names = inactiveComponents.map(c => c.name).join(', ');
      return {
        valid: false,
        bundle,
        totalHpp: 0,
        flattenedComponents: flattened,
        shortages: [],
        error: `Paket '${bundle.name}' tidak dapat dijual karena komponen '${names}' berstatus NONAKTIF.`
      };
    }

    // 2. Check stock sufficiency for each component
    const shortages: StockShortage[] = [];
    for (const comp of flattened) {
      const available = await StockService.getDerivedStock(comp.componentProductId);
      comp.availableStock = available;
      if (available < comp.totalQty) {
        shortages.push({
          productId: comp.componentProductId,
          productName: `${comp.name} (Komponen Paket ${bundle.name})`,
          requestedBaseQty: comp.totalQty,
          availableStock: available,
          shortageQty: Number((comp.totalQty - available).toFixed(4))
        });
      }
    }

    const totalHpp = flattened.reduce((sum, c) => sum + c.subtotalHpp, 0);

    if (shortages.length > 0 && !allowInsufficientStock) {
      const details = shortages
        .map(s => `${s.productName} (Sisa: ${s.availableStock}, Butuh: ${s.requestedBaseQty})`)
        .join('; ');
      return {
        valid: false,
        bundle,
        totalHpp,
        flattenedComponents: flattened,
        shortages,
        error: `Stok komponen paket '${bundle.name}' tidak mencukupi: ${details}. Hubungi Owner jika ingin mengaktifkan override.`
      };
    }

    return {
      valid: true,
      bundle,
      totalHpp,
      flattenedComponents: flattened,
      shortages
    };
  }

  /**
   * Create an immutable snapshot of bundle component definitions and WAC for transaction persistence.
   * "Historical component definition disimpan pada transaction snapshot. Perubahan component tidak mengubah transaksi lama."
   */
  static async createBundleSnapshot(
    bundleId: string,
    bundleQty: number
  ): Promise<TransactionBundleComponentSnapshot[]> {
    const flattened = await this.flattenComponents(bundleId, bundleQty);

    return flattened.map(comp => ({
      componentProductId: comp.componentProductId,
      nameSnapshot: comp.name,
      qtyPerBundle: comp.qtyPerBundle,
      totalQty: comp.totalQty,
      unit: comp.unit,
      wacSnapshot: comp.wac,
      subtotalHpp: comp.subtotalHpp,
      isNestedBundle: comp.isFromNestedBundle
    }));
  }

  /**
   * Save (create or update) a bundle.
   * - Derives initial calculated HPP from component WAC
   * - Strictly prevents circular references
   * - Syncs to products table so it can be sold in POS
   * - Preserves historical transaction snapshots
   */
  static async saveBundle(params: {
    bundleId?: string;
    name: string;
    barcode?: string;
    price: number;
    components: BundleComponent[];
    status?: 'ACTIVE' | 'INACTIVE';
    userId?: string;
    role?: string;
    deviceId?: string;
  }): Promise<string> {
    const isNew = !params.bundleId;
    const bundleId = params.bundleId || uuidv4();
    const now = new Date().toISOString();

    // 1. Check circular reference for each component
    for (const comp of params.components) {
      const compId = comp.componentProductId || comp.productId;
      if (!compId) continue;
      const isCircular = await this.hasCircularReference(bundleId, compId);
      if (isCircular) {
        throw new Error(`Circular reference terdeteksi! Komponen ID '${compId}' tidak dapat dimasukkan ke dalam paket '${params.name}'.`);
      }
    }

    // 2. Prepare normalized components
    const normalizedComponents: BundleComponent[] = params.components.map(c => ({
      componentProductId: c.componentProductId || c.productId || '',
      productId: c.componentProductId || c.productId || '',
      qtyPerBundle: Number(c.qtyPerBundle || c.qty || 1),
      qty: Number(c.qtyPerBundle || c.qty || 1),
      unit: c.unit || 'PCS',
      isNestedBundle: !!c.isNestedBundle,
      nestedBundleId: c.nestedBundleId,
      nameSnapshot: c.nameSnapshot
    }));

    const bundleRecord: Bundle = {
      bundleId,
      name: params.name,
      price: params.price,
      components: normalizedComponents,
      status: params.status || 'ACTIVE',
      createdAt: isNew ? now : undefined,
      updatedAt: now
    };

    // Temporarily put in DB so calculateBundleWac can flatten components
    await db.bundles.put(bundleRecord);

    const { totalHpp } = await this.calculateBundleWac(bundleId);
    bundleRecord.calculatedHpp = totalHpp;
    await db.bundles.put(bundleRecord);

    // 3. Register or update in Products store (PRD 10 & 12: Bundle is a product type)
    const existingProduct = await db.products.get(bundleId);
    const productEntry: Product = {
      productId: bundleId,
      barcode: params.barcode || existingProduct?.barcode || `BNDL-${Date.now().toString().slice(-6)}`,
      name: params.name,
      categoryId: 'BUNDLES',
      productType: 'BUNDLE',
      baseUnit: 'PAKET',
      saleUnits: ['PAKET'],
      conversionRules: [],
      normalPrice: params.price,
      hpp: totalHpp, // Derived HPP from component WAC
      minimumStock: 0,
      targetStock: 0,
      stock: 0, // Bundle does not have physical stock itself
      status: params.status || 'ACTIVE',
      createdAt: existingProduct?.createdAt || now,
      updatedAt: now
    };
    await db.products.put(productEntry);

    // 4. Audit Log
    if (params.userId) {
      await AuditEngine.log({
        userId: params.userId,
        role: params.role || 'OWNER',
        deviceId: params.deviceId || 'device-1',
        action: isNew ? 'CREATE_BUNDLE' : 'UPDATE_BUNDLE',
        module: 'INVENTORY',
        referenceId: bundleId,
        reason: `${isNew ? 'Membuat' : 'Memperbarui'} paket bundle ${params.name} (HPP derived: Rp ${totalHpp.toLocaleString()})`,
        after: bundleRecord
      });
    }

    // 5. Sync Queue
    await db.syncQueue.add({
      entityType: 'bundles',
      entityId: bundleId,
      action: isNew ? 'CREATE' : 'UPDATE',
      payload: bundleRecord,
      status: 'PENDING',
      retryCount: 0,
      createdAt: now
    });

    return bundleId;
  }

  /**
   * Delete or deactivate bundle.
   */
  static async deleteBundle(params: {
    bundleId: string;
    userId?: string;
    role?: string;
    deviceId?: string;
  }): Promise<void> {
    const existing = await db.bundles.get(params.bundleId);
    if (!existing) return;

    await db.bundles.delete(params.bundleId);
    
    // Set associated product to INACTIVE so it won't appear in POS
    await db.products.update(params.bundleId, {
      status: 'INACTIVE',
      updatedAt: new Date().toISOString()
    });

    if (params.userId) {
      await AuditEngine.log({
        userId: params.userId,
        role: params.role || 'OWNER',
        deviceId: params.deviceId || 'device-1',
        action: 'DELETE_BUNDLE',
        module: 'INVENTORY',
        referenceId: params.bundleId,
        reason: `Menghapus paket bundle ${existing.name}`
      });
    }

    await db.syncQueue.add({
      entityType: 'bundles',
      entityId: params.bundleId,
      action: 'DELETE',
      payload: { bundleId: params.bundleId },
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date().toISOString()
    });
  }
}
