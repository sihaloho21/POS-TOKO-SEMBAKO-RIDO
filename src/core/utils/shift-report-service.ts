import { format } from 'date-fns';
import type { CashierShift, User } from '../types';
import { db } from '../database';

export class ShiftReportService {
  static async printReconciliationReceipt(shift: CashierShift, user: User): Promise<void> {
    const is58mm = true; // Default to 58mm for cashier printer
    const width = is58mm ? '200px' : '300px';

    const difference = (shift.actualCash || 0) - (shift.expectedCash || 0);
    const status = difference === 0 ? 'RECONCILED' : difference > 0 ? 'OVERAGE' : 'SHORTAGE';

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
            .status-box { 
              border: 1px solid #000; 
              padding: 4px; 
              text-align: center; 
              margin: 10px 0; 
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="bold" style="font-size: 1.2em;">REKONSILIASI SHIFT</div>
            <div class="bold">HARAPAN JAYA POS</div>
          </div>

          <div class="dashed"></div>

          <div class="flex-between">
            <span>Buka:</span>
            <span>${format(new Date(shift.startTime), 'dd/MM HH:mm')}</span>
          </div>
          <div class="flex-between">
            <span>Tutup:</span>
            <span>${shift.endTime ? format(new Date(shift.endTime), 'dd/MM HH:mm') : '-'}</span>
          </div>
          <div class="flex-between">
            <span>Kasir:</span>
            <span>${user.name.toUpperCase()}</span>
          </div>
          <div class="flex-between">
            <span>Device:</span>
            <span>${shift.deviceId}</span>
          </div>

          <div class="dashed"></div>

          <div class="flex-between">
            <span>MODAL AWAL:</span>
            <span>Rp ${shift.startingCash.toLocaleString()}</span>
          </div>
          
          <div class="flex-between bold">
            <span>EXPECTED CASH:</span>
            <span>Rp ${shift.expectedCash?.toLocaleString() || 0}</span>
          </div>

          <div class="flex-between bold">
            <span>ACTUAL CASH:</span>
            <span>Rp ${shift.actualCash?.toLocaleString() || 0}</span>
          </div>

          <div class="dashed"></div>

          <div class="flex-between bold" style="font-size: 1.1em;">
            <span>SELISIH:</span>
            <span>Rp ${difference.toLocaleString()}</span>
          </div>

          <div class="status-box">
            STATUS: ${status}
          </div>

          <div class="dashed"></div>

          <div class="center footer">
            <p>Dicetak pada: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}</p>
            <p style="margin-top: 10px;">Tanda Tangan Kasir</p>
            <br/><br/><br/>
            <p>( ____________________ )</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            };
          </script>
        </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 100);
      }, 500);
    }
  }
}
