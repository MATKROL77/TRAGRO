import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { getFamily } from '../machines/registry';
import type { SeederModel } from '../machines/seeder/SeederModel';
import { applyPlateTextures, getMaterials, setMachineColors } from './materials';
import { brandDecal } from './textures';
import { runtime } from './runtime';
import brand from '../config/brand.json';
import { translate } from '../i18n';
import { prefersReducedMotion } from './motion';
import { captureState } from './capture';

function isLight(hex: string): boolean {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.55;
}

/** Monta el modelo imperativo de la sembradora y lo reconstruye sólo si cambia un parámetro geométrico. */
export function MachineView() {
  const config = useStore((s) => s.config);
  const logoUrl = useStore((s) => s.logoUrl);
  const detail = useStore((s) => s.detail);
  const lang = useStore((s) => s.lang);
  const group = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  const family = getFamily(config.family);
  const sig = `${family.id}:${family.signature(config)}`;
  const mats = useMemo(() => getMaterials(), []);

  useEffect(() => {
    applyPlateTextures(new THREE.TextureLoader());
  }, []);

  // Reconstrucción geométrica (los cuerpos se deslizan desde su posición anterior).
  // Se construye por pasos con un presupuesto de pocos ms por cuadro; la máquina anterior sigue en
  // pantalla hasta que la nueva está lista, así ningún cuadro se traba al cambiar una opción.
  const job = useRef<{ model: SeederModel; steps: Iterator<void>; cpu: number; maxSlice: number } | null>(null);
  useEffect(() => {
    const prev = runtime.model;
    if (job.current) {
      job.current.model.dispose(); // se descarta la construcción a medio hacer
      job.current = null;
    }
    const cfg = useStore.getState().config;
    if (prev && family.createSteps) {
      const j = family.createSteps(cfg, mats, prev);
      job.current = { model: j.model as SeederModel, steps: j.steps, cpu: 0, maxSlice: 0 };
      invalidate();
      return;
    }
    const t0 = performance.now();
    const m = family.create(cfg, mats, prev) as SeederModel;
    runtime.lastRebuildMs = performance.now() - t0;
    runtime.lastRebuildMaxSliceMs = runtime.lastRebuildMs;
    swapIn(m, prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const swapIn = (m: SeederModel, prev: SeederModel | null) => {
    runtime.modelVersion++;
    group.current?.add(m.root);
    if (prev) {
      // pasar la calcomanía actual al modelo nuevo
      m.setDecal(decalTex.current);
      prev.dispose();
    }
    runtime.model = m;
    if (!prev) useStore.getState().requestCam(useStore.getState().scene === 'field' ? 'ground' : 'front34', true);
    // si cambió el ancho (surcos, espaciado, modelo, transporte), reencuadrar la máquina entera
    else if (Math.abs(m.layout.barLength - prev.layout.barLength) > 0.2 || m.layout.transport !== prev.layout.transport) {
      const st = useStore.getState();
      if (st.scene !== 'field' && !st.detail) window.setTimeout(() => useStore.getState().focus('overview'), 450);
    }
    invalidate();
  };

  // consume la construcción pendiente: hasta BUDGET ms por cuadro
  useFrame(() => {
    const j = job.current;
    if (!j) return;
    const BUDGET = 6;
    const t0 = performance.now();
    let done = false;
    while (performance.now() - t0 < BUDGET) {
      const s0 = performance.now();
      const r = j.steps.next();
      j.maxSlice = Math.max(j.maxSlice, performance.now() - s0);
      if (r.done) {
        done = true;
        break;
      }
    }
    j.cpu += performance.now() - t0;
    if (done) {
      job.current = null;
      runtime.lastRebuildMs = j.cpu;
      runtime.lastRebuildMaxSliceMs = j.maxSlice;
      swapIn(j.model, runtime.model);
    } else invalidate();
  }, -1);

  useEffect(
    () => () => {
      job.current?.model.dispose();
      job.current = null;
      runtime.model?.dispose();
      runtime.model = null;
    },
    [],
  );

  // Colores: sin reconstruir
  useEffect(() => {
    setMachineColors(config.colors.main, config.colors.accent);
    invalidate();
  }, [config.colors.main, config.colors.accent, invalidate]);

  // Calcomanías de marca / logo / texto
  const decalTex = useRef<THREE.Texture | null>(null);
  const modelName = translate(lang, `models.${config.model}.name`);
  useEffect(() => {
    let cancelled = false;
    const make = (img: HTMLImageElement | null) => {
      if (cancelled) return;
      const tex = brandDecal({
        brandName: brand.name,
        model: modelName,
        text: config.text,
        logo: img,
        accent: config.colors.accent,
        light: !isLight(config.colors.main),
      });
      const old = decalTex.current;
      decalTex.current = tex;
      runtime.model?.setDecal(tex);
      old?.dispose();
      invalidate();
    };
    if (logoUrl) {
      const img = new Image();
      img.onload = () => make(img);
      img.onerror = () => make(null);
      img.src = logoUrl;
    } else {
      // esperar a que la tipografía esté lista para el canvas
      (document.fonts?.ready ?? Promise.resolve()).then(() => make(null));
    }
    return () => {
      cancelled = true;
    };
  // sin `sig`: reconstruir la máquina no regenera la calcomanía (el modelo nuevo recibe la actual)
  }, [logoUrl, config.text, config.colors.accent, config.colors.main, modelName, invalidate]);

  useFrame((_, dt) => {
    const m = runtime.model;
    if (!m || captureState.lock) return;
    const st = useStore.getState();
    const target = st.pose === 'transport' ? 1 : 0;
    // plegado/desplegado en 3,5 s de tiempo real (cada fase con easing); dt hasta 0,25 s para que
    // con pocos FPS no se estire la animación
    const speed = prefersReducedMotion() ? 1 : 1 / 3.5;
    const moving = m.update(Math.min(dt, 0.25) * runtime.timeScale, target, runtime.distance, speed);
    if (moving) {
      runtime.animTick++;
      invalidate();
    }
  });

  return <group ref={group} visible={!detail} />;
}
