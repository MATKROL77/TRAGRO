import { useState } from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n/useT';
import { useFmt } from './format';
import { usePerformance, useTransportCheck } from './hooks';
import { agronomy, seedsPerHa, seedsPerMFromHa } from '../domain/agronomy';
import { toMetric } from '../domain/units';
import { transportDef, type Level } from '../domain/transport';
import { IconChart, IconChevron } from './icons';

function Light({ level }: { level: Level }) {
  return <span className={`light light-${level}`} aria-hidden />;
}

export function TransportCheckView({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const f = useFmt();
  const chk = useTransportCheck();
  const profile = useStore((s) => s.transportProfile);
  const setProfile = useStore((s) => s.setTransportProfile);
  const rows: { k: string; d: typeof chk.width }[] = [
    { k: 'width', d: chk.width },
    { k: 'height', d: chk.height },
    { k: 'length', d: chk.length },
  ];
  return (
    <div className="tcheck">
      <div className="tcheck-head">
        <Light level={chk.level} />
        <strong>{t('transport.title')}</strong>
        <span className="muted small">· {t(`transport.mode.${chk.mode}`)}</span>
      </div>
      <dl className="tcheck-rows">
        {rows.map(({ k, d }) => (
          <div key={k} className="tcheck-row">
            <dt>
              <Light level={d.level} /> {t(`transport.${k}`)}
            </dt>
            <dd>
              <strong>{f.q(d.value, 'length', 2)}</strong>
              {!compact && <span className="muted small"> {t('transport.limit', { general: f.q(d.general, 'length', 2), special: f.q(d.special, 'length', 2) })}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className={`tcheck-msg msg-${chk.level}`}>{t(`transport.${chk.level}`)}</p>
      {!compact && (
        <>
          <label className="field-inline">
            <span className="muted small">{t('transport.profile')}</span>
            <select className="select" value={profile} onChange={(e) => setProfile(e.target.value)}>
              {transportDef.profiles.map((p) => (
                <option key={p.id} value={p.id}>{t(`transport.profiles.${p.id}`)}</option>
              ))}
            </select>
          </label>
          <p className="muted tiny">{t('transport.disclaimer')}</p>
        </>
      )}
    </div>
  );
}

function Slider({ id, label, value, min, max, step, onChange, display }: { id: string; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display: string }) {
  return (
    <div className="slider">
      <label htmlFor={id} className="slider-label">
        <span>{label}</span>
        <output>{display}</output>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
}

export function PerformancePanel({ collapsible }: { collapsible: boolean }) {
  const t = useT();
  const f = useFmt();
  const p = usePerformance();
  const field = useStore((s) => s.field);
  const setField = useStore((s) => s.setField);
  const setCrop = useStore((s) => s.setCrop);
  const config = useStore((s) => s.config);
  const [open, setOpen] = useState(!collapsible);
  const [more, setMore] = useState(false);
  const spacingM = config.spacingCm / 100;
  const crop = agronomy.crops.find((c) => c.id === field.crop)!;
  const perHa = seedsPerHa(field.seedsPerM, spacingM);
  const perLenUnit = 'perLength' as const;
  return (
    <section className={`perf${open ? ' is-open' : ''}`} aria-label={t('perf.title')}>
      <button type="button" className="perf-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <IconChart size={18} />
        <span className="perf-title">{t('perf.title')}</span>
        <span className="perf-kpis">
          <span><strong>{f.q(p.haPerHour, 'areaRate', 2)}</strong></span>
          <span className="sep">·</span>
          <span><strong>{f.q(p.haPerDay, 'area', 0)}</strong> <span className="muted">{t('perf.haDay').toLowerCase()}</span></span>
        </span>
        <span className={`chev${open ? ' up' : ''}`}><IconChevron size={16} /></span>
      </button>
      {open && (
        <div className="perf-body">
          <div className="kpi-grid">
            <div className="kpi"><span>{t('perf.width')}</span><strong>{f.q(p.widthM, 'length', 2)}</strong></div>
            <div className="kpi"><span>{t('perf.haH')}</span><strong>{f.q(p.haPerHour, 'areaRate', 2)}</strong></div>
            <div className="kpi"><span>{t('perf.haDay')}</span><strong>{f.q(p.haPerDay, 'area', 0)}</strong></div>
            <div className="kpi"><span>{t('perf.hp')}</span><strong>{p.hp.min}–{p.hp.max} {t('perf.hpUnit')}</strong></div>
          </div>
          <h3 className="sub">{t('perf.inputs')}</h3>
          <Slider id="speed" label={t('perf.speed')} value={field.speedKmh} min={agronomy.speed.min} max={agronomy.speed.max} step={agronomy.speed.step} onChange={(v) => setField({ speedKmh: v })} display={f.q(field.speedKmh, 'speed', 1)} />
          <Slider id="eff" label={t('perf.efficiency')} value={field.efficiency} min={agronomy.efficiency.min} max={agronomy.efficiency.max} step={agronomy.efficiency.step} onChange={(v) => setField({ efficiency: v })} display={`${f.n(field.efficiency * 100, 0)} %`} />
          <Slider id="hours" label={t('perf.hours')} value={field.hoursPerDay} min={agronomy.hoursPerDay.min} max={agronomy.hoursPerDay.max} step={agronomy.hoursPerDay.step} onChange={(v) => setField({ hoursPerDay: v })} display={`${field.hoursPerDay} h`} />
          <div className="field">
            <span className="field-label" id="crop-l">{t('perf.crop')}</span>
            <div className="chips" role="radiogroup" aria-labelledby="crop-l">
              {agronomy.crops.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={field.crop === c.id} className={`chip${field.crop === c.id ? ' is-selected' : ''}`} onClick={() => setCrop(c.id)}>
                  <span className="seed-dot" style={{ background: c.color }} aria-hidden />
                  {t(`crops.${c.id}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="density">
            <label className="field">
              <span className="field-label">{t('perf.seedsPerM')}</span>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                step={0.1}
                min={crop.minSeedsPerM}
                max={crop.maxSeedsPerM}
                value={Number(f.conv(field.seedsPerM, perLenUnit).toFixed(2))}
                onChange={(e) => {
                  const v = toMetric(+e.target.value, perLenUnit, f.units);
                  if (Number.isFinite(v) && v > 0) setField({ seedsPerM: Math.min(crop.maxSeedsPerM, Math.max(crop.minSeedsPerM, v)) });
                }}
              />
              <span className="muted tiny">{f.unit('perLength')}</span>
            </label>
            <span className="density-eq" aria-hidden>⇄</span>
            <label className="field">
              <span className="field-label">{t('perf.seedsPerHa')}</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                step={500}
                value={Math.round(f.conv(perHa, 'perArea'))}
                onChange={(e) => {
                  const ha = toMetric(+e.target.value, 'perArea', f.units);
                  const m = seedsPerMFromHa(ha, spacingM);
                  if (Number.isFinite(m) && m > 0) setField({ seedsPerM: Math.min(crop.maxSeedsPerM, Math.max(crop.minSeedsPerM, m)) });
                }}
              />
              <span className="muted tiny">{f.unit('perArea')}</span>
            </label>
          </div>
          {config.selections.fertilizer !== 'none' && (
            <Slider id="fert" label={t('perf.fertDose')} value={field.fertKgHa} min={agronomy.fertilizer.minKgHa} max={agronomy.fertilizer.maxKgHa} step={5} onChange={(v) => setField({ fertKgHa: v })} display={f.q(field.fertKgHa, 'massPerArea', 0)} />
          )}
          <h3 className="sub">{t('perf.results')}</h3>
          <dl className="results">
            <div><dt>{t('perf.seedsPerHa')}</dt><dd>{f.n(f.conv(p.seedsPerHa, 'perArea'), 0)} {f.unit('perArea')}</dd></div>
            <div><dt>{t('perf.seedKgHa')}</dt><dd>{f.q(p.seedKgHa, 'massPerArea', 1)}</dd></div>
            <div><dt>{t('perf.seedAutonomy')}</dt><dd>{f.q(p.seedAutonomyHa, 'area', 0)} {t('perf.perLoad')}</dd></div>
            {p.fertAutonomyHa !== null && <div><dt>{t('perf.fertAutonomy')}</dt><dd>{f.q(p.fertAutonomyHa, 'area', 0)} {t('perf.perLoad')}</dd></div>}
            {more && (
              <>
                <div><dt>{t('perf.weightEmpty')}</dt><dd>{f.q(p.weight.emptyKg, 'mass', 0)}</dd></div>
                <div><dt>{t('perf.weightLoaded')}</dt><dd>{f.q(p.weight.loadedKg, 'mass', 0)}</dd></div>
              </>
            )}
          </dl>
          <button type="button" className="link" onClick={() => setMore(!more)}>{more ? t('perf.collapse') : t('perf.expand')}</button>
          <TransportCheckView />
          <p className="muted tiny legend">{t('perf.legend')} · {t('app.demoBadge')}</p>
        </div>
      )}
    </section>
  );
}
