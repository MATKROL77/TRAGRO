/**
 * Estructura: chasis de dos largueros doble T con cuello de ganso, bastidor
 * perimetral (tolva), plato de enganche con perno rey, patas de apoyo, cola
 * (paragolpes, luces, patente) y demarcación reflectiva.
 */
import * as THREE from 'three';
import type { Layout } from '@/core/layout';
import type { Assembly } from '../kit/asm';
import { bar, box, boxUV, cChannelZ, cyl, extrudeSide, iBeam, pipe, rbox, rod, type P2 } from '../kit/geo';

export const MAIN_DEPTH = 0.42;

export interface ChassisInfo {
  /** Cara inferior de la estructura donde cuelga la suspensión. */
  frameBottomY: number;
  /** Altura a la que se fijan las patas. */
  legTopY: number;
  legZ: number;
}

/** Chasis clásico: dos largueros doble T con cuello de ganso y travesaños. */
export function buildTwinRailChassis(asm: Assembly, L: Layout, opts: { throughBeams: boolean }): ChassisInfo {
  asm.into('sprung');
  const top = L.deckY;
  const rz = L.railZ;
  const xF = L.frontX - 0.03;
  const xR = L.rearX + 0.04;
  const dNeck = top - (L.kingpinY + 0.012);
  const dRear = 0.24;
  const xS0 = L.kingpinX - 0.95;
  const xS1 = Math.max(L.landingX + 0.2, L.kingpinX - 1.55);
  const xT = xR + 0.85;
  const yNeck = top - dNeck;
  const yMain = top - MAIN_DEPTH;
  const yRear = top - dRear;
  const fl = 0.15;
  const tfl = 0.014;

  const web: P2[] = [
    [xF, top],
    [xR, top],
    [xR, yRear],
    [xT, yMain],
    [xS1, yMain],
    [xS0, yNeck],
    [xF, yNeck],
  ];
  for (const s of [1, -1]) {
    const z = s * rz;
    asm.add('chassisPaint', extrudeSide(web, 0.009, z));
    asm.add('chassisPaint', box(xF - xR, tfl, fl, (xF + xR) / 2, top - tfl / 2, z));
    asm.add(
      'chassisPaint',
      bar({ x: xF, y: yNeck + tfl / 2, z }, { x: xS0, y: yNeck + tfl / 2, z }, fl, tfl),
      bar({ x: xS0, y: yNeck + tfl / 2, z }, { x: xS1, y: yMain + tfl / 2, z }, fl, tfl),
      bar({ x: xS1, y: yMain + tfl / 2, z }, { x: xT, y: yMain + tfl / 2, z }, fl, tfl),
      bar({ x: xT, y: yMain + tfl / 2, z }, { x: xR, y: yRear + tfl / 2, z }, fl, tfl),
    );
    // Rigidizadores verticales del alma.
    for (let x = xT + 0.3; x < xS1 - 0.2; x += 1.15) {
      asm.add('chassisPaint', box(0.008, MAIN_DEPTH - 2 * tfl, 0.066, x, top - MAIN_DEPTH / 2, z + s * 0.037), box(0.008, MAIN_DEPTH - 2 * tfl, 0.066, x, top - MAIN_DEPTH / 2, z - s * 0.037));
    }
  }

  // Travesaños entre largueros.
  for (let x = xT - 0.2; x < xS1; x += 1.1) asm.add('chassisPaint', cChannelZ(-rz + 0.005, rz - 0.005, x, top - 0.07, 0.22, 0.07, 0.007));
  for (let x = xS0 + 0.25; x < xF - 0.1; x += 0.6) asm.add('chassisPaint', box(0.06, dNeck - 0.02, 2 * rz, x, top - dNeck / 2, 0));
  if (opts.throughBeams) {
    // Travesaños pasantes de lado a lado: soportan el piso.
    for (let x = xR + 0.25; x < xF - 0.05; x += 0.5) asm.add('chassisPaint', box(0.05, 0.1, L.W - 0.14, x, top - 0.05, 0));
  }
  asm.add('chassisPaint', rbox(0.07, dNeck + 0.03, L.W - 0.3, xF - 0.02, top - dNeck / 2, 0, 0.008));

  buildKingpin(asm, L, 2 * rz + 0.7);
  buildServiceConnections(asm, xF + 0.016, top - dNeck / 2 - 0.005);
  buildAirTanks(asm, L, yMain + 0.2);

  return { frameBottomY: yMain, legTopY: top - 0.03, legZ: rz + 0.17 };
}

