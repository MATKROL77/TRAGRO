import * as THREE from 'three';
import { loadTexture } from '../render-kit/textures';
import { discColor, discRoughness, metalScratches, paintRoughness, rubberSidewallNormal, tireTreadNormal } from './textures';

/**
 * Materiales PBR compartidos. Se crean una sola vez; cambiar colores NO reconstruye geometría
 * (sólo se actualiza el color del material).
 */

const wearUniforms = {
  uWear: { value: 1 },
  uDust: { value: 0.55 },
};

export function setWear(wear: number, dust: number) {
  wearUniforms.uWear.value = wear;
  wearUniforms.uDust.value = dust;
}

/** Pintura industrial: desgaste procedural en bordes (curvatura por derivadas) + polvo cerca del suelo. */
function patchPaint(m: THREE.MeshPhysicalMaterial, wearStrength = 1) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWear = wearUniforms.uWear;
    shader.uniforms.uDust = wearUniforms.uDust;
    shader.uniforms.uWearK = { value: wearStrength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSpWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 spWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          spWp = instanceMatrix * spWp;
        #endif
        vSpWorld = (modelMatrix * spWp).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSpWorld;
        uniform float uWear;
        uniform float uDust;
        uniform float uWearK;
        float spHash(vec3 p){ p = fract(p*0.3183099 + vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float spNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(spHash(i+vec3(0,0,0)),spHash(i+vec3(1,0,0)),f.x),mix(spHash(i+vec3(0,1,0)),spHash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(spHash(i+vec3(0,0,1)),spHash(i+vec3(1,0,1)),f.x),mix(spHash(i+vec3(0,1,1)),spHash(i+vec3(1,1,1)),f.x),f.y),f.z); }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          #ifndef FLAT_SHADED
          float curv = length(fwidth(vNormal)) / max(length(fwidth(vViewPosition)), 1e-4);
          #else
          float curv = 0.0;
          #endif
          float n1 = spNoise(vSpWorld * 38.0);
          float n2 = spNoise(vSpWorld * 6.0);
          float edge = smoothstep(28.0, 90.0, curv) * smoothstep(0.45, 0.75, n1 * 0.6 + n2 * 0.5) * uWear * uWearK;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.50, 0.50, 0.49), edge * 0.85);
          metalnessFactor = mix(metalnessFactor, 0.85, edge);
          roughnessFactor = mix(roughnessFactor, 0.42, edge);
          float dust = (1.0 - smoothstep(0.0, 0.75, vSpWorld.y)) * uDust * (0.55 + 0.45 * n2);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.40, 0.34, 0.27), dust * 0.6);
          roughnessFactor = mix(roughnessFactor, 0.95, dust * 0.8);
        }`,
      );
  };
  m.customProgramCacheKey = () => `paint-${wearStrength}`;
}

function paint(color: string, wear = 1): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.42,
    metalness: 0.12,
    clearcoat: 0.45,
    clearcoatRoughness: 0.22,
    roughnessMap: paintRoughness(),
  });
  patchPaint(m, wear);
  return m;
}

export interface MaterialSet {
  paintMain: THREE.MeshPhysicalMaterial;
  paintAccent: THREE.MeshPhysicalMaterial;
  paintDark: THREE.MeshPhysicalMaterial;
  steelDisc: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  castIron: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  tire: THREE.MeshStandardMaterial;
  hose: THREE.MeshStandardMaterial;
  seedHose: THREE.MeshPhysicalMaterial;
  plastic: THREE.MeshStandardMaterial;
  galvanized: THREE.MeshStandardMaterial;
  rimGrey: THREE.MeshStandardMaterial;
  plate: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  lightRed: THREE.MeshStandardMaterial;
  lightAmber: THREE.MeshStandardMaterial;
  cable: THREE.MeshStandardMaterial;
  tractorBody: THREE.MeshPhysicalMaterial;
  ghost: THREE.MeshBasicMaterial;
}

let set: MaterialSet | null = null;

export function getMaterials(): MaterialSet {
  if (set) return set;
  const tread = tireTreadNormal().clone();
  tread.needsUpdate = true;
  tread.repeat.set(2, 1);
  set = {
    paintMain: paint('#1E4D5C'),
    paintAccent: paint('#E8792B', 0.7),
    paintDark: paint('#22272b', 1.2),
    steelDisc: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: discColor(),
      metalness: 0.95,
      roughness: 1,
      roughnessMap: discRoughness(),
      envMapIntensity: 1.1,
    }),
    // metal desnudo (ejes, chapas, cuchillas): metálico puro, rugosidad 0,25–0,4 con rayones
    steel: new THREE.MeshStandardMaterial({ color: '#9a9ea3', metalness: 1, roughness: 1, roughnessMap: metalScratches() }),
    castIron: new THREE.MeshStandardMaterial({ color: '#3d4043', metalness: 0.55, roughness: 0.62 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#f2f4f6', metalness: 1, roughness: 0.07, envMapIntensity: 1.4 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#171717', metalness: 0, roughness: 0.88, normalMap: rubberSidewallNormal(), normalScale: new THREE.Vector2(0.4, 0.4) }),
    tire: new THREE.MeshStandardMaterial({ color: '#161616', metalness: 0, roughness: 0.9, normalMap: tread, normalScale: new THREE.Vector2(1.6, 1.6) }),
    // mangueras: plástico negro semimate
    hose: new THREE.MeshStandardMaterial({ color: '#141414', metalness: 0, roughness: 0.58 }),
    seedHose: new THREE.MeshPhysicalMaterial({ color: '#2b2f33', metalness: 0, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    plastic: new THREE.MeshStandardMaterial({ color: '#1d1f21', metalness: 0, roughness: 0.48 }),
    galvanized: new THREE.MeshStandardMaterial({ color: '#b7bcc1', metalness: 0.85, roughness: 0.42 }),
    rimGrey: new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.4, roughness: 0.45 }),
    plate: new THREE.MeshStandardMaterial({ color: '#c3c7cb', metalness: 0.85, roughness: 0.45 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#1a2a33', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.55, envMapIntensity: 1.5 }),
    lightRed: new THREE.MeshStandardMaterial({ color: '#a50f0f', emissive: '#5a0000', roughness: 0.25 }),
    lightAmber: new THREE.MeshStandardMaterial({ color: '#e08a10', emissive: '#4a2a00', roughness: 0.25 }),
    cable: new THREE.MeshStandardMaterial({ color: '#0d0d0d', roughness: 0.55 }),
    tractorBody: paint('#d8dadc', 0.4),
    ghost: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0 }),
  };
  set.tractorBody.clearcoat = 0.8;
  return set;
}

export function setMachineColors(main: string, accent: string) {
  const m = getMaterials();
  m.paintMain.color.set(main);
  m.paintAccent.color.set(accent);
}

/** Carga texturas CC0 (ambientCG) para la pasarela de chapa antideslizante. */
export function applyPlateTextures(loader: THREE.TextureLoader) {
  const m = getMaterials();
  if (m.plate.map) return;
  void loader;
  // KTX2 (con respaldo WebP): ver render-kit/textures.ts
  const color = loadTexture('textures/plate_color', { srgb: true });
  const normal = loadTexture('textures/plate_normal');
  const rough = loadTexture('textures/plate_rough');
  for (const t of [color, normal, rough]) t.repeat.set(4, 1);
  m.plate.map = color;
  m.plate.normalMap = normal;
  m.plate.roughnessMap = rough;
  m.plate.needsUpdate = true;
}
