import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './app/components/ErrorBoundary.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Prevent unhandled promise rejections and errors from crashing the app silently
window.addEventListener('unhandledrejection', (event) => {
  console.warn('Unhandled promise rejection captured:', event.reason);
  event.preventDefault();
});

window.addEventListener('error', (event) => {
  console.warn('Global error captured:', event.error || event.message);
});

// Register service worker in production only
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  registerSW({
    onNeedRefresh() {
      window.location.reload();
    },
    onOfflineReady() {
      console.log('App ready to work offline');
    },
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement, {
    onUncaughtError(error, errorInfo) {
      console.error('React Root onUncaughtError:', error, errorInfo?.componentStack);
    },
    onCaughtError(error, errorInfo) {
      console.error('React Root onCaughtError:', error, errorInfo?.componentStack);
    },
    onRecoverableError(error, errorInfo) {
      console.warn('React Root onRecoverableError:', error, errorInfo?.componentStack);
    }
  }).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
