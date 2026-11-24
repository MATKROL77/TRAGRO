import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { PRESETS } from '@/three/camera';
import { downloadCapture } from '@/three/capture';
import { Icon } from './Icon';
import { IconButton } from './primitives';

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/** Acción principal de cada tipo y si está disponible la lona. */
export function actionLabelKey(tipo: string, sider: boolean): string {
  if (tipo === 'furgon') return sider ? 'visor.accion.sider' : 'visor.accion.furgon';
  return `visor.accion.${tipo}`;
}

export function ViewerToolbar() {
  const { t } = useI18n();
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const cfg = useStore((s) => s.config);
  const anim = useStore((s) => s.anim);
  const toggleAnim = useStore((s) => s.toggleAnim);
  const setPreset = useStore((s) => s.setPreset);
  const preset = useStore((s) => s.camera.preset);
  const cams = usePopover();
  const more = usePopover();
  const [full, setFull] = useState(false);

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const active = (anim.accion ?? 0) > 0.5;
  const hasTarp = cfg.tipo === 'tolva' || (cfg.tipo === 'batea' && cfg.sel.cobertor === true);
  const hasLift = cfg.sel.ejeElevable === true;
  const tarpOpen = (anim.lona ?? 0) > 0.5;
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div className="toolbar" role="toolbar" aria-label={t('visor.camaras')}>
      <div className="pop-anchor" ref={cams.ref}>
        <button type="button" className={`tb-btn ${cams.open ? 'is-active' : ''}`} aria-haspopup="menu" aria-expanded={cams.open} onClick={() => cams.setOpen(!cams.open)} data-testid="tb-camaras">
          <Icon name="camara" size={18} />
          <span>{t('visor.camaras')}</span>
        </button>
        {cams.open ? (
          <div className="popover" role="menu" style={{ left: 0 }}>
            {PRESETS.map((p, i) => (
              <button key={p} type="button" role="menuitemradio" aria-checked={preset === p} className={preset === p ? 'is-on' : ''} data-cam={p} onClick={() => { setPreset(p); cams.setOpen(false); }}>
                {t(`visor.cam.${p}`)}
                <kbd>{i + 1}</kbd>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <span className="div" />
      <button type="button" className={`tb-btn ${ui.env === 'estudio' ? 'is-active' : ''}`} aria-pressed={ui.env === 'estudio'} onClick={() => setUi({ env: 'estudio' })} data-testid="tb-estudio">
        <Icon name="estudio" size={18} />
        <span>{t('visor.estudio')}</span>
      </button>
      <button type="button" className={`tb-btn ${ui.env === 'exterior' ? 'is-active' : ''}`} aria-pressed={ui.env === 'exterior'} onClick={() => setUi({ env: 'exterior' })} data-testid="tb-exterior">
        <Icon name="exterior" size={18} />
        <span>{t('visor.exterior')}</span>
      </button>
      <span className="div" />
      <button type="button" className="tb-btn is-accent" aria-pressed={active} onClick={() => toggleAnim('accion')} data-testid="tb-accion">
        <Icon name={active ? 'rebobinar' : 'play'} size={18} />
        <span>{active ? t('visor.detener') : t('visor.accion')}</span>
      </button>
      <div className="pop-anchor" ref={more.ref}>
        <IconButton icon="chevronAbajo" label={t(actionLabelKey(cfg.tipo, cfg.sel.variante === 'sider'))} aria-haspopup="menu" aria-expanded={more.open} onClick={() => more.setOpen(!more.open)} data-testid="tb-mas" />
        {more.open ? (
          <div className="popover" role="menu" style={{ right: 0 }}>
            <button type="button" role="menuitemcheckbox" aria-checked={active} className={active ? 'is-on' : ''} onClick={() => toggleAnim('accion')}>
              <Icon name="play" size={16} />
              {t(actionLabelKey(cfg.tipo, cfg.sel.variante === 'sider'))}
              <kbd>A</kbd>
            </button>
            {hasTarp ? (
              <button type="button" role="menuitemcheckbox" aria-checked={tarpOpen} className={tarpOpen ? 'is-on' : ''} onClick={() => toggleAnim('lona')} data-testid="tb-lona">
                <Icon name="lona" size={16} />
                {tarpOpen ? t('visor.accion.lonaCerrar') : t('visor.accion.lona')}
                <kbd>L</kbd>
              </button>
            ) : null}
            {hasLift ? (
              <button type="button" role="menuitemcheckbox" aria-checked={(anim.elevado ?? 1) > 0.5} className={(anim.elevado ?? 1) > 0.5 ? 'is-on' : ''} onClick={() => toggleAnim('elevado')}>
                <Icon name="eje" size={16} />
                {t('visor.accion.eje')}
              </button>
            ) : null}
            <button type="button" role="menuitemcheckbox" aria-checked={ui.luces} className={ui.luces ? 'is-on' : ''} onClick={() => setUi({ luces: !ui.luces })}>
              <Icon name="luz" size={16} />
              {t('visor.accion.luces')}
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={ui.tractor} className={ui.tractor ? 'is-on' : ''} onClick={() => setUi({ tractor: !ui.tractor })} data-testid="tb-tractor">
              <Icon name="camion" size={16} />
              {t('visor.accion.tractor')}
              <kbd>T</kbd>
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={ui.hotspots} className={ui.hotspots ? 'is-on' : ''} onClick={() => setUi({ hotspots: !ui.hotspots })}>
              <Icon name="punto" size={16} />
              {t('visor.hotspots')}
              <kbd>H</kbd>
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={ui.autoFoco} className={ui.autoFoco ? 'is-on' : ''} onClick={() => setUi({ autoFoco: !ui.autoFoco })}>
              <Icon name="foco" size={16} />
              {t('visor.autoFoco')}
            </button>
          </div>
        ) : null}
      </div>
      <span className="div" />
      <IconButton icon="descargar" label={t('visor.captura')} onClick={() => downloadCapture()} data-testid="tb-captura" />
      <IconButton icon="pantalla" label={t('visor.pantallaCompleta')} active={full ? true : undefined} className="solo-escritorio" onClick={toggleFull} />
    </div>
  );
}
