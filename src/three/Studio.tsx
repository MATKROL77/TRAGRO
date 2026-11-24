import { useMemo } from 'react';
import * as THREE from 'three';
import { Environment, Lightformer } from '@react-three/drei';

export const STUDIO_BG_TOP = '#b9bec5';
export const STUDIO_BG_BOTTOM = '#dfe1e4';

/** Fondo en degradé vertical: evita la línea de horizonte del estudio. */
function Backdrop({ top, bottom }: { top: string; bottom: string }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uTop: { value: new THREE.Color(top) }, uBottom: { value: new THREE.Color(bottom) } },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 uTop; uniform vec3 uBottom; varying vec3 vDir; void main(){ float t = smoothstep(-0.05, 0.55, vDir.y); gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0); }',
      }),
    [top, bottom],
  );
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[300, 32, 16]} />
    </mesh>
  );
}

/** Piso "infinito": disco que se funde con el fondo y recibe sombras. */
function Floor({ color }: { color: string }) {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, transparent: true });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFloorPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloorPos = position.xy;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFloorPos;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= 1.0 - smoothstep(22.0, 58.0, length(vFloorPos));');
    };
    return m;
  }, [color]);
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow material={mat} renderOrder={-5}>
      <circleGeometry args={[60, 64]} />
    </mesh>
  );
}

export function Studio() {
  return (
    <>
      <Backdrop top={STUDIO_BG_TOP} bottom={STUDIO_BG_BOTTOM} />
      <Floor color="#c9ccd0" />
      {/* HDRI de estudio local + softboxes para dibujar reflejos largos sobre la caja. */}
      <Environment files="/assets/hdri/studio_512.hdr" resolution={512} frames={1} environmentIntensity={0.62} environmentRotation={[0, Math.PI * 0.62, 0]}>
        <Lightformer form="rect" intensity={5} color="#ffffff" position={[0, 14, 0]} rotation-x={Math.PI / 2} scale={[34, 5, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#fff4e6" position={[10, 5, 22]} rotation-y={Math.PI} scale={[30, 7, 1]} />
        <Lightformer form="rect" intensity={1.3} color="#e6eeff" position={[-24, 6, -4]} rotation-y={Math.PI / 2} scale={[16, 8, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#ffffff" position={[26, 4, -6]} rotation-y={-Math.PI / 2} scale={[14, 6, 1]} />
        <Lightformer form="rect" intensity={0.0} color="#000000" position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[80, 80, 1]} />
      </Environment>
      <directionalLight
        position={[10, 17, 12]}
        intensity={2.9}
        color="#fff3e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.03}
        shadow-radius={6}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-camera-near={1}
        shadow-camera-far={50}
      />
      <directionalLight position={[-12, 7, -9]} intensity={0.5} color="#dfe8ff" />
    </>
  );
}
