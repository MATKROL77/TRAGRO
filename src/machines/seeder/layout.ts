/**
 * Layout paramétrico de la sembradora (puro, sin three.js).
 * Lo usan tanto el generador 3D como las calculadoras de transporte, así las cotas coinciden con lo que se ve.
 * Convención: 1 unidad = 1 m. X = lateral, Y = arriba, Z = adelante (sentido de avance).
 */
import { getGroup, getModel } from '../../domain/catalog';
import type { Configuration, Tier } from '../../domain/types';

export const DIM = {
  barY: 0.78, // centro del tubo porta-herramientas
  barSize: 0.18,
  barOverhang: 0.16, // tubo más allá de la mitad de la distancia entre hileras
  lift: 0.26, // cuánto se levanta el bastidor en transporte
  hitchZ: 3.05, // largo de la lanza de trabajo
  coulterZ: 0.42,
  rowRearZ: -1.46, // parte trasera de las ruedas tapadoras
  rowFrontZ: 0.62, // frente de la cuchilla
  unitTuck: 0.72, // cuánto sobresale el cuerpo (hacia abajo) con el bastidor levantado
  foldAngle: Math.PI / 2,
  centerTargetM: 3.1,
  transportDrawbar: 2.7,
  carriageTrack: 2.5,
  carriageOffset: 0.6, // tren longitudinal separado del extremo del tubo
  platformY: 1.42,
  tankDepth: 1.1,
  tankZ: -0.78,
};

export type SectionId = 'L' | 'C' | 'R';
export interface Section {
  id: SectionId;
  rows: number[]; // índices de surco
  x0: number;
  x1: number;
}

export interface TankLayout {
  kind: 'seed' | 'fert';
  liters: number;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number; // altura de la parte prismática
  hopperH: number; // altura de la tolva inferior (trapecio)
  bottomY: number;
}

export interface SeederLayout {
  tier: Tier;
  rows: number;
  spacing: number;
  workWidth: number;
  barLength: number;
  rowX: number[];
  transport: 'fold' | 'longitudinal';
  sections: Section[];
  hingeX: number; // |x| de la bisagra (0 si no hay alas)
  wingLength: number;
  tanks: TankLayout[];
  individualHopperL: number;
  hasCentralSeed: boolean;
  fert: 'none' | 'inline' | 'side';
  topY: number;
  work: { width: number; length: number; height: number };
  transportDims: { width: number; length: number; height: number };
}

function tank(kind: 'seed' | 'fert', liters: number, x: number, width: number): TankLayout {
  const depth = DIM.tankDepth;
  const hopperH = 0.42;
  // volumen = prisma + tronco de pirámide (aprox. 55 % del prisma de la misma altura)
  const v = liters / 1000;
  const vHopper = width * depth * hopperH * 0.55;
  const height = Math.max(0.35, (v - vHopper) / (width * depth));
  return { kind, liters, x, z: DIM.tankZ, width, depth, height, hopperH, bottomY: DIM.platformY };
}

export function computeLayout(cfg: Configuration): SeederLayout {
  const model = getModel(cfg.model);
  const spacing = cfg.spacingCm / 100;
  const rows = cfg.rows;
  const workWidth = rows * spacing;
  const barLength = workWidth + 2 * DIM.barOverhang;
  const rowX = Array.from({ length: rows }, (_, i) => (i - (rows - 1) / 2) * spacing);
  const transport = cfg.selections.transport === 'fold' ? 'fold' : 'longitudinal';

  let sections: Section[];
  let hingeX = 0;
  if (transport === 'fold') {
    let center = Math.max(2, Math.round(DIM.centerTargetM / spacing));
    if (center > rows) center = rows;
    if ((rows - center) % 2 !== 0) center = center + 1 <= rows ? center + 1 : center - 1;
    const wing = (rows - center) / 2;
    hingeX = (center * spacing) / 2;
    const idx = (a: number, b: number) => Array.from({ length: b - a }, (_, k) => a + k);
    sections = [
      { id: 'L', rows: idx(0, wing), x0: -barLength / 2, x1: -hingeX },
      { id: 'C', rows: idx(wing, wing + center), x0: -hingeX, x1: hingeX },
      { id: 'R', rows: idx(wing + center, rows), x0: hingeX, x1: barLength / 2 },
    ];
  } else {
    sections = [{ id: 'C', rows: rowX.map((_, i) => i), x0: -barLength / 2, x1: barLength / 2 }];
  }
  const wingLength = hingeX ? barLength / 2 - hingeX : 0;

  const seedCap = getGroup('seedCapacity')?.options.find((o) => o.id === cfg.selections.seedCapacity)?.attrs ?? {};
  const fertCap = getGroup('fertCapacity')?.options.find((o) => o.id === cfg.selections.fertCapacity)?.attrs ?? {};
  const hasCentralSeed = cfg.selections.seedHopper === 'central';
  const fert = (cfg.selections.fertilizer ?? 'none') as SeederLayout['fert'];
  const centerSpan = transport === 'fold' ? hingeX * 2 - 0.3 : Math.min(4.2, barLength * 0.42);
  const tanks: TankLayout[] = [];
  const both = hasCentralSeed && fert !== 'none';
  const w = Math.max(1.1, both ? (centerSpan - 0.25) / 2 : Math.min(centerSpan, 2.2));
  if (hasCentralSeed) tanks.push(tank('seed', seedCap.centralL ?? 1800, both ? -(w / 2 + 0.12) : 0, w));
  if (fert !== 'none') tanks.push(tank('fert', fertCap.liters ?? 1800, both ? w / 2 + 0.12 : 0, w));

  const hopperTop = DIM.barY + 0.55;
  const tankTop = tanks.length ? Math.max(...tanks.map((t) => t.bottomY + t.hopperH + t.height + 0.08)) : 0;
  const railTop = tanks.length ? DIM.platformY + 0.05 + 1.0 : 0;
  const topY = Math.max(hopperTop, tankTop, railTop, DIM.barY + 0.6);

  const depth = DIM.rowFrontZ - DIM.rowRearZ;
  const work = { width: barLength, length: DIM.hitchZ + 0.25 - DIM.rowRearZ, height: topY };

  let transportDims: SeederLayout['transportDims'];
  if (transport === 'fold') {
    const halfW = hingeX + DIM.barSize / 2 + DIM.unitTuck;
    const height = DIM.barY + DIM.lift + DIM.barSize / 2 + wingLength;
    transportDims = {
      width: Math.max(2 * halfW, DIM.carriageTrack * 0.9),
      height: Math.max(height, topY + DIM.lift),
      length: work.length,
    };
  } else {
    transportDims = {
      width: Math.max(depth + 0.35, DIM.carriageTrack),
      height: topY + DIM.lift,
      length: barLength + DIM.transportDrawbar + DIM.carriageOffset + 0.45,
    };
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    tier: model.tier,
    rows,
    spacing,
    workWidth,
    barLength,
    rowX,
    transport,
    sections,
    hingeX,
    wingLength,
    tanks,
    individualHopperL: seedCap.individualL ?? 60,
    hasCentralSeed,
    fert,
    topY,
    work: { width: round(work.width), length: round(work.length), height: round(work.height) },
    transportDims: {
      width: round(transportDims.width),
      height: round(transportDims.height),
      length: round(transportDims.length),
    },
  };
}
