import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { useProgress } from '@react-three/drei';
import { brand } from './core/catalog';
import { useI18n } from './i18n';
import { useStore } from './state/store';
import { startUrlSync } from './state/url';
import { Viewer } from './three/Viewer';
import { BottomBar } from './ui/BottomBar';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { HotspotCard } from './ui/HotspotCard';
import { LoadingScreen } from './ui/LoadingScreen';
import { Notices } from './ui/Notices';
import { Button } from './ui/primitives';
import { ShortcutsModal } from './ui/ShortcutsModal';
import { StepsPanel } from './ui/StepsPanel';
import { TechPanel } from './ui/TechPanel';
import { Topbar } from './ui/Topbar';
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
  document.title = `${brand.nombre} · Configurador 3D`;
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
  const vendedor = useStore((s) => s.ui.vendedor);
  const embed = useStore((s) => s.ui.embed);
  const hoja = useStore((s) => s.ui.hojaExpandida);
  const lang = useStore((s) => s.ui.lang);
  const modal = useStore((s) => s.ui.modal);
  const webgl = useMemo(() => hasWebGL(), []);
  useShortcuts(vendedor);

  useEffect(() => {
    applyBrand();
    return startUrlSync();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'es-AR';
  }, [lang]);
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
      <div className={`app ${vendedor ? 'vendedor' : ''} ${embed ? 'embed' : ''} ${hoja ? 'hoja-expandida' : ''}`}>
        <Topbar />
        <main className="stage">
          <ErrorBoundary fallback={() => <ViewerError />}>
            <Viewer />
          </ErrorBoundary>
          <ViewerToolbar />
          <Notices />
          <HotspotCard />
          <TechPanel />
          <ViewerHint />
          <Loader />
        </main>
        <aside className="panel" aria-label="Configuración">
          <StepsPanel />
        </aside>
        <BottomBar />
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
