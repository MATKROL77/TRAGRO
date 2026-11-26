/**
 * Registro de familias de máquinas.
 * Para sumar una familia (pulverizadora de arrastre, tolva autodescargable...) alcanza con:
 *   1. un catálogo JSON propio (mismo formato que src/config/catalog.json, con "family": "<id>"),
 *   2. un generador que implemente `MachineFamily` (ver src/machines/_template/),
 *   3. registrarlo acá.
 * El motor de reglas, precios, i18n, URL, PDF y la UI de pasos son genéricos (dirigidos por el catálogo).
 */
import type * as THREE from 'three';
import type { Configuration } from '../domain/types';
import type { MaterialSet } from '../three/materials';
import { SeederModel, geometricSignature as seederSignature } from './seeder/SeederModel';
import { computeLayout as seederLayout } from './seeder/layout';

export interface MachineModel {
  root: THREE.Group;
  anchors: Record<string, THREE.Object3D>;
  state: { poseT: number; distance: number };
  update(dt: number, poseTarget: number, distance: number, poseSpeed?: number): boolean;
  applyPose(t: number, force?: boolean): void;
  setDecal(tex: THREE.Texture | null): void;
  getHitch(target: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

export interface MachineFamily {
  id: string;
  /** Firma de los parámetros geométricos: sólo si cambia se reconstruye el modelo. */
  signature(cfg: Configuration): string;
  /** Crea el modelo 3D (prev permite transiciones suaves desde el modelo anterior). */
  create(cfg: Configuration, mats: MaterialSet, prev: MachineModel | null): MachineModel;
  /**
   * Opcional: construcción por pasos (generador). El visor la consume con un presupuesto de pocos ms por
   * cuadro y mantiene el modelo anterior en pantalla hasta que el nuevo está listo (cero tirones).
   */
  createSteps?(cfg: Configuration, mats: MaterialSet, prev: MachineModel | null): { model: MachineModel; steps: Iterator<void> };
  /** Cotas de transporte calculadas desde la misma geometría que se dibuja. */
  transportDims(cfg: Configuration): { width: number; height: number; length: number };
}

export const seederFamily: MachineFamily = {
  id: 'seeder',
  signature: seederSignature,
  create: (cfg, mats, prev) => new SeederModel(cfg, mats, prev as SeederModel | null),
  createSteps: (cfg, mats, prev) => {
    const model = new SeederModel(cfg, mats, prev as SeederModel | null, true);
    return { model, steps: model.buildSteps() };
  },
  transportDims: (cfg) => seederLayout(cfg).transportDims,
};

const families: Record<string, MachineFamily> = { seeder: seederFamily };

export function getFamily(id: string): MachineFamily {
  return families[id] ?? seederFamily;
}

export function registerFamily(f: MachineFamily) {
  families[f.id] = f;
}
