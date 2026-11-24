import { useEffect, useRef, useState } from 'react';
import { brand } from '@/core/catalog';
import type { Lang } from '@/core/types';
import { changeLang, HTML_LANG, LANG_NAMES, LANGS, useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { Icon } from './Icon';

/** Selector de idioma (desplegable) y de sistema de unidades (encabezado y modo embebido). */
export function LangUnitControls() {
  const { t, lang, units } = useI18n();
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="lu">
      <label className="lu-lang">
        <Icon name="globo" size={16} />
        <span className="sr-only">{t('top.idioma')}</span>
        <select className="select select-bare" value={lang} onChange={(e) => void changeLang(e.target.value as Lang)} aria-label={t('top.idioma')} data-testid="sel-idioma">
          {LANGS.map((l) => (
            <option key={l} value={l} lang={HTML_LANG[l]}>
              {LANG_NAMES[l]}
            </option>
          ))}
        </select>
      </label>
      <div className="seg seg-mini" role="radiogroup" aria-label={t('top.unidades')}>
        {(['metric', 'imperial'] as const).map((u) => (
          <button key={u} type="button" role="radio" aria-checked={units === u} aria-label={t(`top.unidades.${u}`)} title={t(`top.unidades.${u}`)} className={units === u ? 'is-on' : ''} onClick={() => setUi({ unidades: u })} data-testid={`unidades-${u}`}>
            {u === 'metric' ? 'm · kg' : 'ft · lb'}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Abre el comparador; si no hay nada guardado, la configuración actual queda como A. */
export function openCompare(): void {
  const st = useStore.getState();
  if (!st.compare.a) void import('@/three/capture').then(({ captureThumb }) => st.saveSnapshot('a', { config: st.config, thumb: captureThumb(), at: Date.now() }));
  st.setUi({ modal: 'comparar' });
}

export function Header() {
  const { t } = useI18n();
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const reset = useStore((s) => s.reset);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const off = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('pointerdown', off);
    document.addEventListener('keydown', off);
    return () => {
      document.removeEventListener('pointerdown', off);
      document.removeEventListener('keydown', off);
    };
  }, [menu]);
  const item = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  const demoWeb = brand.contacto.web.endsWith('.example');
  return (
    <header className="header">
      <a className="brand" href={demoWeb ? './' : `https://${brand.contacto.web}`} aria-label={brand.nombre} onClick={(e) => demoWeb && e.preventDefault()}>
        <img src={brand.marca} alt="" width={34} height={22} />
        <span className="brand-text">
          <span className="brand-name">{brand.nombre}</span>
          {brand.firma ? <span className="brand-tag">{brand.firma}</span> : null}
        </span>
      </a>
      <span className="demo-badge">{t('top.demo')}</span>
      {ui.vendedor ? <span className="pill-vendedor">{t('top.modoVendedor')}</span> : null}
      <div className="header-right">
        <LangUnitControls />
        <button type="button" className="btn-icon btn-icon-plain hide-sm" onClick={() => openCompare()} aria-label={t('top.comparar')} title={t('top.comparar')} data-testid="top-comparar">
          <Icon name="comparar" size={18} />
        </button>
        <button type="button" className="btn-icon btn-icon-plain hide-sm" onClick={() => setUi({ modal: 'compartir' })} aria-label={t('top.compartir')} title={t('top.compartir')} data-testid="btn-compartir">
          <Icon name="compartir" size={18} />
        </button>
        <div className="menu-wrap" ref={ref}>
          <button type="button" className="btn-icon btn-icon-plain" aria-haspopup="menu" aria-expanded={menu} aria-label={t('top.menu')} title={t('top.menu')} onClick={() => setMenu(!menu)} data-testid="btn-menu">
            <Icon name="puntos" />
          </button>
          {menu ? (
            <div className="menu" role="menu">
              <button type="button" role="menuitem" onClick={item(() => setUi({ modal: 'compartir' }))} data-testid="menu-compartir">
                <Icon name="compartir" size={16} />
                {t('top.compartir')}
              </button>
              <button type="button" role="menuitem" onClick={item(() => openCompare())} data-testid="menu-comparar">
                <Icon name="comparar" size={16} />
                {t('top.comparar')}
              </button>
              <button type="button" role="menuitem" onClick={item(() => setUi({ moneda: ui.moneda === 'USD' ? 'ARS' : 'USD' }))} data-testid="btn-moneda">
                <Icon name="moneda" size={16} />
                {ui.moneda === 'USD' ? t('top.verEnPesos') : t('top.verEnDolares')}
              </button>
              <button type="button" role="menuitem" onClick={item(() => setUi({ preciosOcultos: !ui.preciosOcultos }))} data-testid="btn-precios">
                <Icon name={ui.preciosOcultos ? 'ojo' : 'ojoNo'} size={16} />
                {ui.preciosOcultos ? t('top.mostrarPrecios') : t('top.ocultarPrecios')}
              </button>
              <button type="button" role="menuitem" onClick={item(() => window.confirm(t('vendedor.confirmarReinicio')) && reset())} data-testid="btn-reiniciar">
                <Icon name="reiniciar" size={16} />
                {t('top.reiniciar')}
              </button>
              <button type="button" role="menuitem" className="hide-sm" onClick={item(() => setUi({ modal: 'atajos' }))}>
                <Icon name="teclado" size={16} />
                {t('top.atajos')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
