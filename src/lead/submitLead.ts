/**
 * submitLead: ÚNICO punto de salida de una consulta comercial.
 *
 * Hoy el configurador no tiene backend: la consulta sale por WhatsApp o por
 * email (links armados en ./message.ts) y esta función solo arma el payload y
 * avisa a la página contenedora si el configurador está embebido en un iframe.
 *
 * Para conectar un CRM o un webhook alcanza con editar este archivo, por ejemplo:
 *
 *   await fetch('https://tu-crm.example/api/leads', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify(payload),
 *   });
 *
 * El `payload` ya trae todo lo que un CRM necesita: datos del cliente, número de
 * configuración, link para reabrirla, precio orientativo, tara, carga útil y la
 * configuración completa como objeto plano. No se usan servicios de terceros ni claves.
 */
import { priceBreakdown } from '@/core/pricing';
import { computeSpecs } from '@/core/specs';
import type { Config, Lang, TypeId } from '@/core/types';
import { buildLeadLinks, type Lead, type LeadContext, type LeadLinks } from './message';

export type LeadChannel = 'whatsapp' | 'email';

/** Lo que recibiría un CRM / webhook por cada consulta. */
export interface LeadPayload {
  /** Datos de contacto tal como los cargó la persona. */
  lead: Lead;
  canal: LeadChannel;
  /** Número corto y estable de la configuración (el mismo del PDF). */
  numero: string;
  /** Link que reconstruye la configuración en el configurador. */
  url: string;
  tipo: TypeId;
  idioma: Lang;
  /** null si el vendedor ocultó los precios. */
  precioOrientativoUsd: number | null;
  taraKg: number;
  cargaUtilKg: number;
  plazoDias: number;
  /** Configuración completa, serializable. */
  config: Config;
  /** Fecha ISO 8601 de la consulta. */
  creadoEn: string;
}

export interface LeadResult {
  ok: true;
  payload: LeadPayload;
  links: LeadLinks;
}

/** Arma el payload de una consulta sin enviarlo (útil para tests e integraciones). */
export function buildLeadPayload(lead: Lead, ctx: LeadContext, canal: LeadChannel, now: Date = new Date()): { payload: LeadPayload; links: LeadLinks } {
  const links = buildLeadLinks(lead, ctx);
  const price = priceBreakdown(ctx.config);
  const specs = computeSpecs(ctx.config);
  return {
    links,
    payload: {
      lead: { ...lead },
      canal,
      numero: links.numero,
      url: links.url,
      tipo: ctx.config.tipo,
      idioma: ctx.lang,
      precioOrientativoUsd: ctx.hidePrices ? null : price.totalUsd,
      taraKg: specs.taraKg,
      cargaUtilKg: specs.cargaUtilKg,
      plazoDias: specs.plazoDias,
      config: ctx.config,
      creadoEn: now.toISOString(),
    },
  };
}

/**
 * Registra una consulta.
 *
 * @param lead   Datos del formulario (ya validados con `validateLead`).
 * @param ctx    Configuración, idioma, moneda, si los precios están ocultos y la URL actual.
 * @param canal  Por dónde eligió enviarla la persona.
 * @returns      El payload enviado y los links de WhatsApp / mailto ya armados.
 *
 * Efectos actuales:
 *  - Si el configurador corre dentro de un iframe (`/embed`), emite
 *    `window.parent.postMessage({ source: 'configurador-semirremolques', type: 'consulta', ...payload }, '*')`
 *    para que la web del fabricante pueda registrarla (analytics, CRM propio, etc.).
 *  - Nada más: acá es donde se agrega la llamada al CRM o webhook.
 */
export async function submitLead(lead: Lead, ctx: LeadContext, canal: LeadChannel): Promise<LeadResult> {
  const { payload, links } = buildLeadPayload(lead, ctx, canal);

  if (typeof window !== 'undefined' && window.parent !== window) {
    window.parent.postMessage({ source: 'configurador-semirremolques', type: 'consulta', ...payload }, '*');
  }

  // --- Punto de integración: CRM / webhook -----------------------------------
  // await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  // ---------------------------------------------------------------------------

  return { ok: true, payload, links };
}
