import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { runtime } from './runtime';
import { KeyLight } from './StudioScene';
import { createGroundMaterial } from './ground';
import { FieldSim } from './fieldSim';
import { Tractor, TRACTOR } from './Tractor';
import { getCrop } from '../domain/agronomy';
import { computeLayout } from '../machines/seeder/layout';
import { getMaterials } from './materials';
import { createTrees, treeLine } from './trees';

const TILE_Z = 44;
const Z_MIN = -26;

/** Rastrojo instanciado cerca de la cámara; el shader lo recicla en loop según el avance. */
function Stubble({ kind, width, count }: { kind: 'soy' | 'maize'; width: number; count: number }) {
  const offset = useRef({ value: 0 });
  const meshes = useMemo(() => {
    const rnd = (() => {
      let s = 1234567;
      return () => ((s = (s * 16807) % 2147483647) / 2147483647);
    })();
    const make = (geo: THREE.BufferGeometry, color: string, n: number, place: (i: number, m: THREE.Matrix4, c: THREE.Color) => void) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uOff = offset.current;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uOff;')
          .replace(
            '#include <project_vertex>',
            `vec4 iw = instanceMatrix * vec4(transformed, 1.0);
             float oz = instanceMatrix[3].z;
             float nz = mod(oz - uOff - ${Z_MIN.toFixed(1)}, ${TILE_Z.toFixed(1)}) + ${Z_MIN.toFixed(1)};
             iw.z += nz - oz;
             vec4 mvPosition = modelViewMatrix * iw;
             gl_Position = projectionMatrix * mvPosition;`,
          );
      };
      const im = new THREE.InstancedMesh(geo, mat, n);
      const m4 = new THREE.Matrix4();
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        place(i, m4, c);
        im.setMatrixAt(i, m4);
        im.setColorAt(i, c);
      }
      im.frustumCulled = false;
      im.receiveShadow = true;
      return im;
    };
    const half = width / 2 + 7;
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const e = new THREE.Euler();
    const base = new THREE.Color(kind === 'soy' ? '#a89270' : '#b49f78');
    const tint = (c: THREE.Color) => c.copy(base).offsetHSL((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.16);
    // tallos en pie, en las hileras del cultivo anterior (cruzadas en diagonal)
    const prevSpacing = kind === 'soy' ? 0.42 : 0.7;
    const standGeo = kind === 'soy' ? new THREE.CylinderGeometry(0.003, 0.0045, 0.09, 3, 1, true).translate(0, 0.045, 0) : new THREE.CylinderGeometry(0.009, 0.013, 0.24, 5, 1, true).translate(0, 0.12, 0);
    const nStand = Math.round(count * (kind === 'soy' ? 0.25 : 0.18));
    const ang = 0.5;
    const standing = make(standGeo, '#ffffff', nStand, (_, m, c) => {
      const row = Math.floor(rnd() * ((2 * half) / prevSpacing));
      const along = rnd() * TILE_Z + Z_MIN;
      const u = -half + row * prevSpacing;
      pos.set(u * Math.cos(ang) + (rnd() - 0.5) * 0.04, 0, along);
      pos.x = ((pos.x + half) % (2 * half)) - half;
      e.set((rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5);
      q.setFromEuler(e);
      sc.set(1, 0.6 + rnd() * 0.8, 1);
      m.compose(pos, q, sc);
      tint(c);
    });
    // paja acostada
    const lyGeo = new THREE.PlaneGeometry(0.011, 1).rotateX(-Math.PI / 2).translate(0, 0.004, 0);
    const lying = make(lyGeo, '#ffffff', count - nStand, (_, m, c) => {
      pos.set((rnd() * 2 - 1) * half, 0.0, rnd() * TILE_Z + Z_MIN);
      e.set(0, rnd() * 6.28, (rnd() - 0.5) * 0.2);
      q.setFromEuler(e);
      sc.set(kind === 'soy' ? 0.8 : 1.6, 1, 0.12 + rnd() * (kind === 'soy' ? 0.2 : 0.45));
      m.compose(pos, q, sc);
      tint(c).multiplyScalar(0.92 + rnd() * 0.2);
    });
    const extras: THREE.InstancedMesh[] = [];
    if (kind === 'maize') {
      // hojas secas de maíz, anchas y retorcidas
      const leaf = new THREE.PlaneGeometry(0.06, 0.5, 1, 3);
      leaf.rotateX(-Math.PI / 2);
      const p = leaf.getAttribute('position');
      for (let i = 0; i < p.count; i++) p.setY(i, 0.004 + Math.abs(p.getZ(i)) * 0.06);
      leaf.computeVertexNormals();
      extras.push(
        make(leaf, '#ffffff', Math.round(count * 0.18), (_, m, c) => {
          pos.set((rnd() * 2 - 1) * half, 0, rnd() * TILE_Z + Z_MIN);
          e.set(0, rnd() * 6.28, (rnd() - 0.5) * 0.3);
          q.setFromEuler(e);
          sc.set(0.7 + rnd() * 0.6, 1, 0.5 + rnd() * 0.7);
          m.compose(pos, q, sc);
          tint(c).multiplyScalar(1.05);
        }),
      );
      (extras[0].material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    }
    return [standing, lying, ...extras];
  }, [kind, width, count]);

  useEffect(() => () => meshes.forEach((m) => {
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
    m.dispose();
  }), [meshes]);

  useFrame(() => {
    offset.current.value = runtime.distance;
  });
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

/** Horizonte pampeano: cortinas de eucaliptos, un silo y un molino lejanos (muy livianos). */
function Horizon() {
  const g = useMemo(() => {
    const group = new THREE.Group();
    const mats = getMaterials();
    const trees = createTrees([
      ...treeLine(-320, 160, 300, 7, 14, 24, 1),
      ...treeLine(150, 460, 230, 7, 13, 22, 2),
      ...treeLine(-460, -180, -260, 7, 14, 22, 3),
      ...treeLine(-200, 200, 380, 6, 15, 26, 4, 'z').map((t) => ({ ...t, x: t.x - 380 })),
    ]);
    group.add(trees.group);
    group.userData.dispose = trees.dispose;
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
  }, []);
  useFrame((_, dt) => {
    const fan = (g.userData.mill as THREE.Group).userData.fan as THREE.Group;
    fan.rotation.z += dt * 1.2;
    // paralaje sutil: el horizonte se mueve muy lento con el avance
    g.position.z = -((runtime.distance * 0.25) % 600);
  });
  return <primitive object={g} />;
}

function SowingSim() {
  const config = useStore((s) => s.config);
  const field = useStore((s) => s.field);
  const sim = useMemo(() => {
    const lay = computeLayout(useStore.getState().config);
    const crop = getCrop(useStore.getState().field.crop);
    return new FieldSim({ rowX: lay.rowX, spacing: lay.spacing, seedsPerM: useStore.getState().field.seedsPerM, sectionControl: false, seedColor: crop.color, seedShape: crop.shape });
  }, []);
  useEffect(() => {
    const dbg = (window as unknown as { __sp?: Record<string, unknown> }).__sp;
    if (dbg) dbg.sim = sim;
    return () => sim.dispose();
  }, [sim]);
  useEffect(() => {
    const lay = computeLayout(config);
    const crop = getCrop(field.crop);
    sim.setParams(
      { rowX: lay.rowX, spacing: lay.spacing, seedsPerM: field.seedsPerM, sectionControl: config.selections.sectionControl === 'on', seedColor: crop.color, seedShape: crop.shape },
      runtime.distance,
    );
  }, [config, field.crop, field.seedsPerM, sim]);
  useFrame((_, dt) => {
    const st = useStore.getState();
    const target = st.sowing && st.pose === 'work' && !st.detail ? st.field.speedKmh / 3.6 : 0;
    const step = Math.min(dt, 0.05) * runtime.timeScale;
    const k = 1 - Math.exp(-step * 1.6);
    runtime.speed += (target - runtime.speed) * k;
    if (runtime.speed < 0.005 && target === 0) runtime.speed = 0;
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
  return <primitive object={sim.group} />;
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

export default function FieldScene() {
  const { scene } = useThree();
  const quality = useStore((s) => s.quality);
  const stubble = useStore((s) => s.stubble);
  const config = useStore((s) => s.config);
  const width = useMemo(() => computeLayout(config).barLength, [config]);
  const ground = useMemo(() => createGroundMaterial({ straw: stubble === 'soy' ? 0.75 : 0.9 }), [stubble]);
  useEffect(() => () => ground.material.dispose(), [ground]);
  useEffect(() => {
    scene.fog = new THREE.Fog('#c9d3db', 70, 430);
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  useFrame(() => {
    ground.uniforms.uOffset.value = runtime.distance;
    runtime.frames++;
  });
  const count = quality === 'high' ? 40000 : quality === 'medium' ? 20000 : 6000;
  const base = import.meta.env.BASE_URL;
  return (
    <>
      <Environment files={`${base}hdri/sky.hdr`} background environmentIntensity={0.85} backgroundIntensity={1} />
      <hemisphereLight args={['#cfe0f2', '#7a6a50', 0.35]} />
      <KeyLight intensity={2.8} position={[-9, 14, 11]} color="#fff0db" />
      <mesh rotation-x={-Math.PI / 2} receiveShadow material={ground.material}>
        <planeGeometry args={[900, 900, 1, 1]} />
      </mesh>
      <Stubble kind={stubble} width={width} count={count} />
      <SowingSim />
      <FieldTractor />
      <Horizon />
    </>
  );
}
