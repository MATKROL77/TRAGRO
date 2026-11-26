#!/usr/bin/env python3
"""Deploy del build (dist/) a Cloudflare Workers + KV.
Uso: CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... python3 deploy/deploy-worker.py
"""
import base64, json, mimetypes, os, subprocess, sys, tempfile

ACC = os.environ.get('CLOUDFLARE_ACCOUNT_ID', 'ea060ae701e304a6d55624287327abdd')
TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', 'proxy-injected')
NAME = os.environ.get('WORKER_NAME', 'surco-configurador')
API = f'https://api.cloudflare.com/client/v4/accounts/{ACC}'

def curl(method, url, data=None, ctype='application/json', form=None):
    cmd = ['curl', '-sS', '-X', method, url, '-H', f'Authorization: Bearer {TOKEN}']
    tmp = None
    if form:
        for f in form:
            cmd += ['-F', f]
    elif data is not None:
        tmp = tempfile.NamedTemporaryFile(delete=False)
        tmp.write(data if isinstance(data, bytes) else data.encode())
        tmp.close()
        cmd += ['-H', f'Content-Type: {ctype}', '--data-binary', f'@{tmp.name}']
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    if tmp:
        os.unlink(tmp.name)
    try:
        r = json.loads(out)
    except Exception:
        sys.exit(f'Respuesta inesperada: {out[:400]}')
    if not r.get('success'):
        sys.exit(f'Error {method} {url}: {r.get("errors")}')
    return r.get('result')

# 1) namespace KV
title = f'{NAME}-assets'
ns = next((n['id'] for n in curl('GET', f'{API}/storage/kv/namespaces?per_page=100') if n['title'] == title), None)
if not ns:
    ns = curl('POST', f'{API}/storage/kv/namespaces', json.dumps({'title': title}))['id']
print('KV namespace:', ns)
leads_title = f'{NAME}-leads'
leads = next((n['id'] for n in curl('GET', f'{API}/storage/kv/namespaces?per_page=100') if n['title'] == leads_title), None)
if not leads:
    leads = curl('POST', f'{API}/storage/kv/namespaces', json.dumps({'title': leads_title}))['id']
print('KV leads:', leads)

# 2) subir archivos de dist/
items = []
for root, _, files in os.walk('dist'):
    for f in files:
        p = os.path.join(root, f)
        key = os.path.relpath(p, 'dist').replace(os.sep, '/')
        with open(p, 'rb') as fh:
            items.append({'key': key, 'value': base64.b64encode(fh.read()).decode(), 'base64': True})
for i in range(0, len(items), 25):
    curl('PUT', f'{API}/storage/kv/namespaces/{ns}/bulk', json.dumps(items[i:i + 25]))
print('Archivos subidos:', len(items))

# 3) script del Worker con el binding
meta = json.dumps({'main_module': 'worker.js', 'compatibility_date': '2024-11-01', 'bindings': [{'type': 'kv_namespace', 'name': 'ASSETS', 'namespace_id': ns}, {'type': 'kv_namespace', 'name': 'LEADS', 'namespace_id': leads}]})
here = os.path.dirname(os.path.abspath(__file__))
curl('PUT', f'{API}/workers/scripts/{NAME}', form=[f'metadata={meta};type=application/json', f'worker.js=@{here}/worker.js;type=application/javascript+module'])
curl('POST', f'{API}/workers/scripts/{NAME}/subdomain', json.dumps({'enabled': True, 'previews_enabled': False}))
sub = curl('GET', f'{API}/workers/subdomain')['subdomain']
print(f'Listo: https://{NAME}.{sub}.workers.dev')
