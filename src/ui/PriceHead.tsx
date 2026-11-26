import { useState } from 'react';
import { useI18n } from '@/i18n';
import { usePrice, useSpecs } from '@/state/derived';
import { useStore } from '@/state/store';
import { Icon } from './Icon';
import { AnimatedNumber, StatusDot } from './primitives';

/**
 * Tarjeta de precio y datos clave (abajo a la izquierda del visor, estilo ficha de producto).
 * En el celular encabeza la hoja, sin los datos. La leyenda completa va como ayuda del monto,
 * en el Resumen y en el PDF.
 */
export function PriceHead() {
  const { t, n, money, units, ton, vol, area } = useI18n();
  const price = usePrice();
  const specs = useSpecs();
  const setUi = useStore((s) => s.setUi);
  const hide = useStore((s) => s.ui.preciosOcultos);
  const tipo = useStore((s) => s.config.tipo);
  const [open, setOpen] = useState(true);
  const legend = t('barra.leyenda');
  const hasVol = specs.volumenM3 !== null && tipo !== 'plataforma';
  // En métrico la tara se muestra con dos decimales (8,34 t); en imperial, en libras.
  const tara = (kg: number) => (units === 'metric' ? `${n(kg / 1000, 2)} t` : ton(kg / 1000));
  return (
    <div className={`price-head pcard ${open ? '' : 'is-closed'}`}>
      <div className="pcard-head">
        <button type="button" className="pcard-dot" onClick={() => setUi({ pestana: 'tecnico' })} aria-label={`${t('tec.ver')}: ${t(`tec.resumen.${specs.level}`)}`} title={t(`tec.resumen.${specs.level}`)} data-testid="pcard-legal">
          <StatusDot level={specs.level} />
        </button>
        <button type="button" className="pcard-toggle" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="pcard-toggle">
          <span className="pcard-title ph-label">{hide ? t('barra.precioOculto') : t('barra.precio')}</span>
          <span className="ph-amount" aria-live="polite" aria-atomic="true" title={legend}>
            {hide ? <span>—</span> : <span data-testid="precio-total"><AnimatedNumber value={price.totalUsd} format={(v) => money(v)} /></span>}
          </span>
          <span className={`chev ${open ? 'up' : ''}`} aria-hidden="true">
            <Icon name="chevronArriba" size={14} />
          </span>
        </button>
      </div>
      {specs.level === 'bad' ? (
        <button type="button" className="pcard-alert" onClick={() => setUi({ pestana: 'tecnico' })} data-testid="pcard-excede">
          <Icon name="alerta" size={16} />
          <span>{t('tec.resumen.bad')}</span>
          <span className="pcard-alert-ver">{t('tec.ver')} ›</span>
        </button>
      ) : null}
      <span className="sr-only leyenda">{legend}</span>
      {open ? (
        <div className="pcard-kpis" data-testid="kpis">
          <div>
            <span>{t('barra.tara')}</span>
            <strong data-testid="tara">
              <AnimatedNumber value={specs.taraKg} format={tara} />
            </strong>
          </div>
          <div>
            <span>{t('barra.cargaUtil')}</span>
            <strong data-testid="carga-util">
              <AnimatedNumber value={specs.cargaUtilKg} format={(v) => ton(v / 1000)} />
            </strong>
          </div>
          <div>
            <span>{hasVol ? t('tec.volumen') : t('tec.superficie')}</span>
            <strong>{hasVol ? vol(specs.volumenM3 as number) : area(specs.superficieM2)}</strong>
          </div>
        </div>
      ) : null}
      <div className="ph-actions">
        <button type="button" className="btn btn-secundario btn-xs" onClick={() => setUi({ modal: 'resumen' })} data-testid="btn-resumen">
          {t('barra.resumenCorto')}
        </button>
        <button type="button" className="btn btn-primario btn-xs" onClick={() => setUi({ modal: 'cotizar' })} data-testid="btn-cotizar">
          {t('barra.cotizar')}
        </button>
      </div>
    </div>
  );
}
