import * as THREE from 'three';
import type { MaterialSet } from '../../three/materials';
import {
  airbagGeo, barBetween, castWheelGeo, cylinderX, discGeo, frustumGeo, hexBolt, rimGeo, roundedBox,
  spikedWheelGeo, springGeo, tireGeo, tube, seg } from './parts';
import { DIM } from './layout';

/**
 * Cuerpo de siembra (tren de siembra) — se modela UNA vez con detalle y se replica por instancias.
 * Coordenadas locales: x = 0 en el surco, y desde el suelo, z = 0 en el porta-herramientas, +z adelante.
 */

export type MatKey = keyof MaterialSet;
export type PartGroup =
  | 'coulter' | 'coulterSpring' | 'fertOpener' | 'discs' | 'gauge' | 'meter' | 'seedTube' | 'hopper'
  | 'firmer' | 'closing' | 'downforce' | 'linkage' | 'body';

export interface Part {
  group: PartGroup;
  geometry: THREE.BufferGeometry;
  mat: MatKey;
  matrix: THREE.Matrix4;
  /** radio de rodadura si gira con el avance (eje local X de la pieza) */
  spin?: number;
  /** dirección de despiece */
  explode: THREE.Vector3;
}

export interface RowUnitOptions {
  coulter: 'turbo' | 'wavy';
  closing: 'rubber' | 'castiron' | 'spiked';
  firmer: boolean;
  downforce: 'spring' | 'pneumatic';
  metering: 'chain' | 'shaft' | 'pneumatic' | 'electric';
  fert: 'none' | 'inline' | 'side';
  hopper: 'individual' | 'central';
  hopperL: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const M = (pos: THREE.Vector3, rot?: THREE.Euler) => {
  const m = new THREE.Matrix4();
  m.compose(pos, new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), new THREE.Vector3(1, 1, 1));
  return m;
};
const I = new THREE.Matrix4();

export const ROW = {
  coulter: { R: 0.215, pos: V(0, 0.215 - 0.045, 0.4) },
  disc: { R: 0.19, z: -0.5, y: 0.19 - 0.05 },
  gauge: { R: 0.2, x: 0.098, z: -0.56 },
  closing: { R: 0.155, z: -1.3 },
  meter: { pos: V(0.0, 0.7, -0.84) },
  tubeExit: V(0, 0.05, -0.64),
};

