/**
 * Ruedas: neumático, llanta con agujeros de ventilación, maza y tuercas.
 * Las geometrías se generan una vez y se dibujan con InstancedMesh.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialSet } from '../materials';

export interface WheelGeometry {
  tire: THREE.BufferGeometry;
  rim: THREE.BufferGeometry;
  hub: THREE.BufferGeometry;
  nuts: THREE.BufferGeometry;
  radius: number;
  width: number;
  /** Posición axial del plano de apoyo del disco (respecto del centro de la rueda). */
  mount: number;
}

const cache = new Map<string, WheelGeometry>();

/** Nivel de detalle: alto (≈6 k triángulos por rueda) y bajo, para lejos (≈1,7 k, sin tuercas). */
export type WheelDetail = 'high' | 'low';
const LOD = {
  high: { tireSeg: 52, tireN: 26, barrel: 48, discR: 10, discT: 9, hub: 28 },
  low: { tireSeg: 24, tireN: 12, barrel: 24, discR: 5, discT: 5, hub: 14 },
};
let lod = LOD.high;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function tireGeometry(R: number, w: number): THREE.BufferGeometry {
  const N = lod.tireN;
  const seg = lod.tireSeg;
  const Rb = 0.292;
  const h = w / 2;
  // [radio, posición axial, v] — un flanco, banda, otro flanco.
  const half: [number, number, number][] = [
    [Rb, -h + 0.04, 0.0],
    [Rb + 0.006, -h + 0.016, 0.055],
    [Rb + 0.05, -h - 0.002, 0.11],
    [R - 0.115, -h - 0.011, 0.19],
    [R - 0.058, -h - 0.002, 0.26],
    [R - 0.026, -h + 0.012, 0.3],
    [R - 0.007, -h + 0.034, 0.345],
    [R, -h + 0.062, 0.385],
  ];
  const ctrl: [number, number, number][] = [...half, [R + 0.003, 0, 0.5], ...half.map(([r, t, v]) => [r, -t, 1 - v] as [number, number, number]).reverse()];
  const curve = new THREE.SplineCurve(ctrl.map(([r, t]) => new THREE.Vector2(r, t)));
  const pts: THREE.Vector2[] = [];
  const vs: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(curve.getPoint(t));
    const f = t * (ctrl.length - 1);
    const i0 = Math.min(ctrl.length - 2, Math.floor(f));
    vs.push(ctrl[i0][2] + (ctrl[i0 + 1][2] - ctrl[i0][2]) * (f - i0));
  }
  const g = new THREE.LatheGeometry(pts, seg);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i <= seg; i++) for (let j = 0; j <= N; j++) uv.setY(i * (N + 1) + j, vs[j]);
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  // Cierra la costura de normales en u = 0/1.
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let j = 0; j <= N; j++) {
    const a = j;
    const b = seg * (N + 1) + j;
    const nx = nor.getX(a) + nor.getX(b);
    const ny = nor.getY(a) + nor.getY(b);
    const nz = nor.getZ(a) + nor.getZ(b);
    const inv = 1 / Math.hypot(nx, ny, nz);
    nor.setXYZ(a, nx * inv, ny * inv, nz * inv);
    nor.setXYZ(b, nx * inv, ny * inv, nz * inv);
  }
  return g;
}

function rimGeometry(w: number, mount: number): THREE.BufferGeometry {
  const h = w / 2;
  // Aro: pestañas visibles y cara interior del barril.
  const barrel = new THREE.LatheGeometry(
    [
      [0.309, h - 0.02],
      [0.301, h - 0.008],
      [0.284, h - 0.012],
      [0.273, h - 0.045],
      [0.268, 0],
      [0.273, -h + 0.045],
      [0.284, -h + 0.012],
      [0.301, -h + 0.008],
      [0.309, -h + 0.02],
    ].map(([r, t]) => new THREE.Vector2(r, t)),
    lod.barrel,
  );
  barrel.rotateX(Math.PI / 2);

  // Disco embutido con 10 agujeros de ventilación. Malla polar fina: el cono queda liso
  // y los agujeros son reales (se ve el tambor de freno a través).
  const disc = discGeometry(mount);
  const merged = mergeGeometries([barrel.toNonIndexed(), disc.toNonIndexed()], false)!;
  barrel.dispose();
  disc.dispose();
  return merged;
}

