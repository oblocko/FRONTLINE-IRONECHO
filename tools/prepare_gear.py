#!/usr/bin/env python3
"""Build the game's weapon / armour assets from downloaded Sketchfab glb files (CC-BY, credited in assets/CREDITS.md).

Download: tools/sketchfab_get.py <dir> <uid...>  (needs a Sketchfab API token; writes <uid>.glb + meta.json)
Usage:    python3 tools/prepare_gear.py <dir> [gltf-transform-cmd]
Output:   assets/gear/<name>.glb   textures re-encoded as JPEG at the size below, meshes flattened/joined/welded,
          optionally simplified; assets/gear/sources.json (name, author, licence, url) for the credits.
"""
import json, os, re, shutil, subprocess, sys, tempfile
from PIL import Image

SRC = sys.argv[1]
GT = (sys.argv[2] if len(sys.argv) > 2 else 'npx gltf-transform').split()
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'gear'); os.makedirs(OUT, exist_ok=True)
# name: (uid, texture px, simplify ratio or None)
ITEMS = {
  'k2c1':      ('bef177d77892495083202f7c656a2586', 512, None),
  'ak74':      ('87a76b087e044b60ba9e9bf7ae814fb6', 1024, 0.6),
  'ak74m':     ('9084c3bae8224d338103997bc3101480', 1024, 0.6, r'^(Round|Shell)_'),   # drop the loose cartridge props
  'm4a1':      ('1b858701dd7142d9b82bbe3fd121a97b', 512, 0.25),
  'carrier':   ('3b51e6329dbb4b0aa14e43f12eb6c42a', 1024, None),
  'vestpack':  ('7c41d35e505c4057abe60f89537408bd', 512, None),
  'helmet_hs': ('82adf376164f4d99a4e0b2949930e2ad', 1024, 0.5),
}
def gt(*a): subprocess.run(GT + list(a), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
meta = json.load(open(os.path.join(SRC, 'meta.json'))); sources = {}
for name, (uid, size, ratio, *drop) in ITEMS.items():
    with tempfile.TemporaryDirectory() as t:
        g = os.path.join(t, 'm.gltf'); gt('copy', os.path.join(SRC, uid + '.glb'), g)
        j = json.load(open(g))
        if drop:
            for n in j['nodes']:
                if 'mesh' in n and re.search(drop[0], j['meshes'][n['mesh']].get('name', '') or n.get('name', '')): n.pop('mesh')
        normals = {m['normalTexture']['index'] for m in j.get('materials', []) if 'normalTexture' in m}
        for ti, tex in enumerate(j.get('textures', [])):
            im = j['images'][tex['source']]
            if im.get('_done'): continue
            p = os.path.join(t, im['uri']); img = Image.open(p)
            keepA = img.mode in ('RGBA', 'LA') and img.getchannel('A').getextrema()[0] < 250
            if max(img.size) > size: img = img.resize((size, size), Image.LANCZOS)
            if keepA: n = os.path.splitext(im['uri'])[0] + '_s.png'; img.save(os.path.join(t, n)); im['mimeType'] = 'image/png'
            else: n = os.path.splitext(im['uri'])[0] + '_s.jpg'; img.convert('RGB').save(os.path.join(t, n), quality=92 if ti in normals else 84); im['mimeType'] = 'image/jpeg'
            im['uri'] = n; im['_done'] = 1
        for im in j.get('images', []): im.pop('_done', None)
        json.dump(j, open(g, 'w'))
        o = os.path.join(OUT, name + '.glb'); gt('copy', g, o)
        for step in (['flatten'], ['join'], ['weld'], ['prune'], ['dedup']): gt(step[0], o, o)
        if ratio: gt('simplify', o, o, '--ratio', str(ratio), '--error', '0.0008')
    m = meta[uid]; sources[name] = dict(title=m['name'], author=m['author'], license=m['license'], url=m['url'])
    print(name, os.path.getsize(o) // 1024, 'KB')
json.dump(sources, open(os.path.join(OUT, 'sources.json'), 'w'), indent=1, ensure_ascii=False)
