/**
 * Texturas PBR en KTX2 (Basis Universal) con respaldo WebP (render-kit).
 *
 * `loadTexture(path)` devuelve enseguida un THREE.Texture (los materiales lo pueden usar ya) y lo
 * completa cuando llega el KTX2: comprimido en GPU (sin decodificar en el hilo principal, 4–8× menos
 * memoria de video). Si el navegador no puede transcodificar, carga el .webp del mismo nombre.
 * Las texturas se cachean por ruta (una sola descarga/subida).
 *
 * Requisitos: transcoder de Basis en `public/basis/` (copiado de three/examples/jsm/libs/basis) y
 * llamar a `initTextures(renderer)` una vez creado el renderer.
 */
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

let ktx2: KTX2Loader | null = null;
let ktx2Failed = false;
const pending: (() => void)[] = [];
const cache = new Map<string, THREE.Texture>();

export function initTextures(renderer: THREE.WebGLRenderer, transcoderPath = `${import.meta.env.BASE_URL}basis/`) {
  if (ktx2) return;
  try {
    ktx2 = new KTX2Loader().setTranscoderPath(transcoderPath).detectSupport(renderer);
  } catch {
    ktx2Failed = true;
  }
  pending.splice(0).forEach((fn) => fn());
}

export interface TexOpts {
  srgb?: boolean;
  repeat?: boolean;
  anisotropy?: number;
}

/** path sin extensión o con .webp/.ktx2 (relativo a BASE_URL). */
export function loadTexture(path: string, opts: TexOpts = {}): THREE.Texture {
  const base = path.replace(/\.(webp|ktx2|png|jpg)$/, '');
  const key = `${base}|${!!opts.srgb}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = new THREE.Texture();
  if (opts.srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat !== false) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = opts.anisotropy ?? 8;
  cache.set(key, tex);
  const url = (ext: string) => `${import.meta.env.BASE_URL}${base}.${ext}`;
  const fallback = () => {
    new THREE.ImageLoader().load(url('webp'), (img) => {
      tex.image = img;
      tex.needsUpdate = true;
    });
  };
  const start = () => {
    if (!ktx2 || ktx2Failed) return fallback();
    ktx2.load(
      url('ktx2'),
      (c) => {
        // se "convierte" la textura ya entregada en comprimida (mismo objeto: los materiales no cambian)
        const t = tex as THREE.Texture & { isCompressedTexture: boolean };
        const mips = c.mipmaps ?? [];
        t.isCompressedTexture = true;
        t.image = c.image;
        t.mipmaps = mips;
        t.format = c.format;
        t.type = c.type;
        t.generateMipmaps = false;
        t.minFilter = mips.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.flipY = false;
        if (opts.srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
        c.dispose();
      },
      undefined,
      () => fallback(),
    );
  };
  if (ktx2 || ktx2Failed) start();
  else pending.push(start);
  return tex;
}
