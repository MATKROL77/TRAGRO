import transportJson from '../config/transport.json';
import { computeLayout } from '../machines/seeder/layout';
import type { Configuration } from './types';

export interface Limits { widthM: number; heightM: number; lengthM: number }
export interface TransportProfile { id: string; general: Limits; special: Limits }
interface TransportDef { defaultProfile: string; profiles: TransportProfile[]; tractorLengthM: number }
export const transportDef = transportJson as unknown as TransportDef;

export type Level = 'green' | 'yellow' | 'red';
export interface DimCheck { value: number; general: number; special: number; level: Level }
export interface TransportCheck {
  width: DimCheck;
  height: DimCheck;
  length: DimCheck; // tren completo tractor + sembradora
  machineLength: number;
  level: Level;
  mode: 'fold' | 'longitudinal';
}

export function getProfile(id?: string): TransportProfile {
  return transportDef.profiles.find((p) => p.id === (id ?? transportDef.defaultProfile)) ?? transportDef.profiles[0];
}

export function levelFor(value: number, general: number, special: number): Level {
  if (value <= general + 1e-9) return 'green';
  if (value <= special + 1e-9) return 'yellow';
  return 'red';
}

const order: Level[] = ['green', 'yellow', 'red'];
export function worst(...l: Level[]): Level {
  return l.reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a), 'green' as Level);
}

export function checkTransport(cfg: Configuration, profileId?: string): TransportCheck {
  const p = getProfile(profileId);
  const lay = computeLayout(cfg);
  const d = lay.transportDims;
  const trainLength = Math.round((d.length + transportDef.tractorLengthM) * 100) / 100;
  const width = { value: d.width, general: p.general.widthM, special: p.special.widthM, level: levelFor(d.width, p.general.widthM, p.special.widthM) };
  const height = { value: d.height, general: p.general.heightM, special: p.special.heightM, level: levelFor(d.height, p.general.heightM, p.special.heightM) };
  const length = { value: trainLength, general: p.general.lengthM, special: p.special.lengthM, level: levelFor(trainLength, p.general.lengthM, p.special.lengthM) };
  return { width, height, length, machineLength: d.length, level: worst(width.level, height.level, length.level), mode: lay.transport };
}
