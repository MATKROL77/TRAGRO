/**
 * Web Worker que genera geometría fuera del hilo principal: el semirremolque y el
 * tractor. Arma el modelo completo y devuelve los buffers de las mallas fusionadas
 * (transferidos, sin copia). El hilo principal arma solo el esqueleto (nodos,
 * pivotes, animaciones) y les asigna estos buffers.
 */
import * as THREE from 'three';
import type { Config } from '@/core/types';
import type { MaterialSet } from './materials';
import { extractBuffers } from './kit/buffers';
import { buildTrailer } from './model';
import { buildTractor, type TractorOptions } from './parts/tractor';

const mat = new THREE.MeshBasicMaterial();
const mats = new Proxy({}, { get: () => mat }) as unknown as MaterialSet;

type Req = { id: number; kind: 'trailer'; input: Config } | { id: number; kind: 'tractor'; input: TractorOptions };

self.onmessage = (e: MessageEvent<Req>) => {
  const { id } = e.data;
  try {
    const t0 = performance.now();
    const m = e.data.kind === 'trailer' ? buildTrailer(e.data.input, mats) : buildTractor(e.data.input, mats);
    const { buckets, transfer } = extractBuffers(m.buckets);
    const ms = performance.now() - t0;
    (self as unknown as Worker).postMessage({ id, ok: true, result: { key: m.key, buckets, ms } }, transfer);
    m.dispose();
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
  }
};
