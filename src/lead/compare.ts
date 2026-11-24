/**
 * Comparación de dos configuraciones: filas alineadas (A | B) con marca de
 * diferencia y deltas de precio, tara y carga útil. Funciones puras.
 */
import { priceBreakdown } from '@/core/pricing';
import { computeSpecs } from '@/core/specs';
import type { Config, Lang } from '@/core/types';
import { translate } from '@/i18n';
import { quoteGroups, techRows, typeName } from './quote';

export interface CompareRow {
  key: string;
  section: string;
  label: string;
  /** null = esa configuración no tiene ese concepto. */
  a: string | null;
  b: string | null;
  differs: boolean;
}

export interface CompareResult {
  rows: CompareRow[];
  /** B − A. */
  delta: { precioUsd: number; taraKg: number; cargaUtilKg: number };
  identical: boolean;
}

export function compareConfigs(a: Config, b: Config, lang: Lang): CompareResult {
  const t = (key: string) => translate(lang, key);
  const rows: CompareRow[] = [];
  const push = (key: string, section: string, label: string, va: string | null, vb: string | null) => rows.push({ key, section, label, a: va, b: vb, differs: va !== vb });

  push('tipo', t('comparar.tipo'), t('comparar.tipo'), typeName(a, lang), typeName(b, lang));

  const ga = quoteGroups(a, lang);
  const gb = quoteGroups(b, lang);
  // Unión ordenada de pasos y filas de ambas configuraciones.
  const pasos = [...new Set([...ga.map((g) => g.paso), ...gb.map((g) => g.paso)])];
  for (const paso of pasos) {
    const A = ga.find((g) => g.paso === paso);
    const B = gb.find((g) => g.paso === paso);
    const name = (A ?? B)?.name ?? paso;
    const keys = [...new Set([...(A?.rows ?? []).map((r) => r.key), ...(B?.rows ?? []).map((r) => r.key)])];
    for (const key of keys) {
      if (key === 'base') continue;
      const ra = A?.rows.find((r) => r.key === key);
      const rb = B?.rows.find((r) => r.key === key);
      push(key, name, (ra ?? rb)?.label ?? key, ra?.detail ?? null, rb?.detail ?? null);
    }
  }

  const sa = computeSpecs(a);
  const sb = computeSpecs(b);
  const ta = techRows(a, lang, sa);
  const tb = techRows(b, lang, sb);
  const techSection = t('tec.titulo');
  for (const key of [...new Set([...ta.map((r) => r.key), ...tb.map((r) => r.key)])]) {
    if (key === 'largoCaja') continue;
    const ra = ta.find((r) => r.key === key);
    const rb = tb.find((r) => r.key === key);
    push(`tec.${key}`, techSection, (ra ?? rb)?.label ?? key, ra?.value ?? null, rb?.value ?? null);
  }
  push('tec.legal', techSection, t('comparar.estadoLegal'), t(`tec.resumen.${sa.level}`), t(`tec.resumen.${sb.level}`));

  const pa = priceBreakdown(a);
  const pb = priceBreakdown(b);
  return {
    rows,
    delta: { precioUsd: pb.totalUsd - pa.totalUsd, taraKg: sb.taraKg - sa.taraKg, cargaUtilKg: sb.cargaUtilKg - sa.cargaUtilKg },
    identical: rows.every((r) => !r.differs),
  };
}
