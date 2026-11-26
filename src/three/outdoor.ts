/**
 * Piezas comunes de las escenas al aire libre (Exterior y Ruta): cielo HDR CC0 de
 * Poly Haven (1k para iluminar, 4k solo de fondo), sol alineado con el del HDR,
 * bruma por distancia del tono del horizonte y las texturas de suelo en KTX2.
 * Todo se descarga una sola vez y lo comparten las dos escenas.
 */
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { loadKtx } from './ktx';

const BASE = import.meta.env.BASE_URL;

/** Datos de public/assets/hdri/sky_info.json (cielo "sunflowers_puresky"). */
export const SUN_DIR = new THREE.Vector3(0.5903, 0.6821, 0.4316).normalize();
export const HORIZON_SRGB = '#b3bec0';

/** Eje de la ruta: el semi (centrado en z = 0) queda en el carril derecho, sentido +X. */
export const ROAD_Z = -1.825;
export const HALF_ROAD = 3.65;
export const SHOULDER = 2.3;
export const FENCE_OFFSET = 15.5;
export const WORLD_RADIUS = 760;

/** Intensidades calibradas para igualar la exposición del estudio (el postprocesado es global). */
export const ENV_INTENSITY = 0.5;
export const SUN_INTENSITY = 2.75;
export const HAZE_DIST = 560;

/**
 * El fondo es un JPG ya tonemapeado y la imagen pasa después por AgX +
 * contraste/saturación. Esta curva lo lleva a valores de escena que, tras ese
 * postprocesado, vuelven a verse como el original (y se queda por debajo del
 * umbral del bloom salvo en el disco del sol).
 */
export const TONE = { a: 0.86, b: 1.07, knee: 0.72, head: 0.36, sat: 1.3 };
export function invTone(v: number): number {
  const d = Math.min(v, 0.985);
  const x = (TONE.a * d) / (TONE.b - d);
  const over = Math.max(x - TONE.knee, 0);
  return Math.min(x, TONE.knee) + over / (1 + over / TONE.head);
}

export interface Assets {
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

export function outdoorAssets(): Assets | null {
  return assets;
}
let loading: Promise<void> | null = null;

/** Descarga y prepara todo lo que usa la escena, para que al mostrarla no haya parpadeo. */
export function preloadOutdoor(gl: THREE.WebGLRenderer): Promise<void> {
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

export function hazeColor(): THREE.Color {
  const c = new THREE.Color(HORIZON_SRGB); // ya en lineal (display)
  return new THREE.Color(invTone(c.r), invTone(c.g), invTone(c.b));
}

export interface HazeUniforms {
  uHaze: { value: THREE.Color };
  uHazeDist: { value: number };
}

export const HAZE_GLSL = `
  {
    float hazeD = length(vViewPosition);
    float hazeF = 1.0 - exp(-pow(hazeD / uHazeDist, 1.7));
    // Al borde del mundo la bruma es total: el suelo se funde con el cielo.
    hazeF = max(hazeF, smoothstep(500.0, 735.0, hazeD));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, clamp(hazeF, 0.0, 1.0));
  }`;

/** Perspectiva aérea: los objetos lejanos se funden con la bruma del horizonte. */
export function withHaze<T extends THREE.MeshStandardMaterial>(mat: T, u: HazeUniforms, key: string): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uHaze;\nuniform float uHazeDist;').replace('#include <fog_fragment>', HAZE_GLSL);
  };
  mat.customProgramCacheKey = () => `haze-${key}`;
  return mat;
}

export function makeSkyMaterial(a: Assets, haze: HazeUniforms): THREE.ShaderMaterial {
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


/** Sol (con sombra) + rebote del cielo (sin sombra): la misma firma de luces que el estudio. */
export function createSunLights(group: THREE.Group, target: [number, number, number] = [2, 0, 0], extent: [number, number] = [18, 13]): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight('#fff0d4', SUN_INTENSITY);
  sun.position.copy(SUN_DIR).multiplyScalar(90).add(new THREE.Vector3(...target));
  sun.target.position.set(...target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -extent[0];
  cam.right = extent[0];
  cam.top = extent[1];
  cam.bottom = -extent[1];
  cam.near = 20;
  cam.far = 170;
  cam.updateProjectionMatrix();
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 4;
  const fill = new THREE.DirectionalLight('#d6e2f2', 0.18);
  fill.position.set(-SUN_DIR.x * 60, 40, -SUN_DIR.z * 60);
  group.add(sun, sun.target, fill);
  return sun;
}
