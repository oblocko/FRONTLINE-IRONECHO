// Character AI: perception (vision cone + LOS + hearing), utility-scored cover
// selection, hide/peek/fire cycles, suppression, flanking roles, squad alert
// propagation, grenade usage, fire-token fairness for the player, and
// scriptable friendly squad members (follow / hold / scripted moves / passive).
import * as THREE from 'three';
import { createActor } from './Actor.js';
import { events } from '../core/Events.js';
import { settings } from '../core/Settings.js';

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);
const angleDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export const DIFFICULTY = {
  recruit: { hitChance: 0.10, damage: 7, tokens: 2, reaction: 1.0 },
  regular: { hitChance: 0.17, damage: 11, tokens: 3, reaction: 0.75 },
  veteran: { hitChance: 0.26, damage: 17, tokens: 4, reaction: 0.5 },
};

let AGENT_ID = 0;

export class AIAgent {
  constructor(director, opts) {
    this.id = ++AGENT_ID;
    this.director = director;
    this.team = opts.team; // 'friendly' | 'enemy'
    this.name = opts.name || (this.team === 'enemy' ? 'Hostile' : 'Soldier');
    this.callsign = opts.callsign || this.name;
    this.actor = createActor(director.scene, { faction: opts.faction || (this.team === 'enemy' ? 'kpa' : 'rok'), name: this.name, variant: this.id, hat: opts.hat, weapon: opts.weapon !== false, look: opts.look || null, sex: opts.sex || null });
    this.actor.root.position.copy(opts.pos);
    this.actor.root.position.y = director.world.groundHeight(opts.pos.x, opts.pos.z, Math.max(opts.pos.y, director.world.heightFn(opts.pos.x, opts.pos.z)) + 1.2);
    this.yaw = opts.yaw ?? 0; this.actor.root.rotation.y = this.yaw;
    this.hp = this.maxHp = opts.hp ?? 100;
    this.invulnerable = !!opts.invulnerable;  // squad plot armor; scripted events handle injuries
    this.state = opts.state || (this.team === 'enemy' ? 'idle' : 'follow');
    this.mode = opts.mode || 'auto';
    this.patrol = opts.patrol || null; this.patrolIdx = 0;
    this.role = opts.role || 'rifleman';
    this.accuracy = opts.accuracy ?? 1;
    this.visionRange = opts.visionRange ?? director.visionRange;
    this.path = null; this.pathIdx = 0; this.moveGoal = null; this.moveSpeed = 0; this.repathT = 0;
    this.cover = null; this.coverPhase = 'hide'; this.phaseT = 0; this.cycles = 0;
    this.target = null; this.lastSeenPos = null; this.lastSeenT = -99; this.seenTargetSince = 0;
    this.perceiveT = Math.random() * 0.3; this.burstLeft = 0; this.shotT = 0;
    this.suppression = 0; this.alertT = 0; this.investigatePos = null;
    this.hasToken = false; this.grenadeCD = rand(10, 20);
    this.anchor = opts.anchor || null; this.followOffset = opts.followOffset || new THREE.Vector3(2, 0, -2);
    this.script = null; this.lookAtPos = null; this.passive = !!opts.passive;
    this.dead = false; this.velocity = new THREE.Vector3(); this.stepT = 0;
    this.tags = new Set(opts.tags || []);
    this.onDeath = opts.onDeath || null;
  }

  get position() { return this.actor.root.position; }
  get alive() { return !this.dead; }
  eyePos(out = new THREE.Vector3()) { return out.copy(this.position).add(tmpC.set(0, this.actor.anim.crouch > 0.5 ? 1.05 : 1.6, 0)); }
  chestPos(out = new THREE.Vector3()) { return out.copy(this.position).add(tmpC.set(0, this.actor.anim.crouch > 0.5 ? 0.85 : 1.3, 0)); }

  // ---------- scripting API ----------
  moveTo(pos, { run = false, onArrive = null, crouch = false, face = null, tolerance = 0.6 } = {}) {
    this.script = { kind: 'move', pos: pos.clone(), run, onArrive, crouch, face, tolerance };
    this.setPath(pos);
  }
  hold(pos = null, face = null) { this.script = { kind: 'hold', pos: pos ? pos.clone() : this.position.clone(), face }; if (pos) this.setPath(pos); }
  follow(anchor, offset) { this.script = null; this.anchor = anchor; if (offset) this.followOffset = offset; this.state = 'follow'; this.leads = false; }
  // lead the player (squad leader) — see leadGoal()
  lead(player) { this.follow(player); this.leads = true; this._leadGoal = null; }
  clearScript() { this.script = null; }
  lookAt(pos) { this.lookAtPos = pos ? pos.clone() : null; }
  pose(kind) { this.script = { kind: 'static', pose: kind }; this.path = null; this.actor.target.sit = kind === 'sit' ? 1 : 0; this.actor.target.wounded = kind === 'wounded' ? 1 : 0; }
  unpose() { this.script = null; this.actor.target.sit = 0; this.actor.target.wounded = 0; }
  setPassive(v) { this.passive = v; if (v) { this.actor.target.aim = 0; this.releaseToken(); } }

  setPath(goal) {
    this.moveGoal = goal.clone();
    this.path = this.director.world.findPath(this.position, goal) || [goal.clone()];
    this.pathIdx = this.path.length > 1 ? 1 : 0; this.repathT = 2;
  }
  releaseToken() { if (this.hasToken) { this.hasToken = false; this.director.tokens--; } }

