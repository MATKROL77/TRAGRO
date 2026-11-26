import { describe, expect, it } from 'vitest';
import { createDefaultConfig, rowsRange, getModel, sanitizeConfig, widthM } from '../src/domain/catalog';
import { applySelection, isValid, optionStatus, resolve } from '../src/domain/rules';
import { computePrice, optionPrice } from '../src/domain/pricing';
import { capacityHaH, computePerformance, defaultFieldParams, seedKgPerHa, seedsPerHa, seedsPerMFromHa, suggestedHp } from '../src/domain/agronomy';
import { checkTransport, levelFor } from '../src/domain/transport';
import { convert, toMetric, formatMoney } from '../src/domain/units';
import { buildShareUrl, configNumber, decodeConfig, encodeConfig, parseShareUrl } from '../src/domain/url';
import { computeLayout } from '../src/machines/seeder/layout';
import type { Configuration } from '../src/domain/types';

const base = (): Configuration => createDefaultConfig();
const withSel = (c: Configuration, sel: Record<string, string>): Configuration => ({ ...c, selections: { ...c.selections, ...sel } });

describe('agronomía', () => {
  it('16 surcos a 0,525 m da 8,4 m de ancho', () => {
    expect(widthM({ rows: 16, spacingCm: 52.5 })).toBeCloseTo(8.4, 6);
  });
  it('8,4 m a 7 km/h con eficiencia 0,7 da 4,12 ha/h', () => {
    expect(capacityHaH(8.4, 7, 0.7)).toBeCloseTo(4.116, 3);
    expect(Number(capacityHaH(8.4, 7, 0.7).toFixed(2))).toBe(4.12);
  });
  it('conversión semillas/m ↔ semillas/ha', () => {
    expect(seedsPerHa(4.2, 0.525)).toBeCloseTo(80000, 0);
    expect(seedsPerMFromHa(80000, 0.525)).toBeCloseTo(4.2, 6);
    expect(seedsPerHa(20, 0.525)).toBeCloseTo(380952.38, 1);
  });
  it('kg/ha de semilla según peso de mil semillas', () => {
    expect(seedKgPerHa(80000, 320)).toBeCloseTo(25.6, 6);
  });
  it('rendimiento completo de la configuración por defecto', () => {
    const p = computePerformance(base(), defaultFieldParams());
    expect(p.widthM).toBeCloseTo(8.4);
    expect(p.haPerHour).toBeCloseTo(4.116, 3);
    expect(p.haPerDay).toBeCloseTo(4.116 * 12, 3);
    expect(p.seedAutonomyHa).toBeGreaterThan(0);
    expect(p.fertAutonomyHa).toBeGreaterThan(0);
    expect(p.weight.loadedKg).toBeGreaterThan(p.weight.emptyKg);
    expect(p.hp.max).toBeGreaterThan(p.hp.min);
  });
  it('autonomía: 16 tolvas de 60 L de maíz (0,72 kg/L) a 25,6 kg/ha ≈ 27 ha', () => {
    const cfg = withSel(base(), { seedHopper: 'individual', seedCapacity: 'std' });
    const p = computePerformance(cfg, { ...defaultFieldParams(), crop: 'maize', seedsPerM: 4.2 });
    expect(p.seedAutonomyHa).toBeCloseTo((16 * 60 * 0.72) / 25.6, 3);
  });
  it('HP sugeridos crecen con los surcos', () => {
    const a = suggestedHp({ ...base(), rows: 12 });
    const b = suggestedHp({ ...base(), rows: 20 });
    expect(b.min).toBeGreaterThan(a.min);
  });
});

