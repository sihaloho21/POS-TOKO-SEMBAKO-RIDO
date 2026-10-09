import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { 
  Camera, 
  X, 
  RefreshCw, 
  Zap, 
  ZapOff, 
  AlertCircle, 
  CheckCircle2, 
  Volume2, 
  VolumeX, 
  FlipHorizontal,
  Keyboard,
  Barcode
} from 'lucide-react';

interface CameraBarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
  subtitle?: string;
  continuous?: boolean; // If true, stays open after scanning (e.g. in POS)
  lastScannedInfo?: { name: string; price?: number; barcode: string } | null;
  sampleBarcodes?: { barcode: string; label: string }[];
}

export function CameraBarcodeScanner({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Barcode Kamera',
  subtitle = 'Arahkan kamera ke barcode produk',
  continuous = false,
  lastScannedInfo = null,
  sampleBarcodes = []
}: CameraBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [manualCode, setManualCode] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [flashSuccess, setFlashSuccess] = useState<boolean>(false);
  const [recentScannedCode, setRecentScannedCode] = useState<string>('');

  // Audio beep generator using Web Audio API
  const playBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, ctx.currentTime); // 1800 Hz crisp POS beep
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // AudioContext might be blocked until user gesture, ignore
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(80);
      } catch {}
    }
  }, [soundEnabled]);

  const handleDetectedCode = useCallback((code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    const now = Date.now();
    // In continuous mode, prevent repeat scan of same code within 1500ms
    if (
      continuous &&
      cleanCode === lastScannedCodeRef.current &&
      now - lastScannedTimeRef.current < 1500
    ) {
      return;
    }

    lastScannedTimeRef.current = now;
    lastScannedCodeRef.current = cleanCode;
    setRecentScannedCode(cleanCode);

    playBeep();
    setFlashSuccess(true);
    setTimeout(() => setFlashSuccess(false), 400);

    onScan(cleanCode);

    if (!continuous) {
      stopCamera();
      onClose();
    }
  }, [continuous, onClose, onScan, playBeep]);

  // Start Scanner
  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setIsScanning(true);
    setErrorMessage('');

    try {
      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera tidak didukung oleh browser ini.');
      }

      // Stop previous controls if any
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      const reader = new BrowserMultiFormatReader();

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setHasCameraPermission(true);

      // Check if torch/flashlight is supported
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities: any = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
        if (capabilities.torch) {
          setHasTorch(true);
        } else {
          setHasTorch(false);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Start decoding from video stream
      const controls = await reader.decodeFromStream(
        stream,
        videoRef.current,
        (result, error) => {
          if (result) {
            handleDetectedCode(result.getText());
          }
          // Ignored per-frame decoding errors
        }
      );

      controlsRef.current = controls;
    } catch (err: any) {
      console.warn('Camera barcode scanner error:', err);
      setHasCameraPermission(false);
      setErrorMessage(
        err.name === 'NotAllowedError'
          ? 'Izin akses kamera ditolak. Silakan izinkan akses kamera di pengaturan browser.'
          : err.name === 'NotFoundError'
          ? 'Perangkat kamera tidak ditemukan.'
          : err.message || 'Gagal memulai kamera scanner.'
      );
    } finally {
      setIsScanning(false);
    }
  }, [facingMode, handleDetectedCode]);

  const stopCamera = useCallback(() => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {}
      controlsRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(t => t.stop());
      } catch {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsTorchOn(false);
  }, []);

  // Toggle torch / flash
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !isTorchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }]
        });
        setIsTorchOn(nextState);
      } catch (e) {
        console.warn('Failed to toggle torch:', e);
      }
    }
  };

  // Flip camera (front/back)
  const flipCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // Handle manual code submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleDetectedCode(manualCode.trim());
    setManualCode('');
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode, startCamera, stopCamera]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col text-white max-h-[95vh]">
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center">
              <Camera size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm uppercase tracking-tight text-white">{title}</h3>
                {continuous && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-wider">
                    Auto-Add Aktif
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-medium">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl transition-all ${
                soundEnabled ? 'text-blue-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-800'
              }`}
              title={soundEnabled ? 'Bisu Suara' : 'Aktifkan Suara Beep'}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Camera Viewport Area */}
        <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center min-h-[300px] max-h-[420px]">
          {/* HTML5 Video Element */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* Flash animation on successful scan */}
          {flashSuccess && (
            <div className="absolute inset-0 bg-emerald-500/30 pointer-events-none transition-opacity duration-300 z-30" />
          )}

          {/* Targeting Crosshairs & Scan Frame Overlay */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6 z-20">
            {/* Target Reticle Frame */}
            <div className={`relative w-64 h-48 sm:w-72 sm:h-52 rounded-2xl border-2 transition-all ${
              flashSuccess ? 'border-emerald-400 shadow-lg shadow-emerald-500/50' : 'border-blue-400/80 shadow-lg shadow-blue-500/20'
            }`}>
              {/* Corner Accents */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />

              {/* Animated Laser Scanning Line */}
              <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-sm shadow-rose-500 animate-pulse top-1/2 -translate-y-1/2" />
            </div>

            <p className="mt-4 text-xs font-bold text-white/90 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700 shadow-sm">
              Posisikan barcode di dalam kotak scanner
            </p>
          </div>

          {/* Camera Controls Overlay: Torch & Flip Camera */}
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
            {hasTorch && (
              <button
                onClick={toggleTorch}
                className={`p-3 rounded-2xl backdrop-blur-md transition-all border ${
                  isTorchOn
                    ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/30'
                    : 'bg-slate-900/70 text-white border-slate-700 hover:bg-slate-800'
                }`}
                title={isTorchOn ? 'Matikan Lampu' : 'Nyalakan Lampu'}
              >
                {isTorchOn ? <Zap size={18} /> : <ZapOff size={18} />}
              </button>
            )}

            <button
              onClick={flipCamera}
              className="p-3 rounded-2xl bg-slate-900/70 hover:bg-slate-800 text-white border border-slate-700 backdrop-blur-md transition-all cursor-pointer"
              title="Ganti Kamera (Depan / Belakang)"
            >
              <FlipHorizontal size={18} />
            </button>
          </div>

          {/* Fallback / Error Banner if Camera is not available */}
          {errorMessage && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md p-6 flex flex-col items-center justify-center text-center z-30">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mb-3 border border-rose-500/30">
                <AlertCircle size={28} />
              </div>
              <h4 className="font-black text-white text-sm mb-1 uppercase tracking-tight">Kamera Tidak Dapat Diakses</h4>
              <p className="text-xs text-slate-400 max-w-xs mb-4 leading-relaxed">{errorMessage}</p>
              
              <button
                onClick={startCamera}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-blue-600/30 cursor-pointer"
              >
                <RefreshCw size={14} />
                Coba Lagi
              </button>
            </div>
          )}
        </div>

        {/* Bottom Panel: Last Scanned Info + Manual Input + Demo Barcode Quick Taps */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-3.5">
          {/* Continuous Last Scanned Feedback Banner */}
          {lastScannedInfo && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={16} />
                </div>
                <div className="truncate">
                  <p className="font-bold text-white uppercase text-xs truncate max-w-[200px]">
                    {lastScannedInfo.name}
                  </p>
                  <p className="text-[10px] text-emerald-400 font-mono">
                    {lastScannedInfo.barcode}
                    {lastScannedInfo.price !== undefined && ` • Rp ${lastScannedInfo.price.toLocaleString()}`}
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[9px] uppercase tracking-wider shrink-0">
                Ditambahkan!
              </span>
            </div>
          )}

          {/* Manual Input Bar */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Barcode size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Ketik barcode jika kamera buram..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-white placeholder-slate-500 outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-blue-600/20 cursor-pointer"
            >
              Kirim
            </button>
          </form>

          {/* Quick Demo Barcodes (helpful for instant one-click testing) */}
          {sampleBarcodes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Keyboard size={12} /> Barcode Cepat (Simulasi Test):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sampleBarcodes.map((item) => (
                  <button
                    key={item.barcode}
                    type="button"
                    onClick={() => handleDetectedCode(item.barcode)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[10px] font-mono border border-slate-700/80 transition-all flex items-center gap-1"
                  >
                    <span>{item.label}</span>
                    <span className="text-slate-500 font-sans text-[9px]">({item.barcode})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