function discGeometry(mount: number): THREE.BufferGeometry {
  const R0 = 0.098;
  const R1 = 0.271;
  const HOLES = 10;
  const NR = lod.discR;
  const NT = lod.discT;
  const rc = 0.226;
  const ha = 0.027; // semieje radial del agujero
  const hb = 0.034; // semieje tangencial
  const dir = mount < 0 ? 1 : -1;
  const profile = (r: number) => mount + dir * 0.1 * smoothstep(0.185, 0.266, r);
  const pos: number[] = [];
  const idx: number[] = [];
  const sector = (Math.PI * 2) / HOLES;
  for (let h = 0; h < HOLES; h++) {
    const tc = (h + 0.5) * sector;
    const base = pos.length / 3;
    const inside: boolean[] = [];
    for (let i = 0; i <= NR; i++) {
      for (let j = 0; j <= NT; j++) {
        let r = R0 + ((R1 - R0) * i) / NR;
        let t = h * sector + (sector * j) / NT;
        // Distancia normalizada al centro del agujero (elipse).
        const dr = (r - rc) / ha;
        const dt = ((t - tc) * rc) / hb;
        const d = Math.hypot(dr, dt);
        inside.push(d < 1);
        if (d < 1 && d > 1e-6) {
          // Los vértices que caen dentro se llevan al borde: contorno limpio.
          r = rc + (dr / d) * ha;
          t = tc + ((dt / d) * hb) / rc;
        }
        pos.push(Math.cos(t) * r, Math.sin(t) * r, profile(r));
      }
    }
    for (let i = 0; i < NR; i++) {
      for (let j = 0; j < NT; j++) {
        const a = i * (NT + 1) + j;
        const b = a + 1;
        const c = a + NT + 1;
        const d = c + 1;
        if (inside[a] && inside[b] && inside[c] && inside[d]) continue;
        idx.push(base + a, base + c, base + b, base + b, base + c, base + d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0.5), 2));
  g.setIndex(idx);
  const welded = mergeVertices(g, 1e-5);
  g.dispose();
  welded.computeVertexNormals();
  return welded;
}

function hubGeometry(mount: number): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    [
      [0.2, 0],
      [0.2, 0.012],
      [0.102, 0.014],
      [0.1, 0.09],
      [0.088, 0.112],
      [0.062, 0.124],
      [0.03, 0.13],
      [0, 0.131],
    ].map(([r, t]) => new THREE.Vector2(r, t)),
    lod.hub,
  );
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, mount + 0.004);
  return g;
}

function nutsGeometry(mount: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const nut = new THREE.CylinderGeometry(0.0165, 0.0165, 0.026, 6);
    nut.rotateX(Math.PI / 2);
    nut.translate(Math.cos(a) * 0.1675, Math.sin(a) * 0.1675, mount + 0.03);
    parts.push(nut);
    const stud = new THREE.CylinderGeometry(0.009, 0.009, 0.02, 8);
    stud.rotateX(Math.PI / 2);
    stud.translate(Math.cos(a) * 0.1675, Math.sin(a) * 0.1675, mount + 0.05);
    parts.push(stud);
  }
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Geometrías de rueda (cacheadas). El eje de giro es Z y la cara exterior mira a +Z. */
export function wheelGeometry(dual: boolean, detail: WheelDetail = 'high'): WheelGeometry {
  const key = `${dual ? 'dual' : 'single'}|${detail}`;
  let g = cache.get(key);
  if (!g) {
    const radius = dual ? 0.522 : 0.536;
    const width = dual ? 0.295 : 0.385;
    const mount = dual ? -0.17 : 0.12;
    lod = LOD[detail];
    try {
      g = { tire: tireGeometry(radius, width), rim: rimGeometry(width, mount), hub: hubGeometry(mount), nuts: nutsGeometry(mount), radius, width, mount };
    } finally {
      lod = LOD.high;
    }
    cache.set(key, g);
  }
  return g;
}

/** Genera de antemano las geometrías de detalle bajo (para que cambiar de nivel no genere nada). */
export function prepareWheelDetail(): void {
  for (const dual of [true, false]) wheelGeometry(dual, 'low');
}

export interface WheelPose {
  x: number;
  y: number;
  z: number;
  /** +1 = cara exterior hacia +Z, -1 = hacia -Z. */
  side: 1 | -1;
  /** Rueda interior de un par dual (sin maza ni tuercas). */
  inner?: boolean;
  /** Índice de eje (para el eje elevable); -1 = fija. */
  axle: number;
  /** Rotación extra (auxilio acostado o colgado). */
  euler?: [number, number, number];
  spin?: number;
}

