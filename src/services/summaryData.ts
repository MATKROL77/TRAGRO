import { catalog, getGroup, widthM } from '../domain/catalog';
import { isGroupVisible } from '../domain/rules';
import { computePrice, leadTimeDays, optionPrice, type Destination } from '../domain/pricing';
import { computePerformance, getCrop, type FieldParams } from '../domain/agronomy';
import { checkTransport } from '../domain/transport';
import { configNumber } from '../domain/url';
import { formatMoney, formatNumber, formatQty, convert, unitLabel } from '../domain/units';
import { translate } from '../i18n';
import type { Configuration, Lang, UnitSystem } from '../domain/types';
import brand from '../config/brand.json';

export interface SummaryLine { label: string; value: string; amount: number | null }

export interface SummaryData {
  number: string;
  modelName: string;
  title: string;
  lines: SummaryLine[];
  perf: { label: string; value: string }[];
  transport: { label: string; value: string; level: string }[];
  transportMsg: string;
  transportLevel: string;
  total: number;
  totalText: string;
  legend: string;
  leadTime: string;
}

/** Datos del resumen en el idioma y unidades elegidos (comparten Resumen, PDF y WhatsApp). */
export function buildSummary(cfg: Configuration, field: FieldParams, lang: Lang, units: UnitSystem, destination: Destination, profile?: string, hidePrices = false): SummaryData {
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const q = (v: number, k: Parameters<typeof formatQty>[1], d = 1) => formatQty(v, k, units, lang, d);
  const price = computePrice(cfg, destination);
  const perf = computePerformance(cfg, field);
  const chk = checkTransport(cfg, profile);
  const modelName = t(`models.${cfg.model}.name`);
  const lines: SummaryLine[] = [
    { label: t('steps.model.name'), value: `${modelName} · ${t(`models.${cfg.model}.tier`)}`, amount: price.lines.find((l) => l.key === 'base')?.amount ?? null },
    { label: t('rows.count'), value: `${cfg.rows} × ${q(cfg.spacingCm, 'lengthCm', 1)} = ${q(widthM(cfg), 'length', 2)}`, amount: price.lines.find((l) => l.key === 'rows')?.amount ?? null },
  ];
  for (const step of catalog.steps) {
    for (const gid of step.groups) {
      if (!isGroupVisible(gid, cfg)) continue;
      const g = getGroup(gid)!;
      const o = cfg.selections[gid];
      lines.push({ label: t(`groups.${g.id}.name`), value: t(`options.${g.id}.${o}.name`), amount: optionPrice(cfg, g.id, o) || null });
    }
  }
  const colorName = (code: string, hex: string) => (code.startsWith('brand') ? `${t('custom.brandColors')} (${hex})` : `${code} (${hex})`);
  lines.push({ label: t('custom.mainColor'), value: colorName(cfg.colors.mainRal, cfg.colors.main), amount: price.lines.find((l) => l.key === 'customPaint')?.amount ?? null });
  lines.push({ label: t('custom.accentColor'), value: colorName(cfg.colors.accentRal, cfg.colors.accent), amount: null });
  if (cfg.text.trim()) lines.push({ label: t('custom.text'), value: cfg.text, amount: price.lines.find((l) => l.key === 'customText')?.amount ?? null });
  if (hidePrices) lines.forEach((l) => (l.amount = null));
  const crop = getCrop(field.crop);
  const perfLines = [
    { label: t('perf.width'), value: q(perf.widthM, 'length', 2) },
    { label: `${t('perf.speed')} · ${t('perf.efficiency')}`, value: `${q(field.speedKmh, 'speed', 1)} · ${formatNumber(field.efficiency * 100, lang, 0)} %` },
    { label: t('perf.haH'), value: q(perf.haPerHour, 'areaRate', 2) },
    { label: `${t('perf.haDay')} (${field.hoursPerDay} h)`, value: q(perf.haPerDay, 'area', 0) },
    { label: `${t('perf.crop')}: ${t(`crops.${crop.id}`)}`, value: `${formatNumber(convert(field.seedsPerM, 'perLength', units), lang, 1)} ${unitLabel('perLength', units)} · ${formatNumber(convert(perf.seedsPerHa, 'perArea', units), lang, 0)} ${unitLabel('perArea', units)}` },
    { label: t('perf.seedAutonomy'), value: `${q(perf.seedAutonomyHa, 'area', 0)} ${t('perf.perLoad')}` },
    ...(perf.fertAutonomyHa !== null ? [{ label: `${t('perf.fertAutonomy')} (${q(field.fertKgHa, 'massPerArea', 0)})`, value: `${q(perf.fertAutonomyHa, 'area', 0)} ${t('perf.perLoad')}` }] : []),
    { label: `${t('perf.weightEmpty')} / ${t('perf.weightLoaded').toLowerCase()}`, value: `${q(perf.weight.emptyKg, 'mass', 0)} / ${q(perf.weight.loadedKg, 'mass', 0)}` },
    { label: t('perf.hp'), value: `${perf.hp.min}–${perf.hp.max} ${t('perf.hpUnit')}` },
  ];
  const tLines = [
    { label: t('transport.width'), value: q(chk.width.value, 'length', 2), level: chk.width.level },
    { label: t('transport.height'), value: q(chk.height.value, 'length', 2), level: chk.height.level },
    { label: t('transport.machineLength'), value: q(chk.machineLength, 'length', 2), level: 'green' },
    { label: t('transport.length'), value: q(chk.length.value, 'length', 2), level: chk.length.level },
  ];
  return {
    number: configNumber(cfg, brand.short),
    modelName,
    title: `${brand.name} ${modelName}`,
    lines,
    perf: perfLines,
    transport: tLines,
    transportMsg: `${t(`transport.mode.${chk.mode}`)} — ${t(`transport.${chk.level}`)}`,
    transportLevel: chk.level,
    total: price.total,
    totalText: hidePrices ? t('price.hidden') : formatMoney(price.total, lang),
    legend: t(destination === 'export' ? 'price.legendExport' : 'price.legendLocal'),
    leadTime: t('price.leadTime', { days: leadTimeDays(cfg) }),
  };
}

export function moneyOrDash(v: number | null, lang: Lang): string {
  return v ? formatMoney(v, lang) : '—';
}
