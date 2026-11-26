/** Pedidos de la UI al camión de la ruta (sin acoplar la barra del visor con el 3D). */
export type VehicleRequest = 'accion' | 'arrancar';
const listeners = new Set<(r: VehicleRequest) => void>();

export function requestVehicle(r: VehicleRequest): void {
  listeners.forEach((l) => l(r));
}

export function onVehicleRequest(fn: (r: VehicleRequest) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Reloj del vehículo: la captura PNG lo pausa un instante para que la imagen salga nítida. */
export const vehicleClock = { paused: false, /** Solo para pruebas automáticas (render por software lento). */ scale: 1 };
if (typeof window !== 'undefined') (window as unknown as { __vehicleClock: unknown }).__vehicleClock = vehicleClock;

/** Estado del camión para el benchmark y las pruebas (window.__vehicle). */
export const vehicleDebug: { state: string; speedKmh: number; articulation: number; history: string[] } = { state: 'CIRCULANDO', speedKmh: 0, articulation: 0, history: [] };
if (typeof window !== 'undefined') (window as unknown as { __vehicle: unknown }).__vehicle = vehicleDebug;

/** La primera vez que se entra a la ruta el camión ya viene circulando. */
export const routeVisits = { count: 0 };
