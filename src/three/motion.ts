let mq: MediaQueryList | null = null;
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  mq ??= window.matchMedia('(prefers-reduced-motion: reduce)');
  return mq.matches;
}
