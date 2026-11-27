import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore, type CamPreset } from '../state/store';
import { runtime, touchInteraction } from './runtime';
import { prefersReducedMotion } from './motion';
import { ROW } from '../machines/seeder/rowUnit';
import { layoutBox } from './bounds';

export interface Shot { pos: THREE.Vector3; target: THREE.Vector3 }
/** Márgenes de pantalla ocupados por la UI (fracciones del alto/ancho del visor). */
export interface Pads { t: number; b: number; l: number; r: number }
const NO_PADS: Pads = { t: 0, b: 0, l: 0, r: 0 };
const UP = new THREE.Vector3(0, 1, 0);
let FOV = 38;

/** Las 8 esquinas de una caja. */
export function boxCorners(b: THREE.Box3): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) out.push(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
  return out;
}

/**
 * Encuadra un conjunto de puntos (esquinas de cada pieza) desde una dirección: calcula la distancia
 * para que todos entren en la parte libre de la pantalla (descontando la UI) y centra lo que se ve.
 */
export function fitPoints(pts: THREE.Vector3[], dir: THREE.Vector3, aspect: number, pads: Pads = NO_PADS, margin = 1.1, minDist = 3): Shot {
  const box = new THREE.Box3().setFromPoints(pts);
  const d0 = dir.clone().normalize();
  const fwd = d0.clone().negate();
  const right = Math.abs(fwd.dot(UP)) > 0.985 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(fwd, UP).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const tanH = tanV * aspect;
  const fx = Math.max(0.3, 1 - pads.l - pads.r);
  const fy = Math.max(0.3, 1 - pads.t - pads.b);
  const target = box.getCenter(new THREE.Vector3());
  const o = new THREE.Vector3();
  let d = minDist;
  for (let it = 0; it < 4; it++) {
    d = minDist;
    for (const p of pts) {
      o.copy(p).sub(target);
      const z = o.dot(d0);
      d = Math.max(d, z + (Math.abs(o.dot(right)) * margin) / (tanH * fx), z + (Math.abs(o.dot(up)) * margin) / (tanV * fy));
    }
    // centrar la silueta (en pantalla) y repetir
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      o.copy(p).sub(target);
      const depth = Math.max(0.1, d - o.dot(d0));
      const nx = o.dot(right) / (depth * tanH);
      const ny = o.dot(up) / (depth * tanV);
      x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
    }
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    if (Math.abs(mx) < 0.01 && Math.abs(my) < 0.01) break;
    target.addScaledVector(right, mx * d * tanH * 0.9).addScaledVector(up, my * d * tanV * 0.9);
  }
  // ubicar el centro en la zona libre (no en el centro geométrico de la pantalla)
  const cx = pads.l - pads.r;
  const cy = pads.b - pads.t;
  target.addScaledVector(right, -cx * d * tanH).addScaledVector(up, -cy * d * tanV);
  return { pos: target.clone().addScaledVector(d0, d), target };
}

export function fitShot(box: THREE.Box3, dir: THREE.Vector3, aspect: number, pads: Pads = NO_PADS, margin = 1.1, minDist = 3): Shot {
  return fitPoints(boxCorners(box), dir, aspect, pads, margin, minDist);
}

/** Caja aproximada del tractor enganchado (para encuadrar el conjunto en ruta). */
function tractorBox(): THREE.Box3 | null {
  const m = runtime.model;
  const st = useStore.getState();
  if (!m || !st.showTractor || st.scene === 'studio') return null;
  const h = m.getHitch(new THREE.Vector3());
  return new THREE.Box3(new THREE.Vector3(h.x - 1.35, 0, h.z - 0.1), new THREE.Vector3(h.x + 1.35, 3.0, h.z + 5.2));
}

const tmpBox = new THREE.Box3();
/** Esquinas de cada pieza visible del modelo (ruedas, escaleras, todo lo que sobresale). */
export function visiblePoints(root: THREE.Object3D): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  root.updateWorldMatrix(true, true);
  root.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || o.userData.noBounds) return;
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      if (im.count === 0) return;
      if (!im.boundingBox) im.computeBoundingBox();
      tmpBox.copy(im.boundingBox!);
    } else {
      const g = mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      tmpBox.copy(g.boundingBox!);
    }
    if (tmpBox.isEmpty()) return;
    pts.push(...boxCorners(tmpBox.applyMatrix4(o.matrixWorld)));
  });
  return pts;
}

