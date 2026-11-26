import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { legal } from '@/core/catalog';
import { useStore } from '@/state/store';
import { whenIdle } from '@/render-kit/scheduling/idle';
import { materialLibrary } from './materialsLib';
import { requestBuffers } from './modelBuilder';
import { buildTractor, setCabGlassQuality, tractorKey, type TractorModel, type TractorOptions } from './parts/tractor';
import { currentModel } from './TrailerObject';
import { viewer } from './viewerApi';

/**
 * Tractor genérico sin marca, enganchado al perno rey, para dar escala.
 * Sigue al tractor elegido para el cálculo legal (4x2 o 6x2). Se arma de antemano
 * (geometría en el worker, en un momento ocioso) y queda montado: mostrarlo u
 * ocultarlo no genera nada.
 */
/** Tractor actual (lo mueve el controlador de la ruta). */
export const currentTractor: { value: TractorModel | null } = { value: null };

export function Tractor() {
  // En la ruta el tractor está siempre.
  const show = useStore((s) => s.ui.tractor || s.ui.env === 'ruta');
  const ready = useStore((s) => s.ready);
  const version = useStore((s) => s.modelVersion);
  const id = useStore((s) => (s.config.sel.tractor === '4x2' ? '4x2' : '6x2'));
  const aluminium = useStore((s) => s.config.sel.llantas === 'aluminio');
  const invalidate = useThree((s) => s.invalidate);

  // El layout del semi cambia con cada reconstrucción del modelo.
  const layout = version >= 0 ? currentModel.value?.layout : undefined;
  const opts = useMemo<TractorOptions | null>(() => {
    if (!layout) return null;
    const spec = legal.tractores[id] ?? legal.tractores['6x2'];
    return {
      kingpinX: layout.kingpinX,
      kingpinY: layout.kingpinY,
      trailerFrontX: layout.frontX,
      serviceY: Math.min(layout.deckY - 0.1, 1.45),
      axles: id,
      frontLength: spec?.largoDelanteDelPernoM ?? 4.5,
      aluminium: false,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout?.kingpinX, layout?.kingpinY, layout?.frontX, layout?.deckY, id]);
  const key = opts ? tractorKey(opts) : '';

  const [model, setModel] = useState<TractorModel | null>(null);

  useEffect(() => {
    if (!opts || model?.key === key) return;
    // A la vista: ya. Oculto: se arma igual (precarga), pero cuando el visor está ocioso.
    if (!show && !ready) return;
    let cancelled = false;
    const go = async () => {
      if (!show) await whenIdle(3000);
      if (cancelled) return;
      const buffers = await requestBuffers('tractor', opts, key);
      if (cancelled) return;
      let m: TractorModel;
      try {
        m = buildTractor(opts, materialLibrary().mats, buffers ?? undefined);
      } catch (e) {
        console.warn('[configurador] tractor armado en el hilo principal', e);
        m = buildTractor(opts, materialLibrary().mats);
      }
      if (cancelled) {
        m.dispose();
        return;
      }
      if (useStore.getState().ui.tractor) viewer()?.crossfade(260);
      setModel(m);
    };
    void go();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, show, ready]);

  useEffect(() => {
    currentTractor.value = model;
    return () => {
      if (currentTractor.value === model) currentTractor.value = null;
      model?.dispose();
    };
  }, [model]);

  // Vidrio físico con transmisión solo en calidad alta.
  const high = useStore((s) => s.ui.calidad === 'alta');
  useEffect(() => {
    setCabGlassQuality(high);
    invalidate();
  }, [high, invalidate]);

  useEffect(() => {
    model?.setAluminium(aluminium);
    invalidate();
  }, [model, aluminium, invalidate]);

  // Aparece y desaparece con fundido, igual que los cambios de geometría del semi.
  useEffect(
    () =>
      useStore.subscribe(
        (s) => `${s.ui.tractor}|${s.ui.tractor ? s.config.sel.tractor : ''}`,
        () => viewer()?.crossfade(360),
      ),
    [],
  );

  useEffect(() => {
    invalidate();
  }, [show, model, invalidate]);

  return model ? <primitive object={model.root} visible={show} /> : null;
}
