// Ensure window.fetch has a setter so polyfills and telemetry scripts do not throw
try {
  if (typeof window !== 'undefined') {
    const origFetch = window.fetch;
    Object.defineProperty(window, 'fetch', {
      value: origFetch,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
} catch {
  try {
    let _f = window.fetch;
    Object.defineProperty(window, 'fetch', {
      get() { return _f; },
      set(v) { _f = v; },
      configurable: true,
      enumerable: true,
    });
  } catch {
    // fallback safe
  }
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
