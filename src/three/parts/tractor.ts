/**
 * Tractor genérico SIN MARCA para dar escala: cabina frontal neutra, chasis,
 * plato de enganche, tanques, guardabarros y ruedas instanciadas. Deliberadamente
 * sobrio: no reproduce rasgos de ningún fabricante.
 */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Assembly } from '../kit/asm';
import { arcBand, bar, box, cyl, extrudeUp, pipe, rbox, sheet, type P2 } from '../kit/geo';
import type { MaterialSet } from '../materials';
import { createWheelSet, wheelGeometry, type WheelPose } from './wheels';

export interface TractorOptions {
  /** Posición del perno rey del semi. */
  kingpinX: number;
  kingpinY: number;
  /** Frente de la caja del semi y altura aproximada de sus conexiones de servicio. */
  trailerFrontX: number;
  serviceY: number;
  /** 4x2 o 6x2. */
  axles: '4x2' | '6x2';
  /** Distancia del perno rey al paragolpes delantero (legal.json). */
  frontLength: number;
  aluminium: boolean;
}

export interface TractorModel {
  root: THREE.Group;
  dispose: () => void;
}

let cabPaint: THREE.MeshPhysicalMaterial | null = null;
let cabGlass: THREE.MeshPhysicalMaterial | null = null;

function cabMaterials(): { paint: THREE.MeshPhysicalMaterial; glass: THREE.MeshPhysicalMaterial } {
  // Color neutro: no compite con el semi, que es el protagonista.
  cabPaint ??= new THREE.MeshPhysicalMaterial({ color: '#dfe2e5', roughness: 0.36, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12 });
  cabGlass ??= new THREE.MeshPhysicalMaterial({ color: '#0d1217', roughness: 0.16, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.1, envMapIntensity: 0.55 });
  return { paint: cabPaint, glass: cabGlass };
}

/** Casco de la cabina: perfil lateral extruido a lo ancho, con aristas redondeadas y pasarrueda. */
function cabShell(xB: number, axleX: number, wheelY: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const r = 0.7;
  const yBottom = 1.02;
  const a0 = Math.PI - Math.asin((yBottom - wheelY) / r);
  const a1 = Math.asin((0.64 - wheelY) / r);
  s.moveTo(xB - 2.3, yBottom);
  s.lineTo(axleX + r * Math.cos(a0), yBottom);
  s.absarc(axleX, wheelY, r, a0, a1, true);
  s.lineTo(xB - 0.66, 0.52);
  s.lineTo(xB - 0.12, 0.52);
  s.quadraticCurveTo(xB, 0.52, xB, 0.66);
  s.lineTo(xB, 1.92);
  s.quadraticCurveTo(xB, 2.02, xB - 0.04, 2.08);
  s.lineTo(xB - 0.29, 2.96);
  s.quadraticCurveTo(xB - 0.37, 3.3, xB - 0.82, 3.44);
  s.quadraticCurveTo(xB - 1.3, 3.56, xB - 2.1, 3.56);
  s.quadraticCurveTo(xB - 2.3, 3.56, xB - 2.3, 3.38);
  s.closePath();
  const bevel = 0.085;
  const width = 2.46;
  let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(s, {
    depth: width - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 4,
    curveSegments: 14,
  });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  g = toCreasedNormals(g, 0.7);
  return g;
}

