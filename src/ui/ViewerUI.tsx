import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useProgress } from '@react-three/drei';
import { useStore, type CamPreset, type SceneId } from '../state/store';
import { useT } from '../i18n/useT';
import { useFmt } from './format';
import { runtime, touchInteraction } from '../three/runtime';
import { captureHiRes, captureState } from '../three/capture';
import { refineState } from '../render-kit/refine';
import { configNumber } from '../domain/url';
import { IconCamera, IconClose, IconFold, IconFull, IconInfo, IconMore, IconPause, IconPlay, IconShot, IconUnit } from './icons';
import { usePerformance } from './hooks';
import { getCrop } from '../domain/agronomy';
import { catalog, getModel, rowsRange } from '../domain/catalog';
import type { Notice } from '../domain/types';

const PRESETS: CamPreset[] = ['front34', 'side', 'rear', 'top', 'rowUnit', 'hoppers', 'ground'];

export function ViewerToolbar() {
  const t = useT();
  const scene = useStore((s) => s.scene);
  const pose = useStore((s) => s.pose);
  const sowing = useStore((s) => s.sowing);
  const detail = useStore((s) => s.detail);
  const showTractor = useStore((s) => s.showTractor);
  const showHotspots = useStore((s) => s.showHotspots);
  const autoFocus = useStore((s) => s.autoFocus);
  const st = useStore.getState;
  const [camOpen, setCamOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [fs, setFs] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  useEffect(() => {
    if (!camOpen && !moreOpen) return;
    const off = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) {
        setCamOpen(false);
        setMoreOpen(false);
      }
    };
    window.addEventListener('pointerdown', off);
    return () => window.removeEventListener('pointerdown', off);
  }, [camOpen, moreOpen]);

  const fold = () => {
    const next = pose === 'work' ? 'transport' : 'work';
    st().setPose(next);
    if (scene === 'field' && next === 'transport') st().setScene('studio');
    touchInteraction();
    // encuadra las dos posiciones mientras se mueve y reencuadra al terminar
    st().requestCam('front34');
  };
  const fullscreen = () => {
    const el = document.querySelector('.viewer') as HTMLElement | null;
    if (!document.fullscreenElement) el?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  const shot = async () => {
    const url = await captureHiRes(2);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${configNumber(st().config)}.png`;
    a.click();
  };
  const scenes: SceneId[] = ['studio', 'field', 'road'];
  const isRoad = scene === 'road';
  const playLabel = sowing ? t('toolbar.stopSow') : isRoad ? t('toolbar.drive') : t('toolbar.sow');
  const foldLabel = pose === 'work' ? t('toolbar.fold') : t('toolbar.unfold');
  const detailLabel = detail ? t('toolbar.exitDetail') : t('toolbar.detail');
  return (
    <div className="topbar" ref={wrap} role="toolbar" aria-label={t('toolbar.cameras')}>
      <div className="pop-wrap">
        <button type="button" className="tb-btn" aria-haspopup="menu" aria-expanded={camOpen} aria-label={t('toolbar.cameras')} title={t('toolbar.cameras')} onClick={() => { setCamOpen(!camOpen); setMoreOpen(false); }}>
          <IconCamera size={17} />
          <span className="tb-label">{t('toolbar.cameras')}</span>
        </button>
        {camOpen && (
          <div className="pop pop-up" role="menu">
            {PRESETS.filter((p) => p !== 'ground' || scene === 'field').map((p) => (
              <button key={p} role="menuitem" type="button" onClick={() => { st().requestCam(p); setCamOpen(false); touchInteraction(); }}>
                {t(`toolbar.cam.${p}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="tb-sep" aria-hidden />
      <div className="tb-scenes" role="radiogroup" aria-label={t('toolbar.scenes')}>
        {scenes.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={scene === s && !detail} className={`tb-btn${scene === s && !detail ? ' is-sel' : ''}`} onClick={() => { st().setDetail(false); st().setScene(s); }}>
            {t(`toolbar.env.${s}`)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`tb-btn tb-primary${sowing ? ' is-on' : ''}`}
        onClick={() => st().setSowing(!sowing)}
        disabled={isRoad ? pose !== 'transport' : pose === 'transport'}
        aria-label={playLabel}
        title={playLabel}
      >
        {sowing ? <IconPause size={16} /> : <IconPlay size={16} />}
        <StableLabel className="tb-label" current={playLabel} all={[t('toolbar.stopSow'), t('toolbar.drive'), t('toolbar.sow')]} />
      </button>
      <button type="button" className={`tb-btn${pose === 'transport' ? ' is-sel' : ''}`} onClick={fold} title={foldLabel} aria-label={foldLabel}>
        <IconFold size={17} />
        <StableLabel className="tb-label tb-label-wide" current={foldLabel} all={[t('toolbar.fold'), t('toolbar.unfold')]} />
      </button>
      <button type="button" className={`tb-btn${detail ? ' is-sel' : ''}`} onClick={() => st().setDetail(!detail)} title={detailLabel} aria-label={detailLabel}>
        <IconUnit size={17} />
        <StableLabel className="tb-label tb-label-wide" current={detailLabel} all={[t('toolbar.detail'), t('toolbar.exitDetail')]} />
      </button>
      <span className="tb-sep" aria-hidden />
      <div className="pop-wrap">
        <button type="button" className="tb-btn tb-icon" aria-haspopup="menu" aria-expanded={moreOpen} aria-label={t('toolbar.more')} title={t('toolbar.more')} onClick={() => { setMoreOpen(!moreOpen); setCamOpen(false); }}>
          <IconMore size={17} />
        </button>
        {moreOpen && (
          <div className="pop pop-up pop-right" role="menu">
            <label className="pop-check"><input type="checkbox" checked={showTractor} onChange={() => st().toggle('showTractor')} /> {t('toolbar.tractor')}</label>
            <label className="pop-check"><input type="checkbox" checked={showHotspots} onChange={() => st().toggle('showHotspots')} /> {t('toolbar.hotspots')}</label>
            <label className="pop-check"><input type="checkbox" checked={autoFocus} onChange={() => st().toggle('autoFocus')} /> {t('toolbar.autoFocus')}</label>
          </div>
        )}
      </div>
      <button type="button" className="tb-btn tb-icon hide-sm" aria-label={t('toolbar.screenshot')} title={t('toolbar.screenshot')} onClick={shot}>
        <IconShot size={17} />
      </button>
      <button type="button" className="tb-btn tb-icon hide-sm" aria-label={fs ? t('toolbar.exitFullscreen') : t('toolbar.fullscreen')} title={fs ? t('toolbar.exitFullscreen') : t('toolbar.fullscreen')} onClick={fullscreen}>
        <IconFull size={17} />
      </button>
      <PoseBadge />
    </div>
  );
}

export function NoticeToast() {
  const t = useT();
  const notice = useStore((s) => s.notice);
  const dismiss = useStore((s) => s.dismissNotice);
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(dismiss, 7000);
    return () => window.clearTimeout(id);
  }, [notice, dismiss]);
  const f = useFmt();
  const config = useStore((s) => s.config);
  const label = (g: string, o: string) => (g === 'rows' ? o : t(`options.${g}.${o}.name`));
  const why = (n: Notice) => {
    if (n.ruleId !== 'rowsRange') return t(`rules.${n.ruleId}`);
    const m = getModel(config.model);
    const r = rowsRange(m, config.spacingCm);
    if (Number(n.to) === r.max && r.max < m.rowsMax) {
      return t('rules.rowsRangeWidth', { spacing: f.q(config.spacingCm, 'lengthCm', 1), max: r.max, model: t(`models.${m.id}.name`), width: f.q(m.maxWidthM, 'length', 1) });
    }
    return t('rules.rowsRange');
  };
  return (
    <div className="toast-zone" aria-live="polite">
      <AnimatePresence>
        {notice && (
          <motion.div key={notice.id} className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <div className="toast-head">
              <IconInfo size={18} /> <strong>{t('rules.noticeTitle')}</strong>
              <button type="button" className="btn-icon btn-icon-sm" aria-label={t('actions.close')} onClick={dismiss}><IconClose size={16} /></button>
            </div>
            <ul>
              {notice.items.map((n, i) => (
                <li key={i}>
                  <span>{why(n)}</span>
                  <span className="toast-change">{t('rules.changed', { group: n.group === 'rows' ? t('rows.count') : t(`groups.${n.group}.name`), from: label(n.group, n.from), to: label(n.group, n.to) })}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const ROW_UNIT_PARTS = ['coulter', 'discs', 'gauge', 'meter', 'closing'] as const;
const HOTSPOT_STEP: Record<string, string> = { rowUnit: 'rowUnit', coulter: 'rowUnit', discs: 'rowUnit', gauge: 'rowUnit', closing: 'rowUnit', meter: 'tech', hoppers: 'hoppers', transport: 'transport', monitor: 'tech' };

function goToStep(stepId: string, setHotspot: (id: string | null) => void) {
  const st = useStore.getState();
  const i = Math.max(0, catalog.steps.findIndex((s) => s.id === stepId));
  setHotspot(null);
  st.setPanelTab('config');
  st.setStep(i);
  const f = catalog.steps[i].focus;
  if (f) st.focus(f);
}

export function HotspotCard() {
  const t = useT();
  const id = useStore((s) => s.hotspot);
  const setHotspot = useStore((s) => s.setHotspot);
  return (
    <AnimatePresence>
      {id && (
        <motion.aside key={id} className="hs-card" role="dialog" aria-label={t(`hotspots.${id}.title`)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
          <button type="button" className="btn-icon btn-icon-sm hs-close" aria-label={t('actions.close')} onClick={() => setHotspot(null)}><IconClose size={16} /></button>
          <h3>{t(`hotspots.${id}.title`)}</h3>
          {id === 'rowUnit' ? (
            <dl className="hs-list">
              {ROW_UNIT_PARTS.map((p) => (
                <div key={p}>
                  <dt>{t(`hotspots.${p}.title`)}</dt>
                  <dd>{t(`hotspots.${p}.body`)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>{t(`hotspots.${id}.body`)}</p>
          )}
          <div className="hs-actions">
            {id === 'rowUnit' && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => { setHotspot(null); useStore.getState().setDetail(true); }}>{t('toolbar.detail')}</button>
            )}
            <button type="button" className="btn btn-accent btn-xs" onClick={() => goToStep(HOTSPOT_STEP[id] ?? 'model', setHotspot)}>
              {t('hotspots.configure', { step: t(`steps.${HOTSPOT_STEP[id] ?? 'model'}.name`) })}
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/** Panel flotante en vivo durante la siembra (lee el estado por frame cada 250 ms). */
export function SimPanel() {
  const t = useT();
  const f = useFmt();
  const sowing = useStore((s) => s.sowing);
  const scene = useStore((s) => s.scene);
  const config = useStore((s) => s.config);
  const field = useStore((s) => s.field);
  const perf = usePerformance();
  const [, force] = useState(0);
  useEffect(() => {
    if (scene !== 'field') return;
    const id = window.setInterval(() => force((x) => x + 1), 250);
    return () => window.clearInterval(id);
  }, [scene]);
  if (scene !== 'field') return null;
  const speedKmh = runtime.speed * 3.6;
  const haH = (perf.widthM * speedKmh * field.efficiency) / 10;
  const sc = config.selections.sectionControl === 'on';
  const rows = config.rows;
  const crop = getCrop(field.crop);
  const saving = runtime.sim.headlandPct;
  const seedsSaved = (runtime.sim.savedM2 * perf.seedsPerHa) / 10000;
  return (
    <div className={`sim${sowing ? '' : ' is-paused'}`}>
      <div className="sim-kpis">
        <div><span>{t('sim.speed')}</span><strong>{f.q(speedKmh, 'speed', 1)}</strong></div>
        <div><span>{t('sim.haH')}</span><strong>{f.q(haH, 'areaRate', 2)}</strong></div>
        <div><span>{t('sim.seedsPerM')}</span><strong><span className="seed-dot" style={{ background: crop.color }} aria-hidden /> {f.n(f.conv(field.seedsPerM, 'perLength'), 1)}</strong></div>
        <div><span>{t('sim.rowsActive')}</span><strong>{runtime.sim.activeRows || rows}/{rows}</strong></div>
      </div>
      <div className="sim-rows" aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className={runtime.rowOn[i] ? 'on' : 'off'} />
        ))}
      </div>
      <div className={`sim-section ${sc ? 'ok' : 'warn'}`}>
        {runtime.sim.headlandActive && <strong>{t('sim.headland')} · </strong>}
        {sc ? (
          <span>
            {t('sim.sectionOn')}
            {runtime.sim.headlandActive && (
              <>
                {' · '}
                {t('sim.saving')}: <strong>{f.n(saving * 100, 0)} %</strong>
              </>
            )}
            {seedsSaved > 0 && <> · <strong>{f.n(seedsSaved, 0)}</strong> {t('perf.seedsPerHa').split(' ')[0].toLowerCase()} ✓</>}
          </span>
        ) : (
          <span>
            {runtime.sim.overlapM2 > 0 ? `${t('sim.sectionOff')} · ${t('sim.overlap')}: ${f.q(runtime.sim.overlapM2 / 10000, 'area', 2)}` : t('sim.tryIt')}
          </span>
        )}
      </div>
    </div>
  );
}

export function DetailLegend() {
  const t = useT();
  const detail = useStore((s) => s.detail);
  const exploded = useStore((s) => s.exploded);
  const setExploded = useStore((s) => s.setExploded);
  if (!detail) return null;
  return (
    <div className="detail-legend">
      <strong>{t('detail.title')}</strong>
      <span className="muted small">{t('detail.subtitle')}</span>
      <button type="button" className={`btn btn-secondary btn-xs${exploded ? ' is-sel' : ''}`} aria-pressed={exploded} onClick={() => setExploded(!exploded)}>
        {exploded ? t('toolbar.assemble') : t('toolbar.explode')}
      </button>
    </div>
  );
}

/** Texto de botón con el ancho del más largo de sus estados (la barra no se mueve al cambiar). */
function StableLabel({ current, all, className }: { current: string; all: string[]; className?: string }) {
  return (
    <span className={`stable ${className ?? ''}`}>
      {all.map((x) => (
        <span key={x} className="stable-ghost" aria-hidden>{x}</span>
      ))}
      <span className="stable-cur">{current}</span>
    </span>
  );
}

/** Barra de progreso mientras una captura espera la imagen refinada (tope 4 s). */
export function CaptureProgress() {
  const t = useT();
  const [p, setP] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      setP(captureState.busy && (refineState.active || refineState.force) ? Math.min(1, refineState.samples / Math.max(1, refineState.target)) : null);
    }, 120);
    return () => window.clearInterval(id);
  }, []);
  if (p === null) return null;
  return (
    <div className="capture-progress" role="progressbar" aria-label={t('toolbar.refining')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
      <span>{t('toolbar.refining')}</span>
      <div className="capture-progress-bar"><i style={{ width: `${p * 100}%` }} /></div>
    </div>
  );
}

/** Indicador mientras la máquina se pliega/despliega (la animación tarda unos segundos). */
export function PoseBadge() {
  const t = useT();
  const pose = useStore((s) => s.pose);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = runtime.model?.state.poseT ?? (pose === 'transport' ? 1 : 0);
      const target = pose === 'transport' ? 1 : 0;
      setMoving(Math.abs(p - target) > 0.01);
    }, 150);
    return () => window.clearInterval(id);
  }, [pose]);
  if (!moving) return null;
  return (
    <div className="pose-badge" role="status">
      <span className="spinner" aria-hidden /> {t(pose === 'transport' ? 'toolbar.folding' : 'toolbar.unfolding')}
    </div>
  );
}

/** Pantalla de carga con silueta y progreso real (descarga de HDRI y texturas). */
export function LoadingScreen() {
  const t = useT();
  const ready = useStore((s) => s.viewerReady);
  const { progress, active } = useProgress();
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (ready) {
      const id = window.setTimeout(() => setGone(true), 600);
      return () => window.clearTimeout(id);
    }
  }, [ready]);
  if (gone) return null;
  const pct = ready ? 100 : Math.max(8, Math.min(96, active ? progress : 60));
  return (
    <div className={`loader${ready ? ' is-done' : ''}`} role="status" aria-live="polite">
      <img className="loader-poster" src={`${import.meta.env.BASE_URL}poster.jpg`} alt="" aria-hidden decoding="async" onLoad={(e) => e.currentTarget.setAttribute('data-ok', '')} onError={(e) => (e.currentTarget.style.display = 'none')} />
      <svg className="loader-svg" viewBox="0 0 320 120" aria-hidden>
        <defs>
          <clipPath id="fillclip">
            <rect x="0" y="0" width={(320 * pct) / 100} height="120" />
          </clipPath>
        </defs>
        <g className="loader-sil">
          <SeederSilhouette />
        </g>
        <g className="loader-fill" clipPath="url(#fillclip)">
          <SeederSilhouette />
        </g>
      </svg>
      <div className="loader-bar"><span style={{ width: `${pct}%` }} /></div>
      <span className="loader-text">{t('app.loading')} {Math.round(pct)} %</span>
    </div>
  );
}

function SeederSilhouette() {
  return (
    <g fill="currentColor">
      <rect x="110" y="18" width="100" height="34" rx="6" />
      <path d="M118 52h84l-20 16h-44z" />
      <rect x="20" y="70" width="280" height="9" rx="3" />
      {Array.from({ length: 12 }, (_, i) => (
        <g key={i}>
          <rect x={27 + i * 23} y="79" width="6" height="18" rx="2" />
          <circle cx={30 + i * 23} cy="104" r="9" />
        </g>
      ))}
      <path d="M150 74l-110 -2 -24 6 2 4 22 -4z" opacity="0.8" />
    </g>
  );
}

export function NoWebGL() {
  const t = useT();
  return (
    <div className="nowebgl" role="note">
      <svg viewBox="0 0 320 120" className="loader-svg" aria-hidden>
        <g className="loader-fill"><SeederSilhouette /></g>
      </svg>
      <h2>{t('app.noWebglTitle')}</h2>
      <p>{t('app.noWebglBody')}</p>
    </div>
  );
}

