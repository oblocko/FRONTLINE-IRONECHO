// Enemy inflatable assault boat crossing a river. Carries a crew of three that
// fires wildly from the boat and, if the boat makes it to the far bank, jumps
// out as regular AI infantry. Rifle fire and explosives sink it.
// Implements the vehicle interface used by Combat (rayTest/damage/position/radius).
import * as THREE from 'three';
import { events } from '../core/Events.js';

let MATS = null;
function mats() {
  return MATS ||= {
    tube: new THREE.MeshStandardMaterial({ color: 0x2e3328, roughness: 0.55, metalness: 0.05 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x1d1f1b, roughness: 0.8 }),
    motor: new THREE.MeshStandardMaterial({ color: 0x232425, roughness: 0.4, metalness: 0.5 }),
    crew: new THREE.MeshStandardMaterial({ color: 0x3d4234, roughness: 0.85 }),
    helm: new THREE.MeshStandardMaterial({ color: 0x343a2c, roughness: 0.6 }),
    wake: new THREE.MeshBasicMaterial({ color: 0xb8c4c8, transparent: true, opacity: 0.35, depthWrite: false }),
  };
}
function buildBoat() {
  const M = mats(); const g = new THREE.Group(); g.userData.dynamic = true;
  for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 3.6, 4, 10), M.tube); t.rotation.x = Math.PI / 2; t.position.set(s * 0.75, 0.25, 0); t.castShadow = true; g.add(t); }
  const bow = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.tube); bow.scale.set(2.1, 0.6, 1.2); bow.position.set(0, 0.22, 2.0); g.add(bow);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 3.8), M.floor); floor.position.y = 0.05; g.add(floor);
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.4), M.motor); motor.position.set(0, 0.55, -2.1); g.add(motor);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), M.motor); shaft.position.set(0, 0.0, -2.2); g.add(shaft);
  const crew = [];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Group(); c.position.set(i === 1 ? 0.35 : -0.35, 0.1, 1.0 - i * 1.0); g.add(c);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.32), M.crew); body.position.y = 0.42; c.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), M.helm); head.scale.y = 0.85; head.position.y = 0.86; c.add(head);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.8), M.motor); gun.position.set(0.16, 0.58, 0.35); c.add(gun);
    c.traverse((o) => { if (o.isMesh) o.castShadow = true; }); crew.push(c);
  }
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 5), M.wake); wake.rotation.x = -Math.PI / 2; wake.position.set(0, 0.02, -4); g.add(wake);
  return { g, crew, wake };
}

export class EnemyBoat {
  constructor(game, { from, to, speed = 3.6, hp = 150, water = 0, delay = 0, onLand = null } = {}) {
    this.game = game; this.isVehicle = true; this.isBoat = true; this.hp = hp; this.dead = false; this.radius = 2.2;
    const b = buildBoat(); this.root = b.g; this.crew = b.crew; this.wake = b.wake;
    this.from = from.clone(); this.to = to.clone(); this.water = water; this.speed = speed; this.delay = delay; this.onLand = onLand;
    this.root.position.set(from.x, water, from.z); this.root.lookAt(to.x, water, to.z); this.position = this.root.position;
    this.root.visible = delay <= 0; game.renderer.scene.add(this.root);
    this.shotT = 2 + Math.random() * 2; this.t = Math.random() * 10; this.landed = false;
    this.engine = game.audio.engineLoop?.('truck'); this.engine?.set(0.25, 0.9);
    game.director.vehicles.push(this);
    this._inv = new THREE.Matrix4();
  }
  rayTest(origin, dir, maxDist) {
    this.root.updateMatrixWorld(true); this._inv.copy(this.root.matrixWorld).invert();
    const o = origin.clone().applyMatrix4(this._inv); const d = dir.clone().transformDirection(this._inv);
    const hit = new THREE.Ray(o, d).intersectBox(new THREE.Box3(new THREE.Vector3(-1.1, -0.1, -2.4), new THREE.Vector3(1.1, 1.1, 2.4)), new THREE.Vector3());
    if (!hit) return null; const dist = hit.distanceTo(o); if (dist > maxDist) return null;
    return { dist, point: hit.applyMatrix4(this.root.matrixWorld) };
  }
  damage(amount) {
    if (this.dead || this.landed) return false;
    this.hp -= amount; this.flash = 0.08;
    // bullets knock crew members out one by one before the boat goes down
    const alive = this.crew.filter((c) => c.visible);
    if (alive.length && this.hp < 150 * (alive.length - 1) / 3) { alive[0].visible = false; this.game.effects.hitPuff(alive[0].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.5, 0))); }
    if (this.hp <= 0) { this.sink(); return true; }
    return false;
  }
  sink() {
    const g = this.game; this.dead = true; this.engine?.stop();
    for (const c of this.crew) if (c.visible) { c.visible = false; g.stats.kills++; }
    g.effects.explosion(this.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0.6);
    g.audio.explosion(this.position, 0.4);
    events.emit('boat:sunk', { boat: this });
  }
  update(dt) {
    const g = this.game; if (this.removed) return;
    if (this.delay > 0) { this.delay -= dt; if (this.delay <= 0) this.root.visible = true; return; }
    this.t += dt;
    if (this.dead) {
      this.root.position.y -= dt * 0.35; this.root.rotation.z += dt * 0.25; this.wake.visible = false;
      if (this.root.position.y < this.water - 1.6) this.remove();
      return;
    }
    if (!this.landed) {
      const to = this.to.clone().setY(this.position.y).sub(this.position); const dist = to.length();
      if (dist < 0.6) { this.land(); return; }
      this.position.addScaledVector(to.normalize(), Math.min(dist, this.speed * dt));
      this.position.y = this.water + Math.sin(this.t * 2.3) * 0.06; this.root.rotation.x = Math.sin(this.t * 1.7) * 0.04 - 0.05;
      this.engine?.setPos(this.position);
      // crew fire: suppressive, inaccurate
      this.shotT -= dt;
      const alive = this.crew.filter((c) => c.visible);
      if (alive.length && this.shotT <= 0) {
        this.shotT = 0.5 + Math.random() * 1.6;
        const p = g.player; const c = alive[Math.floor(Math.random() * alive.length)];
        const mz = c.localToWorld(new THREE.Vector3(0.16, 0.6, 0.8)); const tgt = p.chestPos(new THREE.Vector3());
        if (mz.distanceTo(tgt) < 120 && g.world.lineOfSight(mz, tgt)) {
          g.effects.muzzleFlash(mz, tgt.clone().sub(mz).normalize()); g.audio.shot(mz, { enemy: true });
          if (Math.random() < 0.06) p.takeDamage(10, mz, null, { kind: 'bullet', label: '고무보트 사수 사격' });
          else { const miss = tgt.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 4)); g.effects.tracer(mz, miss); if (Math.random() < 0.25) p.nearMiss(miss); }
        }
      }
    }
  }
  land() {
    this.landed = true; this.engine?.stop(); this.wake.visible = false;
    const pts = this.crew.filter((c) => c.visible).map((c) => c.getWorldPosition(new THREE.Vector3()));
    for (const c of this.crew) c.visible = false;
    this.onLand?.(pts, this);
    events.emit('boat:landed', { boat: this });
  }
  remove() { this.engine?.stop(); this.game.renderer.scene.remove(this.root); this.removed = true; }
}
