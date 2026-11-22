// In-game benchmark for checking real GPUs (open the game with ?bench).
// Loads a fixed set of heavy scenes from every playable mission, lets each settle, then measures frame
// times for a fixed window while the scene runs (AI, effects, weather; the player is invulnerable and
// does not move). Reports average FPS, 1% low, worst frame, draw calls and triangles per scene, plus the
// GPU name and the settings used, as a table and as copyable JSON.
// ?bench=quick → 4 s per scene instead of 10.
import { saves } from './SaveSystem.js';
import { settings } from './Settings.js';

const SCENES = [
  ['m01', 'gp', 'GOP 소초 · 눈'], ['m01', 'op_radio', '관측소 교전'],
  ['m02', 'avenue', '연서시 대로'], ['m02', 'station', '지하 역사 · 손전등'],
  ['m03', 'assault', '한탄강 · 비 · 조명탄'], ['m03', 'tank', '교량 · 전차'],
  ['m04', 'batteries', '포대 언덕 · 원거리 거점'], ['m04', 'crane', '컨테이너 야적장'],
  ['m05', 'street', '파리 거리 · 비'], ['m05', 'archive', '지하 보관소'],
];

export async function runBenchmark(game) {
  const q = new URLSearchParams(location.search); const quick = q.get('bench') === 'quick';
  const WARM = quick ? 2.5 : 4, MEASURE = quick ? 4 : 10;
  const gl = game.renderer.renderer.getContext(); const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const g = settings.data.graphics;
  const overlay = document.createElement('div'); overlay.id = 'bench';
  overlay.style.cssText = 'position:fixed;left:12px;top:12px;z-index:99;background:rgba(0,0,0,.78);color:#dfe;font:12px/1.5 monospace;padding:10px 14px;max-width:760px;white-space:pre-wrap';
  document.body.appendChild(overlay);
  const say = (s) => { overlay.textContent = s; };
  const rows = [];
  for (const [mission, cp, label] of SCENES) {
    say(`BENCHMARK  ${rows.length + 1}/${SCENES.length}  ${mission} · ${label}\nGPU: ${gpu}\n로딩 중…`);
    saves.data.unlocked = Array.from(new Set([...saves.data.unlocked, mission]));
    saves.data.checkpoint = { missionId: mission, checkpointId: cp, savedAt: Date.now() };
    try {
      await game.prepareMission(mission, () => {});
      await game.startMission(mission, cp);
    } catch (e) { rows.push({ mission, cp, label, error: String(e.message || e) }); continue; }
    game.player.godMode = true;
    await new Promise((r) => setTimeout(r, WARM * 1000));
    // measure
    const times = []; let last = performance.now(); let calls = 0, tris = 0, n = 0;
    await new Promise((res) => {
      const t0 = performance.now();
      const tick = (now) => {
        times.push(now - last); last = now;
        const info = game.renderer.info?.render; if (info) { calls += info.calls; tris += info.triangles; n++; }
        if (now - t0 < MEASURE * 1000) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
    times.shift(); const sorted = [...times].sort((a, b) => b - a);
    const avg = times.reduce((a, b) => a + b, 0) / times.length; const p1 = sorted.slice(0, Math.max(1, Math.floor(times.length * 0.01)));
    rows.push({ mission, cp, label, fps: +(1000 / avg).toFixed(1), low1: +(1000 / (p1.reduce((a, b) => a + b, 0) / p1.length)).toFixed(1), worstMs: +sorted[0].toFixed(1), drawCalls: Math.round(calls / Math.max(1, n)), tris: Math.round(tris / Math.max(1, n)) });
    say(`BENCHMARK  ${rows.length}/${SCENES.length}\n` + rows.map(fmt).join('\n'));
  }
  game.teardownMission(); saves.data.checkpoint = null; saves.persist();
  const report = { gpu, ua: navigator.userAgent, screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, settings: { preset: g.preset, renderScale: g.renderScale, shadows: g.shadows, textures: g.textures, effects: g.effects, post: g.post }, scenes: rows, date: new Date().toISOString() };
  const ok = rows.filter((r) => r.fps); const avgFps = ok.reduce((a, r) => a + r.fps, 0) / Math.max(1, ok.length); const minLow = Math.min(...ok.map((r) => r.low1));
  const verdict = minLow >= 55 ? '이 설정으로 60fps 유지 가능' : minLow >= 40 ? '대체로 원활 — 일부 장면에서 그림자를 한 단계 낮추면 안정적' : '프리셋 또는 렌더 스케일을 낮추는 것을 권장';
  overlay.innerHTML = '';
  const pre = document.createElement('div'); pre.textContent = `BENCHMARK 완료 — 평균 ${avgFps.toFixed(1)} fps, 최저 1% ${minLow.toFixed(1)} fps → ${verdict}\nGPU: ${gpu}\n설정: ${JSON.stringify(report.settings)}\n\n` + rows.map(fmt).join('\n') + '\n\n아래 JSON을 복사해 공유하면 프리셋 조정에 쓸 수 있습니다.';
  const ta = document.createElement('textarea'); ta.value = JSON.stringify(report, null, 1); ta.style.cssText = 'width:100%;height:160px;margin-top:8px;background:#111;color:#cfc;font:11px monospace';
  const btn = document.createElement('button'); btn.textContent = '복사'; btn.onclick = () => { ta.select(); navigator.clipboard?.writeText(ta.value); };
  overlay.append(pre, ta, btn);
  window.__benchReport = report;
  return report;
}
const fmt = (r) => r.error ? `${r.mission}/${r.cp} ${r.label}: 오류 ${r.error}` : `${r.mission}/${r.cp.padEnd(10)} ${r.label.padEnd(16)} avg ${String(r.fps).padStart(5)} fps · 1% low ${String(r.low1).padStart(5)} · worst ${String(r.worstMs).padStart(5)} ms · ${r.drawCalls} DC · ${(r.tris / 1000).toFixed(0)}k tris`;
