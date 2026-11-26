/**
 * Ensamblado completo del semirremolque a partir de la configuración.
 * Devuelve un grafo de escena con muy pocas mallas, una función `update`
 * para las animaciones y `dispose` para liberar toda la memoria de GPU.
 */
import * as THREE from 'three';
import { computeLayout, type Layout } from '@/core/layout';
import type { Config } from '@/core/types';
import type { AnimState, BuildCtx } from './build';
import { buildTolva } from './bodies/tolva';
import { buildBatea } from './bodies/batea';
import { buildPlataforma } from './bodies/plataforma';
import { buildFurgon } from './bodies/furgon';
import { Assembly } from './kit/asm';
import { geoMode } from './kit/geo';
import { applyBuffers, type ModelBuffers } from './kit/buffers';

export type { BucketData, ModelBuffers } from './kit/buffers';
import type { MaterialSet } from './materials';
import { buildAccessories } from './parts/accessories';
import { buildLandingGear, buildPerimeterFrame, buildRearEnd, buildSideMarking, buildTwinRailChassis } from './parts/chassis';
import { BELLOWS_HEIGHT, LIFT_HEIGHT, buildRunningGear } from './parts/running';
import { createWheelSet, type WheelPose } from './parts/wheels';

export interface TrailerModel {
  root: THREE.Group;
  /** Clave de geometría con la que se armó. */
  key: string;
  layout: Layout;
  anchors: Record<string, [number, number, number]>;
  livery: BuildCtx['livery'];
  rearFlaps: { x: number; y: number; z: number; w: number; h: number }[];
  grain: { x: number; y: number; z: number }[];
  update: (a: AnimState) => void;
  /** true mientras haya partículas u otra animación propia en curso. */
  isBusy: () => boolean;
  setAluminium: (alu: boolean) => void;
  /** Ruta: ángulo girado por las ruedas y movimiento de la carrocería (cabeceo, rolido, subir/bajar). */
  setWheelRoll: (angle: number) => void;
  setBody: (pitch: number, roll: number, heave: number) => void;
  /** Mallas fusionadas (para que el worker extraiga sus buffers). */
  buckets: Map<string, THREE.Mesh>;
  dispose: () => void;
  stats: { triangles: number; meshes: number };
}

/** Campos de la configuración que afectan la geometría (los colores no). */
export function geometryKey(cfg: Config): string {
  const s = cfg.sel;
  // Las llantas (acero / aluminio) solo cambian el material: no forman parte de la clave.
  const keys = ['largo', 'alto', 'ejes', 'suspension', 'ruedas', 'ejeElevable', 'bocas', 'accionamientoLona', 'porton', 'cobertor', 'piso', 'modulosBaranda', 'amarre', 'variante', 'parantes', 'tablillas', 'techo', 'tensado', 'pisoFurgon', 'puertas', 'cajon', 'portaauxilio', 'tanqueAgua', 'matafuego', 'pasarela', 'lucesLed', 'faldones'];
  return cfg.tipo + '|' + keys.map((k) => s[k] ?? '').join('|');
}

const SUSP_TRAVEL = 0.055;
const LEG_RETRACT = 0.3;

/**
 * Arma el modelo. Sin `buffers` genera todo en el acto (carga inicial, worker).
 * Con `buffers` (llegados del worker) corre en modo esqueleto: solo nodos, pivotes,
 * animaciones y piezas animadas en CPU; las mallas fusionadas toman la geometría
 * ya generada. Así un cambio de opción no traba el hilo principal.
 */
export function buildTrailer(cfg: Config, mats: MaterialSet, buffers?: ModelBuffers): TrailerModel {
  if (!buffers) return buildTrailerImpl(cfg, mats);
  geoMode.stub = true;
  let m: TrailerModel;
  try {
    m = buildTrailerImpl(cfg, mats);
  } finally {
    geoMode.stub = false;
  }
  try {
    m.stats.triangles = applyBuffers(m.buckets, buffers);
  } catch (e) {
    m.dispose();
    throw e;
  }
  return m;
}

