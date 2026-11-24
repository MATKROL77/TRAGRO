import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { runtime } from './runtime';
import { useT } from '../i18n/useT';

export const HOTSPOTS = ['coulter', 'discs', 'gauge', 'meter', 'closing', 'hoppers', 'transport', 'monitor'] as const;

function Spot({ id }: { id: (typeof HOTSPOTS)[number] }) {
  const g = useRef<THREE.Group>(null);
  const t = useT();
  const active = useStore((s) => s.hotspot === id);
  const setHotspot = useStore((s) => s.setHotspot);
  const v = new THREE.Vector3();
  useFrame(() => {
    const a = runtime.model?.anchors[`hs-${id}`];
    if (!a || !g.current) return;
    a.getWorldPosition(v);
    g.current.position.copy(v);
  });
  return (
    <group ref={g}>
      <Html center zIndexRange={[30, 20]}>
        <button
          className={`hotspot${active ? ' is-active' : ''}`}
          aria-label={t(`hotspots.${id}.title`)}
          title={t(`hotspots.${id}.title`)}
          onClick={(e) => {
            e.stopPropagation();
            setHotspot(active ? null : id);
          }}
        >
          <span aria-hidden>+</span>
        </button>
      </Html>
    </group>
  );
}

export function Hotspots() {
  const show = useStore((s) => s.showHotspots && s.scene === 'studio' && s.pose === 'work' && !s.detail && !s.sowing && !s.demo);
  const [ready, setReady] = useState(false);
  const r = useRef(false);
  useFrame(() => {
    const ok = !!runtime.model && runtime.model.state.poseT < 0.02;
    if (ok !== r.current) {
      r.current = ok;
      setReady(ok);
    }
  });
  if (!show || !ready) return null;
  return (
    <group>
      {HOTSPOTS.map((id) => (
        <Spot key={id} id={id} />
      ))}
    </group>
  );
}
