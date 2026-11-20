// Binoculars + fire-support call. The player raises binoculars (support key),
// gets a magnified view with a range readout, and marks a target with fire:
// after a radio exchange and time of flight, a mortar salvo lands around the
// mark. Limited number of calls per mission event.
import * as THREE from 'three';
import { events } from '../core/Events.js';
import { keyName } from '../player/Player.js';

export class FireSupport {
  constructor(game, { calls = 2, rounds = 5, spread = 7, delay = 4.5, caller = 'seoyeon', minDist = 25 } = {}) {
    Object.assign(this, { game, calls, rounds, spread, delay, caller, minDist });
    this.active = false; this.available = true; this.zoom = 0; this.pending = [];
  }
  get key() { return keyName(this.game.input.binding('support')); }
  announce() { this.game.ui.hint(`${this.key} 쌍안경 · 좌클릭 박격포 좌표 지정 · 남은 요청 ${this.calls}`, 7); events.emit('hud:support', { calls: this.calls }); }
  toggle(on = !this.active) {
    const g = this.game, p = g.player;
    if (on && (!this.available || this.calls <= 0 || p.seat || !p.alive)) return;
    this.active = on; g.weapons.hidden = on; p.fovOverride = on ? 14 : null;
    events.emit('hud:binoculars', on ? { calls: this.calls } : null);
    g.audio.click(0.15, 900, 0.05);
  }
  update(dt) {
    const g = this.game, inp = g.input, p = g.player;
    if (this.available && inp.pressed('support')) this.toggle();
    if (this.active) {
      if (!p.alive || p.seat) { this.toggle(false); return; }
      const eye = p.eyePos(new THREE.Vector3()); const f = p.forward(new THREE.Vector3());
      const hit = g.world.raycast(eye, f, 600);
      events.emit('hud:binocularsRange', hit ? Math.round(hit.dist) : null);
      if (inp.firePressed() && hit) {
        if (hit.dist < this.minDist) { g.ui.hint('<b style="color:var(--warn)">너무 가깝습니다 — 아군 피해 위험</b>', 2); }
        else { this.call(hit.point); this.toggle(false); }
      }
      if (inp.adsPressed()) this.toggle(false);
    }
    // in-flight salvos
    for (const s of this.pending) {
      s.t -= dt;
      if (s.t <= 0 && s.left > 0) {
        s.t = 0.55 + Math.random() * 0.5; s.left--;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.spread;
        const pt = new THREE.Vector3(s.at.x + Math.cos(a) * r, 0, s.at.z + Math.sin(a) * r); pt.y = g.world.heightFn(pt.x, pt.z);
        g.combat.explode(pt, { radius: 6.5, damage: 200, owner: 'player', scale: 1.2, playerSafe: g.player.position.distanceTo(pt) > 12, snow: true });
      }
    }
    this.pending = this.pending.filter((s) => s.left > 0);
  }
  async call(at) {
    const g = this.game; this.calls--;
    events.emit('hud:support', { calls: this.calls });
    const grid = `${Math.round(at.x + 4000)}-${Math.round(-at.z + 6000)}`;
    g.dialogue.say('minjae', `포반, 좌표 ${grid}. 적 보병 밀집. 효력사 요청!`, { radio: true, priority: 3 });
    g.dialogue.say(this.caller, '좌표 수신. 포탄 날아간다 — 탄착까지 5초.', { radio: true, priority: 3 });
    // marker smoke at the aim point while rounds are in flight
    const em = g.effects.addEmitter({ pos: at.clone(), rate: 6, life: this.delay + 3, spawn: (p) => g.effects.smoke.spawn({ x: p.x, y: p.y + 0.2, z: p.z, vx: (Math.random() - .5) * .3, vy: 1.2, vz: (Math.random() - .5) * .3, size: 0.8, endSize: 3, life: 3, alpha: 0.7, endAlpha: 0, r: 0.9, g: 0.35, b: 0.25 }) });
    this.pending.push({ at: at.clone(), t: this.delay, left: this.rounds, em });
    events.emit('support:called', { at });
  }
}
