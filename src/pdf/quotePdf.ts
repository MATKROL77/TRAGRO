/**
 * PDF de cotización orientativa (A4 vertical), generado 100% en el navegador.
 * jsPDF se importa de forma dinámica: queda en su propio chunk y solo se
 * descarga cuando alguien pide el PDF.
 */
import type { jsPDF } from 'jspdf';
import { brand, pricing } from '@/core/catalog';
import { priceBreakdown } from '@/core/pricing';
import { configHash } from '@/core/serialize';
import { computeSpecs } from '@/core/specs';
import type { Config, Lang, Level, Units } from '@/core/types';
import { unitFormatters } from '@/core/units';
import { formatMoney, formatNumber, translate } from '@/i18n';
import { formatCuit, leadConfigUrl, type Lead } from '@/lead/message';
import { checkTexts, exceededText, formatDate, quoteGroups, quoteSubtitle, techRows, typeName } from '@/lead/quote';
import type { RenderSet } from '@/three/capture';

export interface QuoteInput {
  config: Config;
  lang: Lang;
  moneda: 'USD' | 'ARS';
  /** Sistema de unidades (métrico por defecto). */
  units?: Units;
  /** Modo vendedor con precios ocultos: el PDF sale sin importes. */
  hidePrices: boolean;
  renders: RenderSet | null;
  lead?: Lead | null;
  /** URL actual (para el link a la configuración). */
  href: string;
  now?: Date;
}

export interface QuotePdf {
  blob: Blob;
  filename: string;
  pages: number;
}

type RGB = [number, number, number];
const INK: RGB = [21, 23, 27];
const MUTED: RGB = [92, 99, 110];
const LINE: RGB = [216, 220, 226];
const SOFT: RGB = [244, 245, 247];
const LEVEL: Record<Level, RGB> = { ok: [46, 160, 104], warn: [214, 150, 20], bad: [214, 69, 54] };

const W = 210;
const H = 297;
const M = 14;
const CW = W - 2 * M;
const BOTTOM = H - 25;

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Con la fuente Unicode (ruso) no hay que descartar lo que queda fuera de Latin-1. */
let unicodeFont = false;

/** Helvetica (WinAnsi) no tiene estos signos: se reemplazan por equivalentes seguros. */
export function pdfSafe(s: string): string {
  // Noto Sans tiene №, ² y ³, pero no ≈.
  const base = (unicodeFont ? s.replace(/\u2248\s?/g, '~') : s)
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/\u2248\s?/g, 'aprox. ')
    .replace(/\u2192/g, '>')
    .replace(/\u2026/g, '...')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2022/g, '\u00B7')
    .replace(/[\u00A0\u202F\u2009]/g, ' ');
  if (unicodeFont) return base;
  // Lo que quede fuera de Latin-1 no existe en Helvetica: se descarta.
  return base.replace(/[\u0100-\uFFFF]/g, '');
}

/** Fuente con cirílico (Noto Sans, subconjunto) para el PDF en ruso. Se baja solo cuando hace falta. */
async function fontBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('img'));
    img.src = src;
  });
}

/** Rasteriza el logo SVG de la marca a PNG para incrustarlo en el PDF. */
async function rasterLogo(url: string): Promise<{ data: string; ratio: number } | null> {
  try {
    const img = await loadImage(url);
    const ratio = (img.naturalWidth || 260) / (img.naturalHeight || 56);
    const h = 220;
    const c = document.createElement('canvas');
    c.width = Math.round(h * ratio);
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/png'), ratio };
  } catch {
    return null;
  }
}

