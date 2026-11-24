import { Fragment, useMemo, useState } from 'react';
import { priceBreakdown } from '@/core/pricing';
import { configHash } from '@/core/serialize';
import { computeSpecs } from '@/core/specs';
import { useI18n } from '@/i18n';
import { compareConfigs } from '@/lead/compare';
import { quoteSubtitle, typeName } from '@/lead/quote';
import { useStore, type Snapshot } from '@/state/store';
import { captureThumb } from '@/three/capture';
import { Icon } from '../Icon';
import { Button, Modal, Switch } from '../primitives';

type Slot = 'a' | 'b';

/** Comparador A/B: dos configuraciones lado a lado con sus diferencias. */
export default function CompareModal() {
  const { t, n, money, lang } = useI18n();
  const compare = useStore((s) => s.compare);
  const config = useStore((s) => s.config);
  const hide = useStore((s) => s.ui.preciosOcultos);
  const saveSnapshot = useStore((s) => s.saveSnapshot);
  const loadConfig = useStore((s) => s.loadConfig);
  const setUi = useStore((s) => s.setUi);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const close = () => setUi({ modal: null });

  const result = useMemo(() => (compare.a && compare.b ? compareConfigs(compare.a.config, compare.b.config, lang) : null), [compare.a, compare.b, lang]);

  const saveCurrent = (slot: Slot) => saveSnapshot(slot, { config, thumb: captureThumb(), at: Date.now() });
  const view = (snap: Snapshot) => {
    loadConfig(snap.config);
    close();
  };

  const card = (slot: Slot) => {
    const snap = compare[slot];
    const letter = slot.toUpperCase();
    if (!snap) {
      return (
        <article className="cmp-card is-empty" data-slot={slot}>
          <span className="cmp-letter">{letter}</span>
          <p className="muted">{t('comparar.slotVacio', { slot: letter })}</p>
          <Button variant="primario" icon="guardar" onClick={() => saveCurrent(slot)} data-testid={`cmp-guardar-${slot}`}>
            {t('comparar.guardarActual', { slot: letter })}
          </Button>
        </article>
      );
    }
    const price = priceBreakdown(snap.config);
    const specs = computeSpecs(snap.config);
    return (
      <article className="cmp-card" data-slot={slot}>
        <div className="cmp-thumb">
          {snap.thumb ? <img src={snap.thumb} alt={`${letter}: ${typeName(snap.config, lang)}`} /> : <Icon name="caja" size={36} />}
          <span className="cmp-letter">{letter}</span>
        </div>
        <div className="cmp-info">
          <h3>{typeName(snap.config, lang)}</h3>
          <p className="muted">{quoteSubtitle(snap.config, lang)}</p>
          <p className="nota tnum">{configHash(snap.config)}</p>
          <dl className="cmp-kpis">
            {hide ? null : (
              <div>
                <dt>{t('comparar.precio')}</dt>
                <dd data-testid={`cmp-precio-${slot}`}>{money(price.totalUsd)}</dd>
              </div>
            )}
            <div>
              <dt>{t('comparar.tara')}</dt>
              <dd>{n(specs.taraKg)} kg</dd>
            </div>
            <div>
              <dt>{t('comparar.cargaUtil')}</dt>
              <dd>{n(specs.cargaUtilKg)} kg</dd>
            </div>
          </dl>
        </div>
        <div className="cmp-actions">
          <Button icon="ojo" onClick={() => view(snap)} data-testid={`cmp-ver-${slot}`}>
            {t('comparar.ver')}
          </Button>
          <Button variant="fantasma" icon="guardar" onClick={() => saveCurrent(slot)} title={t('comparar.reemplazar', { slot: letter })} aria-label={t('comparar.reemplazar', { slot: letter })} />
          <Button variant="fantasma" icon="x" onClick={() => saveSnapshot(slot, null)} data-testid={`cmp-quitar-${slot}`}>
            {t('comparar.quitar')}
          </Button>
        </div>
      </article>
    );
  };

  const empty = !compare.a && !compare.b;
  const signed = (v: number, unit: string) => `${v > 0 ? '+ ' : v < 0 ? '− ' : ''}${n(Math.abs(v))} ${unit}`;
  /** Menor precio y menor tara son buenos; más carga útil es buena. */
  const tone = (v: number, lowerIsBetter: boolean) => (v === 0 ? '' : v < 0 === lowerIsBetter ? 'is-good' : 'is-bad');

  let lastSection = '';
  const rows = result ? result.rows.filter((r) => !onlyDiff || r.differs) : [];

  return (
    <Modal open wide onClose={close} title={t('comparar.titulo')}>
      <div className="cmp" data-testid="comparar">
        {empty ? (
          <div className="callout cmp-intro">
            <Icon name="comparar" size={20} />
            <div>
              <strong>{t('comparar.vacio.titulo')}</strong>
              <p>{t('comparar.vacio.texto')}</p>
            </div>
          </div>
        ) : null}
        <div className="cmp-cards">
          {card('a')}
          {card('b')}
        </div>

        {result ? (
          <>
            <section className="cmp-delta" aria-label={t('comparar.diferencias')}>
              <h3>{t('comparar.diferencias')}</h3>
              <dl>
                {hide ? null : (
                  <div className={tone(result.delta.precioUsd, true)}>
                    <dt>{t('comparar.precio')}</dt>
                    <dd data-testid="cmp-delta-precio">{result.delta.precioUsd === 0 ? t('comparar.sinCambio') : money(result.delta.precioUsd, true)}</dd>
                  </div>
                )}
                <div className={tone(result.delta.taraKg, true)}>
                  <dt>{t('comparar.tara')}</dt>
                  <dd data-testid="cmp-delta-tara">{result.delta.taraKg === 0 ? t('comparar.sinCambio') : signed(result.delta.taraKg, 'kg')}</dd>
                </div>
                <div className={tone(result.delta.cargaUtilKg, false)}>
                  <dt>{t('comparar.cargaUtil')}</dt>
                  <dd data-testid="cmp-delta-carga">{result.delta.cargaUtilKg === 0 ? t('comparar.sinCambio') : signed(result.delta.cargaUtilKg, 'kg')}</dd>
                </div>
              </dl>
            </section>

            <div className="cmp-toggle">
              <span id="cmp-only">{t('comparar.soloDiferencias')}</span>
              <Switch checked={onlyDiff} onChange={setOnlyDiff} label={t('comparar.soloDiferencias')} />
            </div>
            {result.identical ? <p className="callout">{t('comparar.iguales')}</p> : null}
            <div className="cmp-scroll">
              <table className="tabla cmp-tabla">
                <thead>
                  <tr>
                    <th scope="col">{t('comparar.concepto')}</th>
                    <th scope="col">A</th>
                    <th scope="col">B</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const head = r.section !== lastSection && r.key !== 'tipo';
                    lastSection = r.section;
                    return (
                      <Fragment key={r.key}>
                        {head ? (
                          <tr className="grupo">
                            <th scope="colgroup" colSpan={3}>
                              {r.section}
                            </th>
                          </tr>
                        ) : null}
                        <tr className={r.differs ? 'dif' : ''} data-row={r.key} data-dif={r.differs}>
                          <td className="muted">{r.label}</td>
                          <td>{r.a ?? <span className="muted">{t('comparar.noAplica')}</span>}</td>
                          <td>{r.b ?? <span className="muted">{t('comparar.noAplica')}</span>}</td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : !empty ? (
          <p className="callout">
            <Icon name="info" size={18} />
            {t('comparar.vacio.texto')}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
