import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { runtime } from './runtime';
import { useStore } from '../state/store';

/** Luz principal con sombra ajustada al tamaño de la máquina. */
export function KeyLight({ intensity = 2.2, position = [6, 11, 7] as [number, number, number], color = '#fff6ea' }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const quality = useStore((s) => s.quality);
  const config = useStore((s) => s.config);
  const pose = useStore((s) => s.pose);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    const m = runtime.model;
    const w = m ? Math.max(m.layout.barLength, m.layout.transportDims.length) : 10;
    const half = w / 2 + 3;
    const cam = l.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = 60;
    cam.updateProjectionMatrix();
    const res = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
    if (l.shadow.mapSize.x !== res) {
      l.shadow.mapSize.set(res, res);
      l.shadow.map?.dispose();
      (l.shadow as unknown as { map: null }).map = null;
    }
    l.shadow.needsUpdate = true;
  }, [config.rows, config.spacingCm, config.model, pose, quality]);
  return (
    <directionalLight
      ref={light}
      position={position}
      intensity={intensity}
      color={color}
      castShadow
      shadow-bias={-0.0004}
      shadow-normalBias={0.025}
      shadow-radius={4}
    />
  );
}

function StudioFloor() {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#f0e1cb', roughness: 0.95, metalness: 0 });
    return m;
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow material={mat}>
      <circleGeometry args={[90, 64]} />
    </mesh>
  );
}

export function StudioScene() {
  const { scene } = useThree();
  useEffect(() => {
    scene.fog = new THREE.Fog('#f2e4cf', 18, 70);
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  useFrame(() => {
    runtime.frames++;
  });
  const base = import.meta.env.BASE_URL;
  const formers = (
    <>
      <Lightformer form="rect" intensity={2.2} position={[0, 6, 4]} scale={[12, 3, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={1.2} position={[-8, 3, -2]} scale={[6, 4, 1]} target={[0, 0, 0]} />
      <Lightformer form="ring" intensity={1.5} position={[8, 4, -6]} scale={3} target={[0, 0, 0]} />
    </>
  );
  return (
    <>
      <color attach="background" args={['#f2e4cf']} />
      {/* la máquina aparece enseguida con luces simples; el HDR llega después */}
      <Suspense fallback={<Environment environmentIntensity={0.9} resolution={128}>{formers}</Environment>}>
        <Environment files={`${base}hdri/studio.hdr`} environmentIntensity={0.7} environmentRotation={[0, Math.PI / 3, 0]}>
          {formers}
        </Environment>
      </Suspense>
      <hemisphereLight args={['#ffffff', '#b9b5ad', 0.35]} />
      <KeyLight intensity={2.6} position={[-7, 7.5, -4.5]} color="#fff1dd" />
      <directionalLight position={[6, 5, 9]} intensity={0.9} color="#fff6ea" />
      <directionalLight position={[-8, 5, -6]} intensity={0.55} color="#dfe8ff" />
      <StudioFloor />
    </>
  );
}
