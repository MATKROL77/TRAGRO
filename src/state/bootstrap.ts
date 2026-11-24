import { useStore } from './store';
import { parseShareUrl, LANGS } from '../domain/url';
import { loadLang } from '../i18n';
import type { Lang } from '../domain/types';
import brand from '../config/brand.json';

function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function browserLang(): Lang | null {
  const enabled = brand.languages as Lang[];
  for (const l of navigator.languages ?? [navigator.language]) {
    const low = l.toLowerCase();
    if (low.startsWith('es')) return 'es-AR';
    if (low.startsWith('pt')) return 'pt-BR';
    if (low.startsWith('ru')) return 'ru';
    if (low.startsWith('en')) return 'en';
  }
  return enabled.includes('es-AR') ? 'es-AR' : null;
}

/** Lee la URL (config compartida, idioma, unidades, modo feria/embebido) antes del primer render. */
export async function bootstrap() {
  const st = useStore.getState();
  const url = new URL(window.location.href);
  const shared = parseShareUrl(window.location.href);
  if (shared.config) st.loadConfig(shared.config);
  if (shared.units) st.setUnits(shared.units);
  const modo = url.searchParams.get('modo') ?? url.searchParams.get('mode');
  const embed = url.pathname.replace(/\/$/, '').endsWith('/embed') || url.searchParams.has('embed');
  st.setMode({ feria: modo === 'feria' || modo === 'fair', embed });
  st.setWebgl(detectWebGL());
  const q = url.searchParams.get('q');
  if (q === 'low' || q === 'medium' || q === 'high') st.setQuality(q);
  const lang: Lang | null = shared.lang ?? null;
  // Español (Argentina) por defecto; el idioma se elige en el selector o con ?lang=
  if (lang && (LANGS as string[]).includes(lang) && lang !== 'es-AR') {
    try {
      await loadLang(lang);
      st.setLang(lang);
    } catch {
      /* se queda en es-AR */
    }
  }
  document.documentElement.lang = useStore.getState().lang;
}
