/**
 * Entrada del modo "Manejar": teclado (W/S acelerar y frenar, A/D volante; también las
 * flechas) y joystick táctil. Los valores van de -1 a 1; `idle` cuenta los segundos sin
 * tocar nada (el controlador vuelve al piloto automático a los 2 s).
 */
export const driveInput = { throttle: 0, steer: 0, idle: 0 };

/** Escucha el teclado mientras dure el modo manual. Devuelve la función para dejar de escuchar. */
export function readKeyboard(): () => void {
  const keys = new Set<string>();
  const apply = () => {
    const up = keys.has('w') || keys.has('arrowup');
    const down = keys.has('s') || keys.has('arrowdown');
    const left = keys.has('a') || keys.has('arrowleft');
    const right = keys.has('d') || keys.has('arrowright');
    driveInput.throttle = (up ? 1 : 0) - (down ? 1 : 0);
    // +z es la derecha del vehículo.
    driveInput.steer = (right ? 1 : 0) - (left ? 1 : 0);
  };
  const isField = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  };
  const down = (e: KeyboardEvent) => {
    if (isField(e)) return;
    const k = e.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) return;
    e.preventDefault();
    keys.add(k);
    apply();
  };
  const up = (e: KeyboardEvent) => {
    keys.delete(e.key.toLowerCase());
    apply();
  };
  const blur = () => {
    keys.clear();
    apply();
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    keys.clear();
    apply();
  };
}
