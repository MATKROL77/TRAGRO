import * as THREE from 'three';
import { getMaterials } from './materials';

/**
 * Detalles del campo (Fase 3), todos instanciados y construidos una sola vez:
 *  - rastrojo 3D (pajas y tallos de pocas caras) en una franja alrededor de la máquina, que se
 *    "recicla" con el avance (coordenadas de suelo), con densidad según el nivel de calidad,
 *  - polvo detrás de los cuerpos al sembrar (partículas instanciadas, alto y medio),
 *  - horizonte: cortinas de árboles (copas instanciadas), alambrado, silos y galpón.
 */

const rnd = (() => {
  let s = 12345;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

/* ------------------------------ rastrojo ------------------------------ */

const STRAW_MAX = 9000;
/** franja de rastrojo: ancho (x) y largo (z) alrededor de la máquina */
const AREA_X = 46;
const AREA_Z = 60;

export class StrawField {
  mesh: THREE.InstancedMesh;
  private base: Float32Array; // x, g (coordenada de suelo), rotY, escala, inclinación
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private lastOffset = NaN;

  constructor() {
    // paja: prisma triangular finito (6 caras visibles), con un leve doblez
    const g = new THREE.CylinderGeometry(0.006, 0.007, 1, 3, 2, false);
    g.rotateZ(Math.PI / 2);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + Math.abs(pos.getX(i)) * 0.06);
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: '#c9b48a', roughness: 0.92, metalness: 0 });
    mat.name = 'straw';
    this.mesh = new THREE.InstancedMesh(g, mat, STRAW_MAX);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    const colors = new Float32Array(STRAW_MAX * 3);
    const c = new THREE.Color();
    this.base = new Float32Array(STRAW_MAX * 5);
    for (let i = 0; i < STRAW_MAX; i++) {
      this.base[i * 5] = (rnd() - 0.5) * AREA_X;
      this.base[i * 5 + 1] = rnd() * AREA_Z;
      this.base[i * 5 + 2] = rnd() * Math.PI * 2;
      this.base[i * 5 + 3] = 0.12 + rnd() * 0.32;
      this.base[i * 5 + 4] = (rnd() - 0.5) * 0.25;
      c.setHSL(0.1 + rnd() * 0.03, 0.28 + rnd() * 0.15, 0.45 + rnd() * 0.25);
      c.toArray(colors, i * 3);
    }
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    this.setDensity(1);
    this.update(0, true);
  }

  /** 0–1: fracción de pajas dibujadas (nivel de calidad) */
  setDensity(d: number) {
    this.mesh.count = Math.max(0, Math.min(STRAW_MAX, Math.round(STRAW_MAX * d)));
  }

  /** `offset` = metros recorridos: las pajas se desplazan con el suelo y se reciclan adelante. */
  update(offset: number, force = false) {
    if (!force && Math.abs(offset - this.lastOffset) < 0.002) return;
    this.lastOffset = offset;
    const n = this.mesh.count;
    for (let i = 0; i < n; i++) {
      const x = this.base[i * 5];
      // el suelo avanza hacia -z (la máquina mira a +z)
      let z = ((this.base[i * 5 + 1] - offset) % AREA_Z + AREA_Z) % AREA_Z;
      z = z - AREA_Z * 0.45;
      const len = this.base[i * 5 + 3];
      this.p.set(x, 0.012, z);
      this.e.set(0, this.base[i * 5 + 2], this.base[i * 5 + 4]);
      this.q.setFromEuler(this.e);
      this.s.set(len, 1, 1);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------ polvo ------------------------------ */

const DUST_MAX = 420;
export class DustEmitter {
  mesh: THREE.InstancedMesh;
  private parts: { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; s: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private acc = 0;

  constructor() {
    const g = new THREE.IcosahedronGeometry(0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#b39c7a', roughness: 1, transparent: true, opacity: 0.16, depthWrite: false });
    mat.name = 'dust';
    this.mesh = new THREE.InstancedMesh(g, mat, DUST_MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
  }

  /** Emite detrás de las tapadoras (`rowX`, z = `zBack`) proporcional a la velocidad. */
  update(dt: number, speed: number, rowX: number[], zBack: number) {
    if (speed > 0.3 && rowX.length) {
      this.acc += dt * speed * 9;
      while (this.acc > 1 && this.parts.length < DUST_MAX) {
        this.acc -= 1;
        const x = rowX[Math.floor(rnd() * rowX.length)] + (rnd() - 0.5) * 0.3;
        this.parts.push({ x, y: 0.15, z: zBack - rnd() * 0.3, vx: (rnd() - 0.5) * 0.3, vy: 0.25 + rnd() * 0.35, vz: -speed * (0.75 + rnd() * 0.2), age: 0, life: 1.6 + rnd() * 1.6, s: 0.15 + rnd() * 0.2 });
      }
    }
    let n = 0;
    for (const p of this.parts) {
      p.age += dt;
      if (p.age > p.life) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy *= 0.97;
      const k = p.age / p.life;
      const size = p.s * (1 + k * 3.5) * Math.sin(Math.min(1, k * 3) * Math.PI * 0.5) * (1 - k * 0.4);
      this.sc.setScalar(Math.max(0.001, size));
      this.v.set(p.x, p.y, p.z);
      this.m.compose(this.v, this.q, this.sc);
      this.parts[n++] = p;
      this.mesh.setMatrixAt(n - 1, this.m);
    }
    this.parts.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    return n > 0;
  }

  clear() {
    this.parts.length = 0;
    this.mesh.count = 0;
  }
}

/* ------------------------------ horizonte ------------------------------ */

/** Copa de árbol (eucalipto) de pocas caras con variación; tronco como cilindro fino. */
function treeLine(count: number, x0: number, x1: number, z: number, jitter: number, h: [number, number]) {
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  // aplastar y deformar para que no sea una esfera perfecta
  const pos = crownGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const n = 1 + (Math.sin(pos.getX(i) * 5.1) + Math.cos(pos.getZ(i) * 4.3)) * 0.08;
    pos.setXYZ(i, pos.getX(i) * n, y * 1.35 * n, pos.getZ(i) * n);
  }
  crownGeo.computeVertexNormals();
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 5);
  trunkGeo.translate(0, 0.5, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: '#3f5a2c', roughness: 0.95, flatShading: true });
  crownMat.name = 'treeCrown';
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b5a48', roughness: 0.95 });
  trunkMat.name = 'treeTrunk';
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count * 2);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  let k = 0;
  for (let i = 0; i < count; i++) {
    const x = x0 + ((x1 - x0) * i) / count + (rnd() - 0.5) * 3;
    const zz = z + (rnd() - 0.5) * jitter;
    const H = h[0] + rnd() * (h[1] - h[0]);
    m.compose(new THREE.Vector3(x, 0, zz), q, new THREE.Vector3(1, H * 0.55, 1));
    trunks.setMatrixAt(i, m);
    for (let j = 0; j < 2; j++) {
      const r = H * (0.22 + rnd() * 0.08);
      m.compose(new THREE.Vector3(x + (rnd() - 0.5) * 1.5, H * (0.62 + j * 0.2), zz + (rnd() - 0.5) * 1.5), q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(r, r, r));
      crowns.setMatrixAt(k, m);
      c.setHSL(0.24 + rnd() * 0.05, 0.3 + rnd() * 0.15, 0.2 + rnd() * 0.08);
      crowns.setColorAt(k, c);
      k++;
    }
  }
  crowns.count = k;
  const g = new THREE.Group();
  g.add(trunks, crowns);
  return g;
}

/** Alambrado de 5 hilos con postes de madera (instanciados). */
function fence(x0: number, x1: number, z: number, step = 8) {
  const mats = getMaterials();
  const n = Math.floor((x1 - x0) / step) + 1;
  const postGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.4, 6);
  postGeo.translate(0, 0.7, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: '#7a6650', roughness: 0.95 });
  postMat.name = 'fencePost';
  const posts = new THREE.InstancedMesh(postGeo, postMat, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) posts.setMatrixAt(i, m.makeTranslation(x0 + i * step, 0, z + (rnd() - 0.5) * 0.1));
  const wireGeo = new THREE.CylinderGeometry(0.006, 0.006, x1 - x0, 3);
  wireGeo.rotateZ(Math.PI / 2);
  const wires = new THREE.InstancedMesh(wireGeo, mats.galvanized, 5);
  for (let i = 0; i < 5; i++) wires.setMatrixAt(i, m.makeTranslation((x0 + x1) / 2, 0.35 + i * 0.22, z));
  const g = new THREE.Group();
  g.add(posts, wires);
  return g;
}

