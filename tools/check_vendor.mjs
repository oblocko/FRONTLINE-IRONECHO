// The GitHub Pages site runs the unbundled source through index.html's import map, so every
// three.js add-on imported by src/ must also exist under vendor/three. Fails (exit 1) if one is missing.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
const missing = new Set();
for (const f of walk('src')) for (const m of readFileSync(f, 'utf8').matchAll(/from '(three\/examples\/jsm\/[^']+)'/g)) { const v = join('vendor/three', m[1].slice('three/'.length)); if (!existsSync(v)) missing.add(`${v} (imported by ${f})`); }
if (missing.size) { console.error('missing in vendor/three:\n' + [...missing].join('\n')); process.exit(1); }
console.log('vendor/three has every add-on the source imports');
