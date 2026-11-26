import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { useProgress } from '@react-three/drei';
import { brand } from './core/catalog';
import { HTML_LANG, useI18n } from './i18n';
import { useStore } from './state/store';
import { startUrlSync } from './state/url';
import { Viewer } from './three/Viewer';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Header, LangUnitControls, openCompare } from './ui/Header';
import { HotspotCard } from './ui/HotspotCard';
import { Icon } from './ui/Icon';
import { MobileBar } from './ui/MobileBar';
import { LoadingScreen } from './ui/LoadingScreen';
import { Notices } from './ui/Notices';
import { PriceHead } from './ui/PriceHead';
import { Button, Modal } from './ui/primitives';
import { ShortcutsModal } from './ui/ShortcutsModal';
import { StepsPanel } from './ui/StepsPanel';
import { TechTab } from './ui/TechPanel';
import { useShortcuts } from './ui/useShortcuts';
import { ViewerToolbar } from './ui/ViewerToolbar';

const SummaryModal = lazy(() => import('./ui/modals/SummaryModal'));
const LeadModal = lazy(() => import('./ui/modals/LeadModal'));
const CompareModal = lazy(() => import('./ui/modals/CompareModal'));
const ShareModal = lazy(() => import('./ui/modals/ShareModal'));
const Fallback = lazy(() => import('./ui/Fallback'));

declare global {
  interface Window {
    __store?: typeof useStore;
  }
}
window.__store = useStore;

function hasWebGL(): boolean {
  if (new URLSearchParams(window.location.search).get('webgl') === '0') return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Aplica los colores de brand.json como variables CSS: cambiar de fabricante es editar ese archivo. */
function applyBrand(): void {
  const map: Record<string, string> = { acento: '--acento', acentoTexto: '--acento-texto', fondo: '--fondo', superficie: '--sup', superficie2: '--sup2', borde: '--borde', texto: '--texto', textoSuave: '--texto2', ok: '--ok', alerta: '--alerta', error: '--error' };
  for (const [k, v] of Object.entries(map)) if (brand.colores[k]) document.documentElement.style.setProperty(v, brand.colores[k]);
}

function useMediaQuery(q: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const fn = () => setOn(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [q]);
  return on;
}

/** Botón flotante "Comparar": guarda la configuración actual como A si todavía no hay ninguna y abre el comparador. */
function CompareFab() {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="compare-fab"
      onClick={openCompare}
      data-testid="btn-comparar"
    >
      <Icon name="comparar" size={18} />
      <span>{t('top.comparar')}</span>
    </button>
  );
}

/** Pestañas del panel lateral: Configurar / Datos técnicos. */
function SideTabs() {
  const { t } = useI18n();
  const tab = useStore((s) => s.ui.pestana);
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="side-tabs" role="tablist" aria-label={t('panel.pestanas')}>
      <button type="button" role="tab" id="tab-config" aria-controls="panel-config" aria-selected={tab === 'config'} className={tab === 'config' ? 'is-on' : ''} onClick={() => setUi({ pestana: 'config' })} data-testid="tab-config">
        {t('panel.configurar')}
      </button>
      <button type="button" role="tab" id="tab-tecnico" aria-controls="panel-tecnico" aria-selected={tab === 'tecnico'} className={tab === 'tecnico' ? 'is-on' : ''} onClick={() => setUi({ pestana: 'tecnico' })} data-testid="tec-toggle">
        {t('tec.titulo')}
      </button>
    </div>
  );
}

function ViewerError() {
  const { t } = useI18n();
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="error-box" role="alert">
      <div>
        <h2>{t('error.titulo')}</h2>
        <p style={{ margin: '0.5rem auto 1rem' }}>{t('error.texto')}</p>
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
          <Button onClick={() => window.location.reload()}>{t('error.recargar')}</Button>
          <Button variant="primario" onClick={() => setUi({ modal: 'cotizar' })}>
            {t('barra.cotizar')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Ayuda breve de uso del visor: desaparece con la primera interacción. */
function ViewerHint() {
  const { t } = useI18n();
  const ready = useStore((s) => s.ready);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!ready || gone) return;
    const hide = () => setGone(true);
    const id = window.setTimeout(hide, 9000);
    window.addEventListener('pointerdown', hide, { once: true });
    window.addEventListener('wheel', hide, { once: true, passive: true });
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pointerdown', hide);
      window.removeEventListener('wheel', hide);
    };
  }, [ready, gone]);
  return (
    <div className="ayuda-visor" style={{ opacity: ready && !gone ? 1 : 0 }} aria-hidden="true">
      {t('visor.ayuda')}
    </div>
  );
}

