import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './app/components/ErrorBoundary.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Prevent unhandled promise rejections from crashing the whole app silently
window.addEventListener('unhandledrejection', (event) => {
  console.warn('Unhandled promise rejection captured:', event.reason);
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

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
