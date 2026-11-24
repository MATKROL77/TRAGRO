// Worker que sirve el build estático desde Workers KV (alternativa a Cloudflare Pages).
const TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', hdr: 'application/octet-stream', ico: 'image/x-icon', txt: 'text/plain',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
    return new Response(body, { headers });
  },
};
