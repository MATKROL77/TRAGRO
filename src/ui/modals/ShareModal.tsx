import { useMemo, useRef, useState } from 'react';
import { configHash, shareUrl } from '@/core/serialize';
import { useI18n } from '@/i18n';
import { typeName } from '@/lead/quote';
import { embedSnippet } from '@/lead/share';
import { useStore } from '@/state/store';
import { Icon } from '../Icon';
import { Button, Modal } from '../primitives';

async function copyText(text: string, fallbackEl: HTMLInputElement | HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      fallbackEl?.focus();
      fallbackEl?.select();
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

/** Link compartible con la configuración codificada + código para embeber. */
export default function ShareModal() {
  const { t, lang } = useI18n();
  const config = useStore((s) => s.config);
  const setUi = useStore((s) => s.setUi);
  const input = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const [failed, setFailed] = useState(false);

  const { url, logoIncluded, snippet, message } = useMemo(() => {
    const s = shareUrl(config, window.location.href);
    const u = new URL(s.url);
    // El link compartido siempre abre el configurador normal (sin modo vendedor).
    u.searchParams.delete('modo');
    const code = u.searchParams.get('c') ?? '';
    return {
      url: u.toString(),
      logoIncluded: s.logoIncluded,
      snippet: embedSnippet(u.toString(), code, t('app.titulo')),
      message: t('compartir.mensaje', { tipo: typeName(config, lang), numero: configHash(config) }),
    };
  }, [config, lang, t]);

  const copy = async (what: 'link' | 'code') => {
    const ok = await copyText(what === 'link' ? url : snippet, what === 'link' ? input.current : area.current);
    setFailed(!ok);
    setCopied(ok ? what : null);
    if (ok) window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 2600);
  };

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const wa = `https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`;

  return (
    <Modal open onClose={() => setUi({ modal: null })} title={t('compartir.titulo')}>
      <div className="share" data-testid="compartir">
        <p className="muted">{t('compartir.intro')}</p>
        <div className="field">
          <label htmlFor="share-link">{t('compartir.link')}</label>
          <div className="share-row">
            <input id="share-link" ref={input} className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} data-testid="share-url" />
            <Button variant="primario" icon={copied === 'link' ? 'check' : 'link'} onClick={() => void copy('link')} data-testid="share-copiar">
              {copied === 'link' ? t('comun.copiado') : t('compartir.copiar')}
            </Button>
          </div>
        </div>
        <div aria-live="polite">
          {failed ? (
            <p className="field-error" role="alert">
              {t('compartir.errorCopiar')}
            </p>
          ) : null}
        </div>
        {logoIncluded ? null : (
          <p className="callout warn" data-testid="share-logo-aviso">
            <Icon name="alerta" size={18} />
            {t('compartir.logoNoViaja')}
          </p>
        )}
        <div className="share-actions">
          <a className="btn btn-secundario btn-md" href={wa} target="_blank" rel="noopener noreferrer" data-testid="share-whatsapp">
            <Icon name="whatsapp" size={18} />
            <span>{t('compartir.whatsapp')}</span>
          </a>
          {canShare ? (
            <Button icon="compartir" onClick={() => void navigator.share({ title: message, text: message, url }).catch(() => undefined)}>
              {t('compartir.mas')}
            </Button>
          ) : null}
        </div>
        <details className="share-web">
          <summary>{t('compartir.web.titulo')}</summary>
          <p className="muted">{t('compartir.web.texto')}</p>
          <textarea ref={area} className="input share-code" readOnly rows={4} value={snippet} aria-label={t('compartir.web.titulo')} onFocus={(e) => e.currentTarget.select()} data-testid="share-snippet" />
          <Button icon={copied === 'code' ? 'check' : 'link'} onClick={() => void copy('code')}>
            {copied === 'code' ? t('comun.copiado') : t('compartir.web.copiar')}
          </Button>
        </details>
      </div>
    </Modal>
  );
}
