import { describe, expect, it } from 'vitest';
import { brand } from '@/core/catalog';
import { priceBreakdown } from '@/core/pricing';
import { applyChange, defaultConfig } from '@/core/rules';
import { configHash, decodeConfig } from '@/core/serialize';
import type { Config } from '@/core/types';
import { compareConfigs } from '@/lead/compare';
import { buildLeadLinks, buildLeadMessage, configSummaryLines, formatCuit, leadConfigUrl, mailtoUrl, PROVINCIAS, validateCuit, validateLead, whatsappUrl, type Lead, type LeadContext } from '@/lead/message';
import { checkTexts, quoteGroups, techRows } from '@/lead/quote';
import { embedSnippet, embedUrl } from '@/lead/share';
import { buildLeadPayload } from '@/lead/submitLead';
import { pdfSafe } from '@/pdf/quotePdf';

const lead: Lead = { nombre: 'Juan Pérez', empresa: 'Transportes La Unión & Hnos.', cuit: '33-69345023-9', provincia: 'Santa Fe', telefono: '341 555-0123', email: 'juan@launion.example', comentario: 'Lo quiero para soja y maíz, ¿financian?' };
const HREF = 'https://demo.example/?modo=vendedor';
const ctx = (config: Config = defaultConfig(), over: Partial<LeadContext> = {}): LeadContext => ({ config, lang: 'es', moneda: 'USD', hidePrices: false, href: HREF, ...over });
const set = (cfg: Config, key: string, value: string | number | boolean) => applyChange(cfg, key, value).config;

describe('validación del formulario de consulta', () => {
  it('valida el dígito verificador del CUIT', () => {
    expect(validateCuit('33-69345023-9')).toBe(true);
    expect(validateCuit('33693450239')).toBe(true);
    expect(validateCuit('20-12345678-6')).toBe(true);
    expect(validateCuit('20 12345678 6')).toBe(true);
    expect(validateCuit('20-12345678-5')).toBe(false);
    expect(validateCuit('33-69345023')).toBe(false);
    expect(validateCuit('abcdefghijk')).toBe(false);
    expect(validateCuit('')).toBe(false);
  });

  it('formatea el CUIT con guiones', () => {
    expect(formatCuit('33693450239')).toBe('33-69345023-9');
    expect(formatCuit(' 123 ')).toBe('123');
  });

  it('incluye las 24 jurisdicciones', () => {
    expect(PROVINCIAS).toHaveLength(24);
    expect(new Set(PROVINCIAS).size).toBe(24);
    expect(PROVINCIAS).toContain('Ciudad Autónoma de Buenos Aires');
    expect(PROVINCIAS).toContain('Tierra del Fuego');
  });

  it('un formulario completo no tiene errores y el CUIT es opcional', () => {
    expect(validateLead(lead)).toEqual({});
    expect(validateLead({ ...lead, cuit: '', empresa: '', comentario: '' })).toEqual({});
  });

  it('marca cada campo inválido con su clave de error', () => {
    const e = validateLead({ nombre: 'J', empresa: '', cuit: '20-12345678-0', provincia: 'Narnia', telefono: '12', email: 'juan@', comentario: '' });
    expect(e).toEqual({ nombre: 'lead.error.nombre', cuit: 'lead.error.cuit', provincia: 'lead.error.provincia', telefono: 'lead.error.telefono', email: 'lead.error.email' });
  });
});

