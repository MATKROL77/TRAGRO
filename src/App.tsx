import { Viewer } from './three/Viewer';
import { useStore } from './state/store';

declare global {
  interface Window {
    __store?: typeof useStore;
  }
}
window.__store = useStore;

export function App() {
  return (
    <div className="app">
      <Viewer />
    </div>
  );
}
