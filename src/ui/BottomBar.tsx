import { useState } from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n/useT';
import { useFmt } from './format';
import { useCountUp, usePerformance, usePrice, useTransportCheck } from './hooks';
import { leadTimeDays } from '../domain/pricing';
import { IconChevron } from './icons';

/** Tarjeta de precio y datos técnicos (abajo a la izquierda del visor, estilo ficha). */
export function PriceHeader() {
  const t = useT();
  const f = useFmt();
  const price = usePrice();
  const perf = usePerformance();
  const chk = useTransportCheck();
  const shown = useCountUp(price.total);
  const hide = useStore((s) => s.hidePrices);
  const destination = useStore((s) => s.destination);
  const openModal = useStore((s) => s.openModal);
  const config = useStore((s) => s.config);
  const [open, setOpen] = useState(true);
  const legend = `${t(destination === 'export' ? 'price.legendExport' : 'price.legendLocal')} ${t('price.leadTime', { days: leadTimeDays(config) })}.`;
  return (
    <div className={`price-head pcard${open ? '' : ' is-closed'}`}>
      <button type="button" className="pcard-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`light light-${chk.level}`} aria-hidden />
        <span className="pcard-title">{t('price.label')}</span>
        <span className="ph-amount bb-amount" aria-live="polite" aria-atomic="true" title={legend}>
          {hide ? t('price.hidden') : f.money(Math.round(shown / 10) * 10)}
        </span>
        <span className={`chev${open ? ' up' : ''}`} aria-hidden><IconChevron size={14} /></span>
      </button>
      <span className="sr-only">{legend}</span>
      {open && (
        <div className="pcard-kpis">
          <div><span>{t('perf.width')}</span><strong>{f.q(perf.widthM, 'length', 2)}</strong></div>
          <div><span>{t('perf.haH')}</span><strong>{f.q(perf.haPerHour, 'areaRate', 2)}</strong></div>
          <div><span>{t('perf.hp')}</span><strong>{perf.hp.min}–{perf.hp.max} {t('perf.hpUnit')}</strong></div>
        </div>
      )}
      <div className="ph-actions">
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => openModal('summary')}>{t('actions.summary')}</button>
        <button type="button" className="btn btn-accent btn-xs" onClick={() => openModal('quote')}>{t('actions.quote')}</button>
      </div>
    </div>
  );
}
