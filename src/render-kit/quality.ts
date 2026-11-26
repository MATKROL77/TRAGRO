/**
 * Calidad adaptativa (render-kit).
 *
 * Tres niveles con presupuestos explícitos. El nivel inicial sale de la GPU detectada (detect-gpu, con
 * los benchmarks servidos desde el mismo sitio) y después se ajusta solo con PerformanceMonitor.
 * Regla: si una técnica no entra en el presupuesto de un nivel, se desactiva en ese nivel (no se saca).
 */
export type QualityLevel = 'high' | 'medium' | 'low';

export interface QualityPreset {
  /** DPR máximo (AdaptiveDpr puede bajarlo más si hace falta) */
  dpr: number;
  /** resolución del mapa de sombras de la luz principal */
  shadowMapSize: number;
  /** oclusión ambiental en pantalla */
  ao: 'full' | 'half' | 'off';
  /** bloom sutil (sólo reflejos fuertes) */
  bloom: boolean;
  /** antialiasing de post-procesado */
  aa: 'smaa' | 'fxaa';
  /** densidad relativa de rastrojo/partículas (0–1) */
  detailDensity: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  high: { dpr: 2, shadowMapSize: 4096, ao: 'full', bloom: true, aa: 'smaa', detailDensity: 1 },
  medium: { dpr: 1.5, shadowMapSize: 2048, ao: 'half', bloom: false, aa: 'smaa', detailDensity: 0.5 },
  low: { dpr: 1, shadowMapSize: 1024, ao: 'off', bloom: false, aa: 'fxaa', detailDensity: 0.2 },
};

export const LEVELS: QualityLevel[] = ['low', 'medium', 'high'];
export const lower = (q: QualityLevel): QualityLevel => LEVELS[Math.max(0, LEVELS.indexOf(q) - 1)];
export const higher = (q: QualityLevel, max: QualityLevel = 'high'): QualityLevel => LEVELS[Math.min(LEVELS.indexOf(max), LEVELS.indexOf(q) + 1)];

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
}

/** Estimación inmediata (sin red), para el primer cuadro: celular → medio, escritorio → alto. */
export function quickGuess(): QualityLevel {
  return isMobileDevice() ? 'medium' : 'high';
}

export interface DetectedGpu { level: QualityLevel; max: QualityLevel; tier: number; gpu: string; mobile: boolean }

/**
 * Detección de la GPU con detect-gpu (import dinámico: no entra en el bundle principal).
 * tier 0–1 → bajo · tier 2 → medio · tier 3 → alto. En celulares el máximo es medio.
 */
export async function detectQuality(benchmarksURL: string): Promise<DetectedGpu> {
  const mobile = isMobileDevice();
  try {
    const { getGPUTier } = await import('detect-gpu');
    const r = await getGPUTier({ benchmarksURL });
    const tier = r.tier ?? 2;
    let level: QualityLevel = tier >= 3 ? 'high' : tier === 2 ? 'medium' : 'low';
    const max: QualityLevel = mobile || r.isMobile ? 'medium' : 'high';
    if (LEVELS.indexOf(level) > LEVELS.indexOf(max)) level = max;
    return { level, max, tier, gpu: r.gpu ?? 'desconocida', mobile: mobile || !!r.isMobile };
  } catch {
    const level = quickGuess();
    return { level, max: mobile ? 'medium' : 'high', tier: -1, gpu: 'desconocida', mobile };
  }
}

/** Objetivo de fps por tipo de equipo (60 en escritorio, 30 en celular) y límites para bajar/subir de nivel. */
export function fpsBounds(mobile: boolean): (refreshRate: number) => [number, number] {
  return mobile ? () => [27, 50] : (r) => (r > 90 ? [55, 90] : [52, 59]);
}
