/**
 * Motor de reglas de compatibilidad (100% declarativo, ver src/config/rules.json).
 *
 * - `applyChange` aplica una elección del usuario y deja el estado SIEMPRE válido,
 *   ajustando lo que haga falta y devolviendo avisos para mostrar.
 * - `optionState` dice si una opción está deshabilitada y por qué (tooltip).
 * - `sanitize` reconstruye una configuración válida a partir de datos no confiables (URL).
 */
import { groupDef, groupsForType, isRal, isTypeId, matches, optionsFor, rangeFor, rules, typeDef } from './catalog';
import type { AdjustedItem, Config, FontId, GroupDef, Notice, RangeDef, Tx, TypeId, Value } from './types';

const MAX_ITER = 8;
const FONTS: FontId[] = ['manrope', 'barlow', 'slab'];

export function ctxOf(cfg: Config): Record<string, Value> {
  return { ...cfg.sel, tipo: cfg.tipo };
}

function snap(value: number, r: RangeDef): number {
  const n = Math.round((value - r.min) / r.paso);
  const v = r.min + n * r.paso;
  return Math.min(r.max, Math.max(r.min, Math.round(v * 1000) / 1000));
}

function isRangeReq(v: unknown): v is { min?: number; max?: number } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Valor por defecto de un grupo para un tipo. */
function defaultValue(g: GroupDef, tipo: TypeId): Value {
  const d = typeDef(tipo).defaults[g.id];
  if (d !== undefined) return d;
  switch (g.tipo) {
    case 'seleccion': {
      const opts = optionsFor(g, tipo);
      return (opts.find((o) => o.estandar) ?? opts[0])?.id ?? '';
    }
    case 'interruptor':
      return false;
    case 'cantidad':
      return 0;
    case 'rango':
      return rangeFor(tipo, g.id)?.min ?? 0;
  }
}

function isValidValue(g: GroupDef, tipo: TypeId, v: unknown): v is Value {
  switch (g.tipo) {
    case 'seleccion':
      return typeof v === 'string' && optionsFor(g, tipo).some((o) => o.id === v);
    case 'interruptor':
      return typeof v === 'boolean';
    case 'cantidad':
      return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= (g.max ?? 1);
    case 'rango': {
      const r = rangeFor(tipo, g.id);
      return typeof v === 'number' && Number.isFinite(v) && !!r && v >= r.min - 1e-9 && v <= r.max + 1e-9;
    }
  }
}

export function defaultConfig(tipo: TypeId = 'tolva'): Config {
  const t = typeDef(tipo);
  const sel: Record<string, Value> = {};
  for (const g of groupsForType(tipo)) sel[g.id] = defaultValue(g, tipo);
  const cfg: Config = {
    v: 1,
    tipo,
    sel,
    colores: { ...t.colores },
    logo: { data: null, escala: 0.55, x: 0, y: 0.4, frente: false },
    texto: { valor: '', fuente: 'manrope', escala: 0.4, x: 0, y: -0.85, color: 'auto' },
  };
  return resolve(cfg).config;
}

/** Rango efectivo de un grupo numérico, considerando las reglas `requiere` activas. */
export function effectiveRange(cfg: Config, key: string): (RangeDef & { motivo?: Tx }) | undefined {
  const base = rangeFor(cfg.tipo, key);
  if (!base) return undefined;
  const out: RangeDef & { motivo?: Tx } = { ...base };
  const ctx = ctxOf(cfg);
  for (const rule of rules.requiere) {
    const req = rule.entonces[key];
    if (!isRangeReq(req) || !matches(rule.si, ctx)) continue;
    if (req.min !== undefined && req.min > out.min) {
      out.min = req.min;
      out.motivo = rule.motivo;
    }
    if (req.max !== undefined && req.max < out.max) {
      out.max = req.max;
      out.motivo = rule.motivo;
    }
  }
  return out;
}

export interface OptionState {
  disabled: boolean;
  motivo?: Tx;
}

