// Player equipment: abstracted game weapons (no real-world specs or operating
// procedures), procedural first-person viewmodels with animation layers
// (sway, bob, sprint pose, ADS, recoil kick, reload, switch, inspect),
// hitscan resolution through Combat, ammo management, thrown grenades.
import * as THREE from 'three';
import { events } from '../core/Events.js';
import { pbr } from '../render/TextureFactory.js';
import { softSprite } from '../render/TextureFactory.js';
import { buildRifle, buildPistol } from './WeaponModels.js';

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// Fictional, gameplay-only equipment definitions.
// reload phase plan (fractions of the reload duration)
export function reloadPlan(id, empty) {
  if (id === 'pistol') return empty
    ? { release: 0.1, out: 0.2, pouch: 0.36, insert: 0.6, seat: 0.68, chargeBack: 0.68, chargeFwd: 0.8, back: 0.92 }
    : { release: 0.12, out: 0.22, pouch: 0.4, insert: 0.66, seat: 0.74, chargeBack: 0.74, chargeFwd: 0.78, back: 0.94 };
  return empty
    ? { release: 0.1, out: 0.18, pouch: 0.32, insert: 0.52, seat: 0.6, chargeBack: 0.76, chargeFwd: 0.82, back: 0.95 }
    : { release: 0.12, out: 0.24, pouch: 0.42, insert: 0.64, seat: 0.72, chargeBack: 0.72, chargeFwd: 0.76, back: 0.93 };
}
export const WEAPON_DEFS = {
  rifle: { id: 'rifle', name: 'K2C1 소총', short: 'RIFLE', mag: 30, reserve: 180, interval: 0.085, auto: true, damage: 34, headMult: 2.6, range: 300,
    hipSpread: 0.03, adsSpread: 0.003, moveSpread: 0.025, kick: 0.010, kickYaw: 0.004, reload: 2.2, reloadEmpty: 2.7, adsTime: 0.22, adsZoom: 0.3, sound: 'rifle' },
  pistol: { id: 'pistol', name: 'G17 권총', short: 'PISTOL', mag: 17, reserve: 51, interval: 0.16, auto: false, damage: 30, headMult: 2.4, range: 120,
    hipSpread: 0.025, adsSpread: 0.006, moveSpread: 0.015, kick: 0.02, kickYaw: 0.006, reload: 1.6, reloadEmpty: 1.9, adsTime: 0.15, adsZoom: 0.15, sound: 'pistol' },
};

