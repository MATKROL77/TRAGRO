/**
 * render-kit: piezas de render reutilizables entre configuradores (sembradoras, muebles,
 * semirremolques…). Ver README.md.
 */
export { SceneWarmup, useWarmup, useWarmupObject, type WarmupTarget, type WarmupStats } from './warmup';
export { QUALITY_PRESETS, LEVELS, lower, higher, quickGuess, detectQuality, fpsBounds, isMobileDevice, type QualityLevel, type QualityPreset, type DetectedGpu } from './quality';
