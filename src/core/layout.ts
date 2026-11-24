/**
 * Layout geométrico del equipo: medidas y posiciones clave en metros (1 unidad = 1 m).
 * Es una función pura de la configuración; la usan el modelo 3D, la ficha técnica,
 * la validación legal, las cámaras y los hotspots.
 *
 * Sistema de coordenadas: X = largo (frente del semi hacia +X), Y = arriba, Z = lateral.
 * El origen está en el piso, en el centro del largo de la caja.
 */
import type { Config, TypeId } from './types';

export const WIDTH = 2.6;
export const KINGPIN_PLATE_Y = 1.26;
/** Distancia mínima legal entre ejes para que cuenten como independientes (referencia). */
export const SPREAD_MIN = 2.4;

export interface AxleLayout {
  x: number;
  lifted: boolean;
}

export interface HopperLayout {
  /** Centro de la boca. */
  x: number;
  /** Semilargo de la boca y del rectángulo superior del embudo. */
  mouthHalf: number;
  topHalfFront: number;
  topHalfRear: number;
}

export interface TolvaLayout {
  railY: number;
  mouthY: number;
  mouthHalfZ: number;
  hoppers: HopperLayout[];
  /** Tramos de piso entre embudos: caballetes y rampas de los extremos. */
  ridges: { x0: number; x1: number; kind: 'front' | 'rear' | 'mid'; rise: number }[];
}

export interface Layout {
  tipo: TypeId;
  /** Largo y alto elegidos (parámetros). */
  L: number;
  H: number;
  W: number;
  frontX: number;
  rearX: number;
  /** Cara superior del chasis (o del larguero perimetral en la tolva). */
  deckY: number;
  /** Cara superior del piso de carga. */
  floorY: number;
  /** Borde superior de la caja (sin lona). */
  bodyTopY: number;
  kingpinX: number;
  kingpinY: number;
  landingX: number;
  axles: AxleLayout[];
  axleConfig: string;
  grouped: boolean;
  spacing: number;
  suspension: 'mecanica' | 'neumatica';
  dual: boolean;
  aluminium: boolean;
  wheelR: number;
  tireW: number;
  /** Centros de neumáticos por lado (valores positivos de Z). */
  wheelZ: number[];
  /** Semiseparación de largueros / centro de elásticos. */
  railZ: number;
  frontExtra: number;
  rearExtra: number;
  totalLength: number;
  totalHeight: number;
  totalWidth: number;
  volumeM3: number | null;
  areaM2: number;
  tolva?: TolvaLayout;
}

const KINGPIN_SETBACK: Record<TypeId, number> = { tolva: 1.1, batea: 1.1, plataforma: 1.3, furgon: 1.3 };
const REAR_OVERHANG: Record<TypeId, number> = { tolva: 0.95, batea: 0.9, plataforma: 1.25, furgon: 1.25 };
const DECK_Y: Record<TypeId, number> = { tolva: 1.55, batea: 1.36, plataforma: 1.38, furgon: 1.38 };

const GROUP_SPACING = 1.3;
const SPREAD_SPACING = 2.45;

