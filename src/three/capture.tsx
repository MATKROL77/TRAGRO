import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { runtime } from './runtime';
import { presetShot, type Pads } from './CameraRig';
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
  aspect?: number;
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
export function captureView(preset: CamPreset, transport = false, maxWidth = 1400, aspect = 2): Promise<string> {
  return new Promise((resolve) => {
    queue.push({ kind: 'view', preset, transport, wait: 3, started: false, resolve, maxWidth, mime: 'image/jpeg', aspect });
    runtime.invalidate();
  });
}

/** Recorta al centro con la relación de aspecto pedida y achica a maxW. */
function downscale(src: HTMLCanvasElement, maxW: number, mime: string, aspect?: number): string {
  let sw = src.width;
  let sh = src.height;
  if (aspect) {
    if (sw / sh > aspect) sw = Math.round(sh * aspect);
    else sh = Math.round(sw / aspect);
  }
  const sx = Math.round((src.width - sw) / 2);
  const sy = Math.round((src.height - sh) / 2);
  if (sw <= maxW && sx === 0 && sy === 0) return src.toDataURL(mime, 0.9);
  const c = document.createElement('canvas');
  c.width = Math.min(maxW, sw);
  c.height = Math.round((sh / sw) * c.width);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL(mime, 0.9);
}

/** Márgenes para que el encuadre entre en el recorte (más un aire del 8 %). */
function cropPads(canvasAspect: number, aspect?: number): Pads {
  const p = { t: 0.04, b: 0.04, l: 0.04, r: 0.04 };
  if (!aspect) return p;
  if (canvasAspect > aspect) {
    const side = (1 - aspect / canvasAspect) / 2;
    p.l += side;
    p.r += side;
  } else {
    const side = (1 - canvasAspect / aspect) / 2;
    p.t += side;
    p.b += side;
  }
  return p;
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
        const asp = size.width / size.height;
        const shot = presetShot(r.preset, asp, useStore.getState().scene, { pads: cropPads(asp, r.aspect), transport: !!r.transport, fov: (camera as THREE.PerspectiveCamera).fov });
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
    const url = downscale(gl.domElement, r.maxWidth, r.mime, r.kind === 'view' ? r.aspect : undefined);
    queue.shift();
    r.restore?.();
    r.resolve(url);
    invalidate();
  }, 2);
  return null;
}
