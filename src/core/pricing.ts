/**
 * Cálculo de precio: base por tipo + deltas de cada opción (USD, sin IVA).
 * Todos los valores salen de src/config/pricing.json (valores de DEMO).
 */
import { groupsForType, pricing, rangeFor, typeDef } from './catalog';
import { changeType, counts, defaultConfig, isGroupVisible } from './rules';
import type { Config, GroupDef, Per, Tx, TypeId, Value } from './types';

export interface PriceLine {
  key: string;
  /** Nombre del grupo (o concepto). */
  label: Tx;
  /** Elección concreta (nombre de la opción, cantidad, medida). */
  detail: Tx;
  usd: number;
  /** true si es la opción estándar incluida en el precio base. */
  estandar: boolean;
  paso: string;
}

export interface PriceBreakdown {
  lines: PriceLine[];
  baseUsd: number;
  totalUsd: number;
  totalArs: number;
  arsPorUsd: number;
}

type PriceEntry = number | { usd: number; por?: Per };

function multiplier(por: Per | undefined, cfg: Config): number {
  const c = counts(cfg);
  if (por === 'eje') return c.ejes;
  if (por === 'rueda') return c.ruedas;
  return 1;
}

function entryUsd(entry: PriceEntry | undefined, cfg: Config): number {
  if (entry === undefined) return 0;
  if (typeof entry === 'number') return entry;
  return entry.usd * multiplier(entry.por, cfg);
}

/** Precio (USD) de un valor concreto de un grupo, con la configuración dada. */
export function optionPriceUsd(cfg: Config, g: GroupDef, value: Value): number {
  const raw = pricing.opciones[g.id];
  if (raw === undefined) return 0;
  if (g.tipo === 'seleccion') {
    if (typeof raw !== 'object' || raw === null || 'usd' in raw) return 0;
    return entryUsd((raw as Record<string, PriceEntry>)[String(value)], cfg);
  }
  const unit = entryUsd(raw as PriceEntry, cfg);
  if (g.tipo === 'interruptor') return value === true ? unit : 0;
  if (g.tipo === 'cantidad') return unit * Number(value);
  return 0;
}

const tx = (es: string, pt: string): Tx => ({ es, pt });
const m = (n: number) => n.toFixed(2).replace('.', ',');

export function priceBreakdown(cfg: Config): PriceBreakdown {
  const t = typeDef(cfg.tipo);
  const p = pricing.tipos[cfg.tipo];
  const lines: PriceLine[] = [];

  lines.push({ key: 'base', label: tx('Equipo base', 'Equipamento base'), detail: t.name, usd: p.base, estandar: true, paso: 'tipo' });

  const largo = Number(cfg.sel.largo);
  const alto = Number(cfg.sel.alto);
  const dLargo = Math.round((largo - p.largoRef) * p.usdPorMetroLargo);
  const dAlto = Math.round((alto - p.altoRef) * p.usdPorMetroAlto);
  lines.push({
    key: 'largo',
    label: tx('Largo de caja', 'Comprimento da caixa'),
    detail: tx(`${m(largo)} m`, `${m(largo)} m`),
    usd: dLargo,
    estandar: dLargo === 0,
    paso: 'dimensiones',
  });
  lines.push({ key: 'alto', label: t.altoLabel, detail: tx(`${m(alto)} m`, `${m(alto)} m`), usd: dAlto, estandar: dAlto === 0, paso: 'dimensiones' });

  for (const g of groupsForType(cfg.tipo)) {
    if (g.tipo === 'rango' || g.paso === 'tecnico' || !isGroupVisible(g, cfg)) continue;
    const value = cfg.sel[g.id];
    if (value === undefined) continue;
    const usd = Math.round(optionPriceUsd(cfg, g, value));
    if (g.tipo === 'seleccion') {
      const opt = g.opciones?.find((o) => o.id === value);
      if (!opt) continue;
      lines.push({ key: g.id, label: g.name, detail: opt.name, usd, estandar: opt.estandar === true && usd === 0, paso: g.paso });
    } else if (g.tipo === 'interruptor') {
      if (value !== true) continue;
      lines.push({ key: g.id, label: g.name, detail: tx('Incluido', 'Incluído'), usd, estandar: false, paso: g.paso });
    } else if (g.tipo === 'cantidad') {
      if (Number(value) <= 0) continue;
      lines.push({ key: g.id, label: g.name, detail: tx(`${value} u.`, `${value} un.`), usd, estandar: false, paso: g.paso });
    }
  }

  if (cfg.logo.data) {
    lines.push({
      key: 'logo',
      label: tx('Logo de flota aplicado', 'Logo da frota aplicado'),
      detail: tx(cfg.logo.frente ? 'Laterales y frente' : 'Laterales', cfg.logo.frente ? 'Laterais e frente' : 'Laterais'),
      usd: pricing.personalizacion.logo,
      estandar: false,
      paso: 'personalizacion',
    });
  }
  if (cfg.texto.valor.trim()) {
    lines.push({
      key: 'texto',
      label: tx('Rotulado con texto', 'Letreiro com texto'),
      detail: tx(cfg.texto.valor.trim(), cfg.texto.valor.trim()),
      usd: pricing.personalizacion.texto,
      estandar: false,
      paso: 'personalizacion',
    });
  }

  const totalUsd = lines.reduce((s, l) => s + l.usd, 0);
  const arsPorUsd = pricing.tipoDeCambio.arsPorUsd;
  return { lines, baseUsd: p.base, totalUsd, totalArs: Math.round(totalUsd * arsPorUsd), arsPorUsd };
}

/** Diferencia de precio de elegir `value` respecto de la elección actual (para mostrar +/− en la UI). */
export function deltaVsCurrent(cfg: Config, g: GroupDef, value: Value): number {
  const cur = cfg.sel[g.id];
  if (cur === undefined) return 0;
  return Math.round(optionPriceUsd(cfg, g, value) - optionPriceUsd(cfg, g, cur));
}

export function rangeHasPrice(cfg: Config, key: 'largo' | 'alto'): number {
  const p = pricing.tipos[cfg.tipo];
  const r = rangeFor(cfg.tipo, key);
  if (!r) return 0;
  return key === 'largo' ? p.usdPorMetroLargo : p.usdPorMetroAlto;
}

/** Precio con el que arranca cada tipo: el "desde" de las tarjetas coincide con lo que se ve al entrar. */
export function startingPriceUsd(tipo: TypeId): number {
  return priceBreakdown(defaultConfig(tipo)).totalUsd;
}

/** Precio exacto que se va a ver al pasar a ese tipo con lo que ya está elegido (medidas, ejes, rodado, colores…). */
export function priceIfType(cfg: Config, tipo: TypeId): number {
  return priceBreakdown(tipo === cfg.tipo ? cfg : changeType(cfg, tipo).config).totalUsd;
}
