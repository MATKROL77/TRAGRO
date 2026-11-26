/**
 * Modelo de la cotización: filas ya traducidas y formateadas que comparten el
 * resumen en pantalla, el PDF y el comparador. Funciones puras.
 */
import { groupDef, ral, steps, typeDef } from '@/core/catalog';
import { priceBreakdown, type PriceBreakdown } from '@/core/pricing';
import { computeSpecs, type Specs } from '@/core/specs';
import type { Config, Lang, Level, Tx } from '@/core/types';
import type { LegalCheck } from '@/core/specs';
import type { Units } from '@/core/types';
import { unitFormatters, type UnitFmt } from '@/core/units';
import { formatNumber, LOCALE, translate, translateTx } from '@/i18n';

export interface QuoteRow {
  key: string;
  label: string;
  detail: string;
  usd: number;
  /** De serie / incluido en el precio base. */
  estandar: boolean;
}

export interface QuoteGroup {
  paso: string;
  name: string;
  rows: QuoteRow[];
}

const pick = (o: Tx | undefined, lang: Lang): string => translateTx(lang, o);
const fmt = (lang: Lang, units: Units): UnitFmt => unitFormatters((v, d = 0) => formatNumber(lang, v, d), units);

/** Parámetros de los mensajes de validación, con números y unidades en formato local. */
export function checkParams(c: LegalCheck, u: UnitFmt, producto: string, ejes?: string): Record<string, string | number> {
  const p: Record<string, string | number> = { ...c.params, tractor: String(c.params.tractor ?? '').replace('x', '×'), producto };
  if (ejes) p.ejes = ejes;
  if (c.id === 'alto') {
    p.margen = u.cm(Number(c.params.margen));
    p.exceso = u.cm(Number(c.params.exceso));
  } else if (c.id === 'largo') {
    p.margen = u.len(Number(c.params.margen) / 100);
    p.exceso = u.len(Number(c.params.exceso) / 100);
  } else if (c.id === 'carga') {
    p.margen = u.ton(Number(c.params.margen));
    p.exceso = u.ton(Number(c.params.exceso));
  }
  return p;
}

/** Nombre de la disposición de ejes elegida, en el idioma pedido. */
export function axleName(config: Config, lang: Lang): string {
  return pick(groupDef('ejes')?.opciones?.find((o) => o.id === config.sel.ejes)?.name, lang);
}

/** Valor medido y tope de una validación ("18,35 m / 18,60 m"). */
export function checkValue(c: LegalCheck, u: UnitFmt): string {
  const f = (v: number) => (c.unit === 'm' ? u.len(v) : u.ton(v));
  return c.id === 'peso' ? f(c.value) : `${f(c.value)} / ${f(c.limit)}`;
}

/** Todas las elecciones con su precio, agrupadas por paso del configurador. */
export function quoteGroups(config: Config, lang: Lang, price: PriceBreakdown = priceBreakdown(config), units: Units = 'metric'): QuoteGroup[] {
  const t = (key: string) => translate(lang, key);
  const u = fmt(lang, units);
  const rows = new Map<string, QuoteRow[]>();
  for (const l of price.lines) {
    const list = rows.get(l.paso) ?? [];
    const detail = l.key === 'largo' ? u.len(Number(config.sel.largo)) : l.key === 'alto' ? u.len(Number(config.sel.alto)) : pick(l.detail, lang);
    list.push({ key: l.key, label: pick(l.label, lang), detail, usd: l.usd, estandar: l.estandar });
    rows.set(l.paso, list);
  }
  const caja = ral(config.colores.caja);
  const chasis = ral(config.colores.chasis);
  const pers = rows.get('personalizacion') ?? [];
  pers.unshift(
    { key: 'colorCaja', label: t('resumen.colorCaja'), detail: `${caja.codigo} · ${pick(caja.name, lang)}`, usd: 0, estandar: true },
    { key: 'colorChasis', label: t('resumen.colorChasis'), detail: `${chasis.codigo} · ${pick(chasis.name, lang)}`, usd: 0, estandar: true },
  );
  rows.set('personalizacion', pers);
  return steps.filter((s) => rows.has(s.id)).map((s) => ({ paso: s.id, name: pick(s.name, lang), rows: rows.get(s.id) ?? [] }));
}

