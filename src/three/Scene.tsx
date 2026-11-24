import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useThree } from '@react-three/fiber';
import { useStore, type EnvId } from '@/state/store';
import { Studio } from './Studio';
import { viewer } from './viewerApi';

type ExteriorModule = typeof import('./Exterior');

/**
 * Cambia entre estudio y exterior con fundido cruzado. La escena exterior se
 * descarga recién cuando se pide (code-splitting) y se muestra cuando está lista.
 */
export function Scene() {
  const env = useStore((s) => s.ui.env);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const [shown, setShown] = useState<EnvId>('estudio');
  const Exterior = useRef<ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (next: EnvId) => {
      if (cancelled) return;
      viewer()?.crossfade(650);
      setShown(next);
      invalidate();
    };
    if (env === 'exterior') {
      useStore.getState().setUi({ cargandoEntorno: true });
      import('./Exterior')
        .then(async (mod: ExteriorModule) => {
          await mod.preloadExterior(gl);
          Exterior.current = mod.default;
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

  const Ext = Exterior.current;
  return shown === 'exterior' && Ext ? <Ext /> : <Studio />;
}
