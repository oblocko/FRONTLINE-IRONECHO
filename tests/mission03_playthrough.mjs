// Mission 03 end-to-end: auto-continue from the M02 debrief into M03, then drives
// every M03 event: night convoy, command post + reserve leaving, thermal sight and
// the vanishing decoy armour, the squad-leader choice (key 2), flare-lit boat
// assault with the mounted MG and mortar support, charges on the bridge, the tank
// and the bridge demolition, casevac retreat, completion + save + story flag.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = new URL('./output/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const PORT = 4197;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) r(); }); setTimeout(r, 6000); });
const errors = [];
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const START = process.env.START || null;
await page.addInitScript((start) => { if (sessionStorage.getItem('init')) return; sessionStorage.setItem('init', 1); localStorage.clear(); localStorage.setItem('fie.settings.v1', JSON.stringify({ graphics: { preset: 'low', shadows: 'off', textures: 'low', effects: 'low', post: false, renderScale: 0.5 } }));
  if (start) localStorage.setItem('fie.save.v1', JSON.stringify({ version: 1, unlocked: ['m01', 'm02', 'm03'], completed: {}, checkpoint: { missionId: 'm03', checkpointId: start, savedAt: Date.now() }, lastMission: 'm03', storyFlags: {} })); }, START);
const order = ['convoy', 'command', 'assault', 'demolition', 'casevac']; const from = (id) => !START || order.indexOf(id) >= order.indexOf(START);
const T0 = Date.now(); const log = (s) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${s}`);
const ev = (fn, arg) => page.evaluate(fn, arg);
const waitCP = (id, timeout = 900000) => page.waitForFunction((id) => window.__game.checkpointId === id && window.__game.state === 'playing', id, { timeout, polling: 500 });
const shot = (n) => page.screenshot({ path: OUT + n });
const waitInteract = (m, timeout = 900000) => page.waitForFunction((m) => window.__game.player.interactables.some((i) => i.enabled && i.prompt.includes(m)), m, { timeout, polling: 500 });
const useInteract = (m, tp = true) => ev(([m, tp]) => { const g = window.__game; const it = g.player.interactables.find((i) => i.enabled && i.prompt.includes(m)); if (!it) return false; const p = typeof it.pos === 'function' ? it.pos() : it.pos; if (tp) g.player.teleport(p.clone().add({ x: -1.0, y: 0, z: 0.6 })); it.onUse(it); return true; }, [m, tp]);
const killAll = () => ev(() => { const g = window.__game; let n = 0; for (const a of g.director.agents) if (a.team === 'enemy' && !a.dead) { a.kill(g.player.position); n++; } for (const v of g.director.vehicles) if (!v.dead && !v.removed) { v.damage(99999); n++; } return n; });
const stats = () => ev(() => { const g = window.__game; return { cp: g.checkpointId, t: Math.round(g.mission?.time || 0), obj: g.objectives.active().map((o) => o.text + (o.count ? ` ${o.progress}/${o.count}` : '')), enemies: g.director.enemies().length, veh: g.director.vehicles.filter((v) => !v.dead).length, hp: Math.round(g.player.health) }; });
const objDone = (id) => ev((id) => !!window.__game.objectives.get(id)?.done, id);
try {
  await page.goto(`http://localhost:${PORT}/?nolock&autostart`);
  await page.waitForSelector('#menu', { timeout: 120000 });
  if (START) { await page.click('#menu [data-a=continue]'); await page.waitForSelector('#briefing .deploy .btn.primary:not([disabled])', { timeout: 300000 }); await page.click('#briefing .deploy .btn.primary'); await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 300000 }); await ev(() => { const g = window.__game; g.player.godMode = true; g.timeScale = 3; }); log('resumed at ' + START); }
  else {
    await ev(() => { const g = window.__game; g.ui.missionComplete(g.missions.byId('m02'), { time: 1500, kills: 30, accuracy: 40, headshots: 5, deaths: 0, epilogue: 'test' }, g.missions.next('m02')); });
    await page.waitForSelector('#complete [data-a=next]', { timeout: 10000 }); log('M02 debrief offers M03');
    await page.waitForSelector('#briefing', { timeout: 30000 }); await shot('m03_0_briefing.png'); log('auto-advanced to M03 briefing');
    await page.waitForFunction(() => window.__game?.state === 'playing' && window.__game.missionId === 'm03', null, { timeout: 300000 }); log('auto-deployed into M03');
    await ev(() => { const g = window.__game; g.player.godMode = true; g.timeScale = 1; }); await page.waitForTimeout(9000); await shot('m03_a_convoy.png');
    await ev(() => { window.__game.timeScale = 3; });
  }
  if (from('command')) {
    await waitCP('command'); log('arrived → command');
    await ev(() => window.__game.player.teleport({ x: -24, y: 0, z: 46 }, Math.PI));
    await waitInteract('열상'); await ev(() => { window.__game.timeScale = 1; }); await useInteract('열상', false); await page.waitForTimeout(5000); await shot('m03_b_thermal.png'); log('thermal: ' + JSON.stringify(await ev(() => ({ ghosts: window.__game.level.ghosts.filter((t) => t.visible).length }))));
    await ev(() => { window.__game.timeScale = 3; });
    await page.waitForSelector('.choice-box', { timeout: 600000 }); await shot('m03_c_choice.png'); await page.keyboard.press('Digit2'); log('choice: stay');
  }
  if (from('assault')) {
    await waitCP('assault'); log('assault');
    await waitInteract('거치 기관총'); await useInteract('거치 기관총', false);
    await page.waitForFunction(() => window.__game.mounted.some((m) => m.manned), null, { timeout: 60000, polling: 500 });
    await page.waitForFunction(() => window.__game.director.vehicles.some((v) => v.isBoat && !v.dead && v.delay <= 0), null, { timeout: 600000, polling: 1000 });
    await ev(() => { const g = window.__game; g.timeScale = 1; const b = g.director.vehicles.find((v) => v.isBoat && !v.dead); const p = g.player; const e = p.eyePos(b.position.clone()); const to = b.position.clone().sub(e); p.lookYawLocal = 0; g.input.mouse.left = true; });
    await page.waitForTimeout(4000); await ev(() => { window.__game.input.mouse.left = false; }); await shot('m03_d_mg_boats.png'); log('boats: ' + JSON.stringify(await stats()));
    await ev(() => { window.__game.timeScale = 3; });
    for (let i = 0; i < 400 && (await ev(() => window.__game.checkpointId)) === 'assault'; i++) { await killAll(); await page.waitForTimeout(2000); }
  }
  if (from('demolition')) {
    await waitCP('demolition'); log('demolition');
    await ev(() => { const m = window.__game.mounted.find((x) => x.manned); m?.dismount(); });
    for (let k = 0; k < 3; k++) { await waitInteract('폭약 설치'); await useInteract('폭약 설치'); log('charge ' + (k + 1)); if (k === 0) { await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(3000); await shot('m03_e_charges.png'); await ev(() => { window.__game.timeScale = 3; }); } await killAll(); }
    await ev(() => window.__game.player.teleport({ x: 5.5, y: 0, z: 37.5 }, 0));
    await waitInteract('기폭'); await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(1500); await shot('m03_f_tank.png');
    await useInteract('기폭', false); await page.waitForTimeout(1800); await shot('m03_g_bridge_blown.png'); log('bridge blown: ' + JSON.stringify(await stats()));
    await ev(() => { window.__game.timeScale = 3; });
    for (let i = 0; i < 200 && (await ev(() => window.__game.checkpointId)) === 'demolition'; i++) { await killAll(); await page.waitForTimeout(2000); }
  }
  await waitCP('casevac'); log('casevac');
  for (const z of [60, 80, 100, 120, 140, 148]) {
    await ev((z) => { const g = window.__game; g.player.teleport({ x: -1, y: 0, z }, Math.PI); g.squad.doyun.actor.root.position.set(1, g.level.hf(1, z - 3), z - 3); }, z);
    await page.waitForTimeout(3500); await killAll();
  }
  await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(4000); await shot('m03_h_casevac.png'); await ev(() => { window.__game.timeScale = 3; });
  for (let i = 0; i < 300 && !(await objDone('hold')); i++) { await killAll(); await page.waitForTimeout(2000); }
  await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(6000); await shot('m03_i_ending.png'); await ev(() => { window.__game.timeScale = 4; });
  await page.waitForSelector('#complete', { timeout: 400000 }); await page.waitForTimeout(800); await shot('m03_j_complete.png');
  const save = await ev(() => JSON.parse(localStorage.getItem('fie.save.v1')));
  log('save: ' + JSON.stringify({ unlocked: save.unlocked, completed: Object.keys(save.completed), flags: save.storyFlags }));
  if (!save.completed.m03) errors.push('M03 completion not saved');
  if (!START && save.storyFlags.m03_choice !== 'stay') errors.push('choice flag not saved');
} catch (e) { errors.push('test: ' + e.message); await shot('m03_fail.png').catch(() => {}); log(JSON.stringify(await stats().catch(() => ({})))); }
await browser.close(); server.kill();
if (errors.length) { console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n')); process.exit(1); }
console.log('MISSION 03 PLAYTHROUGH OK');
process.exit(0);
