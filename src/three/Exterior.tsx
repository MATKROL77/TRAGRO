/**
 * Escena "Exterior": predio de acopio / playa de carga a media tarde.
 *
 * - Piso de hormigón con juntas, manchas y rugosidad variable, sin patrón repetido visible
 *   (dos escalas de textura mezcladas + ruido de gran escala); más allá del predio, ripio y
 *   campo que se funden con la bruma.
 * - Rejilla de descarga en el piso, ubicada bajo las bocas de la tolva (se reacomoda sola
 *   cuando cambia el modelo, sin generar geometría).
 * - Silos de chapa ondulada con techo cónico, escalera y pasarela, y un galpón: 3D simple
 *   (no recortes planos), con la bruma de distancia.
 * - Mismo cielo HDR, sol y firma de luces que la ruta y el estudio (sin compilaciones al
 *   cambiar de escena).
 */
import { useEffect, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useStore } from '@/state/store';
import { tierSettings } from '@/render-kit/quality/tiers';
import { compileObject, renderOffscreen, uploadTextures } from '@/render-kit/precompile/compile';
import { whenIdle } from '@/render-kit/scheduling/idle';
import { corrugatedNormal, fbm, grayTexture } from './kit/tex';
import { ENV_INTENSITY, HAZE_DIST, HAZE_GLSL, WORLD_RADIUS, createSunLights, hazeColor, makeSkyMaterial, outdoorAssets, preloadOutdoor, withHaze, type Assets, type HazeUniforms } from './outdoor';
import { markSceneReady } from './sceneReady';
import { currentModel } from './TrailerObject';

/** Extensión del predio de hormigón (m). */
const YARD = { x0: -48, x1: 52, z0: -38, z1: 24 };

interface GrateUniforms {
  /** x0, x1, z0, z1 de la boca de la rejilla. */
  uGrate: { value: THREE.Vector4 };
}

/** Hormigón con juntas cada 5 m, manchas y rugosidad variable; afuera, ripio y campo. */
function makeYardGround(a: Assets, macro: THREE.Texture, haze: HazeUniforms, grate: GrateUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map: a.asphaltC, normalMap: a.asphaltN, roughnessMap: a.asphaltR, roughness: 1, metalness: 0 });
  const uniforms = { ...haze, ...grate, uFieldC: { value: a.fieldC }, uGravelC: { value: a.gravelC }, uGravelN: { value: a.gravelN }, uMacro: { value: macro }, uYard: { value: new THREE.Vector4(YARD.x0, YARD.x1, YARD.z0, YARD.z1) } };
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
        uniform vec3 uHaze; uniform float uHazeDist;
        uniform sampler2D uFieldC; uniform sampler2D uGravelC; uniform sampler2D uGravelN; uniform sampler2D uMacro;
        uniform vec4 uYard; uniform vec4 uGrate;
        float yIn; float yJoint; float yStain; float yPit; vec2 yUv;`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec2 xz = vGPos.xz;
          float n1 = texture2D(uMacro, xz / 37.0).r;
          float n2 = texture2D(uMacro, xz / 9.0 + 0.3).r;
          float n3 = texture2D(uMacro, xz / 2.2 + 0.7).r;
          // Borde irregular del predio.
          vec2 dIn = min(xz - uYard.xz, uYard.yw - xz) + (n1 - 0.5) * 2.0;
          yIn = smoothstep(-0.2, 0.6, min(dIn.x, dIn.y));
          // Hormigón: árido fino (dos escalas del asfalto, aclarado y desaturado) + variación grande.
          yUv = xz / 2.6;
          vec3 ag = mix(texture2D(map, yUv).rgb, texture2D(map, xz.yx / 6.6 + 0.4).rgb, 0.45);
          float l = dot(ag, vec3(0.3, 0.59, 0.11));
          vec3 conc = vec3(0.47, 0.46, 0.43) * mix(0.82, 1.08, l * 1.6) * mix(0.88, 1.06, n1) * mix(0.95, 1.03, n2);
          // Juntas de dilatación cada 5 m (aserradas, oscuras y finas).
          vec2 g = abs(fract(xz / 5.0 + 0.5) - 0.5) * 5.0;
          float aa = fwidth(xz.x) + fwidth(xz.y) + 0.002;
          yJoint = 1.0 - smoothstep(0.008, 0.008 + aa, min(g.x, g.y));
          conc *= 1.0 - 0.55 * yJoint;
          // Manchas de aceite y de humedad (sin patrón repetido: ruido de gran escala).
          yStain = smoothstep(0.62, 0.78, n1 * 0.6 + n2 * 0.4) * 0.45 + smoothstep(0.7, 0.85, n3) * 0.12;
          conc *= 1.0 - yStain * 0.5;
          // Afuera del predio: ripio y pasto seco, fundidos con la bruma.
          vec3 grav = texture2D(uGravelC, xz / 2.4).rgb * 0.72;
          vec3 field = texture2D(uFieldC, xz / 2.5).rgb * vec3(1.0, 0.88, 0.62) * 0.78;
          float far = smoothstep(4.0, 22.0, -min(dIn.x, dIn.y));
          vec3 outside = mix(grav, field, far);
          vec3 col = mix(outside, conc, yIn);
          // Boca de la rejilla: fosa oscura bajo las barras.
          vec2 pd = min(xz - uGrate.xz, uGrate.yw - xz);
          yPit = step(0.0, min(pd.x, pd.y));
          col = mix(col, vec3(0.025, 0.024, 0.022), yPit);
          diffuseColor.rgb *= col;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
        {
          float rC = 0.78 + (texture2D(roughnessMap, yUv).g - 0.5) * 0.25 - yStain * 0.35;
          roughnessFactor = clamp(mix(0.95, rC, yIn), 0.2, 1.0);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
          vec3 nA = texture2D(normalMap, yUv).xyz * 2.0 - 1.0;
          vec3 nG = texture2D(uGravelN, vGPos.xz / 2.4).xyz * 2.0 - 1.0;
          vec3 nm = mix(nG * vec3(1.1, 1.1, 1.0), nA * vec3(0.35, 0.35, 1.0), yIn);
          nm.xy *= 1.0 - smoothstep(20.0, 90.0, length(vViewPosition));
          vec3 wn = normalize(vec3(nm.x, max(nm.z, 0.2), nm.y));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`,
      )
      .replace('#include <fog_fragment>', HAZE_GLSL);
  };
  mat.customProgramCacheKey = () => 'ground-predio-v1';
  return mat;
}