describe('reglas de compatibilidad', () => {
  it('la configuración por defecto es válida', () => {
    expect(isValid(base())).toBe(true);
  });
  it('transporte longitudinal obligatorio por encima de 10,5 m', () => {
    const c = { ...base(), model: 'sp24g', rows: 22, selections: { ...base().selections, transport: 'fold' } };
    const r = resolve(c);
    expect(r.config.selections.transport).toBe('longitudinal');
    expect(r.notices.some((n) => n.ruleId === 'longitudinalAboveWidth')).toBe(true);
    expect(optionStatus(r.config, 'transport', 'fold').state).toBe('disabled');
  });
  it('la compacta puede plegar o ir longitudinal', () => {
    const c = resolve({ ...base(), model: 'sp10c', rows: 10 }).config;
    expect(optionStatus(c, 'transport', 'fold').state).toBe('ok');
    expect(optionStatus(c, 'transport', 'longitudinal').state).toBe('ok');
  });
  it('tolva central exige dosificación neumática o eléctrica', () => {
    let c = withSel(base(), { metering: 'chain' });
    const r = applySelection(c, 'seedHopper', 'central');
    expect(['pneumatic', 'electric']).toContain(r.config.selections.metering);
    expect(r.notices[0].ruleId).toBe('centralNeedsAirMeter');
    // la última elección gana: volver a mecánica revierte la tolva central
    c = r.config;
    const r2 = applySelection(c, 'metering', 'chain');
    expect(r2.config.selections.metering).toBe('chain');
    expect(r2.config.selections.seedHopper).toBe('individual');
    expect(optionStatus(c, 'metering', 'chain').state).toBe('adjusts');
  });
  it('corte surco a surco exige dosificación eléctrica y monitor avanzado', () => {
    const r = applySelection(base(), 'sectionControl', 'on');
    expect(r.config.selections.metering).toBe('electric');
    expect(r.config.selections.monitor).toBe('advanced');
    expect(isValid(r.config)).toBe(true);
  });
  it('presión neumática sólo en grande y gran ancho', () => {
    expect(optionStatus(base(), 'downforce', 'pneumatic').state).toBe('disabled');
    const big = resolve({ ...base(), model: 'sp24g', rows: 22 }).config;
    expect(optionStatus(big, 'downforce', 'pneumatic').state).toBe('ok');
    // al bajar a mediana se ajusta sola
    const back = resolve({ ...big, selections: { ...big.selections, downforce: 'pneumatic' }, model: 'sp16m', rows: 16 });
    expect(back.config.selections.downforce).toBe('spring');
  });
  it('el estado nunca se rompe: 500 cambios aleatorios siempre válidos', () => {
    let c = base();
    const groups = ['transport', 'seedHopper', 'metering', 'sectionControl', 'variableRate', 'monitor', 'isobus', 'downforce', 'fertilizer'];
    const opts: Record<string, string[]> = {
      transport: ['fold', 'longitudinal'], seedHopper: ['individual', 'central'], metering: ['chain', 'shaft', 'pneumatic', 'electric'],
      sectionControl: ['on', 'off'], variableRate: ['on', 'off'], monitor: ['basic', 'advanced'], isobus: ['on', 'off'],
      downforce: ['spring', 'pneumatic'], fertilizer: ['none', 'inline', 'side'],
    };
    const models = ['sp10c', 'sp16m', 'sp24g', 'sp36xg'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 500; i++) {
      if (rnd() < 0.15) {
        const m = models[Math.floor(rnd() * models.length)];
        c = resolve({ ...c, model: m, rows: getModel(m).defaultRows }).config;
      } else {
        const g = groups[Math.floor(rnd() * groups.length)];
        const o = opts[g][Math.floor(rnd() * opts[g].length)];
        c = applySelection(c, g, o).config;
      }
      expect(isValid(c)).toBe(true);
    }
  });
  it('surcos fuera de rango se ajustan', () => {
    const r = resolve({ ...base(), rows: 99 });
    expect(r.config.rows).toBe(rowsRange(getModel('sp16m'), 52.5).max);
  });
});

describe('precio', () => {
  it('base + surcos + opciones', () => {
    const c = base();
    const p = computePrice(c);
    const expected = 36000 + 2500 * 16 + optionPrice(c, 'transport', 'longitudinal') + optionPrice(c, 'fertilizer', 'side') +
      optionPrice(c, 'closing', 'castiron') + optionPrice(c, 'metering', 'pneumatic');
    expect(p.total).toBe(expected);
    expect(p.currency).toBe('USD');
  });
  it('capacidad grande depende del tipo de tolva', () => {
    const ind = withSel(base(), { seedHopper: 'individual', seedCapacity: 'large' });
    const cen = withSel(base(), { seedHopper: 'central', seedCapacity: 'large' });
    expect(optionPrice(ind, 'seedCapacity', 'large')).toBe(45 * 16);
    expect(optionPrice(cen, 'seedCapacity', 'large')).toBe(2800);
  });
  it('color fuera de la paleta de la marca suma pintura especial', () => {
    const c = base();
    const p1 = computePrice(c).total;
    const p2 = computePrice({ ...c, colors: { ...c.colors, mainRal: 'RAL 5010', main: '#0E4C92' } }).total;
    expect(p2 - p1).toBe(950);
  });
  it('formato de moneda', () => {
    expect(formatMoney(76000, 'en')).toContain('76,000');
    expect(formatMoney(76000, 'es-AR')).toContain('76.000');
  });
});

