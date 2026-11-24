import { AnimatePresence, m } from 'framer-motion';
import { hotspotDefs, matches } from '@/core/catalog';
import { ctxOf } from '@/core/rules';
import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { IconButton } from './primitives';

/** Tarjeta con el beneficio de la característica elegida en el modelo. */
export function HotspotCard() {
  const { t, tx } = useI18n();
  const id = useStore((s) => s.activeHotspot);
  const cfg = useStore((s) => s.config);
  const setHotspot = useStore((s) => s.setHotspot);
  const ctx = ctxOf(cfg);
  const def = id ? hotspotDefs.find((h) => h.id === id && (!h.tipos || h.tipos.includes(cfg.tipo)) && matches(h.cuando, ctx)) : undefined;
  return (
    <AnimatePresence>
      {def ? (
        <m.aside key={def.id + tx(def.titulo)} className="hotcard" role="dialog" aria-label={tx(def.titulo)} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }}>
          <h4>{tx(def.titulo)}</h4>
          <IconButton icon="x" label={t('comun.cerrar')} onClick={() => setHotspot(null)} />
          <p>{tx(def.texto)}</p>
        </m.aside>
      ) : null}
    </AnimatePresence>
  );
}
