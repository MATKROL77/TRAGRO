/**
 * Carga progresiva de modelos GLB del pipeline (`npm run models:build`).
 *
 *   <ProgressiveModel name="seeder" />   → public/models/seeder.low.glb y luego seeder.glb
 *
 * 1. Muestra primero `<name>.low.glb` (geometría simplificada, texturas ≤1024: llega rápido).
 * 2. Carga `<name>.glb` en segundo plano y, cuando está listo, lo muestra con un fundido de 300 ms
 *    y quita el liviano.
 * Soporta meshopt (EXT_meshopt_compression) y KTX2 (KHR_texture_basisu) con el cargador compartido.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { GLTFLoader } from 'three-stdlib';
import { getKTX2Loader } from './textures';

const base = () => `${import.meta.env.BASE_URL}models/`;
const extend = (loader: GLTFLoader) => {
  const k = getKTX2Loader();
  if (k) loader.setKTX2Loader(k as never);
};

function Model({ url, fadeIn, onShown }: { url: string; fadeIn?: boolean; onShown?: () => void }) {
  const gltf = useGLTF(url, false, true, extend);
  const scene = useMemo(() => gltf.scene, [gltf]);
  const fade = useRef(fadeIn ? 0 : 1);
  const mats = useMemo(() => {
    const list: { m: THREE.Material; opacity: number; transparent: boolean }[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = true;
      for (const m of ([] as THREE.Material[]).concat(mesh.material)) list.push({ m, opacity: m.opacity, transparent: m.transparent });
    });
    return list;
  }, [scene]);
  useEffect(() => {
    if (!fadeIn) {
      onShown?.();
      return;
    }
    for (const x of mats) {
      x.m.transparent = true;
      x.m.opacity = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mats, fadeIn]);
  useFrame((state, dt) => {
    if (fade.current >= 1) return;
    fade.current = Math.min(1, fade.current + dt / 0.3);
    for (const x of mats) x.m.opacity = x.opacity * fade.current;
    if (fade.current >= 1) {
      for (const x of mats) {
        x.m.transparent = x.transparent;
        x.m.opacity = x.opacity;
        x.m.needsUpdate = true;
      }
      onShown?.();
    } else state.invalidate();
  });
  return <primitive object={scene} />;
}

export function ProgressiveModel({ name, ...props }: { name: string } & JSX.IntrinsicElements['group']) {
  const [fullShown, setFullShown] = useState(false);
  return (
    <group {...props}>
      {!fullShown && (
        <Suspense fallback={null}>
          <Model url={`${base()}${name}.low.glb`} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <Model url={`${base()}${name}.glb`} fadeIn onShown={() => setFullShown(true)} />
      </Suspense>
    </group>
  );
}
