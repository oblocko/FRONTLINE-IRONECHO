// Lightweight crowd: hundreds of pedestrians as ONE instanced mesh (one draw call).
// A ~150-triangle figure; the walk cycle (leg / arm swing) runs in the vertex shader from a per-instance phase
// and walk speed; shirt / trouser colours and height vary per instance. Behaviour is a cheap CPU loop:
// sidewalk walkers go up and down their strip, plaza walkers pick random destinations (and sometimes head for
// a door), some stand still for a while; everyone steps aside from the player. Only people within RANGE of
// the camera are drawn and simulated in detail.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const RANGE = 160;
const SHIRTS = [0x2a3a5a, 0xe8e6e0, 0x1a1a1c, 0x8a2a2a, 0x3a6a4a, 0xc8b89a, 0x5a6a7a, 0x9a7a5a, 0x4a4a5a, 0xd8c040, 0x6a3a6a, 0x2a6a8a];
const PANTS = [0x1e2430, 0x2a2a2c, 0x3a4a5a, 0x5a5048, 0x8a8478, 0x1a1a1a];
const SKIN = [0xe0b898, 0xd0a682, 0xc29070];

// figure geometry with attributes: part (0 body, 1/2 legs, 3/4 arms) and zone (0 skin, 1 shirt, 2 trousers, 3 hair, 4 shoes)
function figure() {
  const parts = [];
  const add = (g, part, zone) => { const n = g.attributes.position.count; g.setAttribute('part', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1)); g.setAttribute('zone', new THREE.Float32BufferAttribute(new Float32Array(n).fill(zone), 1)); parts.push(g.index ? g.toNonIndexed() : g); };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  for (const [s, part] of [[-1, 1], [1, 2]]) { add(box(0.14, 0.78, 0.15, s * 0.1, 0.43, 0), part, 2); add(box(0.15, 0.08, 0.26, s * 0.1, 0.04, 0.04), part, 4); }
  add(box(0.4, 0.62, 0.23, 0, 1.13, 0), 0, 1);
  add(box(0.36, 0.14, 0.22, 0, 0.84, 0), 0, 2);   // hips
  for (const [s, part] of [[-1, 3], [1, 4]]) { add(box(0.1, 0.56, 0.11, s * 0.26, 1.14, 0), part, 1); add(box(0.08, 0.1, 0.09, s * 0.26, 0.82, 0), part, 0); }
  add(box(0.1, 0.08, 0.1, 0, 1.48, 0), 0, 0);   // neck
  const head = new THREE.SphereGeometry(0.115, 7, 5).translate(0, 1.6, 0); add(head, 0, 0);
  const hair = new THREE.SphereGeometry(0.122, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.615, -0.01); add(hair, 0, 3);
  return mergeGeometries(parts);
}

function crowdMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  m.userData.uTime = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = m.userData.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute float part; attribute float zone; attribute vec4 aWalk; attribute vec3 aShirt; attribute vec3 aPants; attribute vec3 aSkin;
      uniform float uTime; varying vec3 vCrowd;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      // aWalk: x phase, y stride rate (0 = standing), z height scale, w girth
      float sw = sin(uTime * aWalk.y + aWalk.x);
      if (part > 0.5 && part < 2.5) { float a = sw * 0.55 * min(1.0, aWalk.y / 6.0) * (part < 1.5 ? 1.0 : -1.0); float py = 0.84; transformed.yz = vec2(py + (transformed.y - py) * cos(a) - transformed.z * sin(a), (transformed.y - py) * sin(a) + transformed.z * cos(a)); }
      if (part > 2.5) { float a = -sw * 0.45 * min(1.0, aWalk.y / 6.0) * (part < 3.5 ? 1.0 : -1.0); float py = 1.4; transformed.yz = vec2(py + (transformed.y - py) * cos(a) - transformed.z * sin(a), (transformed.y - py) * sin(a) + transformed.z * cos(a)); }
      transformed.y += abs(sw) * 0.03 * min(1.0, aWalk.y / 6.0);
      transformed.y *= aWalk.z; transformed.x *= aWalk.w;
      vCrowd = zone < 0.5 ? aSkin : zone < 1.5 ? aShirt : zone < 2.5 ? aPants : zone < 3.5 ? vec3(0.08, 0.06, 0.05) : vec3(0.12, 0.12, 0.13);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCrowd;').replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vCrowd, opacity );');
  };
  return m;
}

