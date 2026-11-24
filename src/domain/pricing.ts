import pricingJson from '../config/pricing.json';
import { catalog, getModel } from './catalog';
import type { Configuration } from './types';

interface PriceEntry { base: number; perRow: number; ifSel?: Record<string, string> }
interface PricingDef {
  currency: string;
  exportFactor: number;
  localFactor: number;
  models: Record<string, { base: number; perRow: number }>;
  options: Record<string, PriceEntry>;
  customPaint: PriceEntry;
  customText: PriceEntry;
}
export const pricing = pricingJson as unknown as PricingDef;

export interface PriceLine { key: string; amount: number }
export interface PriceBreakdown { lines: PriceLine[]; total: number; currency: string }

export type Destination = 'local' | 'export';

const DEFAULT_COLORS = ['brand', 'brand-accent'];

export function optionPrice(cfg: Configuration, group: string, option: string): number {
  let sum = 0;
  for (const [key, e] of Object.entries(pricing.options)) {
    const [go] = key.split('@');
    if (go !== `${group}.${option}`) continue;
    if (e.ifSel && !Object.entries(e.ifSel).every(([g, v]) => cfg.selections[g] === v)) continue;
    sum += e.base + e.perRow * cfg.rows;
  }
  return sum;
}

export function computePrice(cfg: Configuration, destination: Destination = 'export'): PriceBreakdown {
  const model = getModel(cfg.model);
  const mp = pricing.models[model.id];
  const lines: PriceLine[] = [
    { key: 'base', amount: mp.base },
    { key: 'rows', amount: mp.perRow * cfg.rows },
  ];
  for (const g of catalog.groups) {
    const opt = cfg.selections[g.id];
    const amount = optionPrice(cfg, g.id, opt);
    if (amount) lines.push({ key: `${g.id}.${opt}`, amount });
  }
  if (!DEFAULT_COLORS.includes(cfg.colors.mainRal) || !DEFAULT_COLORS.includes(cfg.colors.accentRal)) {
    lines.push({ key: 'customPaint', amount: pricing.customPaint.base });
  }
  if (cfg.text.trim()) lines.push({ key: 'customText', amount: pricing.customText.base });
  const factor = destination === 'export' ? pricing.exportFactor : pricing.localFactor;
  const total = Math.round(lines.reduce((a, l) => a + l.amount, 0) * factor);
  return { lines, total, currency: pricing.currency };
}

export function leadTimeDays(cfg: Configuration): number {
  const model = getModel(cfg.model);
  let extra = 0;
  for (const g of catalog.groups) {
    const o = g.options.find((x) => x.id === cfg.selections[g.id]);
    extra = Math.max(extra, o?.leadTimeDays ?? 0);
  }
  return model.leadTimeDays + extra;
}