export function buildTractor(o: TractorOptions, mats: MaterialSet): TractorModel {
  const asm = new Assembly();
  const { paint, glass } = cabMaterials();
  const kx = o.kingpinX;
  const six = o.axles === '6x2';
  const R = wheelGeometry(true).radius;
  const Rf = wheelGeometry(false).radius;
  const xB = kx + o.frontLength; // cara delantera del paragolpes
  const xF = xB - 1.42; // eje delantero
  // 4x2: eje motriz detrás del perno. 6x2: motriz + eje portante, sin invadir las patas del semi.
  const rear: number[] = six ? [kx + 0.39, kx - 0.93] : [xF - 3.6];
  const xEnd = rear[rear.length - 1] - 0.62;
  const frameTop = 0.98;
  const frameZ = 0.42;

  // --- Chasis ---------------------------------------------------------------------
  for (const s of [1, -1]) {
    asm.add('blackSteel', box(xB - 0.55 - xEnd, 0.27, 0.075, (xB - 0.55 + xEnd) / 2, frameTop - 0.135, s * frameZ));
  }
  for (let x = xEnd + 0.12; x < xB - 0.9; x += 0.95) asm.add('blackSteel', box(0.07, 0.2, frameZ * 2, x, frameTop - 0.14, 0));
  // Travesaño de cola con luces.
  asm.add('blackSteel', rbox(0.08, 0.16, 1.9, xEnd + 0.02, frameTop - 0.16, 0, 0.01));
  for (const s of [1, -1]) {
    asm.add('lensRed', rbox(0.02, 0.09, 0.22, xEnd - 0.03, frameTop - 0.16, s * 0.78, 0.006));
    asm.add('lensAmber', rbox(0.02, 0.09, 0.1, xEnd - 0.03, frameTop - 0.16, s * 0.6, 0.006));
  }

  // --- Plato de enganche ------------------------------------------------------------
  const plateTop = o.kingpinY - 0.004;
  const pl: P2[] = [];
  // Contorno con garganta en V hacia atrás (planta x, z).
  const pr = 0.47;
  for (let i = 0; i <= 20; i++) {
    const a = -Math.PI * 0.72 + (i / 20) * Math.PI * 1.44;
    pl.push([kx + 0.06 + Math.cos(a) * pr, Math.sin(a) * pr]);
  }
  pl.push([kx - 0.42, 0.22], [kx - 0.02, 0.045], [kx - 0.02, -0.045], [kx - 0.42, -0.22]);
  asm.add('blackSteel', extrudeUp(pl, plateTop - 0.05, 0.05));
  asm.add('blackSteel', rbox(0.95, 0.03, 0.96, kx + 0.04, frameTop + 0.015, 0, 0.006));
  for (const s of [1, -1]) {
    asm.add('blackSteel', rbox(0.5, plateTop - 0.05 - frameTop - 0.03, 0.07, kx + 0.05, (plateTop - 0.05 + frameTop + 0.03) / 2, s * 0.4, 0.008));
    asm.add('castIron', cyl(0.045, 0.1, 'z', kx + 0.05, plateTop - 0.085, s * 0.4, 12));
  }
  asm.add('galvanized', bar({ x: kx - 0.3, y: plateTop - 0.07, z: 0.5 }, { x: kx + 0.1, y: plateTop - 0.07, z: 0.62 }, 0.025, 0.025));

  // --- Ejes -------------------------------------------------------------------------
  asm.add('blackSteel', cyl(0.06, 2.0, 'z', xF, Rf, 0, 14));
  rear.forEach((x, i) => {
    asm.add('blackSteel', cyl(0.0635, 1.94, 'z', x, R, 0, 16));
    for (const s of [1, -1]) asm.add('castIron', cyl(0.212, 0.25, 'z', x, R, s * 0.82, 24));
    if (i === 0) {
      // Diferencial del eje motriz.
      const diff = new THREE.SphereGeometry(0.21, 18, 12);
      diff.scale(1.05, 1, 1.25);
      diff.translate(x, R, 0);
      asm.add('castIron', diff, cyl(0.07, 0.5, 'x', x + 0.32, R + 0.02, 0, 12));
    }
    // Fuelles de la suspensión trasera.
    for (const s of [1, -1]) asm.add('rubber', cyl(0.12, 0.2, 'y', x - 0.34, frameTop - 0.37, s * frameZ, 16));
  });

  // --- Guardabarros traseros y barreros ------------------------------------------------
  const rF = R + 0.085;
  rear.forEach((x, i) => {
    for (const s of [1, -1]) {
      const z = s * 0.97;
      asm.add('plastic', arcBand(x, R + 0.012, rF, rF + 0.01, (16 * Math.PI) / 180, (164 * Math.PI) / 180, 0.69, z, 22));
      asm.add('blackSteel', cyl(0.016, 0.62, 'z', x, R + 0.012 + rF + 0.026, z - s * 0.2, 8));
      if (i === rear.length - 1) asm.add('rubber', rbox(0.012, 0.5, 0.62, x - rF - 0.03, 0.45, z, 0.004));
    }
  });

  // --- Tanques y cajas entre ejes -------------------------------------------------------
  const gap0 = rear[0] + R + 0.16;
  const gap1 = xF - Rf - 0.2;
  const gapLen = gap1 - gap0;
  const tankLen = Math.min(1.25, gapLen - 0.12);
  const tankX = gap1 - tankLen / 2 - 0.02;
  if (tankLen > 0.5) {
    // Tanque de combustible de aluminio (lado izquierdo) con cintas y tapa.
    const tz = -0.86;
    asm.add('aluBrushed', cyl(0.31, tankLen, 'x', tankX, 0.66, tz, 28));
    asm.add('aluBrushed', cyl(0.3, 0.02, 'x', tankX - tankLen / 2 - 0.008, 0.66, tz, 28), cyl(0.3, 0.02, 'x', tankX + tankLen / 2 + 0.008, 0.66, tz, 28));
    for (const dx of [-tankLen * 0.28, tankLen * 0.28]) asm.add('blackSteel', cyl(0.316, 0.045, 'x', tankX + dx, 0.66, tz, 28));
    asm.add('plastic', cyl(0.05, 0.05, 'y', tankX + tankLen * 0.3, 0.985, tz, 14));
    for (const dx of [-tankLen * 0.28, tankLen * 0.28]) asm.add('blackSteel', box(0.05, 0.08, 0.4, tankX + dx, 0.88, tz + 0.2));
    // Lado derecho: caja de baterías y depósitos de aire.
    const bz = 0.9;
    const boxLen = Math.min(0.72, tankLen);
    asm.add('plastic', rbox(boxLen, 0.46, 0.56, gap1 - boxLen / 2 - 0.02, 0.69, bz, 0.03));
    asm.add('blackSteel', rbox(boxLen - 0.1, 0.012, 0.5, gap1 - boxLen / 2 - 0.02, 0.925, bz, 0.004));
    if (tankLen - boxLen > 0.35) {
      const ax = gap1 - boxLen - 0.06 - (tankLen - boxLen - 0.08) / 2;
      for (const dy of [0.56, 0.82]) asm.add('aluBrushed', cyl(0.11, tankLen - boxLen - 0.08, 'x', ax, dy, bz - 0.08, 18));
    }
  }

  // --- Cabina --------------------------------------------------------------------------
  asm.add('bodyPaint', cabShell(xB, xF, Rf));
  const zs = 1.23 + 0.004;
  // Parabrisas.
  const wb: [number, number] = [xB - 0.04 + 0.012, 2.12];
  const wt: [number, number] = [xB - 0.29 + 0.012, 2.9];
  asm.add('glass', sheet([wb[0], wb[1], 1.07], [wb[0], wb[1], -1.07], [wt[0], wt[1], -1.03], [wt[0], wt[1], 1.03], 0.01));
  // Parasol y montantes.
  asm.add('plastic', rbox(0.26, 0.03, 2.2, xB - 0.2, 2.985, 0, 0.012));
  // Ventanillas laterales, juntas de puerta y manijas.
  for (const s of [1, -1]) {
    const a = [xB - 1.08, 2.14, s * zs];
    const b = [xB - 0.24, 2.14, s * zs];
    const c = [xB - 0.42, 2.9, s * zs];
    const d = [xB - 1.08, 2.9, s * zs];
    asm.add('glass', s === 1 ? sheet(a, b, c, d, 0.01) : sheet(b, a, d, c, 0.01));
    asm.add('plastic', box(0.012, 1.86, 0.006, xB - 1.17, 2.06, s * (zs - 0.002)), box(1.02, 0.012, 0.006, xB - 0.66, 1.13, s * (zs - 0.002)));
    asm.add('plastic', rbox(0.14, 0.035, 0.022, xB - 1.04, 1.86, s * (zs + 0.006), 0.008));
    // Estribos en el frente del pasarrueda.
    for (const y of [0.64, 0.9]) asm.add('plastic', rbox(0.4, 0.035, 0.1, xB - 0.38, y, s * 1.21, 0.01));
    // Pasarrueda delantero.
    asm.add('plastic', arcBand(xF, Rf, 0.62, 0.705, (4 * Math.PI) / 180, (176 * Math.PI) / 180, 0.5, s * 1.0, 26));
    // Espejos.
    const mz = s * 1.47;
    asm.add('plastic', pipe([[xB - 0.2, 2.95, s * 1.2], [xB - 0.1, 2.9, mz], [xB - 0.1, 2.2, mz], [xB - 0.2, 2.16, s * 1.2]], 0.014, 6));
    asm.add('plastic', rbox(0.09, 0.5, 0.2, xB - 0.11, 2.56, mz + s * 0.03, 0.03));
    asm.add('chrome', box(0.004, 0.44, 0.16, xB - 0.158, 2.56, mz + s * 0.03));
    // Luces de posición laterales.
    asm.add('lensAmber', rbox(0.07, 0.03, 0.012, xB - 1.9, 1.16, s * (zs + 0.002), 0.004));
  }
  // Parrilla genérica de lamas horizontales, deflectores de esquina y limpiaparabrisas.
  asm.add('plastic', rbox(0.03, 0.86, 1.86, xB + 0.004, 1.5, 0, 0.02));
  for (let i = 0; i < 7; i++) asm.add('blackSteel', rbox(0.02, 0.03, 1.74, xB + 0.024, 1.14 + i * 0.12, 0, 0.006));
  asm.add('aluBrushed', rbox(0.016, 0.035, 1.78, xB + 0.026, 1.975, 0, 0.006));
  for (const s of [1, -1]) {
    asm.add('plastic', rbox(0.06, 0.9, 0.05, xB - 0.03, 1.5, s * 1.19, 0.015));
    asm.add('blackSteel', bar({ x: xB - 0.035, y: 2.13, z: s * 0.2 }, { x: xB - 0.13, y: 2.5, z: s * 0.78 }, 0.014, 0.014));
  }
  // Zócalo oscuro: asienta visualmente la cabina sobre el chasis.
  for (const s of [1, -1]) asm.add('plastic', box(0.36, 0.1, 0.012, xB - 2.11, 1.07, s * (zs - 0.002)));
  // Paragolpes con ópticas.
  asm.add('plastic', rbox(0.42, 0.5, 2.5, xB - 0.19, 0.69, 0, 0.05), rbox(0.3, 0.07, 2.3, xB - 0.12, 0.42, 0, 0.02));
  for (const s of [1, -1]) {
    asm.add('chrome', rbox(0.02, 0.19, 0.46, xB + 0.016, 0.8, s * 0.88, 0.01));
    asm.add('lensWhite', rbox(0.02, 0.15, 0.3, xB + 0.026, 0.8, s * 0.93, 0.01));
    asm.add('lensAmber', rbox(0.02, 0.15, 0.1, xB + 0.026, 0.8, s * 0.7, 0.01));
    asm.add('lensWhite', cyl(0.05, 0.02, 'x', xB + 0.022, 0.56, s * 0.8, 16));
  }
  // Balizas de techo.
  for (const z of [-0.8, -0.4, 0, 0.4, 0.8]) asm.add('lensAmber', rbox(0.05, 0.025, 0.09, xB - 0.62, 3.405 + (Math.abs(z) < 0.5 ? 0.012 : 0), z, 0.008));

  // --- Detrás de la cabina ----------------------------------------------------------------
  const xc = xB - 2.3;
  // Escape vertical con protector y toma de aire.
  asm.add('aluBrushed', cyl(0.065, 2.35, 'y', xc - 0.16, 2.2, -0.98, 16));
  asm.add('blackSteel', cyl(0.085, 1.0, 'y', xc - 0.16, 1.75, -0.98, 16), box(0.05, 0.05, 0.12, xc - 0.05, 2.9, -0.98), box(0.05, 0.05, 0.12, xc - 0.05, 1.4, -0.98));
  asm.add('plastic', rbox(0.17, 1.9, 0.3, xc - 0.11, 2.45, 0.98, 0.04), rbox(0.2, 0.26, 0.34, xc - 0.12, 3.5, 0.98, 0.05));
  // Pasarela sobre el chasis y mangueras espiraladas al semi.
  asm.add('diamond', rbox(Math.max(0.3, xc - 0.1 - (kx + 0.62)), 0.02, 0.92, (xc - 0.1 + kx + 0.62) / 2, frameTop + 0.02, 0, 0.004));
  const lines: ['redPaint' | 'yellowPaint' | 'plastic', number, number][] = [
    ['redPaint', -0.16, -0.13],
    ['yellowPaint', 0, -0.04],
    ['plastic', 0.16, 0.1],
  ];
  for (const [mat, z0, z1] of lines) {
    const x0 = xc - 0.02;
    const x1 = o.trailerFrontX + 0.06;
    const pts: [number, number, number][] = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // Curva colgante con espiral apretada, como las mangueras reales.
      const sag = Math.sin(Math.PI * t) * 0.34;
      const coil = i > 1 && i < N - 1 ? 0.035 : 0;
      pts.push([x0 + (x1 - x0) * t, 1.78 + (o.serviceY - 1.78) * t - sag + Math.sin(i * 2.6) * coil, z0 + (z1 - z0) * t + Math.cos(i * 2.6) * coil]);
    }
    asm.add(mat, pipe(pts, 0.012, 6, true));
  }

  // --- Ruedas ----------------------------------------------------------------------------
  let seed = 11;
  const spin = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * Math.PI * 2;
  };
  const front: WheelPose[] = [1, -1].map((s) => ({ x: xF, y: Rf, z: s * 1.03, side: s as 1 | -1, axle: -1, spin: spin() }));
  const back: WheelPose[] = [];
  for (const x of rear) for (const s of [1, -1] as const) for (const [k, wz] of [0.8, 1.14].entries()) back.push({ x, y: R, z: s * wz, side: s, inner: k === 0, axle: -1, spin: spin() });
  const tractorMats = { ...mats, bodyPaint: paint, glass } as MaterialSet;
  const wFront = createWheelSet(front, false, o.aluminium, mats);
  const wBack = createWheelSet(back, true, o.aluminium, mats);
  for (const obj of [...wFront.objects, ...wBack.objects]) asm.attach(obj, 'root');

  const built = asm.build(tractorMats);
  built.root.name = 'tractor';
  return {
    root: built.root,
    dispose: () => {
      built.dispose();
      wFront.dispose();
      wBack.dispose();
    },
  };
}