/** Puntos a encuadrar de la máquina: reales si ya está quieta en esa posición, si no los del layout. */
function machinePoints(forceTransport?: boolean): THREE.Vector3[] {
  const m = runtime.model;
  if (!m) return boxCorners(new THREE.Box3(new THREE.Vector3(-4, 0, -2.5), new THREE.Vector3(4, 2, 2.5)));
  const st = useStore.getState();
  const tr = forceTransport ?? (st.pose === 'transport' || m.state.poseT > 0.5);
  if (Math.abs(m.state.poseT - (tr ? 1 : 0)) < 0.01) {
    const pts = visiblePoints(m.root);
    const b = new THREE.Box3().setFromPoints(pts);
    if (pts.length && b.max.x - b.min.x < 60) return pts;
  }
  return boxCorners(machineBox(tr));
}

function machineBox(forceTransport?: boolean): THREE.Box3 {
  const m = runtime.model;
  if (!m) return new THREE.Box3(new THREE.Vector3(-4, 0, -2.5), new THREE.Vector3(4, 2, 2.5));
  const st = useStore.getState();
  const tr = forceTransport ?? (st.pose === 'transport' || m.state.poseT > 0.5);
  return layoutBox(m.layout, tr).expandByVector(new THREE.Vector3(0.45, 0.1, 0.3));
}

function anchorPos(name: string): THREE.Vector3 | null {
  const a = runtime.model?.anchors[name];
  if (!a) return null;
  const v = new THREE.Vector3();
  a.getWorldPosition(v);
  return v;
}

export interface ShotOpts { pads?: Pads; transport?: boolean; withTractor?: boolean; fov?: number }

export function presetShot(p: CamPreset, aspect: number, scene: string, opts: ShotOpts = {}): Shot {
  if (opts.fov) FOV = opts.fov;
  const pads = opts.pads ?? NO_PADS;
  const pts = machinePoints(opts.transport);
  const tb = opts.withTractor === false ? null : scene === 'road' ? tractorBox() : null;
  if (tb) pts.push(...boxCorners(tb));
  const midRowX = (() => {
    const m = runtime.model;
    if (!m) return 0;
    const xs = m.layout.rowX;
    return xs[Math.floor(xs.length / 2)] ?? 0;
  })();
  const narrow = aspect < 1;
  switch (p) {
    case 'side':
      return fitPoints(pts, new THREE.Vector3(1, 0.22, 0.12), aspect, pads, 1.08);
    case 'rear':
      return fitPoints(pts, new THREE.Vector3(0.22, 0.42, -0.9), aspect, pads, 1.08);
    case 'top':
      return fitPoints(pts, new THREE.Vector3(0, 1, 0.02), aspect, pads, 1.06);
    case 'rowUnit': {
      const t = new THREE.Vector3(midRowX, 0.48, -0.42);
      if (useStore.getState().detail) {
        // cuerpo de siembra aislado: encuadre exacto de su caja (con aire para las etiquetas)
        const box = new THREE.Box3(new THREE.Vector3(-0.45, 0, -1.6), new THREE.Vector3(0.45, 1.35, 0.75));
        return fitShot(box, new THREE.Vector3(3.3, 1.5, 1.9), aspect, pads, narrow ? 1.35 : 1.2, 2);
      }
      return { pos: t.clone().add(new THREE.Vector3(1.9, 0.55, 1.2)), target: t };
    }
    case 'hoppers': {
      const a = anchorPos('hs-hoppers') ?? new THREE.Vector3(midRowX, 1.4, -0.8);
      const hb = new THREE.Box3(new THREE.Vector3(a.x - 2.2, Math.max(0.4, a.y - 1.0), a.z - 1.3), new THREE.Vector3(a.x + 2.2, a.y + 0.9, a.z + 1.3));
      return fitShot(hb, new THREE.Vector3(0.75, 0.55, 0.75), aspect, pads, 1.1, 4.5);
    }
    case 'ground': {
      const x = midRowX + (runtime.model?.layout.spacing ?? 0.5) * 0.5;
      return { pos: new THREE.Vector3(x + 0.35, 0.5, ROW.closing.z - 5.2), target: new THREE.Vector3(x - 0.3, 0.32, ROW.closing.z + 1.2) };
    }
    case 'front34':
    default: {
      // en ruta, el tractor va adelante: mirar desde atrás en 3/4 para no taparlo
      const zs = scene === 'road' ? -0.9 : scene === 'field' ? -0.75 : 1;
      const dir = new THREE.Vector3(0.62, 0.36, 0.8 * zs);
      return fitPoints(pts, dir, aspect, pads, 1.08, 6);
    }
  }
}

