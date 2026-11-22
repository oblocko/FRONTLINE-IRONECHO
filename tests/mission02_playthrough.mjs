// Mission 02 end-to-end: verifies the campaign auto-continue from the M01 debrief
// into M02 (no menu), then drives every M02 event: convoy, pushing the car, drone
// swarm, spotter drone + SOF fight, dark station (shutter, timed charge, survivors),
// civilian escort, bus escort with mounted MG and overpass collapse, completion + save.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = new URL('./output/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const PORT = 4193;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--outDir', process.env.OUTDIR || 'dist']   /* OUTDIR: test a frozen copy of the build while dist is rebuilt */, { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) r(); }); setTimeout(r, 6000); });
const errors = [];
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const START = process.env.START || null; // optional: resume at a checkpoint instead of the continuity flow
await page.addInitScript((start) => { if (sessionStorage.getItem('init')) return; sessionStorage.setItem('init', 1); localStorage.clear(); localStorage.setItem('fie.settings.v1', JSON.stringify({ graphics: { preset: 'low', shadows: 'off', textures: 'low', effects: 'low', post: false, renderScale: 0.5 } }));
  if (start) localStorage.setItem('fie.save.v1', JSON.stringify({ version: 1, unlocked: ['m01', 'm02'], completed: { m01: { time: 1, kills: 0, accuracy: 0, headshots: 0, deaths: 0 } }, checkpoint: { missionId: 'm02', checkpointId: start, savedAt: Date.now() }, lastMission: 'm02', storyFlags: {} })); }, START);
