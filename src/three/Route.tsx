/**
 * Escena "Ruta": ruta argentina de dos carriles en zona de campo, con el camión
 * circulando. El camión queda cerca del origen y se mueve el mundo (sin errores de
 * precisión): el suelo (asfalto, banquina, campo, demarcación) se dibuja en el shader
 * siguiendo una curva suave y periódica, y alambrado, postes, cultivo y árboles se
 * reciclan en la GPU (render-kit/vehicle/roadInstancing). Mojón y cartel se reubican
 * desde la CPU una vez por vuelta. Cielo CC0 (Poly Haven) y sol con sombras.
 */
import { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, grayTexture, makeCanvas, rng, speedSign } from './kit/tex';
import { ENV_INTENSITY, FENCE_OFFSET, HALF_ROAD, HAZE_DIST, HAZE_GLSL, SHOULDER, WORLD_RADIUS, createSunLights, hazeColor, makeSkyMaterial, outdoorAssets, preloadOutdoor, withHaze, type Assets, type HazeUniforms } from './outdoor';
import { RoadPath } from '@/render-kit/vehicle/road';
import { roadFollow, roadInstances, type RoadItem } from '@/render-kit/vehicle/roadInstancing';
import { patchMaterial } from '@/render-kit/materials/patch';

import { compileObject, renderOffscreen, uploadTextures } from '@/render-kit/precompile/compile';
import { whenIdle } from '@/render-kit/scheduling/idle';
import { markSceneReady } from './sceneReady';
import { useStore } from '@/state/store';
import { tierSettings } from '@/render-kit/quality/tiers';

