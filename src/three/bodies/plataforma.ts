/**
 * Plataforma con barandas volcables: piso de madera o chapa antideslizante,
 * frontal, parantes desmontables y barandas por módulos que se rebaten de a una.
 */
import type * as THREE from 'three';
import type { BuildCtx } from '../build';
import { stage } from '../build';
import { box, boxUV, cyl, pipe, rbox } from '../kit/geo';

const FOLD = (172 * Math.PI) / 180;

export function buildPlataforma(ctx: BuildCtx): void {
  const { asm, L, sel } = ctx;
  const fy = L.floorY;
  const H = L.H;
  const hw = L.W / 2;
  const x0 = L.rearX;
  const x1 = L.frontX;
  asm.into('sprung');

  // --- Piso y perfiles perimetrales -------------------------------------------------
  const chapa = sel.piso === 'chapa';
  asm.add(chapa ? 'diamond' : 'wood', boxUV(box(L.L - 0.1, 0.03, L.W - 0.12, 0, fy - 0.015, 0), chapa ? 0.32 : 1.0));
  asm.add('chassisPaint', box(L.L - 0.1, 0.028, L.W - 0.12, 0, fy - 0.044, 0));
  for (const s of [1, -1]) asm.add('chassisPaint', rbox(L.L, 0.16, 0.06, 0, fy - 0.08, s * (hw - 0.03), 0.01));
  asm.add('chassisPaint', rbox(0.06, 0.16, L.W - 0.1, x1 - 0.03, fy - 0.08, 0, 0.01), rbox(0.06, 0.16, L.W - 0.1, x0 + 0.03, fy - 0.08, 0, 0.01));

  // Ganchos para lona en todo el largo (y cable de precinto si corresponde).
  const precintos = sel.amarre === 'precintos';
  for (const s of [1, -1]) {
    for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.6) {
      asm.add('galvanized', rbox(0.014, 0.06, 0.03, x, fy - 0.185, s * (hw - 0.03), 0.004), rbox(0.04, 0.014, 0.03, x, fy - 0.215, s * (hw - 0.03), 0.004));
      if (precintos) asm.add('galvanized', cyl(0.02, 0.012, 'z', x + 0.3, fy - 0.105, s * (hw + 0.008), 10));
    }
    if (precintos) asm.add('blackSteel', pipe([[x0 + 0.2, fy - 0.105, s * (hw + 0.016)], [x1 - 0.1, fy - 0.105, s * (hw + 0.016)]], 0.005, 5));
  }

  // --- Frontal -----------------------------------------------------------------------
  const hF = Math.max(H + 0.5, 1.4);
  for (const s of [1, -1]) asm.add('bodyPaint', rbox(0.09, hF, 0.09, x1 - 0.045, fy + hF / 2, s * (hw - 0.045), 0.012));
  asm.add('bodyPaint', rbox(0.09, 0.09, L.W - 0.02, x1 - 0.045, fy + hF - 0.045, 0, 0.012));
  asm.add('bodyPaint', box(0.005, hF - 0.08, L.W - 0.18, x1 - 0.055, fy + hF / 2 - 0.04, 0));
  for (const z of [-0.5, 0.5]) asm.add('bodyPaint', rbox(0.05, hF - 0.1, 0.07, x1 - 0.028, fy + hF / 2 - 0.04, z, 0.01));
  for (const f of [0.34, 0.67]) asm.add('bodyPaint', rbox(0.05, 0.07, L.W - 0.2, x1 - 0.028, fy + hF * f, 0, 0.01));

  // --- Barandas laterales por módulos ---------------------------------------------------
  const N = Number(sel.modulosBaranda ?? 6);
  const xa = x0 + 0.1;
  const xb = x1 - 0.1;
  const stakeW = 0.07;
  const m = (xb - xa - (N - 1) * stakeW) / N;
  const panels: { name: string; kind: 'side' | 'rear'; s: number }[] = [];

  for (const s of [1, -1]) {
    // Poste trasero de esquina.
    asm.into('sprung');
    asm.add('chassisPaint', rbox(0.085, H + 0.02, 0.085, x0 + 0.05, fy + H / 2, s * (hw - 0.0425), 0.012));
    for (let i = 0; i < N; i++) {
      const xs = xa + i * (m + stakeW);
      const xc = xs + m / 2;
      if (i > 0) {
        asm.into('sprung');
        asm.add('chassisPaint', rbox(stakeW, H + 0.03, 0.065, xs - stakeW / 2, fy + H / 2 + 0.005, s * (hw - 0.033), 0.01), rbox(0.1, 0.13, 0.016, xs - stakeW / 2, fy - 0.075, s * (hw + 0.006), 0.004));
      }
      const name = `bar${s === 1 ? 'R' : 'L'}${i}`;
      asm.node(name, 'sprung', [xc, fy + 0.004, s * (hw - 0.02)]);
      asm.into(name);
      const z = s * (hw - 0.026);
      asm.add('bodyPaint', box(m - 0.03, H - 0.09, 0.004, xc, fy + H / 2, z - s * 0.006));
      asm.add('bodyPaint', rbox(m - 0.012, 0.06, 0.042, xc, fy + 0.036, z, 0.008), rbox(m - 0.012, 0.07, 0.046, xc, fy + H - 0.036, z, 0.01));
      const ribs = H > 0.9 ? 3 : 2;
      for (let r = 1; r <= ribs; r++) asm.add('bodyPaint', rbox(m - 0.06, 0.075, 0.024, xc, fy + 0.06 + ((H - 0.13) * r) / (ribs + 1), z + s * 0.008, 0.01));
      for (const dx of [-m / 2 + 0.024, m / 2 - 0.024]) asm.add('bodyPaint', rbox(0.036, H - 0.02, 0.042, xc + dx, fy + H / 2 + 0.005, z, 0.008));
      for (const dx of [-m / 2 + 0.3, 0, m / 2 - 0.3]) asm.add('galvanized', cyl(0.015, 0.11, 'x', xc + dx, fy + 0.006, s * (hw - 0.004), 8));
      for (const dx of [-m / 2 + 0.07, m / 2 - 0.07]) asm.add('galvanized', rbox(0.1, 0.05, 0.02, xc + dx, fy + H - 0.1, s * (hw + 0.004), 0.005), rbox(0.02, 0.09, 0.018, xc + dx + Math.sign(dx) * 0.04, fy + H - 0.09, s * (hw + 0.012), 0.004));
      panels.push({ name, kind: 'side', s });
      if (s === 1 && i === Math.floor(N / 2)) ctx.anchors.barandas = [xc, fy + H * 0.62, hw + 0.03];
    }
  }

  // Baranda trasera.
  asm.node('barRear', 'sprung', [x0 + 0.02, fy + 0.004, 0]);
  asm.into('barRear');
  const rw = L.W - 0.19;
  asm.add('bodyPaint', box(0.004, H - 0.09, rw - 0.03, x0 + 0.032, fy + H / 2, 0));
  asm.add('bodyPaint', rbox(0.042, 0.06, rw, x0 + 0.026, fy + 0.036, 0, 0.008), rbox(0.046, 0.07, rw, x0 + 0.026, fy + H - 0.036, 0, 0.01));
  for (let r = 1; r <= 2; r++) asm.add('bodyPaint', rbox(0.024, 0.075, rw - 0.06, x0 + 0.018, fy + 0.06 + ((H - 0.13) * r) / 3, 0, 0.01));
  for (const dz of [-rw / 2 + 0.024, rw / 2 - 0.024]) asm.add('bodyPaint', rbox(0.042, H - 0.02, 0.036, x0 + 0.026, fy + H / 2 + 0.005, dz, 0.008));
  for (const dz of [-0.8, 0, 0.8]) asm.add('galvanized', cyl(0.015, 0.11, 'z', x0 + 0.004, fy + 0.006, dz, 8));
  for (const dz of [-rw / 2 + 0.07, rw / 2 - 0.07]) asm.add('galvanized', rbox(0.02, 0.05, 0.1, x0 - 0.004, fy + H - 0.1, dz, 0.005));
  // Orden de rebatido: lado derecho de atrás hacia adelante, trasera y lado izquierdo.
  const order = [...panels.filter((p) => p.s === 1), { name: 'barRear', kind: 'rear' as const, s: 0 }, ...panels.filter((p) => p.s === -1)];

  ctx.anchors.caja = [0, fy + H / 2, hw];
  ctx.livery = { side: [0, fy + H / 2, Math.min(L.L - 1.6, 9), H - 0.14], front: [0, fy + hF * 0.5, 1.7, hF - 0.5] };
  ctx.marking = { y: fy - 0.1, z: hw, x0: x0 + 0.1, x1: x1 - 0.1 };

  const M = order.length;
  const u = 1 / (M + 2);
  ctx.updaters.push((a, nodes) => {
    order.forEach((p, i) => {
      const t = stage(a.accion, i * u, i * u + 3 * u);
      const node = nodes[p.name] as THREE.Group | undefined;
      if (!node) return;
      if (p.kind === 'rear') node.rotation.z = t * FOLD;
      else node.rotation.x = p.s * t * FOLD;
    });
  });
}
