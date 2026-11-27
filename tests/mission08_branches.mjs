// Mission 08 branch playthroughs (same driver as M06; M06 / M07 outcomes are pre-seeded per branch): drives the whole mission once per branch set, choosing the options
// through the test hook game.autoChoices (same code path as a key press). A generic driver walks the
// player to the current objective / interaction, performs takedowns from behind, and (outside the
// stealth branch) clears hostiles so the run stays fast. Checks: every branch reaches the debrief,
// the expected story flags are stored, the debrief lists the choices, no page errors.
//   BRANCH=A|B (default all)   OUTDIR=<frozen build dir>   START=<checkpoint> (default approach)   URL=<running dev server, skips preview>
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = new URL('./output/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const PORT = 4198;
const BRANCHES = {
  A: { seed: { m06_nadia: 'lower', m07_server: 'copy', m07_hostage: 'trade', m07_graves: 'escaped', m07_maya: 'hurt' }, m08_pumps: 'stop', m08_kerr: 'kerr', m08_techs: 'open', expect: { m08_pumps: 'stop', m08_kerr: 'kerr', m08_techs: 'open' } },
  B: { seed: { m06_nadia: 'aim', m07_server: 'wipe', m07_hostage: 'shoot' }, m08_pumps: 'run', m08_kerr: 'echo', m08_techs: 'leave', expect: { m08_pumps: 'run', m08_kerr: 'echo', m08_techs: 'leave' } },
};
const pick = (process.env.BRANCH || 'A,B').split(',');
const BASE = process.env.URL || `http://localhost:${PORT}`;
const server = process.env.URL ? null : spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--outDir', process.env.OUTDIR || 'dist'], { stdio: 'pipe', cwd: new URL('..', import.meta.url).pathname });
if (server) await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) r(); }); setTimeout(r, 6000); });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const T0 = Date.now(); const log = (s) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${s}`);
let failed = 0;
for (const name of pick) {
  const B = BRANCHES[name]; const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.addInitScript(([seed, start]) => { if (sessionStorage.getItem('init')) return; sessionStorage.setItem('init', 1); localStorage.clear();
    localStorage.setItem('fie.settings.v1', JSON.stringify({ graphics: { preset: 'low', shadows: 'off', textures: 'low', effects: 'low', post: false, renderScale: 0.5 } }));
    localStorage.setItem('fie.save.v1', JSON.stringify({ version: 1, unlocked: ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08'], completed: {}, checkpoint: { missionId: 'm08', checkpointId: start, savedAt: Date.now() }, lastMission: 'm08', storyFlags: seed })); }, [B.seed, process.env.START || 'approach']);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  try {
    await page.goto(`${BASE}/?nolock&autostart`); await page.waitForSelector('#menu', { timeout: 120000 });
    await page.click('#menu [data-a=continue]'); await page.waitForSelector('#briefing .deploy .btn.primary:not([disabled])', { timeout: 300000 }); await page.click('#briefing .deploy .btn.primary');
    for (let i = 0; i < 400; i++) { if (errors.length) throw new Error('page error during load'); if (await page.evaluate(() => window.__game?.state === 'playing')) break; await page.waitForTimeout(1000); }
    await ev((B) => { const g = window.__game; g.player.godMode = true; g.timeScale = 10; g.autoChoices = B; }, B);
    log(`branch ${name}: ${JSON.stringify(B)}`);
    await page.keyboard.down('KeyC');   // crouched the whole way (hiding spots, stealth)
    const shots = new Set(); let last = '';
    for (let i = 0; i < 1400; i++) {
      const st = await ev((stealth) => {
        const g = window.__game; if (g.state !== 'playing') return { state: g.state };
        const p = g.player, V = (x, y, z) => p.position.clone().set(x, y, z);
        // 1) takedown anything we can reach from behind
        const td = p.interactables.find((it) => it.enabled && it.prompt === '뒤에서 제압');
        // 2) the interaction to use / the place to go
        const its = p.interactables.filter((it) => it.enabled && it.prompt !== '뒤에서 제압');
        const tgt = g.director.objectiveTarget?.();
        const pos = (it) => (typeof it.pos === 'function' ? it.pos() : it.pos);
        let near = its.map((it) => ({ it, d: pos(it).distanceTo(p.position) })).sort((a, b) => a.d - b.d)[0];
        const go = (t) => { const dir = p.position.clone().sub(t).setY(0); if (dir.lengthSq() < 0.01) dir.set(1, 0, 0); dir.normalize(); const d = t.clone().addScaledVector(dir, 1.1); d.y = g.world.groundHeight(d.x, d.z, t.y + 1); p.teleport(d, p.yaw); };
        let did = '';
        if (td) { const a = g.director.agents.find((x) => !x.dead && x.position.distanceTo(pos(td).clone().setY(x.position.y)) < 0.5); td.onUse(); did = 'takedown'; }
        else if (near && near.d < 2.4) { near.it.onUse(); did = 'use:' + near.it.prompt; }
        else if (near && (!tgt || pos(near.it).distanceTo(tgt) < 6)) { go(pos(near.it)); did = 'goto-it:' + near.it.prompt; }
        else if (tgt && tgt.distanceTo(p.position) > 2.5) { go(tgt); did = 'goto-marker'; }
        // a guard we can sneak up on: step behind him
        if (!did && stealth) { const gd = g.director.agents.find((a) => a.team === 'enemy' && !a.dead && !a.koed && a.state !== 'combat' && a.position.distanceTo(p.position) < 14); if (gd) { const back = gd.position.clone().addScaledVector(V(Math.sin(gd.yaw), 0, Math.cos(gd.yaw)), -1.2); back.y = g.world.groundHeight(back.x, back.z, gd.position.y + 1); p.teleport(back, p.yaw); did = 'sneak'; } }
        // 3) hostiles that are fighting us: put them down (keeps the run short)
        let killed = 0; if (!stealth || g.level.alarm) for (const a of g.director.agents) if (a.team === 'enemy' && !a.dead && !a.koed && a.state === 'combat') { a.kill(p.position); killed++; }
        // exfil: the trucks on the coast road (the helicopter is not god-moded)
        if (g.checkpointId === 'exfil' || g.checkpointId === 'yard') for (const v of g.director.vehicles) if (!v.dead && v.destroy && v.u > 0.05) v.destroy();
        return { state: g.state, cp: g.checkpointId, obj: g.objectives.active().map((o) => o.id).join(','), did, killed };
      }, !!B.stealth);
      if (st.state !== 'playing') { log(`state ${st.state}`); break; }
      const line = `${st.cp} [${st.obj}] ${st.did}`; if (line !== last) { log(line); last = line; }
      if (process.env.SHOTEVERY && i % +process.env.SHOTEVERY === 0) await page.screenshot({ path: `${OUT}m08_${name}_t${String(i).padStart(4, '0')}_${st.cp}.png` });
      if (!shots.has(st.cp)) { shots.add(st.cp); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}m08_${name}_${st.cp}.png` }); }
      await page.waitForTimeout(700);
    }
    await page.keyboard.up('KeyC');
    await page.waitForSelector('#complete:not(.hidden), #transition:not(.hidden)', { timeout: 120000 });
    await page.screenshot({ path: `${OUT}m08_${name}_debrief.png` });
    const res = await ev(() => ({ flags: JSON.parse(localStorage.getItem('fie.save.v1')).storyFlags, completed: Object.keys(JSON.parse(localStorage.getItem('fie.save.v1')).completed), choices: document.querySelector('.choices-log')?.textContent || '' }));
    log(`debrief: completed=${res.completed} flags=${JSON.stringify(res.flags)}`);
    log(`choices: ${res.choices}`);
    for (const [k, v] of Object.entries(B.expect)) if (res.flags[k] !== v) errors.push(`flag ${k}=${res.flags[k]} (expected ${v})`);
    if (!res.completed.includes('m08')) errors.push('m08 not completed');
    if (!res.choices.includes('이번 작전의 선택')) errors.push('debrief has no choice list');
  } catch (e) { errors.push('ERR ' + e.message); await page.screenshot({ path: `${OUT}m08_${name}_error.png` }).catch(() => {}); }
  if (errors.length) { failed++; log(`BRANCH ${name} FAILED:\n` + errors.slice(0, 10).join('\n')); } else log(`BRANCH ${name} OK`);
  await page.close();
}
await browser.close(); server?.kill();
console.log(failed ? `M08 BRANCHES FAILED (${failed})` : 'M08 BRANCHES OK');
process.exit(failed ? 1 : 0);
