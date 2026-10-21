import type { Customer, GajianTempoType } from '@/core/types';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

/**
 * Menghitung tanggal jatuh tempo gajian berdasarkan 2 tipe yang ditentukan:
 * 1. TANGGAL_6_7: Default di tanggal 6 atau 7 setiap bulannya.
 *    - Jika transaksi terjadi sebelum atau pas tanggal gajian (tanggal 1 s/d tanggal gajian), jatuh tempo adalah tanggal gajian bulan ini.
 *    - Jika transaksi terjadi setelah tanggal gajian (tanggal gajian + 1 s/d akhir bulan), jatuh tempo adalah tanggal gajian bulan berikutnya.
 * 2. SAME_DATE_NEXT_MONTH: Tanggal bayar sama persis seperti pada tanggal ambil barang di bulan depannya.
 *    - Contoh: Ambil barang tgl 15 -> Jatuh tempo tgl 15 bulan depan.
 */
export function calculateGajianDueDate(
  tempoType: GajianTempoType = 'TANGGAL_6_7',
  gajianDay: number = 7,
  referenceDate: Date = new Date()
): Date {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const day = referenceDate.getDate();

  if (tempoType === 'SAME_DATE_NEXT_MONTH') {
    const targetMonth = month + 1;
    const targetYear = year + (targetMonth > 11 ? 1 : 0);
    const normalizedMonth = targetMonth % 12;
    // Handle hari maksimal bulan berikutnya (misal 31 Januari -> 28 Februari)
    const maxDaysInTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    const targetDay = Math.min(day, maxDaysInTargetMonth);
    return new Date(targetYear, normalizedMonth, targetDay, 23, 59, 59);
  }

  // Tipe 1: TANGGAL_6_7
  const fixedDay = gajianDay === 6 ? 6 : 7;
  if (day <= fixedDay) {
    // Masih dalam periode sebelum/pada hari gajian bulan berjalan
    return new Date(year, month, fixedDay, 23, 59, 59);
  } else {
    // Lewat dari hari gajian bulan ini -> gajian bulan depannya
    const targetMonth = month + 1;
    const targetYear = year + (targetMonth > 11 ? 1 : 0);
    const normalizedMonth = targetMonth % 12;
    return new Date(targetYear, normalizedMonth, fixedDay, 23, 59, 59);
  }
}

/**
 * Format label keterangan jatuh tempo gajian untuk ditampilkan di UI POS / Kartu Pelanggan
 */
export function formatGajianDueDateLabel(dueDate: Date | string): string {
  const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  return format(d, 'EEEE, d MMMM yyyy', { locale: id });
}
