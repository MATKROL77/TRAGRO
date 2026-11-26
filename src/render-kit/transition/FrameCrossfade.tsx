/**
 * Fundido cruzado dentro de la GPU.
 *
 * `frameCrossfade.start(ms)` dibuja un cuadro con la escena actual, lo copia a una
 * textura con copyFramebufferToTexture (GPU → GPU, sin leer píxeles a la CPU, que
 * frena la placa) y durante `ms` lo dibuja encima del cuadro nuevo con opacidad
 * decreciente. Se monta junto con el postprocesado (después de él en el cuadro).
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { compileObject } from '../precompile/compile';

interface State {
  start: (ms?: number) => boolean;
  available: boolean;
}

/** API global: el visor la usa si el componente está montado; si no, cae al fundido por canvas 2D. */
export const frameCrossfade: State = { start: () => false, available: false };

const VERT = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FRAG = 'uniform sampler2D map; uniform float opacity; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb, opacity); }';

export function FrameCrossfade({ priority = 2 }: { priority?: number }) {
  const gl = useThree((s) => s.gl);
  const advance = useThree((s) => s.advance);
  const invalidate = useThree((s) => s.invalidate);

  const res = useMemo(() => {
    const tex = new THREE.FramebufferTexture(1, 1);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, opacity: { value: 0 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const geo = new THREE.BufferGeometry();
    // Triángulo que cubre toda la pantalla.
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { tex, mat, geo, scene, cam, fade: { t0: 0, ms: 0, on: false } };
  }, []);

  useEffect(() => {
    const size = new THREE.Vector2();
    const origin = new THREE.Vector2(0, 0);
    frameCrossfade.available = true;
    // Shader propio compilado de antemano (si no, el primer fundido traería una compilación).
    void compileObject(gl, res.cam, res.scene, res.scene, { toScreen: true });
    frameCrossfade.start = (ms = 260) => {
      // Cuadro con lo que se ve ahora (modelo anterior) y copia en la GPU.
      advance(performance.now());
      gl.getDrawingBufferSize(size);
      if (res.tex.image.width !== size.x || res.tex.image.height !== size.y) {
        res.tex.dispose();
        res.tex.image.width = size.x;
        res.tex.image.height = size.y;
      }
      gl.setRenderTarget(null);
      gl.copyFramebufferToTexture(res.tex, origin);
      res.fade.t0 = performance.now();
      res.fade.ms = ms;
      res.fade.on = true;
      res.mat.uniforms.opacity.value = 1;
      invalidate();
      return true;
    };
    return () => {
      frameCrossfade.available = false;
      frameCrossfade.start = () => false;
      res.tex.dispose();
      res.mat.dispose();
      res.geo.dispose();
    };
  }, [gl, advance, invalidate, res]);

  useFrame(() => {
    const f = res.fade;
    if (!f.on) return;
    const k = Math.min(1, (performance.now() - f.t0) / f.ms);
    const ease = 1 - (1 - k) * (1 - k);
    res.mat.uniforms.opacity.value = 1 - ease;
    const auto = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(null);
    gl.render(res.scene, res.cam);
    gl.autoClear = auto;
    if (k >= 1) f.on = false;
    else invalidate();
  }, priority);

  return null;
}
