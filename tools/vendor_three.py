#!/usr/bin/env python3
"""Copy the three.js modules the game imports (plus their relative imports)
from node_modules/three into vendor/three, for unbundled static hosting
(GitHub Pages) via the import map in index.html.

Run after `npm install` and after upgrading three:  python3 tools/vendor_three.py
"""
import os, re, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..'))
SRC = os.path.join(REPO, 'node_modules', 'three')
DST = os.path.join(REPO, 'vendor', 'three')

# every 'three/examples/jsm/...' module imported anywhere under src/
roots = {'build/three.module.js'}
for d, _, fs in os.walk(os.path.join(REPO, 'src')):
    for f in fs:
        if f.endswith('.js'):
            for m in re.findall(r"from\s+'three/(examples/jsm/[^']+)'", open(os.path.join(d, f)).read()):
                roots.add(m)

seen, stack = set(), list(roots)
while stack:
    f = stack.pop()
    if f in seen:
        continue
    seen.add(f)
    txt = open(os.path.join(SRC, f)).read()
    for m in re.findall(r"""(?:from|import)\s*['"](\.{1,2}/[^'"]+)['"]""", txt):
        stack.append(os.path.normpath(os.path.join(os.path.dirname(f), m)))

shutil.rmtree(DST, ignore_errors=True)
for f in sorted(seen):
    os.makedirs(os.path.join(DST, os.path.dirname(f)), exist_ok=True)
    shutil.copy(os.path.join(SRC, f), os.path.join(DST, f))
shutil.copy(os.path.join(SRC, 'LICENSE'), os.path.join(DST, 'LICENSE'))
print(f'vendored {len(seen)} files into vendor/three')
