// Combat resolution: player hitscan vs. characters & world, explosions
// (area damage with cover occlusion), friendly-fire handling, kill/hit feedback.
import * as THREE from 'three';
import { events } from '../core/Events.js';

export class Combat {
  constructor({ world, effects, audio }) { this.world = world; this.effects = effects; this.audio = audio; this.director = null; this.player = null; this.stats = { kills: 0, headshots: 0 }; }

  playerShot(origin, dir, def, muzzle) {
    const range = def.range;
    // nearest character hit
    let agentHit = null, agentT = range;
    for (const a of this.director.agents) {
      if (a.dead) continue;
      const h = a.actor.rayTest(origin, dir, agentT);
      if (h && h.dist < agentT) { agentT = h.dist; agentHit = { agent: a, ...h }; }
    }
    // vehicles (armoured targets) block and absorb rounds
    let vehHit = null;
    for (const v of this.director.vehicles || []) {
      if (v.dead) continue; const h = v.rayTest(origin, dir, agentT);
      if (h && h.dist < agentT) { agentT = h.dist; vehHit = { v, ...h }; agentHit = null; }
    }
    let wh = this.world.raycast(origin, dir, agentT, { ignore: (c) => c.passBullets || c.owner?.isVehicle });
    // glass (seeThrough colliders) breaks and the round carries on
    if (wh?.collider?.seeThrough) { wh.collider.onHit?.(wh); wh = this.world.raycast(origin, dir, agentT, { ignore: (c) => c.passBullets || c.seeThrough || c.owner?.isVehicle }); }
    if (vehHit && !wh) {
      this.effects.tracer(muzzle, vehHit.point, 500);
      this.effects.impact(vehHit.point, dir.clone().negate(), 'metal'); this.audio.bulletImpact(vehHit.point, 'metal');
      const killed = vehHit.v.damage(def.vehicleDamage ?? def.damage * 0.15, origin, this.player);
      events.emit('hud:hitmarker', { kill: killed }); if (def.explosive) this.explode(vehHit.point, def.explosive);
      return { hitVehicle: true, killed };
    }
    const end = wh ? wh.point : agentHit ? agentHit.point : origin.clone().addScaledVector(dir, range);
    this.effects.tracer(muzzle, end, 500);
    // suppress enemies near the bullet path
    for (const a of this.director.agents) {
      if (a.dead || a.team !== 'enemy') continue;
      const to = a.chestPos(new THREE.Vector3()).sub(origin); const along = to.dot(dir);
      if (along < 0 || along > (wh ? wh.dist : agentT)) continue;
      const perp = to.clone().addScaledVector(dir, -along).length(); if (perp < 2.0) a.suppress(0.25);
    }
    this.director.noise(origin, 85, 'player');
    if (wh) {
      this.effects.impact(wh.point, wh.normal, wh.surface); this.audio.bulletImpact(wh.point, wh.surface);
      if (def.explosive) this.explode(wh.point, def.explosive);
      if (wh.collider?.onHit) wh.collider.onHit(wh);
      return { hitWorld: true };
    }
    if (agentHit) {
      const a = agentHit.agent;
      if (def.explosive) { this.effects.tracer(muzzle, agentHit.point, 500); this.explode(agentHit.point, def.explosive); return { hitAgent: true }; }
      if (a.team === 'friendly') { events.emit('player:friendlyFire', { agent: a }); this.effects.hitPuff(agentHit.point); a.actor.flinch(); return {}; }
      const dmg = def.damage * (agentHit.part === 'head' ? def.headMult : agentHit.mult);
      this.effects.hitPuff(agentHit.point);
      this.audio.bulletImpact(agentHit.point, 'flesh');
      const killed = a.takeDamage(dmg, origin, agentHit.part, this.player);
      this.audio.hitMarker(killed);
      events.emit('hud:hitmarker', { kill: killed, head: agentHit.part === 'head' });
      if (killed) { this.stats.kills++; if (agentHit.part === 'head') this.stats.headshots++; events.emit('player:kill', { agent: a, head: agentHit.part === 'head' }); }
      // alert victim's squad
      if (!a.dead && a.state !== 'combat') { a.state = 'combat'; a.target = this.player; a.lastSeenPos = this.player.position.clone(); this.director.alertSquad(a, this.player); }
      return { hitAgent: true, killed };
    }
    return {};
  }

  // Area damage. Cover occlusion: line of sight from blast to target chest.
  explode(pos, { radius = 7, damage = 120, owner = 'world', shake = 1, scale = 1, playerSafe = false, snow = false, kind = 'blast', label = null, heavy = false } = {}) {
    this.effects.explosion(pos, scale, { snow });
    this.audio.explosion(pos, scale);
    events.emit('combat:explosion', { pos: pos.clone(), radius, damage, heavy, owner, kind });
    const p = this.player;
    if (p) {
      const d = p.position.distanceTo(pos);
      p.addShake(Math.max(0, 1 - d / (radius * 5)) * shake);
      if (d < radius * 4) events.emit('fx:blast', { intensity: Math.max(0, 1 - d / (radius * 4)) });
      if (!playerSafe && d < radius && this.world.lineOfSight(pos.clone().setY(pos.y + 0.5), p.chestPos(new THREE.Vector3()))) {
        p.takeDamage(damage * Math.pow(1 - d / radius, 1.4), pos, owner, { kind, label });
      }
    }
    for (const a of this.director.agents) {
      if (a.dead) continue;
      const d = a.position.distanceTo(pos); if (d > radius) continue;
      // heavy shells (artillery / naval) reach behind sandbags and through thin cover close to the burst
      if (!(heavy && d < radius * 0.7) && !this.world.lineOfSight(pos.clone().setY(pos.y + 0.5), a.chestPos(new THREE.Vector3()))) continue;
      a.suppress(1);
      if (a.team === 'enemy') { const killed = a.takeDamage(damage * (1 - d / radius) * 1.3, pos, 'chest', owner === 'player' ? p : null); if (killed && owner === 'player') { this.stats.kills++; events.emit('player:kill', { agent: a }); events.emit('hud:hitmarker', { kill: true }); } }
    }
    for (const v of this.director.vehicles || []) {
      if (v.dead) continue; const d = v.position.distanceTo(pos);
      if (d < radius + v.radius) v.damage(damage * 0.8 * (1 - Math.max(0, d - v.radius) / radius), pos, owner === 'player' ? p : null);
    }
    this.director.noise(pos, 120, 'explosion');
  }
}
