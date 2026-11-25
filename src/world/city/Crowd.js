// Lightweight crowd: hundreds of pedestrians as ONE instanced mesh (one draw call).
// Three levels of detail (detailed figure with knees / elbows / face near the camera, low-poly figures further
// out, shadowless boxes beyond the shadow range); the walk cycle runs in the vertex shader (and the shadow pass)
// from a per-instance phase and walk speed; shirt / trouser colours and height vary per instance. Behaviour is a cheap CPU loop:
// sidewalk walkers go up and down their strip, plaza walkers pick random destinations (and sometimes head for
// a door), some stand still for a while; everyone steps aside from the player. Only people within RANGE of
// the camera are drawn and simulated in detail.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const RANGE = 160;
const SHIRTS = [0x2a3a5a, 0xe8e6e0, 0x1a1a1c, 0x8a2a2a, 0x3a6a4a, 0xc8b89a, 0x5a6a7a, 0x9a7a5a, 0x4a4a5a, 0xd8c040, 0x6a3a6a, 0x2a6a8a];
const PANTS = [0x1e2430, 0x2a2a2c, 0x3a4a5a, 0x5a5048, 0x8a8478, 0x1a1a1a];
const SKIN = [0xe0b898, 0xd0a682, 0xc29070];

// figure geometry with attributes: part (0 body, 1/2 thighs, 3/4 upper arms, 5/6 shins, 7/8 forearms) and
// zone (0 skin, 1 shirt, 2 trousers, 3 hair, 4 shoes). Three levels of detail share one shader.
function build(list) {
  const parts = [];
  for (const [g0, part, zone] of list) {
    const g = g0.index ? g0.toNonIndexed() : g0; g.deleteAttribute('uv'); const n = g.attributes.position.count;
    g.setAttribute('part', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1)); g.setAttribute('zone', new THREE.Float32BufferAttribute(new Float32Array(n).fill(zone), 1)); parts.push(g);
  }
  return mergeGeometries(parts);
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cap = (r, len, x, y, z, rs = 8) => new THREE.CapsuleGeometry(r, len, 3, rs).translate(x, y, z);

