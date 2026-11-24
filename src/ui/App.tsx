import { Component, Suspense, lazy, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore } from '../state/store';
import { useT } from '../i18n/useT';
import { Header, LangUnitControls } from './Header';
import { ConfigPanel } from './ConfigPanel';
import { PerformancePanel } from './PerformancePanel';
import { PriceHeader } from './BottomBar';
import { DetailLegend, HotspotCard, LoadingScreen, NoWebGL, NoticeToast, SimPanel, ViewerToolbar } from './ViewerUI';
import { restartDemo, useEmbedBridge, useFeriaMode, useShortcuts } from './feria';
import { touchInteraction } from '../three/runtime';
import { IconReset } from './icons';

const Viewer = lazy(() => import('../three/Viewer'));
const SummaryModal = lazy(() => import('./modals/SummaryModal'));
const QuoteModal = lazy(() => import('./modals/QuoteModal'));
const CompareModal = lazy(() => import('./modals/CompareModal'));

class ViewerBoundary extends Component<{ fallback: React.ReactNode; children: React.ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  render() {
    return this.state.err ? this.props.fallback : this.props.children;
  }
}

function ViewerError() {
  const t = useT();
  return (
    <div className="nowebgl" role="alert">
      <p>{t('app.error')}</p>
    </div>
  );
}

function FeriaOverlay() {
  const t = useT();
  const demo = useStore((s) => s.demo);
  const feria = useStore((s) => s.feria);
  if (!feria) return null;
  return (
    <>
      {demo && (
        <div className="attract" aria-live="polite">
          <span className="attract-badge">{t('feria.demo')}</span>
          <span className="attract-text">{t('feria.attract')}</span>
        </div>
      )}
      <button type="button" className="btn btn-secondary feria-reset" onClick={restartDemo}>
        <IconReset size={18} /> {t('actions.resetDemo')}
      </button>
    </>
  );
}

export function App() {
  const t = useT();
  const webgl = useStore((s) => s.webgl);
  const modal = useStore((s) => s.modal);
  const feria = useStore((s) => s.feria);
  const embed = useStore((s) => s.embed);
  const lang = useStore((s) => s.lang);
  const tab = useStore((s) => s.panelTab);
  const setTab = useStore((s) => s.setPanelTab);
  useFeriaMode();
  useShortcuts();
  useEmbedBridge();
  useEffect(() => {
    document.title = `${t('app.title')} · Surco Pampeano`;
  }, [t, lang]);
  return (
    <div className={`app${feria ? ' is-feria' : ''}${embed ? ' is-embed' : ''}`} onPointerDown={touchInteraction}>
      <a className="skip" href="#config-panel">{t('app.skipToPanel')}</a>
      {!embed && <Header />}
      <main className="main">
        <div className="viewer" aria-label={t('a11y.viewer')} role="region">
          {webgl ? (
            <ViewerBoundary fallback={<ViewerError />}>
              <Suspense fallback={null}>
                <Viewer />
              </Suspense>
              <LoadingScreen />
            </ViewerBoundary>
          ) : (
            <NoWebGL />
          )}
          {embed && <div className="embed-lu"><LangUnitControls /></div>}
          <ViewerToolbar />
          <SimPanel />
          <DetailLegend />
          <HotspotCard />
          <NoticeToast />
          <FeriaOverlay />
        </div>
        <aside className="side">
          <PriceHeader />
          <div className="side-tabs seg" role="tablist" aria-label={t('a11y.panel')}>
            <button type="button" role="tab" aria-selected={tab === 'config'} className={tab === 'config' ? 'is-selected' : ''} onClick={() => setTab('config')}>{t('nav.configure')}</button>
            <button type="button" role="tab" aria-selected={tab === 'perf'} className={tab === 'perf' ? 'is-selected' : ''} onClick={() => setTab('perf')}>{t('perf.title')}</button>
          </div>
          {tab === 'config' ? <ConfigPanel /> : <PerformancePanel collapsible={false} />}
        </aside>
      </main>
      <Suspense fallback={null}>
        <AnimatePresence>
          {modal === 'summary' && <SummaryModal key="s" />}
          {modal === 'quote' && <QuoteModal key="q" />}
          {modal === 'compare' && <CompareModal key="c" />}
        </AnimatePresence>
      </Suspense>
    </div>
  );
}
