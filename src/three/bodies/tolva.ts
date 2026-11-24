/**
 * Tolva cerealera: caja con parantes, embudos inferiores con compuertas a
 * cremallera y volante, lona enrollable sobre arcos, escalera y pasarela.
 */
import * as THREE from 'three';
import type { BuildCtx } from '../build';
import { stage } from '../build';
import { bar, box, cyl, extrudeAlong, pipe, quad, rbox, rod, sheet, type P2 } from '../kit/geo';
import { RollTarp } from '../parts/tarp';

const GATE_TRAVEL = 0.64;

export function buildTolva(ctx: BuildCtx): void {
  const { asm, L, sel, mats } = ctx;
  const t = L.tolva!;
  const railY = t.railY;
  const yT = railY + L.H;
  const hw = L.W / 2;
  const x0 = L.rearX;
  const x1 = L.frontX;
  const len = L.L;
  asm.into('sprung');

  // --- Caja: chapa, parantes, cinturas -------------------------------------------
  const skinZ = hw - 0.05;
  for (const s of [1, -1]) {
    asm.add('bodyPaint', box(len - 0.12, L.H, 0.005, 0, railY + L.H / 2, s * skinZ));
    const n = Math.max(6, Math.round((len - 0.3) / 0.62));
    for (let i = 1; i < n; i++) {
      const x = x0 + 0.06 + ((len - 0.12) * i) / n;
      asm.add('bodyPaint', rbox(0.075, L.H - 0.02, 0.048, x, railY + L.H / 2, s * (hw - 0.026), 0.01));
    }
    asm.add('bodyPaint', rbox(len, 0.09, 0.09, 0, yT - 0.045, s * (hw - 0.045), 0.012), rbox(len, 0.075, 0.06, 0, railY + 0.037, s * (hw - 0.03), 0.01));
    for (const x of [x0 + 0.05, x1 - 0.05]) asm.add('bodyPaint', rbox(0.1, L.H, 0.1, x, railY + L.H / 2, s * (hw - 0.05), 0.012));
  }
  for (const [x, dir] of [
    [x1, 1],
    [x0, -1],
  ] as const) {
    asm.add('bodyPaint', box(0.005, L.H, L.W - 0.12, x - dir * 0.05, railY + L.H / 2, 0));
    for (const z of [-0.44, 0.44]) asm.add('bodyPaint', rbox(0.048, L.H - 0.15, 0.08, x - dir * 0.024, railY + L.H / 2, z, 0.01));
    asm.add('bodyPaint', rbox(0.048, 0.08, L.W - 0.2, x - dir * 0.024, railY + L.H * 0.5, 0, 0.01));
    asm.add('bodyPaint', rbox(0.09, 0.09, L.W - 0.1, x - dir * 0.045, yT - 0.045, 0, 0.012), rbox(0.06, 0.075, L.W - 0.1, x - dir * 0.03, railY + 0.037, 0, 0.01));
  }

  // Cabeceras curvas que cierran la lona en los extremos.
  const rise = 0.2;
  const capShape: P2[] = [];
  const NA = 16;
  for (let i = 0; i <= NA; i++) {
    const s = i / NA;
    const k = 2 * s - 1;
    capShape.push([-hw + L.W * s, yT + rise * (1 - k * k)]);
  }
  capShape.push([hw, yT - 0.02], [-hw, yT - 0.02]);
  asm.add('bodyPaint', extrudeAlong(capShape, x1 - 0.07, x1), extrudeAlong(capShape, x0, x0 + 0.07));

  // --- Embudos ------------------------------------------------------------------
  const zT = hw - 0.17;
  const my = t.mouthY + 0.07;
  const mz = t.mouthHalfZ;
  ctx.grain = [];
  t.hoppers.forEach((h, i) => {
    const xa = h.x - h.topHalfRear;
    const xb = h.x + h.topHalfFront;
    const ma = h.x - h.mouthHalf;
    const mb = h.x + h.mouthHalf;
    asm.into('sprung');
    asm.add(
      'bodyPaint',
      sheet([ma, my, mz], [mb, my, mz], [xb, railY, zT], [xa, railY, zT], 0.005),
      sheet([mb, my, -mz], [ma, my, -mz], [xa, railY, -zT], [xb, railY, -zT], 0.005),
      sheet([mb, my, mz], [mb, my, -mz], [xb, railY, -zT], [xb, railY, zT], 0.005),
      sheet([ma, my, -mz], [ma, my, mz], [xa, railY, zT], [xa, railY, -zT], 0.005),
    );
    // Cinturón de refuerzo a media altura.
    const f = 0.5;
    const cx0 = ma + (xa - ma) * f;
    const cx1 = mb + (xb - mb) * f;
    const cz = mz + (zT - mz) * f;
    const cyy = my + (railY - my) * f;
    for (const s of [1, -1]) {
      asm.add('bodyPaint', bar({ x: cx0, y: cyy, z: s * (cz + 0.012) }, { x: cx1, y: cyy, z: s * (cz + 0.012) }, 0.04, 0.05));
    }
    asm.add('bodyPaint', bar({ x: cx1 + 0.012, y: cyy, z: -cz }, { x: cx1 + 0.012, y: cyy, z: cz }, 0.05, 0.05), bar({ x: cx0 - 0.012, y: cyy, z: -cz }, { x: cx0 - 0.012, y: cyy, z: cz }, 0.05, 0.05));

    // Marco de boca y guías de la compuerta (salen hacia el lado derecho).
    const fy = t.mouthY + 0.035;
    asm.add(
      'chassisPaint',
      rbox(0.06, 0.07, mz * 2 + 0.12, ma - 0.03, fy, 0, 0.006),
      rbox(0.06, 0.07, mz * 2 + 0.12, mb + 0.03, fy, 0, 0.006),
      rbox(h.mouthHalf * 2, 0.07, 0.06, h.x, fy, -mz - 0.03, 0.006),
    );
    for (const gx of [ma - 0.03, mb + 0.03]) asm.add('chassisPaint', rbox(0.05, 0.045, 0.78, gx, t.mouthY + 0.012, mz + 0.4, 0.005));
    asm.add('chassisPaint', rbox(h.mouthHalf * 2 + 0.12, 0.045, 0.05, h.x, t.mouthY + 0.012, mz + 0.79, 0.005));

    // Compuerta deslizante.
    asm.node(`gate${i}`, 'sprung', [h.x, t.mouthY, 0]);
    asm.into(`gate${i}`);
    asm.add('galvanized', rbox(h.mouthHalf * 2 + 0.04, 0.012, mz * 2 + 0.06, h.x, t.mouthY + 0.004, 0, 0.003));
    asm.add('blackSteel', box(0.03, 0.02, mz * 2 + 0.02, h.x + h.mouthHalf - 0.05, t.mouthY - 0.012, 0));

    // Eje de mando con piñón y volante.
    const sx = h.x + h.mouthHalf - 0.05;
    const sy = t.mouthY - 0.035;
    const wz = hw - 0.14;
    asm.into('sprung');
    asm.add('galvanized', cyl(0.014, wz - mz + 0.05, 'z', sx, sy, (wz + mz) / 2 - 0.02, 10));
    asm.add('chassisPaint', rbox(0.07, 0.11, 0.012, sx, sy + 0.03, wz - 0.06, 0.003), rbox(0.012, 0.32, 0.06, sx, sy + 0.16, wz - 0.066, 0.003));
    asm.node(`hw${i}`, 'sprung', [sx, sy, wz]);
    asm.into(`hw${i}`);
    const torus = new THREE.TorusGeometry(0.15, 0.013, 8, 28);
    torus.translate(sx, sy, wz);
    asm.add('yellowPaint', torus, cyl(0.03, 0.04, 'z', sx, sy, wz, 12));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      asm.add('yellowPaint', rod({ x: sx, y: sy, z: wz }, { x: sx + Math.cos(a) * 0.15, y: sy + Math.sin(a) * 0.15, z: wz }, 0.009, 6));
    }
    asm.add('blackSteel', cyl(0.014, 0.07, 'z', sx + 0.15, sy, wz + 0.04, 8));

    ctx.grain.push({ x: h.x, y: t.mouthY - 0.02, z: 0 });
    ctx.slots.push({ side: 1, x0: sx - 0.26, x1: sx + 0.26 });
    if (i === Math.floor(t.hoppers.length / 2)) ctx.anchors.compuertas = [sx, sy + 0.05, wz + 0.05];
  });

  // Piso plano bajo los caballetes y rampas interiores.
  asm.into('sprung');
  const zi = hw - 0.055;
  for (const r of t.ridges) {
    asm.add('bodyPaint', box(r.x1 - r.x0, 0.005, zT * 2, (r.x0 + r.x1) / 2, railY - 0.0025, 0));
    if (r.kind === 'mid') {
      const xm = (r.x0 + r.x1) / 2;
      asm.add('bodyInner', quad([r.x0, railY, -zi], [r.x0, railY, zi], [xm, railY + r.rise, zi], [xm, railY + r.rise, -zi], true), quad([xm, railY + r.rise, -zi], [xm, railY + r.rise, zi], [r.x1, railY, zi], [r.x1, railY, -zi], true));
    } else if (r.kind === 'rear') {
      asm.add('bodyInner', quad([r.x0, railY + r.rise, -zi], [r.x0, railY + r.rise, zi], [r.x1, railY, zi], [r.x1, railY, -zi], true));
    } else {
      asm.add('bodyInner', quad([r.x0, railY, -zi], [r.x0, railY, zi], [r.x1, railY + r.rise, zi], [r.x1, railY + r.rise, -zi], true));
    }
  }
  // Cierre entre el borde superior de los embudos y los largueros.
  for (const s of [1, -1]) asm.add('bodyPaint', box(len - 0.2, 0.005, hw - 0.1 - zT, 0, railY - 0.0025, s * (zT + (hw - 0.1 - zT) / 2)));

  // --- Lona enrollable --------------------------------------------------------------
  const spacing = (len - 0.14) / Math.max(4, Math.round((len - 0.14) / 0.95));
  const tarp = new RollTarp({ x0: x0 + 0.07, x1: x1 - 0.07, top: yT, halfW: hw - 0.01, rise, bowSpacing: spacing }, mats);
  asm.attach(tarp.group, 'sprung');
  ctx.disposers.push(() => tarp.dispose());
  const p2 = new THREE.Vector2();
  for (let x = x0 + 0.07 + spacing; x < x1 - 0.2; x += spacing) {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      tarp.point(i / 10, p2);
      pts.push([x, p2.y - 0.012, p2.x * 0.985]);
    }
    asm.add('galvanized', pipe(pts, 0.015, 6, true));
  }
  // Larguero cumbrera.
  asm.add('galvanized', cyl(0.016, len - 0.16, 'x', 0, yT + rise - 0.03, 0, 8));

  // Mando de la lona: manivela articulada (manual) o motor con brazos (eléctrico).
  const electric = sel.accionamientoLona === 'electrico';
  const drive = new THREE.Group();
  drive.name = 'tarpDrive';
  const half = (x1 - x0) / 2;
  if (electric) {
    const motor = new THREE.Mesh(cyl(0.062, 0.22, 'x', half + 0.07, 0, 0, 16), mats.blackSteel);
    const cap = new THREE.Mesh(cyl(0.066, 0.03, 'x', half + 0.19, 0, 0, 16), mats.yellowPaint);
    drive.add(motor, cap);
  } else {
    const crank = new THREE.Mesh(
      pipe(
        [
          [half - 0.02, 0, 0],
          [half + 0.09, -0.02, 0],
          [half + 0.11, -1.55, 0],
          [half + 0.24, -1.55, 0],
          [half + 0.24, -1.72, 0],
        ],
        0.013,
        8,
      ),
      mats.galvanized,
    );
    const grip = new THREE.Mesh(cyl(0.02, 0.13, 'y', half + 0.24, -1.67, 0, 10), mats.rubber);
    drive.add(crank, grip);
  }
  drive.traverse((o) => {
    o.castShadow = true;
  });
  asm.attach(drive, 'sprung');
  ctx.disposers.push(() => drive.traverse((o) => (o as THREE.Mesh).geometry?.dispose()));

  const arms: THREE.Mesh[] = [];
  if (electric) {
    for (const ax of [x1 + 0.035, x0 - 0.035]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1, 0.05), mats.galvanized);
      arm.castShadow = true;
      arm.userData.pivot = new THREE.Vector3(ax, yT - 1.05, 0);
      arms.push(arm);
      asm.attach(arm, 'sprung');
      asm.add('blackSteel', cyl(0.05, 0.05, 'x', ax, yT - 1.05, 0, 14));
    }
    ctx.disposers.push(() => arms.forEach((a) => a.geometry.dispose()));
  }

  const rollPos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  ctx.updaters.push((a) => {
    tarp.update(a.lona);
    tarp.rollPosition(a.lona, rollPos);
    drive.position.set(0, rollPos.y, rollPos.z);
    for (const arm of arms) {
      const pv = arm.userData.pivot as THREE.Vector3;
      dir.set(0, rollPos.y - pv.y, rollPos.z - pv.z);
      const d = dir.length();
      arm.position.set(pv.x, pv.y + dir.y / 2, pv.z + dir.z / 2);
      arm.scale.set(1, d, 1);
      arm.quaternion.setFromUnitVectors(up, dir.normalize());
    }
  });

  // --- Escalera frontal y pasarela ---------------------------------------------------
  const lz = hw - 0.42;
  const lx = x1 + 0.075;
  const ly0 = railY - 0.25;
  const ly1 = yT + 0.1;
  for (const dz of [-0.2, 0.2]) asm.add('galvanized', cyl(0.017, ly1 - ly0, 'y', lx, (ly0 + ly1) / 2, lz + dz, 8));
  for (let y = ly0 + 0.12; y < ly1 - 0.05; y += 0.3) asm.add('galvanized', cyl(0.013, 0.4, 'z', lx, y, lz, 8));
  for (const y of [railY + 0.2, yT - 0.2]) for (const dz of [-0.2, 0.2]) asm.add('galvanized', cyl(0.012, 0.075, 'x', x1 + 0.037, y, lz + dz, 6));

  if (sel.pasarela === true) {
    const py = yT - 1.05;
    const pd = 0.46;
    const pw = L.W - 0.5;
    const pz = -0.2;
    asm.add('diamond', rbox(pd, 0.03, pw, x1 + pd / 2 + 0.01, py, pz, 0.004));
    asm.add('galvanized', rbox(0.04, 0.05, pw, x1 + pd + 0.0, py - 0.03, pz, 0.004));
    for (const z of [pz - pw / 2 + 0.05, pz, pz + pw / 2 - 0.05]) {
      asm.add('galvanized', bar({ x: x1 + 0.01, y: py - 0.42, z }, { x: x1 + pd - 0.02, y: py - 0.03, z }, 0.04, 0.04));
      asm.add('galvanized', cyl(0.016, 1.05, 'y', x1 + pd - 0.01, py + 0.52, z, 8));
    }
    for (const dy of [0.55, 1.04]) asm.add('galvanized', cyl(0.016, pw - 0.1, 'z', x1 + pd - 0.01, py + dy, pz, 8));
    asm.add('galvanized', rbox(0.02, 0.1, pw - 0.1, x1 + pd - 0.01, py + 0.07, pz, 0.003));
  }

  ctx.anchors.lona = [0.4, yT + rise + 0.05, 0];
  ctx.anchors.caja = [0, railY + L.H / 2, hw];
  ctx.livery = { side: [0, railY + L.H * 0.52, Math.min(len - 1.2, 7.5), L.H - 0.42], front: [-0.25, railY + L.H * 0.55, 1.5, L.H - 0.6] };
  ctx.marking = { y: railY - 0.15, z: hw - 0.005, x0: x0 + 0.1, x1: x1 - 0.1 };

  // --- Grano: partículas instanciadas que caen de las bocas abiertas ---------------------
  const PER = 90;
  const total = PER * t.hoppers.length;
  const grainGeo = new THREE.IcosahedronGeometry(0.021, 0);
  const grains = new THREE.InstancedMesh(grainGeo, mats.grain, total);
  grains.frustumCulled = false;
  grains.castShadow = false;
  grains.count = total;
  grains.name = 'grain';
  const gy = new Float32Array(total).fill(-1);
  const gv = new Float32Array(total);
  const gx = new Float32Array(total);
  const gz = new Float32Array(total);
  const m4 = new THREE.Matrix4();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < total; i++) grains.setMatrixAt(i, hide);
  asm.attach(grains, 'root');
  // Montículos bajo cada boca.
  const pileGeo = new THREE.ConeGeometry(0.62, 0.36, 20, 1, true);
  pileGeo.translate(0, 0.18, 0);
  const piles = t.hoppers.map((h) => {
    const p = new THREE.Mesh(pileGeo, mats.grain);
    p.position.set(h.x, 0, 0);
    p.scale.setScalar(0.0001);
    p.receiveShadow = true;
    asm.attach(p, 'root');
    return p;
  });
  const pileSize = new Float32Array(t.hoppers.length);
  ctx.disposers.push(() => {
    grainGeo.dispose();
    pileGeo.dispose();
    grains.dispose();
  });
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  let alive = 0;
  let flowing = false;
  ctx.busy.push(() => flowing || alive > 0 || pileSize.some((v) => v > 0.001 && v < 0.999 && flowing));

  // Animación de compuertas, volantes y grano.
  ctx.updaters.push((a, nodes) => {
    alive = 0;
    flowing = false;
    t.hoppers.forEach((h, i) => {
      const open = stage(a.accion, i * 0.08, 0.75 + i * 0.08);
      const g = nodes[`gate${i}`];
      const w = nodes[`hw${i}`];
      if (g) g.position.z = (g.userData.rest as THREE.Vector3).z + open * GATE_TRAVEL;
      if (w) w.rotation.z = -open * Math.PI * 5;

      const emit = open > 0.18;
      if (emit) flowing = true;
      const spread = 0.05 + open * 0.2;
      const dt = Math.min(a.dt, 0.05);
      for (let k = 0; k < PER; k++) {
        const j = i * PER + k;
        if (gy[j] < 0) {
          // Nace una fracción por cuadro: chorro continuo, no una tanda.
          if (!emit || rnd() > 0.12 + open * 0.2) continue;
          gy[j] = t.mouthY - 0.02 - rnd() * 0.05;
          gv[j] = 0.4 + rnd() * 0.5;
          gx[j] = h.x + (rnd() - 0.5) * 2 * spread;
          gz[j] = (rnd() - 0.5) * 2 * (0.06 + open * 0.24);
        }
        gv[j] += 9.8 * dt;
        gy[j] -= gv[j] * dt;
        const floor = pileSize[i] * 0.3 * Math.max(0, 1 - Math.hypot(gx[j] - h.x, gz[j]) / 0.6);
        if (gy[j] <= floor + 0.01) {
          gy[j] = -1;
          grains.setMatrixAt(j, hide);
          continue;
        }
        alive++;
        m4.makeTranslation(gx[j], gy[j], gz[j]);
        grains.setMatrixAt(j, m4);
      }
      // El montículo crece mientras descarga y desaparece al cerrar.
      pileSize[i] = emit ? Math.min(1, pileSize[i] + dt * 0.16) : a.accion <= 0.001 ? Math.max(0, pileSize[i] - dt * 0.9) : pileSize[i];
      if (pileSize[i] > 0.001 && !emit && a.accion <= 0.001) flowing = true;
      const sc = Math.max(0.0001, pileSize[i]);
      piles[i].scale.set(0.35 + sc * 0.65, sc, 0.35 + sc * 0.65);
      piles[i].visible = pileSize[i] > 0.002;
    });
    grains.instanceMatrix.needsUpdate = true;
  });
}
