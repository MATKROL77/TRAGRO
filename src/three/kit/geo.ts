/**
 * Primitivas geométricas del kit paramétrico. Todas devuelven BufferGeometry ya
 * ubicadas en coordenadas del semirremolque (X = largo, Y = arriba, Z = lateral).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Axis = 'x' | 'y' | 'z';
export type P2 = [number, number];

const _m = new THREE.Matrix4();

export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** Caja con aristas matadas (chaflán corto): las aristas agarran luz como en una pieza real. */
export function rbox(w: number, h: number, d: number, x = 0, y = 0, z = 0, r = 0.008): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2.2, h / 2.2, d / 2.2);
  return new RoundedBoxGeometry(w, h, d, 1, rr).translate(x, y, z);
}

/** Caja definida por sus extremos. */
export function boxBetween(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, r = 0): THREE.BufferGeometry {
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  const d = Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;
  return r > 0 ? rbox(w, h, d, cx, cy, cz, r) : box(w, h, d, cx, cy, cz);
}

export function cyl(r: number, len: number, axis: Axis, x = 0, y = 0, z = 0, seg = 18, rTop?: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop ?? r, r, len, seg, 1);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
}

/** Cilindro entre dos puntos cualesquiera. */
export function rod(a: THREE.Vector3Like, b: THREE.Vector3Like, r: number, seg = 10): THREE.BufferGeometry {
  const va = new THREE.Vector3(a.x, a.y, a.z);
  const vb = new THREE.Vector3(b.x, b.y, b.z);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  _m.compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return g.applyMatrix4(_m);
}

/** Barra de sección rectangular entre dos puntos (en el plano XY o cualquiera). */
export function bar(a: THREE.Vector3Like, b: THREE.Vector3Like, w: number, h: number): THREE.BufferGeometry {
  const va = new THREE.Vector3(a.x, a.y, a.z);
  const vb = new THREE.Vector3(b.x, b.y, b.z);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const g = new THREE.BoxGeometry(len, h, w);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
  _m.compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return g.applyMatrix4(_m);
}

/** Caño que sigue una polilínea (barandas, escaleras, mangueras). */
export function pipe(points: [number, number, number][], r: number, radial = 8, smooth = false): THREE.BufferGeometry {
  const pts = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  let curve: THREE.Curve<THREE.Vector3>;
  if (smooth) {
    curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  } else {
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    curve = path;
  }
  return new THREE.TubeGeometry(curve, smooth ? pts.length * 6 : Math.max(2, (pts.length - 1) * 2), r, radial, false);
}

export function shapeOf(points: P2[], holes: P2[][] = []): THREE.Shape {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  for (const h of holes) {
    const p = new THREE.Path();
    h.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
    p.closePath();
    s.holes.push(p);
  }
  return s;
}

function extrudeRaw(shape: THREE.Shape, depth: number, bevel = 0, curveSegments = 12): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(shape, {
    depth: bevel > 0 ? Math.max(1e-4, depth - 2 * bevel) : depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: bevel > 0 ? -bevel : 0,
    bevelSegments: 1,
    curveSegments,
  });
}

/**
 * Perfil dibujado en vista lateral (x, y) con espesor en Z, centrado en `zc`.
 * Ideal para almas de largueros, cartelas y chapas recortadas.
 */
export function extrudeSide(points: P2[] | THREE.Shape, thickness: number, zc = 0, bevel = 0, crease = 0): THREE.BufferGeometry {
  const shape = points instanceof THREE.Shape ? points : shapeOf(points);
  let g: THREE.BufferGeometry = extrudeRaw(shape, thickness, bevel);
  g.translate(0, 0, zc - thickness / 2 + (bevel > 0 ? bevel : 0));
  if (crease > 0) g = toCreasedNormals(g, crease);
  return g;
}

/**
 * Sección transversal (z, y) extruida a lo largo de X entre x0 y x1.
 * Ideal para perfiles (doble T, C, omega), bateas y cajas.
 */
export function extrudeAlong(points: P2[] | THREE.Shape, x0: number, x1: number, bevel = 0, crease = 0): THREE.BufferGeometry {
  // El perfil se dibuja con u = -z para conservar la orientación de las caras.
  const shape = points instanceof THREE.Shape ? points : shapeOf(points.map(([z, y]) => [-z, y] as P2).reverse());
  let g: THREE.BufferGeometry = extrudeRaw(shape, Math.abs(x1 - x0), bevel);
  _m.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  g.applyMatrix4(_m);
  g.translate(Math.min(x0, x1) + (bevel > 0 ? bevel : 0), 0, 0);
  if (crease > 0) g = toCreasedNormals(g, crease);
  return g;
}

/**
 * Contorno en planta (x, z) con espesor en Y, apoyado en `y0`.
 * Ideal para pisos, placas y tapas.
 */
export function extrudeUp(points: P2[] | THREE.Shape, y0: number, thickness: number, bevel = 0): THREE.BufferGeometry {
  const shape = points instanceof THREE.Shape ? points : shapeOf(points.map(([x, z]) => [x, -z] as P2));
  const g: THREE.BufferGeometry = extrudeRaw(shape, thickness, bevel);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + (bevel > 0 ? bevel : 0), 0);
  return g;
}

/** Perfil doble T (alma + alas) a lo largo de X. */
export function iBeam(x0: number, x1: number, yTop: number, height: number, flange: number, zc: number, tf = 0.014, tw = 0.008): THREE.BufferGeometry[] {
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  return [
    box(len, tf, flange, cx, yTop - tf / 2, zc),
    box(len, tf, flange, cx, yTop - height + tf / 2, zc),
    box(len, height - 2 * tf, tw, cx, yTop - height / 2, zc),
  ];
}

