// Error sweep: every menu screen + every settings control + every mission card,
// then every checkpoint of every playable mission (loaded via the real CONTINUE
// flow, run for a while in god mode). Fails on any page error / console error.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = new URL('./output/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const PORT = 4195;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) r(); }); setTimeout(r, 6000); });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const CPS = { m01: ['truck', 'gp', 'op_move', 'op_radio', 'fallback', 'extraction'], m02: ['convoy', 'jam', 'avenue', 'station', 'escort', 'busrun'], m03: ['convoy', 'command', 'assault', 'demolition', 'casevac'], m04: ['insertion', 'batteries', 'descent', 'crane', 'lz'] };
if (process.env.ONLY) for (const k of Object.keys(CPS)) if (!process.env.ONLY.split(',').includes(k)) delete CPS[k];
const RUN_MS = +(process.env.RUN_MS || 25000);
const all = []; const T0 = Date.now(); const log = (s) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${s}`);
async function newPage(save) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1,7).map(s=>s.trim()).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push(`http ${r.status()} ${r.url()}`); });
  await page.addInitScript((save) => {
    localStorage.setItem('fie.settings.v1', JSON.stringify({ graphics: { preset: 'low', shadows: 'off', textures: 'low', effects: 'low', post: false, renderScale: 0.5 } }));
    if (save) localStorage.setItem('fie.save.v1', JSON.stringify(save)); else localStorage.removeItem('fie.save.v1');
  }, save);
  return { page, errs };
}
// ---- menus ----
{
  const { page, errs } = await newPage(null);
  try {
    await page.goto(`http://localhost:${PORT}/?nolock&autostart`); await page.waitForSelector('#menu', { timeout: 120000 });
    await page.click('#menu [data-a=settings]');
    for (const tab of ['graphics', 'audio', 'controls', 'gameplay']) {
      await page.click(`#settings [data-t=${tab}]`);
      // software rendering can't keep up with HIGH/ULTRA presets (the page stops responding); skip GPU-heavy rows
      const heavy = ['그래픽 프리셋', '그림자 품질', '후처리', '텍스처 품질', '효과 품질', '해상도 (렌더 스케일)', '전체 화면', '프레임 제한'];
      const idx = await page.$$eval('#settings .setrow', (rows, heavy) => rows.flatMap((r, ri) => heavy.includes(r.querySelector('label')?.textContent) ? [] : [...r.querySelectorAll('.seg button')].map((_, bi) => [ri, bi])), heavy);
      for (const [ri, bi] of idx) await page.locator('#settings .setrow').nth(ri).locator('.seg button').nth(bi).click({ timeout: 5000 }).catch((e) => errs.push('settings click: ' + e.message.split('\n')[0]));
      for (const r of await page.$$('#settings input[type=range]')) await r.evaluate((el, heavy) => { if (heavy.includes(el.closest('.setrow').querySelector('label').textContent)) return; el.value = el.max; el.dispatchEvent(new Event('input')); }, heavy);
    }
    await page.click('#settings [data-t=controls]');
    const kb = await page.$('#settings .keybtn'); await kb.click(); await page.keyboard.press('KeyH'); // rebind
    await page.click('#settings [data-a=reset]'); await page.click('#confirm [data-a=yes]');
    await page.click('#settings [data-a=back]');
    await page.click('#menu [data-a=select]');
    for (const id of await page.$$eval('#select .mcard', (c) => c.map((x) => x.dataset.id))) await page.click(`#select .mcard[data-id=${id}]`);
    await page.click('#select [data-a=back]');
    await page.click('#menu [data-a=credits]'); await page.waitForTimeout(1500); await page.click('#credits .skip');
    await page.waitForSelector('#menu');
    const hasScrollbar = await page.evaluate(() => getComputedStyle(document.querySelector('.dialog') || document.body).scrollbarWidth);
    log('menus ok (scrollbar-width: ' + hasScrollbar + ')');
  } catch (e) { errs.push('menus: ' + e.message); }
  if (errs.length) all.push(['menus', errs]); await page.close();
}
// ---- every checkpoint ----
for (const [mission, cps] of Object.entries(CPS)) for (const cp of cps) {
  const save = { version: 1, unlocked: ['m01', 'm02', 'm03', 'm04'], completed: {}, checkpoint: { missionId: mission, checkpointId: cp, savedAt: Date.now() }, lastMission: mission, storyFlags: {} };
  const { page, errs } = await newPage(save);
  try {
    await page.goto(`http://localhost:${PORT}/?nolock&autostart`);
    await page.waitForSelector('#menu [data-a=continue]:not([disabled])', { timeout: 120000 });
    await page.click('#menu [data-a=continue]');
    await page.waitForSelector('#briefing .deploy .btn.primary:not([disabled])', { timeout: 240000 });
    await page.click('#briefing .deploy .btn.primary');
    await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 300000 });
    await page.evaluate(() => { window.__game.player.godMode = true; window.__game.timeScale = 3; });
    await page.waitForTimeout(RUN_MS);
    // exercise core input paths: fire, reload, switch, grenade, binoculars, flashlight, pause/resume
    await page.evaluate(() => { const g = window.__game; g.input.mouse.left = true; });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const g = window.__game; g.input.mouse.left = false; g.weapons.reload(); g.weapons.equip('pistol'); g.weapons.throwGrenade(); g.player.setFlashlight(true); g.support?.toggle(true); g.gadget?.toggle(true); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { const g = window.__game; g.support?.toggle(false); g.gadget?.toggle(false); g.weapons.equip('rifle'); g.pause(); });
    await page.waitForTimeout(500); await page.evaluate(() => window.__game.resume());
    const st = await page.evaluate(() => ({ state: window.__game.state, cp: window.__game.checkpointId, t: Math.round(window.__game.mission.time) }));
    await page.screenshot({ path: OUT + `sweep_${mission}_${cp}.png` });
    log(`${mission}/${cp} ${JSON.stringify(st)} errors=${errs.length}`);
  } catch (e) { errs.push('run: ' + e.message); }
  if (errs.length) all.push([`${mission}/${cp}`, errs]);
  await page.close();
}
await browser.close(); server.kill();
if (all.length) { for (const [k, e] of all) console.log(`\n## ${k}\n` + [...new Set(e)].slice(0, 8).join('\n')); console.log('\nSWEEP FAILED'); process.exit(1); }
console.log('SWEEP OK'); process.exit(0);
