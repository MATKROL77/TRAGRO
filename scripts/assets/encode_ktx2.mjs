#!/usr/bin/env node
/**
 * Paso 2 del pipeline de assets: RGBA crudo -> KTX2 (Basis Universal) con mipmaps.
 *
 *   node scripts/assets/encode_ktx2.mjs <dir_de_trabajo>
 *
 * Lee <dir_de_trabajo>/raw/*.rgba (generados por build_assets.py) y escribe
 * public/assets/tex/<set>_{color,normal,rough}.ktx2.
 *
 * Encoder: paquete npm `ktx2-encoder` (Basis Universal compilado a WASM). No es dependencia
 * del proyecto; instalalo aparte y, si no está en node_modules, indicá dónde:
 *   npm install --prefix /tmp/ktx2enc ktx2-encoder@0.6.0
 *   KTX2_ENCODER_DIR=/tmp/ktx2enc node scripts/assets/encode_ktx2.mjs <dir_de_trabajo>
 *
 * Equivalente con las herramientas oficiales de Khronos (KTX-Software), por si preferís toktx:
 *   color : toktx --t2 --genmipmap --assign_oetf srgb   --bcmp --clevel 4 --qlevel 200 out.ktx2 in.png
 *   normal: toktx --t2 --genmipmap --assign_oetf linear --uastc 2 --uastc_rdo_l 1.5 --zcmp 18 out.ktx2 in.png
 *   (sin --normal_mode: three.js espera normales RGB estándar)
 *
 * Convenciones:
 *   - Todas las imágenes se voltean en Y antes de comprimir, porque KTX2Loader entrega texturas
 *     con flipY=false. Así el resultado coincide con un TextureLoader común (flipY=true) y los
 *     mapas de normales OpenGL se usan con normalScale positivo.
 *   - color  -> ETC1S/BasisLZ, sRGB.
 *   - normal -> UASTC + RDO + Zstd, lineal (ETC1S para suelos y madera, ver PROFILE).
 *   - rough  -> ETC1S, lineal (escala de grises: three lee el canal G).
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const work = path.resolve(process.argv[2] ?? '.');
const outDir = path.join(root, 'public', 'assets', 'tex');

async function loadEncoder() {
  try {
    return await import('ktx2-encoder');
  } catch {
    const dir = process.env.KTX2_ENCODER_DIR;
    if (!dir) throw new Error('No se encontró ktx2-encoder. Definí KTX2_ENCODER_DIR (ver cabecera del script).');
    return import(pathToFileURL(path.join(dir, 'node_modules', 'ktx2-encoder', 'dist', 'node', 'index.js')).href);
  }
}

/** Decodificador del formato intermedio: 'RGBA' + ancho + alto (uint32 LE) + píxeles. */
const imageDecoder = async (buf) => {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'RGBA') throw new Error('cabecera inválida');
  const width = dv.getUint32(4, true);
  const height = dv.getUint32(8, true);
  return { width, height, data: buf.subarray(12, 12 + width * height * 4) };
};

const common = { isKTX2File: true, generateMipmap: true, isYFlip: true, imageDecoder };
const ETC1S_SRGB = { ...common, isUASTC: false, qualityLevel: 200, compressionLevel: 4, isPerceptual: true, isSetKTX2SRGBTransferFunc: true };
const ETC1S_LINEAR = { ...common, isUASTC: false, qualityLevel: 190, compressionLevel: 4, isPerceptual: false, isSetKTX2SRGBTransferFunc: false };
const UASTC_LINEAR = {
  ...common, isUASTC: true, uastcLDRQualityLevel: 2, enableRDO: true, rdoQualityLevel: 1.5,
  needSupercompression: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false,
};

/** Perfil por archivo. Lo no listado usa el perfil por sufijo. */
const BY_SUFFIX = { color: ETC1S_SRGB, normal: UASTC_LINEAR, rough: ETC1S_LINEAR };
const PROFILE = {
  // Normales de suelo: ruido de alta frecuencia donde UASTC pesa >1 MB y ETC1S no se nota.
  asphalt_normal: { ...ETC1S_LINEAR, qualityLevel: 255, isNormalMap: true },
  field_normal: { ...ETC1S_LINEAR, qualityLevel: 255, isNormalMap: true },
  gravel_normal: { ...ETC1S_LINEAR, qualityLevel: 255, isNormalMap: true },
  // Madera: superficie rugosa, los artefactos de ETC1S no se ven y baja de ~1,1 MB a ~0,3 MB.
  wood_normal: { ...ETC1S_LINEAR, qualityLevel: 255, isNormalMap: true },
  // Chapa antideslizante: metálica y reflectante, se mantiene en UASTC con RDO más agresivo.
  diamond_normal: { ...UASTC_LINEAR, rdoQualityLevel: 5.0 },
};

const { encodeToKTX2 } = await loadEncoder();
await mkdir(outDir, { recursive: true });
const only = process.argv.slice(3);
const files = (await readdir(path.join(work, 'raw'))).filter((f) => f.endsWith('.rgba')).sort();
let total = 0;
for (const f of files) {
  const name = f.replace(/\.rgba$/, '');
  if (only.length && !only.includes(name)) continue;
  const suffix = name.split('_').pop();
  const opts = PROFILE[name] ?? BY_SUFFIX[suffix];
  const t0 = Date.now();
  const out = await encodeToKTX2(new Uint8Array(await readFile(path.join(work, 'raw', f))), opts);
  await writeFile(path.join(outDir, `${name}.ktx2`), out);
  total += out.byteLength;
  console.log(`${name}.ktx2`.padEnd(26), (opts.isUASTC ? 'UASTC' : 'ETC1S').padEnd(6), `${(out.byteLength / 1024).toFixed(0)} KB`.padStart(8), `${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
console.log('total', (total / 1024 / 1024).toFixed(2), 'MB');
