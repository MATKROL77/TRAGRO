import { useEffect, useRef, useState, type ComponentType } from 'react';
import type * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useStore, type EnvId } from '@/state/store';
import { setCargoScene } from './cargoFx';
import { Studio } from './Studio';
import { viewer } from './viewerApi';
import { isSceneReady, onSceneReady } from './sceneReady';

type Outdoor = 'exterior' | 'ruta';
type SceneComp = ComponentType<{ visible: boolean }>;

/** Carga (code-splitting) y prepara una escena al aire libre. */
async function loadScene(id: Outdoor, gl: THREE.WebGLRenderer, camera: THREE.Camera): Promise<SceneComp> {
  if (id === 'exterior') {
    const mod = await import('./Exterior');
    await mod.prepareExterior(gl, camera);
    return mod.default;
  }
  const mod = await import('./Route');
  await mod.prepareRoute(gl, camera);
  return mod.default;
}

/**
 * Escenas del visor. El estudio está siempre montado; Exterior (predio de acopio) y Ruta se
 * preparan en momentos ociosos (ver Preloader) y, una vez listas, quedan montadas: cambiar
 * de escena solo alterna visibilidad y entorno (sin descargas, sin armar geometría ni
 * compilar). Si el usuario pide una escena que todavía no está lista, se prepara en el acto.
 */
export function Scene() {
  const env = useStore((s) => s.ui.env);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const [shown, setShown] = useState<EnvId>('estudio');
  const comps = useRef<Partial<Record<Outdoor, SceneComp>>>({});
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const apply = (next: EnvId) => {
      if (cancelled) return;
      viewer()?.crossfade(650);
      setCargoScene(next);
      setShown(next);
      invalidate();
    };
    if (env === 'estudio') {
      if (shown !== 'estudio') apply('estudio');
      return;
    }
    const id = env;
    if (!comps.current[id]) useStore.getState().setUi({ cargandoEntorno: true });
    loadScene(id, gl, camera)
      .then((C) => {
        comps.current[id] = C;
        force((n) => n + 1);
        apply(id);
      })
      .catch((e) => {
        console.error(`[configurador] no se pudo cargar la escena ${id}`, e);
        if (!cancelled) useStore.getState().setUi({ env: 'estudio' });
      })
      .finally(() => useStore.getState().setUi({ cargandoEntorno: false }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env, gl]);

  // Si el Preloader ya dejó lista una escena, se monta oculta.
  useEffect(() => {
    const mount = (id: Outdoor) => {
      if (comps.current[id]) return;
      void (id === 'exterior' ? import('./Exterior').then((m) => m.isExteriorReady() && m.default) : import('./Route').then((m) => m.isRouteReady() && m.default)).then((C) => {
        if (!C || comps.current[id]) return;
        comps.current[id] = C;
        force((n) => n + 1);
      });
    };
    for (const id of ['exterior', 'ruta'] as const) if (isSceneReady(id)) mount(id);
    return onSceneReady((id) => mount(id));
  }, []);

  const Ext = comps.current.exterior;
  const Rt = comps.current.ruta;
  return (
    <>
      <Studio visible={shown === 'estudio'} />
      {Ext ? <Ext visible={shown === 'exterior'} /> : null}
      {Rt ? <Rt visible={shown === 'ruta'} /> : null}
    </>
  );
}
