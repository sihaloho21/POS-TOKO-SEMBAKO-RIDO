import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: any): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: any, errorInfo: ErrorInfo) {
    let errorDetails = '';
    try {
      if (error instanceof Error) {
        errorDetails = error.message + '\n' + (error.stack || '');
      } else if (typeof error === 'object' && error !== null) {
        errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
      } else {
        errorDetails = String(error);
      }
    } catch {
      errorDetails = String(error || 'Unknown error');
    }

    console.error('Harapan Jaya POS ErrorBoundary caught an error:', errorDetails, errorInfo?.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let displayMsg = 'Terjadi kesalahan sistem yang tidak terduga.';
      try {
        if (this.state.error instanceof Error) {
          displayMsg = this.state.error.message;
        } else if (typeof this.state.error === 'object' && this.state.error !== null) {
          displayMsg = this.state.error.message || JSON.stringify(this.state.error, Object.getOwnPropertyNames(this.state.error));
        } else if (this.state.error) {
          displayMsg = String(this.state.error);
        }
      } catch {
        displayMsg = String(this.state.error || 'Terjadi kendala pada tampilan sistem.');
      }

      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-slate-100">
          <div className="max-w-lg w-full bg-slate-800 rounded-3xl p-8 border border-slate-700 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/20">
              <AlertTriangle size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black uppercase tracking-tight text-white">
                Terjadi Kendala Tampilan
              </h2>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                Aplikasi mendeteksi interupsi pada komponen tampilan. Data lokal Anda di IndexedDB tetap aman.
              </p>
            </div>

            <div className="p-4 bg-slate-950/60 rounded-xl text-left border border-slate-800">
              <p className="text-[10px] font-mono text-rose-400 break-words line-clamp-4">
                {displayMsg}
              </p>
            </div>

            <button
              onClick={this.handleReset}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              <RefreshCw size={16} />
              <span>Muat Ulang Aplikasi</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
