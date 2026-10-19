import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/core/auth-store';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '@/core/database';
import { Keypad } from '@/components/Keypad';
import { LogIn, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import type { Product } from '@/core/types';
import { ProductService } from '@/core/services/product-service';
import { FishService } from '@/core/services/fish-service';
import { StoreStatusService } from '@/core/services/store-status-service';

export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
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

        // Ensure mandatory fish products and suppliers (Nila, Mas, Gurame, Lele, Patin & Cikande, Rau)
        await FishService.ensureMinimalFishProducts().catch(e => console.warn('Fish products init error:', e));
        await FishService.ensureFishSuppliers().catch(e => console.warn('Fish suppliers init error:', e));

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

  const handleKeyPress = (val: string) => {
    if (error) setError(false);
    if (val === 'clear') {
      setPin('');
    } else if (pin.length < 6) {
      const newPin = pin + val;
      setPin(newPin);
      if (newPin.length === 6) {
        handleLogin(newPin);
      }
    }
  };

  const handleLogin = async (finalPin: string) => {
    const success = await login(finalPin);
    if (!success) {
      setError(true);
      setPin('');
    }
  };

  if (isInitializing) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-200"
      >
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

            <div className="flex flex-col items-center justify-center p-2.5 bg-white border border-emerald-200 rounded-xl text-center">
              <div className="flex items-center gap-1.5 text-emerald-600 font-black text-xs uppercase tracking-wider">
                <UserCheck size={14} />
                2. KASIR
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-3 mb-6">
          {[...Array(6)].map((_, i) => (
            <div 
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                pin.length > i ? 'bg-blue-600 border-blue-600 scale-110 shadow-sm shadow-blue-300' : 'bg-transparent border-slate-300'
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

        <div className="mt-6 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          Masukkan 6-Digit PIN Anda
        </div>
      </motion.div>
    </div>
  );
}
