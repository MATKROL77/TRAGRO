/**
 * Funciones puras de la consulta comercial: validación del formulario y armado
 * del mensaje precargado para WhatsApp y email. No tocan el DOM ni la red,
 * así que se testean en Node (ver tests/unit/lead.test.ts).
 */
import { brand, ral, typeDef } from '@/core/catalog';
import { priceBreakdown } from '@/core/pricing';
import { configHash, shareUrl } from '@/core/serialize';
import { computeSpecs } from '@/core/specs';
import type { Config, Lang } from '@/core/types';
import { formatMoney, formatNumber, translate } from '@/i18n';

export interface Lead {
  nombre: string;
  empresa: string;
  /** Opcional. Si se completa tiene que ser un CUIT válido. */
  cuit: string;
  provincia: string;
  telefono: string;
  email: string;
  comentario: string;
}

export const EMPTY_LEAD: Lead = { nombre: '', empresa: '', cuit: '', provincia: '', telefono: '', email: '', comentario: '' };

/** Las 24 jurisdicciones argentinas (23 provincias + CABA). */
export const PROVINCIAS: string[] = [
  'Buenos Aires',
  'Ciudad Autónoma de Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
];

const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** CUIT/CUIL argentino: 11 dígitos con dígito verificador (módulo 11). Acepta guiones y espacios. */
export function validateCuit(raw: string): boolean {
  const d = raw.replace(/[\s.-]/g, '');
  if (!/^\d{11}$/.test(d)) return false;
  const sum = CUIT_WEIGHTS.reduce((s, w, i) => s + w * Number(d[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod;
  return check !== 10 && check === Number(d[10]);
}

/** 20123456786 → 20-12345678-6 (si no son 11 dígitos lo devuelve como vino). */
export function formatCuit(raw: string): string {
  const d = raw.replace(/[\s.-]/g, '');
  return /^\d{11}$/.test(d) ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : raw.trim();
}

export type LeadField = keyof Lead;
/** Errores por campo, como claves de i18n (lead.error.*). */
export type LeadErrors = Partial<Record<LeadField, string>>;

export function validateLead(lead: Lead): LeadErrors {
  const e: LeadErrors = {};
  if (lead.nombre.trim().length < 3) e.nombre = 'lead.error.nombre';
  if (lead.cuit.trim() && !validateCuit(lead.cuit)) e.cuit = 'lead.error.cuit';
  if (!PROVINCIAS.includes(lead.provincia)) e.provincia = 'lead.error.provincia';
  if (lead.telefono.replace(/\D/g, '').length < 8) e.telefono = 'lead.error.telefono';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email.trim())) e.email = 'lead.error.email';
  return e;
}

export interface LeadContext {
  config: Config;
  lang: Lang;
  moneda: 'USD' | 'ARS';
  /** Modo vendedor con precios ocultos: el mensaje no lleva importe. */
  hidePrices: boolean;
  /** URL actual de la página (se usa para armar el link a la configuración). */
  href: string;
}

/** Los links muy largos (logo incluido) se cortan en WhatsApp y en mailto: viaja el link sin logo. */
const MAX_LINK_IN_MESSAGE = 1400;

export function leadConfigUrl(config: Config, href: string): string {
  const full = shareUrl(config, href);
  if (full.url.length <= MAX_LINK_IN_MESSAGE) return full.url;
  return shareUrl({ ...config, logo: { ...config.logo, data: null } }, href).url;
}

/** Resumen corto de la configuración, una idea por línea. */
export function configSummaryLines(ctx: LeadContext): string[] {
  const { config, lang } = ctx;
  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
  const tx = (o: { es: string; pt: string }) => o[lang] ?? o.es;
  const price = priceBreakdown(config);
  const specs = computeSpecs(config);
  const tipo = typeDef(config.tipo);
  const line = (key: string) => price.lines.find((l) => l.key === key);
  const out: string[] = [];

  out.push(`${tx(tipo.name)} · ${t('lead.msg.largo', { valor: formatNumber(lang, Number(config.sel.largo), 2) })} · ${tx(tipo.altoLabel)}: ${formatNumber(lang, Number(config.sel.alto), 2)} m`);
  const ejes = line('ejes');
  const susp = line('suspension');
  const ruedas = line('ruedas');
  out.push([ejes, susp, ruedas].filter((l): l is NonNullable<typeof l> => !!l).map((l) => `${tx(l.label)}: ${tx(l.detail)}`).join(' · '));

  const skip = new Set(['base', 'largo', 'alto', 'ejes', 'suspension', 'ruedas', 'logo', 'texto']);
  const extras = price.lines.filter((l) => !skip.has(l.key) && !l.estandar).map((l) => `${tx(l.label)}: ${tx(l.detail)}`);
  out.push(extras.length ? `${t('lead.msg.opcionales')}: ${extras.join('; ')}` : t('lead.msg.sinOpcionales'));

  out.push(t('lead.msg.colores', { caja: ral(config.colores.caja).codigo, chasis: ral(config.colores.chasis).codigo }));
  if (config.logo.data) out.push(t('lead.msg.logo'));
  if (config.texto.valor.trim()) out.push(t('lead.msg.texto', { texto: config.texto.valor.trim() }));
  out.push(`${t('lead.msg.tara', { valor: formatNumber(lang, specs.taraKg) })} · ${t('lead.msg.cargaUtil', { valor: formatNumber(lang, specs.cargaUtilKg) })}`);
  if (!ctx.hidePrices) out.push(t('lead.msg.precio', { monto: formatMoney(lang, price.totalUsd, ctx.moneda) }));
  return out;
}

export interface LeadLinks {
  /** Mensaje con formato de WhatsApp (*negritas*). */
  message: string;
  subject: string;
  whatsapp: string;
  mailto: string;
  url: string;
  numero: string;
}

/** Texto completo de la consulta. `bold` marca los títulos con asteriscos (formato WhatsApp). */
export function buildLeadMessage(lead: Lead, ctx: LeadContext, bold = true): string {
  const t = (key: string, params?: Record<string, string | number>) => translate(ctx.lang, key, params);
  const b = (s: string) => (bold ? `*${s}*` : s.toUpperCase());
  const numero = configHash(ctx.config);
  const data: [string, string][] = [
    [t('lead.nombre'), lead.nombre.trim()],
    [t('lead.empresa'), lead.empresa.trim()],
    [t('lead.cuit'), lead.cuit.trim() ? formatCuit(lead.cuit) : ''],
    [t('lead.provincia'), lead.provincia],
    [t('lead.telefono'), lead.telefono.trim()],
    [t('lead.email'), lead.email.trim()],
  ];
  const parts = [
    t('lead.msg.saludo', { marca: brand.nombre }),
    '',
    b(t('lead.msg.misDatos')),
    ...data.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    '',
    b(`${t('lead.msg.equipo')} · ${t('lead.msg.numero', { numero })}`),
    ...configSummaryLines(ctx),
    '',
    t('lead.msg.link', { url: leadConfigUrl(ctx.config, ctx.href) }),
  ];
  if (lead.comentario.trim()) parts.push('', `${b(t('lead.msg.comentario'))}: ${lead.comentario.trim()}`);
  return parts.join('\n');
}

export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export function mailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Todo lo necesario para abrir WhatsApp o el correo con la consulta precargada. */
export function buildLeadLinks(lead: Lead, ctx: LeadContext): LeadLinks {
  const numero = configHash(ctx.config);
  const tipo = typeDef(ctx.config.tipo).name[ctx.lang] ?? typeDef(ctx.config.tipo).name.es;
  const message = buildLeadMessage(lead, ctx, true);
  const subject = translate(ctx.lang, 'lead.msg.asunto', { tipo, numero });
  return {
    message,
    subject,
    numero,
    url: leadConfigUrl(ctx.config, ctx.href),
    whatsapp: whatsappUrl(brand.contacto.whatsapp, message),
    mailto: mailtoUrl(brand.contacto.email, subject, buildLeadMessage(lead, ctx, false)),
  };
}
