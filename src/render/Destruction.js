// Destruction detail: physical debris (concrete chunks, rebar, torn-off parts), water splashes,
// falling grit and dust from broken edges, charred wrecks and ammunition cook-off. Shared by the
// bridge demolition, tanks, vehicles and collapsing structures.
//
// Debris pieces are simple rigid bodies: gravity, spin, a bounce or two on the ground (world height
// incl. colliders), friction, then they come to rest and stay as rubble. In water they splash once
// and sink. A cap on live pieces keeps the cost bounded.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const MAX_BODIES = 260;

export class Destruction {
  constructor(game) {
    this.game = game; this.scene = game.renderer.scene; this.bodies = []; this.water = null;
    this.chunkGeos = [0, 1, 2, 3].map((i) => { const g = new THREE.DodecahedronGeometry(0.5, 0); const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * rand(0.7, 1.3), p.getY(k) * rand(0.55, 1.1), p.getZ(k) * rand(0.7, 1.3)); g.computeVertexNormals(); return g; });
    this.slabGeo = new THREE.BoxGeometry(1, 0.35, 0.8);
    this.rebarGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 4);
    this.mats = {
      concrete: new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.95 }),
      concreteDark: new THREE.MeshStandardMaterial({ color: 0x5e5f5c, roughness: 0.95 }),
      rebar: new THREE.MeshStandardMaterial({ color: 0x5a3a28, metalness: 0.6, roughness: 0.6 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x2a2b28, metalness: 0.5, roughness: 0.7 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xb0a48a, roughness: 0.95 }),
    };
    game.effects.extras.push(this);
  }

  // ---- rigid bodies ----
  add(obj, { v = V(0, 0, 0), av = V(0, 0, 0), half = 0.2, life = 40, bounce = 0.28, sinkable = true } = {}) {
    if (!obj.parent) this.scene.add(obj);
    const b = { obj, v, av, half, life, bounce, rest: false, wet: false, sinkable };
    this.bodies.push(b);
    if (this.bodies.length > MAX_BODIES) { const o = this.bodies.shift(); o.obj.parent?.remove(o.obj); }
    return b;
  }
  // concrete / stone chunks thrown from `pos` (dir biases the throw)
  chunks(pos, { count = 16, size = 0.35, speed = 7, up = 6, mat = 'concrete', dir = null, spread = 0.6, life = 45 } = {}) {
    const budget = this.game.effects.budget ?? 1; const n = Math.max(3, Math.round(count * budget));
    for (let i = 0; i < n; i++) {
      const s = size * rand(0.35, 1.25);
      const m = new THREE.Mesh(this.chunkGeos[i % 4], typeof mat === 'string' ? this.mats[mat] : mat); m.scale.set(s * rand(0.8, 1.6), s, s * rand(0.8, 1.4)); m.castShadow = s > 0.25;
      m.position.copy(pos).add(V(rand(-spread, spread), rand(0, spread), rand(-spread, spread))); m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      const a = Math.random() * Math.PI * 2; const sp = speed * rand(0.3, 1);
      const v = V(Math.cos(a) * sp, up * rand(0.4, 1.2), Math.sin(a) * sp); if (dir) v.addScaledVector(dir, speed * 0.8);
      this.add(m, { v, av: V(rand(-9, 9), rand(-9, 9), rand(-9, 9)), half: s * 0.5, life });
    }
    // fine grit + dust with it
    this.dustPuff(pos, size * 3);
  }
  // bent reinforcing bars sticking out of a broken concrete edge (static), pointing along `out`
  rebar(at, out, { width = 8, n = 9, len = 1.0, parent = this.scene } = {}) {
    const g = new THREE.Group(); const side = V(-out.z, 0, out.x);
    for (let i = 0; i < n; i++) {
      const base = at.clone().addScaledVector(side, (i / (n - 1) - 0.5) * width).add(V(0, rand(-0.25, 0.1), 0));
      let p = base.clone(); let d = out.clone().add(V(rand(-0.2, 0.2), rand(-0.6, 0.15), rand(-0.2, 0.2))).normalize();
      const segs = 2 + Math.floor(Math.random() * 2); const L = len * rand(0.5, 1.3) / segs;
      for (let k = 0; k < segs; k++) {
        const m = new THREE.Mesh(this.rebarGeo, this.mats.rebar); m.scale.set(1, L, 1);
        m.position.copy(p).addScaledVector(d, L / 2); m.quaternion.setFromUnitVectors(V(0, 1, 0), d); g.add(m);
        p.addScaledVector(d, L); d.add(V(rand(-0.3, 0.3), rand(-0.5, -0.1), rand(-0.3, 0.3))).normalize();   // sag down
      }
    }
    parent.add(g); return g;
  }
  // jagged broken edge: a row of tilted concrete blocks along a slab end
  brokenEdge(at, out, { width = 9, depth = 0.7, mat = 'concrete', parent = this.scene } = {}) {
    const g = new THREE.Group(); const side = V(-out.z, 0, out.x);
    const n = Math.round(width / 0.7);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.chunkGeos[i % 4], this.mats[mat]); const s = rand(0.3, 0.6); m.scale.set(s * 1.4, depth * rand(0.6, 1.1), s * 1.2);
      m.position.copy(at).addScaledVector(side, (i / (n - 1) - 0.5) * width).addScaledVector(out, rand(-0.1, 0.35)).add(V(0, rand(-0.45, -0.05), 0));
      m.rotation.set(rand(-0.6, 0.6), rand(0, 6), rand(-0.6, 0.6)); m.castShadow = true; g.add(m);
    }
    parent.add(g); return g;
  }
  // grit trickling off a broken edge for a while, with thin dust
  dustFall(pos, { width = 8, dur = 9, side = V(1, 0, 0) } = {}) {
    const fx = this.game.effects; let t = 0;
    const em = fx.addEmitter({ pos: pos.clone(), rate: 14 * (fx.budget ?? 1), life: dur, spawn: (p) => {
      t += 1; const q = p.clone().addScaledVector(side, rand(-0.5, 0.5) * width);
      fx.smoke.spawn({ x: q.x, y: q.y, z: q.z, vx: rand(-0.2, 0.2), vy: -rand(1.5, 3.5), vz: rand(-0.2, 0.2), size: 0.25, endSize: 1.6, life: 1.6, alpha: 0.55, endAlpha: 0, r: 0.55, g: 0.53, b: 0.5, drag: 0.6 });
      if (Math.random() < 0.25 && this.bodies.length < MAX_BODIES - 20) { const m = new THREE.Mesh(this.chunkGeos[0], this.mats.concrete); const s = rand(0.05, 0.14); m.scale.setScalar(s); m.position.copy(q); this.add(m, { v: V(rand(-0.3, 0.3), -rand(0, 1), rand(-0.3, 0.3)), av: V(rand(-6, 6), 0, rand(-6, 6)), half: s * 0.5, life: 8 }); }
    } });
    return em;
  }
  dustPuff(pos, scale = 1) {
    const fx = this.game.effects; const b = fx.budget ?? 1;
    for (let i = 0; i < 14 * b * Math.min(3, scale); i++) { const a = Math.random() * 6.28;
      fx.smoke.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * rand(1, 4) * scale, vy: rand(0.2, 2), vz: Math.sin(a) * rand(1, 4) * scale, size: 0.8 * scale, endSize: 4 * scale, life: rand(2, 4), alpha: 0.6, endAlpha: 0, r: 0.6, g: 0.58, b: 0.54, drag: 1.4 }); }
  }
  // white spray + ring of foam where something heavy hits the water
  splash(pos, scale = 1) {
    const fx = this.game.effects; const b = fx.budget ?? 1;
    for (let i = 0; i < 46 * b * scale; i++) { const a = Math.random() * 6.28, r = rand(0.2, 1);
      fx.smoke.spawn({ x: pos.x + Math.cos(a) * r * scale, y: pos.y + 0.2, z: pos.z + Math.sin(a) * r * scale, vx: Math.cos(a) * rand(0.5, 3) * scale, vy: rand(4, 11) * scale, vz: Math.sin(a) * rand(0.5, 3) * scale,
        size: 0.6 * scale, endSize: 2.6 * scale, life: rand(1.2, 2.2), alpha: 0.75, endAlpha: 0, r: 0.82, g: 0.86, b: 0.88, drag: 0.8, gravity: 9 }); }
    for (let i = 0; i < 20 * b * scale; i++) { const a = Math.random() * 6.28;
      fx.smoke.spawn({ x: pos.x, y: pos.y + 0.1, z: pos.z, vx: Math.cos(a) * 5 * scale, vy: 0.3, vz: Math.sin(a) * 5 * scale, size: 0.8 * scale, endSize: 3.5 * scale, life: 2.5, alpha: 0.6, endAlpha: 0, r: 0.75, g: 0.8, b: 0.82, drag: 2 }); }
    this.game.audio.explosion?.(pos, 0.35 * scale, { ring: false });
  }
  // burnt wreck look: darken + roughen every material, keep a hint of the paint
  char(root, k = 0.22) {
    root.traverse((o) => { if (o.isMesh && o.material && !o.userData.charred) { const ms = Array.isArray(o.material) ? o.material : [o.material];
      o.material = ms.map((mm) => { const c = mm.clone(); c.color?.multiplyScalar(k * rand(0.8, 1.3)); c.roughness = 0.95; c.metalness = Math.min(c.metalness ?? 0, 0.3); if (c.emissive) c.emissive.setHex(0); return c; });
      if (o.material.length === 1) o.material = o.material[0]; o.userData.charred = true; } });
  }
  // tear a part off a model and throw it (keeps its world transform)
  detach(part, { v = V(0, 6, 0), av = V(rand(-4, 4), rand(-4, 4), rand(-4, 4)), half = 0.4, life = 60 } = {}) {
    part.updateWorldMatrix(true, false); this.scene.attach(part);
    return this.add(part, { v, av, half, life, bounce: 0.18 });
  }
  // ammunition cooking off: a few smaller blasts and fire jets over `dur` seconds
  cookOff(pos, { dur = 9, n = 5, scale = 0.6 } = {}) {
    const g = this.game;
    for (let i = 0; i < n; i++) setTimeout(() => {
      if (g.state !== 'playing' && g.state !== 'dead') return;
      const p = pos.clone().add(V(rand(-1, 1), rand(0, 1.2), rand(-1, 1)));
      g.effects.explosion(p, scale * rand(0.6, 1.1)); g.audio.explosion(p, scale * 0.8, { ring: false }); g.effects.flashLight(p, 0xff8a30, 18, 0.2, 18);
      for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(this.chunkGeos[k % 4], this.mats.metal); const s = rand(0.06, 0.16); m.scale.setScalar(s); m.position.copy(p); this.add(m, { v: V(rand(-6, 6), rand(4, 11), rand(-6, 6)), av: V(rand(-10, 10), rand(-10, 10), rand(-10, 10)), half: s * 0.5, life: 20 }); }
    }, (i === 0 ? 0.6 : rand(0.8, dur)) * 1000);
  }

  update(dt) {
    const w = this.game.world, water = this.water;
    for (const b of this.bodies) {
      b.life -= dt; if (b.life <= 0) { b.obj.parent?.remove(b.obj); b.dead = true; continue; }
      if (b.rest) continue;
      const o = b.obj; b.v.y -= 18 * dt;
      if (b.wet) { b.v.multiplyScalar(Math.exp(-dt * 3)); b.v.y = Math.max(b.v.y, -0.9); }
      o.position.addScaledVector(b.v, dt);
      o.rotation.x += b.av.x * dt; o.rotation.y += b.av.y * dt; o.rotation.z += b.av.z * dt;
      if (water != null && !b.wet && o.position.y < water) { b.wet = true; if (b.half > 0.25) this.splash(V(o.position.x, water, o.position.z), Math.min(1.4, b.half * 1.2)); b.av.multiplyScalar(0.3); b.life = Math.min(b.life, 7); }
      const gy = w.groundHeight(o.position.x, o.position.z, o.position.y + b.half + 0.2);
      if (o.position.y - b.half < gy) {
        o.position.y = gy + b.half;
        if (Math.abs(b.v.y) > 2.2) { b.v.y = -b.v.y * b.bounce; b.v.x *= 0.55; b.v.z *= 0.55; b.av.multiplyScalar(0.5); }
        else { b.v.set(0, 0, 0); b.av.set(0, 0, 0); b.rest = true; }
      }
    }
    if (this.bodies.some((b) => b.dead)) this.bodies = this.bodies.filter((b) => !b.dead);
  }
  clear() { for (const b of this.bodies) b.obj.parent?.remove(b.obj); this.bodies = []; }
}

// per-mission singleton
export function wreck(game) { if (!game._wreck || game._wreck.scene !== game.renderer.scene || !game.effects.extras.includes(game._wreck)) game._wreck = new Destruction(game); return game._wreck; }
