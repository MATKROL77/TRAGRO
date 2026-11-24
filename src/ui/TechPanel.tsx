import { groupDef, optionsFor } from '@/core/catalog';
import type { LegalCheck, Specs } from '@/core/specs';
import { useI18n } from '@/i18n';
import { useSpecs } from '@/state/derived';
import { useStore } from '@/state/store';
import { Icon } from './Icon';
import { Modal, StatusDot } from './primitives';

const CHECK_TITLE: Record<string, string> = { ancho: 'tec.ancho', alto: 'tec.alto', largo: 'tec.largoConjunto', peso: 'tec.pbt', carga: 'tec.cajaLlena' };

/** Parámetros de los mensajes de validación con números en formato local. */
export function checkParams(c: LegalCheck, n: (v: number, d?: number) => string, producto: string): Record<string, string | number> {
  const p: Record<string, string | number> = { ...c.params, tractor: String(c.params.tractor ?? ''), producto };
  if (c.id === 'largo') {
    p.margen = n(Number(c.params.margen) / 100, 2);
    p.exceso = n(Number(c.params.exceso) / 100, 2);
  } else if (c.id === 'carga') {
    p.margen = n(Number(c.params.margen), 1);
    p.exceso = n(Number(c.params.exceso), 1);
  }
  return p;
}

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
  const { t, tx, n } = useI18n();
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
            <span className="num">
              {n(c.value, c.unit === 'm' ? 2 : 1)} {c.unit}
              {c.id === 'peso' ? '' : ` / ${n(c.limit, c.unit === 'm' ? 2 : 1)} ${c.unit}`}
            </span>
            <span className="msg">{t(c.msg, checkParams(c, n, producto))}</span>
          </div>
        ))}
      </div>
      <dl className="tech-list">
        <div className="fila">
          <dt>{t('tec.largoCaja')}</dt>
          <dd>{n(s.largoCajaM, 2)} m</dd>
        </div>
        <div className="fila">
          <dt>{t('tec.largoTotal')}</dt>
          <dd>{n(s.largoTotalM, 2)} m</dd>
        </div>
        <div className="fila">
          <dt>{t('tec.ancho')}</dt>
          <dd>{n(s.anchoM, 2)} m</dd>
        </div>
        <div className="fila">
          <dt>{t('tec.alto')}</dt>
          <dd>{n(s.altoTotalM, 2)} m</dd>
        </div>
        {s.volumenM3 !== null && cfg.tipo !== 'plataforma' ? (
          <div className="fila">
            <dt>{t('tec.volumen')}</dt>
            <dd>{n(s.volumenM3, 1)} m³</dd>
          </div>
        ) : (
          <div className="fila">
            <dt>{t('tec.superficie')}</dt>
            <dd>{n(s.superficieM2, 1)} m²</dd>
          </div>
        )}
        <div className="fila">
          <dt>{t('tec.capEjes')}</dt>
          <dd>{n(s.capacidadEjesSemiT, 1)} t</dd>
        </div>
        <div className="fila">
          <dt>{t('tec.pbt')}</dt>
          <dd>{n(s.pesoBrutoConjuntoT, 1)} t</dd>
        </div>
        <div className="fila">
          <dt>{t('tec.tara')}</dt>
          <dd>{n(s.taraKg)} kg</dd>
        </div>
        <div className="fila">
          <dt>{t('tec.cargaUtil')}</dt>
          <dd>{n(s.cargaUtilKg)} kg</dd>
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
              <dd>{n(l.kg)} kg</dd>
            </div>
          ))}
        </dl>
      </details>
      <p className="nota">{t('tec.leyenda')}</p>
      <p className="nota" style={{ marginTop: '0.25rem' }}>{t('tec.normativa')}</p>
    </>
  );
}

export function TechPanel() {
  const { t, n } = useI18n();
  const s = useSpecs();
  const open = useStore((st) => st.ui.tecAbierto);
  const modal = useStore((st) => st.ui.modal);
  const setUi = useStore((st) => st.setUi);
  const tipo = useStore((st) => st.config.tipo);
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
  const toggle = () => (isMobile() ? setUi({ modal: 'tecnico' }) : setUi({ tecAbierto: !open }));
  return (
    <>
      <section className="tech" aria-label={t('tec.titulo')}>
        <button type="button" className="tech-head" aria-expanded={open} onClick={toggle} data-testid="tec-toggle">
          <StatusDot level={s.level} />
          <span className="t">{t('tec.titulo')}</span>
          <span className="estado" data-testid="tec-estado" data-level={s.level}>{t(`tec.resumen.${s.level}`)}</span>
          <Icon name={open ? 'chevronAbajo' : 'chevronArriba'} size={18} />
        </button>
        <div className="tech-kpis">
          <div>
            <div className="k">{t('barra.tara')}</div>
            <div className="v">{n(s.taraKg / 1000, 2)}<small>t</small></div>
          </div>
          <div>
            <div className="k">{t('barra.cargaUtil')}</div>
            <div className="v">{n(s.cargaUtilKg / 1000, 1)}<small>t</small></div>
          </div>
          <div>
            <div className="k">{s.volumenM3 !== null && tipo !== 'plataforma' ? t('tec.volumen') : t('tec.superficie')}</div>
            <div className="v">
              {s.volumenM3 !== null && tipo !== 'plataforma' ? n(s.volumenM3, 1) : n(s.superficieM2, 1)}
              <small>{s.volumenM3 !== null && tipo !== 'plataforma' ? 'm³' : 'm²'}</small>
            </div>
          </div>
        </div>
        {open ? (
          <div className="tech-body">
            <TechBody s={s} />
          </div>
        ) : null}
      </section>
      <Modal open={modal === 'tecnico'} onClose={() => setUi({ modal: null })} title={t('tec.titulo')}>
        <TechBody s={s} />
      </Modal>
    </>
  );
}
