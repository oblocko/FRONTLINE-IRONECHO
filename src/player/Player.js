// First-person player controller: walk / sprint / crouch / jump / vault /
// ladders, camera rig (bob, sway, landing, FOV kick, trauma shake), health with
// regeneration, damage direction feedback, interaction (tap & hold), and
// vehicle seat attachment with constrained look.
import * as THREE from 'three';
import { events } from '../core/Events.js';
import { settings } from '../core/Settings.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class Player {
  constructor({ camera, world, input, audio }) {
    this.camera = camera; this.world = world; this.input = input; this.audio = audio;
    this.isPlayer = true; this.team = 'friendly'; this.name = 'Player';
    this.position = new THREE.Vector3(); this.velocity = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.height = 1.75; this.radius = 0.35;
    this.eye = 1.62; this.crouchAmt = 0;
    this.crouching = false; this.sprinting = false; this.grounded = true; this.speed = 0;
    this.maxHealth = 100; this.health = 100; this.regenDelay = 0; this.alive = true; this.godMode = false;
    this.bobT = 0; this.bob = new THREE.Vector3(); this.landDip = 0; this.trauma = 0; this.shakeT = 0;
    this.fovKick = 0; this.recoilPitch = 0; this.recoilYaw = 0;
    this.controlsEnabled = true; this.moveEnabled = true; this.lookEnabled = true;
    this.vault = null; this.seat = null; this.interactables = []; this.focus = null; this.holdT = 0;
    this.firingRecently = false; this.lastFireT = -10; this.stepT = 0; this.lastDamageT = -10;
    this.weapons = null; // set by Game
    this.lookLimits = null;
    this.cameraOverride = null; // cinematic
    // weapon-mounted flashlight (toggle with the flashlight binding)
    this.flashlight = new THREE.SpotLight(0xfff1dc, 0, 45, 0.42, 0.55, 1.6); // kept visible at 0 intensity to avoid shader recompiles
    this.flashlight.position.set(0.15, -0.12, 0); this.flashlight.target.position.set(0.05, -0.08, -5);
    camera.add(this.flashlight); camera.add(this.flashlight.target);
    this.flashOn = false;
    this._v = new THREE.Vector3();
  }

  chestPos(out = new THREE.Vector3()) { return out.copy(this.position).setY(this.position.y + (this.crouching ? 0.85 : 1.3)); }
  eyePos(out = new THREE.Vector3()) { return out.copy(this.position).setY(this.position.y + this.eye); }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }

  teleport(pos, yaw = this.yaw, pitch = 0) {
    this.position.copy(pos); this.position.y = this.world.groundHeight(pos.x, pos.z, Math.max(pos.y, this.world.heightFn(pos.x, pos.z)) + 1.2);
    this.velocity.set(0, 0, 0); this.yaw = yaw; this.pitch = pitch; this.vault = null;
  }
  reset() { this.health = this.maxHealth; this.alive = true; this.trauma = 0; this.seat = null; this.vault = null; this.crouching = false; this.deathCam = null; this.damageLog = []; }

  setFlashlight(on) { this.flashOn = on; this.flashlight.visible = true; this.flashlight.intensity = on ? 40 : 0; this.audio.click(0.12, 2600, 0.02); }
  addShake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  // info: { kind: 'bullet'|'grenade'|'drone'|'artillery'|'vehicle'|'blast'|'mission', label }
  takeDamage(amount, fromPos, source = null, info = null) {
    if (!this.alive || this.godMode) return;
    const now = performance.now() / 1000;
    const kind = info?.kind || (source?.isVehicle ? 'vehicle' : source?.team ? 'bullet' : fromPos ? 'blast' : 'mission');
    (this.damageLog ||= []).push({ t: now, amount: Math.min(amount, Math.max(0, this.health)), pos: fromPos ? fromPos.clone() : (source?.position ? source.position.clone() : null), source, kind, label: info?.label || null });
    this.damageLog = this.damageLog.filter((e) => now - e.t < 12).slice(-8);
    this.health -= amount; this.regenDelay = 4.5; this.lastDamageT = now;
    this.addShake(0.15 + amount / 100);
    const dir = fromPos ? fromPos.clone().sub(this.position) : null;
    let angle = 0; if (dir) { const a = Math.atan2(-dir.x, -dir.z); angle = a - this.yaw; }
    events.emit('player:damaged', { amount, angle, health: this.health });
    this.audio.playerHurt();
    if (this.health <= 0) { this.health = 0; this.alive = false; events.emit('player:died', { source }); }
  }
  nearMiss(point) { this.audio.whiz(point); this.addShake(0.04); events.emit('player:suppressed', {}); }

  // ----- interaction registry -----
  addInteractable(it) { const o = { radius: 2.0, hold: 0, enabled: true, prompt: '상호작용', ...it }; this.interactables.push(o); return o; }
  removeInteractable(o) { this.interactables = this.interactables.filter((x) => x !== o); }

  // ----- seats / vehicles -----
  // yawFrom: object whose world yaw is the look origin (defaults to the seat object itself)
  enterSeat(object3d, { offset = new THREE.Vector3(), yawRange = Math.PI * 0.75, pitchRange = [-0.6, 0.5], yawBase = 0, yawFrom = null, armed = false } = {}) {
    // armed: the player keeps using his own weapons from the seat (e.g. riding a rail car)
    this.seat = { object3d, offset: offset.clone(), yawRange, pitchRange, yawBase, yawFrom, armed };
    this.lookYawLocal = 0; this.pitch = 0;
    events.emit('player:seat', { seated: true });
  }
  exitSeat(pos) { this.seat = null; if (pos) this.teleport(pos, this.yaw); events.emit('player:seat', { seated: false }); }

  update(dt, time) {
    const inp = this.input; const ctl = this.controlsEnabled && this.alive;
    // ---- look ----
    if (ctl && this.lookEnabled) {
      let { dx, dy } = inp.lookDelta();
      const ads = this.weapons?.adsAmount ?? 0;
      const k = 1 - ads * (1 - settings.data.controls.adsSensitivity);
      dx *= k; dy *= k;
      if (this.seat) {
        this.lookYawLocal = clamp((this.lookYawLocal || 0) - dx, -this.seat.yawRange, this.seat.yawRange);
        this.pitch = clamp(this.pitch - dy, this.seat.pitchRange[0], this.seat.pitchRange[1]);
      } else {
        this.yaw -= dx; this.pitch = clamp(this.pitch - dy, -1.5, 1.5);
        if (this.lookLimits) { const l = this.lookLimits; this.yaw = clamp(this.yaw, l.yawMin, l.yawMax); this.pitch = clamp(this.pitch, l.pitchMin, l.pitchMax); }
      }
    }
    // recoil recovery (abstract camera kick)
    if (this.recoilPitch > 0) { const r = Math.min(this.recoilPitch, dt * 0.6); this.pitch -= r * 0.6; this.recoilPitch -= r; }

    if (ctl && this.input.pressed('flashlight')) this.setFlashlight(!this.flashOn);
    // free flight (free-roam city): no gravity or collision; W/S along the view, A/D strafe, Space up, crouch down,
    // sprint = fast. The camera is the eye.
    if (this.flying) {
      const { x, z } = ctl ? inp.moveAxes() : { x: 0, z: 0 }, sp = (inp.down('sprint') ? 90 : 22) * (this.flySpeed ?? 1);
      const fwd = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const up = ctl ? (inp.down('jump') ? 1 : 0) - (inp.down('crouch') ? 1 : 0) : 0;
      this.position.addScaledVector(fwd, z * sp * dt).addScaledVector(right, x * sp * dt); this.position.y = Math.max(this.flyMinY ?? 1, this.position.y + up * sp * dt);
      this.velocity.set(0, 0, 0); this.speed = 0; this.grounded = false;
      const cam = this.camera; cam.position.copy(this.position); cam.rotation.order = 'YXZ'; cam.rotation.set(this.pitch, this.yaw, 0);
      const base = settings.data.graphics.fov; cam.fov = damp(cam.fov, base, 10, dt); cam.updateProjectionMatrix();
      return;
    }
    if (this.seat) { this.updateSeat(dt); this.updateCamera(dt, time); this.updateInteract(dt); return; }

    // ---- vault in progress ----
    if (this.vault) {
      const v = this.vault; v.t += dt / v.dur; const t = Math.min(1, v.t);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.position.lerpVectors(v.from, v.to, e); this.position.y += Math.sin(t * Math.PI) * 0.35;
      if (t >= 1) { this.vault = null; this.velocity.set(0, 0, 0); }
      this.updateCamera(dt, time); return;
    }

    // ---- stance ----
    if (ctl && this.moveEnabled) {
      if (inp.pressed('crouch')) this.crouching = !this.crouching;
      if (inp.down('sprint') && this.crouching && inp.moveAxes().z > 0) this.crouching = false;
    }
    if (!this.crouching && this.world.ceilingAbove(this.position.x, this.position.z, this.position.y + 1.1, 0.3) < this.position.y + 1.8) this.crouching = true;
    this.crouchAmt = damp(this.crouchAmt, this.crouching ? 1 : 0, 10, dt);
    this.eye = 1.62 - this.crouchAmt * 0.6;

    // ---- movement ----
    const mv = ctl && this.moveEnabled ? inp.moveAxes() : { x: 0, z: 0 };
    const ads = this.weapons?.adsAmount ?? 0;
    const wantSprint = ctl && this.moveEnabled && inp.down('sprint') && mv.z > 0.3 && !this.crouching && ads < 0.3;
    this.sprinting = wantSprint && this.grounded;
    let maxSpeed = this.sprinting ? 6.6 : this.crouching ? 2.1 : 4.0;
    maxSpeed *= 1 - ads * 0.35;
    if (this.speedScale) maxSpeed *= this.speedScale;
    const fwd = this._v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3().addScaledVector(fwd, mv.z).addScaledVector(right, mv.x);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(maxSpeed);
    const accel = this.grounded ? 12 : 2.5;
    this.velocity.x = damp(this.velocity.x, wish.x, accel, dt);
    this.velocity.z = damp(this.velocity.z, wish.z, accel, dt);
    if (ctl && this.moveEnabled && inp.pressed('jump') && this.grounded) {
      if (!this.tryVault(fwd)) { this.velocity.y = 5.2; this.grounded = false; this.crouching = false; }
    }
    // auto-vault low obstacles when sprinting into them
    if (this.sprinting && this.grounded && this._blockedT > 0.15) this.tryVault(fwd);
    // ladders
    const ladder = this.world.ladders?.find((l) => this.position.x > l.min.x && this.position.x < l.max.x && this.position.z > l.min.z && this.position.z < l.max.z && this.position.y < l.top + 0.2);
    if (ladder && mv.z !== 0) { this.velocity.y = mv.z * 2.4; this.grounded = false; if (this.position.y >= ladder.top - 0.05 && mv.z > 0) { this.position.addScaledVector(fwd, 0.6); } }
    else this.velocity.y -= 18 * dt;

    const before = this.position.clone();
    const delta = new THREE.Vector3(this.velocity.x * dt, 0, this.velocity.z * dt);
    const res = this.world.moveCylinder(this.position, delta, this.radius, this.crouching ? 1.2 : 1.75, 0.45);
    this._blockedT = res.hitWall && mv.z > 0 ? (this._blockedT || 0) + dt : 0;
    this.position.y += this.velocity.y * dt;
    const gh = this.world.groundHeight(this.position.x, this.position.z, Math.max(before.y, this.position.y), 0.45, 0.1);
    const wasGrounded = this.grounded;
    if (this.position.y <= gh + 0.001 && this.velocity.y <= 0) {
      if (!wasGrounded && this.velocity.y < -6) { this.landDip = Math.min(0.18, -this.velocity.y * 0.018); this.audio.footstep(this.surface(), 1.2); }
      this.position.y = gh; this.velocity.y = 0; this.grounded = true;
    } else if (this.position.y > gh + 0.05) {
      // snap down slopes/steps
      if (wasGrounded && this.velocity.y <= 0 && this.position.y - gh < 0.45) { this.position.y = gh; this.grounded = true; } else this.grounded = false;
    }
    const ceil = this.world.ceilingAbove(this.position.x, this.position.z, this.position.y + 0.5, 0.3);
    if (this.position.y + this.eye + 0.1 > ceil) { this.position.y = Math.min(this.position.y, ceil - this.eye - 0.1); if (this.velocity.y > 0) this.velocity.y = 0; }
    this.speed = Math.hypot(this.position.x - before.x, this.position.z - before.z) / Math.max(dt, 1e-4);

    // footsteps
    if (this.grounded && this.speed > 0.6) {
      this.stepT += dt * (this.speed * 0.55 + 0.6);
      if (this.stepT > 1) { this.stepT = 0; this.audio.footstep(this.surface(), this.sprinting ? 1.0 : this.crouching ? 0.35 : 0.6); if (this.sprinting) events.emit('player:noise', { pos: this.position.clone(), radius: 12 }); }
    }
    this.audio.setIndoor(this.world.isIndoor(this.eyePos(new THREE.Vector3())) ? 1 : 0);
    this.firingRecently = time - this.lastFireT < 1.5;

    // health regen
    this.regenDelay -= dt;
    if (this.alive && this.regenDelay <= 0 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 28 * dt);

    this.updateCamera(dt, time);
    this.updateInteract(dt);
  }
  surface() { return this.world.surfaceAt(this.position.x, this.position.z, this.position.y); }

  tryVault(fwd) {
    const p = this.position;
    for (const reach of [0.6, 0.9]) {
      const probe = p.clone().addScaledVector(fwd, reach);
      // find obstacle top in front
      let top = -Infinity, ob = null;
      for (const c of this.world.query(probe.x - 0.2, probe.z - 0.2, probe.x + 0.2, probe.z + 0.2)) {
        if (probe.x > c.min.x - 0.1 && probe.x < c.max.x + 0.1 && probe.z > c.min.z - 0.1 && probe.z < c.max.z + 0.1 && c.max.y > p.y + 0.3 && c.max.y < p.y + 1.35 && c.walkable) { if (c.max.y > top) { top = c.max.y; ob = c; } }
      }
      if (!ob) continue;
      // landing spot: beyond the obstacle if thin, else on top
      const depth = Math.abs(fwd.x) > Math.abs(fwd.z) ? ob.max.x - ob.min.x : ob.max.z - ob.min.z;
      const land = depth < 1.2 ? p.clone().addScaledVector(fwd, reach + depth + 0.6) : p.clone().addScaledVector(fwd, reach + 0.3);
      land.y = this.world.groundHeight(land.x, land.z, top + 0.1);
      // clearance check
      const test = land.clone(); const r = this.world.moveCylinder(test, new THREE.Vector3(), this.radius * 0.9, 1.0, 0.3);
      if (r.hitWall) continue;
      this.vault = { from: p.clone(), to: land, t: 0, dur: depth < 1.2 ? 0.55 : 0.4 };
      this.audio.footstep('concrete', 0.8); this.landDip = 0.08;
      events.emit('player:vault', {});
      return true;
    }
    return false;
  }

  updateSeat(dt) {
    const s = this.seat; s.object3d.updateMatrixWorld(true);
    const p = s.object3d.localToWorld(s.offset.clone());
    this.position.copy(p).setY(p.y - this.eye);
    const q = new THREE.Quaternion(); (s.yawFrom || s.object3d).getWorldQuaternion(q);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    this.yaw = e.y + s.yawBase + (this.lookYawLocal || 0);
    this.crouchAmt = 0; this.eye = 1.62; this.speed = 0; this.grounded = true;
    this.regenDelay -= dt; if (this.regenDelay <= 0 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 28 * dt);
  }

  // re-place the seated camera after the mounted gun has turned this frame (the eye rides on the gun pivot)
  refreshSeatCamera() {
    if (!this.seat || !this.alive || this.cameraOverride) return;
    const s = this.seat; s.object3d.updateMatrixWorld(true);
    const p = s.object3d.localToWorld(s.offset.clone()); this.position.copy(p).setY(p.y - this.eye);
    const q = new THREE.Quaternion(); (s.yawFrom || s.object3d).getWorldQuaternion(q);
    this.yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y + s.yawBase + (this.lookYawLocal || 0);
    const cam = this.camera, right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    cam.position.copy(this.position).setY(this.position.y + this.eye + this.bob.y - this.landDip).addScaledVector(right, this.bob.x);
    cam.rotation.y = this.yaw + (this._shakeX || 0);
  }
  updateCamera(dt, time) {
    const cam = this.camera;
    if (this.cameraOverride) return; // cinematic system drives the camera
    if (!this.alive) { this.updateDeathCam(dt); return; }
    // head bob
    const moving = this.grounded && this.speed > 0.5 && !this.seat;
    if (moving) this.bobT += dt * (this.sprinting ? 13 : this.crouching ? 6.5 : 9);
    const amp = moving ? (this.sprinting ? 0.055 : this.crouching ? 0.018 : 0.03) * (1 - (this.weapons?.adsAmount ?? 0) * 0.8) : 0;
    this.bob.x = damp(this.bob.x, Math.cos(this.bobT * 0.5) * amp * 1.2, 12, dt);
    this.bob.y = damp(this.bob.y, -Math.abs(Math.sin(this.bobT * 0.5)) * amp, 12, dt);
    this.landDip = damp(this.landDip, 0, 8, dt);
    // trauma shake (perlin-ish via sines)
    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    this.shakeT += dt * 30; const sh = this.trauma * this.trauma;
    const sx = (Math.sin(this.shakeT * 1.1) + Math.sin(this.shakeT * 2.3) * 0.5) * 0.04 * sh;
    const sy = (Math.sin(this.shakeT * 1.7 + 1) + Math.sin(this.shakeT * 2.9) * 0.5) * 0.04 * sh;
    const sr = Math.sin(this.shakeT * 1.3 + 2) * 0.05 * sh;
    // vehicle sway
    let roll = 0;
    if (this.seat?.object3d.userData.sway) roll = this.seat.object3d.userData.sway;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    cam.position.copy(this.position).setY(this.position.y + this.eye + this.bob.y - this.landDip).addScaledVector(right, this.bob.x);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch + sy, this.yaw + sx, sr + roll - (this.leanRoll || 0)); this._shakeX = sx;
    // FOV
    const base = settings.data.graphics.fov; const ads = this.weapons?.adsAmount ?? 0;
    const target = this.fovOverride ?? (base * (1 - ads * (this.weapons?.current?.adsZoom ?? 0.22)) + (this.sprinting ? 6 : 0) + this.fovKick);
    cam.fov = damp(cam.fov, target, 10, dt); this.fovKick = damp(this.fovKick, 0, 6, dt);
    cam.updateProjectionMatrix();
  }

  // Death: the view drops to the ground, rolls onto its side and turns toward
  // whatever caused it; FOV narrows and the world sways with the last breaths.
  updateDeathCam(dt) {
    const cam = this.camera;
    if (!this.deathCam) {
      const last = [...(this.damageLog || [])].reverse().find((e) => e.pos);
      let yawTo = this.yaw;
      if (last) { const d = last.pos.clone().sub(this.position); yawTo = Math.atan2(-d.x, -d.z); }
      let dy = yawTo - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.deathCam = { t: 0, yaw0: this.yaw, dyaw: dy, pitch0: this.pitch, eye0: this.eye, roll: (Math.random() < 0.5 ? -1 : 1), fov0: cam.fov, seated: !!this.seat, base: cam.position.clone() };
    }
    const d = this.deathCam; d.t += dt;
    const k = (a, b) => { const x = Math.min(1, Math.max(0, (d.t - a) / (b - a))); return x * x * (3 - 2 * x); };
    const fall = k(0.05, 0.85), turn = k(0.7, 2.6), settle = k(0.85, 1.25);
    const ground = this.seat ? d.base.y - 0.5 : this.position.y + 0.22;
    const bounce = Math.sin(Math.min(1, Math.max(0, (d.t - 0.85) / 0.4)) * Math.PI) * 0.06;
    const y = d.seated ? d.base.y - fall * 0.5 : this.position.y + d.eye0 + (ground - this.position.y - d.eye0) * fall + bounce;
    const breathe = Math.sin(d.t * 1.6) * 0.012 * (1 - k(3, 6));
    const fwd = new THREE.Vector3(-Math.sin(d.yaw0), 0, -Math.cos(d.yaw0));
    cam.position.set(d.seated ? d.base.x : this.position.x, y + breathe, d.seated ? d.base.z : this.position.z).addScaledVector(fwd, fall * 0.35);
    cam.rotation.order = 'YXZ';
    const roll = d.roll * (fall * 1.18 - settle * 0.08);
    cam.rotation.set(d.pitch0 * (1 - fall) + fall * 0.12 - turn * 0.06 + breathe, d.yaw0 + d.dyaw * turn * 0.85, roll);
    cam.fov = d.fov0 + (46 - d.fov0) * k(1.2, 4); cam.updateProjectionMatrix();
  }

  updateInteract(dt) {
    const eye = this.eyePos(new THREE.Vector3()); const f = this.forward(new THREE.Vector3());
    let best = null, bestScore = Infinity;
    for (const it of this.interactables) {
      if (!it.enabled) continue;
      const p = typeof it.pos === 'function' ? it.pos() : it.pos;
      const to = p.clone().sub(eye); const d = to.length(); if (d > it.radius + 0.5) continue;
      const flat = Math.hypot(p.x - this.position.x, p.z - this.position.z); if (flat > it.radius) continue;
      const dot = to.normalize().dot(f); if (dot < 0.55 && flat > 0.9) continue;
      const score = d * (2 - dot); if (score < bestScore) { bestScore = score; best = it; }
    }
    if (best !== this.focus) { this.holdT = 0; this.focus = best; }
    const ctl = this.controlsEnabled && this.alive;
    let progress = 0;
    if (best && ctl) {
      const key = this.input.binding('interact');
      const held = this.input.keys.has(key) || (this.input.pad && this.input.pad.btn(2));
      if (best.hold > 0) {
        if (held) { this.holdT += dt; if (this.holdT >= best.hold) { this.holdT = 0; const it = best; this.focus = null; it.onUse?.(it); } }
        else this.holdT = Math.max(0, this.holdT - dt * 2);
        progress = this.holdT / best.hold;
      } else if (this.input.pressed('interact')) { const it = best; it.onUse?.(it); }
    }
    events.emit('hud:interact', best ? { prompt: best.prompt, progress, hold: best.hold > 0, key: this.input.lastDevice === 'pad' ? 'X' : keyName(this.input.binding('interact')) } : null);
  }
}

export function keyName(code) {
  if (!code) return '?';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'L-SHIFT').replace('ShiftRight', 'R-SHIFT').replace('ControlLeft', 'L-CTRL').replace('Space', 'SPACE').replace('Escape', 'ESC');
}
