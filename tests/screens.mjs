// Captures in-game screenshots at given checkpoints via the real CONTINUE flow.
// usage: node tests/screens.mjs gp fallback   (default settings: high preset)
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = new URL('./output/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const cps = process.argv.slice(2).length ? process.argv.slice(2) : ['gp'];
const PORT = 4176;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) r(); }); setTimeout(r, 5000); });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
for (const cp of cps) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(cp + ' pageerror: ' + e.message));
  await page.addInitScript((cp) => {
    localStorage.setItem('fie.settings.v1', JSON.stringify({ graphics: { preset: 'medium', shadows: 'medium', textures: 'medium', effects: 'medium', post: true, renderScale: 0.75 } }));
    localStorage.setItem('fie.save.v1', JSON.stringify({ version: 1, unlocked: ['m01'], completed: {}, checkpoint: { missionId: 'm01', checkpointId: cp, savedAt: Date.now() }, lastMission: 'm01', storyFlags: {} }));
  }, cp);
  await page.goto(`http://localhost:${PORT}/?nolock&autostart`);
  await page.waitForSelector('#menu [data-a=continue]:not([disabled])', { timeout: 90000 });
  await page.click('#menu [data-a=continue]');
  await page.waitForSelector('#briefing .deploy .btn.primary:not([disabled])', { timeout: 120000 });
  await page.click('#briefing .deploy .btn.primary');
  await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 180000 });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: OUT + `screen_${cp}.png` });
  console.log('captured', cp);
  await page.close();
}
await browser.close(); server.kill();
console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'SCREENS OK');
process.exit(0);
