/**
 * Encadenar modificaciones de shader (onBeforeCompile) sobre un mismo material sin
 * pisarse, con una clave de caché de programa estable (para que la precompilación
 * y el cambio de escena no generen variantes nuevas).
 */
import type * as THREE from 'three';

type Shader = THREE.WebGLProgramParametersWithUniforms;

interface Patchable {
  __patches?: { key: string; fn: (s: Shader) => void }[];
}

export function patchMaterial(mat: THREE.Material, key: string, fn: (shader: Shader) => void): void {
  const m = mat as THREE.Material & Patchable;
  const prevFn = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);
  if (!m.__patches) {
    // El primer parche conserva lo que ya tuviera el material.
    const base = prevFn;
    m.__patches = [{ key: prevKey(), fn: (s) => base.call(m, s, undefined as unknown as THREE.WebGLRenderer) }];
  }
  m.__patches.push({ key, fn });
  const patches = m.__patches;
  m.onBeforeCompile = (shader) => {
    for (const p of patches) p.fn(shader);
  };
  m.customProgramCacheKey = () => patches.map((p) => p.key).join('+');
}

/** Ruido de valor en espacio de mundo (GLSL), sin texturas. */
export const NOISE_GLSL = `
float rkHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rkNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rkHash(i + vec3(0,0,0)), rkHash(i + vec3(1,0,0)), f.x), mix(rkHash(i + vec3(0,1,0)), rkHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rkHash(i + vec3(0,0,1)), rkHash(i + vec3(1,0,1)), f.x), mix(rkHash(i + vec3(0,1,1)), rkHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float rkFbm(vec3 p) { return 0.55 * rkNoise(p) + 0.3 * rkNoise(p * 2.03 + 7.1) + 0.15 * rkNoise(p * 4.11 + 3.3); }
`;

export interface DirtOptions {
  /** Altura (m) por debajo de la cual empieza a aparecer suciedad. */
  top: number;
  /** Altura donde la suciedad es máxima. */
  bottom: number;
  /** Intensidad 0..1. */
  amount: number;
  /** Color del barro (lineal). */
  color?: [number, number, number];
}

/**
 * Suciedad y salpicaduras en la parte baja (máscara por altura en espacio de mundo +
 * ruido): oscurece y matiza el color base y sube la rugosidad. Sutil a propósito.
 */
export function addDirt(mat: THREE.MeshStandardMaterial, o: DirtOptions): void {
  const c = o.color ?? [0.16, 0.12, 0.085];
  patchMaterial(mat, `dirt-${o.top}-${o.bottom}-${o.amount}`, (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRkWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 rkp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            rkp = instanceMatrix * rkp;
          #endif
          vRkWorld = (modelMatrix * rkp).xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRkWorld;\n${NOISE_GLSL}\nfloat rkDirt;`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float h = smoothstep(${o.top.toFixed(3)}, ${o.bottom.toFixed(3)}, vRkWorld.y);
          float n = rkFbm(vRkWorld * vec3(3.1, 5.3, 3.1));
          float speck = smoothstep(0.62, 0.8, rkNoise(vRkWorld * 23.0));
          rkDirt = clamp(h * (0.55 + 0.6 * n) + speck * h * 0.5, 0.0, 1.0) * ${o.amount.toFixed(3)};
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${c.map((v) => v.toFixed(3)).join(', ')}), rkDirt);
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.95, rkDirt);');
  });
}
