import { optionsFor } from '@/core/catalog';
import { deltaVsCurrent, optionPriceUsd, rangeHasPrice } from '@/core/pricing';
import { effectiveRange, optionState } from '@/core/rules';
import { rangeFor, typeDef } from '@/core/catalog';
import type { GroupDef } from '@/core/types';
import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { Icon } from './Icon';
import { Slider, Stepper, Switch } from './primitives';

/** Dibuja un grupo de opciones del catálogo según su tipo. 100% guiado por datos. */
export function OptionGroup({ group }: { group: GroupDef }) {
  const { t, tx, len, money } = useI18n();
  const cfg = useStore((s) => s.config);
  const setOption = useStore((s) => s.setOption);
  const hidePrices = useStore((s) => s.ui.preciosOcultos);
  const value = cfg.sel[group.id];
  const name = group.id === 'alto' ? tx(typeDef(cfg.tipo).altoLabel) : tx(group.name);
  const set = (v: string | number | boolean) => setOption(group.id, v, group.foco ?? 'ninguno');

  // Etiqueta de precio en forma de píldora: diferencia contra la opción elegida.
  const priceTag = (usd: number, selected: boolean, estandar?: boolean) => {
    if (hidePrices) return estandar ? <span className="tag tag-std">{t('comun.estandar')}</span> : null;
    if (selected || usd === 0) return estandar ? <span className="tag tag-std">{t('comun.estandar')}</span> : selected ? null : <span className="tag tag-std">=</span>;
    return <span className="tag tag-price">{money(usd, true)}</span>;
  };

  if (group.tipo === 'rango') {
    const base = rangeFor(cfg.tipo, group.id);
    const eff = effectiveRange(cfg, group.id);
    if (!base || !eff) return null;
    const perMeter = rangeHasPrice(cfg, group.id as 'largo' | 'alto');
    return (
      <section className="group" aria-label={name}>
        <div className="group-head">
          <h3>{name}</h3>
          <span className="valor">{len(Number(value))}</span>
        </div>
        {group.ayuda ? <p className="group-help">{tx(group.ayuda)}</p> : null}
        <Slider value={Number(value)} min={eff.min} max={eff.max} hardMin={base.min} step={base.paso} label={name} format={(v) => len(v)} onChange={(v) => set(v)} />
        {eff.motivo && eff.min > base.min ? (
          <p className="group-help" style={{ color: 'var(--alerta)', marginTop: '0.4rem' }}>
            <Icon name="info" size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            {tx(eff.motivo)}
          </p>
        ) : null}
        {!hidePrices && perMeter ? <p className="nota" style={{ marginTop: '0.35rem' }}>{t('dim.porMetro', { monto: money(perMeter) })}</p> : null}
      </section>
    );
  }

  if (group.tipo === 'seleccion') {
    const opts = optionsFor(group, cfg.tipo);
    if (group.presentacion === 'color') {
      const cur = opts.find((o) => o.id === value);
      return (
        <section className="group" aria-label={name}>
          <div className="group-head">
            <h3>{name}</h3>
            <span className="valor">{cur ? tx(cur.name) : ''}</span>
          </div>
          <div className="swatches" role="radiogroup" aria-label={name}>
            {opts.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={o.id === value} aria-label={tx(o.name)} title={tx(o.name)} className={`swatch ${o.id === value ? 'is-on' : ''}`} style={{ ['--c' as string]: o.hex }} onClick={() => set(o.id)} />
            ))}
          </div>
        </section>
      );
    }
    return (
      <section className="group">
        <div className="group-head">
          <h3 id={`g-${group.id}`}>{name}</h3>
        </div>
        {group.ayuda ? <p className="group-help">{tx(group.ayuda)}</p> : null}
        <div className="options" role="radiogroup" aria-labelledby={`g-${group.id}`}>
          {opts.map((o) => {
            const st = optionState(cfg, group.id, o.id);
            const selected = o.id === value;
            const delta = deltaVsCurrent(cfg, group, o.id);
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={st.disabled}
                title={st.disabled && st.motivo ? tx(st.motivo) : undefined}
                className={`option ${selected ? 'is-on' : ''}`}
                data-opt={`${group.id}:${o.id}`}
                onClick={() => !st.disabled && set(o.id)}
              >
                <span className="opt-radio" aria-hidden="true">
                  {selected ? <Icon name="check" size={14} /> : null}
                </span>
                <span className="opt-body">
                  <span className="nombre">{tx(o.name)}</span>
                  {o.desc ? <span className="desc">{tx(o.desc)}</span> : null}
                  {st.disabled && st.motivo ? (
                    <span className="motivo">
                      <Icon name="info" size={14} />
                      {tx(st.motivo)}
                    </span>
                  ) : null}
                </span>
                <span className="precio">{st.disabled ? <span className="tag tag-std">{t('comun.noDisponible')}</span> : priceTag(delta, selected, o.estandar)}</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  if (group.tipo === 'interruptor') {
    const on = value === true;
    const st = optionState(cfg, group.id, true);
    const usd = optionPriceUsd(cfg, group, true);
    return (
      <div className={`row-option ${on ? 'is-on' : ''} ${st.disabled ? 'is-disabled' : ''}`} data-opt={group.id}>
        <span className="nombre">{name}</span>
        <span className="ctrl">
          <Switch checked={on} onChange={(v) => set(v)} label={name} disabled={st.disabled && !on} />
        </span>
        {group.desc ? <span className="desc">{tx(group.desc)}</span> : null}
        {st.disabled && st.motivo ? (
          <span className="motivo">
            <Icon name="info" size={14} />
            {tx(st.motivo)}
          </span>
        ) : hidePrices ? null : (
          <span className="precio">
            <span className="tag tag-price">{money(usd, true)}</span>
          </span>
        )}
      </div>
    );
  }

  // cantidad
  const qty = Number(value ?? 0);
  const next = optionState(cfg, group.id, qty + 1);
  const unit = optionPriceUsd(cfg, group, 1);
  return (
    <div className={`row-option ${qty > 0 ? 'is-on' : ''}`} data-opt={group.id}>
      <span className="nombre">{name}</span>
      <span className="ctrl">
        <Stepper value={qty} max={group.max ?? 1} onChange={(v) => set(v)} label={name} canIncrease={!next.disabled} />
      </span>
      {group.desc ? <span className="desc">{tx(group.desc)}</span> : null}
      {next.disabled && next.motivo && qty < (group.max ?? 1) ? (
        <span className="motivo">
          <Icon name="info" size={14} />
          {tx(next.motivo)}
        </span>
      ) : hidePrices ? null : (
        <span className="precio">
          <span className="tag tag-price">
            {money(unit, true)} {t('comun.cadaUno')}
          </span>
        </span>
      )}
    </div>
  );
}
