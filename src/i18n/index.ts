/**
 * i18n mínimo y sin dependencias: español rioplatense (por defecto) y portugués de Brasil.
 * Todos los textos de la interfaz viven en es.json / pt.json; los del catálogo, en los JSON de config.
 */
import { useMemo } from 'react';
import { pricing } from '@/core/catalog';
import type { Lang, Tx } from '@/core/types';
import { useStore } from '@/state/store';
import es from './es.json';
import pt from './pt.json';

const dict: Record<Lang, Record<string, string>> = { es, pt: pt as Record<string, string> };
const LOCALE: Record<Lang, string> = { es: 'es-AR', pt: 'pt-BR' };

export type Params = Record<string, string | number>;

export function translate(lang: Lang, key: string, params?: Params): string {
  let s = dict[lang][key] ?? dict.es[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function formatNumber(lang: Lang, value: number, decimals = 0): string {
  return new Intl.NumberFormat(LOCALE[lang], { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function formatMoney(lang: Lang, usd: number, moneda: 'USD' | 'ARS', signed = false): string {
  const value = moneda === 'ARS' ? usd * pricing.tipoDeCambio.arsPorUsd : usd;
  const abs = formatNumber(lang, Math.abs(Math.round(value)));
  const sign = value < 0 ? '− ' : signed && value > 0 ? '+ ' : '';
  return `${sign}${moneda === 'ARS' ? '$' : 'US$'} ${abs}`;
}

export interface I18n {
  lang: Lang;
  t: (key: string, params?: Params) => string;
  /** Texto del catálogo ({ es, pt }) en el idioma activo. */
  tx: (obj: Tx | undefined | null) => string;
  n: (value: number, decimals?: number) => string;
  money: (usd: number, signed?: boolean) => string;
  moneyIn: (usd: number, moneda: 'USD' | 'ARS') => string;
}

export function makeI18n(lang: Lang, moneda: 'USD' | 'ARS'): I18n {
  return {
    lang,
    t: (key, params) => translate(lang, key, params),
    tx: (obj) => (obj ? (obj[lang] ?? obj.es ?? '') : ''),
    n: (value, decimals = 0) => formatNumber(lang, value, decimals),
    money: (usd, signed = false) => formatMoney(lang, usd, moneda, signed),
    moneyIn: (usd, m) => formatMoney(lang, usd, m),
  };
}

export function useI18n(): I18n {
  const lang = useStore((s) => s.ui.lang);
  const moneda = useStore((s) => s.ui.moneda);
  return useMemo(() => makeI18n(lang, moneda), [lang, moneda]);
}
