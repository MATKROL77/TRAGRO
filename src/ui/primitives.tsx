/** Componentes base de la interfaz: accesibles, táctiles (≥44 px) y con foco visible. */
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { useI18n } from '@/i18n';
import { Icon } from './Icon';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primario' | 'secundario' | 'fantasma'; icon?: string; block?: boolean; size?: 'md' | 'lg' };

export function Button({ variant = 'secundario', icon, block, size = 'md', className = '', children, ...rest }: BtnProps) {
  return (
    <button type="button" className={`btn btn-${variant} btn-${size} ${block ? 'btn-block' : ''} ${className}`} {...rest}>
      {icon ? <Icon name={icon} size={18} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function IconButton({ icon, label, active, className = '', badge, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; active?: boolean; badge?: ReactNode }) {
  return (
    <button type="button" className={`icon-btn ${active ? 'is-active' : ''} ${className}`} aria-label={label} title={label} aria-pressed={active === undefined ? undefined : active} {...rest}>
      <Icon name={icon} />
      {badge}
    </button>
  );
}

export interface SegOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
}

export function Segmented<T extends string>({ options, value, onChange, label, size = 'md' }: { options: SegOption<T>[]; value: T; onChange: (v: T) => void; label: string; size?: 'sm' | 'md' }) {
  return (
    <div className={`seg seg-${size}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} aria-label={`${label}: ${o.label}`} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.icon ? <Icon name={o.icon} size={16} /> : null}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled, describedBy }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; describedBy?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-describedby={describedBy} disabled={disabled} className={`switch ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="switch-thumb" />
    </button>
  );
}

export function Stepper({ value, min = 0, max, onChange, label, canIncrease = true }: { value: number; min?: number; max: number; onChange: (v: number) => void; label: string; canIncrease?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`${t('comun.menos')}: ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Icon name="menos" size={18} />
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`${t('comun.mas')}: ${label}`} disabled={value >= max || !canIncrease} onClick={() => onChange(value + 1)}>
        <Icon name="mas" size={18} />
      </button>
    </div>
  );
}

/**
 * Slider con el tramo fuera del límite legal pintado en rojo (legalMax). El mínimo es
 * siempre el efectivo: no hay tramos muertos donde el tirador quede pegado.
 */
export function Slider({ value, min, max, step, onChange, label, format, legalMax }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; format: (v: number) => string; legalMax?: number }) {
  const id = useId();
  const span = Math.max(1e-6, max - min);
  const pct = ((value - min) / span) * 100;
  const legal = legalMax !== undefined && legalMax < max ? Math.max(0, ((legalMax - min) / span) * 100) : 100;
  const ACC = 'var(--acento)', TRACK = 'var(--borde-btn)', RED = 'var(--error)', RED_SOFT = 'color-mix(in srgb, var(--error) 35%, transparent)';
  const track =
    legal >= 100
      ? `linear-gradient(90deg, ${ACC} ${pct}%, ${TRACK} ${pct}%)`
      : pct <= legal
        ? `linear-gradient(90deg, ${ACC} ${pct}%, ${TRACK} ${pct}% ${legal}%, ${RED_SOFT} ${legal}%)`
        : `linear-gradient(90deg, ${ACC} ${legal}%, ${RED} ${legal}% ${pct}%, ${RED_SOFT} ${pct}%)`;
  const ticks = Math.round((max - min) / step);
  return (
    <div className="slider">
      <div className={`slider-track-wrap ${legal < 100 ? 'has-legal' : ''}`} style={{ ['--track' as string]: track, ['--legal' as string]: `${legal}%` }}>
        <input id={id} type="range" min={min} max={max} step={step} value={value} aria-label={label} aria-valuetext={format(value)} onChange={(e) => onChange(Number(e.target.value))} />
        {ticks <= 16 ? (
          <div className="slider-ticks" aria-hidden="true">
            {Array.from({ length: ticks + 1 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
        ) : null}
        {legal < 100 ? <span className="slider-legal" aria-hidden="true" /> : null}
      </div>
      <div className="slider-scale" aria-hidden="true">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

/** Modal accesible: foco atrapado, Esc cierra, vuelve el foco al disparador. */
export function Modal({ open, onClose, title, children, wide, footer, labelledBy }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode; labelledBy?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && el) {
        const f = el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <m.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <m.div
            ref={ref}
            className={`modal ${wide ? 'modal-wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy ?? titleId}
            tabIndex={-1}
            // Solo se desliza: el panel es siempre opaco (si la animación se demora no deja ver lo de atrás).
            initial={{ y: 28 }}
            animate={{ y: 0 }}
            exit={{ y: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <header className="modal-head">
              <h2 id={titleId}>{title}</h2>
              <IconButton icon="x" label={t('comun.cerrar')} onClick={onClose} />
            </header>
            <div className="modal-body">{children}</div>
            {footer ? <footer className="modal-foot">{footer}</footer> : null}
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Número que cuenta hasta el nuevo valor (precio, carga útil). */
export function AnimatedNumber({ value, format, duration = 550 }: { value: number; format: (v: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    if (a === value) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      from.current = value;
      setShown(value);
      return;
    }
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      const v = a + (value - a) * e;
      from.current = v;
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <span className="tnum">{format(Math.round(shown))}</span>;
}

/** Texto de ayuda que aparece al pasar el mouse o hacer foco (motivo de una opción deshabilitada). */
export function Hint({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="hint" tabIndex={0} aria-describedby={id}>
      {children}
      <span role="tooltip" id={id} className="hint-pop">
        {text}
      </span>
    </span>
  );
}

export function StatusDot({ level }: { level: 'ok' | 'warn' | 'bad' }) {
  return <span className={`dot dot-${level}`} aria-hidden="true" />;
}
