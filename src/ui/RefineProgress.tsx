import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';

/** Barra de progreso de una captura refinada (PNG, vistas del resumen, PDF). */
export function RefineProgress() {
  const { t } = useI18n();
  const p = useStore((s) => s.ui.refinando);
  if (p === null) return null;
  const pct = Math.round(p * 100);
  return (
    <div className="refine-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('visor.refinando')} data-testid="refinando">
      <span>{t('visor.refinando')}</span>
      <div className="progress">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
