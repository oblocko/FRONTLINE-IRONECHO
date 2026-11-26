// The metropolitan region around the detailed districts: ~3.4 x 2.8 km of planned city so the place reads
// as a real metropolis from any height, then a river to the north and mountains on the horizon.
// Beyond the playable streets: no colliders, low-poly masses with textured façades, merged per 240 m
// chunk (frustum culled), big buildings registered as occluders with the LOD system.
//
// PLAN (north = -z): an arterial grid (x 0 = 중앙대로, x 420 = the boulevard) splits the land into cells; each
// cell belongs to the nearest district seed (SEEDS) and is subdivided by that district's own street grid.
//   cbd / business  towers on podiums, tiered, heights falling away from the district centre
//   downtown        perimeter commercial blocks, continuous frontage, parking courts
//   mixed           주상복합: commercial podiums + slender residential towers
//   highrise / slab apartment complexes (new towers 28-42 floors / older 12-15 floor slabs) with a shopping
//                   block on the arterial corner, one colour scheme per complex
//   villa           다세대 quarters: 12 x 15 lots on 6 m lanes, a mid-rise edge next to denser districts
//   industrial, campus, park, stadium
//   river z -1150..-800 with bridges on the arterials, riverside parks on both banks; mountains beyond
import * as THREE from 'three';
import { Batch } from './CityPlan.js';
import { wallMat, flatMat, groundMat } from './CityMaterials.js';
import { curtainMat, gridMat, outline, shell, cap } from './Modern.js';
import { CURB } from './Streets.js';
import { DISTRICT as HAND } from './HaneulDistrict.js';
import { frontSigns, facility } from './RegionExtras.js';
import { HAN, hanC, hanNorth, hanSouth, inHan, buildHan } from './HanRiver.js';
import { blockStreetscape, arterialScape, tickSignals, lotMat } from './RegionStreets.js';
import { Traffic } from './Traffic.js';
import { shopDetails, villaPiloti, towerDetails, complexDetails, slabDetails, parkingRow, officeDetails, civic, CIVIC } from './RegionBuildings.js';

const EXT = { x0: -1500, x1: 1900, z0: -2050, z1: 1400 };   // the Han runs through it (z ≈ -1000): 강북 north of it, 강남 south
const CORE = { x0: -206, x1: 726, z0: -306, z1: 306 };
const ARTX = [-1440, -960, -480, 0, 420, 900, 1380, 1860], ARTZ = [-1640, -500, 660, 1020, 1380];
const LANDMARK = { x: 488, z: -50 };
// Urban structure (concentric, like a real metropolis): 도심 (the hand-made core) → 중간 지역 (mixed / villas) →
// 외곽 지역 (apartment complexes; factories west, schools / university north) → 개발제한구역 (greenbelt: forest,
// fields, greenhouses) at the edge; two 부도심 (sub-centres) on the outer arterial junctions, each with a road out
// through the greenbelt to a 위성 도시 (satellite town) on the plain beyond.
const CEN = { x: 260, z: 0 };
export const SUB = [{ x: -960, z: 660, name: '서부 부도심' }, { x: 1380, z: 660, name: '동부 부도심' }];
export const SAT = [{ x: -2750, z: 1450, R: 430, name: '서쪽 위성도시' }, { x: 3250, z: 1450, R: 430, name: '동쪽 위성도시' }];
function zoneOf(x, z) {
  for (const s of SUB) { const d = Math.hypot(x - s.x, z - s.z); if (d < 300) return { type: d < 170 ? 'cbd' : 'business', x: s.x, z: s.z }; }
  if (Math.hypot(x - 1600, z + 240) < 190) return { type: 'stadium', x, z };
  const dx = (x - CEN.x) / 1650, dz = (z - CEN.z) / 1380, r = Math.hypot(dx, dz), ang = Math.atan2(dz, dx), v = (Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.009) + 1) / 2;
  // 강북: riverside apartment complexes along the river, the old downtown in the middle, villas / 주상복합 round it,
  // the greenbelt at the edge
  if (z < -1050) { const rx = (x - CEN.x) / 1650, dn = hanNorth(x) - z;
    if (Math.abs(rx) > 0.95 || z < EXT.z0 + 110) return { type: 'greenbelt', x, z };
    if (dn < 230) return { type: v < 0.6 ? 'highrise' : 'slab', x, z };
    if (Math.abs(rx) < 0.3) return { type: Math.abs(Math.sin(x * 0.005 + z * 0.003)) < 0.45 ? 'business' : 'downtown', x: CEN.x, z: -1720 };
    return { type: v < 0.55 ? 'villa' : 'mixed', x, z }; }
  const nearSub = SUB.some((s) => Math.hypot(x - s.x, z - s.z) < 560);
  if (r > 0.9 && !nearSub) return { type: 'greenbelt', x, z };
  if (r > 0.9) return { type: v < 0.6 ? 'highrise' : 'mixed', x, z };
  if (z - hanSouth(x) < 200 && Math.abs(x - CEN.x) > 380) return { type: v < 0.6 ? 'highrise' : 'slab', x, z };   // 강남 riverside apartments
  // the master plan: north and east of the centre offices (업무), the centre commercial (상업), west and south-west
  // housing with schools, south-east the culture quarter (공연장 / 미술관 / 도서관)
  if (r < 0.52) { if ((ang < -0.9 && ang > -2.3) || Math.abs(ang) < 0.55) return { type: 'business', x: CEN.x, z: CEN.z }; return { type: 'downtown', x: CEN.x, z: CEN.z }; }
  if (r < 0.72) { if (ang > 0.25 && ang < 1.15) return { type: 'culture', x, z }; if (Math.abs(ang) > 2.2) return { type: v < 0.4 ? 'highrise' : 'villa', x, z }; return { type: v < 0.5 ? 'villa' : 'mixed', x, z }; }
  if (Math.abs(ang) > 2.55) return { type: 'industrial', x, z };                       // west: 공장
  if (ang < -1.05 && ang > -2.1) return { type: 'campus', x, z };                       // north: 학교 / 대학
  return { type: v < 0.55 ? 'highrise' : 'slab', x, z };                                // 아파트 단지
}
// highways from the sub-centres out to the satellite towns (outside the city rectangle)
const HWY = SUB.map((s, i) => ({ a: [s.x, s.z], b: [SAT[i].x, SAT[i].z] }));
const segDist = (x, z, [ax, az], [bx, bz]) => { const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz))); return Math.hypot(x - ax - vx * t, z - az - vz * t); };
const inExt = (x, z) => x > EXT.x0 - 150 && x < EXT.x1 + 150 && z > EXT.z0 - 150 && z < EXT.z1 + 150;
// the height to walk on outside the city slab: satellite towns and highways are flat at the curb, the rest is terrain
export function outerGround(x, z) {
  for (const t of SAT) if (Math.hypot(x - t.x, z - t.z) < t.R) return CURB;
  for (const h of HWY) if (segDist(x, z, h.a, h.b) < 12) return CURB;
  return Math.max(terrainHeight(x, z), -1.8);
}
export const REGION_EXT = EXT;

