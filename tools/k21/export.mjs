// Renders preview sheets and exports the K21 hull to models_wip/k21/ (not used by the game).
// Usage: node tools/k21/export.mjs <static-server-url-of-repo-root>
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process'; import { writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url); const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const base = process.argv[2] || 'http://localhost:5182'; const out = new URL('../../models_wip/k21/', import.meta.url).pathname; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(base + '/tools/k21/k21_viewer.html'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
await p.screenshot({ path: out + 'k21_hull_preview.png' });
const info = await p.evaluate(() => window.__info); const glb = await p.evaluate(() => window.exportGLB());
if (glb.startsWith('ERR')) throw new Error(glb);
writeFileSync(out + 'k21_hull.glb', Buffer.from(glb, 'base64'));
console.log(JSON.stringify(info), errs.join('\n') || 'ok'); await b.close();