  // ---------- damage ----------
  takeDamage(amount, fromPos, part = 'chest', attacker = null) {
    if (this.dead) return false;
    this.suppression = Math.min(1, this.suppression + 0.5);
    this.actor.flinch(Math.random() < 0.5 ? -1 : 1);
    if (this.invulnerable) return false;
    this.hp -= amount;
    if (attacker && this.team === 'enemy' && !this.target) { this.target = attacker; this.lastSeenPos = attacker.position.clone(); this.state = 'combat'; }
    if (this.hp <= 0) { this.kill(fromPos, attacker); return true; }
    return false;
  }
  kill(fromPos, attacker = null) {
    if (this.dead) return;
    this.dead = true; this.releaseToken();
    if (this.cover) { this.cover.occupant = null; this.cover = null; }
    this.actor.die(tmpA.copy(this.position).sub(fromPos || this.position.clone().add(new THREE.Vector3(0, 0, 1))));
    this.actor.target.speed = 0;
    if (this.team === 'enemy') this.director.lastEnemyDeath = this.director.time;
    events.emit('ai:death', { agent: this, attacker });
    this.onDeath?.(this, attacker);
  }
  suppress(amount) { this.suppression = Math.min(1, this.suppression + amount); }

  // ---------- update ----------
  update(dt, time) {
    const a = this.actor;
    if (this.dead) { a.update(dt); return; }
    if (this.script?.kind === 'static') { // seated in vehicle / wounded / scripted pose
      a.target.speed = 0; a.target.aim = 0; a.target.crouch = this.script.crouch ? 1 : 0;
      if (this.lookAtPos) { const yawTo = Math.atan2(this.lookAtPos.x - this.position.x, this.lookAtPos.z - this.position.z); a.target.lookYaw = Math.max(-1, Math.min(1, angleDiff(this.yaw, yawTo))); }
      a.update(dt); return;
    }
    if (!this._placed) { this._placed = true; this.ensureOpen(false); }
    this.suppression = Math.max(0, this.suppression - dt * 0.25);
    this.grenadeCD -= dt;
    this.perceiveT -= dt;
    if (this.perceiveT <= 0) { this.perceiveT = 0.25 + Math.random() * 0.1; if (!this.passive) this.perceive(time); }

    let desiredSpeed = 0, crouch = 0, aim = 0;
    const d = this.director;

    if (this.script && (this.script.kind === 'move' || this.script.kind === 'hold')) {
      const s = this.script;
      const arrived = this.followPath(dt, s.kind === 'move' ? (s.run ? 4.2 : 1.7) : 2.2, s.tolerance ?? 0.6);
      desiredSpeed = this.moveSpeed; crouch = s.crouch ? 1 : 0;
      if (arrived && s.kind === 'move') { const cb = s.onArrive; this.script = { kind: 'hold', pos: this.position.clone(), face: s.face, crouch: s.crouch }; cb?.(this); }
      if (arrived && s.face) this.faceTowards(s.face, dt);
      // fight from position if enemies visible and not passive
      if (!this.passive && this.target && this.canSee(this.target)) { aim = 1; this.combatFire(dt, time); if (desiredSpeed < 0.2) crouch = this.cover ? 1 : crouch; }
    } else if (this.team === 'enemy') {
      ({ desiredSpeed, crouch, aim } = this.enemyBrain(dt, time));
    } else {
      ({ desiredSpeed, crouch, aim } = this.friendlyBrain(dt, time));
      if (this.team === 'civilian' && d.recentFire(this.position)) { crouch = 1; desiredSpeed *= 0.6; }
    }
    if (this.passive) aim = 0;
    // look / aim direction
    let lookTarget = this.lookAtPos;
    if (aim > 0.5 && this.target) lookTarget = this.target.position;
    if (lookTarget) {
      const yawTo = Math.atan2(lookTarget.x - this.position.x, lookTarget.z - this.position.z);
      const diff = angleDiff(this.yaw, yawTo);
      if (desiredSpeed < 0.5 || aim > 0.5) this.yaw += diff * Math.min(1, dt * 6);
      a.target.lookYaw = Math.max(-0.9, Math.min(0.9, angleDiff(this.yaw, yawTo)));
      const dy = (lookTarget.y + 1.2) - (this.position.y + 1.5); const dist = Math.hypot(lookTarget.x - this.position.x, lookTarget.z - this.position.z);
      a.target.lookPitch = Math.atan2(dy, Math.max(1, dist));
    } else { a.target.lookYaw = 0; a.target.lookPitch = 0; }
    a.root.rotation.y = this.yaw;
    a.target.speed = desiredSpeed; a.target.crouch = crouch; a.target.aim = aim;
    a.limp = this.limp ? 1 : 0;
    // footsteps (positional)
    if (desiredSpeed > 0.5) {
      this.stepT -= dt * (desiredSpeed > 3 ? 2.6 : 1.8);
      if (this.stepT <= 0) { this.stepT = 1; if (d.listenerDist(this.position) < 25) d.audio.footstep(d.world.surfaceAt(this.position.x, this.position.z, this.position.y), desiredSpeed > 3 ? 0.9 : 0.5, this.position.clone().setY(this.position.y + 0.1)); }
    }
    a.update(dt);
  }

