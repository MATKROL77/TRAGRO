import { brand, types } from '@/core/catalog';
import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { Button } from './primitives';

/** Sin WebGL: imágenes de los equipos y acceso directo a la consulta. */
export default function Fallback() {
  const { t, tx } = useI18n();
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="fallback">
      <div className="fallback-inner">
        <img src={brand.logo} alt={brand.nombre} style={{ height: 40, width: 'auto', justifySelf: 'start' }} />
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{t('webgl.titulo')}</h1>
          <p className="muted" style={{ marginTop: '0.4rem', maxWidth: '60ch' }}>{t('webgl.texto')}</p>
        </div>
        <div className="fallback-grid">
          {types.map((ty) => (
            <figure key={ty.id}>
              <img src={`/fallback/${ty.id}.jpg`} alt={tx(ty.name)} loading="lazy" />
              <figcaption>{tx(ty.name)}</figcaption>
            </figure>
          ))}
        </div>
        <div>
          <Button variant="primario" size="lg" onClick={() => setUi({ modal: 'cotizar' })} data-testid="btn-cotizar">
            {t('barra.cotizar')}
          </Button>
        </div>
      </div>
    </div>
  );
}
