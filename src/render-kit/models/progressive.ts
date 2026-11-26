/**
 * Carga progresiva de modelos GLB (ver docs/model-spec.md y `npm run models:build`):
 * primero la versión liviana (`<nombre>-low.glb`, geometría al 25 %, texturas de 512 px),
 * que llega rápido; después la completa, que reemplaza a la liviana con un fundido.
 *
 *   const lp = loadProgressive(gl, '/models/semi_tolva');
 *   lp.onLow((obj) => scene.add(obj));
 *   lp.onFull((obj, prev) => { frameCrossfade.start(300); scene.remove(prev); scene.add(obj); });
 *
 * Usa meshopt (geometría) y KTX2 (texturas, con el transcodificador de /basis/).
 */
import type * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

let loader: GLTFLoader | null = null;

function gltfLoader(gl: THREE.WebGLRenderer, basisPath = '/basis/'): GLTFLoader {
  if (!loader) {
    const ktx2 = new KTX2Loader().setTranscoderPath(basisPath).detectSupport(gl);
    loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

export interface ProgressiveLoad {
  onLow: (fn: (obj: THREE.Group) => void) => ProgressiveLoad;
  onFull: (fn: (obj: THREE.Group, low: THREE.Group | null) => void) => ProgressiveLoad;
  done: Promise<THREE.Group>;
}

/** `base` sin extensión: carga `${base}-low.glb` y `${base}.glb` en paralelo; la liviana se muestra primero. */
export function loadProgressive(gl: THREE.WebGLRenderer, base: string): ProgressiveLoad {
  const l = gltfLoader(gl);
  let lowCb: ((o: THREE.Group) => void) | null = null;
  let fullCb: ((o: THREE.Group, low: THREE.Group | null) => void) | null = null;
  let low: THREE.Group | null = null;
  let fullArrived = false;
  const lowP = l.loadAsync(`${base}-low.glb`).then((g: GLTF) => {
    if (fullArrived) return;
    low = g.scene;
    lowCb?.(low);
  });
  lowP.catch(() => undefined);
  const done = l.loadAsync(`${base}.glb`).then((g: GLTF) => {
    fullArrived = true;
    // Texturas subidas antes de mostrarla (sin tirón en el primer cuadro).
    g.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      for (const t of [m?.map, m?.normalMap, m?.roughnessMap, m?.aoMap]) if (t) gl.initTexture(t);
    });
    fullCb?.(g.scene, low);
    return g.scene;
  });
  const api: ProgressiveLoad = {
    onLow: (fn) => {
      lowCb = fn;
      if (low) fn(low);
      return api;
    },
    onFull: (fn) => {
      fullCb = fn;
      return api;
    },
    done,
  };
  return api;
}

/** Nombres de nodos de la especificación → objetos del modelo (los que falten quedan en null). */
export function findNodes<T extends string>(root: THREE.Object3D, names: readonly T[]): Record<T, THREE.Object3D | null> {
  const out = {} as Record<T, THREE.Object3D | null>;
  for (const n of names) out[n] = root.getObjectByName(n) ?? null;
  return out;
}
