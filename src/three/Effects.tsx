import { EffectComposer, N8AO, Bloom, ToneMapping, SMAA, FXAA, HueSaturation, BrightnessContrast, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode, type EffectComposer as ComposerImpl } from 'postprocessing';
import { useStore } from '@/state/store';
import { tierSettings } from '@/render-kit/quality/tiers';
import { composerRef } from './composerRef';
import { FrameCrossfade } from '@/render-kit/transition/FrameCrossfade';

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
export default function Effects() {
  const calidad = useStore((s) => s.ui.calidad);
  const post = tierSettings(calidad).post;
  return (
    <>
      <FrameCrossfade />
      <EffectComposer
        ref={(c) => {
          composerRef.current = c as ComposerImpl | null;
        }}
        multisampling={0}
        enableNormalPass={false}
      >
        {post === 'bajo' ? <></> : <N8AO aoRadius={0.55} intensity={1.9} distanceFalloff={0.8} quality={post === 'alto' ? 'medium' : 'performance'} halfRes={post !== 'alto'} />}
        {post === 'alto' ? <Bloom intensity={0.32} luminanceThreshold={1.15} luminanceSmoothing={0.15} mipmapBlur /> : <></>}
        <ToneMapping mode={ToneMappingMode.AGX} />
        <HueSaturation saturation={0.22} />
        <BrightnessContrast brightness={-0.02} contrast={0.16} />
        {post === 'alto' ? <Vignette offset={0.32} darkness={0.32} /> : <></>}
        {post === 'bajo' ? <FXAA /> : <SMAA />}
      </EffectComposer>
    </>
  );
}
