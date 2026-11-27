import { lazy, Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { useStore } from '@/state/store';
import { isActive } from './activity';
import { poseFor } from './camera';
import { CameraRig, FOV, rigLock } from './CameraRig';
import { composerRef } from './composerRef';
import { Hotspots } from './Hotspots';
import { Preloader } from './Preloader';
import { Scene } from './Scene';
import { Tractor } from './Tractor';
import { TrailerObject, buildTimes, currentModel } from './TrailerObject';
import { registerViewer, type SnapshotOptions } from './viewerApi';

import { installFrameStats } from '@/render-kit/debug/frameStats';
import { AdaptiveQuality } from '@/render-kit/quality/AdaptiveQuality';
import { detectTier } from '@/render-kit/quality/detectTier';
import { TIERS } from '@/render-kit/quality/tiers';
import { workerStats } from './modelBuilder';
import { frameCrossfade } from '@/render-kit/transition/FrameCrossfade';
import { vehicleClock } from './vehicleBus';
import { FrameAccumulator, applyJitter } from '@/render-kit/refine/accumulator';
import { findShadowLight, refineState } from '@/render-kit/refine/ProgressiveRefine';
import { tierSettings } from '@/render-kit/quality/tiers';

let snapAcc: FrameAccumulator | null = null;

// El postprocesado (≈160 KB) se baja aparte, en paralelo con el HDRI: no pesa en la carga inicial.
const Effects = lazy(() => import('./Effects'));
// Panel de rendimiento: solo con ?debug=1 (chunk aparte, no entra en el bundle principal).
const PerfOverlay = lazy(() => import('@/render-kit/debug/PerfOverlay'));
// Camión circulando en la ruta: se carga con la escena (chunk aparte).
const RouteController = lazy(() => import('./RouteController'));
const DEBUG = typeof window !== 'undefined' && /[?&]debug(=1|&|$)/.test(window.location.search);
/** El benchmark (bench/bench.cjs) pide las muestras por cuadro antes de cargar la página. */
const BENCH = typeof window !== 'undefined' && (window as unknown as { __benchRec?: boolean }).__benchRec === true;

const MAX_PIXELS = 9_000_000;

function Bridge({ overlay }: { overlay: React.RefObject<HTMLCanvasElement> }) {
  const state = useThree();
  const ref = useRef(state);
  ref.current = state;
  const fps = useRef({ frames: 0, last: performance.now(), value: 0, total: 0 });

  // Estadísticas por cuadro completo (sombras + escena + postprocesado), no por pasada.
  useEffect(() => {
    state.gl.info.autoReset = false;
  }, [state.gl]);
  const lastInfo = useRef({ calls: 0, triangles: 0 });
  useFrame(({ gl }) => {
    lastInfo.current = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    gl.info.reset();
  }, -100);

  // Muestras por cuadro para el benchmark (sin costo si no se piden).
  const frameStats = useRef(BENCH ? installFrameStats(state.gl) : null);
  useEffect(() => {
    if (frameStats.current) (window as unknown as { __frameStats: unknown }).__frameStats = frameStats.current;
  }, []);
  useFrame(() => frameStats.current?.beginFrame(), -1000);

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
      vehicleClock.paused = true;
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
        vehicleClock.paused = false;
      }
      return url;
    };

    /** Igual que snapshot, pero promediando muestras con jitter hasta `maxMs`. */
    const snapshotRefined = async (o: SnapshotOptions, maxMs: number, onProgress?: (p: number) => void): Promise<string | null> => {
      const { gl, camera, controls, size, advance, scene } = get();
      const model = currentModel.value;
      const c = controls as unknown as OrbitImpl | null;
      if (!model || !c) return snapshot(o);
      const cam = camera as THREE.PerspectiveCamera;
      const saved = { pos: cam.position.clone(), quat: cam.quaternion.clone(), target: c.target.clone(), dpr: gl.getPixelRatio(), damping: c.enableDamping, auto: c.autoRotate };
      const canvasAspect = size.width / size.height;
      const cropAspect = o.width / o.height;
      const cropW = cropAspect < canvasAspect ? size.height * cropAspect : size.width;
      const cropH = cropAspect < canvasAspect ? size.height : size.width / cropAspect;
      let dpr = Math.max(1, o.width / cropW);
      dpr = Math.min(dpr, 4, Math.sqrt(MAX_PIXELS / (size.width * size.height)));
      const view = cam.view?.enabled ? { ...cam.view } : null;
      if (view) cam.clearViewOffset();
      rigLock.locked = true;
      vehicleClock.paused = true;
      refineState.suspended = true;
      c.enableDamping = false;
      c.autoRotate = false;
      let url: string | null = null;
      const samples = tierSettings(useStore.getState().ui.calidad).refine.samples;
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
        snapAcc ??= new FrameAccumulator();
        snapAcc.reset();
        const t0 = performance.now();
        const light = findShadowLight(scene);
        const W = size.width * dpr;
        const H = size.height * dpr;
        for (let i = 0; i < Math.max(1, samples); i++) {
          const restore = applyJitter({ camera: cam, light, lightRadius: tierSettings(useStore.getState().ui.calidad).refine.lightRadius, aperture: 0, focusDistance: 20 }, i, W, H);
          advance(performance.now());
          restore();
          snapAcc.add(gl);
          onProgress?.((i + 1) / samples);
          if (performance.now() - t0 > maxMs) break;
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }
        // El promedio a pantalla y de ahí, recortado, a la imagen (en la misma tarea).
        advance(performance.now());
        snapAcc.present(gl);
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
        refineState.suspended = false;
        advance(performance.now());
        vehicleClock.paused = false;
      }
      return url;
    };

    registerViewer({
      snapshotRefined,
      renderNow: () => get().advance(performance.now()),
      invalidate: () => get().invalidate(),
      crossfade: (ms = 260) => {
        const el = overlay.current;
        const { gl, advance } = get();
        if (!el || useStore.getState().ui.reducedMotion) return;
        // Copia del cuadro dentro de la GPU (sin leer píxeles): no frena la placa.
        if (frameCrossfade.available && frameCrossfade.start(ms)) return;
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
    // Avance manual del render (video cuadro a cuadro, determinístico): solo con ?debug o en el benchmark.
    if (DEBUG || BENCH) Object.assign(window as unknown as Record<string, unknown>, { __advance: (dt: number) => {
        // Relativo al reloj actual: al pasar a 'never', R3F puede dejar el reloj en ms (cuadro pendiente con la marca de requestAnimationFrame).
        const st = get();
        st.advance(st.clock.elapsedTime + dt);
      }, __frameloop: (m: 'always' | 'demand' | 'never') => get().setFrameloop(m), __canvas: () => get().gl.domElement });
    if (DEBUG || BENCH) (window as unknown as { __progKeys: unknown }).__progKeys = () => (get().gl.info.programs ?? []).map((pr) => `${pr.name}|${pr.cacheKey}`);
    (window as unknown as { __viewer: unknown }).__viewer = { stats: () => ({ ...get().gl.info.memory, ...lastInfo.current, fps: fps.current.value, frames: fps.current.total, programs: get().gl.info.programs?.length ?? 0, buildMs: buildTimes.slice(), modelTriangles: currentModel.value?.stats.triangles ?? 0, modelMeshes: currentModel.value?.stats.meshes ?? 0, modelKey: currentModel.value?.key ?? '', worker: { ...workerStats } }), camera: () => ({ position: get().camera.position.toArray(), target: (get().controls as unknown as OrbitImpl | null)?.target.toArray() }) };
    return () => registerViewer(null);
  }, [overlay]);
  return null;
}

