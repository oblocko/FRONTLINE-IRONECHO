// Level: Central-front GOP sector (Mission 01).
// ~400 m × 410 m playable area: patrol road and southern boundary fence,
// GOP-3 company outpost, sensor line, OP Baekdu-3 hilltop bunker reached by a
// communication trench, an evacuated civilian-control-line village, and the
// southern rally point. Terrain is a precomputed 0.5 m heightfield with
// flattened compounds, road beds and carved trenches.
import * as THREE from 'three';
import { pbr } from '../../render/TextureFactory.js';
import { Sky } from '../../render/Sky.js';
import { Weather } from '../../render/Effects.js';
import { settings } from '../../core/Settings.js';
import { buildTruck, buildAPC, buildHelicopter } from '../Props.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- smooth value noise (non-tiled) ----
function hash2(x, z) { let h = x * 374761393 + z * 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), w = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
const fbm2 = (x, z, o = 4) => { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < o; i++) { s += vnoise(x * f, z * f) * a; t += a; a *= 0.5; f *= 2.03; } return s / t; };

// ---- layout ----
export const LAYOUT = {
  bounds: { minX: -200, maxX: 200, minZ: -175, maxZ: 230 },
  fenceZ: -58, breach: [84, 91],
  gp: V(0, 0, -28), op: V(76, 0, -37), village: V(82, 0, 64), rally: V(100, 0, 118),
  sensors: [V(-40, 0, -55.6), V(10, 0, -55.6), V(45, 0, -55.6)],
  truckRoute: [[-195, 40], [-150, 32], [-110, 20], [-70, 4], [-40, -8], [-18, -15], [-6, -15]],
  roads: [
    { pts: [[-205, 42], [-150, 32], [-110, 20], [-70, 4], [-40, -8], [-18, -15], [0, -16], [22, -12], [45, -2], [62, 14], [74, 38], [80, 62], [88, 90], [100, 118], [100, 235]], w: 6, mat: 'asphalt' },
    { pts: [[-205, -50], [205, -50]], w: 4.2, mat: 'dirt' },
    { pts: [[0, -16], [0, -47]], w: 4, mat: 'dirt' },
    { pts: [[100, 118], [150, 125], [205, 128]], w: 5, mat: 'asphalt' },
    { pts: [[80, 62], [40, 70], [-20, 80]], w: 4, mat: 'dirt' },
  ],
  trenches: [
    { pts: [[52, -47.5], [58, -45], [63, -42.5], [67.5, -40], [71, -38]], w: 2.0, d: 1.3 },
    { pts: [[71, -38], [71, -44], [78, -45.5], [85, -44], [88, -39]], w: 2.0, d: 1.25 },
  ],
  flats: [
    { x: 0, z: -29, r: 24, f: 10 }, { x: 82, z: 66, r: 38, f: 14 }, { x: 100, z: 120, r: 16, f: 10 }, { x: 77, z: -38, r: 9, f: 5 },
  ],
};

export class GopSector {
  constructor(game) { this.game = game; this.dawn = 0; this.flashes = []; this.lampLights = []; this.timers = []; }

  async build(progress = () => {}) {
    const g = this.game, world = g.world, props = g.props, scene = g.renderer.scene;
    const L = LAYOUT; world.bounds = { ...L.bounds };
    await this.buildTerrain(progress);
    progress(0.35, 'ATMOSPHERE');
    this.buildAtmosphere();
    progress(0.4, 'ROADS');
    for (const r of L.roads) this.roadRibbon(r);
    progress(0.5, 'FORTIFICATIONS');
    this.buildFenceLine();
    this.buildGP();
    this.buildOP();
    progress(0.65, 'VILLAGE');
    this.buildVillage();
    progress(0.8, 'VEGETATION');
    this.buildNature();
    this.buildRally();
    progress(0.95, 'VEHICLES');
    this.truck = buildTruck(); scene.add(this.truck); this.truck.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.weather = new Weather(scene, 'snow', 0.6);
    world.ladders = [];
  }

