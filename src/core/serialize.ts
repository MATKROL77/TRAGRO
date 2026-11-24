/**
 * Serialización de la configuración a un parámetro de URL comprimido (lz-string)
 * y número de configuración (hash corto y estable).
 */
import LZString from 'lz-string';
import { defaultConfig, sanitize } from './rules';
import type { Config } from './types';

/** Tamaño máximo (caracteres del data URL) de un logo que viaja dentro del link. */
export const MAX_LOGO_IN_LINK = 6000;

export interface EncodeResult {
  code: string;
  /** false si había logo y no entró en el link. */
  logoIncluded: boolean;
}

/** Forma compacta: solo lo que difiere de la configuración por defecto del tipo. */
function compact(cfg: Config, includeLogo: boolean): Record<string, unknown> {
  const base = defaultConfig(cfg.tipo);
  const s: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg.sel)) if (base.sel[k] !== v) s[k] = v;
  const out: Record<string, unknown> = { t: cfg.tipo };
  if (Object.keys(s).length) out.s = s;
  if (cfg.colores.chasis !== base.colores.chasis || cfg.colores.caja !== base.colores.caja) out.c = [cfg.colores.chasis, cfg.colores.caja];
  if (cfg.logo.data && includeLogo) out.l = [cfg.logo.data, cfg.logo.escala, cfg.logo.x, cfg.logo.y, cfg.logo.frente ? 1 : 0];
  else if (cfg.logo.data) out.lp = [cfg.logo.escala, cfg.logo.x, cfg.logo.y, cfg.logo.frente ? 1 : 0];
  if (cfg.texto.valor) out.x = [cfg.texto.valor, cfg.texto.fuente, cfg.texto.escala, cfg.texto.x, cfg.texto.y, cfg.texto.color];
  return out;
}

function expand(raw: Record<string, unknown>): unknown {
  const l = Array.isArray(raw.l) ? raw.l : null;
  const lp = Array.isArray(raw.lp) ? raw.lp : null;
  const x = Array.isArray(raw.x) ? raw.x : null;
  const c = Array.isArray(raw.c) ? raw.c : null;
  const base = typeof raw.t === 'string' ? raw.t : 'tolva';
  return {
    tipo: base,
    sel: typeof raw.s === 'object' && raw.s !== null ? raw.s : {},
    colores: c ? { chasis: c[0], caja: c[1] } : undefined,
    logo: l ? { data: l[0], escala: l[1], x: l[2], y: l[3], frente: l[4] === 1 } : lp ? { data: null, escala: lp[0], x: lp[1], y: lp[2], frente: lp[3] === 1 } : undefined,
    texto: x ? { valor: x[0], fuente: x[1], escala: x[2], x: x[3], y: x[4], color: x[5] } : undefined,
  };
}

export function encodeConfig(cfg: Config): EncodeResult {
  const hasLogo = !!cfg.logo.data;
  const logoIncluded = hasLogo && (cfg.logo.data as string).length <= MAX_LOGO_IN_LINK;
  const json = JSON.stringify(compact(cfg, logoIncluded));
  return { code: LZString.compressToEncodedURIComponent(json), logoIncluded: !hasLogo || logoIncluded };
}

export function decodeConfig(code: string): Config | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(code);
    if (!json) return null;
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (typeof raw !== 'object' || raw === null) return null;
    const expanded = expand(raw) as Record<string, unknown>;
    // Los colores ausentes vuelven a los del tipo: sanitize ya parte de los defaults.
    if (expanded.colores === undefined) delete expanded.colores;
    return sanitize(expanded);
  } catch {
    return null;
  }
}

/** Hash FNV-1a de 32 bits en base 36: número de configuración corto y estable. */
export function configHash(cfg: Config): string {
  const { code } = encodeConfig({ ...cfg, logo: { ...cfg.logo, data: cfg.logo.data ? 'logo' : null } });
  let h = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const s = (h >>> 0).toString(36).toUpperCase().padStart(7, '0');
  return `${cfg.tipo.slice(0, 2).toUpperCase()}-${s.slice(0, 3)}${s.slice(3)}`;
}

/** Arma el link compartible respetando la ruta y los demás parámetros actuales. */
export function shareUrl(cfg: Config, href: string): { url: string; logoIncluded: boolean } {
  const { code, logoIncluded } = encodeConfig(cfg);
  const u = new URL(href);
  u.searchParams.set('c', code);
  u.hash = '';
  return { url: u.toString(), logoIncluded };
}
