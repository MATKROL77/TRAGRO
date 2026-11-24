import { useI18n } from '@/i18n';

/** Pantalla de carga con la silueta del semi que se va "llenando" con el progreso real. */
export function LoadingScreen({ progress, done }: { progress: number; done: boolean }) {
  const { t } = useI18n();
  const pct = Math.round(Math.min(100, Math.max(0, progress)));
  const d = 'M14 18h150q6 0 6 6v44H14zM30 68l14 22h16l14-22M96 68l14 22h16l14-22M170 62h14v8h-14M176 70v30M170 100h12';
  return (
    <div className={`loading ${done ? 'is-done' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('app.cargando')} aria-hidden={done}>
      <div className="loading-box">
        <svg viewBox="0 0 200 112" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
          <defs>
            <clipPath id="load-clip">
              <rect x="0" y="0" width={(200 * pct) / 100} height="112" />
            </clipPath>
          </defs>
          <g>
            <path d={d} />
            <circle cx="38" cy="96" r="11" />
            <circle cx="86" cy="96" r="11" />
            <circle cx="134" cy="96" r="11" />
          </g>
          <g className="fill" clipPath="url(#load-clip)">
            <path d={d} />
            <circle cx="38" cy="96" r="11" />
            <circle cx="86" cy="96" r="11" />
            <circle cx="134" cy="96" r="11" />
          </g>
        </svg>
        <h2>{t('app.cargando')}</h2>
        <p>{t('app.cargandoDetalle')} · {pct} %</p>
        <div className="progress">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
