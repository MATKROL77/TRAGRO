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

  // Reconstrucción geométrica (los cuerpos se deslizan desde su posición anterior)
  useEffect(() => {
    const prev = runtime.model;
    const m = family.create(useStore.getState().config, mats, prev) as SeederModel;
    group.current?.add(m.root);
    if (prev) {
      // pasar la calcomanía actual al modelo nuevo
      m.setDecal(decalTex.current);
      prev.dispose();
    }
    runtime.model = m;
    if (!prev) useStore.getState().requestCam(useStore.getState().scene === 'field' ? 'ground' : 'front34', true);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(
    () => () => {
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
  }, [logoUrl, config.text, config.colors.accent, config.colors.main, modelName, sig, invalidate]);

  useFrame((_, dt) => {
    const m = runtime.model;
    if (!m || captureState.lock) return;
    const st = useStore.getState();
    const target = st.pose === 'transport' ? 1 : 0;
    const speed = prefersReducedMotion() ? 1 : 1 / 7;
    const moving = m.update(Math.min(dt, 0.05) * runtime.timeScale, target, runtime.distance, speed);
    if (moving) invalidate();
  });

  return <group ref={group} visible={!detail} />;
}