/** Recorrido de la ruta (compartido con el controlador del camión). */
export const ROAD = new RoadPath();

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
    uRoad: { value: new THREE.Vector4(0, HALF_ROAD, SHOULDER, FENCE_OFFSET) },
    ...routeUniforms,
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
        uniform vec2 uTravel;
        ${ROAD.glsl()}
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
          // Coordenadas del mundo: el suelo viaja con el camión (que queda en el origen).
          vec2 xz = vGPos.xz + uTravel;
          float dz = (xz.y - roadZ(xz.x)) * inversesqrt(1.0 + roadDZ(xz.x) * roadDZ(xz.x));
          float adz = abs(dz);
          float n1 = texture2D(uMacro, xz / 60.0).r;
          float n2 = texture2D(uMacro, xz / 10.0 + 0.37).r;
          float n3 = texture2D(uMacro, xz / 1.6 + 0.11).r;
          float n4 = texture2D(uMacro, xz / 0.4 + 0.53).r;

          // Bordes irregulares: el asfalto se desgrana y el pasto invade la banquina.
          float edge = uRoad.y + (n2 - 0.5) * 0.16 + (n3 - 0.5) * 0.06;
          gwAsph = 1.0 - smoothstep(edge - 0.03, edge + 0.07, adz);
          float sEnd = uRoad.y + uRoad.z + (n1 - 0.5) * 1.5 + (n2 - 0.5) * 0.8;
          gwGrav = (1.0 - gwAsph) * (1.0 - smoothstep(sEnd - 0.55, sEnd + 0.75, adz));
          gwGrass = max(0.0, 1.0 - gwAsph - gwGrav);

          // Escalas que dividen al período del recorrido (1200 m): el enrollado no se nota.
          gUvA = xz / 3.0;
          gUvG = xz / 2.4;
          gUvF = xz / 2.5;
          // Dos escalas por textura: rompe el mosaico sin costo de geometría.
          vec3 cA = mix(texture2D(map, gUvA).rgb, texture2D(map, xz.yx / 8.0 + 0.21).rgb, 0.45);
          vec3 cG = mix(texture2D(uGravelC, gUvG).rgb, texture2D(uGravelC, xz.yx / 6.0 + 0.4).rgb, 0.4);
          vec3 cF = mix(texture2D(uFieldC, gUvF).rgb, texture2D(uFieldC, xz.yx / 12.0 + 0.63).rgb, 0.32);

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
          vec2 lot = floor((vec2(xz.x, dz) + vec2(60.0, 0.0)) / vec2(240.0, 170.0) + vec2(0.0, step(0.0, dz) * 7.0));
          float hsh = fract(sin(dot(lot, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 tint = hsh < 0.38 ? vec3(0.66, 0.8, 0.44) : hsh < 0.66 ? vec3(1.22, 1.02, 0.66) : hsh < 0.86 ? vec3(0.86, 0.94, 0.52) : vec3(1.02, 0.88, 0.58);
          float rows = hsh < 0.38 ? 1.0 : 0.0;
          float furrow = 1.0 - 0.16 * rows * (0.5 + 0.5 * sin(dz * 12.08)) * (1.0 - smoothstep(18.0, 75.0, dist));
          vec3 crop = cF * tint * furrow * mix(0.9, 1.08, n1);
          float beyond = smoothstep(uRoad.w - 0.5, uRoad.w + 0.7, adz);
          cF = mix(road, crop, beyond);
          // El postprocesado sube saturación y contraste: el pasto se apaga un poco para que no quede fluorescente.
          cF = mix(vec3(dot(cF, vec3(0.3, 0.59, 0.11))), cF, 0.66) * 0.82;

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
  mat.customProgramCacheKey = () => 'ground-ruta-v2';
  return mat;
}

/** Alambrado de campo a ambos lados: postes cada 12 m, varillas cada 2,4 m e hilos. Sigue la curva. */
function buildFence(haze: HazeUniforms): THREE.Object3D[] {
  const wood = withHaze(new THREE.MeshStandardMaterial({ color: '#5f5346', roughness: 0.95 }), haze, 'wood');
  const wire = withHaze(new THREE.MeshStandardMaterial({ color: '#7d7f80', roughness: 0.6, metalness: 0.6 }), haze, 'wire');
  const rodWood = wood.clone();
  const postGeo = new THREE.CylinderGeometry(0.055, 0.065, 1.45, 7);
  postGeo.translate(0, 0.72, 0);
  const rodGeo = new THREE.BoxGeometry(0.035, 1.12, 0.03);
  rodGeo.translate(0, 0.66, 0);
  // Tramo de hilos de 12 m (cinco hilos), de poste a poste.
  const wires: THREE.BufferGeometry[] = [];
  for (const y of [0.28, 0.5, 0.72, 0.94, 1.16]) {
    const g = new THREE.BoxGeometry(12, 0.011, 0.011);
    g.translate(6, y, 0.06);
    wires.push(g);
  }
  const wireGeo = mergeGeometries(wires, false)!;
  wires.forEach((g) => g.dispose());
  const rand = rng(9);
  const posts: RoadItem[] = [];
  const rods: RoadItem[] = [];
  const spans: RoadItem[] = [];
  for (const side of [1, -1]) {
    const lat = side * FENCE_OFFSET;
    for (let u = 0; u < 600; u += 12) {
      posts.push({ u, lateral: lat + (rand() - 0.5) * 0.05, yaw: (rand() - 0.5) * 0.05 });
      spans.push({ u, lateral: lat });
      for (let k = 1; k < 5; k++) rods.push({ u: u + k * 2.4, lateral: lat });
    }
  }
  const mk = (geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, items: RoadItem[], win: [number, number], key: string, shadow: boolean) => {
    const { material, depth } = roadFollow(mat, ROAD, routeUniforms, win, key);
    const m = new THREE.Mesh(roadInstances(geo, items), material);
    m.frustumCulled = false;
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.customDepthMaterial = depth;
    return m;
  };
  return [mk(postGeo, wood, posts, [-300, 600], 'post', true), mk(rodGeo, rodWood, rods.filter((r) => r.u < 300), [-150, 300], 'rod', true), mk(wireGeo, wire, spans, [-300, 600], 'wire', false)];
}

/** Línea de postes de madera con cruceta y cables (un vano cada 60 m), del lado izquierdo, lejos. */
function buildPoles(haze: HazeUniforms): THREE.Object3D[] {
  const wood = withHaze(new THREE.MeshStandardMaterial({ color: '#4d4338', roughness: 0.95 }), haze, 'pole');
  const cable = withHaze(new THREE.MeshStandardMaterial({ color: '#4a4c4e', roughness: 0.7 }), haze, 'cable');
  const SPAN = 60;
  const H = 8.6;
  const parts: THREE.BufferGeometry[] = [];
  const pole = new THREE.CylinderGeometry(0.085, 0.12, H, 8);
  pole.translate(0, H / 2, 0);
  const arm = new THREE.BoxGeometry(0.1, 0.1, 1.7);
  arm.translate(0, H - 0.45, 0);
  parts.push(pole, arm);
  for (const dz of [-0.75, 0, 0.75]) {
    const ins = new THREE.CylinderGeometry(0.035, 0.045, 0.14, 6);
    ins.translate(0, H - 0.33, dz);
    parts.push(ins);
  }
  // Cables del vano con flecha (catenaria aproximada en 6 tramos).
  const cables: THREE.BufferGeometry[] = [];
  const q = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  for (const dz of [-0.75, 0.75]) {
    for (let k = 0; k < 6; k++) {
      const t0 = k / 6;
      const t1 = (k + 1) / 6;
      const p0 = new THREE.Vector3(SPAN * t0, H - 0.26 - 0.9 * 4 * t0 * (1 - t0), dz);
      const p1 = new THREE.Vector3(SPAN * t1, H - 0.26 - 0.9 * 4 * t1 * (1 - t1), dz);
      const dir = p1.clone().sub(p0);
      const g = new THREE.CylinderGeometry(0.028, 0.028, dir.length(), 4, 1, true);
      q.setFromUnitVectors(up, dir.normalize());
      m4.compose(p0.add(p1).multiplyScalar(0.5), q, one);
      g.applyMatrix4(m4);
      cables.push(g);
    }
  }
  const poleGeo = mergeGeometries(parts, false)!;
  const cableGeo = mergeGeometries(cables, false)!;
  [...parts, ...cables].forEach((g) => g.dispose());
  const items: RoadItem[] = [];
  for (let u = 0; u < 1200; u += SPAN) items.push({ u, lateral: -46 });
  const w = roadFollow(wood, ROAD, routeUniforms, [-600, 1200], 'pole');
  const c = roadFollow(cable, ROAD, routeUniforms, [-600, 1200], 'cable');
  const poleMesh = new THREE.Mesh(roadInstances(poleGeo, items), w.material);
  poleMesh.castShadow = true;
  poleMesh.customDepthMaterial = w.depth;
  const cableMesh = new THREE.Mesh(roadInstances(cableGeo, items), c.material);
  for (const o of [poleMesh, cableMesh]) o.frustumCulled = false;
  return [poleMesh, cableMesh];
}

/** Cultivo junto al alambrado (soja en hileras o rastrojo), con densidad según la calidad. */
function buildCrops(haze: HazeUniforms, density: number): THREE.Object3D[] {
  const rand = rng(31);
  // Mata de soja: tres "hojas" (octaedros achatados) en una sola geometría liviana.
  const leaves: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.OctahedronGeometry(0.14, 0);
    g.scale(1, 0.6, 1);
    g.translate((rand() - 0.5) * 0.12, 0.16 + k * 0.06, (rand() - 0.5) * 0.12);
    leaves.push(g);
  }
  const plant = mergeGeometries(leaves, false)!;
  leaves.forEach((g) => g.dispose());
  const green = withHaze(new THREE.MeshStandardMaterial({ color: '#56702c', roughness: 0.85 }), haze, 'soja');
  const stubble = withHaze(new THREE.MeshStandardMaterial({ color: '#a8935c', roughness: 0.95 }), haze, 'rastrojo');
  const stubbleGeo = new THREE.ConeGeometry(0.05, 0.28, 4, 1, true);
  stubbleGeo.translate(0, 0.14, 0);
  const n = Math.round(7000 * density);
  const soy: RoadItem[] = [];
  const stub: RoadItem[] = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    // A la derecha soja en hileras (cada 0,52 m), a la izquierda rastrojo disperso.
    if (side > 0) {
      // Hileras cada 0,52 m, más tupidas cerca del alambrado (lejos se lee como textura del suelo).
      const row = Math.floor(Math.pow(rand(), 1.6) * 40);
      soy.push({ u: rand() * 300, lateral: FENCE_OFFSET + 1.0 + row * 0.52, yaw: rand() * 6.28, scale: 0.85 + rand() * 0.4 });
    } else {
      stub.push({ u: rand() * 300, lateral: -(FENCE_OFFSET + 1 + rand() * 32), yaw: rand() * 6.28, scale: 0.7 + rand() * 0.6 });
    }
  }
  const a = roadFollow(green, ROAD, routeUniforms, [-100, 300], 'soja');
  const b = roadFollow(stubble, ROAD, routeUniforms, [-100, 300], 'rastrojo');
  const soyMesh = new THREE.Mesh(roadInstances(plant, soy), a.material);
  const stubMesh = new THREE.Mesh(roadInstances(stubbleGeo, stub), b.material);
  for (const o of [soyMesh, stubMesh]) {
    o.frustumCulled = false;
    o.receiveShadow = true;
  }
  return [soyMesh, stubMesh];
}

