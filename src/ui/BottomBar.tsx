import { useState } from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n/useT';
import { useFmt } from './format';
import { useCountUpText, usePerformance, usePrice, useTransportCheck } from './hooks';
import { leadTimeDays } from '../domain/pricing';
import { catalog, isBasic, isRecommended } from '../domain/catalog';
import { IconChevron } from './icons';

/** Va al paso de Transporte del configurador (desde el semáforo de la tarjeta). */
export function goToTransport() {
  const st = useStore.getState();
  st.setPanelTab('config');
  st.setStep(Math.max(0, catalog.steps.findIndex((x) => x.id === 'transport')));
  st.focus('overview');
  window.setTimeout(() => document.getElementById('transport-check')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
}

/** Tarjeta de precio y datos técnicos (arriba a la izquierda del visor). */
export function PriceHeader() {
  const t = useT();
  const f = useFmt();
  const price = usePrice();
  const perf = usePerformance();
  const chk = useTransportCheck();
  const hide = useStore((s) => s.hidePrices);
  const amountRef = useCountUpText<HTMLSpanElement>(price.total, (v) => (hide ? t('price.hidden') : f.money(Math.round(v / 10) * 10)));
  const destination = useStore((s) => s.destination);
  const openModal = useStore((s) => s.openModal);
  const config = useStore((s) => s.config);
  const applyBasic = useStore((s) => s.applyBasic);
  const applyRecommended = useStore((s) => s.applyRecommended);
  const [open, setOpen] = useState(true);
  const legend = `${t(destination === 'export' ? 'price.legendExport' : 'price.legendLocal')} ${t('price.leadTime', { days: leadTimeDays(config) })}.`;
  const rec = isRecommended(config);
  const basic = isBasic(config);
  const trTitle = `${t('transport.title')}: ${t(`transport.${chk.level}`)}`;
  return (
    <div className={`price-head pcard${open ? '' : ' is-closed'}`}>
      <div className="pcard-head">
        <button type="button" className={`tr-chip tr-${chk.level}`} onClick={goToTransport} title={trTitle} aria-label={trTitle}>
          <span className={`light light-${chk.level}`} aria-hidden />
          <span className="tr-chip-text">{t(`price.road.${chk.level}`)}</span>
        </button>
        <button type="button" className="pcard-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="pcard-title">{t('price.label')}</span>
          <span ref={amountRef} className="ph-amount bb-amount" aria-live="polite" aria-atomic="true" title={legend} />
          <span className={`chev${open ? ' up' : ''}`} aria-hidden><IconChevron size={14} /></span>
        </button>
      </div>
      <span className="sr-only">{legend}</span>
      {(rec || basic) && (
        <div className="pcard-preset">
          <span className="preset-tag">{t(rec ? 'price.recommended' : 'price.basic')}</span>
          <button type="button" className="link small" onClick={rec ? applyBasic : applyRecommended}>
            {t(rec ? 'price.toBasic' : 'price.toRecommended')}
          </button>
        </div>
      )}
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
