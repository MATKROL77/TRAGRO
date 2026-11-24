/**
 * Furgón de paneles lisos o sider con lona lateral corrediza. Ambos con puertas
 * traseras de doble hoja, fallebas y bisagras.
 */
import type { BuildCtx } from '../build';
import { stage } from '../build';
import { box, boxUV, cyl, rbox } from '../kit/geo';
import { PleatCurtain } from '../parts/tarp';
import type { MatKey } from '../materials';

const DOOR_OPEN = (250 * Math.PI) / 180;

export function buildFurgon(ctx: BuildCtx): void {
  const { asm, L, sel, mats } = ctx;
  const fy = L.floorY;
  const H = L.H;
  const top = fy + H;
  const hw = L.W / 2;
  const x0 = L.rearX;
  const x1 = L.frontX;
  const sider = sel.variante === 'sider';
  const hardware: MatKey = sel.puertas === 'dobleHojaInox' ? 'chrome' : 'galvanized';
  asm.into('sprung');

  // --- Piso y zócalos ---------------------------------------------------------------
  const chapa = sel.pisoFurgon === 'chapa';
  asm.add(chapa ? 'diamond' : 'phenolic', boxUV(box(L.L - 0.1, 0.03, L.W - 0.1, 0, fy - 0.015, 0), chapa ? 0.32 : 0.5));
  asm.add('chassisPaint', box(L.L - 0.1, 0.028, L.W - 0.1, 0, fy - 0.044, 0));
  for (const s of [1, -1]) asm.add('aluBrushed', rbox(L.L, 0.15, 0.05, 0, fy - 0.07, s * (hw - 0.025), 0.01));

  // --- Frente, techo y marcos ---------------------------------------------------------
  asm.add('bodyPaint', box(0.03, H, L.W - 0.08, x1 - 0.02, fy + H / 2, 0));
  for (const s of [1, -1]) asm.add('aluBrushed', rbox(0.075, H + 0.05, 0.075, x1 - 0.0375, fy + H / 2 + 0.02, s * (hw - 0.0375), 0.02));
  asm.add('aluBrushed', rbox(0.075, 0.075, L.W - 0.1, x1 - 0.0375, top + 0.012, 0, 0.02));
  asm.add('roof', rbox(L.L - 0.06, 0.035, L.W - 0.06, 0, top + 0.032, 0, 0.012));
  for (const s of [1, -1]) asm.add('aluBrushed', rbox(L.L - 0.02, 0.12, 0.055, 0, top - 0.01, s * (hw - 0.0275), 0.012));
  // Luces de gálibo.
  for (const s of [1, -1]) {
    asm.add('lensWhite', rbox(0.014, 0.03, 0.09, x1 + 0.005, top - 0.01, s * (hw - 0.25), 0.004));
    asm.add('lensRed', rbox(0.014, 0.03, 0.09, x0 - 0.005, top + 0.0, s * (hw - 0.25), 0.004));
  }

  // --- Laterales ---------------------------------------------------------------------
  if (!sider) {
    for (const s of [1, -1]) {
      asm.add('bodyPaint', box(L.L - 0.16, H - 0.1, 0.03, 0, fy + H / 2 - 0.02, s * (hw - 0.02)));
      for (let x = x0 + 1.25; x < x1 - 0.6; x += 1.22) asm.add('bodyPaint', rbox(0.016, H - 0.16, 0.006, x, fy + H / 2 - 0.02, s * (hw - 0.004), 0.002));
    }
  } else {
    const curtains: PleatCurtain[] = [];
    const bays = Math.max(3, Math.round(L.L / 3.5));
    for (const s of [1, -1]) {
      for (let i = 1; i < bays; i++) {
        const x = x0 + (L.L * i) / bays;
        asm.add('galvanized', rbox(0.1, H - 0.1, 0.085, x, fy + H / 2 - 0.04, s * (hw - 0.1), 0.012));
      }
      for (const dy of [0.45, 1.0, 1.55]) if (dy < H - 0.4) asm.add('aluBrushed', rbox(L.L - 0.2, 0.12, 0.022, 0, fy + dy, s * (hw - 0.16), 0.006));
      const c = new PleatCurtain({ x0: x0 + 0.1, x1: x1 - 0.085, y0: fy - 0.11, y1: top - 0.07, z: s * (hw - 0.014), side: s as 1 | -1, strapSpacing: 0.62 }, mats);
      asm.attach(c.group, 'sprung');
      curtains.push(c);
      // Tensor delantero de la lona.
      asm.add('aluBrushed', cyl(0.03, H - 0.05, 'y', x1 - 0.1, fy + H / 2 - 0.05, s * (hw - 0.03), 12));
    }
    ctx.disposers.push(() => curtains.forEach((c) => c.dispose()));
    ctx.updaters.push((a) => curtains.forEach((c) => c.update(stage(a.accion, 0.3, 1))));
  }

  // --- Marco trasero y puertas --------------------------------------------------------
  for (const s of [1, -1]) asm.add('galvanized', rbox(0.08, H + 0.03, 0.08, x0 + 0.04, fy + H / 2 + 0.005, s * (hw - 0.04), 0.012));
  asm.add('galvanized', rbox(0.08, 0.11, L.W - 0.04, x0 + 0.04, top + 0.0, 0, 0.012), rbox(0.08, 0.08, L.W - 0.04, x0 + 0.04, fy - 0.03, 0, 0.012));

  const hingeZ = hw - 0.085;
  const w = hingeZ - 0.004;
  const dh = H - 0.12;
  const dy = fy + 0.02 + dh / 2;
  for (const s of [1, -1]) {
    const name = s === 1 ? 'doorR' : 'doorL';
    asm.node(name, 'sprung', [x0 - 0.004, fy, s * hingeZ]);
    asm.into(name);
    const zc = s * (hingeZ - w / 2);
    asm.add('bodyPaint', box(0.03, dh, w, x0 - 0.012, dy, zc));
    // Marco perimetral de aluminio.
    asm.add('aluBrushed', rbox(0.036, 0.05, w, x0 - 0.012, dy + dh / 2 - 0.025, zc, 0.006), rbox(0.036, 0.05, w, x0 - 0.012, dy - dh / 2 + 0.025, zc, 0.006));
    for (const dz of [0.02, w - 0.02]) asm.add('aluBrushed', rbox(0.036, dh, 0.04, x0 - 0.012, dy, s * (hingeZ - dz), 0.006));
    // Fallebas con levas, guías y manijas.
    for (const f of [0.3, 0.74]) {
      const z = s * (hingeZ - w * f);
      asm.add(hardware, cyl(0.014, dh + 0.1, 'y', x0 - 0.045, dy, z, 10));
      for (const gy of [dy - dh * 0.36, dy, dy + dh * 0.36]) asm.add(hardware, rbox(0.03, 0.045, 0.05, x0 - 0.04, gy, z, 0.006));
      for (const ey of [dy - dh / 2 - 0.045, dy + dh / 2 + 0.045]) asm.add(hardware, rbox(0.03, 0.03, 0.07, x0 - 0.045, ey, z, 0.006));
      asm.add(hardware, rbox(0.016, 0.03, 0.3, x0 - 0.06, fy + 1.0, z - s * 0.13, 0.005), rbox(0.03, 0.06, 0.04, x0 - 0.05, fy + 1.0, z - s * 0.26, 0.006));
    }
    for (let k = 0; k < 4; k++) asm.add(hardware, rbox(0.014, 0.055, 0.16, x0 - 0.034, dy - dh / 2 + 0.2 + ((dh - 0.4) * k) / 3, s * (hingeZ - 0.05), 0.004), cyl(0.014, 0.075, 'y', x0 - 0.03, dy - dh / 2 + 0.2 + ((dh - 0.4) * k) / 3, s * (hingeZ + 0.012), 8));
  }
  ctx.updaters.push((a, nodes) => {
    const open = stage(a.accion, 0, sider ? 0.5 : 1) * DOOR_OPEN;
    if (nodes.doorR) nodes.doorR.rotation.y = open;
    if (nodes.doorL) nodes.doorL.rotation.y = -open;
  });

  ctx.anchors.puertas = [x0 - 0.08, fy + H * 0.45, 0.35];
  ctx.anchors.caja = [0, fy + H / 2, hw];
  ctx.anchors.interior = [0, fy + H * 0.5, 0];
  ctx.livery = { side: [0, fy + H / 2 + 0.02, Math.min(L.L - 2.2, 9.5), H - 0.75], front: [0, fy + H / 2, 1.9, H - 0.9] };
  ctx.marking = { y: fy - 0.075, z: hw, x0: x0 + 0.1, x1: x1 - 0.1 };
}
