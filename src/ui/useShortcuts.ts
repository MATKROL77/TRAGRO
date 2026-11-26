import { useEffect } from 'react';
import { steps } from '@/core/catalog';
import { translate } from '@/i18n';
import { useStore } from '@/state/store';
import { toggleViewerFullscreen } from './ViewerToolbar';
import { PRESETS } from '@/three/camera';

/** Atajos de teclado del modo vendedor (no actúan mientras se escribe en un campo). */
export function useShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const st = useStore.getState();
      if (st.ui.modal) return;
      const k = e.key.toLowerCase();
      const num = Number(e.key);
      if (num >= 1 && num <= PRESETS.length) st.setPreset(PRESETS[num - 1]);
      else if (k === 'a' || (e.key === ' ' && el?.tagName !== 'BUTTON')) st.toggleAnim('accion');
      else if (k === 'l') st.toggleAnim('lona');
      else if (k === 'e') st.setUi(st.ui.env === 'estudio' ? { env: 'exterior', tractor: false } : st.ui.env === 'exterior' ? { env: 'ruta', tractor: true } : { env: 'estudio', tractor: false });
      else if (k === 't') st.setUi({ tractor: !st.ui.tractor });
      else if (k === 'h') st.setUi({ hotspots: !st.ui.hotspots });
      else if (k === 'p') st.setUi({ preciosOcultos: !st.ui.preciosOcultos });
      else if (k === 'f') {
        toggleViewerFullscreen();
      } else if (k === 'r') {
        if (window.confirm(translate(st.ui.lang, 'vendedor.confirmarReinicio'))) st.reset();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const i = steps.findIndex((s) => s.id === st.ui.paso) + (e.key === 'ArrowRight' ? 1 : -1);
        if (i >= 0 && i < steps.length) st.setUi({ paso: steps[i].id });
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
