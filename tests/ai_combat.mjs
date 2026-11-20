// Focused AI combat test: resumes Mission 01 from the 'op_move' checkpoint via
// the real CONTINUE flow, lets the OP firefight run for 45 s with the player in
// god mode, and reports AI metrics (shots, hits, cover moves, kills, deaths).
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = new URL('./output/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const PORT = 4175;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) r(); }); setTimeout(r, 5000); });
const errors = [];
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => {
  localStorage.setItem('fie.settings.v1', JSON.stringify({ graphics: { preset: 'low', shadows: 'off', textures: 'low', effects: 'low', post: false, renderScale: 0.5 } }));
  localStorage.setItem('fie.save.v1', JSON.stringify({ version: 1, unlocked: ['m01'], completed: {}, checkpoint: { missionId: 'm01', checkpointId: 'op_move', savedAt: Date.now() }, lastMission: 'm01', storyFlags: {} }));
});
try {
  await page.goto(`http://localhost:${PORT}/?nolock&autostart`);
  await page.waitForSelector('#menu [data-a=continue]:not([disabled])', { timeout: 90000 });
  await page.click('#menu [data-a=continue]');
  await page.waitForSelector('#briefing .deploy .btn.primary:not([disabled])', { timeout: 120000 });
  await page.click('#briefing .deploy .btn.primary');
  await page.waitForFunction(() => window.__game?.state === 'playing' && window.__game.checkpointId === 'op_move', null, { timeout: 180000 });
  console.log('resumed at op_move checkpoint');
  await page.evaluate(() => { const g = window.__game; g.player.godMode = true; g.player.teleport({ x: 60, y: 0, z: -44 }, -Math.PI / 2); });
  await page.waitForFunction(() => window.__game.director.agents.some((a) => a.team === 'enemy'), null, { timeout: 120000 });
  await page.evaluate(() => window.__game.player.teleport({ x: 66, y: 0, z: -41 }, -Math.PI / 2 + 0.2));
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < 45000) {
    await page.waitForTimeout(5000);
    last = await page.evaluate(() => { const g = window.__game, d = g.director; const e = d.agents.filter((a) => a.team === 'enemy');
      return { t: Math.round(g.mission.time), alive: e.filter((a) => !a.dead).length, states: e.filter((a) => !a.dead).map((a) => `${a.state}/${a.coverPhase}${a.cover ? '+C' : ''}`).join(' '), friendlyStates: d.friendlies().map((a) => `${a.name}:${a.coverPhase || '-'}${a.cover ? '+C' : ''}${a.target ? '+T' : ''}`).join(' '), ...d.metrics, playerDamageTaken: 100 - g.player.health, killsBySquad: e.filter((a) => a.dead).length - g.stats.kills }; });
    console.log(JSON.stringify(last));
  }
  await page.screenshot({ path: OUT + 'ai_combat.png' });
  if (last.shots.enemy === 0) errors.push('enemies never fired');
  if (last.shots.friendly === 0) errors.push('squad never fired');
  if (last.coverMoves === 0) errors.push('no cover usage');
} catch (e) { errors.push('test: ' + e.message); await page.screenshot({ path: OUT + 'ai_fail.png' }).catch(() => {}); }
await browser.close(); server.kill();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('AI COMBAT OK');
process.exit(0);
