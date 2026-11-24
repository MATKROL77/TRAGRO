/**
 * Escena exterior: ruta recta en la pampa a media tarde. Liviana a propósito:
 * un solo plano de suelo (asfalto + banquina + campo mezclados en el shader),
 * alambrado y postes instanciados, cortinas de árboles lejanas como siluetas,
 * cielo CC0 (Poly Haven) para el fondo y la iluminación, y un sol direccional
 * que proyecta las sombras del equipo.
 *
 * Se carga recién cuando el usuario pide "Exterior" (chunk aparte).
 */
import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, grayTexture, makeCanvas, rng } from './kit/tex';
import { loadKtx } from './ktx';

const BASE = import.meta.env.BASE_URL;

/** Datos de public/assets/hdri/sky_info.json (cielo "sunflowers_puresky"). */
const SUN_DIR = new THREE.Vector3(0.5903, 0.6821, 0.4316).normalize();
const HORIZON_SRGB = '#b3bec0';

/** Eje de la ruta: el semi (centrado en z = 0) queda en el carril derecho, sentido +X. */
const ROAD_Z = -1.825;
const HALF_ROAD = 3.65;
const SHOULDER = 2.3;
const FENCE_OFFSET = 15.5;
const WORLD_RADIUS = 760;

/** Intensidades calibradas para igualar la exposición del estudio (el postprocesado es global). */
const ENV_INTENSITY = 0.5;
const SUN_INTENSITY = 2.75;
const HAZE_DIST = 560;

/**
 * El fondo es un JPG ya tonemapeado y la imagen pasa después por AgX +
 * contraste/saturación. Esta curva lo lleva a valores de escena que, tras ese
 * postprocesado, vuelven a verse como el original (y se queda por debajo del
 * umbral del bloom salvo en el disco del sol).
 */
const TONE = { a: 0.86, b: 1.07, knee: 0.72, head: 0.36, sat: 1.3 };
function invTone(v: number): number {
  const d = Math.min(v, 0.985);
  const x = (TONE.a * d) / (TONE.b - d);
  const over = Math.max(x - TONE.knee, 0);
  return Math.min(x, TONE.knee) + over / (1 + over / TONE.head);
}

interface Assets {
  env: THREE.Texture;
  sky: THREE.Texture;
  asphaltC: THREE.Texture;
  asphaltN: THREE.Texture;
  asphaltR: THREE.Texture;
  fieldC: THREE.Texture;
  fieldN: THREE.Texture;
  gravelC: THREE.Texture;
  gravelN: THREE.Texture;
}

let assets: Assets | null = null;
let loading: Promise<void> | null = null;

/** Descarga y prepara todo lo que usa la escena, para que al mostrarla no haya parpadeo. */
export function preloadExterior(gl: THREE.WebGLRenderer): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const aniso = 16;
      const t0 = performance.now();
      const mark = (label: string) => import.meta.env.DEV && console.log(`[t] exterior ${label}: ${Math.round(performance.now() - t0)} ms`);
      const [hdr, sky, asphaltC, asphaltN, asphaltR, fieldC, fieldN, gravelC, gravelN] = await Promise.all([
        new RGBELoader().loadAsync(`${BASE}assets/hdri/sky_1k.hdr`),
        new THREE.TextureLoader().loadAsync(`${BASE}assets/hdri/sky_4k.jpg`),
        loadKtx(gl, 'asphalt_color', { anisotropy: aniso }),
        loadKtx(gl, 'asphalt_normal', { anisotropy: aniso }),
        loadKtx(gl, 'asphalt_rough', { anisotropy: aniso }),
        loadKtx(gl, 'field_color', { anisotropy: aniso }),
        loadKtx(gl, 'field_normal', { anisotropy: 8 }),
        loadKtx(gl, 'gravel_color', { anisotropy: aniso }),
        loadKtx(gl, 'gravel_normal', { anisotropy: 8 }),
      ]);
      mark('descargas + transcodificación');
      // Entorno prefiltrado (PMREM) listo antes de mostrar la escena.
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(gl);
      const env = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      pmrem.dispose();
      sky.colorSpace = THREE.SRGBColorSpace;
      sky.wrapS = THREE.RepeatWrapping;
      sky.wrapT = THREE.ClampToEdgeWrapping;
      // Sin mipmaps: evita la costura del atan() en u = 0/1 y el cielo siempre se ve ampliado.
      sky.generateMipmaps = false;
      sky.minFilter = THREE.LinearFilter;
      sky.magFilter = THREE.LinearFilter;
      sky.needsUpdate = true;
      assets = { env, sky, asphaltC, asphaltN, asphaltR, fieldC, fieldN, gravelC, gravelN };
      mark('PMREM');
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

