import * as THREE from 'three';

/** Texturas procedurales (canvas). Se generan una sola vez y se comparten. */

function canvas(w: number, h: number, read = true): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', read ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new Error('2d context');
  return [c, ctx];
}

/** Convierte un mapa de alturas (canal R) en normal map (convención OpenGL). */
export function heightToNormal(src: HTMLCanvasElement, strength = 2): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  const data = sctx.getImageData(0, 0, w, h).data;
  const [out, octx] = canvas(w, h);
  const img = octx.createImageData(w, h);
  const H = (x: number, y: number) => data[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function tex(c: HTMLCanvasElement, srgb = false, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

let tireNormalTex: THREE.Texture | null = null;
/** Banda de rodamiento con tacos en V (agrícola). U = alrededor de la rueda, V = ancho. */
export function tireTreadNormal(): THREE.Texture {
  if (tireNormalTex) return tireNormalTex;
  const [c, ctx] = canvas(512, 128);
  ctx.fillStyle = '#202020';
  ctx.fillRect(0, 0, 512, 128);
  ctx.filter = 'blur(1.5px)';
  const lugs = 16;
  for (let i = 0; i < lugs; i++) {
    const x0 = (i / lugs) * 512;
    ctx.fillStyle = '#f0f0f0';
    // taco en chevron: dos paralelogramos
    ctx.beginPath();
    ctx.moveTo(x0, 8);
    ctx.lineTo(x0 + 10, 8);
    ctx.lineTo(x0 + 26, 64);
    ctx.lineTo(x0 + 16, 64);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x0 + 16, 64);
    ctx.lineTo(x0 + 26, 64);
    ctx.lineTo(x0 + 10, 120);
    ctx.lineTo(x0, 120);
    ctx.closePath();
    ctx.fill();
  }
  ctx.filter = 'none';
  tireNormalTex = tex(heightToNormal(c, 6));
  return tireNormalTex;
}

let discRoughTex: THREE.Texture | null = null;
/** Disco de acero: filo pulido por el uso, centro más oscuro. UV planar (0..1). */
export function discRoughness(): THREE.Texture {
  if (discRoughTex) return discRoughTex;
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, '#b8b8b8');
  g.addColorStop(0.7, '#a0a0a0');
  g.addColorStop(0.86, '#606060');
  g.addColorStop(0.94, '#2a2a2a');
  g.addColorStop(1, '#202020');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  // rayas concéntricas del trabajo
  for (let i = 0; i < 90; i++) {
    const r = 70 + Math.random() * 56;
    ctx.strokeStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},0.06)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(128, 128, r, Math.random() * 6, Math.random() * 6 + 2);
    ctx.stroke();
  }
  discRoughTex = tex(c, false, false);
  return discRoughTex;
}

