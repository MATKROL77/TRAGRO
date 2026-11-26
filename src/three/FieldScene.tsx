import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { runtime } from './runtime';
import { KeyLight } from './StudioScene';
import { SKY_HORIZON, SKY_ROT_Y, SKY_SUN_DIR, SharedEnvironment, sunPosition, useExposure } from '../render-kit/lighting';
import { createGroundMaterial } from './ground';
import { getFieldSim } from './fieldSim';
import { useWarmup, useWarmupObject } from '../render-kit/warmup';
import { Tractor, TRACTOR } from './Tractor';
import { getCrop } from '../domain/agronomy';
import { computeLayout } from '../machines/seeder/layout';
import { getMaterials } from './materials';
import { DustEmitter, StrawField, fieldHorizon } from './fieldDetail';
import { QUALITY_PRESETS } from '../render-kit/quality';
import { ROW } from '../machines/seeder/rowUnit';


/** Horizonte: cortinas de árboles, alambrado, silos y galpón (instanciados; se construyen una vez) + molino. */
let millGroup: THREE.Group | null = null;
function Horizon() {
  const g = useMemo(() => fieldHorizon(), []);
  const mill = useMemo(() => (millGroup ??= buildMill()), []);
  const warmA = useWarmupObject(g);
  const warmB = useWarmupObject(mill);
  useFrame((_, dt) => {
    (mill.userData.fan as THREE.Group).rotation.z += dt * 1.2;
  });
  return warmA || warmB ? null : (
    <>
      <primitive object={g} dispose={null} />
      <primitive object={mill} dispose={null} />
    </>
  );
}

function buildMill(): THREE.Group {
  const mats = getMaterials();
  const mill = new THREE.Group();
  const leg = new THREE.CylinderGeometry(0.08, 0.12, 11, 6);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const m = new THREE.Mesh(leg, mats.galvanized);
    m.position.set(x * 0.9, 5.5, z * 0.9);
    m.rotation.set(-z * 0.08, 0, x * 0.08);
    mill.add(m);
  }
  const fan = new THREE.Group();
  const blade = new THREE.BoxGeometry(0.25, 1.6, 0.02);
  for (let i = 0; i < 16; i++) {
    const b = new THREE.Mesh(blade, mats.galvanized);
    b.position.y = 1.0;
    const piv = new THREE.Group();
    piv.rotation.z = (i / 16) * Math.PI * 2;
    piv.add(b);
    fan.add(piv);
  }
  fan.position.set(0, 11.2, 0.4);
  mill.add(fan);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 2.2), mats.galvanized);
  tail.position.set(0, 11.2, -1.4);
  mill.add(tail);
  mill.position.set(95, 0, 170);
  mill.userData.fan = fan;
  return mill;
}

let straw: StrawField | null = null;
let dust: DustEmitter | null = null;
/** Rastrojo 3D y polvo (densidad según calidad; polvo sólo en alto y medio). */
function FieldDetail() {
  const quality = useStore((s) => s.quality);
  const config = useStore((s) => s.config);
  const st = useMemo(() => (straw ??= new StrawField()), []);
  const du = useMemo(() => (dust ??= new DustEmitter()), []);
  const warmA = useWarmupObject(st.mesh);
  const warmB = useWarmupObject(du.mesh);
  const lay = useMemo(() => computeLayout(config), [config]);
  useEffect(() => {
    st.setDensity(QUALITY_PRESETS[quality].detailDensity);
    st.update(runtime.distance, true);
  }, [quality, st]);
  useEffect(() => () => du.clear(), [du]);
  useFrame((_, dt) => {
    if (warmA) return;
    st.update(runtime.distance);
    if (quality !== 'low') {
      const step = Math.min(dt, 0.05) * runtime.timeScale;
      if (du.update(step, runtime.speed, lay.rowX, ROW.closing.z - 0.2)) runtime.invalidate();
    }
  });
  if (warmA || warmB) return null;
  return (
    <>
      <primitive object={st.mesh} dispose={null} />
      {quality !== 'low' && <primitive object={du.mesh} dispose={null} />}
    </>
  );
}

