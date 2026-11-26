import { useMemo, useRef, useState } from 'react';
import { ral, ralColors } from '@/core/catalog';
import type { FontId } from '@/core/types';
import { useI18n } from '@/i18n';
import { useStore } from '@/state/store';
import { Icon } from './Icon';
import { Button, Segmented, Slider, Switch } from './primitives';

const MAX_FILE = 3 * 1024 * 1024;
const MAX_SIDE = 768;

/** Lee el archivo, lo reduce si es raster y devuelve un data URL liviano. */
async function readLogo(file: File): Promise<string> {
  if (file.size > MAX_FILE) throw new Error('size');
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('read'));
    r.readAsDataURL(file);
  });
  if (!/^data:image\/(png|svg\+xml|jpeg|webp);/.test(dataUrl)) throw new Error('type');
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('decode'));
    i.src = dataUrl;
  });
  if (dataUrl.startsWith('data:image/svg+xml') && dataUrl.length < 200_000) return dataUrl;
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth || MAX_SIDE, img.naturalHeight || MAX_SIDE));
  if (scale === 1 && dataUrl.startsWith('data:image/png') && dataUrl.length < 400_000) return dataUrl;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round((img.naturalWidth || MAX_SIDE) * scale));
  c.height = Math.max(1, Math.round((img.naturalHeight || MAX_SIDE) * scale));
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

function RalPicker({ part }: { part: 'caja' | 'chasis' }) {
  const { t, tx } = useI18n();
  const codigo = useStore((s) => s.config.colores[part]);
  const setColor = useStore((s) => s.setColor);
  const [q, setQ] = useState('');
  const cur = ral(codigo);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase().replace(/^ral\s*/, '');
    if (!k) return ralColors;
    // Se busca por código, por el nombre en el idioma activo y por el nombre en español.
    return ralColors.filter((c) => c.codigo.toLowerCase().includes(k) || c.name.es.toLowerCase().includes(k) || tx(c.name).toLowerCase().includes(k));
  }, [q, tx]);
  return (
    <div>
      <div className="ral-current" aria-live="polite">
        <span className="chip" style={{ ['--c' as string]: cur.hex }} />
        <span>
          <span className="cod" data-testid={`ral-${part}`}>{cur.codigo}</span>
          <br />
          <span className="nom">{tx(cur.name)}</span>
        </span>
      </div>
      <div className="field">
        <input className="input" type="search" inputMode="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pers.buscarRal')} aria-label={t('pers.buscarRal')} />
      </div>
      {list.length === 0 ? <p className="nota">{t('pers.sinResultados')}</p> : null}
      <div className="ral-grid" role="radiogroup" aria-label={t(part === 'caja' ? 'pers.colorCaja' : 'pers.colorChasis')}>
        {list.map((c) => (
          <button key={c.codigo} type="button" role="radio" aria-checked={c.codigo === codigo} aria-label={`${c.codigo} ${tx(c.name)}`} title={`${c.codigo} · ${tx(c.name)}`} className={`ral ${c.codigo === codigo ? 'is-on' : ''}`} style={{ ['--c' as string]: c.hex }} data-ral={c.codigo} onClick={() => setColor(part, c.codigo)} />
        ))}
      </div>
    </div>
  );
}

