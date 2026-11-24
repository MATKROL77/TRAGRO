import type * as THREE from 'three';
import { Studio } from './Studio';

/** Precarga de assets de la escena exterior (se completa en la próxima etapa). */
export async function preloadExterior(_gl: THREE.WebGLRenderer): Promise<void> {
  return Promise.resolve();
}

export default function Exterior() {
  return <Studio />;
}
