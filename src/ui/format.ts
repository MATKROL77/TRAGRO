import { useMemo } from 'react';
import { useStore } from '../state/store';
import { formatMoney, formatNumber, formatQty, convert, unitLabel, type Quantity } from '../domain/units';

export function useFmt() {
  const lang = useStore((s) => s.lang);
  const units = useStore((s) => s.units);
  return useMemo(
    () => ({
      lang,
      units,
      n: (v: number, d = 0) => formatNumber(v, lang, d),
      q: (v: number, q: Quantity, d = 1) => formatQty(v, q, units, lang, d),
      money: (v: number) => formatMoney(v, lang),
      conv: (v: number, q: Quantity) => convert(v, q, units),
      unit: (q: Quantity) => unitLabel(q, units),
    }),
    [lang, units],
  );
}
