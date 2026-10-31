import { db } from '@/core/database';
import { cloudSetDoc, cloudUpdateDoc, cloudDeleteDoc } from '@/core/firestore-realtime';
import type { 
  PrepOrder, 
  PrepOrderItem, 
  PrepOrderStatus, 
  PrepOrderPriority, 
  PrepPaymentStatus,
  ScheduleCategory,
  ScheduleFulfillmentType
} from '@/core/types';

export class PrepOrderService {
  /**
   * Generate next order number, e.g. ORD-20261030-001 or SPK-20261030-001
   */
  static async generateOrderNumber(dateStr?: string, category?: ScheduleCategory): Promise<string> {
    const targetDate = dateStr || new Date().toISOString().split('T')[0];
    const prefixLetter = category === 'IKAN' ? 'IKN' : category === 'BUAH' ? 'BUH' : category === 'SEMBAKO' ? 'SBK' : 'ORD';
    const prefix = `${prefixLetter}-${targetDate.replace(/-/g, '')}`;
    
    try {
      const todayOrders = await db.prepOrders
        .where('scheduledDate')
        .equals(targetDate)
        .toArray();
      
      const nextSeq = (todayOrders.length + 1).toString().padStart(3, '0');
      return `${prefix}-${nextSeq}`;
    } catch {
      const rand = Math.floor(100 + Math.random() * 900);
      return `${prefix}-${rand}`;
    }
  }

  /**
   * Determine main category from order items if not explicitly set
   */
  static inferCategory(items: PrepOrderItem[], fallback: ScheduleCategory = 'IKAN'): ScheduleCategory {
    if (!items || items.length === 0) return fallback;
    const cats = new Set(items.map(it => it.category).filter(Boolean));
    if (cats.size === 1) return Array.from(cats)[0] as ScheduleCategory;
    if (cats.size > 1) return 'CAMPURAN';
    return fallback;
  }

