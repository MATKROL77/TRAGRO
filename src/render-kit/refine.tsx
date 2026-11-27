/**
 * Refinado progresivo al quedarse quieto (render-kit).
 *
 * Cuando la cámara y la escena no cambian durante `delay` ms, cada cuadro se renderiza con un
 * desplazamiento de subpíxel distinto (Halton 2,3) y con la luz principal movida al azar dentro de un
 * disco (sombras con penumbra), y se promedia en un buffer de acumulación de media precisión. El
 * resultado es antialiasing de muchas muestras, sombras suaves y AO sin ruido: "render de producto".
 *
 *  - Se corta en el mismo cuadro en que se mueve la cámara o cambia la escena (vuelve a tiempo real).
 *  - Ya convergido, si algo pide un cuadro sin cambiar la escena, se vuelve a mostrar la imagen refinada.
 *  - `refineState.force = true` arranca sin esperar (capturas) y `refineState.samples/target` dan el progreso.
 *
 * Va con `useFrame` de prioridad 3: después del EffectComposer (prioridad 1), dibuja sobre la pantalla.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const refineState = {
  /** muestras acumuladas de la imagen actual */
  samples: 0,
  /** muestras objetivo (según calidad) */
  target: 48,
  /** true mientras se acumula o se muestra la imagen refinada */
  active: false,
  /** arrancar ya (sin esperar a que pase `delay`) */
  force: false,
  /** ms desde la última vez que algo cambió */
  stillSince: 0,
};

const halton = (i: number, b: number) => {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
};

interface Props {
  enabled: boolean;
  target: number;
  delay?: number;
  /** radio del desplazamiento de la luz principal (m): penumbra de las sombras */
  lightJitter?: number;
  /** firma extra de la escena (cambia → reinicia): modelo, pose, configuración… */
  signature: () => string;
}

const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export function ProgressiveRefine({ enabled, target, delay = 800, lightJitter = 0.35, signature }: Props) {
  const { gl, scene, camera, size, invalidate } = useThree();
  const res = useMemo(() => {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const accumMat = new THREE.ShaderMaterial({
      name: 'refineAccum',
      uniforms: { tCur: { value: null }, w: { value: 1 } },
      vertexShader: vert,
      fragmentShader: 'uniform sampler2D tCur; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tCur, vUv).rgb, w); }',
      transparent: true,
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const showMat = new THREE.ShaderMaterial({
      name: 'refineShow',
      uniforms: { tAcc: { value: null } },
      vertexShader: vert,
      fragmentShader: 'uniform sampler2D tAcc; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tAcc, vUv).rgb, 1.0); }',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    return { quad, quadScene, quadCam, accumMat, showMat };
  }, []);
  const buf = useRef<{ w: number; h: number; cur: THREE.FramebufferTexture; acc: THREE.WebGLRenderTarget } | null>(null);
  const st = useRef({ lastSig: '', lastCam: new THREE.Matrix4(), lastChange: performance.now(), samples: 0, light: null as THREE.DirectionalLight | null, lightBase: new THREE.Vector3(), jittering: false });

  useEffect(
    () => () => {
      buf.current?.cur.dispose();
      buf.current?.acc.dispose();
      res.quad.geometry.dispose();
      res.accumMat.dispose();
      res.showMat.dispose();
    },
    [res],
  );

  const stopJitter = () => {
    const s = st.current;
    if (!s.jittering) return;
    s.jittering = false;
    (camera as THREE.PerspectiveCamera).clearViewOffset?.();
    if (s.light) s.light.position.copy(s.lightBase);
  };

  const reset = (now: number) => {
    stopJitter();
    st.current.samples = 0;
    st.current.lastChange = now;
    refineState.samples = 0;
    refineState.active = false;
  };

  // al desactivar (cambio de escena, calidad…): limpiar el desplazamiento
  useEffect(() => {
    if (!enabled) reset(performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useFrame(() => {
    const s = st.current;
    const now = performance.now();
    refineState.target = target;
    if (!enabled) return;
    // ¿cambió algo? (posición de cámara, fov/aspecto, o la firma de la escena)
    const cam = camera as THREE.PerspectiveCamera;
    const sig = `${signature()}|${cam.fov}|${cam.aspect}|${size.width}x${size.height}|${gl.getPixelRatio()}`;
    const camChanged = !s.lastCam.equals(camera.matrixWorld);
    if (camChanged || sig !== s.lastSig) {
      s.lastCam.copy(camera.matrixWorld);
      s.lastSig = sig;
      reset(now);
      if (refineState.force) invalidate();
      else window.setTimeout(() => invalidate(), delay + 20);
      return;
    }
    refineState.stillSince = now - s.lastChange;
    if (!refineState.force && now - s.lastChange < delay) return;

    // buffers del tamaño del canvas
    const dbs = gl.getDrawingBufferSize(new THREE.Vector2());
    if (!buf.current || buf.current.w !== dbs.x || buf.current.h !== dbs.y) {
      buf.current?.cur.dispose();
      buf.current?.acc.dispose();
      buf.current = {
        w: dbs.x,
        h: dbs.y,
        cur: new THREE.FramebufferTexture(dbs.x, dbs.y),
        acc: new THREE.WebGLRenderTarget(dbs.x, dbs.y, { type: THREE.HalfFloatType, depthBuffer: false }),
      };
      s.samples = 0;
    }
    const b = buf.current;
    const prevTarget = gl.getRenderTarget();
    const prevAutoClear = gl.autoClear;
    gl.autoClear = false;
    if (s.samples < target) {
      // 1) lo que el compositor acaba de dibujar (con el desplazamiento anterior) → textura
      gl.setRenderTarget(null);
      gl.copyFramebufferToTexture(b.cur);
      // 2) promedio acumulado: acc = mix(acc, cur, 1/(n+1))
      res.quad.material = res.accumMat;
      res.accumMat.uniforms.tCur.value = b.cur;
      res.accumMat.uniforms.w.value = 1 / (s.samples + 1);
      gl.setRenderTarget(b.acc);
      gl.render(res.quadScene, res.quadCam);
      s.samples++;
      refineState.samples = s.samples;
      refineState.active = true;
    }
    // 3) mostrar la imagen acumulada
    res.quad.material = res.showMat;
    res.showMat.uniforms.tAcc.value = b.acc.texture;
    gl.setRenderTarget(null);
    gl.render(res.quadScene, res.quadCam);
    gl.setRenderTarget(prevTarget);
    gl.autoClear = prevAutoClear;

    if (s.samples < target) {
      // 4) desplazamiento para el próximo cuadro: subpíxel + luz
      const i = s.samples + 1;
      const jx = halton(i, 2) - 0.5;
      const jy = halton(i, 3) - 0.5;
      cam.setViewOffset(b.w, b.h, jx, jy, b.w, b.h);
      if (!s.light || !s.light.parent) {
        s.light = null;
        scene.traverse((o) => {
          const l = o as THREE.DirectionalLight;
          if (!s.light && l.isDirectionalLight && l.castShadow) s.light = l;
        });
      }
      if (s.light) {
        if (!s.jittering) s.lightBase.copy(s.light.position);
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * lightJitter * s.lightBase.length() * 0.06;
        s.light.position.copy(s.lightBase).add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      s.jittering = true;
      // la cámara "cambió" por el desplazamiento: no cuenta como movimiento
      s.lastCam.copy(camera.matrixWorld);
      invalidate();
    } else {
      stopJitter();
      refineState.force = false;
    }
  }, 3);
  return null;
}
