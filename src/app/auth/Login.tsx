import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/core/auth-store';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '@/core/database';
import { Keypad } from '@/components/Keypad';
import { LogIn, Lock, ShieldCheck, UserCheck, Keyboard } from 'lucide-react';
import type { Product } from '@/core/types';
import { ProductService } from '@/core/services/product-service';
import { StoreStatusService } from '@/core/services/store-status-service';

export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
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
