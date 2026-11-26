/** Aviso liviano (sin importar el chunk de la escena) de que una escena quedó preparada. */
type Id = 'exterior' | 'ruta';
const ready = new Set<Id>();
const listeners = new Set<(id: Id) => void>();

export function markSceneReady(id: Id): void {
  if (ready.has(id)) return;
  ready.add(id);
  listeners.forEach((l) => l(id));
}

export function isSceneReady(id: Id): boolean {
  return ready.has(id);
}

export function onSceneReady(fn: (id: Id) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
