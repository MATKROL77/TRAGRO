/**
 * Ruedas: neumático, llanta con agujeros de ventilación, maza y tuercas.
 * Las geometrías se generan una vez y se dibujan con InstancedMesh.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function tireGeometry(R: number, w: number): THREE.BufferGeometry {
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
  const N = 44;
  const pts: THREE.Vector2[] = [];
  const vs: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(curve.getPoint(t));
    const f = t * (ctrl.length - 1);
    const i0 = Math.min(ctrl.length - 2, Math.floor(f));
    vs.push(ctrl[i0][2] + (ctrl[i0 + 1][2] - ctrl[i0][2]) * (f - i0));
  }
  const seg = 56;
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
    48,
  );
  barrel.rotateX(Math.PI / 2);

  // Disco con 10 agujeros de ventilación, embutido en cono.
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 0.27, 0, Math.PI * 2, false);
  const bore = new THREE.Path();
  bore.absarc(0, 0, 0.098, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
    const hole = new THREE.Path();
    hole.absellipse(Math.cos(a) * 0.226, Math.sin(a) * 0.226, 0.03, 0.024, 0, Math.PI * 2, true, a);
    shape.holes.push(hole);
  }
  const disc = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 20 });
  const pos = disc.getAttribute('position') as THREE.BufferAttribute;
  const nor = disc.getAttribute('normal') as THREE.BufferAttribute;
  const dir = mount < 0 ? 1 : -1;
  const R0 = 0.185;
  const R1 = 0.266;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.hypot(x, y);
    pos.setZ(i, pos.getZ(i) - 0.006 + mount + dir * 0.1 * smoothstep(R0, R1, r));
    // Normales analíticas del cono en las caras del disco: sombreado liso aunque la malla sea gruesa.
    const nz = nor.getZ(i);
    if (Math.abs(nz) > 0.9 && r > 1e-4) {
      const t = Math.min(1, Math.max(0, (r - R0) / (R1 - R0)));
      const slope = (dir * 0.1 * 6 * t * (1 - t)) / (R1 - R0);
      const sgn = Math.sign(nz);
      const inv = 1 / Math.hypot(slope, 1);
      nor.setXYZ(i, (-slope * (x / r) * sgn) * inv, (-slope * (y / r) * sgn) * inv, sgn * inv);
    }
  }
  const merged = mergeGeometries([barrel.toNonIndexed(), disc.index ? disc.toNonIndexed() : disc], false)!;
  barrel.dispose();
  disc.dispose();
  return merged;
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
    28,
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
export function wheelGeometry(dual: boolean): WheelGeometry {
  const key = dual ? 'dual' : 'single';
  let g = cache.get(key);
  if (!g) {
    const radius = dual ? 0.522 : 0.536;
    const width = dual ? 0.295 : 0.385;
    const mount = dual ? -0.17 : 0.12;
    g = { tire: tireGeometry(radius, width), rim: rimGeometry(width, mount), hub: hubGeometry(mount), nuts: nutsGeometry(mount), radius, width, mount };
    cache.set(key, g);
  }
  return g;
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
  const apply = () => {
    poses.forEach((p, i) => {
      const m = poseMatrix(p, lift.get(p.axle) ?? 0);
      tire.setMatrixAt(i, m);
      rim.setMatrixAt(i, m);
    });
    outer.forEach((p, i) => {
      const m = poseMatrix(p, lift.get(p.axle) ?? 0);
      hub.setMatrixAt(i, m);
      nuts.setMatrixAt(i, m);
    });
    for (const o of objects) o.instanceMatrix.needsUpdate = true;
  };
  apply();

  return {
    objects,
    setAxleLift: (axle, dy) => {
      if ((lift.get(axle) ?? 0) === dy) return;
      lift.set(axle, dy);
      apply();
    },
    dispose: () => objects.forEach((o) => o.dispose()),
  };
}
