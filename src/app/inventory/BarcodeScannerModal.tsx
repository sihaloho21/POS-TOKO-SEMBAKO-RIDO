import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { db } from '@/core/database';
import { useAuthStore } from '@/core/auth-store';
import { StockService } from '@/core/services/stock-service';
import type { Product, StockMovementType } from '@/core/types';
import {
  X,
  Camera,
  Barcode,
  Search,
  Package,
  Plus,
  Edit,
  Scale,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Keyboard
} from 'lucide-react';

export interface BarcodeScannerModalProps {
  mode?: 'INVENTORY_ACTION' | 'PICK_CODE';
  title?: string;
  onClose: () => void;
  onScanCode?: (code: string, matchedProduct?: Product) => void;
  onEditProduct?: (product: Product) => void;
  onCreateWithBarcode?: (barcode: string) => void;
  onOpenFullAdjustment?: (productId: string) => void;
}

export function BarcodeScannerModal({
  mode = 'INVENTORY_ACTION',
  title = 'Pemindai Barcode & Update Stok Cepat',
  onClose,
  onScanCode,
  onEditProduct,
  onCreateWithBarcode,
  onOpenFullAdjustment
}: BarcodeScannerModalProps) {
  const { currentUser } = useAuthStore();
  const scannerContainerId = 'inventory-barcode-reader-viewport';
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [manualCode, setManualCode] = useState<string>('');
  const [scannedCode, setScannedCode] = useState<string>('');
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(null);
  const [derivedStock, setDerivedStock] = useState<number>(0);
  const [lookupDone, setLookupDone] = useState<boolean>(false);

  // Quick Stock Update state
  const [updateMode, setUpdateMode] = useState<'ADD' | 'SUBTRACT' | 'SET_PHYSICAL'>('ADD');
  const [qtyInput, setQtyInput] = useState<string>('1');
  const [reasonInput, setReasonInput] = useState<string>('Restock / Penerimaan Cepat via Scanner');
  const [isSubmittingStock, setIsSubmittingStock] = useState<boolean>(false);
  const [stockUpdateFeedback, setStockUpdateFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sound beep helper using Web Audio API
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // Ignore audio errors if blocked by browser autoplay policy
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {
        // Ignore cleanup errors
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const startScanner = async (cameraIdToUse?: string) => {
    setCameraError('');
    await stopScanner();

    try {
      const devices = await Html5Qrcode.getCameras();
      setCameras(devices || []);

      if (!devices || devices.length === 0) {
        setCameraError('Kamera tidak terdeteksi pada perangkat ini. Gunakan input barcode manual atau scanner USB di bawah.');
        return;
      }

      const targetCam =
        cameraIdToUse ||
        selectedCameraId ||
        devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'))?.id ||
        devices[0].id;

      setSelectedCameraId(targetCam);

      const html5QrCode = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE
        ],
        verbose: false
      });

      scannerRef.current = html5QrCode;
      setIsScanning(true);

      await html5QrCode.start(
        targetCam,
        {
          fps: 12,
          qrbox: { width: 260, height: 150 },
          aspectRatio: 1.777778
        },
        async (decodedText) => {
          const cleanCode = decodedText.trim();
          if (!cleanCode) return;
          playBeep();
          await handleCodeDetected(cleanCode);
        },
        () => {
          // Frame parse error ignored
        }
      );
    } catch (err: any) {
      setIsScanning(false);
      setCameraError(
        err?.message?.includes('Permission')
          ? 'Izin akses kamera ditolak. Berikan izin kamera di browser atau gunakan kolom ketik/scanner fisik di bawah.'
          : 'Tidak dapat mengakses kamera perangkat. Anda tetap dapat memindai dengan USB Barcode Scanner atau mengetik kode secara manual.'
      );
    }
  };

  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };
  }, []);

  const handleCodeDetected = async (code: string) => {
    const normalized = code.trim();
    if (!normalized) return;

    setScannedCode(normalized);
    setManualCode(normalized);
    setStockUpdateFeedback(null);

    // Search product by barcode, SKU, or productId
    const allProducts = await db.products.toArray();
    const found = allProducts.find(
      p =>
        p.barcode?.toLowerCase() === normalized.toLowerCase() ||
        p.sku?.toLowerCase() === normalized.toLowerCase() ||
        p.productId.toLowerCase() === normalized.toLowerCase()
    );

    if (mode === 'PICK_CODE') {
      await stopScanner();
      onScanCode?.(normalized, found);
      onClose();
      return;
    }

    if (found) {
      await stopScanner();
      setMatchedProduct(found);
      const currentDerived = await StockService.getDerivedStock(found.productId);
      setDerivedStock(currentDerived);
      setQtyInput('1');
      setUpdateMode('ADD');
      setReasonInput('Penambahan Stok Cepat via Barcode Scanner');
      setLookupDone(true);
      onScanCode?.(normalized, found);
    } else {
      await stopScanner();
      setMatchedProduct(null);
      setDerivedStock(0);
      setLookupDone(true);
      onScanCode?.(normalized, undefined);
    }
  };

  const handleManualLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    await handleCodeDetected(manualCode.trim());
  };

  const handleResetScan = async () => {
    setScannedCode('');
    setManualCode('');
    setMatchedProduct(null);
    setLookupDone(false);
    setStockUpdateFeedback(null);
    await startScanner(selectedCameraId);
  };

  const handleQuickStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedProduct) return;

    const numQty = Number(qtyInput);
    if (isNaN(numQty) || numQty < 0) {
      setStockUpdateFeedback({ type: 'error', message: 'Masukkan jumlah stok yang valid.' });
      return;
    }

    let delta = 0;
    let movementType: StockMovementType = 'ADJUSTMENT_IN';

    if (updateMode === 'ADD') {
      if (numQty <= 0) {
        setStockUpdateFeedback({ type: 'error', message: 'Jumlah penambahan harus lebih besar dari 0.' });
        return;
      }
      delta = numQty;
      movementType = 'ADJUSTMENT_IN';
    } else if (updateMode === 'SUBTRACT') {
      if (numQty <= 0) {
        setStockUpdateFeedback({ type: 'error', message: 'Jumlah pengurangan harus lebih besar dari 0.' });
        return;
      }
      if (derivedStock - numQty < 0 && currentUser?.role !== 'OWNER') {
        setStockUpdateFeedback({
          type: 'error',
          message: `Stok tidak mencukupi (Sisa: ${derivedStock} ${matchedProduct.baseUnit}). Hanya Owner yang dapat mengizinkan stok negatif.`
        });
        return;
      }
      delta = -numQty;
      movementType = 'ADJUSTMENT_OUT';
    } else {
      // SET_PHYSICAL (Quick Opname)
      delta = Number((numQty - derivedStock).toFixed(4));
      if (delta === 0) {
        setStockUpdateFeedback({ type: 'error', message: 'Stok fisik yang diinput sama dengan stok sistem saat ini.' });
        return;
      }
      movementType = delta > 0 ? 'STOCK_OPNAME_IN' : 'STOCK_OPNAME_OUT';
    }

    setIsSubmittingStock(true);
    setStockUpdateFeedback(null);

    try {
      const absDelta = Math.abs(delta);
      const costDoc = await db.productCosts.get(matchedProduct.productId);
      const wacSnapshot = costDoc?.hpp ?? matchedProduct.hpp ?? 0;

      await StockService.recordMovement({
        productId: matchedProduct.productId,
        movementType,
        qty: absDelta,
        unit: matchedProduct.baseUnit,
        baseQty: absDelta,
        referenceId: `scan_${Date.now().toString().slice(-8)}`,
        segmentId: matchedProduct.productType === 'FISH' ? 'IKAN' : 'WARUNG',
        reason: reasonInput.trim() || `Update Stok via Scanner (${movementType})`,
        costSnapshot: wacSnapshot,
        userId: currentUser?.userId || 'SYSTEM',
        deviceId: 'device-1'
      });

      const updatedDerived = await StockService.getDerivedStock(matchedProduct.productId);
      const refreshedProduct = await db.products.get(matchedProduct.productId);
      setDerivedStock(updatedDerived);
      if (refreshedProduct) setMatchedProduct(refreshedProduct);

      setStockUpdateFeedback({
        type: 'success',
        message: `Stok '${matchedProduct.name}' berhasil diperbarui menjadi ${updatedDerived} ${matchedProduct.baseUnit}!`
      });
    } catch (err: any) {
      setStockUpdateFeedback({
        type: 'error',
        message: err?.message || 'Gagal memperbarui stok.'
      });
    } finally {
      setIsSubmittingStock(false);
    }
  };

  const parsedQty = Number(qtyInput) || 0;
  const projectedStock =
    updateMode === 'ADD'
      ? Number((derivedStock + parsedQty).toFixed(4))
      : updateMode === 'SUBTRACT'
      ? Number((derivedStock - parsedQty).toFixed(4))
      : Number(parsedQty.toFixed(4));

  return (
    <div className="fixed inset-0 z-[260] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
              <Camera size={20} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm sm:text-base uppercase tracking-tight">
                {title}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                EAN-13 • CODE-128 • QR Code • USB Scanner Ready
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              await stopScanner();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar">
          {/* Camera Viewport */}
          {!lookupDone && (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 min-h-[220px] flex flex-col items-center justify-center">
                <div id={scannerContainerId} className="w-full" />
                {!isScanning && !cameraError && (
                  <div className="py-12 text-center text-slate-400 text-xs font-bold">
                    Menyiapkan kamera perangkat...
                  </div>
                )}
                {cameraError && (
                  <div className="p-6 text-center space-y-3 max-w-md mx-auto">
                    <AlertTriangle size={28} className="text-amber-400 mx-auto" />
                    <p className="text-xs font-bold text-slate-200 leading-relaxed">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => startScanner()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5"
                    >
                      <RefreshCw size={13} /> Coba Muat Ulang Kamera
                    </button>
                  </div>
                )}
              </div>

              {cameras.length > 1 && (
                <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Pilih Kamera:</span>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => startScanner(e.target.value)}
                    className="text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1 outline-none"
                  >
                    {cameras.map((cam, idx) => (
                      <option key={cam.id} value={cam.id}>
                        {cam.label || `Kamera ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Manual / USB Scanner Input Bar */}
          <form onSubmit={handleManualLookup} className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Keyboard size={13} />
              <span>Ketik Barcode / SKU atau Gunakan Scanner Fisik (USB/Bluetooth)</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Barcode size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Scan atau ketik kode barcode lalu tekan Enter..."
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition-all"
              >
                <Search size={14} />
                Cari
              </button>
              {lookupDone && (
                <button
                  type="button"
                  onClick={handleResetScan}
                  className="px-3 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 shrink-0 transition-all"
                  title="Scan Ulang dengan Kamera"
                >
                  <Camera size={14} />
                  Scan Lagi
                </button>
              )}
            </div>
          </form>

          {/* Lookup Result Section (INVENTORY_ACTION mode) */}
          {lookupDone && mode === 'INVENTORY_ACTION' && (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              {matchedProduct ? (
                <div className="space-y-4">
                  {/* Matched Product Card */}
                  <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Package size={22} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md">
                            Produk Ditemukan
                          </span>
                          <span className="text-[10px] font-mono font-bold text-slate-500">
                            {matchedProduct.barcode || matchedProduct.sku}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-slate-900 uppercase mt-0.5">
                          {matchedProduct.name}
                        </h4>
                        <p className="text-xs font-bold text-blue-600">
                          Harga Jual: Rp {matchedProduct.normalPrice.toLocaleString()} / {matchedProduct.baseUnit}
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-end justify-between w-full sm:w-auto border-t sm:border-t-0 pt-2 sm:pt-0 border-blue-200/60">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Stok Saat Ini</span>
                      <span className="text-lg font-black text-slate-900 tabular-nums">
                        {derivedStock} <span className="text-xs font-bold text-slate-500">{matchedProduct.baseUnit}</span>
                      </span>
                    </div>
                  </div>

                  {/* Quick Stock Update Form */}
                  {matchedProduct.productType !== 'BUNDLE' ? (
                    <form onSubmit={handleQuickStockSubmit} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                          <Scale size={15} className="text-indigo-600" />
                          Update Stok Cepat (Derived Ledger)
                        </h5>
                        <span className="text-[10px] font-black text-slate-400 uppercase">
                          Proyeksi: <strong className={projectedStock < 0 ? 'text-rose-600' : 'text-emerald-600'}>{projectedStock} {matchedProduct.baseUnit}</strong>
                        </span>
                      </div>

                      {/* Mode Selector */}
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setUpdateMode('ADD');
                            setQtyInput('1');
                            setReasonInput('Penambahan Stok Cepat via Barcode Scanner');
                          }}
                          className={`py-2 px-2 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${
                            updateMode === 'ADD'
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <ArrowUpRight size={14} />
                          Tambah (+IN)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUpdateMode('SUBTRACT');
                            setQtyInput('1');
                            setReasonInput('Pengurangan Stok Cepat via Barcode Scanner');
                          }}
                          className={`py-2 px-2 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${
                            updateMode === 'SUBTRACT'
                              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <ArrowDownRight size={14} />
                          Kurangi (-OUT)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUpdateMode('SET_PHYSICAL');
                            setQtyInput(String(derivedStock));
                            setReasonInput('Koreksi Fisik Cepat via Barcode Scanner');
                          }}
                          className={`py-2 px-2 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${
                            updateMode === 'SET_PHYSICAL'
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Scale size={14} />
                          Set Fisik
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                            {updateMode === 'SET_PHYSICAL' ? `Stok Fisik (${matchedProduct.baseUnit})` : `Kuantitas (${matchedProduct.baseUnit})`}
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            required
                            value={qtyInput}
                            onChange={(e) => setQtyInput(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                            Catatan / Alasan Mutasi
                          </label>
                          <input
                            type="text"
                            value={reasonInput}
                            onChange={(e) => setReasonInput(e.target.value)}
                            placeholder="Alasan perubahan stok..."
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {stockUpdateFeedback && (
                        <div
                          className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                            stockUpdateFeedback.type === 'success'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {stockUpdateFeedback.type === 'success' ? (
                            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                          ) : (
                            <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                          )}
                          <span>{stockUpdateFeedback.message}</span>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                          {onEditProduct && (
                            <button
                              type="button"
                              onClick={() => {
                                onEditProduct(matchedProduct);
                                onClose();
                              }}
                              className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                            >
                              <Edit size={13} />
                              Edit Master
                            </button>
                          )}
                          {onOpenFullAdjustment && (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenFullAdjustment(matchedProduct.productId);
                                onClose();
                              }}
                              className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                            >
                              <Scale size={13} />
                              Form Lengkap
                            </button>
                          )}
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmittingStock}
                          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-blue-200 disabled:opacity-50 transition-all"
                        >
                          {isSubmittingStock ? 'Menyimpan...' : 'Simpan Perubahan Stok'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800">
                      Produk ini adalah Paket Bundling (Virtual). Stok mengikuti komponen penyusunnya.
                    </div>
                  )}
                </div>
              ) : (
                /* Unmatched Barcode Card */
                <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200 text-center space-y-3">
                  <AlertTriangle size={28} className="text-amber-500 mx-auto" />
                  <div>
                    <p className="text-xs font-black uppercase text-slate-900">
                      Barcode "{scannedCode}" Belum Terdaftar
                    </p>
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                      Tidak ditemukan produk dengan barcode atau SKU tersebut di database inventaris.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {onCreateWithBarcode && (
                      <button
                        type="button"
                        onClick={() => {
                          onCreateWithBarcode(scannedCode);
                          onClose();
                        }}
                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md shadow-blue-200"
                      >
                        <Plus size={15} />
                        Tambah Produk Baru dengan Barcode Ini
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default BarcodeScannerModal;
