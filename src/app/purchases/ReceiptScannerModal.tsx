import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  X, 
  Check, 
  RefreshCw, 
  AlertCircle, 
  Sparkles, 
  Trash2, 
  Plus, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  FileText,
  ChevronDown,
  ShoppingBag
} from 'lucide-react';
import type { Product, Supplier } from '@/core/types';
import { useToastStore } from '@/core/toast-store';

export interface ScannedReceiptItem {
  id: string;
  rawName: string;
  matchedProductId: string;
  matchedProductName: string;
  matchConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  quantity: number;
  unit: string;
  purchasePrice: number;
  discount: number;
  lineTotal: number;
}

export interface ScannedReceiptResult {
  storeName?: string;
  matchedSupplierId?: string;
  invoiceNumber?: string;
  date?: string;
  items: ScannedReceiptItem[];
  totalAmount?: number;
}

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  suppliers: Supplier[];
  onApply: (result: {
    supplierId?: string;
    invoiceNumber: string;
    items: {
      productId: string;
      name: string;
      quantity: number;
      unit: string;
      purchasePrice: number;
      discount: number;
    }[];
  }) => void;
}

// Helper: Calculate text similarity score (0 to 1)
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim().replace(/[^a-z0-9]/g, ' ');
  const s2 = str2.toLowerCase().trim().replace(/[^a-z0-9]/g, ' ');

  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0;

  const words1 = s1.split(/\s+/).filter(Boolean);
  const words2 = s2.split(/\s+/).filter(Boolean);

  let matchCount = 0;
  for (const w1 of words1) {
    if (words2.some(w2 => w2 === w1 || (w1.length > 3 && w2.includes(w1)) || (w2.length > 3 && w1.includes(w2)))) {
      matchCount++;
    }
  }

  const tokenScore = (2 * matchCount) / (words1.length + words2.length);
  return tokenScore;
}

// Find best matching product from store master catalog
function findMatchingProduct(
  rawName: string, 
  suggestedName: string, 
  products: Product[]
): { product: Product | null; confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' } {
  if (!products || products.length === 0) {
    return { product: null, confidence: 'NONE' };
  }

  let bestProduct: Product | null = null;
  let highestScore = 0;

  for (const p of products) {
    // Score against suggestedName (from AI) and rawName (from receipt)
    const scoreSuggested = suggestedName ? calculateSimilarity(suggestedName, p.name) : 0;
    const scoreRaw = calculateSimilarity(rawName, p.name);
    const score = Math.max(scoreSuggested, scoreRaw);

    if (score > highestScore) {
      highestScore = score;
      bestProduct = p;
    }
  }

  if (highestScore >= 0.75 && bestProduct) {
    return { product: bestProduct, confidence: 'HIGH' };
  } else if (highestScore >= 0.45 && bestProduct) {
    return { product: bestProduct, confidence: 'MEDIUM' };
  } else if (highestScore >= 0.25 && bestProduct) {
    return { product: bestProduct, confidence: 'LOW' };
  }

  return { product: null, confidence: 'NONE' };
}

