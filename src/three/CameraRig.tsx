import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { useStore } from '@/state/store';
import { markActive } from './activity';
import { keepOutBox, poseFor, STEP_PRESET, type Pose } from './camera';
import { currentModel } from './TrailerObject';
import { loadingPose, matchesLoadingImage } from '@/ui/loadingMatch';

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

/** En la ruta la cámara la maneja el controlador del camión (sigue al conjunto en movimiento). */
const inRoute = () => useStore.getState().ui.env === 'ruta';
const ACCESSORY_FOCUS = new Set(['cajon', 'portaauxilio', 'tanqueAgua', 'matafuego']);

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
  const dragging = useRef(false);
  const clock = useRef(0);

  const aspect = size.width / Math.max(1, size.height);

  const goTo = (pose: Pose, dur = 1.0) => {
    const c = controls.current;
    if (!c) return;
    const reduced = useStore.getState().ui.reducedMotion || (window as unknown as { __fast?: boolean }).__fast === true;
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
    if (!model || !c || (inRoute() && !first.current)) return;
    const pose = poseFor(preset.preset, model, framing());
    home.current = null;
    if (first.current) {
      first.current = false;
      // Arranque calzado con la imagen de espera: misma cámara y zoom equivalente a su recorte.
      const st = useStore.getState();
      const lp = preset.preset === 'tresCuartos' && matchesLoadingImage(st.config, st.ui.env, st.ui.tractor) ? loadingPose(st.config.tipo) : null;
      const cam = camera as THREE.PerspectiveCamera;
      if (lp) {
        camera.position.fromArray(lp.position);
        c.target.fromArray(lp.target);
        cam.zoom = Math.max(1, aspect / lp.aspect);
        cam.updateProjectionMatrix();
        settle.current = pose;
      } else {
        camera.position.copy(pose.position);
        c.target.copy(pose.target);
      }
      c.update();
      invalidate();
    } else {
      goTo(pose, 1.1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, hasModel]);

  // Después del fundido de la imagen de espera, la cámara se acomoda al encuadre normal.
  const settle = useRef<Pose | null>(null);
  const zoomTw = useRef<{ from: number; t: number; dur: number } | null>(null);
  const ready = useStore((s) => s.ready);
  useEffect(() => {
    if (!ready || !settle.current) return;
    const id = window.setTimeout(() => {
      const pose = settle.current;
      settle.current = null;
      const cam = camera as THREE.PerspectiveCamera;
      if (!pose) return;
      const far = pose.position.distanceTo(camera.position) > 0.05 || Math.abs(cam.zoom - 1) > 0.005;
      if (!far) return;
      if (!dragging.current) goTo(pose, 1.3);
      zoomTw.current = { from: cam.zoom, t: 0, dur: 1.3 };
      invalidate();
    }, 720);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Reencuadre al cambiar el tamaño del visor o las medidas del equipo (cuando el modelo nuevo ya está armado:
  // la geometría llega del worker un instante después del cambio de opción).
  const modelVersion = useStore((s) => s.modelVersion);
  const tractor = useStore((s) => s.ui.tractor);
  const lastFrame = useRef('');
  useEffect(() => {
    const L = currentModel.value?.layout;
    const key = `${L?.tipo}|${L?.L}|${L?.totalHeight}|${tractor}|${Math.round(aspect * 20)}`;
    if (lastFrame.current === '') {
      lastFrame.current = key;
      return;
    }
    if (key === lastFrame.current) return;
    lastFrame.current = key;
    const id = requestAnimationFrame(() => {
      const model = currentModel.value;
      if (!model || home.current || inRoute()) return;
      const p = useStore.getState().camera.preset;
      goTo(poseFor(p, model, framing()), 0.8);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelVersion, tractor, aspect]);

  // Al salir de la ruta se vuelve al encuadre de tres cuartos.
  const envNow = useStore((s) => s.ui.env);
  const prevEnv = useRef(envNow);
  useEffect(() => {
    if (prevEnv.current === 'ruta' && envNow !== 'ruta') useStore.getState().setPreset(STEP_PRESET[useStore.getState().ui.paso] ?? 'tresCuartos');
    prevEnv.current = envNow;
  }, [envNow]);

  // Cada paso tiene su cámara (apunta a lo que se está editando).
  const paso = useStore((s) => s.ui.paso);
  const firstPaso = useRef(true);
  useEffect(() => {
    if (firstPaso.current) {
      firstPaso.current = false;
      return;
    }
    const st = useStore.getState();
    if (st.activeHotspot || inRoute()) return;
    home.current = null;
    st.setPreset(STEP_PRESET[paso] ?? 'tresCuartos');
  }, [paso]);

  // Al cambiar una opción: acercarse a la zona afectada y volver después.
  const lastChange = useStore((s) => s.lastChange);
  useEffect(() => {
    if (!lastChange) return;
    const st = useStore.getState();
    if (!st.ui.autoFoco || lastChange.foco === 'lateral' || lastChange.foco === 'ninguno' || inRoute()) return;
    const id = window.setTimeout(() => {
      const model = currentModel.value;
      const c = controls.current;
      if (!model || !c) return;
      // Accesorio que se acaba de quitar: no hay nada que mostrar.
      if (ACCESSORY_FOCUS.has(lastChange.foco) && !model.anchors[lastChange.foco]) return;
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
    if (inRoute()) {
      transition.current = null;
      home.current = null;
      zoomTw.current = null;
      if (rotating.current) {
        rotating.current = false;
        c.autoRotate = false;
      }
      return;
    }
    const now = performance.now();
    // Con frameloop "demand" el delta del reloj puede ser enorme: se usa tiempo real acotado.
    const wall = Math.min(2.5, (now - lastTick.current) / 1000);
    lastTick.current = now;
    const dt = Math.min(rawDt, 0.1);
    clock.current += wall;

    if (dragging.current || rotating.current || transition.current) markActive();

    const zt = zoomTw.current;
    if (zt) {
      const cam = camera as THREE.PerspectiveCamera;
      zt.t = Math.min(1, zt.t + Math.min(wall, 0.1) / zt.dur);
      cam.zoom = zt.from + (1 - zt.from) * ease(zt.t);
      cam.updateProjectionMatrix();
      if (zt.t >= 1) zoomTw.current = null;
      invalidate();
    }

    const tr = transition.current;
    if (tr) {
      // Tiempo real (acotado) para que en equipos lentos la transición no se estire.
      tr.t = Math.min(1, tr.t + Math.min(wall, 0.1) / tr.dur);
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
      // Nunca adentro del equipo ni bajo el piso: si el camino lo cruza, se sale por el costado.
      const m = currentModel.value;
      if (m) {
        const box = keepOutBox(m, useStore.getState().ui.tractor);
        const p = camera.position;
        if (box.containsPoint(p)) {
          const side = Math.sign(p.z || tr.to.position.z || 1);
          p.z = side * box.max.z;
        }
        if (p.y < 0.3) p.y = 0.3;
      }
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
    const canIdle = !st.ui.reducedMotion && st.ready && !st.ui.modal && !st.activeHotspot && !home.current && !(window as unknown as { __benchRec?: boolean }).__benchRec;
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
      regress
      enableDamping
      dampingFactor={0.085}
      rotateSpeed={0.72}
      zoomSpeed={0.8}
      panSpeed={0.7}
      minDistance={2.2}
      maxDistance={62}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI * 0.64}
      onStart={() => {
        dragging.current = true;
      }}
      onEnd={() => {
        dragging.current = false;
      }}
      onChange={() => {
        const c = controls.current;
        if (!c) return;
        // En la ruta la cámara la maneja RouteController (el camión se va a la banquina, más allá
        // de estos límites): limitar acá peleaba con el seguimiento y la cámara temblaba.
        if (inRoute()) return;
        // El objetivo no puede irse lejos del equipo ni bajo el piso.
        c.target.x = THREE.MathUtils.clamp(c.target.x, -9, 12);
        c.target.y = THREE.MathUtils.clamp(c.target.y, 0.2, 4.2);
        c.target.z = THREE.MathUtils.clamp(c.target.z, -3, 3);
        // Se puede mirar desde abajo (perno rey, ejes) pero nunca atravesar el piso.
        if (camera.position.y < 0.22) {
          camera.position.y = 0.22;
          camera.lookAt(c.target);
        }
      }}
    />
  );
}
