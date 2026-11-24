import { Suspense, lazy, useEffect } from 'react';
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

const FieldScene = lazy(() => import('./FieldScene'));
const RoadScene = lazy(() => import('./RoadScene'));
const RowUnitDetail = lazy(() => import('./RowUnitDetail'));

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
  useEffect(() => {
    setWear(1, scene === 'studio' ? 0.45 : 0.75);
  }, [scene]);
  return (
    <>
      {scene === 'studio' && <StudioScene />}
      {scene === 'field' && (
        <Suspense fallback={<StudioScene />}>
          <FieldScene />
        </Suspense>
      )}
      {scene === 'road' && (
        <Suspense fallback={<StudioScene />}>
          <RoadScene />
        </Suspense>
      )}
      {detail && (
        <Suspense fallback={null}>
          <RowUnitDetail />
        </Suspense>
      )}
    </>
  );
}

export default function Viewer() {
  const quality = useStore((s) => s.quality);
  const setQuality = useStore((s) => s.setQuality);
  const scene = useStore((s) => s.scene);
  const maxDpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio : 1);
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
      <PerformanceMonitor
        onDecline={() => setQuality(quality === 'high' ? 'medium' : 'low')}
        onIncline={() => quality === 'low' && setQuality('medium')}
        flipflops={3}
        onFallback={() => setQuality('low')}
      />
      <AdaptiveDpr pixelated={false} />
      <Suspense fallback={null}>
        <SceneSwitch />
        <MachineView />
        {scene !== 'field' && <TransportDims />}
        <Hotspots />
        <Ready />
      </Suspense>
      <CameraRig />
      <CaptureController />
      <PostFX />
    </Canvas>
  );
}
