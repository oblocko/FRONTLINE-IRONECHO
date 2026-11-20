// Crew-served / vehicle-mounted weapons the player can man.
//  kind 'mg'  : tripod machine gun behind sandbags — heat instead of ammo
//  kind 'apc' : IFV turret autocannon — explosive rounds, turret traverse
// The player is seated on the weapon (constrained look); the weapon's pivot
// follows the player's aim; firing uses the shared Combat hitscan.
import * as THREE from 'three';
import { events } from '../core/Events.js';
import { keyName } from '../player/Player.js';

const DEFS = {
  mg: { name: 'M-60 기관총', interval: 0.075, damage: 48, headMult: 2, range: 400, spread: 0.012, heatPerShot: 0.022, cool: 0.32, kick: 0.004, sound: 'rifle', vehicleDamage: 12 },
  apc: { name: '30mm 기관포', interval: 0.33, damage: 200, headMult: 1, range: 600, spread: 0.004, heatPerShot: 0.09, cool: 0.38, kick: 0.012, sound: 'rifle', vehicleDamage: 140,
    explosive: { radius: 3.6, damage: 160, owner: 'player', scale: 0.55, playerSafe: true } },
};

function buildMG() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2122, metalness: 0.6, roughness: 0.42 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x2a2b2a, metalness: 0.05, roughness: 0.7 });
  const add = (geo, m, x, y, z, p = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  // tripod
  for (const a of [0, 2.2, -2.2]) { const leg = add(new THREE.CylinderGeometry(0.015, 0.012, 0.75, 6), dark, Math.sin(a) * 0.22, -0.32, Math.cos(a) * 0.22); leg.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); }
  const pivot = new THREE.Group(); g.add(pivot);                        // yaw
  const tilt = new THREE.Group(); tilt.position.y = 0.05; pivot.add(tilt); // pitch
  add(new THREE.BoxGeometry(0.1, 0.12, 0.5), dark, 0, 0.0, 0.05, tilt);    // receiver
  add(new THREE.BoxGeometry(0.11, 0.035, 0.32), dark, 0, 0.075, 0.0, tilt); // feed cover
  const bar = add(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 12), dark, 0, 0.0, -0.5, tilt); bar.rotation.x = Math.PI / 2;
  const jacket = add(new THREE.CylinderGeometry(0.032, 0.032, 0.3, 10), dark, 0, 0.0, -0.33, tilt); jacket.rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10).rotateX(Math.PI / 2), dark, 0, 0, -0.83, tilt);
  add(new THREE.BoxGeometry(0.06, 0.13, 0.2), poly, 0, -0.03, 0.38, tilt);  // stock
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.016, 0.016, 0.11, 8), poly, s * 0.08, -0.04, 0.2, tilt); // spade grips
  const box = add(new THREE.BoxGeometry(0.12, 0.13, 0.2), new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.8 }), 0.13, -0.04, -0.02, tilt); // ammo can
  const belt = add(new THREE.BoxGeometry(0.06, 0.012, 0.09), new THREE.MeshStandardMaterial({ color: 0xa88a40, metalness: 0.8, roughness: 0.35 }), 0.075, 0.04, -0.02, tilt);
  belt.rotation.z = -0.5;
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, -0.88); tilt.add(muzzle);
  return { g, pivot, tilt, muzzle };
}