/** Mojón kilométrico (hormigón blanco con número) y cartel de velocidad máxima, en 3D. */
function buildRoadside(haze: HazeUniforms): { objects: THREE.Object3D[]; setKm: (km: number) => void; marker: THREE.Group; sign: THREE.Group } {
  const [canvas, ctx] = makeCanvas(256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (km: number) => {
    ctx.fillStyle = '#f2f0ea';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#1d1d1d';
    ctx.textAlign = 'center';
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText('KM', 128, 92);
    ctx.font = 'bold 92px sans-serif';
    ctx.fillText(String(km), 128, 196);
    tex.needsUpdate = true;
  };
  draw(214);
  const concrete = withHaze(new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.85 }), haze, 'mojon');
  const face = withHaze(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), haze, 'mojon-cara');
  const marker = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.42).translate(0, 0.45, 0), concrete);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.18, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0.9, 0), concrete);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4).rotateY(-Math.PI / 2).translate(-0.091, 0.58, 0), face);
  marker.add(body, cap, plate);
  // Cartel: poste galvanizado y disco de velocidad máxima 80.
  const steel = withHaze(new THREE.MeshStandardMaterial({ color: '#a9aeb2', roughness: 0.45, metalness: 1 }), haze, 'cartel-poste');
  const signFace = withHaze(new THREE.MeshStandardMaterial({ map: speedSign(), roughness: 0.5, transparent: true, alphaTest: 0.5 }), haze, 'cartel-cara');
  const back = withHaze(new THREE.MeshStandardMaterial({ color: '#8d9296', roughness: 0.6, metalness: 0.8 }), haze, 'cartel-dorso');
  const sign = new THREE.Group();
  sign.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 10).translate(0, 1.3, 0), steel));
  sign.add(new THREE.Mesh(new THREE.CircleGeometry(0.45, 32).rotateY(-Math.PI / 2).translate(-0.03, 2.25, 0), signFace));
  sign.add(new THREE.Mesh(new THREE.CircleGeometry(0.46, 32).rotateY(Math.PI / 2).translate(-0.025, 2.25, 0), back));
  for (const g of [marker, sign]) g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return { objects: [marker, sign], setKm: draw, marker, sign };
}

