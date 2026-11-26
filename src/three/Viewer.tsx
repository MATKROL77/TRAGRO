import { Suspense, lazy, useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { PerformanceMonitor, AdaptiveDpr } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { MachineView } from './MachineView';
import { CameraRig } from './CameraRig';
import { StudioScene } from './StudioScene';
import { PostFX } from './PostFX';
import { runtime, touchInteraction } from './runtime';
import { CaptureController } from './capture';
import { Hotspots } from './Hotspots';
import { TransportDims } from './TransportDims';
import { setWear } from './materials';
import { QUALITY_PRESETS, detectQuality, fpsBounds, higher, isMobileDevice, lower } from '../render-kit/quality';
import { SceneWarmup, type WarmupStats } from '../render-kit/warmup';
import { Line } from '@react-three/drei';

const FieldScene = lazy(() => import('./FieldScene'));
const RoadScene = lazy(() => import('./RoadScene'));
const RowUnitDetail = lazy(() => import('./RowUnitDetail'));
/** ?debug=1: r3f-perf y medición de cuadros (import dinámico: fuera del bundle principal). */
const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
const DebugTools = DEBUG ? lazy(() => import('../render-kit/debug/DebugTools')) : null;

/** Invalida el frame ante cualquier cambio del store (frameloop="demand"). */
function StoreInvalidator() {
  const { invalidate, gl, scene } = useThree();
  useEffect(() => {
    runtime.invalidate = invalidate;
    const dbg = (window as unknown as { __sp?: Record<string, unknown> }).__sp;
    if (dbg) {
      dbg.scene = scene;
      dbg.gl = gl;
    }
    const unsub = useStore.subscribe(() => invalidate());
    const lost = (e: Event) => {
      e.preventDefault();
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      unsub();
      gl.domElement.removeEventListener('webglcontextlost', lost);
    };
  }, [invalidate, gl, scene]);
  return null;
}

function Ready() {
  const setViewerReady = useStore((s) => s.setViewerReady);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setViewerReady(true)));
    return () => cancelAnimationFrame(id);
  }, [setViewerReady]);
  return null;
}

function SceneSwitch() {
  const scene = useStore((s) => s.scene);
  const detail = useStore((s) => s.detail);
  const override = useStore((s) => s.studioOverride);
  const studio = scene === 'studio' || override;
  useEffect(() => {
    setWear(1, studio ? 0.45 : 0.75);
  }, [studio]);
  return (
    <>
      {studio && <StudioScene />}
      {/* Campo/Ruta quedan montados (no se pierde su estado) pero ocultos mientras se capturan vistas en estudio */}
      <group visible={!override}>
        {scene === 'field' && (
          <Suspense fallback={override ? null : <StudioScene />}>
            <FieldScene />
          </Suspense>
        )}
        {scene === 'road' && (
          <Suspense fallback={override ? null : <StudioScene />}>
            <RoadScene />
          </Suspense>
        )}
      </group>
      {detail && (
        <Suspense fallback={null}>
          <RowUnitDetail />
        </Suspense>
      )}
    </>
  );
}

/** Precarga y precompila Campo y Ruta en segundo plano mientras el usuario está en Estudio. */
const NO_WARM = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('warm') === '0';
function Warmup() {
  if (NO_WARM) return null; // ?warm=0: sin precarga (para comparar en el benchmark)
  return <WarmupInner />;
}
function WarmupInner() {
  const scene = useStore((s) => s.scene);
  const detail = useStore((s) => s.detail);
  const override = useStore((s) => s.studioOverride);
  const targets = useMemo(
    () => [
      { id: 'field', element: <FieldScene /> },
      {
        id: 'road',
        element: (
          <>
            <RoadScene />
            {/* las cotas de transporte (Line2) aparecen en Ruta: se compila su shader con la niebla de la ruta */}
            <Line points={[[0, 0, 0], [1, 0, 0]]} color="#1f9d55" lineWidth={2.5} />
          </>
        ),
      },
    ],
    [],
  );
  return (
    <SceneWarmup
      targets={targets}
      paused={scene !== 'studio' || detail || override}
      extraObjects={() => (runtime.model ? [runtime.model.root] : [])}
      onDone={(s: WarmupStats[]) => {
        runtime.warmup = s;
      }}
    />
  );
}

/** Nivel inicial según la GPU (detect-gpu, después del primer cuadro) y ajuste automático por fps. */
function AdaptiveQuality() {
  const quality = useStore((s) => s.quality);
  const auto = useStore((s) => s.qualityAuto);
  const max = useStore((s) => s.qualityMax);
  const ready = useStore((s) => s.viewerReady);
  useEffect(() => {
    if (!ready || !auto) return;
    let alive = true;
    detectQuality(`${import.meta.env.BASE_URL}detect-gpu`).then((d) => {
      if (!alive) return;
      const st = useStore.getState();
      st.setQualityInfo({ max: d.max, gpu: d.gpu });
      if (st.qualityAuto) st.setQuality(d.level);
    });
    return () => {
      alive = false;
    };
  }, [ready, auto]);
  if (!auto) return null;
  const set = useStore.getState().setQuality;
  return (
    <PerformanceMonitor
      bounds={fpsBounds(isMobileDevice())}
      flipflops={3}
      onDecline={() => set(lower(quality))}
      onIncline={() => set(higher(quality, max))}
      onFallback={() => set('low')}
    />
  );
}

export default function Viewer() {
  const quality = useStore((s) => s.quality);
  const scene = useStore((s) => s.scene);
  const maxDpr = Math.min(QUALITY_PRESETS[quality].dpr, typeof window !== 'undefined' ? window.devicePixelRatio : 1);
  return (
    <Canvas
      shadows="soft"
      frameloop="demand"
      dpr={[1, maxDpr]}
      camera={{ fov: 38, near: 0.1, far: 400, position: [9, 4, 10] }}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.AgXToneMapping, preserveDrawingBuffer: false, stencil: false }}
      onPointerDown={touchInteraction}
      onWheel={touchInteraction}
      aria-label="3D"
    >
      <StoreInvalidator />
      <AdaptiveQuality />
      <AdaptiveDpr pixelated={false} />
      <Suspense fallback={null}>
        <SceneSwitch />
        <MachineView />
        {scene !== 'field' && <TransportDims />}
        <Hotspots />
        <Ready />
        <Warmup />
      </Suspense>
      <CameraRig />
      <CaptureController />
      <PostFX />
      {DebugTools && (
        <Suspense fallback={null}>
          <DebugTools />
        </Suspense>
      )}
    </Canvas>
  );
}
