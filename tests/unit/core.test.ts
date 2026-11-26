import { describe, expect, it } from 'vitest';
import { TYPE_IDS, groupDef, legal, pricing, rangeFor, typeDef, types } from '@/core/catalog';
import { applyChange, changeType, defaultConfig, effectiveRange, isGroupVisible, optionState, resolve, sanitize } from '@/core/rules';
import { priceBreakdown, deltaVsCurrent, priceIfType, startingPriceUsd } from '@/core/pricing';
import { combinationMaxT, computeSpecs, legalMaxFor, semiAxleCapacityT, tareBreakdown } from '@/core/specs';
import { computeLayout, SPREAD_MIN } from '@/core/layout';
import { configHash, decodeConfig, encodeConfig, shareUrl, MAX_LOGO_IN_LINK } from '@/core/serialize';
import type { Config } from '@/core/types';

const set = (cfg: Config, key: string, value: string | number | boolean) => applyChange(cfg, key, value);

describe('configuración por defecto', () => {
  it('arranca en tolva cerealera 1+1+1', () => {
    const cfg = defaultConfig();
    expect(cfg.tipo).toBe('tolva');
    expect(cfg.sel.ejes).toBe('1+1+1');
  });

  it('cada tipo tiene defaults válidos y estables frente a las reglas', () => {
    for (const tipo of TYPE_IDS) {
      const cfg = defaultConfig(tipo);
      const again = resolve(cfg);
      expect(again.notices).toEqual([]);
      expect(again.config).toEqual(cfg);
      for (const [k, v] of Object.entries(typeDef(tipo).defaults)) expect(cfg.sel[k]).toBe(v);
    }
  });
});

