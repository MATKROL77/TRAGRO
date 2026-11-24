import { useStore } from '../state/store';
import { useT } from '../i18n/useT';
import { useFmt } from './format';
import { useCountUp, usePerformance, usePrice } from './hooks';
import { leadTimeDays } from '../domain/pricing';

/** Precio en vivo, fijo arriba del panel: siempre visible mientras se configura. */
export function PriceHeader() {
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
    <div className="price-head">
      <div className="ph-top">
        <span className="ph-label">{t('price.label')}</span>
        <span className="seg seg-mini" role="radiogroup" aria-label={t('price.destination')}>
          {(['local', 'export'] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={destination === d} className={destination === d ? 'is-selected' : ''} onClick={() => setDestination(d)}>
              {t(`price.${d}`)}
            </button>
          ))}
        </span>
      </div>
      <div className="ph-main">
        <span className="ph-amount bb-amount" aria-live="polite" aria-atomic="true">
          {hide ? t('price.hidden') : f.money(Math.round(shown / 10) * 10)}
        </span>
        <span className="ph-kpis bb-kpis">
          <span>{f.q(perf.widthM, 'length', 2)}</span>
          <span>{f.q(perf.haPerHour, 'areaRate', 2)}</span>
        </span>
      </div>
      <span className="ph-legend">{t(destination === 'export' ? 'price.legendExport' : 'price.legendLocal')} {t('price.leadTime', { days: leadTimeDays(config) })}.</span>
      <div className="ph-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openModal('summary')}>{t('actions.summary')}</button>
        <button type="button" className="btn btn-accent btn-sm" onClick={() => openModal('quote')}>{t('actions.quote')}</button>
      </div>
    </div>
  );
}
