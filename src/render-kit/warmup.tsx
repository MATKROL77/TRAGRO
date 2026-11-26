/**
 * Precompilación y precarga de escenas (render-kit).
 *
 * Después del primer cuadro, en tiempo ocioso, monta cada escena pesada (Campo, Ruta…) dentro de un
 * portal de React Three Fiber que NUNCA se muestra, y:
 *   1. espera a que carguen sus recursos (Suspense: texturas, HDR, chunks de código),
 *   2. compila sus shaders con `renderer.compileAsync` contra un render target lineal (igual que el
 *      EffectComposer), así la clave del programa coincide con la del render real,
 *   3. compila además los objetos "externos" (por ejemplo la máquina) con las luces/entorno/niebla de
 *      esa escena (`compileAsync(obj, cam, escenaDestino)`),
 *   4. renderiza un cuadro oculto de 64×64: sube texturas y geometrías a la GPU y genera el PMREM del HDR,
 *   5. desmonta el portal. Los materiales/texturas de las escenas deben ser compartidos (cacheados a
 *      nivel módulo) para que los programas y las texturas sigan vivos al entrar de verdad.
 *
 * Los componentes de escena pueden leer `useWarmup()` para no ejecutar lógica con efectos (simulación,
 * contadores) mientras están en el portal.
 */
import { createContext, Suspense, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const WarmupCtx = createContext(false);
/** true dentro del portal de precarga. */
export const useWarmup = () => useContext(WarmupCtx);

/**
 * Objetos compartidos (singletons) que una escena usa con <primitive>: NO se montan en el portal
 * (un mismo Object3D no puede pertenecer a dos árboles de React Three Fiber). Se registran acá y el
 * precompilador los agrega a la escena oculta sólo durante la compilación.
 */
const extras = new Set<THREE.Object3D>();
/** Dentro del portal registra el objeto y devuelve true (no renderizar el <primitive>). */
export function useWarmupObject(obj: THREE.Object3D): boolean {
  const warm = useWarmup();
  if (warm) extras.add(obj);
  return warm;
}

export interface WarmupTarget {
  id: string;
  /** contenido de la escena (se monta en un THREE.Scene aparte) */
  element: ReactNode;
}

export interface WarmupStats { id: string; ms: number; programsBefore: number; programsAfter: number }

interface Props {
  targets: WarmupTarget[];
  /** objetos que viven en la escena principal y que deben compilarse con las luces de cada escena */
  extraObjects?: () => THREE.Object3D[];
  /** se pausa (y aborta la escena en curso) mientras devuelve false; por ejemplo, si el usuario ya entró a esa escena */
  allowed?: (id: string) => boolean;
  /** mientras sea true no se monta nada (por ejemplo, el usuario está en otra escena); se retoma después */
  paused?: boolean;
  /** demora inicial (ms) después del primer cuadro */
  delay?: number;
  onDone?: (stats: WarmupStats[]) => void;
}

const idle = (fn: () => void, timeout = 1500) => {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout });
  else window.setTimeout(fn, 200);
};

/** Se monta cuando el contenido del portal terminó de suspender (recursos listos). */
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function SceneWarmup({ targets, extraObjects, allowed = () => true, paused = false, delay = 600, onDone }: Props) {
  const { gl, camera } = useThree();
  const [index, setIndex] = useState(-1);
  const stats = useRef<WarmupStats[]>([]);
  const portalScene = useMemo(() => new THREE.Scene(), []);
  const busy = useRef(false);
  const tempAdded = useRef<THREE.Object3D[]>([]);

  // arranca en tiempo ocioso después del primer cuadro
  useEffect(() => {
    const id = window.setTimeout(() => idle(() => setIndex(0)), delay);
    return () => window.clearTimeout(id);
  }, [delay]);

  // fin de la lista
  useEffect(() => {
    if (index >= targets.length && index !== -1) onDone?.(stats.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const target = index >= 0 && index < targets.length ? targets[index] : null;
  const skip = !!target && !allowed(target.id);
  useEffect(() => {
    if (skip) idle(() => setIndex((i) => i + 1));
  }, [skip]);

  const compile = async () => {
    if (!target || busy.current || paused) return;
    busy.current = true;
    const t0 = performance.now();
    const before = gl.info.programs?.length ?? 0;
    const rt = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType, depthBuffer: true });
    const prev = gl.getRenderTarget();
    const prevAuto = gl.shadowMap.autoUpdate;
    try {
      const cam = camera.clone() as THREE.PerspectiveCamera;
      // objetos compartidos: se agregan sólo mientras dura la compilación (si no están ya en otra escena)
      const added: THREE.Object3D[] = [];
      for (const o of extras) if (!o.parent) {
        portalScene.add(o);
        added.push(o);
      }
      tempAdded.current = added;
      gl.setRenderTarget(rt);
      await gl.compileAsync(portalScene, cam);
      for (const o of extraObjects?.() ?? []) {
        gl.setRenderTarget(rt);
        await gl.compileAsync(o, cam, portalScene);
      }
      // un cuadro oculto: sube texturas/geometrías, genera el PMREM y compila los shaders de sombra.
      // Los objetos externos (la máquina) se mueven a la escena oculta sólo durante este render
      // sincrónico y vuelven a su lugar antes del próximo cuadro (el usuario no lo ve).
      const moved: { o: THREE.Object3D; parent: THREE.Object3D }[] = [];
      for (const o of extraObjects?.() ?? []) {
        if (o.parent) {
          moved.push({ o, parent: o.parent });
          portalScene.add(o);
        }
      }
      try {
        gl.setRenderTarget(rt);
        gl.shadowMap.needsUpdate = true;
        gl.render(portalScene, cam);
      } finally {
        for (const { o, parent } of moved) parent.add(o);
      }
    } catch {
      /* si algo falla, la escena se compilará al entrar, como antes */
    } finally {
      for (const o of tempAdded.current) if (o.parent === portalScene) portalScene.remove(o);
      tempAdded.current = [];
      extras.clear();
      gl.setRenderTarget(prev);
      gl.shadowMap.autoUpdate = prevAuto;
      rt.dispose();
    }
    stats.current.push({ id: target.id, ms: Math.round(performance.now() - t0), programsBefore: before, programsAfter: gl.info.programs?.length ?? 0 });
    busy.current = false;
    // desmontar y seguir con la próxima en tiempo ocioso
    idle(() => setIndex((i) => i + 1));
  };

  if (!target || skip || paused) return null;
  return (
    <WarmupCtx.Provider value>
      {createPortal(
        <Suspense fallback={null}>
          {target.element}
          <Ready key={target.id} onReady={() => requestAnimationFrame(() => void compile())} />
        </Suspense>,
        portalScene,
      )}
    </WarmupCtx.Provider>
  );
}
