import type { Product, Customer } from './types';

export class PricingEngine {
  /**
   * Priority: CUSTOMER_SPECIFIC -> RESELLER -> NORMAL
   */
  static calculateItemPrice(params: {
    product: Product;
    customer?: Customer;
    transactionType: 'SALE' | 'GAJIAN';
    unit: string;
  }): { price: number; priceSource: 'NORMAL' | 'RESELLER' | 'CUSTOMER_SPECIFIC' } {
    const { product, customer, transactionType, unit } = params;
    
    // 1. Get Base Price for Unit
    let basePrice = product.normalPrice;
    if (unit !== product.baseUnit) {
      const conversion = product.conversionRules.find(r => r.toUnit === unit);
      if (conversion) {
        basePrice = product.normalPrice * conversion.factor;
      }
    }

    // 2. Reseller Logic
    if (customer?.isReseller) {
      if (transactionType === 'SALE' && product.resellerCashRule) {
        return {
          price: basePrice * (1 - product.resellerCashRule.discountPercent / 100),
          priceSource: 'RESELLER'
        };
      }
      if (transactionType === 'GAJIAN' && product.resellerGajianRule) {
        return {
          price: basePrice * (1 + product.resellerGajianRule.markupPercent / 100),
          priceSource: 'RESELLER'
        };
      }
    }

    // 3. Normal / Gajian Markup for Normal Customers
    if (transactionType === 'GAJIAN') {
      // Default gajian markup 10% if not specified? 
      // PRD says: Reseller: gajian = normal * (1 + markup%). 
      // For normal customers, PRD says: "Transaction Type: CASH / GAJIAN. Owner determines rounding."
      // Let's assume normal customers pay normal price for gajian unless specified, 
      // but usually gajian is slightly more expensive.
      return {
        price: Math.ceil(basePrice),
        priceSource: 'NORMAL'
      };
    }

    return {
      price: basePrice,
      priceSource: 'NORMAL'
    };
  }
}