/** Caja a encuadrar al cambiar una opción: la zona y su contexto (nunca adentro de la máquina). */
function zoneBox(zone: string): THREE.Box3 | null {
  const a = anchorPos(ZONES[zone] ?? '');
  if (!a) return null;
  const size: [number, number, number] = zone === 'hoppers' || zone === 'fert' ? [2.6, 1.3, 1.6] : zone === 'transport' || zone === 'wheels' ? [2.4, 1.4, 2.2] : zone === 'monitor' ? [1.8, 1.2, 1.6] : [1.9, 1.2, 1.3];
  return new THREE.Box3(new THREE.Vector3(a.x - size[0], Math.max(0, a.y - size[1]), a.z - size[2]), new THREE.Vector3(a.x + size[0], a.y + size[1] * 0.8, a.z + size[2]));
}

const ZONES: Record<string, string> = {
  transport: 'hs-transport',
  wheels: 'hs-transport',
  hoppers: 'hs-hoppers',
  fert: 'hs-hoppers',
  coulter: 'hs-coulter',
  closing: 'hs-closing',
  rowUnit: 'hs-discs',
  downforce: 'hs-discs',
  meter: 'hs-meter',
  monitor: 'hs-monitor',
};

/** Encuadre que contiene la máquina en trabajo y en transporte (durante la animación de plegado). */
function presetShotUnion(p: CamPreset): Shot {
  const st = useStore.getState();
  const el = document.querySelector('.viewer');
  const asp = el ? el.clientWidth / Math.max(1, el.clientHeight) : 1.6;
  const a = machineBox(false);
  const b = machineBox(true);
  const tb = st.scene === 'road' ? tractorBox() : null;
  a.union(b);
  if (tb) a.union(tb);
  const zs = st.scene === 'road' ? -0.9 : st.scene === 'field' ? -0.75 : 1;
  const dirs: Partial<Record<CamPreset, THREE.Vector3>> = { side: new THREE.Vector3(1, 0.22, 0.12), rear: new THREE.Vector3(0.22, 0.42, -0.9), top: new THREE.Vector3(0, 1, 0.02) };
  return fitShot(a, dirs[p] ?? new THREE.Vector3(0.62, 0.36, 0.8 * zs), asp, uiPads(), 1.06, 6);
}

