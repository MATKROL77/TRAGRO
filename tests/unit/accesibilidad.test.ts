import { describe, expect, it } from 'vitest';
import { brand, groups, hotspotDefs, ralColors, steps, types } from '@/core/catalog';
import es from '@/i18n/es.json';

function lum(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('contraste AA de la marca (brand.json)', () => {
  const c = brand.colores;
  it('texto principal y secundario sobre los fondos', () => {
    for (const bg of [c.fondo, c.superficie, c.superficie2]) {
      expect(contrast(c.texto, bg), `texto sobre ${bg}`).toBeGreaterThanOrEqual(7);
      expect(contrast(c.textoSuave, bg), `texto suave sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('botón principal y color de acento', () => {
    expect(contrast(c.acentoTexto, c.acento)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.acento, c.superficie)).toBeGreaterThanOrEqual(4.5);
  });
  it('colores de estado distinguibles sobre el panel', () => {
    for (const k of ['ok', 'alerta', 'error']) expect(contrast(c[k], c.superficie), k).toBeGreaterThanOrEqual(3);
  });
});

describe('textos del catálogo', () => {
  const both = (t: { es?: string; pt?: string } | undefined, where: string) => {
    expect(t?.es, `${where} (es)`).toBeTruthy();
    expect(t?.pt, `${where} (pt)`).toBeTruthy();
  };
  it('todo nombre visible está en español y en portugués', () => {
    steps.forEach((s) => both(s.name, `paso ${s.id}`));
    types.forEach((t) => {
      both(t.name, `tipo ${t.id}`);
      both(t.desc, `tipo ${t.id} desc`);
      both(t.altoLabel, `tipo ${t.id} alto`);
    });
    groups.forEach((g) => {
      both(g.name, `grupo ${g.id}`);
      g.opciones?.forEach((o) => both(o.name, `opción ${g.id}.${o.id}`));
    });
    hotspotDefs.forEach((h) => {
      both(h.titulo, `hotspot ${h.id}`);
      both(h.texto, `hotspot ${h.id} texto`);
    });
    ralColors.forEach((r) => both(r.name, r.codigo));
  });
  it('cada paso tiene título y bajada en la interfaz', () => {
    const dict = es as Record<string, string>;
    for (const s of steps) {
      expect(dict[`paso.${s.id}.titulo`], s.id).toBeTruthy();
      expect(dict[`paso.${s.id}.sub`], s.id).toBeTruthy();
    }
  });
  it('la paleta RAL tiene unas 40 tonalidades con código y color válidos', () => {
    expect(ralColors.length).toBeGreaterThanOrEqual(40);
    for (const r of ralColors) {
      expect(r.codigo).toMatch(/^RAL \d{4}$/);
      expect(r.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    expect(new Set(ralColors.map((r) => r.codigo)).size).toBe(ralColors.length);
  });
});
