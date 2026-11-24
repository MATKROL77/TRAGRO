import * as THREE from 'three';
import type { Configuration } from '../../domain/types';
import type { MaterialSet } from '../../three/materials';
import { DIM, computeLayout, type SeederLayout } from './layout';
import { ROW, ROW_HOTSPOTS, buildRowUnit, type MatKey, type Part, type RowUnitOptions } from './rowUnit';
import {
  barBetween, cylinderX, cylinderZ, frustumGeo, hexBolt, lugsGeo, mergeAll, rimGeo, roundedBox, sagHose, tireGeo, tube,
} from './parts';
import { warningStripes } from '../../three/textures';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const phase = (t: number, a: number, b: number) => ease((t - a) / (b - a));
/** pivote de la lanza de trabajo (x del anclaje derecho) */
const DRAW_PIVOT = 0.36;

/* ------------------------------------------------------------------ */
/* Cuerpos de siembra instanciados                                      */
/* ------------------------------------------------------------------ */

interface SpinMesh { mesh: THREE.InstancedMesh; part: THREE.Matrix4; radius: number }

class RowUnitBatch {
  group = new THREE.Group();
  statics: THREE.InstancedMesh[] = [];
  spins: SpinMesh[] = [];
  private tmp = new THREE.Matrix4();
  private tmp2 = new THREE.Matrix4();
  private rot = new THREE.Matrix4();

  constructor(parts: Part[], mats: MaterialSet, count: number, ownGeoms: THREE.BufferGeometry[]) {
    const byMat = new Map<MatKey, THREE.BufferGeometry[]>();
    for (const p of parts) {
      if (p.spin) continue;
      const g = p.geometry.clone().applyMatrix4(p.matrix);
      const arr = byMat.get(p.mat) ?? [];
      arr.push(g);
      byMat.set(p.mat, arr);
    }
    const n = Math.max(1, count);
    for (const [mat, geos] of byMat) {
      const merged = mergeAll(geos);
      geos.forEach((g) => g.dispose());
      ownGeoms.push(merged);
      const im = new THREE.InstancedMesh(merged, mats[mat], n);
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.statics.push(im);
      this.group.add(im);
    }
    for (const p of parts) {
      if (!p.spin) continue;
      const im = new THREE.InstancedMesh(p.geometry, mats[p.mat], n);
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.spins.push({ mesh: im, part: p.matrix, radius: p.spin });
      this.group.add(im);
    }
    this.setCount(count);
  }

  setCount(count: number) {
    for (const m of this.statics) m.count = count;
    for (const s of this.spins) s.mesh.count = count;
  }

