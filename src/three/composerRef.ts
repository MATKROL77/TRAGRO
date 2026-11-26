import type { EffectComposer as ComposerImpl } from 'postprocessing';

/** Referencia al compositor de postprocesado (para capturas en alta resolución). */
export const composerRef: { current: ComposerImpl | null } = { current: null };
