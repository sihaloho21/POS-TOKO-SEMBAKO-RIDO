import React, { useState } from 'react';
import { 
  ShieldCheck, 
  X, 
  Copy, 
  Check, 
  AlertTriangle, 
  FileCode2, 
  Lock, 
  Info,
  CheckCircle2
} from 'lucide-react';
import { 
  suggestProductDeleteSecurityRule, 
  diagnoseFirestorePermissionError,
  type SecurityRuleSuggestion 
} from '@/core/utils/security-rules-helper';

interface SecurityRuleAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorContext?: string | null;
}

export default function SecurityRuleAdvisorModal({
  isOpen,
  onClose,
  errorContext,
}: SecurityRuleAdvisorModalProps) {
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedBlock, setCopiedBlock] = useState(false);

  if (!isOpen) return null;

  const suggestion: SecurityRuleSuggestion = suggestProductDeleteSecurityRule();
  const diagnostic = errorContext ? diagnoseFirestorePermissionError(errorContext) : null;

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(suggestion.ruleStatement);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleCopyBlock = () => {
    navigator.clipboard.writeText(suggestion.completeMatchBlock);
    setCopiedBlock(true);
    setTimeout(() => setCopiedBlock(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight text-white">
                Firestore Security Rule Advisor
              </h3>
              <p className="text-xs text-indigo-200/80 font-medium">
                Saran Aturan Keamanan Koleksi Products (Role-Based Access Control)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-slate-700 text-sm">
          {/* Error Diagnostics Context if opened from a failed sync queue item */}
          {diagnostic && diagnostic.isPermissionError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                <h4 className="font-black text-xs uppercase tracking-wider text-rose-800">
                  Analisis Kesalahan Hak Akses (Permission Denied)
                </h4>
              </div>
              <p className="text-xs text-rose-700 leading-relaxed font-medium">
                {diagnostic.diagnosticSummary}
              </p>
              {diagnostic.userId && (
                <div className="text-[11px] font-mono text-rose-600 bg-white/70 px-2.5 py-1 rounded-lg border border-rose-200 inline-block">
                  User ID: <span className="font-bold">{diagnostic.userId}</span> (Tercatat dalam helper <code className="bg-rose-100 px-1 py-0.5 rounded">isOwner()</code>)
                </div>
              )}
            </div>
          )}

          {/* Core Rule Recommendation */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock size={16} className="text-indigo-600" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                  Saran Aturan Delete (Hanya Role OWNER)
                </span>
              </div>
              <button
                onClick={handleCopySnippet}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer"
              >
                {copiedSnippet ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedSnippet ? 'Tersalin' : 'Salin Rule'}</span>
              </button>
            </div>

            <div className="bg-slate-900 text-indigo-300 font-mono text-xs p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <code>{suggestion.ruleStatement}</code>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                Target: {suggestion.allowedRole}
              </span>
            </div>
          </div>

          {/* Full Match Block */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode2 size={16} className="text-slate-600" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                  Blok Lengkap untuk firestore.rules
                </span>
              </div>
              <button
                onClick={handleCopyBlock}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                {copiedBlock ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedBlock ? 'Tersalin' : 'Salin Semua'}</span>
              </button>
            </div>

            <pre className="bg-slate-950 text-slate-200 font-mono text-xs p-4 rounded-2xl border border-slate-800 overflow-x-auto leading-relaxed">
              {suggestion.completeMatchBlock}
            </pre>
          </div>

          {/* Rationale & RBAC Alignment */}
          <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-2">
            <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs uppercase tracking-wide">
              <Info size={16} className="text-indigo-600" />
              <span>Konsistensi dengan Sistem RBAC Saat Ini</span>
            </div>
            <p className="text-xs text-indigo-950/80 leading-relaxed font-medium">
              {suggestion.rationale}
            </p>
            <div className="pt-2 border-t border-indigo-200/60 space-y-1.5">
              <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">
                Prinsip Keamanan yang Dijamin:
              </p>
              {suggestion.securityImpact.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-indigo-900/90 font-medium">
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
          <span className="text-[11px] text-slate-400 font-medium">
            Helper function: <code className="font-mono text-indigo-600 font-bold">suggestProductDeleteSecurityRule()</code>
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
