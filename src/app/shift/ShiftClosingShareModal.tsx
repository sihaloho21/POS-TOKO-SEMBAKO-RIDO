import React, { useState } from 'react';
import { 
  X, 
  Share2, 
  Copy, 
  CheckCircle, 
  MessageCircle,
  ExternalLink,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import type { ShiftClosingMetrics } from '@/core/services/shift-service';
import { useToastStore } from '@/core/toast-store';

interface ShiftClosingShareModalProps {
  isOpen: boolean;
  metrics: ShiftClosingMetrics;
  onClose: () => void;
}

export default function ShiftClosingShareModal({ isOpen, metrics, onClose }: ShiftClosingShareModalProps) {
  const { addToast } = useToastStore();
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen) return null;

  const { shift, transactionCount, omzet, cashIn, cashOut, paymentBreakdown, expectedCash, storageBreakdown } = metrics;

  const generateSummaryText = () => {
    const startTime = format(new Date(shift.startTime), 'dd MMM yyyy, HH:mm');
    const endTime = shift.endTime ? format(new Date(shift.endTime), 'dd MMM yyyy, HH:mm') : 'Sekarang';
    
    let text = `*RINGKASAN CLOSING KASIR*\n`;
    text += `-------------------------\n`;
    text += `*Shift ID:* ${shift.shiftId.slice(-8).toUpperCase()}\n`;
    text += `*Kasir:* ${shift.userId}\n`;
    text += `*Waktu:* ${startTime} - ${endTime}\n`;
    text += `*Terminal:* ${shift.deviceId}\n\n`;

    text += `*METRIK UTAMA*\n`;
    text += `- Total Transaksi: ${transactionCount}\n`;
    text += `- Total Omzet: Rp ${omzet.toLocaleString()}\n`;
    text += `- Modal Awal: Rp ${shift.startingCash.toLocaleString()} (L: Rp ${(shift.startingCashBills || 0).toLocaleString()}, K: Rp ${(shift.startingCashCoins || 0).toLocaleString()})\n`;
    text += `- Cash In (Modal+Tunai): Rp ${cashIn.toLocaleString()}\n`;
    text += `- Cash Out (Pengeluaran): Rp ${cashOut.toLocaleString()}\n\n`;

    text += `*RINCIAN PEMBAYARAN*\n`;
    Object.entries(paymentBreakdown).forEach(([method, amt]) => {
      if (amt > 0) text += `- ${method}: Rp ${amt.toLocaleString()}\n`;
    });
    text += `\n`;

    text += `*OMZET PER STORAGE*\n`;
    text += `- WARUNG: Rp ${(storageBreakdown?.['WARUNG'] || 0).toLocaleString()}\n`;
    text += `- IKAN: Rp ${(storageBreakdown?.['IKAN'] || 0).toLocaleString()}\n`;
    text += `- DIGITAL: Rp ${(storageBreakdown?.['UANG_DIGITAL'] || 0).toLocaleString()}\n\n`;

    text += `*REKONSILIASI KAS*\n`;
    text += `- Expected Cash: Rp ${expectedCash.toLocaleString()}\n`;
    text += `- Actual Cash: Rp ${(shift.actualCash || 0).toLocaleString()}\n`;
    text += `- Selisih: Rp ${(shift.discrepancy || 0).toLocaleString()} ${shift.discrepancy === 0 ? '(PAS)' : (shift.discrepancy! > 0 ? '(SURPLUS)' : '(DEFISIT)')}\n`;
    if (shift.discrepancyReason) {
      text += `- Alasan: ${shift.discrepancyReason}\n`;
    }
    text += `\n`;

    if (shift.endNotes) {
      text += `*Catatan Akhir:* ${shift.endNotes}\n`;
    }

    text += `\n_Laporan dikirim secara otomatis via Harapan Jaya POS_`;
    
    return text;
  };

  const handleCopyToClipboard = async () => {
    const text = generateSummaryText();
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      addToast('Ringkasan berhasil disalin ke clipboard!', 'success');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      addToast('Gagal menyalin teks.', 'error');
    }
  };

  const handleShareToWhatsApp = () => {
    const text = generateSummaryText();
    handleCopyToClipboard(); // Automatically copy as requested
    
    const encodedText = encodeURIComponent(text);
    const whatsappUrl = `https://wa.me/?text=${encodedText}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] max-w-md w-full overflow-hidden shadow-2xl border border-slate-200"
      >
        {/* Banner Success */}
        <div className="bg-emerald-600 p-8 text-center text-white relative">
          <div className="absolute top-4 right-4">
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <CheckCircle size={40} className="text-white" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight">Closing Berhasil!</h2>
          <p className="text-emerald-100 text-sm font-medium mt-1">Shift telah ditutup dan kas telah direkonsiliasi.</p>
        </div>

        <div className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Bagikan Laporan Ke Owner</p>
            <p className="text-xs text-slate-400">Klik tombol di bawah untuk menyalin ringkasan dan mengirimkannya melalui WhatsApp.</p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={handleShareToWhatsApp}
              className="group relative flex items-center justify-center gap-4 py-6 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-3xl shadow-xl shadow-emerald-200 transition-all active:scale-95"
            >
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110">
                <MessageCircle size={28} fill="currentColor" />
              </div>
              <div className="text-left">
                <span className="block text-xs font-black uppercase tracking-widest opacity-80">Kirim Laporan</span>
                <span className="block text-lg font-black tracking-tight">WhatsApp Owner</span>
              </div>
              <ExternalLink size={18} className="absolute right-6 opacity-40" />
            </button>

            <button
              onClick={handleCopyToClipboard}
              className="flex items-center justify-center gap-3 py-4 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl border border-slate-200 transition-all font-black text-xs uppercase tracking-widest"
            >
              {isCopied ? (
                <>
                  <CheckCircle size={16} className="text-emerald-500" />
                  <span>Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy size={16} />
                  <span>Salin Teks Ringkasan</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={onClose}
              className="w-full py-4 text-slate-400 hover:text-slate-600 font-bold text-xs uppercase tracking-widest transition-colors"
            >
              Selesai & Keluar
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