describe('transporte', () => {
  it('semáforo por límites', () => {
    expect(levelFor(2.5, 2.6, 4.8)).toBe('green');
    expect(levelFor(3.5, 2.6, 4.8)).toBe('yellow');
    expect(levelFor(5, 2.6, 4.8)).toBe('red');
  });
  it('longitudinal: el largo de transporte supera el ancho de labor', () => {
    const lay = computeLayout(base());
    expect(lay.transport).toBe('longitudinal');
    expect(lay.transportDims.length).toBeGreaterThan(lay.workWidth);
    expect(lay.transportDims.width).toBeLessThan(4);
  });
  it('plegado: alto de transporte crece con el largo de las alas', () => {
    const a = computeLayout(withSel({ ...base(), rows: 14 }, { transport: 'fold' }));
    const b = computeLayout(withSel({ ...base(), rows: 20 }, { transport: 'fold' }));
    expect(b.transportDims.height).toBeGreaterThan(a.transportDims.height);
    expect(a.sections).toHaveLength(3);
    expect(a.sections.reduce((s, x) => s + x.rows.length, 0)).toBe(14);
  });
  it('chequeo completo', () => {
    const t = checkTransport(base());
    expect(['green', 'yellow', 'red']).toContain(t.level);
    expect(t.length.value).toBeGreaterThan(t.machineLength);
  });
});

describe('unidades', () => {
  it('conversiones ida y vuelta', () => {
    expect(convert(1, 'area', 'imperial')).toBeCloseTo(2.47105);
    expect(convert(10, 'speed', 'imperial')).toBeCloseTo(6.21371);
    expect(convert(8.4, 'length', 'imperial')).toBeCloseTo(27.559, 2);
    expect(toMetric(convert(123.4, 'mass', 'imperial'), 'mass', 'imperial')).toBeCloseTo(123.4);
    expect(convert(80000, 'perArea', 'imperial')).toBeCloseTo(32374.9, 0);
    expect(convert(5, 'speed', 'metric')).toBe(5);
  });
});

describe('URL', () => {
  it('ida y vuelta exacta incluyendo idioma y unidades', () => {
    const c = applySelection(withSel({ ...base(), rows: 18, spacingCm: 42 }, {}), 'sectionControl', 'on').config;
    const c2 = { ...c, text: 'Agro Ñandú', colors: { ...c.colors, main: '#123456', mainRal: 'RAL 5001' } };
    const url = buildShareUrl('https://demo.example/?x=1', { config: c2, lang: 'ru', units: 'imperial' });
    const back = parseShareUrl(url);
    expect(back.config).toEqual(c2);
    expect(back.lang).toBe('ru');
    expect(back.units).toBe('imperial');
  });
  it('código inválido no rompe', () => {
    expect(decodeConfig('%%%')).toBeNull();
    expect(parseShareUrl('https://x.example/?cfg=abc').config).toBeUndefined();
  });
  it('datos manipulados se sanean', () => {
    const c = sanitizeConfig({ model: 'nope', rows: 500, selections: { transport: 'hack' } as Record<string, string> });
    expect(c.model).toBe('sp16m');
    expect(c.selections.transport).toBe('longitudinal');
  });
  it('número de configuración estable', () => {
    expect(configNumber(base())).toBe(configNumber(base()));
    expect(configNumber(base())).not.toBe(configNumber({ ...base(), rows: 17 }));
    expect(encodeConfig(base()).length).toBeLessThan(600);
  });
});

describe('auditoría: precios, estado en la URL y formulario', () => {
  it('el "desde" es la configuración básica con el mínimo de surcos (más barato que la recomendada)', async () => {
    const { fromPrice, recommendedPrice } = await import('../src/domain/pricing');
    const { catalog: cat } = await import('../src/domain/catalog');
    for (const m of cat.models) {
      expect(fromPrice(m.id)).toBeLessThan(recommendedPrice(m.id));
    }
  });
  it('la configuración básica no suma opcionales', async () => {
    const { standardSelections, isBasic, isRecommended } = await import('../src/domain/catalog');
    const cfg = { ...createDefaultConfig(), selections: standardSelections() };
    expect(isBasic(cfg)).toBe(true);
    expect(isRecommended(createDefaultConfig())).toBe(true);
    const p = computePrice(cfg);
    expect(p.lines.every((l) => l.key === 'base' || l.key === 'rows')).toBe(true);
  });
  it('liveUrl conserva otros parámetros y omite idioma/unidades por defecto', async () => {
    const { liveUrl } = await import('../src/domain/url');
    const u = new URL(liveUrl('https://x.test/?modo=feria&q=low', { config: createDefaultConfig(), lang: 'es-AR', units: 'metric' }));
    expect(u.searchParams.get('modo')).toBe('feria');
    expect(u.searchParams.get('q')).toBe('low');
    expect(u.searchParams.get('cfg')).toBeTruthy();
    expect(u.searchParams.has('lang')).toBe(false);
    const v = new URL(liveUrl(u.toString(), { config: createDefaultConfig(), lang: 'en', units: 'imperial' }));
    expect(v.searchParams.get('lang')).toBe('en');
    expect(v.searchParams.get('u')).toBe('imp');
  });
});
