import { EffectComposer, N8AO, Bloom, ToneMapping, SMAA, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useStore } from '@/state/store';

/** Postprocesado sobrio: AO, bloom mínimo para luces, AgX y antialiasing. */
export function Effects() {
  const calidad = useStore((s) => s.ui.calidad);
  const high = calidad === 'alta';
  const low = calidad === 'baja';
  const tm = new URLSearchParams(location.search).get('tm');
  const mode = tm === 'aces' ? ToneMappingMode.ACES_FILMIC : tm === 'neutral' ? ToneMappingMode.NEUTRAL : ToneMappingMode.AGX;
  return (
    <EffectComposer multisampling={high ? 4 : 0} enableNormalPass={false}>
      {low ? <></> : <N8AO aoRadius={0.55} intensity={2.1} distanceFalloff={0.8} quality={high ? 'medium' : 'performance'} halfRes={!high} />}
      <Bloom intensity={0.35} luminanceThreshold={1.15} luminanceSmoothing={0.2} mipmapBlur />
      <ToneMapping mode={mode} />
      <HueSaturation saturation={tm ? 0 : 0.22} />
      <BrightnessContrast brightness={tm ? 0 : -0.02} contrast={tm ? 0 : 0.16} />
      {high ? <></> : <SMAA />}
    </EffectComposer>
  );
}
