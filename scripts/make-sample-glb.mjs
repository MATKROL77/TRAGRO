/** Genera models/src/seeder-sample.glb (nodos y materiales con nombres de docs/model-spec.md) para probar `npm run models:build`. */
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
const doc = new Document();
const buf = doc.createBuffer();
const tex = doc.createTexture('paint').setMimeType('image/png').setImage(await sharp({ create: { width: 512, height: 512, channels: 3, background: '#1e4d5c', noise: { type: 'gaussian', mean: 90, sigma: 30 } } }).png().toBuffer());
const nrm = doc.createTexture('paint_n').setMimeType('image/png').setImage(await sharp({ create: { width: 512, height: 512, channels: 3, background: '#8080ff', noise: { type: 'gaussian', mean: 128, sigma: 8 } } }).png().toBuffer());
const mats = { paint_main: doc.createMaterial('paint_main').setBaseColorTexture(tex).setNormalTexture(nrm), metal_bare: doc.createMaterial('metal_bare').setMetallicFactor(1), rubber: doc.createMaterial('rubber') };
// esfera UV de n segmentos (para tener triángulos que simplificar)
function sphere(name, r, n, mat) {
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { const t = (i / n) * Math.PI, p = (j / n) * Math.PI * 2; pos.push(r * Math.sin(t) * Math.cos(p), r * Math.cos(t), r * Math.sin(t) * Math.sin(p)); }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j, b = a + n + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const uv = []; for (let k = 0; k < pos.length / 3; k++) uv.push(0, 0);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buf))
    .setMaterial(mat);
  return doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
}
const scene = doc.createScene();
const frame = sphere('frame_center', 1.2, 60, mats.paint_main);
const row = sphere('row_unit', 0.3, 64, mats.metal_bare).setTranslation([0, 0.5, -0.5]);
const wheel = sphere('wheel_transport', 0.45, 40, mats.rubber).setTranslation([1.5, 0.45, 0]);
scene.addChild(frame.addChild(row)).addChild(wheel);
mkdirSync('models/src', { recursive: true });
await new NodeIO().write('models/src/seeder-sample.glb', doc);
console.log('ok');
