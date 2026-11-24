import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { useStore } from '@/state/store';
import { poseFor, type Pose } from './camera';
import { currentModel } from './TrailerObject';

const IDLE_AFTER = 20;
const FOCUS_HOLD = 3.4;
export const FOV = 30;

interface Transition {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  to: Pose;
  t: number;
  dur: number;
}

/** Bloquea el rig mientras se hacen capturas con otra cámara. */
export const rigLock = { locked: false };

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const sph = new THREE.Spherical();
const sphB = new THREE.Spherical();
const off = new THREE.Vector3();

export function CameraRig() {
  const controls = useRef<OrbitImpl>(null);
  const { camera, invalidate, size, gl } = useThree();
  const transition = useRef<Transition | null>(null);
  const home = useRef<{ pose: Pose; until: number } | null>(null);
  const idle = useRef(0);
  const rotating = useRef(false);
  const clock = useRef(0);

  const aspect = size.width / Math.max(1, size.height);

  const goTo = (pose: Pose, dur = 1.0) => {
    const c = controls.current;
    if (!c) return;
    const reduced = useStore.getState().ui.reducedMotion;
    transition.current = { fromPos: camera.position.clone(), fromTarget: c.target.clone(), to: pose, t: 0, dur: reduced ? 0.01 : dur };
    invalidate();
  };

  const framing = () => ({ aspect, fov: FOV, tractor: useStore.getState().ui.tractor });

  // Encuadre inicial (cuando el modelo ya existe) y presets.
  const preset = useStore((s) => s.camera);
  const hasModel = useStore((s) => s.modelVersion > 0);
  const first = useRef(true);
  useEffect(() => {
    const model = currentModel.value;
    const c = controls.current;
    if (!model || !c) return;
    const pose = poseFor(preset.preset, model, framing());
    home.current = null;
    if (first.current) {
      first.current = false;
      camera.position.copy(pose.position);
      c.target.copy(pose.target);
      c.update();
      invalidate();
    } else {
      goTo(pose, 1.1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, hasModel]);

  // Reencuadre al cambiar el tamaño del visor o el tipo/largo del equipo.
  const tipo = useStore((s) => s.config.tipo);
  const largo = useStore((s) => s.config.sel.largo);
  const alto = useStore((s) => s.config.sel.alto);
  const tractor = useStore((s) => s.ui.tractor);
  const lastFrame = useRef('');
  useEffect(() => {
    const key = `${tipo}|${largo}|${alto}|${tractor}|${Math.round(aspect * 20)}`;
    if (lastFrame.current === '') {
      lastFrame.current = key;
      return;
    }
    if (key === lastFrame.current) return;
    lastFrame.current = key;
    const id = requestAnimationFrame(() => {
      const model = currentModel.value;
      if (!model || home.current) return;
      const p = useStore.getState().camera.preset;
      goTo(poseFor(p, model, framing()), 0.8);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, largo, alto, tractor, aspect]);

  // Al cambiar una opción: acercarse a la zona afectada y volver después.
  const lastChange = useStore((s) => s.lastChange);
  useEffect(() => {
    if (!lastChange) return;
    const st = useStore.getState();
    if (!st.ui.autoFoco || lastChange.foco === 'lateral' || lastChange.foco === 'ninguno') return;
    const id = window.setTimeout(() => {
      const model = currentModel.value;
      const c = controls.current;
      if (!model || !c) return;
      if (!home.current) home.current = { pose: { position: camera.position.clone(), target: c.target.clone() }, until: 0 };
      home.current.until = clock.current + FOCUS_HOLD + 0.9;
      goTo(poseFor(lastChange.foco, model, framing()), 0.9);
    }, 240);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastChange]);

  // Hotspot activo: acercamiento que se mantiene hasta cerrarlo.
  const hotspot = useStore((s) => s.activeHotspot);
  useEffect(() => {
    const model = currentModel.value;
    const c = controls.current;
    if (!model || !c) return;
    if (hotspot) {
      if (!home.current) home.current = { pose: { position: camera.position.clone(), target: c.target.clone() }, until: Infinity };
      else home.current.until = Infinity;
      goTo(poseFor(hotspot, model, framing()), 0.9);
    } else if (home.current && home.current.until === Infinity) {
      goTo(home.current.pose, 0.9);
      home.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotspot]);

  // Cualquier interacción corta el modo inactivo y el regreso automático.
  useEffect(() => {
    const el = gl.domElement;
    const wake = () => {
      idle.current = 0;
      if (rotating.current) {
        rotating.current = false;
        if (controls.current) controls.current.autoRotate = false;
      }
    };
    const grab = () => {
      wake();
      transition.current = null;
      if (home.current && home.current.until !== Infinity) home.current = null;
    };
    el.addEventListener('pointerdown', grab);
    el.addEventListener('wheel', grab, { passive: true });
    window.addEventListener('keydown', wake);
    window.addEventListener('pointerdown', wake);
    const unsub = useStore.subscribe(wake);
    // Sin interacción no se dibujan cuadros: un temporizador despierta el render para detectar la inactividad.
    const timer = window.setInterval(() => {
      if (!document.hidden) invalidate();
    }, 2000);
    return () => {
      el.removeEventListener('pointerdown', grab);
      el.removeEventListener('wheel', grab);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('pointerdown', wake);
      unsub();
      window.clearInterval(timer);
    };
  }, [gl, invalidate]);

  const lastTick = useRef(performance.now());
  useFrame((_, rawDt) => {
    const c = controls.current;
    if (!c || rigLock.locked) return;
    const now = performance.now();
    // Con frameloop "demand" el delta del reloj puede ser enorme: se usa tiempo real acotado.
    const wall = Math.min(2.5, (now - lastTick.current) / 1000);
    lastTick.current = now;
    const dt = Math.min(rawDt, 0.05);
    clock.current += wall;

    const tr = transition.current;
    if (tr) {
      tr.t = Math.min(1, tr.t + dt / tr.dur);
      const k = ease(tr.t);
      c.target.lerpVectors(tr.fromTarget, tr.to.target, k);
      // Interpolación esférica alrededor del objetivo: la cámara orbita, no atraviesa el equipo.
      off.copy(tr.fromPos).sub(tr.fromTarget);
      sph.setFromVector3(off);
      off.copy(tr.to.position).sub(tr.to.target);
      sphB.setFromVector3(off);
      let dTheta = sphB.theta - sph.theta;
      if (dTheta > Math.PI) dTheta -= Math.PI * 2;
      if (dTheta < -Math.PI) dTheta += Math.PI * 2;
      sph.radius += (sphB.radius - sph.radius) * k;
      sph.phi += (sphB.phi - sph.phi) * k;
      sph.theta += dTheta * k;
      off.setFromSpherical(sph);
      camera.position.copy(c.target).add(off);
      camera.lookAt(c.target);
      if (tr.t >= 1) transition.current = null;
      invalidate();
      return;
    }

    if (home.current && home.current.until !== Infinity && clock.current > home.current.until) {
      const pose = home.current.pose;
      home.current = null;
      goTo(pose, 1.1);
      return;
    }

    // Modo inactivo: rotación lenta y cinematográfica.
    const st = useStore.getState();
    idle.current += wall;
    const canIdle = !st.ui.reducedMotion && st.ready && !st.ui.modal && !st.activeHotspot && !home.current;
    if (canIdle && idle.current > IDLE_AFTER) {
      if (!rotating.current) {
        rotating.current = true;
        c.autoRotate = true;
        c.autoRotateSpeed = 0;
      }
      c.autoRotateSpeed = Math.min(0.55, c.autoRotateSpeed + dt * 0.25);
      c.update();
      invalidate();
    } else if (home.current && home.current.until !== Infinity) {
      // Esperando para volver del acercamiento.
      invalidate();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.085}
      rotateSpeed={0.72}
      zoomSpeed={0.8}
      panSpeed={0.7}
      minDistance={2.2}
      maxDistance={62}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2 - 0.035}
      onChange={() => {
        const c = controls.current;
        if (!c) return;
        // El objetivo no puede irse lejos del equipo ni bajo el piso.
        c.target.x = THREE.MathUtils.clamp(c.target.x, -9, 12);
        c.target.y = THREE.MathUtils.clamp(c.target.y, 0.2, 4.2);
        c.target.z = THREE.MathUtils.clamp(c.target.z, -3, 3);
      }}
    />
  );
}
