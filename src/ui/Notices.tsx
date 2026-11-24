import { useEffect } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { Icon } from './Icon';
import { IconButton } from './primitives';

/** Avisos breves cuando una regla ajusta la configuración. */
export function Notices() {
  const { t, tx } = useI18n();
  const notices = useStore((s) => s.notices);
  const dismiss = useStore((s) => s.dismissNotice);
  useEffect(() => {
    if (notices.length === 0) return;
    const timers = notices.map((n) => window.setTimeout(() => dismiss(n.key), 7000));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [notices, dismiss]);
  return (
    <div className="notices" role="status" aria-live="polite" aria-label={t('aviso.titulo')}>
      <AnimatePresence initial={false}>
        {notices.map((n) => (
          <m.div key={n.key} className="notice" data-notice={n.id} initial={{ opacity: 0, y: -14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.97 }} transition={{ duration: 0.22 }}>
            <Icon name="info" size={18} />
            <span>{tx(n.text)}</span>
            <IconButton icon="x" label={t('comun.cerrar')} onClick={() => dismiss(n.key)} />
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
