/**
 * Carga visible en "Ver en acción", según la escena:
 *  - Estudio: grano de la tolva con montículos en el piso (como siempre).
 *  - Exterior (predio de acopio): el grano cae a la rejilla de descarga (sin montículos)
 *    y la batea descarga su material, que se desliza y forma una pila detrás.
 *  - Ruta: el equipo va vacío, no se derrama nada.
 */
export const cargoFx = { grain: true, grainPiles: true, bateaLoad: false };

export type CargoScene = 'estudio' | 'exterior' | 'ruta';

export function setCargoScene(env: CargoScene): void {
  cargoFx.grain = env !== 'ruta';
  cargoFx.grainPiles = env === 'estudio';
  cargoFx.bateaLoad = env === 'exterior';
}

/** Color del producto elegido en Datos técnicos (lineal sRGB a través de THREE.Color). */
export const CARGO_COLOR: Record<string, string> = {
  soja: '#c9a55a',
  maiz: '#e2a12c',
  trigo: '#c08a45',
  girasol: '#3a3633',
  arena: '#cdb38a',
  piedra: '#8e8b86',
};
