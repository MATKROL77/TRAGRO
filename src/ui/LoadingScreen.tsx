import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';

/**
 * Pantalla de carga: muestra una imagen real del equipo elegido (render estático, liviano)
 * mientras baja el 3D, con el progreso real. Al terminar se funde y se quita del DOM.
 */
export function LoadingScreen({ progress, done }: { progress: number; done: boolean }) {
  const { t } = useI18n();
  const tipo = useStore((s) => s.config.tipo);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setGone(true), 650);
    return () => window.clearTimeout(id);
  }, [done]);
  if (gone) return null;
  const pct = Math.round(Math.min(100, Math.max(0, progress)));
  return (
    <div className={`loading ${done ? 'is-done' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('app.cargando')}>
      <img className="loading-img" src={`/fallback/${tipo}.jpg`} alt="" decoding="async" />
      <div className="loading-box">
        <h2>{t('app.cargando')}</h2>
        <p>
          {t('app.cargandoDetalle')} · {pct} %
        </p>
        <div className="progress">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
