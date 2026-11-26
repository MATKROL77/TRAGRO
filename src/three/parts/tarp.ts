/**
 * Piezas de lona con geometría dinámica:
 *  - RollTarp: lona enrollable superior (tolva y cobertor de batea).
 *  - PleatCurtain: lona lateral corrediza del sider.
 * Solo se actualizan vértices cuando cambia el valor de animación.
 */
import * as THREE from 'three';
import type { MaterialSet } from '../materials';

export interface RollTarpOptions {
  x0: number;
  x1: number;
  top: number;
  halfW: number;
  rise: number;
  bowSpacing: number;
}

const SKIRT = 0.12;

export class RollTarp {
  readonly group = new THREE.Group();
  private tarp: THREE.Mesh;
  private roll: THREE.Mesh;
  private o: RollTarpOptions;
  private nu = 30;
  private nx: number;
  private last = -1;

  constructor(o: RollTarpOptions, mats: MaterialSet) {
    this.o = o;
    this.nx = Math.max(4, Math.round((o.x1 - o.x0) / o.bowSpacing) * 4);
    const count = (this.nu + 1) * (this.nx + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const uv = new Float32Array(count * 2);
    const idx: number[] = [];
    for (let i = 0; i <= this.nx; i++) {
      for (let j = 0; j <= this.nu; j++) {
        const k = i * (this.nu + 1) + j;
        uv[k * 2] = ((o.x1 - o.x0) * i) / this.nx / 0.5;
        uv[k * 2 + 1] = (j / this.nu) * 6;
        if (i < this.nx && j < this.nu) {
          const a = k;
          const b = k + 1;
          const c = k + this.nu + 1;
          const d = c + 1;
          idx.push(a, b, c, b, d, c);
        }
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.tarp = new THREE.Mesh(geo, mats.lona);
    this.tarp.castShadow = true;
    this.tarp.receiveShadow = true;
    this.tarp.frustumCulled = false;
    this.tarp.name = 'tarp';

    const rollGeo = new THREE.CylinderGeometry(1, 1, o.x1 - o.x0 + 0.1, 16, 1);
    rollGeo.rotateZ(Math.PI / 2);
    this.roll = new THREE.Mesh(rollGeo, mats.lona);
    this.roll.castShadow = true;
    this.roll.name = 'tarpRoll';
    this.group.add(this.tarp, this.roll);
    this.update(0);
  }

  /** Punto del recorrido de la lona: s<0 faldón fijo, 0..1 sobre los arcos, >1 apoyo del rollo. */
  point(s: number, out: THREE.Vector2): THREE.Vector2 {
    const { halfW, top, rise } = this.o;
    if (s < 0) return out.set(-halfW - 0.006, top + (s / SKIRT) * 0.15);
    const z = -halfW + 2 * halfW * s;
    const k = 2 * s - 1;
    return out.set(z + (s > 1 ? 0.004 : 0), top + rise * (1 - k * k));
  }

  /** Posición actual del tubo enrollador (para el brazo/manivela). */
  rollPosition(t: number, out: THREE.Vector3): THREE.Vector3 {
    const sEnd = 1.02 - t * 0.9;
    const p = this.point(sEnd, new THREE.Vector2());
    const r = 0.04 + 0.04 * t;
    return out.set((this.o.x0 + this.o.x1) / 2, p.y + r * 0.9, p.x);
  }

  update(t: number): void {
    if (Math.abs(t - this.last) < 1e-4) return;
    this.last = t;
    const { x0, x1, bowSpacing } = this.o;
    const pos = this.tarp.geometry.getAttribute('position') as THREE.BufferAttribute;
    const sEnd = 1.02 - t * 0.9;
    const p = new THREE.Vector2();
    for (let i = 0; i <= this.nx; i++) {
      const x = x0 + ((x1 - x0) * i) / this.nx;
      const frac = (((x - x0) / bowSpacing) % 1 + 1) % 1;
      const sagX = Math.sin(Math.PI * frac) ** 2;
      for (let j = 0; j <= this.nu; j++) {
        const s = -SKIRT + ((sEnd + SKIRT) * j) / this.nu;
        this.point(s, p);
        const w = s > 0 && s < 1 ? Math.sin(Math.PI * s) : 0;
        pos.setXYZ(i * (this.nu + 1) + j, x, p.y + 0.012 - 0.03 * sagX * w, p.x);
      }
    }
    pos.needsUpdate = true;
    this.tarp.geometry.computeVertexNormals();
    this.tarp.geometry.computeBoundingSphere();
    const r = 0.04 + 0.04 * t;
    const rp = this.rollPosition(t, new THREE.Vector3());
    this.roll.position.copy(rp);
    this.roll.scale.set(1, r, r);
  }

  dispose(): void {
    this.tarp.geometry.dispose();
    this.roll.geometry.dispose();
  }
}

export interface CurtainOptions {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z: number;
  /** +1 / -1: lado hacia el que mira la lona. */
  side: 1 | -1;
  strapSpacing: number;
  /** Tensado a trinquete (tensores más grandes) en lugar de hebillas. */
  ratchet?: boolean;
}

/**
 * Lona lateral del sider: anclada en el marco trasero, se corre hacia atrás plegándose
 * en acordeón. El caño tensor viaja con el borde delantero.
 */
export class PleatCurtain {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private straps: THREE.Mesh;
  private buckles: THREE.InstancedMesh;
  private pole: THREE.Mesh;
  private o: CurtainOptions;
  private n: number;
  private last = -1;
  private m = new THREE.Matrix4();

  constructor(o: CurtainOptions, mats: MaterialSet) {
    this.o = o;
    const strapsCount = Math.max(2, Math.round((o.x1 - o.x0) / o.strapSpacing));
    this.n = strapsCount * 2;
    const cols = this.n + 1;

    // Lona: dos filas de vértices (arriba y abajo).
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(cols * 2 * 3);
    const rest = new Float32Array(cols * 2 * 3);
    const uv = new Float32Array(cols * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i < cols; i++) {
      const x = o.x0 + ((o.x1 - o.x0) * i) / this.n;
      for (let r = 0; r < 2; r++) {
        const k = i * 2 + r;
        rest[k * 3] = x;
        rest[k * 3 + 1] = r === 0 ? o.y0 : o.y1;
        rest[k * 3 + 2] = o.z;
        uv[k * 2] = (x - o.x0) / 0.6;
        uv[k * 2 + 1] = r === 0 ? 0 : (o.y1 - o.y0) / 0.6;
      }
      if (i < this.n) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        if (o.side === 1) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aLivery', new THREE.BufferAttribute(rest, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, mats.lona);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'curtain';

    // Correas verticales: una tira angosta por cada pliegue saliente.
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(strapsCount * 4 * 3), 3));
    const sidx: number[] = [];
    for (let s = 0; s < strapsCount; s++) {
      const a = s * 4;
      if (o.side === 1) sidx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else sidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    sgeo.setIndex(sidx);
    sgeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(strapsCount * 4 * 2), 2));
    this.straps = new THREE.Mesh(sgeo, mats.rubber);
    this.straps.frustumCulled = false;
    this.straps.name = 'curtainStraps';

    const bgeo = o.ratchet ? new THREE.BoxGeometry(0.075, 0.17, 0.045) : new THREE.BoxGeometry(0.06, 0.1, 0.022);
    this.buckles = new THREE.InstancedMesh(bgeo, mats.galvanized, strapsCount);
    this.buckles.frustumCulled = false;
    this.buckles.castShadow = true;
    // Caño tensor del borde delantero: se mueve con la lona.
    const pgeo = new THREE.CylinderGeometry(0.028, 0.028, o.y1 - o.y0 + 0.08, 12);
    this.pole = new THREE.Mesh(pgeo, mats.aluBrushed);
    this.pole.castShadow = true;
    this.group.add(this.mesh, this.straps, this.buckles, this.pole);
    this.update(0);
  }

  /**
   * t: 0 = cerrada, 1 = recogida atrás. release: 0..1, las hebillas se sueltan (bajan y se separan).
   */
  update(t: number, release = t > 0 ? 1 : 0): void {
    const key = t + release * 10;
    if (Math.abs(key - this.last) < 1e-4) return;
    this.last = key;
    const o = this.o;
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const spos = this.straps.geometry.getAttribute('position') as THREE.BufferAttribute;
    const len = o.x1 - o.x0;
    const k = 1 - t * 0.9;
    const seg = len / this.n;
    // Profundidad del pliegue: lo que "sobra" de lona en cada tramo.
    const depth = Math.min(0.14, Math.sqrt(Math.max(0, seg * seg - seg * k * (seg * k))) * 0.55) + 0.006;
    const drop = 0.07 * release;
    const outB = 0.03 * release;
    for (let i = 0; i <= this.n; i++) {
      // Anclada atrás (x0): el borde delantero viaja hacia el marco trasero.
      const x = o.x0 + ((len * i) / this.n) * k;
      const out = i % 2 === 1 ? 1 : 0;
      const z = o.z + o.side * depth * out;
      pos.setXYZ(i * 2, x, o.y0, z);
      pos.setXYZ(i * 2 + 1, x, o.y1, z);
      if (out) {
        const s = (i - 1) / 2;
        const hw = 0.024;
        const zz = z + o.side * 0.004;
        spos.setXYZ(s * 4, x - hw, o.y0 - 0.02 - drop, zz + o.side * outB);
        spos.setXYZ(s * 4 + 1, x - hw, o.y1 - 0.04, zz);
        spos.setXYZ(s * 4 + 2, x + hw, o.y0 - 0.02 - drop, zz + o.side * outB);
        spos.setXYZ(s * 4 + 3, x + hw, o.y1 - 0.04, zz);
        this.m.makeTranslation(x, o.y0 + 0.02 - drop, zz + o.side * (0.008 + outB + (o.ratchet ? 0.012 : 0)));
        this.buckles.setMatrixAt(s, this.m);
      }
    }
    this.pole.position.set(o.x0 + len * k, (o.y0 + o.y1) / 2, o.z + o.side * 0.02);
    pos.needsUpdate = true;
    spos.needsUpdate = true;
    this.buckles.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.straps.geometry.computeVertexNormals();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.straps.geometry.dispose();
    this.buckles.geometry.dispose();
    this.buckles.dispose();
    this.pole.geometry.dispose();
  }
}
