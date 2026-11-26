/**
 * Refinado progresivo al quedarse quieto (efecto "render de producto").
 *
 * Cuando la cámara y la escena no cambian durante `idleMs`, se dibujan `samples` cuadros
 * con jitter (subpíxel, disco de luz y, opcionalmente, apertura de lente) y se muestra su
 * promedio, que converge a una imagen sin aliasing, con sombras suaves y profundidad de
 * campo. Ante cualquier interacción se corta en el mismo cuadro y vuelve a tiempo real
 * (ese cuadro ya se dibuja normal: no hay parpadeo).
 *
 * Se monta junto al postprocesado: dibuja después de él (prioridad positiva).
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { FrameAccumulator, applyJitter } from './accumulator';

export interface RefineSettings {
  samples: number;
  /** Radio del disco de la luz principal (m): sombras suaves. 0 = no. */
  lightRadius: number;
  /** Apertura de la lente (m): profundidad de campo. 0 = no. */
  aperture: number;
}

export interface ProgressiveRefineProps {
  enabled: boolean;
  settings: RefineSettings;
  /** true mientras algo se anima o la app lo pide (no se refina). */
  isBusy: () => boolean;
  /** Punto de foco (el objetivo de la cámara). */
  focus: () => THREE.Vector3 | null;
  idleMs?: number;
  priority?: number;
}

/** Estado global: las capturas lo suspenden mientras dibujan las suyas. */
export const refineState = { suspended: false, progress: 0, refining: false };

/** La app avisa que algo cambió (configuración, colores, escena): se corta y se espera otra vez. */
export const refineControl = { poke: () => undefined as void };

export function ProgressiveRefine({ enabled, settings, isBusy, focus, idleMs = 800, priority = 3 }: ProgressiveRefineProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const acc = useMemo(() => new FrameAccumulator(), []);
  const st = useRef({ refining: false, done: false, i: 0, lastChange: performance.now(), restore: null as null | (() => void), lastMatrix: new THREE.Matrix4(), stop: false });

  useEffect(() => {
    acc.compile(gl);
    return () => acc.dispose();
  }, [acc, gl]);

  const stop = () => {
    const s = st.current;
    s.restore?.();
    s.restore = null;
    if (s.refining) invalidate();
    s.refining = false;
    s.done = false;
    s.i = 0;
    s.lastChange = performance.now();
    refineState.refining = false;
    refineState.progress = 0;
    acc.reset();
  };

  // Cualquier interacción corta el refinado en el acto.
  useEffect(() => {
    const el = gl.domElement;
    const poke = () => {
      st.current.stop = true;
      st.current.lastChange = performance.now();
      if (st.current.refining) invalidate();
    };
    refineControl.poke = poke;
    el.addEventListener('pointerdown', poke);
    el.addEventListener('wheel', poke, { passive: true });
    window.addEventListener('keydown', poke);
    return () => {
      el.removeEventListener('pointerdown', poke);
      el.removeEventListener('wheel', poke);
      window.removeEventListener('keydown', poke);
      refineControl.poke = () => undefined;
    };
  }, [gl, invalidate]);

  // Arranca cuando pasó el tiempo de quietud.
  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    const id = window.setInterval(() => {
      const s = st.current;
      if (s.refining || refineState.suspended || isBusy() || document.hidden) return;
      if (performance.now() - s.lastChange < idleMs) return;
      s.refining = true;
      s.i = 0;
      acc.reset();
      refineState.refining = true;
      invalidate();
    }, 150);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, idleMs, settings.samples]);

  // Antes del cuadro: ¿algo cambió? Si no, jitter de la muestra que toca.
  useFrame(() => {
    const s = st.current;
    const moved = !s.lastMatrix.equals(camera.matrixWorld);
    s.lastMatrix.copy(camera.matrixWorld);
    if (s.stop || moved || isBusy() || refineState.suspended) {
      s.stop = false;
      if (s.refining || moved) stop();
      return;
    }
    if (!s.refining) return;
    const light = findShadowLight(scene);
    const f = focus();
    s.restore = applyJitter({ camera, light, lightRadius: settings.lightRadius, aperture: settings.aperture, focusDistance: f ? camera.position.distanceTo(f) : 20 }, s.i, size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio());
  }, -55);

  // Después del postprocesado: sumar al promedio y mostrarlo.
  useFrame(() => {
    const s = st.current;
    // Ya convergió y nada cambió: cualquier cuadro extra (temporizadores) vuelve a mostrar el promedio.
    if (!s.refining && s.done) {
      acc.present(gl);
      return;
    }
    if (!s.refining || !s.restore) return;
    s.restore();
    s.restore = null;
    acc.add(gl);
    acc.present(gl);
    s.i++;
    refineState.progress = s.i / settings.samples;
    // La matriz de la cámara quedó como antes del jitter: no cuenta como movimiento.
    s.lastMatrix.copy(camera.matrixWorld);
    if (s.i < settings.samples) invalidate();
    else {
      s.refining = false;
      s.done = true;
      refineState.refining = false;
    }
  }, priority);

  return null;
}

/** Luz direccional visible con sombra (la principal de la escena). */
export function findShadowLight(scene: THREE.Object3D): THREE.DirectionalLight | null {
  let found: THREE.DirectionalLight | null = null;
  scene.traverseVisible((o) => {
    if (!found && (o as THREE.DirectionalLight).isDirectionalLight && o.castShadow) found = o as THREE.DirectionalLight;
  });
  return found;
}