function buildTrailerImpl(cfg: Config, mats: MaterialSet): TrailerModel {
  const L = computeLayout(cfg);
  const asm = new Assembly();
  asm.node('sprung', 'root', [0, 0, 0]);

  const chassis = L.tipo === 'tolva' ? buildPerimeterFrame(asm, L) : buildTwinRailChassis(asm, L, { throughBeams: L.tipo === 'plataforma' || L.tipo === 'furgon' });

  const ctx: BuildCtx = {
    asm,
    L,
    sel: cfg.sel,
    mats,
    chassis,
    updaters: [],
    disposers: [],
    anchors: {},
    livery: { side: [0, L.deckY + 1, 4, 1], front: null },
    slots: [],
    spares: [],
    marking: { y: L.deckY - 0.1, z: L.W / 2, x0: L.rearX + 0.1, x1: L.frontX - 0.1 },
    grain: [],
    busy: [],
  };

  const gear = buildRunningGear(asm, L, chassis.frameBottomY, { flapPrint: cfg.sel.faldones === true });
  buildLandingGear(asm, L, chassis, chassis.frameBottomY);

  if (L.tipo === 'tolva') buildTolva(ctx);
  else if (L.tipo === 'batea') buildBatea(ctx);
  else if (L.tipo === 'plataforma') buildPlataforma(ctx);
  else buildFurgon(ctx);

  const extraLights = cfg.sel.lucesLed === true;
  const beamH = L.tipo === 'tolva' ? 0.3 : 0.2;
  buildRearEnd(asm, L, {
    beamY: L.deckY - beamH / 2 - (L.tipo === 'tolva' ? 0 : 0.01),
    beamH,
    frameBottomY: L.tipo === 'tolva' ? L.deckY - 0.3 : L.deckY - 0.24,
    workLights: extraLights ? L.bodyTopY - 0.12 : null,
  });
  if (cfg.sel.faldones === true) {
    // Impresión sobre los barreros traseros.
    asm.into('sprung');
    for (const f of gear.rearFlaps) {
      const g = new THREE.PlaneGeometry(f.w, f.h);
      g.rotateY(-Math.PI / 2);
      g.translate(f.x, f.y, f.z);
      asm.add('flapPrint', g);
    }
  }
  buildSideMarking(asm, ctx.marking.x0, ctx.marking.x1, ctx.marking.y, ctx.marking.z, { extraLights, node: ctx.marking.node });
  buildAccessories(ctx);

  // Ruedas (instanciadas) + auxilios.
  const poses: WheelPose[] = [...gear.wheelPoses];
  for (const sp of ctx.spares) poses.push({ x: sp.x, y: sp.y, z: sp.z, side: 1, axle: -1, euler: sp.euler });
  const wheels = createWheelSet(poses, L.dual, L.aluminium, mats);
  for (const o of wheels.objects) asm.attach(o, 'root');

  ctx.anchors.pernoRey = [L.kingpinX, L.kingpinY - 0.05, 0];
  ctx.anchors.suspension = [L.axles[Math.min(1, L.axles.length - 1)].x - 0.1, L.wheelR + 0.18, L.railZ + 0.25];
  ctx.anchors.ruedas = [L.axles[0].x, L.wheelR, L.W / 2];
  ctx.anchors.ejes = [(L.axles[0].x + L.axles[L.axles.length - 1].x) / 2, L.wheelR, L.W / 2];
  ctx.anchors.reflectivos = [L.rearX + L.L * 0.22, ctx.marking.y, ctx.marking.z + 0.01];
  ctx.anchors.chasis = [L.landingX - 0.7, chassis.frameBottomY + 0.2, L.tipo === 'tolva' ? L.W / 2 - 0.02 : L.railZ + 0.08];
  ctx.anchors.trasera = [L.rearX, L.deckY, 0];
  ctx.anchors.frente = [L.frontX, L.deckY + 0.5, 0];

  const built = asm.build(mats);
  const { nodes } = built;
  const air = L.suspension === 'neumatica';
  const liftIndex = L.axles.findIndex((a) => a.lifted);

  const body = { pitch: 0, roll: 0, heave: 0 };
  let suspY = 0;
  const applyBody = () => {
    nodes.sprung.position.y = suspY + body.heave;
    nodes.sprung.rotation.set(body.roll, 0, -body.pitch);
  };
  const update = (a: AnimState) => {
    const s = air ? a.susp * SUSP_TRAVEL : 0;
    suspY = s;
    applyBody();
    if (nodes.legs) nodes.legs.position.y = a.patas * LEG_RETRACT - s;
    L.axles.forEach((_, i) => {
      const lift = i === liftIndex ? a.elevado * LIFT_HEIGHT : 0;
      const ax = nodes[`axle${i}`];
      if (ax) ax.position.y = lift;
      wheels.setAxleLift(i, lift);
      const b = nodes[`bellows${i}`];
      if (b) b.scale.y = Math.max(0.35, (BELLOWS_HEIGHT + s - lift) / BELLOWS_HEIGHT);
    });
    for (const u of ctx.updaters) u(a, nodes);
  };

  return {
    root: built.root,
    key: geometryKey(cfg),
    buckets: built.buckets,
    setAluminium: (alu: boolean) => wheels.setAluminium(alu),
    setWheelRoll: (angle: number) => wheels.setRoll(angle),
    setBody: (pitch: number, roll: number, heave: number) => {
      body.pitch = pitch;
      body.roll = roll;
      body.heave = heave;
      applyBody();
    },
    layout: L,
    anchors: ctx.anchors,
    livery: ctx.livery,
    rearFlaps: gear.rearFlaps,
    grain: ctx.grain,
    update,
    isBusy: () => ctx.busy.some((b) => b()),
    stats: { triangles: Math.round(built.triangles), meshes: built.meshes },
    dispose: () => {
      built.dispose();
      wheels.dispose();
      ctx.disposers.forEach((d) => d());
    },
  };
}
