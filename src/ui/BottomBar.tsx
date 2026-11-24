import { useStore } from '../state/store';
import { useT } from '../i18n/useT';
import { useFmt } from './format';
import { useCountUp, usePerformance, usePrice } from './hooks';
import { leadTimeDays } from '../domain/pricing';

export function BottomBar() {
  const t = useT();
  const f = useFmt();
  const price = usePrice();
  const perf = usePerformance();
  const shown = useCountUp(price.total);
  const hide = useStore((s) => s.hidePrices);
  const destination = useStore((s) => s.destination);
  const setDestination = useStore((s) => s.setDestination);
  const openModal = useStore((s) => s.openModal);
  const config = useStore((s) => s.config);
  return (
    <footer className="bottombar">
      <div className="bb-price">
        <span className="bb-label">
          {t('price.label')}
          <span className="seg seg-mini" role="radiogroup" aria-label={t('price.destination')}>
            {(['local', 'export'] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={destination === d} className={destination === d ? 'is-selected' : ''} onClick={() => setDestination(d)}>
                {t(`price.${d}`)}
              </button>
            ))}
          </span>
        </span>
        <span className="bb-amount" aria-live="polite" aria-atomic="true">
          {hide ? t('price.hidden') : f.money(Math.round(shown / 10) * 10)}
        </span>
        <span className="bb-legend">{t(destination === 'export' ? 'price.legendExport' : 'price.legendLocal')} · {t('price.leadTime', { days: leadTimeDays(config) })}</span>
      </div>
      <div className="bb-kpis">
        <div className="bb-kpi"><span>{t('perf.width')}</span><strong>{f.q(perf.widthM, 'length', 2)}</strong></div>
        <div className="bb-kpi"><span>{t('perf.haH')}</span><strong>{f.q(perf.haPerHour, 'areaRate', 2)}</strong></div>
        <div className="bb-kpi bb-kpi-hide-sm"><span>{t('perf.hp')}</span><strong>{perf.hp.min}–{perf.hp.max} {t('perf.hpUnit')}</strong></div>
      </div>
      <div className="bb-actions">
        <button type="button" className="btn btn-secondary" onClick={() => openModal('summary')}>{t('actions.summary')}</button>
        <button type="button" className="btn btn-accent" onClick={() => openModal('quote')}>{t('actions.quote')}</button>
      </div>
    </footer>
  );
}
