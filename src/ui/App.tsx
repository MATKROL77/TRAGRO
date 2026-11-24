import { Suspense, lazy } from 'react';
const Viewer = lazy(() => import('../three/Viewer'));
export function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Suspense fallback={null}>
        <Viewer />
      </Suspense>
    </div>
  );
}
