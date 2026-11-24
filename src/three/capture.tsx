import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { runtime } from './runtime';
import { presetShot } from './CameraRig';
import type { CamPreset } from '../state/store';
import { useStore } from '../state/store';

interface Req {
  kind: 'view' | 'hires';
  preset?: CamPreset;
  transport?: boolean;
  scale?: number;
  wait: number;
  started: boolean;
  restore?: () => void;
  resolve: (url: string) => void;
  maxWidth: number;
  mime: string;
}

const queue: Req[] = [];
export const captureState = { lock: false };

/** Captura PNG en alta resolución de la vista actual. */
export function captureHiRes(scale = 2): Promise<string> {
  return new Promise((resolve) => {
    queue.push({ kind: 'hires', scale, wait: 4, started: false, resolve, maxWidth: 4096, mime: 'image/png' });
    runtime.invalidate();
  });
}

/** Render automático de una vista predefinida (para el resumen y el PDF). */
export function captureView(preset: CamPreset, transport = false, maxWidth = 1400): Promise<string> {
  return new Promise((resolve) => {
    queue.push({ kind: 'view', preset, transport, wait: 3, started: false, resolve, maxWidth, mime: 'image/jpeg' });
    runtime.invalidate();
  });
}

function downscale(src: HTMLCanvasElement, maxW: number, mime: string): string {
  if (src.width <= maxW) return src.toDataURL(mime, 0.9);
  const c = document.createElement('canvas');
  c.width = maxW;
  c.height = Math.round((src.height / src.width) * maxW);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL(mime, 0.9);
}

export function CaptureController() {
  const { gl, camera, controls, setDpr, viewport, size, invalidate } = useThree();
  useFrame(() => {
    const r = queue[0];
    if (!r) return;
    if (!r.started) {
      r.started = true;
      const ctl = controls as unknown as OrbitControlsImpl | null;
      if (r.kind === 'hires') {
        const prev = viewport.dpr;
        setDpr(Math.min(3, prev * (r.scale ?? 2)));
        r.restore = () => setDpr(prev);
      } else if (r.preset) {
        captureState.lock = true;
        const prevPos = camera.position.clone();
        const prevTarget = ctl?.target.clone() ?? new THREE.Vector3();
        const m = runtime.model;
        const prevPose = m?.state.poseT ?? 0;
        if (m) m.applyPose(r.transport ? 1 : 0, true);
        const shot = presetShot(r.preset, size.width / size.height, useStore.getState().scene);
        camera.position.copy(shot.pos);
        ctl?.target.copy(shot.target);
        ctl?.update();
        r.restore = () => {
          camera.position.copy(prevPos);
          ctl?.target.copy(prevTarget);
          ctl?.update();
          if (m) m.applyPose(prevPose, true);
          captureState.lock = false;
        };
      }
      invalidate();
      return;
    }
    if (r.wait-- > 0) {
      invalidate();
      return;
    }
    const url = downscale(gl.domElement, r.maxWidth, r.mime);
    queue.shift();
    r.restore?.();
    r.resolve(url);
    invalidate();
  }, 2);
  return null;
}
