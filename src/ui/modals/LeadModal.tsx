import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { configHash } from '@/core/serialize';
import { useI18n } from '@/i18n';
import { buildLeadLinks, EMPTY_LEAD, PROVINCIAS, validateLead, type Lead, type LeadContext, type LeadErrors, type LeadField, type LeadLinks } from '@/lead/message';
import { typeName } from '@/lead/quote';
import { submitLead, type LeadChannel } from '@/lead/submitLead';
import { usePrice } from '@/state/derived';
import { useStore } from '@/state/store';
import { captureRenderSet, whenModelCurrent } from '@/three/capture';
import { Icon } from '../Icon';
import { LegalBanner } from '../TechPanel';
import { Button, Modal } from '../primitives';

/** Lo que la persona ya escribió se conserva si cierra y vuelve a abrir el formulario. */
let draft: Lead = { ...EMPTY_LEAD };

const ORDER: LeadField[] = ['nombre', 'empresa', 'cuit', 'provincia', 'telefono', 'email', 'comentario'];

/** Formulario de consulta: abre WhatsApp o el correo con todo precargado. No depende del visor 3D. */
export default function LeadModal() {
  const { t, money, lang, units } = useI18n();
  const config = useStore((s) => s.config);
  const hide = useStore((s) => s.ui.preciosOcultos);
  const moneda = useStore((s) => s.ui.moneda);
  const setUi = useStore((s) => s.setUi);
  const price = usePrice();
  const uid = useId();
  const form = useRef<HTMLFormElement>(null);
  const [lead, setLead] = useState<Lead>(draft);
  const [errors, setErrors] = useState<LeadErrors>({});
  const [sent, setSent] = useState<{ canal: LeadChannel; links: LeadLinks } | null>(null);
  const [busy, setBusy] = useState(false);
  const numero = useMemo(() => configHash(config), [config]);
  const close = () => setUi({ modal: null });

  const set = (field: LeadField, value: string) => {
    const next = { ...lead, [field]: value };
    draft = next;
    setLead(next);
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const context = (): LeadContext => ({ config, lang, moneda, units, hidePrices: hide, href: window.location.href });

  const send = (canal: LeadChannel) => {
    const found = validateLead(lead);
    setErrors(found);
    const firstBad = ORDER.find((f) => found[f]);
    if (firstBad) {
      form.current?.querySelector<HTMLElement>(`[name="${firstBad}"]`)?.focus();
      return;
    }
    const ctx = context();
    const links = buildLeadLinks(lead, ctx);
    // La ventana se abre dentro del gesto del usuario para que el navegador no la bloquee.
    if (canal === 'whatsapp') window.open(links.whatsapp, '_blank', 'noopener,noreferrer');
    else window.location.href = links.mailto;
    void submitLead(lead, ctx, canal).catch((e) => console.error('[configurador] submitLead', e));
    setSent({ canal, links });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send('whatsapp');
  };

  const downloadPdf = async () => {
    setBusy(true);
    try {
      const { downloadQuotePdf } = await import('@/pdf/quotePdf');
      await whenModelCurrent();
      await downloadQuotePdf({ config, lang, moneda, units, hidePrices: hide, renders: captureRenderSet(), lead, href: window.location.href });
    } catch (e) {
      console.error('[configurador] no se pudo generar el PDF', e);
    } finally {
      setBusy(false);
    }
  };

  const field = (name: LeadField, opts: { type?: string; required?: boolean; autoComplete?: string; inputMode?: 'tel' | 'email' | 'numeric' | 'text'; placeholder?: string; maxLength?: number } = {}) => {
    const id = `${uid}-${name}`;
    const err = errors[name];
    return (
      <div className="field">
        <label htmlFor={id}>
          {t(`lead.${name}`)}
          {opts.required ? <span aria-hidden="true"> *</span> : <span className="lead-opt"> ({t('lead.opcional')})</span>}
        </label>
        <input
          id={id}
          name={name}
          className={`input ${err ? 'is-error' : ''}`}
          type={opts.type ?? 'text'}
          inputMode={opts.inputMode}
          autoComplete={opts.autoComplete}
          placeholder={opts.placeholder}
          maxLength={opts.maxLength ?? 80}
          required={opts.required}
          aria-required={opts.required}
          aria-invalid={!!err}
          aria-describedby={err ? `${id}-err` : undefined}
          value={lead[name]}
          onChange={(e) => set(name, e.target.value)}
        />
        {err ? (
          <p className="field-error" id={`${id}-err`} role="alert">
            {t(err)}
          </p>
        ) : null}
      </div>
    );
  };

  if (sent) {
    const again = sent.canal === 'whatsapp' ? sent.links.whatsapp : sent.links.mailto;
    return (
      <Modal open onClose={close} title={t('lead.exito.titulo')}>
        <div className="lead-ok" data-testid="lead-exito" role="status">
          <span className="lead-ok-icon">
            <Icon name="check" size={30} />
          </span>
          <p>{t(sent.canal === 'whatsapp' ? 'lead.exito.whatsapp' : 'lead.exito.email')}</p>
          <a className="lead-link" href={again} target={sent.canal === 'whatsapp' ? '_blank' : undefined} rel="noopener noreferrer" data-testid="lead-reabrir">
            {t('lead.exito.reabrir')}
          </a>
          <div className="lead-ok-actions">
            <Button icon="pdf" onClick={() => void downloadPdf()} disabled={busy} data-testid="lead-pdf">
              {busy ? t('resumen.pdfGenerando') : t('lead.exito.pdf')}
            </Button>
            <Button variant="primario" onClick={close}>
              {t('lead.exito.volver')}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  const provId = `${uid}-provincia`;
  const comId = `${uid}-comentario`;
  const hasErrors = Object.values(errors).some(Boolean);
  return (
    <Modal
      open
      onClose={close}
      title={t('lead.titulo')}
      footer={
        <>
          <Button icon="mail" onClick={() => send('email')} data-testid="lead-email">
            {t('lead.enviarEmail')}
          </Button>
          <Button variant="primario" icon="whatsapp" onClick={() => send('whatsapp')} data-testid="lead-whatsapp">
            {t('lead.enviarWhatsapp')}
          </Button>
        </>
      }
    >
      <form ref={form} className="lead" noValidate onSubmit={onSubmit} data-testid="lead-form">
        <LegalBanner />
        <p className="muted">{t('lead.intro')}</p>
        <div className="lead-equipo">
          <span className="muted">{t('lead.equipo')}</span>
          <strong>{typeName(config, lang)}</strong>
          <span className="tnum">
            {numero}
            {hide ? '' : ` · ${money(price.totalUsd)}`}
          </span>
        </div>
        {hasErrors ? (
          <p className="callout warn" role="alert">
            <Icon name="alerta" size={18} />
            {t('lead.errores')}
          </p>
        ) : null}
        <div className="grid-2">
          {field('nombre', { required: true, autoComplete: 'name' })}
          {field('empresa', { autoComplete: 'organization' })}
          {field('cuit', { inputMode: 'numeric', placeholder: '30-12345678-9', maxLength: 13 })}
          <div className="field">
            <label htmlFor={provId}>
              {t('lead.provincia')}
              <span aria-hidden="true"> *</span>
            </label>
            <select id={provId} name="provincia" className={`input ${errors.provincia ? 'is-error' : ''}`} required aria-required aria-invalid={!!errors.provincia} aria-describedby={errors.provincia ? `${provId}-err` : undefined} autoComplete="address-level1" value={lead.provincia} onChange={(e) => set('provincia', e.target.value)}>
              <option value="">{t('lead.provinciaElegir')}</option>
              {PROVINCIAS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {errors.provincia ? (
              <p className="field-error" id={`${provId}-err`} role="alert">
                {t(errors.provincia)}
              </p>
            ) : null}
          </div>
          {field('telefono', { required: true, type: 'tel', inputMode: 'tel', autoComplete: 'tel', placeholder: '341 555-0123', maxLength: 30 })}
          {field('email', { required: true, type: 'email', inputMode: 'email', autoComplete: 'email', maxLength: 120 })}
        </div>
        <div className="field">
          <label htmlFor={comId}>
            {t('lead.comentario')}
            <span className="lead-opt"> ({t('lead.opcional')})</span>
          </label>
          <textarea id={comId} name="comentario" className="input" rows={3} maxLength={600} placeholder={t('lead.comentarioPlaceholder')} value={lead.comentario} onChange={(e) => set('comentario', e.target.value)} />
        </div>
        <p className="nota">{t('lead.privacidad')}</p>
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          {t('lead.enviarWhatsapp')}
        </button>
      </form>
    </Modal>
  );
}
