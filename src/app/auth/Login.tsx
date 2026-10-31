import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/core/auth-store';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '@/core/database';
import { Keypad } from '@/components/Keypad';
import { LogIn, Lock, ShieldCheck, UserCheck, Keyboard } from 'lucide-react';
import type { Product } from '@/core/types';
import { ProductService } from '@/core/services/product-service';
import { StoreStatusService } from '@/core/services/store-status-service';
import { CloudAuthService } from '@/core/services/cloud-auth-service';

export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { login, seedDefaultUsers } = useAuthStore();

  useEffect(() => {
    async function init() {
      try {
        // Ensure both OWNER and KASIR users are seeded
        await seedDefaultUsers();

        // Ensure default payment methods exist
        const paymentMethodCount = await db.paymentMethods.count();
        if (paymentMethodCount === 0) {
          await db.paymentMethods.bulkAdd([
            { id: 'CASH', name: 'Tunai (Cash)', type: 'CASH', mdrPercent: 0, status: 'ACTIVE' },
            { id: 'QRIS', name: 'BCA QRIS', type: 'QRIS', mdrPercent: 0.7, status: 'ACTIVE' },
            { id: 'DEBIT', name: 'Debit Card', type: 'CARD', mdrPercent: 0.15, status: 'ACTIVE' }
          ]);
        }

        // Ensure initial customers exist
        const customerCount = await db.customers.count();
        if (customerCount === 0) {
          await db.customers.bulkAdd([
            { 
              customerId: 'c1', name: 'Bpk. Ahmad', isReseller: true, creditLimit: 5000000, 
              defaultDueDateDays: 14, loyaltyPoints: 0, status: 'ACTIVE',
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            },
            { 
              customerId: 'c2', name: 'Ibu Siti', isReseller: false, creditLimit: 1000000, 
              defaultDueDateDays: 7, loyaltyPoints: 120, status: 'ACTIVE',
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            }
          ]);
        }

        // Ensure sembako baseline exists and stock movements are verified/repaired
        await ProductService.ensureBaselineProductsAndStock().catch(e => console.warn('Baseline products init error:', e));

        // Ensure minimal fish products exist
        await import('@/core/services/fish-service').then(({ FishService }) => 
          FishService.ensureMinimalFishProducts().catch(e => console.warn('Fish products init error:', e))
        );

        // Ensure store status is initialized
        await StoreStatusService.ensureInitialized().catch(e => console.warn('Store status init error:', e));
      } catch (err) {
        console.warn('Login init warning:', err);
      } finally {
        setIsInitializing(false);
      }
    }
    init();
  }, [seedDefaultUsers]);

  // Focus hidden input on initial load or reset
  useEffect(() => {
    if (!isInitializing) {
      inputRef.current?.focus();
    }
  }, [isInitializing]);

  const handleInputDigit = (digit: string) => {
    if (isLoggingIn) return;
    if (error) setError(false);
    setPin(prev => {
      if (prev.length >= 6) return prev;
      const newPin = prev + digit;
      if (newPin.length === 6) {
        triggerLogin(newPin);
      }
      return newPin;
    });
  };

  const handleBackspace = () => {
    if (isLoggingIn) return;
    if (error) setError(false);
    setPin(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (isLoggingIn) return;
    if (error) setError(false);
    setPin('');
  };

  const triggerLogin = async (finalPin: string) => {
    setIsLoggingIn(true);
    try {
      const success = await login(finalPin);
      if (!success) {
        setError(true);
        setPin('');
        inputRef.current?.focus();
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setGoogleError(null);
    try {
      const fbUser = await CloudAuthService.loginWithGoogle('OWNER', 'Owner Rido');
      // Ensure owner user exists in local db
      let owner = await db.users.where('role').equals('OWNER').first();
      if (!owner) {
        owner = {
          userId: fbUser.uid,
          name: fbUser.displayName || 'Owner Rido',
          role: 'OWNER',
          pinHash: '240595',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await db.users.put(owner);
      }
      useAuthStore.setState({ currentUser: owner, isAuthenticated: true });
    } catch (err: any) {
      console.warn('Google sign-in attempt notice:', err?.message || err);
      setGoogleError(err?.message || 'Gagal login dengan akun Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleKeyPress = (val: string) => {
    if (val === 'clear') {
      handleBackspace();
    } else if (/^[0-9]$/.test(val)) {
      handleInputDigit(val);
    }
  };

  // Global keyboard listener (supports standard number row & numpad keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is pressing browser shortcuts with Ctrl, Alt, or Meta
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleInputDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length === 6 && !isLoggingIn) {
          triggerLogin(pin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pin, isLoggingIn, error]);

  if (isInitializing) return null;

  return (
    <div 
      className="min-h-screen bg-slate-50 flex items-center justify-center p-4 cursor-default select-none"
      onClick={() => inputRef.current?.focus()}
    >
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-200 relative"
      >
        {/* Hidden accessible input to support physical keyboards and mobile virtual numpad */}
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus
          value={pin}
          onChange={(e) => {
            const clean = e.target.value.replace(/\D/g, '').slice(0, 6);
            if (error) setError(false);
            setPin(clean);
            if (clean.length === 6 && !isLoggingIn) {
              triggerLogin(clean);
            }
          }}
          className="absolute -top-[9999px] -left-[9999px] opacity-0 pointer-events-none"
          tabIndex={-1}
          aria-label="Input PIN Angka"
        />

        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-200">
            <Lock className="text-white w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">TOKO SEMBAKO RIAMA</h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">Sistem Keamanan PIN 6-Digit</p>
        </div>

        {/* Strict 2 Roles Info Banner (PINs hidden from UI) */}
        <div className="mb-6 bg-slate-50 border border-slate-200/80 rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center mb-2.5">
            PERAN AKSES TERDAFTAR
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col items-center p-2.5 bg-white border border-blue-200 rounded-xl text-center">
              <div className="flex items-center gap-1.5 text-blue-600 font-black text-xs uppercase tracking-wider mb-0.5">
                <ShieldCheck size={14} />
                1. OWNER
              </div>
              <span className="text-[10px] font-bold text-slate-500">Owner Rido</span>
            </div>

            <div className="flex flex-col items-center p-2.5 bg-white border border-emerald-200 rounded-xl text-center">
              <div className="flex items-center gap-1.5 text-emerald-600 font-black text-xs uppercase tracking-wider mb-0.5">
                <UserCheck size={14} />
                2. KASIR
              </div>
              <span className="text-[10px] font-bold text-slate-500">Kasir Romuel</span>
            </div>
          </div>
        </div>

        {/* Interactive PIN Dots Indicator */}
        <div 
          onClick={() => inputRef.current?.focus()}
          className="flex justify-center gap-3 mb-6 cursor-pointer py-2 focus:outline-none"
          title="Klik untuk mengetik via keyboard fisik"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              inputRef.current?.focus();
            }
          }}
        >
          {[...Array(6)].map((_, i) => (
            <div 
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                pin.length > i 
                  ? 'bg-blue-600 border-blue-600 scale-110 shadow-sm shadow-blue-300' 
                  : (pin.length === i && !error ? 'border-blue-400 bg-blue-50/50 scale-105 animate-pulse' : 'bg-transparent border-slate-300')
              } ${error ? 'border-red-500 bg-red-50' : ''}`}
            />
          ))}
        </div>

        <AnimatePresence>
          {error && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-red-500 text-xs font-bold text-center mb-4 uppercase tracking-wider"
            >
              PIN salah. Silakan coba lagi.
            </motion.p>
          )}
        </AnimatePresence>

        <Keypad onKeyPress={handleKeyPress} />

        {/* Google Cloud Sign-In option for Owner Rido */}
        <div className="mt-4">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || isLoggingIn}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-slate-300 active:scale-98 disabled:opacity-60 cursor-pointer"
            title="Masuk sebagai Owner menggunakan akun Google terverifikasi (ridohaloho1@gmail.com)"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>{googleLoading ? 'Menghubungkan Akun Google...' : 'Login Google Cloud (ridohaloho1@gmail.com)'}</span>
          </button>
          {googleError && (
            <p className="text-[10px] text-amber-700 text-center mt-1.5 font-medium">
              {googleError}
            </p>
          )}
        </div>

        {/* Keyboard Input Hint */}
        <div className="mt-5 pt-3 border-t border-slate-100 flex flex-col items-center gap-1.5 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200/80 rounded-xl text-[11px] text-slate-600 font-medium">
            <Keyboard size={13} className="text-blue-600" />
            <span>Ketik PIN angka langsung via <strong>Keyboard</strong> / <strong>Numpad</strong></span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            © 2026 Rido Alpredo Sihaloho. All rights reserved.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
