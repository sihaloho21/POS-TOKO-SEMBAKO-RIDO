import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/core/auth-store';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '@/core/database';
import { Keypad } from '@/components/Keypad';
import { LogIn, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import type { Product } from '@/core/types';

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

        const productCount = await db.products.count();
        if (productCount === 0) {
          // Seed initial products
          const initialProducts: Product[] = [
            { 
              productId: 'p1', sku: 'B-PANDAN-5K', barcode: '888001', name: 'Beras Pandan Wangi 5kg', 
              categoryId: 'SEMBAKO', productType: 'SEMBAKO', baseUnit: 'PCS', saleUnits: ['PCS', 'DUS'],
              conversionRules: [{ fromUnit: 'PCS', toUnit: 'DUS', factor: 4 }],
              normalPrice: 85000, hpp: 78000, stock: 100, minimumStock: 10, targetStock: 50,
              status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() 
            },
            { 
              productId: 'p2', sku: 'IKAN-MAS', barcode: '888002', name: 'Ikan Mas Hidup', 
              categoryId: 'FISH', productType: 'FISH', baseUnit: 'KG', saleUnits: ['KG'],
              conversionRules: [],
              normalPrice: 35000, hpp: 28000, stock: 50, minimumStock: 5, targetStock: 20,
              status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() 
            }
          ];

          await db.products.bulkAdd(initialProducts);

          // Seed initial OPENING_BALANCE stock movements so stock balance is derived
          const nowStr = new Date().toISOString();
          await db.stockMovements.bulkAdd([
            {
              stockMovementId: 'sm_init_p1',
              productId: 'p1',
              referenceId: 'init_p1',
              transactionId: 'init_p1',
              movementType: 'OPENING_BALANCE',
              qty: 100,
              unit: 'PCS',
              baseQty: 100,
              segmentId: 'WARUNG',
              clientTimestamp: nowStr,
              serverTimestamp: null,
              deviceId: 'LOCAL',
              userId: 'SYSTEM',
              reason: 'Stok Awal Sistem (OPENING_BALANCE)',
              costSnapshot: 78000,
              createdAt: nowStr,
              quantity: 100,
              type: 'IN',
              timestamp: nowStr
            },
            {
              stockMovementId: 'sm_init_p2',
              productId: 'p2',
              referenceId: 'init_p2',
              transactionId: 'init_p2',
              movementType: 'OPENING_BALANCE',
              qty: 50,
              unit: 'KG',
              baseQty: 50,
              segmentId: 'IKAN',
              clientTimestamp: nowStr,
              serverTimestamp: null,
              deviceId: 'LOCAL',
              userId: 'SYSTEM',
              reason: 'Stok Awal Sistem (OPENING_BALANCE)',
              costSnapshot: 28000,
              createdAt: nowStr,
              quantity: 50,
              type: 'IN',
              timestamp: nowStr
            }
          ]);

          // Seed initial costs
          await db.productCosts.bulkAdd(initialProducts.map(p => ({
            productId: p.productId,
            hpp: p.hpp,
            updatedAt: p.createdAt
          })));

          // Seed default payment methods
          await db.paymentMethods.bulkAdd([
            { id: 'CASH', name: 'Tunai (Cash)', type: 'CASH', mdrPercent: 0, status: 'ACTIVE' },
            { id: 'QRIS', name: 'BCA QRIS', type: 'QRIS', mdrPercent: 0.7, status: 'ACTIVE' },
            { id: 'DEBIT', name: 'Debit Card', type: 'CARD', mdrPercent: 0.15, status: 'ACTIVE' }
          ]);

          // Seed initial customers
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

  const handleQuickLogin = (rolePin: string) => {
    setPin(rolePin);
    handleLogin(rolePin);
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
          <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Harapan Jaya POS</h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">Sistem Keamanan PIN 6-Digit</p>
        </div>

        {/* Strict 2 Roles Selector Banner */}
        <div className="mb-6 bg-slate-50 border border-slate-200/80 rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center mb-2.5">
            PILIH PERAN RESMI (ROLE HANYA 2)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleQuickLogin('123456')}
              className="flex flex-col items-center p-2.5 bg-white border border-blue-200 rounded-xl hover:border-blue-500 hover:shadow-md transition-all group text-left"
            >
              <div className="flex items-center gap-1.5 text-blue-600 font-black text-xs uppercase tracking-wider mb-0.5">
                <ShieldCheck size={14} />
                1. OWNER
              </div>
              <span className="text-[10px] font-bold text-slate-500">Owner Rido</span>
              <span className="text-[9px] font-mono text-blue-500 font-bold mt-1 bg-blue-50 px-2 py-0.5 rounded">
                PIN: 123456
              </span>
            </button>

            <button
              onClick={() => handleQuickLogin('654321')}
              className="flex flex-col items-center p-2.5 bg-white border border-emerald-200 rounded-xl hover:border-emerald-500 hover:shadow-md transition-all group text-left"
            >
              <div className="flex items-center gap-1.5 text-emerald-600 font-black text-xs uppercase tracking-wider mb-0.5">
                <UserCheck size={14} />
                2. KASIR
              </div>
              <span className="text-[10px] font-bold text-slate-500">Kasir Harapan</span>
              <span className="text-[9px] font-mono text-emerald-600 font-bold mt-1 bg-emerald-50 px-2 py-0.5 rounded">
                PIN: 654321
              </span>
            </button>
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
          Owner: 123456 • Kasir: 654321
        </div>
      </motion.div>
    </div>
  );
}