/** Barras de la rejilla: un módulo de 1 m instanciado a lo largo de la boca. */
function buildGrate(): { mesh: THREE.InstancedMesh; place: (x0: number, x1: number) => void } {
  const bars: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) bars.push(new THREE.BoxGeometry(0.025, 0.05, 1.5).translate(-0.5 + (i + 0.5) / 12, -0.02, 0));
  bars.push(new THREE.BoxGeometry(1, 0.05, 0.04).translate(0, -0.03, 0.72), new THREE.BoxGeometry(1, 0.05, 0.04).translate(0, -0.03, -0.72));
  const geo = mergeGeometries(bars, false)!;
  bars.forEach((b) => b.dispose());
  const mat = new THREE.MeshStandardMaterial({ color: '#3a3b3c', roughness: 0.55, metalness: 0.9 });
  const MAX = 16;
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const m = new THREE.Matrix4();
  const place = (x0: number, x1: number) => {
    const n = Math.min(MAX, Math.max(1, Math.ceil(x1 - x0)));
    const step = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      m.makeScale(step, 1, 1).setPosition(x0 + step * (i + 0.5), 0, 0);
      mesh.setMatrixAt(i, m);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  };
  place(-3, 3);
  return { mesh, place };
}

/** Silos de chapa ondulada con techo cónico, escalera y pasarela superior; galpón con techo a dos aguas. */
function buildBuildings(haze: HazeUniforms): THREE.Object3D[] {
  const corr = corrugatedNormal();
  const silo = withHaze(new THREE.MeshStandardMaterial({ color: '#c4c8cb', roughness: 0.4, metalness: 0.85, normalMap: corr, normalScale: new THREE.Vector2(0.6, 0.6) }), haze, 'silo');
  silo.normalMap!.wrapS = silo.normalMap!.wrapT = THREE.RepeatWrapping;
  const roofMat = withHaze(new THREE.MeshStandardMaterial({ color: '#b5babd', roughness: 0.35, metalness: 0.9 }), haze, 'silo-techo');
  const steel = withHaze(new THREE.MeshStandardMaterial({ color: '#8a8f93', roughness: 0.5, metalness: 0.8 }), haze, 'acero');
  const concrete = withHaze(new THREE.MeshStandardMaterial({ color: '#a8a49c', roughness: 0.9 }), haze, 'base');
  const shedWall = withHaze(new THREE.MeshStandardMaterial({ color: '#d9dbd8', roughness: 0.45, metalness: 0.6, normalMap: corr, normalScale: new THREE.Vector2(0.5, 0.5) }), haze, 'galpon');
  const walls: THREE.BufferGeometry[] = [];
  const shed: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  const steels: THREE.BufferGeometry[] = [];
  const bases: THREE.BufferGeometry[] = [];
  const R = 4.6;
  const H = 13;
  const z = -52;
  for (const x of [-30, -19.5, -9, 1.5]) {
    const body = new THREE.CylinderGeometry(R, R, H, 40, 1, true);
    // UV de la chapa: una onda cada ~7,6 cm a lo alto.
    const uv = body.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 18, uv.getY(i) * (H / 0.6));
    body.translate(x, H / 2 + 0.6, z);
    walls.push(body);
    const roof = new THREE.ConeGeometry(R + 0.15, 3.2, 40, 1);
    roof.translate(x, H + 0.6 + 1.6, z);
    roofs.push(roof);
    bases.push(new THREE.CylinderGeometry(R + 0.35, R + 0.45, 0.6, 32).translate(x, 0.3, z));
    // Escalera de jaula y anillo de pasarela.
    for (const dy of [0, 1, 2]) steels.push(new THREE.TorusGeometry(R + 0.06, 0.03, 4, 40).rotateX(Math.PI / 2).translate(x, 0.6 + H * (0.33 + dy * 0.33), z));
    steels.push(new THREE.BoxGeometry(0.05, H + 3, 0.05).translate(x + 0.35, (H + 3) / 2, z + R + 0.25), new THREE.BoxGeometry(0.05, H + 3, 0.05).translate(x - 0.35, (H + 3) / 2, z + R + 0.25));
    for (let y = 0.9; y < H + 3; y += 0.3) steels.push(new THREE.BoxGeometry(0.7, 0.025, 0.025).translate(x, y, z + R + 0.25));
  }
  // Pasarela sobre los silos y torre de elevación.
  steels.push(new THREE.BoxGeometry(36, 0.4, 1.1).translate(-14.25, H + 4.4, z));
  steels.push(new THREE.BoxGeometry(1.6, H + 7, 1.6).translate(8.5, (H + 7) / 2, z + 1.5));
  // Galpón: paredes de chapa, techo a dos aguas, frente abierto.
  const sw = 24;
  const sd = 13;
  const sh = 7.5;
  const sx = 36;
  const sz = -44;
  shed.push(new THREE.BoxGeometry(sw, sh, 0.15).translate(sx, sh / 2, sz - sd / 2));
  shed.push(new THREE.BoxGeometry(0.15, sh, sd).translate(sx - sw / 2, sh / 2, sz), new THREE.BoxGeometry(0.15, sh, sd).translate(sx + sw / 2, sh / 2, sz));
  for (const s of [1, -1]) {
    const r = new THREE.BoxGeometry(sw + 0.6, 0.12, sd / 2 / Math.cos(0.26) + 0.4);
    r.rotateX(s * 0.26);
    r.translate(sx, sh + Math.tan(0.26) * (sd / 4), sz + (s * sd) / 4);
    roofs.push(r);
  }
  for (let x = sx - sw / 2; x <= sx + sw / 2 + 0.01; x += 6) steels.push(new THREE.BoxGeometry(0.25, sh, 0.25).translate(x, sh / 2, sz + sd / 2));
  const mk = (geos: THREE.BufferGeometry[], m: THREE.Material, shadow = true) => {
    const g = mergeGeometries(geos, false)!;
    geos.forEach((x) => x.dispose());
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    return mesh;
  };
  return [mk(walls, silo), mk(shed, shedWall), mk(roofs, roofMat), mk(steels, steel), mk(bases, concrete)];
}

