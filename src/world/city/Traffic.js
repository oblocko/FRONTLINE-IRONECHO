// Moving traffic for the planned city: cars drive along straight lanes (right-hand traffic), keep their
// distance to the car ahead, stop for signals at the junctions (north-south green → all red → east-west
// green → all red) and for the player standing in the lane. Every car type is drawn with three instanced
// meshes (paint / fixed parts / glass, see Cars.mergedType), so the whole fleet is ~20 draw calls.
import * as THREE from 'three';
import { mergedType, carType, carColor, TYPES } from '../korea/Cars.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CYCLE = [['ns', 16], ['red', 3], ['ew', 14], ['red', 3]];

export class Traffic {
  // opts: { y (road surface), maxCars }
  constructor(game, { y = 0, rnd = Math.random } = {}) { this.game = game; this.y = y; this.rnd = rnd; this.lanes = []; this.junctions = []; this.cars = []; this.t = 0; }
  // a straight lane from a to b ([x, z]); axis 'ns' | 'ew' decides which signal phase it obeys
  lane(a, b, { speed = 11, axis = null, count = 4, y = null, junctions = null } = {}) {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const L = { a, b, len, y, dir: [dx / len, dz / len], speed, axis: axis ?? (Math.abs(dz) > Math.abs(dx) ? 'ns' : 'ew'), cars: [], junctions };   // junctions: this lane's own (long lanes in the region), else all
    this.lanes.push(L);
    for (let i = 0; i < count; i++) this.addCar(L, (i + this.rnd() * 0.5) * len / count);
    return L;
  }
  // a signalised junction: the box cars must not enter on red (x0, z0, x1, z1)
  junction(x0, z0, x1, z1) { this.junctions.push({ x0, z0, x1, z1 }); }
  addCar(L, s) {
    const type = carType(this.rnd), c = { L, s, v: L.speed * (0.8 + this.rnd() * 0.3), type, len: TYPES[type].L, paint: new THREE.Color(carColor(this.rnd)), want: L.speed * (0.85 + this.rnd() * 0.3) };
    L.cars.push(c); this.cars.push(c);
  }
  build() {
    const scene = this.game.renderer.scene;
    this.mats = { paint: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.35, envMapIntensity: 1 }), glass: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.06, envMapIntensity: 1.3 }), fixed: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.6 }) };
    this.meshes = {};
    const byType = {}; for (const c of this.cars) (byType[c.type] ||= []).push(c);
    for (const [type, list] of Object.entries(byType)) {
      const G = mergedType(type); this.meshes[type] = {};
      for (const part of ['paint', 'glass', 'fixed']) {
        const im = new THREE.InstancedMesh(G[part], this.mats[part], list.length); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.castShadow = part === 'paint'; im.frustumCulled = false; im.userData.lodAlways = true; im.userData.traffic = true;
        list.forEach((c, i) => { c.slot = i; if (part !== 'fixed') im.setColorAt(i, part === 'paint' ? c.paint : new THREE.Color(0x1a2228)); });
        scene.add(im); this.meshes[type][part] = im;
      }
    }
    this.update(0);
  }
  phase() { let t = this.t % CYCLE.reduce((a, [, d]) => a + d, 0); for (const [p, d] of CYCLE) { if (t < d) return p; t -= d; } return 'red'; }
  update(dt) {
    this.t += dt; const phase = this.phase(), player = this.game.player?.position, m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0), sc = V(1, 1, 1);
    for (const L of this.lanes) {
      L.cars.sort((p, q2) => q2.s - p.s);   // front first
      for (let i = 0; i < L.cars.length; i++) {
        const c = L.cars[i], ahead = i > 0 ? L.cars[i - 1] : null;
        let limit = c.want;
        if (ahead) { const gap = ahead.s - c.s - (ahead.len + c.len) / 2; limit = Math.min(limit, Math.max(0, (gap - 3) * 1.2)); }
        // signals: stop before a junction box on red / the other axis' green
        const x = L.a[0] + L.dir[0] * c.s, z = L.a[1] + L.dir[1] * c.s;
        if (phase !== L.axis) for (const J of L.junctions ?? this.junctions) {
          const inside = (px, pz) => px > J.x0 && px < J.x1 && pz > J.z0 && pz < J.z1;
          if (inside(x, z)) continue;   // already in: clear it
          for (let d = 1; d < 22; d += 1.5) { if (inside(x + L.dir[0] * (d + c.len / 2), z + L.dir[1] * (d + c.len / 2))) { limit = Math.min(limit, Math.max(0, (d - 2) * 0.9)); break; } }
        }
        // the player standing in the lane ahead
        if (player) { const px = player.x - x, pz = player.z - z, along = px * L.dir[0] + pz * L.dir[1], side = Math.abs(-px * L.dir[1] + pz * L.dir[0]); if (along > 0 && along < 16 && side < 1.6) limit = Math.min(limit, Math.max(0, (along - c.len / 2 - 2) * 0.8)); }
        c.v += Math.max(-8 * dt, Math.min(2.5 * dt, limit - c.v)); c.v = Math.max(0, c.v); c.s += c.v * dt;
        if (c.s > L.len) { c.s -= L.len; }   // wraps to the lane start (the lanes end far from the player's streets)
        const cx = L.a[0] + L.dir[0] * c.s, cz = L.a[1] + L.dir[1] * c.s;
        // car geometry faces +z
        q.setFromAxisAngle(up, Math.atan2(L.dir[0], L.dir[1])); m.compose(V(cx, L.y ?? this.y, cz), q, sc);
        for (const part of ['paint', 'glass', 'fixed']) this.meshes[c.type][part].setMatrixAt(c.slot, m);
      }
    }
    for (const t of Object.values(this.meshes || {})) for (const im of Object.values(t)) im.instanceMatrix.needsUpdate = true;
  }
}
