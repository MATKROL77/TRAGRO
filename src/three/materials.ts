/**
 * Biblioteca de materiales PBR. Se crea una sola vez y se comparte entre todas
 * las reconstrucciones del modelo: cambiar un color NO reconstruye geometría.
 */
import * as THREE from 'three';
import {
  diamondPlateNormal,
  galvanizedRoughness,
  grainNormal,
  licensePlate,
  panelNormal,
  reflectiveTape,
  speedSign,
  tarpNormal,
  tireColor,
  tireNormal,
  wearRoughness,
  woodPlanks,
} from './kit/tex';

export type MatKey =
  | 'bodyPaint'
  | 'bodyInner'
  | 'chassisPaint'
  | 'blackSteel'
  | 'galvanized'
  | 'alu'
  | 'aluBrushed'
  | 'chrome'
  | 'castIron'
  | 'rubber'
  | 'plastic'
  | 'lona'
  | 'wood'
  | 'diamond'
  | 'phenolic'
  | 'reflex'
  | 'lensRed'
  | 'lensAmber'
  | 'lensWhite'
  | 'redPaint'
  | 'yellowPaint'
  | 'whitePlastic'
  | 'roof'
  | 'grain'
  | 'plate'
  | 'speed'
  | 'tireDual'
  | 'tireSingle'
  | 'rimSteel'
  | 'rimAlu'
  | 'flapPrint'
  | 'glass';

export type MaterialSet = Record<MatKey, THREE.Material>;

export interface LiveryUniforms {
  uLivOn: { value: number };
  uLivMap: { value: THREE.Texture | null };
  /** cx, cy, ancho, alto del área lateral (coordenadas del semi). */
  uLivRect: { value: THREE.Vector4 };
  uLivFrontOn: { value: number };
  uLivFrontMap: { value: THREE.Texture | null };
  /** cz, cy, ancho, alto del área frontal. */
  uLivFrontRect: { value: THREE.Vector4 };
}

export interface MaterialLibrary {
  mats: MaterialSet;
  livery: LiveryUniforms;
  /** Colores objetivo; `tick` los alcanza con interpolación suave. */
  setColorTargets: (c: { chasis: string; caja: string; lona: string }) => void;
  /** Devuelve true mientras algún color siga cambiando. */
  tick: (dt: number) => boolean;
  setLights: (on: number) => void;
  setEnvIntensity: (v: number) => void;
  dispose: () => void;
}

function std(p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(p);
}
function phys(p: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial(p);
}

/** Inyecta la proyección del logo/texto en el color base: queda "pintado", con el mismo brillo y relieve. */
function addLivery(mat: THREE.MeshStandardMaterial, u: LiveryUniforms): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aLivery;\nvarying vec3 vLivPos;\nvarying vec3 vLivN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLivPos = aLivery;\nvLivN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLivPos;
        varying vec3 vLivN;
        uniform float uLivOn;
        uniform sampler2D uLivMap;
        uniform vec4 uLivRect;
        uniform float uLivFrontOn;
        uniform sampler2D uLivFrontMap;
        uniform vec4 uLivFrontRect;
        vec4 livSample(sampler2D map, vec2 uv) {
          vec4 t = texture2D(map, uv);
          float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          vec3 c = t.a > 0.003 ? t.rgb / t.a : vec3(0.0);
          return vec4(pow(c, vec3(2.2)), t.a * inside);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 ln = normalize(vLivN);
          if (uLivOn > 0.5) {
            float s = sign(vLivPos.z);
            float facing = smoothstep(0.35, 0.6, ln.z * s);
            vec2 uv = vec2(0.5 + s * (vLivPos.x - uLivRect.x) / uLivRect.z, 0.5 + (vLivPos.y - uLivRect.y) / uLivRect.w);
            vec4 l = livSample(uLivMap, uv);
            diffuseColor.rgb = mix(diffuseColor.rgb, l.rgb, l.a * facing);
          }
          if (uLivFrontOn > 0.5) {
            float facing = smoothstep(0.35, 0.6, ln.x);
            vec2 uv = vec2(0.5 - (vLivPos.z - uLivFrontRect.x) / uLivFrontRect.z, 0.5 + (vLivPos.y - uLivFrontRect.y) / uLivFrontRect.w);
            vec4 l = livSample(uLivFrontMap, uv);
            diffuseColor.rgb = mix(diffuseColor.rgb, l.rgb, l.a * facing);
          }
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'livery-v1';
}

