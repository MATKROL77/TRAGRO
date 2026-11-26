// Worker que sirve el build estático desde Workers KV (alternativa a Cloudflare Pages).
const TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', hdr: 'application/octet-stream', ico: 'image/x-icon', txt: 'text/plain',
};

const MAX_LEAD = 16 * 1024;

/** Guarda la consulta en KV (LEADS). Se ven en Cloudflare: Workers KV → <worker>-leads. */
async function saveLead(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!env.LEADS) return Response.json({ ok: false, error: 'no-storage' }, { status: 503 });
  const text = await request.text();
  if (text.length > MAX_LEAD) return Response.json({ ok: false, error: 'too-large' }, { status: 413 });
  let lead;
  try {
    lead = JSON.parse(text);
  } catch {
    return Response.json({ ok: false, error: 'bad-json' }, { status: 400 });
  }
  if (!lead || typeof lead.name !== 'string' || !lead.name.trim()) return Response.json({ ok: false, error: 'name' }, { status: 400 });
  const ts = new Date().toISOString();
  const id = `${ts}-${crypto.randomUUID().slice(0, 8)}`;
  const record = { ...lead, receivedAt: ts, country_ip: request.cf?.country ?? null, ua: request.headers.get('user-agent')?.slice(0, 200) ?? null };
  await env.LEADS.put(`lead:${id}`, JSON.stringify(record), {
    metadata: { name: String(lead.name).slice(0, 80), channel: lead.channel ?? null, config: lead.configNumber ?? null, ts },
  });
  return Response.json({ ok: true, id });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/lead') return saveLead(request, env);
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
    if ((ext === 'hdr' || ext === 'json' || ext === 'svg') && /\bgzip\b/.test(request.headers.get('accept-encoding') ?? '')) headers.set('Content-Encoding', 'gzip');
    return new Response(body, { headers });
  },
};
