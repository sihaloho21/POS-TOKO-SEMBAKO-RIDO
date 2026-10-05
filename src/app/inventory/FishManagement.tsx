import React, { useState, useMemo, useEffect } from 'react';
import { db } from '@/core/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Fish as FishIcon, 
  Search, 
  Plus, 
  AlertTriangle,
  Weight,
  TrendingUp,
  TrendingDown,
  History,
  Trash2,
  Lock,
  Scale,
  Calculator,
  Truck,
  CheckCircle,
  HelpCircle,
  ArrowRight,
  Info,
  DollarSign,
  PlusCircle,
  Calendar,
  X,
  Receipt,
  Activity,
  Layers,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  BadgePercent
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { ProductModal } from './ProductModal';
import { StockHistory } from './StockHistory';
import type { Product, ProductCost, StockMovement, Supplier } from '@/core/types';
import { useAuthStore } from '@/core/auth-store';
import { 
  FishService, 
  MINIMAL_FISH_SPECIES, 
  MINIMAL_FISH_SUPPLIERS,
  type FishProcurementCycle 
} from '@/core/services/fish-service';
import { SupplierModal } from '@/app/suppliers/SupplierModal';

const SPECIES_CHART_COLORS: Record<string, string> = {
  fish_nila: '#10b981',    // Emerald
  fish_mas: '#3b82f6',     // Blue
  fish_gurame: '#f59e0b',  // Amber
  fish_lele: '#8b5cf6',    // Violet
  fish_patin: '#06b6d4',   // Cyan
};

