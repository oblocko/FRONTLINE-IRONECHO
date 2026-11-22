#!/usr/bin/env python3
"""Download Sketchfab models (glb) + credit metadata. Needs the account API token sent as "Authorization: Token <key>" (here injected by the network proxy).
Usage: python3 tools/sketchfab_get.py <outdir> <uid...>"""
import json, sys, urllib.request, os
out = sys.argv[1]; uids = sys.argv[2:]
meta = json.load(open(f'{out}/meta.json')) if os.path.exists(f'{out}/meta.json') else {}
def get(u): return json.load(urllib.request.urlopen(u, timeout=60))
for uid in uids:
    m = get(f'https://api.sketchfab.com/v3/models/{uid}')
    d = get(f'https://api.sketchfab.com/v3/models/{uid}/download')
    if 'glb' not in d: print('no glb', uid); continue
    urllib.request.urlretrieve(d['glb']['url'], f'{out}/{uid}.glb')
    meta[uid] = dict(name=m['name'], author=m['user']['displayName'], profile=m['user']['profileUrl'], license=m['license']['label'], url=m['viewerUrl'], faces=m.get('faceCount'))
    print(uid, m['name'], '|', m['user']['displayName'], '|', m['license']['label'], '|', os.path.getsize(f'{out}/{uid}.glb'))
json.dump(meta, open(f'{out}/meta.json', 'w'), indent=1, ensure_ascii=False)
