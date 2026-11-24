import type { SeederModel } from '../machines/seeder/SeederModel';

/** Estado mutable por frame (no React): evita renders de React a 60 fps. */
export const runtime = {
  model: null as SeederModel | null,
  /** metros recorridos (para giro de ruedas, discos y desplazamiento del terreno) */
  distance: 0,
  /** velocidad actual en m/s (amortiguada) */
  speed: 0,
  lastInteraction: typeof performance !== 'undefined' ? performance.now() : 0,
  invalidate: () => {},
  /** surcos activos (1) o apagados por el corte surco a surco (0) */
  rowOn: new Uint8Array(64).fill(1),
  sim: { savedM2: 0, overlapM2: 0, headlandActive: false, activeRows: 0, headlandPct: 0 },
  /** multiplicador de tiempo (sólo pruebas automatizadas con GPU por software) */
  timeScale: 1,
  /** contador de frames para medición de fps en pruebas */
  frames: 0,
};

export function touchInteraction() {
  runtime.lastInteraction = performance.now();
}
