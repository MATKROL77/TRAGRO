/**
 * Envío de consultas (leads).
 *
 * `submitLead()` está aislada a propósito: hoy abre WhatsApp (wa.me) o el cliente de email con el
 * mensaje precargado. Para conectarla a un CRM o webhook, definí `VITE_LEAD_WEBHOOK` en el build
 * (por ejemplo, un Worker de Cloudflare, un formulario de HubSpot o un webhook de Zapier/Make):
 * se enviará un POST JSON con el lead completo (sin bloquear la apertura de WhatsApp/email).
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

export function buildWhatsappUrl(text: string, phone = brand.whatsapp): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export function buildMailto(subject: string, body: string, to = brand.email): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function submitLead(lead: Lead, channel: Channel, subject: string): Promise<void> {
  const hook = import.meta.env.VITE_LEAD_WEBHOOK as string | undefined;
  if (hook) {
    // no bloquea: si falla, el lead igual sale por WhatsApp/email
    fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...lead, channel, ts: new Date().toISOString() }), keepalive: true }).catch(() => undefined);
  }
  const body = lead.summaryText;
  const url = channel === 'whatsapp' ? buildWhatsappUrl(body) : buildMailto(subject, body);
  const w = window.open(url, '_blank', 'noopener');
  if (!w) window.location.href = url;
}