// ------------------------------------------------------------------ façade textures (painted, tile = uM x vM metres)
const texCache = new Map();
function tex(key, draw, W = 256, H = 256) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); let s = 9; for (const ch of key) s = (s * 31 + ch.charCodeAt(0)) % 2147483647;
  draw(g, W, H, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; texCache.set(key, t); return t;
}
const css = (h) => `#${new THREE.Color(h).getHexString()}`;
const mats = new Map();
function mat(key, make) { if (!mats.has(key)) mats.set(key, make()); return mats.get(key); }
// apartment: balcony bands per floor (2.8 m), wide glazing, tile = 6.8 x 2.8
// style 0: wide balcony glazing with a white slab band; 1: punched windows between vertical piers (older);
// 2: horizontal white bands + dark glass (newer); tile = 6.8 x 2.8 (one unit, one floor)
const aptMat = (wall, style = 0) => mat(`apt${wall}${style}`, () => { const m = new THREE.MeshStandardMaterial({ roughness: 0.75, map: tex(`apt${wall}${style}`, (g, W, H, r) => {
  g.fillStyle = css(wall); g.fillRect(0, 0, W, H);
  if (style === 1) { for (let i = 0; i < 4; i++) { const x = i * W / 4; g.fillStyle = '#3e4a52'; g.fillRect(x + 12, H * 0.2, W / 4 - 24, H * 0.5); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 12, H * 0.2, W / 4 - 24, 4); }
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i <= 4; i++) g.fillRect(i * W / 4 - 3, 0, 6, H); }
  else if (style === 2) { g.fillStyle = '#2e3a44'; g.fillRect(0, H * 0.12, W, H * 0.62); for (let i = 0; i < 6; i++) { if (r() < 0.5) { g.fillStyle = 'rgba(210,206,196,0.5)'; g.fillRect(i * W / 6 + 3, H * 0.12, W / 6 - 6, H * 0.62 * (0.2 + r() * 0.5)); } g.fillStyle = 'rgba(200,210,214,0.35)'; g.fillRect(i * W / 6, H * 0.12, 3, H * 0.62); }
    g.fillStyle = '#f2f0ea'; g.fillRect(0, H * 0.74, W, H * 0.26); }
  else { for (let i = 0; i < 2; i++) { const x = i * W / 2; g.fillStyle = r() < 0.5 ? '#41505a' : '#55626a'; g.fillRect(x + 10, H * 0.18, W / 2 - 20, H * 0.55); if (r() < 0.5) { g.fillStyle = 'rgba(220,214,200,0.6)'; g.fillRect(x + 10, H * 0.18, (W / 2 - 20) * (0.2 + r() * 0.4), H * 0.55); } }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, H * 0.75, W, H * 0.06); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, H * 0.73, W, 4); }
}) }); m.userData.uM = 6.8; m.userData.vM = 2.8; return m; });
// office façades beyond curtain wall / grid: vertical fins, ribbon windows (tile 6 x 4)
const finMat = (glass, fin) => mat(`fin${glass}${fin}`, () => { const m = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.35, map: tex(`fin${glass}${fin}`, (g, W, H) => {
  g.fillStyle = css(glass); g.fillRect(0, 0, W, H); for (let x = 0; x < W; x += W / 8) { g.fillStyle = css(fin); g.fillRect(x, 0, 10, H); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 10, 0, 4, H); } g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, H - 8, W, 4);
}) }); m.userData.uM = 6; m.userData.vM = 4; return m; });
const ribbonMat = (wall, glass) => mat(`rib${wall}${glass}`, () => { const m = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.2, map: tex(`rib${wall}${glass}`, (g, W, H) => {
  g.fillStyle = css(wall); g.fillRect(0, 0, W, H); g.fillStyle = css(glass); g.fillRect(0, H * 0.1, W, H * 0.55); g.fillStyle = 'rgba(255,255,255,0.2)'; for (let x = 0; x < W; x += W / 4) g.fillRect(x, H * 0.1, 3, H * 0.55);
}) }); m.userData.uM = 6; m.userData.vM = 4; return m; });
// commercial / older mid-rise: windows on tile, tile = 3 x 3.3
const comMat = (wall, glass, signs = false) => mat(`com${wall}${glass}${signs}`, () => { const m = new THREE.MeshStandardMaterial({ roughness: 0.8, map: tex(`com${wall}${glass}${signs}`, (g, W, H, r) => {
  g.fillStyle = css(wall); g.fillRect(0, 0, W, H);
  if (signs) { const cols = ['#c83a2a', '#1d4f8a', '#2a8a4a', '#d8a020', '#7a2a8a', '#e86a1a']; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(W * 0.05, 0, W * 0.9, H * 0.16); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(W * 0.2, H * 0.05, W * 0.6, H * 0.05); } g.fillStyle = css(glass); g.fillRect(W * 0.1, H * 0.2, W * 0.8, H * 0.55); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(W * 0.1, H * 0.2, W * 0.8, 6);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(40,36,30,${r() * 0.08})`; g.fillRect(r() * W, r() * H, 3, 3); }
}) }); m.userData.uM = 3; m.userData.vM = 3.3; return m; });
// villa (다세대): brick with small windows, tile = 3.2 x 2.8
const villaMat = (brick) => mat(`villa${brick}`, () => { const m = new THREE.MeshStandardMaterial({ roughness: 0.9, map: tex(`villa${brick}`, (g, W, H, r) => {
  g.fillStyle = css(brick); g.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 8) for (let x = (y / 8) % 2 * 10; x < W; x += 20) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`; g.fillRect(x, y, 19, 1); }
  g.fillStyle = '#e8e4d8'; g.fillRect(W * 0.28, H * 0.3, W * 0.44, H * 0.4); g.fillStyle = '#3e4a52'; g.fillRect(W * 0.3, H * 0.32, W * 0.4, H * 0.36);
}) }); m.userData.uM = 3.2; m.userData.vM = 2.8; return m; });
const roofM = () => mat('roof', () => flatMat(0x6e7270, { roughness: 0.9, key: 'regroof' }));
const roofGreen = () => mat('roofg', () => flatMat(0x4c6e58, { roughness: 0.8, key: 'regroofg' }));
// roofs differ per building: grey concrete, dark membrane, light coating, a few green (rooftop garden) / sand tile
const ROOFS = [0x6e7270, 0x6e7270, 0x4a4e52, 0xb8bab4, 0x8a8478, 0x4c6e58];
const roofOf = (k) => { const c = ROOFS[Math.abs(Math.floor(k)) % ROOFS.length]; return () => mat(`roof${c}`, () => flatMat(c, { roughness: 0.85, key: `regroof${c}` })); };
// rooftop plant (옥상 설비): AC condensers, a water tank, an antenna mast, a stair / lift housing, a parapet rail
const equipMat = () => mat('roofequip', () => flatMat(0xa8aaa6, { roughness: 0.6, metalness: 0.3, key: 'roofequip' }));
function roofKit(spec, rnd, x, z, w, d, h) {
  const top = CURB + h + 0.5, gs = [], n = Math.floor(rnd() * 4);
  for (let i = 0; i < n + 1; i++) { const ax = x + (rnd() - 0.5) * (w - 4), az = z + (rnd() - 0.5) * (d - 4); gs.push(boxGeo(1.4, 1.0, 0.9, ax, top, az)); }
  if (rnd() < 0.5) gs.push(boxGeo(Math.min(5, w * 0.3), 3, Math.min(4, d * 0.3), x + (w / 2 - 3.5) * (rnd() < 0.5 ? 1 : -1), top, z));   // stair / lift housing
  if (h < 30 && rnd() < 0.35) { const tx = x - w / 4, tz = z + d / 4; gs.push(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 10).translate(tx, top + 2.2, tz), boxGeo(2.4, 1.1, 2.4, tx, top, tz)); }   // water tank on a stand
  if (rnd() < 0.3) gs.push(boxGeo(0.25, 6 + rnd() * 6, 0.25, x + w / 4, top, z - d / 4));   // antenna mast
  if (rnd() < 0.5) for (const [ww, dd, ox, oz] of [[w - 0.6, 0.15, 0, -(d / 2 - 0.3)], [w - 0.6, 0.15, 0, d / 2 - 0.3], [0.15, d - 0.6, -(w / 2 - 0.3), 0], [0.15, d - 0.6, w / 2 - 0.3, 0]]) gs.push(boxGeo(ww, 1.0, dd, x + ox, top - 0.5, z + oz));   // parapet rail
  spec(x, z, { geo: () => mergeGeos(gs), mat: equipMat, box: [x - 1, z - 1, x + 1, z + 1, h + 1], color: 0xa8aaa6, np: true });
}
function mergeGeos(gs) { const pos = [], nor = []; for (const g0 of gs) { const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); } }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); return m; }

// ------------------------------------------------------------------ helpers
const inCore = (x0, z0, x1, z1) => x1 > CORE.x0 && x0 < CORE.x1 && z1 > CORE.z0 && z0 < CORE.z1;
// the hand-made quarter (HandStreets.js) replaces the generated blocks, their streets and trees
const inHand = (x0, z0, x1, z1) => x1 > HAND.x0 - 2 && x0 < HAND.x1 + 2 && z1 > HAND.z0 - 2 && z0 < HAND.z1 + 2;
const inRiver = (z0, z1, x0 = -1e4, x1 = 1e4, m = 10) => inHan(Math.max(x0, EXT.x0 - 160), z0, Math.min(x1, EXT.x1 + 160), z1, m);
function boxGeo(w, h, d, x, y, z) { return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z); }