/** Lee qué parte del visor tapan la tarjeta de precio y la barra de herramientas. */
export function uiPads(): Pads {
  const viewer = document.querySelector('.viewer');
  if (!viewer) return NO_PADS;
  const v = viewer.getBoundingClientRect();
  if (v.height < 10) return NO_PADS;
  const pads = { t: 0.03, b: 0.03, l: 0.03, r: 0.03 };
  const card = viewer.querySelector('.price-float')?.getBoundingClientRect();
  if (card && card.width > 0) {
    // la tarjeta ocupa sólo la esquina: se descuenta una parte de su alto
    const frac = card.width / v.width;
    pads.t = Math.max(pads.t, ((card.bottom - v.top) / v.height) * Math.min(1, 0.35 + frac));
  }
  const bar = viewer.querySelector('.topbar')?.getBoundingClientRect();
  if (bar && bar.height > 0) pads.b = Math.max(pads.b, (v.bottom - bar.top + 8) / v.height);
  return pads;
}

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size: vsize, invalidate } = useThree();
  const tween = useRef<{ from: Shot; to: Shot; t: number; dur: number } | null>(null);
  const returnTo = useRef<{ shot: Shot; at: number } | null>(null);
  const camRequest = useStore((s) => s.camRequest);
  const focusRequest = useStore((s) => s.focusRequest);
  const scene = useStore((s) => s.scene);
  const feria = useStore((s) => s.feria);

  const pending = useRef<CamPreset | null>(null);
  const aspect = () => vsize.width / vsize.height;
  const shot = (p: CamPreset, o: ShotOpts = {}) => presetShot(p, aspect(), useStore.getState().scene, { pads: uiPads(), fov: (camera as THREE.PerspectiveCamera).fov, ...o });

  const current = (): Shot => ({ pos: camera.position.clone(), target: controls.current?.target.clone() ?? new THREE.Vector3() });

  const go = (to: Shot, dur = 1.4, instant = false) => {
    if (instant || prefersReducedMotion()) {
      camera.position.copy(to.pos);
      controls.current?.target.copy(to.target);
      controls.current?.update();
      tween.current = null;
      invalidate();
      return;
    }
    tween.current = { from: current(), to, t: 0, dur };
    invalidate();
  };

  // posición inicial
  useEffect(() => {
    const s = shot('front34');
    camera.position.copy(s.pos);
    controls.current?.target.copy(s.target);
    controls.current?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!camRequest) return;
    returnTo.current = null;
    // esperar un frame para que el modelo (pose/escena) esté actualizado
    const id = requestAnimationFrame(() => {
      const m = runtime.model;
      const st = useStore.getState();
      const target = st.pose === 'transport' ? 1 : 0;
      const moving = !!m && Math.abs(m.state.poseT - target) > 0.02 && !st.detail;
      if (moving && (camRequest.preset === 'front34' || camRequest.preset === 'top' || camRequest.preset === 'side' || camRequest.preset === 'rear')) {
        // mientras se pliega/despliega: encuadrar las dos posiciones y reencuadrar al terminar
        const both = presetShotUnion(camRequest.preset);
        go(both, 1.5, camRequest.instant);
        pending.current = camRequest.preset;
        return;
      }
      pending.current = null;
      go(shot(camRequest.preset), 1.5, camRequest.instant);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camRequest]);

  useEffect(() => {
    if (!focusRequest) return;
    const st = useStore.getState();
    if (st.detail || st.sowing || st.demo) return;
    if (focusRequest.zone === 'overview') {
      returnTo.current = null;
      const id = requestAnimationFrame(() => go(shot('front34'), 1.4));
      return () => cancelAnimationFrame(id);
    }
    const id = requestAnimationFrame(() => {
      const box = zoneBox(focusRequest.zone);
      if (!box) return;
      const back = returnTo.current?.shot ?? current();
      // misma dirección de órbita que tenía el usuario, con una altura cómoda (25–35°)
      const dir = back.pos.clone().sub(back.target).setY(0).normalize();
      if (dir.lengthSq() < 0.5) dir.set(0.6, 0, 0.8);
      dir.y = 0.55;
      go(fitShot(box, dir, aspect(), uiPads(), 1.15, 4.2), 1.2);
      returnTo.current = { shot: back, at: performance.now() + 4200 };
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const dbg = (window as unknown as { __sp?: Record<string, unknown> }).__sp;
    if (dbg) {
      dbg.cam = camera;
      dbg.ctl = c;
    }
    const now = performance.now();
    if (pending.current && !tween.current) {
      const m = runtime.model;
      const st = useStore.getState();
      const target = st.pose === 'transport' ? 1 : 0;
      if (!m || Math.abs(m.state.poseT - target) <= 0.02) {
        const p = pending.current;
        pending.current = null;
        if (now - runtime.lastInteraction > 600 || !returnTo.current) go(shot(p), 1.3);
      } else invalidate();
    }
    if (tween.current) {
      const tw = tween.current;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      camera.position.lerpVectors(tw.from.pos, tw.to.pos, e);
      // arco suave: subir un poco a mitad de camino
      camera.position.y += Math.sin(e * Math.PI) * 0.25 * tw.from.pos.distanceTo(tw.to.pos) * 0.08;
      c.target.lerpVectors(tw.from.target, tw.to.target, e);
      if (tw.t >= 1) tween.current = null;
      invalidate();
    } else if (returnTo.current && now > returnTo.current.at) {
      const r = returnTo.current.shot;
      returnTo.current = null;
      go(r, 1.4);
    }
    // modo inactivo: rotación cinematográfica lenta a los 20 s
    const idle = now - runtime.lastInteraction > (feria ? 12000 : 20000);
    const st = useStore.getState();
    const rotate = idle && !prefersReducedMotion() && !tween.current && !st.sowing;
    c.autoRotate = rotate;
    c.autoRotateSpeed = 0.35;
    c.update();
    if (rotate) invalidate();
  });

  const near = scene === 'field' ? 1.2 : 1.4;
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={near}
      maxDistance={60}
      maxPolarAngle={Math.PI / 2 - 0.03}
      onStart={() => {
        tween.current = null;
        returnTo.current = null;
        pending.current = null;
        touchInteraction();
      }}
      onChange={() => invalidate()}
    />
  );
}
