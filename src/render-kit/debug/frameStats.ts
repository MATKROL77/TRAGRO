/**
 * Medición cuadro a cuadro para el modo debug y el benchmark.
 *
 * Envuelve `renderer.render` para saber cuánto tiempo de CPU se va en cada cuadro
 * (ahí adentro ocurren la compilación de shaders y la subida de texturas, las dos
 * causas típicas de tirones) y anota, por cuadro, cuántos programas, texturas y
 * geometrías hay en la GPU y cuántas veces se reconstruyó el modelo.
 * No se instala salvo con ?debug=1 o cuando el benchmark lo pide.
 */
import type * as THREE from 'three';

export interface FrameSample {
  /** Comienzo del cuadro (performance.now). */
  t: number;
  /** Fin del último render del cuadro. */
  end: number;
  /** Tiempo de CPU dentro de renderer.render (todas las pasadas). */
  renderMs: number;
  programs: number;
  textures: number;
  geometries: number;
  /** Reconstrucciones acumuladas del modelo y su tiempo total. */
  builds: number;
  buildMs: number;
  calls: number;
  triangles: number;
}

export interface FrameStats {
  /** Llamar al comienzo de cada cuadro (useFrame con prioridad muy negativa). */
  beginFrame: () => void;
  /** Devuelve y vacía las muestras acumuladas. */
  take: () => FrameSample[];
  /** Últimas muestras sin vaciar (para el panel debug). */
  recent: (ms: number) => FrameSample[];
  dispose: () => void;
}

export const buildStats = { count: 0, ms: 0 };

let installed: FrameStats | null = null;

export function installFrameStats(gl: THREE.WebGLRenderer): FrameStats {
  if (installed) return installed;
  const samples: FrameSample[] = [];
  let cur: FrameSample | null = null;
  const original = gl.render;
  const wrapped = function (this: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera) {
    const t0 = performance.now();
    original.call(this, scene, camera);
    const t1 = performance.now();
    if (cur) {
      cur.renderMs += t1 - t0;
      cur.end = t1;
      cur.programs = gl.info.programs?.length ?? 0;
      cur.textures = gl.info.memory.textures;
      cur.geometries = gl.info.memory.geometries;
      // gl.info se pone en cero una vez por cuadro (autoReset = false en el visor): el valor ya es el acumulado del cuadro.
      cur.calls = gl.info.render.calls;
      cur.triangles = gl.info.render.triangles;
    }
  };
  gl.render = wrapped as typeof gl.render;
  installed = {
    beginFrame: () => {
      const t = performance.now();
      cur = { t, end: t, renderMs: 0, programs: gl.info.programs?.length ?? 0, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries, builds: buildStats.count, buildMs: buildStats.ms, calls: 0, triangles: 0 };
      samples.push(cur);
      if (samples.length > 30000) samples.splice(0, 10000);
    },
    take: () => samples.splice(0),
    recent: (ms) => {
      const from = performance.now() - ms;
      let i = samples.length;
      while (i > 0 && samples[i - 1].t >= from) i--;
      return samples.slice(i);
    },
    dispose: () => {
      gl.render = original;
      installed = null;
    },
  };
  return installed;
}

/** Estimación de memoria de GPU: texturas y buffers de geometría usados por la escena. */
export function estimateGpuMemory(scene: THREE.Object3D): { texturesMB: number; geometryMB: number } {
  const geos = new Set<THREE.BufferGeometry>();
  const texs = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
        if (v && (v as THREE.Texture).isTexture) texs.add(v as THREE.Texture);
      }
    }
  });
  const sceneEnv = (scene as THREE.Scene).environment;
  if (sceneEnv) texs.add(sceneEnv);
  let g = 0;
  for (const geo of geos) {
    for (const a of Object.values(geo.attributes)) g += (a as THREE.BufferAttribute).array?.byteLength ?? 0;
    if (geo.index) g += geo.index.array.byteLength;
  }
  let t = 0;
  for (const tex of texs) {
    const mips = (tex as THREE.CompressedTexture).mipmaps as { data?: ArrayBufferView }[] | undefined;
    if (mips && mips.length && mips[0]?.data) {
      for (const mm of mips) t += mm.data?.byteLength ?? 0;
      continue;
    }
    const img = tex.image as { width?: number; height?: number } | undefined;
    const w = img?.width ?? 0;
    const h = img?.height ?? 0;
    const bpp = tex.type === 1016 /* HalfFloat */ ? 8 : tex.type === 1015 /* Float */ ? 16 : 4;
    t += w * h * bpp * (tex.generateMipmaps ? 1.33 : 1);
  }
  return { texturesMB: t / 1048576, geometryMB: g / 1048576 };
}
