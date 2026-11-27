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

const STRAW_MAX = 16000;
/** franja de rastrojo: ancho (x) y largo (z) alrededor de la máquina (≈13 pajas/m² en calidad alta) */
const AREA_X = 34;
const AREA_Z = 36;

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
    const g = new THREE.CylinderGeometry(0.0035, 0.0045, 1, 3, 2, false);
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
      this.base[i * 5 + 3] = 0.05 + rnd() * rnd() * 0.22;
      this.base[i * 5 + 4] = (rnd() - 0.5) * 0.12;
      // tonos de paja seca, algo grisácea (como la textura del suelo)
      c.setHSL(0.1 + rnd() * 0.035, 0.18 + rnd() * 0.14, 0.5 + rnd() * 0.22);
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
      this.p.set(x, 0.006, z);
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

const DUST_MAX = 260;
let puffTex: THREE.Texture | null = null;
/** Mancha suave (degradé radial con ruido) para las partículas de polvo. */
function puffTexture(): THREE.Texture {
  if (puffTex) return puffTex;
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  puffTex = new THREE.CanvasTexture(c);
  puffTex.colorSpace = THREE.SRGBColorSpace;
  return puffTex;
}

export class DustEmitter {
  mesh: THREE.InstancedMesh;
  private parts: { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; s: number }[] = [];
  private m = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private acc = 0;

  constructor() {
    // cuadrados que miran a la cámara (la orientación se copia de la cámara en cada cuadro)
    const g = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: '#b8a383', map: puffTexture(), transparent: true, opacity: 0.22, depthWrite: false, fog: true });
    mat.name = 'dust';
    this.mesh = new THREE.InstancedMesh(g, mat, DUST_MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
  }

  /** Emite detrás de las tapadoras (`rowX`, z = `zBack`) proporcional a la velocidad. */
  update(dt: number, speed: number, rowX: number[], zBack: number, camQ: THREE.Quaternion) {
    if (speed > 0.3 && rowX.length) {
      this.acc += dt * speed * 4;
      while (this.acc > 1 && this.parts.length < DUST_MAX) {
        this.acc -= 1;
        const x = rowX[Math.floor(rnd() * rowX.length)] + (rnd() - 0.5) * 0.3;
        this.parts.push({ x, y: 0.08, z: zBack - rnd() * 0.3, vx: (rnd() - 0.5) * 0.25, vy: 0.12 + rnd() * 0.2, vz: -speed * (0.8 + rnd() * 0.15), age: 0, life: 1.2 + rnd() * 1.4, s: 0.25 + rnd() * 0.25 });
      }
    }
    let n = 0;
    for (const p of this.parts) {
      p.age += dt;
      if (p.age > p.life) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy *= 0.96;
      const k = p.age / p.life;
      // crece y se desvanece (la opacidad se simula con el tamaño: al final es grande y muy tenue)
      const size = p.s * (0.6 + k * 2.2) * Math.sin(Math.min(1, (1 - k) * 2.5) * Math.PI * 0.5);
      this.sc.setScalar(Math.max(0.001, size));
      this.v.set(p.x, p.y + size * 0.3, p.z);
      this.m.compose(this.v, camQ, this.sc);
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

/* ------------------------------ ruta ------------------------------ */

let verge: THREE.InstancedMesh | null = null;
/**
 * Matas de pasto a los costados de la ruta (franjas a la izquierda y derecha de las banquinas),
 * instanciadas; `xs` = centros de cada franja. Se desplazan con el avance como la ruta.
 */
export function roadVerge(xs: number[], width: number, tile = 70, count = 5400): THREE.InstancedMesh {
  if (verge) return verge;
  // mata: tres hojas cruzadas (planos finos), pocas caras
  const blade = new THREE.PlaneGeometry(0.05, 0.32, 1, 2);
  blade.translate(0, 0.16, 0);
  const pos = blade.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * (1 - pos.getY(i) / 0.34));
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const b = blade.clone();
    b.rotateZ((k - 1) * 0.35);
    b.rotateY((k * Math.PI) / 3);
    parts.push(b);
  }
  const geo = mergeTufts(parts);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide });
  mat.name = 'grassTuft';
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  // patrón periódico de `tile` metros repetido 3 veces: al desplazarlo módulo `tile` no hay saltos
  const per = Math.floor(count / 3);
  for (let i = 0; i < per; i++) {
    const x = xs[i % xs.length] + (rnd() - 0.5) * width;
    const z = rnd() * tile;
    const sc = 0.6 + rnd() * 0.9;
    const rotY = rnd() * 6.28;
    const sy = sc * (0.7 + rnd() * 0.8);
    // pasto pampeano a fin de invierno: verde apagado con puntas secas
    c.setHSL(0.17 + rnd() * 0.08, 0.3 + rnd() * 0.2, 0.3 + rnd() * 0.15);
    for (let k = -1; k <= 1; k++) {
      m.compose(new THREE.Vector3(x, 0, z + k * tile), q.setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(sc, sy, sc));
      mesh.setMatrixAt(i * 3 + k + 1, m);
      mesh.setColorAt(i * 3 + k + 1, c);
    }
  }
  mesh.count = per * 3;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  verge = mesh;
  return mesh;
}

function mergeTufts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const idx: number[] = [];
  let off = 0;
  for (const p of parts) {
    pos.set(p.getAttribute('position').array as Float32Array, off * 3);
    nor.set(p.getAttribute('normal').array as Float32Array, off * 3);
    const ix = p.index!.array;
    for (let k = 0; k < ix.length; k++) idx.push(ix[k] + off);
    off += p.getAttribute('position').count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

let sign: THREE.Group | null = null;
/** Cartel vial de advertencia en 3D: poste galvanizado, chapa con borde plegado y frente con símbolo. */
export function roadSign(): THREE.Group {
  if (sign) return sign;
  const mats = getMaterials();
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 10), mats.galvanized);
  post.position.y = 1.3;
  // frente: canvas con fondo amarillo, borde negro y símbolo de maquinaria agrícola (genérico)
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e8b923';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#151515';
  ctx.lineWidth = 16;
  ctx.strokeRect(14, 14, S - 28, S - 28);
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(-Math.PI / 4); // el cartel se gira 45°: el símbolo queda derecho
  ctx.fillStyle = '#151515';
  ctx.fillRect(-46, -8, 70, 30); // cuerpo del tractor
  ctx.fillRect(-10, -40, 30, 34); // cabina
  ctx.beginPath();
  ctx.arc(-30, 32, 22, 0, Math.PI * 2);
  ctx.arc(34, 38, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0 });
  face.name = 'signFace';
  const board = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.012), mats.galvanized);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), face);
  front.position.z = 0.0065;
  // borde plegado de la chapa
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.01, 4, 4), mats.galvanized);
  rim.rotation.z = Math.PI / 4;
  rim.scale.set(0.72, 0.72, 1);
  board.add(plate, front, rim);
  board.rotation.z = Math.PI / 4;
  board.position.set(0, 2.35, 0.05);
  // abrazaderas
  const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 10), mats.steel);
  const c1 = clamp.clone();
  c1.position.y = 2.15;
  const c2 = clamp.clone();
  c2.position.y = 2.55;
  g.add(post, board, c1, c2);
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  sign = g;
  return g;
}
