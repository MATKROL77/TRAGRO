#!/usr/bin/env node
/**
 * Pipeline de modelos (render-kit) — `npm run models:build`
 *
 * Entrada: models/src/*.glb (exportados desde Blender/CAD según docs/model-spec.md).
 * Salida por modelo, en public/models/:
 *   <nombre>.glb      completo: dedup, prune, weld, texturas ≤2048 en KTX2 (UASTC normales, ETC1S resto), meshopt
 *   <nombre>.low.glb  liviano (primera carga y LOD lejano): geometría simplificada (~35 %), texturas ≤1024
 * y un reporte con triángulos por nodo contra el presupuesto de la especificación.
 *
 * Opciones: --only <nombre>  --no-ktx2 (deja las texturas como WebP, más rápido para iterar)
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, meshopt, textureCompress, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const noKtx2 = args.includes('--no-ktx2');
const SRC = 'models/src';
const OUT = 'public/models';

/** Decodificador de imágenes para el codificador KTX2 en Node (sharp → RGBA). */
const imageDecoder = async (buf) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
};

/** Presupuestos de docs/model-spec.md (triángulos). */
const BUDGET = { row_unit: 8000, tractor: 120000, total_studio_35_rows: 400000 };

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

function tris(doc) {
  const by = {};
  let total = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    let n = 0;
    for (const p of mesh.listPrimitives()) {
      const idx = p.getIndices();
      n += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    }
    by[node.getName() || '(sin nombre)'] = (by[node.getName()] ?? 0) + n;
    total += n;
  }
  return { by, total };
}

function checkSpec(doc, name) {
  const warn = [];
  const names = new Set(doc.getRoot().listNodes().map((n) => n.getName()));
  const mats = new Set(doc.getRoot().listMaterials().map((m) => m.getName()));
  const known = ['paint_main', 'paint_accent', 'paint_dark', 'metal_bare', 'rubber', 'hose', 'decal', 'glass', 'plastic', 'chrome', 'cast_iron', 'galvanized'];
  for (const m of mats) if (!known.includes(m)) warn.push(`material "${m}" fuera de la lista de nombres (ver model-spec.md §4)`);
  const b = getBounds(doc.getRoot().listScenes()[0]);
  const size = b.max.map((v, i) => v - b.min[i]);
  if (Math.max(...size) > 60 || Math.max(...size) < 0.05) warn.push(`tamaño ${size.map((v) => v.toFixed(2)).join('×')} m: ¿escala en metros?`);
  if (name.includes('seeder') && !names.has('row_unit')) warn.push('falta el nodo "row_unit" (pieza de referencia que se instancia)');
  return warn;
}

async function build(file) {
  const name = basename(file, '.glb');
  console.log(`\n▶ ${name}`);
  const read = () => io.read(join(SRC, file));
  // completo
  const full = await read();
  const before = tris(full);
  const warns = checkSpec(full, name);
  await full.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048] }),
    ...(noKtx2 ? [] : [ktx2({ isUASTC: false, qualityLevel: 200, generateMipmap: true, imageDecoder, slots: /^(?!normalTexture).*$/ }), ktx2({ isUASTC: true, isNormalMap: true, generateMipmap: true, imageDecoder, slots: /^normalTexture$/ })]),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(join(OUT, `${name}.glb`), full);
  // liviano
  const low = await read();
  await low.transform(
    dedup(),
    prune(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.002 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
    ...(noKtx2 ? [] : [ktx2({ isUASTC: false, qualityLevel: 128, generateMipmap: true, imageDecoder })]),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  await io.write(join(OUT, `${name}.low.glb`), low);
  const after = tris(low);
  const report = { name, trianglesFull: before.total, trianglesLow: after.total, byNode: before.by, warnings: warns };
  // presupuesto
  if (before.by.row_unit > BUDGET.row_unit) warns.push(`row_unit tiene ${before.by.row_unit} triángulos (máx. ${BUDGET.row_unit})`);
  if ((before.by.tractor ?? 0) > BUDGET.tractor) warns.push(`tractor tiene ${before.by.tractor} triángulos (máx. ${BUDGET.tractor})`);
  console.log(`  triángulos: ${before.total.toLocaleString('es-AR')} (completo) · ${after.total.toLocaleString('es-AR')} (liviano)`);
  for (const w of warns) console.log(`  ⚠ ${w}`);
  return report;
}

if (!existsSync(SRC)) {
  mkdirSync(SRC, { recursive: true });
  console.log(`Creé ${SRC}/: poné ahí los .glb exportados (ver docs/model-spec.md) y volvé a correr.`);
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((f) => f.endsWith('.glb') && (!only || f.startsWith(only)));
if (!files.length) console.log(`No hay .glb en ${SRC}/.`);
const reports = [];
for (const f of files) reports.push(await build(f));
writeFileSync(join(OUT, 'models-report.json'), JSON.stringify(reports, null, 2));
console.log(`\nListo: ${OUT}/ (reporte en ${OUT}/models-report.json)`);
