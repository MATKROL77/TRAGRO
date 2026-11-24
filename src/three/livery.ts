/**
 * Rotulado de la flota: compone logo + texto en un canvas que el shader de
 * pintura proyecta sobre la caja (queda integrado al material, no "pegado").
 */
import * as THREE from 'three';
import type { LogoConfig, TextConfig } from '@/core/types';

const FONT: Record<string, string> = {
  manrope: '800 {s}px "Manrope Variable", Manrope, Arial, sans-serif',
  barlow: '700 {s}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif',
  slab: '700 {s}px "Roboto Slab", Georgia, serif',
};

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('logo'));
      img.src = src;
    });
    imageCache.set(src, p);
    if (imageCache.size > 6) imageCache.delete(imageCache.keys().next().value as string);
  }
  return p;
}

export function luminance(hex: string): number {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export interface LiveryInput {
  logo: LogoConfig;
  texto: TextConfig | null;
  /** Ancho y alto del área en metros. */
  w: number;
  h: number;
  /** Color de fondo sobre el que se rotula (para el color automático del texto). */
  baseHex: string;
}

/** Devuelve null si no hay nada que dibujar. */
export async function composeLivery(input: LiveryInput): Promise<HTMLCanvasElement | null> {
  const { logo, texto } = input;
  const hasLogo = !!logo.data;
  const text = texto?.valor.trim() ?? '';
  if (!hasLogo && !text) return null;

  const W = 2048;
  const H = Math.max(128, Math.min(1024, Math.round((W * input.h) / input.w)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, W, H);

  if (hasLogo) {
    try {
      const img = await loadImage(logo.data as string);
      const iw = img.naturalWidth || 512;
      const ih = img.naturalHeight || 512;
      let lh = H * logo.escala;
      let lw = (lh * iw) / ih;
      if (lw > W * 0.9) {
        lw = W * 0.9;
        lh = (lw * ih) / iw;
      }
      const cx = W / 2 + (logo.x * (W - lw)) / 2;
      const cy = H / 2 - (logo.y * (H - lh)) / 2;
      ctx.drawImage(img, cx - lw / 2, cy - lh / 2, lw, lh);
    } catch {
      // logo ilegible: se ignora sin romper nada
    }
  }

  if (text && texto) {
    const size = Math.round(H * 0.5 * texto.escala);
    const font = (FONT[texto.fuente] ?? FONT.manrope).replace('{s}', String(size));
    try {
      await document.fonts.load(font, text);
    } catch {
      // se usa la tipografía de reemplazo
    }
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dark = luminance(input.baseHex) > 0.32;
    ctx.fillStyle = texto.color === 'blanco' ? '#f6f6f3' : texto.color === 'negro' ? '#141518' : dark ? '#141518' : '#f6f6f3';
    let tw = ctx.measureText(text).width;
    let s = size;
    if (tw > W * 0.94) {
      s = Math.floor((size * W * 0.94) / tw);
      ctx.font = (FONT[texto.fuente] ?? FONT.manrope).replace('{s}', String(s));
      tw = ctx.measureText(text).width;
    }
    const cx = W / 2 + (texto.x * (W - tw)) / 2;
    const cy = H / 2 - (texto.y * (H - s)) / 2;
    ctx.fillText(text, cx, cy);
  }
  return canvas;
}

export function liveryTexture(canvas: HTMLCanvasElement, anisotropy = 8): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  // Se sube premultiplicada y sin conversión: el shader la decodifica (bordes limpios con mipmaps).
  tex.colorSpace = THREE.NoColorSpace;
  tex.premultiplyAlpha = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = anisotropy;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Impresión blanca para los barreros: el logo de la flota o, si no hay, el nombre de marca. */
export async function composeFlapPrint(logoData: string | null, fallbackText: string): Promise<HTMLCanvasElement> {
  const W = 512;
  const H = 320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  if (logoData) {
    try {
      const img = await loadImage(logoData);
      const k = Math.min((W * 0.86) / (img.naturalWidth || 1), (H * 0.8) / (img.naturalHeight || 1));
      const w = (img.naturalWidth || 1) * k;
      const h = (img.naturalHeight || 1) * k;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      // Tinta blanca: se conserva la forma (alfa) y se aclara el color.
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(245,245,242,0.88)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      return canvas;
    } catch {
      // sigue con el texto
    }
  }
  const font = '800 96px "Manrope Variable", Manrope, Arial, sans-serif';
  try {
    await document.fonts.load(font, fallbackText);
  } catch {
    // tipografía de reemplazo
  }
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f5f5f2';
  const tw = ctx.measureText(fallbackText).width;
  if (tw > W * 0.9) ctx.font = font.replace('96px', `${Math.floor((96 * W * 0.9) / tw)}px`);
  ctx.fillText(fallbackText, W / 2, H / 2);
  return canvas;
}
