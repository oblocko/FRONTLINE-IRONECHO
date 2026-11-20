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
import { missionById, nextMission } from '../missions/index.js';
import { UI } from '../ui/UI.js';
import { buildMenuScene } from '../world/MenuScene.js';

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
    events.on('fx:blast', ({ intensity }) => { this.renderer.fx.flash = Math.max(this.renderer.fx.flash, intensity * 0.35); this.renderer.fx.aberration = intensity; this.renderer.fx.blur = intensity * 1.5; });
    events.on('settings:changed', () => { if (this.state !== 'playing') return; });
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    this.perfEl = document.createElement('div'); this.perfEl.id = 'perf'; document.body.appendChild(this.perfEl);
    this.fpsAcc = 0; this.fpsN = 0;
    window.__game = this; // debug / automated test hook
  }

  async boot() {
    const b = this.ui.boot();
    const names = ['concrete', 'snowground', 'asphalt', 'dirt', 'metal', 'paintedMetal', 'sandbag', 'camoROK', 'camoEnemy', 'fabric', 'wood', 'plaster'];
    for (let i = 0; i < names.length; i++) { b.progress(i / names.length, `GENERATING MATERIALS · ${names[i].toUpperCase()}`); await nextFrame(); getTextures(names[i]); }
    b.progress(1, 'SYSTEMS READY');
    if (!this.debug.has('autostart')) await b.ready();
    audio.init();
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
    // pre-generate textures used by the level while the briefing is shown
    const tex = mod.TEXTURES || [];
    for (let i = 0; i < tex.length; i++) { if (this.loadToken !== token) throw Object.assign(new Error('cancelled'), { cancelled: true }); progress(0.1 + 0.85 * i / tex.length, 'PREPARING ASSETS'); await nextFrame(); getTextures(tex[i]); }
    progress(1, 'READY');
  }

  async startMission(id, checkpointId = null, { stats = null } = {}) {
    const p = this.pending && this.pending.id === id ? this.pending : { id, meta: missionById(id), mod: await missionById(id).load() };
    this.teardownMission();
    this.state = 'loading';
    this.ui.hideAll();
    events.emit('ui:fade', { to: 1, dur: 0 });
    await nextFrame();
    this.missionMeta = p.meta; this.missionMod = p.mod; this.missionId = id;
    this.renderer.clearScene(); this.menuScene = null;
    audio.stopAllLoops(); audio.setMusic('silent');
    // fresh systems
    const scene = this.renderer.scene;
    this.world = new World();
    this.effects = new Effects(scene, this.renderer.camera);
    this.effects.groundFn = (x, z) => this.world.heightFn(x, z);
    this.props = new Props(scene, this.world);
    this.combat = new Combat({ world: this.world, effects: this.effects, audio });
    this.director = new AIDirector({ scene, world: this.world, effects: this.effects, audio, combat: this.combat });
    this.combat.director = this.director;
    this.player = new Player({ camera: this.renderer.camera, world: this.world, input: this.input, audio });
    this.combat.player = this.player; this.director.player = this.player;
    this.weapons = new WeaponSystem({ player: this.player, input: this.input, audio, effects: this.effects, combat: this.combat, vmScene: this.renderer.vmScene, vmCamera: this.renderer.vmCamera, camera: this.renderer.camera });
    this.player.weapons = this.weapons;
    this.dialogue.clear(); this.dialogue = new Dialogue(audio);
    this.objectives.clear();
    this.mission = new MissionRunner(this); this.cine = new Cinematics(this);
    this.squadList = [];
    this.stats = stats || { time: 0, deaths: 0, kills: 0, headshots: 0, shotsFired: 0, shotsHit: 0 };
    this.killOff = events.on('player:kill', (e) => { this.stats.kills++; if (e.head) this.stats.headshots++; });
    // build level
    await p.mod.build(this);
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
    saves.saveCheckpoint({ missionId: this.missionId, checkpointId: id, weapons: this.weapons.serialize(), stats: { ...this.stats } });
  }

  teardownMission() {
    if (this.mission) this.mission.abort();
    this.mission = null;
    this.killOff?.(); this.killOff = null;
    if (this.director) this.director.clear();
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
    const result = { time: Math.round(st.time), kills: st.kills, headshots: st.headshots, deaths: st.deaths, accuracy: st.shotsFired ? Math.round(st.shotsHit / st.shotsFired * 100) : 0, difficulty: settings.data.gameplay.difficulty, epilogue: this.missionMod.EPILOGUE };
    saves.completeMission(meta.id, result, next?.id);
    this.ui.setHUDVisible(false);
    this.teardownMission();
    this.ui.missionComplete(meta, result, next);
    audio.setMusic('ending');
  }

  onPlayerDeath() {
    if (this.state !== 'playing') return;
    this.state = 'dead'; this.stats.deaths++;
    this.renderer.fx.desat = 0.8;
    this.input.exitLock();
    const tips = ['엄폐물 뒤에 앉으면(C) 피격 확률이 크게 줄어듭니다.', '피해를 입지 않으면 체력이 회복됩니다. 위험할 때는 엄폐물 뒤로 물러나십시오.', '분대원들과 함께 움직이면 적의 화력이 분산됩니다.', '수류탄 경고 표시(!)가 보이면 즉시 그 방향에서 멀어지십시오.', '조준(우클릭) 사격은 탄 퍼짐이 훨씬 적습니다.'];
    setTimeout(() => { if (this.state === 'dead') { this.ui.setHUDVisible(false); this.ui.death(tips[Math.floor(Math.random() * tips.length)]); } }, 1400);
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
    else if (saves.data.lastMission) { const m = missionById(saves.data.lastMission); this.ui.briefing(m && m.status === 'playable' ? m.id : 'm01'); }
  }

  // ---------------- pause ----------------
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused'; this.input.exitLock();
    if (audio.ctx) audio.ctx.suspend();
    this.ui.pause();
  }
  resume() {
    if (this.state !== 'paused') return;
    this.ui.hideAll(); this.state = 'playing';
    if (audio.ctx) audio.ctx.resume();
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
    if (this.state === 'playing') { this.player.update(dt, t); this.weapons.update(dt, t); }
    else { this.player.updateCamera(dt, t); this.weapons.updateViewmodel(dt, t); }
    this.director.update(dt, t);
    this.mission?.update(dt);
    this.dialogue.update(dt);
    this.effects.update(dt);
    this.level?.update?.(dt, t);
    for (const a of this.props.animated) a.update(dt, t);
    audio.updateListener(this.renderer.camera);
    // keep shadow camera centred on player
    if (this.sun) { const p = this.player.position; this.sun.position.set(p.x + this.sunOffset.x, p.y + this.sunOffset.y, p.z + this.sunOffset.z); this.sun.target.position.copy(p); this.sun.target.updateMatrixWorld(); }
  }
}
