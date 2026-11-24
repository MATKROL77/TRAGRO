/**
 * Unidades de medida de la interfaz: sistema métrico (m · kg) o imperial (ft · lb).
 * Todo el cálculo interno es métrico; acá solo se convierte para mostrar.
 */
import type { Units } from './types';

export const CONV = { mToFt: 3.28084, cmToIn: 0.393701, kgToLb: 2.20462, m3ToFt3: 35.3147, m2ToFt2: 10.7639 };

export type Fmt = (value: number, decimals?: number) => string;

export interface UnitFmt {
  /** Longitud en metros. */
  len: (m: number, decimals?: number) => string;
  /** Longitud corta en centímetros. */
  cm: (cm: number) => string;
  /** Masa en toneladas. */
  ton: (t: number, decimals?: number) => string;
  /** Masa en kilogramos. */
  kg: (kg: number) => string;
  vol: (m3: number) => string;
  area: (m2: number) => string;
}

export function unitFormatters(n: Fmt, units: Units): UnitFmt {
  if (units === 'imperial') {
    return {
      len: (m) => `${n(m * CONV.mToFt, 1)} ft`,
      cm: (cm) => `${n(cm * CONV.cmToIn, 1)} in`,
      ton: (t) => `${n(t * 1000 * CONV.kgToLb, 0)} lb`,
      kg: (kg) => `${n(kg * CONV.kgToLb, 0)} lb`,
      vol: (m3) => `${n(m3 * CONV.m3ToFt3, 0)} ft³`,
      area: (m2) => `${n(m2 * CONV.m2ToFt2, 0)} ft²`,
    };
  }
  return {
    len: (m, d = 2) => `${n(m, d)} m`,
    cm: (cm) => `${n(cm, 0)} cm`,
    ton: (t, d = 1) => `${n(t, d)} t`,
    kg: (kg) => `${n(kg, 0)} kg`,
    vol: (m3) => `${n(m3, 1)} m³`,
    area: (m2) => `${n(m2, 1)} m²`,
  };
}
