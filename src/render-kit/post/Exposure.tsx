/**
 * Exposición por escena como efecto de postprocesado controlado por uniform: cambiarla
 * no recrea el efecto (las props de @react-three/postprocessing sí lo recrean y eso
 * recompila shaders). Va antes del tone mapping.
 */
import { forwardRef, useMemo } from 'react';
import { Uniform } from 'three';
import { BlendFunction, Effect } from 'postprocessing';

const FRAG = `
uniform float exposure;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(inputColor.rgb * exposure, inputColor.a);
}`;

export class ExposureEffect extends Effect {
  constructor(exposure = 1) {
    super('ExposureEffect', FRAG, { blendFunction: BlendFunction.NORMAL, uniforms: new Map([['exposure', new Uniform(exposure)]]) });
  }
  set exposure(v: number) {
    (this.uniforms.get('exposure') as Uniform<number>).value = v;
  }
  get exposure(): number {
    return (this.uniforms.get('exposure') as Uniform<number>).value;
  }
}

/** Montar dentro del EffectComposer; ajustar con `ref.current.exposure = x`. */
export const Exposure = forwardRef<ExposureEffect, { initial?: number }>(function Exposure({ initial = 1 }, ref) {
  const effect = useMemo(() => new ExposureEffect(initial), []); // eslint-disable-line react-hooks/exhaustive-deps
  return <primitive ref={ref} object={effect} dispose={null} />;
});
