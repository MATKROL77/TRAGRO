import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { runtime } from './runtime';
import { layoutBox } from './bounds';
import { checkTransport } from '../domain/transport';
import { computeLayout } from '../machines/seeder/layout';
import { formatQty } from '../domain/units';
import { useT } from '../i18n/useT';

const COLORS = { green: '#1f9d55', yellow: '#d99a00', red: '#d64545' };

function Dim({ a, b, label, level, tick }: { a: THREE.Vector3; b: THREE.Vector3; label: string; level: keyof typeof COLORS; tick: THREE.Vector3 }) {
  const color = COLORS[level];
  const mid = a.clone().lerp(b, 0.5);
  const t = tick.clone().multiplyScalar(0.18);
  return (
    <group>
      <Line points={[a, b]} color={color} lineWidth={2.5} />
      <Line points={[a.clone().sub(t), a.clone().add(t)]} color={color} lineWidth={2.5} />
      <Line points={[b.clone().sub(t), b.clone().add(t)]} color={color} lineWidth={2.5} />
      <Html position={mid} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <div className={`dim-label dim-${level}`}>{label}</div>
      </Html>
    </group>
  );
}

/** Cotas de transporte (ancho, alto, largo) con semáforo, visibles al terminar la animación. */
export function TransportDims() {
  const config = useStore((s) => s.config);
  const pose = useStore((s) => s.pose);
  const units = useStore((s) => s.units);
  const lang = useStore((s) => s.lang);
  const profile = useStore((s) => s.transportProfile);
  const detail = useStore((s) => s.detail);
  const t = useT();
  const [visible, setVisible] = useState(false);
  const vis = useRef(false);
  useFrame(() => {
    const m = runtime.model;
    const v = !!m && pose === 'transport' && m.state.poseT > 0.985 && !detail;
    if (v !== vis.current) {
      vis.current = v;
      setVisible(v);
    }
  });
  const data = useMemo(() => {
    const L = computeLayout(config);
    const box = layoutBox(L, true);
    const chk = checkTransport(config, profile);
    return { box, chk, L };
  }, [config, profile]);
  if (!visible) return null;
  const { box, chk } = data;
  const y0 = 0.04;
  const fmt = (v: number) => formatQty(v, 'length', units, lang, 2);
  return (
    <group>
      <Dim
        a={new THREE.Vector3(box.min.x, y0, box.min.z - 0.5)}
        b={new THREE.Vector3(box.max.x, y0, box.min.z - 0.5)}
        tick={new THREE.Vector3(0, 0, 1)}
        level={chk.width.level}
        label={`${t('transport.width')} ${fmt(chk.width.value)}`}
      />
      <Dim
        a={new THREE.Vector3(box.max.x + 0.6, 0, box.min.z + 0.3)}
        b={new THREE.Vector3(box.max.x + 0.6, box.max.y, box.min.z + 0.3)}
        tick={new THREE.Vector3(1, 0, 0)}
        level={chk.height.level}
        label={`${t('transport.height')} ${fmt(chk.height.value)}`}
      />
      <Dim
        a={new THREE.Vector3(box.max.x + 0.6, y0, box.min.z)}
        b={new THREE.Vector3(box.max.x + 0.6, y0, box.max.z)}
        tick={new THREE.Vector3(1, 0, 0)}
        level={chk.length.level === 'red' ? 'red' : 'green'}
        label={`${t('transport.machineLength')} ${fmt(chk.machineLength)}`}
      />
    </group>
  );
}