/** Planta de silos (cilindros con techo cónico, escalera y anillos) y un galpón. */
function siloPlant() {
  const mats = getMaterials();
  const g = new THREE.Group();
  const body = new THREE.CylinderGeometry(4, 4, 12, 32, 6, true);
  const roof = new THREE.ConeGeometry(4.25, 2.8, 32);
  const ring = new THREE.TorusGeometry(4.02, 0.06, 4, 32).rotateX(Math.PI / 2);
  const bodies = new THREE.InstancedMesh(body, mats.galvanized, 3);
  const roofs = new THREE.InstancedMesh(roof, mats.galvanized, 3);
  const rings = new THREE.InstancedMesh(ring, mats.steel, 3 * 6);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 3; i++) {
    bodies.setMatrixAt(i, m.makeTranslation(i * 9, 6, 0));
    roofs.setMatrixAt(i, m.makeTranslation(i * 9, 13.4, 0));
    for (let r = 0; r < 6; r++) rings.setMatrixAt(i * 6 + r, m.makeTranslation(i * 9, 1 + r * 2, 0));
  }
  // galpón con techo a dos aguas
  const shedMat = new THREE.MeshStandardMaterial({ color: '#c9cdd1', roughness: 0.55, metalness: 0.6 });
  shedMat.name = 'shed';
  const shed = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 24), shedMat);
  shed.position.set(-16, 3, 4);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-7.4, 0);
  roofShape.lineTo(0, 2.6);
  roofShape.lineTo(7.4, 0);
  roofShape.closePath();
  const shedRoof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 24.6, bevelEnabled: false }), mats.galvanized);
  shedRoof.position.set(-16, 6, 4 - 12.3);
  g.add(bodies, roofs, rings, shed, shedRoof);
  return g;
}

let horizon: THREE.Group | null = null;
/** Horizonte completo (se construye una vez). */
export function fieldHorizon(): THREE.Group {
  if (horizon) return horizon;
  const g = new THREE.Group();
  // cortinas de eucaliptos a distintas distancias (con la neblina se ven en planos)
  g.add(treeLine(60, -260, 240, 230, 8, [14, 22]));
  g.add(treeLine(36, -200, 120, -210, 8, [12, 18]));
  const side = treeLine(30, -150, 150, 0, 6, [12, 20]);
  side.rotation.y = Math.PI / 2;
  side.position.x = -190;
  g.add(side);
  // alambrado del lote
  g.add(fence(-120, 120, 70));
  const f2 = fence(-80, 80, 0);
  f2.rotation.y = Math.PI / 2;
  f2.position.x = 60;
  g.add(f2);
  // silos y galpón
  const silos = siloPlant();
  silos.position.set(-150, 0, 200);
  g.add(silos);
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
    }
  });
  horizon = g;
  return g;
}
