import type { UnitConversion, Product } from '../types';

/**
 * Format raw stock in baseUnit into intuitive retail packaging breakdown.
 * Example: 107 BATANG with rule (1 BUNGKUS = 20 BATANG) -> "5 BUNGKUS + 7 BATANG"
 */
export function formatMultiUnitBreakdown(
  stock: number,
  baseUnit: string,
  conversionRules?: UnitConversion[]
): string {
  const currentStock = Math.round(stock);

  if (!conversionRules || conversionRules.length === 0) {
    return `${currentStock} ${baseUnit}`;
  }

  // Filter valid rules where factor > 1 (packaging units) and sort descending
  const packRules = [...conversionRules]
    .filter(r => r.factor > 1)
    .sort((a, b) => b.factor - a.factor);

  if (packRules.length === 0) {
    return `${currentStock} ${baseUnit}`;
  }

  // Check if negative
  const isNegative = currentStock < 0;
  let remaining = Math.abs(currentStock);
  const parts: string[] = [];

  for (const rule of packRules) {
    const fullPacks = Math.floor(remaining / rule.factor);
    if (fullPacks > 0) {
      parts.push(`${fullPacks} ${rule.toUnit}`);
      remaining = remaining % rule.factor;
    }
  }

  if (remaining > 0 || parts.length === 0) {
    parts.push(`${remaining} ${baseUnit}`);
  }

  const result = parts.join(' + ');
  return isNegative ? `-${result}` : result;
}

/**
 * Return all selectable selling units for a product with their respective prices.
 */
export function getProductAvailableUnits(
  product: Product,
  fallbackBasePrice?: number
): { unit: string; price: number; factor: number; barcode?: string }[] {
  const basePrice = fallbackBasePrice ?? product.normalPrice;
  const list: { unit: string; price: number; factor: number; barcode?: string }[] = [
    {
      unit: product.baseUnit,
      price: basePrice,
      factor: 1,
      barcode: product.barcode
    }
  ];

  if (product.conversionRules && product.conversionRules.length > 0) {
    for (const rule of product.conversionRules) {
      const unitPrice = rule.price && rule.price > 0 ? rule.price : basePrice * rule.factor;
      list.push({
        unit: rule.toUnit,
        price: unitPrice,
        factor: rule.factor,
        barcode: rule.barcode
      });
    }
  }

  return list;
}

export interface UnitHierarchyItem {
  unit: string;
  factorToBase: number;
  ratioToNext?: number;
  nextUnit?: string;
  isBase: boolean;
  price?: number;
  barcode?: string;
}

/**
 * Calculates ordered hierarchy from largest packaging unit down to the base unit.
 * E.g., for baseUnit: 'BATANG', rules: [{ toUnit: 'BUNGKUS', factor: 20 }, { toUnit: 'SLOP', factor: 200 }]
 * Returns:
 * [
 *   { unit: 'SLOP', factorToBase: 200, ratioToNext: 10, nextUnit: 'BUNGKUS', isBase: false },
 *   { unit: 'BUNGKUS', factorToBase: 20, ratioToNext: 20, nextUnit: 'BATANG', isBase: false },
 *   { unit: 'BATANG', factorToBase: 1, isBase: true }
 * ]
 */
export function calculateUnitHierarchy(
  baseUnit: string,
  conversionRules?: UnitConversion[]
): UnitHierarchyItem[] {
  const normBase = (baseUnit || 'PCS').trim().toUpperCase();
  const validRules = (conversionRules || [])
    .filter(r => r.toUnit && r.factor > 0 && r.toUnit.trim().toUpperCase() !== normBase);

  // Group and sort descending by factor
  const sorted = [...validRules].sort((a, b) => b.factor - a.factor);

  const hierarchy: UnitHierarchyItem[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const nextUnit = next ? next.toUnit.toUpperCase() : normBase;
    const nextFactor = next ? next.factor : 1;
    const ratioToNext = nextFactor > 0 ? current.factor / nextFactor : current.factor;

    hierarchy.push({
      unit: current.toUnit.toUpperCase(),
      factorToBase: current.factor,
      ratioToNext: Number(ratioToNext.toFixed(2)),
      nextUnit,
      isBase: false,
      price: current.price,
      barcode: current.barcode
    });
  }

  // Finally add base unit at the bottom
  hierarchy.push({
    unit: normBase,
    factorToBase: 1,
    isBase: true
  });

  return hierarchy;
}

/**
 * Generates an easy-to-read mathematical conversion chain string.
 * E.g. "1 SLOP = 10 BUNGKUS = 200 BATANG"
 */
export function getUnitConversionChainString(
  baseUnit: string,
  conversionRules?: UnitConversion[]
): string {
  const hierarchy = calculateUnitHierarchy(baseUnit, conversionRules);
  if (hierarchy.length <= 1) {
    return `1 ${baseUnit || 'PCS'} (Satuan Tunggal)`;
  }

  const top = hierarchy[0];
  const parts: string[] = [`1 ${top.unit}`];

  for (let i = 1; i < hierarchy.length; i++) {
    const item = hierarchy[i];
    // How many of this item are in 1 top unit?
    const qtyInTop = item.factorToBase > 0 ? top.factorToBase / item.factorToBase : 0;
    const formattedQty = Number.isInteger(qtyInTop) ? qtyInTop : Number(qtyInTop.toFixed(2));
    parts.push(`${formattedQty} ${item.unit}`);
  }

  return parts.join(' = ');
}
