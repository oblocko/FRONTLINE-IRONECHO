// Automated end-to-end playthrough of Mission 01. Drives the real mission
// script: rides the truck, checks the three sensors through the interaction
// system, fights at the OP (AI fights for real for a while, then remaining
// hostiles are cleared via debug to keep runtime bounded), restores the radio,
// survives the waves, rescues Park, boards the APC, and verifies the mission
// complete screen + saved progression. Screenshots -> tests/output/
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = new URL('./output/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const PORT = 4174;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) r(); }); setTimeout(r, 5000); });
const errors = [];
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('fie.settings.v1', JSON.stringify({ graphics: { preset: 'low', shadows: 'medium', textures: 'low', effects: 'low', post: true, renderScale: 0.6 } })); });
const T0 = Date.now(); const log = (s) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${s}`);
const ev = (fn, arg) => page.evaluate(fn, arg);
const waitCP = (id, timeout = 300000) => page.waitForFunction((id) => window.__game.checkpointId === id, id, { timeout, polling: 500 });
const shot = (n) => page.screenshot({ path: OUT + n });
const useInteract = (match) => ev((match) => {
  const g = window.__game; const it = g.player.interactables.find((i) => i.enabled && i.prompt.includes(match)); if (!it) return false;
  const p = typeof it.pos === 'function' ? it.pos() : it.pos; g.player.teleport(p.clone().add({ x: 1.2, y: 0, z: 0.6 }));
  it.onUse(it); return true;
}, match);
const waitInteract = (match, timeout = 240000) => page.waitForFunction((m) => window.__game.player.interactables.some((i) => i.enabled && i.prompt.includes(m)), match, { timeout, polling: 500 });
const killAllEnemies = () => ev(() => { const g = window.__game; let n = 0; for (const a of g.director.agents) if (a.team === 'enemy' && !a.dead) { a.kill(g.player.position); n++; } return n; });
const stats = () => ev(() => { const g = window.__game; const e = g.director.agents.filter((a) => a.team === 'enemy'); return { cp: g.checkpointId, hp: Math.round(g.player.health), enemies: e.length, alive: e.filter((a) => !a.dead).length, combat: e.filter((a) => a.state === 'combat' && !a.dead).length, kills: g.stats.kills, objectives: g.objectives.active().map((o) => o.text) }; });
try {
  await page.goto(`http://localhost:${PORT}/?nolock&autostart`);
  await page.waitForSelector('#menu', { timeout: 90000 });
  await page.click('#menu [data-a=campaign]');
  await page.waitForSelector('#briefing .deploy .btn.primary:not([disabled])', { timeout: 120000 });
  await page.click('#briefing .deploy .btn.primary');
  await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 180000 });
  await ev(() => { window.__game.player.godMode = true; window.__game.timeScale = 3; });
  log('mission started (truck)');
  await page.waitForTimeout(6000); await shot('m01_a_truck.png');
  await waitCP('gp'); log('dismounted at GP'); await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(2500); await shot('m01_b_gp.png');
  await ev(() => { window.__game.timeScale = 3; });
  for (let i = 1; i <= 3; i++) { await waitInteract(`센서 ${i}번`); await useInteract(`센서 ${i}번`); log(`sensor ${i} checked`); await page.waitForTimeout(1500); }
  await waitCP('op_move'); log('blackout → move to OP'); await ev(() => { window.__game.timeScale = 1; window.__game.player.teleport({ x: 44, y: 0, z: -50 }, -Math.PI / 2); }); await page.waitForTimeout(5000); await shot('m01_c_barrage.png');
  await ev(() => { window.__game.timeScale = 3; window.__game.player.teleport({ x: 60, y: 0, z: -44 }, -Math.PI / 2); });
  await page.waitForFunction(() => window.__game.director.agents.some((a) => a.team === 'enemy'), null, { timeout: 120000 });
  await ev(() => { const g = window.__game; g.timeScale = 1; g.player.teleport({ x: 67, y: 0, z: -40.5 }, -Math.PI / 2 + 0.2); });
  log('OP firefight: letting AI fight 14s'); await page.waitForTimeout(14000); log(JSON.stringify(await stats())); await shot('m01_d_opfight.png');
  log('cleared ' + await killAllEnemies());
  await waitCP('op_radio'); log('radio'); await ev(() => { window.__game.timeScale = 3; });
  await waitInteract('무전기'); await useInteract('무전기');
  await page.waitForFunction(() => window.__game.director.agents.filter((a) => a.team === 'enemy' && !a.dead).length >= 4, null, { timeout: 120000 });
  await ev(() => { const g = window.__game; g.timeScale = 1; g.player.teleport({ x: 78, y: 0, z: -45 }, 0); });
  log('wave defense: AI fights 12s'); await page.waitForTimeout(12000); log(JSON.stringify(await stats())); await shot('m01_e_defense.png');
  for (let i = 0; i < 12; i++) { const n = await killAllEnemies(); if (n) log('cleared ' + n); const cp = await ev(() => window.__game.checkpointId); if (cp === 'fallback') break; await page.waitForTimeout(4000); }
  await waitCP('fallback'); log('fallback through village'); await ev(() => { window.__game.timeScale = 3; window.__game.player.teleport({ x: 76, y: 0, z: 34 }, Math.PI); });
  await waitInteract('박도윤'); await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(6000); log(JSON.stringify(await stats())); await shot('m01_f_ambush.png');
  await useInteract('박도윤'); log('Park rescued');
  await page.waitForTimeout(8000); await shot('m01_g_village.png');
  for (let i = 0; i < 10; i++) { await killAllEnemies(); const cp = await ev(() => window.__game.checkpointId); if (cp === 'extraction') break; await page.waitForTimeout(3000); }
  await waitCP('extraction'); log('extraction'); await ev(() => { window.__game.timeScale = 3; window.__game.player.teleport({ x: 100, y: 0, z: 110 }, 0); });
  await page.waitForFunction(() => window.__game.director.agents.filter((a) => a.team === 'enemy' && !a.dead).length >= 3, null, { timeout: 120000 });
  await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(9000); await shot('m01_h_rally.png'); log(JSON.stringify(await stats()));
  await ev(() => { window.__game.timeScale = 3; });
  await waitInteract('장갑차 탑승', 180000); await useInteract('장갑차 탑승'); log('boarded APC');
  await ev(() => { window.__game.timeScale = 2; }); await page.waitForTimeout(9000); await shot('m01_i_ending.png'); await page.waitForTimeout(9000); await shot('m01_i2_ending.png'); await ev(() => { window.__game.timeScale = 4; });
  await page.waitForSelector('#complete', { timeout: 180000 }); await page.waitForTimeout(800); await shot('m01_j_complete.png');
  const save = await ev(() => JSON.parse(localStorage.getItem('fie.save.v1')));
  log('save: ' + JSON.stringify({ unlocked: save.unlocked, completed: Object.keys(save.completed), checkpoint: save.checkpoint }));
  if (!save.completed.m01) errors.push('mission completion not saved');
} catch (e) { errors.push('test: ' + e.message); await shot('m01_fail.png').catch(() => {}); log(JSON.stringify(await stats().catch(() => ({})))); }
await browser.close(); server.kill();
if (errors.length) { console.log('ERRORS:\n' + errors.slice(0, 20).join('\n')); process.exit(1); }
console.log('MISSION 01 PLAYTHROUGH OK');
process.exit(0);