function SowingSim() {
  const config = useStore((s) => s.config);
  const field = useStore((s) => s.field);
  const warm = useWarmup();
  // simulación única (precargada): se reinicia al entrar, no se recrea
  const sim = useMemo(() => {
    const lay = computeLayout(useStore.getState().config);
    const crop = getCrop(useStore.getState().field.crop);
    return getFieldSim({ rowX: lay.rowX, spacing: lay.spacing, seedsPerM: useStore.getState().field.seedsPerM, sectionControl: false, seedColor: crop.color, seedShape: crop.shape }, runtime.distance);
  }, []);
  useEffect(() => {
    const dbg = (window as unknown as { __sp?: Record<string, unknown> }).__sp;
    if (dbg && !warm) dbg.sim = sim;
  }, [sim, warm]);
  useEffect(() => {
    const lay = computeLayout(config);
    const crop = getCrop(field.crop);
    sim.setParams(
      { rowX: lay.rowX, spacing: lay.spacing, seedsPerM: field.seedsPerM, sectionControl: config.selections.sectionControl === 'on', seedColor: crop.color, seedShape: crop.shape },
      runtime.distance,
    );
  }, [config, field.crop, field.seedsPerM, sim]);
  useFrame((_, dt) => {
    if (warm) return; // precarga: sólo se compila/sube a la GPU, sin simular
    const st = useStore.getState();
    const target = st.sowing && st.pose === 'work' && !st.detail ? st.field.speedKmh / 3.6 : 0;
    const step = Math.min(dt, 0.05) * runtime.timeScale;
    const k = 1 - Math.exp(-step * 1.6);
    runtime.speed += (target - runtime.speed) * k;
    if (runtime.speed < 0.005 && target === 0) runtime.speed = 0;
    // llega exacto a la velocidad elegida (el panel en vivo y la tarjeta muestran lo mismo)
    if (target > 0 && Math.abs(target - runtime.speed) < 0.004) runtime.speed = target;
    runtime.distance += runtime.speed * step;
    sim.update(step, runtime.distance, runtime.speed > 0.01);
    const s = sim.getStats();
    runtime.sim.savedM2 = s.savedM2;
    runtime.sim.overlapM2 = s.overlapM2;
    runtime.sim.headlandActive = s.inHeadland;
    runtime.sim.activeRows = s.activeRows;
    runtime.sim.headlandPct = s.headlandPct;
    if (runtime.speed > 0 || target > 0) runtime.invalidate();
  });
  const warmObj = useWarmupObject(sim.group);
  return warmObj ? null : <primitive object={sim.group} dispose={null} />;
}

function FieldTractor() {
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
    g.visible = show && m.state.poseT < 0.02;
    wheels.current.forEach((w, i) => {
      const r = i < 4 ? TRACTOR.rearR : TRACTOR.frontR;
      w.rotation.x = runtime.distance / r;
    });
  });
  return <Tractor ref={ref} wheelRefs={wheels} />;
}

let plane: THREE.PlaneGeometry | null = null;
const fieldPlane = () => (plane ??= new THREE.PlaneGeometry(900, 900, 1, 1));

export default function FieldScene() {
  const { scene } = useThree();
  const stubble = useStore((s) => s.stubble);
  const ground = useMemo(() => createGroundMaterial({ straw: stubble === 'soy' ? 0.75 : 0.95 }), [stubble]);
  useEffect(() => {
    // neblina exponencial del tono del horizonte (FogExp2)
    scene.fog = new THREE.FogExp2(SKY_HORIZON, 0.0042);
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  const warmScene = useWarmup();
  useExposure(0.95);
  useFrame(() => {
    if (warmScene) return;
    ground.uniforms.uOffset.value = runtime.distance;
    runtime.frames++;
  });
  const base = import.meta.env.BASE_URL;
  return (
    // dispose={null}: geometrías/materiales/texturas compartidos (cacheados); R3F no debe liberarlos al desmontar
    <group dispose={null}>
      <SharedEnvironment files={`${base}hdri/sky.hdr`} background environmentIntensity={0.7} backgroundIntensity={1} backgroundRotation={[0, SKY_ROT_Y, 0]} environmentRotation={[0, SKY_ROT_Y, 0]} />
      <hemisphereLight args={['#cfe0f2', '#7a6a50', 0.22]} />
      {/* sol alineado con el del HDR: las sombras coinciden con el cielo */}
      <KeyLight intensity={3.4} position={sunPosition(SKY_SUN_DIR)} color="#fff0db" />
      <mesh rotation-x={-Math.PI / 2} receiveShadow material={ground.material} geometry={fieldPlane()} />
      <SowingSim />
      <FieldTractor />
      <FieldDetail />
      <Horizon />
    </group>
  );
}
