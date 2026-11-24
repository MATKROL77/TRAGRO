import { EffectComposer, N8AO, Bloom, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useStore } from '../state/store';

export function PostFX() {
  const quality = useStore((s) => s.quality);
  const scene = useStore((s) => s.scene);
  if (quality === 'low' || scene === 'field') {
    return (
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom intensity={0.1} luminanceThreshold={0.95} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <SMAA />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={0.6} intensity={quality === 'high' ? 2.4 : 1.8} distanceFalloff={0.6} halfRes={quality !== 'high'} quality={quality === 'high' ? 'medium' : 'low'} />
      <Bloom intensity={0.12} luminanceThreshold={0.92} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <SMAA />
    </EffectComposer>
  );
}
