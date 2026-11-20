// Visual effects system: pooled GPU particles (additive + alpha), tracers,
// impact marks, dynamic flash lights, explosions with debris, and weather.
import * as THREE from 'three';
import { softSprite } from './TextureFactory.js';
import { settings } from '../core/Settings.js';

const PARTICLE_VS = `
  attribute float size; attribute float alpha; attribute vec3 pcolor; attribute float rot;
  varying float vAlpha; varying vec3 vColor; varying float vRot;
  uniform float scale;
  #include <fog_pars_vertex>
  void main(){
    vAlpha = alpha; vColor = pcolor; vRot = rot;
    vec4 mvPosition = modelViewMatrix * vec4(position,1.0);
    gl_PointSize = size * scale / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const PARTICLE_FS = `
  uniform sampler2D map; uniform float tint; varying float vAlpha; varying vec3 vColor; varying float vRot;
  #include <fog_pars_fragment>
  void main(){
    vec2 c = gl_PointCoord - 0.5; float s = sin(vRot), co = cos(vRot);
    vec2 uv = vec2(c.x*co - c.y*s, c.x*s + c.y*co) + 0.5;
    vec4 t = texture2D(map, uv);
    gl_FragColor = vec4(vColor * t.rgb * tint, t.a * vAlpha);
    if (gl_FragColor.a < 0.01) discard;
    #include <fog_fragment>
  }`;

class ParticlePool {
  constructor(scene, max, texture, additive) {
    this.max = max; this.count = 0;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.col = new Float32Array(max * 3); this.rot = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: texture }, scale: { value: 600 }, tint: { value: 1 } }]),
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat.uniforms.map.value = texture;
    this.points = new THREE.Points(this.geo, this.mat); this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
    scene.add(this.points);
    this.parts = [];
  }
  spawn(p) {
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push({
      x: p.x, y: p.y, z: p.z, vx: p.vx || 0, vy: p.vy || 0, vz: p.vz || 0,
      life: p.life, age: 0, s0: p.size, s1: p.endSize ?? p.size, a0: p.alpha ?? 1, a1: p.endAlpha ?? 0,
      r: p.r ?? 1, g: p.g ?? 1, b: p.b ?? 1, grav: p.gravity ?? 0, drag: p.drag ?? 0, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * (p.spin ?? 1),
      fadeIn: p.fadeIn ?? 0,
    });
  }
  update(dt, viewportH) {
    this.mat.uniforms.scale.value = viewportH * 0.9;
    let n = 0;
    const alive = [];
    for (const q of this.parts) {
      q.age += dt; if (q.age >= q.life) continue;
      const k = q.age / q.life;
      q.vy -= q.grav * dt; const d = Math.max(0, 1 - q.drag * dt);
      q.vx *= d; q.vy *= d; q.vz *= d;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.rot += q.vr * dt;
      alive.push(q);
      this.pos[n * 3] = q.x; this.pos[n * 3 + 1] = q.y; this.pos[n * 3 + 2] = q.z;
      this.size[n] = q.s0 + (q.s1 - q.s0) * k;
      let a = q.a0 + (q.a1 - q.a0) * k; if (q.fadeIn > 0 && k < q.fadeIn) a *= k / q.fadeIn;
      this.alpha[n] = a; this.col[n * 3] = q.r; this.col[n * 3 + 1] = q.g; this.col[n * 3 + 2] = q.b; this.rot[n] = q.rot;
      n++;
    }
    this.parts = alive; this.count = n;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'size', 'alpha', 'pcolor', 'rot']) this.geo.attributes[k].needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    const budget = { low: 0.4, medium: 0.7, high: 1 }[settings.data.graphics.effects] ?? 1;
    this.budget = budget;
    this.smoke = new ParticlePool(scene, Math.floor(1400 * budget), softSprite('smoke'), false);
    this.fire = new ParticlePool(scene, Math.floor(1200 * budget), softSprite('spark'), true);
    this.flashSprites = new ParticlePool(scene, 64, softSprite('flash'), true);
    this.setSmokeLight(1);
    // tracers
    this.tracers = [];
    const tg = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true); tg.rotateX(Math.PI / 2); tg.translate(0, 0, 0.5);
    this.tracerGeo = tg;
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    // impact marks (non-gore scorch/dust decals)
    this.decals = [];
    this.decalGeo = new THREE.CircleGeometry(0.05, 8);
    this.decalMat = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 1, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
    this.scorchMat = new THREE.MeshStandardMaterial({ color: 0x0a0908, roughness: 1, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
    // dynamic lights pool
    this.lights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffaa55, 0, 12, 2); l.castShadow = false; scene.add(l); this.lights.push({ l, t: 0, dur: 0, peak: 0 }); }
    // debris
    this.debris = [];
    this.debrisGeo = new THREE.BoxGeometry(0.12, 0.08, 0.1);
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x3a3631, roughness: 0.95 });
    this.emitters = [];
    this.groundFn = null;
  }

  // scene light level for unlit smoke/dust (night ≈ 0.3, day = 1)
  setSmokeLight(v) { this.smoke.mat.uniforms.tint.value = v; }

  flashLight(pos, color = 0xffaa55, intensity = 6, dur = 0.06, range = 10) {
    const slot = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    slot.l.position.copy(pos); slot.l.color.setHex(color); slot.l.distance = range;
    slot.t = dur; slot.dur = dur; slot.peak = intensity; slot.l.intensity = intensity;
  }

  muzzleFlash(pos, dir) {
    this.flashSprites.spawn({ x: pos.x, y: pos.y, z: pos.z, size: 0.55, endSize: 0.7, life: 0.05, alpha: 1, endAlpha: 0 });
    this.flashLight(pos, 0xffb060, 4, 0.05, 6);
    for (let i = 0; i < 2 * this.budget; i++) this.smoke.spawn({ x: pos.x + dir.x * 0.2, y: pos.y, z: pos.z + dir.z * 0.2, vx: dir.x * 1.5 + (Math.random() - .5) * .3, vy: 0.3 + Math.random() * .3, vz: dir.z * 1.5,
      size: 0.25, endSize: 0.9, life: 0.7, alpha: 0.18, endAlpha: 0, r: 0.8, g: 0.8, b: 0.8, drag: 2 });
  }

  tracer(from, to, speed = 380) {
    if (Math.random() > 0.55) return;
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    const dir = to.clone().sub(from); const len = dir.length(); dir.normalize();
    m.position.copy(from); m.lookAt(to); m.scale.set(1, 1, Math.min(6, len));
    this.scene.add(m);
    this.tracers.push({ m, from: from.clone(), dir, len, d: 0, speed });
  }

  impact(point, normal, surface = 'concrete') {
    const dust = { concrete: [0.7, 0.68, 0.64], dirt: [0.45, 0.38, 0.3], snow: [0.95, 0.95, 1], metal: [0.6, 0.6, 0.6], wood: [0.55, 0.45, 0.32], flesh: [0.5, 0.5, 0.48] }[surface] || [0.6, 0.6, 0.6];
    const n = Math.ceil(5 * this.budget);
    for (let i = 0; i < n; i++) this.smoke.spawn({
      x: point.x, y: point.y, z: point.z,
      vx: normal.x * (1 + Math.random() * 2) + (Math.random() - .5), vy: normal.y * (1 + Math.random() * 2) + Math.random() * .8, vz: normal.z * (1 + Math.random() * 2) + (Math.random() - .5),
      size: 0.12, endSize: 0.7 + Math.random() * 0.5, life: 0.6 + Math.random() * 0.6, alpha: 0.5, endAlpha: 0, r: dust[0], g: dust[1], b: dust[2], drag: 3, gravity: 0.5,
    });
    if (surface === 'metal' || surface === 'concrete') for (let i = 0; i < 3 * this.budget; i++) this.fire.spawn({
      x: point.x, y: point.y, z: point.z, vx: normal.x * 4 + (Math.random() - .5) * 4, vy: normal.y * 4 + Math.random() * 3, vz: normal.z * 4 + (Math.random() - .5) * 4,
      size: 0.05, endSize: 0.02, life: 0.25 + Math.random() * 0.2, gravity: 9, r: 1, g: 0.8, b: 0.5,
    });
    if (surface !== 'flesh' && surface !== 'snow') this.addDecal(point, normal, this.decalMat, 0.6 + Math.random() * 0.6);
  }

  hitPuff(point) { // non-gore hit feedback on characters: fabric dust puff
    for (let i = 0; i < 4; i++) this.smoke.spawn({ x: point.x, y: point.y, z: point.z, vx: (Math.random() - .5) * 1.2, vy: Math.random() * 0.8, vz: (Math.random() - .5) * 1.2,
      size: 0.1, endSize: 0.45, life: 0.45, alpha: 0.45, endAlpha: 0, r: 0.55, g: 0.53, b: 0.48, drag: 4 });
  }

  addDecal(point, normal, mat, scale = 1) {
    const d = new THREE.Mesh(this.decalGeo, mat);
    d.position.copy(point).addScaledVector(normal, 0.01);
    d.lookAt(point.clone().add(normal)); d.rotateZ(Math.random() * 6.28); d.scale.setScalar(scale);
    this.scene.add(d); this.decals.push(d);
    const maxDecals = Math.floor(160 * this.budget);
    while (this.decals.length > maxDecals) { const o = this.decals.shift(); this.scene.remove(o); }
  }

  explosion(pos, scale = 1, opts = {}) {
    const b = this.budget;
    this.flashLight(pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff9a40, 40 * scale, 0.35, 30 * scale);
    this.flashSprites.spawn({ x: pos.x, y: pos.y + 0.8, z: pos.z, size: 7 * scale, endSize: 10 * scale, life: 0.12 });
    for (let i = 0; i < 40 * b * scale; i++) {
      const a = Math.random() * 6.28, up = Math.random();
      this.fire.spawn({ x: pos.x, y: pos.y + 0.4, z: pos.z, vx: Math.cos(a) * (2 + Math.random() * 5) * scale, vy: (2 + up * 7) * scale, vz: Math.sin(a) * (2 + Math.random() * 5) * scale,
        size: (1.2 + Math.random()) * scale, endSize: 0.3 * scale, life: 0.35 + Math.random() * 0.4, r: 1, g: 0.6 + Math.random() * 0.25, b: 0.25, drag: 3, gravity: 2 });
    }
    for (let i = 0; i < 26 * b * scale; i++) {
      const a = Math.random() * 6.28;
      this.smoke.spawn({ x: pos.x + (Math.random() - .5), y: pos.y + 0.5, z: pos.z + (Math.random() - .5),
        vx: Math.cos(a) * (1 + Math.random() * 3) * scale, vy: (1.5 + Math.random() * 4) * scale, vz: Math.sin(a) * (1 + Math.random() * 3) * scale,
        size: 1.5 * scale, endSize: (6 + Math.random() * 4) * scale, life: 3 + Math.random() * 3, alpha: 0.75, endAlpha: 0, r: 0.22, g: 0.21, b: 0.2, drag: 1.2, fadeIn: 0.05 });
    }
    for (let i = 0; i < 18 * b * scale; i++) {
      const a = Math.random() * 6.28;
      this.smoke.spawn({ x: pos.x, y: pos.y + 0.1, z: pos.z, vx: Math.cos(a) * 8 * scale, vy: 0.4, vz: Math.sin(a) * 8 * scale,
        size: 1 * scale, endSize: 4 * scale, life: 1.6, alpha: 0.55, endAlpha: 0, r: opts.snow ? 0.9 : 0.45, g: opts.snow ? 0.9 : 0.4, b: opts.snow ? 0.92 : 0.33, drag: 2.5 });
    }
    const nd = Math.floor(14 * b * scale);
    for (let i = 0; i < nd; i++) {
      const m = new THREE.Mesh(this.debrisGeo, this.debrisMat); m.castShadow = false;
      m.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0)); this.scene.add(m);
      const a = Math.random() * 6.28;
      this.debris.push({ m, v: new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 6), 4 + Math.random() * 8, Math.sin(a) * (2 + Math.random() * 6)).multiplyScalar(scale),
        av: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10), life: 6 });
      if (this.debris.length > 120) { const o = this.debris.shift(); this.scene.remove(o.m); }
    }
    const gy = this.groundFn ? this.groundFn(pos.x, pos.z) : pos.y;
    if (Math.abs(gy - pos.y) < 0.6) this.addDecal(new THREE.Vector3(pos.x, gy, pos.z), new THREE.Vector3(0, 1, 0), this.scorchMat, 28 * scale);
  }

  // continuous emitters: burning wreck, chimney smoke, flare, dust etc.
  addEmitter(e) { const em = { rate: 10, acc: 0, ...e }; this.emitters.push(em); return em; }
  removeEmitter(em) { this.emitters = this.emitters.filter((x) => x !== em); }

  fireEmitter(pos, scale = 1) {
    return this.addEmitter({ pos: pos.clone(), rate: 24 * this.budget * scale, light: true, scale, spawn: (p, s) => {
      this.fire.spawn({ x: p.x + (Math.random() - .5) * s, y: p.y, z: p.z + (Math.random() - .5) * s, vx: (Math.random() - .5) * .3, vy: 1.4 + Math.random() * 1.5, vz: (Math.random() - .5) * .3,
        size: 0.9 * s, endSize: 0.2 * s, life: 0.6 + Math.random() * 0.5, r: 1, g: 0.5 + Math.random() * 0.25, b: 0.15, alpha: 0.9 });
      if (Math.random() < 0.45) this.smoke.spawn({ x: p.x, y: p.y + 1.2 * s, z: p.z, vx: (Math.random() - .5) * .4 + 0.3, vy: 1.5 + Math.random(), vz: (Math.random() - .5) * .4,
        size: 1.2 * s, endSize: 5 * s, life: 4 + Math.random() * 2, alpha: 0.5, endAlpha: 0, r: 0.12, g: 0.11, b: 0.11, fadeIn: 0.1, drag: 0.2 });
    } });
  }
  smokeColumn(pos, scale = 1, color = [0.2, 0.2, 0.2]) {
    return this.addEmitter({ pos: pos.clone(), rate: 5 * this.budget * scale, spawn: (p, s) => {
      this.smoke.spawn({ x: p.x + (Math.random() - .5) * 2 * s, y: p.y, z: p.z + (Math.random() - .5) * 2 * s, vx: 0.6 + Math.random() * .4, vy: 2 + Math.random(), vz: (Math.random() - .5) * .5,
        size: 3 * s, endSize: 14 * s, life: 9 + Math.random() * 4, alpha: 0.55, endAlpha: 0, r: color[0], g: color[1], b: color[2], fadeIn: 0.1, drag: 0.1 });
    } });
  }
  smokeGrenade(pos) {
    return this.addEmitter({ pos: pos.clone(), rate: 18 * this.budget, life: 22, spawn: (p) => {
      const a = Math.random() * 6.28;
      this.smoke.spawn({ x: p.x, y: p.y + 0.3, z: p.z, vx: Math.cos(a) * 1.5, vy: 0.6 + Math.random() * .6, vz: Math.sin(a) * 1.5,
        size: 1.5, endSize: 7, life: 8, alpha: 0.85, endAlpha: 0, r: 0.82, g: 0.82, b: 0.8, drag: 0.6, fadeIn: 0.05 });
    } });
  }

  update(dt) {
    const h = innerHeight;
    // emitters
    for (const e of this.emitters) {
      if (e.life != null) { e.life -= dt; if (e.life <= 0) { e.dead = true; continue; } }
      e.acc += dt * e.rate;
      while (e.acc > 1) { e.acc -= 1; e.spawn(e.pos, e.scale ?? 1); }
    }
    this.emitters = this.emitters.filter((e) => !e.dead);
    this.smoke.update(dt, h); this.fire.update(dt, h); this.flashSprites.update(dt, h);
    for (const s of this.lights) {
      if (s.t > 0) { s.t -= dt; s.l.intensity = s.peak * Math.max(0, s.t / s.dur); } else s.l.intensity = 0;
    }
    // tracers
    for (const t of this.tracers) {
      t.d += t.speed * dt;
      if (t.d >= t.len) { this.scene.remove(t.m); t.dead = true; continue; }
      t.m.position.copy(t.from).addScaledVector(t.dir, t.d);
      t.m.scale.z = Math.min(6, t.len - t.d);
    }
    this.tracers = this.tracers.filter((t) => !t.dead);
    for (const d of this.debris) {
      d.life -= dt;
      const gy = this.groundFn ? this.groundFn(d.m.position.x, d.m.position.z) : 0;
      if (d.m.position.y > gy + 0.04) {
        d.v.y -= 18 * dt; d.m.position.addScaledVector(d.v, dt);
        d.m.rotation.x += d.av.x * dt; d.m.rotation.y += d.av.y * dt;
      } else { d.m.position.y = gy + 0.04; d.v.set(0, 0, 0); }
      if (d.life <= 0) { this.scene.remove(d.m); d.dead = true; }
    }
    this.debris = this.debris.filter((d) => !d.dead);
  }
}

// Precipitation (snow/rain) that wraps around the camera
export class Weather {
  constructor(scene, kind = 'snow', density = 1) {
    this.kind = kind;
    const budget = { low: 0.35, medium: 0.65, high: 1 }[settings.data.graphics.effects] ?? 1;
    this.n = Math.floor((kind === 'rain' ? 9000 : 5000) * density * budget);
    this.box = kind === 'rain' ? 40 : 50;
    const pos = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n * 3; i++) pos[i] = (Math.random() - 0.5) * this.box;
    this.geo = new THREE.BufferGeometry(); this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.offsets = new Float32Array(this.n).map(() => Math.random() * 100);
    this.mat = new THREE.PointsMaterial({ map: softSprite('flake'), size: kind === 'rain' ? 0.05 : 0.09, transparent: true, opacity: kind === 'rain' ? 0.5 : 0.85, depthWrite: false, color: kind === 'rain' ? 0x9aa4b0 : 0xffffff, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, this.mat); this.points.frustumCulled = false; scene.add(this.points);
    this.wind = new THREE.Vector3(kind === 'rain' ? 1.2 : 0.8, 0, 0.3);
    this.t = 0;
  }
  update(dt, camPos) {
    this.t += dt;
    const p = this.geo.attributes.position.array; const B = this.box, half = B / 2;
    const fall = this.kind === 'rain' ? 14 : 1.4;
    for (let i = 0; i < this.n; i++) {
      const o = this.offsets[i];
      p[i * 3 + 1] -= fall * dt * (0.8 + (o % 1) * 0.4);
      p[i * 3] += (this.wind.x + (this.kind === 'snow' ? Math.sin(this.t + o) * 0.4 : 0)) * dt;
      p[i * 3 + 2] += (this.wind.z + (this.kind === 'snow' ? Math.cos(this.t * 0.7 + o) * 0.3 : 0)) * dt;
      for (let k = 0; k < 3; k++) {
        const rel = p[i * 3 + k] - camPos.getComponent(k);
        if (rel < -half) p[i * 3 + k] += B; else if (rel > half) p[i * 3 + k] -= B;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
