import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { runtime } from './runtime';
import { layoutBox } from './bounds';
import { DIM } from '../machines/seeder/layout';
import { useT } from '../i18n/useT';

/** Puntos técnicos. Los del cuerpo de siembra van agrupados en uno solo (no se pisan). */
export const HOTSPOTS = ['rowUnit', 'hoppers', 'transport', 'monitor'] as const;
const ANCHOR: Record<(typeof HOTSPOTS)[number], string> = { rowUnit: 'hs-discs', hoppers: 'hs-hoppers', transport: 'hs-transport', monitor: 'hs-monitor' };

const v = new THREE.Vector3();
const c = new THREE.Vector3();
const toCam = new THREE.Vector3();

function Spot({ id }: { id: (typeof HOTSPOTS)[number] }) {
  const g = useRef<THREE.Group>(null);
  const el = useRef<HTMLButtonElement>(null);
  const t = useT();
  const active = useStore((s) => s.hotspot === id);
  const setHotspot = useStore((s) => s.setHotspot);
  useFrame(({ camera }) => {
    const m = runtime.model;
    const a = m?.anchors[ANCHOR[id]];
    if (!m || !a || !g.current) return;
    a.getWorldPosition(v);
    g.current.position.copy(v);
    // oclusión barata: si el punto queda del otro lado de la máquina respecto de la cámara, se oculta
    // centro de la línea de cuerpos (no de la caja: la lanza la corre hacia adelante)
    layoutBox(m.layout, false).getCenter(c);
    c.z = (DIM.rowFrontZ + DIM.rowRearZ) / 2;
    toCam.copy(camera.position).sub(c).setY(0).normalize();
    const side = v.clone().sub(c).setY(0);
    const behind = side.length() > 1.0 && side.normalize().dot(toCam) < -0.5;
    if (el.current) el.current.classList.toggle('is-hidden', behind);
  });
  const label = id === 'rowUnit' ? `${t('hotspots.rowUnit.title')} · 5` : t(`hotspots.${id}.title`);
  return (
    <group ref={g}>
      <Html center zIndexRange={[8, 5]}>
        <button
          ref={el}
          type="button"
          className={`hotspot${active ? ' is-active' : ''}${id === 'rowUnit' ? ' is-group' : ''}`}
          aria-label={label}
          title={label}
          onClick={(e) => {
            e.stopPropagation();
            setHotspot(active ? null : id);
          }}
        >
          <span className="hs-dot" aria-hidden>{id === 'rowUnit' ? '5' : ''}</span>
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