describe('mensaje precargado', () => {
  it('incluye datos del cliente, resumen, número y link a la configuración', () => {
    const cfg = set(set(defaultConfig(), 'llantas', 'aluminio'), 'frenos', 'ebs');
    const msg = buildLeadMessage(lead, ctx(cfg));
    expect(msg).toContain(brand.nombre);
    expect(msg).toContain('Juan Pérez');
    expect(msg).toContain('Transportes La Unión & Hnos.');
    expect(msg).toContain('33-69345023-9');
    expect(msg).toContain('Santa Fe');
    expect(msg).toContain('341 555-0123');
    expect(msg).toContain('juan@launion.example');
    expect(msg).toContain('Tolva cerealera');
    expect(msg).toContain('10,00 m de largo');
    expect(msg).toContain('1+1+1');
    expect(msg).toContain('Aluminio pulido');
    expect(msg).toContain('EBS');
    expect(msg).toContain(configHash(cfg));
    expect(msg).toContain('Tara estimada');
    expect(msg).toContain('Carga útil estimada');
    expect(msg).toContain('¿financian?');
    expect(msg).toMatch(/\*Mis datos\*/);
    const url = /https:\/\/demo\.example\/\S+/.exec(msg)?.[0] ?? '';
    expect(decodeConfig(new URL(url).searchParams.get('c') ?? '')).toEqual(cfg);
  });

  it('lleva el precio orientativo, salvo que esté oculto', () => {
    const cfg = defaultConfig();
    const total = priceBreakdown(cfg).totalUsd;
    const shown = buildLeadMessage(lead, ctx(cfg));
    expect(shown).toContain('Precio orientativo');
    expect(shown).toContain(`US$ ${new Intl.NumberFormat('es-AR').format(total)}`);
    const hidden = buildLeadMessage(lead, ctx(cfg, { hidePrices: true }));
    expect(hidden).not.toContain('Precio orientativo');
    expect(hidden).not.toContain('US$');
    expect(configSummaryLines(ctx(cfg, { hidePrices: true })).join('\n')).not.toMatch(/US\$|\$ \d/);
  });

  it('no lista opcionales cuando todo es de serie y avisa logo y texto', () => {
    const base = { ...defaultConfig(), sel: { ...defaultConfig().sel, cajon: 0, portaauxilio: 0, tanqueAgua: false, matafuego: false } };
    expect(configSummaryLines(ctx(base)).join('\n')).toContain('Sin opcionales');
    const custom: Config = { ...base, logo: { ...base.logo, data: 'data:image/png;base64,AAAA' }, texto: { ...base.texto, valor: 'Agro Ñandú' } };
    const lines = configSummaryLines(ctx(custom)).join('\n');
    expect(lines).toContain('logo de flota');
    expect(lines).toContain('Agro Ñandú');
  });

  it('se traduce al portugués', () => {
    const msg = buildLeadMessage(lead, ctx(defaultConfig('furgon'), { lang: 'pt' }));
    expect(msg).toContain('Olá');
    expect(msg).toContain('Baú / Sider');
    expect(msg).toContain('Meus dados');
    expect(msg).not.toContain('Mis datos');
  });

  it('el link nunca hace crecer el mensaje sin control: un logo pesado no viaja', () => {
    // Datos poco compresibles, como los de una imagen real.
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let seed = 42;
    let noise = '';
    for (let i = 0; i < 4000; i++) {
      seed = (seed * 16807) % 2147483647;
      noise += abc[seed % 64];
    }
    const cfg: Config = { ...defaultConfig(), logo: { ...defaultConfig().logo, data: 'data:image/png;base64,' + noise } };
    const url = leadConfigUrl(cfg, HREF);
    expect(url.length).toBeLessThan(1500);
    expect(decodeConfig(new URL(url).searchParams.get('c') ?? '')?.logo.data).toBeNull();
    expect(new URL(url).searchParams.get('modo')).toBe('vendedor');
  });
});

