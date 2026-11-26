import { steps } from '@/core/catalog';
import { useI18n } from '@/i18n';
import { usePrice, useSpecs } from '@/state/derived';
import { useStore } from '@/state/store';
import { Icon } from './Icon';
import { AnimatedNumber, StatusDot } from './primitives';

/**
 * Barra fija inferior del celular: precio y semáforo (abre Datos técnicos) a la izquierda,
 * "Siguiente" a la derecha. En el último paso, "Pedir cotización".
 */
export function MobileBar() {
  const { t, tx, money } = useI18n();
  const price = usePrice();
  const specs = useSpecs();
  const paso = useStore((s) => s.ui.paso);
  const hide = useStore((s) => s.ui.preciosOcultos);
  const setUi = useStore((s) => s.setUi);
  const idx = Math.max(0, steps.findIndex((s) => s.id === paso));
  const last = idx === steps.length - 1;
  return (
    <footer className="mbar" aria-label={t('barra.precio')}>
      <button type="button" className="mbar-price" onClick={() => setUi({ modal: 'tecnico' })} aria-label={`${t('tec.ver')}: ${t(`tec.resumen.${specs.level}`)}`} data-testid="mbar-tecnico">
        <span className="mbar-k">
          <StatusDot level={specs.level} />
          {hide ? t('barra.precioOculto') : t('barra.precio')}
        </span>
        <span className="mbar-v">{hide ? '—' : <span data-testid="precio-total"><AnimatedNumber value={price.totalUsd} format={(v) => money(v)} /></span>}</span>
        <span className="mbar-link">
          {t('tec.ver')} <Icon name="chevronDer" size={12} />
        </span>
      </button>
      {last ? (
        <button type="button" className="btn btn-primario mbar-go" onClick={() => setUi({ modal: 'cotizar' })} data-testid="btn-cotizar">
          {t('barra.cotizar')}
        </button>
      ) : (
        <button type="button" className="btn btn-primario mbar-go" onClick={() => setUi({ paso: steps[idx + 1].id })} data-testid="mbar-siguiente" aria-label={`${t('comun.siguiente')}: ${tx(steps[idx + 1].name)}`}>
          <span>{t('comun.siguiente')}</span>
          <Icon name="chevronDer" size={16} />
        </button>
      )}
    </footer>
  );
}