let discColorTex: THREE.Texture | null = null;
export function discColor(): THREE.Texture {
  if (discColorTex) return discColorTex;
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, '#4a4c4f');
  g.addColorStop(0.55, '#5c5f63');
  g.addColorStop(0.8, '#6f7276');
  g.addColorStop(0.9, '#c9cbcd');
  g.addColorStop(1, '#e6e7e8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  // pequeño óxido/tierra en el centro
  for (let i = 0; i < 400; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 95;
    ctx.fillStyle = `rgba(${90 + Math.random() * 40},${60 + Math.random() * 20},40,${Math.random() * 0.18})`;
    ctx.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  discColorTex = tex(c, true, false);
  return discColorTex;
}

let paintNoiseTex: THREE.Texture | null = null;
/** Variación de rugosidad sutil para pintura (micro rayas y polvo). */
export function paintRoughness(): THREE.Texture {
  if (paintNoiseTex) return paintNoiseTex;
  const [c, ctx] = canvas(256, 256, true);
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(0, 0, 256, 256);
  const img = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 122 + n;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 160; i++) {
    ctx.strokeStyle = `rgba(200,200,200,${0.05 + Math.random() * 0.1})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 12);
    ctx.stroke();
  }
  paintNoiseTex = tex(c);
  paintNoiseTex.repeat.set(3, 3);
  return paintNoiseTex;
}

let rubberNormalTex: THREE.Texture | null = null;
export function rubberSidewallNormal(): THREE.Texture {
  if (rubberNormalTex) return rubberNormalTex;
  const [c, ctx] = canvas(128, 128, true);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  const img = ctx.getImageData(0, 0, 128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 30;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 128 + n;
  }
  ctx.putImageData(img, 0, 0);
  rubberNormalTex = tex(heightToNormal(c, 0.6));
  return rubberNormalTex;
}

/** Calcomanía de marca: logo + nombre + modelo, sobre fondo transparente. */
export function brandDecal(opts: {
  brandName: string;
  model: string;
  text?: string;
  logo?: HTMLImageElement | null;
  accent: string;
  light: boolean;
  width?: number;
  height?: number;
}): THREE.CanvasTexture {
  const W = opts.width ?? 1024;
  const H = opts.height ?? 384;
  const [c, ctx] = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const fg = opts.light ? '#ffffff' : '#14212b';
  // franja de acento
  ctx.fillStyle = opts.accent;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.78);
  ctx.lineTo(W, H * 0.66);
  ctx.lineTo(W, H * 0.74);
  ctx.lineTo(0, H * 0.86);
  ctx.closePath();
  ctx.fill();
  let x = 24;
  if (opts.logo && opts.logo.complete && opts.logo.naturalWidth > 0) {
    const lh = H * 0.5;
    const lw = Math.min(W * 0.35, (opts.logo.naturalWidth / opts.logo.naturalHeight) * lh);
    ctx.drawImage(opts.logo, x, H * 0.08, lw, lh);
    x += lw + 28;
  } else {
    // logo por defecto: surcos blancos sobre círculo azul marino (igual al logo del sitio)
    ctx.save();
    ctx.translate(x + 80, H * 0.33);
    ctx.fillStyle = '#1b2747';
    ctx.beginPath();
    ctx.arc(0, 0, 76, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-44, 30 + i * 22);
      ctx.quadraticCurveTo(0, -10 + i * 22, 44, 30 + i * 22);
      ctx.stroke();
    }
    ctx.restore();
    x += 190;
  }
  ctx.fillStyle = fg;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${Math.round(H * 0.2)}px Manrope, Inter, system-ui, sans-serif`;
  ctx.fillText(opts.brandName, x, H * 0.3, W - x - 20);
  ctx.font = `800 ${Math.round(H * 0.25)}px Manrope, Inter, system-ui, sans-serif`;
  ctx.fillStyle = opts.accent;
  ctx.fillText(opts.model, x, H * 0.58, W - x - 20);
  if (opts.text) {
    ctx.fillStyle = fg;
    ctx.font = `600 ${Math.round(H * 0.1)}px Inter, system-ui, sans-serif`;
    ctx.fillText(opts.text, 24, H * 0.98, W - 40);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Textura de franja reflectiva/advertencia para transporte (rojo/blanco). */
let warnTex: THREE.Texture | null = null;
export function warningStripes(): THREE.Texture {
  if (warnTex) return warnTex;
  const [c, ctx] = canvas(128, 32);
  for (let i = -2; i < 10; i++) {
    ctx.fillStyle = i % 2 ? '#d22' : '#f4f4f4';
    ctx.beginPath();
    ctx.moveTo(i * 16, 32);
    ctx.lineTo(i * 16 + 16, 32);
    ctx.lineTo(i * 16 + 32, 0);
    ctx.lineTo(i * 16 + 16, 0);
    ctx.fill();
  }
  warnTex = tex(c, true);
  return warnTex;
}

let strawTex: { color: THREE.Texture; normal: THREE.Texture } | null = null;
/**
 * Rastrojo procedural (sin assets externos): miles de trozos de paja en colores secos,
 * con canal alfa = cobertura. Tileable (los trazos que cruzan el borde se repiten).
 */
export function strawResidueTextures(size = 1024): { color: THREE.Texture; normal: THREE.Texture } {
  if (strawTex) return strawTex;
  const [c, ctx] = canvas(size, size);
  const [h, hctx] = canvas(size, size);
  hctx.fillStyle = '#000';
  hctx.fillRect(0, 0, size, size);
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const palette = ['#cdb98f', '#b9a378', '#ddcca2', '#a38e68', '#e6d8b2', '#bfae86', '#9a8462'];
  const strokes = Math.round(size * size * 0.0105);
  for (let i = 0; i < strokes; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const len = 16 + rnd() * rnd() * 110;
    const a = rnd() * Math.PI * 2;
    const w = 1.4 + rnd() * 3.2;
    const dx = Math.cos(a) * len;
    const dy = Math.sin(a) * len;
    const col = palette[Math.floor(rnd() * palette.length)];
    const bend = (rnd() - 0.5) * len * 0.25;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const x0 = x + ox;
        const y0 = y + oy;
        if (x0 + Math.abs(dx) < -10 || x0 - Math.abs(dx) > size + 10 || y0 + Math.abs(dy) < -10 || y0 - Math.abs(dy) > size + 10) continue;
        const cx = x0 + dx / 2 - (dy / len) * bend;
        const cy = y0 + dy / 2 + (dx / len) * bend;
        // sombra de contacto
        ctx.strokeStyle = 'rgba(30,22,14,0.28)';
        ctx.lineWidth = w + 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0 + 1.2, y0 + 1.6);
        ctx.quadraticCurveTo(cx + 1.2, cy + 1.6, x0 + dx + 1.2, y0 + dy + 1.6);
        ctx.stroke();
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx, cy, x0 + dx, y0 + dy);
        ctx.stroke();
        hctx.strokeStyle = `rgba(255,255,255,${0.35 + rnd() * 0.5})`;
        hctx.lineWidth = w;
        hctx.lineCap = 'round';
        hctx.beginPath();
        hctx.moveTo(x0, y0);
        hctx.quadraticCurveTo(cx, cy, x0 + dx, y0 + dy);
        hctx.stroke();
      }
    }
  }
  const color = tex(c, true);
  const normal = tex(heightToNormal(h, 3));
  color.anisotropy = normal.anisotropy = 8;
  strawTex = { color, normal };
  return strawTex;
}
