import { useStore } from '../state/store';
import { buildShareUrl } from '../domain/url';

export function currentShareUrl(): string {
  const s = useStore.getState();
  const base = window.location.origin + window.location.pathname.replace(/\/embed\/?$/, '/');
  return buildShareUrl(base, { config: s.config, lang: s.lang, units: s.units });
}

/** Comparte con la API nativa (celular) o copia al portapapeles. */
export async function shareCurrent(): Promise<'shared' | 'copied' | 'failed'> {
  const url = currentShareUrl();
  try {
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ url, title: document.title });
      return 'shared';
    }
  } catch {
    /* cancelado: probamos copiar */
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    window.prompt('URL', url);
    return 'failed';
  }
}
