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

/**
 * Conteo animado del precio sin re-render de React por cuadro: escribe el texto directo en el nodo
 * (ref) con requestAnimationFrame. React sólo renderiza cuando cambia el valor final.
 */
export function useCountUpText<T extends HTMLElement>(value: number, format: (v: number) => string, ms = 650) {
  const ref = useRef<T>(null);
  const from = useRef(value);
  const raf = useRef(0);
  const fmt = useRef(format);
  fmt.current = format;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const a = from.current;
    if (reduce || a === value) {
      el.textContent = fmt.current(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      const v = a + (value - a) * e;
      from.current = v;
      el.textContent = fmt.current(v);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ms]);
  // si cambia el formato (idioma, ocultar precios) sin cambiar el valor, se reescribe
  useEffect(() => {
    if (ref.current && from.current === value) ref.current.textContent = format(value);
  });
  return ref;
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
