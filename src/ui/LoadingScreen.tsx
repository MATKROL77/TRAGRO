import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { loadingImage, matchesLoadingImage } from './loadingMatch';

/**
 * Pantalla de carga: muestra una imagen real del equipo, capturada con la misma cámara
 * con la que arranca el visor, mientras baja el 3D. Si la configuración es la sugerida,
 * imagen y 3D coinciden y el fundido es directo; si no (link compartido, otro color),
 * primero se va la imagen y después aparece el 3D, sin doble contorno.
 * El cartel va arriba y por debajo de los controles del visor: nunca los tapa.
 */
export function LoadingScreen({ progress, done }: { progress: number; done: boolean }) {
  const { t } = useI18n();
  const [first] = useState(() => {
    const s = useStore.getState();
    return { tipo: s.config.tipo, match: matchesLoadingImage(s.config, s.ui.env, s.ui.tractor) };
  });
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setGone(true), 700);
    return () => window.clearTimeout(id);
  }, [done]);
  if (gone) return null;
  const pct = Math.round(Math.min(100, Math.max(0, progress)));
  return (
    <div className={`loading ${done ? 'is-done' : ''} ${first.match ? 'is-match' : 'is-nomatch'}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('app.cargando')}>
      <img className="loading-img" src={loadingImage(first.tipo)} alt="" decoding="async" fetchPriority="high" />
      <div className="loading-box">
        <div className="loading-row">
          <h2>{t('app.cargando')}</h2>
          <span className="loading-pct">{pct} %</span>
        </div>
        <p>{t('app.cargandoDetalle')}</p>
        <div className="progress">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
