// Mission 04 end-to-end: auto-continue from the M03 debrief into M04, then drives
// every M04 event: helicopter door-gun run (RPG hit) and landing with the Marines,
// three battery charges, IFV turret ride, crane control room + container drop,
// red smoke on the LZ and the timed hold, the fog lifting, completion + save.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try {
  await page.goto(`http://localhost:${PORT}/?nolock&autostart`);
  await page.waitForSelector('#menu', { timeout: 120000 });
  if (START) { await page.click('#menu [data-a=continue]'); await page.waitForSelector('#briefing .deploy .btn.primary:not([disabled])', { timeout: 300000 }); await page.click('#briefing .deploy .btn.primary'); await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 300000 }); await ev(() => { const g = window.__game; g.player.godMode = true; g.timeScale = 3; }); log('resumed at ' + START); }
  else {
    await ev(() => { const g = window.__game; g.ui.missionComplete(g.missions.byId('m03'), { time: 1500, kills: 30, accuracy: 40, headshots: 5, deaths: 0, epilogue: 'test' }, g.missions.next('m03')); });
    await page.waitForSelector('#complete [data-a=next]', { timeout: 10000 }); log('M03 debrief offers M04');
    await page.waitForSelector('#briefing', { timeout: 30000 }); await shot('m04_0_briefing.png'); log('auto-advanced to M04 briefing');
    await page.waitForFunction(() => window.__game?.state === 'playing' && window.__game.missionId === 'm04', null, { timeout: 300000 }); log('auto-deployed into M04');
    await ev(() => { const g = window.__game; g.player.godMode = true; g.timeScale = 1; }); await page.waitForTimeout(8000); await shot('m04_a_heli.png');
    await ev(() => { window.__game.timeScale = 3; });
    await page.waitForFunction(() => window.__game.director.enemies().length > 4, null, { timeout: 400000, polling: 1000 });
    await ev(() => { const g = window.__game; g.timeScale = 1; g.input.mouse.left = true; }); await page.waitForTimeout(5000); await ev(() => { window.__game.input.mouse.left = false; window.__game.timeScale = 3; }); await shot('m04_b_doorgun.png'); log('door gun: ' + JSON.stringify(await stats()));
  }
  if (from('batteries')) {
    await waitCP('batteries'); log('landed → batteries');
    for (let k = 0; k < 3; k++) { await waitInteract('폭파 장약'); await useInteract('폭파 장약'); log('battery charge ' + (k + 1)); if (k === 0) { await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(5000); await shot('m04_c_battery.png'); await ev(() => { window.__game.timeScale = 3; }); } await killAll(); }
    for (let i = 0; i < 200 && (await ev(() => window.__game.checkpointId)) === 'batteries'; i++) { await killAll(); await page.waitForTimeout(2000); }
  }
  if (from('descent')) {
    await waitCP('descent'); log('descent');
    await waitInteract('장갑차 포탑'); await useInteract('장갑차 포탑', false);
    await page.waitForFunction(() => window.__game.mounted.some((m) => m.manned && m.kind === 'apc'), null, { timeout: 60000, polling: 500 });
    await page.waitForTimeout(6000); await ev(() => { window.__game.timeScale = 1; window.__game.input.mouse.left = true; }); await page.waitForTimeout(4000); await ev(() => { window.__game.input.mouse.left = false; }); await shot('m04_d_apc.png'); log('apc: ' + JSON.stringify(await stats())); await ev(() => { window.__game.timeScale = 3; });
    for (let i = 0; i < 300 && (await ev(() => window.__game.checkpointId)) === 'descent'; i++) { await killAll(); await page.waitForTimeout(2000); }
  }
  if (from('crane')) {
    await waitCP('crane'); log('crane');
    await ev(() => window.__game.player.teleport({ x: -30, y: 2.5, z: -30 }, Math.PI));
    for (let i = 0; i < 100 && !(await objDone('control')); i++) { await killAll(); await page.waitForTimeout(1500); }
    await waitInteract('크레인 조작'); await useInteract('크레인 조작'); log('console used');
    await waitInteract('컨테이너 투하');
    // wait for the truck to roll under the crane, then drop
    await page.waitForFunction(() => window.__game.director.vehicles.some((v) => !v.dead && Math.abs(v.position.z - 12) < 3), null, { timeout: 400000, polling: 100 });
    await useInteract('컨테이너 투하', false); await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(1500); await shot('m04_e_crane_drop.png'); log('container dropped: ' + JSON.stringify(await ev(() => ({ trucksDead: window.__game.director.vehicles.filter((v) => v.dead).length })))); await ev(() => { window.__game.timeScale = 3; });
  }
  await waitCP('lz'); log('lz');
  await ev(() => window.__game.player.teleport({ x: 26, y: 2.5, z: 92 }, Math.PI));
  await waitInteract('적색 연막'); await useInteract('적색 연막'); log('smoke thrown');
  await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(6000); await shot('m04_f_lz_smoke.png'); await ev(() => { window.__game.timeScale = 3; });
  for (let i = 0; i < 300 && !(await objDone('hold')); i++) { await killAll(); await page.waitForTimeout(2000); }
  log('hold complete');
  await page.waitForFunction(() => window.__game.objectives.get('look'), null, { timeout: 300000, polling: 1000 });
  await ev(() => window.__game.player.teleport({ x: -55, y: 2.5, z: 60 }, Math.PI / 2));
  await page.waitForTimeout(9000); await ev(() => { window.__game.timeScale = 1; }); await page.waitForTimeout(4000); await shot('m04_g_fleet.png'); await ev(() => { window.__game.timeScale = 4; });
  await page.waitForSelector('#complete', { timeout: 400000 }); await page.waitForTimeout(800); await shot('m04_h_complete.png');
  const save = await ev(() => JSON.parse(localStorage.getItem('fie.save.v1')));
  log('save: ' + JSON.stringify({ unlocked: save.unlocked, completed: Object.keys(save.completed) }));
  if (!save.completed.m04) errors.push('M04 completion not saved');
} catch (e) { errors.push('test: ' + e.message); await shot('m04_fail.png').catch(() => {}); log(JSON.stringify(await stats().catch(() => ({})))); }
await browser.close(); server.kill();
if (errors.length) { console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n')); process.exit(1); }
console.log('MISSION 04 PLAYTHROUGH OK');
process.exit(0);
