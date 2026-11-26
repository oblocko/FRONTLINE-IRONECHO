// 한강: the big river through the metropolis, built like the real one.
//   · a broad, gently curving river (≈ 500 m of water), not a straight canal
//   · 둔치 (the riverside flats) on both banks, 6.5 m below the city: 한강공원 with lawns, a bike path and a walking
//     path, rows of trees, benches, convenience kiosks, parking, a pool, courts, ferry piers; the riverside
//     expressways (올림픽대로 on the south bank, 강변북로 on the north bank) run along the foot of the levee
//   · grassy levee slopes up to the city (walkable), stone revetment and a railing at the water's edge
//   · six bridges, each a different real structural type, all at road level and walkable, with stairs down to
//     the 둔치 at both ends:
//       가람대교  steel box girder          새말대교  Warren truss        한누리대교  repeated tied arches + 누리섬
//       은빛대교  cable-stayed, one pylon   동녘대교  steel arches + metro (the train runs)
//       물빛대교  double deck: 물빛잠수교 at the 둔치 level below (walk across the river), the fountain on its edges
// Everything here is static (built once); colliders are permanent. hanGround() is the walking height.
import * as THREE from 'three';
import { CURB } from './Streets.js';
import { wallMat, flatMat, groundMat } from './CityMaterials.js';
import { waterMat, worldUV } from './Water.js';

export const HAN = { hw: 250, dun: 72, lev: 26, water: -10, dunY: -6.4, bed: -16, xa: -1660, xb: 2060 };
HAN.half = HAN.hw + HAN.dun + HAN.lev;
// river centre line (z of the middle of the water at x)
export const hanC = (x) => -1050 + 120 * Math.sin((x - 200) / 1100) + 40 * Math.sin((x + 400) / 520);
const dC = (x) => (hanC(x + 1) - hanC(x - 1)) / 2;
export const ISLAND = { x: 0, rx: 210, rz: 52 };   // 누리섬 (under 한누리대교)
const inIsland = (x, z) => { const c = hanC(ISLAND.x); return ((x - ISLAND.x) / ISLAND.rx) ** 2 + ((z - c) / ISLAND.rz) ** 2 < 1; };
export const BRIDGES = [
  { x: -1440, type: 'girder', name: '가람대교' }, { x: -960, type: 'truss', name: '새말대교' }, { x: 0, type: 'tiedarch', name: '한누리대교' },
  { x: 420, type: 'cable', name: '은빛대교' }, { x: 1380, type: 'arch', name: '동녘대교' }, { x: 1860, type: 'double', name: '물빛대교' },
];
// land edge (top of the levee) north / south of the river at x
export const hanNorth = (x) => hanC(x) - HAN.half, hanSouth = (x) => hanC(x) + HAN.half;
// does the box [x0, z0, x1, z1] touch the river corridor (levees included, + margin)?
export function inHan(x0, z0, x1, z1, m = 8) {
  if (z0 > -480 || z1 < -1620) return false;
  for (let x = x0; ; x += 20) { const xx = Math.min(x, x1), c = hanC(xx); if (z1 > c - HAN.half - m && z0 < c + HAN.half + m) return true; if (xx >= x1) return false; }
}
// walking height in the corridor, or null outside it (bridges, decks and stairs are colliders)
export function hanGround(x, z) {
  if (z > -500 || z < -1600 || x < HAN.xa || x > HAN.xb) return null;
  const c = hanC(x), a = Math.abs(z - c);
  if (a >= HAN.half) return null;
  if (a > HAN.hw + HAN.dun) return CURB + (HAN.dunY - CURB) * (HAN.half - a) / HAN.lev;   // levee slope
  if (a > HAN.hw || inIsland(x, z)) return HAN.dunY;
  return HAN.water;
}

