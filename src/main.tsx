import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import './ui/styles.css';
import { App } from './ui/App';
import { bootstrap } from './state/bootstrap';

bootstrap().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

// Ganchos para pruebas automatizadas (Playwright): estado y métricas del visor.
import { useStore } from './state/store';
import { runtime } from './three/runtime';
(window as unknown as { __sp: unknown }).__sp = { store: useStore, runtime };
