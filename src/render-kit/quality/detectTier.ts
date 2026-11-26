/**
 * Nivel de calidad inicial según la GPU (detect-gpu). Las tablas de referencia se
 * sirven desde el propio sitio (/detect-gpu/), sin pedidos a otros dominios.
 */
import type { Tier } from './tiers';

export interface DetectedGpu {
  tier: Tier;
  gpu: string;
  mobile: boolean;
  /** Nivel de detect-gpu (0 = sin WebGL o muy lento, 3 = rápido). */
  raw: number;
  fps?: number;
}

export async function detectTier(benchmarksURL = '/detect-gpu', timeoutMs = 2500): Promise<DetectedGpu> {
  const fallbackMobile = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 900px), (pointer: coarse)').matches;
  const fallback: DetectedGpu = { tier: fallbackMobile ? 'media' : 'alta', gpu: 'desconocida', mobile: fallbackMobile, raw: -1 };
  try {
    const { getGPUTier } = await import('detect-gpu');
    const r = await Promise.race([getGPUTier({ benchmarksURL }), new Promise<null>((res) => window.setTimeout(() => res(null), timeoutMs))]);
    if (!r) return fallback;
    const mobile = !!r.isMobile || fallbackMobile;
    // 3 → alta (en celulares, media: la pantalla chica no lo justifica y la batería sí lo nota); 2 → media; 0-1 → baja.
    const tier: Tier = r.tier >= 3 ? (mobile ? 'media' : 'alta') : r.tier === 2 ? 'media' : 'baja';
    return { tier, gpu: r.gpu ?? 'desconocida', mobile, raw: r.tier, fps: r.fps };
  } catch {
    return fallback;
  }
}
