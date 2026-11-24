import { describe, expect, it } from 'vitest';
import { groups, hotspotDefs, ralColors, steps, types } from '@/core/catalog';
import { rules } from '@/core/catalog';
import catEn from '@/i18n/catalogo.en.json';
import catRu from '@/i18n/catalogo.ru.json';
import en from '@/i18n/en.json';
import es from '@/i18n/es.json';
import pt from '@/i18n/pt.json';
import ru from '@/i18n/ru.json';
import { formatMoney, formatNumber, loadLang, translate, translateTx } from '@/i18n';
import { unitFormatters } from '@/core/units';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const DICTS: [string, Record<string, string>][] = [
  ['pt', pt as Record<string, string>],
  ['en', en as Record<string, string>],
  ['ru', ru as Record<string, string>],
];

describe('traducciones de la interfaz', () => {
  for (const [name, dict] of DICTS) {
    it(`es.json y ${name}.json tienen exactamente las mismas claves`, () => {
      const a = Object.keys(es).sort();
      const b = Object.keys(dict).sort();
      expect(b.filter((k) => !a.includes(k)), `claves que sobran en ${name}.json`).toEqual([]);
      expect(a.filter((k) => !b.includes(k)), `claves que faltan en ${name}.json`).toEqual([]);
    });

    it(`${name}.json usa los mismos placeholders {x} que el original`, () => {
      for (const [key, value] of Object.entries(es as Record<string, string>)) {
        if (dict[key] === undefined) continue;
        expect(placeholders(dict[key]), key).toEqual(placeholders(value));
      }
    });
  }

  it('ningún texto queda vacío', () => {
    for (const dict of [es as Record<string, string>, ...DICTS.map((d) => d[1])]) for (const [key, value] of Object.entries(dict)) expect(value.trim().length, key).toBeGreaterThan(0);
  });

  it('interpola parámetros y cae al español si falta la clave', () => {
    expect(translate('es', 'paso.de', { n: 2, total: 6 })).toBe('Paso 2 de 6');
    expect(translate('pt', 'paso.de', { n: 2, total: 6 })).toBe('Passo 2 de 6');
    expect(translate('pt', 'clave.inexistente')).toBe('clave.inexistente');
  });

  it('formatea números y moneda según el idioma', () => {
    expect(formatNumber('es', 8340)).toBe('8.340');
    expect(formatNumber('pt', 45.4, 1)).toBe('45,4');
    expect(formatNumber('en', 8340)).toBe('8,340');
    expect(formatNumber('ru', 8340)).toBe('8 340');
    expect(formatMoney('es', 65505, 'USD')).toBe('USD 65.505');
    expect(formatMoney('es', -5400, 'USD', true)).toBe('−USD 5.400');
    expect(formatMoney('es', 1250, 'USD', true)).toBe('+USD 1.250');
    expect(formatMoney('en', 65505, 'USD')).toBe('USD 65,505');
  });
});

describe('textos del catálogo en inglés y ruso', () => {
  const all = new Set<string>();
  const add = (t?: { es: string } | null) => t?.es && all.add(t.es);
  steps.forEach((s) => add(s.name));
  types.forEach((t) => [t.name, t.desc, t.altoLabel].forEach(add));
  groups.forEach((g) => {
    [g.name, g.desc, g.ayuda].forEach(add);
    g.opciones?.forEach((o) => [o.name, o.desc].forEach(add));
  });
  hotspotDefs.forEach((h) => [h.titulo, h.texto].forEach(add));
  ralColors.forEach((r) => add(r.name));
  const walk = (o: unknown): void => {
    if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>;
      if (typeof r.es === 'string' && typeof r.pt === 'string') all.add(r.es);
      Object.values(r).forEach(walk);
    }
  };
  walk(rules);

  it.each([
    ['en', catEn as Record<string, string>],
    ['ru', catRu as Record<string, string>],
  ])('todo texto visible del catálogo tiene versión en %s', (_name, dict) => {
    const missing = [...all].filter((s) => !dict[s]?.trim());
    expect(missing).toEqual([]);
  });

  it('el catálogo se traduce al cambiar de idioma (carga a demanda)', async () => {
    await loadLang('en');
    await loadLang('ru');
    expect(translateTx('en', types[0].name)).toBe((catEn as Record<string, string>)[types[0].name.es]);
    expect(translateTx('ru', types[0].name)).toBe((catRu as Record<string, string>)[types[0].name.es]);
    expect(translateTx('pt', types[0].name)).toBe(types[0].name.pt);
    expect(translate('en', 'paso.de', { n: 2, total: 6 })).toBe((en as Record<string, string>)['paso.de'].replace('{n}', '2').replace('{total}', '6'));
  });
});

describe('unidades', () => {
  const n = (v: number, d = 0) => formatNumber('es', v, d);
  it('métrico por defecto', () => {
    const u = unitFormatters(n, 'metric');
    expect(u.len(10.5)).toBe('10,50 m');
    expect(u.ton(38.3)).toBe('38,3 t');
    expect(u.kg(8340)).toBe('8.340 kg');
    expect(u.vol(45.4)).toBe('45,4 m³');
  });
  it('imperial convierte metros a pies y kilos a libras', () => {
    const u = unitFormatters(n, 'imperial');
    expect(u.len(10)).toBe('32,8 ft');
    expect(u.kg(1000)).toBe('2.205 lb');
    expect(u.ton(1)).toBe('2.205 lb');
    expect(u.cm(100)).toBe('39,4 in');
  });
});
