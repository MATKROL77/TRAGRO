#!/usr/bin/env node
/**
 * Build de modelos (docs/model-spec.md): models/src/*.glb → public/models/
 *   <nombre>.glb      dedup, prune, weld, meshopt, texturas a KTX2 (con toktx) o WebP, máx. 2048 px
 *   <nombre>-low.glb  versión liviana para la carga progresiva: geometría al 25 %, texturas de 512 px
 * Uso: npm run models:build [-- --max=2048 --low=512 --ratio=0.25]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, meshopt, simplify, resample, textureCompress, normals } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.resolve(ROOT, args.src ?? 'models/src');
const OUT = path.resolve(ROOT, args.out ?? 'public/models');
const MAX = Number(args.max ?? 2048);
const LOW = Number(args.low ?? 512);
const RATIO = Number(args.ratio ?? 0.25);

const hasToktx = (() => {
  try {
    execSync('toktx --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

async function build(file) {
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const name = path.basename(file, '.glb');
  const stats = [];
  for (const variant of ['full', 'low']) {
    const doc = await io.read(file);
    const low = variant === 'low';
    const steps = [dedup(), prune(), weld(), resample()];
    if (low) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: 0.01 }), normals({ overwrite: false }));
    // Normales con UASTC (más fiel), color con ETC1S; sin toktx, WebP.
    const size = low ? LOW : MAX;
    if (hasToktx) {
      const { toktx, Mode } = await import('@gltf-transform/cli').catch(() => ({}));
      if (toktx) {
        steps.push(toktx({ mode: Mode.UASTC, slots: /normal/, resize: [size, size] }), toktx({ mode: Mode.ETC1S, slots: /^(?!normal).*/, resize: [size, size] }));
      } else steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size] }));
    } else steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size] }));
    steps.push(meshopt({ encoder: MeshoptEncoder, level: low ? 'high' : 'medium' }));
    await doc.transform(...steps);
    const out = path.join(OUT, low ? `${name}-low.glb` : `${name}.glb`);
    await io.write(out, doc);
    let tris = 0;
    for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) tris += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
    stats.push(`${path.basename(out)}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${Math.round(tris)} triángulos`);
  }
  return stats;
}

fs.mkdirSync(OUT, { recursive: true });
const files = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter((f) => f.endsWith('.glb')) : [];
if (!files.length) {
  console.log(`No hay modelos en ${path.relative(ROOT, SRC)}/ (se sigue usando la geometría procedural).`);
  process.exit(0);
}
console.log(`Texturas: ${hasToktx ? 'KTX2 (toktx)' : 'WebP (instalá toktx de KTX-Software para KTX2)'} · máx. ${MAX} px · liviana ${LOW} px y ${Math.round(RATIO * 100)} % de la geometría`);
for (const f of files) for (const line of await build(path.join(SRC, f))) console.log('  ' + line);
