import * as THREE from 'three';
import { strawResidueTextures } from './textures';
import { loadTexture } from '../render-kit/textures';

/** Material de suelo en siembra directa: tierra + rastrojo mezclados por ruido, con UV en espacio mundo desplazable. */
export interface GroundUniforms {
  uOffset: { value: number };
  uStraw: { value: number };
}

/**
 * Textura PBR cacheada por ruta (KTX2 comprimida en GPU, con respaldo WebP): se descarga y sube una
 * sola vez y nunca se libera.
 */
export function loadTex(path: string, srgb = false): THREE.Texture {
  return loadTexture(path, { srgb });
}

const groundCache = new Map<string, { material: THREE.MeshStandardMaterial; uniforms: GroundUniforms }>();
/** Material de suelo compartido por parámetros (no se crea ni se libera al cambiar de escena). */
export function createGroundMaterial(opts: { straw: number; soilScale?: number; strawScale?: number }): { material: THREE.MeshStandardMaterial; uniforms: GroundUniforms } {
  const key = `${opts.straw}|${opts.soilScale ?? ''}|${opts.strawScale ?? ''}`;
  const hit = groundCache.get(key);
  if (hit) return hit;
  const made = buildGroundMaterial(opts);
  groundCache.set(key, made);
  return made;
}

function buildGroundMaterial(opts: { straw: number; soilScale?: number; strawScale?: number }): { material: THREE.MeshStandardMaterial; uniforms: GroundUniforms } {
  const soilC = loadTex('textures/soil_color.webp', true);
  const soilN = loadTex('textures/soil_normal.webp');
  const soilR = loadTex('textures/soil_rough.webp');
  const { color: strawC, normal: strawN } = strawResidueTextures();
  const uniforms: GroundUniforms = { uOffset: { value: 0 }, uStraw: { value: opts.straw } };
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, normalMap: soilN, normalScale: new THREE.Vector2(1.2, 1.2), map: soilC, roughnessMap: soilR });
  const ss = (opts.soilScale ?? 0.45).toFixed(3);
  const ws = (opts.strawScale ?? 0.42).toFixed(3);
  m.customProgramCacheKey = () => `ground-${ss}-${ws}`;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOffset = uniforms.uOffset;
    sh.uniforms.uStraw = uniforms.uStraw;
    sh.uniforms.tStrawC = { value: strawC };
    sh.uniforms.tStrawN = { value: strawN };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGround;
        uniform float uOffset;
        uniform float uStraw;
        uniform sampler2D tStrawC;
        uniform sampler2D tStrawN;
        #define STRAW_S ${ws}`,
      )
      .replace(
        '#include <clipping_planes_pars_fragment>',
        `#include <clipping_planes_pars_fragment>
        vec2 gUv(){ return vec2(vGround.x, -(vGround.y + uOffset)); }
        mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
        float strawMask(){
          vec2 g = gUv();
          float lo = texture2D(tStrawC, g * 0.045 + 0.3).g;
          float lo2 = texture2D(map, g * 0.021).r;
          float m = smoothstep(0.25, 0.6, lo * 0.9 + lo2 * 0.6 - 0.3 + uStraw * 0.3);
          return clamp((0.42 + 0.58 * m) * uStraw, 0.0, 1.0);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec2 g = gUv();
          vec3 soil = texture2D(map, g * ${ss}).rgb;
          vec3 soil2 = texture2D(map, rot2(0.7) * g * 0.13).rgb;
          soil = mix(soil, soil2, 0.35);
          soil = mix(soil, vec3(dot(soil, vec3(0.333))), 0.5) * vec3(1.0, 0.92, 0.82) * 0.9;
          vec4 sa = texture2D(tStrawC, g * STRAW_S);
          vec4 sb = texture2D(tStrawC, rot2(1.3) * g * STRAW_S * 0.71 + 0.37);
          vec3 straw = sa.a > 0.05 ? sa.rgb / max(sa.a, 0.05) : sb.rgb / max(sb.a, 0.05);
          float k = strawMask();
          float tone = 0.86 + 0.28 * texture2D(map, g * 0.012).g;
          diffuseColor.rgb *= mix(soil, straw, k) * tone;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness * mix(texture2D(roughnessMap, gUv() * ${ss}).g, 0.85, strawMask());`,
      )
      .replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        `vec3 mapN = mix(texture2D(normalMap, gUv() * ${ss}).xyz, texture2D(tStrawN, gUv() * STRAW_S).xyz, strawMask()) * 2.0 - 1.0;`,
      );
  };
  return { material: m, uniforms };
}
