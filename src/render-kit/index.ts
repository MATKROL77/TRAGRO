/**
 * render-kit: piezas de render reutilizables entre configuradores (sembradoras, muebles,
 * semirremolques…). Ver README.md.
 */
export { SceneWarmup, useWarmup, useWarmupObject, type WarmupTarget, type WarmupStats } from './warmup';
export { QUALITY_PRESETS, LEVELS, lower, higher, quickGuess, detectQuality, fpsBounds, isMobileDevice, type QualityLevel, type QualityPreset, type DetectedGpu } from './quality';
export { useExposure, sunPosition, ModelContactShadows, SharedEnvironment, SKY_SUN_DIR, SKY_SUN_DIR_TEX, SKY_ROT_Y, SKY_HORIZON } from './lighting';
export { ProgressiveRefine, refineState } from './refine';
export { initTextures, loadTexture, getKTX2Loader, type TexOpts } from './textures';
export { ProgressiveModel } from './ProgressiveModel';