// far (>55 m, no shadow): boxes only, ~130 triangles
function figureFar() {
  const L = [];
  for (const [s, a, b] of [[-1, 1, 5], [1, 2, 6]]) { L.push([box(0.14, 0.4, 0.15, s * 0.1, 0.62, 0), a, 2], [box(0.13, 0.42, 0.14, s * 0.1, 0.25, 0), b, 2], [box(0.14, 0.07, 0.25, s * 0.1, 0.035, 0.04), b, 4]); }
  L.push([box(0.4, 0.62, 0.23, 0, 1.13, 0), 0, 1], [box(0.36, 0.14, 0.22, 0, 0.84, 0), 0, 2]);
  for (const [s, a, b] of [[-1, 3, 7], [1, 4, 8]]) { L.push([box(0.1, 0.3, 0.11, s * 0.26, 1.27, 0), a, 1], [box(0.09, 0.36, 0.1, s * 0.26, 0.96, 0), b, 1]); }
  L.push([box(0.2, 0.24, 0.22, 0, 1.6, 0), 0, 0], [box(0.21, 0.08, 0.23, 0, 1.73, -0.005), 0, 3]);
  return build(L);
}
// mid (22–55 m): boxes with a low-poly head, ~250 triangles
function figureMid() {
  const L = [];
  for (const [s, a, b] of [[-1, 1, 5], [1, 2, 6]]) { L.push([box(0.14, 0.4, 0.15, s * 0.1, 0.62, 0), a, 2], [box(0.13, 0.42, 0.14, s * 0.1, 0.25, 0), b, 2], [box(0.15, 0.08, 0.26, s * 0.1, 0.04, 0.04), b, 4]); }
  L.push([box(0.4, 0.62, 0.23, 0, 1.13, 0), 0, 1], [box(0.36, 0.14, 0.22, 0, 0.84, 0), 0, 2], [box(0.1, 0.08, 0.1, 0, 1.48, 0), 0, 0]);
  for (const [s, a, b] of [[-1, 3, 7], [1, 4, 8]]) { L.push([box(0.1, 0.3, 0.11, s * 0.26, 1.27, 0), a, 1], [box(0.09, 0.3, 0.1, s * 0.26, 0.99, 0), b, 1], [box(0.08, 0.1, 0.09, s * 0.26, 0.8, 0), b, 0]); }
  L.push([new THREE.SphereGeometry(0.115, 7, 5).translate(0, 1.6, 0), 0, 0], [new THREE.SphereGeometry(0.122, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.615, -0.01), 0, 3]);
  return build(L);
}
// near (<22 m): rounded limbs with knees / elbows, shaped torso, hands, shoes and a proper head, ~1700 triangles
function figureNear() {
  const L = [];
  for (const [s, a, b] of [[-1, 1, 5], [1, 2, 6]]) {
    const x = s * 0.095;
    L.push([cap(0.072, 0.3, x, 0.67, 0), a, 2], [cap(0.058, 0.34, x, 0.27, 0), b, 2]);
    L.push([box(0.11, 0.07, 0.2, x, 0.035, 0.03), b, 4], [new THREE.SphereGeometry(0.056, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1.2).translate(x, 0.03, 0.12), b, 4]);
  }
  L.push([new THREE.CylinderGeometry(0.175, 0.165, 0.18, 14).scale(1, 1, 0.68).translate(0, 0.86, 0), 0, 2]);
  L.push([new THREE.CylinderGeometry(0.2, 0.165, 0.5, 14, 2).scale(1, 1, 0.6).translate(0, 1.2, 0), 0, 1]);
  L.push([new THREE.SphereGeometry(0.2, 14, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 0.6).translate(0, 1.45, 0), 0, 1]);
  for (const [s, a, b] of [[-1, 3, 7], [1, 4, 8]]) {
    const x = s * 0.235;
    L.push([new THREE.SphereGeometry(0.068, 8, 6).translate(x, 1.42, 0), a, 1], [cap(0.052, 0.2, x, 1.29, 0), a, 1]);
    L.push([cap(0.045, 0.2, x, 1.04, 0), b, 1], [new THREE.SphereGeometry(0.045, 8, 6).scale(0.8, 1.25, 1).translate(x, 0.86, 0.005), b, 0]);
  }
  L.push([new THREE.CylinderGeometry(0.048, 0.055, 0.12, 10).translate(0, 1.52, 0), 0, 0]);
  L.push([new THREE.SphereGeometry(0.105, 16, 12).scale(0.92, 1.12, 1).translate(0, 1.64, 0.005), 0, 0]);
  L.push([new THREE.SphereGeometry(0.02, 6, 4).scale(0.8, 1, 1.1).translate(0, 1.625, 0.105), 0, 0]);   // nose
  for (const s of [-1, 1]) L.push([new THREE.SphereGeometry(0.024, 6, 4).scale(0.5, 1, 0.8).translate(s * 0.098, 1.635, -0.005), 0, 0]);   // ears
  L.push([new THREE.SphereGeometry(0.112, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(0.95, 1.12, 1.04).translate(0, 1.655, -0.008), 0, 3]);
  L.push([new THREE.SphereGeometry(0.104, 12, 6, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.4, Math.PI * 0.3).scale(0.95, 1.12, 1.04).translate(0, 1.64, -0.012), 0, 3]);   // back of the head
  return build(L);
}

const HEAD = `
  attribute float part; attribute float zone; attribute vec4 aWalk; attribute vec3 aShirt; attribute vec3 aPants; attribute vec4 aSkin;
  uniform float uTime; varying vec3 vCrowd;
  vec3 crowdRot(vec3 p, float py, float a) { float dy = p.y - py; return vec3(p.x, py + dy * cos(a) - p.z * sin(a), dy * sin(a) + p.z * cos(a)); }`;
// pose: aWalk = (phase, stride rate (0 = standing), height scale, girth); hips / knees / shoulders / elbows
const POSE = `
  float cw = min(1.0, aWalk.y / 6.0), csw = sin(uTime * aWalk.y + aWalk.x);
  float cside = (part == 1.0 || part == 3.0 || part == 5.0 || part == 7.0) ? 1.0 : -1.0;
  float cHip = csw * 0.5 * cw * cside, cKnee = (0.05 + max(0.0, -cHip) * 1.4 + 0.12 * cw) * cw;
  float cSh = -csw * 0.42 * cw * cside, cElb = -0.15 - 0.25 * cw - max(0.0, -cSh) * 0.6;
  bool cLeg = part == 1.0 || part == 2.0 || part == 5.0 || part == 6.0, cArm = part >= 3.0 && part != 5.0 && part != 6.0, cLow = part >= 5.0;`;
const MOVE = `
  if (cLeg) { if (cLow) transformed = crowdRot(transformed, 0.47, cKnee); transformed = crowdRot(transformed, 0.84, cHip); }
  if (cArm) { if (cLow) transformed = crowdRot(transformed, 1.165, cElb); transformed = crowdRot(transformed, 1.42, cSh); }
  transformed.y += abs(csw) * 0.03 * cw;
  transformed.y *= aWalk.z; transformed.x *= aWalk.w;`;

function crowdMaterial(uTime) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + HEAD)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>${POSE}
      if (cLeg) { if (cLow) objectNormal = crowdRot(objectNormal, 0.0, cKnee); objectNormal = crowdRot(objectNormal, 0.0, cHip); }
      if (cArm) { if (cLow) objectNormal = crowdRot(objectNormal, 0.0, cElb); objectNormal = crowdRot(objectNormal, 0.0, cSh); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${MOVE}
      vCrowd = zone < 0.5 ? aSkin.rgb : zone < 1.5 ? aShirt : zone < 2.5 ? aPants : zone < 3.5 ? mix(vec3(0.05, 0.04, 0.035), vec3(0.32, 0.2, 0.12), aSkin.w) : vec3(0.12, 0.12, 0.13);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCrowd;').replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vCrowd, opacity );');
  };
  // shadows follow the same walk cycle
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + HEAD).replace('#include <begin_vertex>', `#include <begin_vertex>${POSE}${MOVE}`);
  };
  return { m, d };
}

