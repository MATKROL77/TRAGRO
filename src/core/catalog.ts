/**
 * Acceso tipado a los archivos JSON de configuración.
 * Todo lo que el fabricante puede editar sin tocar código vive en src/config/*.json.
 */
import catalogJson from '@/config/catalog.json';
import pricingJson from '@/config/pricing.json';
import rulesJson from '@/config/rules.json';
import legalJson from '@/config/legal.json';
import brandJson from '@/config/brand.json';
import coloresJson from '@/config/colores.json';
import type {
  Cond,
  GroupDef,
  HotspotDef,
  Lang,
  Per,
  RalColor,
  RangeDef,
  RequireRule,
  StepDef,
  Tx,
  TypeDef,
  TypeId,
  UnavailableRule,
  Value,
} from './types';

export const TYPE_IDS: TypeId[] = ['tolva', 'batea', 'plataforma', 'furgon'];

export const steps = catalogJson.pasos as StepDef[];
export const types = catalogJson.tipos as unknown as TypeDef[];
export const groups = catalogJson.grupos as unknown as GroupDef[];
export const hotspotDefs = catalogJson.hotspots as unknown as HotspotDef[];
export const ralColors = coloresJson.colores as RalColor[];

export interface PricingFile {
  moneda: string;
  tipoDeCambio: { arsPorUsd: number; fecha: string; fuente: string };
  tipos: Record<TypeId, { base: number; largoRef: number; usdPorMetroLargo: number; altoRef: number; usdPorMetroAlto: number }>;
  opciones: Record<string, number | { usd: number; por?: Per } | Record<string, number | { usd: number; por?: Per }>>;
  personalizacion: { colorCajaNoEstandar: number; logo: number; texto: number };
}
export const pricing = pricingJson as unknown as PricingFile;

export interface RulesFile {
  dimensiones: Record<TypeId, { largo: RangeDef; alto: RangeDef }>;
  requiere: RequireRule[];
  noDisponible: UnavailableRule[];
}
export const rules = rulesJson as unknown as RulesFile;

export interface LegalFile {
  _aviso: string;
  dimensiones: { anchoMaxM: number; altoMaxM: number; largoMaxTractorSemiM: number; largoMaxCombinacionM: number };
  umbralAmarillo: number;
  pesoPorGrupoDeEjesT: Record<'simple' | 'tandem' | 'tridem', { duales: number; single: number }>;
  pesoBrutoCombinacionT: { general: number; porConfiguracion: Record<string, number> };
  tractores: Record<string, { taraKg: number; ejesT: number[]; largoDelanteDelPernoM: number }>;
  densidadesKgM3: Record<string, number>;
}
export const legal = legalJson as unknown as LegalFile;

export interface BrandFile {
  nombre: string;
  nombreCorto: string;
  lema: Tx;
  logo: string;
  logoClaro: string;
  colores: Record<string, string>;
  contacto: { whatsapp: string; telefono: string; email: string; direccion: string; web: string };
  pdf: { pie: string; validezDias: number };
  idiomaPorDefecto: Lang;
  monedaPorDefecto: 'USD' | 'ARS';
}
export const brand = brandJson as unknown as BrandFile;

const typeIndex = new Map(types.map((t) => [t.id, t]));
const groupIndex = new Map(groups.map((g) => [g.id, g]));
const ralIndex = new Map(ralColors.map((c) => [c.codigo, c]));

export function typeDef(id: TypeId): TypeDef {
  const t = typeIndex.get(id);
  if (!t) throw new Error(`Tipo desconocido: ${id}`);
  return t;
}

export function isTypeId(v: unknown): v is TypeId {
  return typeof v === 'string' && typeIndex.has(v as TypeId);
}

export function groupDef(id: string): GroupDef | undefined {
  return groupIndex.get(id);
}

/** Grupos que aplican a un tipo de semirremolque (existan o no visibles en este momento). */
export function groupsForType(tipo: TypeId): GroupDef[] {
  return groups.filter((g) => !g.tipos || g.tipos.includes(tipo));
}

export function optionsFor(g: GroupDef, tipo: TypeId) {
  return (g.opciones ?? []).filter((o) => !o.tipos || o.tipos.includes(tipo));
}

export function rangeFor(tipo: TypeId, key: string): RangeDef | undefined {
  const d = rules.dimensiones[tipo] as Record<string, RangeDef> | undefined;
  return d?.[key];
}

export function ral(codigo: string): RalColor {
  return ralIndex.get(codigo) ?? { codigo, name: { es: codigo, pt: codigo }, hex: '#888888' };
}

export function isRal(codigo: unknown): codigo is string {
  return typeof codigo === 'string' && ralIndex.has(codigo);
}

/** Evalúa una condición declarativa contra un contexto plano { tipo, ...selecciones }. */
export function matches(cond: Cond | undefined, ctx: Record<string, Value>): boolean {
  if (!cond) return true;
  for (const [key, expected] of Object.entries(cond)) {
    const actual = ctx[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual as Value)) return false;
    } else if (typeof expected === 'object' && expected !== null) {
      if (typeof actual !== 'number') return false;
      if (expected.lt !== undefined && !(actual < expected.lt)) return false;
      if (expected.lte !== undefined && !(actual <= expected.lte)) return false;
      if (expected.gt !== undefined && !(actual > expected.gt)) return false;
      if (expected.gte !== undefined && !(actual >= expected.gte)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}
