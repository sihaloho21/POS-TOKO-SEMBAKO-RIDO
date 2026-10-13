import React, { useState } from 'react';
import type { UnitConversion } from '@/core/types';
import { calculateUnitHierarchy, getUnitConversionChainString } from '@/core/utils/unit-helper';
import { Layers, ArrowRight, Calculator, Sparkles, CheckCircle2, ChevronRight, HelpCircle } from 'lucide-react';

interface VisualUnitConversionHelperProps {
  baseUnit: string;
  basePrice?: number;
  conversionRules?: UnitConversion[];
  draftRule?: {
    unit: string;
    factor: number;
    price?: number;
  };
  compact?: boolean;
}

export function VisualUnitConversionHelper({
  baseUnit,
  basePrice = 0,
  conversionRules = [],
  draftRule,
  compact = false
}: VisualUnitConversionHelperProps) {
  // Combine saved rules with any active draft preview
  const effectiveRules = React.useMemo(() => {
    const list = [...conversionRules];
    if (draftRule && draftRule.unit && draftRule.factor > 0) {
      const normDraftUnit = draftRule.unit.trim().toUpperCase();
      const existingIdx = list.findIndex(r => r.toUnit.toUpperCase() === normDraftUnit);
      if (existingIdx >= 0) {
        list[existingIdx] = {
          fromUnit: baseUnit || 'PCS',
          toUnit: normDraftUnit,
          factor: draftRule.factor,
          price: draftRule.price
        };
      } else {
        list.push({
          fromUnit: baseUnit || 'PCS',
          toUnit: normDraftUnit,
          factor: draftRule.factor,
          price: draftRule.price
        });
      }
    }
    return list;
  }, [conversionRules, draftRule]);

  const hierarchy = React.useMemo(() => {
    return calculateUnitHierarchy(baseUnit, effectiveRules);
  }, [baseUnit, effectiveRules]);

  const chainFormula = React.useMemo(() => {
    return getUnitConversionChainString(baseUnit, effectiveRules);
  }, [baseUnit, effectiveRules]);

  // Interactive Live Simulator State
  const [simQty, setSimQty] = useState<number>(1);
  const [simUnit, setSimUnit] = useState<string>(() => {
    return hierarchy.length > 0 ? hierarchy[0].unit : baseUnit || 'PCS';
  });

  // Keep simulator unit valid
  React.useEffect(() => {
    if (hierarchy.length > 0 && !hierarchy.some(h => h.unit === simUnit)) {
      setSimUnit(hierarchy[0].unit);
    }
  }, [hierarchy, simUnit]);

  const hasMultipleUnits = hierarchy.length > 1;

  if (!hasMultipleUnits && !draftRule?.unit) {
    return (
      <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex items-start gap-2.5 text-amber-800 text-xs">
        <HelpCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-bold text-amber-900">Belum ada Satuan Tambahan / Kemasan</p>
          <p className="text-[11px] text-amber-700 leading-relaxed">
            Produk ini saat ini hanya memiliki satu satuan dasar (<strong>1 {baseUnit || 'PCS'}</strong>). 
            Tambahkan satuan turunan di atas (seperti <em>BUNGKUS</em> atau <em>SLOP</em>) untuk melihat diagram rantai konversi otomatis (misal: 1 Slop = 10 Bungkus = 200 Batang).
          </p>
        </div>
      </div>
    );
  }

  // Calculate live simulation results
  const selectedHierarchyItem = hierarchy.find(h => h.unit === simUnit) || hierarchy[hierarchy.length - 1];
  const simTotalBaseQty = (simQty || 0) * (selectedHierarchyItem?.factorToBase || 1);

  return (
    <div className="bg-gradient-to-br from-indigo-50/90 via-blue-50/50 to-slate-50 border border-indigo-200/90 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
      {/* Header & Formula Chain */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 shrink-0">
            <Layers size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                Visual Rantai Konversi Satuan
              </h4>
              <span className="text-[9px] font-black bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full uppercase">
                {hierarchy.length} Tingkat
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium">
              Alur perhitungan otomatis dari kemasan terbesar hingga satuan terkecil
            </p>
          </div>
        </div>

        {draftRule && draftRule.unit && (
          <span className="text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit">
            <Sparkles size={11} /> Live Preview Draf
          </span>
        )}
      </div>

      {/* Prominent Formula Highlight Banner */}
      <div className="p-3.5 bg-white border border-indigo-200 rounded-xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">
            Rumus Kesetaraan Multi-Satuan:
          </p>
          <div className="flex items-center flex-wrap gap-2 text-sm sm:text-base font-black text-slate-900 tracking-tight">
            {hierarchy.map((item, idx) => {
              const topItem = hierarchy[0];
              const qtyInTop = item.factorToBase > 0 ? topItem.factorToBase / item.factorToBase : 0;
              const formattedQty = Number.isInteger(qtyInTop) ? qtyInTop : Number(qtyInTop.toFixed(2));
              const isFirst = idx === 0;

              return (
                <React.Fragment key={item.unit}>
                  {!isFirst && <span className="text-indigo-400 font-bold">=</span>}
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg ${
                    item.isBase 
                      ? 'bg-blue-100 text-blue-900 border border-blue-200' 
                      : isFirst 
                        ? 'bg-indigo-600 text-white shadow-xs' 
                        : 'bg-slate-100 text-slate-800 border border-slate-200'
                  }`}>
                    <span>{formattedQty}</span>
                    <span className="uppercase text-xs tracking-wide">{item.unit}</span>
                    {item.isBase && <span className="text-[8px] font-bold opacity-80">(Dasar)</span>}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-[10px] text-slate-400 block font-semibold">Satuan Terkecil Toko</span>
          <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-100 uppercase inline-block">
            1 {baseUnit || 'PCS'}
          </span>
        </div>
      </div>

      {/* Visual Step-by-Step Flow Breakdown */}
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <ArrowRight size={13} className="text-indigo-600" />
          Tingkatan Hirarki Konversi Antar Satuan
        </p>

        <div className="flex items-center flex-wrap gap-2 pt-1">
          {hierarchy.map((item, index) => {
            const hasNext = index < hierarchy.length - 1;
            return (
              <React.Fragment key={item.unit}>
                <div className={`p-3 rounded-xl border flex flex-col min-w-[130px] transition-all ${
                  item.isBase
                    ? 'bg-blue-50 border-blue-300 shadow-2xs'
                    : index === 0
                      ? 'bg-indigo-50 border-indigo-300 shadow-2xs'
                      : 'bg-white border-slate-200 shadow-2xs'
                }`}>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[11px] font-black uppercase text-slate-900">
                      1 {item.unit}
                    </span>
                    {item.isBase ? (
                      <span className="text-[8px] font-bold px-1.5 py-0.2 bg-blue-600 text-white rounded">
                        BASE
                      </span>
                    ) : (
                      <span className="text-[8px] font-bold px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded">
                        Tier {index + 1}
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-600 font-bold">
                    = {item.factorToBase.toLocaleString()} {baseUnit || 'PCS'}
                  </p>

                  {item.price && item.price > 0 ? (
                    <p className="text-[10px] font-black text-emerald-600 mt-1">
                      Rp {item.price.toLocaleString()}
                    </p>
                  ) : basePrice > 0 ? (
                    <p className="text-[10px] font-medium text-slate-400 mt-1">
                      Rp {(basePrice * item.factorToBase).toLocaleString()} (Auto)
                    </p>
                  ) : null}
                </div>

                {hasNext && (
                  <div className="flex flex-col items-center justify-center px-1 text-indigo-500">
                    <div className="text-[9px] font-black bg-white px-1.5 py-0.5 rounded border border-indigo-200 shadow-2xs text-indigo-700 whitespace-nowrap">
                      × {item.ratioToNext} {item.nextUnit}
                    </div>
                    <ChevronRight size={16} className="mt-0.5" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Interactive Simulation / Test Calculator */}
      {!compact && (
        <div className="p-3.5 bg-white/90 border border-indigo-100 rounded-xl space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
              <Calculator size={14} className="text-indigo-600" />
              <span>Simulasi Hitung Satuan (Cek Otomatis)</span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">
              Uji coba konversi sebelum disimpan
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Jika ada</span>
              <input
                type="number"
                min="1"
                step="any"
                value={simQty}
                onChange={(e) => setSimQty(Math.max(0, Number(e.target.value)))}
                className="w-20 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-black text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={simUnit}
                onChange={(e) => setSimUnit(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-black text-slate-900 uppercase outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {hierarchy.map((h) => (
                  <option key={h.unit} value={h.unit}>
                    {h.unit} {h.isBase ? '(Dasar)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 flex items-center flex-wrap gap-2 text-xs font-bold text-slate-700 bg-indigo-50/70 p-2 rounded-lg border border-indigo-100/80">
              <span className="text-indigo-600 font-black">Setara dengan:</span>
              {hierarchy.map((h) => {
                if (h.unit === simUnit) return null;
                const converted = h.factorToBase > 0 ? simTotalBaseQty / h.factorToBase : 0;
                const formatted = Number.isInteger(converted) ? converted : Number(converted.toFixed(2));
                return (
                  <span
                    key={h.unit}
                    className="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-indigo-100 font-black text-slate-800"
                  >
                    <CheckCircle2 size={11} className="text-emerald-500" />
                    <span>{formatted.toLocaleString()}</span>
                    <span className="text-[10px] text-slate-500 uppercase">{h.unit}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
