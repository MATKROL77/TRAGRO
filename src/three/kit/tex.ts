/**
 * Texturas procedurales (canvas). No dependen de red ni de archivos: se generan
 * una sola vez y se comparten entre todos los materiales.
 */
import * as THREE from 'three';

type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D no disponible');
  return [c, ctx];
}

/** Generador pseudoaleatorio determinístico (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido de valor fractal, tileable, en un Float32Array [0..1]. */
export function fbm(size: number, seed: number, baseCells = 4, octaves = 5, gain = 0.5): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = baseCells * 2 ** o;
    const rand = rng(seed + o * 101);
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    const smooth = (t: number) => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells;
      const y0 = Math.floor(fy);
      const ty = smooth(fy - y0);
      const y1 = (y0 + 1) % cells;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const x0 = Math.floor(fx);
        const tx = smooth(fx - x0);
        const x1 = (x0 + 1) % cells;
        const a = grid[y0 * cells + x0];
        const b = grid[y0 * cells + x1];
        const c = grid[y1 * cells + x0];
        const d = grid[y1 * cells + x1];
        out[y * size + x] += amp * (a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty);
      }
    }
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function finish(tex: THREE.Texture, srgb: boolean, repeat = true, aniso = 8): THREE.Texture {
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Mapa en escala de grises a partir de alturas [0..1]. */
export function grayTexture(heights: Float32Array, w: number, h: number, lo = 0, hi = 1): THREE.Texture {
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.round(255 * Math.min(1, Math.max(0, lo + (hi - lo) * heights[i])));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return finish(new THREE.CanvasTexture(c), false);
}

/** Normal map (convención OpenGL) a partir de un mapa de alturas. */
export function normalFromHeights(heights: Float32Array, w: number, h: number, strength: number, wrapX = true, wrapY = true): THREE.Texture {
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const at = (x: number, y: number) => {
    const xx = wrapX ? (x + w) % w : Math.min(w - 1, Math.max(0, x));
    const yy = wrapY ? (y + h) % h : Math.min(h - 1, Math.max(0, y));
    return heights[yy * w + xx];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const nx = -dx;
      const ny = dy;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      img.data[i] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(new THREE.CanvasTexture(c), false);
}

function heightsFromCanvas(ctx: Ctx, w: number, h: number): Float32Array {
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = d[i * 4] / 255;
  return out;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Variación sutil de rugosidad (desgaste, polvo fino): evita superficies "de plástico". */
export function wearRoughness(): THREE.Texture {
  return cached('wearRough', () => {
    const n = fbm(256, 7, 3, 5, 0.55);
    return grayTexture(n, 256, 256, 0.72, 1);
  });
}

/** Ondulación muy leve de chapa (piel de naranja de la pintura + chapa estirada). */
export function panelNormal(): THREE.Texture {
  return cached('panelNormal', () => normalFromHeights(fbm(256, 23, 2, 4, 0.45), 256, 256, 2.2));
}

/** Micro-relieve de plástico/caucho texturado. */
export function grainNormal(): THREE.Texture {
  return cached('grainNormal', () => {
    const t = normalFromHeights(fbm(128, 51, 32, 2, 0.6), 128, 128, 3);
    t.repeat.set(14, 14);
    return t;
  });
}

/** Chapa ondulada (silos, galpón): ondas horizontales en V (repetir en V). */
export function corrugatedNormal(): THREE.Texture {
  return cached('corrugated', () => {
    const W = 8;
    const H = 128;
    const h = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x] = 0.5 + 0.5 * Math.sin((y / H) * Math.PI * 2 * 4);
    const t = normalFromHeights(h, W, H, 6);
    return t;
  });
}

/** Piel de naranja del barniz: relieve muy fino y suave (se usa en el normal del clearcoat). */
export function orangePeelNormal(): THREE.Texture {
  return cached('orangePeel', () => {
    const t = normalFromHeights(fbm(256, 77, 22, 3, 0.55), 256, 256, 1.6);
    t.repeat.set(9, 9);
    return t;
  });
}

/** Banda de rodamiento + flancos con texto en relieve. Una vuelta completa en U. */
export function tireNormal(label: string): THREE.Texture {
  return cached(`tire:${label}`, () => {
    const W = 2048;
    const H = 256;
    const [, ctx] = makeCanvas(W, H);
    // v = 1 arriba del canvas. Zonas (en px de alto): talón, flanco, hombro, banda, hombro, flanco, talón.
    const bead = 14;
    const side = 62;
    const shoulder = 16;
    const tread = H - 2 * (bead + side + shoulder);
    const y0 = bead + side + shoulder;

    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.fillRect(0, 0, W, H);

    // Banda: costillas con surcos circunferenciales en zigzag y laminillas.
    ctx.fillStyle = 'rgb(205,205,205)';
    ctx.fillRect(0, y0, W, tread);
    const grooves = 4;
    ctx.strokeStyle = 'rgb(10,10,10)';
    ctx.lineWidth = 7;
    for (let g = 1; g <= grooves; g++) {
      const gy = y0 + (tread * g) / (grooves + 1);
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const off = (Math.floor(x / 16) % 2 === 0 ? -1 : 1) * 2.2;
        if (x === 0) ctx.moveTo(x, gy + off);
        else ctx.lineTo(x, gy + off);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgb(70,70,70)';
    ctx.lineWidth = 1.6;
    for (let x = 0; x < W; x += 16) {
      for (let r = 0; r <= grooves; r++) {
        const ry0 = y0 + (tread * r) / (grooves + 1) + 5;
        const ry1 = y0 + (tread * (r + 1)) / (grooves + 1) - 5;
        const shift = r % 2 === 0 ? 0 : 8;
        ctx.beginPath();
        ctx.moveTo(x + shift, ry0);
        ctx.lineTo(x + shift + 5, ry1);
        ctx.stroke();
      }
    }
    // Hombros: tacos transversales.
    for (const sy of [y0 - shoulder, y0 + tread]) {
      ctx.fillStyle = 'rgb(175,175,175)';
      ctx.fillRect(0, sy, W, shoulder);
      ctx.fillStyle = 'rgb(40,40,40)';
      for (let x = 0; x < W; x += 32) ctx.fillRect(x, sy + 2, 9, shoulder - 4);
    }
    // Flancos: aros finos y texto en relieve sutil.
    const drawSide = (top: number, flip: boolean) => {
      ctx.fillStyle = 'rgb(150,150,150)';
      ctx.fillRect(0, top + 5, W, 1.5);
      ctx.fillRect(0, top + side - 8, W, 1.5);
      ctx.save();
      ctx.fillStyle = 'rgb(160,160,160)';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const words = [label, 'RADIAL', 'TUBELESS', '152/148 M', label, 'REGROOVABLE', 'STEEL BELTED', 'M+S'];
      words.forEach((wd, i) => {
        const cx = ((i + 0.5) / words.length) * W;
        ctx.save();
        ctx.translate(cx, top + side / 2);
        if (flip) ctx.rotate(Math.PI);
        // La U del neumático corre en sentido antihorario visto de afuera: se espeja para que se lea.
        ctx.scale(-1, 1);
        ctx.font = `${i % 4 === 0 ? 800 : 700} ${i % 4 === 0 ? 26 : 15}px Arial, Helvetica, sans-serif`;
        ctx.fillText(wd, 0, 1);
        ctx.restore();
      });
      ctx.restore();
    };
    drawSide(bead, true);
    drawSide(H - bead - side, false);

    const heights = heightsFromCanvas(ctx, W, H);
    const tex = normalFromHeights(heights, W, H, 3.2, true, false);
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    return tex;
  });
}

/** Color del neumático: banda apenas más clara y polvorienta que el flanco. */
export function tireColor(): THREE.Texture {
  return cached('tireColor', () => {
    const W = 256;
    const H = 128;
    const [c, ctx] = makeCanvas(W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b1b1c');
    g.addColorStop(0.3, '#1d1d1e');
    g.addColorStop(0.38, '#2a2927');
    g.addColorStop(0.62, '#2a2927');
    g.addColorStop(0.7, '#1d1d1e');
    g.addColorStop(1, '#1b1b1c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const n = fbm(128, 91, 6, 4, 0.5);
    const img = ctx.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = 0.86 + 0.28 * n[(y % 128) * 128 + (x % 128)];
        const i = (y * W + x) * 4;
        img.data[i] *= k;
        img.data[i + 1] *= k;
        img.data[i + 2] *= k;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = finish(new THREE.CanvasTexture(c), true);
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

/** Cinta retrorreflectiva: tramos alternados blanco / rojo con trama de panal. */
export function reflectiveTape(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const map = cached('tapeColor', () => {
    const W = 512;
    const H = 64;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = '#f4f4ef';
    ctx.fillRect(0, 0, W / 2, H);
    ctx.fillStyle = '#c4151c';
    ctx.fillRect(W / 2, 0, W / 2, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 1;
    for (let x = -H; x < W + H; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + H, H);
      ctx.moveTo(x + H, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    return finish(new THREE.CanvasTexture(c), true);
  });
  const normalMap = cached('tapeNormal', () => {
    const S = 64;
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 16) * Math.sin((y / S) * Math.PI * 16);
    return normalFromHeights(h, S, S, 1.2);
  });
  return { map, normalMap };
}

/** Chapa antideslizante "semilla de melón" (lágrimas alternadas). */
export function diamondPlateNormal(): THREE.Texture {
  return cached('diamondN', () => {
    const S = 256;
    const [, ctx] = makeCanvas(S, S);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    const cell = S / 4;
    const drop = (cx: number, cy: number, rot: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, cell * 0.42);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.55, '#bbb');
      g.addColorStop(1, '#000');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, cell * 0.42, cell * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    for (let gy = -1; gy <= 4; gy++) {
      for (let gx = -1; gx <= 4; gx++) {
        const odd = (gx + gy) % 2 !== 0;
        drop((gx + 0.5) * cell, (gy + 0.5) * cell, odd ? Math.PI / 4 : -Math.PI / 4);
      }
    }
    return normalFromHeights(heightsFromCanvas(ctx, S, S), S, S, 5);
  });
}

/** Tejido de lona de PVC. */
export function tarpNormal(): THREE.Texture {
  return cached('tarpN', () => {
    const S = 128;
    const h = new Float32Array(S * S);
    const n = fbm(S, 5, 4, 3, 0.5);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const wx = Math.sin((x / S) * Math.PI * 2 * 16);
        const wy = Math.sin((y / S) * Math.PI * 2 * 16);
        h[y * S + x] = 0.5 + 0.2 * wx * wy + 0.12 * (Math.abs(wx) - Math.abs(wy)) + 0.2 * n[y * S + x];
      }
    }
    return normalFromHeights(h, S, S, 2.4);
  });
}

/** Pliegues largos y suaves de la lona tensada. */
export function tarpWrinkles(): THREE.Texture {
  return cached('tarpWrinkles', () => normalFromHeights(fbm(256, 77, 2, 4, 0.5), 256, 256, 5));
}

/** Tablones de madera dura (color + normal). */
export function woodPlanks(): { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } {
  const S = 512;
  const plank = S / 4;
  const build = () => {
    const rand = rng(404);
    const [c, ctx] = makeCanvas(S, S);
    const [, hctx] = makeCanvas(S, S);
    const grain = fbm(S, 12, 2, 6, 0.6);
    const img = ctx.createImageData(S, S);
    const himg = hctx.createImageData(S, S);
    const tones: [number, number, number][] = [];
    const offsets: number[] = [];
    for (let i = 0; i < 4; i++) {
      const k = 0.82 + rand() * 0.36;
      tones.push([118 * k, 82 * k, 52 * k]);
      offsets.push(Math.floor(rand() * S));
    }
    for (let y = 0; y < S; y++) {
      const p = Math.floor(y / plank);
      const inPlank = y % plank;
      const joint = inPlank < 3 || inPlank > plank - 3;
      for (let x = 0; x < S; x++) {
        const gx = (x + offsets[p]) % S;
        // veta: ruido muy estirado a lo largo de la tabla
        const g = grain[((y * 5) % S) * S + (Math.floor(gx / 6) % S)];
        const g2 = grain[(y % S) * S + gx];
        const v = 0.72 + 0.4 * g + 0.12 * g2;
        const butt = (gx + p * 97) % S < 3;
        const dark = joint || butt ? 0.32 : 1;
        const i = (y * S + x) * 4;
        img.data[i] = tones[p][0] * v * dark;
        img.data[i + 1] = tones[p][1] * v * dark;
        img.data[i + 2] = tones[p][2] * v * dark;
        img.data[i + 3] = 255;
        const hv = (joint || butt ? 0 : 0.6 + 0.4 * g) * 255;
        himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = hv;
        himg.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    hctx.putImageData(himg, 0, 0);
    const heights = heightsFromCanvas(hctx, S, S);
    return {
      map: finish(new THREE.CanvasTexture(c), true),
      normalMap: normalFromHeights(heights, S, S, 2.5),
      roughnessMap: grayTexture(grain, S, S, 0.62, 0.95),
    };
  };
  const map = cached('woodC', () => build().map);
  const normalMap = cached('woodN', () => build().normalMap);
  const roughnessMap = cached('woodR', () => build().roughnessMap);
  return { map, normalMap, roughnessMap };
}

/** Galvanizado: cristales de zinc apenas visibles en rugosidad. */
export function galvanizedRoughness(): THREE.Texture {
  return cached('galvR', () => {
    const S = 256;
    const rand = rng(31);
    const pts: [number, number, number][] = [];
    for (let i = 0; i < 90; i++) pts.push([rand() * S, rand() * S, rand()]);
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let best = 1e9;
        let val = 0;
        for (const [px, py, pv] of pts) {
          const dx = Math.min(Math.abs(x - px), S - Math.abs(x - px));
          const dy = Math.min(Math.abs(y - py), S - Math.abs(y - py));
          const d = dx * dx + dy * dy;
          if (d < best) {
            best = d;
            val = pv;
          }
        }
        h[y * S + x] = val;
      }
    }
    return grayTexture(h, S, S, 0.45, 0.8);
  });
}

/** Patente genérica formato Mercosur (sin datos reales). */
export function licensePlate(): THREE.Texture {
  return cached('plate', () => {
    const W = 400;
    const H = 130;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = '#f7f7f4';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#123f8c';
    ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = '#fff';
    ctx.font = '700 15px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('REPUBLICA ARGENTINA', W / 2, 16);
    ctx.fillStyle = '#111';
    ctx.font = '800 76px Arial, Helvetica, sans-serif';
    ctx.fillText('AB 123 CD', W / 2, 84);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    const tex = finish(new THREE.CanvasTexture(c), true, false);
    return tex;
  });
}

/** Cartel circular de velocidad máxima (obligatorio en la cola). */
export function speedSign(): THREE.Texture {
  return cached('speed', () => {
    const S = 128;
    const [c, ctx] = makeCanvas(S, S);
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#f6f6f2';
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = '800 64px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('80', S / 2, S / 2 + 4);
    return finish(new THREE.CanvasTexture(c), true, false);
  });
}

export function disposeProceduralTextures(): void {
  cache.forEach((t) => t.dispose());
  cache.clear();
}
