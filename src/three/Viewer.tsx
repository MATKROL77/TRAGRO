import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor, useProgress } from '@react-three/drei';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { useStore } from '@/state/store';
import { poseFor } from './camera';
import { CameraRig, FOV, rigLock } from './CameraRig';
import { composerRef, Effects } from './Effects';
import { Hotspots } from './Hotspots';
import { Scene } from './Scene';
import { Tractor } from './Tractor';
import { TrailerObject, currentModel, useGeometryCrossfade } from './TrailerObject';
import { registerViewer, type SnapshotOptions } from './viewerApi';

const MAX_PIXELS = 9_000_000;

function Bridge({ overlay }: { overlay: React.RefObject<HTMLCanvasElement> }) {
  const state = useThree();
  const ref = useRef(state);
  ref.current = state;
  const fps = useRef({ frames: 0, last: performance.now(), value: 0 });
  useGeometryCrossfade();

  useFrame(() => {
    const f = fps.current;
    f.frames++;
    const now = performance.now();
    if (now - f.last >= 500) {
      f.value = (f.frames * 1000) / (now - f.last);
      f.frames = 0;
      f.last = now;
    }
  });

  useEffect(() => {
    const get = () => ref.current;

    const snapshot = (o: SnapshotOptions): string | null => {
      const { gl, camera, controls, size, advance } = get();
      const model = currentModel.value;
      const c = controls as unknown as OrbitImpl | null;
      if (!model || !c) return null;
      const cam = camera as THREE.PerspectiveCamera;
      const saved = { pos: cam.position.clone(), quat: cam.quaternion.clone(), target: c.target.clone(), dpr: gl.getPixelRatio(), damping: c.enableDamping, auto: c.autoRotate };
      const canvasAspect = size.width / size.height;
      const cropAspect = o.width / o.height;
      // Se dibuja el lienzo completo y después se recorta al formato pedido.
      const cropW = cropAspect < canvasAspect ? size.height * cropAspect : size.width;
      const cropH = cropAspect < canvasAspect ? size.height : size.width / cropAspect;
      let dpr = Math.max(1, o.width / cropW);
      dpr = Math.min(dpr, 4, Math.sqrt(MAX_PIXELS / (size.width * size.height)));
      rigLock.locked = true;
      c.enableDamping = false;
      c.autoRotate = false;
      let url: string | null = null;
      try {
        if (o.preset) {
          const fovEff = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * Math.min(1, canvasAspect / cropAspect)));
          const pose = poseFor(o.preset, model, { aspect: cropAspect, fov: fovEff, margin: 0.9, shift: 0, tractor: useStore.getState().ui.tractor });
          cam.position.copy(pose.position);
          c.target.copy(pose.target);
          cam.lookAt(pose.target);
          cam.updateMatrixWorld();
        }
        gl.setPixelRatio(dpr);
        composerRef.current?.setSize(size.width, size.height);
        advance(performance.now());
        const src = gl.domElement;
        const sx = ((size.width - cropW) / 2) * dpr;
        const sy = ((size.height - cropH) / 2) * dpr;
        const out = document.createElement('canvas');
        out.width = o.width;
        out.height = o.height;
        const ctx = out.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(src, sx, sy, cropW * dpr, cropH * dpr, 0, 0, o.width, o.height);
          url = out.toDataURL(o.type ?? 'image/jpeg', o.quality ?? 0.9);
        }
      } finally {
        gl.setPixelRatio(saved.dpr);
        composerRef.current?.setSize(size.width, size.height);
        cam.position.copy(saved.pos);
        cam.quaternion.copy(saved.quat);
        c.target.copy(saved.target);
        cam.updateMatrixWorld();
        c.enableDamping = saved.damping;
        c.autoRotate = saved.auto;
        rigLock.locked = false;
        advance(performance.now());
      }
      return url;
    };

    registerViewer({
      renderNow: () => get().advance(performance.now()),
      invalidate: () => get().invalidate(),
      crossfade: (ms = 260) => {
        const el = overlay.current;
        const { gl, advance } = get();
        if (!el || useStore.getState().ui.reducedMotion) return;
        advance(performance.now());
        const src = gl.domElement;
        if (el.width !== src.width || el.height !== src.height) {
          el.width = src.width;
          el.height = src.height;
        }
        const ctx = el.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(src, 0, 0);
        el.style.transition = 'none';
        el.style.opacity = '1';
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            el.style.transition = `opacity ${ms}ms ease-out`;
            el.style.opacity = '0';
          }),
        );
      },
      snapshot,
      stats: () => {
        const i = get().gl.info;
        return { triangles: i.render.triangles, calls: i.render.calls, geometries: i.memory.geometries, textures: i.memory.textures, fps: fps.current.value };
      },
    });
    (window as unknown as { __cam: unknown }).__cam = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
      const { camera, controls, invalidate } = get();
      camera.position.set(x, y, z);
      const c = controls as unknown as OrbitImpl | null;
      c?.target.set(tx, ty, tz);
      c?.update();
      invalidate();
    };
    return () => registerViewer(null);
  }, [overlay]);
  return null;
}

/** Avisa a la UI cuando el primer cuadro completo ya está en pantalla. */
function ReadySignal() {
  const done = useRef(false);
  const frames = useRef(0);
  const { active } = useProgress();
  useFrame(() => {
    if (done.current || active) return;
    frames.current++;
    if (frames.current >= 2) {
      done.current = true;
      useStore.getState().setReady(true);
    }
  });
  return null;
}

export function Viewer() {
  const overlay = useRef<HTMLCanvasElement>(null);
  const setUi = useStore((s) => s.setUi);
  const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  return (
    <div className="viewer">
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={[1, mobile ? 1.75 : 2]}
        frameloop="demand"
        gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.NoToneMapping, stencil: false, alpha: false }}
        camera={{ fov: FOV, near: 0.25, far: 900, position: [12, 4.2, 12.5] }}
        onCreated={({ gl }) => gl.setClearColor('#cfd2d6')}
      >
        {/* Calidad adaptativa: si caen los fps se baja AO, MSAA y resolución. */}
        <PerformanceMonitor
          bounds={() => [28, 50]}
          flipflops={2}
          onDecline={() => setUi({ calidad: useStore.getState().ui.calidad === 'alta' ? 'media' : 'baja' })}
          onIncline={() => useStore.getState().ui.calidad === 'baja' && setUi({ calidad: 'media' })}
        />
        <Suspense fallback={null}>
          <Scene />
          <TrailerObject />
          <Tractor />
          <Hotspots />
          <ReadySignal />
        </Suspense>
        <CameraRig />
        <Effects />
        <Bridge overlay={overlay} />
      </Canvas>
      <canvas ref={overlay} className="viewer-fade" aria-hidden="true" />
    </div>
  );
}
