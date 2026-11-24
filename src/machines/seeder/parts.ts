import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Constructores de geometría paramétrica reutilizables (eje de giro de discos y ruedas = X). */

export function roundedBox(w: number, h: number, d: number, r = 0.012, seg = 2): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}

export type DiscStyle = 'plain' | 'turbo' | 'wavy' | 'concave';

/** Disco de acero con cóncavo, opcionalmente turbo (estrías radiales) u ondulado. Eje = X. */
export function discGeo(R: number, opts: { style?: DiscStyle; thickness?: number; hole?: number; dish?: number } = {}): THREE.BufferGeometry {
  const style = opts.style ?? 'plain';
  const t = opts.thickness ?? 0.005;
  const r0 = opts.hole ?? R * 0.18;
  const dish = opts.dish ?? R * 0.06;
  const rings = 14;
  const segs = style === 'plain' || style === 'concave' ? 56 : 96;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const disp = (r: number, a: number) => {
    const u = (r - r0) / (R - r0);
    let x = dish * u * u;
    if (style === 'turbo') x += 0.0042 * Math.sin(a * 18) * THREE.MathUtils.smoothstep(u, 0.3, 0.6) * (1 - THREE.MathUtils.smoothstep(u, 0.86, 1.0) * 0.85);
    if (style === 'wavy') x += 0.012 * Math.sin(a * 8) * Math.pow(u, 1.6);
    return x;
  };
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i <= rings; i++) {
      const r = r0 + ((R - r0) * i) / rings;
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const y = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const edgeTaper = i === rings ? 0.2 : 1; // filo afilado
        pos.push(disp(r, a) - (side ? t * edgeTaper : 0), y, z);
        uv.push(0.5 + (z / R) * 0.5, 0.5 + (y / R) * 0.5);
      }
    }
  }
  const row = segs + 1;
  const off = (rings + 1) * row;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * row + j;
      const b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
      idx.push(off + a, off + a + 1, off + b, off + b, off + a + 1, off + b + 1);
    }
  }
  // filo (une las dos caras en el anillo exterior)
  for (let j = 0; j < segs; j++) {
    const a = rings * row + j;
    idx.push(a, a + 1, off + a, off + a, a + 1, off + a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Neumático por revolución. Eje = X. U alrededor, V a lo ancho (sirve para el normal map de tacos). */
export function tireGeo(R: number, width: number, rimR: number, opts: { segs?: number; squareness?: number } = {}): THREE.BufferGeometry {
  const segs = opts.segs ?? 48;
  const p = opts.squareness ?? 0.6;
  const hw = width / 2;
  const pts: THREE.Vector2[] = [];
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const th = -Math.PI / 2 + (i / n) * Math.PI;
    const c = Math.pow(Math.abs(Math.cos(th)), p);
    const s = Math.sign(Math.sin(th)) * Math.pow(Math.abs(Math.sin(th)), p);
    pts.push(new THREE.Vector2(rimR + (R - rimR) * c, s * hw));
  }
  const g = new THREE.LatheGeometry(pts, segs);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Llanta: tambor + disco central con agujeros sugeridos. Eje = X. */
export function rimGeo(rimR: number, width: number, dishDepth = 0.04): THREE.BufferGeometry {
  const drum = new THREE.CylinderGeometry(rimR, rimR, width * 0.8, 40, 1, true);
  const flange1 = new THREE.TorusGeometry(rimR, 0.008, 6, 40);
  flange1.rotateY(Math.PI / 2);
  flange1.translate(0, 0, 0);
  const center = new THREE.CylinderGeometry(rimR * 0.98, rimR * 0.98, 0.012, 40);
  const hub = new THREE.CylinderGeometry(rimR * 0.28, rimR * 0.32, 0.08, 16);
  center.translate(0, -dishDepth * 0.2, 0);
  hub.translate(0, dishDepth * 0.6, 0);
  const parts = [drum, center, hub];
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  merged.rotateZ(Math.PI / 2);
  const f2 = flange1.clone();
  flange1.translate(width * 0.4, 0, 0);
  f2.translate(-width * 0.4, 0, 0);
  const all = mergeGeometries([merged, flange1.toNonIndexed(), f2.toNonIndexed()])!;
  all.computeVertexNormals();
  return all;
}

/** Tacos geométricos en chevron para ruedas grandes (silueta). Eje = X. */
export function lugsGeo(R: number, width: number, count = 22, h = 0.035): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const lug = new THREE.BoxGeometry(width * 0.46, h, 0.05);
      lug.rotateY(side * 0.55);
      lug.translate(side * width * 0.22, R + h / 2 - 0.006, side * 0.035);
      lug.rotateX(a);
      geos.push(lug.toNonIndexed());
    }
  }
  return mergeGeometries(geos)!;
}

export function cylinderX(r: number, len: number, segs = 16): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, segs);
  g.rotateZ(Math.PI / 2);
  return g;
}

