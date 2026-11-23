// All 2D interface: boot, main menu, mission select, briefing, settings,
// HUD, pause, death, mission complete, credits, exit. Every button is wired
// to a real game action through the `game` object.
import * as THREE from 'three';
import { events } from '../core/Events.js';
import { settings, QUALITY_PRESETS, DEFAULT_BINDINGS } from '../core/Settings.js';
import { saves } from '../core/SaveSystem.js';
import { MISSIONS, ACTS, missionById } from '../missions/index.js';
import { CHARACTERS, speakerLabel } from '../story/Characters.js';
import { keyName } from '../player/Player.js';
import { audio } from '../audio/AudioEngine.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class UI {
  constructor(game) {
    this.game = game; this.root = $('#ui'); this.screens = {};
    this.buildCine(); this.buildHUD();
    this.bindEvents();
  }
  show(name) { for (const [k, el] of Object.entries(this.screens)) { if (k === 'hud' || k === 'cine') continue; el.classList.toggle('hidden', k !== name); } this.current = name; }
  hideAll() { for (const [k, el] of Object.entries(this.screens)) if (!['hud', 'cine'].includes(k)) el.classList.add('hidden'); this.current = null; }
  mount(name, el) { if (this.screens[name]) this.screens[name].remove(); el.classList.add('screen'); el.id = name; this.root.appendChild(el); this.screens[name] = el; this.wireSounds(el); return el; }
  wireSounds(el) { el.querySelectorAll('button').forEach((b) => { b.addEventListener('mouseenter', () => audio.ui('hover')); b.addEventListener('click', () => audio.ui(b.dataset.snd || 'select')); }); }

  // ---------------- boot ----------------
  boot() {
    const el = this.mount('boot', h(`<div><div class="logo mono">FRONTLINE — IRON ECHO</div><div class="bar"><i></i></div><div class="msg"></div><button class="btn small start hidden">PRESS TO ENTER · 시작하려면 클릭</button></div>`));
    this.show('boot');
    return {
      progress: (p, msg) => { $('.bar i', el).style.width = `${Math.round(p * 100)}%`; if (msg) $('.msg', el).textContent = msg; },
      ready: () => new Promise((res) => { const b = $('.start', el); b.classList.remove('hidden'); $('.msg', el).textContent = '오디오 활성화를 위해 클릭이 필요합니다.'; b.onclick = () => res(); }),
    };
  }

  // ---------------- main menu ----------------
  mainMenu() {
    const hasCont = saves.hasContinue();
    const last = missionById(saves.data.lastMission);
    const cont = saves.data.checkpoint ? missionById(saves.data.checkpoint.missionId) : last && last.status === 'playable' ? last : null;
    const el = this.mount('menu', h(`<div class="scanlines">
      <div class="left">
        <div class="tag">ROK ARMY · JOINT OPERATIONS NETWORK</div>
        <div class="title">FRONTLINE<span>IRON ECHO</span></div>
        <div class="subtitle">프론트라인 — 아이언 에코</div>
        <nav>
          <button class="btn" data-a="campaign"><span class="idx">01</span>CAMPAIGN<span class="sub">새 캠페인</span></button>
          <button class="btn" data-a="continue" ${hasCont ? '' : 'disabled'}><span class="idx">02</span>CONTINUE<span class="sub">${hasCont && cont ? esc(cont.num + ' ' + cont.title) : hasCont ? '임무 선택' : '저장 없음'}</span></button>
          <button class="btn" data-a="select"><span class="idx">03</span>MISSION SELECT<span class="sub">임무 선택</span></button>
          <button class="btn" data-a="settings"><span class="idx">04</span>SETTINGS<span class="sub">설정</span></button>
          <button class="btn" data-a="credits"><span class="idx">05</span>CREDITS<span class="sub">제작진</span></button>
          <button class="btn" data-a="exit" data-snd="back"><span class="idx">06</span>EXIT<span class="sub">종료</span></button>
        </nav>
        <div class="foot">BUILD 0.1.0 · VERTICAL SLICE<br/>MISSION 01 PLAYABLE · 02–16 IN PRODUCTION<br/>ALL CHARACTERS AND EVENTS ARE FICTIONAL</div>
      </div>
      <div class="center"><div class="reticle-deco"></div></div>
      <div class="right">
        <div class="panel sitrep"><span class="corner tl"></span><span class="corner br"></span>
          <h4>SITREP // 상황 보고</h4>
          <div class="row"><span>DATE</span><b class="clock-d">2029-03-14</b></div>
          <div class="row"><span>LOCAL</span><b class="clock">04:52:00 KST</b></div>
          <div class="row"><span>SECTOR</span><b>중부전선 GOP-3</b></div>
          <div class="row"><span>DEFCON</span><b style="color:var(--warn)">2 → 1</b></div>
          <div class="row"><span>COMMS</span><b style="color:var(--danger)">DEGRADED</b></div>
        </div>
        <div class="panel sitrep"><span class="corner tl"></span><span class="corner br"></span><h4>INTERCEPT LOG</h4><div class="ticker"></div></div>
        <div class="panel sitrep"><span class="corner tl"></span><span class="corner br"></span><h4>CAMPAIGN</h4>
          <div class="row"><span>완료 임무</span><b>${Object.keys(saves.data.completed).length} / 16</b></div>
          <div class="row"><span>난이도</span><b>${{ recruit: '신병', regular: '정규', veteran: '베테랑' }[settings.data.gameplay.difficulty]}</b></div>
        </div>
      </div></div>`));
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => this.menuAction(b.dataset.a)));
    // live clock + intercept ticker
    const lines = ['04:31 GOP-3 ▸ 열상감시장비 정상', '04:38 TOC ▸ 전 소초 정기 순찰 개시', '04:44 [암호화 교신 감지] 미상 주파수 대역 급증', '04:47 OP 백두-3 ▸ 정기 보고 ... 응답 지연', '04:49 [위성 링크] 동기화 오류 3건', '04:50 TOC ▸ 대기 태세 유지', '04:51 [미상 송신] ▒▒▒▒ ▒▒ ▒▒▒▒▒', '04:52 ▸ 관측 대상: 북방 12km 지점 차량 열원 다수'];
    const tk = $('.ticker', el); let i = 0;
    clearInterval(this._tick); this._tick = setInterval(() => {
      if (!document.body.contains(tk)) return clearInterval(this._tick);
      if (i < lines.length) { const d = document.createElement('div'); d.textContent = lines[i++]; tk.appendChild(d); }
      const t = new Date(Date.UTC(2029, 2, 13, 19, 52) + (performance.now() % 3600000)); const kst = new Date(t.getTime() + 9 * 3600000);
      const c = $('.clock', el); if (c) c.textContent = kst.toISOString().slice(11, 19) + ' KST';
    }, 900);
    this.show('menu');
    setTimeout(() => el.querySelector('.btn:not(:disabled)')?.focus(), 50);
  }
  menuAction(a) {
    const g = this.game;
    if (a === 'campaign') {
      if (saves.data.checkpoint || Object.keys(saves.data.completed).length) this.confirm('새 캠페인을 시작하면 현재 체크포인트가 삭제됩니다. 계속하시겠습니까?', () => { saves.newCampaign(); this.briefing('m01'); });
      else this.briefing('m01');
    } else if (a === 'continue') g.continueCampaign();
    else if (a === 'select') this.missionSelect();
    else if (a === 'settings') this.settingsScreen(() => this.mainMenu());
    else if (a === 'credits') this.credits();
    else if (a === 'exit') this.exitGame();
  }
  confirm(text, yes, no) {
    const el = this.mount('confirm', h(`<div class="overlay"><div class="panel dialog" style="width:520px"><span class="corner tl"></span><span class="corner br"></span><p style="line-height:1.7">${esc(text)}</p><div class="row-actions"><button class="btn small" data-a="no" data-snd="back">취소</button><button class="btn small" data-a="yes" style="border-color:var(--accent);color:var(--accent)">확인</button></div></div></div>`));
    $('[data-a=yes]', el).onclick = () => { el.remove(); delete this.screens.confirm; yes?.(); };
    $('[data-a=no]', el).onclick = () => { el.remove(); delete this.screens.confirm; no?.(); };
  }
  exitGame() {
    this.confirm('게임을 종료하시겠습니까?', () => {
      this.game.shutdown();
      try { window.close(); } catch {}
      const el = this.mount('exitScreen', h(`<div><div>SESSION TERMINATED · 세션이 종료되었습니다</div><div style="font-size:12px">브라우저에서 실행 중인 게임은 보안상 스크립트로 탭을 닫을 수 없습니다. 이 탭을 닫아 종료하십시오.</div><button class="btn small">메인 메뉴로 돌아가기</button></div>`));
      this.show('exitScreen');
      $('button', el).onclick = () => { this.game.resumeFromShutdown(); this.mainMenu(); };
    });
  }

  // ---------------- mission select ----------------
  missionSelect() {
    const el = this.mount('select', h(`<div class="overlay grid-bg"><div class="panel dialog"><span class="corner tl"></span><span class="corner br"></span>
      <div class="head"><div><div class="tag">CAMPAIGN // 작전 목록</div><h2>MISSION SELECT</h2></div><div class="tag">${Object.keys(saves.data.completed).length} / 16 COMPLETE</div></div>
      <div class="acts">${ACTS.map((a) => `<div class="act"><h3>${a.title}</h3>${MISSIONS.filter((m) => m.act === a.id).map((m) => {
        const done = saves.data.completed[m.id]; const unlocked = saves.isUnlocked(m.id);
        const st = m.status !== 'playable' ? 'planned' : done ? 'done' : unlocked ? 'playable' : 'locked';
        const lbl = { planned: 'IN PRODUCTION', done: 'COMPLETE', playable: 'READY', locked: 'LOCKED' }[st];
        return `<div class="mcard" data-id="${m.id}"><div class="n">MISSION ${m.num} · ${m.pov === 'daniel' ? 'VOSS' : m.pov === 'both' ? 'HAN / VOSS' : 'HAN'}</div><div class="t">${m.title}</div><div class="k">${m.ko}</div><span class="st ${st}">${lbl}</span></div>`; }).join('')}</div>`).join('')}</div>
      <div class="mdetail"><div class="info"><p style="color:var(--muted)">임무를 선택하십시오.</p></div><div class="act-btns" style="display:flex;flex-direction:column;gap:8px;justify-content:flex-end"></div></div>
      <div class="row-actions"><button class="btn small" data-a="back" data-snd="back">BACK</button></div></div></div>`));
    const pick = (id) => {
      const m = missionById(id); el.querySelectorAll('.mcard').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
      const done = saves.data.completed[id]; const playable = m.status === 'playable'; const unlocked = saves.isUnlocked(id);
      $('.info', el).innerHTML = `<div class="tag">MISSION ${m.num} · ${esc(m.location)}</div><h3 style="margin:6px 0;letter-spacing:.1em">${m.title} <span style="color:var(--muted);font-weight:400">${m.ko}</span></h3>
        <p>${esc(m.summary)}</p><p class="mono" style="font-size:12px;color:var(--muted)">${m.date} · ${m.time} · ${esc(m.weather)}</p>
        ${done ? `<p class="mono" style="font-size:12px;color:#7fd3ff">최고 기록 ${fmtTime(done.best ?? done.time)} · 사살 ${done.kills} · 명중률 ${done.accuracy}%</p>` : ''}
        ${!playable ? `<p style="color:var(--warn);font-size:13px">이 임무는 시나리오·레벨 설계가 완료되었으나(docs/CAMPAIGN.md) 아직 플레이 가능한 레벨로 제작되지 않았습니다.</p>` : ''}`;
      const btns = $('.act-btns', el); btns.innerHTML = '';
      const b = h(`<button class="btn primary">${playable ? (unlocked ? 'BRIEFING ▸' : 'LOCKED') : 'IN PRODUCTION'}</button>`);
      b.disabled = !(playable && unlocked); b.onclick = () => this.briefing(id); btns.appendChild(b); this.wireSounds(btns);
    };
    el.querySelectorAll('.mcard').forEach((c) => c.addEventListener('click', () => { audio.ui('select'); pick(c.dataset.id); }));
    $('[data-a=back]', el).onclick = () => this.mainMenu();
    pick('m01');
    this.show('select');
  }

  // ---------------- briefing ----------------
  // autoDeploy: campaign flow — deploy automatically a few seconds after loading finishes
  briefing(id, { checkpoint = null, autoDeploy = false } = {}) {
    const m = missionById(id);
    const el = this.mount('briefing', h(`<div class="scanlines">
      <div class="bl">
        <div class="num">MISSION ${m.num} // ${ACTS[m.act - 1].title}</div>
        <h1>${m.title}</h1><div class="ko">${m.ko}</div>
        <div class="meta">
          <div class="k">AREA</div><div>${esc(m.location)}</div>
          <div class="k">DATE / TIME</div><div>${m.date} · ${m.time}</div>
          <div class="k">WEATHER</div><div>${esc(m.weather)}</div>
          <div class="k">UNIT</div><div>${esc(m.unit)}</div>
          <div class="k">OPERATOR</div><div>${m.pov === 'daniel' ? '다니엘 보스' : '이병 한민재'}</div>
        </div>
        <div class="summary"><span class="txt"></span><span class="caret"></span></div>
        <div class="obj">${m.objectives.map((o) => `<div>${esc(o)}</div>`).join('')}</div>
        <div class="cast">${m.cast.map((c) => { const ch = CHARACTERS[c]; return `<div class="c"><b>${esc(ch.name)}</b><span>${esc(ch.rank ? ch.rank + ' · ' : '')}${esc(ch.role)}</span></div>`; }).join('')}</div>
        <div class="deploy"><button class="btn primary" disabled>LOADING…</button><button class="btn small" data-a="back" data-snd="back">BACK</button><span class="loadstate"></span></div>
      </div>
      <div class="br"><canvas class="map"></canvas></div></div>`));
    this.show('briefing');
    audio.setMusic('menu');
    // typewriter
    const txt = $('.txt', el); let i = 0; clearInterval(this._type);
    this._type = setInterval(() => { if (i >= m.summary.length) return clearInterval(this._type); txt.textContent += m.summary[i++]; if (i % 3 === 0) audio.click(0.02, 4000, 0.008); }, 22);
    this.drawBriefingMap($('canvas.map', el), m);
    const deploy = $('.btn.primary', el); const ls = $('.loadstate', el);
    $('[data-a=back]', el).onclick = () => { clearInterval(this._auto); this.game.cancelLoad(); this.mainMenu(); };
    this.game.prepareMission(id, (p, msg) => { ls.textContent = `${msg} ${Math.round(p * 100)}%`; }).then(() => {
      deploy.disabled = false; deploy.textContent = 'DEPLOY ▸  출격'; ls.textContent = 'READY';
      const go = () => { clearInterval(this._type); clearInterval(this._auto); this.game.startMission(id, checkpoint); };
      deploy.onclick = go;
      // campaign flow: the briefing doubles as the loading screen and deploys as soon as loading is done
      if (autoDeploy) { deploy.textContent = 'DEPLOY ▸  출격'; clearInterval(this._auto); this._auto = setTimeout(() => { if (document.body.contains(deploy)) go(); }, 600); }
    }).catch((e) => { if (e?.cancelled) return; console.error(e); ls.textContent = '로딩 실패: ' + e.message; });
  }
  drawBriefingMap(cv, m) {
    const r = cv.getBoundingClientRect(); cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio;
    const g = cv.getContext('2d'); const W = cv.width, H = cv.height; g.scale(1, 1);
    g.fillStyle = '#06090a'; g.fillRect(0, 0, W, H);
    // contour lines from pseudo-noise
    const f = (x, y) => Math.sin(x * 0.006 + 1) * Math.cos(y * 0.005) * 0.6 + Math.sin(x * 0.013 + y * 0.009) * 0.3 + Math.exp(-((x - W * 0.62) ** 2 + (y - H * 0.38) ** 2) / (W * W * 0.012)) * 1.4;
    g.strokeStyle = 'rgba(160, 200, 170, 0.13)'; g.lineWidth = 1 * devicePixelRatio;
    for (let lv = -1; lv < 2; lv += 0.16) {
      g.beginPath(); const step = 6 * devicePixelRatio;
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
        const a = f(x, y) > lv, b = f(x + step, y) > lv, c = f(x, y + step) > lv;
        if (a !== b) { g.moveTo(x + step / 2, y); g.lineTo(x + step / 2, y + 1.5); } if (a !== c) { g.moveTo(x, y + step / 2); g.lineTo(x + 1.5, y + step / 2); }
      }
      g.stroke();
    }
    // grid & labels
    g.strokeStyle = 'rgba(200,240,106,0.07)'; for (let x = 0; x < W; x += 80 * devicePixelRatio) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 80 * devicePixelRatio) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const dp = devicePixelRatio; g.font = `${11 * dp}px monospace`;
    if (m.id === 'm01') {
      // MDL / fence line
      g.strokeStyle = 'rgba(255, 90, 74, 0.6)'; g.setLineDash([8 * dp, 6 * dp]); g.lineWidth = 2 * dp; g.beginPath(); g.moveTo(0, H * 0.3); g.bezierCurveTo(W * 0.3, H * 0.27, W * 0.6, H * 0.33, W, H * 0.29); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(255,90,74,0.8)'; g.fillText('GOP 철책선 / SOUTHERN BOUNDARY FENCE', 20 * dp, H * 0.3 - 10 * dp);
      g.fillStyle = 'rgba(255,90,74,0.5)'; g.fillText('DMZ', W * 0.45, H * 0.15);
      const pt = (x, y, label, col = '#c8f06a') => { g.strokeStyle = col; g.lineWidth = 1.5 * dp; g.beginPath(); g.arc(x * W, y * H, 7 * dp, 0, 7); g.stroke(); g.fillStyle = col; g.fillText(label, x * W + 12 * dp, y * H + 4 * dp); };
      g.strokeStyle = 'rgba(200,240,106,0.6)'; g.lineWidth = 1.5 * dp; g.beginPath(); g.moveTo(0.05 * W, 0.62 * H); g.lineTo(0.35 * W, 0.42 * H); g.lineTo(0.5 * W, 0.36 * H); g.lineTo(0.66 * W, 0.37 * H); g.lineTo(0.62 * W, 0.6 * H); g.lineTo(0.72 * W, 0.84 * H); g.stroke();
      pt(0.35, 0.42, '3소초 GP-3'); pt(0.5, 0.35, 'SENSOR LINE'); pt(0.66, 0.37, 'OP 백두-3', '#ffb347'); pt(0.62, 0.62, '민통선 마을'); pt(0.72, 0.84, 'RALLY / EXFIL');
    } else {
      g.fillStyle = 'rgba(200,240,106,0.6)'; g.fillText(m.locEn.toUpperCase(), 20 * dp, 30 * dp);
      g.fillStyle = 'rgba(255,179,71,0.8)'; g.fillText('LEVEL IN PRODUCTION', 20 * dp, 50 * dp);
    }
    g.fillStyle = 'rgba(160,180,170,0.5)'; g.fillText(`GRID ${m.id.toUpperCase()}-${m.num}  ·  SCALE 1:25000  ·  CLASSIFIED`, 20 * dp, H - 20 * dp);
  }

  // ---------------- settings ----------------
  settingsScreen(onBack) {
    const el = this.mount('settings', h(`<div class="overlay"><div class="panel dialog" style="width:900px"><span class="corner tl"></span><span class="corner br"></span>
      <div class="head"><div><div class="tag">CONFIGURATION // 설정</div><h2>SETTINGS</h2></div></div>
      <div class="tabs"><button data-t="graphics" class="on">GRAPHICS</button><button data-t="audio">AUDIO</button><button data-t="controls">CONTROLS</button><button data-t="gameplay">GAMEPLAY</button></div>
      <div class="body"></div>
      <div class="row-actions"><button class="btn small" data-a="reset">기본값 복원</button><button class="btn small" data-a="back" data-snd="back">BACK</button></div></div></div>`));
    const body = $('.body', el);
    const S = settings.data;
    const slider = (label, path, min, max, step, fmt = (v) => v, note = '') => {
      const v = settings.get(path);
      const row = h(`<div class="setrow"><label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${v}"/><span class="val">${fmt(v)}</span>${note ? `<div class="note">${note}</div>` : ''}</div>`);
      const inp = $('input', row); inp.oninput = () => { const nv = parseFloat(inp.value); $('.val', row).textContent = fmt(nv); settings.set(path, nv); };
      return row;
    };
    const seg = (label, path, opts, note = '') => {
      const row = h(`<div class="setrow"><label>${label}</label><div class="seg">${opts.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div><span class="val"></span>${note ? `<div class="note">${note}</div>` : ''}</div>`);
      const sync = () => row.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(settings.get(path)) === b.dataset.v));
      row.querySelectorAll('button').forEach((b) => b.onclick = () => { let v = b.dataset.v; if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(+v) && v !== '') v = +v; settings.set(path, v); sync(); audio.ui('select'); if (path === 'graphics.preset') render('graphics'); if (path === 'graphics.fullscreen') this.game.setFullscreen(v); });
      sync(); return row;
    };
    const pct = (v) => `${Math.round(v * 100)}%`;
    const render = (tab) => {
      el.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
      body.innerHTML = '';
      if (tab === 'graphics') {
        body.append(
          seg('그래픽 프리셋', 'graphics.preset', Object.keys(QUALITY_PRESETS).map((k) => [k, k.toUpperCase()])),
          slider('해상도 (렌더 스케일)', 'graphics.renderScale', 0.5, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`, `내부 렌더 해상도: ${Math.round(innerWidth * Math.min(2, devicePixelRatio) * S.graphics.renderScale)}×${Math.round(innerHeight * Math.min(2, devicePixelRatio) * S.graphics.renderScale)} (브라우저에서는 디스플레이 해상도 대신 렌더 스케일로 제어)`),
          seg('전체 화면', 'graphics.fullscreen', [[true, 'ON'], [false, 'OFF']]),
          seg('텍스처 품질', 'graphics.textures', [['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH']], '다음 레벨 로드 시 적용 (절차적 텍스처 재생성)'),
          seg('그림자 품질', 'graphics.shadows', [['off', 'OFF'], ['medium', 'MEDIUM'], ['high', 'HIGH'], ['ultra', 'ULTRA']]),
          seg('효과 품질', 'graphics.effects', [['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH']], '파티클 수 · 다음 레벨 로드 시 적용'),
          seg('후처리', 'graphics.post', [[true, 'ON'], [false, 'OFF']], '블룸 · 필름 그레인 · 비네트 · 색보정'),
          slider('시야각 (FOV)', 'graphics.fov', 65, 105, 1, (v) => `${v}°`),
          seg('프레임 제한', 'graphics.frameLimit', [[0, 'OFF'], [30, '30'], [60, '60'], [120, '120'], [144, '144']]),
          seg('수직 동기화', 'graphics.vsync', [[true, 'ON'], [false, 'OFF']], '브라우저는 항상 디스플레이 주사율에 맞춰 화면을 출력합니다(OFF 시 티어링 해제 불가). OFF로 두면 프레임 제한만 적용됩니다.'),
        );
      } else if (tab === 'audio') {
        body.append(slider('마스터 볼륨', 'audio.master', 0, 1, 0.01, pct), slider('음악 볼륨', 'audio.music', 0, 1, 0.01, pct), slider('효과음 볼륨', 'audio.sfx', 0, 1, 0.01, pct), slider('대사 볼륨', 'audio.dialogue', 0, 1, 0.01, pct),
          seg('대사 음성', 'audio.voice', [['tts', '음성 합성'], ['murmur', '웅얼거림']], '녹음된 성우 음성은 없습니다. "음성 합성"은 운영체제의 한국어 음성(예: Windows Microsoft Heami / SunHi, macOS Yuna)으로 대사를 읽습니다. 한국어 음성이 없으면 웅얼거림으로 대체됩니다.'), seg('자막', 'audio.subtitles', [[true, 'ON'], [false, 'OFF']], '자막을 끄면 필수 스토리 대사만 표시됩니다.'), seg('자막 크기', 'audio.subtitleSize', [['small', 'S'], ['medium', 'M'], ['large', 'L']]));
      } else if (tab === 'controls') {
        body.append(slider('마우스 감도', 'controls.sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)), slider('조준 시 감도 배율', 'controls.adsSensitivity', 0.3, 1.2, 0.05, (v) => v.toFixed(2)),
          seg('마우스 Y축 반전', 'controls.invertY', [[true, 'ON'], [false, 'OFF']]), seg('조준 방식', 'controls.adsToggle', [[false, 'HOLD'], [true, 'TOGGLE']]),
          seg('컨트롤러', 'controls.gamepadEnabled', [[true, 'ON'], [false, 'OFF']], `표준 게임패드 매핑 지원 · 현재 ${navigator.getGamepads ? ([...navigator.getGamepads()].filter(Boolean).length ? '연결됨' : '연결 안 됨') : '미지원'}`),
          slider('컨트롤러 감도', 'controls.gamepadSensitivity', 0.3, 2.5, 0.05, (v) => v.toFixed(2)));
        const names = { forward: '전진', back: '후진', left: '좌측 이동', right: '우측 이동', sprint: '달리기', crouch: '앉기', jump: '점프 / 넘기', reload: '재장전', interact: '상호작용', grenade: '수류탄', support: '쌍안경 / 화력 지원 / 재밍건', flashlight: '손전등', weapon1: '주무기', weapon2: '보조무기', pause: '일시정지', objectives: '목표 보기' };
        for (const [act, label] of Object.entries(names)) {
          const row = h(`<div class="setrow"><label>${label}</label><div><button class="keybtn">${keyName(S.controls.bindings[act])}</button></div><span class="val"></span></div>`);
          const b = $('button', row);
          b.onclick = () => { b.classList.add('wait'); b.textContent = '키 입력…'; this.game.input.captureCallback = (code) => { b.classList.remove('wait'); if (code !== 'Escape' || act === 'pause') { S.controls.bindings[act] = code; settings.save(); } b.textContent = keyName(S.controls.bindings[act]); }; };
          body.append(row);
        }
        const fixed = h(`<div class="setrow"><label>사격 / 조준</label><div class="mono" style="font-size:12px;color:var(--muted)">마우스 좌클릭 / 우클릭 · 패드 RT / LT</div><span></span></div>`); body.append(fixed);
        const rb = h(`<div class="setrow"><label></label><div><button class="btn small">키 설정 초기화</button></div><span></span></div>`); $('button', rb).onclick = () => { settings.resetBindings(); render('controls'); }; body.append(rb);
      } else if (tab === 'gameplay') {
        body.append(seg('난이도', 'gameplay.difficulty', [['recruit', '신병'], ['regular', '정규'], ['veteran', '베테랑']], '적 명중률 · 피해량 · 동시 사격 인원에 영향'), seg('조작 힌트', 'gameplay.hints', [[true, 'ON'], [false, 'OFF']]));
        const wipe = h(`<div class="setrow"><label>저장 데이터</label><div><button class="btn small" style="border-color:var(--danger);color:var(--danger)">모든 진행 상황 삭제</button></div><span></span></div>`);
        $('button', wipe).onclick = () => this.confirm('캠페인 진행 상황과 체크포인트를 모두 삭제합니다.', () => { saves.wipe(); });
        body.append(wipe);
      }
      this.wireSounds(body);
    };
    el.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => { audio.ui('select'); render(b.dataset.t); });
    $('[data-a=back]', el).onclick = () => { el.remove(); delete this.screens.settings; onBack?.(); };
    $('[data-a=reset]', el).onclick = () => this.confirm('모든 설정을 기본값으로 되돌립니다.', () => { settings.resetAll(); render('graphics'); });
    render('graphics');
    this.show('settings');
  }

  // ---------------- pause ----------------
  pause() {
    const g = this.game; const objs = g.objectives.list;
    const el = this.mount('pause', h(`<div class="overlay"><div class="panel dialog"><span class="corner tl"></span><span class="corner br"></span>
      <div class="head"><div><div class="tag">PAUSED // ${esc(g.missionMeta?.num || '')} ${esc(g.missionMeta?.title || '')}</div><h2>일시정지</h2></div></div>
      <div style="margin-bottom:16px;font-size:13px;line-height:1.9">${objs.map((o) => `<div style="opacity:${o.done ? .45 : 1}">${o.done ? '■' : '□'} ${esc(o.text)}${o.count ? ` (${o.progress}/${o.count})` : ''}</div>`).join('')}</div>
      <nav><button class="btn" data-a="resume">RESUME<span class="sub">계속</span></button>
      <button class="btn" data-a="restart">RESTART CHECKPOINT<span class="sub">체크포인트 재시작</span></button>
      <button class="btn" data-a="settings">SETTINGS<span class="sub">설정</span></button>
      <button class="btn" data-a="quit" data-snd="back">QUIT TO MENU<span class="sub">메인 메뉴</span></button></nav></div></div>`));
    $('[data-a=resume]', el).onclick = () => g.resume();
    $('[data-a=restart]', el).onclick = () => this.confirm('마지막 체크포인트부터 다시 시작합니다.', () => g.restartCheckpoint());
    $('[data-a=settings]', el).onclick = () => this.settingsScreen(() => this.pause());
    $('[data-a=quit]', el).onclick = () => this.confirm('메인 메뉴로 나갑니다. 마지막 체크포인트까지의 진행은 저장되어 있습니다.', () => g.quitToMenu());
    this.show('pause');
  }

  death(r) {
    if (typeof r === 'string') r = { title: '전투 불능', tag: 'KILLED IN ACTION', cause: '', tip: r, hits: [] };
    const fail = r.tag === 'MISSION FAILED';
    const deg = r.rel != null ? Math.round(-r.rel * 180 / Math.PI) : null;
    const compass = deg != null ? `<div class="dir" title="공격 방향"><svg viewBox="-50 -50 100 100"><circle r="44" class="ring"/><circle r="3" class="me"/><path d="M0,-28 L0,-6" class="tick"/><g transform="rotate(${deg})"><path d="M0,-44 L-9,-26 L9,-26 Z" class="arrow"/></g></svg><div class="mono">${esc(r.side)} · ${r.dist} m</div></div>` : '';
    const hits = (r.hits || []).map((x) => `<li><span>${esc(x.what)}</span><span class="mono">${x.dist != null ? `${x.dist} m · ` : ''}-${x.dmg}${x.ago > 0.2 ? ` · ${x.ago.toFixed(1)}s 전` : ''}</span></li>`).join('');
    const stat = (k, v) => `<div class="st"><div class="tag">${k}</div><div class="v mono">${v}</div></div>`;
    const el = this.mount('death', h(`<div class="${fail ? 'fail' : ''}"><div class="card">
      <div class="top"><div><div class="tag">${esc(r.tag)} // ${esc(r.checkpoint || '')}</div><h1>${esc(r.title)}</h1><div class="cause">${esc(r.cause || '')}</div></div>${compass}</div>
      ${hits ? `<div class="tag">마지막 피격 기록</div><ul class="hits">${hits}</ul>` : ''}
      ${r.objectives?.length ? `<div class="tag">진행 중이던 목표</div><div class="objs">${r.objectives.map((o) => `<div>□ ${esc(o)}</div>`).join('')}</div>` : ''}
      ${r.survived != null ? `<div class="sts">${stat('체크포인트 이후', fmtTime(r.survived))}${stat('사살', r.kills)}${stat('명중률', r.fired ? r.accuracy + '%' : '—')}${stat('누적 전사', r.deaths)}</div>` : ''}
      <p class="tip"><b>TIP</b> ${esc(r.tip || '')}</p>
      <div class="row-actions"><button class="btn small" data-a="menu" data-snd="back">메인 메뉴</button><button class="btn small primary" data-a="retry">체크포인트에서 재개 <kbd>R</kbd></button></div>
    </div></div>`));
    this.show('death');
    const retry = () => { off(); this.game.restartCheckpoint(); };
    const key = (e) => { if ((e.code === 'KeyR' || e.code === 'Enter') && this.game.state === 'dead') { e.preventDefault(); retry(); } };
    const off = () => removeEventListener('keydown', key);
    addEventListener('keydown', key);
    $('[data-a=retry]', el).onclick = retry;
    $('[data-a=menu]', el).onclick = () => { off(); this.game.quitToMenu(); };
  }

  // Campaign flow: straight from one operation into the next on a black title card — no results/briefing
  // screens. Shows the outcome in one line, the next operation's title card while it loads, then deploys.
  campaignTransition(meta, stats, next) {
    const el = this.mount('transition', h(`<div class="op-transition">
      <div class="done">MISSION ${meta.num} COMPLETE // ${esc(meta.title)} · ${fmtTime(stats.time)} · KILLS ${stats.kills} · ACC ${stats.accuracy}%</div>
      <div class="card"><div class="num">MISSION ${next.num}</div><h1>${esc(next.title)}</h1><div class="ko">${esc(next.ko)}</div>
        <div class="meta">${esc(next.date)} · ${esc(next.time)}<br>${esc(next.location)}</div></div>
      <div class="bar"><i></i></div><div class="ls">LOADING</div>
      <button class="btn small menu-btn" data-snd="back">메인 메뉴</button></div>`));
    this.show('transition');
    const bar = $('.bar i', el), ls = $('.ls', el);
    $('.menu-btn', el).onclick = () => { this.game.cancelLoad(); this.game.quitToMenu(); };
    const t0 = performance.now();
    this.game.prepareMission(next.id, (p, msg) => { bar.style.width = `${Math.round(p * 100)}%`; ls.textContent = msg; }).then(async () => {
      bar.style.width = '100%'; ls.textContent = 'DEPLOYING';
      const wait = Math.max(0, 2500 - (performance.now() - t0)); await new Promise((r) => setTimeout(r, wait));   // let the title card read
      if (document.body.contains(el)) this.game.startMission(next.id, null);
    }).catch((e) => { if (e?.cancelled) return; console.error(e); ls.textContent = '로딩 실패: ' + e.message; });
  }
  missionComplete(meta, stats, next) {
    const playableNext = next && next.status === 'playable';
    if (playableNext) return this.campaignTransition(meta, stats, next);
    const el = this.mount('complete', h(`<div class="overlay grid-bg"><div class="panel dialog" style="width:980px"><span class="corner tl"></span><span class="corner br"></span>
      <div class="head"><div><div class="tag">MISSION ${meta.num} COMPLETE // 임무 완료</div><h2>${meta.title} <span style="color:var(--muted);font-weight:400">${meta.ko}</span></h2></div><div class="tag">${esc(meta.location)}</div></div>
      <div class="stats">
        <div class="stat"><div class="tag">TIME</div><div class="v">${fmtTime(stats.time)}</div></div>
        <div class="stat"><div class="tag">KILLS</div><div class="v">${stats.kills}</div></div>
        <div class="stat"><div class="tag">ACCURACY</div><div class="v">${stats.accuracy}%</div></div>
        <div class="stat"><div class="tag">HEADSHOTS</div><div class="v">${stats.headshots}</div></div>
        <div class="stat"><div class="tag">DEATHS</div><div class="v">${stats.deaths}</div></div>
      </div>
      <p style="color:#c3ccc6;line-height:1.8">${esc(stats.epilogue || '')}</p>
      ${stats.choices?.length ? `<div class="choices-log"><b>이번 작전의 선택</b><br>${stats.choices.map((c) => '· ' + esc(c.replace(/<[^>]+>/g, ''))).join('<br>')}</div>` : ''}
      ${next ? `<div class="panel" style="padding:14px 16px;margin-top:10px"><div class="tag">NEXT // 다음 임무</div><div style="font-weight:700;letter-spacing:.08em;margin:4px 0">MISSION ${next.num} · ${next.title} <span style="color:var(--muted);font-weight:400">${next.ko}</span></div><div style="font-size:13px;color:var(--muted)">${esc(next.summary)}</div>${playableNext ? '' : '<div style="color:var(--warn);font-size:12px;margin-top:6px">이 임무는 아직 제작 중입니다 (설계 문서: docs/CAMPAIGN.md).</div>'}</div>` : ''}
      <div class="row-actions"><button class="btn small" data-a="replay">다시 하기</button><button class="btn small" data-a="menu" data-snd="back">메인 메뉴</button>${playableNext ? '<button class="btn small" data-a="next" style="border-color:var(--accent);color:var(--accent)">다음 작전 ▸</button>' : ''}</div></div></div>`));
    const stop = () => clearInterval(this._next);
    $('[data-a=replay]', el).onclick = () => { stop(); this.briefing(meta.id); };
    $('[data-a=menu]', el).onclick = () => { stop(); this.game.quitToMenu(); };
    const nextBtn = $('[data-a=next]', el);
    if (nextBtn) {
      // campaign flow: roll straight into the next operation unless the player chooses otherwise
      const go = () => { stop(); this.briefing(next.id, { autoDeploy: true }); };
      nextBtn.addEventListener('click', go);
      let n = 3; nextBtn.textContent = `다음 작전 ▸ ${n}`;
      stop(); this._next = setInterval(() => { if (!document.body.contains(nextBtn)) return stop(); n--; nextBtn.textContent = `다음 작전 ▸ ${n}`; if (n <= 0) go(); }, 1000);
    }
    this.show('complete');
  }

  credits(onDone) {
    const el = this.mount('credits', h(`<div><div class="roll">
      <p class="big">FRONTLINE</p><p style="letter-spacing:.5em;color:var(--accent)">IRON ECHO</p>
      <h2>GAME DIRECTION · DESIGN · PROGRAMMING</h2><p>Claude Code (Anthropic) — 프로젝트 의뢰자와 공동 제작</p>
      <h2>ENGINE</h2><p>three.js r187 (MIT License) · Web Audio API · WebGL 2</p>
      <h2>ART</h2><p>모든 텍스처 · 3D 모델 · 애니메이션은 코드로 절차적 생성</p>
      <h2>AUDIO</h2><p>모든 효과음과 음악은 Web Audio 합성으로 실시간 생성</p>
      <h2>CAST (CHARACTERS)</h2>${['minjae', 'yoon', 'doyun', 'jung', 'seoyeon', 'daniel', 'maya', 'nadia', 'morrow'].map((c) => `<p>${CHARACTERS[c].name} — ${CHARACTERS[c].en}</p>`).join('')}
      <h2>NOTICE</h2><p>이 작품은 픽션입니다. 등장하는 인물, 부대명, 사건은 실제와 관련이 없습니다.</p><p>게임 내 장비와 전투 시스템은 게임 플레이용으로 추상화되었습니다.</p>
      <h2>&nbsp;</h2><p class="big" style="font-size:22px">THANK YOU FOR PLAYING</p><h2>&nbsp;</h2></div><button class="btn small skip" data-snd="back">SKIP ▸</button></div>`));
    this.show('credits'); audio.setMusic('ending');
    const done = () => { clearTimeout(this._cr); if (onDone) onDone(); else { audio.setMusic('menu'); this.mainMenu(); } };
    $('.skip', el).onclick = done; this._cr = setTimeout(done, 72000);
  }

  clickToPlay() { const el = this.mount('clickToPlay', h(`<div><div>CLICK TO RESUME · 클릭하여 계속</div></div>`)); el.onclick = () => this.game.resume(); this.show('clickToPlay'); }

  // ---------------- cinematic overlay ----------------
  buildCine() {
    const el = h(`<div><div class="bar top"></div><div class="bar bot"></div><div class="title"><div class="t"></div><div class="s"></div></div><div class="fade"></div></div>`);
    el.classList.add('screen'); el.id = 'cine'; this.root.appendChild(el); this.screens.cine = el; this.cine = el;
  }
  // ---------------- HUD ----------------
  buildHUD() {
    const el = h(`<div class="hidden">
      <div class="vignette-low"></div>
      <div class="markers"></div>
      <div class="compass"><div class="strip"></div><div class="mid"></div></div>
      <div class="radio hidden"><span class="wave"><i></i><i style="animation-delay:.1s"></i><i style="animation-delay:.2s"></i><i style="animation-delay:.05s"></i></span><span class="who"></span></div>
      <div class="obj"><div class="h">OBJECTIVES</div><div class="list"></div></div>
      <div class="toast">▣ CHECKPOINT SAVED · 체크포인트 저장</div>
      <div class="objpop"><div class="h">NEW OBJECTIVE</div><div class="t"></div></div>
      <div class="xhair"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i></div>
      <div class="hit"></div>
      <div class="dmg"></div><div class="gwarn"></div>
      <div class="interact hidden"><span class="key"><svg width="0" height="0"></svg><span class="kt">F</span></span><span class="pt"></span></div>
      <div class="hint"></div>
      <div class="escort hidden"><div class="en"></div><div class="bar"><i></i></div></div>
      <div class="timer hidden"><span class="tl"></span> <b class="tv"></b></div>
      <div class="mounted hidden"><div class="mn"></div><div class="heat"><i></i></div></div>
      <div class="binos hidden"><div class="vig"></div><div class="tick h"></div><div class="tick v"></div><div class="info"><span class="rng">---</span> m · <span class="calls"></span></div><div class="lbl">LMB 좌표 지정 · RMB 취소</div></div>
      <div class="subs hidden"></div>
      <div class="health"><div class="lbl"><span class="who">HAN M.J.</span><span class="hp">100</span></div><div class="bar"><i style="width:100%"></i></div><div class="squad"></div></div>
      <div class="ammo"><div class="wn"></div><div class="pips"></div><div class="num"></div><div class="gren"></div></div>
    </div>`);
    el.classList.add('screen'); el.id = 'hud'; this.root.appendChild(el); this.screens.hud = el; this.hud = el;
    // compass strip
    const strip = $('.compass .strip', el); const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    let html = ''; for (let rep = -1; rep <= 1; rep++) for (let d = 0; d < 360; d += 15) { const x = (rep * 360 + d) * 3; html += `<span class="${labels[d] ? '' : 'tick'}" style="left:${x}px">${labels[d] || '|'}</span>`; }
    strip.innerHTML = html; this.compassStrip = strip;
  }
  setHUDVisible(v) { this.hud.classList.toggle('hidden', !v); const w = this.hud.querySelector('.health .who'); if (w) w.textContent = this.game.missionMeta?.pov === 'daniel' ? 'VOSS D.' : 'HAN M.J.'; }
  hint(html, dur = 5) {
    if (!settings.data.gameplay.hints) return;
    const e = $('.hint', this.hud); e.innerHTML = html; e.classList.add('on'); clearTimeout(this._hint); this._hint = setTimeout(() => e.classList.remove('on'), dur * 1000);
  }

  bindEvents() {
    const hud = this.hud;
    events.on('hud:ammo', (a) => {
      const box = $('.ammo', hud); if (!a) { box.classList.add('hidden'); return; } box.classList.remove('hidden');
      $('.wn', box).textContent = a.name; $('.num', box).innerHTML = `${a.mag}<small> / ${a.reserve}</small>`;
      $('.num', box).classList.toggle('low', a.mag <= Math.ceil(a.magSize * 0.25));
      $('.pips', box).innerHTML = Array.from({ length: Math.min(30, a.magSize) }, (_, i) => `<i class="${i < Math.round(a.mag / a.magSize * Math.min(30, a.magSize)) ? '' : 'e'}"></i>`).join('');
      $('.gren', box).textContent = `◆ GRENADE × ${a.grenades}`;
    });
    events.on('hud:hitmarker', (e) => { const el = $('.hit', hud); el.classList.toggle('kill', !!e.kill); el.style.transition = 'none'; el.style.opacity = 1; requestAnimationFrame(() => { el.style.transition = 'opacity .35s'; el.style.opacity = 0; }); });
    events.on('hud:interact', (it) => {
      const el = $('.interact', hud);
      if (!it) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden'); $('.pt', el).textContent = it.prompt + (it.hold ? ' (길게 누르기)' : ''); $('.kt', el).textContent = it.key;
      const svg = $('svg', el);
      if (it.hold) { svg.setAttribute('width', 44); svg.setAttribute('height', 36); const c = 2 * Math.PI * 15; svg.innerHTML = `<rect x="2" y="2" width="40" height="32" fill="none" stroke="rgba(200,240,106,0.9)" stroke-width="2" stroke-dasharray="${144 * it.progress} 200"/>`; } else svg.innerHTML = '';
    });
    events.on('subtitle', (s) => {
      const el = $('.subs', hud);
      if (!s) { el.classList.add('hidden'); return; }
      el.className = `subs sz-${settings.data.audio.subtitleSize}`;
      el.innerHTML = `${s.radio ? `<span class="rad" style="color:${s.color}">RADIO</span>` : ''}<b style="color:${s.color}">${esc(s.name)}</b>${esc(s.text)}`;
    });
    events.on('radio:active', (r) => { const el = $('.radio', hud); el.classList.toggle('hidden', !r); if (r) $('.who', el).textContent = `RADIO · ${r.speaker}`; });
    events.on('objectives:changed', (list) => {
      const vis = list.filter((o) => (!o.done && !o.failed) || (performance.now() - (o._doneAt || 0)) < 4000).slice(-4);
      $('.obj', hud).style.display = vis.length ? '' : 'none';
      $('.obj .list', hud).innerHTML = vis.map((o) => `<div class="o ${o.done ? 'done' : ''} ${o.failed ? 'failed' : ''}">${esc(o.text)}${o.count ? `<span class="cnt">${o.progress}/${o.count}</span>` : ''}</div>`).join('');
    });
    events.on('objective:new', (o) => { const el = $('.objpop', hud); $('.h', el).textContent = 'NEW OBJECTIVE // 새 목표'; $('.t', el).textContent = o.text; el.classList.add('on'); audio.ui('objective'); clearTimeout(this._op); this._op = setTimeout(() => el.classList.remove('on'), 3200); });
    events.on('objective:complete', (o) => { o._doneAt = performance.now(); const el = $('.objpop', hud); $('.h', el).textContent = 'OBJECTIVE COMPLETE // 목표 달성'; $('.t', el).textContent = o.text; el.classList.add('on'); audio.ui('complete'); clearTimeout(this._op); this._op = setTimeout(() => { el.classList.remove('on'); events.emit('objectives:changed', this.game.objectives.list); }, 3000); setTimeout(() => events.emit('objectives:changed', this.game.objectives.list), 4200); });
    events.on('hud:checkpoint', () => { const el = $('.toast', hud); el.classList.add('on'); audio.ui('checkpoint'); setTimeout(() => el.classList.remove('on'), 2600); });
    events.on('player:damaged', (d) => {
      const box = $('.dmg', hud); const i = document.createElement('i'); i.style.transform = `rotate(${-d.angle}rad)`; box.appendChild(i);
      requestAnimationFrame(() => { i.style.opacity = 0; }); setTimeout(() => i.remove(), 1300);
    });
    events.on('ui:fade', ({ to, dur }) => { const f = $('.fade', this.cine); f.style.transition = `opacity ${dur}s`; f.style.opacity = to; });
    events.on('ui:title', ({ title, sub, dur, style }) => {
      const t = $('.title', this.cine); t.classList.toggle('center', style === 'center'); $('.t', t).textContent = title; $('.s', t).textContent = sub; t.classList.add('on');
      clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), dur * 1000);
    });
    events.on('ui:letterbox', (on) => this.cine.classList.toggle('lb', on));
    events.on('hud:escort', (e) => { const el = $('.escort', hud); el.classList.toggle('hidden', !e); if (!e) return; $('.en', el).textContent = e.name; const i = $('.bar i', el); i.style.width = `${Math.max(0, Math.round(e.frac * 100))}%`; i.classList.toggle('low', e.frac < 0.35); });
    events.on('hud:timer', (t) => { const el = $('.timer', hud); el.classList.toggle('hidden', !t); if (!t) return; $('.tl', el).textContent = t.label; const tv = $('.tv', el); tv.textContent = fmtTime(Math.max(0, t.seconds)); tv.classList.toggle('urgent', t.seconds < 20); });
    events.on('hud:mounted', (m) => { this.mountedActive = !!m; const el = $('.mounted', hud); el.classList.toggle('hidden', !m); if (m) $('.mn', el).textContent = m.name; $('.ammo', hud).style.visibility = m ? 'hidden' : ''; });
    events.on('hud:mountedHeat', ({ heat, over, ads }) => { this.mountedAds = !!ads; const i = $('.mounted .heat i', hud); i.style.width = `${Math.round(heat * 100)}%`; i.classList.toggle('over', over); });
    events.on('hud:binoculars', (b) => { const el = $('.binos', hud); el.classList.toggle('hidden', !b); if (b) $('.calls', el).textContent = `화력 지원 ${b.calls}회`; });
    events.on('hud:binocularsRange', (r) => { $('.binos .rng', hud).textContent = r ?? '---'; });
    events.on('player:friendlyFire', () => this.hint('<b style="color:var(--warn)">사격 중지! 아군입니다.</b>', 2));
  }

  // per-frame HUD (crosshair spread, compass, markers, health, squad, grenade warnings)
  updateHUD(dt) {
    const g = this.game; const p = g.player; if (!p || this.hud.classList.contains('hidden')) return;
    const w = g.weapons; const cam = g.renderer.camera;
    // crosshair
    const xh = $('.xhair', this.hud); const ads = w.adsAmount;
    const d = w.current; const spread = d ? (d.hipSpread + d.moveSpread * Math.min(1, p.speed / 4)) : 0.03;
    const px = 6 + spread * 420 + (p.sprinting ? 10 : 0);
    xh.style.opacity = this.mountedActive ? (this.mountedAds ? 0 : 1) : (ads > 0.6 || p.sprinting || !d || p.seat || w.reloading || w.hidden) ? 0 : 1;
    const [t, b, l, r] = xh.querySelectorAll('i'); t.style.top = `${-px - 9}px`; b.style.top = `${px}px`; l.style.left = `${-px - 9}px`; r.style.left = `${px}px`;
    // health
    const hp = Math.max(0, Math.round(p.health)); $('.health .hp', this.hud).textContent = hp; const bar = $('.health .bar', this.hud); $('i', bar).style.width = `${hp}%`; bar.classList.toggle('low', hp < 35);
    $('.vignette-low', this.hud).style.opacity = hp < 50 ? (1 - hp / 50) * 0.9 : 0;
    g.renderer.fx.damage = hp < 60 ? (1 - hp / 60) * 0.8 : 0;
    // compass
    const yawDeg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360; // 0 = north (-Z)
    this.compassStrip.style.left = `${230 - (360 + yawDeg) * 3}px`;
    // objective markers & compass pins
    const mk = $('.markers', this.hud); const comp = $('.compass', this.hud);
    comp.querySelectorAll('.pin').forEach((e) => e.remove());
    let html = '';
    const W = innerWidth, H = innerHeight;
    for (const o of g.objectives.active()) {
      const list = o.markers || (o.marker ? [o.marker] : []);
      for (const m of list) {
        const v = new THREE.Vector3(m.x, m.y + 1.2, m.z); const dist = Math.round(v.distanceTo(p.position));
        const proj = v.clone().project(cam);
        if (!o.compassOnly && proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1) {   // compassOnly: navigation by bearing (no on-screen marker)
          const sx = (proj.x * 0.5 + 0.5) * W, sy = (-proj.y * 0.5 + 0.5) * H;
          html += `<div class="mk" style="left:${sx}px;top:${sy}px;opacity:${ads > 0.6 ? 0.35 : 1}">${dist}m</div>`;
        }
        const ang = Math.atan2(m.x - p.position.x, -(m.z - p.position.z)) * 180 / Math.PI; let rel = ((ang - yawDeg + 540) % 360) - 180;
        if (Math.abs(rel) < 76) { const pin = document.createElement('div'); pin.className = 'pin'; pin.style.left = `${230 + rel * 3}px`; comp.appendChild(pin); }
      }
    }
    // stragglers: the last enemies of a fight, marked after a quiet spell so a hidden one can't stall the mission
    for (const e of g.director.stragglers?.() || []) {
      const v = e.position.clone(); v.y += 2.1; const proj = v.clone().project(cam);
      if (proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1) html += `<div class="mk enemy" style="left:${(proj.x * 0.5 + 0.5) * W}px;top:${(-proj.y * 0.5 + 0.5) * H}px">${Math.round(e.position.distanceTo(p.position))}m</div>`;
      const ang = Math.atan2(e.position.x - p.position.x, -(e.position.z - p.position.z)) * 180 / Math.PI; const rel = ((ang - yawDeg + 540) % 360) - 180;
      if (Math.abs(rel) < 76) { const pin = document.createElement('div'); pin.className = 'pin enemy'; pin.style.left = `${230 + rel * 3}px`; comp.appendChild(pin); }
    }
    mk.innerHTML = html;
    // grenade warnings
    let gw = '';
    for (const gr of g.director.grenades) {
      if (!gr.enemy) continue; const dd = gr.mesh.position.distanceTo(p.position); if (dd > 9) continue;
      const a = p.yaw - Math.atan2(-(gr.mesh.position.x - p.position.x), -(gr.mesh.position.z - p.position.z));
      gw += `<i style="left:${Math.sin(a) * 120}px;top:${-Math.cos(a) * 120}px">!</i>`;
    }
    $('.gwarn', this.hud).innerHTML = gw;
    // squad
    this._sqT = (this._sqT || 0) - dt;
    if (this._sqT <= 0) {
      this._sqT = 0.5;
      $('.squad', this.hud).innerHTML = (g.squadList || []).map((s) => `<div><span class="s ${s.status}"></span><span class="rk">${esc(s.rank)}</span>${esc(s.name)}</div>`).join('');
    }
  }
}
