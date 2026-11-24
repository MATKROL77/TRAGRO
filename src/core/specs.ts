/**
 * Ficha técnica estimada: dimensiones, tara (suma de componentes del catálogo),
 * capacidad legal, carga útil y validación contra los límites de legal.json.
 *
 * IMPORTANTE: son cálculos orientativos de demo. No reemplazan la homologación del fabricante.
 */
import { groupsForType, legal, typeDef } from './catalog';
import { combinationLength, computeLayout, type Layout } from './layout';
import { counts, isGroupVisible } from './rules';
import type { Config, Level, Per, Tx } from './types';

export interface TareLine {
  key: string;
  label: Tx;
  kg: number;
}

export interface LegalCheck {
  id: 'ancho' | 'alto' | 'largo' | 'peso' | 'carga';
  level: Level;
  value: number;
  limit: number;
  unit: 'm' | 't';
  /** Clave i18n del mensaje y parámetros para interpolar. */
  msg: string;
  params: Record<string, string | number>;
}

export interface Specs {
  layout: Layout;
  largoCajaM: number;
  largoTotalM: number;
  anchoM: number;
  altoTotalM: number;
  largoConjuntoM: number;
  volumenM3: number | null;
  superficieM2: number;
  ejes: number;
  ruedas: number;
  taraKg: number;
  taraLines: TareLine[];
  /** Tope legal del grupo de ejes del semi (t). */
  capacidadEjesSemiT: number;
  /** Peso bruto máximo del conjunto tractor + semi (t). */
  pesoBrutoConjuntoT: number;
  taraTractorKg: number;
  cargaUtilKg: number;
  /** Peso de la caja llena con el producto elegido (solo tolva y batea). */
  cargaLlenaKg: number | null;
  densidadKgM3: number | null;
  plazoDias: number;
  checks: LegalCheck[];
  level: Level;
}

function perMultiplier(por: Per | undefined, c: { ejes: number; ruedas: number }): number {
  if (por === 'eje') return c.ejes;
  if (por === 'rueda') return c.ruedas;
  return 1;
}

const tx = (es: string, pt: string): Tx => ({ es, pt });

export function tareBreakdown(cfg: Config): { lines: TareLine[]; totalKg: number; plazoDias: number } {
  const t = typeDef(cfg.tipo);
  const c = counts(cfg);
  const lines: TareLine[] = [];
  let plazoExtra = 0;

  const estructura = t.tara.baseKg + (Number(cfg.sel.largo) - t.tara.largoRef) * t.tara.kgPorMetroLargo + (Number(cfg.sel.alto) - t.tara.altoRef) * t.tara.kgPorMetroAlto;
  lines.push({ key: 'estructura', label: tx('Chasis y caja', 'Chassi e caixa'), kg: Math.round(estructura) });

  for (const g of groupsForType(cfg.tipo)) {
    if (g.tipo === 'rango' || g.paso === 'tecnico' || !isGroupVisible(g, cfg)) continue;
    const value = cfg.sel[g.id];
    if (value === undefined) continue;
    let kg = 0;
    let plazo = 0;
    if (g.tipo === 'seleccion') {
      const opt = g.opciones?.find((o) => o.id === value);
      if (!opt) continue;
      kg = (opt.pesoKg ?? 0) * perMultiplier(opt.por, c);
      plazo = opt.plazoDias ?? 0;
    } else if (g.tipo === 'interruptor') {
      if (value !== true) continue;
      kg = (g.pesoKg ?? 0) * perMultiplier(g.por, c);
      plazo = g.plazoDias ?? 0;
    } else if (g.tipo === 'cantidad') {
      kg = (g.pesoKg ?? 0) * Number(value);
      plazo = Number(value) > 0 ? (g.plazoDias ?? 0) : 0;
    }
    plazoExtra = Math.max(plazoExtra, plazo);
    if (kg !== 0) lines.push({ key: g.id, label: g.name, kg: Math.round(kg) });
  }

  const totalKg = Math.round(lines.reduce((s, l) => s + l.kg, 0) / 10) * 10;
  return { lines, totalKg, plazoDias: t.plazoBaseDias + plazoExtra };
}

/** Tope legal (t) del grupo de ejes del semi según disposición y rodado. */
export function semiAxleCapacityT(axleConfig: string, dual: boolean): number {
  const k = dual ? 'duales' : 'single';
  const g = legal.pesoPorGrupoDeEjesT;
  switch (axleConfig) {
    case 'dos':
      return g.simple[k] * 2;
    case 'tandem':
      return g.tandem[k];
    case 'tridem':
      return g.tridem[k];
    default:
      return g.simple[k] * 3;
  }
}

/** Peso bruto máximo del conjunto (t): suma de grupos con tope general o tope por configuración. */
export function combinationMaxT(tractorId: string, axleConfig: string, dual: boolean): number {
  const tractor = legal.tractores[tractorId] ?? legal.tractores['6x2'];
  const sum = tractor.ejesT.reduce((s, v) => s + v, 0) + semiAxleCapacityT(axleConfig, dual);
  const special = dual ? legal.pesoBrutoCombinacionT.porConfiguracion[`${tractorId}+${axleConfig}`] : undefined;
  if (special !== undefined) return Math.min(sum, special);
  return Math.min(sum, legal.pesoBrutoCombinacionT.general);
}