  followPath(dt, speed, tolerance = 0.5) {
    if (!this.path) { this.moveSpeed = 0; return true; }
    this.repathT -= dt;
    let wp = this.path[this.pathIdx];
    const dist = Math.hypot(wp.x - this.position.x, wp.z - this.position.z);
    if (dist < (this.pathIdx === this.path.length - 1 ? tolerance : 0.7)) {
      if (this.pathIdx < this.path.length - 1) { this.pathIdx++; wp = this.path[this.pathIdx]; }
      else { this.moveSpeed = 0; this.path = null; return true; }
    }
    const dx = wp.x - this.position.x, dz = wp.z - this.position.z; const l = Math.hypot(dx, dz) || 1;
    const sp = speed * (this.limp ? 0.45 : 1);
    this.moveSpeed = sp;
    const delta = tmpA.set(dx / l * sp * dt, 0, dz / l * sp * dt);
    // separation from other agents
    for (const o of this.director.agents) {
      if (o === this || o.dead) continue;
      const ox = this.position.x - o.position.x, oz = this.position.z - o.position.z; const od = ox * ox + oz * oz;
      if (od < 0.7 && od > 1e-4) { const k = (0.84 - Math.sqrt(od)) * dt * 3; delta.x += ox * k; delta.z += oz * k; }
    }
    const before = this.position.clone();
    this.director.world.moveCylinder(this.position, delta, 0.32, 1.7, 0.5);
    this.position.y = this.director.world.groundHeight(this.position.x, this.position.z, this.position.y + 0.3, 0.6, 0);
    const moved = before.distanceTo(this.position);
    if (moved < sp * dt * 0.2) {
      this.stuckT = (this.stuckT || 0) + dt;
      if (this.stuckT > 1.0) { this.stuckT = 0; this.stuckN = (this.stuckN || 0) + 1; this.unstick(); }
    } else { this.stuckT = 0; if (moved > sp * dt * 0.6) this.stuckN = Math.max(0, (this.stuckN || 0) - dt * 0.5); }
    const yawTo = Math.atan2(dx, dz);
    if (!(this.target && this.actor.target.aim > 0.5)) this.yaw += angleDiff(this.yaw, yawTo) * Math.min(1, dt * 8);
    return false;
  }
  // stuck on a wall / door frame / prop: 1st re-plan, 2nd side-step, 3rd pop out to the nearest open cell
  unstick() {
    const w = this.director.world, goal = this.moveGoal;
    if (this.stuckN <= 1) { if (goal) this.setPath(goal); return; }
    if (this.stuckN === 2) {
      const a = Math.random() * Math.PI * 2; const side = this.position.clone().add(new THREE.Vector3(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6));
      const p = w.findPath(this.position, side); if (p && p.length > 1) { this.path = goal ? [...p, ...(w.findPath(side, goal) || [goal.clone()]).slice(1)] : p; this.pathIdx = 1; return; }
    }
    this.ensureOpen(true); this.stuckN = 0; if (goal) this.setPath(goal);
  }
  // inside a collider (or sealed in a tiny pocket): move to the nearest open walkable cell
  ensureOpen(force) {
    const w = this.director.world; if (!w.nav) return;
    const c = w.navCompAt(this.position.x, this.position.z);
    if (c && !(force && w.navCompSize(c) < 40)) { if (!force) return; }
    const p = w.nearestOpen(this.position, force ? 40 : 1, 8); if (!p) return;
    if (p.distanceTo(this.position) > 9) return;
    this.position.x = p.x; this.position.z = p.z; this.position.y = w.groundHeight(p.x, p.z, p.y + 0.5);
    this.actor.root.position.copy(this.position);
  }
  faceTowards(p, dt) { const yawTo = Math.atan2(p.x - this.position.x, p.z - this.position.z); this.yaw += angleDiff(this.yaw, yawTo) * Math.min(1, dt * 5); }

  // ---------- perception ----------
  hostiles() { return this.team === 'enemy' ? this.director.friendlyTargets() : this.director.enemies(); }
  canSee(t, range = this.visionRange) {
    if (!t || !t.alive) return false;
    const eye = this.eyePos(tmpA); const tp = t.isPlayer ? t.chestPos(tmpB) : t.chestPos(tmpB);
    const dist = eye.distanceTo(tp); if (dist > range) return false;
    return this.director.world.lineOfSight(eye, tp);
  }
  perceive(time) {
    // squadmates treat any nearby firefight as combat (wide scan, longer range)
    const alerted = this.state === 'combat' || (this.team === 'friendly' && this.director.enemies().some((e) => e.state === 'combat' && e.position.distanceTo(this.position) < 80));
    const range = this.visionRange * (alerted ? 1.6 : 1);
    let best = null, bestD = Infinity;
    for (const t of this.hostiles()) {
      if (!t.alive) continue;
      const dx = t.position.x - this.position.x, dz = t.position.z - this.position.z; const dist = Math.hypot(dx, dz);
      let r = range * (t.isPlayer && t.crouching ? 0.75 : 1) * (t.isPlayer && t.firingRecently ? 2.2 : 1);
      if (dist > r) continue;
      const yawTo = Math.atan2(dx, dz);
      const inFov = Math.abs(angleDiff(this.yaw, yawTo)) < (alerted ? 2.2 : 1.0) || dist < 4;
      if (!inFov) continue;
      if (!this.canSee(t, r)) continue;
      const score = dist * (t.isPlayer ? 0.8 : 1);
      if (score < bestD) { bestD = score; best = t; }
    }
    if (best) {
      if (!this.target || this.target !== best) this.seenTargetSince = time;
      const wasIdle = this.state !== 'combat';
      this.target = best; this.lastSeenPos = best.position.clone(); this.lastSeenT = time;
      if (this.team === 'enemy' && wasIdle) { this.state = 'combat'; this.director.alertSquad(this, best); events.emit('ai:spotted', { agent: this, target: best }); }
      else if (this.team === 'friendly') this.state = this.state === 'follow' ? 'follow' : this.state;
    } else if (this.target && (!this.target.alive || time - this.lastSeenT > 12)) {
      if (!this.target.alive) this.target = null;
    }
  }
  hearNoise(pos, radius, source) {
    if (this.dead || this.passive) return;
    if (this.position.distanceTo(pos) > radius) return;
    if (this.team === 'enemy' && this.state !== 'combat') { this.state = 'alert'; this.investigatePos = pos.clone(); this.alertT = 0; this.setPath(pos); }
  }