describe('reglas de compatibilidad', () => {
  it('súper single fuerza suspensión neumática y avisa', () => {
    const r = set(defaultConfig(), 'ruedas', 'single');
    expect(r.config.sel.ruedas).toBe('single');
    expect(r.config.sel.suspension).toBe('neumatica');
    expect(r.notices.map((n) => n.id)).toContain('single-requiere-neumatica');
    expect(r.notices[0].text.es).toMatch(/neumática/);
  });

  it('con súper single la suspensión mecánica queda deshabilitada con motivo', () => {
    const cfg = set(defaultConfig(), 'ruedas', 'single').config;
    const st = optionState(cfg, 'suspension', 'mecanica');
    expect(st.disabled).toBe(true);
    expect(st.motivo?.es).toBeTruthy();
    expect(optionState(cfg, 'suspension', 'neumatica').disabled).toBe(false);
  });

  it('el eje elevable no está disponible con 2 ejes ni con tándem', () => {
    let cfg = set(defaultConfig(), 'ejeElevable', true).config;
    expect(cfg.sel.ejeElevable).toBe(true);
    expect(cfg.sel.suspension).toBe('neumatica');
    const r = set(cfg, 'ejes', 'dos');
    expect(r.config.sel.ejeElevable).toBe(false);
    expect(r.notices.map((n) => n.id)).toContain('elevable-solo-tres-ejes');
    cfg = r.config;
    expect(optionState(cfg, 'ejeElevable', true).disabled).toBe(true);
    expect(optionState(set(cfg, 'ejes', 'tandem').config, 'ejeElevable', true).disabled).toBe(true);
    expect(optionState(set(cfg, 'ejes', 'tridem').config, 'ejeElevable', true).disabled).toBe(false);
  });

  it('1+1+1 exige largo mínimo en tolva y batea', () => {
    let cfg = set(defaultConfig('batea'), 'ejes', 'tandem').config;
    cfg = set(cfg, 'largo', 8).config;
    expect(cfg.sel.largo).toBe(8);
    const r = set(cfg, 'ejes', '1+1+1');
    expect(r.config.sel.largo).toBe(9.5);
    expect(r.notices.map((n) => n.id)).toContain('111-largo-minimo');
    expect(effectiveRange(r.config, 'largo')?.min).toBe(9.5);
    expect(effectiveRange(cfg, 'largo')?.min).toBe(rangeFor('batea', 'largo')?.min);
    // en plataforma no aplica
    expect(effectiveRange(defaultConfig('plataforma'), 'largo')?.min).toBe(12.5);
  });

  it('el portaauxilio doble no entra en cajas cortas', () => {
    let cfg = set(defaultConfig('batea'), 'ejes', 'tandem').config;
    cfg = set(cfg, 'portaauxilio', 2).config;
    expect(cfg.sel.portaauxilio).toBe(2);
    const r = set(cfg, 'largo', 8.5);
    expect(r.config.sel.portaauxilio).toBe(1);
    expect(optionState(r.config, 'portaauxilio', 2).disabled).toBe(true);
    expect(optionState(r.config, 'portaauxilio', 1).disabled).toBe(false);
  });

  it('nunca rompe el estado: valores inválidos se ignoran', () => {
    const cfg = defaultConfig();
    expect(set(cfg, 'ejes', 'cuatro').config).toEqual(cfg);
    expect(set(cfg, 'noExiste', 1).config).toEqual(cfg);
    expect(set(cfg, 'largo', 999).config.sel.largo).toBe(rangeFor('tolva', 'largo')?.max);
    expect(set(cfg, 'largo', 10.26).config.sel.largo).toBe(10.5);
  });

  it('cambiar de tipo conserva ejes, rodado, medidas, colores y personalización', () => {
    let cfg = set(set(set(defaultConfig(), 'llantas', 'aluminio').config, 'ejes', 'tandem').config, 'largo', 9).config;
    cfg = { ...cfg, colores: { chasis: 'RAL 9005', caja: 'RAL 5010' }, texto: { ...cfg.texto, valor: 'Transportes La Unión' } };
    const { config: next, adjusted } = changeType(cfg, 'batea');
    expect(next.tipo).toBe('batea');
    expect(next.sel.llantas).toBe('aluminio');
    expect(next.sel.ejes).toBe('tandem');
    expect(next.sel.largo).toBe(9);
    expect(next.sel.bocas).toBeUndefined();
    expect(next.sel.materialBatea).toBe('acero');
    expect(next.texto.valor).toBe('Transportes La Unión');
    expect(next.colores).toEqual({ chasis: 'RAL 9005', caja: 'RAL 5010' });
    expect(adjusted).toEqual([]);
  });

  it('sin cambios propios, cada tipo arranca en su configuración sugerida (su "desde")', () => {
    for (const tipo of ['batea', 'plataforma', 'furgon'] as const) {
      const { config: next, adjusted } = changeType(defaultConfig('tolva'), tipo);
      expect(next).toEqual(defaultConfig(tipo));
      expect(adjusted).toEqual([]);
      expect(priceIfType(defaultConfig('tolva'), tipo)).toBe(startingPriceUsd(tipo));
    }
  });

  it('al cambiar de tipo informa lo que no pudo conservar', () => {
    const cfg = set(defaultConfig('tolva'), 'largo', 9).config;
    const r = rangeFor('furgon', 'largo')!;
    const { config: next, adjusted } = changeType(cfg, 'furgon');
    if (Number(cfg.sel.largo) < r.min) {
      expect(next.sel.largo).toBe(r.min);
      expect(adjusted).toContainEqual({ key: 'largo', from: cfg.sel.largo, to: r.min });
    }
    // Lo que no aplica al tipo nuevo (bocas de la tolva) no se reporta como ajuste.
    expect(adjusted.some((a) => a.key === 'bocas')).toBe(false);
  });

  it('el sider tiene sus opciones propias y el furgón no', () => {
    const furgon = defaultConfig('furgon');
    const sider = set(furgon, 'variante', 'sider').config;
    const vis = (cfg: typeof furgon, id: string) => isGroupVisible(groupDef(id)!, cfg);
    for (const id of ['parantes', 'tablillas', 'techo', 'tensado']) {
      expect(vis(furgon, id), id).toBe(false);
      expect(vis(sider, id), id).toBe(true);
    }
    const base = priceBreakdown(sider).totalUsd;
    const corredizo = priceBreakdown(set(sider, 'techo', 'corredizo').config).totalUsd;
    expect(corredizo - base).toBe((pricing.opciones.techo as Record<string, number>).corredizo);
  });

  it('todas las reglas apuntan a grupos y opciones que existen', async () => {
    const { rules } = await import('@/core/catalog');
    const keys = new Set(['tipo']);
    for (const r of [...rules.requiere.map((x) => [x.si, x.entonces]), ...rules.noDisponible.map((x) => [x.cuando, x.opcion])]) {
      for (const part of r) for (const k of Object.keys(part)) if (!keys.has(k)) expect(groupDef(k), `grupo ${k}`).toBeDefined();
    }
  });
});

