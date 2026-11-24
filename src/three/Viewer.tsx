import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Effects } from './Effects';
import { Studio } from './Studio';
import { TrailerObject, useGeometryCrossfade } from './TrailerObject';
import { registerViewer } from './viewerApi';

function Bridge({ overlay }: { overlay: React.RefObject<HTMLCanvasElement> }) {
  const state = useThree();
  const ref = useRef(state);
  ref.current = state;
  useGeometryCrossfade();
  useEffect(() => {
    const get = () => ref.current;
    registerViewer({
      renderNow: () => get().advance(performance.now()),
      invalidate: () => get().invalidate(),
      crossfade: (ms = 260) => {
        const el = overlay.current;
        const { gl, advance } = get();
        if (!el) return;
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
      snapshot: () => null,
      stats: () => {
        const i = get().gl.info;
        return { triangles: i.render.triangles, calls: i.render.calls, geometries: i.memory.geometries, textures: i.memory.textures, fps: 0 };
      },
    });
    (window as unknown as { __cam: unknown }).__cam = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
      const { camera, controls, invalidate } = get();
      camera.position.set(x, y, z);
      const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
      c?.target.set(tx, ty, tz);
      c?.update();
      invalidate();
    };
    return () => registerViewer(null);
  }, [overlay]);
  return null;
}

export function Viewer() {
  const overlay = useRef<HTMLCanvasElement>(null);
  return (
    <div className="viewer">
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={[1, 2]}
        frameloop="demand"
        gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.NoToneMapping, stencil: false }}
        camera={{ fov: 30, near: 0.3, far: 700, position: [11.5, 4.2, 12.5] }}
      >
        <Suspense fallback={null}>
          <Studio />
          <TrailerObject />
        </Suspense>
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} target={[0, 1.7, 0]} maxPolarAngle={Math.PI / 2 - 0.03} minDistance={3} maxDistance={45} />
        <Effects />
        <Bridge overlay={overlay} />
      </Canvas>
      <canvas ref={overlay} className="viewer-fade" aria-hidden="true" />
    </div>
  );
}