interface Built {
  group: THREE.Group;
  env: THREE.Texture;
  sun: THREE.DirectionalLight;
  grate: ReturnType<typeof buildGrate>;
  grateU: GrateUniforms;
}

let built: Built | null = null;
let preparing: Promise<Built> | null = null;

function buildYard(a: Assets): Built {
  const haze: HazeUniforms = { uHaze: { value: hazeColor() }, uHazeDist: { value: HAZE_DIST } };
  const macro = grayTexture(fbm(256, 123, 4, 5, 0.5), 256, 256);
  const group = new THREE.Group();
  group.name = 'exterior';
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), makeSkyMaterial(a, haze));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  const grateU: GrateUniforms = { uGrate: { value: new THREE.Vector4(-3, 3, -0.7, 0.7) } };
  const groundGeo = new THREE.CircleGeometry(WORLD_RADIUS, 72);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, makeYardGround(a, macro, haze, grateU));
  ground.receiveShadow = true;
  ground.frustumCulled = false;
  const grate = buildGrate();
  group.add(sky, ground, grate.mesh, ...buildBuildings(haze));
  const sun = createSunLights(group, [2, 0, 0], [18, 13]);
  group.visible = false;
  return { group, env: a.env, sun, grate, grateU };
}

export function prepareExterior(gl: THREE.WebGLRenderer, camera: THREE.Camera): Promise<Built> {
  if (built) return Promise.resolve(built);
  if (!preparing) {
    preparing = (async () => {
      await preloadOutdoor(gl);
      await whenIdle(1500);
      const b = buildYard(outdoorAssets()!);
      await whenIdle(1500);
      uploadTextures(gl, b.group, [b.env]);
      await whenIdle(1500);
      // Con las luces y el entorno de la propia escena (no las del estudio, que también están montadas).
      const own = new THREE.Scene();
      own.environment = b.env;
      await compileObject(gl, camera, own, b.group);
      await whenIdle(1500);
      // Un cuadro oculto: compila también los shaders de sombra de la escena.
      renderOffscreen(gl, b.group, camera);
      built = b;
      markSceneReady('exterior');
      return b;
    })();
    preparing.catch(() => {
      preparing = null;
    });
  }
  return preparing;
}

