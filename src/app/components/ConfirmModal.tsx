import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isProcessing?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Ya, Lanjutkan',
  cancelText = 'Batal',
  variant = 'danger',
  isProcessing = false
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const variantClasses = {
    danger: {
      icon: <AlertTriangle size={32} className="text-rose-600" />,
      iconBg: 'bg-rose-50',
      button: 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
    },
    warning: {
      icon: <AlertTriangle size={32} className="text-amber-600" />,
      iconBg: 'bg-amber-50',
      button: 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'
    },
    info: {
      icon: <AlertTriangle size={32} className="text-blue-600" />,
      iconBg: 'bg-blue-50',
      button: 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
    }
  };

  const currentVariant = variantClasses[variant];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="text-center">
          <div className={`w-16 h-16 ${currentVariant.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}>
            {currentVariant.icon}
          </div>
          <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">{title}</h3>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            {message}
          </p>
          
          <div className="grid grid-cols-2 gap-3 mt-8">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all uppercase tracking-wider disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isProcessing}
              className={`px-4 py-3 text-white rounded-2xl font-bold text-sm shadow-lg transition-all uppercase tracking-wider disabled:opacity-50 ${currentVariant.button}`}
            >
              {isProcessing ? 'Memproses...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
