#!/usr/bin/env python3
"""Download CC0 assets from Poly Haven (https://polyhaven.com) into assets/.

usage:
  python3 tools/fetch_polyhaven.py model service_pistol ammo_box --res 1k
  python3 tools/fetch_polyhaven.py texture snow_02 asphalt_02 --res 1k

Models land in assets/models/<id>/<id>.gltf (+ .bin + textures/), textures in
assets/textures/<id>/ (diff / nor_gl / rough or arm jpgs). Every downloaded
asset is appended to assets/CREDITS.md with its author and CC0 licence.
"""
import argparse, json, os, sys, urllib.request

API = 'https://api.polyhaven.com'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
UA = {'User-Agent': 'frontline-iron-echo-asset-fetch/1.0'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def save(url, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        return 0
    data = get(url)
    with open(path, 'wb') as f:
        f.write(data)
    return len(data)


def credit(kind, asset_id):
    info = json.loads(get(f'{API}/info/{asset_id}'))
    authors = ', '.join(info.get('authors', {}).keys()) or 'Poly Haven'
    line = f'| {kind} | `{asset_id}` | {info.get("name", asset_id)} | {authors} | CC0 1.0 | https://polyhaven.com/a/{asset_id} |\n'
    path = os.path.join(ROOT, 'CREDITS.md')
    if not os.path.exists(path):
        with open(path, 'w') as f:
            f.write('# Third-party assets\n\nAll assets below are CC0 1.0 (public domain) from Poly Haven. Attribution is not required but is given here.\n\n'
                    '| Type | ID | Name | Author(s) | Licence | Source |\n|---|---|---|---|---|---|\n')
    with open(path) as f:
        if f'`{asset_id}`' in f.read():
            return
    with open(path, 'a') as f:
        f.write(line)


def fetch_model(asset_id, res):
    files = json.loads(get(f'{API}/files/{asset_id}'))
    g = files['gltf'][res]['gltf']
    out = os.path.join(ROOT, 'models', asset_id)
    n = save(g['url'], os.path.join(out, f'{asset_id}.gltf'))
    for rel, inc in g.get('include', {}).items():
        n += save(inc['url'], os.path.join(out, rel))
    credit('model', asset_id)
    return n


def fetch_texture(asset_id, res):
    files = json.loads(get(f'{API}/files/{asset_id}'))
    out = os.path.join(ROOT, 'textures', asset_id)
    n = 0
    for key, name in (('Diffuse', 'diff'), ('nor_gl', 'nor_gl'), ('Rough', 'rough'), ('arm', 'arm')):
        entry = files.get(key, {}).get(res, {}).get('jpg')
        if entry:
            n += save(entry['url'], os.path.join(out, f'{asset_id}_{name}_{res}.jpg'))
    credit('texture', asset_id)
    return n


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('kind', choices=['model', 'texture'])
    ap.add_argument('ids', nargs='+')
    ap.add_argument('--res', default='1k')
    a = ap.parse_args()
    for i in a.ids:
        try:
            n = (fetch_model if a.kind == 'model' else fetch_texture)(i, a.res)
            print(f'{i}: {n / 1e6:.2f} MB')
        except Exception as e:  # keep going with the rest
            print(f'{i}: FAILED {e}', file=sys.stderr)
