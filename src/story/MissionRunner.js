// Mission scripting runtime. Mission scripts are async functions driven by the
// game clock (pause-aware): `await m.wait(2)`, `await m.until(fn)`,
// `await m.reach(pos)`, `await m.say(...)`. Scripts are split into
// checkpoint segments so a mission can resume from any saved checkpoint.
import * as THREE from 'three';
import { events } from '../core/Events.js';

class Abort extends Error { constructor() { super('mission aborted'); this.abort = true; } }

export class MissionRunner {
  constructor(game) {
    this.game = game; this.waiters = []; this.time = 0; this.aborted = false; this.tasks = [];
    this.flags = {}; this.updaters = new Set(); this.cleanups = [];
  }
  get ctx() { return this.game; }
  bind(off) { this.cleanups.push(off); return () => { off(); this.cleanups = this.cleanups.filter((x) => x !== off); }; }
  abort() { for (const c of this.cleanups) c(); this.cleanups = []; this.aborted = true; for (const w of this.waiters) w.reject(new Abort()); this.waiters = []; this.updaters.clear(); }
  check() { if (this.aborted) throw new Abort(); }

  update(dt) {
    if (this.aborted) return;
    this.time += dt;
    for (const u of [...this.updaters]) { try { if (u(dt, this.time) === false) this.updaters.delete(u); } catch (e) { console.error(e); this.updaters.delete(u); } }
    const keep = [];
    for (const w of this.waiters) { let ok = false; try { ok = w.test(this.time); } catch (e) { console.error(e); ok = true; } if (ok) w.resolve(); else keep.push(w); }
    this.waiters = keep.filter((w) => !w.done);
  }
  // per-frame callback for the lifetime of the mission (return false to remove)
  every(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }

  _wait(test) {
    this.check();
    return new Promise((resolve, reject) => {
      const w = { test, resolve: () => { w.done = true; resolve(); }, reject };
      this.waiters.push(w);
    }).then(() => this.check());
  }
  wait(sec) { const t0 = this.time; return this._wait((t) => t - t0 >= sec); }
  until(fn, timeout = Infinity) { const t0 = this.time; return this._wait((t) => fn() || t - t0 >= timeout); }
  reach(pos, radius = 3, { yTol = 4 } = {}) {
    const p = this.game.player;
    return this.until(() => Math.hypot(p.position.x - pos.x, p.position.z - pos.z) < radius && Math.abs(p.position.y - pos.y) < yTol);
  }
  async say(speaker, text, opts) { this.check(); await Promise.race([this.game.dialogue.say(speaker, text, opts), this._wait(() => false).catch(() => {})]); this.check(); }
  async talk(lines) { for (const l of lines) await this.say(l[0], l[1], l[2] || {}); }
  // fire-and-forget async task bound to mission lifetime
  spawn(fn) { const p = fn().catch((e) => { if (!e?.abort) console.error(e); }); this.tasks.push(p); return p; }
  checkpoint(id) {
    if (this.aborted) return;
    this.game.saveCheckpoint(id);
    events.emit('hud:checkpoint', id);
  }
  // utility: allEnemiesDead in group/tag
  async killAll(agents) { await this.until(() => agents.every((a) => a.dead)); }
  dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
}

// Cinematic helpers (camera rails, letterbox, fades, title cards)
export class Cinematics {
  constructor(game) { this.game = game; this.active = null; }
  letterbox(on) { events.emit('ui:letterbox', on); }
  fade(to, dur = 1) { events.emit('ui:fade', { to, dur }); }
  title(title, sub = '', dur = 5, style = 'mission') { events.emit('ui:title', { title, sub, dur, style }); }
  // Drive the camera along a spline; returns promise. Player input is disabled during rails.
  rail(points, dur, { lookPoints = null, ease = true, fov = null } = {}) {
    const g = this.game; const curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone()));
    const lookCurve = lookPoints ? new THREE.CatmullRomCurve3(lookPoints.map((p) => p.clone())) : null;
    g.player.cameraOverride = true; g.weapons.hidden = true;
    let t = 0;
    return new Promise((resolve) => {
      const tick = (dt) => {
        t += dt / dur; const k = Math.min(1, t); const e = ease ? k * k * (3 - 2 * k) : k;
        const cam = g.renderer.camera; cam.position.copy(curve.getPoint(e));
        if (lookCurve) cam.lookAt(lookCurve.getPoint(e)); else cam.lookAt(curve.getPoint(Math.min(1, e + 0.01)));
        if (fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
        if (k >= 1) { resolve(); return false; }
      };
      g.mission.every(tick);
    });
  }
  release() { const g = this.game; g.player.cameraOverride = false; g.weapons.hidden = false; }
}
