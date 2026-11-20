// Start a mission at a checkpoint via the real CONTINUE flow and capture screenshots.
// usage: node tests/mission_checkpoint.mjs <missionId> <checkpointId> [seconds] [--dev]
//   --dev uses the Vite dev server (source files) instead of the built dist/
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const args = process.argv.slice(2).filter((a) => !a.startsWith('--')); const dev = process.argv.includes('--dev');
const [mission = 'm02', cp = 'convoy', secs = '20'] = args;
const OUT = new URL('./output/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const PORT = dev ? 5191 : 4192;
const server = spawn('npx', dev ? ['vite', '--port', String(PORT), '--strictPort'] : ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) r(); }); setTimeout(r, 8000); });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(([mission, cp]) => {
  localStorage.setItem('fie.settings.v1', JSON.stringify({ graphics: { preset: 'medium', shadows: 'medium', textures: 'low', effects: 'medium', post: true, renderScale: 0.7 } }));
  localStorage.setItem('fie.save.v1', JSON.stringify({ version: 1, unlocked: ['m01', mission], completed: {}, checkpoint: { missionId: mission, checkpointId: cp, savedAt: Date.now() }, lastMission: mission, storyFlags: {} }));
}, [mission, cp]);
const t0 = Date.now(); const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
try {
  await page.goto(`http://localhost:${PORT}/?nolock&autostart`);
  await page.waitForSelector('#menu [data-a=continue]:not([disabled])', { timeout: 120000 });
  await page.click('#menu [data-a=continue]');
  await page.waitForSelector('#briefing .deploy .btn.primary:not([disabled])', { timeout: 180000 });
  await page.screenshot({ path: OUT + `${mission}_briefing.png` });
  await page.click('#briefing .deploy .btn.primary');
  await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 240000 });
  log(`playing ${mission}/${cp}`);
  await page.evaluate(() => { window.__game.player.godMode = true; });
  const n = Math.max(1, Math.round(+secs / 10));
  for (let i = 0; i < n; i++) {
    await page.waitForTimeout(10000);
    await page.screenshot({ path: OUT + `${mission}_${cp}_${i}.png` });
    log(JSON.stringify(await page.evaluate(() => { const g = window.__game; return { cp: g.checkpointId, t: Math.round(g.mission.time), pos: g.player.position.toArray().map(Math.round), obj: g.objectives.active().map((o) => o.text), agents: g.director.agents.length, veh: g.director.vehicles.length }; })));
  }
} catch (e) { errors.push('test: ' + e.message); await page.screenshot({ path: OUT + `${mission}_${cp}_fail.png` }).catch(() => {}); }
await browser.close(); server.kill();
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'OK');
process.exit(errors.length ? 1 : 0);