/** ¿Se puede elegir `value` en el grupo `key` con la configuración actual? */
export function optionState(cfg: Config, key: string, value: Value): OptionState {
  const ctx = ctxOf(cfg);
  for (const rule of rules.noDisponible) {
    if (!(key in rule.opcion)) continue;
    const target = rule.opcion[key];
    const hit = typeof target === 'number' && typeof value === 'number' ? value >= target : target === value;
    if (hit && matches(rule.cuando, ctx)) return { disabled: true, motivo: rule.motivo };
  }
  for (const rule of rules.requiere) {
    if (!(key in rule.entonces) || key in rule.si) continue;
    if (!matches(rule.si, ctx)) continue;
    const req = rule.entonces[key];
    if (isRangeReq(req)) {
      if (typeof value === 'number' && ((req.min !== undefined && value < req.min) || (req.max !== undefined && value > req.max))) {
        return { disabled: true, motivo: rule.motivo };
      }
    } else if (req !== value) {
      return { disabled: true, motivo: rule.motivo };
    }
  }
  return { disabled: false };
}

/** Lleva la configuración a un estado consistente con todas las reglas. */
export function resolve(input: Config): { config: Config; notices: Notice[] } {
  const cfg: Config = { ...input, sel: { ...input.sel } };
  const notices: Notice[] = [];
  const push = (id: string, text: Tx) => {
    if (!notices.some((n) => n.id === id)) notices.push({ id, text });
  };

  for (let i = 0; i < MAX_ITER; i++) {
    let changed = false;
    const ctx = () => ctxOf(cfg);

    for (const rule of rules.requiere) {
      if (!matches(rule.si, ctx())) continue;
      for (const [key, req] of Object.entries(rule.entonces)) {
        if (!(key in cfg.sel)) continue;
        const cur = cfg.sel[key];
        if (isRangeReq(req)) {
          if (typeof cur !== 'number') continue;
          let next = cur;
          if (req.min !== undefined) next = Math.max(next, req.min);
          if (req.max !== undefined) next = Math.min(next, req.max);
          if (next !== cur) {
            cfg.sel[key] = next;
            push(rule.id, rule.aviso);
            changed = true;
          }
        } else if (cur !== req) {
          cfg.sel[key] = req;
          push(rule.id, rule.aviso);
          changed = true;
        }
      }
    }

    for (const rule of rules.noDisponible) {
      const [key, target] = Object.entries(rule.opcion)[0] ?? [];
      if (key === undefined || !(key in cfg.sel)) continue;
      const cur = cfg.sel[key];
      const hit = typeof target === 'number' && typeof cur === 'number' ? cur >= target : cur === target;
      if (hit && matches(rule.cuando, ctx())) {
        cfg.sel[key] = rule.alternativa;
        push(rule.id, rule.aviso);
        changed = true;
      }
    }

    if (!changed) break;
  }
  return { config: cfg, notices };
}

/** Aplica una elección del usuario. Nunca rompe el estado. */
export function applyChange(cfg: Config, key: string, value: Value): { config: Config; notices: Notice[] } {
  const g = groupDef(key);
  if (!g || !(key in cfg.sel)) return { config: cfg, notices: [] };
  let v: Value = value;
  if (g.tipo === 'rango' && typeof v === 'number') {
    const r = rangeFor(cfg.tipo, key);
    if (r) v = snap(v, r);
  }
  if (!isValidValue(g, cfg.tipo, v)) return { config: cfg, notices: [] };
  return resolve({ ...cfg, sel: { ...cfg.sel, [key]: v } });
}

const sameValue = (a: Value | undefined, b: Value | undefined) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b);

/** Elecciones que se intentan conservar al cambiar de tipo (si el tipo nuevo las admite). */
const CARRY = ['largo', 'alto', 'ejes', 'ejeElevable', 'suspension', 'ruedas', 'llantas', 'frenos', 'colorLona', 'cajon', 'portaauxilio', 'tanqueAgua', 'matafuego', 'lucesLed', 'faldones', 'tractor'];

/**
 * Cambia el tipo de semirremolque conservando todo lo compatible: ejes, rodado, frenos,
 * medidas dentro del rango del tipo nuevo, colores, logo y texto. Devuelve lo que no se
 * pudo conservar para avisarlo (con opción de deshacer).
 */