describe('links de WhatsApp y email', () => {
  it('codifica el texto completo en la URL de wa.me con el número de la marca', () => {
    const links = buildLeadLinks(lead, ctx());
    const u = new URL(links.whatsapp);
    expect(u.origin + u.pathname).toBe(`https://wa.me/${brand.contacto.whatsapp}`);
    expect(u.searchParams.get('text')).toBe(links.message);
    expect(links.whatsapp).not.toMatch(/[\n &#]text|\s/);
    expect(links.whatsapp).toContain('%0A');
    expect(links.whatsapp).toContain('%26');
  });

  it('whatsappUrl limpia el número y mailtoUrl codifica asunto y cuerpo', () => {
    expect(whatsappUrl('+54 9 341 555-0123', 'hola & chau')).toBe('https://wa.me/5493415550123?text=hola%20%26%20chau');
    const m = mailtoUrl('ventas@x.example', 'Consulta: tolva', 'línea 1\nlínea 2');
    expect(m.startsWith('mailto:ventas@x.example?subject=')).toBe(true);
    expect(decodeURIComponent(m.split('body=')[1])).toBe('línea 1\nlínea 2');
  });

  it('el mailto va a la casilla de la marca, sin asteriscos de formato', () => {
    const links = buildLeadLinks(lead, ctx());
    expect(links.mailto.startsWith(`mailto:${brand.contacto.email}?subject=`)).toBe(true);
    const body = decodeURIComponent(links.mailto.split('body=')[1]);
    expect(body).not.toContain('*');
    expect(body).toContain('MIS DATOS');
    expect(links.subject).toContain(links.numero);
    expect(links.subject).toContain('Tolva cerealera');
  });
});

describe('payload de submitLead', () => {
  it('trae todo lo que necesita un CRM y respeta precios ocultos', () => {
    const cfg = defaultConfig('batea');
    const now = new Date('2026-11-24T12:00:00Z');
    const { payload, links } = buildLeadPayload(lead, ctx(cfg), 'whatsapp', now);
    expect(payload.numero).toBe(configHash(cfg));
    expect(payload.url).toBe(links.url);
    expect(payload.tipo).toBe('batea');
    expect(payload.canal).toBe('whatsapp');
    expect(payload.precioOrientativoUsd).toBe(priceBreakdown(cfg).totalUsd);
    expect(payload.taraKg).toBeGreaterThan(0);
    expect(payload.cargaUtilKg).toBeGreaterThan(0);
    expect(payload.creadoEn).toBe('2026-11-24T12:00:00.000Z');
    expect(payload.config).toEqual(cfg);
    expect(() => JSON.stringify(payload)).not.toThrow();
    expect(buildLeadPayload(lead, ctx(cfg, { hidePrices: true }), 'email', now).payload.precioOrientativoUsd).toBeNull();
  });
});

describe('modelo de cotización y comparador', () => {
  it('agrupa todas las elecciones por paso y suma el total', () => {
    const cfg = set(defaultConfig(), 'suspension', 'neumatica');
    const groups = quoteGroups(cfg, 'es');
    expect(groups.map((g) => g.paso)).toEqual(['tipo', 'dimensiones', 'rodado', 'especificos', 'accesorios', 'personalizacion']);
    const rows = groups.flatMap((g) => g.rows);
    expect(rows.reduce((s, r) => s + r.usd, 0)).toBe(priceBreakdown(cfg).totalUsd);
    expect(rows.find((r) => r.key === 'colorCaja')?.detail).toContain('RAL 3020');
    expect(rows.find((r) => r.key === 'suspension')?.usd).toBe(1250 * 3);
  });

  it('la ficha técnica y las validaciones salen traducidas y sin claves crudas', () => {
    for (const lang of ['es', 'pt'] as const) {
      const cfg = defaultConfig('batea');
      const all = [...techRows(cfg, lang).flatMap((r) => [r.label, r.value]), ...checkTexts(cfg, lang).flatMap((c) => [c.title, c.message, c.status, c.value])];
      for (const s of all) {
        expect(s).not.toMatch(/^(tec|legal|comun)\./);
        expect(s).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('compara dos configuraciones: filas distintas y deltas B − A', () => {
    const a = defaultConfig();
    const b = set(set(a, 'llantas', 'aluminio'), 'ejes', 'tandem');
    const r = compareConfigs(a, b, 'es');
    expect(r.identical).toBe(false);
    expect(r.rows.find((x) => x.key === 'llantas')?.differs).toBe(true);
    expect(r.rows.find((x) => x.key === 'ejes')?.differs).toBe(true);
    expect(r.rows.find((x) => x.key === 'frenos')?.differs).toBe(false);
    expect(r.delta.precioUsd).toBe(priceBreakdown(b).totalUsd - priceBreakdown(a).totalUsd);
    expect(r.delta.taraKg).toBeLessThan(0);
    expect(r.delta.cargaUtilKg).toBeLessThan(0);
    expect(compareConfigs(a, defaultConfig(), 'es').identical).toBe(true);
    expect(compareConfigs(a, a, 'es').delta).toEqual({ precioUsd: 0, taraKg: 0, cargaUtilKg: 0 });
  });

  it('entre tipos distintos marca lo que no aplica', () => {
    const r = compareConfigs(defaultConfig('tolva'), defaultConfig('furgon'), 'es');
    const bocas = r.rows.find((x) => x.key === 'bocas');
    expect(bocas?.a).toBeTruthy();
    expect(bocas?.b).toBeNull();
    expect(bocas?.differs).toBe(true);
    expect(r.rows.find((x) => x.key === 'variante')?.a).toBeNull();
  });
});

describe('compartir y PDF', () => {
  it('arma la URL de /embed desde cualquier ruta', () => {
    expect(embedUrl('https://demo.example/?modo=vendedor&c=XYZ', 'ABC')).toBe('https://demo.example/embed?c=ABC');
    expect(embedUrl('https://demo.example/embed?c=XYZ', 'ABC')).toBe('https://demo.example/embed?c=ABC');
    expect(embedUrl('https://demo.example/sub/ruta/index.html', 'ABC')).toBe('https://demo.example/sub/ruta/embed?c=ABC');
    const snippet = embedSnippet('https://demo.example/', 'ABC', 'Configurador "3D"');
    expect(snippet).toContain('<iframe src="https://demo.example/embed?c=ABC"');
    expect(snippet).toContain('title="Configurador &quot;3D&quot;"');
  });

  it('pdfSafe deja solo caracteres que Helvetica puede dibujar', () => {
    expect(pdfSafe('≈ $ 94.982.250')).toBe('aprox. $ 94.982.250');
    expect(pdfSafe('− US$ 5.400')).toBe('- US$ 5.400');
    expect(pdfSafe('Cargando…')).toBe('Cargando...');
    expect(pdfSafe('“Ñandú” – 45,4 m³ · 2,60 m²')).toBe('"Ñandú" - 45,4 m³ · 2,60 m²');
    expect(pdfSafe('años, ação, coração, niño')).toBe('años, ação, coração, niño');
    expect([...pdfSafe('a → b 😀')].every((ch) => ch.charCodeAt(0) <= 255)).toBe(true);
  });
});
