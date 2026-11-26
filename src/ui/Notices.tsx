import { useEffect } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { groupDef } from '@/core/catalog';
import type { AdjustedItem } from '@/core/types';
import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { Icon } from './Icon';
import { IconButton } from './primitives';

/** Avisos breves cuando una regla ajusta la configuración o al cambiar de tipo (con "Deshacer"). */
export function Notices() {
  const { t, tx, len } = useI18n();
  const notices = useStore((s) => s.notices);
  const dismiss = useStore((s) => s.dismissNotice);
  const undo = useStore((s) => s.undoNotice);
  useEffect(() => {
    if (notices.length === 0) return;
    const timers = notices.map((n) => window.setTimeout(() => dismiss(n.key), n.undo ? 11000 : 7000));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [notices, dismiss]);

  const value = (it: AdjustedItem, v: unknown): string => {
    const g = groupDef(it.key);
    if (typeof v === 'number' && g?.tipo === 'rango') return len(v);
    if (typeof v === 'boolean') return v ? t('comun.si') : t('comun.no');
    const o = g?.opciones?.find((x) => x.id === v);
    return o ? tx(o.name) : String(v);
  };

  return (
    <div className="notices" role="status" aria-live="polite" aria-label={t('aviso.titulo')}>
      <AnimatePresence initial={false}>
        {notices.map((n) => (
          <m.div key={n.key} className="notice" data-notice={n.id} initial={{ opacity: 0, y: -14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.97 }} transition={{ duration: 0.22 }}>
            <Icon name="info" size={18} />
            {n.items ? (
              <span>
                {n.items.length === 1 ? t('aviso.cambioTipo.uno') : t('aviso.cambioTipo.varias', { n: n.items.length })}
                <ul className="notice-list">
                  {n.items.map((it) => (
                    <li key={it.key}>
                      {tx(groupDef(it.key)?.name)}: {value(it, it.from)} → <strong>{value(it, it.to)}</strong>
                    </li>
                  ))}
                </ul>
                {n.undo ? (
                  <button type="button" className="notice-undo" onClick={() => undo(n.key)} data-testid="aviso-deshacer">
                    {t('comun.deshacer')}
                  </button>
                ) : null}
              </span>
            ) : (
              <span>{tx(n.text)}</span>
            )}
            <IconButton icon="x" label={t('comun.cerrar')} onClick={() => dismiss(n.key)} />
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