describe('precio', () => {
  it('el default cuesta el precio base del tipo', () => {
    for (const tipo of TYPE_IDS) {
      const b = priceBreakdown(defaultConfig(tipo));
      const extras = b.lines.filter((l) => l.usd !== 0 && l.key !== 'base');
      // los accesorios que vienen por defecto suman
      const acc = extras.reduce((s, l) => s + l.usd, 0);
      expect(b.totalUsd).toBe(pricing.tipos[tipo].base + acc);
      expect(b.totalArs).toBe(Math.round(b.totalUsd * pricing.tipoDeCambio.arsPorUsd));
    }
  });

  it('suma deltas por eje y por rueda', () => {
    const base = priceBreakdown(defaultConfig()).totalUsd;
    const neum = priceBreakdown(set(defaultConfig(), 'suspension', 'neumatica').config).totalUsd;
    expect(neum - base).toBe(1250 * 3);
    const alu = priceBreakdown(set(defaultConfig(), 'llantas', 'aluminio').config).totalUsd;
    expect(alu - base).toBe(235 * 12);
    const cfg2 = set(defaultConfig(), 'ejes', 'tandem').config;
    const alu2 = priceBreakdown(set(cfg2, 'llantas', 'aluminio').config).totalUsd - priceBreakdown(cfg2).totalUsd;
    expect(alu2).toBe(235 * 8);
  });

  it('el largo y el alto mueven el precio de forma lineal', () => {
    const base = priceBreakdown(defaultConfig()).totalUsd;
    const longer = priceBreakdown(set(defaultConfig(), 'largo', 11).config).totalUsd;
    expect(longer - base).toBe(pricing.tipos.tolva.usdPorMetroLargo);
    const taller = priceBreakdown(set(defaultConfig(), 'alto', 2.3).config).totalUsd;
    expect(taller - base).toBe(Math.round(0.2 * pricing.tipos.tolva.usdPorMetroAlto));
  });

  it('delta contra la opción actual', () => {
    const cfg = defaultConfig();
    expect(deltaVsCurrent(cfg, groupDef('frenos')!, 'ebs')).toBe(2150);
    expect(deltaVsCurrent(cfg, groupDef('ejes')!, 'tandem')).toBe(-5400);
    // Los accesorios arrancan apagados (salvo el matafuego): dos cajones suman dos veces su precio.
    expect(deltaVsCurrent(cfg, groupDef('cajon')!, 2)).toBe(2 * 390);
  });

  it('logo y texto suman su recargo', () => {
    const cfg = defaultConfig();
    const base = priceBreakdown(cfg).totalUsd;
    const withLogo = priceBreakdown({ ...cfg, logo: { ...cfg.logo, data: 'data:image/png;base64,AAAA' } }).totalUsd;
    expect(withLogo - base).toBe(pricing.personalizacion.logo);
  });

  it('no cotiza grupos ocultos (color de lona sin cobertor en batea)', () => {
    const cfg = defaultConfig('batea');
    expect(priceBreakdown(cfg).lines.some((l) => l.key === 'colorLona')).toBe(false);
    const withCover = set(cfg, 'cobertor', true).config;
    expect(priceBreakdown(withCover).lines.some((l) => l.key === 'colorLona')).toBe(true);
  });
});