export function ReceiptScannerModal({
  isOpen,
  onClose,
  products = [],
  suppliers = [],
  onApply
}: ReceiptScannerModalProps) {
  const { addToast } = useToastStore();

  const [inputMode, setInputMode] = useState<'CAMERA' | 'FILE'>('FILE');
  const [stage, setStage] = useState<'CAPTURE' | 'SCANNING' | 'REVIEW'>('CAPTURE');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scanStepMessage, setScanStepMessage] = useState<string>('');

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Review stage state
  const [scannedItems, setScannedItems] = useState<ScannedReceiptItem[]>([]);
  const [detectedStoreName, setDetectedStoreName] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [detectedInvoiceNumber, setDetectedInvoiceNumber] = useState<string>('');
  const [imageZoom, setImageZoom] = useState<number>(1);

  // Cleanup camera stream on unmount or tab switch
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      setStage('CAPTURE');
      setImagePreview(null);
      setScannedItems([]);
      setImageZoom(1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputMode === 'CAMERA' && stage === 'CAPTURE') {
      startCamera();
    } else {
      stopCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [isOpen, inputMode, stage]);

  const startCamera = async () => {
    stopCameraStream();
    setCameraError(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Camera access failed:', err);
      setCameraError('Tidak dapat mengakses kamera. Pastikan izin kamera aktif atau gunakan tab Unggah File Gambar.');
      setCameraActive(false);
    }
  };

  const handleCaptureFromCamera = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    stopCameraStream();
    setImagePreview(dataUrl);
    processReceiptImage(dataUrl);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addToast('File harus berupa format gambar (JPG, PNG, WEBP).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImagePreview(base64);
      processReceiptImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const processReceiptImage = async (base64Image: string) => {
    setStage('SCANNING');
    setScanStepMessage('Mengirim foto struk ke server AI...');

    try {
      // Prepare catalog hints to assist Gemini in normalizing grocery abbreviations
      const catalogHints = products.slice(0, 100).map(p => ({
        name: p.name,
        barcode: p.barcode,
        sku: p.sku
      }));

      setScanStepMessage('AI sedang membaca baris teks, nama toko, dan harga pada struk...');

      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: base64Image,
          productCatalogHints: catalogHints
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error (${res.status})`);
      }

      setScanStepMessage('Mencocokkan nama barang ke master produk toko...');

      const result = await res.json();
      const data = result.data;

      // Extract store & invoice number
      setDetectedStoreName(data.storeName || '');
      setDetectedInvoiceNumber(data.invoiceNumber || `STRUK-${Date.now().toString().slice(-6)}`);

      // Try to auto-match supplier if storeName is detected
      if (data.storeName) {
        const matchedSup = suppliers.find(s => 
          calculateSimilarity(s.name, data.storeName) >= 0.5
        );
        if (matchedSup) {
          setSelectedSupplierId(matchedSup.supplierId);
        } else if (suppliers.length > 0) {
          setSelectedSupplierId(suppliers[0].supplierId);
        }
      } else if (suppliers.length > 0) {
        setSelectedSupplierId(suppliers[0].supplierId);
      }

      // Map scanned items to our internal state with auto-matching
      const parsedItems: ScannedReceiptItem[] = (data.items || []).map((rawItem: any, index: number) => {
        const { product, confidence } = findMatchingProduct(
          rawItem.rawName || '',
          rawItem.suggestedProductName || '',
          products
        );

        const qty = Number(rawItem.quantity) > 0 ? Number(rawItem.quantity) : 1;
        const price = Number(rawItem.purchasePrice) >= 0 ? Number(rawItem.purchasePrice) : 0;
        const discount = Number(rawItem.discount) || 0;
        const lineTotal = Number(rawItem.lineTotal) || (qty * price - discount);

        return {
          id: `item-${index}-${Date.now()}`,
          rawName: rawItem.rawName || 'Item Struk',
          matchedProductId: product ? product.productId : '',
          matchedProductName: product ? product.name : (rawItem.suggestedProductName || rawItem.rawName || ''),
          matchConfidence: confidence,
          quantity: qty,
          unit: rawItem.unit || (product?.baseUnit || 'PCS'),
          purchasePrice: price,
          discount,
          lineTotal
        };
      });

      setScannedItems(parsedItems);
      setStage('REVIEW');
      addToast(`Berhasil membaca ${parsedItems.length} produk dari struk belanjaan! Silakan periksa.`, 'success');
    } catch (err: any) {
      console.error('Scan error:', err);
      addToast('Gagal memproses struk: ' + (err.message || 'Coba lagi dengan gambar yang lebih terang.'), 'error');
      setStage('CAPTURE');
    }
  };

  // Item editing handlers
  const handleUpdateItem = (id: string, field: keyof ScannedReceiptItem, value: any) => {
    setScannedItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const updated = { ...item, [field]: value };

      // If user selected a different master product from dropdown
      if (field === 'matchedProductId') {
        const found = products.find(p => p.productId === value);
        if (found) {
          updated.matchedProductName = found.name;
          updated.unit = found.baseUnit || updated.unit;
          updated.matchConfidence = 'HIGH';
        }
      }

      // Recalculate line total if quantity or price changed
      if (field === 'quantity' || field === 'purchasePrice' || field === 'discount') {
        const q = field === 'quantity' ? Number(value) : updated.quantity;
        const p = field === 'purchasePrice' ? Number(value) : updated.purchasePrice;
        const d = field === 'discount' ? Number(value) : updated.discount;
        updated.lineTotal = Math.max(0, (q * p) - d);
      }

      return updated;
    }));
  };

  const handleRemoveItem = (id: string) => {
    setScannedItems(prev => prev.filter(i => i.id !== id));
  };

  const handleAddNewItem = () => {
    const newItem: ScannedReceiptItem = {
      id: `manual-${Date.now()}`,
      rawName: 'Item Tambahan Manual',
      matchedProductId: products[0]?.productId || '',
      matchedProductName: products[0]?.name || '',
      matchConfidence: 'HIGH',
      quantity: 1,
      unit: products[0]?.baseUnit || 'PCS',
      purchasePrice: 0,
      discount: 0,
      lineTotal: 0
    };
    setScannedItems([...scannedItems, newItem]);
  };

  const handleApplyToPurchase = () => {
    if (scannedItems.length === 0) {
      addToast('Tidak ada barang untuk diterapkan ke pembelian.', 'error');
      return;
    }

    // Check if any items have no matchedProductId
    const invalidItems = scannedItems.filter(i => !i.matchedProductId);
    if (invalidItems.length > 0) {
      addToast(`Terdapat ${invalidItems.length} barang yang belum dicocokkan ke master produk toko. Silakan pilih produknya.`, 'error');
      return;
    }

    const formattedItems = scannedItems.map(item => ({
      productId: item.matchedProductId,
      name: item.matchedProductName,
      quantity: item.quantity,
      unit: item.unit,
      purchasePrice: item.purchasePrice,
      discount: item.discount
    }));

    onApply({
      supplierId: selectedSupplierId || undefined,
      invoiceNumber: detectedInvoiceNumber || `INV-${Date.now()}`,
      items: formattedItems
    });

    onClose();
  };

  const calculateTotalScanned = () => {
    return scannedItems.reduce((acc, item) => acc + item.lineTotal, 0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Camera size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">Smart Receipt Scanner</h3>
                <span className="text-[10px] font-black tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md flex items-center gap-1 border border-blue-200">
                  <Sparkles size={11} /> AI OCR
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Pindai foto struk belanjaan kulakan untuk mengisi Daftar Barang Masuk secara otomatis.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {stage === 'CAPTURE' && (
            <div className="space-y-6">
              {/* Method Switcher */}
              <div className="flex bg-slate-100 p-1 rounded-2xl max-w-md mx-auto">
                <button
                  type="button"
                  onClick={() => setInputMode('FILE')}
                  className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    inputMode === 'FILE' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Upload size={16} />
                  Unggah Gambar
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('CAMERA')}
                  className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    inputMode === 'CAMERA' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Camera size={16} />
                  Kamera Langsung
                </button>
              </div>

              {inputMode === 'CAMERA' ? (
                <div className="space-y-4">
                  {cameraError ? (
                    <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-3">
                      <AlertCircle size={32} className="mx-auto text-amber-600" />
                      <p className="text-xs font-bold text-amber-900">{cameraError}</p>
                      <button
                        type="button"
                        onClick={() => setInputMode('FILE')}
                        className="px-5 py-2 bg-amber-600 text-white rounded-xl text-xs font-black uppercase tracking-wider"
                      >
                        Beralih ke Unggah File
                      </button>
                    </div>
                  ) : (
                    <div className="relative rounded-2xl overflow-hidden bg-black aspect-4/3 max-w-xl mx-auto shadow-inner flex items-center justify-center">
                      <video 
                        ref={videoRef} 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover"
                      />
                      
                      {/* Guide Viewfinder Overlay */}
                      <div className="absolute inset-8 border-2 border-dashed border-white/60 rounded-xl pointer-events-none flex flex-col justify-between p-4">
                        <div className="flex justify-between text-white/70 text-[10px] font-bold uppercase tracking-widest bg-black/40 px-2 py-1 rounded w-fit">
                          Posisikan Struk di Dalam Garis Ini
                        </div>
                        <div className="text-center text-white/80 text-[10px] font-medium bg-black/40 py-1 rounded">
                          Pastikan pencahayaan cukup dan teks terlihat tajam
                        </div>
                      </div>

                      {/* Capture Trigger Button */}
                      <div className="absolute bottom-5 inset-x-0 flex justify-center items-center gap-4">
                        <button
                          type="button"
                          onClick={handleCaptureFromCamera}
                          disabled={!cameraActive}
                          className="w-16 h-16 rounded-full bg-white border-4 border-blue-600 shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                          title="Ambil Foto"
                        >
                          <div className="w-10 h-10 rounded-full bg-blue-600" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-w-xl mx-auto">
                  <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/50 hover:bg-blue-50/30 rounded-3xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all group">
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment"
                      className="hidden" 
                      onChange={handleFileChange} 
                    />
                    <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform mb-4">
                      <Upload size={28} />
                    </div>
                    <span className="text-sm font-black text-slate-800 uppercase tracking-wider mb-1">
                      Pilih atau Seret Foto Struk ke Sini
                    </span>
                    <span className="text-xs text-slate-400 font-medium text-center max-w-sm">
                      Mendukung format JPG, PNG, atau WEBP. Pada smartphone, Anda dapat langsung memilih kamera.
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {stage === 'SCANNING' && (
            <div className="py-16 flex flex-col items-center justify-center space-y-6 text-center max-w-md mx-auto">
              <div className="relative w-28 h-36 rounded-2xl border-2 border-blue-500 overflow-hidden shadow-xl bg-slate-900 flex items-center justify-center">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover opacity-70" />
                ) : (
                  <FileText className="text-slate-600" size={48} />
                )}
                {/* Laser Scanning Bar */}
                <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#22d3ee] animate-bounce" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-blue-600 font-black text-sm uppercase tracking-wider">
                  <RefreshCw className="animate-spin" size={16} />
                  Memproses Gambar Struk
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  {scanStepMessage || 'Sedang mengekstrak rincian belanjaan dan mencocokkan ke master stok...'}
                </p>
              </div>
            </div>
          )}

          {stage === 'REVIEW' && (
            <div className="space-y-6">
              {/* Header Details Bar: Supplier & Invoice Number */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Supplier / Toko Struk
                    </label>
                    {detectedStoreName && (
                      <span className="text-[10px] text-slate-500 font-bold truncate max-w-[200px]">
                        Terbaca: &quot;{detectedStoreName}&quot;
                      </span>
                    )}
                  </div>
                  <select
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                    value={selectedSupplierId}
                    onChange={e => setSelectedSupplierId(e.target.value)}
                  >
                    <option value="">-- Pilih Supplier Toko --</option>
                    {suppliers.map(s => (
                      <option key={s.supplierId} value={s.supplierId}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    No. Faktur / Nota Struk
                  </label>
                  <input
                    type="text"
                    value={detectedInvoiceNumber}
                    onChange={e => setDetectedInvoiceNumber(e.target.value)}
                    placeholder="Contoh: FAK-2026-001"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Split Content: Left = Receipt Preview, Right = Extracted Item Table */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left: Receipt Photo Viewer with Zoom */}
                <div className="lg:col-span-4 bg-slate-900 rounded-2xl p-3 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-white/80 px-2 py-1">
                    <span className="text-[10px] font-black uppercase tracking-wider">Foto Struk Asli</span>
                    <div className="flex items-center gap-1">
                      <button 
                        type="button"
                        onClick={() => setImageZoom(z => Math.max(0.7, z - 0.2))}
                        className="p-1 hover:bg-slate-800 rounded text-slate-300"
                        title="Perkecil"
                      >
                        <ZoomOut size={14} />
                      </button>
                      <button 
                        type="button"
                        onClick={() => setImageZoom(1)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-300"
                        title="Reset Zoom"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button 
                        type="button"
                        onClick={() => setImageZoom(z => Math.min(2.5, z + 0.2))}
                        className="p-1 hover:bg-slate-800 rounded text-slate-300"
                        title="Perbesar"
                      >
                        <ZoomIn size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="relative overflow-auto max-h-[450px] rounded-xl bg-black/60 flex items-center justify-center p-2">
                    {imagePreview ? (
                      <img 
                        src={imagePreview} 
                        alt="Foto Struk" 
                        style={{ transform: `scale(${imageZoom})`, transformOrigin: 'top center' }}
                        className="max-w-full transition-transform duration-150"
                      />
                    ) : (
                      <span className="text-xs text-slate-500">Tidak ada gambar</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 text-center font-medium">
                    Gunakan tombol zoom untuk memeriksa teks struk yang buram atau kecil.
                  </p>
                </div>

                {/* Right: Extracted Items Table */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Rincian Barang Terdeteksi ({scannedItems.length} Item)
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Periksa kecocokan produk toko, jumlah kuantitas, dan harga satuan beli di bawah ini.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddNewItem}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors"
                    >
                      <Plus size={12} />
                      Tambah Baris
                    </button>
                  </div>

                  {scannedItems.length === 0 ? (
                    <div className="p-8 border border-dashed border-slate-200 rounded-2xl text-center space-y-2">
                      <ShoppingBag className="mx-auto text-slate-300" size={32} />
                      <p className="text-xs font-bold text-slate-500">Tidak ada barang terdeteksi pada struk.</p>
                      <button
                        type="button"
                        onClick={() => setStage('CAPTURE')}
                        className="text-xs font-black text-blue-600 hover:underline"
                      >
                        Coba Foto Ulang
                      </button>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                      <div className="overflow-x-auto max-h-[380px]">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-200 sticky top-0 z-10">
                              <th className="px-3 py-3">Nama di Struk & Master Produk</th>
                              <th className="px-2 py-3 text-center w-24">Qty & Satuan</th>
                              <th className="px-3 py-3 text-right w-28">Harga Satuan (Rp)</th>
                              <th className="px-3 py-3 text-right w-28">Subtotal</th>
                              <th className="px-2 py-3 w-10"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {scannedItems.map((item) => (
                              <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                                {/* Product Identification */}
                                <td className="px-3 py-3 space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Struk:</span>
                                    <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                                      {item.rawName}
                                    </span>
                                    {item.matchConfidence === 'HIGH' && (
                                      <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                        Cocok
                                      </span>
                                    )}
                                    {item.matchConfidence === 'MEDIUM' && (
                                      <span className="text-[9px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                        Saran
                                      </span>
                                    )}
                                    {(item.matchConfidence === 'LOW' || item.matchConfidence === 'NONE') && (
                                      <span className="text-[9px] font-black text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                                        Pilih Manual
                                      </span>
                                    )}
                                  </div>

                                  {/* Select master product */}
                                  <select
                                    className={`w-full px-2 py-1.5 text-xs font-bold rounded-lg border outline-none ${
                                      item.matchedProductId 
                                        ? 'bg-white border-slate-200 text-slate-900 focus:ring-1 focus:ring-blue-500' 
                                        : 'bg-rose-50 border-rose-300 text-rose-900 focus:ring-1 focus:ring-rose-500'
                                    }`}
                                    value={item.matchedProductId}
                                    onChange={e => handleUpdateItem(item.id, 'matchedProductId', e.target.value)}
                                  >
                                    <option value="">-- Pilih Master Produk Toko --</option>
                                    {products.map(p => (
                                      <option key={p.productId} value={p.productId}>
                                        {p.name} ({p.baseUnit})
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                {/* Qty & Unit */}
                                <td className="px-2 py-3">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0.1"
                                      step="any"
                                      value={item.quantity}
                                      onChange={e => handleUpdateItem(item.id, 'quantity', Number(e.target.value) || 0)}
                                      className="w-14 px-1.5 py-1 text-center font-bold bg-white border border-slate-200 rounded-lg text-xs font-mono tabular-nums outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                    <input
                                      type="text"
                                      value={item.unit}
                                      onChange={e => handleUpdateItem(item.id, 'unit', e.target.value.toUpperCase())}
                                      className="w-12 px-1 py-1 text-center font-bold text-[10px] text-slate-500 uppercase bg-slate-50 border border-slate-200 rounded-lg outline-none"
                                    />
                                  </div>
                                </td>

                                {/* Purchase Price */}
                                <td className="px-3 py-3 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    step="500"
                                    value={item.purchasePrice}
                                    onChange={e => handleUpdateItem(item.id, 'purchasePrice', Number(e.target.value) || 0)}
                                    className="w-24 px-2 py-1 text-right font-bold bg-white border border-slate-200 rounded-lg text-xs font-mono tabular-nums outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </td>

                                {/* Line Subtotal */}
                                <td className="px-3 py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                                  Rp {item.lineTotal.toLocaleString()}
                                </td>

                                {/* Delete row */}
                                <td className="px-2 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(item.id)}
                                    className="text-slate-300 hover:text-rose-500 p-1 rounded transition-colors"
                                    title="Hapus baris"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Subtotal Footer */}
                      <div className="bg-slate-50/80 px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs">
                        <span className="font-black text-slate-500 uppercase tracking-wider text-[10px]">
                          Total Hasil Scan:
                        </span>
                        <span className="font-mono font-black text-sm text-blue-600 tabular-nums">
                          Rp {calculateTotalScanned().toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div>
            {stage === 'REVIEW' && (
              <button
                type="button"
                onClick={() => {
                  setStage('CAPTURE');
                  setImagePreview(null);
                }}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1.5"
              >
                <RefreshCw size={14} />
                Scan Ulang
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
            >
              Batal
            </button>

            {stage === 'REVIEW' && (
              <button
                type="button"
                onClick={handleApplyToPurchase}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
              >
                <Check size={16} />
                Terapkan ke Daftar Barang Masuk
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