export function StepPersonalizacion() {
  const { t } = useI18n();
  const logo = useStore((s) => s.config.logo);
  const texto = useStore((s) => s.config.texto);
  const setLogo = useStore((s) => s.setLogo);
  const setTexto = useStore((s) => s.setTexto);
  const [part, setPart] = useState<'caja' | 'chasis'>('caja');
  const [error, setError] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const pct = (v: number) => `${Math.round(v * 100)} %`;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = await readLogo(f);
      setError(false);
      setLogo({ data });
    } catch {
      setError(true);
    }
    if (file.current) file.current.value = '';
  };

  return (
    <>
      <section className="group">
        <div className="group-head">
          <h3>{t(part === 'caja' ? 'pers.colorCaja' : 'pers.colorChasis')}</h3>
          <Segmented size="sm" label={t('pers.colorCaja')} value={part} onChange={setPart} options={[{ value: 'caja', label: t('pers.caja') }, { value: 'chasis', label: t('pers.chasis') }]} />
        </div>
        <RalPicker part={part} key={part} />
      </section>

      <section className="group">
        <div className="group-head">
          <h3>{t('pers.logo')}</h3>
        </div>
        <div className="logo-drop">
          <span className="thumb">{logo.data ? <img src={logo.data} alt="" /> : <Icon name="subir" />}</span>
          <div style={{ display: 'grid', gap: '0.4rem', flex: 1 }}>
            <input ref={file} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label={t('pers.subirLogo')} data-testid="logo-input" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button icon="subir" onClick={() => file.current?.click()}>
              {logo.data ? t('pers.cambiarLogo') : t('pers.subirLogo')}
            </Button>
            {logo.data ? (
              <Button variant="fantasma" icon="x" onClick={() => setLogo({ data: null })}>
                {t('pers.quitarLogo')}
              </Button>
            ) : null}
          </div>
        </div>
        {error ? <p className="field-error" role="alert">{t('pers.logoError')}</p> : <p className="nota" style={{ marginTop: '0.4rem' }}>{t('pers.logoAyuda')}</p>}
        {logo.data ? (
          <div className="mini-sliders">
            <div className="fila">
              <span>{t('pers.tamano')}</span>
              <Slider value={logo.escala} min={0.2} max={1} step={0.05} label={`${t('pers.logo')}: ${t('pers.tamano')}`} format={pct} onChange={(v) => setLogo({ escala: v })} />
            </div>
            <div className="fila">
              <span>{t('pers.posX')}</span>
              <Slider value={logo.x} min={-1} max={1} step={0.05} label={`${t('pers.logo')}: ${t('pers.posX')}`} format={pct} onChange={(v) => setLogo({ x: v })} />
            </div>
            <div className="fila">
              <span>{t('pers.posY')}</span>
              <Slider value={logo.y} min={-1} max={1} step={0.05} label={`${t('pers.logo')}: ${t('pers.posY')}`} format={pct} onChange={(v) => setLogo({ y: v })} />
            </div>
            <div className="check-row">
              <span>{t('pers.frente')}</span>
              <Switch checked={logo.frente} onChange={(v) => setLogo({ frente: v })} label={t('pers.frente')} />
            </div>
          </div>
        ) : null}
      </section>

      <section className="group">
        <div className="group-head">
          <h3>{t('pers.texto')}</h3>
        </div>
        <div className="field">
          <input className="input" type="text" maxLength={40} value={texto.valor} onChange={(e) => setTexto({ valor: e.target.value })} placeholder={t('pers.textoPlaceholder')} aria-label={t('pers.texto')} data-testid="texto-input" />
        </div>
        {texto.valor.trim() ? (
          <>
            <div className="field">
              <span className="label">{t('pers.fuente')}</span>
              <Segmented<FontId> label={t('pers.fuente')} value={texto.fuente} onChange={(v) => setTexto({ fuente: v })} options={[{ value: 'manrope', label: t('pers.fuente.manrope') }, { value: 'barlow', label: t('pers.fuente.barlow') }, { value: 'slab', label: t('pers.fuente.slab') }]} />
            </div>
            <div className="field">
              <span className="label">{t('pers.colorTexto')}</span>
              <Segmented<'auto' | 'blanco' | 'negro'> label={t('pers.colorTexto')} value={texto.color} onChange={(v) => setTexto({ color: v })} options={[{ value: 'auto', label: t('pers.auto') }, { value: 'blanco', label: t('pers.blanco') }, { value: 'negro', label: t('pers.negro') }]} />
            </div>
            <div className="mini-sliders">
              <div className="fila">
                <span>{t('pers.tamano')}</span>
                <Slider value={texto.escala} min={0.2} max={1} step={0.05} label={`${t('pers.texto')}: ${t('pers.tamano')}`} format={pct} onChange={(v) => setTexto({ escala: v })} />
              </div>
              <div className="fila">
                <span>{t('pers.posX')}</span>
                <Slider value={texto.x} min={-1} max={1} step={0.05} label={`${t('pers.texto')}: ${t('pers.posX')}`} format={pct} onChange={(v) => setTexto({ x: v })} />
              </div>
              <div className="fila">
                <span>{t('pers.posY')}</span>
                <Slider value={texto.y} min={-1} max={1} step={0.05} label={`${t('pers.texto')}: ${t('pers.posY')}`} format={pct} onChange={(v) => setTexto({ y: v })} />
              </div>
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
