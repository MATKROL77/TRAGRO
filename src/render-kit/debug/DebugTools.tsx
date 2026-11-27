/**
 * Herramientas de diagnóstico (sólo con ?debug=1). Este módulo se importa dinámicamente:
 * sin el parámetro, ni r3f-perf ni este código entran en el bundle principal.
 */
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Perf } from 'r3f-perf';
import { ProgressiveModel } from '../ProgressiveModel';

/** ?debug=1&glb=<nombre>: vista previa de public/models/<nombre>.glb (pipeline de modelos), a 6 m detrás. */
const GLB = new URLSearchParams(window.location.search).get('glb');

/** Cuadro máximo y cuadros largos (>50 ms) de los últimos 5 s, medidos con requestAnimationFrame. */
function FrameHud() {
  const { gl } = useThree();
  const el = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;font:12px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.78);color:#9f9;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre';
    document.body.appendChild(div);
    el.current = div;
    const deltas: { t: number; d: number }[] = [];
    let last = performance.now();
    let raf = 0;
    let long = 0;
    const po = 'PerformanceObserver' in window ? new PerformanceObserver((l) => (long += l.getEntries().length)) : null;
    try {
      po?.observe({ type: 'longtask', buffered: false });
    } catch {
      /* sin soporte */
    }
    const loop = (now: number) => {
      deltas.push({ t: now, d: now - last });
      last = now;
      while (deltas.length && now - deltas[0].t > 5000) deltas.shift();
      const max = deltas.reduce((m, x) => Math.max(m, x.d), 0);
      const over = deltas.filter((x) => x.d > 50).length;
      const info = gl.info;
      div.textContent = `cuadro máx (5 s): ${max.toFixed(0)} ms\ncuadros >50 ms: ${over} · long tasks: ${long}\nprogramas: ${info.programs?.length ?? 0} · geo: ${info.memory.geometries} · tex: ${info.memory.textures}`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      po?.disconnect();
      div.remove();
    };
  }, [gl]);
  return null;
}

export default function DebugTools() {
  return (
    <>
      <Perf position="top-right" deepAnalyze matrixUpdate overClock antialias={false} />
      <FrameHud />
      {GLB && <ProgressiveModel name={GLB} position={[0, 0, -6]} />}
    </>
  );
}
