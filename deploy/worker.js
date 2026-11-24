/**
 * Worker que sirve el build estático (dist/) desde Workers KV.
 * Lo genera y publica deploy/publicar.py: reemplaza __MANIFEST__ por el índice
 * { ruta: [clave en KV, tipo de contenido, clase de caché] }.
 * Las claves son el hash del contenido: publicar de nuevo solo sube lo que cambió.
 */
const MANIFEST = __MANIFEST__;
const CACHE = ['no-cache', 'public, max-age=604800', 'public, max-age=31536000, immutable'];
const TEXT = { 'Content-Type': 'text/plain; charset=utf-8' };

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Método no permitido', { status: 405, headers: { ...TEXT, Allow: 'GET, HEAD' } });
    }
    const url = new URL(request.url);
    let path;
    try {
      path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    } catch {
      path = '';
    }
    // Aplicación de una sola página: "/" y "/embed" sirven el mismo index.html.
    if (path === '' || path === 'embed' || path === 'embed/') path = 'index.html';
    let entry = MANIFEST[path];
    if (!entry) {
      if (/\.[a-z0-9]{2,5}$/i.test(path)) return new Response('No encontrado', { status: 404, headers: TEXT });
      entry = MANIFEST['index.html'];
    }
    const [key, type, cls] = entry;
    const etag = `"${key.slice(2)}"`;
    const headers = {
      'Content-Type': type,
      'Cache-Control': CACHE[cls],
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    };
    if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
    if (request.method === 'HEAD') return new Response(null, { headers });

    // Los archivos con hash se guardan además en la caché del borde.
    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/__kv/${key}`, { method: 'GET' });
    if (cls > 0) {
      const hit = await cache.match(cacheKey);
      if (hit) return new Response(hit.body, { headers });
    }
    const body = await env.ASSETS.get(key, { type: 'arrayBuffer', cacheTtl: 86400 });
    if (body === null) return new Response('No encontrado', { status: 404, headers: TEXT });
    const response = new Response(body, { headers });
    if (cls > 0) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