/** Igual que `buildRowUnitSteps`, de una sola vez. */
export function buildRowUnit(o: RowUnitOptions): Part[] {
  const gen = buildRowUnitSteps(o);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

/** Cuerpo de siembra por secciones (cada `yield` permite ceder el cuadro). */
export function* buildRowUnitSteps(o: RowUnitOptions): Generator<void, Part[], void> {
  const parts: Part[] = [];
  const add = (group: PartGroup, geometry: THREE.BufferGeometry, mat: MatKey, matrix = I, explode = V(0, 0, 0), spin?: number) =>
    parts.push({ group, geometry, mat, matrix: matrix.clone(), explode, spin });
  const by = DIM.barY;

  // ---------- Soporte y paralelogramo ----------
  for (const s of [-1, 1]) {
    add('linkage', roundedBox(0.014, 0.3, 0.32, 0.004), 'paintMain', M(V(s * 0.072, by - 0.02, -0.06)), V(0, 0.1, 0.1));
    for (const [y0, y1] of [[by + 0.07, by + 0.02], [by - 0.13, by - 0.18]]) {
      add('linkage', barBetween(V(s * 0.06, y0, -0.15), V(s * 0.06, y1, -0.6), 0.022, 6, true), 'paintMain', I, V(0, 0.1, 0.1));
    }
  }
  for (const [y, z] of [[by + 0.07, -0.15], [by - 0.13, -0.15], [by + 0.02, -0.6], [by - 0.18, -0.6]]) {
    add('linkage', cylinderX(0.012, 0.17, 10), 'chrome', M(V(0, y, z)), V(0, 0.1, 0.1));
  }
  // bulones del soporte
  for (const s of [-1, 1]) for (const dy of [-0.09, 0.09]) for (const dz of [-0.16, 0.06]) {
    add('linkage', hexBolt(0.014, 0.012), 'galvanized', M(V(s * 0.082, by + dy, dz), new THREE.Euler(0, 0, Math.PI / 2)), V(0, 0.1, 0.1));
  }

  yield;
  // ---------- Cuerpo ----------
  add('body', roundedBox(0.13, 0.3, 0.46, 0.02), 'paintMain', M(V(0, 0.48, -0.78)));
  add('body', roundedBox(0.075, 0.34, 0.15, 0.015), 'paintMain', M(V(0, 0.32, -0.5)));
  add('body', roundedBox(0.11, 0.06, 0.18, 0.01), 'castIron', M(V(0, 0.34, -0.98)));
  // regulación de profundidad (manija en T)
  add('body', barBetween(V(0, 0.38, -1.02), V(0, 0.68, -1.06), 0.011), 'steel');
  add('body', cylinderX(0.016, 0.16, 10), 'paintAccent', M(V(0, 0.69, -1.065)));
  add('body', roundedBox(0.012, 0.12, 0.1, 0.003), 'castIron', M(V(0.05, 0.44, -1.02)));

  yield;
  // ---------- Cuchilla de corte ----------
  const cR = ROW.coulter.R;
  const cp = ROW.coulter.pos;
  add('coulter', discGeo(cR, { style: o.coulter, dish: 0.0, hole: 0.045 }), 'steelDisc', M(cp), V(0, 0, 0.4), cR);
  add('coulter', cylinderX(0.05, 0.07, 18), 'castIron', M(cp), V(0, 0, 0.4), cR);
  for (const s of [-1, 1]) {
    add('coulter', barBetween(V(s * 0.045, cp.y, cp.z), V(s * 0.045, by + 0.05, 0.16), 0.016, 6, true), 'paintMain', I, V(0, 0, 0.4));
  }
  add('coulter', roundedBox(0.12, 0.08, 0.12, 0.01), 'paintMain', M(V(0, by + 0.06, 0.15)), V(0, 0, 0.4));
  // resorte de presión de la cuchilla
  const spr = springGeo(0.032, 0.0065, 7, 0.32);
  spr.translate(0, 0, 0);
  add('coulterSpring', spr, 'paintAccent', M(V(0, by + 0.1, 0.13), new THREE.Euler(-2.3, 0, 0)), V(0, 0.15, 0.45));
  add('coulterSpring', barBetween(V(0, by + 0.1, 0.13), V(0, by - 0.11, 0.37), 0.008), 'steel', I, V(0, 0.15, 0.45));

  yield;
  // ---------- Abresurco de fertilizante ----------
  if (o.fert === 'inline') {
    add('fertOpener', tube([V(0, by + 0.2, 0.08), V(0, by - 0.1, 0.1), V(0, 0.25, 0.17), V(0, 0.05, 0.19)], 0.019, 24, 8), 'plastic', I, V(0, 0.12, 0.22));
    add('fertOpener', roundedBox(0.014, 0.16, 0.07, 0.004), 'steel', M(V(0, 0.08, 0.2), new THREE.Euler(0.25, 0, 0)), V(0, 0.12, 0.22));
  } else if (o.fert === 'side') {
    const fR = 0.19;
    const fp = V(0.075, fR - 0.04, 0.06);
    const yaw = new THREE.Euler(0, 0.12, 0);
    add('fertOpener', discGeo(fR, { style: 'concave', dish: 0.012, hole: 0.04 }), 'steelDisc', M(fp, yaw), V(0.32, 0, 0.1), fR);
    add('fertOpener', cylinderX(0.045, 0.06, 16), 'castIron', M(V(fp.x + 0.03, fp.y, fp.z)), V(0.32, 0, 0.1), fR);
    add('fertOpener', barBetween(V(0.11, fp.y, fp.z), V(0.11, by - 0.06, -0.02), 0.018, 6, true), 'paintMain', I, V(0.32, 0, 0.1));
    add('fertOpener', tube([V(0.1, by + 0.15, -0.04), V(0.1, 0.4, -0.06), V(0.095, 0.08, -0.1)], 0.017, 20, 8), 'plastic', I, V(0.32, 0, 0.1));
    const s2 = springGeo(0.028, 0.006, 6, 0.22);
    add('fertOpener', s2, 'paintAccent', M(V(0.11, by - 0.04, 0.04), new THREE.Euler(-0.4, 0, 0)), V(0.32, 0, 0.1));
  }

  yield;
  // ---------- Doble disco desencontrado ----------
  const dR = ROW.disc.R;
  for (const s of [-1, 1]) {
    const pos = V(s * 0.024, ROW.disc.y, ROW.disc.z + (s > 0 ? -0.022 : 0));
    const rot = new THREE.Euler(0, -s * 0.09, -s * 0.05, 'YXZ');
    const g = discGeo(dR, { style: 'concave', dish: 0.006, hole: 0.04 });
    if (s > 0) g.scale(-1, 1, 1);
    add('discs', g, 'steelDisc', M(pos, rot), V(s * 0.22, -0.02, 0), dR);
    add('discs', cylinderX(0.045, 0.035, 16), 'castIron', M(V(s * 0.05, ROW.disc.y, pos.z)), V(s * 0.22, -0.02, 0), dR);
  }

  yield;
  // ---------- Ruedas limitadoras ----------
  const gR = ROW.gauge.R;
  for (const s of [-1, 1]) {
    const gp = V(s * ROW.gauge.x, gR, ROW.gauge.z);
    add('gauge', tireGeo(gR, 0.1, gR - 0.045, { segs: 36, squareness: 0.5 }), 'rubber', M(gp), V(s * 0.5, 0, 0), gR);
    const rim = rimGeo(gR - 0.045, 0.1, 0.03);
    if (s < 0) rim.scale(-1, 1, 1);
    add('gauge', rim, 'rimGrey', M(gp), V(s * 0.5, 0, 0), gR);
    add('gauge', barBetween(V(s * 0.075, gR, ROW.gauge.z), V(s * 0.07, 0.42, -0.76), 0.02, 6, true), 'castIron', I, V(s * 0.42, 0, 0));
  }

  yield;
  // ---------- Dosificador ----------
  const mp = ROW.meter.pos;
  const meterMat: MatKey = o.metering === 'chain' || o.metering === 'shaft' ? 'castIron' : 'plastic';
  add('meter', cylinderX(0.15, 0.1, 32), meterMat, M(mp), V(0.38, 0.2, 0));
  add('meter', cylinderX(0.155, 0.02, 32), 'paintAccent', M(V(mp.x + 0.055, mp.y, mp.z)), V(0.38, 0.2, 0));
  if (o.metering === 'pneumatic') {
    add('meter', tube([V(-0.06, mp.y + 0.02, mp.z), V(-0.12, mp.y + 0.08, mp.z + 0.05), V(-0.1, by + 0.16, -0.25), V(-0.06, by + 0.13, -0.05)], 0.018, 24, 8), 'hose', I, V(0.38, 0.2, 0));
  } else if (o.metering === 'electric') {
    add('meter', cylinderX(0.042, 0.12, 20), 'plastic', M(V(mp.x + 0.12, mp.y + 0.03, mp.z + 0.05)), V(0.45, 0.2, 0));
    add('meter', cylinderX(0.044, 0.015, 20), 'galvanized', M(V(mp.x + 0.185, mp.y + 0.03, mp.z + 0.05)), V(0.45, 0.2, 0));
    add('meter', tube([V(mp.x + 0.12, mp.y + 0.08, mp.z + 0.05), V(0.1, by + 0.1, -0.35), V(0.08, by + 0.12, -0.08)], 0.006, 20, 5), 'cable', I, V(0.45, 0.2, 0));
  } else {
    // eje hexagonal de mando + piñón
    add('meter', new THREE.CylinderGeometry(0.075, 0.075, 0.012, seg(22, 8)).rotateZ(Math.PI / 2), 'steel', M(V(-0.07, mp.y, mp.z)), V(0.38, 0.2, 0));
    add('meter', cylinderX(0.011, 0.3, 6), 'steel', M(V(-0.12, mp.y, mp.z)), V(0.38, 0.2, 0));
    if (o.metering === 'chain') {
      add('meter', tube([V(-0.08, mp.y + 0.075, mp.z), V(-0.08, by + 0.02, -0.4), V(-0.08, by - 0.08, -0.38), V(-0.08, mp.y - 0.075, mp.z)], 0.006, 24, 4), 'castIron', I, V(0.38, 0.2, 0));
    }
  }

  yield;
  // ---------- Tolva individual o mini-tolva (central) ----------
  if (o.hopper === 'individual') {
    const w = 0.34;
    const d = 0.42;
    const h = Math.max(0.3, o.hopperL / 1000 / (w * d));
    const bottom = mp.y + 0.2;
    add('hopper', frustumGeo(w, d, 0.14, 0.16, 0.12), 'paintMain', M(V(0, bottom, mp.z)), V(0, 0.5, 0));
    add('hopper', roundedBox(w, h, d, 0.025), 'paintMain', M(V(0, bottom + h / 2, mp.z)), V(0, 0.5, 0));
    add('hopper', roundedBox(w + 0.02, 0.035, d + 0.02, 0.014), 'paintAccent', M(V(0, bottom + h + 0.012, mp.z - 0.005)), V(0, 0.62, 0));
    add('hopper', cylinderX(0.008, w * 0.7), 'steel', M(V(0, bottom + h + 0.01, mp.z + d / 2 + 0.008)), V(0, 0.62, 0));
  } else {
    add('hopper', roundedBox(0.16, 0.16, 0.18, 0.02), 'plastic', M(V(0, mp.y + 0.2, mp.z)), V(0, 0.4, 0));
    add('hopper', frustumGeo(0.16, 0.18, 0.08, 0.08, 0.08), 'plastic', M(V(0, mp.y + 0.12, mp.z)), V(0, 0.4, 0));
  }

  yield;
  // ---------- Tubo de bajada ----------
  add('seedTube', tube([V(0, mp.y - 0.14, mp.z + 0.02), V(0, 0.4, -0.72), V(0, 0.2, -0.66), ROW.tubeExit], 0.016, 24, 8), 'plastic', I, V(-0.3, 0, 0));

  yield;
  // ---------- Apretador ----------
  if (o.firmer) {
    const g = tube([V(0, 0.3, -0.64), V(0, 0.15, -0.72), V(0, 0.04, -0.8), V(0, 0.015, -0.86)], 0.011, 20, 6);
    g.scale(1.6, 1, 1);
    add('firmer', g, 'paintAccent', I, V(0, -0.05, -0.2));
    add('firmer', roundedBox(0.03, 0.015, 0.07, 0.005), 'plastic', M(V(0, 0.012, -0.87)), V(0, -0.05, -0.2));
  }

  yield;
  // ---------- Ruedas tapadoras en V ----------
  const kR = ROW.closing.R;
  const kz = ROW.closing.z;
  for (const s of [-1, 1]) {
    const kp = V(s * 0.065, kR * 0.95, kz);
    const rot = new THREE.Euler(0, 0, s * 0.38);
    if (o.closing === 'rubber') {
      add('closing', tireGeo(kR, 0.05, kR - 0.035, { segs: 32, squareness: 0.8 }), 'rubber', M(kp, rot), V(s * 0.25, 0, -0.35), kR);
      add('closing', rimGeo(kR - 0.035, 0.05, 0.02), 'rimGrey', M(kp, rot), V(s * 0.25, 0, -0.35), kR);
    } else if (o.closing === 'castiron') {
      add('closing', castWheelGeo(kR, 0.05), 'castIron', M(kp, rot), V(s * 0.25, 0, -0.35), kR);
    } else {
      add('closing', spikedWheelGeo(kR, 12), 'steel', M(kp, rot), V(s * 0.25, 0, -0.35), kR);
    }
    add('closing', barBetween(V(s * 0.085, kp.y + 0.02, kz), V(s * 0.06, 0.4, -0.98), 0.016, 6, true), 'paintMain', I, V(0, 0.05, -0.3));
  }
  const ks = springGeo(0.022, 0.005, 6, 0.24);
  add('closing', ks, 'paintAccent', M(V(0, 0.56, -1.02), new THREE.Euler(-2.6, 0, 0)), V(0, 0.05, -0.3));

  yield;
  // ---------- Presión descendente ----------
  if (o.downforce === 'spring') {
    for (const s of [-1, 1]) {
      const a = V(s * 0.1, by + 0.08, -0.17);
      const b = V(s * 0.1, by - 0.16, -0.55);
      const len = a.distanceTo(b);
      const g = springGeo(0.028, 0.0062, 9, len);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
      add('downforce', g, 'paintAccent', new THREE.Matrix4().compose(a, q, V(1, 1, 1)), V(s * 0.12, 0.3, 0));
      add('downforce', barBetween(a, b, 0.007), 'steel', I, V(s * 0.12, 0.3, 0));
    }
  } else {
    const a = V(0, by + 0.12, -0.16);
    const b = V(0, by - 0.12, -0.52);
    const len = a.distanceTo(b);
    const g = airbagGeo(0.07, len * 0.7);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), a.clone().sub(b).normalize());
    add('downforce', g, 'rubber', new THREE.Matrix4().compose(b.clone().lerp(a, 0.15), q, V(1, 1, 1)), V(0, 0.32, 0));
    add('downforce', new THREE.CylinderGeometry(0.075, 0.075, 0.014, seg(20, 8)).applyQuaternion(q), 'steel', M(b.clone().lerp(a, 0.15)), V(0, 0.32, 0));
    add('downforce', new THREE.CylinderGeometry(0.075, 0.075, 0.014, seg(20, 8)).applyQuaternion(q), 'steel', M(b.clone().lerp(a, 0.86)), V(0, 0.32, 0));
    add('downforce', tube([a.clone().add(V(0.05, 0.02, 0)), V(0.09, by + 0.16, -0.1), V(0.1, by + 0.12, 0.05)], 0.006, 16, 5), 'hose', I, V(0, 0.32, 0));
  }
  return parts;
}

/** Hotspots del cuerpo (en coordenadas locales del surco). */
export const ROW_HOTSPOTS: Record<string, THREE.Vector3> = {
  coulter: V(0, 0.42, 0.45),
  discs: V(-0.06, 0.2, -0.45),
  gauge: V(0.2, 0.3, -0.56),
  meter: V(0.12, 0.74, -0.84),
  closing: V(0, 0.36, -1.3),
};
