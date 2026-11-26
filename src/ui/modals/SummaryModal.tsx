import { Fragment, useEffect, useMemo, useState } from 'react';
import { pricing } from '@/core/catalog';
import { configHash } from '@/core/serialize';
import { useI18n } from '@/i18n';
import { formatDate, quoteGroups, quoteSubtitle, typeName } from '@/lead/quote';
import { usePrice, useSpecs } from '@/state/derived';
import { useStore } from '@/state/store';
import { captureRenderSetRefined, captureThumb, whenModelCurrent, type RenderSet } from '@/three/capture';
import { Icon } from '../Icon';
import { Button, Modal, StatusDot } from '../primitives';
import { LegalBanner, TechBody } from '../TechPanel';

const VIEWS: (keyof RenderSet)[] = ['tresCuartos', 'lateral', 'trasero'];

/** Resumen: renders automáticos, todas las elecciones con precio, ficha técnica y acciones. */
export default function SummaryModal() {
  const { t, n, money, moneyIn, lang, units } = useI18n();
  const config = useStore((s) => s.config);
  const hide = useStore((s) => s.ui.preciosOcultos);
  const moneda = useStore((s) => s.ui.moneda);
  const setUi = useStore((s) => s.setUi);
  const saveSnapshot = useStore((s) => s.saveSnapshot);
  const price = usePrice();
  const specs = useSpecs();
  const [renders, setRenders] = useState<RenderSet | null>(null);
  const [pending, setPending] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [saved, setSaved] = useState<'A' | 'B' | null>(null);

  // Los renders se generan una sola vez, después de pintar el modal.
  useEffect(() => {
    const id = window.setTimeout(() => {
      void whenModelCurrent()
        .then(() => captureRenderSetRefined())
        .then(setRenders);
      setPending(false);
    }, 90);
    return () => window.clearTimeout(id);
  }, []);

  const groups = useMemo(() => quoteGroups(config, lang, price, units), [config, lang, price, units]);
  const numero = useMemo(() => configHash(config), [config]);
  const other = moneda === 'USD' ? 'ARS' : 'USD';
  const hasRenders = !!renders && VIEWS.some((v) => renders[v]);
  const close = () => setUi({ modal: null });

  const downloadPdf = async () => {
    setBusy(true);
    setPdfError(false);
    try {
      const { downloadQuotePdf } = await import('@/pdf/quotePdf');
      const st = useStore.getState();
      await downloadQuotePdf({ config: st.config, lang: st.ui.lang, moneda: st.ui.moneda, units: st.ui.unidades, hidePrices: st.ui.preciosOcultos, renders: renders ?? (await captureRenderSetRefined()), href: window.location.href });
    } catch (e) {
      console.error('[configurador] no se pudo generar el PDF', e);
      setPdfError(true);
    } finally {
      setBusy(false);
    }
  };

  const save = (slot: 'a' | 'b') => {
    saveSnapshot(slot, { config, thumb: renders?.tresCuartos ?? captureThumb(), at: Date.now() });
    setSaved(slot === 'a' ? 'A' : 'B');
  };

  const priceCell = (usd: number, estandar: boolean, base: boolean) => (usd === 0 ? <span className="muted">{estandar ? t('comun.estandar') : t('comun.incluido')}</span> : money(usd, !base));

  return (
    <Modal
      open
      wide
      onClose={close}
      title={t('resumen.titulo')}
      footer={
        <div className="sum-actions">
          <Button icon="link" onClick={() => setUi({ modal: 'compartir' })} data-testid="sum-compartir">
            {t('resumen.compartir')}
          </Button>
          <Button icon="pdf" onClick={() => void downloadPdf()} disabled={busy} data-testid="sum-pdf">
            {busy ? t('resumen.pdfGenerando') : t('resumen.pdf')}
          </Button>
          <Button variant="primario" onClick={() => setUi({ modal: 'cotizar' })} data-testid="sum-cotizar">
            {t('barra.cotizar')}
          </Button>
        </div>
      }
    >
      <div className="sum" data-testid="resumen">
        <LegalBanner />
        <header className="sum-head">
          <div>
            <h3>{typeName(config, lang)}</h3>
            <p className="muted">{quoteSubtitle(config, lang, units)}</p>
          </div>
          <dl className="sum-meta">
            <div>
              <dt>{t('pdf.numero')}</dt>
              <dd data-testid="sum-numero">{numero}</dd>
            </div>
            <div>
              <dt>{t('pdf.fecha')}</dt>
              <dd>{formatDate(lang, new Date())}</dd>
            </div>
            <div>
              <dt>{t('resumen.plazo')}</dt>
              <dd>{t('comun.dias', { n: specs.plazoDias })}</dd>
            </div>
          </dl>
        </header>

        <div className="sum-grid">
          <section aria-label={t('resumen.vistas')}>
            {pending ? (
              <div className="renders sum-skeleton" aria-busy="true">
                <span />
                <span />
                <span />
                <p className="muted">{t('resumen.generando')}</p>
              </div>
            ) : hasRenders && renders ? (
              <div className="renders" data-testid="sum-renders">
                {VIEWS.map((v) => (renders[v] ? <img key={v} src={renders[v] as string} alt={t(`resumen.vista.${v}`)} /> : null))}
              </div>
            ) : (
              <p className="callout">
                <Icon name="info" size={18} />
                {t('resumen.sinVistas')}
              </p>
            )}
            <h4 className="sum-h">
              <StatusDot level={specs.level} />
              {t('resumen.tecnico')}
            </h4>
            <div className="sum-tech">
              <TechBody s={specs} />
            </div>
          </section>

          <section aria-label={t('resumen.configuracion')}>
            <h4 className="sum-h">{t('resumen.configuracion')}</h4>
            <table className="tabla sum-tabla">
              <thead>
                <tr>
                  <th scope="col">{t('resumen.concepto')}</th>
                  <th scope="col">{t('resumen.eleccion')}</th>
                  {hide ? null : (
                    <th scope="col" className="num">
                      {t('resumen.precio')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.paso}>
                    <tr className="grupo">
                      <th scope="colgroup" colSpan={hide ? 2 : 3}>
                        {g.name}
                      </th>
                    </tr>
                    {g.rows.map((r) => (
                      <tr key={r.key} data-row={r.key}>
                        <td className="muted">{r.label}</td>
                        <td>{r.detail}</td>
                        {hide ? null : <td className="num">{priceCell(r.usd, r.estandar, r.key === 'base')}</td>}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <div className="sum-total">
              <span>{t('resumen.total')}</span>
              <strong data-testid="sum-total">{hide ? t('resumen.aConsultar') : money(price.totalUsd)}</strong>
              {hide ? null : (
                <p className="nota">
                  {t('resumen.equivalente', { monto: moneyIn(price.totalUsd, other) })}. {t('resumen.tipoCambio', { valor: `$ ${n(pricing.tipoDeCambio.arsPorUsd)}`, fecha: formatDate(lang, new Date(`${pricing.tipoDeCambio.fecha}T12:00:00`)) })}
                </p>
              )}
              <p className="nota">{t('barra.leyenda')}</p>
            </div>
            <div className="sum-save" role="group" aria-label={t('resumen.guardar')}>
              <span>
                <Icon name="comparar" size={18} />
                {t('resumen.guardar')}
              </span>
              <Button icon="guardar" onClick={() => save('a')} data-testid="sum-guardar-a">
                A
              </Button>
              <Button icon="guardar" onClick={() => save('b')} data-testid="sum-guardar-b">
                B
              </Button>
            </div>
            <div aria-live="polite">
              {saved ? (
                <p className="callout" data-testid="sum-guardado">
                  <Icon name="check" size={18} />
                  {t('resumen.guardado', { slot: saved })}
                </p>
              ) : null}
              {pdfError ? (
                <p className="callout warn" role="alert">
                  <Icon name="alerta" size={18} />
                  {t('resumen.pdfError')}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}
