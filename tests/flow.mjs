// Flow test: pause menu (resume / settings / restart checkpoint), death screen
// → checkpoint restart, quit to menu, credits. Resumes Mission 01 at 'gp'.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const PORT = 4177;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) r(); }); setTimeout(r, 5000); });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => {
  localStorage.setItem('fie.settings.v1', JSON.stringify({ graphics: { preset: 'low', shadows: 'off', textures: 'low', effects: 'low', post: false, renderScale: 0.5 } }));
  if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.setItem('fie.save.v1', JSON.stringify({ version: 1, unlocked: ['m01'], completed: {}, checkpoint: { missionId: 'm01', checkpointId: 'gp', savedAt: Date.now() }, lastMission: 'm01', storyFlags: {} })); }
});
const ok = (s) => console.log('✓ ' + s);
const playing = (cp) => page.waitForFunction((cp) => window.__game?.state === 'playing' && (!cp || window.__game.checkpointId === cp), cp, { timeout: 180000, polling: 500 });
try {
  await page.goto(`http://localhost:${PORT}/?nolock&autostart`);
  await page.waitForSelector('#menu [data-a=continue]:not([disabled])', { timeout: 90000 });
  await page.click('#menu [data-a=continue]');
  await page.waitForSelector('#briefing .deploy .btn.primary:not([disabled])', { timeout: 120000 });
  await page.click('#briefing .deploy .btn.primary');
  await playing('gp'); ok('continue → resumed at checkpoint gp');
  await page.waitForTimeout(3000);
  await page.keyboard.press('KeyP'); await page.waitForSelector('#pause:not(.hidden)'); ok('pause menu opens');
  await page.click('#pause [data-a=settings]'); await page.waitForSelector('#settings'); await page.click('#settings [data-t=audio]'); await page.click('#settings [data-a=back]'); await page.waitForSelector('#pause:not(.hidden)'); ok('settings from pause → back to pause');
  await page.click('#pause [data-a=resume]'); await playing(); ok('resume');
  await page.evaluate(() => window.__game.player.takeDamage(500, null));
  await page.waitForSelector('#death:not(.hidden)', { timeout: 30000 }); ok('death screen');
  await page.click('#death button'); await playing('gp'); ok('restart from checkpoint after death');
  const deaths = await page.evaluate(() => window.__game.stats.deaths); if (deaths !== 1) errors.push('death count not tracked: ' + deaths); else ok('death counted in stats');
  await page.keyboard.press('KeyP'); await page.waitForSelector('#pause:not(.hidden)');
  await page.click('#pause [data-a=quit]'); await page.click('#confirm [data-a=yes]'); await page.waitForSelector('#menu:not(.hidden)'); ok('quit to main menu');
  const cont = await page.$eval('#menu [data-a=continue]', (b) => !b.disabled); if (!cont) errors.push('continue disabled after quitting'); else ok('continue still available (checkpoint persisted)');
  await page.reload(); await page.waitForSelector('#menu [data-a=continue]:not([disabled])', { timeout: 90000 }); ok('checkpoint survives page reload');
  await page.click('#menu [data-a=credits]'); await page.waitForSelector('#credits'); await page.click('#credits .skip'); await page.waitForSelector('#menu'); ok('credits roll + skip');
  await page.click('#menu [data-a=exit]'); await page.click('#confirm [data-a=yes]'); await page.waitForSelector('#exitScreen'); await page.click('#exitScreen button'); await page.waitForSelector('#menu'); ok('exit screen → back to menu');
} catch (e) { errors.push('test: ' + e.message); }
await browser.close(); server.kill();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('FLOW OK');
process.exit(0);
