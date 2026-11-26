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

/** Captura refinada (sin aliasing, sombras suaves) con barra de progreso y tope de tiempo. */
export async function snapshotRefined(o: SnapshotOptions, maxMs = 4000, progress?: { from: number; span: number }): Promise<string | null> {
  const v = viewer();
  if (!v) return null;
  const set = (p: number) => useStore.getState().setUi({ refinando: Math.min(1, (progress?.from ?? 0) + p * (progress?.span ?? 1)) });
  set(0);
  try {
    return await v.snapshotRefined(o, maxMs, set);
  } catch (e) {
    console.warn('[configurador] captura refinada no disponible, se usa la directa', e);
    return snapshot(o);
  } finally {
    if (!progress || progress.from + progress.span >= 0.999) useStore.getState().setUi({ refinando: null });
  }
}

/** Los tres renders del resumen y la cotización, refinados (4 s en total como máximo). */
export async function captureRenderSetRefined(width = 1280, height = 720): Promise<RenderSet> {
  const base = { width, height, type: 'image/jpeg' as const, quality: 0.9 };
  const tresCuartos = await snapshotRefined({ ...base, preset: 'tresCuartos' }, 1300, { from: 0, span: 1 / 3 });
  const lateral = await snapshotRefined({ ...base, preset: 'lateral' }, 1300, { from: 1 / 3, span: 1 / 3 });
  const trasero = await snapshotRefined({ ...base, preset: 'trasero' }, 1300, { from: 2 / 3, span: 1 / 3 });
  return { tresCuartos, lateral, trasero };
}

/** Descarga un PNG en alta resolución de la vista actual (refinado). */
export async function downloadCapture(): Promise<boolean> {
  const el = document.querySelector('.viewer');
  const r = el?.getBoundingClientRect();
  const aspect = r && r.height > 0 ? r.width / r.height : 16 / 9;
  const width = 3200;
  const url = await snapshotRefined({ width, height: Math.round(width / aspect), type: 'image/png' }, 4000);
  if (!url) return false;
  const a = document.createElement('a');
  a.href = url;
  a.download = `semirremolque-${configHash(useStore.getState().config)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
