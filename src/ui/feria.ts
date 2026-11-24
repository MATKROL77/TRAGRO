import { useEffect } from 'react';
import { useStore, type CamPreset } from '../state/store';
import { runtime, touchInteraction } from '../three/runtime';

/** Loop de demostración para stands: recorre la máquina, la muestra sembrando y la pliega. */
const SCRIPT: { at: number; run: () => void }[] = [
  { at: 0, run: () => { const s = useStore.getState(); s.setDetail(false); s.setScene('studio'); s.setPose('work'); s.requestCam('front34'); } },
  { at: 6, run: () => useStore.getState().requestCam('rowUnit') },
  { at: 12, run: () => useStore.getState().requestCam('hoppers') },
  { at: 18, run: () => useStore.getState().setScene('field') },
  { at: 30, run: () => useStore.getState().requestCam('front34') },
  { at: 40, run: () => { const s = useStore.getState(); s.setScene('studio'); s.setPose('transport'); s.requestCam('front34'); } },
  { at: 52, run: () => useStore.getState().requestCam('side' as CamPreset) },
  { at: 58, run: () => useStore.getState().setPose('work') },
];
const LOOP = 68;

export function useFeriaMode() {
  const feria = useStore((s) => s.feria);
  useEffect(() => {
    if (!feria) return;
    let start = 0;
    let idx = 0;
    const tick = window.setInterval(() => {
      const st = useStore.getState();
      const idle = performance.now() - runtime.lastInteraction > 30000 && !st.modal;
      if (idle && !st.demo) {
        st.setDemo(true);
        start = performance.now();
        idx = 0;
      }
      if (!st.demo) return;
      const tt = ((performance.now() - start) / 1000) % LOOP;
      if (idx >= SCRIPT.length && tt < SCRIPT[0].at + 1) idx = 0;
      while (idx < SCRIPT.length && tt >= SCRIPT[idx].at) {
        SCRIPT[idx].run();
        idx++;
      }
      // mantener "inactivo" sin cortar la rotación de cámara
    }, 300);
    const stop = () => {
      if (useStore.getState().demo) {
        useStore.getState().setDemo(false);
        useStore.getState().setSowing(false);
      }
    };
    window.addEventListener('pointerdown', stop, true);
    window.addEventListener('keydown', stop, true);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener('pointerdown', stop, true);
      window.removeEventListener('keydown', stop, true);
    };
  }, [feria]);
}

export function restartDemo() {
  const s = useStore.getState();
  s.reset();
  s.openModal(null);
  runtime.lastInteraction = performance.now() - 31000;
}

/** Atajos de teclado (siempre activos; documentados en el modo feria). */
export function useShortcuts() {
  useEffect(() => {
    const presets: CamPreset[] = ['front34', 'side', 'rear', 'top', 'rowUnit', 'hoppers', 'ground'];
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useStore.getState();
      if (s.modal) return;
      touchInteraction();
      const k = e.key.toLowerCase();
      const n = Number(k);
      if (n >= 1 && n <= 7) s.requestCam(presets[n - 1]);
      else if (k === 'c') s.setScene('field');
      else if (k === 'e') s.setScene('studio');
      else if (k === 'r') s.setScene('road');
      else if (k === 't') s.setPose(s.pose === 'work' ? 'transport' : 'work');
      else if (k === 'd') s.setDetail(!s.detail);
      else if (k === 'p') s.toggle('hidePrices');
      else if (k === '0') restartDemo();
      else return;
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
}

/** Modo embebido: avisa al sitio que lo contiene (postMessage) cuando cambia la configuración. */
export function useEmbedBridge() {
  const embed = useStore((s) => s.embed);
  useEffect(() => {
    if (!embed || window.parent === window) return;
    return useStore.subscribe((s, prev) => {
      if (s.config !== prev.config) window.parent.postMessage({ type: 'sp-config', config: s.config }, '*');
      if (s.modal === 'quote' && prev.modal !== 'quote') window.parent.postMessage({ type: 'sp-quote-open' }, '*');
    });
  }, [embed]);
}
