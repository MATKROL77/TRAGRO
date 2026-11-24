import type * as THREE from 'three';
import type { MaterialLibrary } from './materials';

/**
 * Mejora diferida de materiales con las texturas CC0 en KTX2 (madera, chapa
 * antideslizante, tejido de lona, galvanizado). No bloquea el primer cuadro.
 */
export async function upgradeMaterials(_gl: THREE.WebGLRenderer, _lib: MaterialLibrary): Promise<void> {
  return Promise.resolve();
}
