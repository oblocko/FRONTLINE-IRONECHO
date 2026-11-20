// Small quadcopter drones (fictional, gameplay-abstracted).
//  mode 'recon'    : orbits a point; while it sees the player it reports their
//                    position (mission scripts can hook onSpot)
//  mode 'kamikaze' : approaches, then dives at its target and detonates
// Implements the vehicle interface used by Combat (rayTest/damage/position/radius).
import * as THREE from 'three';
import { events } from '../core/Events.js';

function buildDrone() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x3a3d38, metalness: 0.3, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.36), body); g.add(b);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 10), dark); pod.rotation.x = Math.PI / 2; pod.position.set(0, -0.08, 0.06); g.add(pod);
  const rotors = [];
  for (const [x, z] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.34), dark); arm.position.set(x / 2, 0.02, z / 2); arm.rotation.y = Math.atan2(x, z); g.add(arm);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.005, 16), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.35, depthWrite: false })); r.position.set(x, 0.05, z); g.add(r); rotors.push(r);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false })); led.position.set(0, 0.0, -0.19); g.add(led);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(1.6);
  return { g, rotors, led };
}

export class Drone {
  constructor(game, { pos, mode = 'kamikaze', target = null, hp = 30, speed = 14, orbit = null, delay = 0 } = {}) {
    this.game = game; this.isVehicle = true; this.mode = mode; this.hp = hp; this.dead = false; this.radius = 0.6;
    const m = buildDrone(); this.root = m.g; this.rotors = m.rotors; this.led = m.led;
    this.root.position.copy(pos); game.renderer.scene.add(this.root); this.position = this.root.position;
    this.vel = new THREE.Vector3(); this.speed = speed; this.target = target; this.orbit = orbit; this.t = Math.random() * 10; this.delay = delay;
    this.state = 'approach'; this.buzz = game.audio.droneLoop?.(); this.spotT = 0;
    game.director.vehicles.push(this);
  }
  targetPos() {
    const t = this.target || this.game.player;
    if (t.isPlayer) return t.chestPos(new THREE.Vector3());
    return (t.position || t).clone().add(new THREE.Vector3(0, t.aimHeight ?? 1.5, 0));
  }
  rayTest(origin, dir, maxDist) {
    const oc = origin.clone().sub(this.position); const b = oc.dot(dir); const c = oc.lengthSq() - this.radius * this.radius; const disc = b * b - c;
    if (disc < 0) return null; const t = -b - Math.sqrt(disc); if (t < 0 || t > maxDist) return null;
    return { dist: t, point: origin.clone().addScaledVector(dir, t) };
  }
  damage(amount) {
    if (this.dead) return false; this.hp -= amount;
    if (this.hp <= 0) { this.crash(); return true; }
    return false;
  }
  crash() {
    this.dead = true; this.falling = true; this.buzz?.stop();
    this.vel.set((Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4); this.spin = (Math.random() - 0.5) * 20;
    this.game.effects.impact(this.position.clone(), new THREE.Vector3(0, 1, 0), 'metal');
    events.emit('drone:down', { drone: this });
  }
  detonate() {
    const g = this.game; this.dead = true; this.buzz?.stop();
    g.combat.explode(this.position.clone(), { radius: 4.5, damage: 70, owner: 'enemy', scale: 0.7 });
    if (this.target && !this.target.isPlayer && this.target.damage) this.target.damage(this.payload ?? 120, this.position);
    g.renderer.scene.remove(this.root); this.removed = true;
    events.emit('drone:detonated', { drone: this, target: this.target });
  }
  update(dt) {
    const g = this.game;
    if (this.removed) return;
    for (const r of this.rotors) r.rotation.y += dt * (this.falling ? 5 : 60);
    if (this.falling) {
      this.vel.y -= 14 * dt; this.position.addScaledVector(this.vel, dt); this.root.rotation.y += this.spin * dt; this.root.rotation.z += dt * 3;
      if (this.position.y <= g.world.groundHeight(this.position.x, this.position.z, this.position.y + 0.5) + 0.2) {
        g.combat.explode(this.position.clone(), { radius: 2.5, damage: 40, owner: 'player', scale: 0.35, playerSafe: g.player.position.distanceTo(this.position) > 4 });
        g.renderer.scene.remove(this.root); this.removed = true;
      }
      return;
    }
    if (this.delay > 0) { this.delay -= dt; return; }
    this.t += dt; this.led.visible = Math.sin(this.t * 10) > 0;
    this.buzz?.setPos(this.position);
    const tp = this.targetPos(); const to = tp.clone().sub(this.position); const dist = to.length();
    let desired;
    if (this.mode === 'recon') {
      const c = this.orbit || tp; const ang = this.t * 0.35;
      desired = new THREE.Vector3(c.x + Math.cos(ang) * 25, (c.y ?? 0) + 28, c.z + Math.sin(ang) * 25).sub(this.position).clampLength(0, this.speed * 0.5);
      this.spotT -= dt;
      if (this.spotT <= 0 && g.world.lineOfSight(this.position, g.player.eyePos(new THREE.Vector3()))) { this.spotT = 6; this.onSpot?.(g.player.position.clone()); }
    } else if (this.state === 'approach') {
      // close in at altitude, slight weave, then commit to the dive
      const hover = tp.clone().add(new THREE.Vector3(Math.sin(this.t * 1.7) * 6, 14, Math.cos(this.t * 1.3) * 6));
      desired = hover.sub(this.position).clampLength(0, this.speed);
      if (dist < 26) { this.state = 'dive'; g.audio.whiz?.(this.position); }
    } else {
      desired = to.clone().normalize().multiplyScalar(this.speed * 1.5);
      if (dist < 1.6) { this.detonate(); return; }
    }
    this.vel.lerp(desired, Math.min(1, dt * (this.state === 'dive' ? 4 : 1.8)));
    this.position.addScaledVector(this.vel, dt);
    const floor = g.world.groundHeight(this.position.x, this.position.z, this.position.y + 1) + 1.2;
    if (this.position.y < floor && this.state !== 'dive') this.position.y = floor;
    if (this.state === 'dive' && this.position.y < floor - 0.9) { this.detonate(); return; }
    this.root.rotation.set(-this.vel.z * 0.02, Math.atan2(this.vel.x, this.vel.z), this.vel.x * 0.02);
  }
  remove() { this.buzz?.stop(); if (!this.removed) this.game.renderer.scene.remove(this.root); this.removed = true; }
}
