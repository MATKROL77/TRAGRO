// Worker que sirve el build estático desde Workers KV (alternativa a Cloudflare Pages).
const TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp',
  woff2: 'font/woff2', wasm: 'application/wasm', ktx2: 'image/ktx2', woff: 'font/woff', ttf: 'font/ttf', hdr: 'application/octet-stream', ico: 'image/x-icon', txt: 'text/plain',
};

const MAX_LEAD = 10 * 1024; // bytes
const RATE_MAX = 10; // envíos por IP por hora
const STR = (v, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : v == null ? null : String(v).slice(0, n));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Normaliza el lead a las columnas que se guardan (el resto se descarta). */
function normalizeLead(lead) {
  const price = Number(lead.priceUsd ?? lead.price_usd);
  return {
    name: STR(lead.name, 120),
    company: STR(lead.company, 160),
    country: STR(lead.country, 80),
    region: STR(lead.region, 120),
    hectares: STR(lead.hectares, 40),
    phone: STR(lead.phone, 40),
    email: STR(lead.email, 160),
    comments: STR(lead.message ?? lead.comments, 2000),
    channel: lead.channel === 'email' ? 'email' : lead.channel === 'whatsapp' ? 'whatsapp' : null,
    config_code: STR(lead.configNumber ?? lead.config_code, 40),
    price_usd: Number.isFinite(price) ? Math.round(price) : null,
    cfg_url: STR(lead.configUrl ?? lead.cfg_url, 2000),
    lang: STR(lead.lang, 8),
  };
}

/** Límite simple por IP: RATE_MAX por hora (contador en KV con vencimiento). */
async function rateLimited(env, ip) {
  const hour = Math.floor(Date.now() / 3_600_000);
  const key = `rl:${ip}:${hour}`;
  const n = Number((await env.LEADS.get(key)) ?? 0);
  if (n >= RATE_MAX) return true;
  await env.LEADS.put(key, String(n + 1), { expirationTtl: 3700 });
  return false;
}

/** POST /api/lead: guarda la consulta en KV (LEADS). 201 {ok:true}, 400 inválido, 413 grande, 429 límite. */
async function saveLead(request, env, ctx) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!env.LEADS) return json({ ok: false, error: 'no-storage' }, 503);
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > MAX_LEAD) return json({ ok: false, error: 'too-large' }, 413);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_LEAD) return json({ ok: false, error: 'too-large' }, 413);
  let raw;
  try {
    raw = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return json({ ok: false, error: 'bad-json' }, 400);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return json({ ok: false, error: 'bad-json' }, 400);
  const lead = normalizeLead(raw);
  if (!lead.name) return json({ ok: false, error: 'name-required' }, 400);
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (await rateLimited(env, ip)) return json({ ok: false, error: 'rate-limited' }, 429);
  const now = Date.now();
  const ts = new Date(now).toISOString();
  const id = `${ts.replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
  const record = { id, ts, ...lead, ip_country: request.cf?.country ?? null };
  // clave con tiempo invertido: el listado de KV devuelve primero los más nuevos
  const key = `lead:${String(9_999_999_999_999 - now).padStart(13, '0')}:${id}`;
  await env.LEADS.put(key, JSON.stringify(record), { metadata: { name: lead.name.slice(0, 80), config_code: lead.config_code, ts } });
  if (env.LEAD_WEBHOOK) {
    // aviso opcional (Slack/Make/Zapier…): no bloquea la respuesta
    const p = fetch(env.LEAD_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) }).catch(() => undefined);
    ctx?.waitUntil?.(p);
  }
  return json({ ok: true, id }, 201);
}

/** Comparación en tiempo constante. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** GET /api/leads?token=…: últimos 50 (token en la variable secreta LEADS_TOKEN del Worker). */
async function listLeads(request, env, url) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
  if (!env.LEADS || !env.LEADS_TOKEN) return json({ ok: false, error: 'not-configured' }, 503);
  if (!safeEqual(url.searchParams.get('token') ?? '', env.LEADS_TOKEN)) return json({ ok: false, error: 'unauthorized' }, 401);
  const list = await env.LEADS.list({ prefix: 'lead:', limit: 50 });
  const leads = (await Promise.all(list.keys.map((k) => env.LEADS.get(k.name, { type: 'json' })))).filter(Boolean);
  return json({ ok: true, count: leads.length, leads });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/lead') return saveLead(request, env, ctx);
    if (url.pathname === '/api/leads') return listLeads(request, env, url);
    let path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const isEmbed = path === 'embed' || path.startsWith('embed/');
    if (path === '' || isEmbed) path = 'index.html';
    let body = await env.ASSETS.get(path, { type: 'arrayBuffer' });
    if (body === null && !path.includes('.')) {
      path = 'index.html';
      body = await env.ASSETS.get(path, { type: 'arrayBuffer' });
    }
    if (body === null) return new Response('Not found', { status: 404 });
    const ext = path.split('.').pop();
    const headers = new Headers({
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': path.startsWith('assets/') ? 'public, max-age=31536000, immutable' : path === 'index.html' ? 'no-cache' : 'public, max-age=3600',
    });
    if (isEmbed) headers.set('Content-Security-Policy', 'frame-ancestors *');
    // HDR y JSON sin comprimir de origen: el runtime de Workers los comprime al ver Content-Encoding
    if (['hdr', 'json', 'svg', 'js', 'css', 'html', 'wasm', 'txt'].includes(ext) && /\bgzip\b/.test(request.headers.get('accept-encoding') ?? '')) headers.set('Content-Encoding', 'gzip');
    return new Response(body, { headers });
  },
};