export function isExteriorReady(): boolean {
  return !!built;
}

/** La escena queda montada una vez armada: mostrarla u ocultarla no regenera nada. */
export default function Exterior({ visible }: { visible: boolean }) {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const b = built;

  // Mapa de sombras del sol según el nivel de calidad.
  const shadowSize = useStore((st) => tierSettings(st.ui.calidad).shadowMapSize);
  useLayoutEffect(() => {
    if (!b || b.sun.shadow.mapSize.x === shadowSize) return;
    b.sun.shadow.mapSize.set(shadowSize, shadowSize);
    b.sun.shadow.map?.dispose();
    b.sun.shadow.map = null;
    invalidate();
  }, [b, shadowSize, invalidate]);

  // La rejilla va debajo de las bocas de la tolva (o detrás, centrada, para los otros tipos).
  const version = useStore((s) => s.modelVersion);
  useEffect(() => {
    if (!b) return;
    const m = currentModel.value;
    const xs = m?.grain.map((g) => g.x) ?? [];
    const [x0, x1] = xs.length ? [Math.min(...xs) - 0.65, Math.max(...xs) + 0.65] : [-2.5, 2.5];
    b.grate.place(x0, x1);
    b.grateU.uGrate.value.set(x0, x1, -0.7, 0.7);
    invalidate();
  }, [b, version, invalidate]);

  useLayoutEffect(() => {
    if (!b) return;
    b.group.visible = visible;
    if (!visible) {
      invalidate();
      return;
    }
    const prev = { env: scene.environment, intensity: scene.environmentIntensity, rotation: scene.environmentRotation.clone() };
    scene.environment = b.env;
    scene.environmentIntensity = ENV_INTENSITY;
    scene.environmentRotation.set(0, 0, 0);
    invalidate();
    return () => {
      scene.environment = prev.env;
      scene.environmentIntensity = prev.intensity;
      scene.environmentRotation.copy(prev.rotation);
      invalidate();
    };
  }, [b, visible, scene, invalidate]);

  return b ? <primitive object={b.group} /> : null;
}