// ------------------------------------------------------------------ geometry helpers
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
// a straight member between two points (truss chords, arch segments, cables, pylon legs)
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
function beam(a, b, t, t2 = t) { _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _d.length(); const g = new THREE.BoxGeometry(t, L, t2); g.translate(0, L / 2, 0); _q.setFromUnitVectors(_up, _d.normalize()); g.applyQuaternion(_q); g.translate(a[0], a[1], a[2]); return g; }
// a strip between two curves along x: fa(x), fb(x) → [z, y]
function ribbon(xa, xb, step, fa, fb) {
  const pos = [], idx = []; let n = 0;
  for (let x = xa; ; x += step) { const xx = Math.min(x, xb), [za, ya] = fa(xx), [zb, yb] = fb(xx); pos.push(xx, ya, za, xx, yb, zb); if (n > 0) { const i = (n - 1) * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); } n++; if (xx >= xb) break; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // face up (or, for a wall, it is drawn double sided)
  const nr = g.attributes.normal; if (nr.getY(0) < -0.01) { idx.length = 0; for (let k = 0; k < n - 1; k++) { const i = k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}
const dbl = (m) => { const c = m.clone(); c.side = THREE.DoubleSide; c.userData = { ...m.userData }; return c; };

// ------------------------------------------------------------------ build
// B: the region's static Batch; world: colliders; tree(x, y, z, s) adds a tree; scene for the water / moving parts
export function buildHan({ B, world, scene, rnd, tree }) {
  const H = HAN, xa = H.xa, xb = H.xb, W = (min, max, o = {}) => world?.addBox(new THREE.Vector3(...min), new THREE.Vector3(...max), { surface: 'concrete', ...o });
  const asph = groundMat('asphalt', { roughness: 0.85 }), lawn = groundMat('lawn'), conc = wallMat('concrete', 0xb0aea6), stone = dbl(wallMat('stone', 0x9a968a));
  const rail = flatMat(0x50565a, { metalness: 0.5, roughness: 0.5, key: 'hanrail' }), white = flatMat(0xe8e8e2, { key: 'hanline' }), yellow = flatMat(0xd8b020, { key: 'hwyline' });
  const bikeM = flatMat(0x9a5446, { roughness: 0.9, key: 'hanbike' }), walkM = groundMat('plaza', { color: 0xb4b0a6 });
  // water (the river continues past the city into the plain), river bed
  const water = new THREE.Mesh(worldUV(ribbon(-4600, 5000, 40, (x) => [hanC(x) - H.hw - 30, H.water], (x) => [hanC(x) + H.hw + 30, H.water])), waterMat(0x2a4c54));
  water.userData.lodAlways = true; water.userData.region = true; scene.add(water);
  B.add(ribbon(xa - 40, xb + 40, 40, (x) => [hanC(x) - H.hw - 10, H.bed], (x) => [hanC(x) + H.hw + 10, H.bed]), flatMat(0x2a3234, { key: 'hanbed' }), { cast: false });
  for (const s of [-1, 1]) {
    const at = (a) => (x) => hanC(x) + s * a;
    // revetment (stone, water edge), 둔치 lawn, paths, expressway, levee slope
    B.add(ribbon(xa, xb, 20, (x) => [at(H.hw)(x), H.bed], (x) => [at(H.hw)(x), H.dunY]), stone, { cast: false });
    B.add(ribbon(xa, xb, 20, (x) => [at(H.hw)(x), H.dunY], (x) => [at(H.hw + H.dun)(x), H.dunY]), lawn, { cast: false });
    B.add(ribbon(xa, xb, 20, (x) => [at(H.hw + 6)(x), H.dunY + 0.03], (x) => [at(H.hw + 9)(x), H.dunY + 0.03]), walkM, { cast: false });                  // 산책로
    B.add(ribbon(xa, xb, 20, (x) => [at(H.hw + H.dun - 36)(x), H.dunY + 0.03], (x) => [at(H.hw + H.dun - 32)(x), H.dunY + 0.03]), bikeM, { cast: false }); // 자전거길
    B.add(ribbon(xa, xb, 20, (x) => [at(H.hw + H.dun - 27)(x), H.dunY + 0.04], (x) => [at(H.hw + H.dun - 1)(x), H.dunY + 0.04]), asph, { cast: false });   // 올림픽대로 / 강변북로
    B.add(ribbon(xa, xb, 20, (x) => [at(H.hw + H.dun - 14.1)(x), H.dunY + 0.07], (x) => [at(H.hw + H.dun - 13.9)(x), H.dunY + 0.07]), yellow, { cast: false });
    for (const o of [-20.5, -7.5]) for (let x = xa; x < xb; x += 12) { const z = hanC(x + 3) + s * (H.hw + H.dun + o); const g = new THREE.BoxGeometry(6, 0.02, 0.18); g.rotateY(-Math.atan(dC(x + 3))); g.translate(x + 3, H.dunY + 0.07, z); B.add(g, white, { cast: false }); }
    // guard rail between the expressway and the park (posts + a rail, a gap at each bridge stair)
    B.add(ribbon(xa, xb, 20, (x) => [at(H.hw + H.dun - 28)(x), H.dunY + 0.55], (x) => [at(H.hw + H.dun - 28)(x), H.dunY + 0.85]), dbl(rail), { cast: false });
    B.add(ribbon(xa, xb, 20, (x) => [at(H.hw + H.dun)(x), H.dunY], (x) => [at(H.half)(x), CURB - 0.02]), lawn, { cast: false });               // levee slope
    // the railing on the water's edge (colliders in 10 m pieces), a gap where the 잠수교 and the ferry piers meet the bank
    const gaps = [[1860 - 9, 1860 + 9], ...FERRY.filter((f) => f.s === s).map((f) => [f.x - 3, f.x + 3])];
    for (let x = xa; x < xb; x += 10) {
      const x1 = Math.min(x + 10, xb); if (gaps.some(([g0, g1]) => x1 > g0 && x < g1)) {
        for (let k = x; k < x1; k += 1) if (!gaps.some(([g0, g1]) => k + 1 > g0 && k < g1)) { const z0 = at(H.hw + 0.4)(k), z1 = at(H.hw + 0.4)(k + 1); W([k, H.dunY, Math.min(z0, z1) - 0.12], [k + 1, H.dunY + 1.1, Math.max(z0, z1) + 0.12], { surface: 'metal', walkable: false }); }
        continue; }
      const z0 = at(H.hw + 0.4)(x), z1 = at(H.hw + 0.4)(x1); W([x, H.dunY, Math.min(z0, z1) - 0.12], [x1, H.dunY + 1.1, Math.max(z0, z1) + 0.12], { surface: 'metal', walkable: false });
    }
    for (let x = xa; x < xb; x += 2.5) { if (gaps.some(([g0, g1]) => x > g0 && x < g1)) continue; B.add(box(0.08, 1.1, 0.08, x, H.dunY, at(H.hw + 0.4)(x)), rail, { cast: false }); }
    for (const y of [0.55, 1.05]) B.add(ribbon(xa, xb, 10, (x) => [at(H.hw + 0.4)(x), H.dunY + y], (x) => [at(H.hw + 0.4)(x), H.dunY + y + 0.06]), dbl(rail), { cast: false });
    // the ends of the 둔치 (the park stops where the city stops): a fence across
    for (const x of [xa, xb]) { const za = at(H.hw)(x), zb = at(H.half)(x); W([x - 0.2, H.dunY, Math.min(za, zb)], [x + 0.2, CURB + 1.2, Math.max(za, zb)], { walkable: false }); B.add(box(0.2, 1.2, Math.abs(zb - za), x, H.dunY, (za + zb) / 2), rail, { cast: false }); }
    // park life along the bank: trees between the paths, benches, and every ~130 m something (kiosk, parking,
    // courts, a pool, a lawn with a stage, a rental bike stand)
    for (let x = xa + 8; x < xb - 8; x += 13) { if (BRIDGES.some((b) => Math.abs(b.x - x) < 26)) continue;
      const zt = at(H.hw + H.dun - 30)(x); tree(x, H.dunY, zt, 0.9 + rnd() * 0.4); tree(x + 6.5, H.dunY, at(H.hw + H.dun - 39.5)(x + 6.5), 0.85 + rnd() * 0.4);
      if (rnd() < 0.6) tree(x + 3, H.dunY, at(H.hw + 13 + rnd() * 3)(x + 3), 0.8 + rnd() * 0.5);
      if (rnd() < 0.25) for (let k = 0; k < 4; k++) tree(x + rnd() * 12, H.dunY, at(H.hw + 15 + rnd() * 16)(x), 0.9 + rnd() * 0.6);   // a grove on the lawn
      if (rnd() < 0.35) { const zb = at(H.hw + 10.2)(x); B.add(box(1.8, 0.45, 0.5, x + 3, H.dunY, zb), flatMat(0x7a5a3a, { key: 'bench' }), { cast: false }); } }
    const kinds = ['kiosk', 'parking', 'courts', 'kiosk', 'pool', 'stage', 'parking', 'bikes'];
    let ki = s > 0 ? 0 : 3;
    for (let x = xa + 70; x < xb - 70; x += 130 + rnd() * 50) { if (BRIDGES.some((b) => Math.abs(b.x - x) < 60) || FERRY.some((f) => Math.abs(f.x - x) < 40)) continue;
      parkThing(kinds[ki++ % kinds.length], x, (a) => at(a)(x), s); }
  }
  function parkThing(kind, x, Z, s) {
    const y = H.dunY, zc = Z(H.hw + 22);
    if (kind === 'kiosk') {   // 한강 편의점 + a terrace with tables and parasols
      B.add(box(9, 3.4, 6, x, y, zc), wallMat('render', 0xf2f0ea)); B.add(box(9.4, 0.5, 6.4, x, y + 3.4, zc), flatMat(0x2a6a9a, { key: 'kioskband' }));
      B.add(box(8, 2.2, 0.06, x, y + 0.6, zc - s * 3.02), flatMat(0x7a9aa8, { roughness: 0.15, metalness: 0.4, key: 'kioskglass' }));
      W([x - 4.5, y, zc - 3], [x + 4.5, y + 3.9, zc + 3], { walkable: true });
      for (let k = 0; k < 4; k++) { const tx = x - 6 + k * 4, tz = zc - s * 7; B.add(box(1, 0.75, 1, tx, y, tz), flatMat(0xe8e4dc, { key: 'ttable' })); B.add(box(0.06, 2.3, 0.06, tx, y + 0.75, tz), rail); B.add(new THREE.ConeGeometry(1.4, 0.5, 8).translate(tx, y + 3.2, tz), flatMat([0xd84a3a, 0x2a7a5a, 0xe8b830][k % 3], { key: 'parasol' + k }), { cast: false }); }
    } else if (kind === 'parking') {   // 한강공원 주차장
      B.add(box(56, 0.05, 20, x, y + 0.02, zc), asph, { cast: false });
      for (let k = 0; k <= 22; k++) B.add(box(0.12, 0.02, 5, x - 27.5 + k * 2.5, y + 0.07, zc - 7), white, { cast: false });
      const cols = [0xe8e8e8, 0x2a2a2e, 0x9aa0a6, 0x6a1e1e, 0x1e3a5a];
      for (let k = 0; k < 22; k++) if (rnd() < 0.6) { const cx = x - 26.25 + k * 2.5; B.add(box(1.8, 1.4, 4.4, cx, y + 0.1, zc - 7), flatMat(cols[k % 5], { roughness: 0.35, metalness: 0.4, key: 'pcar' + (k % 5) })); W([cx - 0.9, y, zc - 9.2], [cx + 0.9, y + 1.5, zc - 4.8], { walkable: true }); }
    } else if (kind === 'courts') {   // 농구장 + 족구장 with fences
      for (const [cx, c] of [[x - 15, 0x3a6a8a], [x + 15, 0x4a7a4a]]) { B.add(box(26, 0.04, 15, cx, y + 0.02, zc), flatMat(c, { key: 'court' + c }), { cast: false }); B.add(box(24, 0.02, 0.1, cx, y + 0.07, zc - 7), white, { cast: false }); B.add(box(24, 0.02, 0.1, cx, y + 0.07, zc + 7), white, { cast: false }); }
      for (const cx of [x - 26.5, x + 26.5]) { B.add(box(0.15, 3.2, 0.15, cx, y, zc), rail); B.add(box(0.1, 1.05, 1.8, cx + Math.sign(x - cx) * 0.4, y + 2.6, zc), white); }
    } else if (kind === 'pool') {   // 한강 야외 수영장
      B.add(box(60, 0.3, 30, x, y, zc), wallMat('tile', 0xe8eef0)); B.add(box(50, 0.05, 20, x, y + 0.27, zc), flatMat(0x3a9ac8, { roughness: 0.1, metalness: 0.1, key: 'pool' }), { cast: false });
      W([x - 30, y, zc - 15], [x + 30, y + 0.3, zc + 15], { walkable: true });
      B.add(box(14, 3.2, 5, x - 22, y + 0.3, zc + s * 12), wallMat('render', 0xe8e2d6)); W([x - 29, y, zc + s * 12 - 2.5], [x - 15, y + 3.5, zc + s * 12 + 2.5], { walkable: true });
      for (let k = 0; k < 6; k++) B.add(new THREE.ConeGeometry(1.6, 0.6, 8).translate(x - 10 + k * 5, y + 2.6, zc - s * 13), flatMat(0xf0f0f0, { key: 'parasolw' }), { cast: false });
    } else if (kind === 'stage') {   // an open lawn with a small stage (buskers, festivals)
      B.add(box(14, 0.8, 8, x, y, zc + s * 6), conc); B.add(box(14, 0.25, 8.6, x, y + 5.2, zc + s * 6), flatMat(0x3a3e42, { key: 'stageroof' }));
      for (const ox of [-6.8, 6.8]) B.add(box(0.3, 4.4, 0.3, x + ox, y + 0.8, zc + s * 9.8), rail);
      W([x - 7, y, zc + s * 6 - 4], [x + 7, y + 0.8, zc + s * 6 + 4], { walkable: true });
    } else if (kind === 'bikes') {   // 따릉이-like rental stand
      B.add(box(16, 0.05, 2.2, x, y + 0.02, zc), groundMat('plaza', { color: 0x8a8a84 }), { cast: false });
      for (let k = 0; k < 10; k++) { B.add(box(0.06, 0.9, 1.7, x - 7 + k * 1.5, y + 0.1, zc), flatMat(0x2a8a4a, { key: 'rbike' })); B.add(new THREE.TorusGeometry(0.33, 0.04, 4, 10).rotateY(Math.PI / 2).translate(x - 7 + k * 1.5, y + 0.4, zc - 0.55), rail, { cast: false }); }
      B.add(box(0.5, 1.6, 0.4, x - 8.5, y, zc), flatMat(0x2a8a4a, { key: 'rbike' }));
    }
  }

  // ferry piers / floating restaurants (a pontoon at the 둔치 level, a gangway through the railing gap)
  for (const f of FERRY) { const c = hanC(f.x), ze = c + f.s * H.hw, zp = ze - f.s * 14;
    B.add(box(6, 0.4, 10, f.x, H.dunY - 0.4, ze - f.s * 5), conc); W([f.x - 3, H.dunY - 0.4, Math.min(ze, ze - f.s * 10)], [f.x + 3, H.dunY, Math.max(ze, ze - f.s * 10)], { walkable: true });
    B.add(box(46, 4.4, 16, f.x, H.water - 0.6, zp - f.s * 6), wallMat('panel', 0xe8e8e6));                       // the pontoon hull
    W([f.x - 23, H.water - 0.6, Math.min(zp - f.s * 14, zp + f.s * 2)], [f.x + 23, H.dunY, Math.max(zp - f.s * 14, zp + f.s * 2)], { walkable: true });
    B.add(box(30, 4, 10, f.x, H.dunY, zp - f.s * 7), wallMat('panel', f.cafe ? 0x2e3a44 : 0xd8dcde)); B.add(box(32, 0.4, 12, f.x, H.dunY + 4, zp - f.s * 7), flatMat(f.cafe ? 0xc8a050 : 0x2a6a9a, { key: 'ferryroof' + f.cafe }));
    B.add(box(26, 2.4, 0.08, f.x, H.dunY + 0.8, zp - f.s * 1.95), flatMat(0x6a8a98, { roughness: 0.12, metalness: 0.5, key: 'ferryglass' }));
    W([f.x - 15, H.dunY, Math.min(zp - f.s * 12, zp - f.s * 2)], [f.x + 15, H.dunY + 4.4, Math.max(zp - f.s * 12, zp - f.s * 2)], { walkable: true });
    for (const ox of [-22.5, 22.5]) B.add(box(0.1, 1.0, 16, f.x + ox, H.dunY, zp - f.s * 6), rail);
  }

  // 누리섬: an island in the river under 한누리대교 (lawn, trees, a small concert hall), reached by stairs from the bridge
  { const c = hanC(ISLAND.x), sh = new THREE.Shape(); for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; sh.lineTo(ISLAND.x + Math.cos(a) * ISLAND.rx, -(c + Math.sin(a) * ISLAND.rz)); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: H.dunY - H.bed, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, H.bed, 0); B.add(g, stone, { cast: false });
    const top = new THREE.ShapeGeometry(sh); top.rotateX(-Math.PI / 2); top.translate(0, H.dunY + 0.02, 0); B.add(top, lawn, { cast: false });
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, b = ((i + 1) / 40) * Math.PI * 2, p = [ISLAND.x + Math.cos(a) * (ISLAND.rx - 1), c + Math.sin(a) * (ISLAND.rz - 1)], q = [ISLAND.x + Math.cos(b) * (ISLAND.rx - 1), c + Math.sin(b) * (ISLAND.rz - 1)];
      W([Math.min(p[0], q[0]) - 0.1, H.dunY, Math.min(p[1], q[1]) - 0.1], [Math.max(p[0], q[0]) + 0.1, H.dunY + 1.1, Math.max(p[1], q[1]) + 0.1], { surface: 'metal', walkable: false });
      B.add(beam([p[0], H.dunY + 1.05, p[1]], [q[0], H.dunY + 1.05, q[1]], 0.07), rail, { cast: false }); }
    const hx = -95; B.add(box(48, 9, 30, hx, H.dunY, c), wallMat('panel', 0xd8d4cc)); B.add(box(50, 1.2, 32, hx, H.dunY + 9, c), flatMat(0x8a6a4a, { key: 'hallroof' }));
    B.add(box(30, 6, 0.1, hx, H.dunY + 0.5, c + 15.05), flatMat(0x6a8a98, { roughness: 0.12, metalness: 0.5, key: 'ferryglass' })); W([hx - 24, H.dunY, c - 15], [hx + 24, H.dunY + 10.2, c + 15], { walkable: true });
    B.add(ribbon(-40, 150, 10, (x) => [c - 2, H.dunY + 0.04], (x) => [c + 2, H.dunY + 0.04]), walkM, { cast: false });
    for (let i = 0; i < 26; i++) { const x = 30 + rnd() * 160, z = c + (rnd() - 0.5) * 70; if (((x - ISLAND.x) / (ISLAND.rx - 8)) ** 2 + ((z - c) / (ISLAND.rz - 8)) ** 2 < 1 && Math.abs(x) > 20) tree(x, H.dunY, z, 0.9 + rnd() * 0.5); } }

  // ---------------------------------------------------------------- bridges
  const lampM = flatMat(0x5a6066, { metalness: 0.5, roughness: 0.4, key: 'hanlamp' }), lampHead = flatMat(0xf4f0e0, { key: 'hanlamphead' });
  const plate = (name, x, y, z, ry) => { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d'); g.fillStyle = '#2a3036'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#e8e4d8'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 256, 66);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })); m.position.set(x, y, z); m.rotation.y = ry; m.userData.lodAlways = true; scene.add(m); };
  const moving = [];
  for (const br of BRIDGES) {
    const x = br.x, c = hanC(x), zN = hanNorth(x) - 3, zS = hanSouth(x) + 3, L = zS - zN, zm = (zN + zS) / 2;
    const T = br.type, dbot = CURB - 2.4;
    const steel = { girder: 0x4f7896, truss: 0x6d7f8c, tiedarch: 0xdcdad2, cable: 0xe6e6e0, arch: 0x2c5f8e, double: 0x9aa0a4 }[T];
    const sm = flatMat(steel, { roughness: 0.5, metalness: 0.45, key: 'brsteel' + T });
    // deck, asphalt, lane paint, sidewalks, parapets, lamps
    B.add(box(30, 2.35, L, x, dbot, zm), conc); B.add(box(29.6, 0.05, L, x, CURB - 0.04, zm), asph, { cast: false });
    for (const o of [-12.6, 12.6]) B.add(box(2.6, 0.05, L, x + o + Math.sign(o) * 0.6, CURB - 0.02, zm), groundMat('plaza', { color: 0xa8a49a }), { cast: false });
    const med = T === 'arch' ? 4.6 : 0.4; for (const o of [-med, med]) B.add(box(0.15, 0.02, L, x + o, CURB + 0.02, zm), yellow, { cast: false });
    for (const o of [-7.6, -3.9, 3.9, 7.6]) { if (T === 'arch' && Math.abs(o) < 5) continue; for (let z = zN; z < zS - 6; z += 12) B.add(box(0.15, 0.02, 6, x + o + (T === 'arch' ? Math.sign(o) * 1.2 : 0), CURB + 0.02, z + 3), white, { cast: false }); }
    W([x - 15, dbot, zN], [x + 15, CURB, zS], { walkable: true });
    // abutments where the deck meets the levee (so nobody walks under the deck up the slope into it)
    for (const [za, zb] of [[zN, hanC(x) - H.hw - H.dun], [hanC(x) + H.hw + H.dun, zS]]) { B.add(box(30, dbot - H.dunY, zb - za, x, H.dunY, (za + zb) / 2), conc); W([x - 15, H.dunY, za], [x + 15, dbot, zb], { walkable: false }); }
    // stairs down to the 둔치 at both ends (east side): a gap in the parapet, a landing, 37 steps of 18 cm
    const stairs = [{ zt: c + H.hw + H.dun - 31, dir: -1 }, { zt: c - H.hw - H.dun + 31, dir: 1 }];
    if (T === 'tiedarch') stairs.push({ zt: c - 30, dir: 1 });   // down to 누리섬
    const gapsE = stairs.map((st) => [st.zt - 1.6, st.zt + 1.6]);
    for (const sx of [-1, 1]) { const px = x + sx * 14.75, gs = sx > 0 ? gapsE : []; let z0 = zN;
      for (const [g0, g1] of [...gs.sort((a, b) => a[0] - b[0]), [zS, zS]]) { if (g0 - z0 > 0.5) { B.add(box(0.5, 1.1, g0 - z0, px, CURB, (z0 + g0) / 2), conc); W([px - 0.25, CURB, z0], [px + 0.25, CURB + 1.1, g0], { walkable: false }); } z0 = g1; } }
    for (const st of stairs) { const N = Math.ceil((CURB - H.dunY) / 0.18), sx0 = x + 15.0, sx1 = x + 18.4, gs = [];
      gs.push(box(sx1 - sx0, 0.3, 3.2, (sx0 + sx1) / 2, CURB - 0.3, st.zt)); W([sx0, CURB - 0.3, st.zt - 1.6], [sx1, CURB, st.zt + 1.6], { walkable: true });
      for (let i = 0; i < N; i++) { const top = Math.max(H.dunY, CURB - (i + 1) * 0.18), za = st.zt + st.dir * (1.6 + i * 0.3), zb = za + st.dir * 0.3;
        gs.push(box(sx1 - sx0, top - H.dunY, 0.3, (sx0 + sx1) / 2, H.dunY, (za + zb) / 2)); W([sx0, H.dunY, Math.min(za, zb)], [sx1, top, Math.max(za, zb)], { walkable: true }); }
      const zEnd = st.zt + st.dir * (1.6 + N * 0.3);
      for (const g of gs) B.add(g, conc);
      B.add(beam([sx1, CURB + 1.0, st.zt - st.dir * 1.6], [sx1, CURB + 1.0, st.zt + st.dir * 1.6], 0.07), rail, { cast: false });
      B.add(beam([sx1, CURB + 1.0, st.zt + st.dir * 1.6], [sx1, H.dunY + 1.0, zEnd], 0.07), rail, { cast: false });
      for (const [zz0, zz1] of [[st.zt - 1.6, st.zt + 1.6], [st.zt + st.dir * 1.6, zEnd]]) W([sx1 - 0.05, H.dunY, Math.min(zz0, zz1)], [sx1 + 0.15, CURB + 1.1, Math.max(zz0, zz1)], { surface: 'metal', walkable: false });
      for (let i = 0; i < 4; i++) B.add(box(0.07, 1.0, 0.07, sx1, CURB - ((i * N) / 4) * 0.18, st.zt + st.dir * (1.6 + (i * N / 4) * 0.3)), rail, { cast: false }); }
    for (let z = zN + 10; z < zS - 5; z += 42) for (const sx of [-1, 1]) { B.add(box(0.25, 10, 0.25, x + sx * 14.6, CURB + 1.1, z), lampM); B.add(box(2.4, 0.2, 0.5, x + sx * 13.6, CURB + 10.9, z), lampM); B.add(box(0.9, 0.12, 0.4, x + sx * 12.8, CURB + 10.8, z), lampHead, { cast: false }); }
    plate(br.name, x - 14.45, CURB + 0.6, zS - 8, Math.PI / 2); plate(br.name, x + 14.45, CURB + 0.6, zN + 8, -Math.PI / 2);   // on the parapets' inner faces, read from the road
    // piers: in the water from the bed, on the 둔치 from the flat; spans per type
    const baseAt = (z) => (Math.abs(z - c) < H.hw + 1 && !(T === 'tiedarch' && inIsland(x, z))) ? H.bed : H.dunY;
    const span = { girder: 92, truss: 110, tiedarch: 120, cable: 100, arch: 170, double: 58 }[T];
    const pierZ = [];
    for (let k = -12; k <= 12; k++) { const z = c + k * span + (T === 'arch' || T === 'cable' ? 0 : span / 2) * (T === 'tiedarch' ? 0 : 1); if (Math.abs(z - c) < H.hw + H.dun - 6) pierZ.push(z); }
    for (const sg of [-1, 1]) { const zq = c + sg * (H.hw + H.dun / 2); if (!pierZ.some((z) => Math.abs(z - zq) < 25)) pierZ.push(zq); }   // the 둔치 spans need their own piers
    if (T === 'cable') { for (const k of [-1, 1]) { const i = pierZ.findIndex((z) => Math.abs(z - (c + k * span)) < 1); if (i >= 0) pierZ.splice(i, 1); } }
    for (const z of pierZ) { const yb = baseAt(z), h = dbot - yb;
      if (T === 'double') { for (const ox of [-11, 11]) B.add(box(2.2, h, 3, x + ox, yb, z), conc); B.add(box(26, 1.6, 3.4, x, dbot - 1.6, z), conc); if (yb === H.dunY) for (const ox of [-11, 11]) W([x + ox - 1.1, yb, z - 1.5], [x + ox + 1.1, dbot, z + 1.5], { walkable: false }); continue; }
      if (T === 'girder' || T === 'arch') { B.add(box(16, h - 1.5, 4.5, x, yb, z), conc); B.add(box(26, 1.5, 5, x, dbot - 1.5, z), conc); }
      else { for (const ox of [-8, 8]) B.add(new THREE.CylinderGeometry(1.6, 1.8, h, 12).translate(x + ox, yb + h / 2, z), conc); B.add(box(24, 1.6, 4, x, dbot - 1.6, z), conc); }
      if (yb === H.dunY) W([x - 9.6, yb, z - 2.3], [x + 9.6, dbot, z + 2.3], { walkable: false }); }
    const wet0 = c - H.hw - 4, wet1 = c + H.hw + 4;   // the part over the water
    if (T === 'girder') {   // a deep steel box girder, haunched over the piers
      B.add(box(22, 3.2, wet1 - wet0, x, dbot - 3.2, (wet0 + wet1) / 2), sm);
      for (const z of pierZ) B.add(box(22, 1.6, 30, x, dbot - 4.8, z), sm);
    } else if (T === 'truss') {   // Warren trusses on both sides, cross beams overhead
      const P = 11, n = Math.floor((wet1 - wet0) / P), z0 = wet0 + ((wet1 - wet0) - n * P) / 2, top = CURB + 9;
      for (const sx of [-1, 1]) { const tx = x + sx * 15.6;
        B.add(beam([tx, CURB + 0.4, z0], [tx, CURB + 0.4, z0 + n * P], 0.7, 0.9), sm); B.add(beam([tx, top, z0], [tx, top, z0 + n * P], 0.8, 0.9), sm);
        for (let i = 0; i <= n; i++) { const z = z0 + i * P; B.add(beam([tx, CURB + 0.4, z], [tx, top, z], 0.45), sm); if (i < n) B.add(i % 2 ? beam([tx, CURB + 0.4, z], [tx, top, z + P], 0.4) : beam([tx, top, z], [tx, CURB + 0.4, z + P], 0.4), sm); }
        W([tx - 0.4, CURB, z0], [tx + 0.4, top, z0 + n * P], { walkable: false }); }
      for (let i = 0; i <= n; i += 2) B.add(beam([x - 15.6, top, z0 + i * P], [x + 15.6, top, z0 + i * P], 0.4, 0.5), sm);
      for (let i = 0; i < n; i += 2) { B.add(beam([x - 15.6, top, z0 + i * P], [x + 15.6, top, z0 + (i + 2) * P], 0.25), sm); }
    } else if (T === 'tiedarch' || T === 'arch') {   // arches over the spans, hangers down to the deck edge
      const spans = []; const ps = [...pierZ].sort((a, b) => a - b);
      for (let i = 0; i < ps.length - 1; i++) { const a = ps[i], b = ps[i + 1]; if (Math.abs(a - c) <= H.hw + 1 && Math.abs(b - c) <= H.hw + 1) spans.push([a, b]); }
      const rise = T === 'arch' ? 30 : 17;
      for (const [a, b] of spans) for (const sx of [-1, 1]) { const ax = x + sx * 15.6, N = 16; let prev = null;
        for (let i = 0; i <= N; i++) { const t = i / N, z = a + (b - a) * t, y = CURB + 0.5 + rise * Math.sin(Math.PI * t); if (prev) B.add(beam(prev, [ax, y, z], T === 'arch' ? 1.4 : 0.9, T === 'arch' ? 1.2 : 0.8), sm); prev = [ax, y, z]; }
        for (let z = a + 8; z < b - 6; z += 8) { const t = (z - a) / (b - a); B.add(beam([ax, CURB + 0.6, z], [ax, CURB + 0.5 + rise * Math.sin(Math.PI * t), z], 0.1), sm); }
        { let z0 = a; for (const [g0, g1] of [...(sx > 0 ? gapsE : []).filter(([g0, g1]) => g1 > a && g0 < b).map(([g0, g1]) => [g0 - 0.6, g1 + 0.6]), [b, b]]) { if (g0 - z0 > 0.3) W([ax - 0.6, CURB, z0], [ax + 0.6, CURB + 4, g0], { walkable: false }); z0 = g1; } }   // open where a stair leaves the deck
        if (T === 'arch') for (let i = 3; i < N - 2; i += 3) { const t = i / N, z = a + (b - a) * t, y = CURB + 0.5 + rise * Math.sin(Math.PI * t); if (sx > 0) B.add(beam([x - 15.6, y, z], [x + 15.6, y, z], 0.6), sm); } }
      if (T === 'arch') {   // the metro in the median: track bed, rails, tunnel portals at both ends, a running train
        B.add(box(8.6, 0.35, L, x, CURB, zm), conc); for (const o of [-0.72, 0.72]) B.add(box(0.12, 0.15, L, x + o, CURB + 0.35, zm), rail, { cast: false });
        for (const o of [-4.4, 4.4]) { B.add(box(0.3, 1.0, L, x + o, CURB, zm), conc); W([x + o - 0.15, CURB, zN], [x + o + 0.15, CURB + 1.0, zS], { walkable: false }); }
        for (const [zp, sg] of [[zN, -1], [zS, 1]]) { B.add(box(10, 5.6, 6, x, CURB, zp + sg * 3), conc); B.add(box(7, 4.4, 0.4, x, CURB + 0.35, zp - sg * 0.05), flatMat(0x0a0c0e, { key: 'tunnel' }), { cast: false }); }
        const train = new THREE.Group(), body = flatMat(0xd8dcde, { roughness: 0.35, metalness: 0.5, key: 'metro' }), stripe = flatMat(0x3a6ac8, { key: 'metrostripe' }), win = flatMat(0x2a3440, { roughness: 0.1, metalness: 0.6, key: 'metrowin' });
        for (let k = 0; k < 6; k++) { const z = k * 20.5; for (const [m2, g] of [[body, box(3.1, 3.2, 20, 0, 0.5, z)], [stripe, box(3.14, 0.35, 19.6, 0, 1.4, z)], [win, box(3.16, 0.9, 18, 0, 2.0, z)]]) { const mm = new THREE.Mesh(g, m2); mm.castShadow = false; train.add(mm); } }
        train.position.set(x, CURB + 0.35, zN); train.userData.lodAlways = true; train.traverse((o) => { o.userData.lodAlways = true; }); scene.add(train);
        moving.push({ obj: train, z0: zN - 130, z1: zS + 10, v: 16, t: 0.3, clip: [zN, zS] });
      }
    } else if (T === 'cable') {   // one tall pylon in the median (four legs meeting at the top), fans of stay cables
      const top = CURB + 86, legs = [[-12.5, -7], [12.5, -7], [-12.5, 7], [12.5, 7]];
      B.add(box(28, dbot - H.bed, 18, x, H.bed, c), conc);
      for (const [ox, oz] of legs) { B.add(beam([x + ox, dbot, c + oz], [x + ox * 0.08, top, c + oz * 0.1], 2.4, 2.2), sm); W([x + ox - 1.3, CURB, c + oz - 1.2], [x + ox + 1.3, CURB + 6, c + oz + 1.2], { walkable: false }); }
      for (const y of [CURB + 22, CURB + 48]) { const k = (y - dbot) / (top - dbot); B.add(beam([x - 12.5 * (1 - k * 0.92), y, c], [x + 12.5 * (1 - k * 0.92), y, c], 1.2), sm); }
      B.add(box(4, 9, 4, x, top - 2, c), sm); B.add(new THREE.ConeGeometry(2.4, 6, 4).translate(x, top + 10, c), sm);
      const cab = flatMat(0xf0f0ec, { roughness: 0.4, metalness: 0.5, key: 'cable' });
      for (const sg of [-1, 1]) for (let i = 0; i < 13; i++) B.add(beam([x, top - 6 - i * 2.6, c + sg * 1.2], [x, CURB + 0.6, c + sg * (24 + i * 13.5)], 0.16), cab, { cast: false });
      B.add(box(1.2, 0.8, L, x, CURB, zm), conc); W([x - 0.6, CURB, zN], [x + 0.6, CURB + 0.8, zS], { walkable: false });   // median barrier (cable anchors)
    } else if (T === 'double') {   // 물빛대교 + 물빛잠수교 underneath at the 둔치 level, rainbow fountain on the upper deck's edges
      const lz0 = c - H.hw - 6, lz1 = c + H.hw + 6, ly = H.dunY;
      B.add(box(18, 1.4, lz1 - lz0, x, ly - 1.4, (lz0 + lz1) / 2), conc); B.add(box(13, 0.05, lz1 - lz0, x, ly, (lz0 + lz1) / 2), asph, { cast: false });
      for (const o of [-7.8, 7.8]) B.add(box(2.4, 0.06, lz1 - lz0, x + o, ly, (lz0 + lz1) / 2), groundMat('plaza', { color: 0xa8a49a }), { cast: false });
      W([x - 9, ly - 1.4, lz0], [x + 9, ly, lz1], { walkable: true });
      for (const o of [-9, 9]) { for (let z = lz0 + 2; z < lz1; z += 3) B.add(box(0.1, 1.0, 0.1, x + o, ly, z), rail, { cast: false }); B.add(box(0.08, 0.08, lz1 - lz0, x + o, ly + 1.0, (lz0 + lz1) / 2), rail, { cast: false }); W([x + o - 0.1, ly, lz0 + 4], [x + o + 0.1, ly + 1.1, lz1 - 4], { surface: 'metal', walkable: false }); }
      for (let z = lz0 + 20; z < lz1 - 10; z += 30) if (!pierZ.some((pz) => Math.abs(pz - z) < 6)) B.add(box(12, ly - 1.4 - H.bed, 2.4, x, H.bed, z), conc);
      plate('물빛잠수교', x + 8.85, ly + 0.6, lz1 - 8, -Math.PI / 2);
      // fountain: arcs of water from nozzles under both edges of the upper deck down into the river
      const pos = []; const arc = (sx, z) => { let prev = null; for (let i = 0; i <= 8; i++) { const t = i / 8, px = x + sx * (15.3 + 21 * t), py = dbot + 0.8 + 5.5 * t - 5.5 * t * t - (dbot + 0.8 - H.water) * t * t; const p = [px, py, z]; if (prev) for (const [w0, w1] of [[0.09, 0], [0, 0.09]]) pos.push(prev[0], prev[1] - w0, prev[2] - w1, p[0], p[1] - w0, p[2] - w1, p[0], p[1] + w0, p[2] + w1, prev[0], prev[1] - w0, prev[2] - w1, p[0], p[1] + w0, p[2] + w1, prev[0], prev[1] + w0, prev[2] + w1); prev = p; } };
      for (let z = c - H.hw + 6; z < c + H.hw - 6; z += 1.6) for (const sx of [-1, 1]) { arc(sx, z); arc(sx, z + 0.5); }
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.computeVertexNormals();
      const fm = new THREE.MeshStandardMaterial({ color: 0xdff2ff, emissive: 0x9ad0f0, emissiveIntensity: 0.35, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2 });
      const fountain = new THREE.Mesh(fg, fm); fountain.userData.lodAlways = true; fountain.renderOrder = 2; scene.add(fountain); moving.push({ fountain: fm });
    }
  }
  return {
    tick(dt) { for (const m of moving) {
      if (m.fountain) { m.t = (m.t ?? 0) + dt; m.fountain.opacity = 0.26 + 0.06 * Math.sin(m.t * 3.1); m.fountain.color.setHSL((m.t * 0.03) % 1, 0.35, 0.86); continue; }
      // the metro: across the bridge, into the tunnel, a pause, then back the other way
      m.t += dt; const run = (m.z1 - m.z0) / m.v, cyc = (m.t % (2 * run + 20)), dir = cyc < run + 10 ? 1 : -1, k = dir > 0 ? Math.min(1, cyc / run) : Math.min(1, (cyc - run - 10) / run);
      const z = dir > 0 ? m.z0 + (m.z1 - m.z0) * k : m.z1 - (m.z1 - m.z0) * k; m.obj.position.z = z;
      m.obj.children.forEach((ch, i) => { const zc = z + Math.floor(i / 3) * 20.5; ch.visible = zc > m.clip[0] - 10 && zc < m.clip[1] + 10 - 20; }); } },
  };
}
// ferry piers (s: +1 south bank, -1 north bank); cafe = a floating restaurant
const FERRY = [{ x: -700, s: 1, cafe: false }, { x: 760, s: 1, cafe: true }, { x: -200, s: -1, cafe: true }, { x: 1130, s: -1, cafe: false }];