export interface TechRow {
  key: string;
  label: string;
  value: string;
}

/** Ficha técnica en pares etiqueta / valor. */
export function techRows(config: Config, lang: Lang, specs: Specs = computeSpecs(config), units: Units = 'metric'): TechRow[] {
  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
  const u = fmt(lang, units);
  const out: TechRow[] = [
    { key: 'largoCaja', label: t('tec.largoCaja'), value: u.len(specs.largoCajaM) },
    { key: 'largoTotal', label: t('tec.largoTotal'), value: u.len(specs.largoTotalM) },
    { key: 'ancho', label: t('tec.ancho'), value: u.len(specs.anchoM) },
    { key: 'alto', label: t('tec.alto'), value: u.len(specs.altoTotalM) },
  ];
  if (specs.volumenM3 !== null && config.tipo !== 'plataforma') out.push({ key: 'volumen', label: t('tec.volumen'), value: u.vol(specs.volumenM3) });
  else out.push({ key: 'superficie', label: t('tec.superficie'), value: u.area(specs.superficieM2) });
  out.push(
    { key: 'capEjes', label: t('tec.capEjes'), value: u.ton(specs.capacidadEjesSemiT) },
    { key: 'pbt', label: t('tec.pbt'), value: u.ton(specs.pesoBrutoConjuntoT) },
    { key: 'tara', label: t('tec.tara'), value: u.kg(specs.taraKg) },
    { key: 'cargaUtil', label: t('tec.cargaUtil'), value: u.kg(specs.cargaUtilKg) },
    { key: 'plazo', label: t('tec.plazo'), value: t('comun.dias', { n: specs.plazoDias }) },
  );
  return out;
}

export interface CheckText {
  id: string;
  level: Level;
  title: string;
  value: string;
  message: string;
  status: string;
}

const CHECK_TITLE: Record<string, string> = { ancho: 'tec.ancho', alto: 'tec.alto', largo: 'tec.largoConjunto', peso: 'tec.pbt', carga: 'tec.cajaLlena' };

/** Validaciones legales con título, valor/tope y explicación en lenguaje simple. */
export function checkTexts(config: Config, lang: Lang, specs: Specs = computeSpecs(config), units: Units = 'metric'): CheckText[] {
  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
  const u = fmt(lang, units);
  const producto = pick(groupDef('carga')?.opciones?.find((o) => o.id === config.sel.carga)?.name, lang).toLowerCase();
  const ejes = axleName(config, lang);
  return specs.checks.map((c) => ({
    id: c.id,
    level: c.level,
    title: t(CHECK_TITLE[c.id], { producto }),
    value: checkValue(c, u),
    message: t(c.msg, checkParams(c, u, producto, ejes)),
    status: t(`tec.estado.${c.level}`),
  }));
}

/** Subtítulo corto del equipo: medidas, ejes y suspensión. */
export function quoteSubtitle(config: Config, lang: Lang, units: Units = 'metric'): string {
  const price = priceBreakdown(config);
  const d = (key: string) => {
    const l = price.lines.find((x) => x.key === key);
    return l ? pick(l.detail, lang) : '';
  };
  return [translate(lang, 'pdf.largoCaja', { valor: fmt(lang, units).len(Number(config.sel.largo)) }), d('ejes'), d('suspension'), d('ruedas')].filter(Boolean).join(' · ');
}

export function typeName(config: Config, lang: Lang): string {
  return pick(typeDef(config.tipo).name, lang);
}

export function formatDate(lang: Lang, date: Date): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

/** Límites legales superados, en texto ("Alto total 4,27 m / 4,10 m; ..."). Vacío si cumple todo. */
export function exceededText(config: Config, lang: Lang, units: Units = 'metric', specs: Specs = computeSpecs(config)): string {
  return checkTexts(config, lang, specs, units)
    .filter((c) => c.level === 'bad')
    .map((c) => `${c.title} ${c.value}`)
    .join('; ');
}
