import { useStore } from '../state/store';
import { useT } from '../i18n/useT';
import { useFmt } from './format';
import { useCountUp, usePrice } from './hooks';
import { leadTimeDays } from '../domain/pricing';

/** Precio en vivo, mínimo: monto + Resumen / Pedir cotización. La leyenda va como tooltip y en el Resumen/PDF. */
export function PriceHeader() {
  const t = useT();
  const f = useFmt();
  const price = usePrice();
  const shown = useCountUp(price.total);
  const hide = useStore((s) => s.hidePrices);
  const destination = useStore((s) => s.destination);
  const openModal = useStore((s) => s.openModal);
  const config = useStore((s) => s.config);
  const legend = `${t(destination === 'export' ? 'price.legendExport' : 'price.legendLocal')} ${t('price.leadTime', { days: leadTimeDays(config) })}.`;
  return (
    <div className="price-head">
      <span className="ph-amount bb-amount" aria-live="polite" aria-atomic="true" title={legend}>
        {hide ? t('price.hidden') : f.money(Math.round(shown / 10) * 10)}
      </span>
      <span className="sr-only">{legend}</span>
      <div className="ph-actions">
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => openModal('summary')}>{t('actions.summary')}</button>
        <button type="button" className="btn btn-accent btn-xs" onClick={() => openModal('quote')}>{t('actions.quote')}</button>
      </div>
    </div>
  );
}