function Loader() {
  const ready = useStore((s) => s.ready);
  const { progress, active, total } = useProgress();
  const [shown, setShown] = useState(5);
  useEffect(() => {
    // Progreso real: descarga de assets (hasta 88 %), construcción del modelo y primer cuadro.
    const target = ready ? 100 : total === 0 ? 8 : active ? 8 + progress * 0.8 : 92;
    setShown((p) => Math.max(p, target));
  }, [progress, active, total, ready]);
  return <LoadingScreen progress={shown} done={ready} />;
}

export function App() {
  const { t } = useI18n();
  const vendedor = useStore((s) => s.ui.vendedor);
  const embed = useStore((s) => s.ui.embed);
  const lang = useStore((s) => s.ui.lang);
  const modal = useStore((s) => s.ui.modal);
  const tab = useStore((s) => s.ui.pestana);
  const mobile = useMediaQuery('(max-width: 900px)');
  const webgl = useMemo(() => hasWebGL(), []);
  useShortcuts(vendedor);

  useEffect(() => {
    applyBrand();
    return startUrlSync();
  }, []);
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
    document.title = `${brand.nombre} · ${t('app.titulo')}`;
  }, [lang, t]);
  // Modo vendedor: pantalla completa al primer toque (el navegador exige un gesto).
  useEffect(() => {
    if (!vendedor) return;
    const go = () => void document.documentElement.requestFullscreen?.().catch(() => undefined);
    window.addEventListener('pointerdown', go, { once: true });
    return () => window.removeEventListener('pointerdown', go);
  }, [vendedor]);

  if (!webgl) {
    return (
      <LazyMotion features={domAnimation}>
        <Suspense fallback={null}>
          <Fallback />
          {modal === 'cotizar' ? <LeadModal /> : null}
        </Suspense>
      </LazyMotion>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <div className={`app ${vendedor ? 'vendedor' : ''} ${embed ? 'embed' : ''}`}>
        <a className="skip" href="#panel-config">
          {t('app.saltar')}
        </a>
        {embed ? null : <Header />}
        <main className="main">
          <div className="stage" role="region" aria-label={t('visor.region')}>
            <ErrorBoundary fallback={() => <ViewerError />}>
              <Viewer />
            </ErrorBoundary>
            {mobile ? null : (
              <div className="price-float">
                <PriceHead />
              </div>
            )}
            <ViewerToolbar />
            {mobile ? null : <CompareFab />}
            <Notices />
            <HotspotCard />
            <ViewerHint />
            <Loader />
          </div>
          <aside className="side" aria-label={t('panel.configurar')}>
            {embed ? (
              <div className="embed-lu">
                <LangUnitControls />
              </div>
            ) : null}
            {mobile ? null : <SideTabs />}
            {mobile || tab === 'config' ? <StepsPanel /> : <TechTab />}
          </aside>
        </main>
        {mobile ? <MobileBar /> : null}
        {mobile ? (
          <Modal open={modal === 'tecnico'} onClose={() => useStore.getState().setUi({ modal: null })} title={t('tec.titulo')}>
            <TechTab />
          </Modal>
        ) : null}
        <ShortcutsModal />
        <Suspense fallback={null}>
          {modal === 'resumen' ? <SummaryModal /> : null}
          {modal === 'cotizar' ? <LeadModal /> : null}
          {modal === 'comparar' ? <CompareModal /> : null}
          {modal === 'compartir' ? <ShareModal /> : null}
        </Suspense>
      </div>
    </LazyMotion>
  );
}
