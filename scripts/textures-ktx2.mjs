#!/usr/bin/env node
/**
 * Convierte las texturas PBR de public/textures/*.webp a KTX2 (Basis Universal):
 *  - color y rugosidad: ETC1S (liviano), 1024 px
 *  - normales: UASTC (calidad), 512 px
 * Se invierte Y al codificar: la textura KTX2 queda con la misma orientación que el WebP con flipY.
 * Uso: npm run textures:ktx2   (salida: public/textures/*.ktx2; la app usa .ktx2 si el navegador lo soporta)
 */
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'public/textures';
const decoder = (size) => async (buf) => {
  const { data, info } = await sharp(buf).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.webp'))) {
  const isNormal = f.includes('_normal');
  const isColor = f.includes('_color');
  const src = readFileSync(join(dir, f));
  const meta = await sharp(src).metadata();
  const size = Math.min(isNormal ? 512 : 1024, meta.width ?? 1024);
  const opts = isNormal
    ? { isUASTC: true, isNormalMap: true, isYFlip: true, generateMipmap: true, needSupercompression: true, imageDecoder: decoder(size) }
    : { isUASTC: false, qualityLevel: 200, isYFlip: true, generateMipmap: true, isSetKTX2SRGBTransferFunc: isColor, imageDecoder: decoder(size) };
  const out = join(dir, f.replace('.webp', '.ktx2'));
  const ktx = await encodeToKTX2(src, opts);
  writeFileSync(out, ktx);
  console.log(`${f} → ${out} · ${size}px · ${(src.length / 1024).toFixed(0)} KB → ${(ktx.length / 1024).toFixed(0)} KB`);
}