function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function computeLayout(cfg: Config): Layout {
  const tipo = cfg.tipo;
  const L = Number(cfg.sel.largo);
  const H = Number(cfg.sel.alto);
  const frontX = L / 2;
  const rearX = -L / 2;
  const axleConfig = String(cfg.sel.ejes);
  const dual = cfg.sel.ruedas !== 'single';
  const wheelR = dual ? 0.522 : 0.536;
  const tireW = dual ? 0.295 : 0.385;
  const wheelZ = dual ? [0.8, 1.14] : [1.075];
  const kingpinX = frontX - KINGPIN_SETBACK[tipo];

  // --- Ejes -----------------------------------------------------------------
  const last = rearX + REAR_OVERHANG[tipo];
  const grouped = axleConfig === 'tandem' || axleConfig === 'tridem';
  const n = axleConfig === 'dos' || axleConfig === 'tandem' ? 2 : 3;
  let spacing = grouped ? GROUP_SPACING : SPREAD_SPACING;
  let landingX = kingpinX - 2.25;
  if (tipo === 'tolva') {
    // En la tolva las patas van pegadas al tractor para dejar lugar a los embudos…
    landingX = kingpinX - 1.65;
    // …y los ejes separados se reparten para que las bocas descarguen entre ellos.
    if (axleConfig === '1+1+1') spacing = Math.max(SPREAD_MIN + 0.015, (landingX - wheelR - 0.45 - last) / 2);
  }
  const xs: number[] = [];
  for (let i = n - 1; i >= 0; i--) xs.push(last + spacing * i);
  const liftable = cfg.sel.ejeElevable === true && n === 3;
  const axles: AxleLayout[] = xs.map((x, i) => ({ x: r3(x), lifted: liftable && i === 0 }));

  // Patas de apoyo: detrás del tractor y delante del primer eje.
  const minLanding = xs[0] + wheelR + 0.42;
  const maxLanding = kingpinX - 1.6;
  landingX = Math.min(Math.max(landingX, minLanding), Math.max(maxLanding, minLanding));

  // --- Alturas ----------------------------------------------------------------
  const deckY = DECK_Y[tipo];
  let floorY = deckY;
  let bodyTopY = deckY;
  let totalHeight = deckY;
  let frontExtra = 0;
  const rearExtra = 0.06;
  let volumeM3: number | null = null;
  let areaM2 = (L - 0.1) * (WIDTH - 0.1);
  let tolva: TolvaLayout | undefined;

  if (tipo === 'tolva') {
    floorY = deckY;
    bodyTopY = deckY + H;
    totalHeight = bodyTopY + 0.22;
    const spares = Number(cfg.sel.portaauxilio ?? 0);
    frontExtra = Math.max(0.1, spares > 0 ? 0.12 + spares * 0.32 : 0, cfg.sel.pasarela === true ? 0.5 : 0);
    tolva = computeTolva(cfg, H, deckY, axles, landingX, rearX, frontX);
    volumeM3 = tolvaVolume(tolva, L, H);
    areaM2 = (L - 0.1) * (WIDTH - 0.1);
  } else if (tipo === 'batea') {
    floorY = deckY + 0.12;
    bodyTopY = floorY + H + 0.06;
    // La torre del cilindro frontal puede superar el borde de la cuba.
    totalHeight = Math.max(bodyTopY + (cfg.sel.cobertor === true ? 0.2 : 0), 3.24);
    frontExtra = 0.4;
    const li = L - 0.16;
    const wi = WIDTH - 0.2;
    // Sección con chaflanes inferiores de 0,25 m.
    volumeM3 = li * (wi * H - 0.25 * 0.25);
    areaM2 = li * wi;
  } else if (tipo === 'plataforma') {
    floorY = deckY + 0.06;
    bodyTopY = floorY + H;
    totalHeight = floorY + Math.max(H + 0.5, 1.4);
    volumeM3 = (L - 0.12) * (WIDTH - 0.12) * H;
    areaM2 = (L - 0.12) * (WIDTH - 0.12);
  } else {
    floorY = deckY + 0.06;
    bodyTopY = floorY + H + 0.05;
    totalHeight = bodyTopY;
    volumeM3 = (L - 0.15) * (WIDTH - 0.12) * H;
    areaM2 = (L - 0.15) * (WIDTH - 0.12);
  }

  return {
    tipo,
    L,
    H,
    W: WIDTH,
    frontX,
    rearX,
    deckY,
    floorY: r3(floorY),
    bodyTopY: r3(bodyTopY),
    kingpinX: r3(kingpinX),
    kingpinY: KINGPIN_PLATE_Y,
    landingX: r3(landingX),
    axles,
    axleConfig,
    grouped,
    spacing: r3(spacing),
    suspension: cfg.sel.suspension === 'neumatica' ? 'neumatica' : 'mecanica',
    dual,
    aluminium: cfg.sel.llantas === 'aluminio',
    wheelR,
    tireW,
    wheelZ,
    railZ: 0.49,
    frontExtra,
    rearExtra,
    totalLength: r3(L + frontExtra + rearExtra),
    totalHeight: r3(totalHeight),
    totalWidth: WIDTH,
    volumeM3: volumeM3 === null ? null : Math.round(volumeM3 * 10) / 10,
    areaM2: Math.round(areaM2 * 10) / 10,
    tolva,
  };
}

/** Zona que ocupa cada eje con su soporte de suspensión (no puede haber embudo ahí). */
export const AXLE_KEEP_OUT = 0.62;
const MOUTH_HALF = 0.3;
const TOLVA_MOUTH_Y = 0.58;

