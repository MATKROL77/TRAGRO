import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { hotspotDefs, matches } from '@/core/catalog';
import { ctxOf } from '@/core/rules';
import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { currentModel } from './TrailerObject';

const REAR = new Set(['porton', 'puertas', 'trasera']);
const FRONT = new Set(['pernoRey', 'piston']);
const TOP = new Set(['lona']);

/** Puntos clicables sobre el modelo. Solo se muestran los que miran hacia la cámara. */
export function Hotspots() {
  const { tx } = useI18n();
  const cfg = useStore((s) => s.config);
  const version = useStore((s) => s.modelVersion);
  const show = useStore((s) => s.ui.hotspots);
  const active = useStore((s) => s.activeHotspot);
  const setHotspot = useStore((s) => s.setHotspot);
  const moving = useStore((s) => (s.anim.accion ?? 0) > 0.01);
  // En la ruta el equipo se mueve: sin puntos de interés.
  const ruta = useStore((s) => s.ui.env === 'ruta');
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const items = useMemo(() => {
    void version;
    const model = currentModel.value;
    if (!model) return [];
    const ctx = ctxOf(cfg);
    return hotspotDefs
      .filter((h) => (!h.tipos || h.tipos.includes(cfg.tipo)) && matches(h.cuando, ctx) && model.anchors[h.id])
      .map((h) => {
        const p = model.anchors[h.id];
        const normal = TOP.has(h.id) ? new THREE.Vector3(0, 1, 0) : REAR.has(h.id) ? new THREE.Vector3(-1, 0, 0) : FRONT.has(h.id) ? new THREE.Vector3(1, 0, 0.6).normalize() : new THREE.Vector3(0, 0, Math.sign(p[2]) || 1);
        return { def: h, pos: new THREE.Vector3(...p), normal };
      });
  }, [cfg, version]);

  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    for (const it of items) {
      const el = refs.current[it.def.id];
      if (!el) continue;
      const facing = v.copy(camera.position).sub(it.pos).normalize().dot(it.normal) > 0.12;
      const vis = facing ? '1' : '0';
      if (el.style.opacity !== vis) {
        el.style.opacity = vis;
        el.style.pointerEvents = facing ? 'auto' : 'none';
      }
    }
  });

  if (!show || moving || ruta) return null;
  return (
    <>
      {items.map((it) => (
        <Html key={it.def.id} position={it.pos} zIndexRange={[2, 0]} style={{ pointerEvents: 'none' }}>
          <button
            type="button"
            ref={(el) => {
              refs.current[it.def.id] = el;
            }}
            className={`hotspot ${active === it.def.id ? 'is-on' : ''}`}
            aria-label={tx(it.def.titulo)}
            title={tx(it.def.titulo)}
            data-hotspot={it.def.id}
            style={{ transition: 'opacity 0.25s', pointerEvents: 'auto' }}
            onClick={(e) => {
              e.stopPropagation();
              setHotspot(active === it.def.id ? null : it.def.id);
            }}
          >
            <i />
          </button>
        </Html>
      ))}
    </>
  );
}
