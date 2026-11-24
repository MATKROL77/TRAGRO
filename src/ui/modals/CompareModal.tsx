import { useStore } from '../../state/store';
import { useT } from '../../i18n/useT';
import { useFmt } from '../format';
import { Modal } from './Modal';
import { computePrice } from '../../domain/pricing';
import { computePerformance } from '../../domain/agronomy';
import { checkTransport } from '../../domain/transport';
import { configNumber } from '../../domain/url';
import type { Configuration } from '../../domain/types';

export default function CompareModal() {
  const t = useT();
  const f = useFmt();
  const s = useStore();
  const cols: { key: string; label: string; cfg?: Configuration }[] = [
    { key: 'A', label: t('compare.slotA'), cfg: s.slots.A },
    { key: 'B', label: t('compare.slotB'), cfg: s.slots.B },
    { key: 'C', label: t('compare.current'), cfg: s.config },
  ];
  const data = cols.map((c) => {
    if (!c.cfg) return null;
    const price = computePrice(c.cfg, s.destination).total;
    const p = computePerformance(c.cfg, s.field);
    const tr = checkTransport(c.cfg, s.transportProfile);
    return { price, width: p.widthM, haH: p.haPerHour, weight: p.weight.emptyKg, hp: p.hp, tr, number: configNumber(c.cfg) };
  });
  const best = (k: 'price' | 'weight' | 'haH' | 'width', higher: boolean) => {
    const vals = data.map((d) => (d ? d[k] : NaN)).filter((v) => !Number.isNaN(v));
    return higher ? Math.max(...vals) : Math.min(...vals);
  };
  const cell = (v: number, k: 'price' | 'weight' | 'haH' | 'width', higher: boolean, text: string) => (
    <span className={v === best(k, higher) && data.filter(Boolean).length > 1 ? 'is-best' : ''}>{text}</span>
  );
  return (
    <Modal title={t('compare.title')} onClose={() => s.openModal(null)} wide footer={
      <>
        <button type="button" className="btn btn-secondary" onClick={() => s.saveSlot('A')}>{t('actions.saveA')}</button>
        <button type="button" className="btn btn-secondary" onClick={() => s.saveSlot('B')}>{t('actions.saveB')}</button>
      </>
    }>
      {!s.slots.A && !s.slots.B && <p className="muted">{t('compare.empty')}</p>}
      <div className="cmp-wrap">
        <table className="cmp">
          <thead>
            <tr>
              <th />
              {cols.map((c, i) => (
                <th key={c.key} scope="col">
                  {c.label}
                  {c.cfg && <span className="muted tiny block">{t(`models.${c.cfg.model}.name`)} · {c.cfg.rows}×{f.q(c.cfg.spacingCm, 'lengthCm', 1)} · {data[i]?.number}</span>}
                  {c.cfg && c.key !== 'C' && <button type="button" className="link small" onClick={() => { s.loadConfig(c.cfg!); s.openModal(null); }}>{t('actions.loadThis')}</button>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!s.hidePrices && (
              <tr><th scope="row">{t('compare.price')}</th>{data.map((d, i) => <td key={i}>{d ? cell(d.price, 'price', false, f.money(d.price)) : '—'}</td>)}</tr>
            )}
            <tr><th scope="row">{t('compare.width')}</th>{data.map((d, i) => <td key={i}>{d ? cell(d.width, 'width', true, f.q(d.width, 'length', 2)) : '—'}</td>)}</tr>
            <tr><th scope="row">{t('compare.haH')}</th>{data.map((d, i) => <td key={i}>{d ? cell(d.haH, 'haH', true, f.q(d.haH, 'areaRate', 2)) : '—'}</td>)}</tr>
            <tr><th scope="row">{t('compare.weight')}</th>{data.map((d, i) => <td key={i}>{d ? cell(d.weight, 'weight', false, f.q(d.weight, 'mass', 0)) : '—'}</td>)}</tr>
            <tr><th scope="row">{t('compare.hp')}</th>{data.map((d, i) => <td key={i}>{d ? `${d.hp.min}–${d.hp.max} ${t('perf.hpUnit')}` : '—'}</td>)}</tr>
            <tr><th scope="row">{t('compare.transport')}</th>{data.map((d, i) => <td key={i}>{d ? <><span className={`light light-${d.tr.level}`} aria-hidden /> {t(`transport.mode.${d.tr.mode}`)} · {f.q(d.tr.width.value, 'length', 2)} × {f.q(d.tr.height.value, 'length', 2)}</> : '—'}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
