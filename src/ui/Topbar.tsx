import { brand } from '@/core/catalog';
import type { Lang } from '@/core/types';
import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { Button, IconButton, Segmented } from './primitives';

export function Topbar() {
  const { t, tx } = useI18n();
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const reset = useStore((s) => s.reset);
  const hasCompare = useStore((s) => !!s.compare.a || !!s.compare.b);
  return (
    <header className="topbar">
      <a className="brand" href={`https://${brand.contacto.web}`} target="_blank" rel="noreferrer" aria-label={brand.nombre} onClick={(e) => brand.contacto.web.endsWith('.example') && e.preventDefault()}>
        <img src={brand.logo} alt={brand.nombre} />
        <span className="lema">{tx(brand.lema)}</span>
      </a>
      {ui.vendedor ? <span className="pill-vendedor">{t('top.modoVendedor')}</span> : null}
      <span className="spacer" />
      <div className="acciones">
        {ui.vendedor ? (
          <>
            <IconButton icon={ui.preciosOcultos ? 'ojoNo' : 'ojo'} label={ui.preciosOcultos ? t('top.mostrarPrecios') : t('top.ocultarPrecios')} active={ui.preciosOcultos} onClick={() => setUi({ preciosOcultos: !ui.preciosOcultos })} data-testid="btn-precios" />
            <IconButton icon="teclado" label={t('top.atajos')} className="solo-escritorio" onClick={() => setUi({ modal: 'atajos' })} />
            <Button icon="reiniciar" className="solo-escritorio" onClick={() => window.confirm(t('vendedor.confirmarReinicio')) && reset()} data-testid="btn-reiniciar">
              {t('top.reiniciar')}
            </Button>
          </>
        ) : null}
        <span className="solo-escritorio">
          <Segmented<'USD' | 'ARS'> size="sm" label={t('top.moneda')} value={ui.moneda} onChange={(v) => setUi({ moneda: v })} options={[{ value: 'USD', label: 'US$' }, { value: 'ARS', label: 'AR$' }]} />
        </span>
        <Segmented<Lang> size="sm" label={t('top.idioma')} value={ui.lang} onChange={(v) => setUi({ lang: v })} options={[{ value: 'es', label: 'ES' }, { value: 'pt', label: 'PT' }]} />
        <IconButton icon="comparar" label={t('top.comparar')} active={hasCompare ? true : undefined} onClick={() => setUi({ modal: 'comparar' })} data-testid="btn-comparar" />
        <IconButton icon="compartir" label={t('top.compartir')} onClick={() => setUi({ modal: 'compartir' })} data-testid="btn-compartir" />
      </div>
    </header>
  );
}
