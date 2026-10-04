import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/core/auth-store';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '@/core/database';
import { Keypad } from '@/components/Keypad';
import { LogIn, Lock } from 'lucide-react';

export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const { login, seedOwner } = useAuthStore();

  useEffect(() => {
    async function init() {
      const userCount = await db.users.count();
      if (userCount === 0) {
        await seedOwner('Owner Rido', '123456');
        
        // Seed some products
        await db.products.bulkAdd([
          { 
            productId: 'p1', sku: 'B-PANDAN-5K', barcode: '888001', name: 'Beras Pandan Wangi 5kg', 
            categoryId: 'SEMBAKO', productType: 'SEMBAKO', baseUnit: 'PCS', saleUnits: ['PCS', 'DUS'],
            conversionRules: [{ fromUnit: 'PCS', toUnit: 'DUS', factor: 4 }],
            normalPrice: 85000, stock: 100, minimumStock: 10, targetStock: 50,
            tags: ['PROMO', 'LEBARAN'],
            status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() 
          },
          { 
            productId: 'p2', sku: 'IKAN-MAS', barcode: '888002', name: 'Ikan Mas Hidup', 
            categoryId: 'FISH', productType: 'FISH', baseUnit: 'KG', saleUnits: ['KG'],
            conversionRules: [],
            normalPrice: 35000, stock: 50, minimumStock: 5, targetStock: 20,
            tags: ['SEGAR'],
            status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() 
          }
        ]);

        await db.productCosts.bulkAdd([
          { productId: 'p1', hpp: 78000, updatedAt: new Date().toISOString() },
          { productId: 'p2', hpp: 28000, updatedAt: new Date().toISOString() }
        ]);

        // Seed some customers
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

        await db.paymentMethods.bulkAdd([
          { id: 'CASH', name: 'Tunai / Cash', type: 'CASH', mdrPercent: 0, status: 'ACTIVE' },
          { id: 'QRIS', name: 'QRIS (0.7%)', type: 'QRIS', mdrPercent: 0.7, status: 'ACTIVE' },
          { id: 'EDC_BCA', name: 'Debit BCA (1.0%)', type: 'CARD', mdrPercent: 1.0, status: 'ACTIVE' }
        ]);
      }
      setIsInitializing(false);
    }
    init();
  }, [seedOwner]);

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
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-slate-200"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Toko Sembako Rido</h1>
          <p className="text-slate-500">Masukkan PIN Keamanan</p>
        </div>

        <div className="flex justify-center gap-4 mb-8">
          {[...Array(6)].map((_, i) => (
            <div 
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                pin.length > i ? 'bg-blue-600 border-blue-600 scale-110' : 'bg-transparent border-slate-300'
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
              className="text-red-500 text-sm text-center mb-4"
            >
              PIN salah. Silakan coba lagi.
            </motion.p>
          )}
        </AnimatePresence>

        <Keypad onKeyPress={handleKeyPress} />

        <div className="mt-8 text-center text-xs text-slate-400">
          Default PIN: 123456
        </div>
      </motion.div>
    </div>
  );
}