export class Crowd {
  // areas: [{ rect: {x0, z0, x1, z1}, kind: 'strip' | 'plaza', n, doors?: [[x, z]] }]
  constructor(game, areas, { y = 0.15, rnd = Math.random, max = 800 } = {}) {
    this.game = game; this.y = y; this.people = [];
    for (const A of areas) {
      const r = A.rect, along = r.x1 - r.x0 > r.z1 - r.z0;
      for (let i = 0; i < A.n; i++) {
        const p = { A, along, x: r.x0 + rnd() * (r.x1 - r.x0), z: r.z0 + rnd() * (r.z1 - r.z0), tx: 0, tz: 0, speed: 1.1 + rnd() * 0.55, wait: rnd() < 0.15 ? rnd() * 8 : 0, heading: 0,
          phase: rnd() * 6.28, h: 0.9 + rnd() * 0.17, girth: 0.9 + rnd() * 0.25, shirt: new THREE.Color(SHIRTS[(rnd() * SHIRTS.length) | 0]), pants: new THREE.Color(PANTS[(rnd() * PANTS.length) | 0]), skin: new THREE.Color(SKIN[(rnd() * SKIN.length) | 0]) };
        if (A.kind === 'strip') { p.lane = rnd() < 0.5 ? -1 : 1; p.off = (rnd() - 0.5) * 0.6; }
        this.pick(p, rnd); this.people.push(p);
        if (this.people.length >= max) break;
      }
      if (this.people.length >= max) break;
    }
    this.rnd = rnd;
    const geo = figure(), n = this.people.length;
    this.aWalk = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.aShirt = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aPants = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); this.aSkin = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    for (const a of [this.aWalk, this.aShirt, this.aPants, this.aSkin]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aWalk', this.aWalk); geo.setAttribute('aShirt', this.aShirt); geo.setAttribute('aPants', this.aPants); geo.setAttribute('aSkin', this.aSkin);
    this.mat = crowdMaterial();
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.userData.lodAlways = true; this.mesh.count = 0;
    game.renderer.scene.add(this.mesh);
    this.t = 0; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 1, 0); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }
  pick(p, rnd = this.rnd) {
    const r = p.A.rect;
    if (p.A.kind === 'strip') {   // walk to the far end of the strip on your own side, then back
      const w = p.along ? r.z1 - r.z0 : r.x1 - r.x0, c = (p.along ? r.z0 + r.z1 : r.x0 + r.x1) / 2, side = c + p.lane * w * 0.22 + p.off;
      const goFar = p.along ? p.x < (r.x0 + r.x1) / 2 : p.z < (r.z0 + r.z1) / 2;
      if (p.along) { p.tx = goFar ? r.x1 - 1 : r.x0 + 1; p.tz = side; } else { p.tx = side; p.tz = goFar ? r.z1 - 1 : r.z0 + 1; }
    } else if (p.A.doors?.length && rnd() < 0.3) { const d = p.A.doors[(rnd() * p.A.doors.length) | 0]; p.tx = d[0] + (rnd() - 0.5) * 6; p.tz = d[1]; }
    else { p.tx = r.x0 + 1 + rnd() * (r.x1 - r.x0 - 2); p.tz = r.z0 + 1 + rnd() * (r.z1 - r.z0 - 2); }
  }
  update(dt) {
    this.t += dt; this.mat.userData.uTime.value = this.t;
    const cam = this.game.renderer.camera.position, pl = this.game.player?.position; let k = 0;
    for (const p of this.people) {
      const near = Math.abs(p.x - cam.x) < RANGE && Math.abs(p.z - cam.z) < RANGE;
      let moving = false;
      if (p.wait > 0) p.wait -= dt;
      else {
        let dx = p.tx - p.x, dz = p.tz - p.z; const d = Math.hypot(dx, dz);
        if (d < 0.6) { this.pick(p); if (this.rnd() < 0.2) p.wait = 1 + this.rnd() * 6; }
        else {
          dx /= d; dz /= d;
          if (pl && near) { const ox = p.x - pl.x, oz = p.z - pl.z, od = Math.hypot(ox, oz); if (od < 1.6 && od > 0.01) { dx += (ox / od) * (1.6 - od) * 1.5; dz += (oz / od) * (1.6 - od) * 1.5; const l = Math.hypot(dx, dz); dx /= l; dz /= l; } }
          p.x += dx * p.speed * dt; p.z += dz * p.speed * dt; moving = true;
          const hd = Math.atan2(dx, dz); let dh = hd - p.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); p.heading += dh * Math.min(1, dt * 6);
        }
      }
      if (!near) continue;
      this._p.set(p.x, this.y, p.z); this._q.setFromAxisAngle(this._up, p.heading); this._m.compose(this._p, this._q, this._s); this.mesh.setMatrixAt(k, this._m);
      this.aWalk.setXYZW(k, p.phase, moving ? p.speed * 5.2 : 0, p.h, p.girth);
      this.aShirt.setXYZ(k, p.shirt.r, p.shirt.g, p.shirt.b); this.aPants.setXYZ(k, p.pants.r, p.pants.g, p.pants.b); this.aSkin.setXYZ(k, p.skin.r, p.skin.g, p.skin.b);
      k++;
    }
    this.mesh.count = k; this.mesh.instanceMatrix.needsUpdate = true;
    for (const a of [this.aWalk, this.aShirt, this.aPants, this.aSkin]) a.needsUpdate = true;
  }
}
