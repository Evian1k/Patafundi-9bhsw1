import { validateEnv } from '@/config/env';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Validate env at startup — logs warnings, never throws
validateEnv();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
