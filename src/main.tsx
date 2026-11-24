import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/roboto-slab/700.css';
import './ui/styles.css';
import { App } from './App';
import { initFromUrl } from './state/url';

initFromUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
