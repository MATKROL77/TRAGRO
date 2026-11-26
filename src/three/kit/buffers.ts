/**
 * Geometría generada en el Web Worker: buffers de las mallas fusionadas por
 * "nodo|material", listos para transferir sin copia y aplicar sobre un esqueleto.
 */
import * as THREE from 'three';

/** Geometría de una malla fusionada generada en el worker (clave "nodo|material"). */
export interface BucketData {
  key: string;
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  livery?: Float32Array;
  sphere: [number, number, number, number];
  box: [number, number, number, number, number, number];
}

export interface ModelBuffers {
  key: string;
  buckets: BucketData[];
  /** Tiempo de generación en el worker (ms). */
  ms: number;
}


/** Reemplaza la geometría de cada malla del esqueleto por la que llegó del worker. Devuelve los triángulos. */
export function applyBuffers(buckets: Map<string, THREE.Mesh>, buffers: ModelBuffers): number {
  if (buffers.buckets.length !== buckets.size) throw new Error(`El worker devolvió ${buffers.buckets.length} mallas y el esqueleto tiene ${buckets.size}`);
  let triangles = 0;
  for (const b of buffers.buckets) {
    const mesh = buckets.get(b.key);
    if (!mesh) throw new Error(`Malla inesperada del worker: ${b.key}`);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(b.uv, 2));
    if (b.livery) g.setAttribute('aLivery', new THREE.BufferAttribute(b.livery, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(b.sphere[0], b.sphere[1], b.sphere[2]), b.sphere[3]);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(b.box[0], b.box[1], b.box[2]), new THREE.Vector3(b.box[3], b.box[4], b.box[5]));
    mesh.geometry.dispose();
    mesh.geometry = g;
    triangles += b.position.length / 9;
  }
  return Math.round(triangles);
}

/** Buffers de las mallas fusionadas, listos para transferir desde el worker. */
export function extractBuffers(buckets: Map<string, THREE.Mesh>): { buckets: BucketData[]; transfer: ArrayBuffer[] } {
  const out: BucketData[] = [];
  const transfer: ArrayBuffer[] = [];
  for (const [key, mesh] of buckets) {
    const g = mesh.geometry;
    const arr = (name: string) => (g.getAttribute(name) as THREE.BufferAttribute | undefined)?.array as Float32Array | undefined;
    const position = arr('position')!;
    const normal = arr('normal')!;
    const uv = arr('uv')!;
    const livery = arr('aLivery');
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingBox) g.computeBoundingBox();
    const s = g.boundingSphere!;
    const bb = g.boundingBox!;
    out.push({ key, position, normal, uv, livery, sphere: [s.center.x, s.center.y, s.center.z, s.radius], box: [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z] });
    for (const a of [position, normal, uv, livery]) if (a && !transfer.includes(a.buffer as ArrayBuffer)) transfer.push(a.buffer as ArrayBuffer);
  }
  return { buckets: out, transfer };
}
