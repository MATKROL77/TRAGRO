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

/**
 * Espera a que `busy()` dé false durante `calmMs` seguidos (el usuario dejó de girar la
 * cámara, terminó una transición…), como mucho `maxMs`: así una tarea pesada no cae en
 * medio de una interacción.
 */
export function whenCalm(busy: () => boolean, calmMs = 600, maxMs = 10000): Promise<void> {
  const t0 = performance.now();
  let calmSince = busy() ? -1 : t0;
  return new Promise((resolve) => {
    const tick = () => {
      const now = performance.now();
      if (busy()) calmSince = -1;
      else if (calmSince < 0) calmSince = now;
      if ((calmSince >= 0 && now - calmSince >= calmMs) || now - t0 > maxMs) resolve();
      else window.setTimeout(tick, 100);
    };
    tick();
  });
}

/**
 * Ejecuta las tareas en orden, cada una en un momento ocioso distinto. Con `busy`, además
 * espera a que la app esté quieta antes de cada una.
 */
export async function idleQueue(tasks: (() => unknown)[], timeout = 2000, busy?: () => boolean): Promise<void> {
  for (const task of tasks) {
    if (busy) await whenCalm(busy);
    await whenIdle(timeout);
    await task();
  }
}

/** El usuario pidió ahorrar datos: no se precarga lo que quizás no use. */
export function saveData(): boolean {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || c.effectiveType === '2g' || c.effectiveType === 'slow-2g');
}
