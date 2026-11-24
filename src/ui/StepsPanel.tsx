import { useEffect, useRef } from 'react';
import { groupsForType, pricing, steps, types } from '@/core/catalog';
import { isGroupVisible } from '@/core/rules';
import { useI18n } from '@/i18n';
import { useSpecs } from '@/state/derived';
import { useStore } from '@/state/store';
import { OptionGroup } from './OptionGroup';
import { Button } from './primitives';
import { StepPersonalizacion } from './StepPersonalizacion';
import { TypeIcon } from './TypeIcon';

function StepTipo() {
  const { tx, money, t } = useI18n();
  const tipo = useStore((s) => s.config.tipo);
  const setTipo = useStore((s) => s.setTipo);
  const hidePrices = useStore((s) => s.ui.preciosOcultos);
  return (
    <div className="tipo-grid" role="radiogroup" aria-label={t('paso.tipo.titulo')}>
      {types.map((ty) => (
        <button key={ty.id} type="button" role="radio" aria-checked={ty.id === tipo} className={`tipo-card ${ty.id === tipo ? 'is-on' : ''}`} data-tipo={ty.id} onClick={() => setTipo(ty.id)}>
          <TypeIcon tipo={ty.id} />
          <span className="nombre">{tx(ty.name)}</span>
          <span className="desc">{tx(ty.desc)}</span>
          {hidePrices ? null : <span className="desde">{money(pricing.tipos[ty.id].base)}</span>}
        </button>
      ))}
    </div>
  );
}

function DimSummary() {
  const { t, n } = useI18n();
  const s = useSpecs();
  const tipo = useStore((st) => st.config.tipo);
  return (
    <dl className="tech-list" style={{ padding: '0.8rem', borderRadius: 10, background: 'var(--fondo)', border: '1px solid var(--borde)' }}>
      {s.volumenM3 !== null && tipo !== 'plataforma' ? (
        <div className="fila">
          <dt>{t('dim.volumen')}</dt>
          <dd data-testid="volumen">{n(s.volumenM3, 1)} m³</dd>
        </div>
      ) : (
        <div className="fila">
          <dt>{t('dim.superficie')}</dt>
          <dd>{n(s.superficieM2, 1)} m²</dd>
        </div>
      )}
      <div className="fila">
        <dt>{t('dim.total')}</dt>
        <dd>{n(s.largoTotalM, 2)} m</dd>
      </div>
      <div className="fila">
        <dt>{t('dim.altoTotal')}</dt>
        <dd>{n(s.altoTotalM, 2)} m</dd>
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

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [paso]);

  const groups = groupsForType(cfg.tipo).filter((g) => g.paso === paso && isGroupVisible(g, cfg));
  const last = idx === steps.length - 1;

  return (
    <>
      <button type="button" className="hoja-asa" aria-label={t('tec.ver')} onClick={() => setUi({ hojaExpandida: !useStore.getState().ui.hojaExpandida })} />
      <nav className="steps-nav" aria-label={t('paso.de', { n: idx + 1, total: steps.length })}>
        {steps.map((s, i) => (
          <button key={s.id} type="button" className={`step-tab ${i === idx ? 'is-on' : ''} ${i < idx ? 'is-done' : ''}`} aria-current={i === idx ? 'step' : undefined} data-paso={s.id} onClick={() => go(i)}>
            <span className="num">{i + 1}</span>
            <span>{tx(s.name)}</span>
          </button>
        ))}
      </nav>
      <div className="steps-body" ref={body} tabIndex={-1}>
        <header className="step-head">
          <div className="kicker">{t('paso.de', { n: idx + 1, total: steps.length })}</div>
          <h2>{t(`paso.${paso}.titulo`)}</h2>
          <p>{t(`paso.${paso}.sub`)}</p>
        </header>
        {paso === 'tipo' ? <StepTipo /> : null}
        {paso === 'personalizacion' ? <StepPersonalizacion /> : null}
        {paso !== 'tipo' && paso !== 'personalizacion' ? groups.map((g) => <OptionGroup key={`${cfg.tipo}-${g.id}`} group={g} />) : null}
        {paso === 'dimensiones' ? <DimSummary /> : null}
      </div>
      <div className="steps-foot">
        <Button variant="fantasma" icon="chevronIzq" disabled={idx === 0} onClick={() => go(idx - 1)}>
          {t('comun.anterior')}
        </Button>
        {last ? (
          <Button variant="primario" onClick={() => setUi({ modal: 'resumen' })}>
            {t('barra.resumen')}
          </Button>
        ) : (
          <Button variant="secundario" onClick={() => go(idx + 1)}>
            {t('comun.siguiente')}: {tx(steps[idx + 1].name)}
          </Button>
        )}
      </div>
    </>
  );
}