function levelFor(value: number, limit: number): Level {
  if (value > limit + 1e-6) return 'bad';
  if (value >= limit * legal.umbralAmarillo) return 'warn';
  return 'ok';
}

const worst = (a: Level, b: Level): Level => (a === 'bad' || b === 'bad' ? 'bad' : a === 'warn' || b === 'warn' ? 'warn' : 'ok');

export function computeSpecs(cfg: Config): Specs {
  const layout = computeLayout(cfg);
  const c = counts(cfg);
  const tare = tareBreakdown(cfg);
  const tractorId = String(cfg.sel.tractor ?? '6x2');
  const tractor = legal.tractores[tractorId] ?? legal.tractores['6x2'];
  const capSemi = semiAxleCapacityT(layout.axleConfig, layout.dual);
  const pbt = combinationMaxT(tractorId, layout.axleConfig, layout.dual);
  const cargaUtilKg = Math.max(0, Math.round((pbt * 1000 - tractor.taraKg - tare.totalKg) / 10) * 10);
  const largoConjunto = combinationLength(layout, tractor.largoDelanteDelPernoM);

  const cargaId = cfg.sel.carga !== undefined ? String(cfg.sel.carga) : null;
  const densidad = cargaId && layout.volumeM3 !== null && (cfg.tipo === 'tolva' || cfg.tipo === 'batea') ? (legal.densidadesKgM3[cargaId] ?? null) : null;
  const cargaLlenaKg = densidad !== null && layout.volumeM3 !== null ? Math.round((layout.volumeM3 * densidad) / 10) * 10 : null;

  const d = legal.dimensiones;
  const checks: LegalCheck[] = [];

  const lvAncho = layout.totalWidth > d.anchoMaxM + 1e-6 ? 'bad' : 'ok';
  checks.push({ id: 'ancho', level: lvAncho, value: layout.totalWidth, limit: d.anchoMaxM, unit: 'm', msg: `legal.ancho.${lvAncho}`, params: {} });

  const lvAlto = levelFor(layout.totalHeight, d.altoMaxM);
  checks.push({
    id: 'alto',
    level: lvAlto,
    value: layout.totalHeight,
    limit: d.altoMaxM,
    unit: 'm',
    msg: `legal.alto.${lvAlto}`,
    params: { exceso: Math.round((layout.totalHeight - d.altoMaxM) * 100), margen: Math.round((d.altoMaxM - layout.totalHeight) * 100) },
  });

  const lvLargo = levelFor(largoConjunto, d.largoMaxTractorSemiM);
  checks.push({
    id: 'largo',
    level: lvLargo,
    value: largoConjunto,
    limit: d.largoMaxTractorSemiM,
    unit: 'm',
    msg: `legal.largo.${lvLargo}`,
    params: { tractor: tractorId, exceso: Math.round((largoConjunto - d.largoMaxTractorSemiM) * 100), margen: Math.round((d.largoMaxTractorSemiM - largoConjunto) * 100) },
  });

  // Peso: informativo (el tope depende de la disposición de ejes y del tractor).
  checks.push({
    id: 'peso',
    level: 'ok',
    value: pbt,
    limit: pbt,
    unit: 't',
    msg: 'legal.peso.ok',
    params: { tractor: tractorId, ejes: layout.axleConfig, semi: capSemi },
  });

  if (cargaLlenaKg !== null) {
    const ratio = cargaLlenaKg / Math.max(1, cargaUtilKg);
    const lv: Level = ratio > 1.02 ? 'bad' : ratio > 0.97 ? 'warn' : 'ok';
    checks.push({
      id: 'carga',
      level: lv,
      value: cargaLlenaKg / 1000,
      limit: cargaUtilKg / 1000,
      unit: 't',
      msg: `legal.carga.${lv}`,
      params: {
        producto: cargaId ?? '',
        exceso: Math.round((cargaLlenaKg - cargaUtilKg) / 100) / 10,
        margen: Math.round((cargaUtilKg - cargaLlenaKg) / 100) / 10,
        // Porcentaje de la caja que se puede llenar sin pasarse del peso legal.
        llenado: Math.min(100, Math.round((cargaUtilKg / Math.max(1, cargaLlenaKg)) * 100)),
      },
    });
  }

  const level = checks.reduce<Level>((acc, ch) => worst(acc, ch.level), 'ok');

  return {
    layout,
    largoCajaM: layout.L,
    largoTotalM: layout.totalLength,
    anchoM: layout.totalWidth,
    altoTotalM: layout.totalHeight,
    largoConjuntoM: largoConjunto,
    volumenM3: layout.volumeM3,
    superficieM2: layout.areaM2,
    ejes: c.ejes,
    ruedas: c.ruedas,
    taraKg: tare.totalKg,
    taraLines: tare.lines,
    capacidadEjesSemiT: capSemi,
    pesoBrutoConjuntoT: pbt,
    taraTractorKg: tractor.taraKg,
    cargaUtilKg,
    cargaLlenaKg,
    densidadKgM3: densidad,
    plazoDias: tare.plazoDias,
    checks,
    level,
  };
}