function hazeColor(): THREE.Color {
  const c = new THREE.Color(HORIZON_SRGB); // ya en lineal (display)
  return new THREE.Color(invTone(c.r), invTone(c.g), invTone(c.b));
}

interface HazeUniforms {
  uHaze: { value: THREE.Color };
  uHazeDist: { value: number };
}

const HAZE_GLSL = `
  {
    float hazeD = length(vViewPosition);
    float hazeF = 1.0 - exp(-pow(hazeD / uHazeDist, 1.7));
    // Al borde del mundo la bruma es total: el suelo se funde con el cielo.
    hazeF = max(hazeF, smoothstep(500.0, 735.0, hazeD));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, clamp(hazeF, 0.0, 1.0));
  }`;

/** Perspectiva aérea: los objetos lejanos se funden con la bruma del horizonte. */
function withHaze<T extends THREE.MeshStandardMaterial>(mat: T, u: HazeUniforms, key: string): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uHaze;\nuniform float uHazeDist;').replace('#include <fog_fragment>', HAZE_GLSL);
  };
  mat.customProgramCacheKey = () => `haze-${key}`;
  return mat;
}

/** Suelo: asfalto con demarcación, banquina de ripio y campo, mezclados por distancia al eje. */
function makeGroundMaterial(a: Assets, macro: THREE.Texture, haze: HazeUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map: a.asphaltC, normalMap: a.asphaltN, roughnessMap: a.asphaltR, roughness: 1, metalness: 0 });
  const uniforms = {
    ...haze,
    uFieldC: { value: a.fieldC },
    uFieldN: { value: a.fieldN },
    uGravelC: { value: a.gravelC },
    uGravelN: { value: a.gravelN },
    uMacro: { value: macro },
    uRoad: { value: new THREE.Vector4(ROAD_Z, HALF_ROAD, SHOULDER, FENCE_OFFSET) },
    // Pasto de lawn → pastizal pampeano de fin de verano (más seco y apagado).
    uFieldTint: { value: new THREE.Color(1.02, 0.86, 0.6) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGPos;
        uniform vec3 uHaze;
        uniform float uHazeDist;
        uniform sampler2D uFieldC;
        uniform sampler2D uFieldN;
        uniform sampler2D uGravelC;
        uniform sampler2D uGravelN;
        uniform sampler2D uMacro;
        uniform vec4 uRoad;
        uniform vec3 uFieldTint;
        float gwAsph;
        float gwGrav;
        float gwGrass;
        float gPaint;
        vec2 gUvA;
        vec2 gUvG;
        vec2 gUvF;`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec2 xz = vGPos.xz;
          float dz = xz.y - uRoad.x;
          float adz = abs(dz);
          float n1 = texture2D(uMacro, xz * 0.017).r;
          float n2 = texture2D(uMacro, xz * 0.11 + 0.37).r;
          float n3 = texture2D(uMacro, xz * 0.61 + 0.11).r;
          float n4 = texture2D(uMacro, xz * 2.9 + 0.53).r;

          // Bordes irregulares: el asfalto se desgrana y el pasto invade la banquina.
          float edge = uRoad.y + (n2 - 0.5) * 0.16 + (n3 - 0.5) * 0.06;
          gwAsph = 1.0 - smoothstep(edge - 0.03, edge + 0.07, adz);
          float sEnd = uRoad.y + uRoad.z + (n1 - 0.5) * 1.5 + (n2 - 0.5) * 0.8;
          gwGrav = (1.0 - gwAsph) * (1.0 - smoothstep(sEnd - 0.55, sEnd + 0.75, adz));
          gwGrass = max(0.0, 1.0 - gwAsph - gwGrav);

          gUvA = xz / 3.3;
          gUvG = xz / 2.4;
          gUvF = xz / 2.7;
          // Dos escalas por textura: rompe el mosaico sin costo de geometría.
          vec3 cA = mix(texture2D(map, gUvA).rgb, texture2D(map, xz.yx / 7.9 + 0.21).rgb, 0.45);
          vec3 cG = mix(texture2D(uGravelC, gUvG).rgb, texture2D(uGravelC, xz.yx / 6.1 + 0.4).rgb, 0.4);
          vec3 cF = mix(texture2D(uFieldC, gUvF).rgb, texture2D(uFieldC, xz.yx / 11.3 + 0.63).rgb, 0.32);

          // Asfalto: parches y huellas de rodada apenas más oscuras en cada carril.
          float lane = abs(adz - uRoad.y * 0.5);
          float tracks = 1.0 - 0.07 * (1.0 - smoothstep(0.0, 0.45, abs(lane - 0.95)));
          cA *= mix(0.84, 1.07, n1) * mix(0.94, 1.04, n2) * tracks * 0.8;
          cG *= mix(0.78, 1.0, n2) * 0.74;
          // Banquina y préstamo: manchones de pasto más seco o más verde.
          vec3 dry = cF * uFieldTint * 1.12;
          vec3 lush = cF * vec3(0.8, 0.86, 0.62);
          // Matas y claros a escala de pasos: evita el aspecto de césped liso.
          cF *= mix(0.74, 1.2, n4) * mix(0.9, 1.08, n3);
          dry *= mix(0.74, 1.2, n4);
          lush *= mix(0.74, 1.2, n4);
          vec3 road = mix(lush, dry, smoothstep(0.3, 0.72, n1)) * mix(0.82, 1.1, n2);
          // Detrás del alambrado: lotes de cultivo (soja, rastrojo, pastura) como un damero irregular.
          float dist = length(vViewPosition);
          vec2 lot = floor((xz + vec2(63.0, 0.0)) / vec2(250.0, 170.0) + vec2(0.0, step(0.0, dz) * 7.0));
          float hsh = fract(sin(dot(lot, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 tint = hsh < 0.38 ? vec3(0.66, 0.8, 0.44) : hsh < 0.66 ? vec3(1.22, 1.02, 0.66) : hsh < 0.86 ? vec3(0.86, 0.94, 0.52) : vec3(1.02, 0.88, 0.58);
          float rows = hsh < 0.38 ? 1.0 : 0.0;
          float furrow = 1.0 - 0.16 * rows * (0.5 + 0.5 * sin(xz.y * 12.08)) * (1.0 - smoothstep(18.0, 75.0, dist));
          vec3 crop = cF * tint * furrow * mix(0.9, 1.08, n1);
          float beyond = smoothstep(uRoad.w - 0.5, uRoad.w + 0.7, adz);
          cF = mix(road, crop, beyond);

          vec3 col = cA * gwAsph + cG * gwGrav + cF * gwGrass;

          // Demarcación: bordes blancos continuos y eje amarillo discontinuo, gastados.
          float aaz = fwidth(dz) * 1.25 + 0.003;
          float aax = fwidth(xz.x) * 1.25 + 0.003;
          float edgeLine = 1.0 - smoothstep(0.06, 0.06 + aaz, abs(adz - (uRoad.y - 0.26)));
          float center = 1.0 - smoothstep(0.06, 0.06 + aaz, abs(dz));
          float seg = abs(fract(xz.x / 12.0) - 0.5) * 12.0;
          float dash = 1.0 - smoothstep(2.25, 2.25 + aax, seg);
          float wear = mix(0.5, 1.0, smoothstep(0.28, 0.6, n3)) * mix(0.8, 1.0, n2);
          float far = 1.0 - smoothstep(140.0, 420.0, dist);
          float pW = edgeLine * wear * gwAsph * far;
          float pY = center * dash * wear * far;
          col = mix(col, vec3(0.62, 0.62, 0.6), pW * 0.92);
          col = mix(col, vec3(0.66, 0.47, 0.07), pY * 0.92);
          gPaint = max(pW, pY);

          diffuseColor.rgb *= col;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
        {
          float rA = mix(texture2D(roughnessMap, gUvA).g, 0.6, 0.35) + 0.22;
          roughnessFactor = clamp(rA * gwAsph + 0.96 * gwGrav + 0.93 * gwGrass, 0.05, 1.0);
          roughnessFactor = mix(roughnessFactor, 0.62, gPaint * 0.5);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
          vec3 nA = texture2D(normalMap, gUvA).xyz * 2.0 - 1.0;
          vec3 nG = texture2D(uGravelN, gUvG).xyz * 2.0 - 1.0;
          vec3 nF = texture2D(uFieldN, gUvF).xyz * 2.0 - 1.0;
          vec3 nm = nA * gwAsph * vec3(0.9, 0.9, 1.0) + nG * gwGrav * vec3(1.2, 1.2, 1.0) + nF * gwGrass * vec3(1.1, 1.1, 1.0);
          // El relieve fino se apaga a lo lejos (evita centelleo).
          float fade = 1.0 - smoothstep(25.0, 140.0, length(vViewPosition));
          nm.xy *= fade;
          // u → +X, v → +Z, normal del plano → +Y.
          vec3 wn = normalize(vec3(nm.x, max(nm.z, 0.2), nm.y));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`,
      )
      .replace('#include <fog_fragment>', HAZE_GLSL);
  };
  mat.customProgramCacheKey = () => 'ground-v1';
  return mat;
}