/** Perfil C a lo largo de Z (travesaños). `open` = +1 abre hacia +X. */
export function cChannelZ(z0: number, z1: number, x: number, yTop: number, height: number, flange = 0.06, t = 0.006, open = 1): THREE.BufferGeometry[] {
  const len = z1 - z0;
  const cz = (z0 + z1) / 2;
  return [
    box(t, height, len, x - (open * flange) / 2 + (open * t) / 2, yTop - height / 2, cz),
    box(flange, t, len, x, yTop - t / 2, cz),
    box(flange, t, len, x, yTop - height + t / 2, cz),
  ];
}

/** Banda en arco (guardabarros, hojas de elástico) en vista lateral, con ancho en Z. */
export function arcBand(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number, width: number, zc: number, seg = 20): THREE.BufferGeometry {
  const pts: P2[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    pts.push([cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut]);
  }
  for (let i = seg; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / seg;
    pts.push([cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn]);
  }
  return extrudeSide(pts, width, zc, 0, 0.6);
}

/** Cuadrilátero suelto (dos triángulos) con normal calculada; para chapas inclinadas. */
export function quad(a: number[], b: number[], c: number[], d: number[], doubleSided = false): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = [...a, ...b, ...c, ...a, ...c, ...d];
  const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
  if (doubleSided) {
    pos.push(...a, ...c, ...b, ...a, ...d, ...c);
    uv.push(0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Chapa con espesor entre cuatro esquinas (ordenadas en sentido antihorario vistas desde afuera). */
export function sheet(a: number[], b: number[], c: number[], d: number[], t: number): THREE.BufferGeometry {
  const va = new THREE.Vector3(...(a as [number, number, number]));
  const vb = new THREE.Vector3(...(b as [number, number, number]));
  const vc = new THREE.Vector3(...(c as [number, number, number]));
  const vd = new THREE.Vector3(...(d as [number, number, number]));
  const n = vb.clone().sub(va).cross(vd.clone().sub(va)).normalize().multiplyScalar(t);
  const A = va.clone().sub(n);
  const B = vb.clone().sub(n);
  const C = vc.clone().sub(n);
  const D = vd.clone().sub(n);
  const P = (v: THREE.Vector3) => [v.x, v.y, v.z];
  const pos: number[] = [];
  const face = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, s: THREE.Vector3) => pos.push(...P(p), ...P(q), ...P(r), ...P(p), ...P(r), ...P(s));
  face(va, vb, vc, vd);
  face(D, C, B, A);
  face(A, B, vb, va);
  face(B, C, vc, vb);
  face(C, D, vd, vc);
  face(D, A, va, vd);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

/** Cuerpo de revolución alrededor del eje indicado. `profile` = [radio, posición sobre el eje]. */
export function lathe(profile: P2[], axis: Axis, x = 0, y = 0, z = 0, seg = 24): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([r, t]) => new THREE.Vector2(Math.max(0, r), t)),
    seg,
  );
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
}

/**
 * Mapeo UV por proyección de caja en escala real (1 unidad UV = `tile` metros).
 * Devuelve una geometría no indexada.
 */
export function boxUV<T extends THREE.BufferGeometry>(geo: T, tile = 1, rotate = false): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 3) {
    // normal dominante del triángulo
    const nx = Math.abs(nor.getX(i) + nor.getX(i + 1) + nor.getX(i + 2));
    const ny = Math.abs(nor.getY(i) + nor.getY(i + 1) + nor.getY(i + 2));
    const nz = Math.abs(nor.getZ(i) + nor.getZ(i + 1) + nor.getZ(i + 2));
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k);
      const y = pos.getY(i + k);
      const z = pos.getZ(i + k);
      let u: number;
      let v: number;
      if (ny >= nx && ny >= nz) {
        u = x;
        v = z;
      } else if (nx >= nz) {
        u = z;
        v = y;
      } else {
        u = x;
        v = y;
      }
      uv[(i + k) * 2] = (rotate ? v : u) / tile;
      uv[(i + k) * 2 + 1] = (rotate ? u : v) / tile;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function tf(g: THREE.BufferGeometry, opts: { rx?: number; ry?: number; rz?: number; x?: number; y?: number; z?: number; sx?: number; sy?: number; sz?: number }): THREE.BufferGeometry {
  if (opts.sx !== undefined || opts.sy !== undefined || opts.sz !== undefined) g.scale(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1);
  if (opts.rx) g.rotateX(opts.rx);
  if (opts.ry) g.rotateY(opts.ry);
  if (opts.rz) g.rotateZ(opts.rz);
  if (opts.x || opts.y || opts.z) g.translate(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
  return g;
}

/** Espeja una geometría respecto del plano Z = 0 (corrige el sentido de las caras). */
export function mirrorZ(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const c = g.clone();
  c.scale(1, 1, -1);
  flipWinding(c);
  return c;
}

export function flipWinding(g: THREE.BufferGeometry): void {
  if (g.index) {
    const idx = g.index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    g.index.needsUpdate = true;
  } else {
    for (const name of Object.keys(g.attributes)) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute;
      const n = attr.itemSize;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < attr.count; i += 3) {
        for (let k = 0; k < n; k++) {
          const a = (i + 1) * n + k;
          const b = (i + 2) * n + k;
          const t = arr[a];
          arr[a] = arr[b];
          arr[b] = t;
        }
      }
      attr.needsUpdate = true;
    }
  }
}
