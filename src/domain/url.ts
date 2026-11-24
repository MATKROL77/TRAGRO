import { sanitizeConfig } from './catalog';
import { resolve } from './rules';
import type { Configuration, Lang, UnitSystem } from './types';

export const LANGS: Lang[] = ['es-AR', 'en', 'pt-BR', 'ru'];

export interface SharedState {
  config: Configuration;
  lang?: Lang;
  units?: UnitSystem;
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Serializa en forma compacta: claves cortas y sólo las selecciones. */
export function encodeConfig(cfg: Configuration): string {
  const compact = {
    v: 1,
    f: cfg.family,
    m: cfg.model,
    r: cfg.rows,
    s: cfg.spacingCm,
    o: cfg.selections,
    c: [cfg.colors.main, cfg.colors.accent, cfg.colors.mainRal, cfg.colors.accentRal],
    t: cfg.text || undefined,
  };
  return b64urlEncode(JSON.stringify(compact));
}

export function decodeConfig(code: string): Configuration | null {
  try {
    const raw = JSON.parse(b64urlDecode(code)) as {
      v: number; m: string; r: number; s: number; o: Record<string, string>; c?: string[]; t?: string;
    };
    if (raw.v !== 1) return null;
    const cfg = sanitizeConfig({
      model: raw.m,
      rows: raw.r,
      spacingCm: raw.s,
      selections: raw.o,
      colors: raw.c ? { main: raw.c[0], accent: raw.c[1], mainRal: raw.c[2], accentRal: raw.c[3] } : undefined,
      text: raw.t ?? '',
    });
    return resolve(cfg).config;
  } catch {
    return null;
  }
}

export function buildShareUrl(base: string, s: SharedState): string {
  const u = new URL(base);
  u.search = '';
  u.hash = '';
  u.searchParams.set('cfg', encodeConfig(s.config));
  if (s.lang) u.searchParams.set('lang', s.lang);
  if (s.units) u.searchParams.set('u', s.units === 'imperial' ? 'imp' : 'met');
  return u.toString();
}

export function parseShareUrl(href: string): Partial<SharedState> {
  const u = new URL(href);
  const out: Partial<SharedState> = {};
  const c = u.searchParams.get('cfg');
  if (c) {
    const cfg = decodeConfig(c);
    if (cfg) out.config = cfg;
  }
  const lang = u.searchParams.get('lang');
  if (lang && (LANGS as string[]).includes(lang)) out.lang = lang as Lang;
  const units = u.searchParams.get('u');
  if (units === 'imp') out.units = 'imperial';
  if (units === 'met') out.units = 'metric';
  return out;
}

/** Número de configuración estable (hash FNV-1a corto), estilo "UX-26-7F3K2Q". */
export function configNumber(cfg: Configuration, prefix = 'UX'): string {
  const s = encodeConfig(cfg);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const code = h.toString(36).toUpperCase().padStart(7, '0').slice(-7);
  const yy = String(new Date().getFullYear()).slice(-2);
  return `${prefix}-${yy}-${code}`;
}