describe('tara y carga útil', () => {
  it('la tara es la suma de componentes del catálogo', () => {
    const cfg = defaultConfig();
    const t = tareBreakdown(cfg);
    // Base + suspensión mecánica x3 + 12 ruedas duales + lona PVC 650 + matafuego.
    const manual = 5550 + 470 * 3 + 101 * 12 + 58 + 16;
    expect(t.totalKg).toBe(Math.round(manual / 10) * 10);
    expect(t.totalKg).toBeGreaterThan(7500);
    expect(t.totalKg).toBeLessThan(9500);
  });

  it('las llantas de aluminio bajan la tara por rueda', () => {
    const a = tareBreakdown(defaultConfig()).totalKg;
    const b = tareBreakdown(set(defaultConfig(), 'llantas', 'aluminio').config).totalKg;
    expect(Math.abs(a - b - 17 * 12)).toBeLessThanOrEqual(10);
  });

  it('capacidad por grupo de ejes según legal.json', () => {
    const g = legal.pesoPorGrupoDeEjesT;
    expect(semiAxleCapacityT('1+1+1', true)).toBe(g.simple.duales * 3);
    expect(semiAxleCapacityT('dos', true)).toBe(g.simple.duales * 2);
    expect(semiAxleCapacityT('tandem', true)).toBe(g.tandem.duales);
    expect(semiAxleCapacityT('tridem', false)).toBe(g.tridem.single);
  });

  it('peso bruto del conjunto: tope general salvo configuraciones listadas', () => {
    expect(combinationMaxT('6x2', '1+1+1', true)).toBe(55.5);
    expect(combinationMaxT('4x2', '1+1+1', true)).toBe(48);
    expect(combinationMaxT('6x2', 'tridem', true)).toBe(49.5);
    expect(combinationMaxT('4x2', 'tridem', true)).toBe(42);
    expect(combinationMaxT('4x2', 'tandem', true)).toBe(34.5);
    // 6 + 18 + 21 = 45 (tope general)
    expect(combinationMaxT('6x2', 'dos', true)).toBe(45);
  });

  it('carga útil = peso bruto − tara del tractor − tara del semi', () => {
    const cfg = defaultConfig();
    const s = computeSpecs(cfg);
    expect(s.cargaUtilKg).toBe(Math.round((s.pesoBrutoConjuntoT * 1000 - s.taraTractorKg - s.taraKg) / 10) * 10);
    const s4 = computeSpecs(set(cfg, 'tractor', '4x2').config);
    expect(s4.cargaUtilKg).toBeLessThan(s.cargaUtilKg);
  });
});

