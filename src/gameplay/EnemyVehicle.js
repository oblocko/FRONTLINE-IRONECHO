// Enemy armed light truck ("technical"): drives a path, its bed gunner fires
// bursts at the player, takes damage from bullets (little) and explosives
// (a lot), and burns out when destroyed. Registered in director.vehicles so
// Combat can hit it.
import * as THREE from 'three';
import { buildTruck } from '../world/Props.js';
import { cloneRaw } from '../gear/GearLib.js';
import { events } from '../core/Events.js';

export class EnemyVehicle {
  constructor(game, { path, speed = 9, hp = 600, color = 0x5c6048, fireRange = 90 } = {}) {
    this.game = game; this.isVehicle = true; this.hp = this.maxHp = hp; this.dead = false; this.radius = 2.6;
    // KPA truck: Kamaz 5330-class 6x6 (Sketchfab, CC-BY) at real size; procedural truck as the fallback
    const real = cloneRaw('kamaz');
    let gunAt = new THREE.Vector3(0, 2.6, -0.6), postH = 0.9;
    if (real) {
      this.root = new THREE.Group(); this.root.add(real);
      real.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = o.material.clone(); } });
      const bb = new THREE.Box3().setFromObject(real); this.box = { min: bb.min.clone().setY(0.3), max: bb.max.clone() };
      gunAt = new THREE.Vector3(0, 3.45, 3.25); postH = 0.5;      // ring mount over the cab roof hatch
    } else {
      this.root = buildTruck({ model: false }); this.root.scale.setScalar(0.82); this.root.remove(this.root.userData.cargoLamp);
      this.root.traverse((o) => { if (o.isMesh && o.material?.color && o.material.map) { o.material = o.material.clone(); o.material.color.setHex(color); } });
    }
    // pintle machine gun + mount
    const gm = new THREE.MeshStandardMaterial({ color: 0x1d1e1e, metalness: 0.6, roughness: 0.45 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, postH, 8), gm); post.position.set(gunAt.x, gunAt.y - postH / 2 - 0.05, gunAt.z); this.root.add(post);
    if (real) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 20), gm); ring.rotation.x = Math.PI / 2; ring.position.set(gunAt.x, gunAt.y - postH, gunAt.z); this.root.add(ring); }
    this.root.userData.dynamic = true;
    this.gun = new THREE.Group(); this.gun.position.copy(gunAt); this.root.add(this.gun);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.1), gm); barrel.position.z = 0.35; this.gun.add(barrel);
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0, 0.95); this.gun.add(this.muzzle);
    game.renderer.scene.add(this.root);
    this.curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(p.x, game.world.heightFn(p.x, p.z), p.z)));
    this.len = this.curve.getLength(); this.u = 0; this.speed = speed; this.fireRange = fireRange;
    this.position = this.root.position; this.position.copy(this.curve.getPoint(0));
    this.burst = 0; this.shotT = 2; this.engine = game.audio.engineLoop('truck'); this.engine?.set(0.6, 0.5);
    game.director.vehicles.push(this);
    this._q = new THREE.Quaternion(); this._inv = new THREE.Matrix4();
  }
  // oriented-box ray test in the truck's local frame
  rayTest(origin, dir, maxDist) {
    this.root.updateMatrixWorld(true); this._inv.copy(this.root.matrixWorld).invert();
    const o = origin.clone().applyMatrix4(this._inv); const d = dir.clone().transformDirection(this._inv);
    const s = this.root.scale.x; const min = this.box ? this.box.min : new THREE.Vector3(-1.2, 0.3, -3.6), max = this.box ? this.box.max : new THREE.Vector3(1.2, 2.9, 4.5);
    const ray = new THREE.Ray(o, d); const hit = ray.intersectBox(new THREE.Box3(min, max), new THREE.Vector3());
    if (!hit) return null; const dist = hit.distanceTo(o) * s; if (dist > maxDist) return null;
    return { dist, point: hit.applyMatrix4(this.root.matrixWorld) };
  }
  damage(amount, from, attacker) {
    if (this.dead) return false;
    this.hp -= amount; this.hitFlash = 0.1;
    if (this.hp <= 0) { this.destroy(); return true; }
    if (this.hp < this.maxHp * 0.5 && !this.smoke) this.smoke = this.game.effects.smokeColumn(this.position.clone().add(new THREE.Vector3(0, 2, 0)), 0.4, [0.15, 0.15, 0.15]);
    return false;
  }
  destroy() {
    const g = this.game; this.dead = true; this.engine?.stop();
    g.combat.explode(this.position.clone().add(new THREE.Vector3(0, 1, 0)), { radius: 7, damage: 150, owner: 'world', kind: 'vehicle', label: '차량 폭발', scale: 1.6, playerSafe: g.player.position.distanceTo(this.position) > 9 });
    this.fire = g.effects.fireEmitter(this.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 1.3);
    if (this.smoke) g.effects.removeEmitter(this.smoke);
    this.root.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.color?.multiplyScalar(0.18); o.material.map = null; } });
    this.root.rotation.z = 0.08;
    g.world.addBoxCentered(this.position.clone().add(new THREE.Vector3(0, 1.1, 0)), new THREE.Vector3(3, 2.2, 6), { surface: 'metal', cover: true });
    events.emit('vehicle:destroyed', { vehicle: this });
  }
  update(dt) {
    if (this.dead) return;
    const g = this.game, p = g.player;
    if (this.u < 1) {
      this.u = Math.min(1, this.u + this.speed * dt / this.len);
      const a = this.curve.getPoint(this.u), b = this.curve.getPoint(Math.min(1, this.u + 0.01));
      this.position.copy(a); if (a.distanceToSquared(b) > 1e-6) this.root.lookAt(b.x, a.y, b.z);
      for (const w of this.root.userData.wheels || []) w.rotation.x += this.speed * dt / 0.55;
      this.engine?.set(this.u < 1 ? 0.8 : 0.2, 0.5);
    }
    this.engine?.setPos(this.position);
    // gunner: aim at the player, fire bursts
    const mz = this.muzzle.getWorldPosition(new THREE.Vector3());
    const target = p.chestPos(new THREE.Vector3()); const dist = mz.distanceTo(target);
    this.gun.lookAt(target);
    this.shotT -= dt;
    if (dist < this.fireRange && this.shotT <= 0 && g.world.lineOfSight(mz, target)) {
      if (this.burst <= 0) { this.burst = 6 + Math.floor(Math.random() * 6); }
      this.burst--; this.shotT = this.burst > 0 ? 0.09 : 1.4 + Math.random();
      const dir = target.clone().sub(mz).normalize();
      g.effects.muzzleFlash(mz, dir); g.audio.shot(mz, { enemy: true });
      const hit = Math.random() < 0.11 * Math.min(1, 25 / dist) * (p.crouching ? 0.7 : 1);
      if (hit) p.takeDamage(14, mz); else { const miss = target.clone().add(new THREE.Vector3((Math.random() - .5) * 3, (Math.random() - .3) * 1.5, (Math.random() - .5) * 3)); g.effects.tracer(mz, miss); if (Math.random() < 0.3) p.nearMiss(miss); }
    }
  }
  remove() { this.engine?.stop(); this.game.renderer.scene.remove(this.root); if (this.fire) this.game.effects.removeEmitter(this.fire); }
}