  // ---------- enemy brain ----------
  enemyBrain(dt, time) {
    const d = this.director;
    let desiredSpeed = 0, crouch = 0, aim = 0;
    if (this.state === 'idle') {
      if (this.patrol) {
        const p = this.patrol[this.patrolIdx];
        if (!this.path) this.setPath(p);
        if (this.followPath(dt, 1.4)) { this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length; this.path = null; this.waitT = rand(2, 5); }
        if (this.waitT > 0) { this.waitT -= dt; this.moveSpeed = 0; }
        desiredSpeed = this.moveSpeed;
      }
      return { desiredSpeed, crouch, aim: 0 };
    }
    if (this.state === 'alert') {
      this.alertT += dt; aim = 0.6;
      const arrived = this.followPath(dt, 2.0); desiredSpeed = this.moveSpeed;
      if (arrived || this.alertT > 15) { this.state = this.patrol ? 'idle' : 'idle'; this.path = null; }
      return { desiredSpeed, crouch, aim };
    }
    // combat
    if (this.target && !this.target.alive) { this.target = null; this.releaseToken(); }
    if (!this.target) { // pick any visible hostile next perception tick; meanwhile hold
      const near = this.hostiles().filter((h) => h.alive).sort((a, b) => a.position.distanceTo(this.position) - b.position.distanceTo(this.position))[0];
      if (near) { this.target = near; this.lastSeenPos = near.position.clone(); }
      else return { desiredSpeed: 0, crouch: 1, aim: 0.3 };
    }
    // stragglers: when only a couple of enemies are left in the fight they come for the player
    const left = d.enemiesInCombat();
    if (this.combatSince === undefined) this.combatSince = time;
    if (this.losT === undefined) this.losT = time;
    if (left <= 2 && this.target.isPlayer && time - this.combatSince > 6) { if (this.cover) { this.cover.occupant = null; this.cover = null; } return this.rushBrain(dt, time); }
    // pressure: a fighter that has had no line of fire for a while does not keep hiding behind the same
    // container — first it relocates to a spot it can shoot from (flanking around the obstacle), and if
    // that still gives nothing it pushes the target outright. Flankers/assaulters get impatient sooner.
    const blind = time - this.losT, patience = this.role === 'flanker' ? 6 : 9 + (this.id % 3) * 2;
    if (this.target.isPlayer && blind > patience * 2.4 && time - this.combatSince > 14) { if (this.cover) { this.cover.occupant = null; this.cover = null; } return this.rushBrain(dt, time); }
    if (blind > patience && !(this.pushUntil > time) && (this.coverPhase !== 'move' || !this.path)) {
      const spot = d.findFiringSpot(this, this.target);
      if (spot) { if (this.cover) { this.cover.occupant = null; this.cover = null; } this.setPath(spot); this.coverPhase = 'move'; this.pushUntil = time + 8; d.metrics.pushes = (d.metrics.pushes || 0) + 1; }
      else this.losT = time - patience * 1.6;                               // nowhere to shoot from: escalate to a rush sooner
      // flush a hidden target with a grenade on the way
      if (this.grenadeCD <= 0 && this.target.isPlayer && this.lastSeenPos) { const dist = this.position.distanceTo(this.lastSeenPos); if (dist > 8 && dist < 32 && Math.random() < 0.5) { this.grenadeCD = rand(16, 26); d.throwGrenade(this, this.lastSeenPos); this.actor.gesture('wave', 0.8); } }
    }
    // choose/validate cover
    this.coverCheckT = (this.coverCheckT ?? 0) - dt;
    if (this.coverCheckT <= 0) {
      this.coverCheckT = 1.0;
      const threat = this.lastSeenPos || this.target.position;
      const compromised = this.cover && !d.coverProtects(this.cover, threat);
      const tooLong = this.cycles >= (this.role === 'flanker' ? 2 : 4);
      if (!(this.pushUntil > time) && this.coverPhase !== 'engage' && (!this.cover || compromised || (tooLong && Math.random() < 0.6))) {
        const c = d.findCover(this, threat, { flank: this.role === 'flanker' && this.cycles > 0, advance: tooLong });
        if (c) { if (this.cover) this.cover.occupant = null; this.cover = c; c.occupant = this; this.setPath(c.pos); this.cycles = 0; this.coverPhase = 'move'; d.metrics.coverMoves++; }
      }
      // lost target for long: advance toward last seen position
      if (time - this.lastSeenT > 8 && this.lastSeenPos && !this.path) { if (this.cover) this.cover.occupant = null; this.cover = null; this.setPath(this.lastSeenPos); this.coverPhase = 'move'; this.lastSeenT = time - 4; }
    }
    if (this.coverPhase === 'move' && this.path) {
      const pushing = this.pushUntil > time;
      const arrived = this.followPath(dt, pushing ? 3.4 : 4.0); desiredSpeed = this.moveSpeed; aim = 0.3;
      // fire on the move occasionally if visible; a pushing fighter stops to shoot as soon as it has a line
      if (this.canSeeCached(time)) { aim = 1; if (pushing && !this.cover) { this.path = null; this.coverPhase = 'engage'; this.phaseT = rand(2.5, 4); return { desiredSpeed: 0, crouch: 0, aim: 1 }; } if (Math.random() < dt * 0.6) this.combatFire(dt, time, 0.5); }
      if (arrived) { this.coverPhase = this.cover ? 'hide' : 'engage'; this.phaseT = rand(0.6, 1.5); }
      return { desiredSpeed, crouch: 0, aim };
    }
    // in the open at a firing spot: shoot while there is a line, crouch when suppressed, then re-evaluate
    if (this.coverPhase === 'engage' && !this.cover) {
      this.phaseT -= dt; const see = this.canSeeCached(time);
      if (see) this.combatFire(dt, time);
      if (this.phaseT <= 0 || (!see && this.phaseT < 1.5)) { this.coverPhase = 'hide'; this.coverCheckT = 0; this.pushUntil = 0; }
      return { desiredSpeed: 0, crouch: this.suppression > 0.6 ? 1 : 0, aim: 1 };
    }
    // at cover: hide/peek cycle
    this.phaseT -= dt;
    if (this.coverPhase === 'hide' || this.coverPhase === 'move') {
      crouch = 1; aim = 0.2;
      if (this.phaseT <= 0) {
        if (d.requestToken(this)) { this.coverPhase = 'peek'; this.phaseT = rand(1.4, 3.0) * (1 - this.suppression * 0.5); this.burstLeft = 0; }
        else this.phaseT = rand(0.5, 1.2);
      }
      // grenade if target static
      if (this.grenadeCD <= 0 && this.target.isPlayer && d.playerCampTime > 7) {
        const dist = this.position.distanceTo(this.target.position);
        if (dist > 8 && dist < 30) { this.grenadeCD = rand(18, 30); d.throwGrenade(this, this.target.position); this.actor.gesture('wave', 0.8); }
      }
    } else if (this.coverPhase === 'peek') {
      crouch = this.cover && this.cover.low ? 0 : 0; aim = 1;
      if (this.cover && !this.cover.low) { // lean out from tall cover: side-step
        crouch = 0;
      }
      this.combatFire(dt, time);
      if (this.phaseT <= 0 || this.suppression > 0.8) {
        if (!this.canSeeCached(time)) this.blindPeeks = (this.blindPeeks || 0) + 1; else this.blindPeeks = 0;
        this.coverPhase = 'hide'; this.phaseT = rand(1.2, 2.8) + this.suppression * 2; this.cycles++; this.releaseToken();
        if (this.blindPeeks >= 2) { this.blindPeeks = 0; this.losT = Math.min(this.losT, time - 30); }   // this cover can't see anything: move now
      }
    }
    if (!this.cover) {
      // no usable cover: never stand still behind a wall — hunt the target until it is in sight
      if (this.canSeeCached(time)) { crouch = 0; aim = 1; this.combatFire(dt, time); }
      else { this.huntT = (this.huntT || 0) - dt; if (this.huntT <= 0 || !this.path) { this.huntT = 3; this.setPath(this.target.position); } this.followPath(dt, 3.6); desiredSpeed = this.moveSpeed; aim = 0.5; }
    }
    return { desiredSpeed, crouch, aim };
  }
  // last few enemies push the player instead of hiding (stragglers can't be left sitting in a building)
  rushBrain(dt, time) {
    const t = this.target; const see = this.canSeeCached(time);
    this.huntT = (this.huntT || 0) - dt;
    if (!see || this.position.distanceTo(t.position) > 18) {
      if (this.huntT <= 0 || !this.path) { this.huntT = 2.5; const off = new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6); this.setPath(t.position.clone().add(off)); }
      this.followPath(dt, see ? 2.4 : 4.0);
      if (see) { if (Math.random() < dt * 0.8) this.combatFire(dt, time, 0.6); return { desiredSpeed: this.moveSpeed, crouch: 0, aim: 1 }; }
      return { desiredSpeed: this.moveSpeed, crouch: 0, aim: 0.4 };
    }
    this.path = null; this.combatFire(dt, time);
    return { desiredSpeed: 0, crouch: this.suppression > 0.5 ? 1 : 0, aim: 1 };
  }
  canSeeCached(time) {
    if (this._seeT === undefined || time - this._seeT > 0.3) { this._seeT = time; this._see = this.target ? this.canSee(this.target, 200) : false; if (this._see) this.losT = time; }
    return this._see;
  }

  // ---------- friendly brain ----------
  friendlyBrain(dt, time) {
    const d = this.director;
    let desiredSpeed = 0, crouch = 0, aim = 0;
    const anchorPos = this.anchor ? (this.anchor.position ? this.anchor.position : this.anchor) : null;
    const enemiesNear = d.enemies().some((e) => e.alive && e.state === 'combat' && e.position.distanceTo(this.position) < 70);
    if (anchorPos) {
      // formation point relative to anchor heading
      let goal;
      if (this.leads && this.anchor.isPlayer) goal = this.leadGoal(time);
      else if (this.anchor.isPlayer) {
        const yaw = this.anchor.yaw ?? 0; const o = this.followOffset;
        goal = tmpB.set(anchorPos.x + Math.cos(yaw) * o.x + Math.sin(yaw) * o.z, 0, anchorPos.z - Math.sin(yaw) * o.x + Math.cos(yaw) * o.z).clone();
      } else if (this.anchor.actor && this.anchor.yaw !== undefined) {
        // following a squadmate (the leader): offset in the leader's frame (agents face +Z at yaw 0); x = side, z = behind
        const y = this.anchor.yaw, o = this.followOffset;
        goal = new THREE.Vector3(anchorPos.x + Math.cos(y) * o.x - Math.sin(y) * o.z, 0, anchorPos.z - Math.sin(y) * o.x - Math.cos(y) * o.z);
      } else goal = anchorPos.clone().add(this.followOffset);
      if (enemiesNear && this.target) {
        // take cover near goal facing threat
        this.coverCheckT = (this.coverCheckT ?? 0) - dt;
        if (this.coverCheckT <= 0) {
          this.coverCheckT = 1.5;
          if (!this.cover || this.cover.pos.distanceTo(goal) > 10 || !d.coverProtects(this.cover, this.target.position)) {
            const c = d.findCover(this, this.target.position, { near: goal, radius: 10 });
            if (c && c !== this.cover) { if (this.cover) this.cover.occupant = null; this.cover = c; c.occupant = this; this.setPath(c.pos); }
          }
        }
        if (this.path) { this.followPath(dt, 4.0); desiredSpeed = this.moveSpeed; aim = 0.5; }
        else {
          this.phaseT -= dt;
          if (this.phaseT <= 0) { this.coverPhase = this.coverPhase === 'peek' ? 'hide' : 'peek'; this.phaseT = this.coverPhase === 'peek' ? rand(2, 4) : rand(0.8, 1.8); }
          if (this.coverPhase === 'peek') { aim = 1; crouch = this.cover?.low ? 0 : 0; this.combatFire(dt, time); } else { crouch = 1; aim = 0.4; }
        }
      } else {
        if (this.cover) { this.cover.occupant = null; this.cover = null; }
        const dist = Math.hypot(goal.x - this.position.x, goal.z - this.position.z);
        if (dist > 2.2) {
          if (!this.path || this.repathT <= 0 || (this.moveGoal && this.moveGoal.distanceTo(goal) > 3)) this.setPath(goal);
          const fast = dist > 7 || (this.anchor.isPlayer && this.anchor.sprinting);
          this.followPath(dt, fast ? 4.4 : 1.9, 1.2); desiredSpeed = this.moveSpeed;
        } else { this.path = null; }
        crouch = this.anchor.isPlayer && this.anchor.crouching ? 1 : 0;
        aim = enemiesNear ? 0.6 : 0;
      }
    }
    return { desiredSpeed, crouch, aim };
  }

  // Squad leader: walks ahead of the player toward the current objective along the nav path and waits
  // there if the player lags — so the sergeant leads and the private follows, not the other way round.
  leadGoal(time) {
    const d = this.director, p = this.anchor.position;
    if (this._leadT !== undefined && time - this._leadT < 0.8 && this._leadGoal) return this._leadGoal;
    this._leadT = time;
    const target = d.objectiveTarget?.();
    let goal = null;
    if (target && Math.hypot(target.x - p.x, target.z - p.z) > 7) {
      const path = d.world.findPath(p, target, 20000);
      if (path && path.length > 1) {
        let left = 7.5; let prev = path[0]; goal = path[path.length - 1].clone();
        for (let i = 1; i < path.length; i++) { const seg = prev.distanceTo(path[i]); if (seg >= left) { goal = prev.clone().lerp(path[i], left / seg); break; } left -= seg; prev = path[i]; }
        if (goal.distanceTo(target) < 2.5) goal = target.clone().lerp(p, 2.5 / Math.max(2.5, target.distanceTo(p)));
      }
    }
    if (!goal) { const yaw = this.anchor.yaw ?? 0; goal = new THREE.Vector3(p.x - Math.sin(yaw) * 4 - Math.cos(yaw) * 1.2, 0, p.z - Math.cos(yaw) * 4 + Math.sin(yaw) * 1.2); }
    goal.y = 0; this._leadGoal = goal; return goal;
  }

  // ---------- shooting ----------
  combatFire(dt, time, rateMul = 1) {
    if (!this.target || !this.target.alive || this.passive) return;
    this.shotT -= dt;
    if (this.shotT > 0) return;
    if (!this.canSeeCached(time)) { this.shotT = 0.3; return; }
    if (this.burstLeft <= 0) { this.burstLeft = Math.floor(rand(2, 6)); this.shotT = rand(0.35, 0.9) / rateMul; return; }
    this.burstLeft--; this.shotT = 0.11;
    this.director.npcShoot(this, this.target, time);
  }
}

