import { useI18n } from '@/i18n';
import { usePrice, useSpecs } from '@/state/derived';
import { useStore } from '@/state/store';
import { AnimatedNumber, Button, StatusDot } from './primitives';

export function BottomBar() {
  const { t, n, money, moneyIn } = useI18n();
  const price = usePrice();
  const specs = useSpecs();
  const setUi = useStore((s) => s.setUi);
  const hide = useStore((s) => s.ui.preciosOcultos);
  const moneda = useStore((s) => s.ui.moneda);
  const other = moneda === 'USD' ? 'ARS' : 'USD';
  return (
    <footer className="bar" aria-label={t('barra.precio')}>
      <div className="metric" aria-live="polite">
        <span className="k">{hide ? t('barra.precioOculto') : t('barra.precio')}</span>
        {hide ? (
          <span className="v">—</span>
        ) : (
          <span className="v" data-testid="precio-total">
            <AnimatedNumber value={price.totalUsd} format={(v) => money(v)} />
            <small className="solo-escritorio">{t('barra.equivale', { monto: moneyIn(price.totalUsd, other) })}</small>
          </span>
        )}
      </div>
      <span className="sep" />
      <div className="metric sec">
        <span className="k">
          <StatusDot level={specs.level} />
          {t('barra.cargaUtil')}
        </span>
        <span className="v" data-testid="carga-util">
          <AnimatedNumber value={specs.cargaUtilKg} format={(v) => `${n(v / 1000, 1)} t`} />
        </span>
      </div>
      <div className="metric sec">
        <span className="k">{t('barra.tara')}</span>
        <span className="v" data-testid="tara">
          <AnimatedNumber value={specs.taraKg} format={(v) => `${n(v / 1000, 2)} t`} />
        </span>
      </div>
      <span className="spacer" />
      {hide ? null : <p className="leyenda">{t('barra.leyenda')}</p>}
      <div className="cta">
        <Button size="lg" className="solo-escritorio" onClick={() => setUi({ modal: 'resumen' })} data-testid="btn-resumen">
          {t('barra.resumen')}
        </Button>
        <Button size="lg" variant="fantasma" className="solo-celular" icon="pdf" aria-label={t('barra.resumen')} onClick={() => setUi({ modal: 'resumen' })} />
        <Button size="lg" variant="primario" onClick={() => setUi({ modal: 'cotizar' })} data-testid="btn-cotizar">
          {t('barra.cotizar')}
        </Button>
      </div>
    </footer>
  );
}
