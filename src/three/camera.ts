/**
 * Encuadres de cámara: presets y focos calculados a partir del layout, de modo
 * que funcionen con cualquier largo, alto y relación de aspecto del visor.
 */
import * as THREE from 'three';
import type { TrailerModel } from './model';

export interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export const PRESETS = ['tresCuartos', 'lateral', 'trasero', 'superior', 'ejes', 'cuello', 'interior'] as const;
export type PresetId = (typeof PRESETS)[number];

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Distancia mínima para que la caja entre completa mirando desde `dir`. */
function fitDistance(dir: THREE.Vector3, target: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3, tanH: number, tanV: number): number {
  const fwd = dir.clone().normalize();
  _right.crossVectors(UP, fwd).normalize();
  if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
  _up.crossVectors(fwd, _right).normalize();
  let dist = 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).sub(target);
    const x = Math.abs(v.dot(_right));
    const y = Math.abs(v.dot(_up));
    const z = v.dot(fwd);
    dist = Math.max(dist, z + x / tanH, z + y / tanV);
  }
  return dist;
}

export interface Framing {
  /** Relación de aspecto del área visible (ancho / alto). */
  aspect: number;
  /** FOV vertical en grados. */
  fov: number;
  /** Margen: 1 = justo, <1 deja aire. */
  margin?: number;
  /** Con tractor enganchado el conjunto es más largo hacia adelante. */
  tractor?: boolean;
  /** Desplazamiento vertical del encuadre (fracción de media pantalla). */
  shift?: number;
}

export function poseFor(id: string, model: TrailerModel, f: Framing): Pose {
  const L = model.layout;
  const margin = f.margin ?? 0.84;
  const tanV = Math.tan(THREE.MathUtils.degToRad(f.fov / 2)) * margin;
  const tanH = tanV * f.aspect;
  const frontX = L.frontX + L.frontExtra + (f.tractor ? 4.6 : 0);
  const min = new THREE.Vector3(L.rearX - 0.1, 0, -L.W / 2);
  const max = new THREE.Vector3(frontX, Math.max(L.totalHeight, f.tractor ? 3.6 : 0), L.W / 2);
  const center = new THREE.Vector3((min.x + max.x) / 2, max.y * 0.46, 0);
  const fit = (dir: THREE.Vector3, target = center): Pose => {
    const d = fitDistance(dir, target, min, max, tanH, tanV);
    // La barra de herramientas tapa la franja superior: el equipo se encuadra un poco más abajo.
    const lift = d * Math.tan(THREE.MathUtils.degToRad(f.fov / 2)) * (f.shift ?? 0.09);
    const t = target.clone();
    t.y += lift;
    const p = target.clone().addScaledVector(dir.clone().normalize(), d);
    p.y += lift;
    return { position: p, target: t };
  };
  const anchor = (key: string, fallback: [number, number, number]) => new THREE.Vector3(...(model.anchors[key] ?? fallback));
  const close = (target: THREE.Vector3, dir: THREE.Vector3, dist: number): Pose => {
    // En pantallas angostas hay que alejarse un poco para ver lo mismo.
    const k = f.aspect < 1 ? 1 + (1 - f.aspect) * 0.9 : 1;
    const p = target.clone().addScaledVector(dir.clone().normalize(), dist * k);
    p.y = Math.max(0.28, p.y);
    return { position: p, target };
  };

  switch (id) {
    case 'lateral':
      return fit(new THREE.Vector3(0.0, 0.07, 1));
    case 'trasero':
    case 'trasera':
      return fit(new THREE.Vector3(-0.82, 0.2, 0.54));
    case 'superior':
      return fit(new THREE.Vector3(0.04, 1, 0.42));
    case 'ejes': {
      const span = Math.abs(L.axles[0].x - L.axles[L.axles.length - 1].x);
      return close(anchor('ejes', [0, 0.6, 1.3]).setY(0.7), new THREE.Vector3(0.28, 0.16, 1), 3.4 + span * 0.75);
    }
    case 'ruedas':
      return close(anchor('ruedas', [0, 0.52, 1.3]), new THREE.Vector3(0.45, 0.14, 1), 3.3);
    case 'suspension':
      return close(anchor('suspension', [0, 0.7, 0.8]), new THREE.Vector3(-0.55, -0.02, 1), 2.6);
    case 'cuello':
    case 'pernoRey':
      return close(anchor('pernoRey', [L.kingpinX, 1.2, 0]), new THREE.Vector3(0.85, -0.2, 0.8), 3.6);
    case 'chasis':
      return close(anchor('chasis', [0, 1, 0.6]), new THREE.Vector3(0.3, -0.05, 1), 3.4);
    case 'bocas':
    case 'compuertas':
      return close(anchor('compuertas', [0, 0.6, 1.2]), new THREE.Vector3(0.2, 0.05, 1), 3.6);
    case 'piston':
      return close(anchor('piston', [L.frontX, 2, 0]), new THREE.Vector3(1, 0.12, 0.75), 5.2);
    case 'porton':
    case 'puertas':
      return close(anchor(id, [L.rearX, 2, 0]), new THREE.Vector3(-1, 0.14, 0.62), 6.2);
    case 'barandas':
      return close(anchor('barandas', [0, 1.8, 1.3]), new THREE.Vector3(0.3, 0.3, 1), 6);
    case 'reflectivos':
      return close(anchor('reflectivos', [0, 1.4, 1.3]), new THREE.Vector3(-0.35, 0.08, 1), 3.2);
    case 'lona':
      return fit(new THREE.Vector3(0.5, 0.75, 0.75));
    case 'interior': {
      if (L.tipo === 'furgon') {
        const y = L.floorY + Math.min(1.6, L.H * 0.62);
        return { position: new THREE.Vector3(L.rearX + 0.9, y, 0.25), target: new THREE.Vector3(L.frontX - 2, y - 0.25, 0) };
      }
      return fit(new THREE.Vector3(0.38, 0.9, 0.5), new THREE.Vector3(0, L.floorY + 0.3, 0));
    }
    case 'tresCuartos':
    default:
      return fit(new THREE.Vector3(0.68, 0.23, 0.7));
  }
}