function buildRifleVM() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x2a2c2b, roughness: 0.5, metalness: 0.55 });
  const poly = pbr('paintedMetal', { color: 0x4a4d45, repeat: [0.5, 0.5], key: 'vmpoly' });
  const tan = new THREE.MeshStandardMaterial({ color: 0x5f5a48, roughness: 0.8 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, p = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); p.add(o); return o; };
  add(new THREE.BoxGeometry(0.055, 0.075, 0.36), black, 0, 0, -0.05);                 // receiver
  add(new THREE.BoxGeometry(0.05, 0.03, 0.34), black, 0, 0.05, -0.06);                // top rail
  for (let i = 0; i < 12; i++) add(new THREE.BoxGeometry(0.052, 0.008, 0.012), black, 0, 0.068, -0.2 + i * 0.026);
  add(new THREE.BoxGeometry(0.062, 0.065, 0.3), poly, 0, 0.005, -0.37);               // handguard
  for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.064, 0.012, 0.035), black, 0, -0.01, -0.27 - i * 0.05);
  add(new THREE.CylinderGeometry(0.011, 0.011, 0.22, 10), black, 0, 0.01, -0.6, Math.PI / 2); // barrel
  add(new THREE.CylinderGeometry(0.017, 0.015, 0.06, 10), black, 0, 0.01, -0.73, Math.PI / 2); // muzzle device
  add(new THREE.BoxGeometry(0.04, 0.11, 0.06), black, 0, -0.08, 0.06, 0.28);          // grip
  const mag = add(new THREE.BoxGeometry(0.035, 0.15, 0.07), tan, 0, -0.1, -0.12, -0.18); // magazine
  add(new THREE.BoxGeometry(0.045, 0.07, 0.2), poly, 0, -0.005, 0.22);                // stock
  add(new THREE.BoxGeometry(0.05, 0.09, 0.03), black, 0, -0.01, 0.33);
  add(new THREE.BoxGeometry(0.03, 0.06, 0.04), black, 0, -0.055, -0.38);              // fore grip
  // reflex sight
  const sight = new THREE.Group(); sight.position.set(0, 0.095, -0.08); g.add(sight);
  add(new THREE.BoxGeometry(0.045, 0.02, 0.07), black, 0, -0.012, 0, 0, 0, 0, sight);
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 16), black); hood.position.set(0, 0.018, -0.02); sight.add(hood);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), new THREE.MeshStandardMaterial({ color: 0x5a8090, transparent: true, opacity: 0.25, metalness: 0.9, roughness: 0.05 })); lens.position.set(0, 0.018, -0.02); sight.add(lens);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 10), new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false })); dot.position.set(0, 0.018, -0.019); sight.add(dot);
  g.userData = { mag, muzzle: new THREE.Vector3(0, 0.01, -0.78), sightY: 0.113, sightZ: -0.1, dot };
  return g;
}
function buildPistolVM() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1c1b, roughness: 0.4, metalness: 0.6 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x26271f, roughness: 0.8 });
  const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
  const slide = add(new THREE.BoxGeometry(0.03, 0.035, 0.19), black, 0, 0.03, -0.05);
  add(new THREE.BoxGeometry(0.028, 0.025, 0.16), poly, 0, 0.005, -0.04);
  add(new THREE.BoxGeometry(0.028, 0.1, 0.045), poly, 0, -0.05, 0.03, 0.2);
  const mag = add(new THREE.BoxGeometry(0.022, 0.08, 0.035), black, 0, -0.07, 0.035, 0.2);
  add(new THREE.BoxGeometry(0.006, 0.01, 0.006), black, 0, 0.052, -0.13);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.006, 0.01, 0.006), black, s * 0.008, 0.052, 0.03);
  g.userData = { mag, slide, muzzle: new THREE.Vector3(0, 0.03, -0.15), sightY: 0.057, sightZ: 0.03 };
  return g;
}
function buildArms(skin = 0x26271f, sleeve = null) {
  // gloved hands + forearms with ROK camo sleeves
  const g = new THREE.Group();
  const glove = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.9 });
  const cloth = sleeve || pbr('camoROK', { repeat: [1, 1] });
  const mk = () => {
    const arm = new THREE.Group();
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.26, 4, 10), cloth); fore.rotation.x = Math.PI / 2; fore.position.z = 0.17; arm.add(fore);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.05, 10), glove); cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.03; arm.add(cuff);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.09), glove); hand.position.z = -0.02; arm.add(hand);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.035, 2, 4), glove); f.rotation.x = Math.PI / 2 - 0.9; f.position.set(-0.022 + i * 0.015, -0.025, -0.07); arm.add(f); }
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.03, 2, 4), glove); th.position.set(0.03, 0.005, -0.05); th.rotation.set(Math.PI / 2, 0, 0.6); arm.add(th);
    return arm;
  };
  const R = mk(), L = mk(); g.add(R, L);
  g.userData = { R, L };
  return g;
}

