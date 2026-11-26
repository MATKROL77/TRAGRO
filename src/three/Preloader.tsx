/**
 * Precarga en segundo plano, después del primer cuadro del estudio:
 *  1. compila los shaders de todos los materiales del equipo (los cuatro tipos y sus
 *     opciones comparten la misma biblioteca), en variante normal e instanciada;
 *  2. prepara la escena exterior (descarga, arma, sube texturas y compila).
 * Todo en momentos ociosos, para que el primer cambio de tipo, opción o escena no traiga
 * compilaciones ni subidas de texturas.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useStore } from '@/state/store';
import { compileMaterials, warmScene } from '@/render-kit/precompile/compile';
import { idleQueue, saveData } from '@/render-kit/scheduling/idle';
import { materialLibrary } from './materialsLib';
import { tierSettings } from '@/render-kit/quality/tiers';
import { tractorMaterials } from './parts/tractor';
import { prepareWheelDetail } from './parts/wheels';

/** Espera (hasta `ms`) a que aparezca un objeto en la escena. */
function waitFor<T>(get: () => T | undefined, ms = 8000): Promise<T | undefined> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const v = get();
      if (v || performance.now() - t0 > ms) resolve(v);
      else window.setTimeout(tick, 200);
    };
    tick();
  });
}

export function Preloader() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const ready = useStore((s) => s.ready);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const t0 = performance.now();
    const log = (msg: string) => {
      if (import.meta.env.DEV || /[?&]debug/.test(window.location.search)) console.info(`[precarga] ${msg} (${Math.round(performance.now() - t0)} ms)`);
    };
    void idleQueue([
      async () => {
        if (cancelled) return;
        const n = await compileMaterials(gl, camera, scene, [...Object.values(materialLibrary().mats), ...tractorMaterials()]);
        // Ruedas de detalle bajo (para cuando la cámara se aleja) listas de antemano.
        prepareWheelDetail();
        log(`shaders del equipo: ${n} programas nuevos`);
      },
      async () => {
        if (cancelled || saveData()) return;
        const mod = await import('./Exterior');
        await mod.prepareExterior(gl, camera);
        log('escena exterior (predio) lista');
      },
      async () => {
        if (cancelled || saveData()) return;
        const mod = await import('./Route');
        await mod.prepareRoute(gl, camera, tierSettings(useStore.getState().ui.calidad).vegetation);
        log('escena ruta lista');
      },
      async () => {
        // Cuadros de calentamiento con el tractor y cada escena a la vista (variantes de sombra incluidas).
        const tractor = await waitFor(() => scene.getObjectByName('tractor'));
        const exterior = await waitFor(() => scene.getObjectByName('exterior'));
        const ruta = await waitFor(() => scene.getObjectByName('ruta'));
        if (cancelled) return;
        const studio = scene.getObjectByName('studio');
        if (useStore.getState().ui.env !== 'estudio') return;
        warmScene(gl, scene, camera, [[tractor, true]]);
        if (exterior) warmScene(gl, scene, camera, [[studio, false], [exterior, true], [tractor, false]]);
        if (ruta) warmScene(gl, scene, camera, [[studio, false], [ruta, true], [tractor, true]]);
        log('cuadros de calentamiento listos');
      },
    ]).catch((e) => console.warn('[configurador] precarga incompleta', e));
    return () => {
      cancelled = true;
    };
  }, [ready, gl, scene, camera]);

  return null;
}
