/**
 * Generación de la geometría en un Web Worker, con caché de las últimas configuraciones.
 *
 * - Un cambio de opción pide los buffers al worker; mientras tanto se sigue viendo el
 *   modelo anterior y el hilo principal queda libre (sin tirones).
 * - Si llegan varios pedidos seguidos (un slider arrastrado), solo se arma el último.
 * - Volver a una configuración reciente no regenera nada: los buffers salen de la caché.
 * - Si el navegador no puede crear el worker, se devuelve null y se arma en el hilo principal.
 */
import type { Config } from '@/core/types';
import type { ModelBuffers } from './kit/buffers';
import type { TractorOptions } from './parts/tractor';

export type BuildKind = 'trailer' | 'tractor';
type Input = Config | TractorOptions;

interface Pending {
  kind: BuildKind;
  key: string;
  input: Input;
  resolve: (b: ModelBuffers | null) => void;
}

const MOBILE = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 900px), (pointer: coarse)').matches;
const CACHE_SIZE = MOBILE ? 3 : 6;

let worker: Worker | null = null;
let broken = false;
let seq = 0;
let inFlight: (Pending & { id: number }) | null = null;
/** Un pedido en espera por tipo: si llega otro del mismo tipo, el anterior queda superado. */
const queued = new Map<BuildKind, Pending>();
const cache = new Map<string, ModelBuffers>();

/** Estadísticas para el benchmark. */
export const workerStats = { builds: 0, ms: 0, cacheHits: 0 };

function getWorker(): Worker | null {
  if (worker || broken) return worker;
  try {
    worker = new Worker(new URL('./buildWorker.ts', import.meta.url), { type: 'module', name: 'geometria' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: ModelBuffers; error?: string }>) => {
      const job = inFlight;
      if (!job || e.data.id !== job.id) return;
      inFlight = null;
      if (e.data.ok && e.data.result) {
        workerStats.builds++;
        workerStats.ms += e.data.result.ms;
        remember(`${job.kind}:${job.key}`, e.data.result);
        job.resolve(e.data.result);
      } else {
        console.warn('[configurador] el worker de geometría falló; se arma en el hilo principal', e.data.error);
        job.resolve(null);
      }
      pump();
    };
    worker.onerror = (e) => {
      console.warn('[configurador] worker de geometría no disponible; se arma en el hilo principal', e.message);
      broken = true;
      worker?.terminate();
      worker = null;
      inFlight?.resolve(null);
      inFlight = null;
      queued.forEach((q) => q.resolve(null));
      queued.clear();
    };
  } catch (e) {
    console.warn('[configurador] no se pudo crear el worker de geometría', e);
    broken = true;
    worker = null;
  }
  return worker;
}

function remember(key: string, b: ModelBuffers): void {
  cache.delete(key);
  cache.set(key, b);
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
}

function pump(): void {
  if (inFlight || queued.size === 0) return;
  // El semi tiene prioridad sobre el tractor (es lo que el usuario está tocando).
  const kind: BuildKind = queued.has('trailer') ? 'trailer' : 'tractor';
  const job = queued.get(kind)!;
  queued.delete(kind);
  const w = getWorker();
  if (!w) {
    job.resolve(null);
    return;
  }
  inFlight = { ...job, id: ++seq };
  w.postMessage({ id: inFlight.id, kind: job.kind, input: job.input });
}

/** Pide la geometría. Resuelve null si quedó superado por un pedido más nuevo del mismo tipo o si no hay worker. */
export function requestBuffers(kind: BuildKind, input: Input, key: string): Promise<ModelBuffers | null> {
  const ck = `${kind}:${key}`;
  const hit = cache.get(ck);
  if (hit) {
    workerStats.cacheHits++;
    remember(ck, hit);
    return Promise.resolve(hit);
  }
  return new Promise((resolve) => {
    queued.get(kind)?.resolve(null);
    queued.set(kind, { kind, key, input: JSON.parse(JSON.stringify(input)) as Input, resolve });
    pump();
  });
}

/** Levanta el worker y precalienta la caché con la configuración actual (en un momento ocioso). */
export function warmUpBuilder(cfg: Config, key: string): void {
  if (cache.has(`trailer:${key}`)) return;
  void requestBuffers('trailer', cfg, key);
}

/** El modelo ya armado con estos buffers vive en la GPU: se pueden reutilizar mientras sigan en caché. */
export function cachedKeys(): string[] {
  return [...cache.keys()];
}