// one instanced mesh per level of detail
class Tier {
  constructor(scene, geo, mat, n, shadow, depth) {
    this.aWalk = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.aShirt = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aPants = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); this.aSkin = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.attrs = [this.aWalk, this.aShirt, this.aPants, this.aSkin];
    for (const a of this.attrs) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aWalk', this.aWalk); geo.setAttribute('aShirt', this.aShirt); geo.setAttribute('aPants', this.aPants); geo.setAttribute('aSkin', this.aSkin);
    this.mesh = new THREE.InstancedMesh(geo, mat, n); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.castShadow = shadow; this.mesh.receiveShadow = true; this.mesh.userData.lodAlways = true; this.mesh.count = 0;
    if (depth) this.mesh.customDepthMaterial = depth;
    this.attrs.push(this.mesh.instanceMatrix); this.k = 0;
    scene.add(this.mesh);
  }
  put(p, m, walk) {
    const k = this.k++;
    this.mesh.setMatrixAt(k, m); this.aWalk.setXYZW(k, p.phase, walk, p.h, p.girth);
    this.aShirt.setXYZ(k, p.shirt.r, p.shirt.g, p.shirt.b); this.aPants.setXYZ(k, p.pants.r, p.pants.g, p.pants.b); this.aSkin.setXYZW(k, p.skin.r, p.skin.g, p.skin.b, p.hair);
  }
  flush() {   // upload only the instances written this frame
    this.mesh.count = this.k;
    for (const a of this.attrs) { a.clearUpdateRanges(); if (this.k) { a.addUpdateRange(0, this.k * a.itemSize); a.needsUpdate = true; } }
    this.k = 0;
  }
}

