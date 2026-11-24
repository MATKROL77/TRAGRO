import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../state/store';
import { useT } from '../i18n/useT';
import { useFmt } from './format';
import { catalog, getGroup, getModel, rowsRange, widthM } from '../domain/catalog';
import { isGroupVisible, optionStatus, resolve } from '../domain/rules';
import { computePrice, optionPrice } from '../domain/pricing';
import { createDefaultConfig } from '../domain/catalog';
import { IconBack, IconChevron, IconInfo, IconWarn, IconCheck } from './icons';
import brand from '../config/brand.json';
import ral from '../config/ral.json';
import type { Lang } from '../domain/types';

function PriceTag({ amount, standard }: { amount: number; standard: boolean }) {
  const t = useT();
  const f = useFmt();
  const hide = useStore((s) => s.hidePrices);
  if (hide) return standard ? <span className="tag tag-std">{t('status.standard')}</span> : null;
  if (amount === 0) return <span className="tag tag-std">{standard ? t('status.standard') : t('status.included')}</span>;
  return <span className="tag tag-price">+{f.money(amount)}</span>;
}

function OptionCard({ group, option }: { group: string; option: string }) {
  const t = useT();
  const config = useStore((s) => s.config);
  const select = useStore((s) => s.select);
  const g = getGroup(group)!;
  const def = g.options.find((o) => o.id === option)!;
  const selected = config.selections[group] === option;
  const status = optionStatus(config, group, option);
  const price = optionPrice(config, group, option);
  const disabled = status.state === 'disabled';
  const reason = disabled ? status.ruleIds.map((r) => t(`rules.${r}`)).join(' ') : '';
  const adjusts =
    status.state === 'adjusts'
      ? status.notices.map((n) => `${t(`groups.${n.group}.name`)}: ${t(`options.${n.group}.${n.to}.name`)}`).join(' · ')
      : '';
  const desc = t(`options.${group}.${option}.desc`);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      className={`opt${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
      onClick={() => !disabled && select(group, option)}
      title={disabled ? `${t('status.disabled')}: ${reason}` : adjusts ? `${t('status.adjusts')} ${adjusts}` : undefined}
    >
      <span className="opt-radio" aria-hidden>{selected && <IconCheck size={14} />}</span>
      <span className="opt-body">
        <span className="opt-name">{t(`options.${group}.${option}.name`)}</span>
        {desc && <span className="opt-desc">{desc}</span>}
        {disabled && (
          <span className="opt-why">
            <IconInfo size={14} /> {reason}
          </span>
        )}
        {!disabled && adjusts && (
          <span className="opt-adjust">
            <IconWarn size={14} /> {t('status.adjusts')} {adjusts}
          </span>
        )}
        {def.leadTimeDays ? <span className="opt-lead">{t('status.leadTime', { days: def.leadTimeDays })}</span> : null}
      </span>
      <span className="opt-price">
        <PriceTag amount={price} standard={def.standard} />
      </span>
    </button>
  );
}

function GroupBlock({ id }: { id: string }) {
  const t = useT();
  const config = useStore((s) => s.config);
  const g = getGroup(id);
  if (!g || !isGroupVisible(id, config)) return null;
  return (
    <fieldset className="group">
      <legend className="group-title">{t(`groups.${id}.name`)}</legend>
      <div className={`opts${g.type === 'toggle' ? ' opts-toggle' : ''}`} role="radiogroup" aria-label={t(`groups.${id}.name`)}>
        {g.options.map((o) => (
          <OptionCard key={o.id} group={id} option={o.id} />
        ))}
      </div>
    </fieldset>
  );
}

function StepModel() {
  const t = useT();
  const f = useFmt();
  const config = useStore((s) => s.config);
  const setModel = useStore((s) => s.setModel);
  const hide = useStore((s) => s.hidePrices);
  return (
    <div className="models" role="radiogroup" aria-label={t('steps.model.name')}>
      {catalog.models.map((m) => {
        const base = createDefaultConfig();
        const from = computePrice(resolve({ ...base, model: m.id, rows: m.rowsMin, selections: { ...base.selections, transport: 'fold' } }).config).total;
        const sel = config.model === m.id;
        const range = rowsRange(m, config.spacingCm);
        return (
          <button key={m.id} type="button" role="radio" aria-checked={sel} className={`model${sel ? ' is-selected' : ''}`} onClick={() => setModel(m.id)}>
            <span className="model-tier">{t(`models.${m.id}.tier`)}</span>
            <span className="model-name">{t(`models.${m.id}.name`)}</span>
            <span className="model-rows">{t('models.rowsRange', { min: range.min, max: range.max })}</span>
            <span className="model-desc">{t(`models.${m.id}.desc`)}</span>
            {!hide && (
              <span className="model-from">
                {t('models.from')} <strong>{f.money(from)}</strong>
              </span>
            )}
            <ModelGlyph tier={m.tier} />
          </button>
        );
      })}
    </div>
  );
}

function ModelGlyph({ tier }: { tier: string }) {
  const n = { compact: 5, medium: 8, large: 11, xl: 15 }[tier] ?? 8;
  return (
    <svg className="model-glyph" viewBox="0 0 160 26" aria-hidden>
      <rect x={80 - n * 5} y="6" width={n * 10} height="4" rx="1.5" fill="currentColor" />
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={80 - n * 5 + 5 + i * 10} cy="18" r="3.2" fill="currentColor" opacity="0.65" />
      ))}
    </svg>
  );
}

function StepRows() {
  const t = useT();
  const f = useFmt();
  const config = useStore((s) => s.config);
  const setRows = useStore((s) => s.setRows);
  const setSpacing = useStore((s) => s.setSpacing);
  const model = getModel(config.model);
  const range = rowsRange(model, config.spacingCm);
  const w = widthM(config);
  return (
    <div className="rows-step">
      <div className="field">
        <label className="field-label" htmlFor="rows-range">{t('rows.count')}</label>
        <div className="stepper">
          <button type="button" className="btn-icon" aria-label={t('rows.decrease')} onClick={() => setRows(config.rows - 1)} disabled={config.rows <= range.min}>−</button>
          <output className="stepper-value" aria-live="polite">{config.rows}</output>
          <button type="button" className="btn-icon" aria-label={t('rows.increase')} onClick={() => setRows(config.rows + 1)} disabled={config.rows >= range.max}>+</button>
        </div>
        <input id="rows-range" type="range" min={range.min} max={range.max} step={1} value={config.rows} onChange={(e) => setRows(+e.target.value)} />
        <div className="range-ends"><span>{range.min}</span><span>{range.max}</span></div>
      </div>
      <fieldset className="group">
        <legend className="group-title">{t('rows.spacing')}</legend>
        <div className="chips" role="radiogroup" aria-label={t('rows.spacing')}>
          {catalog.spacingsCm.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={config.spacingCm === s} className={`chip${config.spacingCm === s ? ' is-selected' : ''}`} onClick={() => setSpacing(s)}>
              {f.q(s, 'lengthCm', s % 1 ? 1 : f.units === 'imperial' ? 1 : 0)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="width-card">
        <span className="width-label">{t('rows.width')}</span>
        <span className="width-value">{f.q(w, 'length', 2)}</span>
        <span className="width-formula">{t('rows.formula', { rows: config.rows, spacing: f.q(config.spacingCm, 'lengthCm', 1) })}</span>
      </div>
    </div>
  );
}

function ColorPicker({ which }: { which: 'main' | 'accent' }) {
  const t = useT();
  const lang = useStore((s) => s.lang) as Lang;
  const config = useStore((s) => s.config);
  const setColors = useStore((s) => s.setColors);
  const [q, setQ] = useState('');
  const current = which === 'main' ? config.colors.main : config.colors.accent;
  const currentRal = which === 'main' ? config.colors.mainRal : config.colors.accentRal;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ral.colors.filter((c) => !s || c.ral.toLowerCase().includes(s) || (c.names as Record<string, string>)[lang].toLowerCase().includes(s) || c.names.en.toLowerCase().includes(s));
  }, [q, lang]);
  const pick = (hex: string, code: string) => setColors(which === 'main' ? { main: hex, mainRal: code } : { accent: hex, accentRal: code });
  const brandSwatch = which === 'main' ? brand.machinePalette[0] : brand.machinePalette[1];
  return (
    <fieldset className="group">
      <legend className="group-title">{t(which === 'main' ? 'custom.mainColor' : 'custom.accentColor')}</legend>
      <div className="swatches">
        <button type="button" className={`swatch swatch-brand${currentRal.startsWith('brand') ? ' is-selected' : ''}`} style={{ background: brandSwatch.hex }} onClick={() => pick(brandSwatch.hex, brandSwatch.ral)} aria-label={`${t('custom.brandColors')}: ${brandSwatch.name}`} title={brandSwatch.name} />
        <span className="swatch-current" style={{ background: current }} aria-hidden />
        <span className="swatch-code">{currentRal.startsWith('brand') ? t('custom.brandColors') : currentRal}</span>
      </div>
      <input className="input" type="search" placeholder={t('custom.ralSearch')} aria-label={t('custom.ralSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="ral-grid" role="listbox" aria-label={t('custom.ralSearch')}>
        {list.length === 0 && <span className="muted">{t('custom.noResults')}</span>}
        {list.map((c) => (
          <button key={c.ral} type="button" role="option" aria-selected={currentRal === c.ral} className={`ral${currentRal === c.ral ? ' is-selected' : ''}`} onClick={() => pick(c.hex, c.ral)} title={`${c.ral} · ${(c.names as Record<string, string>)[lang]}`}>
            <span className="ral-chip" style={{ background: c.hex }} />
            <span className="ral-code">{c.ral.replace('RAL ', '')}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function StepCustom() {
  const t = useT();
  const config = useStore((s) => s.config);
  const setText = useStore((s) => s.setText);
  const logoUrl = useStore((s) => s.logoUrl);
  const setLogo = useStore((s) => s.setLogo);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const onFile = (file?: File) => {
    setErr('');
    if (!file) return;
    if (file.size > 2 * 1024 * 1024 || !/image\/(png|svg\+xml)/.test(file.type)) {
      setErr(t('custom.logoError'));
      return;
    }
    const r = new FileReader();
    r.onload = () => setLogo(String(r.result));
    r.onerror = () => setErr(t('custom.logoError'));
    r.readAsDataURL(file);
  };
  return (
    <div>
      <ColorPicker which="main" />
      <ColorPicker which="accent" />
      <p className="note">{t('custom.customPaintNote')}</p>
      <fieldset className="group">
        <legend className="group-title">{t('custom.logo')}</legend>
        <p className="muted small">{t('custom.logoHint')}</p>
        <div className="logo-row">
          {logoUrl && <img className="logo-preview" src={logoUrl} alt="" />}
          <button type="button" className="btn btn-secondary" onClick={() => input.current?.click()}>{t('custom.uploadLogo')}</button>
          {logoUrl && <button type="button" className="btn btn-ghost" onClick={() => setLogo(null)}>{t('custom.removeLogo')}</button>}
          <input ref={input} type="file" accept="image/png,image/svg+xml" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        {err && <p className="error" role="alert">{err}</p>}
        {logoUrl && <p className="muted small">{t('custom.logoNotShared')}</p>}
      </fieldset>
      <div className="field">
        <label className="field-label" htmlFor="custom-text">{t('custom.text')}</label>
        <input id="custom-text" className="input" maxLength={28} placeholder={t('custom.textPlaceholder')} value={config.text} onChange={(e) => setText(e.target.value)} />
      </div>
    </div>
  );
}

export function ConfigPanel() {
  const t = useT();
  const step = useStore((s) => s.step);
  const setStep = useStore((s) => s.setStep);
  const focus = useStore((s) => s.focus);
  const steps = catalog.steps;
  const cur = steps[step];
  const go = (i: number) => {
    setStep(i);
    const f = steps[i].focus;
    if (f) focus(f);
  };
  return (
    <section className="config" aria-label={t('a11y.panel')} id="config-panel">
      <nav className="stepper-nav" aria-label={t('nav.step', { n: step + 1, total: steps.length })}>
        <ol>
          {steps.map((s, i) => (
            <li key={s.id}>
              <button type="button" className={`step-tab${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)}>
                <span className="step-num">{i + 1}</span>
                <span className="step-name">{t(`steps.${s.id}.name`)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="step-head">
        <span className="step-kicker">{t('nav.step', { n: step + 1, total: steps.length })}</span>
        <h2 className="step-title">{t(`steps.${cur.id}.name`)}</h2>
        <p className="step-hint">{t(`steps.${cur.id}.hint`)}</p>
      </div>
      <div className="step-body">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={cur.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
            {cur.id === 'model' && <StepModel />}
            {cur.id === 'rows' && <StepRows />}
            {cur.id === 'custom' && <StepCustom />}
            {cur.groups.map((g) => (
              <GroupBlock key={g} id={g} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="step-nav">
        <button type="button" className="btn btn-ghost" onClick={() => go(Math.max(0, step - 1))} disabled={step === 0}>
          <IconBack size={18} /> {t('nav.back')}
        </button>
        {step < steps.length - 1 ? (
          <button type="button" className="btn btn-next" onClick={() => go(step + 1)}>
            {t('nav.next')}: {t(`steps.${steps[step + 1].id}.name`)} <IconChevron size={16} />
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => useStore.getState().openModal('summary')}>
            {t('actions.summary')} <IconChevron size={18} />
          </button>
        )}
      </div>
    </section>
  );
}
