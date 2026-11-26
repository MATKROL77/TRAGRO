import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { useT } from '../../i18n/useT';
import { Modal } from './Modal';
import { buildSummary } from '../../services/summaryData';
import { submitLead, type Channel, type Lead } from '../../services/lead';
import { currentShareUrl } from '../share';
import { IconMail, IconWhatsapp } from '../icons';
import brand from '../../config/brand.json';

type Form = Pick<Lead, 'name' | 'company' | 'country' | 'region' | 'hectares' | 'phone' | 'email' | 'message'>;
const EMPTY: Form = { name: '', company: '', country: '', region: '', hectares: '', phone: '', email: '', message: '' };
const COUNTRY_BY_LANG: Record<string, string> = { 'es-AR': 'Argentina', 'pt-BR': 'Brasil' };
const HECTARES = ['<500', '500–2000', '2000+'];

/**
 * Por WhatsApp el teléfono llega solo: alcanza con el nombre. Por email hace falta el email.
 * Teléfono y email, si se completan, se validan.
 */
export function validateLead(f: Form, channel: Channel = 'whatsapp'): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!f.name.trim()) e.name = 'quote.required';
  if (f.phone.trim() && !/^\+?\d[\d\s().-]{6,}$/.test(f.phone.trim())) e.phone = 'quote.invalidPhone';
  if (channel === 'email' && !f.email.trim()) e.email = 'quote.required';
  else if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'quote.invalidEmail';
  return e;
}

export default function QuoteModal() {
  const t = useT();
  const s = useStore();
  const [f, setF] = useState<Form>(() => ({ ...EMPTY, country: COUNTRY_BY_LANG[useStore.getState().lang] ?? '' }));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [sent, setSent] = useState<string | null>(null);
  const summary = useMemo(() => buildSummary(s.config, s.field, s.lang, s.units, s.destination, s.transportProfile, s.hidePrices), [s.config, s.field, s.lang, s.units, s.destination, s.transportProfile, s.hidePrices]);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const send = async (channel: Channel) => {
    const e = validateLead(f, channel);
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(`q-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    const url = currentShareUrl();
    const L = (k: string) => t(`quote.${k}`).replace(/\s*\(.*\)\s*$/, '');
    const text = [
      t('quote.waGreeting'),
      `*${summary.title}* — ${summary.number}`,
      ...summary.lines.map((l) => `• ${l.label}: ${l.value}`),
      `• ${t('perf.haH')}: ${summary.perf[2].value} · ${summary.perf[3].label}: ${summary.perf[3].value}`,
      `• ${t('perf.hp')}: ${summary.perf[summary.perf.length - 1].value}`,
      `• ${t('transport.title')}: ${summary.transport.map((x) => `${x.label} ${x.value}`).join(' · ')}`,
      s.hidePrices ? '' : `• ${t('price.label')}: ${summary.totalText} (${summary.legend})`,
      '',
      `${L('name')}: ${f.name}`,
      f.company && `${L('company')}: ${f.company}`,
      (f.country || f.region) && `${L('country')}: ${[f.country, f.region].filter(Boolean).join(' / ')}`,
      f.hectares && `${L('hectares')}: ${f.hectares} ha`,
      f.phone && `${L('phone')}: ${f.phone}`,
      f.email && `${L('email')}: ${f.email}`,
      f.message && `${L('message')}: ${f.message}`,
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
      {brand.demo && <p className="demo-note" role="note">{t('quote.demoNote')}</p>}
      <div className="quote-config"><strong>{summary.title}</strong> · {summary.number}{!s.hidePrices && <> · {summary.totalText}</>}</div>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); send('whatsapp'); }} noValidate>
        {field('name', { auto: 'name', required: true })}
        {field('region', { auto: 'address-level2' })}
        {field('country', { auto: 'country-name' })}
        {field('company', { auto: 'organization' })}
        <fieldset className="field field-full ha-field">
          <legend className="field-label">{t('quote.hectares')}</legend>
          <div className="chips" role="radiogroup" aria-label={t('quote.hectares')}>
            {HECTARES.map((h) => (
              <button key={h} type="button" role="radio" aria-checked={f.hectares === h} className={`chip${f.hectares === h ? ' is-selected' : ''}`} onClick={() => setF({ ...f, hectares: f.hectares === h ? '' : h })}>
                {h} ha
              </button>
            ))}
          </div>
        </fieldset>
        {field('phone', { type: 'tel', auto: 'tel', inputMode: 'tel' })}
        {field('email', { type: 'email', auto: 'email', inputMode: 'email' })}
        <p className="muted tiny field-full">{t('quote.whichFields')}</p>
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