export default function FishManagement() {
  const { currentUser } = useAuthStore();
  const isOwner = currentUser?.role === 'OWNER';
  
  // Navigation Tabs: STOCK, DEATH_LOG, WAC_HISTORY, SUPPLIERS
  const [activeTab, setActiveTab] = useState<'STOCK' | 'DEATH_LOG' | 'WAC_HISTORY' | 'SUPPLIERS'>('STOCK');
  const [search, setSearch] = useState('');
  
  // Modals
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | undefined>(undefined);
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);
  
  // Death Log State & Modal
  const [isDeathModalOpen, setIsDeathModalOpen] = useState(false);
  const [deathProductId, setDeathProductId] = useState<string>('');
  const [deathKg, setDeathKg] = useState<string>('');
  const [deathDate, setDeathDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [deathNotes, setDeathNotes] = useState<string>('');
  const [isSubmittingDeath, setIsSubmittingDeath] = useState(false);
  const [deathSuccessMsg, setDeathSuccessMsg] = useState('');
  const [deathDateFilter, setDeathDateFilter] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'ALL'>('ALL');
  const [deathSpeciesFilter, setDeathSpeciesFilter] = useState<string>('ALL');

  // Quick Restock & WAC Modal
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [restockProductId, setRestockProductId] = useState<string>('');
  const [restockSupplierId, setRestockSupplierId] = useState<string>('');
  const [restockKg, setRestockKg] = useState<string>('');
  const [restockPriceKg, setRestockPriceKg] = useState<string>('');
  const [isSubmittingRestock, setIsSubmittingRestock] = useState(false);
  const [restockSuccessMsg, setRestockSuccessMsg] = useState('');
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  // WAC Simulator Modal
  const [isWacCalcModalOpen, setIsWacCalcModalOpen] = useState(false);
  const [simOldStock, setSimOldStock] = useState<number>(20);
  const [simOldWac, setSimOldWac] = useState<number>(28000);
  const [simNewStock, setSimNewStock] = useState<number>(30);
  const [simNewPrice, setSimNewPrice] = useState<number>(32000);

  // Fish Opname Modal
  const [isOpnameModalOpen, setIsOpnameModalOpen] = useState(false);
  const [opnameInputs, setOpnameInputs] = useState<Record<string, number>>({});
  const [opnameNotes, setOpnameNotes] = useState<string>('Stock Opname Fisik Ikan Hidup');
  const [isSubmittingOpname, setIsSubmittingOpname] = useState(false);
  const [opnameSuccessMsg, setOpnameSuccessMsg] = useState('');

  // WAC History Chart State
  const [selectedChartSpecies, setSelectedChartSpecies] = useState<string>('ALL');
  const [wacChartMode, setWacChartMode] = useState<'CHART' | 'TABLE'>('CHART');
  const [procurementCycles, setProcurementCycles] = useState<FishProcurementCycle[]>([]);

  // Live Queries
  const fishProducts = useLiveQuery(
    () => db.products.filter(p => 
      p.productType === 'FISH' && 
      (p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search) || Boolean(p.sku && p.sku.toLowerCase().includes(search.toLowerCase())))
    ).toArray(),
    [search]
  );

  const allFishProducts = useLiveQuery(
    () => db.products.filter(p => p.productType === 'FISH').toArray(),
    []
  );

  const costs = useLiveQuery(() => db.productCosts.toArray());
  const suppliers = useLiveQuery(() => db.suppliers.where('status').equals('ACTIVE').toArray());

  // Fish Death Movements (Stock Loss)
  const deathMovements = useLiveQuery(
    () => db.stockMovements
      .filter(m => m.movementType === 'FISH_DEAD_OUT' || (m.segmentId === 'IKAN' && m.reason?.toLowerCase().includes('ikan mati')))
      .reverse()
      .toArray(),
    []
  );

  // Load Procurement Cycles for WAC Evolution Chart
  const refreshProcurementCycles = async () => {
    try {
      const cycles = await FishService.getProcurementCycles();
      setProcurementCycles(cycles);
    } catch (e) {
      console.warn('Failed to load procurement cycles:', e);
    }
  };

  useEffect(() => {
    refreshProcurementCycles();
  }, [allFishProducts]);

  // Helper cost map
  const costMap = useMemo(() => {
    const map = new Map<string, number>();
    if (costs) {
      costs.forEach(c => map.set(c.productId, c.hpp));
    }
    return map;
  }, [costs]);

  const getHpp = (productId: string, fallbackHpp: number = 0) => costMap.get(productId) ?? fallbackHpp;

  // Aggregated Statistics
  const totalStockKg = useMemo(() => {
    return allFishProducts?.reduce((acc, p) => acc + (p.stock || 0), 0) || 0;
  }, [allFishProducts]);

  const totalStockValue = useMemo(() => {
    return allFishProducts?.reduce((acc, p) => acc + ((p.stock || 0) * getHpp(p.productId, p.hpp)), 0) || 0;
  }, [allFishProducts, costMap]);

  // Today prefix for daily profit report
  const todayPrefix = useMemo(() => new Date().toISOString().split('T')[0], []);
  const currentMonthPrefix = useMemo(() => todayPrefix.slice(0, 7), [todayPrefix]);

  // Filtered Death Movements
  const filteredDeathMovements = useMemo(() => {
    if (!deathMovements) return [];
    return deathMovements.filter(m => {
      const timestamp = m.clientTimestamp || m.createdAt || '';
      
      // Period filter
      let matchPeriod = true;
      if (deathDateFilter === 'TODAY') {
        matchPeriod = timestamp.startsWith(todayPrefix);
      } else if (deathDateFilter === 'WEEK') {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        matchPeriod = timestamp >= weekAgo;
      } else if (deathDateFilter === 'MONTH') {
        matchPeriod = timestamp.startsWith(currentMonthPrefix);
      }

      // Species filter
      const matchSpecies = deathSpeciesFilter === 'ALL' || m.productId === deathSpeciesFilter;

      return matchPeriod && matchSpecies;
    });
  }, [deathMovements, deathDateFilter, deathSpeciesFilter, todayPrefix, currentMonthPrefix]);

  // Death Statistics
  const deathStats = useMemo(() => {
    if (!deathMovements) return { todayKg: 0, todayRp: 0, monthKg: 0, monthRp: 0, totalKg: 0, totalRp: 0, count: 0 };

    let todayKg = 0;
    let todayRp = 0;
    let monthKg = 0;
    let monthRp = 0;
    let totalKg = 0;
    let totalRp = 0;

    for (const m of deathMovements) {
      const qty = m.baseQty || m.qty || 0;
      const wac = m.costSnapshot || 0;
      const loss = qty * wac;
      const ts = m.clientTimestamp || m.createdAt || '';

      totalKg += qty;
      totalRp += loss;

      if (ts.startsWith(todayPrefix)) {
        todayKg += qty;
        todayRp += loss;
      }
      if (ts.startsWith(currentMonthPrefix)) {
        monthKg += qty;
        monthRp += loss;
      }
    }

    return {
      todayKg,
      todayRp,
      monthKg,
      monthRp,
      totalKg,
      totalRp,
      count: deathMovements.length
    };
  }, [deathMovements, todayPrefix, currentMonthPrefix]);

  // Daily Fish Profit Report Live Query
  const dailyFishReport = useLiveQuery(
    () => FishService.getDailyFishProfitReport(todayPrefix),
    [todayPrefix, deathMovements]
  );

  // Check which minimal species exist
  const speciesStatus = useMemo(() => {
    const names = ['nila', 'mas', 'gurame', 'lele', 'patin'];
    const activeNames = allFishProducts?.map(p => p.name.toLowerCase()) || [];
    return names.map(target => ({
      target,
      label: target.toUpperCase(),
      exists: activeNames.some(n => n.includes(target))
    }));
  }, [allFishProducts]);

  const allMinimalSpeciesPresent = speciesStatus.every(s => s.exists);

  // Initialize Minimal Fish & Suppliers
  const handleSeedMinimalFish = async () => {
    try {
      await FishService.ensureMinimalFishProducts(currentUser?.userId || 'SYSTEM');
      await FishService.ensureFishSuppliers(currentUser?.userId || 'SYSTEM');
      await refreshProcurementCycles();
      alert('5 Produk Ikan Minimal (Nila, Mas, Gurame, Lele, Patin) dan Supplier (Cikande & Rau) berhasil diinisialisasi!');
    } catch (e: any) {
      alert('Gagal inisialisasi: ' + e.message);
    }
  };

  // Submit Fish Death
  const handleSaveDeath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deathProductId || !deathKg || Number(deathKg) <= 0) {
      alert('Pilih jenis ikan dan masukkan bobot mati (> 0 KG).');
      return;
    }

    setIsSubmittingDeath(true);
    try {
      const res = await FishService.recordFishDeath({
        productId: deathProductId,
        deathKg: Number(deathKg),
        date: deathDate,
        notes: deathNotes,
        userId: currentUser?.userId || 'SYSTEM',
        deviceId: 'device-1'
      });

      setDeathSuccessMsg(`Mortalitas ${res.lossKg} KG (${deathDate}) berhasil dicatat! Stock Loss: Rp ${res.lossAmountRp.toLocaleString()} otomatis memotong Laba Bersih harian.`);
      setTimeout(() => {
        setDeathSuccessMsg('');
        setIsDeathModalOpen(false);
        setDeathProductId('');
        setDeathKg('');
        setDeathNotes('');
      }, 1800);
    } catch (err: any) {
      alert('Gagal mencatat kematian: ' + err.message);
    } finally {
      setIsSubmittingDeath(false);
    }
  };

  // Submit Quick Restock & WAC
  const handleSaveRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockProductId || !restockSupplierId || !restockKg || !restockPriceKg) {
      alert('Lengkapi semua data pembelian (Ikan, Supplier, KG, Harga/KG).');
      return;
    }

    setIsSubmittingRestock(true);
    try {
      const res = await FishService.recordFishPurchase({
        productId: restockProductId,
        supplierId: restockSupplierId,
        purchaseKg: Number(restockKg),
        purchasePricePerKg: Number(restockPriceKg),
        moneyStorageId: 'IKAN',
        userId: currentUser?.userId || 'SYSTEM',
        deviceId: 'device-1'
      });

      await refreshProcurementCycles();

      setRestockSuccessMsg(`Restock berhasil! WAC baru per KG: Rp ${res.newWacKg.toLocaleString()} (Stok baru: ${res.newStockKg.toFixed(2)} KG).`);
      setTimeout(() => {
        setRestockSuccessMsg('');
        setIsRestockModalOpen(false);
        setRestockProductId('');
        setRestockKg('');
        setRestockPriceKg('');
      }, 1800);
    } catch (err: any) {
      alert('Gagal restock: ' + err.message);
    } finally {
      setIsSubmittingRestock(false);
    }
  };

  // Open Fish Opname Modal
  const handleOpenOpname = () => {
    const inputs: Record<string, number> = {};
    if (allFishProducts) {
      allFishProducts.forEach(p => {
        inputs[p.productId] = Number(p.stock.toFixed(2));
      });
    }
    setOpnameInputs(inputs);
    setOpnameNotes('Stock Opname Fisik Ikan Hidup Mingguan');
    setIsOpnameModalOpen(true);
  };

  // Submit Fish Opname
  const handleSaveOpname = async () => {
    if (!currentUser) return;
    setIsSubmittingOpname(true);
    try {
      const items = Object.entries(opnameInputs).map(([productId, physicalKg]) => ({
        productId,
        physicalKg: Number(physicalKg) || 0
      }));

      const res = await FishService.recordFishOpnameEvent({
        items,
        notes: opnameNotes,
        userId: currentUser.userId,
        deviceId: 'device-1'
      });

      setOpnameSuccessMsg(`Stock Opname Ikan selesai! ${res.adjustmentsCount} jenis ikan disesuaikan.`);
      setTimeout(() => {
        setOpnameSuccessMsg('');
        setIsOpnameModalOpen(false);
      }, 1500);
    } catch (err: any) {
      alert('Gagal opname: ' + err.message);
    } finally {
      setIsSubmittingOpname(false);
    }
  };

  // Simulator calculation
  const simResult = useMemo(() => {
    return FishService.calculateWac(simOldStock, simOldWac, simNewStock, simNewPrice);
  }, [simOldStock, simOldWac, simNewStock, simNewPrice]);

  // Prepare Chart Data for WAC Evolution over procurement cycles
  const { chartData, cycleComparisonList, activeChartSpeciesList }: {
    chartData: Record<string, any>[];
    cycleComparisonList: FishProcurementCycle[];
    activeChartSpeciesList: string[];
  } = useMemo(() => {
    const list = procurementCycles || [];
    
    // Sort chronologically
    const sorted = [...list].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // When a single species is selected
    if (selectedChartSpecies !== 'ALL') {
      const filtered = sorted.filter(c => c.productId === selectedChartSpecies);
      const points = filtered.map((c, idx) => ({
        cycleId: c.cycleId,
        cycleIndex: `Siklus ${idx + 1} (${c.dateLabel})`,
        dateLabel: c.dateLabel,
        rawTimestamp: c.timestamp,
        wacKg: c.wacAfterKg,
        purchasePrice: c.purchasePriceKg,
        purchaseKg: c.purchaseKg,
        supplierName: c.supplierName,
        productName: c.productName,
        wacChange: c.wacChange
      }));
      return {
        chartData: points,
        cycleComparisonList: filtered,
        activeChartSpeciesList: [selectedChartSpecies]
      };
    }

    // When "ALL" is selected: aggregate by cycle order across species with forward-filled WAC
    const speciesIds = Array.from(new Set(sorted.map(c => c.productId)));
    const runningWacMap: Record<string, number> = {};

    allFishProducts?.forEach(p => {
      runningWacMap[p.productId] = getHpp(p.productId, p.hpp);
    });

    const points = sorted.map((c, idx) => {
      runningWacMap[c.productId] = c.wacAfterKg;
      return {
        cycleId: c.cycleId,
        cycleIndex: `Siklus ${idx + 1} (${c.dateLabel})`,
        dateLabel: c.dateLabel,
        timestamp: c.timestamp,
        supplierName: c.supplierName,
        currentSpecies: c.productName,
        currentPurchasePrice: c.purchasePriceKg,
        currentPurchaseKg: c.purchaseKg,
        ...runningWacMap
      };
    });

    return {
      chartData: points,
      cycleComparisonList: sorted,
      activeChartSpeciesList: speciesIds
    };
  }, [procurementCycles, selectedChartSpecies]);

  // Current WAC info for selected chart species
  const selectedSpeciesWacSummary = useMemo(() => {
    if (selectedChartSpecies === 'ALL') {
      const avgWac = allFishProducts && allFishProducts.length > 0
        ? Math.round(allFishProducts.reduce((acc, p) => acc + getHpp(p.productId, p.hpp), 0) / allFishProducts.length)
        : 0;
      return {
        name: 'Seluruh Jenis Ikan (Rata-rata)',
        currentWac: avgWac,
        lastCycle: procurementCycles[procurementCycles.length - 1]
      };
    }
    const prod = allFishProducts?.find(p => p.productId === selectedChartSpecies);
    const prodCycles = procurementCycles.filter(c => c.productId === selectedChartSpecies);
    const lastCycle = prodCycles[prodCycles.length - 1];
    return {
      name: prod?.name || 'Ikan',
      currentWac: prod ? getHpp(prod.productId, prod.hpp) : 0,
      lastCycle
    };
  }, [selectedChartSpecies, allFishProducts, procurementCycles, costMap]);

  return (
    <div className="space-y-6">
      {/* Header & Context */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-black text-[10px] uppercase tracking-wider">
              Retail Ikan Hidup & Segar Konsumsi
            </span>
            <span className="text-[10px] text-slate-400 font-bold">
              • USER BUKAN FISH FARMER
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <FishIcon className="text-emerald-600" size={26} />
            Fish Management & Death Log (KG)
          </h2>
          <p className="text-slate-500 text-xs font-medium">
            Sistem retail ikan konsumsi per KG: WAC costing dinamis, pelaporan mortalitas (Stock Loss) pengurang laba harian, dan grafik evolusi harga pengadaan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => {
              setDeathProductId(allFishProducts?.[0]?.productId || '');
              setIsDeathModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-rose-200"
            title="Catat mortalitas ikan mati (Stock Loss pengurang laba)"
          >
            <AlertTriangle size={15} />
            Catat Ikan Mati (Death Log)
          </button>

          <button 
            onClick={() => {
              setRestockProductId(allFishProducts?.[0]?.productId || '');
              setRestockSupplierId(suppliers?.[0]?.supplierId || '');
              setIsRestockModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-emerald-500 transition-all shadow-md shadow-emerald-200"
            title="Restock ikan baru dan kalkulasi WAC"
          >
            <Truck size={15} />
            Restock WAC
          </button>

          <button 
            onClick={handleOpenOpname}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-indigo-100 transition-all shadow-xs"
            title="Catat stok opname timbangan fisik ikan dalam KG"
          >
            <Scale size={15} />
            Stock Opname
          </button>

          <button 
            onClick={() => {
              setEditingProductId(undefined);
              setIsProductModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-wider transition-all"
          >
            <Plus size={15} />
            Tambah Ikan
          </button>
        </div>
      </div>

      {/* Mandatory Fish Species Readiness Indicator */}
      {!allMinimalSpeciesPresent && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-xs font-black text-amber-950 uppercase tracking-tight">
                Persyaratan Minimal Produk Retail Ikan (Nila, Mas, Gurame, Lele, Patin)
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {speciesStatus.map(s => (
                  <span 
                    key={s.target}
                    className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                      s.exists ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {s.exists ? '✓' : '✗'} {s.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={handleSeedMinimalFish}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-200 shrink-0"
          >
            Lengkapi 5 Produk & Supplier Ikan
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Stok Ikan */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
            <Weight size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Stok Ikan</p>
            <p className="text-2xl font-black text-slate-900 tabular-nums">
              {totalStockKg.toFixed(2)} <span className="text-xs font-bold text-slate-400">KG</span>
            </p>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">Unit utama costing & retail</p>
          </div>
        </div>

        {/* Card 2: Nilai Stok WAC */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <DollarSign size={24} />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nilai Stok Ikan</p>
            {isOwner ? (
              <>
                <p className="text-2xl font-black text-slate-900 tabular-nums">
                  Rp {totalStockValue.toLocaleString()}
                </p>
                <p className="text-[10px] font-bold text-emerald-600 mt-0.5">
                  Σ(Stok KG × WAC/KG)
                </p>
              </>
            ) : (
              <div className="flex items-center gap-1.5 text-slate-300 mt-1">
                <Lock size={14} />
                <span className="text-xs font-bold uppercase tracking-widest">Khusus Owner</span>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Ikan Mati Hari Ini (Stock Loss) */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
            <AlertTriangle size={24} />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ikan Mati Hari Ini</p>
            <p className="text-2xl font-black text-rose-600 tabular-nums">
              {deathStats.todayKg.toFixed(2)} <span className="text-xs font-bold text-rose-400">KG</span>
            </p>
            {isOwner ? (
              <p className="text-[10px] font-bold text-rose-500 mt-0.5">
                Rugi -Rp {deathStats.todayRp.toLocaleString()} (Potong Laba)
              </p>
            ) : (
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">Mortalitas harian</p>
            )}
          </div>
        </div>

        {/* Card 4: WAC History Indicator */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Siklus Pengadaan</p>
            <p className="text-2xl font-black text-slate-900 tabular-nums">
              {procurementCycles.length} <span className="text-xs font-bold text-slate-400">Siklus</span>
            </p>
            <p className="text-[10px] font-bold text-indigo-600 mt-0.5">
              Cikande & Pasar Rau
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setActiveTab('STOCK')}
          className={`px-5 py-3 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'STOCK' 
              ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-2xl' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FishIcon size={16} />
          Daftar Stok Ikan & WAC
        </button>

        <button
          onClick={() => setActiveTab('DEATH_LOG')}
          className={`px-5 py-3 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'DEATH_LOG' 
              ? 'border-rose-600 text-rose-600 bg-rose-50/50 rounded-t-2xl' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle size={16} />
          Death Log & Laporan Laba Harian
          {deathStats.count > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
              {deathStats.count}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('WAC_HISTORY')}
          className={`px-5 py-3 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'WAC_HISTORY' 
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-2xl' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp size={16} />
          Grafik Evolusi WAC (Recharts)
        </button>

        <button
          onClick={() => setActiveTab('SUPPLIERS')}
          className={`px-5 py-3 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'SUPPLIERS' 
              ? 'border-emerald-600 text-emerald-600 bg-emerald-50/50 rounded-t-2xl' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Truck size={16} />
          Supplier Ikan (Cikande & Rau)
        </button>
      </div>

      {/* TAB 1: STOCK INVENTORY */}
      {activeTab === 'STOCK' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Cari jenis ikan (Nila, Mas, Gurame, Lele, Patin)..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold shadow-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500">
              <button 
                onClick={() => setIsWacCalcModalOpen(true)}
                className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline"
              >
                <Calculator size={14} /> Simulasi Rumus WAC
              </button>
              <span className="text-slate-300">•</span>
              <span className="font-bold text-slate-900">{fishProducts?.length || 0} Jenis Ikan Aktif</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                  <th className="px-6 py-4">Jenis Ikan</th>
                  <th className="px-6 py-4">Barcode / SKU</th>
                  <th className="px-6 py-4">Harga Jual / KG</th>
                  {isOwner && <th className="px-6 py-4">WAC / KG (Modal)</th>}
                  <th className="px-6 py-4">Stok Fisik (KG)</th>
                  {isOwner && <th className="px-6 py-4">Nilai Stok (Rp)</th>}
                  {isOwner && <th className="px-6 py-4">Margin / KG</th>}
                  <th className="px-6 py-4 text-right">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fishProducts?.map((p) => {
                  const currentWac = getHpp(p.productId, p.hpp);
                  const stockValue = p.stock * currentWac;
                  const marginRp = p.normalPrice - currentWac;
                  const marginPercent = p.normalPrice > 0 ? ((marginRp / p.normalPrice) * 100).toFixed(1) : '0';

                  return (
                    <React.Fragment key={p.productId}>
                      <tr className="hover:bg-slate-50/60 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center shrink-0">
                              <FishIcon size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{p.name}</p>
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                Retail Konsumsi (KG)
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-mono font-bold text-slate-500">{p.barcode || p.sku}</span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-black text-slate-900 tabular-nums">
                            Rp {p.normalPrice.toLocaleString()} <span className="text-[10px] font-bold text-slate-400">/KG</span>
                          </p>
                        </td>
                        {isOwner && (
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-blue-600 tabular-nums">
                              Rp {currentWac.toLocaleString()} <span className="text-[10px] font-bold text-blue-400">/KG</span>
                            </p>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">WAC Saat Ini</span>
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-base font-black tabular-nums ${p.stock <= p.minimumStock ? 'text-rose-600' : 'text-slate-900'}`}>
                              {p.stock.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">KG</span>
                          </div>
                          {p.stock <= p.minimumStock && (
                            <span className="text-[9px] font-black text-rose-500 uppercase tracking-wider block">
                              Stok Menipis (Min {p.minimumStock} KG)
                            </span>
                          )}
                        </td>
                        {isOwner && (
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-slate-900 tabular-nums">
                              Rp {stockValue.toLocaleString()}
                            </p>
                          </td>
                        )}
                        {isOwner && (
                          <td className="px-6 py-4">
                            <span className={`text-xs font-bold px-2 py-1 rounded-lg tabular-nums inline-block ${
                              marginRp >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
                            }`}>
                              {marginRp >= 0 ? '+' : ''}Rp {marginRp.toLocaleString()} ({marginPercent}%)
                            </span>
                          </td>
                        )}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setDeathProductId(p.productId);
                                setIsDeathModalOpen(true);
                              }}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                              title="Catat Ikan Mati (Death Log)"
                            >
                              <AlertTriangle size={14} />
                              <span className="hidden sm:inline">Mati</span>
                            </button>

                            <button
                              onClick={() => {
                                setRestockProductId(p.productId);
                                setRestockSupplierId(suppliers?.[0]?.supplierId || '');
                                setIsRestockModalOpen(true);
                              }}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                              title="Beli & Hitung WAC Baru"
                            >
                              <Truck size={14} />
                              <span className="hidden sm:inline">Restock</span>
                            </button>

                            <button 
                              onClick={() => setViewingHistoryId(viewingHistoryId === p.productId ? null : p.productId)}
                              className={`p-2 rounded-lg transition-colors ${viewingHistoryId === p.productId ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-100'}`}
                              title="Riwayat Stock Movement"
                            >
                              <History size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {viewingHistoryId === p.productId && (
                        <tr>
                          <td colSpan={8} className="px-6 py-6 bg-slate-50/50 border-y border-slate-200">
                            <div className="max-w-4xl mx-auto">
                              <div className="flex justify-between items-center mb-3">
                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                                  Buku Mutasi Stok (Ledger) — {p.name}
                                </h4>
                                <button 
                                  onClick={() => setViewingHistoryId(null)}
                                  className="text-xs font-bold text-slate-400 hover:text-slate-600"
                                >
                                  Tutup
                                </button>
                              </div>
                              <StockHistory productId={p.productId} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: DEATH LOG & DAILY PROFIT REPORT */}
      {activeTab === 'DEATH_LOG' && (
        <div className="space-y-6">
          {/* Direct Death Log Input Section */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-4 mb-5">
              <div>
                <div className="flex items-center gap-2 text-rose-600 text-xs font-black uppercase tracking-wider mb-1">
                  <AlertTriangle size={16} />
                  Formulir Catat Kematian Ikan (Death Log Entry)
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight text-slate-900">
                  Input Kematian Ikan & Otomatisasi Pemotongan Stok
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Masukkan jenis ikan, bobot dalam satuan KG, dan tanggal. Sistem otomatis memotong stok fisik dan menghitung kerugian (Stock Loss) berbasis current WAC/kg.
                </p>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-rose-50 text-rose-700 rounded-full border border-rose-200">
                Auto Deduct Stock & Loss
              </span>
            </div>

            <form onSubmit={handleSaveDeath} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Type of fish */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Jenis Ikan (Fish Type) *
                  </label>
                  <select
                    value={deathProductId}
                    onChange={(e) => setDeathProductId(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="">-- Pilih Jenis Ikan --</option>
                    {allFishProducts?.map(p => (
                      <option key={p.productId} value={p.productId}>
                        {p.name} (Stok: {p.stock.toFixed(2)} KG)
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Weight in KG */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Bobot Mati (Weight in KG) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Contoh: 1.50"
                    value={deathKg}
                    onChange={(e) => setDeathKg(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                {/* 3. Date */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Tanggal Kejadian (Date) *
                  </label>
                  <input
                    type="date"
                    required
                    value={deathDate}
                    onChange={(e) => setDeathDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                {/* 4. Notes */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Catatan Mortalitas (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Mati di bak aerasi / lemas..."
                    value={deathNotes}
                    onChange={(e) => setDeathNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Dynamic Live Loss Preview and Submission */}
              <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      WAC Berjalan (Modal/KG):
                    </span>
                    <span className="font-black text-blue-600 text-sm tabular-nums">
                      {deathProductId ? `Rp ${getHpp(deathProductId).toLocaleString()} /KG` : '-'}
                    </span>
                  </div>

                  <div className="sm:border-l border-rose-200 sm:pl-6">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Kalkulasi Kerugian (Stock Loss):
                    </span>
                    <span className="font-black text-rose-600 text-sm tabular-nums">
                      {deathProductId && Number(deathKg) > 0 
                        ? `- Rp ${Math.round(Number(deathKg) * getHpp(deathProductId)).toLocaleString()}`
                        : 'Rp 0'}
                    </span>
                  </div>

                  <div className="sm:border-l border-rose-200 sm:pl-6">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Sisa Stok Proyeksi:
                    </span>
                    <span className="font-black text-slate-800 text-sm tabular-nums">
                      {deathProductId
                        ? `${Math.max(0, ((allFishProducts?.find(p => p.productId === deathProductId)?.stock || 0) - (Number(deathKg) || 0))).toFixed(2)} KG`
                        : '-'}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingDeath || !deathProductId || !deathKg || Number(deathKg) <= 0}
                  className="w-full sm:w-auto px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-rose-200 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <AlertTriangle size={15} />
                  {isSubmittingDeath ? 'Menyimpan...' : 'Simpan Kematian Ikan'}
                </button>
              </div>
            </form>
          </div>

          {/* Daily Profit Report Impact Box */}
          {dailyFishReport && (
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative z-10 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-rose-400 text-xs font-black uppercase tracking-wider mb-1">
                    <Receipt size={16} />
                    Laporan Dampak Laba Harian (Daily Profit Report) — Retail Ikan
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
                    Rekonsiliasi Kerugian Mortalitas Terhadap Laba Bersih
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                    Sesuai regulasi akuntansi retail konsumsi: Setiap ikan mati secara otomatis mengurangi stok (KG) dan dicatat berdasarkan current WAC/kg sebagai Stock Loss yang memotong Laba Bersih harian toko.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setDeathProductId(allFishProducts?.[0]?.productId || '');
                    setIsDeathModalOpen(true);
                  }}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-rose-900/40 flex items-center gap-2 shrink-0"
                >
                  <AlertTriangle size={16} />
                  + Catat Kematian Ikan (Death Log)
                </button>
              </div>

              {/* Profit & Loss Grid for Today */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 pt-4 relative z-10">
                <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Omzet Ikan Hari Ini
                  </span>
                  <p className="text-lg font-black text-white tabular-nums">
                    Rp {dailyFishReport.totalRevenue.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Penjualan retail</p>
                </div>

                <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Total HPP Ikan Terjual
                  </span>
                  <p className="text-lg font-black text-blue-400 tabular-nums">
                    Rp {dailyFishReport.totalHpp.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Snapshot WAC saat jual</p>
                </div>

                <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Laba Kotor (Gross)
                  </span>
                  <p className="text-lg font-black text-emerald-400 tabular-nums">
                    Rp {dailyFishReport.grossProfit.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Omzet - HPP Terjual</p>
                </div>

                <div className="p-3.5 bg-rose-950/50 rounded-2xl border border-rose-800/80">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-300">
                      Ikan Mati (Loss)
                    </span>
                    <span className="text-[9px] bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.5 rounded">
                      {dailyFishReport.fishDeathKg.toFixed(2)} KG
                    </span>
                  </div>
                  <p className="text-lg font-black text-rose-400 tabular-nums">
                    - Rp {dailyFishReport.fishDeathLossRp.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-rose-300 mt-0.5 font-bold">
                    Potong Laba Bersih
                  </p>
                </div>

                <div className="col-span-2 lg:col-span-1 p-3.5 bg-emerald-950/60 rounded-2xl border border-emerald-800/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 block mb-1">
                    Laba Bersih Ikan Hari Ini
                  </span>
                  <p className="text-lg font-black text-emerald-300 tabular-nums">
                    Rp {dailyFishReport.netProfit.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-emerald-400 mt-0.5 font-bold">
                    Laba Kotor - Stock Loss
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Death Log Table Section */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Periode:</span>
                {[
                  { id: 'ALL', label: 'Semua' },
                  { id: 'TODAY', label: 'Hari Ini' },
                  { id: 'WEEK', label: '7 Hari Terakhir' },
                  { id: 'MONTH', label: 'Bulan Ini' }
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => setDeathDateFilter(p.id as any)}
                    className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                      deathDateFilter === p.id 
                        ? 'bg-slate-900 text-white shadow-xs' 
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={deathSpeciesFilter}
                  onChange={(e) => setDeathSpeciesFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="ALL">Semua Jenis Ikan</option>
                  {allFishProducts?.map(p => (
                    <option key={p.productId} value={p.productId}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setDeathProductId(allFishProducts?.[0]?.productId || '');
                    setIsDeathModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Plus size={14} /> Catat Mati
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                    <th className="px-6 py-4">Waktu</th>
                    <th className="px-6 py-4">Jenis Ikan</th>
                    <th className="px-6 py-4 text-center">Bobot Mati (KG)</th>
                    <th className="px-6 py-4">Current WAC/KG</th>
                    <th className="px-6 py-4 text-right">Nilai Kerugian (Stock Loss)</th>
                    <th className="px-6 py-4">Alasan / Catatan Mortalitas</th>
                    <th className="px-6 py-4 text-center">Dampak Laba</th>
                    <th className="px-6 py-4 text-right">Pencatat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDeathMovements.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-400 text-xs font-bold">
                        Tidak ada catatan kematian ikan pada filter yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    filteredDeathMovements.map((m) => {
                      const prod = allFishProducts?.find(p => p.productId === m.productId);
                      const qty = m.baseQty || m.qty || 0;
                      const wac = m.costSnapshot || 0;
                      const lossAmount = qty * wac;

                      return (
                        <tr key={m.stockMovementId} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-xs font-bold text-slate-600 whitespace-nowrap">
                            {new Date(m.clientTimestamp || m.createdAt || '').toLocaleString('id-ID', {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center font-bold">
                                <FishIcon size={14} />
                              </div>
                              <span className="text-xs font-black text-slate-900 uppercase">
                                {prod?.name || m.productId}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center font-black text-rose-600 text-sm tabular-nums">
                            {qty.toFixed(2)} KG
                          </td>
                          <td className="px-6 py-4 text-xs font-bold text-blue-600 tabular-nums">
                            Rp {wac.toLocaleString()} <span className="text-[10px] text-slate-400">/KG</span>
                          </td>
                          <td className="px-6 py-4 text-right font-black text-rose-600 text-sm tabular-nums">
                            -Rp {lossAmount.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-slate-600 max-w-xs">
                            <span className="line-clamp-2">
                              {m.reason || 'Ikan mati/tidak layak jual'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                              Memotong Net Profit
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-xs font-mono font-bold text-slate-400">
                            {m.userId}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WAC EVOLUTION HISTORY CHART (RECHARTS) */}
      {activeTab === 'WAC_HISTORY' && (
        <div className="space-y-6">
          {/* Header & Controls for WAC History */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 text-indigo-600 text-xs font-black uppercase tracking-wider mb-1">
                <TrendingUp size={16} />
                Histori Perkembangan WAC Berdasarkan Siklus Pengadaan
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">
                Grafik Evolusi Costing Ikan per KG (Weighted Average Cost)
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Memvisualisasikan dinamika fluktuasi harga modal per kg tiap jenis ikan seiring siklus restock dari Supplier Cikande dan Pasar Rau.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-slate-100 p-1 rounded-xl text-[10px] font-black uppercase tracking-wider">
                <button
                  onClick={() => setWacChartMode('CHART')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    wacChartMode === 'CHART' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Grafik Recharts
                </button>
                <button
                  onClick={() => setWacChartMode('TABLE')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    wacChartMode === 'TABLE' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Rincian Siklus
                </button>
              </div>

              <select
                value={selectedChartSpecies}
                onChange={(e) => setSelectedChartSpecies(e.target.value)}
                className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Semua Jenis Ikan (Multi-Line)</option>
                {allFishProducts?.map(p => (
                  <option key={p.productId} value={p.productId}>
                    {p.name}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  setRestockProductId(allFishProducts?.[0]?.productId || '');
                  setRestockSupplierId(suppliers?.[0]?.supplierId || '');
                  setIsRestockModalOpen(true);
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-200 flex items-center gap-1.5"
              >
                <Truck size={14} /> + Beli Siklus Baru
              </button>
            </div>
          </div>

          {/* Quick Metrics on Current Selected Fish */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                Fokus Tampilan:
              </span>
              <p className="text-base font-black text-slate-900 uppercase truncate">
                {selectedSpeciesWacSummary.name}
              </p>
              <p className="text-xs text-indigo-600 font-bold mt-1">
                WAC Terkini: Rp {selectedSpeciesWacSummary.currentWac.toLocaleString()} /KG
              </p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                Siklus Pengadaan Terakhir:
              </span>
              <p className="text-base font-black text-slate-900">
                {selectedSpeciesWacSummary.lastCycle ? selectedSpeciesWacSummary.lastCycle.supplierName : 'Supplier Cikande'}
              </p>
              <p className="text-xs text-slate-400 font-medium mt-1">
                {selectedSpeciesWacSummary.lastCycle?.dateLabel || 'Baru-baru ini'} • {selectedSpeciesWacSummary.lastCycle?.purchaseKg || 25} KG @ Rp {selectedSpeciesWacSummary.lastCycle?.purchasePriceKg.toLocaleString() || '30.000'}
              </p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                Perubahan WAC Siklus Terakhir:
              </span>
              {selectedSpeciesWacSummary.lastCycle ? (
                <div className="flex items-center gap-2 mt-1">
                  {selectedSpeciesWacSummary.lastCycle.wacChange >= 0 ? (
                    <span className="flex items-center text-rose-600 font-black text-base">
                      <ArrowUpRight size={18} /> +Rp {Math.abs(selectedSpeciesWacSummary.lastCycle.wacChange).toLocaleString()}
                    </span>
                  ) : (
                    <span className="flex items-center text-emerald-600 font-black text-base">
                      <ArrowDownRight size={18} /> -Rp {Math.abs(selectedSpeciesWacSummary.lastCycle.wacChange).toLocaleString()}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 font-bold">/KG</span>
                </div>
              ) : (
                <p className="text-base font-black text-slate-400 mt-1">Stabil</p>
              )}
              <p className="text-[10px] text-slate-400 mt-0.5">Dampak restock terhadap HPP rata-rata</p>
            </div>
          </div>

          {/* Recharts Visualization */}
          {wacChartMode === 'CHART' ? (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Grafik Garis Perkembangan WAC / KG
                </span>
                <span className="text-[11px] font-bold text-slate-400">
                  Sumbu Y: Modal WAC (Rp) • Sumbu X: Kronologi Siklus
                </span>
              </div>

              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {selectedChartSpecies === 'ALL' ? (
                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis 
                        dataKey="cycleIndex" 
                        tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                        dy={8}
                      />
                      <YAxis 
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                        tickFormatter={(val) => `Rp ${(val / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-800 text-xs space-y-1.5">
                                <p className="font-black text-slate-200 border-b border-slate-800 pb-1">
                                  {label}
                                </p>
                                {payload.map((entry: any) => {
                                  const prod = allFishProducts?.find(p => p.productId === entry.dataKey);
                                  const name = prod?.name || entry.dataKey;
                                  return (
                                    <div key={entry.dataKey} className="flex items-center justify-between gap-4">
                                      <span className="flex items-center gap-1.5 font-bold" style={{ color: entry.color }}>
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                        {name}:
                                      </span>
                                      <span className="font-black tabular-nums">
                                        Rp {Number(entry.value).toLocaleString()}/KG
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend 
                        formatter={(value) => {
                          const prod = allFishProducts?.find(p => p.productId === value);
                          return <span className="text-xs font-bold text-slate-700">{prod?.name || value}</span>;
                        }}
                      />
                      {allFishProducts?.map((p) => (
                        <Line
                          key={p.productId}
                          type="monotone"
                          dataKey={p.productId}
                          name={p.name}
                          stroke={SPECIES_CHART_COLORS[p.productId] || '#3b82f6'}
                          strokeWidth={2.5}
                          dot={{ r: 4, strokeWidth: 2, fill: '#ffffff' }}
                          activeDot={{ r: 6 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  ) : (
                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis 
                        dataKey="cycleIndex" 
                        tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                        dy={8}
                      />
                      <YAxis 
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                        tickFormatter={(val) => `Rp ${(val / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-800 text-xs space-y-1">
                                <p className="font-black text-blue-400 border-b border-slate-800 pb-1">
                                  {d.cycleIndex} ({d.dateLabel})
                                </p>
                                <p className="text-slate-300">Supplier: <span className="font-bold text-white">{d.supplierName}</span></p>
                                <p className="text-slate-300">Volume Masuk: <span className="font-bold text-white">{d.purchaseKg} KG</span></p>
                                <p className="text-slate-300">Harga Faktur Beli: <span className="font-bold text-amber-400">Rp {d.purchasePrice?.toLocaleString()}/KG</span></p>
                                <div className="pt-1 border-t border-slate-800 flex justify-between gap-4 font-black">
                                  <span className="text-emerald-400">WAC Hasil Kalkulasi:</span>
                                  <span className="text-emerald-400 tabular-nums">Rp {d.wacKg?.toLocaleString()}/KG</span>
                                </div>
                                {d.wacChange !== 0 && (
                                  <div className="text-[10px] text-slate-400 font-bold">
                                    Dampak Perubahan: {d.wacChange > 0 ? `+Rp ${d.wacChange.toLocaleString()}` : `-Rp ${Math.abs(d.wacChange).toLocaleString()}`}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend 
                        formatter={(value) => {
                          return <span className="text-xs font-bold text-slate-700">{value === 'wacKg' ? 'Tren WAC / KG (Modal Rata-rata)' : 'Harga Faktur Beli Supplier / KG'}</span>;
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="wacKg"
                        name="wacKg"
                        stroke="#2563eb"
                        strokeWidth={3}
                        dot={{ r: 5, strokeWidth: 2, fill: '#ffffff' }}
                        activeDot={{ r: 8 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="purchasePrice"
                        name="purchasePrice"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={{ r: 4, strokeWidth: 1.5, fill: '#ffffff' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          {/* Procurement Cycles Breakdown Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                Tabel Rincian Siklus Pengadaan & Rekonsiliasi WAC
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                Total {cycleComparisonList.length} Siklus Tercatat
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                    <th className="px-6 py-4">Siklus #</th>
                    <th className="px-6 py-4">Tanggal</th>
                    <th className="px-6 py-4">Jenis Ikan</th>
                    <th className="px-6 py-4">Supplier Mitra</th>
                    <th className="px-6 py-4 text-center">Beli (KG)</th>
                    <th className="px-6 py-4 text-right">Harga Faktur / KG</th>
                    <th className="px-6 py-4 text-right">WAC Sebelum</th>
                    <th className="px-6 py-4 text-right">WAC Hasil Baru</th>
                    <th className="px-6 py-4 text-center">Dampak WAC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cycleComparisonList.map((c, idx) => (
                    <tr key={c.cycleId || idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-slate-400">
                        #{c.cycleNumber || idx + 1}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700 whitespace-nowrap">
                        {c.dateLabel}
                      </td>
                      <td className="px-6 py-4 font-black text-slate-900 uppercase">
                        {c.productName}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-600">
                        {c.supplierName}
                      </td>
                      <td className="px-6 py-4 text-center font-black text-slate-800 tabular-nums">
                        {c.purchaseKg.toFixed(2)} KG
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-amber-600 tabular-nums">
                        Rp {c.purchasePriceKg.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-500 tabular-nums">
                        Rp {c.wacBeforeKg.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-black text-blue-600 tabular-nums">
                        Rp {c.wacAfterKg.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          c.wacChange > 0 
                            ? 'bg-rose-100 text-rose-700' 
                            : c.wacChange < 0 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {c.wacChange > 0 ? `+Rp ${c.wacChange.toLocaleString()}` : c.wacChange < 0 ? `-Rp ${Math.abs(c.wacChange).toLocaleString()}` : 'Tetap'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: FISH SUPPLIERS */}
      {activeTab === 'SUPPLIERS' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Daftar Supplier Ikan Segar & Hidup
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Pemasok wajib: <span className="font-bold text-blue-600">Supplier Cikande</span> dan <span className="font-bold text-emerald-600">Supplier Pasar Rau</span>. Mitra supplier lain dapat ditambahkan sesuai kebutuhan bisnis.
              </p>
            </div>
            <button
              onClick={() => setIsAddSupplierOpen(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-200 flex items-center gap-2"
            >
              <Plus size={16} />
              Tambah Supplier Baru
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers?.map((s) => {
              const isCikande = s.name.toLowerCase().includes('cikande');
              const isRau = s.name.toLowerCase().includes('rau');

              return (
                <div key={s.supplierId} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-700 rounded-xl flex items-center justify-center font-black">
                        <Truck size={20} />
                      </div>
                      {(isCikande || isRau) && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase rounded-md">
                          Supplier Utama
                        </span>
                      )}
                    </div>
                    <h4 className="font-black text-slate-900 text-sm uppercase tracking-tight">{s.name}</h4>
                    <p className="text-xs font-mono text-slate-500 mt-1">{s.phone || 'Tidak ada no telepon'}</p>
                    <p className="text-xs text-slate-600 mt-2 line-clamp-2">{s.address || 'Alamat tidak dicantumkan'}</p>
                    {s.notes && (
                      <p className="text-[11px] text-slate-400 italic mt-2 border-t border-slate-100 pt-2">
                        {s.notes}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
                    <button
                      onClick={() => {
                        setRestockSupplierId(s.supplierId);
                        setRestockProductId(allFishProducts?.[0]?.productId || '');
                        setIsRestockModalOpen(true);
                      }}
                      className="w-full py-2 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
                    >
                      Beli Ikan dari Supplier Ini
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL 1: Catat Ikan Mati (Death Log) */}
      {isDeathModalOpen && (
        <div className="fixed inset-0 z-[250] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">Catat Ikan Mati (Death Log)</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Auto Deduct Stock & Daily Stock Loss</p>
                </div>
              </div>
              <button onClick={() => setIsDeathModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {deathSuccessMsg ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto animate-bounce" />
                <p className="font-black text-slate-900 text-sm">{deathSuccessMsg}</p>
                <p className="text-xs text-slate-400">Stok berkurang & Stock Loss tercatat di laporan laba harian.</p>
              </div>
            ) : (
              <form onSubmit={handleSaveDeath} className="space-y-4 pt-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Jenis Ikan *
                  </label>
                  <select
                    value={deathProductId}
                    onChange={(e) => setDeathProductId(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="">-- Pilih Jenis Ikan --</option>
                    {allFishProducts?.map(p => (
                      <option key={p.productId} value={p.productId}>
                        {p.name} (Stok Saat Ini: {p.stock.toFixed(2)} KG)
                      </option>
                    ))}
                  </select>
                </div>

                {deathProductId && (
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 uppercase font-black">WAC / Modal per KG:</span>
                      <span className="font-black text-blue-600 tabular-nums">
                        Rp {getHpp(deathProductId).toLocaleString()} /KG
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-200/60 pt-1.5">
                      <span className="text-[10px] text-slate-400 uppercase font-black">Estimasi Kerugian (Stock Loss):</span>
                      <span className="font-black text-rose-600 tabular-nums">
                        - Rp {Math.round((Number(deathKg) || 0) * getHpp(deathProductId)).toLocaleString()}
                      </span>
                    </div>
                    {Number(deathKg) > 0 && (
                      <div className="flex justify-between items-center border-t border-slate-200/60 pt-1.5">
                        <span className="text-[10px] text-slate-400 uppercase font-black">Sisa Stok Proyeksi:</span>
                        <span className="font-black text-slate-800 tabular-nums">
                          {Math.max(0, ((allFishProducts?.find(p => p.productId === deathProductId)?.stock || 0) - Number(deathKg))).toFixed(2)} KG
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Bobot Ikan Mati (KG) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Contoh: 1.50"
                    value={deathKg}
                    onChange={(e) => setDeathKg(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xl font-black text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Tanggal Kematian (Date) *
                  </label>
                  <input
                    type="date"
                    required
                    value={deathDate}
                    onChange={(e) => setDeathDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Catatan Mortalitas (Penyebab)
                  </label>
                  <textarea
                    rows={2}
                    value={deathNotes}
                    onChange={(e) => setDeathNotes(e.target.value)}
                    placeholder="Contoh: 2 ekor mati di bak aerasi saat pengiriman pagi dari Cikande..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                  />
                </div>

                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-[11px] text-rose-800 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <Info size={14} /> Aturan Keuangan Retail Ikan:
                  </p>
                  <p>Mortalitas otomatis memotong stok fisik dalam KG, dicatat pada WAC berjalan, dan langsung memotong Laba Bersih harian toko sebagai kerugian stok (Stock Loss).</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsDeathModalOpen(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingDeath}
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-rose-200 transition-all disabled:opacity-50"
                  >
                    {isSubmittingDeath ? 'Menyimpan...' : 'Simpan Kematian'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: Beli Stok & Update WAC */}
      {isRestockModalOpen && (
        <div className="fixed inset-0 z-[250] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                  <Truck size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">Restock Ikan & Kalkulasi WAC</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Weighted Average Costing Siklus Baru</p>
                </div>
              </div>
              <button onClick={() => setIsRestockModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {restockSuccessMsg ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto animate-bounce" />
                <p className="font-black text-slate-900 text-sm">{restockSuccessMsg}</p>
                <p className="text-xs text-slate-400">WAC dan saldo stok KG berhasil diperbarui dan ditambahkan ke grafik evolusi.</p>
              </div>
            ) : (
              <form onSubmit={handleSaveRestock} className="space-y-4 pt-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Jenis Ikan *
                  </label>
                  <select
                    value={restockProductId}
                    onChange={(e) => setRestockProductId(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Pilih Jenis Ikan --</option>
                    {allFishProducts?.map(p => (
                      <option key={p.productId} value={p.productId}>
                        {p.name} (Stok: {p.stock.toFixed(2)} KG | WAC Lama: Rp {getHpp(p.productId).toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Supplier Ikan *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddSupplierOpen(true)}
                      className="text-[10px] font-bold text-blue-600 hover:underline"
                    >
                      + Tambah Supplier Lain
                    </button>
                  </div>
                  <select
                    value={restockSupplierId}
                    onChange={(e) => setRestockSupplierId(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Pilih Supplier --</option>
                    {suppliers?.map(s => (
                      <option key={s.supplierId} value={s.supplierId}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                      Jumlah Beli (KG) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      required
                      placeholder="Contoh: 30"
                      value={restockKg}
                      onChange={(e) => setRestockKg(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                      Harga Beli / KG (Rp) *
                    </label>
                    <input
                      type="number"
                      step="100"
                      min="1000"
                      required
                      placeholder="Contoh: 32000"
                      value={restockPriceKg}
                      onChange={(e) => setRestockPriceKg(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Live WAC Calculation Preview */}
                {restockProductId && Number(restockKg) > 0 && Number(restockPriceKg) > 0 && (
                  (() => {
                    const prod = allFishProducts?.find(p => p.productId === restockProductId);
                    const oldStock = prod?.stock || 0;
                    const oldWac = getHpp(restockProductId, prod?.hpp || 0);
                    const calc = FishService.calculateWac(
                      oldStock,
                      oldWac,
                      Number(restockKg),
                      Number(restockPriceKg)
                    );

                    return (
                      <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2 text-xs">
                        <div className="flex justify-between items-center border-b border-emerald-200/80 pb-2">
                          <span className="font-black text-emerald-950 uppercase tracking-tight">
                            Simulasi WAC Baru:
                          </span>
                          <span className="text-base font-black text-emerald-700 tabular-nums">
                            Rp {calc.newWacKg.toLocaleString()} /KG
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-emerald-900">
                          <div>
                            <p className="text-slate-500">Stok Saat Ini:</p>
                            <p className="font-bold">{oldStock.toFixed(2)} KG @ Rp {oldWac.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Beli Masuk:</p>
                            <p className="font-bold">{Number(restockKg).toFixed(2)} KG @ Rp {Number(restockPriceKg).toLocaleString()}</p>
                          </div>
                          <div className="col-span-2 pt-1 border-t border-emerald-200/50">
                            <p className="text-[10px] text-slate-500 font-mono">
                              Total Biaya: Rp {calc.totalValue.toLocaleString()} / {calc.totalStockKg.toFixed(2)} KG = Rp {calc.newWacKg.toLocaleString()}/KG
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRestockModalOpen(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingRestock}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-200 transition-all disabled:opacity-50"
                  >
                    {isSubmittingRestock ? 'Memproses...' : 'Simpan & Update WAC'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: WAC Formula Simulator & Education */}
      {isWacCalcModalOpen && (
        <div className="fixed inset-0 z-[250] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                  <Calculator size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">Kalkulator & Rumus WAC Ikan</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Weighted Average Costing / KG</p>
                </div>
              </div>
              <button onClick={() => setIsWacCalcModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 pt-4 text-xs">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <p className="font-black text-slate-900 uppercase tracking-wider text-[11px]">
                  Rumus Standar WAC / KG:
                </p>
                <div className="p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs font-bold text-blue-700 text-center">
                  WAC/kg = Total Biaya Stok / Total KG Stok
                </div>
                <div className="p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-xl text-[11px] text-indigo-950 space-y-1">
                  <p className="font-black uppercase tracking-wider">Contoh Regulasi Bisnis:</p>
                  <p>20 kg @ 28.000 + 30 kg @ 32.000</p>
                  <p>= (560.000 + 960.000) / 50 kg</p>
                  <p>= total 1.520.000 / 50 kg = <span className="font-black text-indigo-700">30.400 / kg</span></p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="font-black text-slate-800 uppercase tracking-wider text-[10px]">
                  Uji Coba Interaktif:
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Stok Lama (KG)</label>
                    <input 
                      type="number"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-xs tabular-nums"
                      value={simOldStock}
                      onChange={e => setSimOldStock(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">WAC Lama (Rp/KG)</label>
                    <input 
                      type="number"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-xs tabular-nums"
                      value={simOldWac}
                      onChange={e => setSimOldWac(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Beli Baru (KG)</label>
                    <input 
                      type="number"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-xs tabular-nums"
                      value={simNewStock}
                      onChange={e => setSimNewStock(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Harga Beli Baru (Rp/KG)</label>
                    <input 
                      type="number"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-xs tabular-nums"
                      value={simNewPrice}
                      onChange={e => setSimNewPrice(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1.5 text-xs text-emerald-950">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">Total Nilai Stok:</span>
                    <span className="font-black tabular-nums">Rp {simResult.totalValue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold">Total Bobot Stok:</span>
                    <span className="font-black tabular-nums">{simResult.totalStockKg} KG</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-emerald-200/80">
                    <span className="font-black uppercase tracking-wider text-emerald-900">Hasil WAC Baru:</span>
                    <span className="text-lg font-black text-emerald-700 tabular-nums">
                      Rp {simResult.newWacKg.toLocaleString()} /KG
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setIsWacCalcModalOpen(false)}
                  className="w-full py-3 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-all"
                >
                  Tutup Simulator
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Event-based Fish Stock Opname in KG */}
      {isOpnameModalOpen && (
        <div className="fixed inset-0 z-[250] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                  <Scale size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">Stock Opname Ikan (KG)</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Penimbangan Fisik Event-Based</p>
                </div>
              </div>
              <button onClick={() => setIsOpnameModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {opnameSuccessMsg ? (
              <div className="py-12 text-center space-y-3">
                <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto animate-bounce" />
                <p className="font-black text-slate-900 text-base">{opnameSuccessMsg}</p>
                <p className="text-xs text-slate-400">Selisih penimbangan tercatat di Stock Movement ledger.</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 pt-4 space-y-4">
                <div className="shrink-0">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Keterangan Sesi Opname
                  </label>
                  <input
                    type="text"
                    value={opnameNotes}
                    onChange={e => setOpnameNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                  />
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-200 rounded-2xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                      <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <th className="px-4 py-3">Jenis Ikan</th>
                        <th className="px-4 py-3 text-center">Stok Sistem (KG)</th>
                        <th className="px-4 py-3 text-center">Timbangan Fisik (KG)</th>
                        <th className="px-4 py-3 text-right">Selisih (KG)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allFishProducts?.map(p => {
                        const inputVal = opnameInputs[p.productId] ?? p.stock;
                        const diff = Number((inputVal - p.stock).toFixed(2));

                        return (
                          <tr key={p.productId} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-bold text-slate-900 uppercase">
                              {p.name}
                            </td>
                            <td className="px-4 py-3 text-center font-black text-slate-400 tabular-nums">
                              {p.stock.toFixed(2)} KG
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="number"
                                step="0.01"
                                className="w-24 px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-center font-black tabular-nums text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={inputVal}
                                onChange={e => {
                                  const val = Number(e.target.value);
                                  setOpnameInputs(prev => ({ ...prev, [p.productId]: val }));
                                }}
                              />
                            </td>
                            <td className="px-4 py-3 text-right font-black tabular-nums">
                              <span className={diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                {diff > 0 ? `+${diff}` : diff} KG
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="shrink-0 flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOpnameModalOpen(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveOpname}
                    disabled={isSubmittingOpname}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-200 transition-all disabled:opacity-50"
                  >
                    {isSubmittingOpname ? 'Menyimpan...' : 'Finalisasi Opname Ikan'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Modal (Add / Edit) */}
      {isProductModalOpen && (
        <ProductModal 
          productId={editingProductId}
          initialProductType="FISH"
          initialBaseUnit="KG"
          onClose={() => {
            setIsProductModalOpen(false);
            setEditingProductId(undefined);
          }} 
        />
      )}

      {/* Add Supplier Modal */}
      {isAddSupplierOpen && (
        <SupplierModal
          isOpen={isAddSupplierOpen}
          onClose={() => setIsAddSupplierOpen(false)}
        />
      )}
    </div>
  );
}