export class MountedWeapon {
  // opts: { kind, pos (world) | parent+local, yaw, yawRange, pitchRange, prompt, seatOffset }
  constructor(game, opts) {
    this.game = game; this.kind = opts.kind; this.def = { ...DEFS[opts.kind], ...(opts.def || {}) };
    this.heat = 0; this.overheated = false; this.fireT = 0; this.manned = false; this.enabled = true;
    if (opts.kind === 'mg') {
      const m = buildMG(); this.root = m.g; this.pivot = m.pivot; this.tilt = m.tilt; this.muzzle = m.muzzle;
      this.root.position.copy(opts.pos); this.root.rotation.y = opts.yaw ?? 0; game.renderer.scene.add(this.root);
      this.seat = new THREE.Object3D(); this.seat.position.set(0, 0.12, 0.72); this.pivot.add(this.seat);
      this.baseYaw = opts.yaw ?? 0;
    } else {
      // APC: drive an existing turret group (pivot = turret, tilt = gun mantlet)
      this.root = opts.vehicle; this.pivot = opts.vehicle.userData.turret;
      this.tilt = new THREE.Group(); this.tilt.position.set(0, 0.35, 0.95); this.pivot.add(this.tilt);
      const gun = this.pivot.children.find((c) => c.geometry?.type === 'CylinderGeometry' && Math.abs(c.position.z - 2.1) < 0.01);
      if (gun) { this.pivot.remove(gun); gun.position.set(0, 0, 1.15); this.tilt.add(gun); }
      this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0, 2.35); this.tilt.add(this.muzzle);
      this.seat = new THREE.Object3D(); this.seat.position.set(0, 1.05, -0.35); this.pivot.add(this.seat);
      this.baseYaw = 0;
    }
    this.yawRange = opts.yawRange ?? 1.2; this.pitchRange = opts.pitchRange ?? [-0.35, 0.3];
    this.forward = this.kind === 'apc' ? 1 : -1; // model axis the barrel points along (+Z for the IFV, -Z for the MG)
    if (opts.interactable !== false) {
      this.it = game.player.addInteractable({ pos: () => this.seatWorld(), prompt: opts.prompt || `${this.def.name} 사용`, radius: 1.6, onUse: () => this.mount() });
    }
    this._v = new THREE.Vector3();
  }
  seatWorld() { this.root.updateMatrixWorld(true); return this.seat.getWorldPosition(new THREE.Vector3()); }

  mount() {
    const g = this.game, p = g.player; if (this.manned || !this.enabled) return;
    this.manned = true; if (this.it) this.it.enabled = false;
    // seat yaw: look along the barrel; the seat object sits behind the weapon
    p.enterSeat(this.seat, { yawFrom: this.root, yawBase: (this.forward > 0 ? Math.PI : 0) + (this.kind === 'apc' ? this.pivot.rotation.y : 0), yawRange: this.yawRange, pitchRange: this.pitchRange });
    p.lookYawLocal = 0; p.pitch = 0;
    g.weapons.hidden = true; this.lookYaw = 0;
    events.emit('hud:mounted', { name: this.def.name, heat: this.heat });
    g.ui.hint(`좌클릭 사격 · ${this.kind === 'mg' ? `${keyName(g.input.binding('interact'))} 또는 ${keyName(g.input.binding('jump'))} 이탈 · 과열 주의` : '폭발탄 · 적 차량에 효과적'}`, 5);
    this.mountT = 0.4;
  }
  dismount(pos = null) {
    const g = this.game, p = g.player; if (!this.manned) return;
    this.manned = false; g.weapons.hidden = false; events.emit('hud:mounted', null);
    if (this.kind === 'mg') { const out = this.root.localToWorld(new THREE.Vector3(0, 0, 1.3)); p.exitSeat(pos || out); if (this.it) this.it.enabled = this.enabled; }
  }
  disable() { this.enabled = false; if (this.it) this.it.enabled = false; if (this.manned) this.dismount(); }

  update(dt, time) {
    const g = this.game, p = g.player, inp = g.input;
    this.heat = Math.max(0, this.heat - dt * this.def.cool * (this.overheated ? 0.7 : 1));
    if (this.overheated && this.heat < 0.35) this.overheated = false;
    this.fireT -= dt;
    if (!this.manned) return;
    // aim: the gun pivot follows the player's look offset from the weapon base; tilt follows pitch
    this.pivot.rotation.y = (p.lookYawLocal || 0) + (p.seat.yawBase - (this.forward > 0 ? Math.PI : 0));
    this.tilt.rotation.x = this.forward > 0 ? -p.pitch : p.pitch;
    this.mountT -= dt;
    if (this.kind === 'mg' && !this.locked && this.mountT <= 0 && (inp.pressed('interact') || inp.pressed('jump'))) { this.dismount(); return; }
    if (inp.fire() && this.fireT <= 0 && !this.overheated && p.alive) this.fire(time);
    events.emit('hud:mountedHeat', { heat: this.heat, over: this.overheated });
  }
  fire(time) {
    const g = this.game, p = g.player, d = this.def;
    this.fireT = d.interval; this.heat += d.heatPerShot; if (this.heat >= 1) { this.heat = 1; this.overheated = true; g.ui.hint('<b style="color:var(--warn)">과열! 냉각 중</b>', 1.5); }
    const eye = p.eyePos(new THREE.Vector3()); const f = p.forward(new THREE.Vector3());
    const r = Math.sqrt(Math.random()) * d.spread, a = Math.random() * Math.PI * 2;
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw)); const up = new THREE.Vector3().crossVectors(right, f);
    const dir = f.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    this.root.updateMatrixWorld(true); const mz = this.muzzle.getWorldPosition(new THREE.Vector3());
    const res = g.combat.playerShot(eye, dir, { ...d, hipSpread: 0, moveSpread: 0, adsSpread: 0 }, mz);
    g.weapons.shotsFired++; if (res?.hitAgent || res?.hitVehicle) g.weapons.shotsHit++;
    g.effects.muzzleFlash(mz, dir); g.effects.flashLight(mz, 0xffb060, this.kind === 'apc' ? 10 : 5, 0.05, 9);
    g.audio.shot(this.kind === 'apc' ? mz : null, { kind: 'rifle' }); if (this.kind === 'apc') g.audio.explosion(mz, 0.12);
    p.pitch += d.kick; p.recoilPitch += d.kick * 0.6; p.addShake(this.kind === 'apc' ? 0.12 : 0.035);
    p.lastFireT = time; g.director.noise(eye, 120, 'player');
  }
}
