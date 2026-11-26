import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { PRESETS } from '@/three/camera';
import { downloadCapture } from '@/three/capture';
import { Icon } from './Icon';
import { requestVehicle } from '@/three/vehicleBus';

const RUTA_CAMS = ['seguimiento', 'lateral', 'dron'] as const;
const RUTA_CAM_LABEL: Record<string, string> = { seguimiento: 'visor.cam.seguimiento', lateral: 'visor.cam.lateralRuta', dron: 'visor.cam.dron' };
/** Estados de transición: el botón queda deshabilitado y dice qué está pasando. */
const BUSY_LABEL: Record<string, string> = { FRENANDO: 'visor.ruta.frenando', ABRIENDO: 'visor.ruta.abriendo', CERRANDO: 'visor.ruta.cerrando' };

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

/** Pantalla completa SOLO del visor 3D (el equipo), no de toda la página. */
export function toggleViewerFullscreen(): void {
  const stage = document.querySelector<HTMLElement>('.stage');
  if (!stage) return;
  if (document.fullscreenElement === stage) void document.exitFullscreen?.();
  else void stage.requestFullscreen?.().catch(() => undefined);
}

/** Barra única arriba al centro del visor: cámaras | escenario | acción principal y animaciones | más, captura y pantalla completa. */
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
    const on = () => setFull(!!document.fullscreenElement && document.fullscreenElement.classList.contains('stage'));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const ruta = ui.env === 'ruta';
  const vState = ui.vehiculo;
  const busy = ruta && vState in BUSY_LABEL;
  const active = ruta ? vState === 'ABIERTO' : (anim.accion ?? 0) > 0.5;
  const hasTarp = cfg.tipo === 'tolva' || (cfg.tipo === 'batea' && cfg.sel.cobertor === true);
  const hasLift = cfg.sel.ejeElevable === true;
  const tarpOpen = (anim.lona ?? 0) > 0.5;
  const lifted = (anim.elevado ?? 1) > 0.5;
  const actionLabel = t(actionLabelKey(cfg.tipo, cfg.sel.variante === 'sider'));
  const tarpLabel = tarpOpen ? t('visor.accion.lonaCerrar') : t('visor.accion.lona');

  return (
    <div className="topbar" role="toolbar" aria-label={t('visor.camaras')}>
      <div className="pop-anchor" ref={cams.ref}>
        <button type="button" className="tb-btn" aria-haspopup="menu" aria-expanded={cams.open} onClick={() => { cams.setOpen(!cams.open); more.setOpen(false); }} data-testid="tb-camaras">
          <Icon name="camara" size={18} />
          <span className="tb-label">{t('visor.camaras')}</span>
        </button>
        {cams.open && ruta ? (
          <div className="popover pop-down" role="menu">
            {RUTA_CAMS.map((p, i) => (
              <button key={p} type="button" role="menuitemradio" aria-checked={ui.rutaCam === p} className={ui.rutaCam === p ? 'is-on' : ''} data-cam={p} onClick={() => { setUi({ rutaCam: p }); cams.setOpen(false); }}>
                {t(RUTA_CAM_LABEL[p])}
                <kbd>{i + 1}</kbd>
              </button>
            ))}
          </div>
        ) : null}
        {cams.open && !ruta ? (
          <div className="popover pop-down" role="menu">
            {PRESETS.map((p, i) => (
              <button key={p} type="button" role="menuitemradio" aria-checked={preset === p} className={preset === p ? 'is-on' : ''} data-cam={p} onClick={() => { setPreset(p); cams.setOpen(false); }}>
                {t(`visor.cam.${p}`)}
                <kbd>{i + 1}</kbd>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <span className="tb-sep" aria-hidden="true" />
      <div className="tb-scenes" role="group" aria-label={t('visor.escenas')}>
        <button type="button" aria-pressed={ui.env === 'estudio'} className={`tb-btn ${ui.env === 'estudio' ? 'is-sel' : ''}`} onClick={() => setUi({ env: 'estudio', tractor: false })} data-testid="tb-estudio">
          {t('visor.estudio')}
        </button>
        <button type="button" aria-pressed={ui.env === 'exterior'} aria-busy={ui.cargandoEntorno && ui.env === 'exterior'} className={`tb-btn ${ui.env === 'exterior' ? 'is-sel' : ''} ${ui.cargandoEntorno && ui.env === 'exterior' ? 'is-loading' : ''}`} onClick={() => setUi({ env: 'exterior', tractor: false })} data-testid="tb-exterior">
          {t('visor.exterior')}
        </button>
        <button type="button" aria-pressed={ruta} aria-busy={ui.cargandoEntorno && ruta} className={`tb-btn ${ruta ? 'is-sel' : ''} ${ui.cargandoEntorno && ruta ? 'is-loading' : ''}`} onClick={() => setUi({ env: 'ruta', tractor: true })} data-testid="tb-ruta">
          {t('visor.ruta')}
        </button>
      </div>
      <button
        type="button"
        className={`tb-btn tb-primary ${active ? 'is-on' : ''}`}
        aria-pressed={active}
        aria-disabled={busy}
        disabled={busy}
        title={actionLabel}
        onClick={() => (ruta ? requestVehicle('accion') : toggleAnim('accion'))}
        data-testid="tb-accion"
        data-estado={ruta ? vState : undefined}
      >
        <Icon name={active ? 'rebobinar' : 'play'} size={16} />
        <span className="tb-label">{busy ? t(BUSY_LABEL[vState]) : active ? t('visor.detener') : t('visor.accion')}</span>
      </button>
      {ruta && vState === 'DETENIDO' && ui.vehiculoQuieto ? (
        <button type="button" className="tb-btn" onClick={() => requestVehicle('arrancar')} data-testid="tb-arrancar">
          <Icon name="camion" size={16} />
          <span className="tb-label">{t('visor.ruta.arrancar')}</span>
        </button>
      ) : null}
      {ruta ? (
        <button type="button" className={`tb-btn ${ui.manejar ? 'is-sel' : ''}`} aria-pressed={ui.manejar} title={t('visor.ruta.manejarAyuda')} onClick={() => setUi({ manejar: !ui.manejar })} data-testid="tb-manejar">
          <Icon name="eje" size={16} />
          <span className="tb-label">{t('visor.ruta.manejar')}</span>
        </button>
      ) : null}
      {hasTarp && !ruta ? (
        <button type="button" className={`tb-btn tb-icon ${tarpOpen ? 'is-sel' : ''}`} aria-pressed={tarpOpen} aria-label={tarpLabel} title={tarpLabel} onClick={() => toggleAnim('lona')} data-testid="tb-lona">
          <Icon name="lona" size={18} />
          <span className="tb-label tb-label-wide">{tarpLabel}</span>
        </button>
      ) : null}
      {hasLift && !ruta ? (
        <button type="button" className={`tb-btn tb-icon ${lifted ? 'is-sel' : ''}`} aria-pressed={lifted} aria-label={t('visor.accion.eje')} title={t('visor.accion.eje')} onClick={() => toggleAnim('elevado')} data-testid="tb-eje">
          <Icon name="eje" size={18} />
          <span className="tb-label tb-label-wide">{t('visor.accion.eje')}</span>
        </button>
      ) : null}
      <span className="tb-sep" aria-hidden="true" />
      <div className="pop-anchor" ref={more.ref}>
        <button type="button" className="tb-btn tb-icon" aria-haspopup="menu" aria-expanded={more.open} aria-label={t('visor.mas')} title={t('visor.mas')} onClick={() => { more.setOpen(!more.open); cams.setOpen(false); }} data-testid="tb-mas">
          <Icon name="puntos" size={18} />
        </button>
        {more.open ? (
          <div className="popover pop-down pop-right" role="menu">
            <button type="button" role="menuitemcheckbox" aria-checked={ui.tractor} disabled={ruta} className={ui.tractor ? 'is-on' : ''} onClick={() => setUi({ tractor: !ui.tractor })} data-testid="tb-tractor">
              <Icon name="camion" size={16} />
              {t('visor.accion.tractor')}
              <kbd>T</kbd>
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={ui.luces} className={ui.luces ? 'is-on' : ''} onClick={() => setUi({ luces: !ui.luces })}>
              <Icon name="luz" size={16} />
              {t('visor.accion.luces')}
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
      <button type="button" className="tb-btn tb-icon hide-sm" aria-label={t('visor.captura')} title={t('visor.captura')} onClick={() => void downloadCapture()} data-testid="tb-captura">
        <Icon name="imagen" size={18} />
      </button>
      <button type="button" className={`tb-btn tb-icon hide-sm ${full ? 'is-sel' : ''}`} aria-pressed={full} aria-label={full ? t('visor.salirPantallaCompleta') : t('visor.pantallaCompleta')} title={full ? t('visor.salirPantallaCompleta') : t('visor.pantallaCompleta')} onClick={toggleViewerFullscreen} data-testid="tb-pantalla">
        <Icon name="pantalla" size={18} />
      </button>
    </div>
  );
}