describe('validación legal y dimensiones', () => {
  it('máximo legal de altura y largo con el resto fijo', () => {
    const cfg = defaultConfig('tolva');
    const s = computeSpecs(cfg);
    const alto = legalMaxFor(s, 'alto', Number(cfg.sel.alto))!;
    const chk = s.checks.find((c) => c.id === 'alto')!;
    expect(alto.max).toBeCloseTo(Number(cfg.sel.alto) + chk.limit - chk.value, 2);
    // En el máximo, el alto total queda justo en el límite; un paso más, lo supera.
    expect(computeSpecs(set(cfg, 'alto', alto.max).config).checks.find((c) => c.id === 'alto')!.value).toBeLessThanOrEqual(chk.limit + 1e-6);
    expect(legalMaxFor(s, 'ejes', 1)).toBeNull();
  });

  it('el "desde" de cada tipo es el precio con el que arranca', () => {
    for (const t of types) expect(startingPriceUsd(t.id)).toBe(priceBreakdown(defaultConfig(t.id)).totalUsd);
  });

  it('el default es verde', () => {
    for (const tipo of TYPE_IDS) {
      const s = computeSpecs(defaultConfig(tipo));
      expect(s.level, tipo).toBe('ok');
      expect(s.anchoM).toBeLessThanOrEqual(legal.dimensiones.anchoMaxM);
    }
  });

  it('un furgón muy alto pasa a amarillo y después a rojo', () => {
    const cfg = defaultConfig('furgon');
    const levels = [2.5, 2.6, 2.7].map((h) => computeSpecs(set(cfg, 'alto', h).config).checks.find((c) => c.id === 'alto')!.level);
    expect(levels).toEqual(['ok', 'warn', 'bad']);
  });

  it('el largo del conjunto se valida contra el tope tractor + semi', () => {
    const cfg = set(defaultConfig('furgon'), 'largo', 15.5).config;
    const s = computeSpecs(cfg);
    const ch = s.checks.find((c) => c.id === 'largo')!;
    expect(ch.limit).toBe(legal.dimensiones.largoMaxTractorSemiM);
    expect(ch.level).toBe('bad');
    expect(s.largoConjuntoM).toBeGreaterThan(18.6);
  });

  it('avisa cuando la caja llena supera la carga útil', () => {
    let cfg = set(defaultConfig('batea'), 'carga', 'arena').config;
    cfg = set(cfg, 'alto', 1.8).config;
    const s = computeSpecs(cfg);
    const ch = s.checks.find((c) => c.id === 'carga')!;
    expect(ch.level).toBe('bad');
    expect(Number(ch.params.llenado)).toBeLessThan(100);
  });

  it('layout: ejes separados respetan la distancia mínima y las patas no chocan', () => {
    for (const tipo of TYPE_IDS) {
      let cfg = defaultConfig(tipo);
      for (const ejes of ['1+1+1', 'dos', 'tandem', 'tridem']) {
        cfg = set(cfg, 'ejes', ejes).config;
        const r = effectiveRange(cfg, 'largo')!;
        for (let L = r.min; L <= r.max + 1e-9; L += r.paso) {
          const l = computeLayout(set(cfg, 'largo', L).config);
          expect(l.axles.length).toBe(ejes === 'dos' || ejes === 'tandem' ? 2 : 3);
          if (!l.grouped) expect(l.spacing, `${tipo} ${ejes} ${L}`).toBeGreaterThan(SPREAD_MIN);
          expect(l.landingX - l.axles[0].x, `${tipo} ${ejes} ${L} pata/eje`).toBeGreaterThanOrEqual(l.wheelR + 0.4);
          expect(l.kingpinX - l.landingX, `${tipo} ${ejes} ${L} perno/pata`).toBeGreaterThanOrEqual(1.55);
          expect(l.axles[l.axles.length - 1].x - l.rearX).toBeGreaterThan(0.8);
        }
      }
    }
  });

  it('tolva: las bocas nunca caen sobre un eje y el volumen es razonable', () => {
    let cfg = defaultConfig('tolva');
    for (const ejes of ['1+1+1', 'dos', 'tandem', 'tridem']) {
      cfg = set(cfg, 'ejes', ejes).config;
      for (const bocas of ['2', '3']) {
        const r = effectiveRange(cfg, 'largo')!;
        for (let L = r.min; L <= r.max + 1e-9; L += r.paso) {
          let c = set(cfg, 'largo', L).config;
          c = set(c, 'bocas', bocas).config;
          const l = computeLayout(c);
          const t = l.tolva!;
          expect(t.hoppers.length).toBe(c.sel.bocas === '3' ? 3 : 2);
          for (const h of t.hoppers) {
            for (const a of l.axles) expect(Math.abs(h.x - a.x), `${ejes} ${bocas} ${L}`).toBeGreaterThan(0.62 + 0.3);
            expect(h.x + h.mouthHalf).toBeLessThan(l.landingX - 0.25);
          }
          expect(l.volumeM3).toBeGreaterThan(25);
          expect(l.volumeM3).toBeLessThan(75);
        }
      }
    }
  });
});

