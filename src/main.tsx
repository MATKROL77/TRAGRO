import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/fonts.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/roboto-slab/latin-700.css';
import './ui/styles.css';
import { App } from './App';
import { initFromUrl } from './state/url';

initFromUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
