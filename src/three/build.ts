/** Contexto compartido por los generadores del modelo. */
import type * as THREE from 'three';
import type { Layout } from '@/core/layout';
import type { Value } from '@/core/types';
import type { Assembly } from './kit/asm';
import type { MaterialSet } from './materials';
import type { ChassisInfo } from './parts/chassis';

/** Valores de animación ya amortiguados (0..1 salvo `susp`, -1..1). */
export interface AnimState {
  accion: number;
  lona: number;
  susp: number;
  elevado: number;
  patas: number;
  time: number;
  dt: number;
}

export type Updater = (a: AnimState, nodes: Record<string, THREE.Group>) => void;

/** Reserva de lugar para accesorios colgados del lateral del chasis. */
export interface Slot {
  side: 1 | -1;
  x0: number;
  x1: number;
}

export interface BuildCtx {
  asm: Assembly;
  L: Layout;
  sel: Record<string, Value>;
  mats: MaterialSet;
  chassis: ChassisInfo;
  updaters: Updater[];
  disposers: (() => void)[];
  /** Puntos de interés (hotspots, foco de cámara) en coordenadas del semi en reposo. */
  anchors: Record<string, [number, number, number]>;
  /** Área útil para logo y texto: lateral [cx, cy, ancho, alto] y frente [cz, cy, ancho, alto]. */
  livery: { side: [number, number, number, number]; front: [number, number, number, number] | null };
  slots: Slot[];
  /** Ruedas de auxilio a instanciar. */
  spares: { x: number; y: number; z: number; euler: [number, number, number] }[];
  /** Cara lateral donde va la cinta reflectiva. */
  marking: { y: number; z: number; x0: number; x1: number; node?: string };
  /** Hay partículas de grano que emitir desde estas bocas. */
  grain: { x: number; y: number; z: number }[];
}

export const ease = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Progreso local de un tramo [a, b] de una animación maestra 0..1, suavizado. */
export const stage = (p: number, a: number, b: number): number => ease((p - a) / (b - a));
