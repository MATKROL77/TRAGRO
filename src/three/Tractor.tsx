import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { legal } from '@/core/catalog';
import { useStore } from '@/state/store';
import { materialLibrary } from './materialsLib';
import { buildTractor } from './parts/tractor';
import { currentModel } from './TrailerObject';
import { viewer } from './viewerApi';

/**
 * Tractor genérico sin marca, enganchado al perno rey, para dar escala.
 * Se muestra solo si el usuario lo activa ("Tractor" en el menú del visor) y
 * sigue al tractor elegido para el cálculo legal (4x2 o 6x2).
 */
export function Tractor() {
  const show = useStore((s) => s.ui.tractor);
  const version = useStore((s) => s.modelVersion);
  const id = useStore((s) => (s.config.sel.tractor === '4x2' ? '4x2' : '6x2'));
  const aluminium = useStore((s) => s.config.sel.llantas === 'aluminio');
  const invalidate = useThree((s) => s.invalidate);

  // El layout del semi cambia con cada reconstrucción del modelo.
  const layout = version >= 0 ? currentModel.value?.layout : undefined;
  const key = layout ? `${layout.kingpinX}|${layout.kingpinY}|${layout.frontX}|${layout.frontExtra}|${layout.deckY}` : '';

  const model = useMemo(() => {
    if (!show || !layout) return null;
    const spec = legal.tractores[id] ?? legal.tractores['6x2'];
    return buildTractor(
      {
        kingpinX: layout.kingpinX,
        kingpinY: layout.kingpinY,
        trailerFrontX: layout.frontX,
        serviceY: Math.min(layout.deckY - 0.1, 1.45),
        axles: id,
        frontLength: spec?.largoDelanteDelPernoM ?? 4.5,
        aluminium,
      },
      materialLibrary().mats,
    );
    // `key` resume todo lo que se usa del layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, key, id, aluminium]);

  useEffect(() => {
    invalidate();
    return () => {
      model?.dispose();
      invalidate();
    };
  }, [model, invalidate]);

  // Aparece y desaparece con fundido, igual que los cambios de geometría del semi.
  useEffect(
    () =>
      useStore.subscribe(
        (s) => `${s.ui.tractor}|${s.ui.tractor ? s.config.sel.tractor : ''}`,
        () => viewer()?.crossfade(360),
      ),
    [],
  );

  return model ? <primitive object={model.root} /> : null;
}
