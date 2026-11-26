import catalogJson from '../config/catalog.json';
import type { CatalogDef, Configuration, GroupDef, ModelDef } from './types';

export const catalog = catalogJson as unknown as CatalogDef;

export function getModel(id: string): ModelDef {
  return catalog.models.find((m) => m.id === id) ?? catalog.models[0];
}

export function getGroup(id: string): GroupDef | undefined {
  return catalog.groups.find((g) => g.id === id);
}

export function widthM(cfg: Pick<Configuration, 'rows' | 'spacingCm'>): number {
  return Math.round(cfg.rows * cfg.spacingCm) / 100;
}

/** Rango de surcos efectivo: el del modelo, limitado por su ancho máximo para la distancia elegida. */
export function rowsRange(model: ModelDef, spacingCm: number): { min: number; max: number } {
  const byWidth = Math.floor((model.maxWidthM * 100 + 1e-6) / spacingCm);
  const max = Math.max(model.rowsMin, Math.min(model.rowsMax, byWidth));
  return { min: model.rowsMin, max };
}

export function defaultSelections(): Record<string, string> {
  const s: Record<string, string> = {};
  for (const g of catalog.groups) s[g.id] = g.default;
  return s;
}

export function createDefaultConfig(): Configuration {
  const d = catalog.defaultConfig;
  return {
    family: catalog.family,
    model: d.model,
    rows: d.rows,
    spacingCm: d.spacingCm,
    selections: { ...defaultSelections(), ...d.selections },
    colors: { ...d.colors },
    text: d.text,
  };
}

/** Normaliza cualquier objeto (por ejemplo, venido de una URL) a una configuración válida estructuralmente. */
export function sanitizeConfig(input: Partial<Configuration> | null | undefined): Configuration {
  const base = createDefaultConfig();
  if (!input || typeof input !== 'object') return base;
  const model = catalog.models.find((m) => m.id === input.model) ?? getModel(base.model);
  const spacing = catalog.spacingsCm.includes(Number(input.spacingCm)) ? Number(input.spacingCm) : model.defaultSpacingCm;
  const range = rowsRange(model, spacing);
  const rowsIn = Number.isFinite(Number(input.rows)) ? Math.round(Number(input.rows)) : model.defaultRows;
  const rows = Math.min(range.max, Math.max(range.min, rowsIn));
  const selections: Record<string, string> = { ...base.selections };
  if (input.selections && typeof input.selections === 'object') {
    for (const g of catalog.groups) {
      const v = (input.selections as Record<string, unknown>)[g.id];
      if (typeof v === 'string' && g.options.some((o) => o.id === v)) selections[g.id] = v;
    }
  }
  const hex = /^#[0-9a-fA-F]{6}$/;
  const c = input.colors ?? base.colors;
  return {
    family: catalog.family,
    model: model.id,
    rows,
    spacingCm: spacing,
    selections,
    colors: {
      main: hex.test(c.main ?? '') ? c.main : base.colors.main,
      accent: hex.test(c.accent ?? '') ? c.accent : base.colors.accent,
      mainRal: typeof c.mainRal === 'string' ? c.mainRal.slice(0, 16) : base.colors.mainRal,
      accentRal: typeof c.accentRal === 'string' ? c.accentRal.slice(0, 16) : base.colors.accentRal,
    },
    text: typeof input.text === 'string' ? input.text.slice(0, 28) : '',
  };
}

/** Selecciones "estándar" (sin opcionales pagos) de cada grupo. */
export function standardSelections(): Record<string, string> {
  const s: Record<string, string> = {};
  for (const g of catalog.groups) s[g.id] = g.options.find((o) => o.standard)?.id ?? g.default;
  return s;
}

/** ¿La configuración usa exactamente las selecciones recomendadas de fábrica? */
export function isRecommended(cfg: Configuration): boolean {
  const d = createDefaultConfig().selections;
  return catalog.groups.every((g) => cfg.selections[g.id] === d[g.id]);
}

/** ¿Todas las selecciones están en su opción estándar? */
export function isBasic(cfg: Configuration): boolean {
  const s = standardSelections();
  return catalog.groups.every((g) => cfg.selections[g.id] === s[g.id]);
}
