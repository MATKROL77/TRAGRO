import type { Lang, UnitSystem } from './types';

export const CONV = {
  mToFt: 3.28084,
  kmhToMph: 0.621371,
  haToAc: 2.47105,
  kgToLb: 2.20462,
  lToGal: 0.264172,
  cmToIn: 0.393701,
};

export type Quantity = 'length' | 'lengthCm' | 'speed' | 'area' | 'areaRate' | 'mass' | 'volume' | 'perArea' | 'perLength' | 'massPerArea';

const UNITS: Record<Quantity, { metric: string; imperial: string; factor: number }> = {
  length: { metric: 'm', imperial: 'ft', factor: CONV.mToFt },
  lengthCm: { metric: 'cm', imperial: 'in', factor: CONV.cmToIn },
  speed: { metric: 'km/h', imperial: 'mph', factor: CONV.kmhToMph },
  area: { metric: 'ha', imperial: 'ac', factor: CONV.haToAc },
  areaRate: { metric: 'ha/h', imperial: 'ac/h', factor: CONV.haToAc },
  mass: { metric: 'kg', imperial: 'lb', factor: CONV.kgToLb },
  volume: { metric: 'L', imperial: 'gal', factor: CONV.lToGal },
  perArea: { metric: '/ha', imperial: '/ac', factor: 1 / CONV.haToAc },
  perLength: { metric: '/m', imperial: '/ft', factor: 1 / CONV.mToFt },
  massPerArea: { metric: 'kg/ha', imperial: 'lb/ac', factor: CONV.kgToLb / CONV.haToAc },
};

export function convert(value: number, q: Quantity, sys: UnitSystem): number {
  return sys === 'metric' ? value : value * UNITS[q].factor;
}

export function toMetric(value: number, q: Quantity, sys: UnitSystem): number {
  return sys === 'metric' ? value : value / UNITS[q].factor;
}

export function unitLabel(q: Quantity, sys: UnitSystem): string {
  return UNITS[q][sys];
}

const LOCALE: Record<Lang, string> = { 'es-AR': 'es-AR', en: 'en-US', 'pt-BR': 'pt-BR', ru: 'ru-RU' };

export function formatNumber(value: number, lang: Lang, digits = 0): string {
  return new Intl.NumberFormat(LOCALE[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatQty(value: number, q: Quantity, sys: UnitSystem, lang: Lang, digits = 1): string {
  return `${formatNumber(convert(value, q, sys), lang, digits)} ${unitLabel(q, sys)}`.replace(/ \//, '/');
}

export function formatMoney(value: number, lang: Lang, currency = 'USD'): string {
  return new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency, maximumFractionDigits: 0, currencyDisplay: 'code' })
    .format(value)
    .replace(/[\u00a0\u202f]/g, ' ');
}

export function formatDate(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}