describe('serialización a URL', () => {
  it('ida y vuelta reconstruye exactamente la misma configuración', () => {
    for (const tipo of TYPE_IDS) {
      let cfg = defaultConfig(tipo);
      cfg = set(cfg, 'llantas', 'aluminio').config;
      cfg = set(cfg, 'ruedas', 'single').config;
      cfg = set(cfg, 'cajon', 2).config;
      cfg = { ...cfg, colores: { chasis: 'RAL 9005', caja: 'RAL 1023' }, texto: { ...cfg.texto, valor: 'Agro Ñandú & Hnos. 0341-555', fuente: 'barlow' } };
      const { code, logoIncluded } = encodeConfig(cfg);
      expect(logoIncluded).toBe(true);
      expect(decodeConfig(code)).toEqual(cfg);
    }
  });

  it('el default viaja en un código muy corto', () => {
    expect(encodeConfig(defaultConfig()).code.length).toBeLessThan(40);
  });

  it('un logo chico viaja en el link y uno grande no', () => {
    const cfg = defaultConfig();
    const small = { ...cfg, logo: { ...cfg.logo, data: 'data:image/png;base64,' + 'A'.repeat(800) } };
    const e1 = encodeConfig(small);
    expect(e1.logoIncluded).toBe(true);
    expect(decodeConfig(e1.code)?.logo.data).toBe(small.logo.data);
    const big = { ...cfg, logo: { ...cfg.logo, data: 'data:image/png;base64,' + 'A'.repeat(MAX_LOGO_IN_LINK + 10), escala: 0.8 } };
    const e2 = encodeConfig(big);
    expect(e2.logoIncluded).toBe(false);
    const back = decodeConfig(e2.code)!;
    expect(back.logo.data).toBeNull();
    expect(back.logo.escala).toBe(0.8);
  });

  it('códigos corruptos o maliciosos nunca rompen: devuelven null o una config válida', () => {
    expect(decodeConfig('%%%')).toBeNull();
    expect(decodeConfig('')).toBeNull();
    const evil = sanitize({ tipo: 'nave', sel: { ejes: { a: 1 }, largo: 1e9, cajon: -4, suspension: 'x' }, colores: { caja: 'javascript:alert(1)' }, logo: { data: 'javascript:alert(1)' }, texto: { valor: 'x'.repeat(500) } });
    expect(evil.tipo).toBe('tolva');
    expect(evil.sel.ejes).toBe('1+1+1');
    expect(evil.sel.largo).toBe(11.5);
    expect(evil.logo.data).toBeNull();
    expect(evil.texto.valor.length).toBe(40);
    expect(evil.colores.caja).toBe(typeDef('tolva').colores.caja);
  });

  it('una config inconsistente recibida por link se corrige con las reglas', () => {
    const cfg = sanitize({ tipo: 'tolva', sel: { ruedas: 'single', suspension: 'mecanica', ejes: 'dos', ejeElevable: true } });
    expect(cfg.sel.suspension).toBe('neumatica');
    expect(cfg.sel.ejeElevable).toBe(false);
  });

  it('el número de configuración es estable y cambia con la configuración', () => {
    const a = defaultConfig();
    const b = set(a, 'frenos', 'ebs').config;
    expect(configHash(a)).toBe(configHash(defaultConfig()));
    expect(configHash(a)).not.toBe(configHash(b));
    expect(configHash(a)).toMatch(/^TO-[0-9A-Z]{7}$/);
  });

  it('shareUrl conserva ruta y parámetros (modo vendedor, embed)', () => {
    const { url } = shareUrl(defaultConfig('batea'), 'https://demo.example/embed?modo=vendedor#x');
    const u = new URL(url);
    expect(u.pathname).toBe('/embed');
    expect(u.searchParams.get('modo')).toBe('vendedor');
    expect(decodeConfig(u.searchParams.get('c')!)?.tipo).toBe('batea');
  });
});
