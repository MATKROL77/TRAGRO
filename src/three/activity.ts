/**
 * Marca los momentos en que el visor está dibujando de forma continua (el usuario
 * gira la cámara, hay una transición o una animación). La calidad adaptativa solo
 * mide fps en esos tramos: con render a demanda, una pausa no es una caída de fps.
 */
export const activity = { until: 0 };

export function markActive(ms = 350): void {
  activity.until = performance.now() + ms;
}

export function isActive(): boolean {
  return performance.now() < activity.until;
}
