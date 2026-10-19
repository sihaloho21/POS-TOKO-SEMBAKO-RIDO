import React from 'react';
import { Banknote, Coins, RotateCcw, Calculator } from 'lucide-react';

export interface DenominationItem {
  value: number;
  label: string;
  type: 'BILL' | 'COIN';
  color: string;
}

export const STANDARD_DENOMINATIONS: DenominationItem[] = [
  { value: 100000, label: 'Rp 100.000', type: 'BILL', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  { value: 50000, label: 'Rp 50.000', type: 'BILL', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  { value: 20000, label: 'Rp 20.000', type: 'BILL', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { value: 10000, label: 'Rp 10.000', type: 'BILL', color: 'text-purple-700 bg-purple-50 border-purple-200' },
  { value: 5000, label: 'Rp 5.000', type: 'BILL', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 2000, label: 'Rp 2.000', type: 'BILL', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  { value: 1000, label: 'Rp 1.000', type: 'BILL', color: 'text-teal-700 bg-teal-50 border-teal-200' },
  { value: 500, label: 'Rp 500 (Koin)', type: 'COIN', color: 'text-amber-800 bg-amber-50/50 border-amber-300' },
  { value: 200, label: 'Rp 200 (Koin)', type: 'COIN', color: 'text-slate-600 bg-slate-50 border-slate-200' },
  { value: 100, label: 'Rp 100 (Koin)', type: 'COIN', color: 'text-slate-600 bg-slate-50 border-slate-200' },
];

interface CashDenominationCounterProps {
  counts: Record<string, number>;
  onChange: (counts: Record<string, number>, total: number) => void;
  readOnly?: boolean;
}

export function CashDenominationCounter({ counts, onChange, readOnly = false }: CashDenominationCounterProps) {
  const handleCountChange = (valStr: string, countStr: string) => {
    const qty = Math.max(0, parseInt(countStr, 10) || 0);
    const updated = { ...counts, [valStr]: qty };
    
    // Calculate total
    let total = 0;
    for (const [v, q] of Object.entries(updated)) {
      total += (Number(v) || 0) * (q || 0);
    }
    onChange(updated, total);
  };

  const handleReset = () => {
    onChange({}, 0);
  };

  const totalCalculated = Object.entries(counts).reduce((acc, [v, q]) => acc + (Number(v) || 0) * (q || 0), 0);
  const totalItems = Object.values(counts).reduce((acc, q) => acc + (q || 0), 0);

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator size={16} className="text-indigo-600" />
          <span className="text-xs font-black uppercase tracking-wider text-slate-800">
            Kalkulator Hitung Lembaran & Koin Fisik
          </span>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={handleReset}
            className="text-[10px] font-bold text-slate-400 hover:text-rose-600 flex items-center gap-1 transition-colors"
          >
            <RotateCcw size={11} /> Reset Hitungan
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {STANDARD_DENOMINATIONS.map((denom) => {
          const valKey = denom.value.toString();
          const count = counts[valKey] || 0;
          const subtotal = count * denom.value;

          return (
            <div
              key={denom.value}
              className={`p-2.5 rounded-xl border flex flex-col justify-between ${denom.color} transition-all`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black uppercase tracking-tight flex items-center gap-1">
                  {denom.type === 'BILL' ? <Banknote size={11} /> : <Coins size={11} />}
                  {denom.label}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {readOnly ? (
                  <span className="font-black text-sm tabular-nums text-slate-900">{count} pcs</span>
                ) : (
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={count === 0 ? '' : count}
                    onChange={(e) => handleCountChange(valKey, e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-black text-slate-900 text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                )}
                <span className="text-[10px] font-bold text-slate-400">lbr</span>
              </div>

              <div className="mt-1.5 text-right">
                <span className="text-[10px] font-black text-slate-700 tabular-nums block">
                  Rp {subtotal.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
        <span className="text-[10px] font-bold text-slate-500">
          Total Lembar/Koin: <strong className="text-slate-800">{totalItems} pcs</strong>
        </span>
        <div className="text-right">
          <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider mr-2">
            Hasil Hitung Fisik:
          </span>
          <span className="text-base font-black text-indigo-900 tabular-nums">
            Rp {totalCalculated.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
