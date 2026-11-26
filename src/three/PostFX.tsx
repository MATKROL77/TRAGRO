import { EffectComposer, N8AO, Bloom, SMAA, FXAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useStore } from '../state/store';
import { QUALITY_PRESETS } from '../render-kit/quality';

/**
 * Post-procesado por nivel de calidad (no por escena): cambiar entre Estudio, Campo y Ruta no recrea
 * el compositor ni recompila sus shaders.
 *  - Alto: N8AO + bloom muy sutil (sólo reflejos por encima de 1,0) + viñeta leve + SMAA
 *  - Medio: N8AO a media resolución + SMAA
 *  - Bajo: sólo FXAA
 * El mapeo de tonos es AgX en todos los niveles (salida sRGB).
 */
export function PostFX() {
  const quality = useStore((s) => s.quality);
  const p = QUALITY_PRESETS[quality];
  return (
    <EffectComposer key={quality} multisampling={0} enableNormalPass={false}>
      {p.ao !== 'off' ? <N8AO aoRadius={0.6} intensity={p.ao === 'full' ? 2.4 : 1.8} distanceFalloff={0.6} halfRes={p.ao !== 'full'} quality={p.ao === 'full' ? 'medium' : 'low'} /> : <></>}
      {p.bloom ? <Bloom intensity={0.18} luminanceThreshold={1.0} luminanceSmoothing={0.12} mipmapBlur /> : <></>}
      <ToneMapping mode={ToneMappingMode.AGX} />
      {p.bloom ? <Vignette offset={0.32} darkness={0.32} /> : <></>}
      {p.aa === 'smaa' ? <SMAA /> : <FXAA />}
    </EffectComposer>
  );
}
