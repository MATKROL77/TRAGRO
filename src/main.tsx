import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/fonts.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/roboto-slab/latin-700.css';
import './ui/styles.css';
import { App } from './App';
import { changeLang } from './i18n';
import { initFromUrl } from './state/url';

const start = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

// Inglés y ruso se bajan aparte: si la URL los pide, se cargan antes del primer render.
const pending = initFromUrl();
if (pending) void changeLang(pending).finally(start);
else start();
