// The GitHub Pages site runs the unbundled source through index.html's import map, so every
// three.js add-on imported by src/ — and every file those add-ons import in turn — must also exist
// under vendor/three. Fails (exit 1) if one is missing. `--sync` copies the missing files from
// node_modules/three (same version as the vendored build).
import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
const sync = process.argv.includes('--sync');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
const missing = new Set(); const seen = new Set();
const visit = (rel, by) => {          // rel: path under three/ (e.g. examples/jsm/postprocessing/GTAOPass.js)
  if (seen.has(rel)) return; seen.add(rel);
  const v = join('vendor/three', rel), nm = join('node_modules/three', rel);
  if (!existsSync(v)) {
    if (sync && existsSync(nm)) { mkdirSync(dirname(v), { recursive: true }); copyFileSync(nm, v); console.log('copied', v); }
    else { missing.add(`${v} (imported by ${by})`); return; }
  }
  for (const m of readFileSync(v, 'utf8').matchAll(/(?:from|import)\s*'(\.{1,2}\/[^']+)'/g)) visit(relative('vendor/three', resolve(dirname(v), m[1])), v);
};
for (const f of walk('src')) for (const m of readFileSync(f, 'utf8').matchAll(/from '(three\/examples\/jsm\/[^']+)'/g)) visit(m[1].slice('three/'.length), f);
if (missing.size) { console.error('missing in vendor/three (run node tools/check_vendor.mjs --sync):\n' + [...missing].join('\n')); process.exit(1); }
console.log(`vendor/three has every add-on the source imports (${seen.size} files checked)`);