export function changeType(cfg: Config, tipo: TypeId): { config: Config; notices: Notice[]; adjusted: AdjustedItem[] } {
  if (tipo === cfg.tipo) return { config: cfg, notices: [], adjusted: [] };
  const next = defaultConfig(tipo);
  // Solo se lleva lo que la persona eligió: lo que sigue en el valor sugerido del tipo anterior
  // toma el sugerido del tipo nuevo (así, sin tocar nada, cada tipo arranca en su "desde").
  const base = defaultConfig(cfg.tipo);
  const wanted: Record<string, Value> = {};
  for (const key of CARRY) {
    const g = groupDef(key);
    if (!g || !(key in next.sel) || !(key in cfg.sel)) continue;
    const v = cfg.sel[key];
    if (sameValue(v, base.sel[key])) continue;
    if (g.tipo === 'rango') {
      const r = rangeFor(tipo, key);
      if (!r || typeof v !== 'number') continue;
      // La altura mide cosas distintas según el tipo (caja, baranda, interior): solo se conserva si entra en el rango.
      if (key === 'alto' && (v < r.min - 1e-9 || v > r.max + 1e-9)) continue;
      wanted[key] = v;
      next.sel[key] = snap(v, r);
    } else if (isValidValue(g, tipo, v)) {
      wanted[key] = v;
      next.sel[key] = v;
    } else if (key === 'colorLona' || key === 'ejes') {
      wanted[key] = v;
    }
  }
  if (cfg.colores.chasis !== base.colores.chasis) next.colores.chasis = cfg.colores.chasis;
  if (cfg.colores.caja !== base.colores.caja) next.colores.caja = cfg.colores.caja;
  next.logo = { ...cfg.logo };
  next.texto = { ...cfg.texto };
  const out = resolve(next);
  const adjusted: AdjustedItem[] = [];
  for (const [key, v] of Object.entries(wanted)) {
    const final = out.config.sel[key];
    if (final !== undefined && final !== v) adjusted.push({ key, from: v, to: final });
  }
  return { ...out, adjusted };
}

function num(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/** Reconstruye una configuración válida desde datos externos (link compartido). */
export function sanitize(raw: unknown): Config {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const tipo: TypeId = isTypeId(r.tipo) ? r.tipo : 'tolva';
  const base = defaultConfig(tipo);
  const rawSel = (typeof r.sel === 'object' && r.sel !== null ? r.sel : {}) as Record<string, unknown>;
  for (const g of groupsForType(tipo)) {
    let v = rawSel[g.id];
    if (g.tipo === 'rango' && typeof v === 'number' && Number.isFinite(v)) {
      const range = rangeFor(tipo, g.id);
      if (range) v = snap(v, range);
    }
    if (isValidValue(g, tipo, v)) base.sel[g.id] = v;
  }
  const col = (typeof r.colores === 'object' && r.colores !== null ? r.colores : {}) as Record<string, unknown>;
  if (isRal(col.chasis)) base.colores.chasis = col.chasis;
  if (isRal(col.caja)) base.colores.caja = col.caja;

  const logo = (typeof r.logo === 'object' && r.logo !== null ? r.logo : {}) as Record<string, unknown>;
  base.logo = {
    data: typeof logo.data === 'string' && /^data:image\/(png|svg\+xml|jpeg|webp);/.test(logo.data) ? logo.data : null,
    escala: num(logo.escala, 0.2, 1, 0.55),
    x: num(logo.x, -1, 1, 0),
    y: num(logo.y, -1, 1, 0.4),
    frente: logo.frente === true,
  };
  const texto = (typeof r.texto === 'object' && r.texto !== null ? r.texto : {}) as Record<string, unknown>;
  base.texto = {
    valor: typeof texto.valor === 'string' ? texto.valor.slice(0, 40) : '',
    fuente: FONTS.includes(texto.fuente as FontId) ? (texto.fuente as FontId) : 'manrope',
    escala: num(texto.escala, 0.2, 1, 0.4),
    x: num(texto.x, -1, 1, 0),
    y: num(texto.y, -1, 1, -0.85),
    color: texto.color === 'blanco' || texto.color === 'negro' ? texto.color : 'auto',
  };
  return resolve(base).config;
}

/** ¿El grupo se muestra (y se cotiza) con la configuración actual? */
export function isGroupVisible(g: GroupDef, cfg: Config): boolean {
  if (g.tipos && !g.tipos.includes(cfg.tipo)) return false;
  if (!g.visibleSi) return true;
  const ctx = ctxOf(cfg);
  return g.visibleSi.some((c) => matches(c, ctx));
}

/** Cantidad de ejes y de ruedas de la configuración. */
export function counts(cfg: Config): { ejes: number; ruedas: number; duales: boolean } {
  const ejes = cfg.sel.ejes === 'dos' || cfg.sel.ejes === 'tandem' ? 2 : 3;
  const duales = cfg.sel.ruedas !== 'single';
  return { ejes, ruedas: ejes * (duales ? 4 : 2), duales };
}
