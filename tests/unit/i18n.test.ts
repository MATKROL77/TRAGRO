import { describe, expect, it } from 'vitest';
import es from '@/i18n/es.json';
import pt from '@/i18n/pt.json';
import { formatMoney, formatNumber, translate } from '@/i18n';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('traducciones', () => {
  it('es.json y pt.json tienen exactamente las mismas claves', () => {
    const a = Object.keys(es).sort();
    const b = Object.keys(pt).sort();
    expect(b.filter((k) => !a.includes(k)), 'claves que sobran en pt.json').toEqual([]);
    expect(a.filter((k) => !b.includes(k)), 'claves que faltan en pt.json').toEqual([]);
  });

  it('cada traducción usa los mismos placeholders {x} que el original', () => {
    const ptd = pt as Record<string, string>;
    for (const [key, value] of Object.entries(es as Record<string, string>)) {
      if (ptd[key] === undefined) continue;
      expect(placeholders(ptd[key]), key).toEqual(placeholders(value));
    }
  });

  it('ningún texto queda vacío', () => {
    for (const dict of [es, pt] as Record<string, string>[]) for (const [key, value] of Object.entries(dict)) expect(value.trim().length, key).toBeGreaterThan(0);
  });

  it('interpola parámetros y cae al español si falta la clave', () => {
    expect(translate('es', 'paso.de', { n: 2, total: 6 })).toBe('Paso 2 de 6');
    expect(translate('pt', 'paso.de', { n: 2, total: 6 })).toBe('Passo 2 de 6');
    expect(translate('pt', 'clave.inexistente')).toBe('clave.inexistente');
  });

  it('formatea números y moneda según el idioma', () => {
    expect(formatNumber('es', 8340)).toBe('8.340');
    expect(formatNumber('pt', 45.4, 1)).toBe('45,4');
    expect(formatMoney('es', 65505, 'USD')).toBe('US$ 65.505');
    expect(formatMoney('es', -5400, 'USD', true)).toBe('− US$ 5.400');
    expect(formatMoney('es', 1250, 'USD', true)).toBe('+ US$ 1.250');
  });
});
