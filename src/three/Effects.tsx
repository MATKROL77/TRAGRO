import { EffectComposer, N8AO, Bloom, ToneMapping, SMAA, FXAA, HueSaturation, BrightnessContrast, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode, type EffectComposer as ComposerImpl } from 'postprocessing';
import { useEffect, useRef } from 'react';
import { useStore } from '@/state/store';
import { Exposure, type ExposureEffect } from '@/render-kit/post/Exposure';
import { tierSettings } from '@/render-kit/quality/tiers';
import { composerRef } from './composerRef';
import { FrameCrossfade, frameCrossfade } from '@/render-kit/transition/FrameCrossfade';
import { ProgressiveRefine, refineControl } from '@/render-kit/refine/ProgressiveRefine';
import { isActive } from './activity';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { useThree } from '@react-three/fiber';

/**
 * Postprocesado de fotografía de producto, por nivel de calidad:
 *  - alto: oclusión ambiental (N8AO) + SMAA + bloom muy sutil (solo luces encendidas y
 *    brillos fuertes) + viñeta leve;
 *  - medio: N8AO a media resolución + SMAA;
 *  - bajo: solo FXAA.
 * En todos: tone mapping AgX con una corrección leve de contraste y saturación (AgX solo
 * lava los colores RAL). Los parámetros no cambian con la escena: si cambiaran, el AO se
 * recrearía y compilaría sus shaders justo al cambiar de escena (un tirón).
 */
/** Exposición calibrada por escena (se aplica por uniform: no recompila nada). */
export const SCENE_EXPOSURE: Record<string, number> = { estudio: 1, exterior: 1.02, ruta: 1.02 };

export default function Effects() {
  const calidad = useStore((s) => s.ui.calidad);
  const post = tierSettings(calidad).post;
  const exposure = useRef<ExposureEffect>(null);
  const env = useStore((s) => s.ui.env);
  useEffect(() => {
    if (exposure.current) exposure.current.exposure = SCENE_EXPOSURE[env] ?? 1;
  }, [env]);
  // Cualquier cambio de estado (configuración, colores, escena, modelo nuevo) corta el refinado.
  useEffect(() => useStore.subscribe(() => refineControl.poke()), []);
  // Refinado al quedarse quieto: en la ruta, solo con el camión detenido; profundidad de campo solo en el estudio.
  const refine = tierSettings(calidad).refine;
  const vehiculo = useStore((s) => s.ui.vehiculo);
  const modal = useStore((s) => !!s.ui.modal);
  const stopped = env !== 'ruta' || vehiculo === 'DETENIDO' || vehiculo === 'ABIERTO';
  const controls = useThree((s) => s.controls) as unknown as OrbitImpl | null;
  const settings = { ...refine, aperture: env === 'estudio' ? refine.aperture : 0 };
  return (
    <>
      <FrameCrossfade />
      <ProgressiveRefine enabled={stopped && !modal} settings={settings} isBusy={() => isActive() || frameCrossfade.active || !!useStore.getState().ui.cargandoEntorno} focus={() => controls?.target ?? null} />
      <EffectComposer
        ref={(c) => {
          composerRef.current = c as ComposerImpl | null;
        }}
        multisampling={0}
        enableNormalPass={false}
      >
        {post === 'bajo' ? <></> : <N8AO aoRadius={0.55} intensity={1.9} distanceFalloff={0.8} quality={post === 'alto' ? 'medium' : 'performance'} halfRes={post !== 'alto'} />}
        {post === 'alto' ? <Bloom intensity={0.32} luminanceThreshold={1.15} luminanceSmoothing={0.15} mipmapBlur /> : <></>}
        <Exposure ref={exposure} />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <HueSaturation saturation={0.22} />
        <BrightnessContrast brightness={-0.02} contrast={0.16} />
        {post === 'alto' ? <Vignette offset={0.32} darkness={0.32} /> : <></>}
        {post === 'bajo' ? <FXAA /> : <SMAA />}
      </EffectComposer>
    </>
  );
}