export async function buildQuotePdf(input: QuoteInput): Promise<QuotePdf> {
  const { jsPDF: JsPDF } = await import('jspdf');
  const { config, lang, moneda, hidePrices } = input;
  const units = input.units ?? 'metric';
  const now = input.now ?? new Date();
  unicodeFont = false;
  let fonts: [string, string] | null = null;
  if (lang === 'ru') {
    try {
      fonts = await Promise.all([fontBase64(`${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`), fontBase64(`${import.meta.env.BASE_URL}fonts/NotoSans-Bold.ttf`)]);
      unicodeFont = true;
    } catch {
      fonts = null;
    }
  }
  const u = unitFormatters((v, d = 0) => formatNumber(lang, v, d), units);
  const t = (key: string, params?: Record<string, string | number>) => pdfSafe(translate(lang, key, params));
  const n = (v: number, d = 0) => formatNumber(lang, v, d);
  const money = (usd: number, signed = false) => pdfSafe(formatMoney(lang, usd, moneda, signed));
  const numero = configHash(config);
  const price = priceBreakdown(config);
  const specs = computeSpecs(config);
  const accent = hexToRgb(brand.colores.acento ?? '#1B2A4A');
  const onAccent = hexToRgb(brand.colores.acentoTexto ?? '#FFFFFF');
  const logo = await rasterLogo(brand.logoClaro);
  const other = moneda === 'USD' ? 'ARS' : 'USD';

  const doc: jsPDF = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `${t('pdf.titulo')} ${numero}`, author: brand.nombre, subject: typeName(config, lang), creator: brand.nombre });
  let y = M;
  if (fonts) {
    doc.addFileToVFS('NotoSans-Regular.ttf', fonts[0]);
    doc.addFont('NotoSans-Regular.ttf', 'Noto', 'normal');
    doc.addFileToVFS('NotoSans-Bold.ttf', fonts[1]);
    doc.addFont('NotoSans-Bold.ttf', 'Noto', 'bold');
  }
  const family = fonts ? 'Noto' : 'helvetica';

  const font = (size: number, bold = false, color: RGB = INK) => {
    doc.setFont(family, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };
  const lh = (size: number) => size * 0.42;
  const wrap = (text: string, width: number): string[] => doc.splitTextToSize(pdfSafe(text), width) as string[];
  const hline = (yy: number, color: RGB = LINE, w = 0.2) => {
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(w);
    doc.line(M, yy, W - M, yy);
  };

  const header = (first: boolean) => {
    const lhgt = first ? 9 : 7;
    let logoW = 0;
    if (logo) {
      logoW = Math.min(lhgt * logo.ratio, CW * 0.4);
      doc.addImage(logo.data, 'PNG', M, M - 1 + (lhgt - logoW / logo.ratio) / 2, logoW, logoW / logo.ratio, 'logo', 'FAST');
    } else {
      font(first ? 15 : 11, true);
      doc.text(pdfSafe(brand.nombre), M, M + 6);
      logoW = doc.getTextWidth(pdfSafe(brand.nombre));
    }
    if (first) {
      // El título se achica si no entra al lado del logo (en ruso o inglés es más largo).
      const title = t('pdf.titulo').toUpperCase();
      let size = 15;
      font(size, true);
      while (size > 9 && doc.getTextWidth(title) > CW - logoW - 8) {
        size -= 0.5;
        font(size, true);
      }
      doc.text(title, W - M, M + 4, { align: 'right' });
      font(8.5, false, MUTED);
      doc.text(pdfSafe(brand.contacto.web), W - M, M + 9, { align: 'right' });
    } else {
      font(8.5, false, MUTED);
      doc.text(`${t('pdf.titulo')} · ${numero}`, W - M, M + 4, { align: 'right' });
    }
    const yy = M + lhgt + 3;
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(M, yy, CW, first ? 1 : 0.6, 'F');
    y = yy + (first ? 6 : 6);
  };

  const ensure = (h: number) => {
    if (y + h <= BOTTOM) return;
    doc.addPage();
    header(false);
  };

  const section = (title: string) => {
    ensure(16);
    y += 2;
    font(11, true);
    doc.text(title, M, y + 3.5);
    y += 6;
    hline(y, INK, 0.35);
    y += 1.5;
  };

  // ---------------------------------------------------------------- Página 1
  header(true);

  // Datos del documento.
  doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
  doc.roundedRect(M, y, CW, 14, 1.5, 1.5, 'F');
  const meta: [string, string][] = [
    [t('pdf.numero'), numero],
    [t('pdf.fecha'), formatDate(lang, now)],
    [t('pdf.validez'), t('comun.dias', { n: brand.pdf.validezDias })],
    [t('tec.plazo'), t('comun.dias', { n: specs.plazoDias })],
  ];
  meta.forEach(([k, v], i) => {
    const x = M + 5 + (i * (CW - 10)) / meta.length;
    font(7, true, MUTED);
    doc.text(k.toUpperCase(), x, y + 5.2);
    font(10.5, true);
    doc.text(v, x, y + 10.4);
  });
  y += 20;

  // Equipo.
  font(20, true);
  doc.text(pdfSafe(typeName(config, lang)), M, y + 5);
  y += 9;
  font(9.5, false, MUTED);
  const sub = wrap(quoteSubtitle(config, lang, units), CW);
  doc.text(sub, M, y + 2);
  y += sub.length * lh(9.5) + 4;
  const excede = exceededText(config, lang, units, specs);
  if (excede) {
    const lines = wrap(t('legal.banner.texto', { lista: excede }), CW - 8);
    const h = 7 + lines.length * lh(9);
    doc.setFillColor(253, 234, 234);
    doc.rect(M, y - 2, CW, h, 'F');
    doc.setFillColor(LEVEL.bad[0], LEVEL.bad[1], LEVEL.bad[2]);
    doc.rect(M, y - 2, 1.2, h, 'F');
    font(9.5, true, LEVEL.bad);
    doc.text(t('legal.banner.titulo'), M + 4, y + 2.5);
    font(9, false, INK);
    doc.text(lines, M + 4, y + 2.5 + lh(9.5));
    y += h + 3;
  }

  // Renders.
  const r = input.renders;
  const frame = (x: number, yy: number, w: number, h: number) => {
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.2);
    doc.rect(x, yy, w, h, 'S');
  };
  if (r?.tresCuartos) {
    const h = (CW * 9) / 16;
    doc.addImage(r.tresCuartos, 'JPEG', M, y, CW, h, 'r1', 'MEDIUM');
    frame(M, y, CW, h);
    y += h + 3;
  }
  const small = [r?.lateral, r?.trasero].filter((s): s is string => !!s);
  if (small.length) {
    const gap = 3;
    const w = (CW - gap) / 2;
    const h = (w * 9) / 16;
    small.forEach((img, i) => {
      doc.addImage(img, 'JPEG', M + i * (w + gap), y, w, h, `r${i + 2}`, 'MEDIUM');
      frame(M + i * (w + gap), y, w, h);
    });
    y += h + 5;
  }

  // Cifras clave.
  const hasVol = specs.volumenM3 !== null && config.tipo !== 'plataforma';
  const cards: { k: string; v: string; hi?: boolean }[] = [
    { k: t('pdf.total'), v: hidePrices ? t('resumen.aConsultar') : money(price.totalUsd), hi: true },
    { k: t('tec.tara'), v: pdfSafe(u.kg(specs.taraKg)) },
    { k: t('tec.cargaUtil'), v: pdfSafe(u.kg(specs.cargaUtilKg)) },
    hasVol ? { k: t('tec.volumen'), v: pdfSafe(u.vol(specs.volumenM3 as number)) } : { k: t('tec.superficie'), v: pdfSafe(u.area(specs.superficieM2)) },
  ];
  const cardH = 19;
  ensure(cardH + 2);
  const gap = 3;
  const firstW = 62;
  const restW = (CW - firstW - gap * 3) / 3;
  let cx = M;
  cards.forEach((c, i) => {
    const w = i === 0 ? firstW : restW;
    if (c.hi) doc.setFillColor(accent[0], accent[1], accent[2]);
    else doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
    doc.roundedRect(cx, y, w, cardH, 1.5, 1.5, 'F');
    font(6.8, true, c.hi ? onAccent : MUTED);
    doc.text(wrap(c.k.toUpperCase(), w - 8).slice(0, 2), cx + 4, y + 5.6);
    font(c.hi ? 14 : 12, true, c.hi ? onAccent : INK);
    doc.text(c.v, cx + 4, y + 14.6);
    cx += w + gap;
  });
  y += cardH + 3;
  if (!hidePrices) {
    font(7.5, false, MUTED);
    doc.text(wrap(t('barra.leyenda'), CW), M, y + 2.5);
    y += 5;
  }

  // ---------------------------------------------------------------- Página 2+
  doc.addPage();
  header(false);

  if (input.lead) {
    const l = input.lead;
    const fields: [string, string][] = [
      [t('lead.nombre'), l.nombre],
      [t('lead.empresa'), l.empresa],
      [t('lead.cuit'), l.cuit.trim() ? formatCuit(l.cuit) : ''],
      [t('lead.provincia'), l.provincia],
      [t('lead.telefono'), l.telefono],
      [t('lead.email'), l.email],
    ].filter(([, v]) => v.trim()) as [string, string][];
    if (fields.length) {
      section(t('pdf.cliente'));
      const colW = CW / 2;
      const rowH = 9.5;
      fields.forEach(([k, v], i) => {
        const col = i % 2;
        if (col === 0) ensure(rowH);
        const x = M + col * colW;
        font(7, true, MUTED);
        doc.text(k.toUpperCase(), x, y + 3.2);
        font(9.5);
        doc.text(wrap(v, colW - 6)[0] ?? '', x, y + 7.6);
        if (col === 1 || i === fields.length - 1) y += rowH;
      });
      if (l.comentario.trim()) {
        const lines = wrap(l.comentario.trim(), CW);
        ensure(lines.length * lh(9) + 7);
        font(7, true, MUTED);
        doc.text(t('lead.comentario').toUpperCase(), M, y + 3.2);
        font(9);
        doc.text(lines, M, y + 7.4);
        y += lines.length * lh(9) + 6;
      }
      y += 2;
    }
  }

  // Tabla de configuración.
  section(t('pdf.configuracion'));
  const colA = hidePrices ? 70 : 62;
  const colC = hidePrices ? 0 : 36;
  const colB = CW - colA - colC;
  font(7, true, MUTED);
  doc.text(t('resumen.concepto').toUpperCase(), M + 1.5, y + 3.4);
  doc.text(t('resumen.eleccion').toUpperCase(), M + colA, y + 3.4);
  if (!hidePrices) doc.text(t('resumen.precio').toUpperCase(), W - M - 1.5, y + 3.4, { align: 'right' });
  y += 5.5;
  hline(y);

  for (const g of quoteGroups(config, lang, price, units)) {
    ensure(15);
    doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
    doc.rect(M, y, CW, 5.6, 'F');
    font(7.2, true, INK);
    doc.text(pdfSafe(g.name).toUpperCase(), M + 1.5, y + 3.9);
    y += 5.6;
    for (const row of g.rows) {
      font(9);
      const a = wrap(row.label, colA - 4);
      const b = wrap(row.detail, colB - 4);
      const lines = Math.max(a.length, b.length);
      const rowH = lines * lh(9) + 3.2;
      ensure(rowH);
      font(9, false, MUTED);
      doc.text(a, M + 1.5, y + 4.2);
      font(9, true);
      doc.text(b, M + colA, y + 4.2);
      if (!hidePrices) {
        const included = row.usd === 0;
        font(9, !included, included ? MUTED : INK);
        doc.text(included ? (row.estandar ? t('comun.estandar') : t('comun.incluido')) : money(row.usd, row.key !== 'base'), W - M - 1.5, y + 4.2, { align: 'right' });
      }
      y += rowH;
      hline(y);
    }
  }

  // Total.
  ensure(26);
  y += 2;
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.roundedRect(M, y, CW, 13, 1.5, 1.5, 'F');
  font(9.5, true, onAccent);
  doc.text(`${t('pdf.total')} (${t('pdf.sinIva')})`, M + 4, y + 8.2);
  font(14, true, onAccent);
  doc.text(hidePrices ? t('pdf.precioAConsultar') : money(price.totalUsd), W - M - 4, y + 8.8, { align: 'right' });
  y += 16;
  if (!hidePrices) {
    font(8, false, MUTED);
    const eq = wrap(
      t('pdf.equivalente', {
        monto: pdfSafe(formatMoney(lang, price.totalUsd, other)),
        valor: `$ ${n(pricing.tipoDeCambio.arsPorUsd)}`,
        fecha: formatDate(lang, new Date(`${pricing.tipoDeCambio.fecha}T12:00:00`)),
      }),
      CW,
    );
    doc.text(eq, M, y + 2.5);
    y += eq.length * lh(8) + 2.5;
    const ley = wrap(t('barra.leyenda'), CW);
    doc.text(ley, M, y + 2.5);
    y += ley.length * lh(8) + 3;
  }

  // Datos técnicos (dos columnas).
  section(t('pdf.tecnico'));
  const tech = techRows(config, lang, specs, units);
  const half = Math.ceil(tech.length / 2);
  const colW = (CW - 8) / 2;
  const rowH = 6.2;
  ensure(Math.min(half, 3) * rowH);
  for (let i = 0; i < half; i++) {
    ensure(rowH);
    [tech[i], tech[i + half]].forEach((row, c) => {
      if (!row) return;
      const x = M + c * (colW + 8);
      font(9, false, MUTED);
      doc.text(pdfSafe(row.label), x, y + 4.2);
      font(9, true);
      doc.text(pdfSafe(row.value), x + colW, y + 4.2, { align: 'right' });
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.setLineWidth(0.2);
      doc.line(x, y + rowH, x + colW, y + rowH);
    });
    y += rowH;
  }
  y += 2;

  // Validación legal.
  section(t('pdf.legal'));
  for (const c of checkTexts(config, lang, specs, units)) {
    font(8.5);
    const msg = wrap(c.message, CW - 9);
    const h = 6 + msg.length * lh(8.5) + 2.5;
    ensure(h);
    const col = LEVEL[c.level];
    doc.setFillColor(col[0], col[1], col[2]);
    doc.circle(M + 2.2, y + 3.4, 1.5, 'F');
    font(9.5, true);
    doc.text(pdfSafe(c.title), M + 7, y + 4.5);
    const tw = doc.getTextWidth(pdfSafe(c.title));
    font(8, true, col);
    doc.text(pdfSafe(c.status).toUpperCase(), M + 7 + tw + 3, y + 4.4);
    font(9, true);
    doc.text(pdfSafe(c.value), W - M, y + 4.5, { align: 'right' });
    font(8.5, false, MUTED);
    doc.text(msg, M + 7, y + 9);
    y += h;
    hline(y);
    y += 1;
  }

  // Leyendas y link.
  y += 2;
  const notes = [t('tec.leyenda'), t('tec.normativa')];
  for (const note of notes) {
    const lines = wrap(note, CW);
    ensure(lines.length * lh(8) + 2);
    font(8, false, MUTED);
    doc.text(lines, M, y + 2.8);
    y += lines.length * lh(8) + 1.6;
  }
  const url = leadConfigUrl(config, input.href);
  ensure(10);
  y += 2.5;
  font(9, true, [20, 86, 160]);
  const label = t('pdf.link');
  doc.textWithLink(label, M, y + 3, { url });
  const lw = doc.getTextWidth(label);
  doc.setDrawColor(20, 86, 160);
  doc.setLineWidth(0.2);
  doc.line(M, y + 3.8, M + lw, y + 3.8);
  y += 7;

  // Pie en todas las páginas.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    hline(H - 19);
    font(7.2, false, MUTED);
    const pie = wrap(brand.pdf.pie, CW - 34).slice(0, 2);
    doc.text(pie, M, H - 15);
    doc.text(pdfSafe(`${brand.contacto.telefono} · ${brand.contacto.email} · ${brand.contacto.web}`), M, H - 15 + pie.length * 3.2);
    font(7.2, true, MUTED);
    doc.text(t('pdf.pagina', { n: p, total: pages }), W - M, H - 15, { align: 'right' });
  }

  return { blob: doc.output('blob'), filename: `${t('pdf.archivo')}-${numero}.pdf`, pages };
}

/** Genera el PDF y dispara la descarga en el navegador. */
export async function downloadQuotePdf(input: QuoteInput): Promise<QuotePdf> {
  const pdf = await buildQuotePdf(input);
  const url = URL.createObjectURL(pdf.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdf.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return pdf;
}
