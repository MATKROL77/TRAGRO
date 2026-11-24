import * as THREE from 'three';

/**
 * Eucaliptos procedurales instanciados (típicos de las cortinas rompevientos pampeanas):
 * tronco claro y alto, copa irregular en varios volúmenes, variación de tono y tamaño.
 */
export interface TreeSpot { x: number; z: number; h: number }

function noisyBlob(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 - seed) * Math.sin(v.z * 3.7 + seed * 0.5);
    const n2 = Math.sin(v.x * 7.3 + seed * 2) * Math.sin(v.y * 6.1) * Math.cos(v.z * 8.2);
    v.multiplyScalar(1 + n * 0.22 + n2 * 0.09);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function createTrees(spots: TreeSpot[], seed = 7): { group: THREE.Group; dispose: () => void } {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, 7, 1).translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#cbbfa8', roughness: 0.9 });
  const leafGeo = noisyBlob(seed);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0 });
  const clumpsPer = 6;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spots.length * clumpsPer);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  const palette = ['#56653f', '#4d5c3b', '#61704a', '#6b7656', '#48573a'];
  spots.forEach((t, i) => {
    const h = t.h;
    const trunkH = h * (0.55 + rnd() * 0.12);
    const r = h * 0.018;
    e.set((rnd() - 0.5) * 0.08, rnd() * 6.28, (rnd() - 0.5) * 0.08);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(r, trunkH, r));
    trunks.setMatrixAt(i, m);
    trunks.setColorAt(i, c.set('#cbbfa8').offsetHSL(0, 0, (rnd() - 0.5) * 0.12));
    const crownW = h * (0.22 + rnd() * 0.08);
    for (let k = 0; k < clumpsPer; k++) {
      const a = rnd() * Math.PI * 2;
      const rr = crownW * (0.15 + rnd() * 0.55);
      const y = trunkH * 0.8 + (h - trunkH * 0.8) * (0.15 + rnd() * 0.75);
      const sc = crownW * (0.42 + rnd() * 0.35);
      e.set(rnd() * 3, rnd() * 3, rnd() * 3);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(t.x + Math.cos(a) * rr, y, t.z + Math.sin(a) * rr), q, new THREE.Vector3(sc, sc * (0.85 + rnd() * 0.5), sc));
      leaves.setMatrixAt(i * clumpsPer + k, m);
      leaves.setColorAt(i * clumpsPer + k, c.set(palette[Math.floor(rnd() * palette.length)]).offsetHSL((rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.06));
    }
  });
  for (const im of [trunks, leaves]) {
    im.castShadow = false;
    im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
  }
  return {
    group,
    dispose: () => {
      trunkGeo.dispose();
      leafGeo.dispose();
      trunkMat.dispose();
      leafMat.dispose();
      trunks.dispose();
      leaves.dispose();
    },
  };
}

/** Cortinas de árboles a lo largo de líneas (x0→x1 a una z), con huecos naturales. */
export function treeLine(x0: number, x1: number, z: number, step: number, hMin: number, hMax: number, seed = 1, axis: 'x' | 'z' = 'x'): TreeSpot[] {
  let s = seed * 7919 + 17;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: TreeSpot[] = [];
  for (let u = x0; u < x1; u += step * (0.6 + rnd() * 0.8)) {
    if (rnd() < 0.08) continue;
    const off = (rnd() - 0.5) * step * 0.9;
    const h = hMin + rnd() * (hMax - hMin);
    out.push(axis === 'x' ? { x: u, z: z + off, h } : { x: z + off, z: u, h });
  }
  return out;
}