// =================================================================
export class AIDirector {
  constructor({ scene, world, effects, audio, combat }) {
    this.scene = scene; this.world = world; this.effects = effects; this.audio = audio; this.combat = combat;
    this.agents = []; this.vehicles = []; this.covers = []; this.tokens = 0; this.visionRange = 45;
    this.player = null; this.playerCampTime = 0; this.lastPlayerPos = new THREE.Vector3();
    this.grenades = [];
    this.time = 0;
    this.metrics = { shots: { enemy: 0, friendly: 0 }, hits: { enemy: 0, friendly: 0 }, coverMoves: 0, grenades: 0 };
  }
  get diff() { return DIFFICULTY[settings.data.gameplay.difficulty] || DIFFICULTY.regular; }
  spawn(opts) { const a = new AIAgent(this, opts); this.agents.push(a); return a; }
  remove(agent) { agent.actor.dispose(this.scene); agent.releaseToken(); if (agent.cover) agent.cover.occupant = null; this.agents = this.agents.filter((a) => a !== agent); }
  enemies() { return this.agents.filter((a) => a.team === 'enemy' && !a.dead); }
  friendlies() { return this.agents.filter((a) => a.team === 'friendly' && !a.dead); }
  friendlyTargets() { const f = this.friendlies(); if (this.player && this.player.alive) f.push(this.player); return f; }
  listenerDist(p) { return this.player ? this.player.position.distanceTo(p) : 0; }
  requestToken(agent) {
    if (!agent.target?.isPlayer) return true;
    if (agent.hasToken) return true;
    if (this.tokens < this.diff.tokens) { this.tokens++; agent.hasToken = true; return true; }
    return false;
  }
  // the last few enemies of a fight are marked on the HUD once the player has gone a while without finding them
  stragglers() {
    if (this._strT === this.time) return this._str; this._strT = this.time;
    const alive = this.agents.filter((a) => a.team === 'enemy' && !a.dead && !a.passive && !a.invisible);
    const fighting = alive.filter((a) => a.state === 'combat');
    const quiet = this.time - (this.lastEnemyDeath ?? -1e9);
    this._str = fighting.length && alive.length <= 3 && (quiet > 10 || alive.length === 1) ? fighting : [];
    return this._str;
  }
  enemiesInCombat() { if (this._eicT !== this.time) { this._eicT = this.time; let n = 0, all = 0; for (const a of this.agents) if (a.team === 'enemy' && !a.dead && !a.passive) { all++; if (a.state === 'combat') n++; } this._eic = all; } return this._eic; }
  alertSquad(agent, target) {
    for (const o of this.agents) if (o.team === agent.team && !o.dead && o !== agent && o.position.distanceTo(agent.position) < 35 && o.state !== 'combat' && !o.passive) {
      o.state = 'combat'; o.target = target; o.lastSeenPos = target.position.clone(); o.lastSeenT = this.time - 2;
    }
    // assign a flanker in this group
    const group = this.agents.filter((o) => o.team === 'enemy' && !o.dead && o.state === 'combat');
    if (group.length >= 3 && !group.some((g) => g.role === 'flanker')) group[Math.floor(Math.random() * group.length)].role = 'flanker';
  }
  noise(pos, radius, source) { this.lastFire = { pos: pos.clone(), t: this.time }; for (const a of this.agents) if (a.team === 'enemy') a.hearNoise(pos, radius, source); }
  recentFire(p, range = 35, within = 3) { return this.lastFire && this.time - this.lastFire.t < within && this.lastFire.pos.distanceTo(p) < range; }