function makeSkyMaterial(a: Assets, haze: HazeUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    uniforms: {
      map: { value: a.sky },
      uHaze: haze.uHaze,
      uTone: { value: new THREE.Vector4(TONE.a, TONE.b, TONE.knee, TONE.head) },
      uSat: { value: TONE.sat },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = wp.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_Position.z = gl_Position.w; // siempre al fondo
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 uHaze;
      uniform vec4 uTone;
      uniform float uSat;
      varying vec3 vDir;
      vec3 invTone(vec3 d) {
        d = min(d, vec3(0.985));
        vec3 x = uTone.x * d / (uTone.y - d);
        vec3 over = max(x - uTone.z, 0.0);
        return min(x, vec3(uTone.z)) + over / (1.0 + over / uTone.w);
      }
      void main() {
        vec3 d = normalize(vDir);
        vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
        vec3 c = texture2D(map, uv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = max(mix(vec3(l), c, uSat), 0.0);
        c = invTone(c);
        // Banda de bruma sobre el horizonte: funde el cielo con el campo.
        float h = smoothstep(-0.012, 0.085, d.y);
        gl_FragColor = vec4(mix(uHaze, c, h * h), 1.0);
      }`,
  });
}

/** Alambrado de campo: postes, varillas e hilos a ambos lados de la ruta. */
function buildFence(haze: HazeUniforms): { objects: THREE.Object3D[]; dispose: () => void } {
  const wood = withHaze(new THREE.MeshStandardMaterial({ color: '#5f5346', roughness: 0.95 }), haze, 'wood');
  const wire = withHaze(new THREE.MeshStandardMaterial({ color: '#7d7f80', roughness: 0.6, metalness: 0.6 }), haze, 'wire');
  const LEN = 440;
  const postGeo = new THREE.CylinderGeometry(0.055, 0.065, 1.45, 7);
  postGeo.translate(0, 0.72, 0);
  const rodGeo = new THREE.BoxGeometry(0.035, 1.12, 0.03);
  rodGeo.translate(0, 0.66, 0);
  const posts: THREE.Matrix4[] = [];
  const rods: THREE.Matrix4[] = [];
  const rand = rng(9);
  for (const s of [1, -1]) {
    const z = ROAD_Z + s * FENCE_OFFSET;
    for (let x = -LEN; x <= LEN; x += 12) {
      const m = new THREE.Matrix4().makeRotationZ((rand() - 0.5) * 0.05);
      m.setPosition(x, 0, z + (rand() - 0.5) * 0.05);
      posts.push(m);
    }
    // Las varillas solo se dibujan cerca: lejos no se distinguen.
    for (let x = -168; x <= 168; x += 2.4) {
      if (Math.abs(x % 12) < 0.01) continue;
      rods.push(new THREE.Matrix4().makeTranslation(x, 0, z));
    }
  }
  const postMesh = new THREE.InstancedMesh(postGeo, wood, posts.length);
  posts.forEach((m, i) => postMesh.setMatrixAt(i, m));
  const rodMesh = new THREE.InstancedMesh(rodGeo, wood, rods.length);
  rods.forEach((m, i) => rodMesh.setMatrixAt(i, m));
  // Hilos: tramos cortos fusionados (así la bruma por distancia es correcta).
  const wires: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const z = ROAD_Z + s * FENCE_OFFSET;
    for (const y of [0.28, 0.5, 0.72, 0.94, 1.16]) {
      for (let x = -LEN; x < LEN; x += 40) {
        const g = new THREE.BoxGeometry(40, 0.011, 0.011);
        g.translate(x + 20, y, z + 0.06);
        wires.push(g);
      }
    }
  }
  const wireGeo = mergeGeometries(wires, false)!;
  wires.forEach((g) => g.dispose());
  const wireMesh = new THREE.Mesh(wireGeo, wire);
  for (const o of [postMesh, rodMesh]) {
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
  }
  wireMesh.frustumCulled = false;
  return {
    objects: [postMesh, rodMesh, wireMesh],
    dispose: () => {
      postGeo.dispose();
      rodGeo.dispose();
      wireGeo.dispose();
      wood.dispose();
      wire.dispose();
      postMesh.dispose();
      rodMesh.dispose();
    },
  };
}

/** Línea de postes de madera con cruceta y cables, del lado opuesto de la ruta. */
function buildPoles(haze: HazeUniforms): { objects: THREE.Object3D[]; dispose: () => void } {
  const wood = withHaze(new THREE.MeshStandardMaterial({ color: '#4d4338', roughness: 0.95 }), haze, 'pole');
  const cable = withHaze(new THREE.MeshStandardMaterial({ color: '#4a4c4e', roughness: 0.7 }), haze, 'cable');
  // Lejos de la ruta: dan profundidad sin cruzar el cielo por encima del equipo.
  const z = ROAD_Z - 46;
  const SPAN = 60;
  const H = 8.6;
  const parts: THREE.BufferGeometry[] = [];
  const cables: THREE.BufferGeometry[] = [];
  const xs: number[] = [];
  for (let x = -403; x <= 400; x += SPAN) xs.push(x);
  for (const x of xs) {
    const pole = new THREE.CylinderGeometry(0.085, 0.12, H, 8);
    pole.translate(x, H / 2, z);
    const arm = new THREE.BoxGeometry(0.1, 0.1, 1.7);
    arm.translate(x, H - 0.45, z);
    parts.push(pole, arm);
    for (const dz of [-0.75, 0, 0.75]) {
      const ins = new THREE.CylinderGeometry(0.035, 0.045, 0.14, 6);
      ins.translate(x, H - 0.33, z + dz);
      parts.push(ins);
    }
  }
  // Cables con flecha (catenaria aproximada en 6 tramos por vano).
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < xs.length - 1; i++) {
    for (const dz of [-0.75, 0.75]) {
      for (let k = 0; k < 6; k++) {
        const t0 = k / 6;
        const t1 = (k + 1) / 6;
        const p0 = new THREE.Vector3(xs[i] + SPAN * t0, H - 0.26 - 0.9 * 4 * t0 * (1 - t0), z + dz);
        const p1 = new THREE.Vector3(xs[i] + SPAN * t1, H - 0.26 - 0.9 * 4 * t1 * (1 - t1), z + dz);
        const dir = p1.clone().sub(p0);
        const len = dir.length();
        const g = new THREE.CylinderGeometry(0.028, 0.028, len, 4, 1, true);
        q.setFromUnitVectors(up, dir.normalize());
        m.compose(p0.add(p1).multiplyScalar(0.5), q, one);
        g.applyMatrix4(m);
        cables.push(g);
      }
    }
  }
  const poleGeo = mergeGeometries(parts, false)!;
  const cableGeo = mergeGeometries(cables, false)!;
  [...parts, ...cables].forEach((g) => g.dispose());
  const poleMesh = new THREE.Mesh(poleGeo, wood);
  poleMesh.castShadow = true;
  const cableMesh = new THREE.Mesh(cableGeo, cable);
  poleMesh.frustumCulled = false;
  cableMesh.frustumCulled = false;
  return {
    objects: [poleMesh, cableMesh],
    dispose: () => {
      poleGeo.dispose();
      cableGeo.dispose();
      wood.dispose();
      cable.dispose();
    },
  };
}

/** Montes y cortinas de árboles lejanos: siluetas en planos, sin geometría pesada. */
function buildTreeLines(haze: HazeUniforms): { objects: THREE.Object3D[]; dispose: () => void } {
  const W = 2048;
  const H = 256;
  const [canvas, ctx] = makeCanvas(W, H);
  const rand = rng(77);
  ctx.clearRect(0, 0, W, H);
  // Copas superpuestas con alturas irregulares; algún eucalipto más alto.
  for (let pass = 0; pass < 3; pass++) {
    for (let x = -40; x < W + 40; x += 14 + rand() * 26) {
      const tall = rand() > 0.86;
      const r = (tall ? 34 : 22) + rand() * 26;
      const h = (tall ? 150 : 86) + rand() * 60 - pass * 14;
      const g = 52 + rand() * 30 - pass * 6;
      ctx.fillStyle = `rgb(${Math.round(g * 0.58)},${Math.round(g)},${Math.round(g * 0.42)})`;
      ctx.beginPath();
      ctx.ellipse(x, H - h * 0.55, r * (tall ? 0.7 : 1.15), h * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - r * 0.7, H - h * 0.4, r * 1.4, h * 0.4);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const mat = withHaze(new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.3, map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }), haze, 'trees');
  const geos: THREE.BufferGeometry[] = [];
  // [centro x, centro z, largo, alto, giro en Y, desplazamiento u]
  const strips: [number, number, number, number, number, number][] = [
    [140, -290, 420, 20, 0.06, 0.0],
    [-330, -230, 260, 17, 0.5, 0.31],
    [-110, 270, 340, 18, Math.PI - 0.1, 0.55],
    [300, 235, 230, 16, Math.PI + 0.45, 0.12],
    [470, -70, 220, 17, Math.PI / 2 + 0.2, 0.7],
    [-500, 50, 260, 19, -Math.PI / 2 - 0.15, 0.43],
    [-40, -520, 300, 22, 0.02, 0.2],
  ];
  for (const [cx, cz, len, h, rot, off] of strips) {
    const g = new THREE.PlaneGeometry(len, h, 28, 1);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      // El monte se achica hacia las puntas: nunca termina en un corte vertical.
      const taper = Math.min(1, Math.sin(Math.PI * u) * 2.6) ** 0.8;
      const y = pos.getY(i) + h / 2;
      pos.setY(i, y * Math.max(0.02, taper) - 0.3);
      uv.setX(i, off + (u * len) / 360);
    }
    g.rotateY(rot);
    g.translate(cx, 0, cz);
    geos.push(g);
  }
  const geo = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return {
    objects: [mesh],
    dispose: () => {
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}

export default function Exterior() {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  const built = useMemo(() => {
    const a = assets;
    if (!a) return null;
    const haze: HazeUniforms = { uHaze: { value: hazeColor() }, uHazeDist: { value: HAZE_DIST } };
    const macro = grayTexture(fbm(256, 99, 4, 5, 0.5), 256, 256);
    const group = new THREE.Group();
    group.name = 'exterior';

    const skyGeo = new THREE.SphereGeometry(800, 48, 24);
    const skyMat = makeSkyMaterial(a, haze);
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;

    const groundGeo = new THREE.CircleGeometry(WORLD_RADIUS, 72);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = makeGroundMaterial(a, macro, haze);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    ground.frustumCulled = false;

    const fence = buildFence(haze);
    const poles = buildPoles(haze);
    const trees = buildTreeLines(haze);
    group.add(sky, ground, ...fence.objects, ...poles.objects, ...trees.objects);

    // Sol: alineado con el HDRI, repone la energía del disco solar y proyecta sombras.
    const sun = new THREE.DirectionalLight('#fff0d4', SUN_INTENSITY);
    sun.position.copy(SUN_DIR).multiplyScalar(90).add(new THREE.Vector3(2, 0, 0));
    sun.target.position.set(2, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -18;
    cam.right = 18;
    cam.top = 13;
    cam.bottom = -13;
    cam.near = 20;
    cam.far = 170;
    cam.updateProjectionMatrix();
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 4;
    group.add(sun, sun.target);

    if (import.meta.env.DEV) (window as unknown as { __ext?: unknown }).__ext = { skyMat, groundMat, sun, haze, scene };

    return {
      group,
      env: a.env,
      dispose: () => {
        skyGeo.dispose();
        skyMat.dispose();
        groundGeo.dispose();
        groundMat.dispose();
        macro.dispose();
        fence.dispose();
        poles.dispose();
        trees.dispose();
        sun.shadow.map?.dispose();
        sun.dispose();
      },
    };
  }, [scene]);

  useLayoutEffect(() => {
    if (!built) return;
    const prev = { env: scene.environment, intensity: scene.environmentIntensity, rotation: scene.environmentRotation.clone() };
    scene.environment = built.env;
    scene.environmentIntensity = ENV_INTENSITY;
    scene.environmentRotation.set(0, 0, 0);
    invalidate();
    return () => {
      scene.environment = prev.env;
      scene.environmentIntensity = prev.intensity;
      scene.environmentRotation.copy(prev.rotation);
      built.dispose();
    };
  }, [built, scene, invalidate]);

  return built ? <primitive object={built.group} /> : null;
}
