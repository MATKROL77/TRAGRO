/**
 * Calidad adaptativa en tres niveles (alta, media, baja).
 *
 * - Render a demanda (estudio, exterior): mide solo ráfagas de cuadros continuos
 *   (girar la cámara, animaciones) y descarta las pausas, que no son caídas de fps.
 *   El PerformanceMonitor de drei asume render continuo y, con render a demanda,
 *   tomaría cada pausa como una caída: por eso en ese modo se usa este monitor.
 * - Render continuo (la ruta con el camión circulando): PerformanceMonitor de drei.
 * - Resolución: tope por nivel; en el nivel bajo, además, baja un poco mientras la
 *   cámara se mueve (como AdaptiveDpr de drei) y vuelve al quedarse quieta. En los
 *   otros niveles no, porque cada cambio de resolución realoca los buffers del
 *   postprocesado (un tirón al empezar y al terminar cada gesto).
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { stepTier, tierSettings, type Tier } from './tiers';

export interface AdaptiveQualityProps {
  tier: Tier;
  onChange: (t: Tier) => void;
  /** El usuario fijó la calidad (?calidad=...): no se cambia sola. */
  locked?: boolean;
  /** El visor dibuja sin parar (ruta en movimiento). */
  continuous?: boolean;
  /** true mientras hay actividad continua en modo a demanda (cámara, animación). */
  isActive: () => boolean;
  /** Después de cambiar la resolución (p. ej. para redimensionar el postprocesado). */
  onResolution?: () => void;
  /** fps por debajo de los cuales se baja un nivel, y por encima de los cuales se sube. */
  lowFps?: number;
  highFps?: number;
}

export function AdaptiveQuality({ tier, onChange, locked = false, continuous = false, isActive, onResolution, lowFps = 27, highFps = 57 }: AdaptiveQualityProps) {
  const setDpr = useThree((s) => s.setDpr);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const perfCurrent = useThree((s) => s.performance.current);
  const st = tierSettings(tier);
  const moving = perfCurrent < 1;

  useEffect(() => {
    const device = window.devicePixelRatio || 1;
    const k = tier === 'baja' && moving ? st.movingDpr : 1;
    setDpr(Math.min(device, st.dprMax) * k);
    const id = requestAnimationFrame(() => {
      onResolution?.();
      invalidate();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, moving, st.dprMax, st.movingDpr, setDpr, size.width, size.height, invalidate]);

  // Monitor por ráfagas (render a demanda).
  const perf = useRef({ run: 0, sum: 0, slow: 0, fast: 0, raises: 0 });
  useFrame((_, rawDt) => {
    if (continuous || locked) return;
    const p = perf.current;
    if (!isActive() && rawDt > 0.25) {
      p.run = 0;
      p.sum = 0;
      return;
    }
    p.run++;
    p.sum += Math.min(rawDt, 1.5);
    if (p.run < 50 && p.sum < 2.5) return;
    if (p.run < 4) return;
    const fps = p.run / p.sum;
    p.run = 0;
    p.sum = 0;
    if (fps < lowFps) {
      p.fast = 0;
      if (++p.slow >= 2 && tier !== 'baja') {
        p.slow = 0;
        onChange(stepTier(tier, -1));
      }
    } else if (fps > highFps) {
      p.slow = 0;
      // Subir es más conservador (y limitado) para no oscilar.
      if (++p.fast >= 8 && tier !== 'alta' && p.raises < 2) {
        p.fast = 0;
        p.raises++;
        onChange(stepTier(tier, 1));
      }
    } else {
      p.slow = 0;
      p.fast = 0;
    }
  });

  if (!continuous || locked) return null;
  return <PerformanceMonitor ms={400} iterations={8} flipflops={3} bounds={() => [lowFps + 3, highFps]} onDecline={() => onChange(stepTier(tier, -1))} onIncline={() => onChange(stepTier(tier, 1))} onFallback={() => onChange('baja')} />;
}
