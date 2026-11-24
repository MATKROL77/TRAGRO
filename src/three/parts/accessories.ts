/**
 * Accesorios: cajón de herramientas, portaauxilio, tanque de agua, matafuego.
 * Se ubican solos en los huecos libres del lateral (entre patas, ejes y cola).
 */
import type { BuildCtx, Slot } from '../build';
import { bar, box, cyl, pipe, rbox } from '../kit/geo';

interface Free {
  side: 1 | -1;
  x0: number;
  x1: number;
}

function freeIntervals(ctx: BuildCtx): Free[] {
  const { L } = ctx;
  const blocks: [number, number][] = L.axles.map((a) => [a.x - (L.wheelR + 0.16), a.x + (L.wheelR + 0.16)]);
  const start = L.rearX + 0.22;
  const end = L.landingX - 0.32;
  const base: [number, number][] = [];
  let cur = start;
  for (const [a, b] of blocks.sort((p, q) => p[0] - q[0])) {
    if (a - cur > 0.3) base.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (end - cur > 0.3) base.push([cur, end]);
  const out: Free[] = [];
  for (const side of [1, -1] as const) {
    for (const [a, b] of base) {
      let parts: [number, number][] = [[a, b]];
      for (const s of ctx.slots.filter((sl: Slot) => sl.side === side)) {
        parts = parts.flatMap(([p, q]) => {
          if (s.x1 <= p || s.x0 >= q) return [[p, q] as [number, number]];
          const r: [number, number][] = [];
          if (s.x0 - p > 0.25) r.push([p, s.x0]);
          if (q - s.x1 > 0.25) r.push([s.x1, q]);
          return r;
        });
      }
      for (const [p, q] of parts) out.push({ side, x0: p, x1: q });
    }
  }
  // De adelante hacia atrás: lo más accesible primero.
  return out.sort((p, q) => q.x1 - p.x1);
}

export function buildAccessories(ctx: BuildCtx): void {
  const { asm, L, sel } = ctx;
  asm.into('sprung');
  const free = freeIntervals(ctx);
  const tolva = L.tipo === 'tolva';
  const depth = tolva ? 0.4 : 0.5;
  const topY = tolva ? L.deckY - 0.33 : L.tipo === 'batea' ? L.deckY - 0.16 : L.floorY - 0.18;
  const zFace = L.W / 2 - 0.035;

  const place = (len: number, pref: 1 | -1, margin = 0.06): { x: number; side: 1 | -1 } | null => {
    const need = len + margin * 2;
    const pick = free.find((f) => f.side === pref && f.x1 - f.x0 >= need) ?? free.find((f) => f.x1 - f.x0 >= need);
    if (!pick) return null;
    const x = pick.x1 - margin - len / 2;
    pick.x1 -= need;
    return { x, side: pick.side };
  };

  const hangers = (x: number, len: number, side: number, bottomOfFrame: number, top: number, z: number) => {
    for (const dx of [-len / 2 + 0.07, len / 2 - 0.07]) asm.add('chassisPaint', box(0.05, Math.max(0.02, bottomOfFrame - top + 0.02), 0.008, x + dx, (bottomOfFrame + top) / 2, z - side * 0.02));
  };
  const frameY = tolva ? L.deckY - 0.3 : L.tipo === 'batea' ? L.deckY - 0.02 : L.floorY - 0.16;

  // --- Portaauxilio --------------------------------------------------------------
  const nSpare = Number(sel.portaauxilio ?? 0);
  if (tolva) {
    // En la tolva van al frente, parados contra la pared delantera.
    const z = -(L.W / 2 - 0.62);
    const y = L.deckY + 0.6;
    for (let i = 0; i < nSpare; i++) {
      const x = L.frontX + 0.215 + i * 0.32;
      ctx.spares.push({ x, y, z, euler: [0, Math.PI / 2, 0] });
    }
    if (nSpare > 0) {
      const depthX = 0.1 + nSpare * 0.32;
      asm.add('chassisPaint', rbox(depthX, 0.09, 0.09, L.frontX + depthX / 2, y, z, 0.01), rbox(0.03, 0.6, 0.09, L.frontX + 0.02, y, z, 0.006), rbox(0.03, 0.09, 0.6, L.frontX + 0.02, y, z, 0.006));
      asm.add('galvanized', rbox(0.02, 0.3, 0.09, L.frontX + depthX + 0.01, y, z, 0.005), rbox(0.02, 0.09, 0.3, L.frontX + depthX + 0.01, y, z, 0.005), cyl(0.03, 0.05, 'x', L.frontX + depthX + 0.04, y, z, 6));
      // Apoyo inferior de la cubierta.
      asm.add('chassisPaint', rbox(depthX, 0.04, 0.5, L.frontX + depthX / 2, y - L.wheelR - 0.02, z, 0.006), bar({ x: L.frontX, y: y - L.wheelR - 0.3, z }, { x: L.frontX + depthX - 0.02, y: y - L.wheelR - 0.04, z }, 0.04, 0.04));
    }
  } else {
    for (let i = 0; i < nSpare; i++) {
      const p = place(1.1, i === 0 ? -1 : 1, 0.04);
      if (!p) break;
      const z = p.side * 0.76;
      const y = frameY - 0.42;
      ctx.spares.push({ x: p.x, y, z, euler: [Math.PI / 2, 0, 0] });
      // Canasto: dos travesaños, aro de apoyo y tensores al chasis.
      for (const dx of [-0.3, 0.3]) {
        asm.add('chassisPaint', rbox(0.05, 0.04, 1.08, p.x + dx, y - 0.17, z, 0.005));
        for (const dz of [-0.5, 0.5]) asm.add('chassisPaint', box(0.04, frameY - (y - 0.17), 0.008, p.x + dx, (frameY + y - 0.17) / 2, z + dz));
      }
      asm.add('chassisPaint', rbox(0.7, 0.04, 0.05, p.x, y - 0.17, z - 0.3, 0.005), rbox(0.7, 0.04, 0.05, p.x, y - 0.17, z + 0.3, 0.005));
      asm.add('galvanized', cyl(0.014, 0.4, 'y', p.x, y + 0.02, z, 8), cyl(0.07, 0.014, 'y', p.x, y + 0.19, z, 12), cyl(0.028, 0.03, 'y', p.x, y + 0.22, z, 6));
    }
  }

  // --- Cajones de herramientas -------------------------------------------------------
  const nBox = Number(sel.cajon ?? 0);
  for (let i = 0; i < nBox; i++) {
    const len = tolva ? 0.66 : 0.8;
    const p = place(len, tolva ? -1 : i === 0 ? 1 : -1);
    if (!p) break;
    const h = 0.46;
    const z = p.side * (zFace - depth / 2);
    const y = topY - h / 2;
    asm.add('plastic', rbox(len, h, depth, p.x, y, z, 0.03));
    // Tapa frontal con marco, bisagra y cierres.
    const fz = p.side * (zFace + 0.004);
    asm.add('plastic', rbox(len - 0.07, h - 0.08, 0.016, p.x, y - 0.005, fz, 0.008));
    asm.add('galvanized', rbox(len - 0.1, 0.014, 0.012, p.x, y - h / 2 + 0.05, fz + p.side * 0.006, 0.003));
    for (const dx of [-len / 2 + 0.16, len / 2 - 0.16]) asm.add('galvanized', rbox(0.05, 0.085, 0.02, p.x + dx, y + h / 2 - 0.07, fz + p.side * 0.008, 0.004));
    hangers(p.x, len, p.side, frameY, topY, z);
    if (i === 0) ctx.anchors.cajon = [p.x, y, p.side * zFace];
  }

  // --- Tanque de agua lavamanos ------------------------------------------------------
  if (sel.tanqueAgua === true) {
    const len = 0.5;
    const p = place(len, tolva ? -1 : 1, 0.05);
    if (p) {
      const z = p.side * (zFace - 0.13);
      const y = topY - 0.17;
      asm.add('whitePlastic', rbox(len, 0.28, 0.24, p.x, y, z, 0.04));
      asm.add('plastic', cyl(0.045, 0.03, 'y', p.x - 0.14, y + 0.15, z, 14));
      asm.add('redPaint', cyl(0.014, 0.05, 'z', p.x + 0.17, y - 0.1, z + p.side * 0.13, 8), box(0.012, 0.03, 0.03, p.x + 0.17, y - 0.08, z + p.side * 0.16));
      asm.add('whitePlastic', rbox(0.12, 0.03, 0.08, p.x - 0.12, y - 0.16, z + p.side * 0.1, 0.008));
      asm.add('galvanized', rbox(len + 0.04, 0.03, 0.26, p.x, y - 0.155, z, 0.004));
      hangers(p.x, len, p.side, frameY, y + 0.14, z);
    }
  }

  // --- Matafuego ---------------------------------------------------------------------
  if (sel.matafuego === true) {
    const p = place(0.26, tolva ? 1 : 1, 0.04);
    if (p) {
      const z = p.side * (zFace - 0.1);
      const y0 = topY - 0.56;
      asm.add('redPaint', cyl(0.078, 0.44, 'y', p.x, y0 + 0.25, z, 20), cyl(0.078, 0.06, 'y', p.x, y0 + 0.49, z, 20, 0.035));
      asm.add('blackSteel', cyl(0.024, 0.07, 'y', p.x, y0 + 0.55, z, 10), box(0.11, 0.016, 0.03, p.x + 0.03, y0 + 0.59, z));
      asm.add('rubber', pipe([[p.x - 0.02, y0 + 0.56, z], [p.x - 0.1, y0 + 0.5, z], [p.x - 0.1, y0 + 0.2, z + p.side * 0.02]], 0.011, 6, true));
      asm.add('galvanized', rbox(0.2, 0.03, 0.2, p.x, y0 + 0.012, z, 0.004), rbox(0.03, 0.6, 0.012, p.x, y0 + 0.3, z - p.side * 0.085, 0.003), rbox(0.2, 0.025, 0.012, p.x, y0 + 0.36, z + p.side * 0.082, 0.003));
      hangers(p.x, 0.2, p.side, frameY, y0 + 0.6, z);
    }
  }
}