function computeTolva(
  cfg: Config,
  H: number,
  railY: number,
  axles: AxleLayout[],
  landingX: number,
  rearX: number,
  frontX: number,
): TolvaLayout {
  const count = cfg.sel.bocas === '3' ? 3 : 2;
  // Huecos libres a lo largo, entre la cola, los ejes y las patas de apoyo.
  const blocks = axles.map((a) => [a.x - AXLE_KEEP_OUT, a.x + AXLE_KEEP_OUT] as [number, number]).sort((a, b) => a[0] - b[0]);
  const start = rearX + 0.3;
  const end = landingX - 0.32;
  const gaps: { a: number; b: number; n: number; axleA: boolean; axleB: boolean }[] = [];
  let cursor = start;
  let prevIsAxle = false;
  for (const [a, b] of blocks) {
    if (a - cursor > 1.0) gaps.push({ a: cursor, b: a, n: 0, axleA: prevIsAxle, axleB: true });
    cursor = Math.max(cursor, b);
    prevIsAxle = true;
  }
  if (end - cursor > 1.0) gaps.push({ a: cursor, b: end, n: 0, axleA: prevIsAxle, axleB: false });
  if (gaps.length === 0) gaps.push({ a: -1, b: 1, n: 0, axleA: false, axleB: false });

  // Reparto: cada boca va al hueco que más lugar libre por boca tiene.
  for (let i = 0; i < count; i++) {
    let best = gaps[0];
    let bestScore = -Infinity;
    for (const g of gaps) {
      const score = (g.b - g.a) / (g.n + 1) + (g.n === 0 ? 0.6 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = g;
      }
    }
    best.n++;
  }

  const hoppers: HopperLayout[] = [];
  for (const g of gaps) {
    if (g.n === 0) continue;
    const s = (g.b - g.a) / g.n;
    for (let i = 0; i < g.n; i++) {
      const x = g.a + s * (i + 0.5);
      const half = Math.min(1.7, s / 2);
      // Sobre el soporte del eje el embudo ya está alto: puede extenderse un poco.
      const extRear = i === 0 && g.axleA ? 0.15 : 0;
      const extFront = i === g.n - 1 && g.axleB ? 0.15 : 0;
      hoppers.push({ x: r3(x), mouthHalf: MOUTH_HALF, topHalfRear: r3(half + extRear), topHalfFront: r3(half + extFront) });
    }
  }
  hoppers.sort((a, b) => a.x - b.x);

  // Rampas interiores: del borde de cada embudo hacia las paredes o al caballete entre embudos.
  const ridges: TolvaLayout['ridges'] = [];
  const tan = Math.tan((30 * Math.PI) / 180);
  const first = hoppers[0];
  const lastH = hoppers[hoppers.length - 1];
  const rearGap = first.x - first.topHalfRear - (rearX + 0.04);
  if (rearGap > 0.05) ridges.push({ x0: rearX + 0.04, x1: first.x - first.topHalfRear, kind: 'rear', rise: Math.min(rearGap * tan, H * 0.82) });
  for (let i = 0; i < hoppers.length - 1; i++) {
    const a = hoppers[i].x + hoppers[i].topHalfFront;
    const b = hoppers[i + 1].x - hoppers[i + 1].topHalfRear;
    if (b - a > 0.05) ridges.push({ x0: a, x1: b, kind: 'mid', rise: Math.min(((b - a) / 2) * tan, H * 0.5) });
  }
  const frontGap = frontX - 0.04 - (lastH.x + lastH.topHalfFront);
  if (frontGap > 0.05) ridges.push({ x0: lastH.x + lastH.topHalfFront, x1: frontX - 0.04, kind: 'front', rise: Math.min(frontGap * tan, H * 0.82) });

  return { railY, mouthY: TOLVA_MOUTH_Y, mouthHalfZ: 0.35, hoppers, ridges };
}

function tolvaVolume(t: TolvaLayout, L: number, H: number): number {
  const wi = WIDTH - 0.1;
  let v = (L - 0.08) * wi * H;
  const h = t.railY - t.mouthY;
  for (const hp of t.hoppers) {
    const a1 = (hp.topHalfFront + hp.topHalfRear) * wi;
    const a2 = hp.mouthHalf * 2 * t.mouthHalfZ * 2;
    v += (h / 3) * (a1 + a2 + Math.sqrt(a1 * a2));
  }
  for (const r of t.ridges) v -= (wi * (r.x1 - r.x0) * r.rise) / 2;
  return v;
}

/** Largo del conjunto tractor + semi, desde el paragolpes del tractor hasta la cola del semi. */
export function combinationLength(layout: Layout, tractorFrontOfKingpin: number): number {
  return r3(tractorFrontOfKingpin + (layout.kingpinX - (layout.rearX - layout.rearExtra)));
}
