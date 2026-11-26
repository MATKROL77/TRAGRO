import { useEffect, useMemo, useRef } from 'react';
import { groupsForType, steps, types } from '@/core/catalog';
import { priceIfType, startingPriceUsd } from '@/core/pricing';
import { isGroupVisible } from '@/core/rules';
import { useI18n } from '@/i18n';
import { useSpecs } from '@/state/derived';
import { useStore } from '@/state/store';
import { Icon } from './Icon';
import { OptionGroup } from './OptionGroup';
import { StepPersonalizacion } from './StepPersonalizacion';
import { TypeIcon } from './TypeIcon';

function StepTipo() {
  const { tx, money, t } = useI18n();
  const config = useStore((s) => s.config);
  const tipo = config.tipo;
  const setTipo = useStore((s) => s.setTipo);
  const hidePrices = useStore((s) => s.ui.preciosOcultos);
  // Cada tarjeta muestra el precio que va a quedar al elegirla, con lo que ya se configuró.
  const precios = useMemo(() => Object.fromEntries(types.map((ty) => [ty.id, priceIfType(config, ty.id)])), [config]);
  return (
    <div className="tipo-grid" role="radiogroup" aria-label={t('paso.tipo.titulo')}>
      {types.map((ty) => (
        <button key={ty.id} type="button" role="radio" aria-checked={ty.id === tipo} className={`tipo-card ${ty.id === tipo ? 'is-on' : ''}`} data-tipo={ty.id} onClick={() => setTipo(ty.id)}>
          <span className="nombre">{tx(ty.name)}</span>
          <span className="desc">{tx(ty.desc)}</span>
          {hidePrices ? null : (
            <span className="desde" title={t('tipo.precioAyuda')}>
              {/* Sin cambios propios es el precio de partida ("desde"); con cambios, el que va a quedar al elegirlo. */}
              {Math.abs(precios[ty.id] - startingPriceUsd(ty.id)) < 0.5 ? `${t('tipo.desde')} ` : null}
              <strong data-testid={`precio-tipo-${ty.id}`}>{money(precios[ty.id])}</strong>
            </span>
          )}
          <TypeIcon tipo={ty.id} />
        </button>
      ))}
    </div>
  );
}

function DimSummary() {
  const { t, len, vol, area } = useI18n();
  const s = useSpecs();
  const tipo = useStore((st) => st.config.tipo);
  return (
    <dl className="tech-list dim-resumen">
      {s.volumenM3 !== null && tipo !== 'plataforma' ? (
        <div className="fila">
          <dt>{t('dim.volumen')}</dt>
          <dd data-testid="volumen">{vol(s.volumenM3)}</dd>
        </div>
      ) : (
        <div className="fila">
          <dt>{t('dim.superficie')}</dt>
          <dd>{area(s.superficieM2)}</dd>
        </div>
      )}
      <div className="fila">
        <dt>{t('dim.total')}</dt>
        <dd>{len(s.largoTotalM)}</dd>
      </div>
      <div className="fila">
        <dt>{t('dim.altoTotal')}</dt>
        <dd>{len(s.altoTotalM)}</dd>
      </div>
    </dl>
  );
}

export function StepsPanel() {
  const { t, tx } = useI18n();
  const paso = useStore((s) => s.ui.paso);
  const setUi = useStore((s) => s.setUi);
  const cfg = useStore((s) => s.config);
  const body = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, steps.findIndex((s) => s.id === paso));
  const go = (i: number) => setUi({ paso: steps[Math.min(steps.length - 1, Math.max(0, i))].id });

  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
    // En el celular los pasos van en una fila deslizable: el activo queda a la vista.
    nav.current?.querySelector<HTMLElement>('.step-tab.is-on')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [paso]);

  const groups = groupsForType(cfg.tipo).filter((g) => g.paso === paso && isGroupVisible(g, cfg));
  const last = idx === steps.length - 1;

  return (
    <section className="config" id="panel-config" role="tabpanel" aria-label={t('panel.configurar')}>
      <nav className="steps-nav" ref={nav} aria-label={t('paso.de', { n: idx + 1, total: steps.length })}>
        <ol>
          {steps.map((s, i) => (
            <li key={s.id}>
              <button type="button" className={`step-tab ${i === idx ? 'is-on' : ''} ${i < idx ? 'is-done' : ''}`} aria-current={i === idx ? 'step' : undefined} aria-label={`${t('paso.de', { n: i + 1, total: steps.length })}: ${tx(s.name)}`} data-paso={s.id} onClick={() => go(i)}>
                <span className="num">{i + 1}</span>
                <span className="step-name">{tx(s.name)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <header className="step-head">
        <span className="kicker">{t('paso.de', { n: idx + 1, total: steps.length })}</span>
        <h2>{t(`paso.${paso}.titulo`)}</h2>
        <p>{t(`paso.${paso}.sub`)}</p>
      </header>
      <div className="steps-body" ref={body} tabIndex={-1}>
        {paso === 'tipo' ? <StepTipo /> : null}
        {paso === 'personalizacion' ? <StepPersonalizacion /> : null}
        {paso !== 'tipo' && paso !== 'personalizacion' ? groups.map((g) => <OptionGroup key={`${cfg.tipo}-${g.id}`} group={g} />) : null}
        {paso === 'dimensiones' ? <DimSummary /> : null}
      </div>
      <div className="steps-foot">
        <button type="button" className="btn btn-fantasma" disabled={idx === 0} onClick={() => go(idx - 1)} aria-label={idx > 0 ? `${t('comun.anterior')}: ${tx(steps[idx - 1].name)}` : t('comun.anterior')} data-testid="paso-anterior">
          <Icon name="chevronIzq" size={18} />
          <span>{t('comun.anterior')}</span>
        </button>
        {last ? (
          <button type="button" className="btn btn-primario" onClick={() => setUi({ modal: 'resumen' })} data-testid="paso-resumen">
            <span>{t('barra.resumenCorto')}</span>
            <Icon name="chevronDer" size={18} />
          </button>
        ) : (
          <button type="button" className="btn btn-next" onClick={() => go(idx + 1)} aria-label={`${t('comun.siguiente')}: ${tx(steps[idx + 1].name)}`} data-testid="paso-siguiente">
            <span>
              {t('comun.siguiente')}: {tx(steps[idx + 1].name)}
            </span>
            <Icon name="chevronDer" size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
