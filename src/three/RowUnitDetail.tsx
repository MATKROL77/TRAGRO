import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { buildRowUnit, type PartGroup, type RowUnitOptions } from '../machines/seeder/rowUnit';
import { computeLayout } from '../machines/seeder/layout';
import { getMaterials } from './materials';
import { useT } from '../i18n/useT';
import { prefersReducedMotion } from './motion';
import { roundedBox } from '../machines/seeder/parts';

const ORDER: PartGroup[] = ['coulter', 'coulterSpring', 'fertOpener', 'discs', 'gauge', 'meter', 'seedTube', 'hopper', 'firmer', 'closing', 'downforce', 'linkage'];

/** Cuerpo de siembra aislado, con despiece animado y etiquetas que explican cada componente. */
export default function RowUnitDetail() {
  const config = useStore((s) => s.config);
  const exploded = useStore((s) => s.exploded);
  const t = useT();
  const mats = useMemo(() => getMaterials(), []);
  const groupRefs = useRef<Record<string, THREE.Group | null>>({});
  const labelRefs = useRef<Record<string, THREE.Group | null>>({});
  const k = useRef(0);

  const data = useMemo(() => {
    const L = computeLayout(config);
    const s = config.selections;
    const opts: RowUnitOptions = {
      coulter: s.coulter as RowUnitOptions['coulter'],
      closing: s.closing as RowUnitOptions['closing'],
      firmer: s.firmer === 'on',
      downforce: s.downforce as RowUnitOptions['downforce'],
      metering: s.metering as RowUnitOptions['metering'],
      fert: L.fert,
      hopper: L.hasCentralSeed ? 'central' : 'individual',
      hopperL: L.individualHopperL,
    };
    const parts = buildRowUnit(opts);
    const groups = new Map<PartGroup, { meshes: THREE.Mesh[]; explode: THREE.Vector3; center: THREE.Vector3 }>();
    for (const p of parts) {
      const mesh = new THREE.Mesh(p.geometry, mats[p.mat]);
      mesh.applyMatrix4(p.matrix);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const g = groups.get(p.group) ?? { meshes: [], explode: p.explode.clone(), center: new THREE.Vector3() };
      g.meshes.push(mesh);
      groups.set(p.group, g);
    }
    for (const g of groups.values()) {
      const b = new THREE.Box3();
      for (const m of g.meshes) b.expandByObject(m);
      b.getCenter(g.center);
    }
    // tramo de tubo porta-herramientas para dar contexto
    const bar = new THREE.Mesh(roundedBox(0.9, 0.18, 0.18, 0.012), mats.paintMain);
    bar.position.set(0, 0.78, 0);
    bar.castShadow = true;
    return { groups, bar };
  }, [config, mats]);

  useEffect(
    () => () => {
      for (const g of data.groups.values()) g.meshes.forEach((m) => m.geometry.dispose());
      data.bar.geometry.dispose();
    },
    [data],
  );

  useFrame((state, dt) => {
    const target = exploded ? 1 : 0;
    const speed = prefersReducedMotion() ? 50 : 2.2;
    const prev = k.current;
    k.current += (target - k.current) * (1 - Math.exp(-dt * speed));
    if (Math.abs(target - k.current) < 0.001) k.current = target;
    for (const [id, g] of data.groups) {
      const ref = groupRefs.current[id];
      if (ref) ref.position.copy(g.explode).multiplyScalar(k.current * 1.6);
      const lab = labelRefs.current[id];
      if (lab) lab.position.copy(g.center).addScaledVector(g.explode, k.current * 1.6);
    }
    if (prev !== k.current) state.invalidate();
  });

  const present = ORDER.filter((id) => data.groups.has(id) && id !== 'coulterSpring');
  return (
    <group>
      <primitive object={data.bar} />
      {[...data.groups.entries()].map(([id, g]) => (
        <group key={id} ref={(r) => (groupRefs.current[id] = r)}>
          {g.meshes.map((m, i) => (
            <primitive key={i} object={m} />
          ))}
        </group>
      ))}
      {present.map((id, i) => (
        <group key={`l-${id}`} ref={(r) => (labelRefs.current[id] = r)}>
          <Html center zIndexRange={[25, 15]} style={{ pointerEvents: 'none' }}>
            <div className="part-label">
              <span className="part-num">{i + 1}</span>
              {t(`detail.${id}`)}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
