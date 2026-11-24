import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore, type CamPreset } from '../state/store';
import { runtime, touchInteraction } from './runtime';
import { prefersReducedMotion } from './motion';
import { ROW } from '../machines/seeder/rowUnit';
import { layoutBox } from './bounds';

interface Shot { pos: THREE.Vector3; target: THREE.Vector3 }


function machineBox(): { c: THREE.Vector3; s: THREE.Vector3 } {
  const m = runtime.model;
  if (!m) return { c: new THREE.Vector3(0, 1, 0), s: new THREE.Vector3(8, 2, 5) };
  const st = useStore.getState();
  const b = layoutBox(m.layout, st.pose === 'transport' || m.state.poseT > 0.5);
  return { c: b.getCenter(new THREE.Vector3()), s: b.getSize(new THREE.Vector3()) };
}

function anchorPos(name: string): THREE.Vector3 | null {
  const a = runtime.model?.anchors[name];
  if (!a) return null;
  const v = new THREE.Vector3();
  a.getWorldPosition(v);
  return v;
}

export function presetShot(p: CamPreset, aspect: number, scene: string): Shot {
  const { c, s } = machineBox();
  const span = Math.max(s.x, s.z * 0.8);
  const fit = (span / 2 / Math.tan(THREE.MathUtils.degToRad(20))) / Math.min(1.25, Math.max(0.55, aspect));
  const d = Math.max(6.5, fit * 1.12 + 2);
  const midRowX = (() => {
    const m = runtime.model;
    if (!m) return 0;
    const xs = m.layout.rowX;
    return xs[Math.floor(xs.length / 2)] ?? 0;
  })();
  switch (p) {
    case 'side':
      return { pos: new THREE.Vector3(c.x + s.x / 2 + Math.max(4.5, s.z * 1.1), 1.7, c.z + 0.4), target: new THREE.Vector3(c.x + s.x / 2 - 1.2, 0.75, c.z) };
    case 'rear':
      return { pos: new THREE.Vector3(c.x + span * 0.18, 2.6, c.z - d * 0.9), target: new THREE.Vector3(c.x, 0.8, c.z) };
    case 'top':
      return { pos: new THREE.Vector3(c.x, d * 1.25 + 2, c.z + 0.01), target: new THREE.Vector3(c.x, 0, c.z) };
    case 'rowUnit': {
      const t = new THREE.Vector3(midRowX, 0.48, -0.42);
      if (useStore.getState().detail) return { pos: new THREE.Vector3(3.3, 1.5, 1.9), target: new THREE.Vector3(0, 0.55, -0.35) };
      return { pos: t.clone().add(new THREE.Vector3(1.9, 0.55, 1.2)), target: t };
    }
    case 'hoppers': {
      const a = anchorPos('hs-hoppers') ?? new THREE.Vector3(midRowX, 1.4, -0.8);
      return { pos: a.clone().add(new THREE.Vector3(2.6, 1.6, 2.6)), target: a.clone().add(new THREE.Vector3(0, -0.4, 0)) };
    }
    case 'ground': {
      const x = midRowX + (runtime.model?.layout.spacing ?? 0.5) * 0.5;
      return { pos: new THREE.Vector3(x + 0.35, 0.5, ROW.closing.z - 5.2), target: new THREE.Vector3(x - 0.3, 0.32, ROW.closing.z + 1.2) };
    }
    case 'front34':
    default: {
      const k = scene === 'field' ? 1.05 : 1;
      // en ruta, el tractor va adelante: mirar desde atrás en 3/4 para no taparlo
      const zs = scene === 'road' ? -0.9 : scene === 'field' ? -0.75 : 1;
      return {
        pos: new THREE.Vector3(c.x + d * 0.6 * k, Math.max(2.2, d * 0.34), c.z + d * 0.82 * k * zs),
        target: new THREE.Vector3(c.x, Math.min(1.0, s.y * 0.4), c.z + 0.2),
      };
    }
  }
}