export class WeaponSystem {
  constructor({ player, input, audio, effects, combat, vmScene, vmCamera, camera }) {
    Object.assign(this, { player, input, audio, effects, combat, vmScene, vmCamera, camera });
    this.inventory = {};
    this.order = [];
    this.currentId = null; this.adsAmount = 0; this.fireT = 0; this.reloading = false; this.reloadT = 0; this.switching = 0;
    this.grenades = 3; this.thrownGrenades = [];
    this.sway = new THREE.Vector2(); this.kick = 0; this.kickRot = 0; this.enabled = true; this.lowered = false; this.lowerAmt = 0;
    this.shotsFired = 0; this.shotsHit = 0; this.kills = 0; this.shotsSinceTrigger = 0;
    this.vmRoot = new THREE.Group(); vmScene.add(this.vmRoot);
    // viewmodel lighting
    const amb = new THREE.HemisphereLight(0xb0b8c8, 0x30302a, 0.9); vmScene.add(amb);
    this.vmKey = new THREE.DirectionalLight(0xdde4ff, 1.4); this.vmKey.position.set(1, 2, 1); vmScene.add(this.vmKey);
    this.vmFlashLight = new THREE.PointLight(0xffaa55, 0, 2, 2); this.vmFlashLight.position.set(0.1, 0, -0.7); vmScene.add(this.vmFlashLight);
    // weapons carry their own hands; the legacy separate arm rig is kept hidden
    this.models = { rifle: buildRifle(), pistol: buildPistol() };
    this.arms = buildArms(); this.arms.visible = false;
    this.holder = new THREE.Group(); this.vmRoot.add(this.holder);
    for (const m of Object.values(this.models)) { m.visible = false; this.holder.add(m); const u = m.userData; if (u.mag) { m.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(u.mag); if (!b.isEmpty()) u.magCenter = b.getCenter(new THREE.Vector3()); } }
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite('flash'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.flash.scale.setScalar(0.22); this.flash.visible = false; this.holder.add(this.flash);
    this.time = 0;
  }
  get current() { return this.currentId ? WEAPON_DEFS[this.currentId] : null; }
  get state() { return this.inventory[this.currentId]; }

  give(id, { mag, reserve } = {}) {
    const d = WEAPON_DEFS[id]; this.inventory[id] = { mag: mag ?? d.mag, reserve: reserve ?? d.reserve };
    if (!this.order.includes(id)) this.order.push(id);
    if (!this.currentId) this.equip(id, true);
    this.emitAmmo();
  }
  // per-mission weapon setup: suppressor on the pistol, display name of the rifle
  setSuppressed(on) { WEAPON_DEFS.pistol.suppressed = !!on; const u = this.models.pistol.userData; if (u.suppressor) u.suppressor.visible = !!on; }
  setRifleName(name = 'K2C1 소총') { WEAPON_DEFS.rifle.name = name; this.emitAmmo(); }
  clear() { this.inventory = {}; this.order = []; this.currentId = null; for (const m of Object.values(this.models)) m.visible = false; this.grenades = 0; }
  equip(id, instant = false) {
    if (!this.inventory[id] || (id === this.currentId && !instant)) return;
    this.reloading = false; this.reloadPlan = null;
    const doSwap = () => { for (const [k, m] of Object.entries(this.models)) m.visible = k === id; this.currentId = id; this.emitAmmo(); };
    if (instant) { doSwap(); this.switching = 0; }
    else { this.switching = 1; this.pendingSwap = doSwap; this.audio.switchWeapon(); }
  }
  addAmmo(id, amount) { const s = this.inventory[id]; if (!s) return 0; const max = WEAPON_DEFS[id].reserve * 1.5; const add = Math.min(amount, max - s.reserve); s.reserve += Math.max(0, add); this.emitAmmo(); return add; }
  // resupply tops up to the standard load but never takes away ammo already carried above it
  refill() { for (const id of this.order) { const s = this.inventory[id]; s.reserve = Math.max(s.reserve, WEAPON_DEFS[id].reserve); } this.grenades = Math.max(this.grenades, 3); this.emitAmmo(); }
  emitAmmo() { const s = this.state; events.emit('hud:ammo', s ? { name: this.current.name, mag: s.mag, reserve: s.reserve, magSize: this.current.mag, grenades: this.grenades, weapon: this.currentId } : null); }
  serialize() { return { inventory: structuredClone(this.inventory), order: [...this.order], current: this.currentId, grenades: this.grenades }; }
  restore(d) { if (!d) return; this.inventory = structuredClone(d.inventory); this.order = [...d.order]; this.grenades = d.grenades; this.currentId = null; this.equip(d.current || this.order[0], true); }

  // Reload: a tactical reload keeps the round in the chamber (mag swapped, partly spent mag stowed);
  // an empty reload drops the empty mag, and after the new one seats the bolt is charged (rifle) or the
  // slide released (pistol). Ammo is committed the moment the new magazine seats — cancelling after that
  // (weapon switch) keeps it. Phase timings are shared by the animation and the sounds.
  reload() {
    const s = this.state, d = this.current; if (!s || this.reloading || s.mag >= d.mag || s.reserve <= 0) return;
    const empty = s.mag === 0;
    this.reloading = true; this.reloadEmpty = empty; this.reloadCommitted = false; this.reloadDur = empty ? d.reloadEmpty : d.reload; this.reloadT = 0;
    this.reloadPlan = reloadPlan(d.id, empty);
    const T = this.reloadDur, P = this.reloadPlan, a = this.audio;
    a.click(0.22, 1700, 0.03, P.release * T);                         // mag release
    a.click(0.12, 800, 0.07, P.out * T);                              // mag sliding out
    if (empty) a.click(0.18, 500, 0.05, (P.out + 0.08) * T);          // empty mag hits the ground
    a.click(0.1, 600, 0.1, P.pouch * T);                              // pouch
    a.click(0.38, 2300, 0.03, P.seat * T); a.click(0.2, 1100, 0.04, (P.seat + 0.02) * T);   // seat + slap
    if (empty && d.id === 'rifle') { a.click(0.3, 2800, 0.02, P.chargeBack * T); a.click(0.34, 1900, 0.03, P.chargeFwd * T); }
    if (empty && d.id === 'pistol') a.click(0.36, 2600, 0.025, P.chargeFwd * T);
    events.emit('player:reload', {});
  }
  throwGrenade() {
    if (this.grenades <= 0 || this.throwing > 0) return;
    this.grenades--; this.throwing = 0.6; this.emitAmmo();
    setTimeout(() => {
      const eye = this.player.eyePos(new THREE.Vector3()); const f = this.player.forward(new THREE.Vector3());
      const v = f.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4, 0)).add(this.player.velocity.clone().multiplyScalar(0.5));
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3e4634, roughness: 0.6 }));
      mesh.position.copy(eye).addScaledVector(f, 0.5); this.combat.director.scene.add(mesh);
      this.combat.director.grenades.push({ mesh, v, fuse: 2.8, enemy: false });
    }, 280);
  }

  update(dt, time) {
    this.time = time;
    const inp = this.input; const p = this.player; const d = this.current; const s = this.state;
    // hidden = binoculars / jammer / mounted gun in use: the rifle must not fire, reload or throw
    const ctl = this.enabled && p.controlsEnabled && p.alive && !p.seat && !this.lowered && !this.hidden;
    // a click that was meant for the binoculars / jammer / mounted gun must not carry over to the rifle once it
    // comes back: the trigger stays locked until the button has been released
    if (!ctl) this._trigLock = true; else if (this._trigLock && !inp.fire()) this._trigLock = false;
    // switching
    if (this.switching > 0) { this.switching = Math.max(0, this.switching - dt * 3.2); if (this.switching < 0.5 && this.pendingSwap) { this.pendingSwap(); this.pendingSwap = null; } }
    if (ctl) {
      if (inp.pressed('weapon1') && this.order[0]) this.equip(this.order[0]);
      if (inp.pressed('weapon2') && this.order[1]) this.equip(this.order[1]);
      if (inp.mouse.wheel !== 0 && this.order.length > 1) { const i = this.order.indexOf(this.currentId); this.equip(this.order[(i + (inp.mouse.wheel > 0 ? 1 : this.order.length - 1)) % this.order.length]); }
      if (inp.pad && inp.padPressed.has('weapon1') && this.order.length > 1) { const i = this.order.indexOf(this.currentId); this.equip(this.order[(i + 1) % this.order.length]); }
      if (inp.pressed('reload')) this.reload();
      if (inp.pressed('grenade')) this.throwGrenade();
    }
    if (this.throwing > 0) this.throwing -= dt;
    // wall check: how close is the nearest surface along the line of the barrel
    this._wallT = (this._wallT || 0) - dt;
    if (this._wallT <= 0) {
      this._wallT = 0.05; const eye = p.eyePos(new THREE.Vector3()); const f = p.forward(new THREE.Vector3());
      const reach = this.currentId === 'pistol' ? 0.55 : 0.9; const hit = d && !p.seat ? this.combat.world.raycast(eye, f, reach, { ignore: (c) => c.passBullets }) : null;
      this._wallTarget = hit && !hit.terrain && Math.abs(hit.normal?.y ?? 0) < 0.7 ? Math.min(1, Math.max(0, (reach - hit.dist) / (reach * 0.65))) : 0;
    }
    this.wallTuck = damp(this.wallTuck || 0, this._wallTarget || 0, 10, dt);
    const tucked = this.wallTuck > 0.55;
    // ADS
    const wantAds = ctl && d && !tucked && !p.sprinting && this.switching === 0 && (inp.ads() || (this.adsToggled && !inp.ads()));
    this.adsAmount = damp(this.adsAmount, wantAds && !this.reloading ? 1 : 0, 1 / (d?.adsTime ?? 0.2) * 1.6, dt);
    // reload progress
    if (this.reloading) {
      this.reloadT += dt;
      if (!this.reloadCommitted && this.reloadT >= this.reloadPlan.seat * this.reloadDur) {
        this.reloadCommitted = true; const need = d.mag - s.mag; const take = Math.min(need, s.reserve); s.mag += take; s.reserve -= take; this.emitAmmo();
      }
      if (this.reloadT >= this.reloadDur) {
        this.reloading = false; this.emitAmmo();
      }
    }
    // fire
    this.fireT -= dt;
    if (ctl && !this._trigLock && d && !tucked && this.switching === 0 && !this.reloading && !(this.throwing > 0)) {
      const trigger = d.auto ? inp.fire() : inp.firePressed();
      if (inp.firePressed()) this.shotsSinceTrigger = 0;
      if (trigger && this.fireT <= 0 && !p.sprinting) {
        if (s.mag > 0) this.fire(time);
        else if (inp.firePressed()) { this.audio.dryFire(); if (s.reserve > 0) this.reload(); this.fireT = 0.25; }
      }
      if (p.sprinting && trigger) p.sprinting = false;
    }
    this.updateViewmodel(dt, time);
  }

  fire(time) {
    const d = this.current, s = this.state, p = this.player;
    s.mag--; this.fireT = d.interval; this.shotsFired++; this.shotsSinceTrigger++;
    if (!d.suppressed) p.lastFireT = time;   // a suppressed shot does not give the shooter away
    this.lastShot = { t: time, suppressed: !!d.suppressed, id: d.id };
    const eye = p.eyePos(new THREE.Vector3()); const f = p.forward(new THREE.Vector3());
    // spread (abstract)
    const moveK = Math.min(1, p.speed / 4);
    let spread = d.hipSpread * (1 - this.adsAmount) + d.adsSpread * this.adsAmount + d.moveSpread * moveK * (1 - this.adsAmount * 0.6);
    spread *= p.crouching ? 0.75 : 1;
    spread += Math.min(0.02, this.shotsSinceTrigger * 0.0015) * (1 - this.adsAmount * 0.5);
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw)); const up = new THREE.Vector3().crossVectors(right, f);
    const r = Math.sqrt(Math.random()) * spread, a = Math.random() * Math.PI * 2;
    const dir = f.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    // muzzle (world) for tracer & flash light
    const muzzleW = eye.clone().addScaledVector(f, 0.8).addScaledVector(right, 0.12 * (1 - this.adsAmount)).add(new THREE.Vector3(0, -0.08 * (1 - this.adsAmount), 0));
    const res = this.combat.playerShot(eye, dir, d, muzzleW);
    if (res?.hitAgent) this.shotsHit++;
    if (!d.suppressed) this.effects.flashLight(muzzleW, 0xffb060, 3, 0.05, 7);
    this.audio.shot(null, { kind: d.sound, suppressed: !!d.suppressed });
    // abstract recoil: camera kick + viewmodel kick
    const kickMul = (1 - this.adsAmount * 0.45) * (p.crouching ? 0.8 : 1);
    p.pitch += d.kick * kickMul; p.recoilPitch += d.kick * kickMul * 0.7;
    p.yaw += (Math.random() - 0.45) * d.kickYaw * kickMul;
    p.addShake(0.02);
    this.kick = 1; this.kickRot = 1;
    this.flash.visible = true; this.flashT = 0.04; this.flash.material.rotation = Math.random() * 6;
    this.vmFlashLight.intensity = d.suppressed ? 0.8 : 6;
    events.emit('player:fired', { pos: eye });
    this.emitAmmo();
    if (s.mag === 0 && s.reserve > 0) setTimeout(() => { if (this.state === s && s.mag === 0) this.reload(); }, 250);
  }

  updateViewmodel(dt, time) {
    const p = this.player, d = this.current;
    const show = !!d && !p.cameraOverride && this.enabled;
    this.vmRoot.visible = show && !this.hidden;
    if (!show) return;
    const m = this.models[this.currentId];
    // sway from look input
    const look = this.input.lookDelta();
    this.sway.x = damp(this.sway.x, -look.dx * 1.6, 10, dt); this.sway.y = damp(this.sway.y, -look.dy * 1.6, 10, dt);
    this.kick = damp(this.kick, 0, 18, dt); this.kickRot = damp(this.kickRot, 0, 12, dt);
    this.lowerAmt = damp(this.lowerAmt, this.lowered || p.seat ? 1 : 0, 6, dt);
    const ads = this.adsAmount; const sprint = damp(this._sprint || 0, p.sprinting ? 1 : 0, 8, dt); this._sprint = sprint;
    // positions in camera space
    // ADS: put the sight's reticle on the camera axis, `eyeRelief` metres in front of the eye
    const u = m.userData; const eyeRelief = this.currentId === 'pistol' ? 0.42 : 0.26;
    const hip = this.currentId === 'pistol' ? new THREE.Vector3(0.12, -0.1, -0.4) : new THREE.Vector3(0.145, -0.165, -0.46);
    const adsPos = new THREE.Vector3(0, -u.sightY, -eyeRelief - (u.sightZ ?? 0));
    const pos = hip.clone().lerp(adsPos, ads);
    // bob
    const bt = p.bobT; const bobAmp = (p.speed > 0.5 && p.grounded ? 1 : 0) * (1 - ads * 0.85);
    pos.x += Math.cos(bt * 0.5) * 0.012 * bobAmp * (1 + sprint); pos.y += -Math.abs(Math.sin(bt * 0.5)) * 0.012 * bobAmp * (1 + sprint * 1.5);
    // idle breathing
    pos.y += Math.sin(time * 1.6) * 0.0025 * (1 - ads * 0.7); pos.x += Math.sin(time * 0.8) * 0.0015 * (1 - ads * 0.7);
    pos.x += this.sway.x * 0.02 * (1 - ads * 0.7); pos.y += this.sway.y * 0.02 * (1 - ads * 0.7);
    pos.z += this.kick * 0.045 * (1 - ads * 0.4);
    pos.y -= p.landDip * 0.4;
    // sprint pose
    pos.x += sprint * 0.06; pos.y -= sprint * 0.06; pos.z += sprint * 0.04;
    // switch / lower
    pos.y -= this.switching * 0.35 + this.lowerAmt * 0.45;
    // muzzle against a wall: the weapon is pulled back and lifted (barrel up) instead of clipping into it
    const wall = this.wallTuck || 0;
    pos.z += wall * 0.16; pos.y += wall * 0.05; pos.x -= wall * 0.03;
    const rot = new THREE.Euler(
      this.kickRot * 0.06 + this.sway.y * 0.05 - sprint * 0.35 + this.switching * -0.8 + wall * 0.75,
      this.sway.x * 0.06 + sprint * 0.7,
      this.sway.x * 0.04 + sprint * 0.35 + (p.speed > 0.5 ? Math.sin(bt * 0.5) * 0.015 * bobAmp : 0));
    // reload animation (phases from reloadPlan): the weapon rolls toward the support hand, the hand goes to
    // the magazine, pulls it (an empty one is dropped and falls away), goes to the pouch, brings a fresh one
    // under the well and pushes it home (the weapon jolts as it seats), then on an empty reload charges the
    // bolt (rifle) / thumbs the slide release (pistol) and returns to its grip
    const handOff = new THREE.Vector3(); const magOff = new THREE.Vector3(); let magRot = 0, magVis = true;
    const isPistol = this.currentId === 'pistol';
    const P = this.reloading ? this.reloadPlan : null;
    if (P) {
      const t = this.reloadT / this.reloadDur;
      const ss = (a, b) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
      const bump = (c, w) => Math.max(0, 1 - Math.abs(t - c) / w);
      // whole-weapon motion
      const tilt = ss(0, P.release + 0.04) * (1 - ss(P.back - 0.08, 1));
      const charge = this.reloadEmpty && !isPistol ? ss(P.seat + 0.03, P.chargeBack - 0.02) * (1 - ss(P.chargeFwd, P.back)) : 0;
      // cant clockwise (magwell turns toward the support hand), muzzle up a little, pulled in toward the centre;
      // for the charging handle (right side) the cant reverses
      rot.z += -tilt * (isPistol ? 0.4 : 0.55) + charge * 0.75; rot.x += tilt * (isPistol ? 0.06 : -0.04) + charge * 0.04; rot.y += tilt * (isPistol ? 0.12 : 0.22) - charge * 0.2;
      pos.y += tilt * (isPistol ? 0.06 : 0.14) + charge * 0.0; pos.x -= tilt * (isPistol ? 0.05 : 0.11); pos.z += tilt * (isPistol ? -0.02 : 0.015);
      rot.x += bump(P.seat, 0.035) * 0.05; pos.y += bump(P.seat, 0.035) * 0.008;              // the mag seats
      if (this.reloadEmpty && !isPistol) { pos.z += bump(P.chargeFwd, 0.04) * 0.012; rot.x -= bump(P.chargeFwd, 0.04) * 0.03; }   // bolt slams home
      if (this.reloadEmpty && isPistol) { rot.x += bump(P.chargeFwd, 0.04) * 0.06; }
      // geometry: magazine axis (out of the well), grip point on the mag, the pouch on the belt
      const magOut = isPistol ? new THREE.Vector3(0, -1, 0.3).normalize() : new THREE.Vector3(0, -1, -0.28).normalize();
      const mc = u.magCenter || new THREE.Vector3(0, -0.15, -0.09);
      const toMag = mc.clone().sub(u.leftHandBase).add(isPistol ? new THREE.Vector3(-0.025, -0.035, 0.02) : new THREE.Vector3(-0.035, -0.02, 0.01));
      const pouch = isPistol ? new THREE.Vector3(-0.1, -0.46, 0.06) : new THREE.Vector3(-0.08, -0.52, 0.12);   // down to the belt, out of view
      if (t < P.pouch) {
        const toPouch = ss(P.out, P.pouch);
        if (this.reloadEmpty) {
          // empty mag drops free (gravity, tumbling); the hand goes straight for the pouch
          const ft = Math.max(0, t - P.release) * this.reloadDur;
          magOff.copy(magOut).multiplyScalar(0.03 * ss(P.release, P.release + 0.03) + 2.4 * ft * ft); magRot = ft * 3.5; magVis = magOff.length() < 0.45;
          handOff.copy(toMag).multiplyScalar(0.6 * ss(0, P.release) * (1 - toPouch)).lerp(pouch, toPouch);
        } else {
          // tactical: grip, pull it out along the well, carry it to the pouch
          const grip = toMag.clone().addScaledVector(magOut, 0.08 * ss(P.release, P.out));
          handOff.copy(toMag).multiplyScalar(ss(0, P.release)); if (t >= P.release) handOff.copy(grip);
          handOff.lerp(pouch, toPouch);
          if (t >= P.release) magOff.copy(handOff).sub(toMag);
          magRot = toPouch * 0.7; magVis = toPouch < 0.9;
        }
      } else if (t < P.seat) {
        // fresh magazine from the pouch to just under the well, then pushed in
        const come = ss(P.pouch + 0.03, P.insert), push = ss(P.insert, P.seat);
        const below = toMag.clone().addScaledVector(magOut, 0.07);
        handOff.copy(pouch).lerp(below, come).lerp(toMag, push);
        magOff.copy(handOff).sub(toMag); magRot = (1 - come) * 0.7; magVis = come > 0.08;
      } else {
        // seated: the hand comes off the mag — via the charging handle (rifle, empty) or the slide release
        // (pistol, empty) — back to its grip
        let h = toMag.clone();
        if (this.reloadEmpty && !isPistol) {
          const handle = new THREE.Vector3(0.075, 0.035, mc.z + 0.04).sub(u.leftHandBase);            // right side of the receiver
          h.lerp(handle, ss(P.seat + 0.01, P.chargeBack - 0.03)); h.z += ss(P.chargeBack - 0.03, P.chargeBack) * (1 - ss(P.chargeBack, P.chargeFwd)) * 0.08;   // yank it back, let go
        }
        if (this.reloadEmpty && isPistol) h.lerp(new THREE.Vector3(0.01, 0.06, 0.08).sub(u.leftHandBase).add(u.leftHandBase.clone().multiplyScalar(0)), ss(P.seat + 0.01, P.chargeFwd - 0.02) * 0.6);
        handOff.copy(h).multiplyScalar(1 - ss(this.reloadEmpty ? P.chargeFwd : P.seat + 0.02, P.back));
      }
    }
    if (u.mag) { u.mag.position.set(0, u.magBaseY ?? 0, 0).add(magOff); u.mag.rotation.set(-magRot, 0, magRot * 0.4); u.mag.visible = magVis; }
    if (u.slide && u.slideAxis === 'z') {
      // slide cycles with each shot, locks back on the last round, goes forward on the slide release
      const st = this.state;
      const locked = isPistol && st && ((st.mag === 0 && !this.reloadCommitted) || (P && this.reloadEmpty && this.reloadT / this.reloadDur < P.chargeFwd));
      u.slide.position.z = u.slideBase + Math.max(this.kick * 0.024, locked ? 0.026 : 0);
    }
    if (u.leftHand && u.leftHandBase) u.leftHand.position.copy(u.leftHandBase).add(handOff);
    if (u.leftArm && u.leftArmBase) u.leftArm.position.copy(u.leftArmBase).addScaledVector(handOff, 0.85).add(new THREE.Vector3(0, Math.min(0, handOff.y) * 0.3, 0));   // the forearm goes with the hand (and drops a bit more)
    if (this.throwing > 0) { const t = 1 - this.throwing / 0.6; pos.y -= Math.sin(t * Math.PI) * 0.25; rot.x -= Math.sin(t * Math.PI) * 0.5; }
    this.holder.position.copy(pos); this.holder.rotation.copy(rot);
    m.position.set(0, 0, 0);
    // muzzle flash
    const sup = this.current?.suppressed && u.suppressor;
    const mz = sup ? u.suppressedMuzzle : m.userData.muzzle; this.flash.position.copy(mz);
    if (this.flashT > 0) { this.flashT -= dt; this.flash.scale.setScalar((0.18 + Math.random() * 0.1) * (sup ? 0.35 : 1)); } else this.flash.visible = false;
    this.vmFlashLight.intensity = damp(this.vmFlashLight.intensity, 0, 30, dt);
    if (u.dot) { u.dot.visible = ads > 0.35; if (u.ring) u.ring.visible = ads > 0.35; }
    this.vmCamera.fov = 60 - ads * 8; this.vmCamera.updateProjectionMatrix();
  }
}
