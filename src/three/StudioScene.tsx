import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { runtime } from './runtime';
import { useStore } from '../state/store';
import { QUALITY_PRESETS } from '../render-kit/quality';
import { ModelContactShadows, SharedEnvironment, useExposure } from '../render-kit/lighting';

/** Colores del estudio: el piso y la niebla terminan en el mismo tono que la base del fondo. */
const STUDIO_TOP = '#f8f3ea';
const STUDIO_FLOOR = '#ece1d1';

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
    const res = QUALITY_PRESETS[quality].shadowMapSize;
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
    const m = new THREE.MeshStandardMaterial({ color: STUDIO_FLOOR, roughness: 0.95, metalness: 0 });
    return m;
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow material={mat}>
      <circleGeometry args={[90, 64]} />
    </mesh>
  );
}

let domeMat: THREE.ShaderMaterial | null = null;
let domeGeo: THREE.SphereGeometry | null = null;
/** Cúpula de estudio: degradé vertical (horizonte = color del piso, arriba más claro), sin costura. */
function StudioDome() {
  const mat = useMemo(
    () =>
      (domeMat ??= new THREE.ShaderMaterial({
        name: 'studioDome',
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { cHorizon: { value: new THREE.Color(STUDIO_FLOOR) }, cTop: { value: new THREE.Color(STUDIO_TOP) } },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 cHorizon; uniform vec3 cTop; varying vec3 vDir; void main(){ float t = smoothstep(0.02, 0.65, vDir.y); gl_FragColor = vec4(mix(cHorizon, cTop, t), 1.0); \n#include <colorspace_fragment>\n}',
      })),
    [],
  );
  const geo = useMemo(() => (domeGeo ??= new THREE.SphereGeometry(85, 32, 16)), []);
  return <mesh geometry={geo} material={mat} renderOrder={-1} frustumCulled={false} dispose={null} />;
}

/** Sombras de contacto bajo la máquina (alto/medio): se recalculan sólo cuando la máquina cambia o termina de plegarse. */
function StudioContactShadows() {
  return (
    <ModelContactShadows
      size={36}
      opacity={0.55}
      blur={2.4}
      far={1.4}
      version={() => runtime.modelVersion * 2 + ((runtime.model?.state.poseT ?? 0) > 0.5 ? 1 : 0)}
      settled={() => {
        const t = runtime.model?.state.poseT ?? 0;
        return t < 0.001 || t > 0.999;
      }}
    />
  );
}

export function StudioScene() {
  const { scene } = useThree();
  useEffect(() => {
    const prev = scene.fog;
    // FogExp2 en todas las escenas: mismas variantes de shader (lo precompilado sirve en Estudio, Campo y Ruta)
    scene.fog = new THREE.FogExp2(STUDIO_FLOOR, 0.024);
    runtime.studioMounted = true;
    return () => {
      // al volver de una captura en estudio, se recupera la niebla de Campo/Ruta
      scene.fog = prev;
      runtime.studioMounted = false;
    };
  }, [scene]);
  useFrame(() => {
    runtime.frames++;
  });
  useExposure(1.0);
  const quality = useStore((s) => s.quality);
  const contact = quality !== 'low';
  const detail = useStore((s) => s.detail);
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
      {/* fondo en degradé suave (no gris plano): en el horizonte, el mismo tono que la niebla del piso */}
      <color attach="background" args={[STUDIO_FLOOR]} />
      <StudioDome />
      {/* la máquina aparece enseguida con luces simples; el HDR llega después */}
      <Suspense fallback={<Environment environmentIntensity={0.9} resolution={128}>{formers}</Environment>}>
        {/* HDR directo (sin lightformers hijos): drei no re-renderiza un entorno propio en cada montaje,
            así volver a Estudio no recompila nada */}
        <SharedEnvironment files={`${base}hdri/studio.hdr`} environmentIntensity={0.95} environmentRotation={[0, Math.PI / 3, 0]} />
      </Suspense>
      <hemisphereLight args={['#ffffff', '#b9b5ad', 0.35]} />
      <KeyLight intensity={2.6} position={[-7, 7.5, -4.5]} color="#fff1dd" />
      <directionalLight position={[6, 5, 9]} intensity={0.9} color="#fff6ea" />
      <directionalLight position={[-8, 5, -6]} intensity={0.55} color="#dfe8ff" />
      {/* luz de contorno: separa la silueta de la máquina del fondo */}
      <directionalLight position={[7, 6, -10]} intensity={0.85} color="#eef3ff" />
      <StudioFloor />
      {/* en el detalle del cuerpo la máquina está oculta: su sombra de contacto también */}
      {contact && !detail && <StudioContactShadows />}
    </>
  );
}