/** Montes y cortinas de árboles lejanos: siluetas en planos, sin geometría pesada. */
function buildTreeLines(haze: HazeUniforms): { objects: THREE.Object3D[]; uniforms: { uTreeShift: { value: THREE.Vector2 } } } {
  const W = 2048;
  const H = 256;
  const [canvas, ctx] = makeCanvas(W, H);
  const rand = rng(77);
  ctx.clearRect(0, 0, W, H);
  // Montes aislados: copas chicas e irregulares, claros entre grupos y algún eucalipto más alto.
  for (let pass = 0; pass < 3; pass++) {
    let x = -40;
    while (x < W + 40) {
      // Cada tanto, un claro: el monte no es una pared continua.
      if (rand() > 0.9) x += 50 + rand() * 130;
      const tall = rand() > 0.82;
      const r = (tall ? 11 : 9) + rand() * 13;
      const h = (tall ? 132 : 62) + rand() * 58 - pass * 10;
      const g = 40 + rand() * 26 - pass * 5;
      ctx.fillStyle = `rgb(${Math.round(g * 0.6)},${Math.round(g)},${Math.round(g * 0.46)})`;
      // Copa formada por varios lóbulos para que el contorno no sea un óvalo liso.
      for (let k = 0; k < 5; k++) {
        const ox = (rand() - 0.5) * r * 1.3;
        const oy = (rand() - 0.5) * h * 0.34;
        ctx.beginPath();
        ctx.ellipse(x + ox, H - h * 0.62 + oy, r * (0.55 + rand() * 0.5), h * (0.2 + rand() * 0.16), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillRect(x - 2.5, H - h * 0.55, 5, h * 0.55);
      ctx.fillRect(x - r * 0.55, H - h * 0.3, r * 1.1, h * 0.3);
      x += 9 + rand() * 17;
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
    [160, -330, 300, 15, 0.06, 0.0],
    [-340, -260, 200, 13, 0.5, 0.31],
    [-120, 310, 260, 14, Math.PI - 0.1, 0.55],
    [320, 270, 180, 13, Math.PI + 0.45, 0.12],
    [500, -80, 170, 13, Math.PI / 2 + 0.2, 0.7],
    [-540, 60, 200, 14, -Math.PI / 2 - 0.15, 0.43],
    [-40, -560, 240, 16, 0.02, 0.2],
  ];
  for (const [cx, cz, len, h, rot, off] of strips) {
    const g = new THREE.PlaneGeometry(len, h, 28, 1);
    // Centro del monte: el shader lo recicla (módulo 1500 m) a medida que avanza el camión.
    g.setAttribute('aStrip', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2).map((_, i) => (i % 2 === 0 ? cx : cz)), 2));
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
  const uniforms = { uTreeShift: { value: new THREE.Vector2() } };
  patchMaterial(mat, 'trees-wrap', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aStrip;\nuniform vec2 uTreeShift;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float cx = mod(aStrip.x - uTreeShift.x + 750.0, 1500.0) - 750.0;
          transformed.x += cx - aStrip.x;
          transformed.z -= uTreeShift.y;
        }`,
      );
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { objects: [mesh], uniforms };
}

interface Built {
  group: THREE.Group;
  env: THREE.Texture;
  sun: THREE.DirectionalLight;
  trees: { uTreeShift: { value: THREE.Vector2 } };
  roadside: ReturnType<typeof buildRoadside>;
}

/** El camión queda en el origen y se mueve el mundo: estos uniforms llevan el recorrido. */
export const routeUniforms = { uTravel: { value: new THREE.Vector2(0, ROAD.z(0)) } };

let built: Built | null = null;
let preparing: Promise<Built> | null = null;

function buildRoute(a: Assets, vegetation: number): Built {
  const haze: HazeUniforms = { uHaze: { value: hazeColor() }, uHazeDist: { value: HAZE_DIST } };
  const macro = grayTexture(fbm(256, 99, 4, 5, 0.5), 256, 256);
  const group = new THREE.Group();
  group.name = 'ruta';

  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), makeSkyMaterial(a, haze));
  sky.renderOrder = -10;
  sky.frustumCulled = false;

  const groundGeo = new THREE.CircleGeometry(WORLD_RADIUS, 72);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, makeGroundMaterial(a, macro, haze));
  ground.receiveShadow = true;
  ground.frustumCulled = false;

  const trees = buildTreeLines(haze);
  const roadside = buildRoadside(haze);
  group.add(sky, ground, ...buildFence(haze), ...buildPoles(haze), ...buildCrops(haze, vegetation), ...trees.objects, ...roadside.objects);
  // Sombras ajustadas al conjunto (18 m) alrededor del origen, donde siempre está el camión.
  const sun = createSunLights(group, [4, 0, 1.8], [16, 11]);
  group.visible = false;
  return { group, env: a.env, sun, trees: trees.uniforms, roadside };
}

/** Acceso para el controlador del camión (mueve el mundo, cartel y mojón). */
export function routeScene(): Built | null {
  return built;
}

export function prepareRoute(gl: THREE.WebGLRenderer, camera: THREE.Camera, vegetation = 1): Promise<Built> {
  if (built) return Promise.resolve(built);
  if (!preparing) {
    preparing = (async () => {
      await preloadOutdoor(gl);
      await whenIdle(1500);
      const b = buildRoute(outdoorAssets()!, vegetation);
      await whenIdle(1500);
      uploadTextures(gl, b.group, [b.env]);
      await whenIdle(1500);
      const own = new THREE.Scene();
      own.environment = b.env;
      await compileObject(gl, camera, own, b.group);
      await whenIdle(1500);
      renderOffscreen(gl, b.group, camera);
      built = b;
      markSceneReady('ruta');
      return b;
    })();
    preparing.catch(() => {
      preparing = null;
    });
  }
  return preparing;
}

export function isRouteReady(): boolean {
  return !!built;
}

/** La escena queda montada una vez armada: mostrarla u ocultarla no regenera nada. */
export default function Route({ visible }: { visible: boolean }) {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const b = built;
  const shadowSize = useStore((st) => tierSettings(st.ui.calidad).shadowMapSize);
  useLayoutEffect(() => {
    if (!b || b.sun.shadow.mapSize.x === shadowSize) return;
    b.sun.shadow.mapSize.set(shadowSize, shadowSize);
    b.sun.shadow.map?.dispose();
    b.sun.shadow.map = null;
    invalidate();
  }, [b, shadowSize, invalidate]);

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
