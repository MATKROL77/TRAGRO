import esAR from './locales/es-AR.json';
import type { Lang } from '../domain/types';

export type Dict = typeof esAR;
type Tree = { [k: string]: string | Tree };

const cache: Partial<Record<Lang, Tree>> = { 'es-AR': esAR as unknown as Tree };

const loaders: Record<Exclude<Lang, 'es-AR'>, () => Promise<{ default: unknown }>> = {
  en: () => import('./locales/en.json'),
  'pt-BR': () => import('./locales/pt-BR.json'),
  ru: () => import('./locales/ru.json'),
};

/** Carga diferida de idiomas no activos (code-splitting). */
export async function loadLang(lang: Lang): Promise<void> {
  if (cache[lang]) return;
  const mod = await loaders[lang as Exclude<Lang, 'es-AR'>]();
  cache[lang] = mod.default as Tree;
}

export function hasLang(lang: Lang): boolean {
  return !!cache[lang];
}

export function registerLang(lang: Lang, dict: unknown): void {
  cache[lang] = dict as Tree;
}

function lookup(tree: Tree | undefined, key: string): string | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(cache[lang], key) ?? lookup(cache['es-AR'], key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;
