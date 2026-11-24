/**
 * Plantilla mínima de un generador de familia. NO se usa en producción: es la base para copiar.
 * Ver README.md de esta carpeta.
 */
import * as THREE from 'three';
import type { Configuration } from '../../domain/types';
import type { MaterialSet } from '../../three/materials';
import type { MachineFamily, MachineModel } from '../registry';

export class TemplateModel implements MachineModel {
  root = new THREE.Group();
  anchors: Record<string, THREE.Object3D> = {};
  state = { poseT: 0, distance: 0 };
  private geoms: THREE.BufferGeometry[] = [];

  constructor(cfg: Configuration, mats: MaterialSet) {
    // Geometría paramétrica a escala real (1 unidad = 1 m), +Z = adelante.
    const g = new THREE.BoxGeometry(Math.max(1, cfg.rows * 0.5), 0.2, 0.2);
    this.geoms.push(g);
    const bar = new THREE.Mesh(g, mats.paintMain);
    bar.position.y = 0.8;
    bar.castShadow = true;
    this.root.add(bar);
    const hitch = new THREE.Object3D();
    hitch.position.set(0, 0.55, 3);
    this.root.add(hitch);
    this.anchors.hitch = hitch;
  }
  update(dt: number, poseTarget: number, distance: number): boolean {
    this.state.distance = distance;
    const before = this.state.poseT;
    this.state.poseT += Math.sign(poseTarget - before) * Math.min(Math.abs(poseTarget - before), dt / 7);
    if (before !== this.state.poseT) this.applyPose(this.state.poseT);
    return before !== this.state.poseT;
  }
  applyPose(t: number) {
    this.state.poseT = t;
  }
  setDecal() {}
  getHitch(target: THREE.Vector3) {
    return this.anchors.hitch.getWorldPosition(target);
  }
  dispose() {
    this.root.removeFromParent();
    this.geoms.forEach((g) => g.dispose());
  }
}

export const templateFamily: MachineFamily = {
  id: 'template',
  signature: (cfg) => JSON.stringify([cfg.model, cfg.rows]),
  create: (cfg, mats) => new TemplateModel(cfg, mats),
  transportDims: (cfg) => ({ width: cfg.rows * 0.5, height: 1.5, length: 5 }),
};
