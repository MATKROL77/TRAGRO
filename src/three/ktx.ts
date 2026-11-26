/**
 * Texturas CC0 en KTX2 (Basis Universal, con mipmaps): cargador compartido y
 * mejora diferida de materiales. Nada de esto se descarga antes del primer cuadro.
 */
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { useStore } from '@/state/store';
import type { Config } from '@/core/types';
import type { MaterialLibrary } from './materials';
import { viewer } from './viewerApi';

const BASE = import.meta.env.BASE_URL;

let loader: KTX2Loader | null = null;
const cache = new Map<string, Promise<THREE.CompressedTexture>>();

export interface KtxOptions {
  /** Repetición UV (por defecto 1, 1). */
  repeat?: [number, number];
  anisotropy?: number;
}

/** Cargador único: el transcodificador (WASM) se baja una sola vez y recién cuando hace falta. */
export function ktxLoader(gl: THREE.WebGLRenderer): KTX2Loader {
  if (!loader) {
    loader = new KTX2Loader();
    loader.setTranscoderPath(`${BASE}basis/`);
    loader.setWorkerLimit(2);
    loader.detectSupport(gl);
  }
  return loader;
}

/** Carga (con caché) `public/assets/tex/<name>.ktx2`. El espacio de color viene en el archivo. */
export function loadKtx(gl: THREE.WebGLRenderer, name: string, opts: KtxOptions = {}): Promise<THREE.CompressedTexture> {
  let p = cache.get(name);
  if (!p) {
    p = ktxLoader(gl)
      .loadAsync(`${BASE}assets/tex/${name}.ktx2`)
      .then((tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = Math.min(opts.anisotropy ?? 8, gl.capabilities.getMaxAnisotropy());
        if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
        tex.needsUpdate = true;
        // Se sube a la GPU ya (fuera del render): el primer cuadro que la usa no se traba.
        gl.initTexture(tex);
        return tex;
      });
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}

type Std = THREE.MeshStandardMaterial;
type SetId = 'wood' | 'diamond' | 'fabric' | 'galvanized';

/** Qué juegos de texturas usa la configuración actual (solo se bajan esos). */
function needs(cfg: Config): SetId[] {
  const s = cfg.sel;
  const out: SetId[] = ['galvanized'];
  if (cfg.tipo === 'tolva' || (cfg.tipo === 'furgon' && s.variante === 'sider') || (cfg.tipo === 'batea' && s.cobertor === true)) out.push('fabric');
  if (cfg.tipo === 'plataforma' && s.piso !== 'chapa') out.push('wood');
  if ((cfg.tipo === 'plataforma' && s.piso === 'chapa') || (cfg.tipo === 'furgon' && s.pisoFurgon === 'chapa') || (cfg.tipo === 'tolva' && s.pasarela === true)) out.push('diamond');
  return out;
}

async function apply(id: SetId, gl: THREE.WebGLRenderer, lib: MaterialLibrary): Promise<void> {
  const m = lib.mats;
  if (id === 'wood') {
    // Planks011: tablas a lo largo de U (= largo del semi). 1 mosaico ≈ 2,3 m → tablas de ~17 cm.
    const r: [number, number] = [1 / 2.3, 1 / 2.3];
    const [c, n, ro] = await Promise.all([loadKtx(gl, 'wood_color', { repeat: r, anisotropy: 16 }), loadKtx(gl, 'wood_normal', { repeat: r }), loadKtx(gl, 'wood_rough', { repeat: r })]);
    const mat = m.wood as Std;
    const old = [mat.map, mat.normalMap, mat.roughnessMap];
    mat.map = c;
    mat.normalMap = n;
    mat.roughnessMap = ro;
    mat.normalScale.set(0.9, 0.9);
    mat.roughness = 1;
    mat.color.set('#d9cfc4');
    // Las procedurales de madera solo las usaba este material.
    old.forEach((t) => t?.dispose());
  } else if (id === 'diamond') {
    const [n, ro] = await Promise.all([loadKtx(gl, 'diamond_normal', { anisotropy: 16 }), loadKtx(gl, 'diamond_rough')]);
    const mat = m.diamond as Std;
    const old = mat.normalMap;
    mat.normalMap = n;
    mat.normalScale.set(1.0, 1.0);
    // La rugosidad del mapa promedia 0,45: se usa tal cual (antes: 0,42 × desgaste).
    mat.roughnessMap = ro;
    mat.roughness = 0.95;
    old?.dispose();
  } else if (id === 'fabric') {
    // Tejido fino real de lona: trama de ~6 mm con las UV de la lona (0,5–0,6 m por unidad).
    const n = await loadKtx(gl, 'fabric_normal', { repeat: [1.6, 1.6] });
    const mat = m.lona as Std;
    const old = mat.normalMap;
    mat.normalMap = n;
    mat.normalScale.set(0.7, 0.7);
    old?.dispose();
  } else {
    // Flor de galvanizado real como color (cristales de zinc) sobre el metal.
    const c = await loadKtx(gl, 'galvanized_color', { repeat: [1, 1] });
    const mat = m.galvanized as Std;
    // El material ya nace con un mapa provisorio: cambiarlo no obliga a recompilar el shader.
    mat.map = c;
    mat.color.set('#c4c9cd');
  }
}

/**
 * Reemplaza las texturas procedurales por las CC0 en KTX2 a medida que la
 * configuración las necesita. Si una carga falla queda la procedural.
 */
export async function upgradeMaterials(gl: THREE.WebGLRenderer, lib: MaterialLibrary): Promise<void> {
  const state = new Map<SetId, 'pending' | 'done' | 'failed'>();
  const sync = (cfg: Config): Promise<void> => {
    const jobs: Promise<void>[] = [];
    for (const id of needs(cfg)) {
      if (state.has(id)) continue;
      state.set(id, 'pending');
      jobs.push(
        apply(id, gl, lib)
          .then(() => {
            state.set(id, 'done');
            viewer()?.invalidate();
          })
          .catch((e) => {
            state.set(id, 'failed');
            console.warn(`[configurador] textura KTX2 "${id}" no disponible: queda la procedural`, e);
          }),
      );
    }
    return Promise.all(jobs).then(() => undefined);
  };
  useStore.subscribe(
    (s) => s.config,
    (cfg) => void sync(cfg),
  );
  // Espera a un momento ocioso para no competir con la primera interacción.
  await new Promise<void>((res) => {
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    if (w.requestIdleCallback) w.requestIdleCallback(() => res(), { timeout: 1500 });
    else window.setTimeout(res, 400);
  });
  await sync(useStore.getState().config);
}
