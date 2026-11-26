/**
 * Puente entre la UI (DOM) y el visor (canvas WebGL): capturas, fundido cruzado
 * y render forzado. El visor registra sus funciones cuando se monta.
 */
export interface SnapshotOptions {
  preset?: string;
  width: number;
  height: number;
  /** Tipo MIME de salida. */
  type?: 'image/png' | 'image/jpeg';
  quality?: number;
  /** Ocultar hotspots y ayudas. */
  clean?: boolean;
}

export interface ViewerApi {
  /** Dibuja un cuadro ya mismo (sin esperar al próximo frame). */
  renderNow: () => void;
  /** Congela el cuadro actual sobre el visor y lo funde con lo nuevo. */
  crossfade: (ms?: number) => void;
  /** Render fuera de pantalla desde un preset de cámara. */
  snapshot: (o: SnapshotOptions) => string | null;
  /** Igual, pero refinado: promedio de muestras con jitter (sin aliasing, sombras suaves), con tope de tiempo. */
  snapshotRefined: (o: SnapshotOptions, maxMs: number, onProgress?: (p: number) => void) => Promise<string | null>;
  invalidate: () => void;
  stats: () => { triangles: number; calls: number; geometries: number; textures: number; fps: number };
  /** Posición y objetivo actuales de la cámara (para pruebas). */
  camera: () => { position: [number, number, number]; target: [number, number, number] };
}

let api: ViewerApi | null = null;
const waiters: ((a: ViewerApi) => void)[] = [];

export function registerViewer(a: ViewerApi | null): void {
  api = a;
  if (a) waiters.splice(0).forEach((w) => w(a));
}

export function viewer(): ViewerApi | null {
  return api;
}

export function whenViewerReady(): Promise<ViewerApi> {
  return api ? Promise.resolve(api) : new Promise((res) => waiters.push(res));
}
