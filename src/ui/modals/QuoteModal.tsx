import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { useT } from '../../i18n/useT';
import { Modal } from './Modal';
import { buildSummary } from '../../services/summaryData';
import { submitLead, type Channel, type Lead } from '../../services/lead';
import { currentShareUrl } from '../share';
import { IconMail, IconWhatsapp } from '../icons';

type Form = Pick<Lead, 'name' | 'company' | 'country' | 'region' | 'hectares' | 'phone' | 'email' | 'message'>;
const EMPTY: Form = { name: '', company: '', country: '', region: '', hectares: '', phone: '', email: '', message: '' };

export function validateLead(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!f.name.trim()) e.name = 'quote.required';
  if (!f.country.trim()) e.country = 'quote.required';
  if (!f.phone.trim()) e.phone = 'quote.required';
  else if (!/^\+\d[\d\s().-]{6,}$/.test(f.phone.trim())) e.phone = 'quote.invalidPhone';
  if (!f.email.trim()) e.email = 'quote.required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'quote.invalidEmail';
  return e;
}

export default function QuoteModal() {
  const t = useT();
  const s = useStore();
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [sent, setSent] = useState<string | null>(null);
  const summary = useMemo(() => buildSummary(s.config, s.field, s.lang, s.units, s.destination, s.transportProfile, s.hidePrices), [s.config, s.field, s.lang, s.units, s.destination, s.transportProfile, s.hidePrices]);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const send = async (channel: Channel) => {
    const e = validateLead(f);
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(`q-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    const url = currentShareUrl();
    const text = [
      t('quote.waGreeting'),
      `*${summary.title}* — ${summary.number}`,
      ...summary.lines.map((l) => `• ${l.label}: ${l.value}`),
      `• ${t('perf.haH')}: ${summary.perf[2].value} · ${summary.perf[3].label}: ${summary.perf[3].value}`,
      `• ${t('perf.hp')}: ${summary.perf[summary.perf.length - 1].value}`,
      `• ${t('transport.title')}: ${summary.transport.map((x) => `${x.label} ${x.value}`).join(' · ')}`,
      s.hidePrices ? '' : `• ${t('price.label')}: ${summary.totalText} (${summary.legend})`,
      '',
      `${t('quote.name')}: ${f.name}`,
      f.company && `${t('quote.company')}: ${f.company}`,
      `${t('quote.country')}: ${f.country}${f.region ? ` / ${f.region}` : ''}`,
      f.hectares && `${t('quote.hectares')}: ${f.hectares}`,
      `${t('quote.phone')}: ${f.phone}`,
      `${t('quote.email')}: ${f.email}`,
      f.message && `${t('quote.message')}: ${f.message}`,
      '',
      `${t('quote.waFooter')} ${url}`,
    ]
      .filter((x): x is string => typeof x === 'string')
      .join('\n');
    await submitLead(
      { ...f, lang: s.lang, configNumber: summary.number, configUrl: url, summaryText: text, priceUsd: s.hidePrices ? null : summary.total },
      channel,
      t('quote.subject', { model: summary.modelName, number: summary.number }),
    );
    setSent(t('quote.sent', { channel: channel === 'whatsapp' ? 'WhatsApp' : 'Email' }));
  };
  const field = (k: keyof Form, opts: { type?: string; auto?: string; required?: boolean; full?: boolean; inputMode?: 'numeric' | 'tel' | 'email' } = {}) => (
    <label className={`field${opts.full ? ' field-full' : ''}`}>
      <span className="field-label">{t(`quote.${k}`)}{opts.required ? ' *' : ''}</span>
      <input id={`q-${k}`} className={`input${errors[k] ? ' is-invalid' : ''}`} type={opts.type ?? 'text'} autoComplete={opts.auto} inputMode={opts.inputMode} value={f[k]} onChange={set(k)} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `q-${k}-err` : undefined} required={opts.required} />
      {errors[k] && <span className="error" id={`q-${k}-err`}>{t(errors[k]!)}</span>}
    </label>
  );
  return (
    <Modal
      title={t('quote.title')}
      onClose={() => s.openModal(null)}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => send('email')}><IconMail size={16} /> {t('quote.sendEmail')}</button>
          <button type="button" className="btn btn-whatsapp" onClick={() => send('whatsapp')}><IconWhatsapp size={16} /> {t('quote.sendWhatsapp')}</button>
        </>
      }
    >
      <p className="muted">{t('quote.intro')}</p>
      <div className="quote-config"><strong>{summary.title}</strong> · {summary.number}{!s.hidePrices && <> · {summary.totalText}</>}</div>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); send('whatsapp'); }} noValidate>
        {field('name', { auto: 'name', required: true })}
        {field('company', { auto: 'organization' })}
        {field('country', { auto: 'country-name', required: true })}
        {field('region', { auto: 'address-level1' })}
        {field('hectares', { type: 'number', inputMode: 'numeric' })}
        {field('phone', { type: 'tel', auto: 'tel', required: true, inputMode: 'tel' })}
        {field('email', { type: 'email', auto: 'email', required: true, inputMode: 'email', full: true })}
        <label className="field field-full">
          <span className="field-label">{t('quote.message')}</span>
          <textarea className="input" rows={3} value={f.message} onChange={set('message')} />
        </label>
      </form>
      {sent && <p className="success" role="status">{sent}</p>}
      <p className="muted tiny">{t('quote.privacy')}</p>
    </Modal>
  );
}
