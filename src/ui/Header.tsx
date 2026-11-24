import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n/useT';
import { loadLang } from '../i18n';
import brand from '../config/brand.json';
import type { Lang } from '../domain/types';
import { IconCompare, IconGlobe, IconMore, IconReset, IconShare } from './icons';
import { shareCurrent } from './share';

export function LangUnitControls() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const units = useStore((s) => s.units);
  const setUnits = useStore((s) => s.setUnits);
  const changeLang = async (l: Lang) => {
    useStore.getState().setLangReady(false);
    try {
      await loadLang(l);
      useStore.getState().setLang(l);
      document.documentElement.lang = l;
    } finally {
      useStore.getState().setLangReady(true);
    }
  };
  return (
    <div className="lu">
      <label className="lu-lang">
        <IconGlobe size={16} />
        <span className="sr-only">{t('actions.language')}</span>
        <select className="select select-bare" value={lang} onChange={(e) => changeLang(e.target.value as Lang)} aria-label={t('actions.language')}>
          {(brand.languages as Lang[]).map((l) => (
            <option key={l} value={l}>{t(`langNames.${l}`)}</option>
          ))}
        </select>
      </label>
      <div className="seg seg-mini" role="radiogroup" aria-label={t('actions.units')}>
        {(['metric', 'imperial'] as const).map((u) => (
          <button key={u} type="button" role="radio" aria-checked={units === u} aria-label={t(`units.${u}`)} title={t(`units.${u}`)} className={units === u ? 'is-selected' : ''} onClick={() => setUnits(u)}>
            {u === 'metric' ? 'm · kg' : 'ft · lb'}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Header() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const feria = useStore((s) => s.feria);
  const hidePrices = useStore((s) => s.hidePrices);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('pointerdown', off);
    return () => window.removeEventListener('pointerdown', off);
  }, [menu]);
  const share = async () => {
    const ok = await shareCurrent();
    if (ok === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };
  return (
    <header className="header">
      <a className="brand" href="./" aria-label={brand.name}>
        <img src={`${import.meta.env.BASE_URL}brand/logo-umbral.svg`} alt="" width={34} height={34} />
        <span className="brand-text">
          <span className="brand-name">{brand.name}</span>
          <span className="brand-tag">{(brand.tagline as Record<string, string>)[lang]}</span>
        </span>
      </a>
      <span className="demo-badge">{t('app.demoBadge')}</span>
      <div className="header-right">
        <LangUnitControls />
        <button type="button" className="btn-icon btn-icon-plain hide-sm" onClick={() => { const st = useStore.getState(); if (!st.slots.A) st.saveSlot('A'); st.openModal('compare'); }} aria-label={t('actions.compare')} title={t('actions.compare')}>
          <IconCompare size={18} />
        </button>
        <button type="button" className="btn-icon btn-icon-plain" onClick={share} aria-label={t('actions.share')} title={copied ? t('actions.copied') : t('actions.share')}>
          <IconShare size={18} />
        </button>
        <div className="menu-wrap" ref={ref}>
          <button type="button" className="btn-icon" aria-haspopup="menu" aria-expanded={menu} aria-label={t('actions.menu')} onClick={() => setMenu(!menu)}>
            <IconMore />
          </button>
          {menu && (
            <div className="menu" role="menu">
              <button role="menuitem" type="button" onClick={() => { setMenu(false); share(); }}><IconShare size={16} /> {t('actions.copyLink')}</button>
              <button role="menuitem" type="button" onClick={() => { setMenu(false); useStore.getState().openModal('compare'); }}><IconCompare size={16} /> {t('actions.compare')}</button>
              <button role="menuitem" type="button" onClick={() => { setMenu(false); useStore.getState().toggle('hidePrices'); }}>{hidePrices ? t('actions.showPrices') : t('actions.hidePrices')}</button>
              <button role="menuitem" type="button" onClick={() => { setMenu(false); useStore.getState().reset(); }}><IconReset size={16} /> {t('actions.reset')}</button>
              {feria && <span className="menu-note">{t('feria.shortcuts')}</span>}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
