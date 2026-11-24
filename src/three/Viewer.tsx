import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { useStore } from '@/state/store';
import { isActive } from './activity';
import { poseFor } from './camera';
import { CameraRig, FOV, rigLock } from './CameraRig';
import { composerRef, Effects } from './Effects';
import { Hotspots } from './Hotspots';
import { Scene } from './Scene';
import { Tractor } from './Tractor';
import { TrailerObject, buildTimes, currentModel, useGeometryCrossfade } from './TrailerObject';
import { registerViewer, type SnapshotOptions } from './viewerApi';

const MAX_PIXELS = 9_000_000;

function Bridge({ overlay }: { overlay: React.RefObject<HTMLCanvasElement> }) {
  const state = useThree();
  const ref = useRef(state);
  ref.current = state;
  const fps = useRef({ frames: 0, last: performance.now(), value: 0, total: 0 });
  useGeometryCrossfade();

  // Estadísticas por cuadro completo (sombras + escena + postprocesado), no por pasada.
  useEffect(() => {
    state.gl.info.autoReset = false;
  }, [state.gl]);
  const lastInfo = useRef({ calls: 0, triangles: 0 });
  useFrame(({ gl }) => {
    lastInfo.current = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    gl.info.reset();
  }, -100);

  useFrame(() => {
    const f = fps.current;
    f.frames++;
    f.total++;
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
      const view = cam.view?.enabled ? { ...cam.view } : null;
      if (view) cam.clearViewOffset();
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
        if (view) cam.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
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
      camera: () => {
        const { camera, controls } = get();
        const t = (controls as unknown as OrbitImpl | null)?.target;
        return { position: camera.position.toArray() as [number, number, number], target: (t ? t.toArray() : [0, 0, 0]) as [number, number, number] };
      },
      stats: () => {
        const i = get().gl.info;
        return { triangles: lastInfo.current.triangles, calls: lastInfo.current.calls, geometries: i.memory.geometries, textures: i.memory.textures, fps: fps.current.value };
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
    (window as unknown as { __captura: unknown }).__captura = snapshot;
    (window as unknown as { __viewer: unknown }).__viewer = { stats: () => ({ ...get().gl.info.memory, ...lastInfo.current, fps: fps.current.value, frames: fps.current.total, programs: get().gl.info.programs?.length ?? 0, buildMs: buildTimes.slice(), modelTriangles: currentModel.value?.stats.triangles ?? 0, modelMeshes: currentModel.value?.stats.meshes ?? 0 }), camera: () => ({ position: get().camera.position.toArray(), target: (get().controls as unknown as OrbitImpl | null)?.target.toArray() }) };
    return () => registerViewer(null);
  }, [overlay]);
  return null;
}

const TIERS = ['baja', 'media', 'alta'] as const;

/**
 * Calidad adaptativa. Equivale al PerformanceMonitor de drei, pero pensado para
 * frameloop="demand": solo mide ráfagas de cuadros continuos (girar la cámara,
 * animaciones) y descarta las pausas, que no son caídas de fps.
 * Si el promedio baja de ~27 fps se reduce resolución, AO, antialiasing y sombras.
 */
function AdaptiveQuality({ mobile }: { mobile: boolean }) {
  const calidad = useStore((s) => s.ui.calidad);
  const setDpr = useThree((s) => s.setDpr);
  const perf = useRef({ run: 0, sum: 0, slow: 0, fast: 0, raises: 0 });

  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const device = window.devicePixelRatio || 1;
    const cap = calidad === 'alta' ? (mobile ? 1.75 : 2) : calidad === 'media' ? 1.4 : 1;
    setDpr(Math.min(device, cap));
    // El compositor de postprocesado tiene que tomar la nueva resolución.
    const id = requestAnimationFrame(() => {
      composerRef.current?.setSize(size.width, size.height);
      invalidate();
    });
    return () => cancelAnimationFrame(id);
  }, [calidad, mobile, setDpr, size.width, size.height, invalidate]);

  useFrame((_, rawDt) => {
    const p = perf.current;
    const continuous = isActive();
    if (!continuous && rawDt > 0.25) {
      // Pausa del render a demanda: empieza una ráfaga nueva.
      p.run = 0;
      p.sum = 0;
      return;
    }
    p.run++;
    p.sum += Math.min(rawDt, 1.5);
    // Ventana de medición: 50 cuadros, o 2,5 s si el equipo es muy lento.
    if (p.run < 50 && p.sum < 2.5) return;
    if (p.run < 4) return;
    const fps = p.run / p.sum;
    p.run = 0;
    p.sum = 0;
    const tier = TIERS.indexOf(useStore.getState().ui.calidad);
    if (fps < 27) {
      p.fast = 0;
      if (++p.slow >= 2 && tier > 0) {
        p.slow = 0;
        useStore.getState().setUi({ calidad: TIERS[tier - 1] });
      }
    } else if (fps > 57) {
      p.slow = 0;
      // Subir es más conservador (y limitado) para no oscilar.
      if (++p.fast >= 8 && tier < 2 && p.raises < 2) {
        p.fast = 0;
        p.raises++;
        useStore.getState().setUi({ calidad: TIERS[tier + 1] });
      }
    } else {
      p.slow = 0;
      p.fast = 0;
    }
  });
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
        <AdaptiveQuality mobile={mobile} />
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
