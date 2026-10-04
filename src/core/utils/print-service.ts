import { db } from '../database';
import type { Transaction, ReceiptSettings } from '../types';
import { format } from 'date-fns';

export class PrintService {
  static async printReceipt(transaction: Transaction): Promise<void> {
    const settings: ReceiptSettings = await db.settings.get('current') || {
      storeName: 'TOKO HARAPAN JAYA',
      address: 'Jl. Raya Cikande No. 123',
      phone: '0812-3456-7890',
      footerMessage: 'Terima kasih telah berbelanja!',
      paperWidth: '58mm'
    };

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const is58mm = settings.paperWidth === '58mm';
    const width = is58mm ? '200px' : '300px';

    const itemsHtml = transaction.items.map(item => `
      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
        <span style="text-transform: uppercase; font-weight: bold;">${item.nameSnapshot}</span>
        <span>${item.quantity.toFixed(2)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding-left: 10px; margin-bottom: 6px; font-size: 0.9em;">
        <span>@ ${item.unitPrice.toLocaleString()}</span>
        <span>${item.subtotal.toLocaleString()}</span>
      </div>
    `).join('');

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

    printWindow.document.write(html);
    printWindow.document.close();
  }
}
