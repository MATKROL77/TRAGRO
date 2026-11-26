/**
 * Arranque desde la URL y sincronización:
 *   ?c=<config comprimida>   link compartido
 *   ?modo=vendedor           modo presentación
 *   /embed                   sin encabezado, para iframe
 *   ?lang=es|en|pt|ru  ?unidades=imperial  ?moneda=USD|ARS  ?tipo=tolva|batea|plataforma|furgon  ?precios=0
 */
import { isTypeId } from '@/core/catalog';
import { priceBreakdown } from '@/core/pricing';
import { configHash, decodeConfig, encodeConfig, linkOmittedLogo } from '@/core/serialize';
import { computeSpecs } from '@/core/specs';
import { defaultConfig } from '@/core/rules';
import type { Lang } from '@/core/types';
import { hasLang, isLang } from '@/i18n';
import { useStore } from './store';

export function isEmbedPath(pathname: string): boolean {
  return /\/embed\/?$/.test(pathname);
}

/** Devuelve el idioma pedido cuando todavía hay que cargarlo (inglés o ruso). */
export function initFromUrl(): Lang | null {
  const url = new URL(window.location.href);
  const q = url.searchParams;
  const st = useStore.getState();
  const ui: Partial<typeof st.ui> = {};

  if (isEmbedPath(url.pathname) || q.get('embed') === '1') ui.embed = true;
  if (q.get('modo') === 'vendedor') ui.vendedor = true;
  // Español por defecto; el idioma se elige en el selector o con ?lang=. Solo portugués y ruso se detectan del navegador.
  const nav = navigator.language?.toLowerCase() ?? '';
  const lang = q.get('lang')?.toLowerCase().slice(0, 2) ?? (nav.startsWith('pt') ? 'pt' : nav.startsWith('ru') ? 'ru' : null);
  let pending: Lang | null = null;
  if (isLang(lang)) {
    if (hasLang(lang)) ui.lang = lang;
    else pending = lang;
  }
  const unidades = (q.get('unidades') ?? q.get('units'))?.toLowerCase();
  if (unidades === 'imperial' || unidades === 'metric') ui.unidades = unidades;
  const moneda = q.get('moneda')?.toUpperCase();
  if (moneda === 'USD' || moneda === 'ARS') ui.moneda = moneda;
  if (q.get('precios') === '0') ui.preciosOcultos = true;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (reduce?.matches) ui.reducedMotion = true;
  reduce?.addEventListener?.('change', (e) => useStore.getState().setUi({ reducedMotion: e.matches }));
  // En celulares se arranca un escalón más abajo; si el equipo rinde, la calidad sube sola.
  if (window.matchMedia?.('(max-width: 900px), (pointer: coarse)').matches) {
    ui.calidad = 'media';
    // En pantallas táctiles los puntos de interés se prenden desde "···" (no hay hover).
    ui.hotspots = false;
  }
  if (Object.keys(ui).length) st.setUi(ui);

  const code = q.get('c');
  if (code) {
    const cfg = decodeConfig(code);
    if (cfg) {
      st.loadConfig(cfg);
      // El link traía posición de logo pero no la imagen: era muy grande para viajar.
      if (linkOmittedLogo(code)) {
        useStore.setState({
          notices: [{ id: 'logo-no-incluido', key: Date.now(), text: { es: 'El logo no viajó en el link porque era muy pesado. Volvé a subirlo en "Tu marca".', pt: 'O logo não veio no link porque era muito pesado. Envie-o novamente em "Sua marca".', en: 'The logo was too large to travel in the link. Upload it again under "Your brand".', ru: 'Логотип не поместился в ссылку. Загрузите его снова в разделе «Ваш бренд».' } }],
        });
      }
      return pending;
    }
  }
  const tipo = q.get('tipo');
  if (isTypeId(tipo) && tipo !== 'tolva') st.loadConfig(defaultConfig(tipo));
  return pending;
}

/** Mantiene la barra de direcciones al día y avisa a la página contenedora (iframe). */
export function startUrlSync(): () => void {
  let timer = 0;
  const embedded = window.parent !== window;
  const push = () => {
    const { config } = useStore.getState();
    const { code } = encodeConfig(config);
    const u = new URL(window.location.href);
    u.searchParams.set('c', code);
    try {
      window.history.replaceState(null, '', u.toString());
    } catch {
      // algunos contenedores bloquean history: no es crítico
    }
    if (embedded) {
      const price = priceBreakdown(config);
      const specs = computeSpecs(config);
      window.parent.postMessage(
        { source: 'configurador-semirremolques', type: 'cambio', numero: configHash(config), url: u.toString(), tipo: config.tipo, precioUsd: price.totalUsd, taraKg: specs.taraKg, cargaUtilKg: specs.cargaUtilKg, config },
        '*',
      );
    }
  };
  const unsub = useStore.subscribe(
    (s) => s.config,
    () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(push, 500);
    },
  );
  return () => {
    window.clearTimeout(timer);
    unsub();
  };
}
