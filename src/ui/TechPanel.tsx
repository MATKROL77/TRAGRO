import { groupDef, optionsFor } from '@/core/catalog';
import type { Specs } from '@/core/specs';
import { useI18n } from '@/i18n';
import { useSpecs } from '@/state/derived';
import { useStore } from '@/state/store';
import { axleName, checkParams, checkValue } from '@/lead/quote';
import { StatusDot } from './primitives';

const CHECK_TITLE: Record<string, string> = { ancho: 'tec.ancho', alto: 'tec.alto', largo: 'tec.largoConjunto', peso: 'tec.pbt', carga: 'tec.cajaLlena' };

function Select({ id }: { id: 'tractor' | 'carga' }) {
  const { tx } = useI18n();
  const cfg = useStore((s) => s.config);
  const setOption = useStore((s) => s.setOption);
  const g = groupDef(id);
  if (!g || cfg.sel[id] === undefined) return null;
  return (
    <label className="fila">
      <span>{tx(g.name)}</span>
      <select className="select" value={String(cfg.sel[id])} onChange={(e) => setOption(id, e.target.value)} data-testid={`sel-${id}`}>
        {optionsFor(g, cfg.tipo).map((o) => (
          <option key={o.id} value={o.id}>
            {tx(o.name)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Contenido completo de la ficha técnica (se usa en el panel y en la hoja del celular). */
export function TechBody({ s }: { s: Specs }) {
  const i18n = useI18n();
  const { t, tx, len, ton, kg, vol, area } = i18n;
  const cfg = useStore((st) => st.config);
  const producto = tx(groupDef('carga')?.opciones?.find((o) => o.id === cfg.sel.carga)?.name).toLowerCase();
  return (
    <>
      <div className="tech-ctrl">
        <Select id="tractor" />
        <Select id="carga" />
      </div>
      <div className="checks" data-testid="checks">
        {s.checks.map((c) => (
          <div key={c.id} className={`check ${c.level}`} data-check={c.id} data-level={c.level}>
            <StatusDot level={c.level} />
            <span className="tit">{t(CHECK_TITLE[c.id], { producto })}</span>
            <span className="num">{checkValue(c, i18n)}</span>
            <span className="msg">{t(c.msg, checkParams(c, i18n, producto, axleName(cfg, i18n.lang)))}</span>
          </div>
        ))}
      </div>
      <dl className="tech-list">
        <div className="fila">
          <dt>{t('tec.largoCaja')}</dt>
          <dd>{len(s.largoCajaM)}</dd>
        </div>
        <div className="fila">
          <dt>{t('tec.largoTotal')}</dt>
          <dd>{len(s.largoTotalM)}</dd>
        </div>
        <div className="fila">
          <dt>{t('tec.ancho')}</dt>
          <dd>{len(s.anchoM)}</dd>
        </div>
        <div className="fila">
          <dt>{t('tec.alto')}</dt>
          <dd>{len(s.altoTotalM)}</dd>
        </div>
        {s.volumenM3 !== null && cfg.tipo !== 'plataforma' ? (
          <div className="fila">
            <dt>{t('tec.volumen')}</dt>
            <dd>{vol(s.volumenM3)}</dd>
          </div>
        ) : (
          <div className="fila">
            <dt>{t('tec.superficie')}</dt>
            <dd>{area(s.superficieM2)}</dd>
          </div>
        )}
        <div className="fila">
          <dt>{t('tec.capEjes')}</dt>
          <dd>{ton(s.capacidadEjesSemiT)}</dd>
        </div>
        <div className="fila">
          <dt>{t('tec.pbt')}</dt>
          <dd>{ton(s.pesoBrutoConjuntoT)}</dd>
        </div>
        <div className="fila">
          <dt>{t('tec.tara')}</dt>
          <dd>{kg(s.taraKg)}</dd>
        </div>
        <div className="fila">
          <dt>{t('tec.cargaUtil')}</dt>
          <dd>{kg(s.cargaUtilKg)}</dd>
        </div>
        <div className="fila">
          <dt>{t('tec.plazo')}</dt>
          <dd>{t('comun.dias', { n: s.plazoDias })}</dd>
        </div>
      </dl>
      <details style={{ marginBottom: '0.7rem' }}>
        <summary className="nota" style={{ cursor: 'pointer', fontWeight: 700, minHeight: 32, display: 'flex', alignItems: 'center' }}>
          {t('tec.detalleTara')}
        </summary>
        <dl className="tech-list" style={{ marginTop: '0.4rem' }}>
          {s.taraLines.map((l) => (
            <div className="fila" key={l.key}>
              <dt>{tx(l.label)}</dt>
              <dd>{kg(l.kg)}</dd>
            </div>
          ))}
        </dl>
      </details>
      <p className="nota">{t('tec.leyenda')}</p>
      <p className="nota" style={{ marginTop: '0.25rem' }}>{t('tec.normativa')}</p>
    </>
  );
}

/** Pestaña "Datos técnicos" del panel lateral: cifras clave, semáforo legal y ficha completa. */
export function TechTab() {
  const { t, n, units, ton, vol, area, len } = useI18n();
  const s = useSpecs();
  const tipo = useStore((st) => st.config.tipo);
  const hasVol = s.volumenM3 !== null && tipo !== 'plataforma';
  return (
    <section className="tech" aria-label={t('tec.titulo')} id="panel-tecnico" role="tabpanel">
      <div className="tech-estado">
        <StatusDot level={s.level} />
        <span data-testid="tec-estado" data-level={s.level}>
          {t(`tec.resumen.${s.level}`)}
        </span>
      </div>
      <div className="kpi-grid">
        <div className="kpi">
          <span>{t('barra.tara')}</span>
          <strong>{units === 'metric' ? `${n(s.taraKg / 1000, 2)} t` : ton(s.taraKg / 1000)}</strong>
        </div>
        <div className="kpi">
          <span>{t('barra.cargaUtil')}</span>
          <strong>{ton(s.cargaUtilKg / 1000)}</strong>
        </div>
        <div className="kpi">
          <span>{hasVol ? t('tec.volumen') : t('tec.superficie')}</span>
          <strong>{hasVol ? vol(s.volumenM3 as number) : area(s.superficieM2)}</strong>
        </div>
        <div className="kpi">
          <span>{t('tec.largoTotal')}</span>
          <strong>{len(s.largoTotalM)}</strong>
        </div>
      </div>
      <TechBody s={s} />
    </section>
  );
}
