// A fortified enemy compound seen from a distance (target for naval / artillery fire): perimeter
// T-walls and wire, watchtowers, two barracks, a command bunker, a lattice radio mast, a fuel depot,
// parked trucks, a tank and an anti-aircraft gun — plus its garrison (MG nest, RPG teams, riflemen).
// Every structure has hit points and its own way of being destroyed (roofs blown off, walls
// slumping, towers toppling, fuel tanks going up in a chain, the tank's turret thrown clear).
import * as THREE from 'three';
import { pbr } from '../render/TextureFactory.js';
import { events } from '../core/Events.js';
import { cloneRaw } from '../gear/GearLib.js';
import { wreck } from '../render/Destruction.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);

export class EnemyBase {
  // C: centre on the ground; facing: unit vector toward the player's side (the wall line faces it)
  constructor(game, C, { facing = V(-1, 0, 0) } = {}) {
    this.game = game; this.C = C.clone(); this.facing = facing.clone().normalize(); this.side = V(-this.facing.z, 0, this.facing.x);
    this.structures = []; this.defenders = []; this.scene = game.renderer.scene;
    const M = this.M = {
      conc: pbr('concrete', { color: 0x8c8a82, key: 'eb_conc' }), concDark: pbr('concrete', { color: 0x6a6964, key: 'eb_concd' }),
      wall: pbr('plaster', { color: 0x9a9480, key: 'eb_wall' }), roof: pbr('corrugated', { color: 0x6a6e66, key: 'eb_roof' }),
      metal: pbr('paintedMetal', { color: 0x5a6048, key: 'eb_metal' }), steel: new THREE.MeshStandardMaterial({ color: 0x3a3c38, metalness: 0.6, roughness: 0.5 }),
      sand: pbr('sandbag', { color: 0xb0a07a, key: 'eb_sand' }), dark: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
      tank: pbr('paintedMetal', { color: 0x4c5040, repeat: [2, 2], key: 'eb_tank' }), fuel: new THREE.MeshStandardMaterial({ color: 0x6a7058, metalness: 0.4, roughness: 0.55 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x1a2024, metalness: 0.5, roughness: 0.2 }), wire: new THREE.MeshStandardMaterial({ color: 0x5a5a56, metalness: 0.7, roughness: 0.5 }),
      red: new THREE.MeshStandardMaterial({ color: 0x7a2420, roughness: 0.7 }),
    };
    this.build();
    this.off = events.on('combat:explosion', (e) => this.onBlast(e));
  }
  // local (u: along the facing = toward the player, v: sideways) → world
  P(u, v, y = null) { const p = this.C.clone().addScaledVector(this.facing, u).addScaledVector(this.side, v); p.y = y ?? this.game.world.heightFn(p.x, p.z); return p; }
  yawFace() { return Math.atan2(this.facing.x, this.facing.z); }
  group(u, v, rotExtra = 0) { const g = new THREE.Group(); g.userData.dynamic = true; g.position.copy(this.P(u, v)); g.rotation.y = this.yawFace() + rotExtra; this.scene.add(g); return g; }
  mesh(g, geo, mat, x, y, z, { rx = 0, ry = 0, rz = 0, cast = true } = {}) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; }
  collider(g, sx, sy, sz, opts = {}) {
    // axis-aligned box around a group's footprint (groups are rotated by the facing; use the rotated extents)
    const yaw = g.rotation.y, c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    const w = sx * c + sz * s, d = sx * s + sz * c;
    return this.game.world.addBoxCentered(g.position.clone().add(V(0, sy / 2, 0)), V(w, sy, d), { surface: 'concrete', cover: true, walkable: false, ...opts });
  }
  add(kind, g, { hp, radius, cols = [], key = false, name = '' }) { const s = { kind, g, hp, maxHp: hp, radius, cols, key, name, dead: false, center: g.position.clone() }; this.structures.push(s); return s; }

  build() {
    const M = this.M;
    // ---- perimeter: T-walls toward the player with gaps, wire coils in front, sandbag positions ----
    for (let v = -32; v <= 32; v += 2.1) {
      if (Math.abs(v - 6) < 3 || Math.abs(v + 18) < 2.5) continue;          // gate and an MG embrasure
      const g = this.group(24, v); this.mesh(g, new THREE.BoxGeometry(0.5, 2.5, 2.0), M.conc, 0, 1.25, 0); this.mesh(g, new THREE.BoxGeometry(1.4, 0.4, 2.0), M.conc, 0, 0.2, 0);
      this.collider(g, 0.6, 2.5, 2.0);
    }
    for (let v = -34; v <= 34; v += 1.6) { const g = this.group(28, v); this.mesh(g, new THREE.TorusGeometry(0.45, 0.025, 4, 10), M.wire, 0, 0.45, 0, { ry: Math.PI / 2, cast: false }); }
    // ---- watchtowers (topple) ----
    for (const v of [-30, 30]) {
      const g = this.group(20, v); const legs = [];
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) legs.push(this.mesh(g, new THREE.CylinderGeometry(0.09, 0.12, 7, 6), M.steel, x, 3.5, z));
      this.mesh(g, new THREE.BoxGeometry(2.8, 0.2, 2.8), M.wood || M.metal, 0, 7.1, 0);
      const cab = this.mesh(g, new THREE.BoxGeometry(2.6, 1.2, 2.6), M.metal, 0, 7.8, 0); this.mesh(g, new THREE.ConeGeometry(2.2, 0.9, 4), M.roof, 0, 9.4, 0, { ry: Math.PI / 4 });
      for (let k = 0; k < 4; k++) this.mesh(g, new THREE.BoxGeometry(0.1, 1.2, 0.1), M.steel, k % 2 ? 1.25 : -1.25, 8.9, k < 2 ? 1.25 : -1.25);
      this.add('tower', g, { hp: 140, radius: 3, cols: [this.collider(g, 2.6, 9, 2.6)], name: '감시탑' });
    }
    // ---- barracks ×2 (key) ----
    for (const [u, v] of [[6, -16], [-8, -14]]) {
      const g = this.group(u, v, Math.PI / 2); const L = 16, W = 6.5, H = 3.2;
      const walls = new THREE.Group(); g.add(walls);
      this.mesh(walls, new THREE.BoxGeometry(L, H, W), M.wall, 0, H / 2, 0);
      for (let i = 0; i < 6; i++) { const x = -L / 2 + 1.6 + i * 2.6; for (const s of [-1, 1]) this.mesh(walls, new THREE.BoxGeometry(1.1, 0.9, 0.06), M.glass, x, 1.9, s * (W / 2 + 0.02), { cast: false }); }
      this.mesh(walls, new THREE.BoxGeometry(1.2, 2.1, 0.08), M.dark, L / 2 - 2, 1.05, W / 2 + 0.03, { cast: false });
      const roof = []; const n = 4;
      for (let i = 0; i < n; i++) for (const s of [-1, 1]) roof.push(this.mesh(g, new THREE.BoxGeometry(L / n, 0.06, W / 2 + 0.6), M.roof, -L / 2 + (i + 0.5) * L / n, H + 0.75, s * (W / 4 + 0.15), { rx: s * 0.32 }));
      this.mesh(g, new THREE.BoxGeometry(0.5, 1.4, 0.5), M.conc, L / 2 - 3, H + 1.2, 0);   // chimney
      this.add('barracks', g, { hp: 260, radius: 8, cols: [this.collider(g, L, H + 1, W)], key: true, name: '막사' }).parts = { walls, roof };
    }
    // ---- two-storey HQ (key) with a flat roof, balcony and antennas; hangar (half-round, corrugated) ----
    {
      const g = this.group(-18, -18, 0); const L = 14, W = 9, H = 6.6;
      const walls = new THREE.Group(); g.add(walls);
      this.mesh(walls, new THREE.BoxGeometry(W, H, L), M.wall, 0, H / 2, 0);
      for (const fy of [1.8, 4.9]) for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) this.mesh(walls, new THREE.BoxGeometry(0.06, 1.1, 1.2), M.glass, sx * (W / 2 + 0.02), fy, -L / 2 + 1.8 + i * 2.6, { cast: false });
      this.mesh(walls, new THREE.BoxGeometry(W + 0.4, 0.25, L + 0.4), M.concDark, 0, 3.3, 0);
      const roof = []; for (let i = 0; i < 4; i++) roof.push(this.mesh(g, new THREE.BoxGeometry(W + 0.3, 0.3, L / 4), M.concDark, 0, H + 0.15, -L / 2 + (i + 0.5) * L / 4));
      for (const z of [-4, 3]) roof.push(this.mesh(g, new THREE.CylinderGeometry(0.04, 0.06, 5, 5), M.steel, 2.5, H + 2.6, z));
      roof.push(this.mesh(g, new THREE.CylinderGeometry(1.1, 0.4, 0.3, 14), M.metal, -2, H + 1.0, 4, { rz: 0.6 }));
      this.add('barracks', g, { hp: 340, radius: 8, cols: [this.collider(g, W, H + 0.5, L)], key: true, name: '사령부 건물' }).parts = { walls, roof };
    }
    {
      const g = this.group(-2, -30, 0); const L = 18, R = 6;
      const walls = new THREE.Group(); g.add(walls);
      this.mesh(walls, new THREE.BoxGeometry(2 * R, 0.6, L), M.conc, 0, 0.3, 0);
      const roof = []; for (let i = 0; i < 6; i++) { const seg = this.mesh(g, new THREE.CylinderGeometry(R, R, L / 6, 18, 1, true, -Math.PI / 2, Math.PI), M.roof, 0, 0.6, -L / 2 + (i + 0.5) * L / 6, { rx: Math.PI / 2 }); seg.rotation.set(-Math.PI / 2, 0, 0); roof.push(seg); }
      this.mesh(walls, new THREE.CircleGeometry(R, 18, 0, Math.PI), M.metal, 0, 0.6, -L / 2, { ry: Math.PI });
      this.add('barracks', g, { hp: 200, radius: 9, cols: [this.collider(g, 2 * R, R, L)], name: '격납고' }).parts = { walls, roof };
    }
    // ---- command bunker (key): squat concrete with sandbag roof, steel door, antenna ----
    {
      const g = this.group(-2, 14); const body = this.mesh(g, new THREE.BoxGeometry(9, 2.8, 7), M.concDark, 0, 1.4, 0);
      const top = []; for (let i = 0; i < 12; i++) top.push(this.mesh(g, new THREE.BoxGeometry(1.4, 0.35, 0.7), M.sand, -3.6 + (i % 4) * 2.4, 3.0, -2.4 + Math.floor(i / 4) * 2.4, { ry: rand(-0.1, 0.1) }));
      this.mesh(g, new THREE.BoxGeometry(0.08, 1.9, 1.2), M.steel, 4.53, 1.0, 0);
      for (let k = 0; k < 3; k++) this.mesh(g, new THREE.BoxGeometry(1.0, 0.25, 0.05), M.dark, 4.52, 2.1, -2.5 + k * 2.5, { cast: false });
      const ant = this.mesh(g, new THREE.CylinderGeometry(0.03, 0.05, 6, 5), M.steel, -3, 6, 2.5);
      this.add('bunker', g, { hp: 420, radius: 6, cols: [this.collider(g, 9, 3.2, 7)], key: true, name: '지휘 벙커' }).parts = { body, top, ant };
    }
    // ---- radio mast (key): 20 m lattice with dishes ----
    {
      const g = this.group(-16, 4); const H = 20;
      const lat = new THREE.Group(); g.add(lat);
      for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [0, 0.8]]) this.mesh(lat, new THREE.CylinderGeometry(0.05, 0.08, H, 5), M.red, x * (1 - 0.5 * 0) , H / 2, z);
      for (let y = 1; y < H; y += 1.6) for (const [a, b] of [[[-0.7, -0.7], [0.7, -0.7]], [[0.7, -0.7], [0, 0.8]], [[0, 0.8], [-0.7, -0.7]]]) {
        const m = this.mesh(lat, new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.15, 4), M.steel, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, { cast: false });
        m.rotation.set(0.5, Math.atan2(b[0] - a[0], b[1] - a[1]), Math.PI / 2);
      }
      for (const y of [14, 17.5]) this.mesh(lat, new THREE.CylinderGeometry(0.8, 0.5, 0.25, 14), M.metal, 0.6, y, 0, { rz: Math.PI / 2.3 });
      this.mesh(lat, new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 }), 0, H + 0.2, 0, { cast: false });
      this.add('mast', g, { hp: 150, radius: 3, cols: [this.collider(g, 1.8, H, 1.8)], key: true, name: '통신탑' }).parts = { lat, H };
    }
    // ---- fuel depot (key): three horizontal tanks on cradles, drums, berm ----
    {
      const g = this.group(-14, 22, Math.PI / 2); const tanks = [];
      for (let i = 0; i < 3; i++) {
        const t = new THREE.Group(); t.position.set(0, 1.4, -3.2 + i * 3.2); g.add(t);
        this.mesh(t, new THREE.CylinderGeometry(1.25, 1.25, 7.5, 18), M.fuel, 0, 0, 0, { rz: Math.PI / 2 });
        for (const s of [-1, 1]) this.mesh(t, new THREE.SphereGeometry(1.25, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.fuel, s * 3.75, 0, 0, { rz: -s * Math.PI / 2 });
        for (const s of [-1, 1]) this.mesh(g, new THREE.BoxGeometry(0.3, 1.0, 2.2), M.conc, s * 2.5, 0.5, -3.2 + i * 3.2);
        tanks.push(t);
      }
      for (let i = 0; i < 10; i++) this.mesh(g, new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), i % 3 ? M.fuel : M.red, 5.2 + (i % 3) * 0.7, 0.45, -3 + Math.floor(i / 3) * 0.7);
      this.mesh(g, new THREE.BoxGeometry(13, 0.9, 0.6), M.sand, 0, 0.45, 5.6); this.mesh(g, new THREE.BoxGeometry(13, 0.9, 0.6), M.sand, 0, 0.45, -5.6);
      this.add('fuel', g, { hp: 110, radius: 7, cols: [this.collider(g, 9, 2.8, 10)], key: true, name: '유류고' }).parts = { tanks };
    }
    // ---- vehicles: two trucks, a tank, an AA gun ----
    for (const [u, v, r] of [[-4, 2, 0.4], [-6, 7, 0.2]]) {
      const real = cloneRaw('kamaz'); const g = this.group(u, v, r);
      if (real) { real.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); } }); g.add(real); }
      else this.mesh(g, new THREE.BoxGeometry(2.4, 2.6, 7), M.metal, 0, 1.3, 0);
      this.add('truck', g, { hp: 90, radius: 3.5, cols: [this.collider(g, 2.6, 2.8, 7.5)], name: '트럭' });
    }
    {
      const g = this.group(10, 4, -Math.PI / 2 + 0.3); const tur = this.tankModel(g);
      this.add('tank', g, { hp: 220, radius: 3.5, cols: [this.collider(g, 3.6, 2.6, 7)], name: '전차' }).parts = { tur };
    }
    {
      const g = this.group(14, 22); for (let a = 0; a < 10; a++) { const ang = a / 10 * Math.PI * 2; this.mesh(g, new THREE.BoxGeometry(1.3, 0.8, 0.6), M.sand, Math.cos(ang) * 2.4, 0.4, Math.sin(ang) * 2.4, { ry: -ang }); }
      const mount = new THREE.Group(); mount.position.y = 1.0; g.add(mount); this.mesh(mount, new THREE.BoxGeometry(1.0, 0.6, 1.0), M.metal, 0, 0, 0);
      const barrels = new THREE.Group(); barrels.position.y = 0.5; barrels.rotation.x = -0.9; mount.add(barrels);
      for (const s of [-1, 1]) this.mesh(barrels, new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), M.steel, s * 0.18, 0, 1.1, { rx: Math.PI / 2 });
      this.add('aa', g, { hp: 100, radius: 2.5, cols: [this.collider(g, 5, 1.2, 5)], name: '대공포' }).parts = { mount, barrels };
      this.aa = { mount, barrels, g };
    }
    // ---- MG nest in the embrasure, sandbags; crates; a few burning barrels and smoke so it reads at range ----
    { const g = this.group(25.2, -18); for (const v of [-1.6, 0, 1.6]) this.mesh(g, new THREE.BoxGeometry(0.7, 1.1, 1.5), M.sand, 0.9, 0.55, v); this.mgPos = this.P(25.0, -18, null).add(V(0, 1.2, 0)); }
    for (let i = 0; i < 6; i++) { const g = this.group(2 + (i % 3) * 1.1, 24 + Math.floor(i / 3) * 0.8); this.mesh(g, new THREE.BoxGeometry(1.0, 0.55, 0.6), M.metal, 0, 0.28, 0); }
    for (const [u, v] of [[16, -6], [-10, 0]]) { const p = this.P(u, v); this.game.effects.fireEmitter(p.clone().add(V(0, 0.9, 0)), 0.5); const g = this.group(u, v); this.mesh(g, new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), M.steel, 0, 0.45, 0); }
    this.game.effects.smokeColumn(this.P(-2, 14).add(V(0, 4, 0)), 1.1, [0.24, 0.24, 0.24]);
    // gate road
    const road = new THREE.Mesh(new THREE.PlaneGeometry(6, 70), pbr('dirt', { color: 0x7a6e5e, key: 'eb_road' })); road.rotation.x = -Math.PI / 2; road.rotation.z = -this.yawFace();
    const rp = this.P(0, 6); road.position.set(rp.x, rp.y + 0.05, rp.z); this.scene.add(road);
  }
  tankModel(g) {
    const M = this.M; const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => this.mesh(parent, geo, m, x, y, z, { rx, ry, rz });
    const hull = new THREE.Shape(); hull.moveTo(-3.3, 0.55); hull.lineTo(2.9, 0.55); hull.lineTo(3.5, 1.15); hull.lineTo(2.6, 1.75); hull.lineTo(-3.3, 1.75); hull.lineTo(-3.4, 1.0);
    const hg = new THREE.ExtrudeGeometry(hull, { depth: 3.3, bevelEnabled: false }); hg.translate(0, 0, -1.65); hg.rotateY(-Math.PI / 2); add(hg, M.tank, 0, 0, 0);
    for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.6, 0.9, 6.8), M.dark, s * 1.75, 0.55, 0); add(new THREE.BoxGeometry(0.65, 0.5, 6.9), M.tank, s * 1.75, 1.3, 0); }
    const tur = new THREE.Group(); tur.position.set(0, 1.75, -0.3); g.add(tur);
    const ts = new THREE.Shape(); ts.moveTo(-1.6, -1.4); ts.lineTo(1.6, -1.4); ts.lineTo(1.4, 1.6); ts.lineTo(-1.4, 1.6);
    const tg = new THREE.ExtrudeGeometry(ts, { depth: 0.75, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.1, bevelSegments: 1 }); tg.rotateX(-Math.PI / 2); add(tg, M.tank, 0, 0, 0, 0, 0, 0, tur);
    add(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 10), M.dark, 0, 0.42, 3.8, Math.PI / 2, 0, 0, tur);
    return tur;
  }

  // ---- garrison ----
  // spawns the defenders and their heavy weapons (MG bursts and RPGs aimed at the player)
  activate(m, spawnEnemies) {
    const g = this.game;
    const spots = [[22, -26], [22, -12], [22, 0], [22, 12], [22, 24], [25, -18], [18, -20], [18, 8], [10, -6], [8, 10], [0, -4], [-4, 18], [-12, -6], [-10, 12], [4, 26], [14, -28]];
    const pts = spots.map(([u, v]) => { const p = this.P(u, v); return [p.x, p.z]; });
    const def = spawnEnemies(g, pts, { state: 'combat', accuracy: 0.3, visionRange: 260 });
    def.forEach((e, i) => { e.hold(V(pts[i][0], 0, pts[i][1]), g.player.position); e.target = g.player; e.lastSeenPos = g.player.position.clone(); });
    this.defenders = def;
    const mgGunner = def[5]; const rpgTeam = [def[1], def[3], def[8], def[11]];
    const mgp = this.mgPos.clone();
    m.every((dt) => this.updateWeapons(dt, m, mgGunner, rpgTeam, mgp));
    // AA gun hoses tracers at the sky now and then (ambience)
    let aaT = 3; m.every((dt) => { const s = this.structures.find((x) => x.kind === 'aa'); if (!s || s.dead) return false; aaT -= dt; s.parts.mount.rotation.y += dt * 0.3;
      if (aaT <= 0) { aaT = rand(4, 9); const from = s.g.position.clone().add(V(0, 2, 0)); let n = 10; const burst = () => { if (n-- <= 0 || s.dead) return; const to = from.clone().add(V(rand(-60, 60), rand(120, 200), rand(-60, 60))); g.effects.tracer(from, to, 320); g.audio.shot(from, { enemy: true }); setTimeout(burst, 70); }; burst(); } });
    return def;
  }
  updateWeapons(dt, m, mgGunner, rpgTeam, mgp) {
    const g = this.game; this._mgT = (this._mgT ?? 2) - dt; this._rpgT = (this._rpgT ?? 6) - dt;
    if (this._mgT <= 0 && !mgGunner.dead) {
      this._mgT = rand(2.4, 4.4); const tgt = g.player.chestPos(V(0, 0, 0)); let n = 8 + Math.floor(Math.random() * 7);
      const burst = () => { if (mgGunner.dead || n-- <= 0) return;
        const aim = tgt.clone().add(V(rand(-7, 7), rand(-1, 2.5), rand(-7, 7))); const d = aim.clone().sub(mgp).normalize(); const hit = g.world.raycast(mgp, d, 400, { ignore: (c) => c.passBullets });
        const end = hit ? hit.point : mgp.clone().addScaledVector(d, 400); g.effects.muzzleFlash(mgp, d); g.effects.tracer(mgp, end, 320); g.audio.shot(mgp, { enemy: true });
        if (hit) g.effects.impact(hit.point, hit.normal, hit.surface);
        const pc = g.player.chestPos(V(0, 0, 0)); const along = pc.clone().sub(mgp).dot(d); const cl = mgp.clone().addScaledVector(d, along);
        if (along > 0 && cl.distanceTo(pc) < 2.5) { g.player.nearMiss?.(cl); if (cl.distanceTo(pc) < 0.8 && g.world.lineOfSight(mgp, pc)) g.player.takeDamage(6, mgp, mgGunner); }
        setTimeout(burst, 85); };
      burst();
    }
    const live = rpgTeam.filter((e) => !e.dead);
    if (this._rpgT <= 0 && live.length) {
      this._rpgT = rand(7, 12); const sh = live[Math.floor(Math.random() * live.length)];
      const from = sh.chestPos(V(0, 0, 0)).add(V(0, 0.3, 0)); const to = g.player.position.clone().add(V(rand(-10, 10), rand(1, 2.5), rand(-10, 10)));
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.7, 6).rotateX(Math.PI / 2), this.M.steel); mesh.position.copy(from); mesh.lookAt(to); this.scene.add(mesh);
      (this.rockets ||= []).push({ mesh, v: to.clone().sub(from).normalize().multiplyScalar(70), life: 7 });
      g.effects.muzzleFlash(from, to.clone().sub(from).normalize()); g.audio.explosion(from, 0.25, { ring: false });
    }
    for (const r of this.rockets || []) {
      if (r.done) continue; r.life -= dt; const step = r.v.clone().multiplyScalar(dt); const p = r.mesh.position;
      const hit = g.world.raycast(p, step.clone().normalize(), step.length(), {}); const near = p.distanceTo(g.player.chestPos(V(0, 0, 0))) < 1.2;
      if (hit || near || r.life <= 0) { r.done = true; this.scene.remove(r.mesh); g.combat.explode(hit ? hit.point : p.clone(), { radius: 4.5, damage: 50, owner: 'enemy', scale: 0.9, kind: 'grenade', label: 'RPG' }); continue; }
      p.add(step); g.effects.smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: rand(-0.15, 0.15), vy: 0.2, vz: rand(-0.15, 0.15), size: 0.3, endSize: 1.6, life: 1.8, alpha: 0.5, endAlpha: 0, r: 0.75, g: 0.74, b: 0.7, drag: 2 });
    }
    if (this.rockets?.length > 20) this.rockets = this.rockets.filter((r) => !r.done);
  }

  // ---- damage ----
  onBlast({ pos, radius, damage, heavy }) {
    if (pos.distanceTo(this.C) > 70) return;
    for (const s of this.structures) {
      if (s.dead) continue; const d = Math.max(0, pos.distanceTo(s.center.clone().setY(pos.y)) - s.radius);
      const reach = radius * (heavy ? 1.3 : 0.7); if (d > reach) continue;
      s.hp -= damage * (heavy ? 1 : 0.2) * (1 - d / reach * 0.7);
      if (s.hp <= 0) this.destroy(s, pos);
    }
  }
  get keyLeft() { return this.structures.filter((s) => s.key && !s.dead).length; }
  get keyTotal() { return this.structures.filter((s) => s.key).length; }
  destroy(s, from = null) {
    if (s.dead) return; s.dead = true;
    const g = this.game, W = wreck(g), fx = g.effects, p = s.center.clone(), away = from ? p.clone().sub(from).setY(0).normalize() : this.facing.clone().negate();
    for (const c of s.cols) g.world.removeCollider(c);
    events.emit('base:destroyed', { s });
    const rubble = (sx, sy, sz) => { s.cols = [g.world.addBoxCentered(p.clone().add(V(0, sy / 2, 0)), V(sx, sy, sz), { surface: 'concrete', cover: true })]; };
    const burn = (scale = 1, y = 1) => { fx.fireEmitter(p.clone().add(V(0, y, 0)), scale); fx.smokeColumn(p.clone().add(V(0, y + 2, 0)), scale, [0.12, 0.12, 0.12]); };
    switch (s.kind) {
      case 'barracks': {
        fx.explosion(p.clone().add(V(0, 1.5, 0)), 1.6); g.audio.explosion(p, 1.2);
        for (const r of s.parts.roof) W.detach(r, { v: V(rand(-5, 5), rand(7, 14), rand(-5, 5)).addScaledVector(away, 4), half: 0.25, life: 50 });
        W.chunks(p.clone().add(V(0, 2, 0)), { count: 26, size: 0.5, speed: 8, up: 7, mat: 'stone' });
        let t = 0; const w = s.parts.walls; W.char(s.g);
        g.mission.every((dt) => { t += dt; const k = Math.min(1, t / 1.4); w.scale.y = 1 - k * 0.6; w.rotation.z = k * 0.08 * (Math.sign(away.x) || 1); w.position.y = -k * 0.3; if (k >= 1) return false; });
        burn(1.3, 1.2); rubble(14, 1.4, 6); break;
      }
      case 'bunker': {
        fx.explosion(p.clone().add(V(0, 2, 0)), 1.8); g.audio.explosion(p, 1.3);
        for (const b of s.parts.top) W.detach(b, { v: V(rand(-6, 6), rand(5, 12), rand(-6, 6)), half: 0.2, life: 50 });
        W.detach(s.parts.ant, { v: V(rand(-3, 3), 9, rand(-3, 3)), half: 0.1, life: 30 });
        W.chunks(p.clone().add(V(0, 2.5, 0)), { count: 30, size: 0.6, speed: 9, up: 8, mat: 'concreteDark' });
        W.char(s.g); s.parts.body.scale.y = 0.7; s.parts.body.position.y = 1.0; s.parts.body.rotation.z = 0.05;
        burn(1.0, 1.6); rubble(9, 2.2, 7); break;
      }
      case 'mast': case 'tower': {
        fx.explosion(p.clone().add(V(0, 0.8, 0)), 1.1); g.audio.explosion(p, 0.9);
        const pivot = new THREE.Group(); pivot.position.copy(p).addScaledVector(away, 0.8); this.scene.add(pivot); pivot.attach(s.g);
        const axis = V(away.z, 0, -away.x); let a = 0, wv = 0.04; const q0 = pivot.quaternion.clone(); const len = s.kind === 'mast' ? s.parts.H : 9;
        g.mission.every((dt) => { wv += dt * 2.2; a = Math.min(Math.PI / 2 - 0.08, a + wv * dt); pivot.quaternion.copy(q0).multiply(new THREE.Quaternion().setFromAxisAngle(axis, a));
          if (a >= Math.PI / 2 - 0.08) { const tip = p.clone().addScaledVector(away, len * 0.8); tip.y = g.world.heightFn(tip.x, tip.z); W.chunks(tip.clone().add(V(0, 0.5, 0)), { count: 14, size: 0.3, speed: 4, up: 4, mat: 'metal' }); W.dustPuff(tip, 2.2); g.audio.explosion(tip, 0.6, { ring: false }); return false; } });
        W.char(s.g, 0.4); g.audio.click(0.4, 500, 0.5); break;
      }
      case 'fuel': {
        // the first tank goes, the others follow in a chain; one is torn open and thrown
        const tanks = s.parts.tanks;
        tanks.forEach((t, i) => setTimeout(() => {
          const tp = t.getWorldPosition(new THREE.Vector3());
          fx.explosion(tp, 2.6); fx.flashLight(tp, 0xff7a20, 80, 0.6, 70); g.audio.explosion(tp, 1.6); g.player.addShake(0.25);
          for (let k = 0; k < 40 * (fx.budget ?? 1); k++) { const ang = Math.random() * 6.28; fx.fire.spawn({ x: tp.x, y: tp.y + 1, z: tp.z, vx: Math.cos(ang) * rand(2, 7), vy: rand(6, 16), vz: Math.sin(ang) * rand(2, 7), size: rand(2, 4), endSize: 1, life: rand(0.8, 1.6), r: 1, g: rand(0.45, 0.7), b: 0.15, drag: 1.5, gravity: -2 }); }
          if (i === 1) W.detach(t, { v: V(rand(-3, 3), 18, rand(-3, 3)).addScaledVector(away, 5), av: V(rand(-2, 2), rand(-1, 1), rand(-2, 2)), half: 1.2, life: 60 });
          else { t.scale.set(1, 0.7, 1.15); t.rotation.x = rand(-0.2, 0.2); }
          W.chunks(tp.clone().add(V(0, 1, 0)), { count: 12, size: 0.3, speed: 10, up: 10, mat: 'metal' });
        }, i * rand(500, 900)));
        W.char(s.g, 0.18);
        fx.fireEmitter(p.clone().add(V(0, 0.8, 0)), 2.2); fx.smokeColumn(p.clone().add(V(0, 4, 0)), 2.2, [0.06, 0.06, 0.06]);
        setTimeout(() => g.combat.explode(p.clone().add(V(0, 1, 0)), { radius: 13, damage: 160, owner: 'world', scale: 0.5, playerSafe: g.player.position.distanceTo(p) > 20, heavy: true }), 400);
        rubble(9, 2.2, 10); break;
      }
      case 'truck': {
        fx.explosion(p.clone().add(V(0, 1.2, 0)), 1.3); g.audio.explosion(p, 1.0); W.char(s.g);
        const parts = []; s.g.traverse((o) => { if (o.isMesh && o.geometry?.boundingSphere?.radius < 1.2) parts.push(o); });
        for (const o of parts.sort(() => Math.random() - 0.5).slice(0, 3)) W.detach(o, { v: V(rand(-5, 5), rand(5, 10), rand(-5, 5)), half: 0.3 });
        s.g.rotation.z = rand(-0.12, 0.12); burn(1.1, 1.4); W.cookOff(p.clone().add(V(0, 1, 0)), { n: 2, scale: 0.4 }); rubble(2.6, 2.4, 7); break;
      }
      case 'tank': {
        fx.explosion(p.clone().add(V(0, 1.6, 0)), 1.6); g.audio.explosion(p, 1.3); W.char(s.g, 0.2);
        W.detach(s.parts.tur, { v: V(rand(-3, 3), 13, rand(-3, 3)).addScaledVector(away, 3), av: V(rand(-3, 3), rand(-6, 6), rand(-3, 3)), half: 0.6, life: 80 });
        W.cookOff(p.clone().add(V(0, 1.8, 0)), { dur: 10, n: 6, scale: 0.6 }); burn(1.3, 1.8);
        for (let k = 0; k < 20; k++) setTimeout(() => { const q = p.clone().add(V(0, 2, 0)); fx.fire.spawn({ x: q.x, y: q.y, z: q.z, vx: rand(-0.5, 0.5), vy: rand(8, 14), vz: rand(-0.5, 0.5), size: 1.4, endSize: 0.4, life: 0.6, r: 1, g: 0.6, b: 0.2, drag: 1 }); }, 1200 + k * 60);   // flame jet from the turret ring
        rubble(3.6, 2.2, 7); break;
      }
      case 'aa': {
        fx.explosion(p.clone().add(V(0, 1, 0)), 1.0); g.audio.explosion(p, 0.8); W.char(s.g);
        W.detach(s.parts.barrels, { v: V(rand(-4, 4), 9, rand(-4, 4)), half: 0.3 }); burn(0.6, 1); break;
      }
    }
  }
  dispose() { this.off?.(); }
}
