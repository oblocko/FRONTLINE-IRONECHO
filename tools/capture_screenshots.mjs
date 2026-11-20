// Captures promotional in-game screenshots into docs/screenshots/ (PNG -> JPEG via ffmpeg).
// usage: npx vite build && node tools/capture_screenshots.mjs
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const ROOT = new URL('../', import.meta.url).pathname; const OUT = ROOT + 'docs/screenshots/'; mkdirSync(OUT, { recursive: true });
const PORT = 4198;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) r(); }); setTimeout(r, 6000); });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const SETTINGS = { graphics: { preset: 'medium', shadows: 'medium', textures: 'medium', effects: 'medium', post: true, renderScale: 1.0, fov: 78 }, gameplay: { hints: false } };

// [file, mission, checkpoint, setup(g) run in page, wait ms before shot]
const SHOTS = [
  ['01_menu', null, null, null, 6000],
  ['02_m01_truck', 'm01', 'truck', null, 14000],
  ['03_m01_gp', 'm01', 'gp', 'g.player.teleport({x:-9,y:0,z:-20}, Math.PI*0.92); g.player.pitch=-0.03;', 9000],
  ['04_m01_mg', 'm01', 'op_radio', `const it=g.player.interactables.find(i=>i.prompt.includes('무전기')); it&&it.onUse(it);`, 4000, `const mg=g.mounted[0]; if(mg){mg.mount(); g.player.lookYawLocal=0.35; g.player.pitch=-0.05;}`, 22000],
  ['05_m01_village', 'm01', 'fallback', 'g.player.teleport({x:79,y:0,z:38}, Math.PI*1.05); g.player.pitch=0.02;', 10000],
  ['06_m02_avenue', 'm02', 'avenue', 'g.player.teleport({x:-4,y:0,z:-96}, Math.PI); g.player.pitch=0.06;', 9000],
  ['07_m02_station', 'm02', 'escort', 'g.player.teleport({x:338,y:0,z:-6}, -Math.PI/2+0.35); g.player.pitch=0.0;', 9000],
  ['08_m02_bus', 'm02', 'busrun', `const it=g.player.interactables.find(i=>i.prompt.includes('호송 트럭')); it&&it.onUse(it); g.player.pitch=0.02;`, 26000],
];

for (const [file, mission, cp, setup, wait, setup2, wait2] of SHOTS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(([s, mission, cp]) => {
    localStorage.setItem('fie.settings.v1', JSON.stringify(s));
    if (mission) localStorage.setItem('fie.save.v1', JSON.stringify({ version: 1, unlocked: ['m01', 'm02'], completed: {}, checkpoint: { missionId: mission, checkpointId: cp, savedAt: Date.now() }, lastMission: mission, storyFlags: {} }));
  }, [SETTINGS, mission, cp]);
  try {
    await page.goto(`http://localhost:${PORT}/?nolock&autostart`);
    await page.waitForSelector('#menu', { timeout: 180000 });
    if (mission) {
      await page.click('#menu [data-a=continue]');
      await page.waitForSelector('#briefing .deploy .btn.primary:not([disabled])', { timeout: 300000 });
      if (cp === 'truck') await page.screenshot({ path: OUT + 'tmp_briefing.png' });
      await page.click('#briefing .deploy .btn.primary');
      await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 300000 });
      await page.evaluate(() => { window.__game.player.godMode = true; });
      if (setup) await page.evaluate(`(()=>{const g=window.__game; ${setup}})()`);
    }
    await page.waitForTimeout(wait);
    if (setup2) { await page.evaluate(`(()=>{const g=window.__game; ${setup2}})()`); await page.waitForTimeout(wait2); }
    await page.screenshot({ path: OUT + 'tmp.png' });
    execSync(`ffmpeg -y -loglevel error -i "${OUT}tmp.png" -q:v 3 "${OUT}${file}.jpg"`);
    if (cp === 'truck') execSync(`ffmpeg -y -loglevel error -i "${OUT}tmp_briefing.png" -q:v 3 "${OUT}02a_m01_briefing.jpg"`);
    console.log('captured', file);
  } catch (e) { console.log('FAILED', file, e.message.split('\n')[0]); }
  await page.close();
}
await browser.close(); server.kill();
process.exit(0);