  update(xs: number[], dist: number, staticsToo: boolean) {
    for (let i = 0; i < xs.length; i++) {
      this.tmp.makeTranslation(xs[i], 0, 0);
      if (staticsToo) for (const m of this.statics) m.setMatrixAt(i, this.tmp);
      for (const s of this.spins) {
        this.rot.makeRotationX(dist / s.radius);
        this.tmp2.multiplyMatrices(this.tmp, s.part).multiply(this.rot);
        s.mesh.setMatrixAt(i, this.tmp2);
      }
    }
    if (staticsToo) for (const m of this.statics) m.instanceMatrix.needsUpdate = true;
    for (const s of this.spins) s.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/* Cilindro hidráulico entre dos anclajes                                */
/* ------------------------------------------------------------------ */

class HydCylinder {
  barrel: THREE.Mesh;
  rod: THREE.Mesh;
  group = new THREE.Group();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  constructor(
    public anchorA: THREE.Object3D,
    public anchorB: THREE.Object3D,
    mats: MaterialSet,
    geoms: THREE.BufferGeometry[],
    public barrelLen = 0.55,
    r = 0.045,
  ) {
    const bg = new THREE.CylinderGeometry(r, r, barrelLen, 18);
    bg.translate(0, barrelLen / 2, 0);
    const cap = new THREE.CylinderGeometry(r * 1.15, r * 1.15, 0.05, 18);
    cap.translate(0, 0.025, 0);
    const cap2 = cap.clone().translate(0, barrelLen - 0.05, 0);
    const port = new THREE.CylinderGeometry(r * 0.35, r * 0.35, r * 1.3, 8).rotateZ(Math.PI / 2).translate(r * 0.9, barrelLen * 0.15, 0);
    const port2 = port.clone().translate(0, barrelLen * 0.7, 0);
    const barrelGeo = mergeAll([bg, cap, cap2, port, port2]);
    const rodGeo = new THREE.CylinderGeometry(r * 0.48, r * 0.48, 1, 14);
    rodGeo.translate(0, 0.5, 0);
    geoms.push(barrelGeo, rodGeo);
    this.barrel = new THREE.Mesh(barrelGeo, mats.paintDark);
    this.rod = new THREE.Mesh(rodGeo, mats.chrome);
    this.barrel.castShadow = this.rod.castShadow = true;
    this.group.add(this.barrel, this.rod);
  }
  update(space: THREE.Object3D) {
    this.anchorA.getWorldPosition(this.a);
    this.anchorB.getWorldPosition(this.b);
    space.worldToLocal(this.a);
    space.worldToLocal(this.b);
    const dir = this.b.clone().sub(this.a);
    const len = dir.length();
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(this.up, dir);
    this.barrel.position.copy(this.a);
    this.barrel.quaternion.copy(q);
    const rodLen = Math.max(0.05, len - this.barrelLen + 0.04);
    this.rod.position.copy(this.a).addScaledVector(dir, this.barrelLen - 0.04);
    this.rod.quaternion.copy(q);
    this.rod.scale.set(1, rodLen, 1);
  }
}

/* ------------------------------------------------------------------ */
/* Modelo                                                                */
/* ------------------------------------------------------------------ */

export interface DecalSpec { texture: THREE.Texture | null }

export interface SeederState {
  poseT: number; // 0 trabajo · 1 transporte
  distance: number; // metros recorridos (giro de discos y ruedas)
}

export function geometricSignature(cfg: Configuration): string {
  const s = cfg.selections;
  return JSON.stringify([cfg.model, cfg.rows, cfg.spacingCm, s.transport, s.transportWheels, s.seedHopper, s.seedCapacity, s.fertilizer, s.fertCapacity, s.coulter, s.closing, s.firmer, s.downforce, s.metering]);
}

export class SeederModel {
  root = new THREE.Group();
  chassis = new THREE.Group();
  layout: SeederLayout;
  anchors: Record<string, THREE.Object3D> = {};
  private geoms: THREE.BufferGeometry[] = [];
  private ownedMaterials: THREE.Material[] = [];
  private batches: { id: string; batch: RowUnitBatch; rows: number[] }[] = [];
  private bars: { id: string; mesh: THREE.Mesh }[] = [];
  private wingPivots: Record<'L' | 'R', { pivot: THREE.Group; inner: THREE.Group } | undefined> = { L: undefined, R: undefined };
  private cylinders: HydCylinder[] = [];
  private mainWheels: { arm: THREE.Group; wheel: THREE.Group; side: number }[] = [];
  private carriage?: { arm: THREE.Group; wheels: THREE.Group[]; group: THREE.Group };
  private drawbar = new THREE.Group();
  private tHitch?: THREE.Group;
  private endKits: { group: THREE.Group; side: number }[] = [];
  private bridgeHoses: { mesh: THREE.Mesh; a: THREE.Object3D; b: THREE.Object3D; sag: number; r: number }[] = [];
  private decalMeshes: THREE.Mesh[] = [];
  curX: number[];
  private targetX: number[];
  private lastDist = -1;
  private lastPose = -1;
  private sliding = true;
  private hingeX = 0;
  hitchLocal = V(0, 0.55, DIM.hitchZ);

  constructor(public cfg: Configuration, private mats: MaterialSet, prev?: SeederModel | null) {
    this.layout = computeLayout(cfg);
    this.targetX = this.layout.rowX.slice();
    this.curX = this.initialX(prev);
    this.root.add(this.chassis);
    this.root.name = 'seeder';
    this.build();
    this.updateRows(0, true);
    this.applyPose(prev ? prev.state.poseT : 0, true);
  }

  state: SeederState = { poseT: 0, distance: 0 };

  private initialX(prev?: SeederModel | null): number[] {
    const n = this.targetX.length;
    if (!prev) return this.targetX.slice();
    const old = prev.curX;
    const on = old.length;
    return this.targetX.map((_, i) => {
      const off = i - (n - 1) / 2;
      const j = Math.round(off + (on - 1) / 2);
      if (j < 0) return old[0] ?? 0;
      if (j >= on) return old[on - 1] ?? 0;
      return old[j];
    });
  }

  private track<T extends THREE.BufferGeometry>(g: T): T {
    this.geoms.push(g);
    return g;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, pos?: THREE.Vector3, rot?: THREE.Euler, shadow = true): THREE.Mesh {
    const m = new THREE.Mesh(this.track(geo), mat);
    if (pos) m.position.copy(pos);
    if (rot) m.rotation.copy(rot);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  private anchor(name: string, parent: THREE.Object3D, pos: THREE.Vector3): THREE.Object3D {
    const o = new THREE.Object3D();
    o.position.copy(pos);
    o.name = name;
    parent.add(o);
    this.anchors[name] = o;
    return o;
  }

  /* -------------------------- construcción -------------------------- */

  private build() {
    const L = this.layout;
    const mats = this.mats;
    const s = this.cfg.selections;
    const opts: RowUnitOptions = {
      coulter: s.coulter as RowUnitOptions['coulter'],
      closing: s.closing as RowUnitOptions['closing'],
      firmer: s.firmer === 'on',
      downforce: s.downforce as RowUnitOptions['downforce'],
      metering: s.metering as RowUnitOptions['metering'],
      fert: L.fert,
      hopper: L.hasCentralSeed ? 'central' : 'individual',
      hopperL: L.individualHopperL,
    };
    const parts = buildRowUnit(opts);

    // Secciones: centro + alas
    for (const sec of L.sections) {
      let parent: THREE.Object3D = this.chassis;
      if (sec.id !== 'C') {
        const pivot = new THREE.Group();
        const inner = new THREE.Group();
        pivot.add(inner);
        this.chassis.add(pivot);
        this.wingPivots[sec.id] = { pivot, inner };
        parent = inner;
      }
      const batch = new RowUnitBatch(parts, mats, sec.rows.length, this.geoms);
      parent.add(batch.group);
      this.batches.push({ id: sec.id, batch, rows: sec.rows });
      // tubo porta-herramientas (geometría de largo 1, se escala)
      const barGeo = roundedBox(1, DIM.barSize, DIM.barSize, 0.012, 1);
      const bar = this.mesh(barGeo, mats.paintMain, parent);
      bar.position.set(0, DIM.barY, 0);
      this.bars.push({ id: sec.id, mesh: bar });
    }
    parts.forEach((p) => p.geometry.dispose());

    this.buildDrawbar();
    this.buildMainWheels();
    this.buildTanks();
    this.buildHoses();
    this.buildEndKits();
    if (L.transport === 'fold') this.buildFoldKit();
    else this.buildLongitudinalKit();
    this.buildHotspotAnchors();
  }

  private buildDrawbar() {
    const mats = this.mats;
    const by = DIM.barY;
    const g = this.drawbar;
    g.position.set(DRAW_PIVOT, 0, 0.09);
    this.chassis.add(g);
    const inner = new THREE.Group();
    inner.position.set(-DRAW_PIVOT, 0, -0.09);
    g.add(inner);
    const hitch = V(0, 0.56, DIM.hitchZ);
    for (const sx of [-1, 1]) {
      this.mesh(barBetween(V(sx * DRAW_PIVOT, by - 0.02, 0.12), V(sx * 0.12, 0.62, DIM.hitchZ - 0.45), 0.07, 8, true), mats.paintMain, inner);
      // placa de unión al bastidor
      this.mesh(roundedBox(0.24, 0.28, 0.04, 0.008), mats.paintMain, inner, V(sx * DRAW_PIVOT, by, 0.1));
      for (const dy of [-0.08, 0.08]) for (const dx of [-0.07, 0.07]) this.mesh(hexBolt(0.016, 0.02).rotateX(Math.PI / 2), mats.galvanized, inner, V(sx * DRAW_PIVOT + dx, by + dy, 0.13));
    }
    this.mesh(barBetween(V(-0.26, 0.7, 1.2), V(0.26, 0.7, 1.2), 0.045, 8, true), mats.paintMain, inner);
    this.mesh(barBetween(V(0, 0.62, DIM.hitchZ - 0.5), V(0, 0.58, DIM.hitchZ - 0.1), 0.07, 8, true), mats.paintMain, inner);
    this.mesh(roundedBox(0.26, 0.1, 0.34, 0.015), mats.paintMain, inner, V(0, 0.6, DIM.hitchZ - 0.4));
    // ojo de enganche
    const eye = new THREE.TorusGeometry(0.055, 0.022, 10, 20).rotateX(Math.PI / 2);
    this.mesh(eye, mats.castIron, inner, hitch);
    // pata de apoyo con manivela
    const jx = 0.32;
    const jz = DIM.hitchZ - 0.75;
    this.mesh(roundedBox(0.08, 0.6, 0.08, 0.008), mats.paintAccent, inner, V(jx, 0.42, jz));
    this.mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.35, 10), mats.chrome, inner, V(jx, 0.17, jz));
    this.mesh(roundedBox(0.2, 0.02, 0.2, 0.006), mats.paintDark, inner, V(jx, 0.01, jz));
    this.mesh(barBetween(V(jx, 0.74, jz), V(jx + 0.16, 0.76, jz), 0.01), mats.steel, inner);
    this.mesh(cylinderX(0.016, 0.08), mats.plastic, inner, V(jx + 0.18, 0.76, jz));
    // mangueras hidráulicas y cadena de seguridad hacia el tractor
    for (const [k, dx] of [[0, -0.05], [1, 0.0], [2, 0.05]] as const) {
      const pts = [V(-0.1 + dx, 0.7, DIM.hitchZ + 0.28), V(-0.1 + dx, 0.7, DIM.hitchZ - 0.3), V(-0.13 + dx, 0.72, 1.6), V(-0.2 + dx, 0.8, 0.6), V(0.0 + dx * 2, by + 0.11, 0.16)];
      this.mesh(tube(pts, 0.012 + k * 0.001, 60, 6), mats.hose, inner, undefined, undefined, false);
    }
    // ficha del monitor / arnés
    this.mesh(tube([V(0.12, 0.69, DIM.hitchZ + 0.2), V(0.12, 0.69, DIM.hitchZ - 0.3), V(0.15, 0.71, 1.6), V(0.22, 0.79, 0.6), V(0.3, by + 0.11, 0.18)], 0.009, 50, 5), mats.cable, inner, undefined, undefined, false);
    this.mesh(roundedBox(0.06, 0.05, 0.09, 0.01), mats.paintAccent, inner, V(0.12, 0.72, DIM.hitchZ + 0.22));
    const chain = sagHose(V(-0.05, 0.56, DIM.hitchZ - 0.15), V(0.05, 0.56, DIM.hitchZ + 0.15), 0.008, 0.06, 12);
    this.mesh(chain, mats.galvanized, inner, undefined, undefined, false);
    this.anchor('monitor', inner, V(0.12, 0.9, DIM.hitchZ - 0.1));
    this.anchor('hitch', inner, hitch);
  }

  private buildMainWheels() {
    const mats = this.mats;
    const flot = this.cfg.selections.transportWheels === 'flotation';
    const R = flot ? 0.43 : 0.4;
    const W = flot ? 0.36 : 0.22;
    const tireG = this.track(tireGeo(R, W, R - 0.14, { segs: 56, squareness: 0.55 }));
    const lugG = this.track(lugsGeo(R - 0.012, W * 0.92, 22, flot ? 0.025 : 0.03));
    const rimG = this.track(rimGeo(R - 0.14, W * 0.95, 0.05));
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.95, DIM.barY - 0.06, 0.45);
      this.chassis.add(arm);
      // brazo con soporte al bastidor
      this.mesh(roundedBox(0.12, 0.2, 0.22, 0.01), mats.paintMain, this.chassis, V(side * 0.95, DIM.barY - 0.02, 0.26));
      const wheel = new THREE.Group();
      arm.add(wheel);
      this.mesh(barBetween(V(side * -0.15, 0, 0), V(side * -0.15, 0, 0.7), 0.05, 8, true), mats.paintMain, arm);
      this.mesh(cylinderX(0.035, 0.18), mats.steel, arm, V(side * -0.07, 0, 0.7));
      wheel.position.set(0, 0, 0.7);
      const t = new THREE.Mesh(tireG, mats.tire);
      const lugs = new THREE.Mesh(lugG, mats.rubber);
      const rim = new THREE.Mesh(rimG, mats.paintAccent);
      for (const m of [t, lugs, rim]) {
        m.castShadow = true;
        m.receiveShadow = true;
        wheel.add(m);
      }
      this.mainWheels.push({ arm, wheel, side });
    }
    this.mainWheelR = R;
  }
  private mainWheelR = 0.4;

  private buildTanks() {
    const L = this.layout;
    const mats = this.mats;
    if (!L.tanks.length) return;
    const py = DIM.platformY;
    const span = Math.max(...L.tanks.map((t) => Math.abs(t.x) + t.width / 2)) + 0.12;
    const zFront = DIM.tankZ + DIM.tankDepth / 2 + 0.08;
    const zBack = DIM.tankZ - DIM.tankDepth / 2 - 0.08;
    // estructura: postes y largueros
    for (const sx of [-1, 1]) {
      for (const z of [-0.12, zBack + 0.05]) {
        this.mesh(barBetween(V(sx * (span - 0.06), DIM.barY + 0.08, z), V(sx * (span - 0.06), py, z), 0.04, 8, true), mats.paintMain, this.chassis);
      }
      this.mesh(barBetween(V(sx * (span - 0.06), py - 0.04, 0.0), V(sx * (span - 0.06), py - 0.04, zBack - 0.55), 0.045, 8, true), mats.paintMain, this.chassis);
      // diagonal
      this.mesh(barBetween(V(sx * (span - 0.06), DIM.barY + 0.1, -0.1), V(sx * (span - 0.06), py - 0.06, zBack + 0.1), 0.025, 6, true), mats.paintMain, this.chassis);
    }
    this.mesh(barBetween(V(-span, py - 0.04, zFront), V(span, py - 0.04, zFront), 0.04, 8, true), mats.paintMain, this.chassis);
    this.mesh(barBetween(V(-span, py - 0.04, zBack), V(span, py - 0.04, zBack), 0.04, 8, true), mats.paintMain, this.chassis);

    for (const t of L.tanks) {
      const g = new THREE.Group();
      g.position.set(t.x, t.bottomY + t.hopperH, t.z);
      this.chassis.add(g);
      this.mesh(frustumGeo(t.width, t.depth, 0.32, 0.3, t.hopperH), mats.paintMain, g);
      this.mesh(roundedBox(t.width, t.height, t.depth, 0.05, 3), mats.paintMain, g, V(0, t.height / 2, 0));
      // tapa con bisagra y manija
      this.mesh(roundedBox(t.width * 0.86, 0.05, t.depth * 0.8, 0.02), mats.paintAccent, g, V(0, t.height + 0.02, -0.02));
      this.mesh(cylinderX(0.014, t.width * 0.8), mats.steel, g, V(0, t.height + 0.02, -t.depth * 0.42));
      this.mesh(barBetween(V(-0.15, t.height + 0.06, t.depth * 0.36), V(0.15, t.height + 0.06, t.depth * 0.36), 0.012), mats.steel, g);
      // refuerzos verticales y visor de nivel
      for (const dx of [-0.33, 0.33]) this.mesh(roundedBox(0.04, t.height * 0.96, 0.025, 0.008), mats.paintMain, g, V(dx * t.width, t.height / 2, t.depth / 2 + 0.01));
      this.mesh(roundedBox(0.06, t.height * 0.6, 0.012, 0.004), mats.glass, g, V(t.width / 2 - 0.12, t.height * 0.5, t.depth / 2 + 0.005), undefined, false);
      // salida inferior / dosificador de la tolva
      this.mesh(roundedBox(0.36, 0.14, 0.34, 0.02), mats.castIron, g, V(0, -t.hopperH - 0.07, 0));
      this.anchor(`tank-${t.kind}`, g, V(0, t.height + 0.1, 0));
      this.anchor(`tank-${t.kind}-out`, g, V(0, -t.hopperH - 0.15, 0));
      this.anchor(`tank-${t.kind}-decalF`, g, V(0, t.height * 0.55, t.depth / 2 + 0.006));
      this.anchor(`tank-${t.kind}-decalS`, g, V(t.width / 2 + 0.006, t.height * 0.55, 0));
      (g.userData as { tank: typeof t }).tank = t;
    }
    // pasarela trasera con chapa antideslizante, baranda y escalera
    const wz = zBack - 0.3;
    const walk = this.mesh(roundedBox(span * 2, 0.03, 0.46, 0.008), mats.plate, this.chassis, V(0, py, wz));
    walk.receiveShadow = true;
    for (const x of [-span, -span / 3, span / 3, span]) {
      this.mesh(barBetween(V(x, py, wz - 0.2), V(x, py + 1.0, wz - 0.2), 0.02, 8), mats.paintAccent, this.chassis);
    }
    for (const y of [0.55, 1.0]) this.mesh(barBetween(V(-span, py + y, wz - 0.2), V(span, py + y, wz - 0.2), 0.02, 8), mats.paintAccent, this.chassis);
    for (const sx of [-1, 1]) {
      this.mesh(barBetween(V(sx * span, py + 1.0, wz - 0.2), V(sx * span, py + 1.0, wz + 0.2), 0.02, 8), mats.paintAccent, this.chassis);
      this.mesh(barBetween(V(sx * span, py + 0.55, wz - 0.2), V(sx * span, py + 0.55, wz + 0.2), 0.02, 8), mats.paintAccent, this.chassis);
    }
    // escalera
    const lx = span - 0.05;
    const ladder = new THREE.Group();
    ladder.position.set(lx, 0, wz - 0.25);
    this.chassis.add(ladder);
    for (const dz of [-0.2, 0.2]) this.mesh(barBetween(V(0, py, dz), V(0.12, 0.35, dz - 0.35), 0.022, 6, true), mats.paintMain, ladder);
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      this.mesh(roundedBox(0.09, 0.02, 0.4, 0.004), mats.plate, ladder, V(0.12 * t, py + (0.35 - py) * t, -0.35 * t));
    }
  }

  private parentOf(sectionId: string): THREE.Object3D {
    if (sectionId === 'L' || sectionId === 'R') return this.wingPivots[sectionId]?.inner ?? this.chassis;
    return this.chassis;
  }

  private buildHoses() {
    const L = this.layout;
    const mats = this.mats;
    const by = DIM.barY;
    const mp = ROW.meter.pos;
    // Mangueras de semilla (tolva central) y de fertilizante hacia cada surco.
    const feeds: { kind: 'seed' | 'fert'; r: number; mat: THREE.Material; end: (x: number) => THREE.Vector3 }[] = [];
    if (L.hasCentralSeed) feeds.push({ kind: 'seed', r: 0.016, mat: mats.seedHose, end: (x) => V(x, mp.y + 0.3, mp.z + 0.02) });
    if (L.fert === 'inline') feeds.push({ kind: 'fert', r: 0.018, mat: mats.hose, end: (x) => V(x, by + 0.2, 0.08) });
    if (L.fert === 'side') feeds.push({ kind: 'fert', r: 0.018, mat: mats.hose, end: (x) => V(x + 0.1, by + 0.15, -0.04) });
    for (const f of feeds) {
      const tank = L.tanks.find((t) => t.kind === f.kind);
      if (!tank) continue;
      const outY = tank.bottomY - 0.15;
      const zSign = f.kind === 'seed' ? 1 : -1;
      for (const sec of L.sections) {
        const parent = this.parentOf(sec.id);
        const geos: THREE.BufferGeometry[] = [];
        // cabezal distribuidor por sección
        const headX = sec.id === 'C' ? tank.x : sec.id === 'L' ? sec.x1 - 0.5 : sec.x0 + 0.5;
        const head = V(headX, by + 0.28, -0.3 + zSign * 0.05);
        if (sec.id !== 'C') {
          // cabezal sobre el ala + manguera puente desde la tolva (se recalcula al plegar)
          this.mesh(cylinderZ(0.07, 0.14, 14), mats.plastic, parent, head);
          const a = this.anchor(`bridgeA-${f.kind}-${sec.id}`, this.chassis, V(tank.x + (sec.id === 'L' ? -0.12 : 0.12), outY, tank.z));
          const b = this.anchor(`bridgeB-${f.kind}-${sec.id}`, parent, head.clone().add(V(0, 0.06, 0)));
          const mesh = this.mesh(new THREE.BufferGeometry(), f.mat, this.chassis, undefined, undefined, false);
          this.bridgeHoses.push({ mesh, a, b, sag: 0.15, r: f.r * 2.2 });
        } else {
          geos.push(cylinderZ(0.09, 0.16, 16).translate(head.x, head.y, head.z));
          geos.push(tube([V(tank.x, outY, tank.z), V(tank.x, by + 0.6, tank.z + 0.3), head.clone().add(V(0, 0.08, 0))], f.r * 2.4, 16, 8));
        }
        // las mangueras corren en haz sobre el tubo y bajan en cada surco
        const bundleZ = f.kind === 'seed' ? -0.16 : -0.05;
        sec.rows.forEach((ri, k) => {
          const x = L.rowX[ri];
          const e = f.end(x);
          const dir = Math.sign(x - head.x) || 1;
          const lane = (k % 4) * 0.022;
          const yb = by + DIM.barSize / 2 + 0.03 + lane * 0.6;
          const p1 = V(head.x + dir * 0.12, yb + 0.06, bundleZ - lane);
          const p2 = V(x - dir * 0.18, yb, bundleZ - lane);
          const p3 = V(x, (yb + e.y) / 2 + 0.04, (bundleZ + e.z) / 2);
          geos.push(tube([head, p1, p2, p3, e], f.r, Math.max(16, Math.round(Math.abs(x - head.x) * 10)), 6));
        });
        if (geos.length) this.mesh(mergeAll(geos), f.mat, parent, undefined, undefined, false);
        geos.forEach((g) => g.dispose());
      }
    }
    // Cableado de dosificación eléctrica: mazo a lo largo del tubo
    if (this.cfg.selections.metering === 'electric' || this.cfg.selections.metering === 'pneumatic') {
      for (const sec of L.sections) {
        const parent = this.parentOf(sec.id);
        const isVac = this.cfg.selections.metering === 'pneumatic';
        const pts = [V(sec.x0 + 0.1, by + 0.12, isVac ? -0.07 : -0.11), V((sec.x0 + sec.x1) / 2, by + 0.125, isVac ? -0.07 : -0.11), V(sec.x1 - 0.1, by + 0.12, isVac ? -0.07 : -0.11)];
        this.mesh(tube(pts, isVac ? 0.05 : 0.014, 24, isVac ? 12 : 6), isVac ? mats.seedHose : mats.cable, parent, undefined, undefined, false);
      }
    }
    // Mangueras hidráulicas sobre el bastidor central
    const cx = L.transport === 'fold' ? L.hingeX - 0.3 : Math.min(2.4, L.barLength / 2 - 0.4);
    for (const side of [-1, 1]) {
      for (const k of [0, 1]) {
        const pts = [V(side * 0.85, by + 0.12, 0.08 + k * 0.03), V(side * (cx * 0.5), by + 0.14 + k * 0.01, 0.07 + k * 0.03), V(side * cx, by + 0.16, 0.06 + k * 0.03)];
        this.mesh(tube(pts, 0.011, 30, 6), mats.hose, this.chassis, undefined, undefined, false);
      }
    }
  }

  private buildEndKits() {
    // faros, reflectivos y franjas de advertencia en los extremos (siguen al extremo del tubo)
    const mats = this.mats;
    const warnMat = new THREE.MeshStandardMaterial({ map: warningStripes(), roughness: 0.4 });
    this.ownedMaterials.push(warnMat);
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      const sec = side < 0 ? this.layout.sections[0] : this.layout.sections[this.layout.sections.length - 1];
      this.parentOf(sec.id).add(g);
      this.mesh(roundedBox(0.04, 0.3, 0.3, 0.01), warnMat, g, V(side * 0.03, DIM.barY + 0.05, 0.02));
      this.mesh(roundedBox(0.08, 0.06, 0.04, 0.012), mats.lightAmber, g, V(side * 0.02, DIM.barY + 0.24, 0.12));
      this.mesh(roundedBox(0.08, 0.06, 0.04, 0.012), mats.lightRed, g, V(side * 0.02, DIM.barY + 0.24, -0.1));
      this.mesh(barBetween(V(side * 0.02, DIM.barY + 0.08, 0), V(side * 0.02, DIM.barY + 0.22, 0), 0.012), mats.steel, g);
      this.endKits.push({ group: g, side });
    }
  }

  private buildFoldKit() {
    const mats = this.mats;
    const by = DIM.barY;
    const top = by + DIM.barSize / 2;
    for (const sid of ['L', 'R'] as const) {
      const side = sid === 'L' ? -1 : 1;
      const wp = this.wingPivots[sid];
      if (!wp) continue;
      // torre en la sección central y oreja en el ala
      const tower = new THREE.Group();
      tower.name = `tower-${sid}`;
      this.chassis.add(tower);
      this.mesh(roundedBox(0.16, 0.46, 0.14, 0.012), mats.paintMain, tower, V(0, top + 0.23, 0));
      this.mesh(barBetween(V(0, top + 0.4, 0), V(-side * 0.45, top, 0), 0.03, 6, true), mats.paintMain, tower);
      const lug = new THREE.Group();
      wp.inner.add(lug);
      this.mesh(roundedBox(0.16, 0.26, 0.14, 0.012), mats.paintMain, lug, V(0, top + 0.13, 0));
      // bisagras
      const knuckle = new THREE.Group();
      wp.inner.add(knuckle);
      for (const dz of [-0.07, 0.07]) this.mesh(cylinderZ(0.05, 0.05, 16), mats.paintMain, knuckle, V(0, top, dz));
      this.mesh(cylinderZ(0.022, 0.24, 10), mats.chrome, knuckle, V(0, top, 0));
      const a = this.anchor(`cylA-${sid}`, tower, V(0, top + 0.42, 0.1));
      const b = this.anchor(`cylB-${sid}`, lug, V(0, top + 0.22, 0.1));
      const cyl = new HydCylinder(a, b, mats, this.geoms, 0.33, 0.045);
      this.chassis.add(cyl.group);
      this.cylinders.push(cyl);
      (tower.userData as { side: number }).side = side;
      (lug.userData as { side: number }).side = side;
      (knuckle.userData as { knuckle: number }).knuckle = side;
      this.foldParts.push({ tower, lug, knuckle, side });
    }
  }
  private foldParts: { tower: THREE.Group; lug: THREE.Group; knuckle: THREE.Group; side: number }[] = [];

  private buildLongitudinalKit() {
    const mats = this.mats;
    const by = DIM.barY;
    const zc = (DIM.rowFrontZ + DIM.rowRearZ) / 2;
    // Tren de transporte en el extremo derecho (ruedas con eje en Z: ruedan a lo largo del tubo)
    const group = new THREE.Group();
    this.chassis.add(group);
    this.mesh(roundedBox(0.22, 0.22, 2.6, 0.015), mats.paintMain, group, V(0.12, by, zc));
    const arm = new THREE.Group();
    arm.position.set(0.12, by - 0.05, zc);
    group.add(arm);
    const R = 0.38;
    const tireG = this.track(tireGeo(R, 0.24, R - 0.13, { segs: 48, squareness: 0.55 }).rotateY(Math.PI / 2));
    const lugG = this.track(lugsGeo(R - 0.012, 0.22, 20, 0.028).rotateY(Math.PI / 2));
    const rimG = this.track(rimGeo(R - 0.13, 0.22, 0.05).rotateY(Math.PI / 2));
    const wheels: THREE.Group[] = [];
    const armLen = by - 0.05 + DIM.lift - R;
    this.mesh(roundedBox(0.14, armLen, 0.14, 0.012), mats.paintMain, arm, V(0, -armLen / 2, 0));
    this.mesh(roundedBox(0.12, 0.12, 2.25, 0.012), mats.paintMain, arm, V(0, -armLen, 0));
    for (const dz of [-1.05, 1.05]) {
      const w = new THREE.Group();
      w.position.set(0, -armLen, dz);
      arm.add(w);
      for (const [g, m] of [[tireG, mats.tire], [lugG, mats.rubber], [rimG, mats.paintAccent]] as const) {
        const mesh = new THREE.Mesh(g, m);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        w.add(mesh);
      }
      wheels.push(w);
    }
    // guía vertical y cilindro de levante del tren
    this.mesh(roundedBox(0.16, 0.75, 0.16, 0.012), mats.paintMain, group, V(0.12, by + 0.42, zc + 0.3));
    this.mesh(roundedBox(0.16, 0.75, 0.16, 0.012), mats.paintMain, group, V(0.12, by + 0.42, zc - 0.3));
    this.mesh(roundedBox(0.2, 0.08, 0.8, 0.012), mats.paintMain, group, V(0.12, by + 0.8, zc));
    const ca = this.anchor('carriageCylA', group, V(0.12, by + 0.78, zc));
    const cb = this.anchor('carriageCylB', arm, V(0, -0.05, 0));
    const cyl = new HydCylinder(ca, cb, mats, this.geoms, 0.4, 0.05);
    this.chassis.add(cyl.group);
    this.cylinders.push(cyl);
    this.carriage = { arm, wheels, group };
    this.anchor('transport', group, V(0.2, by + 0.6, zc));

    // Lanza de transporte telescópica en el extremo izquierdo
    const th = new THREE.Group();
    this.chassis.add(th);
    const inner = new THREE.Group();
    th.add(inner);
    this.mesh(roundedBox(1, 0.12, 0.12, 0.012).translate(-0.5, 0, 0), mats.paintMain, inner, V(0, by - 0.05, zc));
    const eye = new THREE.TorusGeometry(0.055, 0.022, 10, 20).rotateX(Math.PI / 2);
    const eyeMesh = this.mesh(eye, mats.castIron, th, V(-1, by - 0.05, zc));
    eyeMesh.name = 'tEye';
    this.tHitch = th;
    this.tHitchInner = inner;
    this.tHitchEye = eyeMesh;
  }
  private tHitchInner?: THREE.Group;
  private tHitchEye?: THREE.Mesh;

  private buildHotspotAnchors() {
    // cuerpo del surco central (o el más cercano al centro, en la sección central)
    const c = this.batches.find((b) => b.id === 'C');
    const mid = c ? c.rows[Math.floor(c.rows.length / 2)] : 0;
    const x = this.layout.rowX[mid] ?? 0;
    for (const [k, p] of Object.entries(ROW_HOTSPOTS)) this.anchor(`hs-${k}`, this.chassis, p.clone().add(V(x, 0, 0)));
    const tank = this.layout.tanks[0];
    if (tank) this.anchors['hs-hoppers'] = this.anchors[`tank-${tank.kind}`];
    else this.anchor('hs-hoppers', this.chassis, V(x, ROW.meter.pos.y + 0.75, ROW.meter.pos.z));
    if (this.layout.transport === 'fold') {
      const sid = 'R';
      const wp = this.wingPivots[sid];
      if (wp) this.anchor('hs-transport', wp.inner, V(this.layout.hingeX, DIM.barY + 0.6, 0));
    } else this.anchors['hs-transport'] = this.anchors['transport'];
    this.anchors['hs-monitor'] = this.anchors['monitor'];
  }

  /* -------------------------- decals -------------------------- */

  setDecal(texture: THREE.Texture | null) {
    for (const m of this.decalMeshes) {
      m.removeFromParent();
      (m.material as THREE.Material).dispose();
    }
    this.decalMeshes = [];
    if (!texture) return;
    const place = (anchor: THREE.Object3D | undefined, w: number, rotY: number) => {
      if (!anchor) return;
      const h = w * 0.375;
      const mat = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.35, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
      const m = new THREE.Mesh(this.decalGeo, mat);
      m.scale.set(w, h, 1);
      m.rotation.y = rotY;
      anchor.add(m);
      this.decalMeshes.push(m);
    };
    for (const t of this.layout.tanks) {
      place(this.anchors[`tank-${t.kind}-decalF`], Math.min(t.width * 0.62, t.height * 2.2), 0);
      place(this.anchors[`tank-${t.kind}-decalS`], Math.min(t.depth * 0.8, t.height * 2.2), Math.PI / 2);
    }
    if (!this.layout.tanks.length) {
      // calcomanía sobre el frente del tubo porta-herramientas
      const a = this.anchors['barDecal'] ?? this.anchor('barDecal', this.chassis, V(0, DIM.barY, DIM.barSize / 2 + 0.004));
      place(a, 0.45, 0);
    }
  }
  private decalGeo = this.track(new THREE.PlaneGeometry(1, 1));

  /* -------------------------- animación -------------------------- */

  /** Devuelve true si algo se movió (para pedir otro frame). */
  update(dt: number, poseTarget: number, distance: number, poseSpeed = 1 / 7): boolean {
    let moving = false;
    // deslizamiento de cuerpos hacia su nueva posición
    if (this.sliding) {
      const k = 1 - Math.exp(-dt * 6);
      let maxD = 0;
      for (let i = 0; i < this.curX.length; i++) {
        const d = this.targetX[i] - this.curX[i];
        this.curX[i] += d * k;
        maxD = Math.max(maxD, Math.abs(d));
      }
      if (maxD < 0.0005) {
        this.curX = this.targetX.slice();
        this.sliding = false;
      }
      this.updateRows(distance, true);
      moving = true;
    }
    const t = this.state.poseT;
    if (Math.abs(poseTarget - t) > 1e-4) {
      const step = dt * poseSpeed;
      this.state.poseT = poseTarget > t ? Math.min(poseTarget, t + step) : Math.max(poseTarget, t - step);
      moving = true;
    }
    if (this.state.poseT !== this.lastPose || moving) this.applyPose(this.state.poseT);
    if (distance !== this.lastDist) {
      this.updateRows(distance, false);
      this.spinWheels(distance);
      moving = true;
    }
    return moving;
  }

  private updateRows(distance: number, statics: boolean) {
    this.state.distance = distance;
    this.lastDist = distance;
    for (const b of this.batches) {
      const xs = b.rows.map((ri) => this.curX[ri]);
      b.batch.update(xs, distance, statics);
    }
    // extremos del tubo y bisagra según posiciones actuales
    const sp = this.layout.spacing;
    const n = this.curX.length;
    const left = this.curX[0] - sp / 2 - DIM.barOverhang;
    const right = this.curX[n - 1] + sp / 2 + DIM.barOverhang;
    if (this.layout.transport === 'fold') {
      const L = this.layout.sections;
      const lastL = L[0].rows[L[0].rows.length - 1];
      const firstR = L[2].rows[0];
      const hl = lastL !== undefined ? (this.curX[lastL] + this.curX[lastL + 1]) / 2 : -this.layout.hingeX;
      const hr = firstR !== undefined ? (this.curX[firstR - 1] + this.curX[firstR]) / 2 : this.layout.hingeX;
      this.hingeX = (hr - hl) / 2;
      this.setBar('L', left, hl);
      this.setBar('C', hl, hr);
      this.setBar('R', hr, right);
      for (const fp of this.foldParts) {
        const hx = fp.side * this.hingeX;
        fp.tower.position.set(hx - fp.side * 0.65, 0, 0.0);
        fp.lug.position.set(hx + fp.side * 0.3, 0, 0.0);
        fp.knuckle.position.set(hx, 0, 0);
      }
      for (const sid of ['L', 'R'] as const) {
        const wp = this.wingPivots[sid];
        if (!wp) continue;
        const side = sid === 'L' ? -1 : 1;
        const py = DIM.barY + DIM.barSize / 2;
        wp.pivot.position.set(side * this.hingeX, py, 0);
        wp.inner.position.set(-side * this.hingeX, -py, 0);
      }
    } else {
      this.setBar('C', left, right);
      if (this.carriage) this.carriage.group.position.x = right;
      if (this.tHitch) this.tHitch.position.x = left;
    }
    for (const e of this.endKits) e.group.position.x = e.side < 0 ? left : right;
  }

  private setBar(id: string, x0: number, x1: number) {
    const b = this.bars.find((x) => x.id === id);
    if (!b) return;
    b.mesh.scale.x = Math.max(0.01, x1 - x0);
    b.mesh.position.x = (x0 + x1) / 2;
  }

  private spinWheels(distance: number) {
    for (const w of this.mainWheels) w.wheel.rotation.x = distance / this.mainWheelR;
  }

  /** Aplica la pose de transporte t ∈ [0,1] (secuencia completa, reversible). */
  applyPose(t: number, force = false) {
    if (!force && t === this.lastPose) return;
    this.lastPose = t;
    this.state.poseT = t;
    const L = this.layout;
    if (L.transport === 'fold') {
      const lift = phase(t, 0, 0.2) * DIM.lift;
      this.chassis.position.set(0, lift, 0);
      this.chassis.rotation.set(0, 0, 0);
      const f = phase(t, 0.22, 0.95) * DIM.foldAngle;
      if (this.wingPivots.L) this.wingPivots.L.pivot.rotation.z = -f;
      if (this.wingPivots.R) this.wingPivots.R.pivot.rotation.z = f;
      this.setMainWheelsGrounded(lift, 0);
    } else {
      const p1 = phase(t, 0, 0.18);
      const p2 = phase(t, 0.18, 0.36);
      const p3 = phase(t, 0.36, 0.5);
      const p4 = phase(t, 0.5, 1);
      const lift = p1 * DIM.lift;
      this.chassis.position.set(0, lift, 0);
      // ruedas centrales: apoyadas en trabajo, levantadas en transporte
      this.setMainWheelsGrounded(lift, p1);
      if (this.carriage) this.carriage.arm.position.y = DIM.barY - 0.05 + (1 - p1) * 0.45;
      this.drawbar.rotation.y = p2 * (Math.PI / 2);
      if (this.tHitch && this.tHitchInner && this.tHitchEye) {
        const ext = 0.05 + p3 * (DIM.transportDrawbar - 0.05);
        this.tHitchInner.scale.x = ext;
        this.tHitchEye.position.x = -ext - 0.04;
        this.tHitch.visible = t > 0.001;
      }
      // giro de 90° alrededor del centro del tren longitudinal
      this.chassis.rotation.y = p4 * (Math.PI / 2);
    }
    this.root.updateMatrixWorld(true);
    for (const c of this.cylinders) c.update(this.chassis);
    for (const h of this.bridgeHoses) {
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      h.a.getWorldPosition(a);
      h.b.getWorldPosition(b);
      this.chassis.worldToLocal(a);
      this.chassis.worldToLocal(b);
      const mid = a.clone().lerp(b, 0.5);
      mid.y = Math.max(a.y, b.y) + 0.25;
      const old = h.mesh.geometry;
      h.mesh.geometry = tube([a, a.clone().lerp(mid, 0.6).add(V(0, 0.1, 0)), mid, b.clone().lerp(mid, 0.4), b], h.r, 28, 8);
      old.dispose();
    }
  }

  private setMainWheelsGrounded(lift: number, raise: number) {
    const R = this.mainWheelR;
    for (const w of this.mainWheels) {
      const pivotY = DIM.barY - 0.06 + lift;
      const armLen = 0.7;
      const dy = Math.min(armLen * 0.98, pivotY - R);
      const ground = Math.asin(Math.max(-1, Math.min(1, dy / armLen)));
      const up = -0.95;
      w.arm.rotation.x = ground * (1 - raise) + up * raise;
    }
  }

  /** Posición del enganche activo (trabajo: lanza; transporte longitudinal: lanza telescópica) en coordenadas del root. */
  getHitch(target: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    const useT = this.layout.transport === 'longitudinal' && this.state.poseT > 0.5 && this.tHitchEye;
    const obj = useT ? this.tHitchEye! : this.anchors['hitch'];
    obj.getWorldPosition(target);
    return this.root.worldToLocal(target);
  }

  dispose() {
    this.root.removeFromParent();
    for (const g of this.geoms) g.dispose();
    for (const h of this.bridgeHoses) h.mesh.geometry.dispose();
    for (const m of this.decalMeshes) (m.material as THREE.Material).dispose();
    for (const m of this.ownedMaterials) m.dispose();
    this.root.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
    this.geoms = [];
  }
}
