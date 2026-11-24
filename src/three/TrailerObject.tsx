import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { brand, groupDef, ral } from '@/core/catalog';
import { useStore } from '@/state/store';
import { markActive } from './activity';
import type { AnimState } from './build';
import { upgradeMaterials } from './ktx';
import { composeFlapPrint, composeLivery, liveryTexture } from './livery';
import { materialLibrary } from './materialsLib';
import { buildTrailer, geometryKey, type TrailerModel } from './model';
import { viewer } from './viewerApi';

/** Modelo actual (para cámaras, hotspots y capturas). */
export const currentModel: { value: TrailerModel | null } = { value: null };

/** Tiempos de reconstrucción del modelo (ms), para las mediciones de rendimiento. */
export const buildTimes: number[] = [];

const SPEED: Record<string, number> = { accion: 0.3, lona: 0.45, elevado: 0.9, patas: 1.2, luces: 2.5 };

function lonaHex(id: unknown): string {
  const opt = groupDef('colorLona')?.opciones?.find((o) => o.id === id);
  return opt?.hex ?? '#1b1c1e';
}

export function TrailerObject() {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const lib = useMemo(() => materialLibrary(), []);
  const config = useStore((s) => s.config);
  const key = geometryKey(config);
  const cfgRef = useRef(config);
  cfgRef.current = config;

  const model = useMemo(() => {
    void key;
    const t0 = performance.now();
    const m = buildTrailer(cfgRef.current, lib.mats);
    buildTimes.push(performance.now() - t0);
    if (buildTimes.length > 400) buildTimes.shift();
    return m;
  }, [key, lib]);

  const anim = useRef<AnimState & { luces: number }>({ accion: 0, lona: 0, susp: 0, elevado: 1, patas: 0, luces: 0, time: 0, dt: 0 });
  const suspPulse = useRef(0);

  useEffect(() => {
    currentModel.value = model;
    model.update(anim.current);
    useStore.getState().bumpModel();
    invalidate();
    return () => {
      if (currentModel.value === model) currentModel.value = null;
      model.dispose();
    };
  }, [model, invalidate]);

  // Colores: solo cambian uniformes de material, con transición.
  const chasis = config.colores.chasis;
  const caja = config.colores.caja;
  const lona = config.sel.colorLona;
  useEffect(() => {
    lib.setColorTargets({ chasis: ral(chasis).hex, caja: ral(caja).hex, lona: lonaHex(lona) });
    invalidate();
  }, [chasis, caja, lona, lib, invalidate]);

  // Rotulado: logo y texto proyectados sobre la pintura de la caja.
  const logo = config.logo;
  const texto = config.texto;
  const sider = config.tipo === 'furgon' && config.sel.variante === 'sider';
  useEffect(() => {
    let cancelled = false;
    const [cx, cy, w, h] = model.livery.side;
    const front = model.livery.front;
    const baseHex = sider ? lonaHex(lona) : ral(caja).hex;
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    void (async () => {
      const side = await composeLivery({ logo, texto, w, h, baseHex });
      const frontCanvas = logo.frente && front ? await composeLivery({ logo: { ...logo, x: 0, y: 0, escala: Math.min(1, logo.escala * 1.2) }, texto: null, w: front[2], h: front[3], baseHex }) : null;
      if (cancelled) return;
      const u = lib.livery;
      const old = [u.uLivMap.value, u.uLivFrontMap.value];
      u.uLivMap.value = side ? liveryTexture(side, aniso) : null;
      u.uLivOn.value = side ? 1 : 0;
      u.uLivRect.value.set(cx, cy, w, h);
      u.uLivFrontMap.value = frontCanvas ? liveryTexture(frontCanvas, aniso) : null;
      u.uLivFrontOn.value = frontCanvas ? 1 : 0;
      if (front) u.uLivFrontRect.value.set(front[0], front[1], front[2], front[3]);
      old.forEach((t) => t?.dispose());
      invalidate();
    })();
    return () => {
      cancelled = true;
    };
  }, [logo, texto, model, caja, lona, sider, lib, gl, invalidate]);

  // Barreros con logo impreso.
  const flaps = config.sel.faldones === true;
  const logoData = logo.data;
  useEffect(() => {
    if (!flaps) return;
    let cancelled = false;
    void composeFlapPrint(logoData, brand.nombreCorto.toUpperCase()).then((canvas) => {
      if (cancelled) return;
      const mat = lib.mats.flapPrint as THREE.MeshStandardMaterial;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      mat.map?.dispose();
      mat.map = tex;
      mat.needsUpdate = true;
      invalidate();
    });
    return () => {
      cancelled = true;
    };
  }, [flaps, logoData, lib, invalidate]);

  // Texturas KTX2: se cargan cuando el equipo ya está en pantalla.
  const ready = useStore((s) => s.ready);
  useEffect(() => {
    if (!ready) return;
    void upgradeMaterials(gl, lib)
      .then(() => invalidate())
      .catch((e) => console.warn('[configurador] texturas KTX2 no disponibles, se usan las procedurales', e));
  }, [ready, gl, lib, invalidate]);

  // Al elegir suspensión neumática: subida y bajada breve.
  const suspension = config.sel.suspension;
  const firstSusp = useRef(true);
  useEffect(() => {
    if (firstSusp.current) {
      firstSusp.current = false;
      return;
    }
    if (suspension === 'neumatica') suspPulse.current = 1;
    invalidate();
  }, [suspension, invalidate]);

  // Cambios de objetivo de animación despiertan el render.
  useEffect(() => useStore.subscribe((s) => [s.anim, s.ui.tractor, s.ui.luces], () => invalidate(), { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] }), [invalidate]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const st = useStore.getState();
    const a = anim.current;
    const reduced = st.ui.reducedMotion;
    const fast = (window as unknown as { __fast?: boolean }).__fast === true;
    let moving = false;
    const targets: Record<string, number> = { accion: st.anim.accion ?? 0, lona: st.anim.lona ?? 0, elevado: st.anim.elevado ?? 1, patas: st.ui.tractor ? 1 : 0, luces: st.ui.luces ? 1 : 0 };
    for (const k of Object.keys(targets)) {
      const cur = a[k as 'accion'];
      const target = targets[k];
      if (cur === target) continue;
      const step = fast ? 1 : SPEED[k] * dt * (reduced ? 5 : 1);
      a[k as 'accion'] = Math.abs(target - cur) <= step ? target : cur + Math.sign(target - cur) * step;
      moving = true;
    }
    // Pulso de suspensión: sube, baja y vuelve.
    if (suspPulse.current > 0) {
      suspPulse.current = Math.max(0, suspPulse.current - dt / (reduced || fast ? 0.3 : 2.4));
      const p = 1 - suspPulse.current;
      a.susp = Math.sin(p * Math.PI * 2) * Math.sin(p * Math.PI);
      moving = true;
    } else if (a.susp !== 0) {
      a.susp = 0;
      moving = true;
    }
    a.dt = dt;
    a.time += dt;
    lib.setLights(a.luces);
    const colors = lib.tick(dt);
    const busy = model.isBusy();
    if (moving || busy) {
      model.update(a);
      markActive();
    }
    if (moving || colors || busy) invalidate();
  });

  return <primitive object={model.root} />;
}

/** Fundido cruzado cada vez que se reconstruye la geometría. */
export function useGeometryCrossfade() {
  useEffect(
    () =>
      useStore.subscribe(
        (s) => geometryKey(s.config),
        () => viewer()?.crossfade(),
      ),
    [],
  );
}
