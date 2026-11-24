/**
 * Batea volcadora: cuba de chapa con costillas, cilindro telescópico frontal de
 * varias etapas, bisagra trasera y portón (basculante o doble hoja tipo libro).
 */
import * as THREE from 'three';
import type { BuildCtx } from '../build';
import { stage } from '../build';
import { bar, box, cyl, extrudeAlong, extrudeSide, pipe, rbox, type P2 } from '../kit/geo';
import { RollTarp } from '../parts/tarp';

export const TIP_ANGLE = (45 * Math.PI) / 180;
const STAGES = 5;

export function buildBatea(ctx: BuildCtx): void {
  const { asm, L, sel, mats } = ctx;
  const fy = L.floorY;
  const top = fy + L.H;
  const hw = L.W / 2 - 0.05;
  const ch = 0.25;
  const x0 = L.rearX;
  const x1 = L.frontX;
  const rz = L.railZ;
  const libro = sel.porton === 'libro';
  const pivot: [number, number, number] = [x0 + 0.42, L.deckY + 0.03, 0];

  asm.node('bed', 'sprung', pivot);
  asm.into('bed');

  // --- Cuba ----------------------------------------------------------------------
  const t = 0.006;
  const outer: P2[] = [
    [-hw, top],
    [-hw, fy + ch],
    [-hw + ch, fy - t],
    [hw - ch, fy - t],
    [hw, fy + ch],
    [hw, top],
  ];
  const inner: P2[] = [
    [hw - t, top],
    [hw - t, fy + ch + 0.003],
    [hw - ch - 0.003, fy],
    [-hw + ch + 0.003, fy],
    [-hw + t, fy + ch + 0.003],
    [-hw + t, top],
  ];
  asm.add('bodyPaint', extrudeAlong([...outer, ...inner], x0 + 0.02, x1 - 0.03));
  // Frente cerrado.
  asm.add('bodyPaint', extrudeAlong(outer, x1 - 0.04, x1 - 0.03));

  // Costillas en U: lateral, chaflán y travesaño bajo el piso.
  const n = Math.max(6, Math.round((L.L - 0.5) / 0.8));
  for (let i = 0; i <= n; i++) {
    const x = x0 + 0.2 + ((L.L - 0.45) * i) / n;
    for (const s of [1, -1]) {
      asm.add('bodyPaint', rbox(0.085, L.H - ch - 0.04, 0.05, x, fy + ch + (L.H - ch - 0.04) / 2, s * (hw + 0.024), 0.01));
      asm.add('bodyPaint', bar({ x, y: fy + ch + 0.012, z: s * (hw + 0.016) }, { x, y: fy - 0.012, z: s * (hw - ch + 0.016) }, 0.085, 0.05));
    }
    asm.add('bodyPaint', box(0.085, 0.09, 2 * (hw - ch) + 0.06, x, fy - t - 0.045, 0));
  }
  for (const s of [1, -1]) {
    asm.add('bodyPaint', rbox(L.L - 0.05, 0.1, 0.1, 0.005, top + 0.01, s * hw, 0.014));
    // Largueros de apoyo de la cuba sobre el chasis.
    asm.add('chassisPaint', rbox(L.L - 1.0, fy - t - L.deckY, 0.1, 0.1, (fy - t + L.deckY) / 2, s * rz, 0.006));
  }
  asm.add('bodyPaint', rbox(0.1, 0.1, 2 * hw + 0.1, x1 - 0.03, top + 0.01, 0, 0.014));
  for (const z of [-0.46, 0.46]) asm.add('bodyPaint', rbox(0.07, L.H - 0.12, 0.08, x1 + 0.0, fy + L.H / 2, z, 0.01));
  asm.add('bodyPaint', rbox(0.06, 0.08, 2 * hw - 0.2, x1 - 0.005, fy + L.H * 0.45, 0, 0.01));

  // --- Cilindro telescópico -------------------------------------------------------
  const baseY = 1.08;
  const cx = x1 + 0.19;
  const topMountY = Math.max(top - 0.22, baseY + 1.9);
  // Torre / visera que protege el cilindro.
  const towerTop = topMountY + 0.24;
  asm.add('bodyPaint', rbox(0.014, towerTop - (top - 0.3), 0.62, x1 - 0.02, (towerTop + top - 0.3) / 2, 0, 0.004));
  for (const z of [-0.31, 0.31]) {
    asm.add('bodyPaint', extrudeSide([[x1 - 0.03, top - 0.3], [x1 + 0.36, towerTop - 0.02], [x1 + 0.36, towerTop + 0.02], [x1 - 0.03, towerTop + 0.02]], 0.012, z));
  }
  asm.add('bodyPaint', rbox(0.4, 0.014, 0.64, x1 + 0.165, towerTop + 0.02, 0, 0.004));
  asm.add('chassisPaint', rbox(0.16, 0.14, 0.34, cx, topMountY, 0, 0.012));
  asm.add('chrome', cyl(0.03, 0.44, 'z', cx, topMountY, 0, 14));
  ctx.anchors.piston = [cx + 0.12, (baseY + topMountY) / 2, 0.14];

  // Cuna del cilindro en la nariz del chasis.
  asm.into('sprung');
  for (const s of [1, -1]) {
    asm.add('chassisPaint', extrudeSide([[x1 - 0.5, L.deckY], [x1 + 0.4, L.deckY], [x1 + 0.4, baseY - 0.06], [x1 + 0.0, baseY - 0.06], [x1 - 0.5, L.deckY - 0.1]], 0.014, s * 0.2));
  }
  asm.add('chassisPaint', rbox(0.42, 0.02, 0.42, cx, baseY - 0.07, 0, 0.004), rbox(0.03, 0.14, 0.42, x1 + 0.39, L.deckY - 0.07, 0, 0.004));
  asm.add('chrome', cyl(0.035, 0.44, 'z', cx, baseY, 0, 14));
  // Tanque hidráulico y manguera.
  asm.add('chassisPaint', rbox(0.34, 0.3, 0.42, x1 - 0.32, L.deckY - 0.32, -0.92, 0.03));
  asm.add('blackSteel', cyl(0.035, 0.03, 'y', x1 - 0.4, L.deckY - 0.155, -0.92, 12));
  asm.add('rubber', pipe([[x1 - 0.2, L.deckY - 0.3, -0.72], [x1 + 0.05, L.deckY - 0.34, -0.4], [cx - 0.08, baseY + 0.02, -0.12]], 0.014, 6, true));

  const base = new THREE.Vector3(cx, baseY, 0);
  const restTop = new THREE.Vector3(cx, topMountY, 0);
  const d0 = restTop.distanceTo(base);
  const Lb = d0 - 0.12;
  const S = Lb - 0.1;
  const ram = new THREE.Group();
  ram.name = 'ram';
  ram.position.copy(base);
  const mk = (r: number, len: number, mat: THREE.Material) => {
    const g = new THREE.CylinderGeometry(r, r, len, 22, 1);
    g.translate(0, len / 2, 0);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    ram.add(m);
    return m;
  };
  mk(0.118, Lb, mats.blackSteel);
  const collar = mk(0.128, 0.05, mats.blackSteel);
  collar.position.y = Lb - 0.05;
  const stages: THREE.Mesh[] = [];
  for (let k = 0; k < STAGES; k++) stages.push(mk(0.103 - k * 0.0135, Lb + 0.05, mats.chrome));
  const eye = mk(0.045, 0.1, mats.blackSteel);
  asm.attach(ram, 'sprung');
  ctx.disposers.push(() => ram.traverse((o) => (o as THREE.Mesh).geometry?.dispose()));

  // --- Bisagra trasera -------------------------------------------------------------
  for (const s of [1, -1]) {
    asm.into('sprung');
    asm.add('chassisPaint', extrudeSide([[pivot[0] - 0.14, L.deckY - 0.1], [pivot[0] + 0.2, L.deckY - 0.1], [pivot[0] + 0.09, pivot[1] + 0.07], [pivot[0] - 0.09, pivot[1] + 0.07]], 0.02, s * (rz + 0.075)));
    asm.add('chrome', cyl(0.03, 0.2, 'z', pivot[0], pivot[1], s * rz, 14));
    asm.into('bed');
    asm.add('chassisPaint', extrudeSide([[pivot[0] - 0.16, fy - t - 0.1], [pivot[0] + 0.16, fy - t - 0.1], [pivot[0] + 0.07, pivot[1] - 0.06], [pivot[0] - 0.07, pivot[1] - 0.06]], 0.02, s * (rz - 0.03)));
  }

  // --- Portón trasero ---------------------------------------------------------------
  if (!libro) {
    asm.node('gate', 'bed', [x0 + 0.01, top + 0.03, 0]);
    asm.into('gate');
    asm.add('bodyPaint', extrudeAlong(outer, x0 - 0.002, x0 + 0.008));
    asm.add('bodyPaint', rbox(0.07, 0.1, 2 * hw + 0.12, x0 - 0.03, top - 0.03, 0, 0.012), rbox(0.06, 0.08, 2 * (hw - ch) + 0.1, x0 - 0.03, fy + 0.035, 0, 0.01));
    for (const z of [-0.55, 0, 0.55]) asm.add('bodyPaint', rbox(0.055, L.H - 0.14, 0.07, x0 - 0.028, fy + L.H / 2, z, 0.01));
    asm.add('bodyPaint', rbox(0.055, 0.07, 2 * hw - 0.1, x0 - 0.028, fy + L.H * 0.5, 0, 0.01));
    for (const s of [1, -1]) {
      asm.add('bodyPaint', bar({ x: x0 - 0.028, y: fy + ch, z: s * (hw - 0.02) }, { x: x0 - 0.028, y: fy + 0.02, z: s * (hw - ch + 0.01) }, 0.07, 0.055), rbox(0.055, L.H - ch - 0.1, 0.06, x0 - 0.028, fy + ch + (L.H - ch - 0.1) / 2, s * (hw - 0.03), 0.01));
      // Brazos de bisagra superiores.
      asm.add('chassisPaint', rbox(0.3, 0.11, 0.02, x0 + 0.1, top + 0.03, s * (hw + 0.062), 0.006));
      asm.add('chrome', cyl(0.022, 0.06, 'z', x0 + 0.01, top + 0.03, s * (hw + 0.07), 12));
    }
    asm.into('bed');
    // Trabas automáticas inferiores.
    for (const z of [-0.62, 0.62]) asm.add('chassisPaint', rbox(0.14, 0.07, 0.05, x0 + 0.05, fy - 0.05, z, 0.008), rbox(0.03, 0.1, 0.05, x0 - 0.02, fy - 0.02, z, 0.006));
  } else {
    // Marco trasero fijo con esquineros que tapan los chaflanes.
    asm.into('bed');
    for (const s of [1, -1]) {
      asm.add('bodyPaint', rbox(0.07, L.H, 0.08, x0 + 0.0, fy + L.H / 2, s * (hw - 0.01), 0.01));
      asm.add('bodyPaint', extrudeAlong([[s * hw, fy + ch + 0.02], [s * (hw - ch - 0.02), fy - t], [s * hw, fy - t]], x0 - 0.01, x0 + 0.02));
    }
    asm.add('bodyPaint', rbox(0.07, 0.07, 2 * hw, x0, fy - 0.03, 0, 0.01));
    for (const s of [1, -1]) {
      const name = s === 1 ? 'gateR' : 'gateL';
      asm.node(name, 'bed', [x0 - 0.01, fy, s * (hw - 0.03)]);
      asm.into(name);
      const w = hw - 0.035;
      const zc = s * (w / 2 + 0.002);
      asm.add('bodyPaint', box(0.008, L.H - 0.02, w, x0 - 0.012, fy + L.H / 2 + 0.01, zc));
      asm.add('bodyPaint', rbox(0.05, 0.07, w, x0 - 0.04, top - 0.03, zc, 0.01), rbox(0.05, 0.07, w, x0 - 0.04, fy + 0.045, zc, 0.01), rbox(0.05, 0.07, w - 0.1, x0 - 0.04, fy + L.H * 0.52, zc, 0.01));
      for (const dz of [0.035, w - 0.035]) asm.add('bodyPaint', rbox(0.05, L.H - 0.04, 0.07, x0 - 0.04, fy + L.H / 2 + 0.01, s * dz, 0.01));
      for (const hy of [fy + 0.2, fy + L.H / 2, top - 0.2]) asm.add('chrome', cyl(0.02, 0.14, 'y', x0 - 0.045, hy, s * (hw - 0.01), 10));
      // Falleba central con manija.
      asm.add('galvanized', cyl(0.014, L.H + 0.02, 'y', x0 - 0.075, fy + L.H / 2, s * 0.1, 8), rbox(0.02, 0.03, 0.3, x0 - 0.085, fy + 0.7, s * 0.24, 0.005));
      if (s === 1) {
        // Boquilla cerealera con compuerta y manija.
        asm.add('chassisPaint', rbox(0.035, 0.34, 0.46, x0 - 0.035, fy + 0.26, s * 0.62, 0.008));
        asm.add('galvanized', rbox(0.012, 0.26, 0.38, x0 - 0.056, fy + 0.26, s * 0.62, 0.004), rbox(0.03, 0.03, 0.16, x0 - 0.07, fy + 0.4, s * 0.62, 0.006));
      }
    }
  }

  // --- Cobertor de carga -------------------------------------------------------------
  let tarp: RollTarp | null = null;
  if (sel.cobertor === true) {
    const yT = top + 0.06;
    const rise = 0.14;
    const spacing = (L.L - 0.3) / Math.max(4, Math.round((L.L - 0.3) / 1.1));
    tarp = new RollTarp({ x0: x0 + 0.1, x1: x1 - 0.06, top: yT, halfW: L.W / 2 - 0.012, rise, bowSpacing: spacing }, mats);
    asm.attach(tarp.group, 'bed');
    const tt = tarp;
    ctx.disposers.push(() => tt.dispose());
    asm.into('bed');
    const p2 = new THREE.Vector2();
    for (let x = x0 + 0.1; x < x1 - 0.05; x += spacing) {
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 10; i++) {
        tarp.point(i / 10, p2);
        pts.push([x, p2.y - 0.012, p2.x * 0.985]);
      }
      asm.add('galvanized', pipe(pts, 0.015, 6, true));
    }
    ctx.anchors.lona = [0, yT + rise, 0];
  }

  ctx.anchors.porton = [x0 - 0.08, fy + L.H * 0.55, 0.3];
  ctx.anchors.caja = [0, fy + L.H / 2, L.W / 2];
  ctx.livery = { side: [0.1, fy + ch + (L.H - ch) / 2 + 0.02, Math.min(L.L - 1.8, 6.5), L.H - ch - 0.22], front: null };
  ctx.marking = { y: fy + ch + 0.05, z: hw + 0.049, x0: x0 + 0.3, x1: x1 - 0.2, node: 'bed' };

  // --- Animación: portón, vuelco y cilindro por etapas -----------------------------------
  const topW = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const pv = new THREE.Vector3(...pivot);
  ctx.updaters.push((a, nodes) => {
    const tip = (libro ? stage(a.accion, 0.22, 1) : stage(a.accion, 0.04, 1)) * TIP_ANGLE;
    nodes.bed.rotation.z = tip;
    if (libro) {
      const open = stage(a.accion, 0, 0.26) * 1.95;
      if (nodes.gateL) nodes.gateL.rotation.y = -open;
      if (nodes.gateR) nodes.gateR.rotation.y = open;
    } else if (nodes.gate) {
      // Cuelga libre: se mantiene vertical mientras la cuba se inclina.
      nodes.gate.rotation.z = -tip * 1.04;
    }
    tarp?.update(Math.max(a.lona, stage(a.accion, 0, 0.18)));

    // Punto superior del cilindro, girado con la cuba.
    topW.copy(restTop).sub(pv).applyAxisAngle(new THREE.Vector3(0, 0, 1), tip).add(pv);
    dir.copy(topW).sub(base);
    const d = dir.length();
    ram.quaternion.setFromUnitVectors(up, dir.normalize());
    let e = Math.max(0, d - d0);
    let offset = 0;
    for (let k = 0; k < STAGES; k++) {
      const ek = Math.min(S, e);
      e -= ek;
      offset += ek;
      stages[k].position.y = offset;
    }
    eye.position.y = offset + Lb + 0.02;
  });
}