  /**
   * Create a new preparation / pre-order task
   */
  static async createOrder(params: {
    scheduledDate: string;
    scheduledTime: string;
    category?: ScheduleCategory;
    fulfillmentType?: ScheduleFulfillmentType;
    customerName: string;
    customerPhone?: string;
    customerAddress?: string;
    deliveryFee?: number;
    priority?: PrepOrderPriority;
    items: Omit<PrepOrderItem, 'itemId'>[];
    paymentStatus?: PrepPaymentStatus;
    downPaymentAmount?: number;
    generalNotes?: string;
    assignedStaffName?: string;
    createdBy: string;
  }): Promise<PrepOrder> {
    const now = new Date().toISOString();
    const orderId = `po-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const category = params.category || this.inferCategory(params.items as PrepOrderItem[], 'IKAN');
    const orderNumber = await this.generateOrderNumber(params.scheduledDate, category);

    const items: PrepOrderItem[] = params.items.map((item, idx) => ({
      ...item,
      itemId: `item-${orderId}-${idx + 1}`,
      category: item.category || category,
      weightKg: Number(item.weightKg) || 0,
      quantityValue: Number(item.quantityValue) || Number(item.weightKg) || 1,
      quantityUnit: item.quantityUnit || 'KG',
      cleanScale: Boolean(item.cleanScale),
      cleanGills: Boolean(item.cleanGills),
      cleanGut: Boolean(item.cleanGut),
      cuttingStyle: item.cuttingStyle || 'UTUH',
      sizeSpec: item.sizeSpec || 'Standar',
      estimatedPrice: Number(item.estimatedPrice) || 0,
      fruitSpecs: item.fruitSpecs,
      sembakoSpecs: item.sembakoSpecs
    }));

    const totalWeightKg = items.reduce((sum, item) => sum + (Number(item.weightKg) || 0), 0);
    const totalQuantityPcs = items.reduce((sum, item) => sum + (item.quantityUnit === 'PCS' ? (Number(item.quantityValue) || 0) : 0), 0);
    const totalEstimatedPrice = items.reduce((sum, item) => sum + (Number(item.estimatedPrice) || 0), 0) + (Number(params.deliveryFee) || 0);

    const newOrder: PrepOrder = {
      orderId,
      orderNumber,
      category,
      fulfillmentType: params.fulfillmentType || 'PICKUP',
      customerName: params.customerName.trim(),
      customerPhone: params.customerPhone?.trim(),
      customerAddress: params.customerAddress?.trim(),
      deliveryFee: Number(params.deliveryFee) || 0,
      scheduledDate: params.scheduledDate,
      scheduledTime: params.scheduledTime || '09:00',
      priority: params.priority || 'NORMAL',
      status: 'PENDING',
      items,
      totalWeightKg,
      totalQuantityPcs,
      totalEstimatedPrice,
      paymentStatus: params.paymentStatus || 'UNPAID',
      downPaymentAmount: Number(params.downPaymentAmount) || 0,
      generalNotes: params.generalNotes?.trim(),
      assignedStaffName: params.assignedStaffName?.trim(),
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now
    };

    // Direct write to Cloud Firestore (Realtime & Instant)
    await cloudSetDoc('prepOrders', orderId, newOrder);

    return newOrder;
  }

  /**
   * Update the status of an order directly in cloud
   */
  static async updateStatus(orderId: string, status: PrepOrderStatus, staffName?: string): Promise<void> {
    const existing = await db.prepOrders.get(orderId);

    const now = new Date().toISOString();
    const updates: Partial<PrepOrder> = {
      status,
      updatedAt: now
    };

    if (status === 'IN_PROGRESS' && !existing?.startedAt) {
      updates.startedAt = now;
      if (staffName) updates.assignedStaffName = staffName;
    } else if (status === 'READY') {
      updates.readyAt = now;
      if (staffName && !existing?.assignedStaffName) updates.assignedStaffName = staffName;
    } else if (status === 'COMPLETED') {
      updates.completedAt = now;
      updates.paymentStatus = 'PAID';
    }

    await cloudUpdateDoc('prepOrders', orderId, updates);
  }

  /**
   * Update order details directly in cloud
   */
  static async updateOrder(orderId: string, updates: Partial<PrepOrder>): Promise<void> {
    const existing = await db.prepOrders.get(orderId);

    const items = updates.items || existing?.items || [];
    const totalWeightKg = items.reduce((sum, item) => sum + (Number(item.weightKg) || 0), 0);
    const totalQuantityPcs = items.reduce((sum, item) => sum + (item.quantityUnit === 'PCS' ? (Number(item.quantityValue) || 0) : 0), 0);
    const totalEstimatedPrice = items.reduce((sum, item) => sum + (Number(item.estimatedPrice) || 0), 0) + (Number(updates.deliveryFee ?? existing?.deliveryFee) || 0);

    await cloudUpdateDoc('prepOrders', orderId, {
      ...updates,
      items,
      totalWeightKg,
      totalQuantityPcs,
      totalEstimatedPrice,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Delete an order directly from cloud
   */
  static async deleteOrder(orderId: string): Promise<void> {
    await cloudDeleteDoc('prepOrders', orderId);
  }

  /**
   * Generate friendly WhatsApp notification text for customer
   */
  static getWhatsAppMessage(order: PrepOrder): string {
    const isPickup = order.fulfillmentType !== 'DELIVERY';
    const itemsList = order.items.map(it => {
      const qtyStr = it.quantityValue && it.quantityUnit 
        ? `${it.quantityValue} ${it.quantityUnit}` 
        : `${it.weightKg || 1} Kg`;
      return `- ${it.productName} (${qtyStr})`;
    }).join('\n');

    let msg = `Halo Kak ${order.customerName},\n\n`;
    if (order.status === 'READY') {
      if (isPickup) {
        msg += `Pesanan Anda di *Harapan Jaya* sudah *SIAP DIAMBIL* di toko!\n\n`;
      } else {
        msg += `Pesanan Anda di *Harapan Jaya* sudah siap dan sedang dipersiapkan untuk *DIKIRIM* ke alamat Anda!\n\n`;
      }
    } else {
      msg += `Konfirmasi pesanan Anda di *Harapan Jaya* (${order.orderNumber}):\n\n`;
    }

    msg += `*Detail Pesanan:*\n${itemsList}\n`;
    msg += `Waktu: ${order.scheduledDate} ${order.scheduledTime} WIB\n`;
    if (!isPickup && order.customerAddress) {
      msg += `Alamat Antar: ${order.customerAddress}\n`;
    }

    const remaining = (order.totalEstimatedPrice || 0) - (order.downPaymentAmount || 0);
    if (order.paymentStatus === 'PAID') {
      msg += `Status Pembayaran: *LUNAS*\n`;
    } else if (order.paymentStatus === 'DOWN_PAYMENT') {
      msg += `DP: Rp ${(order.downPaymentAmount || 0).toLocaleString('id-ID')} | Sisa Pelunasan: Rp ${remaining.toLocaleString('id-ID')}\n`;
    } else {
      msg += `Estimasi Total: Rp ${(order.totalEstimatedPrice || 0).toLocaleString('id-ID')} (Bayar saat pengambilan/sampai)\n`;
    }

    msg += `\nTerima kasih telah berbelanja di Harapan Jaya!`;
    return encodeURIComponent(msg);
  }

  /**
   * Calculate daily summary metrics with multi-category breakdown
   */
  static async getDailySummary(dateStr: string): Promise<{
    totalOrders: number;
    totalKg: number;
    totalPcs: number;
    pendingCount: number;
    inProgressCount: number;
    readyCount: number;
    completedCount: number;
    categoryCounts: {
      ikan: number;
      buah: number;
      sembako: number;
      campuran: number;
    };
    breakdown: Record<string, { qty: number; unit: string; category: string }>;
  }> {
    const orders = await db.prepOrders.where('scheduledDate').equals(dateStr).toArray();
    
    let totalKg = 0;
    let totalPcs = 0;
    let pendingCount = 0;
    let inProgressCount = 0;
    let readyCount = 0;
    let completedCount = 0;
    const categoryCounts = { ikan: 0, buah: 0, sembako: 0, campuran: 0 };
    const breakdown: Record<string, { qty: number; unit: string; category: string }> = {};

    orders.forEach(order => {
      if (order.status !== 'CANCELLED') {
        totalKg += order.totalWeightKg || 0;
        totalPcs += order.totalQuantityPcs || 0;
        
        const cat = (order.category || 'IKAN').toLowerCase() as 'ikan' | 'buah' | 'sembako' | 'campuran';
        if (categoryCounts[cat] !== undefined) {
          categoryCounts[cat]++;
        } else {
          categoryCounts.ikan++;
        }
      }

      if (order.status === 'PENDING') pendingCount++;
      else if (order.status === 'IN_PROGRESS') inProgressCount++;
      else if (order.status === 'READY') readyCount++;
      else if (order.status === 'COMPLETED') completedCount++;

      order.items?.forEach(item => {
        const key = item.productName || 'Produk';
        const qty = item.quantityValue || item.weightKg || 1;
        const unit = item.quantityUnit || (item.weightKg ? 'KG' : 'PCS');
        const cat = item.category || order.category || 'IKAN';

        if (!breakdown[key]) {
          breakdown[key] = { qty, unit, category: cat };
        } else {
          breakdown[key].qty += qty;
        }
      });
    });

    return {
      totalOrders: orders.filter(o => o.status !== 'CANCELLED').length,
      totalKg,
      totalPcs,
      pendingCount,
      inProgressCount,
      readyCount,
      completedCount,
      categoryCounts,
      breakdown
    };
  }

  /**
   * Seed realistic sample orders for Fish, Fruit, and Sembako if database has none
   */
  static async seedInitialOrdersIfEmpty(): Promise<void> {
    try {
      const count = await db.prepOrders.count();
      if (count > 0) return;

      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      // Sample 1: IKAN (Nila & Gurame)
      await this.createOrder({
        scheduledDate: today,
        scheduledTime: '10:00',
        category: 'IKAN',
        fulfillmentType: 'PICKUP',
        customerName: 'Ibu Hj. Aminah (Resto Minang)',
        customerPhone: '081234567890',
        priority: 'URGENT',
        paymentStatus: 'DOWN_PAYMENT',
        downPaymentAmount: 100000,
        generalNotes: 'Tolong buang sisik dan empedu jangan sampai pecah. Potong 2 untuk gulai kepala kakap & sop.',
        createdBy: 'Owner',
        assignedStaffName: 'Budi (Fish Prep)',
        items: [
          {
            productName: 'Ikan Nila Merah Segar',
            category: 'IKAN',
            weightKg: 5,
            quantityValue: 5,
            quantityUnit: 'KG',
            sizeSpec: '1 kg isi 2-3 ekor',
            cleanScale: true,
            cleanGills: true,
            cleanGut: true,
            cuttingStyle: 'POTONG_2',
            packagingNotes: 'Plastik rangkap 2 + es batu dasar',
            estimatedPrice: 175000
          },
          {
            productName: 'Ikan Gurame Hidup',
            category: 'IKAN',
            weightKg: 3.5,
            quantityValue: 3.5,
            quantityUnit: 'KG',
            sizeSpec: 'Jumbo (800gr - 1kg per ekor)',
            cleanScale: true,
            cleanGills: true,
            cleanGut: true,
            cuttingStyle: 'BELAH_BAKAR',
            packagingNotes: 'Belah punggung kupu-kupu siap bakar',
            estimatedPrice: 192500
          }
        ]
      });

      // Sample 2: BUAH (Mangga Arum Manis & Jeruk Berastagi)
      await this.createOrder({
        scheduledDate: today,
        scheduledTime: '13:30',
        category: 'BUAH',
        fulfillmentType: 'DELIVERY',
        customerName: 'Pak Hendra (Kantor Camat)',
        customerPhone: '081398765432',
        customerAddress: 'Kantor Kecamatan Ruang Aula Lt. 2, Jl. Pemuda No. 12',
        deliveryFee: 15000,
        priority: 'VIP_EVENT',
        paymentStatus: 'PAID',
        downPaymentAmount: 350000,
        generalNotes: 'Untuk jamuan tamu VIP bupati. Pilihkan buah yang mulus dan wangi manis.',
        createdBy: 'Owner',
        assignedStaffName: 'Siti (Kasir)',
        items: [
          {
            productName: 'Mangga Arum Manis Super',
            category: 'BUAH',
            weightKg: 6,
            quantityValue: 6,
            quantityUnit: 'KG',
            sizeSpec: 'Grade A (1 kg isi 2 buah)',
            fruitSpecs: {
              ripeness: 'MATANG_POHON',
              grade: 'SUPER_A',
              packaging: 'KARTON_DUS',
              notes: 'Pilih yang kuning kemerahan, wangi, siap potong'
            },
            estimatedPrice: 180000
          },
          {
            productName: 'Jeruk Berastagi Manis',
            category: 'BUAH',
            weightKg: 5,
            quantityValue: 5,
            quantityUnit: 'KG',
            sizeSpec: 'Sedang Berair (1 kg isi 7-8 buah)',
            fruitSpecs: {
              ripeness: 'SIAP_KONSUMSI',
              grade: 'SUPER_A',
              packaging: 'KERANJANG_PARCEL',
              notes: 'Kulit bersih tanpa bercak hitam, manis segar'
            },
            estimatedPrice: 155000
          }
        ]
      });

      // Sample 3: SEMBAKO (Beras, Minyak, Gula - Paket Bansos/Sedekah)
      await this.createOrder({
        scheduledDate: tomorrow,
        scheduledTime: '08:30',
        category: 'SEMBAKO',
        fulfillmentType: 'PICKUP',
        customerName: 'Ibu Dewi Kurnia (Yayasan Anak Yatim)',
        customerPhone: '085211223344',
        priority: 'NORMAL',
        paymentStatus: 'DOWN_PAYMENT',
        downPaymentAmount: 500000,
        generalNotes: 'Paket sembako santunan 20 kantong. Harap cek tanggal expired minyak dan kerapian kantong repack.',
        createdBy: 'Owner',
        items: [
          {
            productName: 'Beras Ramos Super (5 Kg)',
            category: 'SEMBAKO',
            quantityValue: 20,
            quantityUnit: 'SAK',
            weightKg: 100,
            sizeSpec: 'Sak 5 Kg berlabel',
            sembakoSpecs: {
              packagingType: 'PAKET_BANSOS_SEDEKAH',
              repackSpec: '20 sak @ 5kg siap bagi',
              sealCheck: true,
              notes: 'Kondisi karung bersih tidak berdebu'
            },
            estimatedPrice: 1440000
          },
          {
            productName: 'Minyak Goreng Sania 2L',
            category: 'SEMBAKO',
            quantityValue: 20,
            quantityUnit: 'PCS',
            weightKg: 36,
            sizeSpec: 'Pouch 2 Liter',
            sembakoSpecs: {
              packagingType: 'PAKET_BANSOS_SEDEKAH',
              repackSpec: '1 pouch per paket bingkisan',
              sealCheck: true,
              notes: 'Exp 2027 aman'
            },
            estimatedPrice: 720000
          },
          {
            productName: 'Gula Pasir Kristal Putih',
            category: 'SEMBAKO',
            quantityValue: 20,
            quantityUnit: 'PCS',
            weightKg: 20,
            sizeSpec: 'Kemasan 1 Kg',
            sembakoSpecs: {
              packagingType: 'REPACK_ECER',
              repackSpec: '20 bungkus @ 1kg',
              sealCheck: true,
              notes: 'Tutup rapat dan timbangan pas 1000gr'
            },
            estimatedPrice: 340000
          }
        ]
      });
    } catch (err) {
      console.warn('Error seeding initial prep orders:', err);
    }
  }
}