  // ---------------- terrain ----------------
  async buildTerrain(progress) {
    const L = LAYOUT, world = this.game.world;
    const res = 0.5, minX = -230, maxX = 230, minZ = -210, maxZ = 250;
    const nx = Math.round((maxX - minX) / res) + 1, nz = Math.round((maxZ - minZ) / res) + 1;
    const H = new Float32Array(nx * nz);
    const base = (x, z) => {
      let h = (fbm2(x * 0.012, z * 0.012, 4) - 0.5) * 9 + (fbm2(x * 0.05 + 7, z * 0.05, 3) - 0.5) * 1.6;
      h += smooth(-68, -170, z) * (14 + fbm2(x * 0.02, z * 0.02 + 30, 3) * 26);               // DMZ ridges
      h += 13 * Math.exp(-((x - 76) ** 2 + (z + 38) ** 2) / (2 * 15 ** 2));                       // OP hill
      h += 7 * Math.exp(-((x + 70) ** 2 + (z - 120) ** 2) / (2 * 40 ** 2));
      h += smooth(150, 220, Math.abs(x)) * 18 + smooth(180, 240, z) * 10;                          // edge hills
      return h;
    };
    for (let j = 0; j < nz; j++) { const z = minZ + j * res; for (let i = 0; i < nx; i++) H[j * nx + i] = base(minX + i * res, z); if (j % 80 === 0) { progress(0.05 + 0.15 * j / nz, 'TERRAIN'); await new Promise((r) => setTimeout(r, 0)); } }
    const at = (x, z) => H[Math.round((z - minZ) / res) * nx + Math.round((x - minX) / res)];
    // flatten compounds
    for (const f of L.flats) {
      const target = at(f.x, f.z);
      const R = f.r + f.f;
      for (let z = f.z - R; z <= f.z + R; z += res) for (let x = f.x - R; x <= f.x + R; x += res) {
        const d = Math.hypot(x - f.x, z - f.z); if (d > R) continue;
        const w = 1 - smooth(f.r, R, d); const k = Math.round((z - minZ) / res) * nx + Math.round((x - minX) / res);
        if (k >= 0 && k < H.length) H[k] = H[k] + (target - H[k]) * w;
      }
    }
    // road beds: smoothed centreline heights
    for (const r of L.roads) {
      const samples = []; const pts = r.pts;
      for (let s = 0; s < pts.length - 1; s++) { const [ax, az] = pts[s], [bx, bz] = pts[s + 1]; const len = Math.hypot(bx - ax, bz - az); const n = Math.ceil(len / 2); for (let i = 0; i < n; i++) { const t = i / n; samples.push([ax + (bx - ax) * t, az + (bz - az) * t]); } }
      samples.push(pts[pts.length - 1]);
      const hs = samples.map(([x, z]) => at(Math.max(minX, Math.min(maxX, x)), Math.max(minZ, Math.min(maxZ, z))));
      const sm = hs.map((_, i) => { let s = 0, c = 0; for (let k = -6; k <= 6; k++) { const v = hs[i + k]; if (v !== undefined) { s += v; c++; } } return s / c; });
      const hw = r.w / 2, fall = 3;
      for (let i = 0; i < samples.length; i++) {
        const [cx, cz] = samples[i];
        for (let z = cz - hw - fall; z <= cz + hw + fall; z += res) for (let x = cx - hw - fall; x <= cx + hw + fall; x += res) {
          const ii = Math.round((x - minX) / res), jj = Math.round((z - minZ) / res); if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const d = Math.hypot(x - cx, z - cz); if (d > hw + fall) continue;
          const w = 1 - smooth(hw, hw + fall, d); const k = jj * nx + ii; H[k] = H[k] + (sm[i] - H[k]) * w * 0.85;
        }
      }
    }
    // trenches: carve relative to local surface
    this.trenchSeg = [];
    for (const t of L.trenches) {
      for (let s = 0; s < t.pts.length - 1; s++) {
        const [ax, az] = t.pts[s], [bx, bz] = t.pts[s + 1]; this.trenchSeg.push({ ax, az, bx, bz, w: t.w });
        const minx = Math.min(ax, bx) - t.w, maxx = Math.max(ax, bx) + t.w, minz = Math.min(az, bz) - t.w, maxz = Math.max(az, bz) + t.w;
        for (let z = minz; z <= maxz; z += res) for (let x = minx; x <= maxx; x += res) {
          const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz; const tt = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
          const d = Math.hypot(x - (ax + dx * tt), z - (az + dz * tt)); if (d > t.w / 2 + 0.4) continue;
          const k = Math.round((z - minZ) / res) * nx + Math.round((x - minX) / res);
          const depth = t.d * (1 - smooth(t.w / 2 - 0.15, t.w / 2 + 0.4, d));
          const surf = H[k];
          if (!this._trenchBase) this._trenchBase = new Map();
          if (!this._trenchBase.has(k)) this._trenchBase.set(k, surf);
          H[k] = Math.min(H[k], this._trenchBase.get(k) - depth);
        }
      }
    }
    // spoil berms beside trenches (parapet)
    const hf = (x, z) => {
      const fx = (x - minX) / res, fz = (z - minZ) / res; const i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
      const u = Math.min(1, Math.max(0, fx - i)), w = Math.min(1, Math.max(0, fz - j));
      const a = H[j * nx + i], b = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1];
      return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
    };
    const roadDist = (x, z) => { let best = 1e9, mat = null; for (const r of L.roads) { const p = r.pts; for (let s = 0; s < p.length - 1; s++) { const [ax, az] = p[s], [bx, bz] = p[s + 1]; const dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); const d = Math.hypot(x - ax - dx * t, z - az - dz * t) - r.w / 2; if (d < best) { best = d; mat = r.mat; } } } return [best, mat]; };
    const surf = (x, z) => { const [d, m] = roadDist(x, z); if (d < 0) return m === 'asphalt' ? 'concrete' : 'gravel'; return 'snow'; };
    world.setTerrain(hf, surf);
    this.hf = hf;
    // ----- render mesh (chunked, 1 m) -----
    progress(0.25, 'TERRAIN MESH');
    const mat = pbr('snowground', { repeat: [1, 1], color: 0xc4c9d2 }); // slightly grey the photo snow so it isn't blown out at night
    const CH = 4, sx = (L.bounds.maxX - L.bounds.minX + 40) / CH, sz = (L.bounds.maxZ - L.bounds.minZ + 40) / CH;
    const ox = L.bounds.minX - 20, oz = L.bounds.minZ - 20;
    for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CH; ci++) {
      const seg = Math.round(sx);
      const geo = new THREE.PlaneGeometry(sx, sz, seg, Math.round(sz)); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position, uv = geo.attributes.uv;
      const cx = ox + (ci + 0.5) * sx, cz = oz + (cj + 0.5) * sz;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) + cx, z = p.getZ(i) + cz; p.setXYZ(i, x, hf(x, z), z); uv.setXY(i, x / 7, z / 7); }
      geo.computeVertexNormals(); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; this.game.renderer.scene.add(m);
      await new Promise((r) => setTimeout(r, 0));
    }
    // far mountains ring
    const far = new THREE.PlaneGeometry(2200, 2200, 110, 110); far.rotateX(-Math.PI / 2);
    const fp = far.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i), z = fp.getZ(i); const inside = x > L.bounds.minX - 25 && x < L.bounds.maxX + 25 && z > L.bounds.minZ - 25 && z < L.bounds.maxZ + 25;
      const d = Math.max(Math.abs(x) - 200, z < 0 ? -z - 180 : z - 230, 0);
      fp.setY(i, inside ? -30 : (fbm2(x * 0.004, z * 0.004, 4) * 120 * smooth(0, 400, d) + (z < 0 ? smooth(0, 300, -z) * 70 : 0) + hf(Math.max(-229, Math.min(229, x)), Math.max(-209, Math.min(249, z))) * (1 - smooth(0, 60, d))));
    }
    far.computeVertexNormals();
    const fm = new THREE.Mesh(far, new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 1 })); fm.receiveShadow = false; this.game.renderer.scene.add(fm);
  }

  roadRibbon(r) {
    const hf = this.hf; const pts = [];
    for (let s = 0; s < r.pts.length - 1; s++) { const [ax, az] = r.pts[s], [bx, bz] = r.pts[s + 1]; const len = Math.hypot(bx - ax, bz - az); const n = Math.max(1, Math.ceil(len / 1.5)); for (let i = 0; i < n; i++) { const t = i / n; pts.push([ax + (bx - ax) * t, az + (bz - az) * t]); } }
    pts.push(r.pts.at(-1));
    const pos = [], uv = [], idx = []; let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i]; const [px, pz] = pts[Math.max(0, i - 1)], [qx, qz] = pts[Math.min(pts.length - 1, i + 1)];
      let dx = qx - px, dz = qz - pz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const nxv = -dz * r.w / 2, nzv = dx * r.w / 2;
      if (i > 0) dist += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      for (const s of [-1, 1]) { const vx = x + nxv * s, vz = z + nzv * s; pos.push(vx, hf(vx, vz) + 0.05, vz); uv.push((s + 1) / 2 * r.w / 4, dist / 4); }
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const mat = r.mat === 'asphalt' ? pbr('asphalt', { color: 0xc8c8c8 }) : pbr('dirt', { color: 0xd0c8c0 });
    const m = new THREE.Mesh(geo, mat); m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; m.receiveShadow = true; this.game.renderer.scene.add(m);
    // light snow dusting on road edges handled by fog/lighting
  }

  buildAtmosphere() {
    const g = this.game, scene = g.renderer.scene;
    scene.fog = new THREE.FogExp2(0x161c25, 0.011);
    scene.environment = this.game.renderer.envMap; scene.environmentIntensity = 0.22;
    this.sky = new Sky(scene, { zenith: 0x050912, horizon: 0x252d3a, stars: 0.75, sunDir: [0.35, 0.3, -0.85], sunColor: 0xc8d6ff, sunSize: 0.99975 });
    this.sky.uniforms.glowDir.value.set(0.1, 0, -1);
    // snow-covered ground bounces a lot of moonlight back up: bright ground colour
    this.hemi = new THREE.HemisphereLight(0x6f80a4, 0x4a5262, 0.8); scene.add(this.hemi);
    const fill = new THREE.DirectionalLight(0x8090b8, 0.35); fill.position.set(-60, 30, 80); scene.add(fill);
    const moon = new THREE.DirectionalLight(0xa9bce8, 0.85);
    const sh = settings.data.graphics.shadows;
    moon.castShadow = sh !== 'off';
    const size = { medium: 1024, high: 2048, ultra: 4096 }[sh] || 1024;
    moon.shadow.mapSize.set(size, size); Object.assign(moon.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 220 });
    moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.03;
    scene.add(moon); scene.add(moon.target);
    g.sun = moon; g.sunOffset = V(40, 70, -50);
    g.renderer.renderer.toneMappingExposure = 1.25;
    // distant battle flash light (north horizon)
    this.horizonLight = new THREE.PointLight(0xff8a40, 0, 600, 1.2); this.horizonLight.position.set(0, 40, -260); scene.add(this.horizonLight);
  }

  // ---------------- fence & sensors ----------------
  buildFenceLine() {
    const p = this.game.props, L = LAYOUT, z = L.fenceZ;
    p.fence(-200, z, L.breach[0], z); p.fence(L.breach[1], z, 200, z);
    // inner (second) fence line, breached at the same point
    p.fence(-200, z - 6, L.breach[0], z - 6, { height: 2.6 }); p.fence(L.breach[1], z - 6, 200, z - 6, { height: 2.6 });
    // breach: cut wire lying on ground
    const wire = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.01, 3, 12), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.4 }));
    for (let i = 0; i < 10; i++) { const w = wire.clone(); w.position.set(L.breach[0] + 0.5 + i * 0.6, this.hf(86, z) + 0.05, z + (Math.random() - 0.5)); w.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.6; this.game.renderer.scene.add(w); }
    // warning signs along the fence
    for (const x of [-120, -60, 30, 120]) p.sign(x, z + 1.2, '경고', { sub: '군사시설 · 접근 시 발포함', rotY: Math.PI, height: 1.3, w: 1.4, h: 0.7 });
    p.sign(-90, z + 1.2, '지뢰', { sub: 'MINE', rotY: Math.PI, height: 1.0, w: 0.8, h: 0.6 });
    // sensors
    this.sensors = L.sensors.map((s) => { const st = this.game.props.sensorPost(s.x, s.z); st.pos = V(s.x, this.hf(s.x, s.z) + 1.4, s.z); return st; });
    // watchtowers
    this.towers = [p.watchtower(-12, -52), p.watchtower(32, -52), p.watchtower(-90, -52, { light: false }), p.watchtower(130, -52)];
  }

  // ---------------- GOP-3 outpost ----------------
  buildGP() {
    const p = this.game.props, w = this.game.world, scene = this.game.renderer.scene;
    const plaster = pbr('plaster', { color: 0xd8d4c4 }); const greenWall = pbr('plaster', { color: 0x9aa58a, key: 'gpgreen' });
    this.barracks = p.building({ x: 2, z: -24, w: 16, d: 8, h: 3.2, wall: greenWall, roof: 'flat', light: { intensity: 5 }, lit: true,
      doors: [{ side: 's', at: -4, width: 1.4 }, { side: 'e', at: 0, width: 1.3 }], windows: [{ side: 's', at: 2, width: 1.6 }, { side: 's', at: 5.5, width: 1.6 }, { side: 'n', at: -3, width: 1.4 }, { side: 'n', at: 3, width: 1.4 }] });
    this.cmd = p.building({ x: -14, z: -32, w: 7, d: 6, h: 3, wall: plaster, roof: 'flat', light: { intensity: 4, color: 0xd8ecff }, lit: true, doors: [{ side: 'e', at: 1, width: 1.2 }], windows: [{ side: 's', at: 0, width: 1.4 }] });
    // interior props
    const fl = this.barracks.userData.floorY;
    for (let i = 0; i < 4; i++) { p.box(V(0.9, 0.5, 2), V(-5 + i * 2.5, fl + 0.25, -26), pbr('fabric', { color: 0x4a5040 }), { surface: 'wood' }); }
    p.box(V(2, 0.8, 0.9), V(6, fl + 0.4, -21.3), pbr('wood'), { surface: 'wood' });
    this.cmdRadio = p.radioSet(-15, this.cmd.userData.floorY + 0.8, -34, 0);
    p.box(V(2.4, 0.78, 1), V(-15, this.cmd.userData.floorY + 0.39, -34), pbr('wood', { color: 0x6a5a48 }), { surface: 'wood' });
    // generator shed
    p.building({ x: 13, z: -33, w: 4, d: 3, h: 2.4, wall: pbr('corrugated', { color: 0x7a8070 }), roof: 'flat', doors: [{ side: 'w', at: 0, width: 1.2 }] });
    this.genPos = V(13, this.hf(13, -33) + 1, -33);
    // compound fence & gate
    p.fence(-22, -12, -22, -45, { height: 2.2, wire: false }); p.fence(24, -12, 24, -45, { height: 2.2, wire: false });
    p.fence(-22, -12, -7, -12, { height: 2.2, wire: false }); p.fence(7, -12, 24, -12, { height: 2.2, wire: false });
    // gate barrier
    const bar = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0xd8d0c0 })); bar.position.set(-25, this.hf(-25, -15) + 1.0, -15); bar.rotation.y = Math.PI / 2; scene.add(bar);
    p.sign(-27, -11, '제3소초', { sub: 'GOP 3RD OUTPOST', bg: '#2f4a33', rotY: Math.PI / 2 + 0.3, w: 2.2, h: 0.9 });
    // sandbag positions and jersey barriers
    p.sandbagWall(-6, -44, 5, 3); p.sandbagWall(8, -44, 5, 3); p.sandbagWall(-19, -40, 3, 3, 1);
    p.jerseyBarrier(-12, -16, 0); p.jerseyBarrier(-12, -19.5, 0);
    for (const [x, z] of [[18, -20], [19, -18.8], [17.6, -18.4]]) p.barrel(x, z);
    p.crate(-8, -36); p.crate(-8, -37.2, 0.8); p.ammoBox(-7, -38);
    this.game.propLib?.place('utility_box_01', 9.5, -28.6, { rotQ: 3 }); this.game.propLib?.place('metal_jerrycan_green', 11, -31, { yawJitter: 1, collide: false });
    this.ammoCrateGP = V(-8, this.hf(-8, -36) + 0.9, -36);
    // lights (switch off at blackout)
    for (const [x, z] of [[-10, -18], [12, -18], [0, -40], [-18, -38]]) { const l = p.streetLamp(x, z); this.lampLights.push(l); }
    this.interiorLights = [this.barracks.userData, this.cmd.userData];
    // flagpole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 8, 8), pbr('metal')); pole.position.set(-4, this.hf(-4, -16) + 4, -16); scene.add(pole);
    // vehicles parked
    const t2 = buildTruck(); t2.remove(t2.userData.cargoLamp); t2.position.set(16, this.hf(16, -26), -26); t2.rotation.y = Math.PI; scene.add(t2);
    w.addBoxCentered(V(16, this.hf(16, -26) + 1.4, -26), V(2.5, 2.8, 8), { surface: 'metal' });
  }

  // ---------------- OP Baekdu-3 ----------------
  buildOP() {
    const p = this.game.props, scene = this.game.renderer.scene, L = LAYOUT;
    const conc = pbr('concrete', { color: 0x9a9a92, key: 'op' });
    this.opBunker = p.building({ x: 77, z: -36, w: 6.5, d: 5, h: 2.4, wall: conc, roof: 'flat', light: { intensity: 2.2, color: 0xffd0a0 }, lit: false,
      doors: [{ side: 'w', at: -1, width: 1.2 }], windows: [{ side: 'n', at: -1.5, width: 1.4, sill: 1.2, height: 0.35 }, { side: 'n', at: 1.5, width: 1.4, sill: 1.2, height: 0.35 }, { side: 'e', at: 0, width: 1.2, sill: 1.2, height: 0.35 }] });
    const fy = this.opBunker.userData.floorY;
    // earth cover on roof
    const mound = new THREE.Mesh(new THREE.SphereGeometry(4.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), pbr('snowground', { repeat: [1, 1] })); mound.scale.set(1, 0.22, 0.85); mound.position.set(77, fy + 2.7, -36); mound.castShadow = true; mound.receiveShadow = true; scene.add(mound);
    // interior: table + radio + map board
    p.box(V(1.8, 0.75, 0.8), V(78.5, fy + 0.37, -34.2), pbr('wood', { color: 0x5e5040 }), { surface: 'wood' });
    this.opRadio = p.radioSet(78.5, fy + 0.75, -34.2, Math.PI);
    this.opRadio.pos = V(78.5, fy + 1.1, -34.2);
    p.box(V(0.6, 1.6, 0.4), V(75, fy + 0.8, -37.8), pbr('paintedMetal', { color: 0x4a5540 }), { surface: 'metal' });
    // antenna mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 9, 6), pbr('metal')); mast.position.set(81.5, fy + 4.5, -38.5); scene.add(mast);
    // fighting positions around OP (along trench 2)
    p.sandbagWall(74, -47.2, 4, 3, 0, this.hf(74, -47) + 0.0); p.sandbagWall(82, -47.4, 4, 3, 0, this.hf(82, -47));
    p.sandbagWall(89.5, -41, 3, 3, 1, this.hf(89.5, -41));
    p.sandbagWall(70, -32, 3, 2, 1); p.sandbagWall(84, -31, 4, 2, 0);
    p.crate(72.5, -33); p.ammoBox(73.2, -34.2);
    this.ammoCrateOP = V(72.5, this.hf(72.5, -33) + 0.9, -33);
    const lib = this.game.propLib;
    if (lib) {
      lib.place('metal_jerrycan_green', 73.6, -32.4, { yawJitter: 1, collide: false }); lib.place('metal_jerrycan_green', 74.1, -32.2, { yawJitter: 1, collide: false });
      lib.place('medical_box', 79.5, -34.3, { y: this.opBunker.userData.floorY, collide: false });
      lib.place('ammo_box', 77.4, -45.7, { yawJitter: 0.6, collide: false }); lib.place('ammo_box', 80.8, -45.9, { yawJitter: 0.6, collide: false });
      lib.place('old_military_crate', 86, -33, { rotQ: 1 });
    }
    // camo net
    const net = new THREE.Mesh(new THREE.PlaneGeometry(8, 6, 8, 6), new THREE.MeshStandardMaterial({ color: 0x4a4f3a, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.85, alphaTest: 0.2 }));
    const np = net.geometry.attributes.position; for (let i = 0; i < np.count; i++) np.setZ(i, Math.sin(i * 1.7) * 0.15);
    net.rotation.x = -Math.PI / 2; net.position.set(84, this.hf(84, -31) + 2.3, -31); net.castShadow = true; scene.add(net);
    for (const [x, z] of [[80.5, -28.5], [87.5, -28.5], [80.5, -33.5], [87.5, -33.5]]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 5), pbr('wood')); post.position.set(x, this.hf(x, z) + 1.15, z); scene.add(post); }
    p.trenchWalls(L.trenches[0].pts, 2.0, 1.3); p.trenchWalls(L.trenches[1].pts, 2.0, 1.25);
    // OP sign
    p.sign(70, -40.5, 'OP 백두-3', { bg: '#2f4a33', rotY: -Math.PI / 2, w: 1.6, h: 0.6, height: 1.0 });
  }

  // ---------------- civilian-control-line village ----------------
  buildVillage() {
    const p = this.game.props, scene = this.game.renderer.scene;
    const walls = [pbr('plaster', { color: 0xe0dccd, key: 'v1' }), pbr('brick', { color: 0xc8a898 }), pbr('plaster', { color: 0xc9d0c4, key: 'v2' })];
    const roofCols = [0x3a5068, 0x6a3a32, 0x3c5a48, 0x50545a];
    const houses = [
      { x: 62, z: 48, w: 9, d: 7, rotQ: 0, doors: [{ side: 's', at: 1.5, width: 1.2 }, { side: 'n', at: -2, width: 1.1 }], windows: [{ side: 's', at: -2.5, width: 1.6 }, { side: 'e', at: 0, width: 1.2 }] },
      { x: 74, z: 46, w: 7, d: 6, rotQ: 0, doors: [{ side: 's', at: 0, width: 1.2 }], windows: [{ side: 'w', at: 0, width: 1.2 }, { side: 'n', at: 1, width: 1.4 }] },
      { x: 96, z: 48, w: 10, d: 7, rotQ: 0, doors: [{ side: 'w', at: 1, width: 1.2 }, { side: 's', at: -3, width: 1.2 }], windows: [{ side: 's', at: 2, width: 1.8 }, { side: 'n', at: 0, width: 1.6 }] },
      { x: 60, z: 70, w: 8, d: 7, rotQ: 1, doors: [{ side: 's', at: 0, width: 1.2 }], windows: [{ side: 'e', at: 1.5, width: 1.4 }, { side: 'w', at: -1, width: 1.4 }] },
      { x: 99, z: 70, w: 9, d: 6, rotQ: 0, doors: [{ side: 'w', at: 0, width: 1.2 }], windows: [{ side: 'n', at: -2, width: 1.5 }, { side: 's', at: 2, width: 1.5 }] },
      { x: 104, z: 88, w: 8, d: 6, rotQ: 0, doors: [{ side: 'w', at: -1, width: 1.2 }], windows: [{ side: 'n', at: 1, width: 1.5 }] },
    ];
    this.houses = houses.map((h, i) => p.building({ ...h, h: 2.8, wall: walls[i % 3], roof: 'hip', roofColor: roofCols[i % 4], roofHeight: 1.5 + (i % 2) * 0.3 }));
    // village hall (2-storey look, flat roof) and shop with signage
    this.hall = p.building({ x: 80, z: 86, w: 14, d: 9, h: 3.6, wall: pbr('plaster', { color: 0xd6d2c2, key: 'hall' }), roof: 'flat', doors: [{ side: 'n', at: 0, width: 2 }, { side: 'w', at: 2, width: 1.2 }], windows: [{ side: 'n', at: -4.5, width: 2 }, { side: 'n', at: 4.5, width: 2 }, { side: 'e', at: 0, width: 1.6 }] });
    p.sign(80, 81.0, '대암리 마을회관', { bg: '#e8e4d8', fg: '#2a3a5a', rotY: Math.PI, w: 3.2, h: 0.7, height: 3.0 });
    this.shop = p.building({ x: 66, z: 90, w: 8, d: 6, h: 3, wall: pbr('plaster', { color: 0xe6e2d2, key: 'shop' }), roof: 'flat', doors: [{ side: 'n', at: 0, width: 1.8 }], windows: [{ side: 'n', at: -2.6, width: 1.8 }, { side: 'n', at: 2.6, width: 1.8 }] });
    p.sign(66, 86.8, '대암상회', { sub: '식품 · 잡화 · 농자재', bg: '#1d4f8a', rotY: Math.PI, w: 3, h: 0.8, height: 3.2 });
    // low stone/block yard walls (cover)
    const blk = pbr('concrete', { color: 0xb0aca0, key: 'blk' });
    const wall = (x, z, len, rot) => { const sx = rot ? 0.3 : len, sz = rot ? len : 0.3; p.box(V(sx, 1.15, sz), V(x, this.hf(x, z) + 0.57, z), blk, { surface: 'concrete' }); };
    wall(62, 54, 9, 0); wall(57, 50, 6, 1); wall(74, 51, 6, 0); wall(96, 54, 8, 0); wall(101.5, 51, 5, 1);
    wall(66, 70, 6, 1); wall(93, 70, 5, 1); wall(99, 75, 8, 0); wall(86, 58, 4, 0); wall(76, 66, 4, 1);
    wall(104, 83, 7, 0);
    // vinyl greenhouses
    const gm = new THREE.MeshStandardMaterial({ color: 0xdfe8e8, transparent: true, opacity: 0.35, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false });
    for (const [x, z] of [[118, 54], [118, 62], [118, 70]]) {
      const geo = new THREE.CylinderGeometry(2.4, 2.4, 16, 14, 1, true, 0, Math.PI); geo.rotateX(Math.PI / 2); geo.rotateZ(Math.PI / 2); geo.rotateY(Math.PI / 2);
      const gh = new THREE.Mesh(geo, gm); gh.position.set(x, this.hf(x, z), z); scene.add(gh);
      for (let k = -7; k <= 7; k += 3.5) { const arc = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.025, 3, 14, Math.PI), pbr('metal')); arc.position.set(x + k, this.hf(x, z), z); arc.rotation.y = Math.PI / 2; scene.add(arc); }
      this.game.world.addBoxCentered(V(x, this.hf(x, z) + 1.2, z), V(16, 2.4, 4.6), { surface: 'metal', cover: false });
    }
    // utility poles + wires along the road
    const poles = [[70, 30], [76, 52], [84, 74], [92, 98], [99, 112]].map(([x, z]) => p.utilityPole(x + 4, z));
    for (let i = 0; i < poles.length - 1; i++) { p.wire(poles[i], poles[i + 1]); p.wire(poles[i].clone().add(V(0.7, 0, 0)), poles[i + 1].clone().add(V(0.7, 0, 0))); }
    // abandoned civilian 1-ton truck and props
    const civ = buildTruck({ model: false }); civ.remove(civ.userData.cargoLamp); civ.scale.set(0.7, 0.7, 0.7); civ.position.set(88, this.hf(88, 60), 60); civ.rotation.y = 0.4; scene.add(civ);
    civ.traverse((o) => { if (o.isMesh && o.material?.color && o.material.map) { o.material = o.material.clone(); o.material.color.setHex(0x5a7aa8); } });
    this.game.world.addBoxCentered(V(88, this.hf(88, 60) + 1, 60), V(2.2, 2, 4.4), { surface: 'metal' });
    for (const [x, z] of [[70, 58], [71, 58.8], [92, 82]]) p.barrel(x, z, { color: 0x2f5a8a });
    p.crate(58, 60); p.crate(103, 62); p.crate(83, 76); p.crate(84.2, 76.3, 0.8);
    const lib = this.game.propLib;
    if (lib) {
      for (const [x, z] of [[67.5, 51.2], [101.5, 67], [94, 51.5], [63.5, 73.5]]) lib.place('propane_tank', x, z, { yawJitter: 2 });
      lib.place('utility_box_02', 77.5, 81, { rotQ: 2, surface: 'metal' }); lib.place('utility_box_01', 71, 58.6, { rotQ: 0 });
      for (const [x, z] of [[73, 92.5], [86.5, 92], [92.5, 59.5]]) lib.place('metal_trash_can', x, z, { scale: 0.55, yawJitter: 0.4 });
      lib.place('plastic_jerrycan', 89.6, 57.8, { yawJitter: 2, collide: false }); lib.place('plastic_jerrycan', 102.5, 73.5, { yawJitter: 2, collide: false });
    }
    // kimchi pots (jangdokdae) — clay jars cluster
    const clay = new THREE.MeshStandardMaterial({ color: 0x5a3626, roughness: 0.45, metalness: 0.05 });
    for (let i = 0; i < 7; i++) { const jar = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), clay); const x = 56 + (i % 4) * 0.75, z = 74 + Math.floor(i / 4) * 0.75; jar.scale.set(1, 1.15, 1); jar.position.set(x, this.hf(x, z) + 0.34, z); jar.castShadow = true; scene.add(jar); }
    this.game.world.addBoxCentered(V(57.2, this.hf(57, 74) + 0.4, 74.4), V(3, 0.8, 1.6), { surface: 'concrete' });
  }

  buildRally() {
    const p = this.game.props;
    p.sandbagWall(94, 112, 4, 3); p.sandbagWall(106, 112, 4, 3); p.jerseyBarrier(100, 108, 0);
    p.sign(108, 122, '집결지 B', { sub: 'RALLY POINT BRAVO', bg: '#2f4a33', rotY: -Math.PI / 2 });
    p.crate(92, 120); p.ammoBox(92.6, 121.2);
    this.game.propLib?.place('medical_box', 93.2, 118.6, { collide: false }); p.crate(108, 116); this.game.propLib?.place('metal_jerrycan_green', 107.2, 117.4, { yawJitter: 1, collide: false });
    this.ammoCrateRally = V(92, this.hf(92, 120) + 0.9, 120);
  }

  buildNature() {
    const p = this.game.props, L = LAYOUT;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const nearRoad = (x, z) => L.roads.some((r) => r.pts.some(([px, pz], i) => { const q = r.pts[i + 1]; if (!q) return false; const dx = q[0] - px, dz = q[1] - pz; const t = Math.max(0, Math.min(1, ((x - px) * dx + (z - pz) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - px - dx * t, z - pz - dz * t) < r.w / 2 + 3; }));
    const blocked = (x, z) => nearRoad(x, z) || L.flats.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + 2) || Math.abs(z - L.fenceZ) < 9 || Math.hypot(x - 76, z + 38) < 22;
    const pines = [];
    // DMZ forest (north of fence) — no collision needed beyond fence but keep for AI cover
    for (let i = 0; i < 220; i++) { const x = rnd(-195, 195), z = rnd(-170, -70); if (!blocked(x, z)) pines.push({ x, z, s: rnd(0.9, 1.6), collide: z > -95 }); }
    // south woods
    for (let i = 0; i < 260; i++) { const x = rnd(-195, 195), z = rnd(-40, 225); if (!blocked(x, z) && !(x > 45 && x < 125 && z > 25 && z < 105)) pines.push({ x, z, s: rnd(0.8, 1.4) }); }
    p.pineForest(pines);
    p.bareTrees([[50, 40], [108, 40], [112, 96], [55, 94], [70, 102], [-30, -20], [30, -38], [92, 30]].map(([x, z]) => ({ x, z, s: rnd(0.8, 1.2) })));
    const rocks = []; for (let i = 0; i < 90; i++) { const x = rnd(-180, 180), z = rnd(-60, 220); if (!blocked(x, z)) rocks.push({ x, z, r: rnd(0.4, 1.3) }); }
    rocks.push({ x: 66, z: -30, r: 1.2 }, { x: 88, z: -30, r: 1.0 }, { x: 64, z: -22, r: 1.4 }, { x: 86, z: 20, r: 1.2 }, { x: 70, z: 18, r: 1.1 }, { x: 95, z: 10, r: 1.3 });
    p.rocks(rocks);
    p.grassTufts(Math.floor(5000 * ({ low: 0.3, medium: 0.6, high: 1 }[settings.data.graphics.effects] ?? 1)), { minX: -150, maxX: 150, minZ: -55, maxZ: 200, reject: (x, z) => nearRoad(x, z) }, this.hf);
  }

  // ---------------- dynamic level state ----------------
  blackout() {
    for (const l of this.lampLights) { if (l.light) l.light.intensity = 0; l.glow.material.color.setHex(0x151515); }
    for (const u of this.interiorLights) { if (u.light) u.light.intensity = 0; if (u.bulb) u.bulb.material.color.setHex(0x222222); }
    for (const t of this.towers) if (t.spot) { t.spot.intensity = 0; t.spot.userData.state.on = false; t.spot.userData.state.beam.visible = false; }
    this.scene().traverse((o) => { if (o.isMesh && o.material?.emissive && o.material.emissiveIntensity > 0 && o.material.transparent && o.material.opacity < 0.9) { o.material.emissiveIntensity = 0; o.material.color.setHex(0x1c2730); } });
  }
  scene() { return this.game.renderer.scene; }
  // Set piece: a shell hit topples a watchtower (falls away from `fromDir`)
  collapseTower(i, fromPos = null) {
    const t = this.towers[i]; if (!t || t.collapsed) return; t.collapsed = true;
    const g = this.game, base = t.base;
    for (const c of t.colliders) g.world.removeCollider(c);
    if (t.spot) { t.spot.intensity = 0; const st = t.spot.userData.state; st.on = false; st.beam.visible = false; }
    g.combat.explode(base.clone().add(V(0, 0.3, 0)), { radius: 5, damage: 80, scale: 1.3, playerSafe: g.player.position.distanceTo(base) > 12, snow: true });
    // pivot about the base edge on the far side
    const away = fromPos ? base.clone().sub(fromPos).setY(0).normalize() : V(0, 0, -1);
    const pivot = new THREE.Group(); pivot.position.copy(base).addScaledVector(away, 1.1); this.scene().add(pivot);
    this.scene().remove(t.grp); pivot.add(t.grp); t.grp.position.copy(base).sub(pivot.position);
    const axis = V(away.z, 0, -away.x); let a = 0, w = 0.05; const q0 = pivot.quaternion.clone();
    const landed = () => {
      const tip = base.clone().addScaledVector(away, 6.5);
      g.effects.explosion(V(tip.x, this.hf(tip.x, tip.z), tip.z), 0.9, { snow: true }); g.audio.explosion(tip, 0.8); g.player.addShake(0.3);
      g.world.addBoxCentered(base.clone().addScaledVector(away, 4).setY(this.hf(base.x, base.z) + 0.8), V(2.6, 1.6, 2.6), { surface: 'metal', cover: true });
    };
    g.mission.every((dt) => {
      w += dt * 2.6; a = Math.min(Math.PI / 2 - 0.05, a + w * dt);
      pivot.quaternion.copy(q0).multiply(new THREE.Quaternion().setFromAxisAngle(axis, a));
      if (a >= Math.PI / 2 - 0.05) { landed(); return false; }
    });
    g.audio.click(0.4, 600, 0.4); // metal groan
  }
  startWar() { this.war = true; this.flashT = 1; }
  update(dt, t) {
    const g = this.game;
    this.sky.update(dt, g.renderer.camera);
    this.weather.update(dt, g.renderer.camera.position);
    // dawn progression
    const d = this.dawn;
    this.sky.uniforms.horizon.value.setRGB(0.145 + d * 0.25, 0.176 + d * 0.2, 0.227 + d * 0.18);
    this.sky.uniforms.zenith.value.setRGB(0.02 + d * 0.12, 0.035 + d * 0.15, 0.07 + d * 0.22);
    this.sky.uniforms.stars.value = 0.75 * (1 - d);
    this.hemi.intensity = 0.8 + d * 0.6; g.effects.setSmokeLight(0.32 + d * 0.9); g.renderer.scene.fog.color.setRGB(0.086 + d * 0.2, 0.11 + d * 0.2, 0.145 + d * 0.22);
    // war: horizon flashes + distant artillery audio
    if (this.war) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flashT = 0.4 + Math.random() * 2.2;
        this.horizonLight.position.set((Math.random() - 0.5) * 500, 30 + Math.random() * 30, -230 - Math.random() * 120);
        this.horizonLight.intensity = 1500 + Math.random() * 4000; this.sky.uniforms.glow.value = 2 + Math.random() * 2;
        this.sky.uniforms.glowDir.value.set(this.horizonLight.position.x / 300, 0, -1);
        if (Math.random() < 0.8) setTimeout(() => g.audio.distantArtillery(), 600 + Math.random() * 1500);
      }
      this.horizonLight.intensity *= Math.exp(-dt * 7);
      this.sky.uniforms.glow.value += (0.7 - this.sky.uniforms.glow.value) * dt * 1.5;
    }
  }
}
