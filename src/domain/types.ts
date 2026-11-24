export type Lang = 'es-AR' | 'en' | 'pt-BR' | 'ru';
export type UnitSystem = 'metric' | 'imperial';
export type Tier = 'compact' | 'medium' | 'large' | 'xl';

/** Configuración serializable (objeto plano). Es lo que viaja en el link compartible. */
export interface Configuration {
  family: string;
  model: string;
  rows: number;
  spacingCm: number;
  selections: Record<string, string>;
  colors: { main: string; accent: string; mainRal: string; accentRal: string };
  text: string;
}

export interface ModelDef {
  id: string;
  tier: Tier;
  rowsMin: number;
  rowsMax: number;
  defaultRows: number;
  defaultSpacingCm: number;
  maxWidthM: number;
  baseWeightKg: number;
  weightPerRowKg: number;
  leadTimeDays: number;
}

export interface OptionDef {
  id: string;
  standard: boolean;
  weightKg: number;
  weightPerRowKg?: number;
  leadTimeDays?: number;
  attrs?: Record<string, number>;
}

export interface Condition {
  tier?: string[];
  model?: string[];
  widthGt?: number;
  widthLte?: number;
  rowsGt?: number;
  sel?: Record<string, string[]>;
}

export interface GroupDef {
  id: string;
  type: 'single' | 'toggle';
  default: string;
  geometric: boolean;
  focus?: string;
  visibleIf?: Condition;
  options: OptionDef[];
}

export interface StepDef {
  id: string;
  groups: string[];
  focus?: string;
}

export interface CatalogDef {
  family: string;
  spacingsCm: number[];
  models: ModelDef[];
  steps: StepDef[];
  groups: GroupDef[];
  defaultConfig: Omit<Configuration, 'family'>;
}

export interface RuleDef {
  id: string;
  if: Condition;
  then: { group: string; allowed: string[] };
  revert?: { group: string; to: string };
}

export interface Notice {
  ruleId: string;
  group: string;
  from: string;
  to: string;
}

export type OptionStatus =
  | { state: 'ok' }
  | { state: 'disabled'; ruleIds: string[] }
  | { state: 'adjusts'; notices: Notice[] };
