import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './test-heading-cleanup.css';
import './timer-preset-select.js';
import './widget-locks.js';

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('DashDash service worker registration failed:', error);
    });
  });
}