/** Bastidor perimetral de la tolva: largueros laterales, cabezales y soportes de ejes. */
export function buildPerimeterFrame(asm: Assembly, L: Layout): ChassisInfo {
  asm.into('sprung');
  const railY = L.deckY;
  const h = 0.3;
  const zr = L.W / 2 - 0.085;
  const x0 = L.rearX + 0.02;
  const x1 = L.frontX - 0.02;
  const bolsterTop = railY - h;
  const bottom = 0.98;
  for (const s of [1, -1]) asm.add('chassisPaint', iBeam(x0, x1, railY, h, 0.16, s * zr, 0.016, 0.009));
  asm.add('chassisPaint', rbox(0.1, h, L.W - 0.02, x0 + 0.05, railY - h / 2, 0, 0.008), rbox(0.1, h, L.W - 0.02, x1 - 0.05, railY - h / 2, 0, 0.008));

  // Soportes de suspensión: travesaños + largueros cortos bajo cada eje (o grupo).
  const groups: [number, number][] = L.grouped ? [[L.axles[L.axles.length - 1].x, L.axles[0].x]] : L.axles.map((a) => [a.x, a.x] as [number, number]);
  for (const [a, b] of groups) {
    const xa = a - 0.6;
    const xb = b + 0.6;
    for (const s of [1, -1]) asm.add('chassisPaint', iBeam(xa, xb, bolsterTop, bolsterTop - bottom, 0.15, s * L.railZ, 0.014, 0.009));
    const crosses = [xa + 0.2, xb - 0.2];
    for (let x = xa + 0.2 + 1.3; x < xb - 0.3; x += 1.3) crosses.push(x);
    for (const x of crosses) {
      asm.add('chassisPaint', cChannelZ(-zr + 0.01, zr - 0.01, x, railY - 0.03, h - 0.03, 0.09, 0.008));
      for (const s of [1, -1]) asm.add('chassisPaint', extrudeSide([[x - 0.045, bolsterTop], [x + 0.045, bolsterTop], [x + 0.045, bottom + 0.05], [x - 0.045, bottom + 0.05]], 0.008, s * (L.railZ + 0.085)));
    }
  }

  // Subchasis delantero con plato de enganche.
  const fb = L.kingpinY + 0.012;
  const xb = L.landingX - 0.25;
  for (const s of [1, -1]) {
    asm.add('chassisPaint', iBeam(xb, x1 - 0.1, bolsterTop + 0.02, bolsterTop + 0.02 - fb, 0.14, s * 0.46, 0.014, 0.009));
    // Diagonal de refuerzo hacia el larguero lateral.
    asm.add('chassisPaint', bar({ x: xb + 0.1, y: bolsterTop - 0.06, z: s * 0.5 }, { x: xb + 0.75, y: bolsterTop - 0.06, z: s * (zr - 0.06) }, 0.06, 0.1));
  }
  for (let x = xb + 0.15; x < x1 - 0.15; x += 0.62) asm.add('chassisPaint', cChannelZ(-zr + 0.01, zr - 0.01, x, railY - 0.03, h - 0.03, 0.08, 0.008));
  buildKingpin(asm, L, 2.0);
  buildServiceConnections(asm, x1 + 0.003, railY - h / 2);
  buildAirTanks(asm, L, bolsterTop - 0.02, true);

  return { frameBottomY: bottom, legTopY: bolsterTop + 0.02, legZ: zr - 0.13 };
}

function buildKingpin(asm: Assembly, L: Layout, width: number): void {
  const y = L.kingpinY;
  asm.add('blackSteel', rbox(1.25, 0.012, width, L.kingpinX + 0.05, y + 0.006, 0, 0.004));
  asm.add('chrome', cyl(0.0254, 0.05, 'y', L.kingpinX, y - 0.025, 0, 20), cyl(0.036, 0.022, 'y', L.kingpinX, y - 0.061, 0, 20), cyl(0.03, 0.014, 'y', L.kingpinX, y - 0.079, 0, 20));
  asm.add('galvanized', cyl(0.07, 0.008, 'y', L.kingpinX, y - 0.004, 0, 24));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    asm.add('galvanized', cyl(0.009, 0.01, 'y', L.kingpinX + Math.cos(a) * 0.055, y - 0.012, Math.sin(a) * 0.055, 6));
  }
}

