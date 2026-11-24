import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { groupDef, ral } from '@/core/catalog';
import { useStore } from '@/state/store';
import type { AnimState } from './build';
import { materialLibrary } from './materialsLib';
import { buildTrailer, geometryKey, type TrailerModel } from './model';
import { viewer } from './viewerApi';

/** Modelo actual (para cámaras, hotspots y capturas). */
export const currentModel: { value: TrailerModel | null } = { value: null };

const SPEED: Record<string, number> = { accion: 0.3, lona: 0.45, elevado: 0.9, patas: 1.2 };

function lonaHex(id: unknown): string {
  const opt = groupDef('colorLona')?.opciones?.find((o) => o.id === id);
  return opt?.hex ?? '#1b1c1e';
}

export function TrailerObject() {
  const invalidate = useThree((s) => s.invalidate);
  const lib = useMemo(() => materialLibrary(), []);
  const config = useStore((s) => s.config);
  const key = geometryKey(config);
  const cfgRef = useRef(config);
  cfgRef.current = config;

  const model = useMemo(() => {
    void key;
    return buildTrailer(cfgRef.current, lib.mats);
  }, [key, lib]);

  const anim = useRef<AnimState>({ accion: 0, lona: 0, susp: 0, elevado: 1, patas: 0, time: 0, dt: 0 });
  const suspPulse = useRef(0);

  useEffect(() => {
    currentModel.value = model;
    model.update(anim.current);
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

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const st = useStore.getState();
    const a = anim.current;
    const reduced = st.ui.reducedMotion;
    let moving = false;
    const targets: Record<string, number> = { accion: st.anim.accion ?? 0, lona: st.anim.lona ?? 0, elevado: st.anim.elevado ?? 1, patas: st.ui.tractor ? 1 : 0 };
    for (const k of Object.keys(targets) as (keyof typeof SPEED)[]) {
      const cur = a[k as 'accion'];
      const target = targets[k];
      if (cur === target) continue;
      const step = (window as unknown as { __fast?: boolean }).__fast ? 1 : SPEED[k] * dt * (reduced ? 4 : 1);
      a[k as 'accion'] = Math.abs(target - cur) <= step ? target : cur + Math.sign(target - cur) * step;
      moving = true;
    }
    // Pulso de suspensión: sube, baja y vuelve.
    if (suspPulse.current > 0) {
      suspPulse.current = Math.max(0, suspPulse.current - dt / (reduced ? 0.6 : 2.4));
      const p = 1 - suspPulse.current;
      a.susp = Math.sin(p * Math.PI * 2) * Math.sin(p * Math.PI);
      moving = true;
    } else if (a.susp !== 0) {
      a.susp = 0;
      moving = true;
    }
    a.dt = dt;
    a.time += dt;
    const colors = lib.tick(dt);
    if (moving) model.update(a);
    if (moving || colors) invalidate();
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