export interface WheelSet {
  objects: THREE.InstancedMesh[];
  /** Sube el eje indicado `dy` metros. */
  setAxleLift: (axle: number, dy: number) => void;
  /** Llanta de aluminio o de acero: solo cambia el material (no se regenera nada). */
  setAluminium: (alu: boolean) => void;
  /** Ángulo girado por las ruedas al avanzar (rad). Las de ejes levantados no giran. */
  setRoll: (angle: number) => void;
  /** Nivel de detalle según la distancia de la cámara (solo cambia geometrías ya generadas). */
  setDetail: (d: WheelDetail) => void;
  dispose: () => void;
}

const _q = new THREE.Quaternion();
const _qe = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _mat = new THREE.Matrix4();

function poseMatrix(p: WheelPose, dy: number): THREE.Matrix4 {
  // Rueda exterior: tal cual (o girada 180° en Y para el otro lado). Interior: dada vuelta.
  const flip = (p.side === 1) === !p.inner ? 0 : Math.PI;
  _e.set(0, flip, 0);
  _q.setFromEuler(_e);
  _e.set(0, 0, p.spin ?? 0);
  _q.multiply(_qe.setFromEuler(_e));
  if (p.euler) {
    _e.set(p.euler[0], p.euler[1], p.euler[2]);
    _q.premultiply(_qe.setFromEuler(_e));
  }
  _p.set(p.x, p.y + dy, p.z);
  return _mat.compose(_p, _q, _s);
}

/** Crea los InstancedMesh para un conjunto de ruedas del mismo tipo. */
export function createWheelSet(poses: WheelPose[], dual: boolean, aluminium: boolean, mats: MaterialSet): WheelSet {
  const geo = wheelGeometry(dual);
  const outer = poses.filter((p) => !p.inner && !p.euler);
  const tire = new THREE.InstancedMesh(geo.tire, dual ? mats.tireDual : mats.tireSingle, poses.length);
  const rim = new THREE.InstancedMesh(geo.rim, aluminium ? mats.rimAlu : mats.rimSteel, poses.length);
  const hub = new THREE.InstancedMesh(geo.hub, mats.aluBrushed, Math.max(1, outer.length));
  const nuts = new THREE.InstancedMesh(geo.nuts, mats.chrome, Math.max(1, outer.length));
  hub.count = outer.length;
  nuts.count = outer.length;
  const objects = [tire, rim, hub, nuts];
  for (const o of objects) {
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
  }
  tire.name = 'wheels:tire';
  rim.name = 'wheels:rim';

  const lift = new Map<number, number>();
  let roll = 0;
  // El ángulo de giro se suma al de cada rueda; las ruedas espejadas (del otro lado) giran al revés en su marco.
  const rolled = (p: WheelPose): WheelPose => {
    if (roll === 0 || (lift.get(p.axle) ?? 0) > 0.001 || p.euler) return p;
    const flipped = (p.side === 1) === !p.inner ? 1 : -1;
    return { ...p, spin: (p.spin ?? 0) - roll * flipped };
  };
  const apply = () => {
    poses.forEach((p, i) => {
      const m = poseMatrix(rolled(p), lift.get(p.axle) ?? 0);
      tire.setMatrixAt(i, m);
      rim.setMatrixAt(i, m);
    });
    outer.forEach((p, i) => {
      const m = poseMatrix(rolled(p), lift.get(p.axle) ?? 0);
      hub.setMatrixAt(i, m);
      nuts.setMatrixAt(i, m);
    });
    for (const o of objects) o.instanceMatrix.needsUpdate = true;
  };
  apply();

  return {
    objects,
    setDetail: (d) => {
      const g = wheelGeometry(dual, d);
      if (tire.geometry === g.tire) return;
      tire.geometry = g.tire;
      rim.geometry = g.rim;
      hub.geometry = g.hub;
      nuts.visible = d === 'high';
    },
    setRoll: (angle) => {
      if (angle === roll) return;
      roll = angle;
      apply();
    },
    setAluminium: (alu) => {
      rim.material = alu ? mats.rimAlu : mats.rimSteel;
    },
    setAxleLift: (axle, dy) => {
      if ((lift.get(axle) ?? 0) === dy) return;
      lift.set(axle, dy);
      apply();
    },
    dispose: () => objects.forEach((o) => o.dispose()),
  };
}
