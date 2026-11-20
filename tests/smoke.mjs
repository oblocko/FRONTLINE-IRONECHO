// Smoke test: boots the built game in headless Chromium, walks the main menu,
// opens settings / mission select / briefing, deploys Mission 01 and verifies
// the mission is running without runtime errors. Screenshots -> tests/output/
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;
import { mkdirSync } from 'node:fs';

const OUT = new URL('./output/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const PORT = 4173;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) r(); }); setTimeout(r, 5000); });

const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => {
  if (!localStorage.getItem('fie.settings.v1')) localStorage.setItem('fie.settings.v1', JSON.stringify({ graphics: { preset: 'low', shadows: 'medium', textures: 'low', effects: 'low', post: true, renderScale: 0.6 } }));
});
const step = async (name, fn) => { const t = Date.now(); await fn(); console.log(`✓ ${name} (${Date.now() - t}ms)`); };
try {
  await page.goto(`http://localhost:${PORT}/?nolock`, { waitUntil: 'load' });
  await step('boot', async () => { await page.waitForSelector('#boot .start:not(.hidden)', { timeout: 60000 }); await page.click('#boot .start'); });
  await step('main menu', async () => { await page.waitForSelector('#menu', { timeout: 20000 }); await page.waitForTimeout(2500); await page.screenshot({ path: OUT + '01_menu.png' }); });
  await step('settings', async () => { await page.click('#menu [data-a=settings]'); await page.waitForSelector('#settings'); for (const t of ['audio', 'controls', 'gameplay']) await page.click(`#settings [data-t=${t}]`); await page.screenshot({ path: OUT + '02_settings.png' }); await page.click('#settings [data-a=back]'); });
  await step('mission select', async () => { await page.click('#menu [data-a=select]'); await page.waitForSelector('#select'); await page.click('#select .mcard[data-id=m12]'); await page.screenshot({ path: OUT + '03_select.png' }); await page.click('#select [data-a=back]'); });
  await step('briefing + load', async () => { await page.click('#menu [data-a=campaign]'); await page.waitForSelector('#briefing'); await page.waitForSelector('#briefing .deploy .btn.primary:not([disabled])', { timeout: 120000 }); await page.screenshot({ path: OUT + '04_briefing.png' }); });
  await step('deploy mission 01', async () => {
    await page.click('#briefing .deploy .btn.primary');
    await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 180000 });
    await page.waitForTimeout(9000);
    await page.screenshot({ path: OUT + '05_truck.png' });
  });
  const info = await page.evaluate(() => { const g = window.__game; return { state: g.state, cp: g.checkpointId, agents: g.director.agents.length, covers: g.director.covers.length, colliders: g.world.colliders.length, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }; });
  console.log('runtime', info);
} catch (e) { errors.push('test: ' + e.message); await page.screenshot({ path: OUT + 'fail.png' }).catch(() => {}); }
await browser.close(); server.kill();
if (errors.length) { console.log('ERRORS:\n' + errors.slice(0, 30).join('\n')); process.exit(1); }
console.log('SMOKE OK');
process.exit(0);
