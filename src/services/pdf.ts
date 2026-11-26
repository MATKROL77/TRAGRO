/**
 * PDF de cotización (sin servidor, jsPDF cargado bajo demanda).
 * Usa Noto Sans (OFL) embebida para soportar español, portugués, inglés y ruso (cirílico).
 */
import type { jsPDF as JsPDF } from 'jspdf';
import brand from '../config/brand.json';
import { translate } from '../i18n';
import { formatDate } from '../domain/units';
import type { Lang } from '../domain/types';
import { moneyOrDash, type SummaryData } from './summaryData';

async function fontBase64(url: string): Promise<string> {
  const buf = await (await fetch(url)).arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function svgToPng(url: string, size = 256): Promise<string | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d')!.drawImage(img, 0, 0, size, size);
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface PdfInput {
  summary: SummaryData;
  lang: Lang;
  renders: { front34?: string; top?: string; transport?: string };
  url: string;
  logoUrl?: string | null;
}

export async function generateQuotePdf(input: PdfInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const base = import.meta.env.BASE_URL;
  const [reg, bold, logo] = await Promise.all([
    fontBase64(`${base}fonts/NotoSans-Regular.ttf`),
    fontBase64(`${base}fonts/NotoSans-Bold.ttf`),
    svgToPng(input.logoUrl ?? `${base}brand/logo-umbral.svg`),
  ]);
  const doc: JsPDF = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('NotoSans-Regular.ttf', reg);
  doc.addFont('NotoSans-Regular.ttf', 'Noto', 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', bold);
  doc.addFont('NotoSans-Bold.ttf', 'Noto', 'bold');
  const t = (k: string, v?: Record<string, string | number>) => translate(input.lang, k, v);
  const S = input.summary;
  const W = 210;
  const M = 14;
  const primary = hexToRgb(brand.colors.primary);
  const accent = hexToRgb(brand.colors.accent);
  const ink = hexToRgb(brand.colors.ink);
  const date = formatDate(new Date(), input.lang);

  const header = () => {
    doc.setFillColor(...primary);
    doc.rect(0, 0, W, 26, 'F');
    doc.setFillColor(...accent);
    doc.rect(0, 26, W, 1.4, 'F');
    if (logo) doc.addImage(logo, 'PNG', M, 5, 16, 16);
    doc.setTextColor(255, 255, 255);
    doc.setFont('Noto', 'bold');
    doc.setFontSize(15);
    doc.text(brand.name, M + 20, 12);
    doc.setFont('Noto', 'normal');
    doc.setFontSize(8.5);
    doc.text((brand.tagline as Record<string, string>)[input.lang] ?? '', M + 20, 17.5);
    doc.setFont('Noto', 'bold');
    doc.setFontSize(11);
    doc.text(t('pdf.title'), W - M, 11, { align: 'right' });
    doc.setFont('Noto', 'normal');
    doc.setFontSize(8.5);
    doc.text(`${t('pdf.number')} ${S.number}`, W - M, 16.5, { align: 'right' });
    doc.text(`${t('pdf.date')}: ${date}`, W - M, 21, { align: 'right' });
  };
  const footer = (n: number, total: number) => {
    doc.setDrawColor(220, 220, 220);
    doc.line(M, 284, W - M, 284);
    doc.setTextColor(120, 120, 120);
    doc.setFont('Noto', 'normal');
    doc.setFontSize(7);
    doc.text(`${brand.name} · ${brand.address} · ${brand.phone} · ${brand.email}`, M, 288);
    doc.text((brand.pdfFooter as Record<string, string>)[input.lang] ?? '', M, 291.5);
    doc.text(t('pdf.page', { n, total }), W - M, 288, { align: 'right' });
  };
  const sectionTitle = (y: number, text: string) => {
    doc.setTextColor(...primary);
    doc.setFont('Noto', 'bold');
    doc.setFontSize(10.5);
    doc.text(text.toUpperCase(), M, y);
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.6);
    doc.line(M, y + 1.6, M + 14, y + 1.6);
    doc.setLineWidth(0.2);
    return y + 7;
  };

  // ---------------- Página 1 ----------------
  header();
  let y = 36;
  doc.setTextColor(...ink);
  doc.setFont('Noto', 'bold');
  doc.setFontSize(20);
  doc.text(S.title, M, y);
  doc.setFont('Noto', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(t('pdf.subtitle'), M, y + 6);
  y += 11;
  const r = input.renders;
  if (r.front34) {
    doc.addImage(r.front34, 'JPEG', M, y, W - 2 * M, (W - 2 * M) * 0.5, undefined, 'FAST');
    y += (W - 2 * M) * 0.5 + 3;
  }
  const smallW = (W - 2 * M - 4) / 2;
  if (r.top || r.transport) {
    if (r.top) doc.addImage(r.top, 'JPEG', M, y, smallW, smallW * 0.5, undefined, 'FAST');
    if (r.transport) doc.addImage(r.transport, 'JPEG', M + smallW + 4, y, smallW, smallW * 0.5, undefined, 'FAST');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    if (r.top) doc.text(t('summary.views.top'), M, y + smallW * 0.5 + 3.5);
    if (r.transport) doc.text(t('summary.views.transport'), M + smallW + 4, y + smallW * 0.5 + 3.5);
    y += smallW * 0.5 + 8;
  }
  // caja de precio
  doc.setFillColor(244, 242, 238);
  doc.roundedRect(M, y, W - 2 * M, 24, 2, 2, 'F');
  doc.setTextColor(...ink);
  doc.setFont('Noto', 'normal');
  doc.setFontSize(9);
  doc.text(t('pdf.price'), M + 5, y + 7);
  doc.setFont('Noto', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...primary);
  doc.text(S.totalText, M + 5, y + 16);
  doc.setFont('Noto', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  const legend = doc.splitTextToSize(`${S.legend} ${S.leadTime}. ${t('pdf.validity')}.`, 95);
  doc.text(legend, W - M - 5, y + 7, { align: 'right' });
  y += 30;
  y = sectionTitle(y, t('pdf.performance'));
  doc.setFontSize(8.5);
  const half = Math.ceil(S.perf.length / 2);
  S.perf.forEach((p, i) => {
    const col = i < half ? 0 : 1;
    const row = i < half ? i : i - half;
    const x = M + col * ((W - 2 * M) / 2 + 2);
    const yy = y + row * 5.4;
    doc.setTextColor(100, 100, 100);
    doc.setFont('Noto', 'normal');
    doc.text(doc.splitTextToSize(p.label, 52)[0], x, yy);
    doc.setTextColor(...ink);
    doc.setFont('Noto', 'bold');
    doc.text(p.value, x + (W - 2 * M) / 2 - 4, yy, { align: 'right' });
  });
  footer(1, 2);

  // ---------------- Página 2 ----------------
  doc.addPage();
  header();
  y = 36;
  y = sectionTitle(y, t('pdf.configuration'));
  doc.setFontSize(8);
  doc.setFillColor(...primary);
  doc.rect(M, y - 3.8, W - 2 * M, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('Noto', 'bold');
  doc.text(t('pdf.item'), M + 2, y);
  doc.text(t('pdf.selection'), M + 62, y);
  doc.text(t('pdf.amount'), W - M - 2, y, { align: 'right' });
  y += 6;
  S.lines.forEach((l, i) => {
    const vlines = doc.splitTextToSize(l.value, 92) as string[];
    const h = Math.max(5.6, vlines.length * 4 + 1.6);
    if (i % 2 === 0) {
      doc.setFillColor(248, 247, 245);
      doc.rect(M, y - 3.9, W - 2 * M, h, 'F');
    }
    doc.setTextColor(90, 90, 90);
    doc.setFont('Noto', 'normal');
    doc.text(doc.splitTextToSize(l.label, 56)[0], M + 2, y);
    doc.setTextColor(...ink);
    doc.text(vlines, M + 62, y);
    doc.text(moneyOrDash(l.amount, input.lang), W - M - 2, y, { align: 'right' });
    y += h;
  });
  doc.setDrawColor(...primary);
  doc.line(M, y - 2, W - M, y - 2);
  doc.setFont('Noto', 'bold');
  doc.setFontSize(10);
  doc.text(t('pdf.total'), M + 2, y + 3);
  doc.text(S.totalText, W - M - 2, y + 3, { align: 'right' });
  y += 12;
  y = sectionTitle(y, t('pdf.transport'));
  doc.setFontSize(8.5);
  const colors: Record<string, [number, number, number]> = { green: [31, 157, 85], yellow: [217, 154, 0], red: [214, 69, 69] };
  S.transport.forEach((tl, i) => {
    const x = M + (i % 2) * ((W - 2 * M) / 2 + 2);
    const yy = y + Math.floor(i / 2) * 6;
    doc.setFillColor(...(colors[tl.level] ?? colors.green));
    doc.circle(x + 1.3, yy - 1.2, 1.3, 'F');
    doc.setTextColor(90, 90, 90);
    doc.setFont('Noto', 'normal');
    doc.text(tl.label, x + 4, yy);
    doc.setTextColor(...ink);
    doc.setFont('Noto', 'bold');
    doc.text(tl.value, x + (W - 2 * M) / 2 - 4, yy, { align: 'right' });
  });
  y += Math.ceil(S.transport.length / 2) * 6 + 2;
  doc.setFont('Noto', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  const tm = doc.splitTextToSize(S.transportMsg, W - 2 * M);
  doc.text(tm, M, y);
  y += tm.length * 4 + 1;
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  const disc = doc.splitTextToSize(t('transport.disclaimer'), W - 2 * M);
  doc.text(disc, M, y);
  y += disc.length * 3.4 + 6;
  y = sectionTitle(y, t('pdf.conditions'));
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  const cond = [S.legend, `${S.leadTime}.`, `${t('pdf.validity')}.`, t('perf.legend'), t('pdf.demoNote')];
  cond.forEach((c) => {
    const ls = doc.splitTextToSize(`• ${c}`, W - 2 * M);
    doc.text(ls, M, y);
    y += ls.length * 4 + 0.6;
  });
  y += 4;
  y = sectionTitle(y, t('pdf.contact'));
  doc.setFontSize(9);
  doc.setTextColor(...ink);
  doc.text([`${brand.name} · ${brand.address}`, brand.whatsapp ? `${brand.phone} · WhatsApp +${brand.whatsapp}` : brand.phone, `${brand.email} · ${brand.web}`], M, y);
  y += 16;
  doc.setFontSize(8);
  doc.setTextColor(...primary);
  doc.text(`${t('pdf.link')}:`, M, y);
  doc.textWithLink(doc.splitTextToSize(input.url, W - 2 * M - 30)[0], M + 30, y, { url: input.url });
  footer(2, 2);
  return doc.output('blob');
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