/** Manos de acople de aire (roja y amarilla) y toma eléctrica en el frente. */
function buildServiceConnections(asm: Assembly, x: number, y: number): void {
  asm.add('galvanized', rbox(0.012, 0.11, 0.42, x, y, 0, 0.004));
  asm.add('redPaint', cyl(0.024, 0.05, 'x', x + 0.03, y, -0.13, 12));
  asm.add('yellowPaint', cyl(0.024, 0.05, 'x', x + 0.03, y, -0.04, 12));
  asm.add('plastic', cyl(0.034, 0.045, 'x', x + 0.028, y, 0.1, 14), cyl(0.04, 0.012, 'x', x + 0.052, y, 0.1, 14));
}

function buildAirTanks(asm: Assembly, L: Layout, y: number, lengthwise = false): void {
  const first = L.axles[0].x;
  const x = Math.min(L.landingX - 0.75, first + 1.0);
  if (lengthwise) {
    // En la tolva van al costado del subchasis delantero, a lo largo.
    const xt = L.landingX + 0.55;
    for (const s of [1, -1]) {
      asm.add('aluBrushed', cyl(0.125, 0.6, 'x', xt, y - 0.1, s * 0.82, 20), cyl(0.127, 0.02, 'x', xt - 0.3, y - 0.1, s * 0.82, 20), cyl(0.127, 0.02, 'x', xt + 0.3, y - 0.1, s * 0.82, 20));
      asm.add('blackSteel', box(0.03, 0.28, 0.27, xt - 0.15, y - 0.08, s * 0.82), box(0.03, 0.28, 0.27, xt + 0.15, y - 0.08, s * 0.82));
    }
    return;
  }
  for (const dx of [0, -0.36]) {
    asm.add('aluBrushed', cyl(0.13, 0.7, 'z', x + dx, y, 0, 20));
    asm.add('aluBrushed', cyl(0.132, 0.02, 'z', x + dx, y, -0.36, 20), cyl(0.132, 0.02, 'z', x + dx, y, 0.36, 20));
    asm.add('blackSteel', box(0.28, 0.03, 0.03, x + dx, y + 0.14, -0.2), box(0.28, 0.03, 0.03, x + dx, y + 0.14, 0.2));
  }
}

/** Patas de apoyo telescópicas con zapata, eje de mando y manivela. */
export function buildLandingGear(asm: Assembly, L: Layout, info: ChassisInfo, bracePointY: number): void {
  const x = L.landingX;
  const zl = info.legZ;
  const topY = info.legTopY;
  const outerBottom = 0.62;
  asm.node('legs', 'sprung', [0, 0, 0]);
  for (const s of [1, -1]) {
    const z = s * zl;
    asm.into('sprung');
    asm.add('chassisPaint', rbox(0.118, topY - outerBottom, 0.118, x, (topY + outerBottom) / 2, z, 0.008));
    asm.add('chassisPaint', rbox(0.02, 0.34, 0.26, x - 0.07, topY - 0.19, z, 0.004));
    // Arriostres: longitudinal al chasis y cruz entre patas.
    asm.add('chassisPaint', bar({ x: x - 0.04, y: outerBottom + 0.08, z }, { x: x - 0.85, y: bracePointY + 0.03, z: z - s * 0.02 }, 0.012, 0.06));
    asm.add('chassisPaint', rod({ x: x - 0.03, y: outerBottom + 0.06, z: z - s * 0.05 }, { x: x - 0.03, y: topY - 0.12, z: -z + s * 0.05 }, 0.017, 8));

    asm.into('legs');
    asm.add('galvanized', rbox(0.092, 0.6, 0.092, x, 0.34, z, 0.006));
    asm.add('chassisPaint', rbox(0.27, 0.018, 0.24, x, 0.021, z, 0.006), rbox(0.14, 0.06, 0.012, x, 0.06, z - 0.055, 0.003), rbox(0.14, 0.06, 0.012, x, 0.06, z + 0.055, 0.003));
    asm.add('galvanized', cyl(0.016, 0.16, 'z', x, 0.065, z, 10));
  }
  asm.into('sprung');
  asm.add('galvanized', cyl(0.019, 2 * zl, 'z', x + 0.02, outerBottom + 0.36, 0, 10));
  // Caja reductora y manivela del lado derecho.
  const gz = zl + 0.1;
  const gy = outerBottom + 0.36;
  asm.add('blackSteel', rbox(0.15, 0.2, 0.09, x + 0.02, gy, gz - 0.02, 0.008));
  asm.add('galvanized', pipe([[x + 0.02, gy, gz], [x + 0.02, gy, gz + 0.13], [x + 0.02, gy - 0.24, gz + 0.13], [x + 0.02, gy - 0.24, gz + 0.26]], 0.012, 8));
  asm.add('rubber', cyl(0.019, 0.12, 'z', x + 0.02, gy - 0.24, gz + 0.215, 10));
}

