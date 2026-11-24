import type { TypeId } from '@/core/types';

/** Siluetas lineales de cada tipo de semirremolque. */
export function TypeIcon({ tipo }: { tipo: TypeId }) {
  const wheels = (xs: number[]) => xs.map((x) => <circle key={x} cx={x} cy={46} r={6.5} fill="none" stroke="currentColor" strokeWidth={2.4} />);
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <svg viewBox="0 0 104 56" aria-hidden="true" focusable="false">
      {tipo === 'tolva' ? (
        <g {...common}>
          <path d="M8 10h88v20H8z" />
          <path d="M8 10q44-8 88 0" />
          <path d="M24 30l8 12h8l8-12M52 30l8 12h8l8-12" />
          <path d="M20 10v20M34 10v20M48 10v20M62 10v20M76 10v20" opacity=".45" />
          {wheels([18, 46, 74])}
          <path d="M92 30v18M88 48h8" />
        </g>
      ) : tipo === 'batea' ? (
        <g {...common}>
          <path d="M6 12h80v16l-6 8H12l-6-8z" />
          <path d="M22 12v24M38 12v24M54 12v24M70 12v24" opacity=".45" />
          <path d="M90 8v30" strokeWidth={4} />
          <path d="M8 40h90" />
          {wheels([18, 40, 62])}
          <path d="M84 40v8M80 48h8" />
        </g>
      ) : tipo === 'plataforma' ? (
        <g {...common}>
          <path d="M4 34h96" strokeWidth={3.4} />
          <path d="M6 22h82v12M98 12v22M88 12h10" />
          <path d="M26 22v12M46 22v12M66 22v12" opacity=".6" />
          {wheels([16, 34, 52])}
          <path d="M82 36v12M78 48h8" />
        </g>
      ) : (
        <g {...common}>
          <path d="M5 6h94v30H5z" />
          <path d="M5 30h94" opacity=".45" />
          <path d="M28 6v24M52 6v24M76 6v24" opacity=".3" />
          {wheels([16, 31, 46])}
          <path d="M84 36v12M80 48h8" />
        </g>
      )}
    </svg>
  );
}