export class Crowd {
  // areas: [{ rect: {x0, z0, x1, z1}, kind: 'strip' | 'plaza', n, doors?: [[x, z]] }]
  constructor(game, areas, { y = 0.15, rnd = Math.random, max = 800 } = {}) {
    this.game = game; this.y = y; this.people = [];
    for (const A of areas) {
      const r = A.rect, along = r.x1 - r.x0 > r.z1 - r.z0;
      for (let i = 0; i < A.n; i++) {
        const p = { A, along, x: r.x0 + rnd() * (r.x1 - r.x0), z: r.z0 + rnd() * (r.z1 - r.z0), tx: 0, tz: 0, speed: 1.1 + rnd() * 0.55, wait: rnd() < 0.15 ? rnd() * 8 : 0, heading: 0,
          phase: rnd() * 6.28, h: 0.9 + rnd() * 0.17, girth: 0.9 + rnd() * 0.25, shirt: new THREE.Color(SHIRTS[(rnd() * SHIRTS.length) | 0]), pants: new THREE.Color(PANTS[(rnd() * PANTS.length) | 0]), skin: new THREE.Color(SKIN[(rnd() * SKIN.length) | 0]), hair: rnd() < 0.75 ? rnd() * 0.25 : rnd(), slot: 0, acc: 0 };
        p.slot = this.people.length & 7;
        if (A.kind === 'strip') { p.lane = rnd() < 0.5 ? -1 : 1; p.off = (rnd() - 0.5) * 0.6; }
        this.pick(p, rnd); this.people.push(p);
        if (this.people.length >= max) break;
      }
      if (this.people.length >= max) break;
    }
    this.rnd = rnd;
    const n = this.people.length, scene = game.renderer.scene; this.uTime = { value: 0 };
    const { m: mat, d: depth } = crowdMaterial(this.uTime);
    this.near = new Tier(scene, figureNear(), mat, Math.min(n, 160), true, depth);
    this.mid = new Tier(scene, figureMid(), mat, Math.min(n, 700), true, depth);
    this.far = new Tier(scene, figureFar(), mat, n, false);
    this.t = 0; this.frame = 0; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 1, 0); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }
  // panic: everyone within `radius` of `from` runs away along their strip / out of the plaza and keeps going
  flee(from, radius = 80) {
    for (const p of this.people) {
      const dx = p.x - from.x, dz = p.z - from.z, d = Math.hypot(dx, dz); if (d > radius) continue;
      const r = p.A.rect; p.wait = 0; p.speed = 3.0 + Math.random() * 1.2; p.fled = true;
      if (p.A.kind === 'strip') { if (p.along) p.tx = dx > 0 ? r.x1 - 1 : r.x0 + 1; else p.tz = dz > 0 ? r.z1 - 1 : r.z0 + 1; }
      else { p.tx = Math.max(r.x0 + 1, Math.min(r.x1 - 1, p.x + dx / (d || 1) * 60)); p.tz = Math.max(r.z0 + 1, Math.min(r.z1 - 1, p.z + dz / (d || 1) * 60)); }
    }
  }
  pick(p, rnd = this.rnd) {
    if (p.fled) { p.wait = 1e9; return; }   // ran to the end: stays there (out of the way)
    const r = p.A.rect;
    if (p.A.kind === 'strip') {   // walk to the far end of the strip on your own side, then back
      const w = p.along ? r.z1 - r.z0 : r.x1 - r.x0, c = (p.along ? r.z0 + r.z1 : r.x0 + r.x1) / 2, side = c + p.lane * w * 0.22 + p.off;
      const goFar = p.along ? p.x < (r.x0 + r.x1) / 2 : p.z < (r.z0 + r.z1) / 2;
      if (p.along) { p.tx = goFar ? r.x1 - 1 : r.x0 + 1; p.tz = side; } else { p.tx = side; p.tz = goFar ? r.z1 - 1 : r.z0 + 1; }
    } else if (p.A.doors?.length && rnd() < 0.3) { const d = p.A.doors[(rnd() * p.A.doors.length) | 0]; p.tx = d[0] + (rnd() - 0.5) * 6; p.tz = d[1]; }
    else { p.tx = r.x0 + 1 + rnd() * (r.x1 - r.x0 - 2); p.tz = r.z0 + 1 + rnd() * (r.z1 - r.z0 - 2); }
  }
  update(dt) {
    this.t += dt; this.uTime.value = this.t; this.frame++;
    const cam = this.game.renderer.camera.position, pl = this.game.player?.position, slot = this.frame & 7;
    const NEAR2 = 22 * 22, MID2 = 55 * 55;
    for (const p of this.people) {
      const ax = Math.abs(p.x - cam.x), az = Math.abs(p.z - cam.z), near = ax < RANGE && az < RANGE;
      // people out of view range only tick every 8th frame (with the accumulated time)
      let step = dt;
      if (!near) { p.acc += dt; if (p.slot !== slot) continue; step = p.acc; }
      p.acc = 0;
      let moving = false;
      if (p.wait > 0) p.wait -= step;
      else {
        let dx = p.tx - p.x, dz = p.tz - p.z; const d = Math.hypot(dx, dz);
        if (d < 0.6) { this.pick(p); if (this.rnd() < 0.2) p.wait = 1 + this.rnd() * 6; }
        else {
          dx /= d; dz /= d;
          if (pl && near) { const ox = p.x - pl.x, oz = p.z - pl.z, od = Math.hypot(ox, oz); if (od < 1.6 && od > 0.01) { dx += (ox / od) * (1.6 - od) * 1.5; dz += (oz / od) * (1.6 - od) * 1.5; const l = Math.hypot(dx, dz); dx /= l; dz /= l; } }
          const mv = Math.min(d, p.speed * step); p.x += dx * mv; p.z += dz * mv; moving = true;
          const hd = Math.atan2(dx, dz); let dh = hd - p.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); p.heading += dh * Math.min(1, step * 6);
        }
      }
      if (!near) continue;
      const d2 = ax * ax + az * az;
      // hysteresis so people near a threshold do not flicker between models
      const tier = d2 < NEAR2 * (p.tier === 0 ? 1.15 : 0.87) ? 0 : d2 < MID2 * (p.tier === 1 ? 1.1 : 0.9) ? 1 : 2;
      const T = tier === 0 && this.near.k < this.near.mesh.instanceMatrix.count ? this.near : tier <= 1 && this.mid.k < this.mid.mesh.instanceMatrix.count ? this.mid : this.far;
      p.tier = T === this.near ? 0 : T === this.mid ? 1 : 2;
      this._p.set(p.x, this.y, p.z); this._q.setFromAxisAngle(this._up, p.heading); this._m.compose(this._p, this._q, this._s);
      T.put(p, this._m, moving ? p.speed * 5.2 : 0);
    }
    this.near.flush(); this.mid.flush(); this.far.flush();
  }
}
