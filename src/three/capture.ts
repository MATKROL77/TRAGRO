/** Capturas del visor: renders del resumen/PDF y descarga de imagen en alta resolución. */
import { configHash } from '@/core/serialize';
import { useStore } from '@/state/store';
import { viewer, type SnapshotOptions } from './viewerApi';
import { geometryKey } from './model';
import { currentModel } from './TrailerObject';

/**
 * Espera a que el modelo en pantalla corresponda a la configuración actual
 * (la geometría de un cambio llega del worker un instante después). Tope: `maxMs`.
 */
export function whenModelCurrent(maxMs = 4000): Promise<void> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      const key = geometryKey(useStore.getState().config);
      if (currentModel.value?.key === key || performance.now() - t0 > maxMs) {
        // Un cuadro más para que el modelo nuevo ya esté dibujado.
        requestAnimationFrame(() => resolve());
        return;
      }
      window.setTimeout(check, 50);
    };
    check();
  });
}

export function snapshot(o: SnapshotOptions): string | null {
  try {
    return viewer()?.snapshot(o) ?? null;
  } catch (e) {
    console.warn('[configurador] no se pudo capturar el visor', e);
    return null;
  }
}

export interface RenderSet {
  tresCuartos: string | null;
  lateral: string | null;
  trasero: string | null;
}

/** Los tres renders automáticos del resumen y la cotización. */
export function captureRenderSet(width = 1280, height = 720): RenderSet {
  const base = { width, height, type: 'image/jpeg' as const, quality: 0.9 };
  return {
    tresCuartos: snapshot({ ...base, preset: 'tresCuartos' }),
    lateral: snapshot({ ...base, preset: 'lateral' }),
    trasero: snapshot({ ...base, preset: 'trasero' }),
  };
}

export function captureThumb(): string | null {
  return snapshot({ preset: 'tresCuartos', width: 640, height: 400, type: 'image/jpeg', quality: 0.85 });
}

/** Descarga un PNG en alta resolución de la vista actual. */
export function downloadCapture(): boolean {
  const el = document.querySelector('.viewer');
  const r = el?.getBoundingClientRect();
  const aspect = r && r.height > 0 ? r.width / r.height : 16 / 9;
  const width = 3200;
  const url = snapshot({ width, height: Math.round(width / aspect), type: 'image/png' });
  if (!url) return false;
  const a = document.createElement('a');
  a.href = url;
  a.download = `semirremolque-${configHash(useStore.getState().config)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
