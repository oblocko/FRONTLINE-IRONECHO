#!/usr/bin/env python3
"""Download the files of a free (CC0) itch.io asset pack, e.g. Quaternius packs.
Usage: python3 tools/fetch_itch_free.py <creator> <game-slug> <out-dir> [name-filter]
Follows the public "download now / no thanks" flow: game page -> download_url ->
download page (lists uploads) -> per-upload signed CDN URL (valid ~60 s)."""
import http.cookiejar, json, os, re, sys, urllib.parse, urllib.request

creator, slug, out = sys.argv[1], sys.argv[2], sys.argv[3]
flt = sys.argv[4].lower() if len(sys.argv) > 4 else ''
base = f'https://{creator}.itch.io/{slug}'
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
op.addheaders = [('User-Agent', 'Mozilla/5.0 (asset-fetch)')]
def get(u): return op.open(u, timeout=60).read().decode('utf-8', 'replace')
def post(u, data): return op.open(urllib.request.Request(u, data=urllib.parse.urlencode(data).encode(), method='POST'), timeout=60).read().decode()
tok = lambda html: re.search(r'name="csrf_token" value="([^"]+)"', html).group(1)

page = get(base)
dl = json.loads(post(base + '/download_url', {'csrf_token': tok(page)}))['url']
dpage = get(dl)
uploads = re.findall(r'data-upload_id="(\d+)"', dpage)
names = re.findall(r'<strong[^>]*class="name"[^>]*title="([^"]+)"', dpage) or re.findall(r'title="([^"]+\.(?:zip|rar|7z|glb|fbx))"', dpage)
os.makedirs(out, exist_ok=True)
for uid, name in zip(dict.fromkeys(uploads), names):
    if flt and flt not in name.lower(): print('skip', name); continue
    r = json.loads(post(f'{base}/file/{uid}?source=view_game&as_props=1&after_download_lightbox=true', {'csrf_token': tok(dpage)}))
    dest = os.path.join(out, re.sub(r'[^\w.\-\[\] ]', '_', name))
    print('download', name, '->', dest, flush=True)
    with op.open(r['url'], timeout=600) as src, open(dest, 'wb') as f:
        while True:
            b = src.read(1 << 20)
            if not b: break
            f.write(b)
    print('  bytes', os.path.getsize(dest))