// Streaming: every 240 m chunk keeps its buildings as SPECS (data). At load each chunk gets an HLOD proxy (boxes,
// vertex colours, one draw call); the textured detail of a chunk is built only when the player comes within
// DETAIL_IN, one chunk per frame, and freed again beyond DETAIL_OUT.
const CH = 240, DETAIL_IN = 900, DETAIL_OUT = 1300;
export class Region {
  constructor(ctx, lod) { this.ctx = ctx; this.lod = lod; this.chunks = new Map(); this.t = 0; this.build(); }
  chunk(x, z) { const k = `${Math.floor(x / CH)},${Math.floor(z / CH)}`; if (!this.chunks.has(k)) this.chunks.set(k, { k, cx: (Math.floor(x / CH) + 0.5) * CH, cz: (Math.floor(z / CH) + 0.5) * CH, specs: [], proxy: null, detail: null }); return this.chunks.get(k); }
  build() {
  const ctx = this.ctx, lod = this.lod, scene = ctx.scene; let s = 77; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647); const pick = (a) => a[Math.floor(rnd() * a.length)];
  const B = new Batch(scene); STADIUM.done = false;
  const DBG0 = typeof location !== 'undefined' ? location.search : '';
  const occl = (x0, z0, x1, z1, h) => { if (!DBG0.includes('noocc')) lod?.occluder?.({ x0, z0, x1, z1, y1: CURB + h }); };
  const self = this; const DBG = typeof location !== 'undefined' ? (location.search.match(/rg=([a-z,]+)/)?.[1] || '') : '';
  // a building spec goes to its chunk: { geo: () => BufferGeometry, mat: () => Material, box: [x0, z0, x1, z1, h], color }
  let NSPEC = 0; const spec = (x, z, sp) => { if (++NSPEC > 200000) throw new Error('region: runaway spec generation'); this.chunk(x, z).specs.push(sp); };
  // ground: two slabs, 강남 (south of the river, the detailed core land cut out of it) and 강북; their river edges
  // follow the curve of the Han (the levee tops)
  const slab = (pts, holes) => { const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, -b)));
    for (const h of holes) sh.holes.push(new THREE.Path([[h[0], -h[1]], [h[0], -h[3]], [h[2], -h[3]], [h[2], -h[1]]].map(([a, b]) => new THREE.Vector2(a, b))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, CURB - 0.31, 0); return g; };
  const gm = lotMat(), LX0 = EXT.x0 - 160, LX1 = EXT.x1 + 160, edgeS = [], edgeN = [];
  for (let x = LX1; x >= LX0 - 0.1; x -= 20) edgeS.push([x, hanSouth(x)]);
  for (let x = LX0; x <= LX1 + 0.1; x += 20) edgeN.push([x, hanNorth(x)]);
  if (!DBG.includes('noground')) B.add(slab([[LX0, EXT.z1 + 160], [LX1, EXT.z1 + 160], ...edgeS], [[-200, -270, 200, 270], [200, -300, 720, 300], [HAND.x0, HAND.z0, HAND.x1, HAND.z1]]), gm, { cast: false });
  if (!DBG.includes('noground')) B.add(slab([[LX1, EXT.z0 - 160], [LX0, EXT.z0 - 160], ...edgeN], []), gm, { cast: false });
  const asph = groundMat('asphalt', { roughness: 0.85 });
  // arterials (30 m; they stop at the levee, six of them cross the river on a bridge) and the ring road around the core
  for (const x of ARTX) for (const [a0, a1] of [[EXT.z0, hanNorth(x)], [hanSouth(x), EXT.z1]]) for (const [z0, z1] of (x > HAND.x0 && x < HAND.x1 ? [[a0, Math.min(a1, HAND.z0)], [Math.max(a0, HAND.z1), a1]] : [[a0, a1]])) { if (z1 - z0 < 1) continue; B.add(boxGeo(30, 0.05, z1 - z0, x, CURB - 0.02, (z0 + z1) / 2), asph, { cast: false }); }
  for (const z of ARTZ) B.add(boxGeo(EXT.x1 - EXT.x0, 0.05, 30, (EXT.x0 + EXT.x1) / 2, CURB - 0.02, z), asph, { cast: false });
  for (const z of [CORE.z0 - 14, CORE.z1 + 14]) B.add(boxGeo(CORE.x1 - CORE.x0 + 56, 0.05, 24, (CORE.x0 + CORE.x1) / 2, CURB - 0.02, z), asph, { cast: false });
  for (const x of [CORE.x0 - 14, CORE.x1 + 14]) B.add(boxGeo(24, 0.05, CORE.z1 - CORE.z0 + 56, x, CURB - 0.02, 0), asph, { cast: false });
  // 한강: 둔치 parks, expressways, six bridges, 누리섬 (HanRiver.js)
  const world = ctx.world;
  // arterial paint, signalised junctions (crossings, masts, CCTV, subway entrances, median bus stops)
  const okArt = (x, z) => !inCore(x - 1, z - 1, x + 1, z + 1) && !inHand(x - 1, z - 1, x + 1, z + 1) && !inHan(x - 1, z - 1, x + 1, z + 1, 2) && x > EXT.x0 && x < EXT.x1 && z > EXT.z0 && z < EXT.z1;
  const artLines = [...ARTX.map((x) => ({ axis: 'z', at: x, a0: EXT.z0, a1: EXT.z1 })), ...ARTZ.map((z) => ({ axis: 'x', at: z, a0: EXT.x0, a1: EXT.x1 }))];
  const junctions = ARTX.flatMap((x) => ARTZ.map((z) => ({ x, z })));
  if (!DBG.includes('nostreet')) arterialScape(B, artLines, junctions, okArt, ctx.world);
  this.junctions = junctions;
  if (!DBG.includes('nohan')) this.han = buildHan({ B, world, scene, rnd, tree: (x, y, z, s2) => { for (const [g, m] of treeParts(x, z, s2, y)) B.add(g, m, { cast: false }); } });
  // highways out through the greenbelt to the satellite towns (the terrain is levelled along them)
  for (const h of HWY) { const [ax, az] = h.a, [bx, bz] = h.b, L2 = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
    const g = new THREE.BoxGeometry(L2, 0.8, 24); g.rotateY(-ang); g.translate((ax + bx) / 2, CURB - 0.33, (az + bz) / 2); B.add(g, asph, { cast: false });   // top 7 cm above the land (over the edge lawn)
    const ln = new THREE.BoxGeometry(L2, 0.02, 0.3); ln.rotateY(-ang); ln.translate((ax + bx) / 2, CURB + 0.08, (az + bz) / 2); B.add(ln, flatMat(0xd8b020, { key: 'hwyline' }), { cast: false }); }

  // ---------------------------------------------------------------- master plan: districts
  // Voronoi districts around seeds; each district has a template (see DISTRICTS) that decides block size,
  // street widths, intensity (density / height) and what is built. Districts are taken per arterial cell
  // (arterials are the natural district edges); a block next to a much more intense district gets a mid-rise
  // transition edge.
  const district = zoneOf;
  const xs = [EXT.x0, ...ARTX.filter((x) => x > EXT.x0 && x < EXT.x1), EXT.x1], zs = [EXT.z0, ...ARTZ, EXT.z1];
  const cellD = new Map();
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) cellD.set(`${i},${j}`, district((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2));
  const treeSpots = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const D = cellD.get(`${i},${j}`), T = DISTRICTS[D.type];
    // neighbour intensity (for the transition edge)
    const nb = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].map(([a, b2]) => cellD.get(`${a},${b2}`)).filter(Boolean).map((d) => DISTRICTS[d.type].intensity);
    const hotter = Math.max(0, ...nb) - T.intensity;
    const ax0 = xs[i] + 18, ax1 = xs[i + 1] - 18, az0 = zs[j] + 18, az1 = zs[j + 1] - 18;
    if (ax1 - ax0 < 40 || az1 - az0 < 40) continue;
    // street grid of this district inside the arterial cell
    const nx = Math.max(1, Math.round((ax1 - ax0) / T.block[0])), nz = Math.max(1, Math.round((az1 - az0) / T.block[1]));
    const st = T.street;
    // block sizes vary (±35 %) so the street grid is not a chessboard: big, small and long blocks side by side
    const cuts = (a, b, n) => { const wts = Array.from({ length: n }, () => 0.65 + rnd() * 0.7), sum = wts.reduce((p, q) => p + q, 0), out = [a]; let acc = a; for (const q of wts) { acc += (q / sum) * (b - a); out.push(acc); } return out; };
    const CX = cuts(ax0, ax1, nx), CZ = cuts(az0, az1, nz);
    for (let a2 = 0; a2 < nx; a2++) for (let b2 = 0; b2 < nz; b2++) {
      const x0 = CX[a2] + st / 2, x1 = CX[a2 + 1] - st / 2; let z0 = CZ[b2] + st / 2, z1 = CZ[b2 + 1] - st / 2;
      // a block by the river is cut back to the levee top (the curve, conservatively); a thin leftover becomes a
      // riverside green strip (lawn, trees, a path) like the parks along the real 한강 embankments
      if (inRiver(z0, z1, x0, x1) && x1 - x0 >= 24) { let zs = -Infinity, zn = Infinity; for (let x = x0; x <= x1 + 0.1; x += 10) { const xx = Math.min(x, x1); zs = Math.max(zs, hanSouth(xx) + 6); zn = Math.min(zn, hanNorth(xx) - 6); }
        const mid = (z0 + z1) / 2 > hanC((x0 + x1) / 2) ? 's' : 'n'; if (mid === 's') z0 = Math.max(z0, zs); else z1 = Math.min(z1, zn);
        if (z1 - z0 >= 8 && z1 - z0 < 30 && !inCore(x0 - 30, z0 - 30, x1 + 30, z1 + 30) && !inHand(x0, z0, x1, z1)) { const za = z0, zb = z1;
          spec((x0 + x1) / 2, (za + zb) / 2, { geo: () => boxGeo(x1 - x0, 0.05, zb - za, (x0 + x1) / 2, CURB, (za + zb) / 2), mat: () => groundMat('lawn'), box: [x0, za, x1, zb, 0.05], color: 0x56603a, np: true });
          spec((x0 + x1) / 2, (za + zb) / 2, { geo: () => boxGeo(x1 - x0, 0.04, 2.4, (x0 + x1) / 2, CURB + 0.02, (za + zb) / 2), mat: () => groundMat('plaza', { color: 0xd8d0c0 }), box: [x0, za, x1, zb, 0.05], color: 0xd8d0c0, np: true });
          for (let x = x0 + 5; x < x1 - 3; x += 9) for (const zz of [za + 2.5, zb - 2.5]) if (zb - za > 9 && rnd() < 0.8) treeSpec(spec, x + rnd() * 3, zz, 0.8 + rnd() * 0.5); continue; } }
      if (x1 - x0 < 24 || z1 - z0 < 24 || inCore(x0 - 30, z0 - 30, x1 + 30, z1 + 30) || inRiver(z0, z1, x0, x1, 0)) continue;
      if (a2 < nx - 1 && !inHand(x1, z0, x1 + st, z1 + st)) B.add(boxGeo(st, 0.04, z1 - z0 + st, x1 + st / 2, CURB - 0.02, (z0 + z1) / 2), asph, { cast: false });
      if (b2 < nz - 1 && !inHand(x0, z1, x1 + st, z1 + st)) B.add(boxGeo(x1 - x0 + st, 0.04, st, (x0 + x1) / 2, CURB - 0.02, z1 + st / 2), asph, { cast: false });
      const edge = { n: b2 === 0, s: b2 === nz - 1, w: a2 === 0, e: a2 === nx - 1 };   // block faces an arterial
      // a block touching the hand-made quarter keeps everything that stays clear of it
      const sp = inHand(x0, z0, x1, z1) ? (x, z, q) => { const [a, b, c, d] = q.box; if (!inHand(a, b, c, d)) spec(x, z, q); } : spec;
      const Db = district((x0 + x1) / 2, (z0 + z1) / 2);   // the zone of this block (rings are finer than the arterial cells)
      // sidewalks inside the block (wider along the arterials, where they also take the strip up to the carriageway);
      // the 다세대 alleys and the greenbelt lanes have none
      const rural = Db.type === 'greenbelt', swOf = (f) => rural ? 0 : edge[f] ? 1.5 : st >= 14 ? 3.5 : st >= 10 ? 2.5 : 0, outOf = (f) => (!rural && edge[f] ? 3 : 0);
      const ir = blockStreetscape(sp, rnd, { x0, z0, x1, z1 }, { n: swOf('n'), s: swOf('s'), w: swOf('w'), e: swOf('e') }, { n: outOf('n'), s: outOf('s'), w: outOf('w'), e: outOf('e') }, Db.type, (x, z, s2) => treeSpec(sp, x, z, s2));
      // zebra crossings over the local streets at the block corners
      if (st >= 12 && !rural) { const zg = []; if (a2 < nx - 1) for (let k = 0.6; k < st - 0.4; k += 1.1) zg.push(() => boxGeo(0.55, 0.02, 3, x1 + k, CURB + 0.03, z0 + 2.5));
        if (b2 < nz - 1) for (let k = 0.6; k < st - 0.4; k += 1.1) zg.push(() => boxGeo(3, 0.02, 0.55, x0 + 2.5, CURB + 0.03, z1 + k));
        if (zg.length) sp(x1, z1, { geo: () => mergeGeos(zg.map((f) => f())), mat: () => flatMat(0xeeeee8, { roughness: 0.7, key: 'stwhite' }), box: [x1 - 1, z1 - 1, x1 + 1, z1 + 1, 0.1], color: 0xeeeeee, np: true }); }
      fillBlock(sp, ir, Db, DISTRICTS[Db.type], { edge, hotter, rnd, pick, occl: sp === spec ? occl : (a, b, c, d, h) => { if (!inHand(a, b, c, d)) occl(a, b, c, d, h); } });
    }
    // street trees along the arterials of this cell (both sides, every ~12 m)
    for (let x = ax0; x < ax1; x += 12) for (const z of [az0 - 3, az1 + 3]) treeSpots.push([x, z]);
    for (let z = az0; z < az1; z += 12) for (const x of [ax0 - 3, ax1 + 3]) treeSpots.push([x, z]);
  }
  // the land between the last arterial and the edge of the city ground: woods and meadow, not bare paving
  { const lawnRect = (x0, z0, x1, z1) => { if (x1 - x0 < 4 || z1 - z0 < 4) return; const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      B.add(boxGeo(x1 - x0, 0.05, z1 - z0, cx, CURB, cz), groundMat('lawn'), { cast: false });
      for (let k = 0; k < Math.floor((x1 - x0) * (z1 - z0) / 420); k++) { const x = x0 + 3 + rnd() * (x1 - x0 - 6), z = z0 + 3 + rnd() * (z1 - z0 - 6); if (HWY.some((h) => segDist(x, z, h.a, h.b) < 22)) continue; treeSpec(spec, x, z, 0.9 + rnd() * 0.7, 0x3e5a34); } };
    const split = (x0, z0, x1, z1) => { if (!inHan(x0, z0, x1, z1, 4)) return lawnRect(x0, z0, x1, z1); let zn = Infinity, zs = -Infinity; for (let x = x0; x <= x1 + 0.1; x += 10) { const xx = Math.min(x, x1); zn = Math.min(zn, hanNorth(xx) - 4); zs = Math.max(zs, hanSouth(xx) + 4); } lawnRect(x0, z0, x1, Math.min(z1, zn)); lawnRect(x0, Math.max(z0, zs), x1, z1); };
    const L0 = EXT.x0 - 160, L1 = EXT.x1 + 160, Z0 = EXT.z0 - 160, Z1 = EXT.z1 + 160, xw = ARTX[0] - 15, xe = ARTX[ARTX.length - 1] + 15, zn = EXT.z0, zsB = ARTZ[ARTZ.length - 1] + 15;
    for (let z = Z0; z < Z1; z += 200) { split(L0, z, xw, Math.min(z + 200, Z1)); split(xe, z, L1, Math.min(z + 200, Z1)); }
    for (let x = xw; x < xe; x += 200) { split(x, Z0, Math.min(x + 200, xe), zn); split(x, zsB, Math.min(x + 200, xe), Z1); } }
  // 위성 도시: a town on the plain beyond the greenbelt — a centre of offices / 주상복합, apartment complexes
  // round it, a school, a park; its own street grid on a paved slab
  for (const t of SAT) {
    spec(t.x, t.z, { geo: () => new THREE.CylinderGeometry(t.R, t.R, 2.4, 48).translate(t.x, CURB - 1.2 - 0.01, t.z), mat: lotMat, box: [t.x - 2, t.z - 2, t.x + 2, t.z + 2, 0.1], color: 0x8a8882, np: true });
    const G = 150, st = 16, n = Math.floor((t.R * 1.4) / G);
    for (let a = -n / 2; a < n / 2; a++) for (let b = -n / 2; b < n / 2; b++) {
      const x0 = t.x + a * G + st / 2, z0 = t.z + b * G + st / 2, x1 = x0 + G - st, z1 = z0 + G - st, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, dc = Math.hypot(cx - t.x, cz - t.z);
      if (Math.hypot(Math.max(Math.abs(x0 - t.x), Math.abs(x1 - t.x)), Math.max(Math.abs(z0 - t.z), Math.abs(z1 - t.z))) > t.R - 4) continue;
      spec(cx, z1 + st / 2, { geo: () => boxGeo(G, 0.05, st, cx, CURB - 0.02, z1 + st / 2), mat: () => asph, box: [cx - 1, z1, cx + 1, z1 + 1, 0.05], color: 0x3a3a3a, np: true });
      spec(x1 + st / 2, cz, { geo: () => boxGeo(st, 0.05, G, x1 + st / 2, CURB - 0.02, cz), mat: () => asph, box: [x1, cz - 1, x1 + 1, cz + 1, 0.05], color: 0x3a3a3a, np: true });
      const type = dc < 110 ? (rnd() < 0.5 ? 'mixed' : 'business') : rnd() < 0.7 ? 'highrise' : 'slab';
      const ir = blockStreetscape(spec, rnd, { x0, z0, x1, z1 }, { n: 3.5, s: 3.5, w: 3.5, e: 3.5 }, { n: 0, s: 0, w: 0, e: 0 }, type, (x, z, s2) => treeSpec(spec, x, z, s2));
      fillBlock(spec, ir, { type, x: t.x, z: t.z }, DISTRICTS[type], { edge: { n: true, s: true, w: true, e: true }, hotter: 0, rnd, pick, occl });
    }
  }
  // trees stream with their chunk (merged low-poly crowns)
  for (const [x, z] of treeSpots) { if (inCore(x - 10, z - 10, x + 10, z + 10) || inHand(x - 3, z - 3, x + 3, z + 3) || inRiver(z - 2, z + 2, x - 2, x + 2)) continue; const s2 = 0.8 + rnd() * 0.5; treeSpec(spec, x, z, s2, 0x4a6a3a); }
  // terrain beyond the city: foothills rising into mountain ranges, the river valley carried on through them
  if (!DBG.includes('nohills')) scene.add(terrain(rnd));

  // traffic on the through arterials (the bridged N-S ones, all E-W ones) and the highways to the satellite towns;
  // they stop at the junction signals (the same phase drives the signal lamps)
  if (ctx.game && !DBG.includes('notraffic')) { const T = new Traffic(ctx.game, { y: CURB, rnd }), JB = (pred) => junctions.filter(pred).map((j) => ({ x0: j.x - 15, z0: j.z - 15, x1: j.x + 15, z1: j.z + 15 }));
    for (const x of [-1440, -960, 1380, 1860]) { const off = x === 1380 ? [6.3, 9.7] : [5.3, 8.8], J = JB((j) => j.x === x), n = Math.round((EXT.z1 - EXT.z0) / 150);
      for (const o of off) { T.lane([x - o, EXT.z0], [x - o, EXT.z1], { speed: 13, count: n, junctions: J }); T.lane([x + o, EXT.z1], [x + o, EXT.z0], { speed: 13, count: n, junctions: J }); } }
    for (const z of ARTZ) { const J = JB((j) => j.z === z && okArt(j.x, j.z)), n = Math.round((EXT.x1 - EXT.x0) / 150);
      for (const o of [5.3, 8.8]) { T.lane([EXT.x0, z + o], [EXT.x1, z + o], { speed: 13, count: n, junctions: J }); T.lane([EXT.x1, z - o], [EXT.x0, z - o], { speed: 13, count: n, junctions: J }); } }
    for (const h of HWY) { const [ax, az] = h.a, [bx, bz] = h.b, L2 = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L2, nz = (bx - ax) / L2;
      for (const o of [3, 6.5]) { T.lane([ax - nx * o, az - nz * o], [bx - nx * o, bz - nz * o], { speed: 24, count: Math.round(L2 / 180), junctions: [] }); T.lane([bx + nx * o, bz + nz * o], [ax + nx * o, az + nz * o], { speed: 24, count: Math.round(L2 / 180), junctions: [] }); } }
    T.build(); this.traffic = T; }

  this.specCount = NSPEC;
  if (DBG.includes('nobatch')) B.buckets.clear();
  const out = B.build(); for (const m of out) { m.userData.region = true; m.userData.lodAlways = true; m.castShadow = false; }
  // HLOD proxies for every chunk now; details stream in later
  const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, map: proxyTex() });
  if (!DBG.includes('noproxy')) for (const c of this.chunks.values()) c.proxy = proxyMesh(c.specs, pm, scene);
  if (!DBG.includes('nosprawl')) scene.add(sprawl(rnd, pm));
  this.noDetail = DBG.includes('nodetail');
  }
  // stream: build the nearest missing detail chunk (one per call), free far ones, swap proxy / detail
  update(dt) {
    this.han?.tick(dt); this.traffic?.update(dt); tickSignals(this.traffic);
    // a chunk's detail is built over several frames (≤ ~5 ms of geometry per frame), so streaming never hitches
    if (this.pending) { this.buildSome(); return; }
    if ((this.t -= dt) > 0) return; this.t = 0.15;
    const eye = this.ctx.game.renderer.camera.position; let best = null, bd = Infinity;
    for (const c of this.chunks.values()) {
      const d = Math.hypot(c.cx - eye.x, c.cz - eye.z);
      if (c.detail && d > DETAIL_OUT) { for (const m of c.detail) { m.parent?.remove(m); m.geometry.dispose(); } c.detail = null; for (const k of c.cols ?? []) this.ctx.world?.removeCollider(k); c.cols = null; }
      if (!c.detail && d < DETAIL_IN && d < bd) { bd = d; best = c; }
      if (c.detail) for (const m of c.detail) m.visible = true;
      if (c.proxy) c.proxy.visible = !c.detail;
    }
    if (best && !this.noDetail) { this.pending = { c: best, B: new Batch(this.ctx.scene), i: 0 }; this.buildSome(); }
  }
  buildSome(budget = 5) {
    const P = this.pending, best = P.c, t0 = performance.now(); if (this.syncBuild) budget = 1e9;   // tools / screenshots: whole chunks at once
    while (P.i < best.specs.length) { const sp = best.specs[P.i++]; P.B.add(sp.geo(), sp.mat()); if (sp.roof) { const [x0, z0, x1, z1, h] = sp.box; P.B.add(boxGeo(x1 - x0 - 0.6, 0.5, z1 - z0 - 0.6, (x0 + x1) / 2, CURB + h, (z0 + z1) / 2), sp.roofMat ? sp.roofMat() : roofM()); }
      if (performance.now() - t0 > budget) return; }
    this.pending = null;
    best.detail = P.B.build(); for (const m of best.detail) { m.castShadow = false; m.userData.lodAlways = true; } if (best.proxy) best.proxy.visible = false;
    // solid buildings while the detail is in: you can walk the streets, stand on roofs, not walk through walls
    const W = this.ctx.world; best.cols = [];
    if (W) for (const sp of best.specs) { if (sp.tree || sp.np) continue; const [x0, z0, x1, z1, h] = sp.box; if (h < 2.2 || x1 - x0 < 2.5 || z1 - z0 < 2.5) continue;
      best.cols.push(W.addBox(new THREE.Vector3(x0, CURB, z0), new THREE.Vector3(x1, CURB + h, z1), { surface: 'concrete', cover: true, walkable: true })); }
  }
  // roof height of the background buildings at (x, z) (they have no colliders): free flight stops on / at them
  heightAt(x, z) {
    let h = 0; const i0 = Math.floor(x / CH), j0 = Math.floor(z / CH);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const c = this.chunks.get(`${i},${j}`); if (!c) continue;
      for (const sp of c.specs) { if (sp.tree || sp.np) continue; const b = sp.box; if (x > b[0] - 0.8 && x < b[2] + 0.8 && z > b[1] - 0.8 && z < b[3] + 0.8 && b[4] + CURB > h) h = b[4] + CURB; } }
    return h;
  }
  stats() { let d = 0; for (const c of this.chunks.values()) if (c.detail) d++; return { chunks: this.chunks.size, detailed: d }; }
}
function proxyTex() { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#80909a'; for (let y = 4; y < 64; y += 11) for (let x = 3; x < 64; x += 8) g.fillRect(x, y, 5, 6); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; }
function proxyMesh(specs, mat, scene) {
  if (!specs.length) return null;
  const pos = [], nor = [], uv = [], col = [], c = new THREE.Color();
  for (const sp of specs) { if (sp.tree || sp.np) continue; const [x0, z0, x1, z1, h] = sp.box; const g = boxGeo(x1 - x0, h, z1 - z0, (x0 + x1) / 2, CURB, (z0 + z1) / 2).toNonIndexed(); const p = g.attributes.position, n = g.attributes.normal; c.set(sp.color ?? 0xc8c4bc);
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); const ay = Math.abs(n.getY(i)) > 0.5, ax = Math.abs(n.getX(i)) > 0.5; uv.push(ay ? 0 : (ax ? p.getZ(i) : p.getX(i)) / 8, ay ? 0 : p.getY(i) / 8); const k = ay ? 0.7 : 1; col.push(c.r * k, c.g * k, c.b * k); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat); m.userData.lodAlways = true; scene.add(m); return m;
}

