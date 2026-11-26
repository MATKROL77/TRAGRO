import { useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { driveInput } from '@/render-kit/vehicle/input';

/**
 * Joystick táctil del modo "Manejar" (en la ruta): arriba acelera, abajo frena, a los
 * costados gira el volante. Al soltarlo vuelve al centro; a los 2 s sin tocar nada el
 * camión vuelve al piloto automático.
 */
export function DriveJoystick() {
  const { t } = useI18n();
  const on = useStore((s) => s.ui.env === 'ruta' && s.ui.manejar);
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  if (!on) return null;
  const move = (e: React.PointerEvent) => {
    const r = pad.current?.getBoundingClientRect();
    if (!r) return;
    const R = r.width / 2;
    let x = (e.clientX - (r.left + R)) / R;
    let y = (e.clientY - (r.top + R)) / R;
    const d = Math.hypot(x, y);
    if (d > 1) {
      x /= d;
      y /= d;
    }
    setKnob({ x, y });
    driveInput.steer = Math.abs(x) < 0.12 ? 0 : x;
    driveInput.throttle = Math.abs(y) < 0.12 ? 0 : -y;
  };
  const release = () => {
    setKnob({ x: 0, y: 0 });
    driveInput.steer = 0;
    driveInput.throttle = 0;
  };
  return (
    <div className="joystick" aria-label={t('visor.ruta.manejarAyuda')} title={t('visor.ruta.manejarAyuda')}>
      <div
        ref={pad}
        className="joystick-pad"
        role="application"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => e.buttons && move(e)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <i style={{ transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` }} />
      </div>
      <p>{t('visor.ruta.manejarAyuda')}</p>
    </div>
  );
}
