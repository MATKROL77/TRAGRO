import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { runtime } from './runtime';
import { KeyLight } from './StudioScene';
import { createGroundMaterial, loadTex } from './ground';
import { Tractor, TRACTOR } from './Tractor';
import { computeLayout, DIM } from '../machines/seeder/layout';
import { useWarmup, useWarmupObject } from '../render-kit/warmup';

const ROAD_W = 7.3;
const SHOULDER = 1.6;
/** velocidad y distancia en ruta (compartidas con el tractor) */
const roadSpeed = { v: 0, d: 0 };

/** Geometrías compartidas de la ruta (se crean una vez). */
let roadGeo: { ground: THREE.PlaneGeometry; road: THREE.PlaneGeometry; shoulder: THREE.PlaneGeometry; edge: THREE.PlaneGeometry; post: THREE.CylinderGeometry; sign: THREE.BoxGeometry; dashes: THREE.InstancedMesh } | null = null;
function getRoadGeo(paint: THREE.Material) {
  if (roadGeo) return roadGeo;
  const dashGeo = new THREE.PlaneGeometry(0.12, 4.5).rotateX(-Math.PI / 2);
  const zs: number[] = [];
  for (let z = -300; z < 300; z += 12) zs.push(z);
  // líneas discontinuas: un solo InstancedMesh (antes, 50 mallas y 50 geometrías por visita)
  const dashes = new THREE.InstancedMesh(dashGeo, paint, zs.length);
  const m = new THREE.Matrix4();
  zs.forEach((z, i) => dashes.setMatrixAt(i, m.makeTranslation(0, 0.004, z)));
  dashes.frustumCulled = false;
  roadGeo = {
    ground: new THREE.PlaneGeometry(900, 900),
    road: new THREE.PlaneGeometry(ROAD_W, 600),
    shoulder: new THREE.PlaneGeometry(SHOULDER, 600),
    edge: new THREE.PlaneGeometry(0.12, 600),
    post: new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8),
    sign: new THREE.BoxGeometry(0.7, 0.7, 0.03),
    dashes,
  };
  return roadGeo;
}

let roadMats: ReturnType<typeof buildRoadMaterials> | null = null;
/** Materiales de la ruta: se crean una vez (precarga) y se reutilizan en cada visita. */
function useRoadMaterials() {
  return useMemo(() => (roadMats ??= buildRoadMaterials()), []);
}

function buildRoadMaterials() {
  {
    const ac = loadTex('textures/asphalt_color.webp', true);
    const an = loadTex('textures/asphalt_normal.webp');
    const ar = loadTex('textures/asphalt_rough.webp');
    for (const t of [ac, an, ar]) t.repeat.set(ROAD_W / 3, 200);
    const asphalt = new THREE.MeshStandardMaterial({ map: ac, normalMap: an, roughnessMap: ar, roughness: 1, color: '#9a9a9a' });
    const gc = loadTex('textures/gravel_color.webp', true);
    const gn = loadTex('textures/gravel_normal.webp');
    for (const t of [gc, gn]) t.repeat.set(SHOULDER / 1.5, 400);
    const gravel = new THREE.MeshStandardMaterial({ map: gc, normalMap: gn, roughness: 0.95, color: '#b8b0a2' });
    const paint = new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.6 });
    const yellow = new THREE.MeshStandardMaterial({ color: '#e8b923', roughness: 0.6 });
    return { asphalt, gravel, paint, yellow };
  }
}

function RoadTractor() {
  const show = useStore((s) => s.showTractor);
  const ref = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Object3D[]>([]);
  const hitch = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const m = runtime.model;
    const g = ref.current;
    if (!m || !g) return;
    m.getHitch(hitch);
    g.position.set(hitch.x, 0, hitch.z + TRACTOR.hitchBehindAxle);
    g.visible = show && m.state.poseT > 0.985;
    wheels.current.forEach((w, i) => (w.rotation.x = roadSpeed.d / (i < 2 ? TRACTOR.rearR : TRACTOR.frontR)));
  });
  return <Tractor ref={ref} wheelRefs={wheels} />;
}

