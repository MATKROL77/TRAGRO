/**
 * Trabajo en momentos ociosos: precargas, precompilación y armado de escenas sin
 * competir con la interacción. Cada tarea corre en su propio requestIdleCallback.
 */
type IdleWindow = { requestIdleCallback?: (cb: (d: { timeRemaining: () => number }) => void, o?: { timeout: number }) => number };

export function whenIdle(timeout = 2000): Promise<void> {
  return new Promise((resolve) => {
    const w = window as unknown as IdleWindow;
    if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout });
    else window.setTimeout(resolve, 60);
  });
}

/** Ejecuta las tareas en orden, cada una en un momento ocioso distinto. */
export async function idleQueue(tasks: (() => unknown)[], timeout = 2000): Promise<void> {
  for (const task of tasks) {
    await whenIdle(timeout);
    await task();
  }
}

/** El usuario pidió ahorrar datos: no se precarga lo que quizás no use. */
export function saveData(): boolean {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || c.effectiveType === '2g' || c.effectiveType === 'slow-2g');
}
