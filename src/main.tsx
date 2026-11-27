import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import { installReliabilityMonitoring } from './lib/reliabilityMonitor.js';
import './index.css';

installReliabilityMonitoring();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