export function cylinderZ(r: number, len: number, segs = 16): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, segs);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Cilindro (barra) entre dos puntos. */
export function barBetween(a: THREE.Vector3, b: THREE.Vector3, r: number, segs = 10, square = false): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = square ? roundedBox(r * 2, len, r * 2, r * 0.25, 1) : new THREE.CylinderGeometry(r, r, len, segs);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

export function tube(points: THREE.Vector3[], r: number, tubular = 40, radial = 8): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return new THREE.TubeGeometry(curve, tubular, r, radial, false);
}

/** Manguera colgante entre dos puntos, con comba. */
export function sagHose(a: THREE.Vector3, b: THREE.Vector3, r: number, sag = 0.12, tubular = 24): THREE.BufferGeometry {
  const m1 = a.clone().lerp(b, 0.33);
  const m2 = a.clone().lerp(b, 0.66);
  m1.y -= sag;
  m2.y -= sag;
  return tube([a, m1, m2, b], r, tubular, 6);
}

/** Resorte helicoidal a lo largo de Y, de y=0 a y=len. */
export function springGeo(radius: number, wire: number, turns: number, len: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const n = Math.round(turns * 16);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, t * len, Math.sin(a) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, n * 2, wire, 6, false);
}

/** Bolsa de aire (fuelle) a lo largo de Y. */
export function airbagGeo(r: number, len: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bulge = Math.abs(Math.sin(t * Math.PI * 2)) * 0.22 + 0.78;
    pts.push(new THREE.Vector2(r * bulge * (t === 0 || t === 1 ? 0.75 : 1), t * len));
  }
  return new THREE.LatheGeometry(pts, 24);
}

/** Tronco de pirámide rectangular (tolva inferior). Base superior wT×dT, inferior wB×dB, alto h. Centro en la base superior. */
export function frustumGeo(wT: number, dT: number, wB: number, dB: number, h: number, zShift = 0): THREE.BufferGeometry {
  const t = [
    [-wT / 2, 0, -dT / 2],
    [wT / 2, 0, -dT / 2],
    [wT / 2, 0, dT / 2],
    [-wT / 2, 0, dT / 2],
  ];
  const b = [
    [-wB / 2, -h, -dB / 2 + zShift],
    [wB / 2, -h, -dB / 2 + zShift],
    [wB / 2, -h, dB / 2 + zShift],
    [-wB / 2, -h, dB / 2 + zShift],
  ];
  const quads: number[][][] = [
    [t[0], t[1], b[1], b[0]],
    [t[1], t[2], b[2], b[1]],
    [t[2], t[3], b[3], b[2]],
    [t[3], t[0], b[0], b[3]],
    [b[0], b[1], b[2], b[3]],
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  for (const q of quads) {
    const [a, bb, c, d] = q;
    pos.push(...a, ...c, ...bb, ...a, ...d, ...c);
    uv.push(0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function hexBolt(size = 0.018, len = 0.012): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(size, size, len, 6);
  return g;
}

/** Rueda tapadora con dientes (estrella). Eje = X. */
export function spikedWheelGeo(R: number, teeth = 12): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  const hub = new THREE.CylinderGeometry(R * 0.42, R * 0.42, 0.03, 20);
  hub.rotateZ(Math.PI / 2);
  geos.push(hub.toNonIndexed());
  const plate = new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.012, 24);
  plate.rotateZ(Math.PI / 2);
  geos.push(plate.toNonIndexed());
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const tooth = new THREE.ConeGeometry(0.018, R * 0.5, 4);
    tooth.rotateX(0.35); // curvado hacia atrás
    tooth.translate(0, R * 0.72, 0);
    tooth.rotateX(a);
    geos.push(tooth.toNonIndexed());
  }
  const m = mergeGeometries(geos)!;
  m.computeVertexNormals();
  return m;
}

/** Rueda de fundición con perfil en cuña. Eje = X. */
export function castWheelGeo(R: number, width: number): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.03, -width / 2),
    new THREE.Vector2(R * 0.75, -width / 2),
    new THREE.Vector2(R * 0.92, -width * 0.3),
    new THREE.Vector2(R, 0),
    new THREE.Vector2(R * 0.92, width * 0.3),
    new THREE.Vector2(R * 0.75, width / 2),
    new THREE.Vector2(0.03, width / 2),
  ];
  const g = new THREE.LatheGeometry(pts, 36);
  g.rotateZ(-Math.PI / 2);
  return g;
}

export function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const norm = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    // homogeneizar atributos: position, normal, uv
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    if (!n.getAttribute('uv')) {
      const count = n.getAttribute('position').count;
      n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    return n;
  });
  const m = mergeGeometries(norm, false);
  if (!m) throw new Error('merge failed');
  return m;
}

export interface WheelGeos {
  tire: THREE.BufferGeometry;
  lugs: THREE.BufferGeometry;
  rim: THREE.BufferGeometry;
  metal: THREE.BufferGeometry;
  dark: THREE.BufferGeometry;
}