/** Textura de 1×1 para que un material nazca "con mapa" y cambiarlo después no recompile el shader. */
function placeholder(rgba: [number, number, number, number], srgb = true): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function createMaterials(): MaterialLibrary {
  const wear = wearRoughness();
  const panelN = panelNormal();
  const grainN = grainNormal();
  const tape = reflectiveTape();
  const wood = woodPlanks();
  const tarpN = tarpNormal();

  const livery: LiveryUniforms = {
    uLivOn: { value: 0 },
    uLivMap: { value: null },
    uLivRect: { value: new THREE.Vector4(0, 2, 4, 1) },
    uLivFrontOn: { value: 0 },
    uLivFrontMap: { value: null },
    uLivFrontRect: { value: new THREE.Vector4(0, 2, 2, 1) },
  };

  const bodyPaint = phys({
    color: '#bb1e10',
    roughness: 0.42,
    metalness: 0.0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.16,
    roughnessMap: wear,
    normalMap: panelN,
    normalScale: new THREE.Vector2(0.1, 0.1),
    side: THREE.DoubleSide,
  });
  addLivery(bodyPaint, livery);

  const bodyInner = std({ color: '#bb1e10', roughness: 0.62, metalness: 0, roughnessMap: wear, side: THREE.DoubleSide });

  const chassisPaint = phys({
    color: '#2f3234',
    roughness: 0.5,
    metalness: 0.0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
    roughnessMap: wear,
  });

  const lona = std({ color: '#1b1c1e', roughness: 0.78, metalness: 0, normalMap: tarpN, normalScale: new THREE.Vector2(0.55, 0.55), side: THREE.DoubleSide });
  addLivery(lona, livery);

  const lens = (color: string, emissive: string) =>
    phys({ color, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, emissive, emissiveIntensity: 0.0, transmission: 0, ior: 1.5 });

  const tire = (label: string) =>
    std({ color: '#ffffff', map: tireColor(), roughness: 0.88, metalness: 0, normalMap: tireNormal(label), normalScale: new THREE.Vector2(1.5, 1.5) });

  const mats: MaterialSet = {
    bodyPaint,
    bodyInner,
    chassisPaint,
    blackSteel: std({ color: '#17181a', roughness: 0.55, metalness: 0.25, roughnessMap: wear }),
    galvanized: std({ color: '#aab0b5', map: placeholder([255, 255, 255, 255]), roughness: 0.55, metalness: 0.85, roughnessMap: galvanizedRoughness() }),
    alu: std({ color: '#d9dcde', roughness: 0.16, metalness: 1 }),
    aluBrushed: std({ color: '#c3c7ca', roughness: 0.42, metalness: 0.9, roughnessMap: wear }),
    chrome: std({ color: '#f1f2f3', roughness: 0.06, metalness: 1 }),
    castIron: std({ color: '#3a3836', roughness: 0.8, metalness: 0.5, normalMap: grainN, normalScale: new THREE.Vector2(0.6, 0.6) }),
    rubber: std({ color: '#161617', roughness: 0.92, metalness: 0, normalMap: grainN, normalScale: new THREE.Vector2(0.35, 0.35) }),
    plastic: std({ color: '#1c1d1f', roughness: 0.7, metalness: 0, normalMap: grainN, normalScale: new THREE.Vector2(0.5, 0.5) }),
    lona,
    wood: std({ color: '#ffffff', map: wood.map, normalMap: wood.normalMap, roughnessMap: wood.roughnessMap, roughness: 1, metalness: 0 }),
    diamond: std({ color: '#b9bec2', roughness: 0.42, metalness: 0.9, normalMap: diamondPlateNormal(), normalScale: new THREE.Vector2(1.1, 1.1), roughnessMap: wear }),
    phenolic: std({ color: '#3b2a22', roughness: 0.6, metalness: 0, normalMap: grainN, normalScale: new THREE.Vector2(0.8, 0.8) }),
    reflex: std({ color: '#ffffff', map: tape.map, normalMap: tape.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.35, metalness: 0.1, emissive: '#ffffff', emissiveMap: tape.map, emissiveIntensity: 0.12 }),
    lensRed: lens('#a20e12', '#ff1a1a'),
    lensAmber: lens('#c46a05', '#ff8a00'),
    lensWhite: lens('#e9eef2', '#ffffff'),
    redPaint: phys({ color: '#b8171b', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    yellowPaint: std({ color: '#e6a400', roughness: 0.5, metalness: 0 }),
    whitePlastic: std({ color: '#e8e8e3', roughness: 0.55, metalness: 0 }),
    roof: std({ color: '#eeeeea', roughness: 0.6, metalness: 0, roughnessMap: wear }),
    grain: std({ color: '#c9a55a', roughness: 0.9, metalness: 0 }),
    plate: std({ color: '#ffffff', map: licensePlate(), roughness: 0.5, metalness: 0.1 }),
    speed: std({ color: '#ffffff', map: speedSign(), roughness: 0.5, metalness: 0.1, transparent: true, alphaTest: 0.5 }),
    tireDual: tire('295/80 R22.5'),
    tireSingle: tire('385/65 R22.5'),
    rimSteel: phys({ color: '#b9bcc0', roughness: 0.42, metalness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.3, roughnessMap: wear, side: THREE.DoubleSide }),
    rimAlu: std({ color: '#e3e5e7', roughness: 0.14, metalness: 1, side: THREE.DoubleSide }),
    flapPrint: std({ color: '#ffffff', map: placeholder([0, 0, 0, 0]), roughness: 0.9, metalness: 0, transparent: true, alphaTest: 0.35 }),
    glass: phys({ color: '#aab7bf', roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.35 }),
  };

  const targets = { chasis: new THREE.Color('#2f3234'), caja: new THREE.Color('#bb1e10'), lona: new THREE.Color('#1b1c1e') };
  let first = true;

  const setColorTargets: MaterialLibrary['setColorTargets'] = (c) => {
    targets.chasis.set(c.chasis);
    targets.caja.set(c.caja);
    targets.lona.set(c.lona);
    if (first) {
      first = false;
      (mats.chassisPaint as THREE.MeshPhysicalMaterial).color.copy(targets.chasis);
      bodyPaint.color.copy(targets.caja);
      bodyInner.color.copy(targets.caja);
      lona.color.copy(targets.lona);
    }
  };

  const approach = (c: THREE.Color, t: THREE.Color, k: number): boolean => {
    const d = Math.abs(c.r - t.r) + Math.abs(c.g - t.g) + Math.abs(c.b - t.b);
    if (d < 0.002) {
      if (d > 0) c.copy(t);
      return false;
    }
    c.lerp(t, k);
    return true;
  };

  const tick: MaterialLibrary['tick'] = (dt) => {
    const k = 1 - Math.exp(-dt * 9);
    const a = approach((mats.chassisPaint as THREE.MeshPhysicalMaterial).color, targets.chasis, k);
    const b = approach(bodyPaint.color, targets.caja, k);
    bodyInner.color.copy(bodyPaint.color);
    const c = approach(lona.color, targets.lona, k);
    return a || b || c;
  };

  const setLights: MaterialLibrary['setLights'] = (on) => {
    (mats.lensRed as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.05 + on * 3.2;
    (mats.lensAmber as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.05 + on * 2.6;
    (mats.lensWhite as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.02 + on * 1.4;
    (mats.reflex as THREE.MeshStandardMaterial).emissiveIntensity = 0.12 + on * 0.5;
  };

  const setEnvIntensity: MaterialLibrary['setEnvIntensity'] = (v) => {
    for (const m of Object.values(mats)) (m as THREE.MeshStandardMaterial).envMapIntensity = v;
  };

  const dispose = () => {
    for (const m of Object.values(mats)) m.dispose();
  };

  setLights(0);
  return { mats, livery, setColorTargets, tick, setLights, setEnvIntensity, dispose };
}
