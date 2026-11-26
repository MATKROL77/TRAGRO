/**
 * Niveles de calidad del render y lo que ajusta cada uno. Si una técnica no llega a
 * los fps objetivo en un nivel, se apaga en ese nivel (no se saca del todo).
 */
export type Tier = 'alta' | 'media' | 'baja';

export const TIERS: Tier[] = ['baja', 'media', 'alta'];

export interface TierSettings {
  /** Resolución máxima (devicePixelRatio). */
  dprMax: number;
  /** Mientras la cámara se mueve la resolución puede bajar a esta fracción (1 = no baja). */
  movingDpr: number;
  /** Lado del mapa de sombras del sol / luz principal. */
  shadowMapSize: number;
  /** Cascadas de sombra en exteriores (CSM). */
  cascades: number;
  /** Postprocesado: alto (AO + SMAA + bloom + viñeta), medio (AO a media resolución + SMAA), bajo (solo FXAA). */
  post: 'alto' | 'medio' | 'bajo';
  /** Densidad de vegetación y objetos de la ruta (0..1). */
  vegetation: number;
  /** Refinado progresivo al quedarse quieto: muestras, sombras suaves (radio de la luz) y profundidad de campo (apertura, solo estudio). */
  refine: { samples: number; lightRadius: number; aperture: number };
}

export const TIER_SETTINGS: Record<Tier, TierSettings> = {
  alta: { dprMax: 2, movingDpr: 1, shadowMapSize: 2048, cascades: 3, post: 'alto', vegetation: 1, refine: { samples: 96, lightRadius: 0.9, aperture: 0.03 } },
  media: { dprMax: 1.5, movingDpr: 0.8, shadowMapSize: 1024, cascades: 2, post: 'medio', vegetation: 0.55, refine: { samples: 48, lightRadius: 0.6, aperture: 0 } },
  baja: { dprMax: 1, movingDpr: 0.75, shadowMapSize: 1024, cascades: 1, post: 'bajo', vegetation: 0.25, refine: { samples: 16, lightRadius: 0, aperture: 0 } },
};

export function tierSettings(t: Tier): TierSettings {
  return TIER_SETTINGS[t];
}

export function stepTier(t: Tier, dir: 1 | -1): Tier {
  const i = TIERS.indexOf(t);
  return TIERS[Math.max(0, Math.min(TIERS.length - 1, i + dir))];
}
