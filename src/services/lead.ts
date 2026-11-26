/**
 * Envío de consultas (leads).
 *
 * `submitLead()` está aislada a propósito: primero guarda el lead (POST JSON a `/api/lead`, el mismo
 * Worker que sirve la app y lo guarda en KV) y después abre WhatsApp (wa.me) o el email con el mensaje
 * precargado. Si el usuario cierra WhatsApp sin mandar, el lead igual quedó registrado.
 * Para mandarlo a un CRM (HubSpot, Zapier/Make…), definí `VITE_LEAD_WEBHOOK` en el build.
 * En modo demo (`brand.demo`), WhatsApp y email se abren sin destinatario.
 */
import brand from '../config/brand.json';

export interface Lead {
  name: string;
  company: string;
  country: string;
  region: string;
  hectares: string;
  phone: string;
  email: string;
  message: string;
  lang: string;
  configNumber: string;
  configUrl: string;
  summaryText: string;
  priceUsd: number | null;
}

export type Channel = 'whatsapp' | 'email';

export function buildWhatsappUrl(text: string, phone = brand.demo ? '' : brand.whatsapp): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export function buildMailto(subject: string, body: string, to = brand.demo ? '' : brand.email): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const LEAD_ENDPOINT = (import.meta.env.VITE_LEAD_WEBHOOK as string | undefined) || `${import.meta.env.BASE_URL}api/lead`;

export async function submitLead(lead: Lead, channel: Channel, subject: string): Promise<void> {
  // no bloquea: si falla, el lead igual sale por WhatsApp/email
  try {
    fetch(LEAD_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...lead, channel, ts: new Date().toISOString() }), keepalive: true }).catch(() => undefined);
  } catch {
    /* sin red */
  }
  const body = lead.summaryText;
  const url = channel === 'whatsapp' ? buildWhatsappUrl(body) : buildMailto(subject, body);
  const w = window.open(url, '_blank', 'noopener');
  if (!w) window.location.href = url;
}
