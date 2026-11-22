// Game orchestrator: owns all systems, the main loop, game states and the
// mission lifecycle (prepare -> start -> checkpoint/death -> complete).
import * as THREE from 'three';
import { Renderer } from '../render/Renderer.js';
import { Effects } from '../render/Effects.js';
import { clearTextureCache, getTextures } from '../render/TextureFactory.js';
import { Input } from './Input.js';
import { events } from './Events.js';
import { settings } from './Settings.js';
import { saves } from './SaveSystem.js';
import { audio } from '../audio/AudioEngine.js';
import { World } from '../world/World.js';
import { Props } from '../world/Props.js';
import { Player } from '../player/Player.js';
import { WeaponSystem } from '../player/Weapons.js';
import { Combat } from '../player/Combat.js';
import { AIDirector } from '../ai/AI.js';
import { Dialogue } from '../story/Dialogue.js';
import { Objectives } from '../story/Objectives.js';
import { MissionRunner, Cinematics } from '../story/MissionRunner.js';
import { loadCharacters } from '../ai/CharacterLib.js';
import { loadGear } from '../gear/GearLib.js';
import { missionById, nextMission } from '../missions/index.js';
import { UI } from '../ui/UI.js';
import { buildMenuScene } from '../world/MenuScene.js';
import { PropLibrary, PROP_IDS } from '../world/PropLibrary.js';
import { preloadPhotoTextures } from '../render/TextureFactory.js';
import { loadGLTF } from './Assets.js';
import { batchStatic } from '../render/StaticBatcher.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export class Game {
  constructor() {
    this.renderer = new Renderer(document.getElementById('viewport'));
    this.input = new Input(this.renderer.canvas);
    this.audio = audio;
    this.state = 'boot';
    this.time = 0; this.last = performance.now(); this.accum = 0;
    this.dialogue = new Dialogue(audio);
    this.objectives = new Objectives();
    this.ui = new UI(this);
    this.debug = new URLSearchParams(location.search);
    this.noLock = this.debug.has('nolock');
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.noLock) this.pause();
    };
    addEventListener('keydown', (e) => {
      if (e.code === settings.data.controls.bindings.pause || e.code === 'KeyP') {
        if (this.state === 'playing' && (this.noLock || e.code === 'KeyP')) this.pause();
        else if (this.state === 'paused' && this.ui.current === 'pause') this.resume();
      }
    });
    events.on('player:died', () => this.onPlayerDeath());
    // if the browser refuses to re-lock the mouse (e.g. right after Esc), a click on the view retries
    this.renderer.canvas.addEventListener('click', () => { if (this.state === 'playing' && !this.input.locked) this.lockPointer(); });
    document.addEventListener('pointerlockerror', () => { if (this.state === 'playing') this.ui.hint('화면을 클릭하면 조작이 재개됩니다', 3); });
    document.addEventListener('fullscreenchange', () => { const fs = !!document.fullscreenElement; if (settings.data.graphics.fullscreen !== fs) settings.set('graphics.fullscreen', fs); });
    // sprinting footsteps are audible to nearby enemies
    events.on('player:noise', ({ pos, radius }) => { if (this.director) for (const a of this.director.agents) if (a.team === 'enemy') a.hearNoise(pos, radius, 'steps'); });
    events.on('fx:blast', ({ intensity }) => { this.renderer.fx.flash = Math.max(this.renderer.fx.flash, intensity * 0.35); this.renderer.fx.aberration = intensity; this.renderer.fx.blur = intensity * 1.5; });
    events.on('settings:changed', () => { if (this.state !== 'playing') return; });
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    this.perfEl = document.createElement('div'); this.perfEl.id = 'perf'; document.body.appendChild(this.perfEl);
    this.fpsAcc = 0; this.fpsN = 0;
    this.missions = { byId: missionById, next: nextMission };
    window.__game = this; // debug / automated test hook
  }

  async boot() {
    const b = this.ui.boot();
    const names = ['concrete', 'snowground', 'asphalt', 'dirt', 'metal', 'paintedMetal', 'sandbag', 'camoROK', 'camoEnemy', 'fabric', 'wood', 'plaster'];
    await preloadPhotoTextures((p) => b.progress(p * 0.4, 'LOADING PHOTO TEXTURES'));
    for (let i = 0; i < names.length; i++) { b.progress(0.4 + 0.6 * i / names.length, `GENERATING MATERIALS · ${names[i].toUpperCase()}`); await nextFrame(); getTextures(names[i]); }
    b.progress(1, 'SYSTEMS READY');
    if (!this.debug.has('autostart') && !this.debug.has('bench')) await b.ready();
    audio.init();
    audio.menuTrackUrl = new URL('assets/audio/menu_theme.mp3', document.baseURI).href;
    if (this.debug.has('bench')) { const { runBenchmark } = await import('./Benchmark.js'); await runBenchmark(this); this.enterMenu(); return; }
    this.enterMenu();
  }

  // ---------------- menu ----------------
  enterMenu() {
    this.teardownMission();
    this.state = 'menu';
    this.renderer.clearScene();
    this.menuScene = buildMenuScene(this.renderer);
    audio.stopAllLoops(); audio.startWind(0.06); audio.setMusic('menu');
    this.ui.setHUDVisible(false);
    events.emit('ui:letterbox', false); events.emit('ui:fade', { to: 0, dur: 1.2 });
    this.ui.mainMenu();
  }

  // ---------------- mission lifecycle ----------------
  cancelLoad() { this.loadToken = null; }
  async prepareMission(id, progress) {
    const meta = missionById(id);
    if (!meta || meta.status !== 'playable') throw new Error('mission not available');
    const token = this.loadToken = Symbol('load');
    progress(0.05, 'LOADING MODULE');
    const mod = await meta.load();
    if (this.loadToken !== token) throw Object.assign(new Error('cancelled'), { cancelled: true });
    this.pending = { id, meta, mod };
    // photographic textures + scanned props (CC0) — failures fall back to procedural assets
    await preloadPhotoTextures((p) => progress(0.05 + 0.2 * p, 'LOADING TEXTURES'));
    progress(0.25, 'LOADING CHARACTERS'); await Promise.all([loadCharacters(), loadGear()]);
    let n = 0; const ids = mod.PROPS || PROP_IDS;
    await Promise.all(ids.map((pid) => loadGLTF(`models/${pid}/${pid}.gltf`).catch(() => null).then(() => progress(0.3 + 0.3 * (++n / ids.length), 'LOADING MODELS'))));
    // pre-generate textures used by the level while the briefing is shown
    const tex = mod.TEXTURES || [];
    for (let i = 0; i < tex.length; i++) { if (this.loadToken !== token) throw Object.assign(new Error('cancelled'), { cancelled: true }); progress(0.6 + 0.38 * i / tex.length, 'PREPARING ASSETS'); await nextFrame(); getTextures(tex[i]); }
    progress(1, 'READY');
  }

  async startMission(id, checkpointId = null, { stats = null } = {}) {
    const p = this.pending && this.pending.id === id ? this.pending : { id, meta: missionById(id), mod: await missionById(id).load() };
    this.teardownMission();
    this.state = 'loading';
    this.ui.hideAll();
    events.emit('ui:fade', { to: 1, dur: 0 });
    await nextFrame();
    this.missionMeta = p.meta; this.missionMod = p.mod; this.missionId = id; if (!checkpointId) this.choiceLog = [];
    this.renderer.clearScene(); this.menuScene = null;
    audio.stopAllLoops(); audio.setMusic('silent'); audio.recover(); this.failReason = null;
    // fresh systems
    const scene = this.renderer.scene;
    this.world = new World();
    this.effects = new Effects(scene, this.renderer.camera);
    this.effects.groundFn = (x, z) => this.world.heightFn(x, z);
    this.props = new Props(scene, this.world);
    await Promise.all([loadCharacters(), loadGear()]);
    this.propLib = await new PropLibrary(this).load(p.mod.PROPS || PROP_IDS); this.props.lib = this.propLib;
    this.combat = new Combat({ world: this.world, effects: this.effects, audio });
    this.director = new AIDirector({ scene, world: this.world, effects: this.effects, audio, combat: this.combat });
    this.combat.director = this.director;
    this.player = new Player({ camera: this.renderer.camera, world: this.world, input: this.input, audio });
    this.combat.player = this.player; this.director.player = this.player;
    // where the squad leader heads: the first active objective with a marker (nearest of a marker set)
    this.director.objectiveTarget = () => {
      const pp = this.player.position;
      for (const o of this.objectives.active()) {
        if (o.marker) return o.marker;
        if (o.markers?.length) return o.markers.reduce((a, b) => (a.distanceToSquared(pp) < b.distanceToSquared(pp) ? a : b));
      }
      return null;
    };
    this.weapons = new WeaponSystem({ player: this.player, input: this.input, audio, effects: this.effects, combat: this.combat, vmScene: this.renderer.vmScene, vmCamera: this.renderer.vmCamera, camera: this.renderer.camera });
    this.player.weapons = this.weapons;
    this.dialogue.clear(); this.dialogue = new Dialogue(audio);
    this.objectives.clear();
    this.mission = new MissionRunner(this); this.cine = new Cinematics(this);
    this.squadList = []; this.mounted = []; this.support = null; this.gadget = null;
    this.stats = stats || { time: 0, deaths: 0, kills: 0, headshots: 0, shotsFired: 0, shotsHit: 0 };
    this.killOff = events.on('player:kill', (e) => { this.stats.kills++; if (e.head) this.stats.headshots++; });
    // build level
    await p.mod.build(this);
    this.batchStats = batchStatic(this.renderer.scene);   // merge non-moving level geometry
    this.director.buildCovers();
    this.world.buildNav();
    // restore checkpoint state
    const cp = checkpointId ? saves.data.checkpoint : null;
    if (cp && cp.missionId === id && cp.weapons) this.pendingWeapons = cp.weapons;
    this.checkpointId = checkpointId || p.mod.SEGMENTS[0].id;
    this.state = 'playing';
    this.ui.setHUDVisible(true);
    this.lockPointer();
    // run mission script from checkpoint segment
    const segs = p.mod.SEGMENTS; let start = segs.findIndex((s) => s.id === this.checkpointId); if (start < 0) start = 0;
    const runner = this.mission;
    (async () => {
      try {
        await segs[start].setup?.(this, runner);
        if (this.pendingWeapons) { this.weapons.restore(this.pendingWeapons); this.pendingWeapons = null; }
        events.emit('ui:fade', { to: 0, dur: 1.5 });
        for (let i = start; i < segs.length; i++) {
          if (i > start) segs[i].enter?.(this, runner);
          if (i > start || !segs[i].noSaveOnStart) runner.checkpoint(segs[i].id);
          this.checkpointId = segs[i].id;
          await segs[i].run(this, runner);
        }
        await this.completeMission();
      } catch (e) { if (!e?.abort) console.error('mission script error', e); }
    })();
  }

  saveCheckpoint(id) {
    if (!this.missionId) return;
    this.checkpointId = id;
    this.cpStats = { time: this.stats.time, kills: this.stats.kills, fired: this.weapons.shotsFired, hit: this.weapons.shotsHit };
    saves.saveCheckpoint({ missionId: this.missionId, checkpointId: id, weapons: this.weapons.serialize(), stats: { ...this.stats } });
  }

  teardownMission() {
    if (this.mission) this.mission.abort();
    this.mission = null;
    this.killOff?.(); this.killOff = null;
    if (this.director) { for (const v of this.director.vehicles) v.remove(); this.director.clear(); }
    this.gadget?.dispose(); this.gadget = null;
    if (this.player) this.player.fovOverride = null;
    events.emit('hud:mounted', null); events.emit('hud:binoculars', null); events.emit('hud:escort', null); events.emit('hud:timer', null);
    this.dialogue?.clear();
    audio.stopAllLoops();
    this.renderer.fx.damage = 0; this.renderer.fx.desat = 0;
    events.emit('ui:letterbox', false);
    events.emit('hud:interact', null);
    if (this.weapons) this.weapons.vmRoot.visible = false;
  }

  async completeMission() {
    const meta = this.missionMeta; const next = nextMission(meta.id);
    this.state = 'complete'; this.input.exitLock();
    const st = this.stats; st.shotsFired = this.weapons.shotsFired; st.shotsHit = this.weapons.shotsHit;
    const result = { time: Math.round(st.time), kills: st.kills, headshots: st.headshots, deaths: st.deaths, accuracy: st.shotsFired ? Math.round(st.shotsHit / st.shotsFired * 100) : 0, difficulty: settings.data.gameplay.difficulty, epilogue: typeof this.missionMod.EPILOGUE === 'function' ? this.missionMod.EPILOGUE() : this.missionMod.EPILOGUE, choices: (this.choiceLog || []).map((c) => c.text) };
    saves.completeMission(meta.id, result, next?.id);
    this.ui.setHUDVisible(false);
    this.teardownMission();
    this.ui.missionComplete(meta, result, next);
    audio.setMusic('ending');
  }

  // Scripted failure (escort destroyed, charge detonated...): ends the attempt with a reason.
  failMission(reason, objective = null) {
    if (this.state !== 'playing' || !this.player?.alive) return;
    this.failReason = { reason, objective }; const p = this.player; p.godMode = false;
    p.takeDamage(9999, null, null, { kind: 'mission', label: reason });
  }

  // Builds the after-action card shown on death: cause, attacker, direction,
  // recent hits, attempt stats and a tip that matches what actually happened.
  deathReport() {
    const p = this.player; const log = p.damageLog || []; const last = log[log.length - 1] || null;
    const fail = this.failReason; this.failReason = null;
    const bearing = (pos) => {
      if (!pos) return null;
      const d = pos.clone().sub(p.position); const dist = Math.hypot(d.x, d.z);
      const abs = Math.atan2(-d.x, -d.z); let rel = abs - (p.deathCam?.yaw0 ?? p.yaw); rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const a = Math.abs(rel); const side = a < 0.6 ? '정면' : a > 2.4 ? '후방' : rel > 0 ? '좌측' : '우측';
      return { dist, rel, side };
    };
    const name = (e) => {
      if (!e) return '알 수 없음';
      if (e.label) return e.label;
      switch (e.kind) {
        case 'bullet': return e.source?.role === 'flanker' ? '측면 우회조 사격' : e.source?.role === 'sniper' ? '적 저격수 사격' : '적 소총수 사격';
        case 'vehicle': return e.source?.isVehicle ? '적 기관총 차량 사격' : '차량 폭발';
        case 'grenade': return e.source === 'player' ? '자신의 수류탄' : '적 수류탄';
        case 'drone': return '자폭 드론 폭발';
        case 'artillery': return '적 박격포 · 포격';
        case 'mission': return '임무 실패';
        default: return e.source === 'player' ? '아군 폭발물' : '폭발';
      }
    };
    const kind = fail ? 'mission' : last?.kind || 'bullet';
    const b = fail ? null : bearing(last?.pos);
    const tips = {
      bullet: b && b.dist > 45 ? '원거리 사수에게 노출되었습니다. 다음 엄폐물을 먼저 정하고 짧게 끊어 이동하십시오. 조준(우클릭) 사격으로 먼저 제압하는 것이 안전합니다.'
        : b && (b.side === '후방' || b.side === '좌측' || b.side === '우측') ? `${b.side}에서 사격당했습니다. 분대원이 지키지 않는 방향을 주기적으로 확인하고, 교전 중에도 측면 엄폐를 유지하십시오.`
        : '정면 교전에서 쓰러졌습니다. 엄폐물 뒤에서 앉은 자세(C)로 짧게 사격하고, 체력이 줄면 즉시 몸을 숨겨 회복하십시오.',
      grenade: '수류탄 경고(!) 표시가 뜨면 표시 반대 방향으로 즉시 3~4m 이상 벗어나십시오. 좁은 엄폐물 뒤에 오래 머물면 수류탄의 표적이 됩니다.',
      drone: '자폭 드론은 급강하 직전 제자리에서 멈춰 삐 소리를 냅니다. 재밍건(B)을 들고 좌클릭을 유지해 드론을 원 안에 1초간 붙잡아 두면 추락합니다. 화면 가장자리 화살표로 다가오는 드론의 방향을 확인하십시오.',
      artillery: '포격 경고 후 같은 자리에 머물지 마십시오. 포탄은 관측된 위치 주변에 연속으로 떨어집니다.',
      vehicle: '차량 기관총은 소총으로 버티기 어렵습니다. 엄폐한 채 폭발물·거치 화기·지원 사격으로 차량부터 무력화하십시오.',
      blast: '폭발 반경에 들어갔습니다. 차량·드럼통 근처에서 교전하지 마십시오.',
      mission: fail ? `목표 실패: ${fail.reason}. ${fail.objective ? `"${fail.objective}" 목표를 우선 처리하십시오.` : ''}` : '임무 목표를 확인하십시오.',
    };
    const cpStats = this.cpStats || { time: 0, kills: 0, fired: 0, hit: 0 };
    const fired = this.weapons.shotsFired - cpStats.fired, hit = this.weapons.shotsHit - cpStats.hit;
    const now = performance.now() / 1000;
    return {
      title: fail ? '임무 실패' : '전투 불능', tag: fail ? 'MISSION FAILED' : 'KILLED IN ACTION',
      cause: fail ? fail.reason : name(last), kind,
      dist: b ? Math.round(b.dist) : null, side: b?.side || null, rel: b?.rel ?? null,
      hits: fail ? [] : log.slice(-5).reverse().map((e) => ({ what: name(e), dmg: Math.round(e.amount), ago: Math.max(0, now - e.t), dist: e.pos ? Math.round(Math.hypot(e.pos.x - p.position.x, e.pos.z - p.position.z)) : null })),
      survived: Math.max(0, this.stats.time - cpStats.time), kills: this.stats.kills - cpStats.kills, accuracy: fired > 0 ? Math.round(hit / fired * 100) : 0, fired,
      checkpoint: this.missionMeta ? `MISSION ${this.missionMeta.num} · ${this.missionMeta.title}` : '', objectives: this.objectives.active().map((o) => o.text),
      deaths: this.stats.deaths, tip: tips[kind] || tips.bullet,
    };
  }

  onPlayerDeath() {
    if (this.state !== 'playing') return;
    this.state = 'dead'; this.stats.deaths++;
    this.renderer.fx.desat = 0.8;
    this.input.exitLock();
    this.weapons.hidden = true; for (const mw of this.mounted || []) if (mw.manned) { mw.manned = false; events.emit('hud:mounted', null); }
    if (this.support?.active) this.support.toggle(false);
    if (this.gadget?.active) this.gadget.toggle(false);
    audio.deathSequence();
    const report = this.deathReport();
    events.emit('ui:fade', { to: 0.35, dur: 2.6 });
    setTimeout(() => { if (this.state === 'dead') { this.ui.setHUDVisible(false); this.ui.death(report); } }, 2800);
  }
  async restartCheckpoint() {
    const cp = saves.data.checkpoint;
    const id = this.missionId; const cpId = cp && cp.missionId === id ? cp.checkpointId : null;
    const stats = cp?.stats ? { ...cp.stats, deaths: (this.stats?.deaths ?? 0), time: this.stats?.time ?? cp.stats.time } : this.stats;
    this.renderer.fx.desat = 0;
    await this.startMission(id, cpId, { stats });
  }
  continueCampaign() {
    const cp = saves.data.checkpoint;
    if (cp) this.ui.briefing(cp.missionId, { checkpoint: cp.checkpointId });
    else if (saves.data.lastMission) {
      // resume at the furthest mission that is actually playable; if the next one is
      // still in production, open mission select instead of silently replaying M01
      const m = missionById(saves.data.lastMission);
      if (m && m.status === 'playable') this.ui.briefing(m.id); else this.ui.missionSelect();
    }
  }

  // ---------------- pause ----------------
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused'; this.input.exitLock();
    if (audio.ctx) audio.ctx.suspend(); try { speechSynthesis?.pause(); } catch {}
    this.ui.pause();
  }
  resume() {
    if (this.state !== 'paused') return;
    this.ui.hideAll(); this.state = 'playing';
    if (audio.ctx) audio.ctx.resume(); try { speechSynthesis?.resume(); } catch {}
    this.lockPointer(); this.last = performance.now();
  }
  lockPointer() { if (!this.noLock) this.input.requestLock(); }
  quitToMenu() { if (audio.ctx) audio.ctx.resume(); this.input.exitLock(); this.enterMenu(); }
  setFullscreen(on) {
    try { if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.(); else if (!on && document.fullscreenElement) document.exitFullscreen?.(); } catch {}
  }
  shutdown() { this.teardownMission(); this.state = 'shutdown'; audio.setMusic('silent'); audio.stopAllLoops(); this.renderer.clearScene(); }
  resumeFromShutdown() { this.state = 'menu'; this.menuScene = buildMenuScene(this.renderer); audio.startWind(0.06); audio.setMusic('menu'); }

  // ---------------- main loop ----------------
  loop(now) {
    requestAnimationFrame(this.loop);
    const limit = settings.data.graphics.frameLimit;
    if (limit > 0 && now - this.last < 1000 / limit - 1) return;
    let dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (dt <= 0) return;
    this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc > 1) { this.perfEl.textContent = `${Math.round(this.fpsN / this.fpsAcc)} FPS · ${this.renderer.info.render.calls} DC`; this.fpsAcc = 0; this.fpsN = 0; }
    this.input.pollGamepad();
    if (this.input.pad && this.input.padPressed.has('pause') && this.state === 'playing') this.pause();
    const lb = this.renderer.fx.letterboxTarget;
    if (this.state === 'menu' || this.state === 'shutdown') {
      this.time += dt;
      this.menuScene?.update(dt, this.time);
      this.renderer.render(dt, this.time, false);
    } else if (this.state === 'playing' || this.state === 'dead' || this.state === 'complete') {
      const simDt = this.state === 'complete' ? 0 : dt * (this.timeScale ?? 1);
      if (simDt > 0) { const n = Math.ceil(simDt / 0.05); for (let i = 0; i < n; i++) this.updateWorld(simDt / n); }
      this.renderer.render(dt, this.time, true);
      this.ui.updateHUD(dt);
    } else if (this.state === 'paused' || this.state === 'loading') {
      if (this.player) this.renderer.render(0, this.time, true);
      else this.renderer.render(dt, this.time, false);
    }
    this.input.endFrame();
  }
  updateWorld(dt) {
    this.time += dt; if (this.state === 'playing') this.stats.time += dt;
    const t = this.time;
    // mission scripts move vehicles: run them before the player/seat camera and mounted guns so a seated view
    // follows the vehicle in the same frame (otherwise the view lags one frame and the vehicle jitters)
    this.mission?.update(dt);
    if (this.state === 'playing') { this.player.update(dt, t); for (const m of this.mounted) m.update(dt, t); if (this.player.seat && this.mounted.some((m) => m.manned)) this.player.refreshSeatCamera(); this.support?.update(dt); this.gadget?.update(dt); this.weapons.update(dt, t); }
    else { this.player.updateCamera(dt, t); this.weapons.updateViewmodel(dt, t); }
    this.director.update(dt, t);
    for (const v of this.director.vehicles) v.update(dt);
    this.dialogue.update(dt);
    this.effects.update(dt);
    this.level?.update?.(dt, t);
    for (const a of this.props.animated) a.update(dt, t);
    audio.updateListener(this.renderer.camera);
    // keep shadow camera centred on player
    if (this.sun) { const p = this.player.position; this.sun.position.set(p.x + this.sunOffset.x, p.y + this.sunOffset.y, p.z + this.sunOffset.z); this.sun.target.position.copy(p); this.sun.target.updateMatrixWorld(); }
  }
}
