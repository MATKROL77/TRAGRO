/** Tipos de dominio compartidos por el núcleo, el estado, la UI y el 3D. */

export type Lang = 'es' | 'en' | 'pt' | 'ru';
/** Texto del catálogo. `es` es la fuente; `en` y `ru` se resuelven por diccionario (src/i18n/catalogo.*.json) si no están acá. */
export type Tx = { es: string; pt?: string; en?: string; ru?: string };
export type Units = 'metric' | 'imperial';
export type TypeId = 'tolva' | 'batea' | 'plataforma' | 'furgon';
export type Value = string | number | boolean;
export type Per = 'unidad' | 'eje' | 'rueda';

export type NumCond = { lt?: number; lte?: number; gt?: number; gte?: number };
export type CondValue = Value | Value[] | NumCond;
export type Cond = Record<string, CondValue>;

export interface OptionDef {
  id: string;
  name: Tx;
  desc?: Tx;
  pesoKg?: number;
  por?: Per;
  plazoDias?: number;
  estandar?: boolean;
  tipos?: TypeId[];
  hex?: string;
}

export type GroupKind = 'seleccion' | 'interruptor' | 'cantidad' | 'rango';

export interface GroupDef {
  id: string;
  paso: string;
  tipo: GroupKind;
  name: Tx;
  desc?: Tx;
  ayuda?: Tx;
  tipos?: TypeId[];
  foco?: string;
  presentacion?: 'color';
  opciones?: OptionDef[];
  max?: number;
  pesoKg?: number;
  por?: Per;
  plazoDias?: number;
  unidad?: string;
  visibleSi?: Cond[];
}

export interface TypeDef {
  id: TypeId;
  name: Tx;
  desc: Tx;
  altoLabel: Tx;
  tara: { baseKg: number; largoRef: number; kgPorMetroLargo: number; altoRef: number; kgPorMetroAlto: number };
  plazoBaseDias: number;
  defaults: Record<string, Value>;
  colores: { chasis: string; caja: string };
}

export interface StepDef {
  id: string;
  name: Tx;
}

export interface HotspotDef {
  id: string;
  tipos?: TypeId[];
  cuando?: Cond;
  titulo: Tx;
  texto: Tx;
}

export interface RalColor {
  codigo: string;
  name: Tx;
  hex: string;
}

export type FontId = 'manrope' | 'barlow' | 'slab';

export interface LogoConfig {
  /** Data URL (PNG/SVG) o null si no hay logo. */
  data: string | null;
  /** Tamaño relativo 0.2–1 respecto del alto disponible en el lateral. */
  escala: number;
  /** Posición -1..1 dentro del área útil del lateral. */
  x: number;
  y: number;
  /** También en el frente de la caja. */
  frente: boolean;
}

export interface TextConfig {
  valor: string;
  fuente: FontId;
  escala: number;
  x: number;
  y: number;
  color: 'auto' | 'blanco' | 'negro';
}

/** Configuración completa: objeto plano y serializable. */
export interface Config {
  v: 1;
  tipo: TypeId;
  sel: Record<string, Value>;
  colores: { chasis: string; caja: string };
  logo: LogoConfig;
  texto: TextConfig;
}

export interface Notice {
  id: string;
  text: Tx;
}

/** Elección que no se pudo conservar al cambiar de tipo (para avisar con "Deshacer"). */
export interface AdjustedItem {
  key: string;
  from: Value;
  to: Value;
}

export interface RangeDef {
  min: number;
  max: number;
  paso: number;
}

export interface RequireRule {
  id: string;
  si: Cond;
  entonces: Record<string, Value | { min?: number; max?: number }>;
  aviso: Tx;
  motivo: Tx;
}

export interface UnavailableRule {
  id: string;
  opcion: Record<string, Value>;
  cuando: Cond;
  alternativa: Value;
  aviso: Tx;
  motivo: Tx;
}

export type Level = 'ok' | 'warn' | 'bad';
