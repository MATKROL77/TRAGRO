import { useStore } from './store';
import { parseShareUrl, liveUrl, LANGS } from '../domain/url';
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
  const modo = url.searchParams.get('modo') ?? url.searchParams.get('mode');
  const embed = url.pathname.replace(/\/$/, '').endsWith('/embed') || url.searchParams.has('embed');
  const feria = modo === 'feria' || modo === 'fair';
  let shared = parseShareUrl(window.location.href);
  // sin configuración en la URL: retomar la última (si el usuario recargó o volvió desde WhatsApp)
  if (!shared.config && !feria && !embed) {
    const last = readLast();
    if (last) shared = { ...parseShareUrl(last), ...(shared.lang ? { lang: shared.lang } : {}), ...(shared.units ? { units: shared.units } : {}) };
  }
  if (shared.config) st.loadConfig(shared.config);
  if (shared.units) st.setUnits(shared.units);
  st.setMode({ feria, embed });
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
  if (!feria) persistState();
}

const LAST_KEY = 'umbral:last';

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/** Mantiene la configuración en la URL (replaceState) y en localStorage mientras se configura. */
function persistState() {
  let timer = 0;
  let prev = useStore.getState();
  useStore.subscribe((s) => {
    if (s.config === prev.config && s.lang === prev.lang && s.units === prev.units) return;
    prev = s;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const href = liveUrl(window.location.href, { config: s.config, lang: s.lang, units: s.units });
      try {
        history.replaceState(history.state, '', href);
      } catch {
        /* algunos embebidos no permiten replaceState */
      }
      try {
        localStorage.setItem(LAST_KEY, href);
      } catch {
        /* navegación privada */
      }
    }, 250);
  });
}
