import { describe, expect, it } from 'vitest';
import esAR from '../src/i18n/locales/es-AR.json';
import en from '../src/i18n/locales/en.json';
import ptBR from '../src/i18n/locales/pt-BR.json';
import ru from '../src/i18n/locales/ru.json';
import { catalog } from '../src/domain/catalog';
import { rules } from '../src/domain/rules';
import { agronomy } from '../src/domain/agronomy';
import { transportDef } from '../src/domain/transport';
import brand from '../src/config/brand.json';
import ral from '../src/config/ral.json';

type Tree = { [k: string]: string | Tree };
function keys(t: Tree, prefix = ''): string[] {
  return Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, prefix + k + '.')));
}
function get(t: Tree, key: string): unknown {
  return key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Tree)[p] : undefined), t);
}
const locales: Record<string, Tree> = { 'es-AR': esAR as Tree, en: en as Tree, 'pt-BR': ptBR as Tree, ru: ru as Tree };
const ref = keys(esAR as Tree);

describe('i18n', () => {
  for (const [lang, dict] of Object.entries(locales)) {
    it(`${lang}: tiene todas las claves de es-AR y ninguna de más`, () => {
      const k = keys(dict);
      expect(ref.filter((x) => !k.includes(x))).toEqual([]);
      expect(k.filter((x) => !ref.includes(x))).toEqual([]);
    });
    it(`${lang}: placeholders coinciden`, () => {
      for (const key of ref) {
        const a = String(get(esAR as Tree, key)).match(/\{\w+\}/g)?.sort() ?? [];
        const b = String(get(dict, key)).match(/\{\w+\}/g)?.sort() ?? [];
        expect([key, b]).toEqual([key, a]);
      }
    });
    it(`${lang}: el catálogo, reglas, cultivos y transporte están traducidos`, () => {
      const need: string[] = [];
      for (const m of catalog.models) need.push(`models.${m.id}.name`, `models.${m.id}.tier`, `models.${m.id}.desc`);
      for (const s of catalog.steps) need.push(`steps.${s.id}.name`, `steps.${s.id}.hint`);
      for (const g of catalog.groups) {
        need.push(`groups.${g.id}.name`);
        for (const o of g.options) need.push(`options.${g.id}.${o.id}.name`, `options.${g.id}.${o.id}.desc`);
      }
      for (const r of rules) need.push(`rules.${r.id}`);
      for (const c of agronomy.crops) need.push(`crops.${c.id}`);
      for (const p of transportDef.profiles) need.push(`transport.profiles.${p.id}`);
      for (const l of brand.languages) need.push(`langNames.${l}`);
      const missing = need.filter((k) => typeof get(dict, k) !== 'string');
      expect(missing).toEqual([]);
      expect(Object.keys(brand.tagline)).toContain(lang);
      expect(Object.keys(brand.pdfFooter)).toContain(lang);
    });
    it(`${lang}: nombres de colores RAL`, () => {
      for (const c of ral.colors) expect(typeof (c.names as Record<string, string>)[lang]).toBe('string');
    });
  }
});
