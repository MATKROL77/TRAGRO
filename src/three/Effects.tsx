import { EffectComposer, N8AO, Bloom, ToneMapping, SMAA, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { ToneMappingMode, type EffectComposer as ComposerImpl } from 'postprocessing';
import { useStore } from '@/state/store';

/** Referencia al compositor para las capturas en alta resolución. */
export const composerRef: { current: ComposerImpl | null } = { current: null };

/**
 * Postprocesado sobrio, de fotografía de producto: oclusión ambiental (N8AO),
 * bloom mínimo solo para las luces, tone mapping AgX con una corrección leve
 * de contraste y saturación (AgX solo lava los colores RAL) y antialiasing.
 */
export function Effects() {
  const calidad = useStore((s) => s.ui.calidad);
  const exterior = useStore((s) => s.ui.env === 'exterior');
  const high = calidad === 'alta';
  const low = calidad === 'baja';
  return (
    <EffectComposer
      ref={(c) => {
        composerRef.current = c as ComposerImpl | null;
      }}
      multisampling={high ? 4 : 0}
      enableNormalPass={false}
    >
      {low ? <></> : <N8AO aoRadius={0.55} intensity={exterior ? 1.7 : 2.1} distanceFalloff={0.8} quality={high ? 'medium' : 'performance'} halfRes={!high} />}
      <Bloom intensity={0.4} luminanceThreshold={1.1} luminanceSmoothing={0.2} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <HueSaturation saturation={0.22} />
      <BrightnessContrast brightness={-0.02} contrast={0.16} />
      {high ? <></> : <SMAA />}
    </EffectComposer>
  );
}
