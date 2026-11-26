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
  const { asm, L, sel } = ctx;
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
  const slidingRoof = sider && sel.techo === 'corredizo';
  if (slidingRoof) {
    // Techo de lona sobre arcos: se recoge hacia el marco trasero (pivote atrás).
    asm.node('roofSlide', 'sprung', [x0 + 0.06, top + 0.03, 0]);
    asm.into('roofSlide');
    asm.add('lona', boxUV(box(L.L - 0.12, 0.02, L.W - 0.08, 0, top + 0.05, 0), 0.6));
    for (let x = x0 + 0.5; x < x1 - 0.3; x += 0.62) asm.add('galvanized', rbox(0.035, 0.03, L.W - 0.1, x, top + 0.03, 0, 0.008));
    asm.into('sprung');
  } else {
    asm.add('roof', rbox(L.L - 0.06, 0.035, L.W - 0.06, 0, top + 0.032, 0, 0.012));
  }
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
    buildSiderSides(ctx);
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
  // En el sider la acción es "Correr lona": las puertas traseras quedan cerradas.
  if (!sider) {
    ctx.updaters.push((a, nodes) => {
      const open = stage(a.accion, 0, 1) * DOOR_OPEN;
      if (nodes.doorR) nodes.doorR.rotation.y = open;
      if (nodes.doorL) nodes.doorL.rotation.y = -open;
    });
  }
  if (slidingRoof) {
    ctx.updaters.push((a, nodes) => {
      const k = stage(a.accion, 0.62, 1);
      if (nodes.roofSlide) nodes.roofSlide.scale.x = 1 - 0.82 * k;
    });
  }

  ctx.anchors.puertas = [x0 - 0.08, fy + H * 0.45, 0.35];
  ctx.anchors.caja = [0, fy + H / 2, hw];
  ctx.anchors.interior = [0, fy + H * 0.5, 0];
  if (sider) ctx.anchors.lateralLibre = [x0 + L.L * 0.55, fy + H * 0.55, hw + 0.05];
  ctx.livery = { side: [0, fy + H / 2 + 0.02, Math.min(L.L - 2.2, 9.5), H - 0.75], front: [0, fy + H / 2, 1.9, H - 0.9] };
  ctx.marking = { y: fy - 0.075, z: hw, x0: x0 + 0.1, x1: x1 - 0.1 };
}

/**
 * Laterales del sider: riel superior (los largueros del techo), parantes corredizos o
 * desmontables, tablillas opcionales y una lona por lado anclada atrás.
 * "Correr lona": se sueltan las hebillas, salen las tablillas, la lona se recoge hacia
 * atrás y los parantes se van al marco trasero (o se sacan si son desmontables).
 */
function buildSiderSides(ctx: BuildCtx): void {
  const { asm, L, sel, mats } = ctx;
  const fy = L.floorY;
  const H = L.H;
  const top = fy + H;
  const hw = L.W / 2;
  const x0 = L.rearX;
  const x1 = L.frontX;
  const sliding = sel.parantes === 'corredizos';
  const slats = sel.tablillas === 'aluminio' || sel.tablillas === 'madera';
  const slatMat: MatKey = sel.tablillas === 'madera' ? 'wood' : 'aluBrushed';
  const nPosts = L.L > 12 ? 3 : 2;
  const postZ = hw - 0.1;
  const posts: { name: string; x: number; i: number; s: number }[] = [];

  for (const s of [1, -1]) {
    // Parantes: un nodo cada uno para poder moverlos.
    for (let i = 0; i < nPosts; i++) {
      const x = x0 + (L.L * (i + 1)) / (nPosts + 1);
      const name = `post${s > 0 ? 'R' : 'L'}${i}`;
      asm.node(name, 'sprung', [x, fy, s * postZ]);
      asm.into(name);
      asm.add('galvanized', rbox(0.1, H - 0.06, 0.085, x, fy + H / 2 - 0.03, s * postZ, 0.012));
      if (sliding) {
        // Carro con ruedas sobre el riel superior.
        asm.add('chassisPaint', rbox(0.22, 0.06, 0.07, x, top - 0.06, s * (hw - 0.06), 0.01));
        for (const dx of [-0.07, 0.07]) asm.add('rubber', cyl(0.025, 0.03, 'z', x + dx, top - 0.03, s * (hw - 0.06), 10));
      } else {
        // Encastre con traba: el parante se levanta y sale.
        for (const yy of [fy + 0.05, top - 0.08]) asm.add('chassisPaint', rbox(0.14, 0.05, 0.1, x, yy, s * postZ, 0.01));
      }
      asm.into('sprung');
      posts.push({ name, x, i, s });
    }
    // Tablillas: un nodo por lado que se saca entero.
    if (slats) {
      const name = s > 0 ? 'slatsR' : 'slatsL';
      asm.node(name, 'sprung', [0, fy, s * (hw - 0.16)]);
      asm.into(name);
      for (const dy of [0.35, 0.85, 1.35]) if (dy < H - 0.5) asm.add(slatMat, boxUV(box(L.L - 0.25, 0.16, 0.024, 0, fy + dy, s * (hw - 0.16)), 0.5));
      asm.into('sprung');
    }
  }

  const curtains: PleatCurtain[] = [];
  for (const s of [1, -1]) {
    const c = new PleatCurtain({ x0: x0 + 0.1, x1: x1 - 0.085, y0: fy - 0.11, y1: top - 0.07, z: s * (hw - 0.014), side: s as 1 | -1, strapSpacing: 0.62, ratchet: sel.tensado === 'trinquete' }, mats);
    asm.attach(c.group, 'sprung');
    curtains.push(c);
  }
  ctx.disposers.push(() => curtains.forEach((c) => c.dispose()));

  ctx.updaters.push((a, nodes) => {
    const release = stage(a.accion, 0, 0.14);
    const slatsOut = stage(a.accion, 0.1, 0.32);
    const gather = stage(a.accion, 0.22, 0.7);
    const postsK = stage(a.accion, 0.55, 1);
    curtains.forEach((c) => c.update(gather, release));
    for (const name of ['slatsR', 'slatsL']) {
      const n = nodes[name];
      if (!n) continue;
      const rest = n.userData.rest as { x: number; y: number; z: number };
      const s = name === 'slatsR' ? 1 : -1;
      n.position.set(rest.x, rest.y - 0.25 * slatsOut, rest.z + s * 0.9 * slatsOut);
      n.visible = slatsOut < 0.999;
    }
    for (const p of posts) {
      const n = nodes[p.name];
      if (!n) continue;
      const rest = n.userData.rest as { x: number; y: number; z: number };
      if (sliding) {
        // Se apilan contra el marco trasero, uno detrás del otro.
        const target = x0 + 0.3 + p.i * 0.14;
        n.position.set(rest.x + (target - p.x) * postsK, rest.y, rest.z);
        n.visible = true;
      } else {
        // Se levantan del encastre y salen hacia afuera.
        const lift = Math.min(1, postsK / 0.4);
        const out = Math.max(0, (postsK - 0.4) / 0.6);
        n.position.set(rest.x, rest.y + 0.12 * lift, rest.z + p.s * 0.8 * out);
        n.visible = postsK < 0.999;
      }
    }
  });
}
