import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { runtime } from './runtime';
import { KeyLight } from './StudioScene';
import { createGroundMaterial } from './ground';
import { getFieldSim } from './fieldSim';
import { useWarmup, useWarmupObject } from '../render-kit/warmup';
import { Tractor, TRACTOR } from './Tractor';
import { getCrop } from '../domain/agronomy';
import { computeLayout } from '../machines/seeder/layout';
import { getMaterials } from './materials';


/** Horizonte pampeano: cortinas de eucaliptos, un silo y un molino lejanos (muy livianos). */
let horizonGroup: THREE.Group | null = null;
function Horizon() {
  const g = useMemo(() => (horizonGroup ??= buildHorizon()), []);
  const warm = useWarmupObject(g);
  useFrame((_, dt) => {
    const fan = (g.userData.mill as THREE.Group).userData.fan as THREE.Group;
    fan.rotation.z += dt * 1.2;
  });
  return warm ? null : <primitive object={g} dispose={null} />;
}

/** Silo y molino lejanos: se construyen una vez y se reutilizan en cada visita. */
function buildHorizon(): THREE.Group {
  {
    const group = new THREE.Group();
    const mats = getMaterials();
    // silo
    const silo = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 12, 24), mats.galvanized);
      c.position.set(i * 9, 6, 0);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.6, 24), mats.galvanized);
      roof.position.set(i * 9, 13.3, 0);
      silo.add(c, roof);
    }
    silo.position.set(-150, 0, 260);
    group.add(silo);
    // molino
    const mill = new THREE.Group();
    const leg = new THREE.CylinderGeometry(0.08, 0.12, 11, 6);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const m = new THREE.Mesh(leg, mats.galvanized);
      m.position.set(x * 0.9, 5.5, z * 0.9);
      m.rotation.set(-z * 0.08, 0, x * 0.08);
      mill.add(m);
    }
    const fan = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 0.02), mats.galvanized);
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
    group.add(mill);
    group.userData.mill = mill;
    return group;
  }
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
      const r = i < 2 ? TRACTOR.rearR : TRACTOR.frontR;
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
    scene.fog = new THREE.Fog('#c9d3db', 70, 430);
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  const warmScene = useWarmup();
  useFrame(() => {
    if (warmScene) return;
    ground.uniforms.uOffset.value = runtime.distance;
    runtime.frames++;
  });
  const base = import.meta.env.BASE_URL;
  return (
    <>
      <Environment files={`${base}hdri/sky.hdr`} background environmentIntensity={0.85} backgroundIntensity={1} />
      <hemisphereLight args={['#cfe0f2', '#7a6a50', 0.35]} />
      <KeyLight intensity={2.8} position={[-9, 14, 11]} color="#fff0db" />
      <mesh rotation-x={-Math.PI / 2} receiveShadow material={ground.material} geometry={fieldPlane()} />
      <SowingSim />
      <FieldTractor />
      <Horizon />
    </>
  );
}
