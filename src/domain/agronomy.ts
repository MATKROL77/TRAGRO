import agronomyJson from '../config/agronomy.json';
import { catalog, getModel, widthM } from './catalog';
import type { Configuration } from './types';
import { computeLayout } from '../machines/seeder/layout';

export interface CropDef {
  id: string;
  seedsPerM: number;
  tswG: number;
  bulkKgL: number;
  color: string;
  shape: 'kernel' | 'sphere' | 'sunflower';
  minSeedsPerM: number;
  maxSeedsPerM: number;
}
interface AgronomyDef {
  speed: { min: number; max: number; step: number; default: number };
  efficiency: { min: number; max: number; step: number; default: number };
  hoursPerDay: { min: number; max: number; step: number; default: number };
  crops: CropDef[];
  defaultCrop: string;
  fertilizer: { defaultKgHa: number; minKgHa: number; maxKgHa: number; bulkKgL: number };
  hp: {
    perRowByTier: Record<string, number>;
    perRowAdds: Record<string, number>;
    fixedAdds: Record<string, number>;
    rangeFactor: [number, number];
  };
}
export const agronomy = agronomyJson as unknown as AgronomyDef;

export interface FieldParams {
  speedKmh: number;
  efficiency: number;
  hoursPerDay: number;
  crop: string;
  seedsPerM: number;
  fertKgHa: number;
}

export function defaultFieldParams(): FieldParams {
  const crop = getCrop(agronomy.defaultCrop);
  return {
    speedKmh: agronomy.speed.default,
    efficiency: agronomy.efficiency.default,
    hoursPerDay: agronomy.hoursPerDay.default,
    crop: crop.id,
    seedsPerM: crop.seedsPerM,
    fertKgHa: agronomy.fertilizer.defaultKgHa,
  };
}

export function getCrop(id: string): CropDef {
  return agronomy.crops.find((c) => c.id === id) ?? agronomy.crops[0];
}

/** ha/h = ancho (m) × velocidad (km/h) × eficiencia / 10 */
export function capacityHaH(width: number, speedKmh: number, efficiency: number): number {
  return (width * speedKmh * efficiency) / 10;
}

export function seedsPerHa(seedsPerM: number, spacingM: number): number {
  return (seedsPerM * 10000) / spacingM;
}

export function seedsPerMFromHa(perHa: number, spacingM: number): number {
  return (perHa * spacingM) / 10000;
}

export function seedKgPerHa(perHa: number, tswG: number): number {
  return (perHa * tswG) / 1e6;
}

export interface WeightResult { emptyKg: number; seedLoadKg: number; fertLoadKg: number; loadedKg: number }

export function seedHopperLiters(cfg: Configuration): number {
  const lay = computeLayout(cfg);
  if (lay.hasCentralSeed) return lay.tanks.find((t) => t.kind === 'seed')?.liters ?? 0;
  return lay.individualHopperL * cfg.rows;
}

export function fertHopperLiters(cfg: Configuration): number {
  const lay = computeLayout(cfg);
  return lay.tanks.find((t) => t.kind === 'fert')?.liters ?? 0;
}

export function computeWeight(cfg: Configuration, crop: CropDef): WeightResult {
  const model = getModel(cfg.model);
  let kg = model.baseWeightKg + model.weightPerRowKg * cfg.rows;
  for (const g of catalog.groups) {
    const o = g.options.find((x) => x.id === cfg.selections[g.id]);
    if (!o) continue;
    if (g.visibleIf && g.id === 'fertCapacity' && cfg.selections.fertilizer === 'none') continue;
    kg += o.weightKg + (o.weightPerRowKg ?? 0) * cfg.rows;
  }
  const seedLoadKg = seedHopperLiters(cfg) * crop.bulkKgL;
  const fertLoadKg = fertHopperLiters(cfg) * agronomy.fertilizer.bulkKgL;
  const emptyKg = Math.round(kg);
  return { emptyKg, seedLoadKg: Math.round(seedLoadKg), fertLoadKg: Math.round(fertLoadKg), loadedKg: Math.round(emptyKg + seedLoadKg + fertLoadKg) };
}

export function suggestedHp(cfg: Configuration): { min: number; max: number } {
  const model = getModel(cfg.model);
  const hp = agronomy.hp;
  let perRow = hp.perRowByTier[model.tier] ?? 8;
  let fixed = 0;
  for (const [k, v] of Object.entries(hp.perRowAdds)) {
    const [g, o] = k.split('.');
    if (cfg.selections[g] === o) perRow += v;
  }
  for (const [k, v] of Object.entries(hp.fixedAdds)) {
    const [g, o] = k.split('.');
    if (cfg.selections[g] === o) fixed += v;
  }
  const base = perRow * cfg.rows + fixed;
  const r5 = (x: number) => Math.round(x / 5) * 5;
  return { min: r5(base * hp.rangeFactor[0]), max: r5(base * hp.rangeFactor[1]) };
}

export interface Performance {
  widthM: number;
  haPerHour: number;
  haPerDay: number;
  seedsPerHa: number;
  seedKgHa: number;
  seedAutonomyHa: number;
  fertAutonomyHa: number | null;
  weight: WeightResult;
  hp: { min: number; max: number };
}

export function computePerformance(cfg: Configuration, p: FieldParams): Performance {
  const crop = getCrop(p.crop);
  const w = widthM(cfg);
  const spacingM = cfg.spacingCm / 100;
  const haH = capacityHaH(w, p.speedKmh, p.efficiency);
  const sha = seedsPerHa(p.seedsPerM, spacingM);
  const kgHa = seedKgPerHa(sha, crop.tswG);
  const seedKg = seedHopperLiters(cfg) * crop.bulkKgL;
  const fertKg = fertHopperLiters(cfg) * agronomy.fertilizer.bulkKgL;
  return {
    widthM: w,
    haPerHour: haH,
    haPerDay: haH * p.hoursPerDay,
    seedsPerHa: sha,
    seedKgHa: kgHa,
    seedAutonomyHa: kgHa > 0 ? seedKg / kgHa : 0,
    fertAutonomyHa: cfg.selections.fertilizer === 'none' ? null : p.fertKgHa > 0 ? fertKg / p.fertKgHa : 0,
    weight: computeWeight(cfg, crop),
    hp: suggestedHp(cfg),
  };
}
