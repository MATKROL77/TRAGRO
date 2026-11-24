/**
 * i18n mínimo y sin dependencias. Español rioplatense (por defecto), inglés, portugués de Brasil y ruso.
 * Los textos de la interfaz viven en es.json / en.json / pt.json / ru.json. Los del catálogo están en los
 * JSON de config ({ es, pt }); su versión en inglés y ruso sale de catalogo.en.json / catalogo.ru.json
 * (clave = texto en español). Inglés y ruso se cargan a demanda para no engordar la carga inicial.
 */
import { useMemo } from 'react';
import { pricing } from '@/core/catalog';
import type { Lang, Tx, Units } from '@/core/types';
import { unitFormatters, type UnitFmt } from '@/core/units';
import { useStore } from '@/state/store';
import es from './es.json';
import pt from './pt.json';

export const LANGS: Lang[] = ['es', 'en', 'pt', 'ru'];
export const LANG_NAMES: Record<Lang, string> = { es: 'Español', en: 'English', pt: 'Português', ru: 'Русский' };
export const LOCALE: Record<Lang, string> = { es: 'es-AR', en: 'en-US', pt: 'pt-BR', ru: 'ru-RU' };
/** Valor del atributo lang del documento. */
export const HTML_LANG: Record<Lang, string> = { es: 'es-AR', en: 'en', pt: 'pt-BR', ru: 'ru' };

type Dict = Record<string, string>;
const dict: Partial<Record<Lang, Dict>> = { es, pt: pt as Dict };
const catalogDict: Partial<Record<Lang, Dict>> = {};

const loaders: Partial<Record<Lang, () => Promise<[{ default: unknown }, { default: unknown }]>>> = {
  en: () => Promise.all([import('./en.json'), import('./catalogo.en.json')]),
  ru: () => Promise.all([import('./ru.json'), import('./catalogo.ru.json')]),
};

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as string[]).includes(v);
}

export function hasLang(lang: Lang): boolean {
  return !!dict[lang];
}

/** Carga (una sola vez) los textos de un idioma que no viene en el paquete inicial. */
export async function loadLang(lang: Lang): Promise<void> {
  if (dict[lang]) return;
  const load = loaders[lang];
  if (!load) return;
  const [ui, cat] = await load();
  dict[lang] = ui.default as Dict;
  catalogDict[lang] = cat.default as Dict;
}

/** Cambia el idioma de la interfaz, cargándolo antes si hace falta. */
export async function changeLang(lang: Lang): Promise<void> {
  try {
    await loadLang(lang);
    useStore.getState().setUi({ lang });
  } catch {
    // sin red para bajar el idioma: se queda en el actual
  }
}

export type Params = Record<string, string | number>;

export function translate(lang: Lang, key: string, params?: Params): string {
  let s = dict[lang]?.[key] ?? (es as Dict)[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Texto del catálogo en el idioma pedido (con el español como respaldo). */
export function translateTx(lang: Lang, obj: Tx | undefined | null): string {
  if (!obj) return '';
  return obj[lang] ?? catalogDict[lang]?.[obj.es] ?? obj.es ?? '';
}

export function formatNumber(lang: Lang, value: number, decimals = 0): string {
  return new Intl.NumberFormat(LOCALE[lang], { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value).replace(/[\u00a0\u202f]/g, ' ');
}

export function formatMoney(lang: Lang, usd: number, moneda: 'USD' | 'ARS', signed = false): string {
  const value = moneda === 'ARS' ? usd * pricing.tipoDeCambio.arsPorUsd : usd;
  const abs = formatNumber(lang, Math.abs(Math.round(value)));
  const sign = value < 0 ? '−' : signed && value > 0 ? '+' : '';
  return `${sign}${moneda} ${abs}`;
}

export interface I18n extends UnitFmt {
  lang: Lang;
  units: Units;
  t: (key: string, params?: Params) => string;
  /** Texto del catálogo en el idioma activo. */
  tx: (obj: Tx | undefined | null) => string;
  n: (value: number, decimals?: number) => string;
  money: (usd: number, signed?: boolean) => string;
  moneyIn: (usd: number, moneda: 'USD' | 'ARS') => string;
}

export function makeI18n(lang: Lang, moneda: 'USD' | 'ARS', units: Units = 'metric'): I18n {
  const n = (value: number, decimals = 0) => formatNumber(lang, value, decimals);
  return {
    lang,
    units,
    t: (key, params) => translate(lang, key, params),
    tx: (obj) => translateTx(lang, obj),
    n,
    money: (usd, signed = false) => formatMoney(lang, usd, moneda, signed),
    moneyIn: (usd, m) => formatMoney(lang, usd, m),
    ...unitFormatters(n, units),
  };
}

export function useI18n(): I18n {
  const lang = useStore((s) => s.ui.lang);
  const moneda = useStore((s) => s.ui.moneda);
  const units = useStore((s) => s.ui.unidades);
  return useMemo(() => makeI18n(lang, moneda, units), [lang, moneda, units]);
}
