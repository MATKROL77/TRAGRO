#!/usr/bin/env python3
"""
Publica el build (dist/) en Cloudflare Workers + KV, sin Wrangler.

Uso:
    npm run build
    CLOUDFLARE_API_TOKEN=... python3 deploy/publicar.py [--limpiar]

Permisos que necesita el token: Workers Scripts (editar) y Workers KV Storage (editar).
Variables opcionales: CLOUDFLARE_ACCOUNT_ID (si el token ve más de una cuenta),
CF_WORKER (nombre del Worker, por defecto "configurador-semirremolques").

Qué hace:
  1. Sube cada archivo de dist/ a un namespace de KV con clave = hash del contenido
     (solo los que no estaban: publicar de nuevo es rápido).
  2. Genera el Worker de deploy/worker.js con el índice de rutas y lo publica.
  3. Activa la URL https://<worker>.<subdominio>.workers.dev
  --limpiar borra de KV los archivos que ya no usa esta versión.

Nota: Cloudflare Pages (conectado al repo de GitHub) es la opción más simple para
deploy automático; este script existe para publicar a mano con un token de API.
"""
import base64
import hashlib
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

API = 'https://api.cloudflare.com/client/v4'
ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
WORKER = os.environ.get('CF_WORKER', 'configurador-semirremolques')
NAMESPACE = f'{WORKER}-assets'
# En entornos donde un proxy inyecta la credencial alcanza con un valor de relleno.
TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', 'inyectado-por-proxy')
SKIP = {'_headers', '_redirects'}  # solo sirven en Cloudflare Pages
TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2',
    '.hdr': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
}


def call(method, path, body=None, headers=None, raw=False):
    req = urllib.request.Request(API + path, data=body, method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            data = res.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'replace')[:600]
        sys.exit(f'Error {e.code} en {method} {path}: {detail}')
    if raw:
        return data
    out = json.loads(data)
    if not out.get('success', False):
        sys.exit(f'Cloudflare rechazó {method} {path}: {out.get("errors")}')
    return out


def js(method, path, payload):
    return call(method, path, json.dumps(payload).encode(), {'Content-Type': 'application/json'})


def cache_class(rel):
    if rel == 'index.html':
        return 0  # siempre fresco
    return 2 if rel.startswith('static/') else 1  # /static lleva hash en el nombre


def main():
    if not (DIST / 'index.html').exists():
        sys.exit('No existe dist/index.html: corré "npm run build" primero.')
    account = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
    if not account:
        accounts = call('GET', '/accounts?per_page=50')['result']
        if len(accounts) != 1:
            sys.exit('El token ve más de una cuenta: definí CLOUDFLARE_ACCOUNT_ID.')
        account = accounts[0]['id']
    base = f'/accounts/{account}'

    # 1. Namespace de KV (se crea la primera vez).
    spaces = call('GET', f'{base}/storage/kv/namespaces?per_page=100')['result']
    ns = next((s['id'] for s in spaces if s['title'] == NAMESPACE), None)
    if not ns:
        ns = js('POST', f'{base}/storage/kv/namespaces', {'title': NAMESPACE})['result']['id']
        print(f'KV: namespace "{NAMESPACE}" creado')

    # 2. Archivos → claves por hash de contenido.
    manifest, blobs = {}, {}
    for f in sorted(DIST.rglob('*')):
        rel = f.relative_to(DIST).as_posix()
        if not f.is_file() or rel in SKIP:
            continue
        data = f.read_bytes()
        key = 'f/' + hashlib.sha256(data).hexdigest()[:40]
        ctype = TYPES.get(f.suffix.lower()) or mimetypes.guess_type(rel)[0] or 'application/octet-stream'
        manifest[rel] = [key, ctype, cache_class(rel)]
        blobs[key] = data

    existing, cursor = set(), ''
    while True:
        page = call('GET', f'{base}/storage/kv/namespaces/{ns}/keys?limit=1000' + (f'&cursor={cursor}' if cursor else ''))
        existing.update(k['name'] for k in page['result'])
        cursor = (page.get('result_info') or {}).get('cursor') or ''
        if not cursor:
            break

    missing = [k for k in blobs if k not in existing]
    batch, size, sent = [], 0, 0
    def flush():
        nonlocal batch, size, sent
        if batch:
            js('PUT', f'{base}/storage/kv/namespaces/{ns}/bulk', batch)
            sent += len(batch)
            print(f'KV: {sent}/{len(missing)} archivos subidos')
            batch, size = [], 0
    for k in missing:
        value = base64.b64encode(blobs[k]).decode()
        if size + len(value) > 18_000_000:
            flush()
        batch.append({'key': k, 'value': value, 'base64': True})
        size += len(value)
    flush()
    total_mb = sum(len(b) for b in blobs.values()) / 1e6
    print(f'KV: {len(manifest)} archivos en el índice ({total_mb:.1f} MB), {len(missing)} nuevos')

    # 3. Worker con el índice incorporado y el namespace enlazado.
    script = (ROOT / 'deploy' / 'worker.js').read_text(encoding='utf-8').replace('__MANIFEST__', json.dumps(manifest, separators=(',', ':')))
    meta = {'main_module': 'worker.js', 'compatibility_date': '2025-09-01', 'bindings': [{'type': 'kv_namespace', 'name': 'ASSETS', 'namespace_id': ns}]}
    boundary = uuid.uuid4().hex
    parts = [('metadata', None, 'application/json', json.dumps(meta).encode()), ('worker.js', 'worker.js', 'application/javascript+module', script.encode())]
    body = b''
    for name, filename, ctype, content in parts:
        disp = f'form-data; name="{name}"' + (f'; filename="{filename}"' if filename else '')
        body += f'--{boundary}\r\nContent-Disposition: {disp}\r\nContent-Type: {ctype}\r\n\r\n'.encode() + content + b'\r\n'
    body += f'--{boundary}--\r\n'.encode()
    call('PUT', f'{base}/workers/scripts/{WORKER}', body, {'Content-Type': f'multipart/form-data; boundary={boundary}'})
    js('POST', f'{base}/workers/scripts/{WORKER}/subdomain', {'enabled': True, 'previews_enabled': False})
    sub = call('GET', f'{base}/workers/subdomain')['result']['subdomain']

    if '--limpiar' in sys.argv:
        stale = sorted(existing - set(blobs))
        for i in range(0, len(stale), 1000):
            call('POST', f'{base}/storage/kv/namespaces/{ns}/bulk/delete', json.dumps(stale[i:i + 1000]).encode(), {'Content-Type': 'application/json'})
        print(f'KV: {len(stale)} archivos viejos borrados')

    print(f'Publicado: https://{WORKER}.{sub}.workers.dev')
    print(f'Embebido:  https://{WORKER}.{sub}.workers.dev/embed')


if __name__ == '__main__':
    main()
