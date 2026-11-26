import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useThree } from '@react-three/fiber';
import { useStore, type EnvId } from '@/state/store';
import { Studio } from './Studio';
import { viewer } from './viewerApi';
import { isSceneReady, onSceneReady } from './sceneReady';

type ExteriorModule = typeof import('./Exterior');

/**
 * Escenas del visor. El estudio está siempre montado; el exterior se prepara en un
 * momento ocioso (ver Preloader) y, una vez listo, queda montado: cambiar de escena
 * solo alterna visibilidad y entorno (sin descargas, sin armar geometría ni compilar).
 * Si el usuario pide una escena que todavía no está lista, se prepara en el acto.
 */
export function Scene() {
  const env = useStore((s) => s.ui.env);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const [shown, setShown] = useState<EnvId>('estudio');
  const Exterior = useRef<ComponentType<{ visible: boolean }> | null>(null);
  const [extReady, setExtReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const apply = (next: EnvId) => {
      if (cancelled) return;
      viewer()?.crossfade(650);
      setShown(next);
      invalidate();
    };
    if (env === 'exterior') {
      const ready = Exterior.current && extReady;
      if (!ready) useStore.getState().setUi({ cargandoEntorno: true });
      import('./Exterior')
        .then(async (mod: ExteriorModule) => {
          await mod.prepareExterior(gl, camera);
          Exterior.current = mod.default;
          if (cancelled) return;
          setExtReady(true);
          apply('exterior');
        })
        .catch((e) => {
          console.error('[configurador] no se pudo cargar la escena exterior', e);
          if (!cancelled) useStore.getState().setUi({ env: 'estudio' });
        })
        .finally(() => useStore.getState().setUi({ cargandoEntorno: false }));
    } else if (shown !== 'estudio') {
      apply('estudio');
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env, gl]);

  // Si el Preloader ya dejó lista la escena exterior, se monta oculta.
  useEffect(() => {
    if (extReady) return;
    const mount = () =>
      void import('./Exterior').then((mod) => {
        if (!mod.isExteriorReady()) return;
        Exterior.current = mod.default;
        setExtReady(true);
      });
    if (isSceneReady('exterior')) mount();
    return onSceneReady((id) => id === 'exterior' && mount());
  }, [extReady]);

  const Ext = Exterior.current;
  return (
    <>
      <Studio visible={shown === 'estudio'} />
      {extReady && Ext ? <Ext visible={shown === 'exterior'} /> : null}
    </>
  );
}
