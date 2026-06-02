import { validateEnv } from '@/config/env';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Validate env at startup — logs warnings, never throws
validateEnv();

// Request notification permission early (non-blocking)
if ('Notification' in window && Notification.permission === 'default') {
  // Delay to avoid triggering immediately on page load
  setTimeout(() => {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        console.log('[PataFundi] Push notifications enabled');
      }
    });
  }, 3000);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