// ------------------------------------------------------------------ terrain
// A disc of terrain (radius ~9.5 km round the city) on a polar grid, dense near the city and coarse far out.
// Seoul's surroundings here are a broad plain, not a ring of mountains: farmland and woods, low rolling hills
// (≤ ~45 m) far out, the Han running on east and west through a wide shallow valley. Under the city it sits
// below every surface (and well below the river corridor so it never shows through the water).
function noise2(x, z) { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const h = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v; }
function fbm(x, z, o = 5) { let a = 0, f = 1, w = 0.5; for (let i = 0; i < o; i++) { a += w * noise2(x * f, z * f); f *= 2.03; w *= 0.5; } return a; }
const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
export function terrainHeight(x, z) {
  const dx = Math.max(EXT.x0 - 140 - x, 0, x - EXT.x1 - 140), dz = Math.max(EXT.z0 - 140 - z, 0, z - EXT.z1 - 140), d = Math.hypot(dx, dz);
  const a = Math.abs(z - hanC(x));
  if (d <= 0) return a < HAN.half + 100 ? -18 : -4.6;
  const rise = Math.min(1, d / 1800);
  let h = rise * (2 + 46 * Math.pow(fbm(x / 2600 + 3, z / 2600 - 1, 4), 2.4) + 4 * fbm(x / 300, z / 300, 3)) + Math.min(d, 200) * 0.006;
  // the river valley: water half-width + a wide gentle bank
  const ch = HAN.hw + 10 + Math.max(0, Math.abs(x - 200) - 2400) * 0.03;
  h = -18 + (h + 18) * smooth(ch, ch + 260, a);
  h += CURB - 0.6;
  // flat ground for the satellite towns and along the highways out to them (the plain is nearly level anyway)
  for (const t of SAT) { const k = smooth(t.R * 1.0, t.R * 1.6, Math.hypot(x - t.x, z - t.z)); h = (CURB - 0.05) + (h - CURB + 0.05) * k; }
  for (const w of HWY) { const k = smooth(13, 80, segDist(x, z, w.a, w.b)); h = (CURB - 0.45) + (h - CURB + 0.45) * k; }
  return h;
}
function terrain(rnd) {
  const cx = 200, cz = 0, NA = 256, NR = 90, rMax = 9500, pos = [], col = [], idx = [];
  const c = new THREE.Color(), meadow = new THREE.Color(0x7c8a58), field = new THREE.Color(0x9a9a62), forest = new THREE.Color(0x3e5236), bank = new THREE.Color(0x8a8670);
  for (let j = 0; j <= NR; j++) { const r = rMax * Math.pow(j / NR, 1.8);
    for (let i = 0; i < NA; i++) { const an = (i / NA) * Math.PI * 2, x = cx + Math.cos(an) * r, z = cz + Math.sin(an) * r, y = terrainHeight(x, z); pos.push(x, y, z);
      // farmland (patchy fields), woods on the hills and in patches, sandy / grey banks by the river
      const w = fbm(x / 900 + 11, z / 900 + 5, 3), f = noise2(x / 140, z / 140);
      c.copy(meadow).lerp(field, f > 0.55 ? 0.7 : 0.15); if (w > 0.55 || y > 25) c.lerp(forest, Math.min(1, (w - 0.45) * 3 + Math.max(0, y - 25) / 15));
      if (y < CURB - 2) c.lerp(bank, Math.min(1, (CURB - 2 - y) / 6));
      const k = 0.88 + noise2(x / 60, z / 60) * 0.24; col.push(c.r * k, c.g * k, c.b * k); } }
  for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const a = j * NA + i, b = j * NA + (i + 1) % NA, c2 = (j + 1) * NA + i, d = (j + 1) * NA + (i + 1) % NA; idx.push(a, b, c2, b, d, c2); }   // wound so the normals face up
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })); m.receiveShadow = false; m.userData.lodAlways = true; m.userData.region = true; return m;
}
// 원거리 배경: towns on the plain beyond the greenbelt (apartment clusters, low-rise villages, a few factories),
// generated, one merged low-poly mesh with the proxy window texture; they read as the metropolitan sprawl in the haze
function sprawl(rnd, mat) {
  const pos = [], nor = [], uv = [], col = [], c = new THREE.Color();
  const add = (x0, z0, x1, z1, y0, h, color) => { const g = boxGeo(x1 - x0, h, z1 - z0, (x0 + x1) / 2, y0, (z0 + z1) / 2).toNonIndexed(), p = g.attributes.position, n = g.attributes.normal; c.set(color);
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); const ay = Math.abs(n.getY(i)) > 0.5, ax = Math.abs(n.getX(i)) > 0.5; uv.push(ay ? 0 : (ax ? p.getZ(i) : p.getX(i)) / 8, ay ? 0 : p.getY(i) / 8); const k = ay ? 0.7 : 1; col.push(c.r * k, c.g * k, c.b * k); } };
  let towns = 0;
  for (let i = 0; i < 400 && towns < 44; i++) {
    const an = rnd() * Math.PI * 2, r = 2700 + rnd() * 5600, tx = 200 + Math.cos(an) * r, tz = Math.sin(an) * r * 0.85;
    if (Math.abs(tz - hanC(tx)) < HAN.hw + 420) continue; if (SAT.some((t) => Math.hypot(tx - t.x, tz - t.z) < t.R + 500)) continue;
    if (tx > EXT.x0 - 700 && tx < EXT.x1 + 700 && tz > EXT.z0 - 700 && tz < EXT.z1 + 700) continue; if (HWY.some((w) => segDist(tx, tz, w.a, w.b) < 120)) continue;
    towns++; const kind = rnd(), R = 160 + rnd() * 260, n = 18 + Math.floor(rnd() * 40);
    for (let k = 0; k < n; k++) { const bx = tx + (rnd() - 0.5) * 2 * R, bz = tz + (rnd() - 0.5) * 2 * R * 0.7, y = terrainHeight(bx, bz) - 0.5;
      if (kind < 0.55) { const w = 50 + rnd() * 25, h = 35 + rnd() * 50; add(bx - w / 2, bz - 7, bx + w / 2, bz + 7, y, h, [0xe2ded4, 0xd8d4ca, 0xe8e4dc][k % 3]); }                       // apartment slabs
      else if (kind < 0.85) { const w = 10 + rnd() * 14, d = 9 + rnd() * 10; add(bx - w / 2, bz - d / 2, bx + w / 2, bz + d / 2, y, 6 + rnd() * 9, [0xc8b8a0, 0xb89888, 0xd0c8b8, 0x9aa0a4][k % 4]); }   // villages / low-rise
      else { const w = 40 + rnd() * 50, d = 30 + rnd() * 30; add(bx - w / 2, bz - d / 2, bx + w / 2, bz + d / 2, y, 8 + rnd() * 6, [0xa8aeb2, 0x8a949a][k % 2]); } } }                     // factories
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat); m.userData.lodAlways = true; m.userData.region = true; m.castShadow = false; return m;
}

