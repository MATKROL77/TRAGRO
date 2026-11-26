/**
 * Panel de rendimiento (solo con ?debug=1; se importa dinámicamente).
 * r3f-perf muestra fps, CPU/GPU por cuadro, draw calls, triángulos, geometrías,
 * texturas y programas. Al lado se agrega lo que r3f-perf no da: el cuadro más
 * largo de los últimos 5 s (incluye trabas del hilo principal) y una estimación
 * de memoria de GPU.
 */
import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Perf } from 'r3f-perf';
import { estimateGpuMemory, installFrameStats } from './frameStats';

export default function PerfOverlay() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const stats = installFrameStats(gl);
  useFrame(() => stats.beginFrame(), -1000);

  useEffect(() => {
    const box = document.createElement('div');
    box.setAttribute('data-testid', 'debug-extra');
    Object.assign(box.style, {
      position: 'fixed', left: '8px', bottom: '8px', zIndex: '9999', padding: '6px 9px', borderRadius: '6px',
      background: 'rgba(16,20,28,0.86)', color: '#e8edf2', font: '11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace', pointerEvents: 'none', whiteSpace: 'pre',
    } as CSSStyleDeclaration);
    document.body.appendChild(box);
    // Cuadros reales del navegador (requestAnimationFrame): detecta trabas aunque el 3D no esté dibujando.
    const gaps: { t: number; dt: number }[] = [];
    let last = performance.now();
    let raf = 0;
    const loop = (t: number) => {
      gaps.push({ t, dt: t - last });
      last = t;
      while (gaps.length && gaps[0].t < t - 5000) gaps.shift();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    let mem = estimateGpuMemory(scene);
    let tick = 0;
    const id = window.setInterval(() => {
      if (++tick % 4 === 0) mem = estimateGpuMemory(scene);
      const maxGap = gaps.reduce((m, g) => Math.max(m, g.dt), 0);
      const fr = stats.recent(5000);
      const maxRender = fr.reduce((m, f) => Math.max(m, f.renderMs), 0);
      const last3d = fr[fr.length - 1];
      box.textContent =
        `cuadro máx (5 s): ${maxGap.toFixed(1)} ms${maxGap > 50 ? '  ⚠' : ''}\n` +
        `render CPU máx:   ${maxRender.toFixed(1)} ms\n` +
        `cuadros 3D (5 s): ${fr.length}\n` +
        `programas: ${last3d?.programs ?? gl.info.programs?.length ?? 0}  draw calls: ${last3d?.calls ?? '-'}\n` +
        `GPU (estim.): tex ${mem.texturesMB.toFixed(1)} MB · geo ${mem.geometryMB.toFixed(1)} MB\n` +
        `DPR ${gl.getPixelRatio().toFixed(2)}`;
    }, 500);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(id);
      box.remove();
    };
  }, [gl, scene, stats]);

  return <Perf position="bottom-right" showGraph deepAnalyze={false} matrixUpdate={false} />;
}
