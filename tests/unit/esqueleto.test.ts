import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { defaultConfig, applyChange } from '@/core/rules';
import type { Config } from '@/core/types';
import { buildTrailer, type ModelBuffers } from '@/three/model';
import { extractBuffers } from '@/three/kit/buffers';
import type { MaterialSet } from '@/three/materials';

const mat = new THREE.MeshBasicMaterial();
const mats = new Proxy({}, { get: () => mat }) as unknown as MaterialSet;

function variants(): [string, Config][] {
  const out: [string, Config][] = [];
  for (const tipo of ['tolva', 'batea', 'plataforma', 'furgon'] as const) out.push([tipo, defaultConfig(tipo)]);
  const sider = applyChange(defaultConfig('furgon'), 'variante', 'sider').config;
  out.push(['sider', sider]);
  let full = applyChange(sider, 'parantes', 'corredizos').config;
  for (const [k, v] of [['tablillas', 'aluminio'], ['techo', 'corredizo'], ['tensado', 'trinquete'], ['cajon', 2], ['portaauxilio', 1], ['tanqueAgua', true], ['lucesLed', true], ['faldones', true], ['ejes', 'tridem']] as const) full = applyChange(full, k, v).config;
  out.push(['sider completo', full]);
  out.push(['tolva eléctrica', applyChange(defaultConfig('tolva'), 'accionamientoLona', 'electrico').config]);
  return out;
}

describe('modelo armado en dos partes (worker + esqueleto)', () => {
  for (const [name, cfg] of variants()) {
    it(`${name}: el esqueleto con los buffers del worker da el mismo modelo`, () => {
      const full = buildTrailer(cfg, mats);
      const tris = full.stats.triangles;
      const keys = [...full.buckets.keys()].sort();
      const { buckets } = extractBuffers(full.buckets);
      const buffers: ModelBuffers = { key: full.key, buckets, ms: 0 };
      const t0 = performance.now();
      const skel = buildTrailer(cfg, mats, buffers);
      const ms = performance.now() - t0;
      expect([...skel.buckets.keys()].sort()).toEqual(keys);
      expect(skel.stats.triangles).toBe(tris);
      // Nodos y animación: misma jerarquía.
      const names = (r: THREE.Object3D) => { const n: string[] = []; r.traverse((o) => o.type === 'Group' && n.push(o.name)); return n.sort().join(','); };
      expect(names(skel.root)).toBe(names(full.root));
      skel.update({ accion: 0.5, lona: 0.5, susp: 0, elevado: 1, patas: 0, time: 1, dt: 0.016 });
      console.log(`${name}: ${keys.length} mallas, ${tris} triángulos · esqueleto ${ms.toFixed(1)} ms`);
      skel.dispose();
    });
  }
});
