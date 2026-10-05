import { db } from '../database';
import type { Transaction, ReceiptSettings } from '../types';
import { format } from 'date-fns';

export interface ShiftSummaryPrintData {
  shiftId: string;
  cashierName: string;
  deviceId: string;
  startTime: string;
  endTime?: string;
  status: 'OPEN' | 'CLOSED';
  totalTransactions: number;
  totalSales: number;
  cashSales: number;
  nonCashSales: number;
  startingCash: number;
  expectedCash: number;
  actualCash?: number;
  discrepancy?: number;
  notes?: string;
}

export class PrintService {
  private static executePrint(html: string): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      return;
    }

    // Fallback using invisible iframe for environments where window.open is restricted
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const frameDoc = iframe.contentWindow?.document;
    if (frameDoc) {
      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 2000);
  }

  static async printReceipt(transaction: Transaction): Promise<void> {
    const settings: ReceiptSettings = await db.settings.get('current') || {
      storeName: 'TOKO HARAPAN JAYA',
      address: 'Jl. Raya Cikande No. 123',
      phone: '0812-3456-7890',
      footerMessage: 'Terima kasih telah berbelanja!',
      paperWidth: '58mm'
    };

    const is58mm = settings.paperWidth === '58mm';
    const width = is58mm ? '200px' : '300px';

    const itemsHtml = transaction.items.map(item => {
      const bundleLines = (item.isBundle && item.bundleComponentsSnapshot?.length)
        ? `<div style="padding-left: 8px; font-size: 0.8em; color: #444; margin-bottom: 2px;">
            ${item.bundleComponentsSnapshot.map(c => `+ ${c.totalQty} ${c.unit} ${c.nameSnapshot}`).join('<br/>')}
          </div>`
        : '';

      return `
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span style="text-transform: uppercase; font-weight: bold;">${item.nameSnapshot} ${item.isBundle ? '[PAKET]' : ''}</span>
          <span>${item.quantity.toFixed(2)}</span>
        </div>
        ${bundleLines}
        <div style="display: flex; justify-content: space-between; padding-left: 8px; margin-bottom: 6px; font-size: 0.9em;">
          <span>@ ${item.unitPrice.toLocaleString()}</span>
          <span>${item.subtotal.toLocaleString()}</span>
        </div>
      `;
    }).join('');

    const html = `
      <html>
        <head>
          <style>
            @page { margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              font-size: 12px; 
              width: ${width}; 
              margin: 0 auto; 
              padding: 10px;
              color: #000;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .dashed { border-bottom: 1px dashed #000; margin: 8px 0; }
            .flex-between { display: flex; justify-content: space-between; }
            .footer { margin-top: 15px; font-style: italic; font-size: 0.8em; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="bold" style="font-size: 1.2em; text-transform: uppercase;">${settings.storeName}</div>
            <div style="white-space: pre-line;">${settings.address}</div>
            <div>Telp: ${settings.phone}</div>
          </div>

          <div class="dashed"></div>

          <div class="flex-between">
            <span>${format(new Date(transaction.clientTimestamp), 'dd/MM/yy')}</span>
            <span>${format(new Date(transaction.clientTimestamp), 'HH:mm')}</span>
          </div>
          <div style="font-size: 0.8em;">No: ${transaction.receiptNumber}</div>
          <div style="font-size: 0.8em;">Kasir: ${transaction.cashierId.slice(-6).toUpperCase()}</div>

          <div class="dashed"></div>

          ${itemsHtml}

          <div class="dashed"></div>

          <div class="flex-between bold">
            <span>SUBTOTAL</span>
            <span>${transaction.subtotal.toLocaleString()}</span>
          </div>
          ${transaction.discount > 0 ? `
            <div class="flex-between">
              <span>DISCOUNT</span>
              <span>-${transaction.discount.toLocaleString()}</span>
            </div>
          ` : ''}
          <div class="flex-between bold" style="font-size: 1.1em;">
            <span>TOTAL</span>
            <span>${transaction.total.toLocaleString()}</span>
          </div>

          <div class="dashed"></div>

          <div class="center footer">
            <p style="white-space: pre-line;">${settings.footerMessage}</p>
            <p style="margin-top: 10px; font-size: 0.7em;">Powered by Harapan Jaya POS</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() {
                window.close();
              };
            };
          </script>
        </body>
      </html>
    `;

    this.executePrint(html);
  }

  static async printShiftSummary(data: ShiftSummaryPrintData): Promise<void> {
    const settings: ReceiptSettings = await db.settings.get('current') || {
      storeName: 'TOKO HARAPAN JAYA',
      address: 'Jl. Raya Cikande No. 123',
      phone: '0812-3456-7890',
      footerMessage: 'Terima kasih telah berbelanja!',
      paperWidth: '58mm'
    };

    const is58mm = settings.paperWidth === '58mm';
    const width = is58mm ? '200px' : '300px';

    const startTimeFormatted = format(new Date(data.startTime), 'dd/MM/yy HH:mm');
    const endTimeFormatted = data.endTime 
      ? format(new Date(data.endTime), 'dd/MM/yy HH:mm') 
      : 'AKTIF (BERJALAN)';
    const printedAtFormatted = format(new Date(), 'dd/MM/yy HH:mm:ss');

    const html = `
      <html>
        <head>
          <style>
            @page { margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              font-size: 12px; 
              width: ${width}; 
              margin: 0 auto; 
              padding: 10px;
              color: #000;
              line-height: 1.35;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .dashed { border-bottom: 1px dashed #000; margin: 8px 0; }
            .flex-between { display: flex; justify-content: space-between; }
            .section-title { font-weight: bold; margin-top: 6px; margin-bottom: 3px; text-transform: uppercase; font-size: 0.9em; }
            .footer { margin-top: 15px; font-style: italic; font-size: 0.8em; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="bold" style="font-size: 1.15em; text-transform: uppercase;">${settings.storeName}</div>
            <div style="white-space: pre-line; font-size: 0.85em;">${settings.address}</div>
            <div style="font-size: 0.85em;">Telp: ${settings.phone}</div>
          </div>

          <div class="dashed"></div>

          <div class="center bold" style="font-size: 1.05em; margin-bottom: 4px;">
            RINGKASAN SHIFT KASIR
          </div>
          <div class="center" style="font-size: 0.8em; margin-bottom: 6px;">
            [${data.status === 'OPEN' ? 'SESI SEDANG BERJALAN' : 'SESI SUDAH DITUTUP'}]
          </div>

          <div class="flex-between">
            <span>Shift ID:</span>
            <span class="bold">#${data.shiftId.slice(-6).toUpperCase()}</span>
          </div>
          <div class="flex-between">
            <span>Kasir:</span>
            <span class="bold">${data.cashierName}</span>
          </div>
          <div class="flex-between">
            <span>Terminal:</span>
            <span>${data.deviceId}</span>
          </div>
          <div class="flex-between">
            <span>Buka:</span>
            <span>${startTimeFormatted}</span>
          </div>
          <div class="flex-between">
            <span>Tutup:</span>
            <span>${endTimeFormatted}</span>
          </div>

          <div class="dashed"></div>

          <div class="section-title">STATISTIK PENJUALAN</div>
          <div class="flex-between">
            <span>Total Transaksi:</span>
            <span class="bold">${data.totalTransactions} Struk</span>
          </div>
          <div class="flex-between bold" style="font-size: 1.05em; margin-top: 4px;">
            <span>TOTAL OMZET:</span>
            <span>Rp ${data.totalSales.toLocaleString()}</span>
          </div>

          <div class="dashed"></div>

          <div class="section-title">METODE PEMBAYARAN</div>
          <div class="flex-between">
            <span>Tunai (Cash):</span>
            <span class="bold">Rp ${data.cashSales.toLocaleString()}</span>
          </div>
          <div class="flex-between">
            <span>Non-Tunai (QRIS/Trf):</span>
            <span class="bold">Rp ${data.nonCashSales.toLocaleString()}</span>
          </div>

          <div class="dashed"></div>

          <div class="section-title">REKONSILIASI KAS LACI</div>
          <div class="flex-between">
            <span>Modal Awal:</span>
            <span>Rp ${data.startingCash.toLocaleString()}</span>
          </div>
          <div class="flex-between">
            <span>Penjualan Tunai:</span>
            <span>+Rp ${data.cashSales.toLocaleString()}</span>
          </div>
          <div class="flex-between bold" style="margin-top: 3px;">
            <span>Uang Seharusnya:</span>
            <span>Rp ${data.expectedCash.toLocaleString()}</span>
          </div>

          ${data.actualCash !== undefined ? `
            <div class="flex-between bold" style="margin-top: 3px;">
              <span>Uang Fisik Dihitung:</span>
              <span>Rp ${data.actualCash.toLocaleString()}</span>
            </div>
            <div class="flex-between bold" style="color: #000; margin-top: 3px;">
              <span>Selisih (Discrepancy):</span>
              <span>${data.discrepancy === 0 ? 'PAS (Rp 0)' : `${data.discrepancy! > 0 ? '+' : ''}Rp ${data.discrepancy!.toLocaleString()}`}</span>
            </div>
          ` : ''}

          ${data.notes ? `
            <div class="dashed"></div>
            <div class="section-title">CATATAN KASIR</div>
            <div style="font-style: italic; font-size: 0.9em; word-break: break-word;">
              "${data.notes}"
            </div>
          ` : ''}

          <div class="dashed"></div>

          <div class="center footer">
            <div>Dicetak: ${printedAtFormatted}</div>
            <p style="margin-top: 6px; font-size: 0.75em;">*** LAPORAN RESMI HARAPAN JAYA POS ***</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() {
                window.close();
              };
            };
          </script>
        </body>
      </html>
    `;

    this.executePrint(html);
  }
}
