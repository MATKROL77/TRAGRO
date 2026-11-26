/**
 * Imagen de espera "calzada" con la cámara inicial del visor.
 *
 * Las imágenes de public/loading/ se capturan con la misma cámara con la que arranca
 * el 3D (script tests/e2e/espera.cjs). Mientras la configuración sea la sugerida del
 * tipo, el visor arranca exactamente con ese encuadre (y un zoom equivalente al
 * recorte de la imagen), así el fundido de la imagen al 3D no muestra doble contorno.
 */
import poses from './loadingPoses.json';
import { defaultConfig } from '@/core/rules';
import type { Config } from '@/core/types';

export interface LoadingPose {
  aspect: number;
  position: number[];
  target: number[];
}

type PoseTable = Record<string, Partial<Record<'d' | 'm', LoadingPose>>>;

/** Variante de la imagen según el ancho (misma regla que el CSS de celular). */
export function loadingVariant(): 'd' | 'm' {
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px)').matches ? 'm' : 'd';
}

export function loadingImage(tipo: string): string {
  return `/loading/${tipo}-${loadingVariant()}.jpg`;
}

/** La imagen muestra la configuración sugerida del tipo: solo calza si no se cambió nada. */
export function matchesLoadingImage(cfg: Config, env: string, tractor: boolean): boolean {
  if (env !== 'estudio' || tractor) return false;
  const d = defaultConfig(cfg.tipo);
  return JSON.stringify(cfg.sel) === JSON.stringify(d.sel) && cfg.colores.caja === d.colores.caja && cfg.colores.chasis === d.colores.chasis && !cfg.logo.data && !cfg.texto.valor;
}

export function loadingPose(tipo: string): LoadingPose | null {
  return (poses as PoseTable)[tipo]?.[loadingVariant()] ?? null;
}
