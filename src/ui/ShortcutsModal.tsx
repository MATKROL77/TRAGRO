import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { Modal } from './primitives';

const ROWS: [string, string][] = [
  ['1 – 7', 'vendedor.atajos.camaras'],
  ['A / Espacio', 'vendedor.atajos.accion'],
  ['L', 'vendedor.atajos.lona'],
  ['E', 'vendedor.atajos.entorno'],
  ['H', 'vendedor.atajos.puntos'],
  ['P', 'vendedor.atajos.precios'],
  ['F', 'vendedor.atajos.pantalla'],
  ['← / →', 'vendedor.atajos.pasos'],
  ['R', 'vendedor.atajos.reiniciar'],
];

export function ShortcutsModal() {
  const { t } = useI18n();
  const open = useStore((s) => s.ui.modal === 'atajos');
  const setUi = useStore((s) => s.setUi);
  return (
    <Modal open={open} onClose={() => setUi({ modal: null })} title={t('top.atajos')}>
      <table className="tabla">
        <tbody>
          {ROWS.map(([k, label]) => (
            <tr key={k}>
              <td style={{ width: '9rem' }}>
                <kbd>{k}</kbd>
              </td>
              <td>{t(label)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
