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

const proj = new THREE.Vector3();
let blockers: { t: number; rects: DOMRect[]; host: DOMRect | null } = { t: 0, rects: [], host: null };
/** Rectángulos de UI que las etiquetas no deben tapar (tarjeta de precio, barra, botón comparar). */
function uiRects() {
  const now = performance.now();
  if (now - blockers.t < 200) return blockers;
  const viewer = document.querySelector('.viewer');
  const host = viewer?.getBoundingClientRect() ?? null;
  const rects = viewer ? [...viewer.querySelectorAll('.price-float, .topbar, .compare-fab, .toast-zone > *')].map((e) => e.getBoundingClientRect()) : [];
  blockers = { t: now, rects, host };
  return blockers;
}

/** Posición en pantalla de una etiqueta: dentro del visor (12 px de margen) y fuera de la UI. */
function clampToFree(el: THREE.Object3D, camera: THREE.Camera, size: { width: number; height: number }): number[] {
  proj.setFromMatrixPosition(el.matrixWorld).project(camera);
  let x = (proj.x * 0.5 + 0.5) * size.width;
  let y = (-proj.y * 0.5 + 0.5) * size.height;
  const hw = 95;
  const hh = 16;
  x = Math.min(size.width - 12 - hw, Math.max(12 + hw, x));
  y = Math.min(size.height - 12 - hh, Math.max(12 + hh, y));
  const { rects, host } = uiRects();
  if (host) {
    for (const r of rects) {
      const l = r.left - host.left - hw - 6;
      const rr = r.right - host.left + hw + 6;
      const tp = r.top - host.top - hh - 6;
      const bt = r.bottom - host.top + hh + 6;
      if (x > l && x < rr && y > tp && y < bt) {
        // mover por el lado más corto
        const opts = [
          { d: bt - y, x, y: bt },
          { d: y - tp, x, y: tp },
          { d: rr - x, x: rr, y },
          { d: x - l, x: l, y },
        ].filter((o) => o.x >= 12 + hw && o.x <= size.width - 12 - hw && o.y >= 12 + hh && o.y <= size.height - 12 - hh);
        opts.sort((a, b) => a.d - b.d);
        if (opts[0]) ({ x, y } = opts[0]);
      }
    }
  }
  return [x, y];
}

function Dim({ a, b, label, level, tick }: { a: THREE.Vector3; b: THREE.Vector3; label: string; level: keyof typeof COLORS; tick: THREE.Vector3 }) {
  const color = COLORS[level];
  const mid = a.clone().lerp(b, 0.5);
  const t = tick.clone().multiplyScalar(0.18);
  return (
    <group>
      <Line points={[a, b]} color={color} lineWidth={2.5} />
      <Line points={[a.clone().sub(t), a.clone().add(t)]} color={color} lineWidth={2.5} />
      <Line points={[b.clone().sub(t), b.clone().add(t)]} color={color} lineWidth={2.5} />
      <Html position={mid} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }} calculatePosition={clampToFree}>
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