const ZONES: Record<string, string> = {
  transport: 'hs-transport',
  wheels: 'hs-transport',
  hoppers: 'hs-hoppers',
  fert: 'hs-hoppers',
  coulter: 'hs-coulter',
  closing: 'hs-closing',
  rowUnit: 'hs-discs',
  downforce: 'hs-discs',
  meter: 'hs-meter',
  monitor: 'hs-monitor',
};

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size: vsize, invalidate } = useThree();
  const tween = useRef<{ from: Shot; to: Shot; t: number; dur: number } | null>(null);
  const returnTo = useRef<{ shot: Shot; at: number } | null>(null);
  const camRequest = useStore((s) => s.camRequest);
  const focusRequest = useStore((s) => s.focusRequest);
  const scene = useStore((s) => s.scene);
  const feria = useStore((s) => s.feria);

  const current = (): Shot => ({ pos: camera.position.clone(), target: controls.current?.target.clone() ?? new THREE.Vector3() });

  const go = (to: Shot, dur = 1.4, instant = false) => {
    if (instant || prefersReducedMotion()) {
      camera.position.copy(to.pos);
      controls.current?.target.copy(to.target);
      controls.current?.update();
      tween.current = null;
      invalidate();
      return;
    }
    tween.current = { from: current(), to, t: 0, dur };
    invalidate();
  };

  // posición inicial
  useEffect(() => {
    const s = presetShot('front34', vsize.width / vsize.height, scene);
    camera.position.copy(s.pos);
    controls.current?.target.copy(s.target);
    controls.current?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!camRequest) return;
    returnTo.current = null;
    // esperar un frame para que el modelo (pose/escena) esté actualizado
    const id = requestAnimationFrame(() => go(presetShot(camRequest.preset, vsize.width / vsize.height, useStore.getState().scene), 1.5, camRequest.instant));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camRequest]);

  useEffect(() => {
    if (!focusRequest) return;
    const st = useStore.getState();
    if (st.detail || st.sowing || st.demo) return;
    if (focusRequest.zone === 'overview') {
      go(presetShot('front34', vsize.width / vsize.height, scene), 1.4);
      return;
    }
    const id = requestAnimationFrame(() => {
      const a = anchorPos(ZONES[focusRequest.zone] ?? '');
      if (!a) return;
      const back = returnTo.current?.shot ?? current();
      const dir = back.pos.clone().sub(back.target).setY(0).normalize();
      const pos = a.clone().addScaledVector(dir, 3.2).add(new THREE.Vector3(0, 1.3, 0));
      go({ pos, target: a }, 1.2);
      returnTo.current = { shot: back, at: performance.now() + 4200 };
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const dbg = (window as unknown as { __sp?: Record<string, unknown> }).__sp;
    if (dbg) {
      dbg.cam = camera;
      dbg.ctl = c;
    }
    const now = performance.now();
    if (tween.current) {
      const tw = tween.current;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      camera.position.lerpVectors(tw.from.pos, tw.to.pos, e);
      // arco suave: subir un poco a mitad de camino
      camera.position.y += Math.sin(e * Math.PI) * 0.25 * tw.from.pos.distanceTo(tw.to.pos) * 0.08;
      c.target.lerpVectors(tw.from.target, tw.to.target, e);
      if (tw.t >= 1) tween.current = null;
      invalidate();
    } else if (returnTo.current && now > returnTo.current.at) {
      const r = returnTo.current.shot;
      returnTo.current = null;
      go(r, 1.4);
    }
    // modo inactivo: rotación cinematográfica lenta a los 20 s
    const idle = now - runtime.lastInteraction > (feria ? 12000 : 20000);
    const st = useStore.getState();
    const rotate = idle && !prefersReducedMotion() && !tween.current && !st.sowing;
    c.autoRotate = rotate;
    c.autoRotateSpeed = 0.35;
    c.update();
    if (rotate) invalidate();
  });

  const near = scene === 'field' ? 1.2 : 1.4;
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={near}
      maxDistance={60}
      maxPolarAngle={Math.PI / 2 - 0.03}
      onStart={() => {
        tween.current = null;
        returnTo.current = null;
        touchInteraction();
      }}
      onChange={() => invalidate()}
    />
  );
}