export interface RearOptions {
  /** Centro vertical del travesaño de luces. */
  beamY: number;
  beamH: number;
  /** Fijación de los soportes del paragolpes. */
  frameBottomY: number;
  workLights?: number | null;
}

/** Cola: travesaño de luces LED, patente, cartel de velocidad y paragolpes. */
export function buildRearEnd(asm: Assembly, L: Layout, o: RearOptions): void {
  asm.into('sprung');
  const x = L.rearX;
  const w = L.W - 0.06;
  asm.add('chassisPaint', rbox(0.1, o.beamH, w, x + 0.045, o.beamY, 0, 0.01));

  for (const s of [1, -1]) {
    const zc = s * (L.W / 2 - 0.36);
    asm.add('blackSteel', rbox(0.035, 0.15, 0.52, x - 0.012, o.beamY, zc, 0.012));
    const lamps: ['lensRed' | 'lensAmber' | 'lensWhite', number][] = [
      ['lensRed', 0.16],
      ['lensAmber', 0],
      ['lensWhite', -0.16],
    ];
    for (const [mat, dz] of lamps) {
      const z = zc + s * dz;
      asm.add('chrome', cyl(0.066, 0.012, 'x', x - 0.03, o.beamY, z, 24));
      asm.add(mat, cyl(0.057, 0.02, 'x', x - 0.036, o.beamY, z, 24, 0.05));
    }
    // Demarcadora lateral trasera roja.
    asm.add('lensRed', rbox(0.06, 0.03, 0.012, x + 0.09, o.beamY, s * (L.W / 2 + 0.004), 0.004));
  }

  // Patente con luz y cartel de velocidad máxima.
  asm.add('plate', box(0.004, 0.13, 0.4, x - 0.008, o.beamY, 0));
  asm.add('blackSteel', rbox(0.012, 0.15, 0.43, x - 0.002, o.beamY, 0, 0.004), rbox(0.03, 0.02, 0.2, x - 0.02, o.beamY + 0.085, 0, 0.004));
  const sign = new THREE.PlaneGeometry(0.21, 0.21);
  sign.rotateY(-Math.PI / 2);
  sign.translate(x - 0.011, o.beamY, 0.38);
  asm.add('speed', sign);

  // Paragolpes antiempotramiento con cinta reflectiva.
  const by = 0.5;
  const bx = x + 0.03;
  asm.add('chassisPaint', rbox(0.1, 0.1, L.W - 0.24, bx, by, 0, 0.012));
  asm.add('reflex', boxUV(box(0.003, 0.05, L.W - 0.34, bx - 0.052, by, 0), 0.4));
  for (const s of [1, -1]) {
    const z = s * 0.62;
    asm.add('chassisPaint', rbox(0.08, o.frameBottomY - by, 0.09, bx + 0.01, (o.frameBottomY + by) / 2, z, 0.006));
    asm.add('chassisPaint', bar({ x: bx + 0.03, y: by + 0.06, z }, { x: bx + 0.55, y: o.frameBottomY - 0.02, z }, 0.06, 0.05));
    asm.add('plastic', rbox(0.014, 0.1, 0.1, bx, by, s * (L.W / 2 - 0.115), 0.004));
  }

  if (o.workLights !== undefined && o.workLights !== null) {
    for (const s of [1, -1]) {
      const z = s * (L.W / 2 - 0.2);
      asm.add('blackSteel', rbox(0.06, 0.09, 0.13, x - 0.02, o.workLights, z, 0.01));
      asm.add('lensWhite', rbox(0.012, 0.07, 0.11, x - 0.052, o.workLights, z, 0.004));
    }
  }
}

/** Cinta reflectiva lateral (tramos alternados blanco/rojo) y demarcadoras ámbar. */
export function buildSideMarking(asm: Assembly, x0: number, x1: number, y: number, zFace: number, opts: { extraLights?: boolean; node?: string } = {}): void {
  asm.into(opts.node ?? 'sprung');
  const len = x1 - x0;
  for (const s of [1, -1]) {
    asm.add('reflex', boxUV(box(len, 0.05, 0.003, (x0 + x1) / 2, y, s * (zFace + 0.002)), 0.4));
    const step = opts.extraLights ? 1.25 : 2.5;
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const x = x0 + 0.12 + ((len - 0.24) * i) / n;
      asm.add('lensAmber', rbox(0.075, 0.032, 0.014, x, y + 0.062, s * (zFace + 0.006), 0.005));
    }
  }
}