/**
 * Rueda agrícola completa (eje X): cubierta cerrada, tacos en V apoyados sobre la banda,
 * llanta con aro, disco con agujeros, cubo, bulones y taza. `outward` = lado visible (+1 o -1).
 */
export function wheelSet(R: number, W: number, opts: { rimR?: number; lugs?: number; lugH?: number; outward?: number } = {}): WheelGeos {
  const rimR = opts.rimR ?? R * 0.6;
  const out = opts.outward ?? 1;
  const lugH = opts.lugH ?? R * 0.07;
  const n = opts.lugs ?? Math.round(R * 52);
  const tread = R - lugH * 0.55;
  const tire = tireGeo(tread, W, rimR * 1.02, { segs: 64, squareness: 0.45 });
  // tacos en chevron que cubren toda la banda y bajan al hombro
  const lugParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const len = W * 0.62;
      const lug = new THREE.BoxGeometry(len, lugH, W * 0.12);
      // bisel en la punta exterior: baja hacia el hombro
      const p = lug.getAttribute('position');
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k);
        if (x > len * 0.3 && p.getY(k) > 0) p.setY(k, p.getY(k) - lugH * 0.35);
      }
      lug.translate(len / 2 - W * 0.06, 0, 0);
      lug.rotateY(side > 0 ? -0.62 : Math.PI + 0.62);
      lug.translate(0, tread + lugH / 2 - lugH * 0.15, side * W * 0.04 + (side > 0 ? 0 : (Math.PI / n) * tread));
      lug.rotateX(a);
      lugParts.push(lug.toNonIndexed());
    }
  }
  const lugs = mergeGeometries(lugParts)!;
  lugs.computeVertexNormals();
  // llanta: barril + aros + disco + cubo
  const bw = W * 0.82;
  const barrel = new THREE.CylinderGeometry(rimR, rimR, bw, 48, 1, true);
  const innerDisc = new THREE.CylinderGeometry(rimR * 0.99, rimR * 0.99, 0.008, 48).translate(0, -out * bw * 0.32, 0);
  const faceDisc = new THREE.CylinderGeometry(rimR * 0.97, rimR * 0.97, 0.012, 48).translate(0, out * bw * 0.12, 0);
  const dish = new THREE.CylinderGeometry(rimR * 0.55, rimR * 0.97, bw * 0.18, 48, 1, true).translate(0, out * bw * 0.21, 0);
  if (out < 0) dish.rotateX(Math.PI);
  const hub = new THREE.CylinderGeometry(rimR * 0.3, rimR * 0.34, bw * 0.42, 24).translate(0, out * bw * 0.32, 0);
  const rimParts = [barrel, innerDisc, faceDisc, dish, hub].map((g) => g.toNonIndexed());
  for (const s of [-1, 1]) {
    const fl = new THREE.TorusGeometry(rimR * 1.01, rimR * 0.035, 8, 48).rotateX(Math.PI / 2).translate(0, s * bw * 0.5, 0);
    rimParts.push(fl.toNonIndexed());
  }
  const rim = mergeGeometries(rimParts)!;
  rim.computeVertexNormals();
  rim.rotateZ(-Math.PI / 2);
  // bulones y taza central (acero)
  const metalParts: THREE.BufferGeometry[] = [];
  const nb = rimR > 0.2 ? 8 : 6;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2;
    const b = new THREE.CylinderGeometry(rimR * 0.045, rimR * 0.045, rimR * 0.08, 6).translate(Math.cos(a) * rimR * 0.21, out * (bw * 0.53 + rimR * 0.04), Math.sin(a) * rimR * 0.21);
    metalParts.push(b.toNonIndexed());
  }
  metalParts.push(new THREE.SphereGeometry(rimR * 0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1).rotateX(out > 0 ? 0 : Math.PI).translate(0, out * bw * 0.53, 0).toNonIndexed());
  const metal = mergeGeometries(metalParts)!;
  metal.computeVertexNormals();
  metal.rotateZ(-Math.PI / 2);
  // agujeros de aliviane del disco (oscuros, levemente hundidos)
  const darkParts: THREE.BufferGeometry[] = [];
  const nh = 8;
  for (let i = 0; i < nh; i++) {
    const a = (i / nh + 0.0625) * Math.PI * 2;
    const h = new THREE.CylinderGeometry(rimR * 0.11, rimR * 0.11, 0.014, 16).scale(1, 1, 1.35).rotateY(-a).translate(Math.cos(a) * rimR * 0.66, out * bw * 0.125, Math.sin(a) * rimR * 0.66);
    darkParts.push(h.toNonIndexed());
  }
  const dark = mergeGeometries(darkParts)!;
  dark.computeVertexNormals();
  dark.rotateZ(-Math.PI / 2);
  return { tire, lugs, rim, metal, dark };
}

export function disposeWheel(w: WheelGeos) {
  Object.values(w).forEach((g) => g.dispose());
}