// ------------------------------------------------------------------ districts
// type → template: block [w, d] (m), street width, intensity 0..5 (density / height), height range [min, max] m
const DISTRICTS = {
  cbd:        { block: [150, 150], street: 22, intensity: 5, h: [90, 230] },
  business:   { block: [120, 120], street: 20, intensity: 4, h: [45, 120] },
  downtown:   { block: [80, 70], street: 14, intensity: 4, h: [18, 55] },
  mixed:      { block: [110, 100], street: 16, intensity: 4, h: [40, 140] },     // 주상복합
  highrise:   { block: [230, 200], street: 20, intensity: 3, h: [75, 135] },     // new tower complexes
  slab:       { block: [210, 190], street: 18, intensity: 3, h: [36, 48] },      // older slab complexes
  villa:      { block: [72, 54], street: 6, intensity: 2, h: [11, 16] },         // 다세대 quarter (alleys)
  industrial: { block: [220, 170], street: 18, intensity: 2, h: [8, 14] },
  park:       { block: [440, 360], street: 0, intensity: 0, h: [0, 0] },
  campus:     { block: [260, 220], street: 14, intensity: 1, h: [12, 30] },      // university / hospital campus
  stadium:    { block: [300, 260], street: 14, intensity: 1, h: [0, 36] },
  greenbelt:  { block: [240, 200], street: 8, intensity: 0, h: [0, 0] },        // 개발제한구역
  culture:    { block: [140, 120], street: 14, intensity: 2, h: [10, 30] },      // 문화지구
};
const SEEDS = [
  { type: 'cbd', x: 1080, z: -60 }, { type: 'business', x: 1100, z: -480 }, { type: 'business', x: 860, z: 420 },
  { type: 'downtown', x: -560, z: -120 }, { type: 'downtown', x: 150, z: -520 }, { type: 'downtown', x: 120, z: 520 },
  { type: 'mixed', x: 1420, z: 180 }, { type: 'mixed', x: -820, z: -420 },
  { type: 'highrise', x: 1620, z: 520 }, { type: 'highrise', x: -1150, z: -560 }, { type: 'highrise', x: 620, z: 1000 }, { type: 'highrise', x: 1650, z: -420 },
  { type: 'slab', x: -980, z: 280 }, { type: 'slab', x: -380, z: 1100 }, { type: 'slab', x: 1150, z: 1150 }, { type: 'slab', x: -1250, z: -1300 }, { type: 'slab', x: 600, z: -1300 },
  { type: 'villa', x: -540, z: 620 }, { type: 'villa', x: 230, z: 820 }, { type: 'villa', x: -1300, z: 0 }, { type: 'villa', x: 1700, z: 1150 },
  { type: 'industrial', x: -1300, z: 950 }, { type: 'park', x: 1200, z: 820 }, { type: 'campus', x: -900, z: 900 }, { type: 'stadium', x: 1550, z: -720 },
];
// trees: a trunk and a broad leafy crown of two lumpy blobs (not cones), three greens; ~150 triangles
const LEAF = [0x4a6a3a, 0x3e5e34, 0x5a7442], leafMat = (i) => mat('regleaf' + i, () => flatMat(LEAF[i], { roughness: 1, key: 'regleaf' + i })), barkMat = () => mat('regbark', () => flatMat(0x5a4a3a, { roughness: 1, key: 'regbark' }));
let blobBase = null;
function crownGeo(x, y, z, s, k) { if (!blobBase) blobBase = new THREE.IcosahedronGeometry(1, 1);
  const out = [];
  for (const [ox, oy, oz, r] of [[0, 0, 0, 2.3], [0.9 * Math.cos(k), 0.9, 0.9 * Math.sin(k), 1.6]]) { const g = blobBase.clone(), p = g.attributes.position;
    const nr = g.attributes.normal;   // smooth (sphere) normals: a soft leafy mass, not facets
    for (let i = 0; i < p.count; i++) { const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i), j = 0.82 + 0.3 * Math.abs(Math.sin(X * 5.1 + Y * 3.7 + Z * 4.3 + k)); nr.setXYZ(i, X, Y, Z); p.setXYZ(i, X * j, Y * j * 0.85, Z * j); } g.scale(r * s, r * s, r * s); g.translate(x + ox * s, y + (3.6 + oy) * s, z + oz * s); out.push(g); }
  return mergeGeos(out); }
