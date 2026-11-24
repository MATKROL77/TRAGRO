import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { useT } from '../../i18n/useT';
import { Modal } from './Modal';
import { buildSummary, moneyOrDash } from '../../services/summaryData';
import { captureView } from '../../three/capture';
import { currentShareUrl, shareCurrent } from '../share';
import { formatDate } from '../../domain/units';
import { IconCompare, IconPdf, IconShare } from '../icons';

export type Renders = { front34?: string; top?: string; transport?: string };
let renderCache: { key: string; renders: Renders } | null = null;

/** Genera (y cachea por configuración) los 3 renders automáticos. */
export async function getRenders(): Promise<Renders> {
  const st = useStore.getState();
  const key = JSON.stringify([st.config, st.scene, st.logoUrl]);
  if (renderCache?.key === key) return renderCache.renders;
  if (!st.webgl || !st.viewerReady) return {};
  const front34 = await captureView('front34', false);
  const top = await captureView('top', false);
  const transport = await captureView('front34', true);
  const renders = { front34, top, transport };
  renderCache = { key, renders };
  return renders;
}

export default function SummaryModal() {
  const t = useT();
  const s = useStore();
  const [renders, setRenders] = useState<Renders | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const summary = useMemo(() => buildSummary(s.config, s.field, s.lang, s.units, s.destination, s.transportProfile, s.hidePrices), [s.config, s.field, s.lang, s.units, s.destination, s.transportProfile, s.hidePrices]);
  useEffect(() => {
    let alive = true;
    // si estaba en detalle, volver a la máquina para los renders
    if (useStore.getState().detail) useStore.getState().setDetail(false);
    const id = window.setTimeout(() => getRenders().then((r) => alive && setRenders(r)), 300);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, []);
  const close = () => s.openModal(null);
  const pdf = async () => {
    setPdfBusy(true);
    try {
      const { generateQuotePdf, downloadBlob } = await import('../../services/pdf');
      const r = renders ?? (await getRenders());
      const blob = await generateQuotePdf({ summary, lang: s.lang, renders: r, url: currentShareUrl(), logoUrl: null });
      downloadBlob(blob, `${summary.number}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };
  const share = async () => {
    if ((await shareCurrent()) === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <Modal
      title={t('summary.title')}
      onClose={close}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={share}><IconShare size={16} /> {copied ? t('actions.copied') : t('actions.copyLink')}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { s.saveSlot(s.slots.A ? 'B' : 'A'); s.openModal('compare'); }}><IconCompare size={16} /> {t('actions.compare')}</button>
          <button type="button" className="btn btn-secondary" onClick={pdf} disabled={pdfBusy} data-testid="pdf-btn"><IconPdf size={16} /> {pdfBusy ? t('actions.pdfWorking') : t('actions.pdf')}</button>
          <button type="button" className="btn btn-accent" onClick={() => s.openModal('quote')}>{t('actions.quote')}</button>
        </>
      }
    >
      <div className="sum-meta">
        <span>{t('summary.configNumber')} <strong>{summary.number}</strong></span>
        <span className="seg seg-mini" role="radiogroup" aria-label={t('price.destination')}>
          {(['local', 'export'] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={s.destination === d} className={s.destination === d ? 'is-selected' : ''} onClick={() => s.setDestination(d)}>
              {t(`price.${d}`)}
            </button>
          ))}
        </span>
        <span>{t('summary.date')}: {formatDate(new Date(), s.lang)}</span>
      </div>
      <div className="sum-renders" aria-busy={!renders}>
        {(['front34', 'top', 'transport'] as const).map((k) => (
          <figure key={k} className={`sum-render sum-${k}`}>
            {renders?.[k] ? <img src={renders[k]} alt={t(`summary.views.${k}`)} /> : <div className="sum-skel">{renders ? '—' : t('summary.rendering')}</div>}
            <figcaption>{t(`summary.views.${k}`)}</figcaption>
          </figure>
        ))}
      </div>
      <div className="sum-grid">
        <section>
          <h3 className="sub">{t('summary.choices')}</h3>
          <table className="sum-table">
            <tbody>
              {summary.lines.map((l, i) => (
                <tr key={i}>
                  <th scope="row">{l.label}</th>
                  <td>{l.value}</td>
                  <td className="num">{s.hidePrices ? '' : moneyOrDash(l.amount, s.lang)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t('pdf.total')}</th>
                <td />
                <td className="num"><strong>{summary.totalText}</strong></td>
              </tr>
            </tfoot>
          </table>
          <p className="muted tiny">{summary.legend} {summary.leadTime}.</p>
        </section>
        <section>
          <h3 className="sub">{t('summary.performance')}</h3>
          <dl className="results">
            {summary.perf.map((p, i) => (
              <div key={i}><dt>{p.label}</dt><dd>{p.value}</dd></div>
            ))}
          </dl>
          <h3 className="sub">{t('summary.transport')}</h3>
          <dl className="results">
            {summary.transport.map((p, i) => (
              <div key={i}><dt><span className={`light light-${p.level}`} aria-hidden /> {p.label}</dt><dd>{p.value}</dd></div>
            ))}
          </dl>
          <p className={`tcheck-msg msg-${summary.transportLevel}`}>{summary.transportMsg}</p>
          <p className="muted tiny">{t('perf.legend')} {t('transport.disclaimer')}</p>
        </section>
      </div>
    </Modal>
  );
}
