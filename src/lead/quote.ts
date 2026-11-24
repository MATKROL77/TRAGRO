/**
 * Modelo de la cotización: filas ya traducidas y formateadas que comparten el
 * resumen en pantalla, el PDF y el comparador. Funciones puras.
 */
import { groupDef, ral, steps, typeDef } from '@/core/catalog';
import { priceBreakdown, type PriceBreakdown } from '@/core/pricing';
import { computeSpecs, type Specs } from '@/core/specs';
import type { Config, Lang, Level, Tx } from '@/core/types';
import { formatNumber, translate } from '@/i18n';
import { checkParams } from '@/ui/TechPanel';

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

const pick = (o: Tx | undefined, lang: Lang): string => (o ? (o[lang] ?? o.es) : '');

/** Todas las elecciones con su precio, agrupadas por paso del configurador. */
export function quoteGroups(config: Config, lang: Lang, price: PriceBreakdown = priceBreakdown(config)): QuoteGroup[] {
  const t = (key: string) => translate(lang, key);
  const rows = new Map<string, QuoteRow[]>();
  for (const l of price.lines) {
    const list = rows.get(l.paso) ?? [];
    list.push({ key: l.key, label: pick(l.label, lang), detail: pick(l.detail, lang), usd: l.usd, estandar: l.estandar });
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
export function techRows(config: Config, lang: Lang, specs: Specs = computeSpecs(config)): TechRow[] {
  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
  const n = (v: number, d = 0) => formatNumber(lang, v, d);
  const out: TechRow[] = [
    { key: 'largoCaja', label: t('tec.largoCaja'), value: `${n(specs.largoCajaM, 2)} m` },
    { key: 'largoTotal', label: t('tec.largoTotal'), value: `${n(specs.largoTotalM, 2)} m` },
    { key: 'ancho', label: t('tec.ancho'), value: `${n(specs.anchoM, 2)} m` },
    { key: 'alto', label: t('tec.alto'), value: `${n(specs.altoTotalM, 2)} m` },
  ];
  if (specs.volumenM3 !== null && config.tipo !== 'plataforma') out.push({ key: 'volumen', label: t('tec.volumen'), value: `${n(specs.volumenM3, 1)} m³` });
  else out.push({ key: 'superficie', label: t('tec.superficie'), value: `${n(specs.superficieM2, 1)} m²` });
  out.push(
    { key: 'capEjes', label: t('tec.capEjes'), value: `${n(specs.capacidadEjesSemiT, 1)} t` },
    { key: 'pbt', label: t('tec.pbt'), value: `${n(specs.pesoBrutoConjuntoT, 1)} t` },
    { key: 'tara', label: t('tec.tara'), value: `${n(specs.taraKg)} kg` },
    { key: 'cargaUtil', label: t('tec.cargaUtil'), value: `${n(specs.cargaUtilKg)} kg` },
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
export function checkTexts(config: Config, lang: Lang, specs: Specs = computeSpecs(config)): CheckText[] {
  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
  const n = (v: number, d = 0) => formatNumber(lang, v, d);
  const producto = pick(groupDef('carga')?.opciones?.find((o) => o.id === config.sel.carga)?.name, lang).toLowerCase();
  return specs.checks.map((c) => {
    const d = c.unit === 'm' ? 2 : 1;
    return {
      id: c.id,
      level: c.level,
      title: t(CHECK_TITLE[c.id], { producto }),
      value: c.id === 'peso' ? `${n(c.value, d)} ${c.unit}` : `${n(c.value, d)} / ${n(c.limit, d)} ${c.unit}`,
      message: t(c.msg, checkParams(c, n, producto)),
      status: t(`tec.estado.${c.level}`),
    };
  });
}

/** Subtítulo corto del equipo: medidas, ejes y suspensión. */
export function quoteSubtitle(config: Config, lang: Lang): string {
  const price = priceBreakdown(config);
  const d = (key: string) => {
    const l = price.lines.find((x) => x.key === key);
    return l ? pick(l.detail, lang) : '';
  };
  return [translate(lang, 'pdf.largoCaja', { valor: formatNumber(lang, Number(config.sel.largo), 2) }), d('ejes'), d('suspension'), d('ruedas')].filter(Boolean).join(' · ');
}

export function typeName(config: Config, lang: Lang): string {
  return pick(typeDef(config.tipo).name, lang);
}

export function formatDate(lang: Lang, date: Date): string {
  return new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}
