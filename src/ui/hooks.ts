import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { computePrice } from '../domain/pricing';
import { computePerformance } from '../domain/agronomy';
import { checkTransport } from '../domain/transport';

export function usePrice() {
  const config = useStore((s) => s.config);
  const destination = useStore((s) => s.destination);
  return useMemo(() => computePrice(config, destination), [config, destination]);
}

export function usePerformance() {
  const config = useStore((s) => s.config);
  const field = useStore((s) => s.field);
  return useMemo(() => computePerformance(config, field), [config, field]);
}

export function useTransportCheck() {
  const config = useStore((s) => s.config);
  const profile = useStore((s) => s.transportProfile);
  return useMemo(() => checkTransport(config, profile), [config, profile]);
}

/** Animación de conteo para el precio. */
export function useCountUp(value: number, ms = 650): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      const v = a + (value - a) * e;
      setShown(v);
      from.current = v;
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ms]);
  return shown;
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