const order = ['convoy', 'jam', 'avenue', 'station', 'escort', 'busrun']; const from = (id) => !START || order.indexOf(id) >= order.indexOf(START);
const T0 = Date.now(); const log = (s) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${s}`);
const ev = (fn, arg) => page.evaluate(fn, arg);
const waitCP = (id, timeout = 600000) => page.waitForFunction((id) => window.__game.checkpointId === id && window.__game.state === 'playing', id, { timeout, polling: 500 });
const shot = (n) => page.screenshot({ path: OUT + n });
const waitInteract = (m, timeout = 600000) => page.waitForFunction((m) => window.__game.player.interactables.some((i) => i.enabled && i.prompt.includes(m)), m, { timeout, polling: 500 });
const useInteract = (m, tp = true) => ev(([m, tp]) => { const g = window.__game; const it = g.player.interactables.find((i) => i.enabled && i.prompt.includes(m)); if (!it) return false; const p = typeof it.pos === 'function' ? it.pos() : it.pos; if (tp) g.player.teleport(p.clone().add({ x: -1.0, y: 0, z: 0.4 })); it.onUse(it); return true; }, [m, tp]);
const killAll = () => ev(() => { const g = window.__game; let n = 0; for (const a of g.director.agents) if (a.team === 'enemy' && !a.dead) { a.kill(g.player.position); n++; } for (const v of g.director.vehicles) if (!v.dead && !v.removed) { v.damage(99999); n++; } return n; });
const stats = () => ev(() => { const g = window.__game; return { cp: g.checkpointId, t: Math.round(g.mission?.time || 0), obj: g.objectives.active().map((o) => o.text + (o.count ? ` ${o.progress}/${o.count}` : '')), enemies: g.director.enemies().length, veh: g.director.vehicles.filter((v) => !v.dead).length, hp: Math.round(g.player.health) }; });
try {
  await page.goto(`http://localhost:${PORT}/?nolock&autostart`);
  await page.waitForSelector('#menu', { timeout: 120000 });
  if (START) { await page.click('#menu [data-a=continue]'); await page.waitForSelector('#briefing .deploy .btn.primary:not([disabled])', { timeout: 300000 }); await page.click('#briefing .deploy .btn.primary'); await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 300000 }); await ev(() => { const g = window.__game; g.player.godMode = true; g.timeScale = 3; }); log('resumed at ' + START); }
  else {
  // ---- campaign continuity: M01 debrief -> M02 briefing -> auto deploy (no clicks) ----
  await ev(() => { const g = window.__game; g.ui.missionComplete(g.missions.byId('m01'), { time: 1500, kills: 30, accuracy: 40, headshots: 5, deaths: 0, epilogue: 'test' }, g.missions.next('m01')); });
  await page.waitForSelector('#transition:not(.hidden)', { timeout: 10000 }); await shot('mission02_0_transition.png'); log('M01 end rolls straight into the next operation title card (no menu/briefing)');
  if (await page.$('#briefing:not(.hidden)')) errors.push('briefing screen shown during campaign transition');
  await page.waitForFunction(() => window.__game?.state === 'playing' && window.__game.missionId === 'm02', null, { timeout: 300000 }); log('auto-deployed into M02 (no clicks)');
  await ev(() => { const g = window.__game; g.player.godMode = true; g.timeScale = 3; });
  await shot('m02_a_convoy.png');
  }
  if (from('jam')) {
  await waitCP('jam'); log('convoy done → jam'); await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(3000); await shot('m02_b_jam.png');
  await waitInteract('차량 밀기'); await useInteract('차량 밀기'); log('car pushed');
  await page.waitForFunction(() => window.__game.objectives.get('drones'), null, { timeout: 300000, polling: 1000 });
  await page.waitForTimeout(8000); await shot('m02_c_drones.png'); log('drones: ' + JSON.stringify(await stats()));
  await ev(() => { window.__game.timeScale = 3; });
  for (let i = 0; i < 200 && (await ev(() => window.__game.checkpointId)) === 'jam'; i++) { await killAll(); await page.waitForTimeout(2500); }
  }
  if (from('avenue')) {
  await waitCP('avenue'); log('avenue'); await ev(() => { window.__game.player.teleport({ x: -3, y: 0, z: -68 }, Math.PI); });
  await page.waitForFunction(() => window.__game.director.enemies().length >= 4, null, { timeout: 300000, polling: 1000 });
  await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(10000); await shot('m02_d_avenue.png'); log('SOF fight: ' + JSON.stringify(await stats()));
  await killAll(); await ev(() => { window.__game.timeScale = 3; window.__game.player.teleport({ x: 12, y: 0, z: 18 }, 0); });
  }
  if (from('station')) {
  await waitCP('station'); log('station entrance');
  await waitInteract('역사로'); await useInteract('역사로', false); await page.waitForTimeout(4000); await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(4000); await shot('m02_e_station_dark.png');
  await ev(() => { window.__game.timeScale = 3; });
  await waitInteract('셔터'); await useInteract('셔터'); log('shutter raised');
  await waitInteract('폭약 해체'); await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(6000); await shot('m02_f_platform.png'); log('charge armed: ' + JSON.stringify(await stats()));
  await useInteract('폭약 해체'); log('charge defused'); await killAll(); await ev(() => { window.__game.timeScale = 3; });
  await waitInteract('열차 문'); await useInteract('열차 문'); log('survivors found');
  }
  if (from('escort')) {
  await waitCP('escort'); log('escort'); await page.waitForTimeout(3000); await ev(() => { window.__game.player.teleport({ x: 303.5, y: 0, z: 0 }, Math.PI / 2); });
  await page.waitForFunction(() => window.__game.objectives.get('out')?.done, null, { timeout: 300000, polling: 1000 });
  await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(5000); await shot('m02_g_street_civilians.png'); await ev(() => { window.__game.timeScale = 3; });
  await ev(() => { window.__game.player.teleport({ x: -4, y: 0, z: 45 }, Math.PI); });
  for (let i = 0; i < 30; i++) { await killAll(); await page.waitForTimeout(2000); if (await ev(() => window.__game.objectives.get('bus'))) break; }
  await ev(() => { window.__game.player.teleport({ x: -4.5, y: 0, z: 67 }, Math.PI); });
  for (let i = 0; i < 200 && (await ev(() => window.__game.checkpointId)) === 'escort'; i++) { await killAll(); await page.waitForTimeout(2500); }
  }
  await waitCP('busrun'); log('bus escort');
  await waitInteract('호송 트럭'); await useInteract('호송 트럭', false);
  await page.waitForFunction(() => window.__game.mounted.some((m) => m.manned), null, { timeout: 120000, polling: 1000 });
  await page.waitForFunction(() => window.__game.director.vehicles.some((v) => !v.dead), null, { timeout: 300000, polling: 1000 });
  await ev(() => { window.__game.timeScale = 1; window.__game.input.mouse.left = true; }); await page.waitForTimeout(5000); await ev(() => { window.__game.input.mouse.left = false; }); await shot('m02_h_busrun.png'); log('bus escort: ' + JSON.stringify(await stats()));
  await ev(() => { window.__game.timeScale = 3; });
  for (let i = 0; i < 300 && !(await ev(() => window.__game.objectives.get('escort')?.done)); i++) { await killAll(); await page.waitForTimeout(2500); }
  await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(6000); await shot('m02_i_ending.png'); await ev(() => { window.__game.timeScale = 4; });
  await page.waitForSelector('#complete:not(.hidden), #transition:not(.hidden)', { timeout: 300000 }); await page.waitForTimeout(800); await shot('m02_j_complete.png');
  const save = await ev(() => JSON.parse(localStorage.getItem('fie.save.v1')));
  log('save: ' + JSON.stringify({ unlocked: save.unlocked, completed: Object.keys(save.completed) }));
  if (!save.completed.m02) errors.push('M02 completion not saved');
} catch (e) { errors.push('test: ' + e.message); await shot('m02_fail.png').catch(() => {}); log(JSON.stringify(await stats().catch(() => ({})))); }
await browser.close(); server.kill();
if (errors.length) { console.log('ERRORS:\n' + errors.slice(0, 20).join('\n')); process.exit(1); }
console.log('MISSION 02 PLAYTHROUGH OK');
process.exit(0);