export default function RoadScene() {
  const { scene } = useThree();
  const config = useStore((s) => s.config);
  const mats = useRoadMaterials();
  const ground = useMemo(() => createGroundMaterial({ straw: 1 }), []);
  useEffect(() => {
    scene.fog = new THREE.Fog('#c9d3db', 80, 460);
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  // andando por la ruta: el mundo se desplaza (cinta), las ruedas giran
  const road = useRef({ d: 0, v: 0 });
  const dashGroup = useRef<THREE.Group>(null);
  const signGroup = useRef<THREE.Group>(null);
  const warm = useWarmup();
  useFrame((_, dt) => {
    if (warm) return;
    runtime.frames++;
    const st = useStore.getState();
    const m = runtime.model;
    const ready = !!m && m.state.poseT > 0.985;
    const target = st.sowing && ready ? 22 / 3.6 : 0;
    const step = Math.min(dt, 0.05) * runtime.timeScale;
    const r = road.current;
    r.v += (target - r.v) * (1 - Math.exp(-step * 0.8));
    if (target === 0 && r.v < 0.01) r.v = 0;
    if (r.v === 0) return;
    r.d += r.v * step;
    roadSpeed.v = r.v;
    roadSpeed.d = r.d;
    for (const t of [mats.asphalt.map, mats.asphalt.normalMap, mats.asphalt.roughnessMap]) if (t) t.offset.y = -r.d / 3;
    for (const t of [mats.gravel.map, mats.gravel.normalMap]) if (t) t.offset.y = -r.d / 1.5;
    ground.uniforms.uOffset.value = r.d;
    if (dashGroup.current) dashGroup.current.position.z = -(r.d % 12);
    if (signGroup.current) signGroup.current.position.z = 60 - (r.d % 140);
    m?.spinTransportWheels(r.d);
    runtime.invalidate();
  });
  const L = computeLayout(config);
  const machineX = L.transport === 'longitudinal' ? (DIM.rowFrontZ + DIM.rowRearZ) / 2 : 0;
  const roadX = machineX - ROAD_W / 4;
  const G = getRoadGeo(mats.paint);
  const warmDashes = useWarmupObject(G.dashes);
  const base = import.meta.env.BASE_URL;
  return (
    <>
      <Environment files={`${base}hdri/sky.hdr`} background environmentIntensity={0.85} />
      <hemisphereLight args={['#cfe0f2', '#7a6a50', 0.35]} />
      <KeyLight intensity={2.8} position={[-9, 14, 11]} color="#fff0db" />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow material={ground.material} geometry={G.ground} />
      <mesh rotation-x={-Math.PI / 2} position={[roadX, 0.0, 0]} receiveShadow material={mats.asphalt} geometry={G.road} />
      {[-1, 1].map((s) => (
        <mesh key={s} rotation-x={-Math.PI / 2} position={[roadX + s * (ROAD_W / 2 + SHOULDER / 2), -0.01, 0]} receiveShadow material={mats.gravel} geometry={G.shoulder} />
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`e${s}`} rotation-x={-Math.PI / 2} position={[roadX + s * (ROAD_W / 2 - 0.2), 0.004, 0]} material={mats.paint} geometry={G.edge} />
      ))}
      <group ref={dashGroup}>
        <group position={[roadX, 0, 0]}>
          {!warmDashes && <primitive object={G.dashes} dispose={null} />}
        </group>
      </group>
      {/* cartel de advertencia genérico */}
      <group ref={signGroup} position={[roadX + ROAD_W / 2 + SHOULDER + 0.8, 0, 14]}>
        <mesh position={[0, 1.2, 0]} material={mats.gravel} geometry={G.post} />
        <mesh position={[0, 2.3, 0]} rotation={[0, -0.4, Math.PI / 4]} material={mats.yellow} geometry={G.sign} />
      </group>
      <RoadTractor />
    </>
  );
}