export function treeParts(x, z, s, y = CURB) { const k = Math.abs(Math.sin(x * 12.9 + z * 78.2)) * 6.28;
  return [[new THREE.CylinderGeometry(0.14 * s, 0.22 * s, 2.8 * s, 6).translate(x, y + 1.4 * s, z), barkMat()], [crownGeo(x, y, z, s, k), leafMat(Math.floor(k) % 3)]]; }
function treeSpec(spec, x, z, s, color = 0x4a6a3a) { const k = Math.abs(Math.sin(x * 12.9 + z * 78.2)) * 6.28;
  spec(x, z, { geo: () => new THREE.CylinderGeometry(0.14 * s, 0.22 * s, 2.8 * s, 6).translate(x, CURB + 1.4 * s, z), mat: barkMat, box: [x - 0.3, z - 0.3, x + 0.3, z + 0.3, 2.8 * s], color: 0x5a4a3a, tree: true });
  spec(x, z, { geo: () => crownGeo(x, CURB, z, s, k), mat: () => leafMat(Math.floor(k) % 3), box: [x - 2.3 * s, z - 2.3 * s, x + 2.3 * s, z + 2.3 * s, 6 * s], color, tree: true }); }

// fill one block according to its district template. ctx: { edge (faces an arterial), hotter (neighbour intensity
// above ours → mid-rise transition edge), rnd, pick, occl }
const STADIUM = { done: false };
function fillBlock(spec, r, D, T, { edge, hotter, rnd, pick, occl, noFac = false }) {
  const W = r.x1 - r.x0, Dd = r.z1 - r.z0, cx0 = (r.x0 + r.x1) / 2, cz0 = (r.z0 + r.z1) / 2;
  const put = (x, z, w, d, h, m, color, roof = null) => { if (w < 4 || d < 4 || h < 2) return; if (roof === roofGreen && rnd() < 0.8) roof = roofOf(x * 7 + z * 3); spec(x, z, { geo: () => boxGeo(w, h, d, x, CURB, z), mat: m, box: [x - w / 2, z - d / 2, x + w / 2, z + d / 2, h], color, roof: true, roofMat: roof ?? roofOf(x * 5 + z * 11) }); if (h > 6 && w > 7 && d > 7 && rnd() < 0.75) roofKit(spec, rnd, x, z, w, d, h); if (h > 12) occl(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h); };
  const flat = (geoF, matF, x, z, box, color) => spec(x, z, { geo: geoF, mat: matF, box, color });
  const lawn = (x0, z0, x1, z1) => flat(() => boxGeo(x1 - x0, 0.05, z1 - z0, (x0 + x1) / 2, CURB, (z0 + z1) / 2), () => groundMat('lawn'), (x0 + x1) / 2, (z0 + z1) / 2, [x0, z0, x1, z1, 0.05], 0x56603a);
  const pave = (x0, z0, x1, z1, c = 0xdcd8d0) => flat(() => boxGeo(x1 - x0, 0.04, z1 - z0, (x0 + x1) / 2, CURB, (z0 + z1) / 2), () => mat('lot' + c, () => { const m = lotMat().clone(); m.color.set(c).multiplyScalar(1 / 0.86); return m; }), (x0 + x1) / 2, (z0 + z1) / 2, [x0, z0, x1, z1, 0.04], c);
  const COM = [0xd8d2c4, 0xb8b4aa, 0xc9c0ae, 0x9aa0a4, 0xe0dcd0, 0xa89c88, 0xcfc6b4], GL = [0x46586a, 0x3e4a52, 0x5a6a74];
  // shops get real signs on their street faces (RegionExtras.frontSigns), not a sign band printed on every floor tile
  const comBox = (x, z, w, d, h, faces = []) => { const wc = pick(COM), gc = pick(GL); put(x, z, w, d, h, () => comMat(wc, gc, false), wc);
    if (faces.length && w >= 4 && d >= 4 && h >= 2) { frontSigns(spec, rnd, [x - w / 2, z - d / 2, x + w / 2, z + d / 2], h, faces); shopDetails(spec, rnd, [x - w / 2, z - d / 2, x + w / 2, z + d / 2], h, faces); } };
  // perimeter frontage: buildings of varied width / height along the chosen block faces, depth dep
  const frontage = (faces, dep, hmin, hmax) => {
    for (const f of faces) {
      const along = f === 'n' || f === 's'; const len = along ? W : Dd; let a = 0;
      while (a < len - 8) { const w = Math.min(len - a, 12 + rnd() * 20), h = hmin + rnd() * (hmax - hmin);
        const c = along ? [r.x0 + a + w / 2, f === 'n' ? r.z0 + dep / 2 : r.z1 - dep / 2] : [f === 'w' ? r.x0 + dep / 2 : r.x1 - dep / 2, r.z0 + a + w / 2];
        if (!(along ? false : (c[1] - w / 2 < r.z0 + dep - 0.5 && (faces.includes('n'))) || (c[1] + w / 2 > r.z1 - dep + 0.5 && faces.includes('s')))) comBox(c[0], c[1], along ? w - 0.6 : dep, along ? dep : w - 0.6, h, [f]);
        a += w; }
    }
  };
  const arterialFaces = Object.entries(edge).filter(([, v]) => v).map(([k]) => k);
  // a city is not only shops and flats: some blocks are a school, a church, a gas station, a market, a park …
  const FAC = { villa: ['church', 'houses', 'playpark', 'market', 'parking', 'houses', 'school', 'fire', 'post', 'library'], slab: ['school', 'playpark', 'courts', 'church', 'hospital', 'library', 'police'], highrise: ['school', 'playpark', 'courts', 'hospital', 'library'],
    downtown: ['market', 'parking', 'gas', 'hospital', 'construction', 'church', 'gu', 'police', 'post', 'fire'], mixed: ['construction', 'parking', 'gas', 'playpark', 'police', 'post'], business: ['construction', 'parking', 'gu'],
    culture: ['hall', 'museum', 'library', 'playpark', 'hall', 'museum'], industrial: ['logistics', 'logistics', 'gas'] }[D.type];
  const facP = { business: 0.12, culture: 0.7, industrial: 0.4 }[D.type] ?? 0.3;
  if (FAC && !noFac && W >= 44 && Dd >= 38 && hotter < 2 && rnd() < facP) {
    const tree = (x, z, s2) => treeSpec(spec, x, z, s2, 0x4a6a3a);
    const kind = pick(FAC), Hh = { put, flat, lawn, pave, tree, occl, rnd, pick, spec };
    // a small facility does not take a whole big block: it gets one end, the rest is built as usual
    if (!['school', 'hall', 'logistics'].includes(kind) && (W > 110 || Dd > 90)) {
      const alongX = W >= Dd, cut = Math.min(90, (alongX ? W : Dd) * 0.5), f0 = alongX ? { ...r, x1: r.x0 + cut - 3 } : { ...r, z1: r.z0 + cut - 3 }, rest = alongX ? { ...r, x0: r.x0 + cut + 3 } : { ...r, z0: r.z0 + cut + 3 };
      pave(alongX ? r.x0 + cut - 3 : r.x0, alongX ? r.z0 : r.z0 + cut - 3, alongX ? r.x0 + cut + 3 : r.x1, alongX ? r.z1 : r.z0 + cut + 3, 0xa8a8a4);   // a service lane between
      if (CIVIC.includes(kind)) civic(kind, f0, Hh); else facility(kind, f0, Hh);
      fillBlock(spec, rest, D, T, { edge: alongX ? { ...edge, w: false } : { ...edge, n: false }, hotter, rnd, pick, occl, noFac: true }); return; }
    if (CIVIC.includes(kind)) { if (kind !== 'logistics' || (W >= 80 && Dd >= 70)) { civic(kind, r, Hh); return; } } else { facility(kind, r, Hh); return; }
  }
  switch (D.type) {
    case 'greenbelt': {   // 개발제한구역: wooded hills, paddy fields with farm roads, vinyl greenhouse rows, a few farmhouses
      const k = rnd();
      if (k < 0.45) { lawn(r.x0, r.z0, r.x1, r.z1); for (let n = 0; n < Math.floor(W * Dd / 260); n++) { const x = r.x0 + 3 + rnd() * (W - 6), z = r.z0 + 3 + rnd() * (Dd - 6), s2 = 1.1 + rnd() * 0.9; treeSpec(spec, x, z, s2, 0x3e5a34); } return; }
      const paddy = () => mat('paddy', () => flatMat(0x8a9a52, { roughness: 1, key: 'paddy' })), dirt = () => mat('farmroad', () => flatMat(0xa08a6a, { roughness: 1, key: 'farmroad' }));
      for (let z = r.z0; z < r.z1 - 6; z += 34) for (let x = r.x0; x < r.x1 - 6; x += 46) { const w2 = Math.min(44, r.x1 - x), d2 = Math.min(32, r.z1 - z); flat(() => boxGeo(w2, 0.05, d2, x + w2 / 2, CURB, z + d2 / 2), paddy, x + w2 / 2, z + d2 / 2, [x, z, x + w2, z + d2, 0.05], 0x8a9a52); }
      for (let z = r.z0 + 33; z < r.z1; z += 34) flat(() => boxGeo(W, 0.07, 2, (r.x0 + r.x1) / 2, CURB, z), dirt, (r.x0 + r.x1) / 2, z, [r.x0, z - 1, r.x1, z + 1, 0.07], 0xa08a6a);
      if (k < 0.8) { const gx = r.x0 + 10 + rnd() * Math.max(1, W - 90); for (let i = 0; i < 8; i++) { const x = gx + i * 10, z = (r.z0 + r.z1) / 2;   // 비닐하우스
        flat(() => { const g = new THREE.CylinderGeometry(3.5, 3.5, 40, 10, 1, true, 0, Math.PI); g.rotateZ(Math.PI / 2); g.rotateY(Math.PI / 2); g.translate(x, CURB, z); return g; }, () => mat('vinyl', () => flatMat(0xe8ece8, { roughness: 0.3, key: 'vinyl' })), x, z, [x - 3.5, z - 20, x + 3.5, z + 20, 3.5], 0xe8ece8); } }
      for (let i = 0; i < 2; i++) { const x = r.x0 + 15 + rnd() * (W - 30), z = r.z0 + 15 + rnd() * (Dd - 30); put(x, z, 10, 8, 3.5, () => villaMat(0xd8cab0), 0xd8cab0, () => flatMat(0x3a5a7a, { key: 'farmroof' })); }
      return;
    }
    case 'culture': {
      for (const f of ['n', 's', 'w', 'e']) frontage([f], 14, 8, 16);
      lawn(r.x0 + 15, r.z0 + 15, r.x1 - 15, r.z1 - 15); for (let k = 0; k < Math.floor(W * Dd / 600); k++) { const x = r.x0 + 18 + rnd() * (W - 36), z = r.z0 + 18 + rnd() * (Dd - 36); treeSpec(spec, x, z, 0.8 + rnd() * 0.5); }
      return;
    }
    case 'park': {
      lawn(r.x0, r.z0, r.x1, r.z1);
      for (let k = 0; k < Math.floor(W * Dd / 700); k++) { const x = r.x0 + 6 + rnd() * (W - 12), z = r.z0 + 6 + rnd() * (Dd - 12), s2 = 0.9 + rnd() * 0.8; treeSpec(spec, x, z, s2, 0x4a6a3a); }
      return;
    }
    case 'stadium': {
      if (STADIUM.done) return fillBlock(spec, r, { type: 'highrise', x: r.x0, z: r.z0 }, DISTRICTS.highrise, { edge, hotter, rnd, pick, occl, noFac: true });   // one stadium; the blocks round it are housing
      STADIUM.done = true;
      const R = Math.min(W, Dd) * 0.38; flat(() => new THREE.CylinderGeometry(R, R * 0.92, 32, 40, 1, true).translate(cx0, CURB + 16, cz0), () => flatMat(0xd8d8d0, { key: 'stadium' }), cx0, cz0, [cx0 - R, cz0 - R, cx0 + R, cz0 + R, 32], 0xd8d8d0);
      flat(() => boxGeo(R * 1.2, 0.06, R * 0.8, cx0, CURB, cz0), () => groundMat('lawn'), cx0, cz0, [cx0 - R * 0.6, cz0 - R * 0.4, cx0 + R * 0.6, cz0 + R * 0.4, 0.06], 0x56603a);
      pave(r.x0, r.z0, r.x1, r.z1, 0xe0dcd4); occl(cx0 - R, cz0 - R, cx0 + R, cz0 + R, 32); return;
    }
    case 'campus': {   // low academic / hospital buildings round a green quad
      lawn(r.x0 + 30, r.z0 + 30, r.x1 - 30, r.z1 - 30);
      for (const [x, z, w, d] of [[r.x0 + 15, cz0, 24, Dd - 40], [r.x1 - 15, cz0, 24, Dd - 40], [cx0, r.z0 + 14, W - 70, 22], [cx0, r.z1 - 14, W - 70, 22]]) { const h = T.h[0] + rnd() * (T.h[1] - T.h[0]); put(x, z, w, d, h, () => villaMat(0x9a5a44), 0x9a5a44, roofGreen); }
      return;
    }
    case 'industrial': {
      pave(r.x0, r.z0, r.x1, r.z1, 0xc8c6c0);
      for (let z = r.z0 + 4; z < r.z1 - 24; z += 40) for (let x = r.x0 + 4; x < r.x1 - 30; x += 56) put(x + 25, z + 16, 48 + rnd() * 4, 30, T.h[0] + rnd() * (T.h[1] - T.h[0]), () => wallMat('panel', pick([0xa0a6aa, 0xb8bcbe, 0x8a949a])), 0xa0a6aa, () => flatMat(0x6e7a84, { roughness: 0.6, metalness: 0.4, key: 'indroof' }));
      return;
    }
    case 'villa': {
      // 다세대 quarter: 12 x 15 lots on both sides of a 6 m lane, 4-5 floors, corner shops; a mid-rise edge
      // where the neighbouring district is much denser
      const lotW = 12, lotD = 15;
      if (hotter >= 2) frontage(arterialFaces.length ? arterialFaces : ['n'], 18, 18, 32);
      for (let z = r.z0 + 1; z + lotD <= r.z1 - 1; z += lotD + (Math.floor((z - r.z0) / lotD) % 2 ? 6 : 0.8)) for (let x = r.x0 + 1; x + lotW <= r.x1 - 1; x += lotW + 0.8) {
        if (hotter >= 2 && (z < r.z0 + 19 || z + lotD > r.z1 - 19)) continue;
        if (rnd() < 0.06) { pave(x, z, x + lotW, z + lotD, 0xb4b4b0); continue; }   // a small parking lot / empty lot
        const corner = x < r.x0 + 2 || x + lotW > r.x1 - 2; const fl = 3 + Math.floor(rnd() * 2) + (corner ? 1 : 0), bc = pick([0x8a4a3a, 0x9a5a44, 0xd0c8b8, 0xc8c0b0, 0x7a4234, 0xb8a890]);
        const vh = 2.6 + 2.8 * fl, vx = x + lotW / 2, vz = z + lotD / 2;
        if (rnd() < 0.6) { villaPiloti(spec, rnd, vx, vz, lotW - 1.4, lotD - 1.4, vh, () => villaMat(bc), bc, roofOf(vx * 7 + vz * 3)); if (rnd() < 0.75) roofKit(spec, rnd, vx, vz, lotW - 1.4, lotD - 1.4, vh); }   // 필로티 다세대
        else put(vx, vz, lotW - 1.4, lotD - 1.4, vh, () => villaMat(bc), bc, roofGreen);
        if (rnd() < 0.3) spec(vx, vz, { geo: () => { const g = new THREE.CylinderGeometry(0.01, (lotW - 1) / Math.SQRT2, 2.2, 4, 1); g.rotateY(Math.PI / 4); g.scale(1, 1, (lotD - 1) / (lotW - 1)); g.translate(vx, CURB + vh + 1.6, vz); return g; }, mat: () => flatMat(pick([0x5a3a2a, 0x3a4650, 0x4a5a4a]), { key: 'vroof' }), box: [vx - 1, vz - 1, vx + 1, vz + 1, 0.1], color: 0x5a3a2a });
      }
      return;
    }
    case 'downtown': {
      // perimeter commercial blocks: continuous frontage on every street, taller on arterials, a parking court inside
      const hi = T.h[1] + (hotter > 0 ? 10 : 0);
      for (const f of ['n', 's', 'w', 'e']) frontage([f], 20, edge[f] ? T.h[0] + 12 : T.h[0], edge[f] ? hi : hi * 0.6);
      pave(r.x0 + 21, r.z0 + 21, r.x1 - 21, r.z1 - 21, 0xa8a8a4);
      return;
    }
    case 'business': case 'cbd': case 'mixed': {
      // towers on podiums; plan, cladding, crown and height vary; heights rise toward the district seed
      const n = Math.max(1, Math.round(W / 60)), m = Math.max(1, Math.round(Dd / 60)), gw = W / n, gd = Dd / m;
      const dSeed = Math.hypot(cx0 - D.x, cz0 - D.z);
      for (let a = 0; a < n; a++) for (let b = 0; b < m; b++) {
        const cx = r.x0 + (a + 0.5) * gw, cz = r.z0 + (b + 0.5) * gd;
        if (D.type === 'mixed') { // 주상복합: a commercial podium + slender residential tower
          comBox(cx, cz, gw - 6, gd - 6, 14, arterialFaces.length ? arterialFaces : ['s']);
          const h = T.h[0] + rnd() * (T.h[1] - T.h[0]), w = Math.min(28, gw - 16), wall = pick([0xe8e4da, 0xd8d4cc, 0xc8ccd0]);
          const MP = outline(pick(['round', 'chamfer', 'cross']), w, w * 0.8, { r: 5, c: 4, n: 20 }), mst = pick([0, 2]);   // one outline for both rings (same vertex count)
          spec(cx, cz, { geo: () => shell([{ y: CURB + 14, pts: MP }, { y: CURB + 14 + h, pts: MP }], { cx, cz, uM: 6.8, vM: 2.8 }), mat: () => aptMat(wall, mst), box: [cx - w / 2, cz - w * 0.4, cx + w / 2, cz + w * 0.4, 14 + h], color: wall });
          spec(cx, cz, { geo: () => cap(MP, CURB + 14 + h, { cx, cz }), mat: roofM, box: [cx - 1, cz - 1, cx + 1, cz + 1, 0.1], color: 0x6e7270 });
          occl(cx - w / 2, cz - w * 0.4, cx + w / 2, cz + w * 0.4, h); continue;
        }
        const H = Math.max(T.h[0], T.h[1] - dSeed * 0.12) * (0.65 + rnd() * 0.45);
        const kind = pick(['rect', 'round', 'chamfer', 'ellipse', 'rect']), w = Math.min(gw - 14, 24 + rnd() * 18), d = Math.min(gd - 14, 20 + rnd() * 16), fh = 4;
        const curtain = rnd() < 0.65, gl = pick([0x4e6a80, 0x5a7486, 0x56707e, 0x4a6478, 0x62767e, 0x6a7a80]), sp = pick([0x6a7884, 0x9aa2a8, 0x7e8a92, 0x5a6268]), fr = pick([0xd6cfc0, 0xc8c4ba, 0xe2ddd2, 0xb0aaa0]);
        const sys = curtain ? pick(['curtain', 'curtain', 'fins', 'ribbon']) : 'grid';   // façade system
        const mm = () => (sys === 'curtain' ? curtainMat({ glass: gl, spandrel: sp, floorH: fh, key: 'reg' }) : sys === 'fins' ? finMat(gl, pick([0xd8dcde, 0xb8bcc0, 0x9aa0a4])) : sys === 'ribbon' ? ribbonMat(pick([0xe8e6e0, 0xc8ccd0, 0x9aa2a8]), gl) : gridMat({ frame: fr, floorH: 3.8, key: 'reg' }));
        const uM = sys === 'grid' ? 3 : 6, vM = sys === 'grid' ? 3.8 : fh, tint = curtain ? gl : fr;
        const pts = outline(kind, w, d, { r: 6, c: 5, n: 24 }), podH = 8 + Math.floor(rnd() * 3) * 4;
        const pw = Math.min(gw - 4, w + 12), pd = Math.min(gd - 4, d + 12);
        put(cx, cz, pw, pd, podH, () => comMat(pick([0x9aa0a4, 0xb8b4aa, 0x7e8488]), 0x3e4a52), 0x9aa0a4);
        officeDetails(spec, rnd, cx, cz, pw, pd, podH, arterialFaces[0] ?? pick(['s', 'n', 'e', 'w']), Math.min(w, d), H, rnd() < 0.14);
        const tiers = H > 120 ? 3 : H > 70 ? 2 : 1; let y = CURB + podH, k = 1;
        for (let t = 0; t < tiers; t++) { const hh = (H - podH) / tiers, sc = k, p2 = pts.map(([px, pz]) => [px * sc, pz * sc]), yb = y;   // yb: this tier's base, fixed now (the geometry is built later)
          flat(() => shell([{ y: yb, pts: p2 }, { y: yb + hh, pts: p2 }], { cx, cz, uM, vM }), mm, cx, cz, [cx - w * sc / 2, cz - d * sc / 2, cx + w * sc / 2, cz + d * sc / 2, yb - CURB + hh], tint);
          flat(() => cap(p2, yb + hh, { cx, cz }), roofM, cx, cz, [cx - 1, cz - 1, cx + 1, cz + 1, 0.1], 0x6e7270); y += hh; k *= 0.82; }
        occl(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, H);
      }
      return;
    }
    case 'highrise': case 'slab': default: {
      // apartment complex (단지): ring road + green, a 2-storey shopping block on the arterial corner, towers /
      // slabs in rows facing south; one colour scheme per complex, height per complex (+ a few landmarks)
      const wall = pick([0xe8e4da, 0xdcd6c8, 0xe2e0d8, 0xd8d4c8, 0xe6e0d0]), acc = pick([0x3a6a9a, 0x8a3a2a, 0x2a6a4a, 0x6a6a7a]);
      lawn(r.x0 + 4, r.z0 + 4, r.x1 - 4, r.z1 - 4);
      const sh = arterialFaces.includes('s') ? 's' : arterialFaces[0] || 's';
      if (sh === 's' || sh === 'n') comBox(r.x0 + 30, sh === 's' ? r.z1 - 14 : r.z0 + 14, 50, 20, 8, [sh]); else comBox(sh === 'w' ? r.x0 + 14 : r.x1 - 14, r.z0 + 30, 20, 50, 8, [sh]);
      const style = D.type === 'slab' ? pick([0, 1, 1]) : pick([0, 2, 2]);       // one façade design per complex
      complexDetails(spec, rnd, r, sh, acc);
      const crown = pick(['frame', 'plant', 'brand']);
      if (D.type === 'highrise') {
        const fl = 28 + Math.floor(rnd() * 14), plans = [pick(['round', 'chamfer', 'rect', 'cross']), pick(['round', 'chamfer', 'cross'])];
        let k = 0;
        for (let z = r.z0 + 30; z < r.z1 - 36; z += 46) for (let x = r.x0 + 22; x < r.x1 - 30; x += 40) {
          const plan = plans[k++ % 2], w = plan === 'cross' ? 28 : 26, d = plan === 'cross' ? 28 : 20, h = 3 + 2.8 * (fl + Math.floor(rnd() * 8) - (k % 3 === 0 ? 6 : 0)), cx = x + 13, cz = z + 10;
          const P = outline(plan, w, d, { r: 4, c: 4, n: 16 });
          spec(cx, cz, { geo: () => shell([{ y: CURB, pts: P }, { y: CURB + h, pts: P }], { cx, cz, uM: 6.8, vM: 2.8 }), mat: () => aptMat(wall, style), box: [cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h], color: wall });
          spec(cx, cz, { geo: () => cap(P, CURB + h, { cx, cz }), mat: roofM, box: [cx - 1, cz - 1, cx + 1, cz + 1, 0.1], color: 0x6e7270 });
          spec(cx, cz, { geo: () => boxGeo(1.2, h - 6, 4, cx - w / 2 + 0.2, CURB + 3, cz), mat: () => flatMat(acc, { key: 'acc' + acc }), box: [cx - w / 2, cz - 2, cx - w / 2 + 1, cz + 2, h - 3], color: acc });
          towerDetails(spec, rnd, cx, cz, P, h, acc);
          // roof crown: an open frame, a plant room, or the complex's brand box
          if (crown === 'frame') spec(cx, cz, { geo: () => { const Q = P.map(([a, b]) => [a * 0.9, b * 0.9]); return shell([{ y: CURB + h, pts: Q }, { y: CURB + h + 5, pts: Q }], { cx, cz, uM: 2, vM: 5 }); }, mat: () => flatMat(acc, { key: 'accf' + acc }), box: [cx - 1, cz - 1, cx + 1, cz + 1, h + 5], color: acc });
          else spec(cx, cz, { geo: () => boxGeo(w * 0.45, crown === 'brand' ? 6 : 3.5, d * 0.4, cx, CURB + h, cz), mat: () => (crown === 'brand' ? flatMat(acc, { key: 'acc' + acc }) : flatMat(0x9a9c98, { key: 'plant' })), box: [cx - 4, cz - 3, cx + 4, cz + 3, h + 6], color: crown === 'brand' ? acc : 0x9a9c98 });
          occl(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h);
        }
      } else {
        // slab rows: each slab in two parts of different height (a stepped skyline), gable accent, lift rooms
        const fl = 12 + Math.floor(rnd() * 4), len = Math.min(W - 40, 60 + rnd() * 20);
        for (let z = r.z0 + 30; z < r.z1 - 26; z += 40) for (let x = r.x0 + 18; x + len <= r.x1 - 14; x += len + 18) {
          const cut = len * (0.4 + rnd() * 0.2), h1 = 3 + 2.8 * fl, h2 = 3 + 2.8 * (fl - 2 - Math.floor(rnd() * 3));
          put(x + cut / 2, z + 6, cut, 12, h1, () => aptMat(wall, style), wall); put(x + cut + (len - cut) / 2, z + 6, len - cut, 12, h2, () => aptMat(wall, style), wall);
          slabDetails(spec, rnd, x, z, x + cut, z + 12, h1, acc); slabDetails(spec, rnd, x + cut, z, x + len, z + 12, h2, acc);
          if (z + 40 < r.z1 - 26) { parkingRow(spec, rnd, x + 2, z + 21, x + len - 2); for (let tx = x + 4; tx < x + len; tx += 9) treeSpec(spec, tx, z + 30, 0.8 + rnd() * 0.4); }
          spec(x + 1, z + 6, { geo: () => boxGeo(2, h1 - 4, 12.2, x + 0.85, CURB + 2, z + 6), mat: () => flatMat(acc, { key: 'acc' + acc }), box: [x, z, x + 2, z + 12, h1], color: acc });
          for (const lx of [x + cut * 0.5, x + cut + (len - cut) * 0.5]) spec(lx, z + 6, { geo: () => boxGeo(5, 3, 6, lx, CURB + (lx < x + cut ? h1 : h2), z + 6), mat: () => flatMat(0x9a9c98, { key: 'plant' }), box: [lx - 2, z + 4, lx + 2, z + 8, 3], color: 0x9a9c98 });
        }
      }
      return;
    }
  }
}
