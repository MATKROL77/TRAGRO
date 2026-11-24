import { useMemo } from 'react';
import { priceBreakdown, type PriceBreakdown } from '@/core/pricing';
import { computeSpecs, type Specs } from '@/core/specs';
import { useStore } from './store';

export function usePrice(): PriceBreakdown {
  const cfg = useStore((s) => s.config);
  return useMemo(() => priceBreakdown(cfg), [cfg]);
}

export function useSpecs(): Specs {
  const cfg = useStore((s) => s.config);
  return useMemo(() => computeSpecs(cfg), [cfg]);
}