  // ----- cover -----
  buildCovers() {
    this.covers = [];
    const seen = new Set();
    for (const c of this.world.colliders) {
      if (!c.cover) continue;
      const h = c.max.y - this.world.heightFn((c.min.x + c.max.x) / 2, (c.min.z + c.max.z) / 2);
      if (h < 0.7 || (c.max.x - c.min.x) * (c.max.z - c.min.z) < 0.15) continue;
      const low = h < 1.55;
      const edges = [
        { ax: c.min.x, az: c.min.z - 0.55, bx: c.max.x, bz: c.min.z - 0.55, nx: 0, nz: 1 },
        { ax: c.min.x, az: c.max.z + 0.55, bx: c.max.x, bz: c.max.z + 0.55, nx: 0, nz: -1 },
        { ax: c.min.x - 0.55, az: c.min.z, bx: c.min.x - 0.55, bz: c.max.z, nx: 1, nz: 0 },
        { ax: c.max.x + 0.55, az: c.min.z, bx: c.max.x + 0.55, bz: c.max.z, nx: -1, nz: 0 },
      ];
      for (const e of edges) {
        const len = Math.hypot(e.bx - e.ax, e.bz - e.az); const n = Math.max(1, Math.floor(len / 1.4));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n; const x = e.ax + (e.bx - e.ax) * t, z = e.az + (e.bz - e.az) * t;
          const key = `${Math.round(x * 2)},${Math.round(z * 2)}`; if (seen.has(key)) continue; seen.add(key);
          const y = this.world.groundHeight(x, z, c.max.y);
          if (y > c.max.y - 0.6) continue; // on top of something
          // must be standable (not inside another collider)
          let blocked = false; for (const o of this.world.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3)) if (x > o.min.x - 0.25 && x < o.max.x + 0.25 && z > o.min.z - 0.25 && z < o.max.z + 0.25 && o.max.y > y + 0.5 && o.min.y < y + 1.6) { blocked = true; break; }
          if (blocked) continue;
          this.covers.push({ pos: new THREE.Vector3(x, y, z), normal: new THREE.Vector3(e.nx, 0, e.nz), low, occupant: null, collider: c });
        }
      }
    }
    return this.covers;
  }
  coverProtects(cover, threat) {
    const dir = tmpA.copy(threat).sub(cover.pos).setY(0); const dist = dir.length(); dir.normalize();
    if (cover.normal.dot(dir) > -0.25) return false; // threat must be on the far side
    const eye = tmpB.copy(cover.pos).setY(cover.pos.y + 0.9);
    const t = tmpC.copy(threat).setY(threat.y + 1.4);
    return !this.world.lineOfSight(eye, t) || dist < 2;
  }
  // a standable spot (own nav component, not taken) from which the agent can see and shoot the target:
  // rings around the target, nearest-to-agent first, preferring spots off the agent's current bearing (flank)
  findFiringSpot(agent, target) {
    const w = this.world; if (!w.nav) return null;
    const myComp = w.navCompAt(agent.position.x, agent.position.z); const tp = target.chestPos(new THREE.Vector3());
    const base = Math.atan2(agent.position.x - tp.x, agent.position.z - tp.z); let best = null, bestS = Infinity; let tests = 0;
    const eye = new THREE.Vector3();
    for (const r of [9, 14, 20, 27]) for (let i = 0; i < 14; i++) {
      const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 7);
      const x = tp.x + Math.sin(a) * r, z = tp.z + Math.cos(a) * r;
      const [ci, cj] = w.navCell(x, z); if (!w.navFree(ci, cj)) continue;
      if (myComp && w.navCompAt(x, z) !== myComp) continue;
      if (this.agents.some((o) => o !== agent && !o.dead && o.position.distanceToSquared(eye.set(x, o.position.y, z)) < 2.5)) continue;
      const y = w.groundHeight(x, z, tp.y + 2); if (Math.abs(y - agent.position.y) > 4) continue;
      if (++tests > 40) break;
      if (!w.lineOfSight(eye.set(x, y + 1.55, z), tp)) continue;
      const s = Math.hypot(x - agent.position.x, z - agent.position.z) + Math.abs(angleDiff(base, a)) * -2 + r * 0.3;
      if (s < bestS) { bestS = s; best = new THREE.Vector3(x, y, z); }
    }
    return best;
  }
  findCover(agent, threat, { flank = false, advance = false, near = null, radius = 30 } = {}) {
    const origin = near || agent.position;
    let best = null, bestScore = -Infinity; let checks = 0;
    const tDist = agent.position.distanceTo(threat);
    const w = this.world; const myComp = w.nav ? w.navCompAt(agent.position.x, agent.position.z) : 0;
    const cands = this.covers.filter((c) => (!c.occupant || c.occupant === agent) && c.pos.distanceTo(origin) < radius && (!myComp || w.navCompAt(c.pos.x, c.pos.z) === myComp)).sort((a, b) => a.pos.distanceTo(origin) - b.pos.distanceTo(origin)).slice(0, 26);
    for (const c of cands) {
      const d = c.pos.distanceTo(threat); if (d < 6) continue;
      if (++checks > 26) break;
      if (!this.coverProtects(c, threat)) continue;
      let score = -c.pos.distanceTo(origin) * 0.6;
      score -= Math.abs(d - (advance ? Math.max(10, tDist - 10) : 20)) * 0.4;
      if (flank) { const a0 = Math.atan2(agent.position.x - threat.x, agent.position.z - threat.z), a1 = Math.atan2(c.pos.x - threat.x, c.pos.z - threat.z); score += Math.abs(angleDiff(a0, a1)) * 8; }
      // can we shoot from it? (peek LOS)
      const peek = tmpB.copy(c.pos).setY(c.pos.y + (c.low ? 1.5 : 1.5)); if (!c.low) peek.addScaledVector(new THREE.Vector3(-c.normal.z, 0, c.normal.x), 0.7);
      if (this.world.lineOfSight(peek, tmpC.copy(threat).setY(threat.y + 1.3))) score += 6;
      // spread out from squadmates
      for (const o of this.agents) if (o !== agent && !o.dead && o.team === agent.team && o.cover) if (o.cover.pos.distanceTo(c.pos) < 3) score -= 6;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  // ----- NPC weapons (abstract hit model) -----
  npcShoot(shooter, target, time) {
    const muzzle = shooter.actor.muzzleWorld(new THREE.Vector3());
    const aimPt = target.chestPos(new THREE.Vector3());
    const dist = muzzle.distanceTo(aimPt);
    shooter.actor.fireKick(); this.metrics.shots[shooter.team]++; this.lastFire = { pos: muzzle.clone(), t: time };
    if (shooter.team === 'enemy') for (const f of this.agents) {
      if (f.team !== 'friendly' || f.dead || f.passive || (f.target && f.target.alive)) continue;
      if (f.position.distanceTo(shooter.position) < 90 && f.canSee(shooter, 120)) { f.target = shooter; f.lastSeenPos = shooter.position.clone(); f.lastSeenT = time; }
    }
    this.effects.muzzleFlash(muzzle, aimPt.clone().sub(muzzle).normalize());
    this.audio.shot(muzzle, { enemy: shooter.team === 'enemy' });
    let hitChance;
    if (target.isPlayer) {
      const df = this.diff;
      const distF = Math.max(0.25, Math.min(1.2, 12 / Math.max(4, dist)));
      const stance = (target.crouching ? 0.7 : 1) * (target.speed > 3.5 ? 0.6 : target.speed > 1 ? 0.85 : 1);
      const ramp = Math.min(1, (time - shooter.seenTargetSince) / 1.8 / df.reaction + 0.15);
      hitChance = df.hitChance * distF * stance * ramp * (1 - shooter.suppression * 0.6) * shooter.accuracy;
    } else hitChance = 0.22 * Math.max(0.3, Math.min(1, 15 / dist)) * shooter.accuracy * (1 - shooter.suppression * 0.5);
    const hit = Math.random() < hitChance;
    const dir = aimPt.clone().sub(muzzle).normalize();
    if (!hit) {
      // miss: deflect, find impact
      const spread = 0.025 + Math.min(0.06, dist * 0.0012);
      dir.x += (Math.random() - 0.5) * spread * 2; dir.y += (Math.random() - 0.3) * spread * 2; dir.z += (Math.random() - 0.5) * spread * 2; dir.normalize();
    }
    const wh = this.world.raycast(muzzle, dir, Math.min(dist + 30, 250), { ignore: (c) => c.passBullets });
    const endDist = hit ? dist : (wh ? wh.dist : dist + 30);
    if (hit && wh && wh.dist < dist - 0.5) { // blocked by cover
      this.effects.impact(wh.point, wh.normal, wh.surface); if (this.listenerDist(wh.point) < 30) this.audio.bulletImpact(wh.point, wh.surface);
      this.effects.tracer(muzzle, wh.point);
      if (target.isPlayer) target.nearMiss?.(wh.point);
      return;
    }
    const end = muzzle.clone().addScaledVector(dir, endDist);
    this.effects.tracer(muzzle, end);
    if (hit) {
      this.metrics.hits[shooter.team]++;
      if (target.isPlayer) target.takeDamage(this.diff.damage, muzzle, shooter);
      else { const killed = target.takeDamage(30, muzzle, 'chest', shooter); this.effects.hitPuff(end); if (killed) events.emit('ai:kill', { by: shooter, victim: target }); }
    } else {
      if (wh) { this.effects.impact(wh.point, wh.normal, wh.surface); if (this.listenerDist(wh.point) < 30) this.audio.bulletImpact(wh.point, wh.surface); }
      if (target.isPlayer) {
        // near-miss crack + suppression feedback if bullet passed near the player
        const cp = target.chestPos(new THREE.Vector3()); const toP = cp.clone().sub(muzzle); const along = toP.dot(dir);
        if (along > 0 && along < endDist + 1) { const closest = muzzle.clone().addScaledVector(dir, along); if (closest.distanceTo(cp) < 2.5) target.nearMiss?.(closest); }
      }
    }
  }

  throwGrenade(agent, targetPos) {
    const from = agent.chestPos(new THREE.Vector3()).add(new THREE.Vector3(0, 0.4, 0));
    const to = targetPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
    const flight = 1.3;
    const v = to.clone().sub(from).divideScalar(flight); v.y = (to.y - from.y) / flight + 0.5 * 18 * flight;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3a4030, roughness: 0.6 }));
    mesh.position.copy(from); mesh.castShadow = true; this.scene.add(mesh);
    const g = { mesh, v, fuse: 3.2, enemy: agent.team === 'enemy' };
    this.grenades.push(g); this.metrics.grenades++;
    events.emit('grenade:thrown', g);
    return g;
  }
  updateGrenades(dt) {
    for (const g of this.grenades) {
      g.fuse -= dt;
      const p = g.mesh.position; const gy = this.world.groundHeight(p.x, p.z, p.y + 0.2);
      if (p.y > gy + 0.06 || g.v.y > 0) {
        g.v.y -= 18 * dt; const step = g.v.clone().multiplyScalar(dt);
        const hit = this.world.raycast(p, step.clone().normalize(), step.length() + 0.05, { noTerrain: true });
        if (hit) { if (Math.abs(hit.normal.y) > 0.5) g.v.y *= -0.3; else { if (hit.normal.x) g.v.x *= -0.4; if (hit.normal.z) g.v.z *= -0.4; } g.v.multiplyScalar(0.6); }
        else p.add(step);
      } else { p.y = gy + 0.06; g.v.multiplyScalar(Math.max(0, 1 - dt * 6)); g.v.y = 0; p.x += g.v.x * dt; p.z += g.v.z * dt; }
      if (g.fuse <= 0) { this.scene.remove(g.mesh); g.dead = true; this.combat.explode(p.clone(), { radius: 7, damage: 120, owner: g.enemy ? 'enemy' : 'player', kind: 'grenade' }); }
    }
    this.grenades = this.grenades.filter((g) => !g.dead);
  }

  update(dt, time) {
    this.time = time;
    if (this.player) {
      if (this.player.position.distanceTo(this.lastPlayerPos) < 2.5) this.playerCampTime += dt; else { this.playerCampTime = 0; this.lastPlayerPos.copy(this.player.position); }
    }
    // LOD: far agents tick at lower rate
    for (const a of this.agents) {
      const far = this.player && a.position.distanceTo(this.player.position) > 90 && a.state !== 'combat' && !a.script;
      if (far) { a._acc = (a._acc || 0) + dt; if (a._acc < 0.2) continue; a.update(a._acc, time); a._acc = 0; }
      else a.update(dt, time);
    }
    this.updateGrenades(dt);
  }
  clear() { for (const a of this.agents) a.actor.dispose(this.scene); this.agents = []; this.vehicles = []; this.covers = []; this.tokens = 0; for (const g of this.grenades) this.scene.remove(g.mesh); this.grenades = []; }
}