/** Calidad adaptativa (render-kit) conectada al estado de la app, con el nivel inicial según la GPU. */
function Quality() {
  const tier = useStore((s) => s.ui.calidad);
  const locked = useStore((s) => s.ui.calidadFija);
  // En la ruta el camión circula: render continuo, PerformanceMonitor de drei.
  const continuous = useStore((s) => s.ui.env === 'ruta' && s.ui.vehiculo !== 'DETENIDO' && s.ui.vehiculo !== 'ABIERTO');
  const size = useThree((s) => s.size);
  useEffect(() => {
    if (useStore.getState().ui.calidadFija) return;
    void detectTier().then((d) => {
      (window as unknown as { __gpu: unknown }).__gpu = d;
      const st = useStore.getState();
      // Ya con el primer cuadro en pantalla solo se baja (subir recrearía el postprocesado de golpe).
      if (st.ui.calidadFija) return;
      if (!st.ready || TIERS.indexOf(d.tier) < TIERS.indexOf(st.ui.calidad)) st.setUi({ calidad: d.tier });
    });
  }, []);
  return (
    <AdaptiveQuality
      tier={tier}
      locked={locked}
      continuous={continuous}
      onChange={(t) => useStore.getState().setUi({ calidad: t })}
      isActive={isActive}
      onResolution={() => composerRef.current?.setSize(size.width, size.height)}
    />
  );
}

/** El controlador del camión existe solo con la ruta a la vista. */
function RouteMount() {
  const ruta = useStore((s) => s.ui.env === 'ruta');
  return ruta ? (
    <Suspense fallback={null}>
      <RouteController />
    </Suspense>
  ) : null;
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
      (window as unknown as { __readyAt: number }).__readyAt = performance.now();
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
        performance={{ min: 0.75, max: 1, debounce: 400 }}
        gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.NoToneMapping, stencil: false, alpha: false }}
        camera={{ fov: FOV, near: 0.25, far: 900, position: [12, 4.2, 12.5] }}
        onCreated={({ gl }) => gl.setClearColor('#e3ddd3')}
      >
        <Quality />
        <Suspense fallback={null}>
          <Scene />
          <TrailerObject />
          <Tractor />
          <Hotspots />
          {/* Dentro del mismo Suspense: el equipo aparece ya con su tono final, sin destello. */}
          <Effects />
          <ReadySignal />
        </Suspense>
        <CameraRig />
        <Bridge overlay={overlay} />
        <Preloader />
        <RouteMount />
        {DEBUG ? (
          <Suspense fallback={null}>
            <PerfOverlay />
          </Suspense>
        ) : null}
      </Canvas>
      <canvas ref={overlay} className="viewer-fade" aria-hidden="true" />
    </div>
  );
}
