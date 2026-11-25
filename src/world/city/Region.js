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

const EXT = { x0: -1500, x1: 1900, z0: -1400, z1: 1400 };
const CORE = { x0: -206, x1: 726, z0: -306, z1: 306 };
const RIVER = { z0: -1150, z1: -800 };
const ARTX = [-1440, -960, -480, 0, 420, 900, 1380, 1860], ARTZ = [-1330, -660, 660, 1020, 1380];
const LANDMARK = { x: 488, z: -50 };

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

// ------------------------------------------------------------------ helpers
const inCore = (x0, z0, x1, z1) => x1 > CORE.x0 && x0 < CORE.x1 && z1 > CORE.z0 && z0 < CORE.z1;
// the hand-made quarter (HandStreets.js) replaces the generated blocks, their streets and trees
const inHand = (x0, z0, x1, z1) => x1 > HAND.x0 - 2 && x0 < HAND.x1 + 2 && z1 > HAND.z0 - 2 && z0 < HAND.z1 + 2;
const inRiver = (z0, z1) => z1 > RIVER.z0 - 40 && z0 < RIVER.z1 + 40;
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
  const B = new Batch(scene);
  const DBG0 = typeof location !== 'undefined' ? location.search : '';
  const occl = (x0, z0, x1, z1, h) => { if (!DBG0.includes('noocc')) lod?.occluder?.({ x0, z0, x1, z1, y1: CURB + h }); };
  const self = this; const DBG = typeof location !== 'undefined' ? (location.search.match(/rg=([a-z,]+)/)?.[1] || '') : '';
  // a building spec goes to its chunk: { geo: () => BufferGeometry, mat: () => Material, box: [x0, z0, x1, z1, h], color }
  let NSPEC = 0; const spec = (x, z, sp) => { if (++NSPEC > 200000) throw new Error('region: runaway spec generation'); this.chunk(x, z).specs.push(sp); };
  // ground: land + river + banks
  // ground: two slabs (south / north of the river), the detailed core land cut out of the south one
  const slab = (x0, z0, x1, z1, holes) => { const sh = new THREE.Shape([[x0, -z0], [x1, -z0], [x1, -z1], [x0, -z1]].map(([a, b]) => new THREE.Vector2(a, b)));
    for (const h of holes) sh.holes.push(new THREE.Path([[h[0], -h[1]], [h[0], -h[3]], [h[2], -h[3]], [h[2], -h[1]]].map(([a, b]) => new THREE.Vector2(a, b))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, CURB - 0.31, 0); return g; };
  const gm = groundMat('plaza', { color: 0x8a8882 });
  if (!DBG.includes('noground')) B.add(slab(EXT.x0 - 160, RIVER.z1, EXT.x1 + 160, EXT.z1 + 160, [[-200, -270, 200, 270], [200, -300, 720, 300], [HAND.x0, HAND.z0, HAND.x1, HAND.z1]]), gm, { cast: false });
  if (!DBG.includes('noground')) B.add(slab(EXT.x0 - 160, EXT.z0 - 160, EXT.x1 + 160, RIVER.z0, []), gm, { cast: false });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, RIVER.z1 - RIVER.z0), new THREE.MeshStandardMaterial({ color: 0x4a6468, roughness: 0.08, metalness: 0.35, envMapIntensity: 1.1 }));
  water.rotation.x = -Math.PI / 2; water.position.set(200, -2.0, (RIVER.z0 + RIVER.z1) / 2); if (!DBG.includes('nowater')) scene.add(water);
  for (const z of [RIVER.z0, RIVER.z1]) { B.add(boxGeo(9000, 0.1, 60, 200, CURB, z + (z === RIVER.z1 ? 30 : -30)), groundMat('lawn'), { cast: false }); }   // riverside parks
  // the land must not cover the river: cut it with a dark trough (the ground slab is drawn under it)
  B.add(boxGeo(9000, 0.4, RIVER.z1 - RIVER.z0, 200, -4.0, (RIVER.z0 + RIVER.z1) / 2), flatMat(0x2a3436, { key: 'riverbed' }), { cast: false });
  for (const z of [RIVER.z0, RIVER.z1]) B.add(boxGeo(9000, CURB + 4, 1, 200, -4, z), wallMat('stone', 0x9a968c), { cast: false });   // embankments
  const asph = groundMat('asphalt', { roughness: 0.85 });
  // arterials (30 m) and the ring road around the core
  for (const x of ARTX) for (const [a0, a1] of [[EXT.z0, RIVER.z0], [RIVER.z1, EXT.z1]]) for (const [z0, z1] of (x > HAND.x0 && x < HAND.x1 ? [[a0, Math.min(a1, HAND.z0)], [Math.max(a0, HAND.z1), a1]] : [[a0, a1]])) { if (z1 - z0 < 1) continue; B.add(boxGeo(30, 0.05, z1 - z0, x, CURB - 0.02, (z0 + z1) / 2), asph, { cast: false }); }
  for (const z of ARTZ) B.add(boxGeo(EXT.x1 - EXT.x0, 0.05, 30, (EXT.x0 + EXT.x1) / 2, CURB - 0.02, z), asph, { cast: false });
  for (const z of [CORE.z0 - 14, CORE.z1 + 14]) B.add(boxGeo(CORE.x1 - CORE.x0 + 56, 0.05, 24, (CORE.x0 + CORE.x1) / 2, CURB - 0.02, z), asph, { cast: false });
  for (const x of [CORE.x0 - 14, CORE.x1 + 14]) B.add(boxGeo(24, 0.05, CORE.z1 - CORE.z0 + 56, x, CURB - 0.02, 0), asph, { cast: false });
  // bridges over the river on each arterial
  const conc = wallMat('concrete', 0xa8a6a0);
  for (const x of ARTX) { B.add(boxGeo(30, 2, RIVER.z1 - RIVER.z0 + 60, x, 8, (RIVER.z0 + RIVER.z1) / 2), conc); for (let z = RIVER.z0 + 30; z < RIVER.z1; z += 70) B.add(boxGeo(6, 10, 4, x, -2, z), conc); }

  // ---------------------------------------------------------------- master plan: districts
  // Voronoi districts around seeds; each district has a template (see DISTRICTS) that decides block size,
  // street widths, intensity (density / height) and what is built. Districts are taken per arterial cell
  // (arterials are the natural district edges); a block next to a much more intense district gets a mid-rise
  // transition edge.
  const district = (x, z) => { let best = null, bd = Infinity; for (const d of SEEDS) { const k = Math.hypot((x - d.x) / (d.w ?? 1), z - d.z); if (k < bd) { bd = k; best = d; } } return best; };
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
    const bw = (ax1 - ax0) / nx, bd = (az1 - az0) / nz, st = T.street;
    for (let a2 = 0; a2 < nx; a2++) for (let b2 = 0; b2 < nz; b2++) {
      const x0 = ax0 + a2 * bw + st / 2, x1 = ax0 + (a2 + 1) * bw - st / 2, z0 = az0 + b2 * bd + st / 2, z1 = az0 + (b2 + 1) * bd - st / 2;
      if (x1 - x0 < 24 || z1 - z0 < 24 || inCore(x0 - 30, z0 - 30, x1 + 30, z1 + 30) || inRiver(z0, z1)) continue;
      if (a2 < nx - 1 && !inHand(x1, z0, x1 + st, z1 + st)) B.add(boxGeo(st, 0.04, z1 - z0 + st, x1 + st / 2, CURB - 0.02, (z0 + z1) / 2), asph, { cast: false });
      if (b2 < nz - 1 && !inHand(x0, z1, x1 + st, z1 + st)) B.add(boxGeo(x1 - x0 + st, 0.04, st, (x0 + x1) / 2, CURB - 0.02, z1 + st / 2), asph, { cast: false });
      const edge = { n: b2 === 0, s: b2 === nz - 1, w: a2 === 0, e: a2 === nx - 1 };   // block faces an arterial
      // a block touching the hand-made quarter keeps everything that stays clear of it
      const sp = inHand(x0, z0, x1, z1) ? (x, z, q) => { const [a, b, c, d] = q.box; if (!inHand(a, b, c, d)) spec(x, z, q); } : spec;
      fillBlock(sp, { x0, z0, x1, z1 }, D, T, { edge, hotter, rnd, pick, occl: sp === spec ? occl : (a, b, c, d, h) => { if (!inHand(a, b, c, d)) occl(a, b, c, d, h); } });
    }
    // street trees along the arterials of this cell (both sides, every ~12 m)
    for (let x = ax0; x < ax1; x += 12) for (const z of [az0 - 3, az1 + 3]) treeSpots.push([x, z]);
    for (let z = az0; z < az1; z += 12) for (const x of [ax0 - 3, ax1 + 3]) treeSpots.push([x, z]);
  }
  // trees stream with their chunk (merged low-poly crowns)
  for (const [x, z] of treeSpots) { if (inCore(x - 10, z - 10, x + 10, z + 10) || inHand(x - 3, z - 3, x + 3, z + 3) || inRiver(z, z)) continue; const s2 = 0.8 + rnd() * 0.5; spec(x, z, { geo: () => treeGeo(x, z, s2), mat: () => treeMat(), box: [x - 1, z - 1, x + 1, z + 1, 6 * s2], color: 0x4a6a3a, tree: true }); }
  // terrain beyond the city: foothills rising into mountain ranges, the river valley carried on through them
  if (!DBG.includes('nohills')) scene.add(terrain(rnd));

  this.specCount = NSPEC;
  if (DBG.includes('nobatch')) B.buckets.clear();
  const out = B.build(); for (const m of out) { m.userData.region = true; m.userData.lodAlways = true; m.castShadow = false; }
  // HLOD proxies for every chunk now; details stream in later
  const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, map: proxyTex() });
  if (!DBG.includes('noproxy')) for (const c of this.chunks.values()) c.proxy = proxyMesh(c.specs, pm, scene);
  this.noDetail = DBG.includes('nodetail');
  }
  // stream: build the nearest missing detail chunk (one per call), free far ones, swap proxy / detail
  update(dt) {
    if ((this.t -= dt) > 0) return; this.t = 0.15;
    const eye = this.ctx.game.renderer.camera.position; let best = null, bd = Infinity;
    for (const c of this.chunks.values()) {
      const d = Math.hypot(c.cx - eye.x, c.cz - eye.z);
      if (c.detail && d > DETAIL_OUT) { for (const m of c.detail) { m.parent?.remove(m); m.geometry.dispose(); } c.detail = null; }
      if (!c.detail && d < DETAIL_IN && d < bd) { bd = d; best = c; }
      if (c.detail) for (const m of c.detail) m.visible = true;
      if (c.proxy) c.proxy.visible = !c.detail;
    }
    if (best && !this.noDetail) { const B = new Batch(this.ctx.scene); for (const sp of best.specs) { B.add(sp.geo(), sp.mat()); if (sp.roof) { const [x0, z0, x1, z1, h] = sp.box; B.add(boxGeo(x1 - x0 - 0.6, 0.5, z1 - z0 - 0.6, (x0 + x1) / 2, CURB + h, (z0 + z1) / 2), sp.roofMat ? sp.roofMat() : roofM()); } }
      best.detail = B.build(); for (const m of best.detail) { m.castShadow = false; m.userData.lodAlways = true; } if (best.proxy) best.proxy.visible = false; }
  }
  stats() { let d = 0; for (const c of this.chunks.values()) if (c.detail) d++; return { chunks: this.chunks.size, detailed: d }; }
}
function proxyTex() { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#80909a'; for (let y = 4; y < 64; y += 11) for (let x = 3; x < 64; x += 8) g.fillRect(x, y, 5, 6); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; }
function proxyMesh(specs, mat, scene) {
  if (!specs.length) return null;
  const pos = [], nor = [], uv = [], col = [], c = new THREE.Color();
  for (const sp of specs) { if (sp.tree) continue; const [x0, z0, x1, z1, h] = sp.box; const g = boxGeo(x1 - x0, h, z1 - z0, (x0 + x1) / 2, CURB, (z0 + z1) / 2).toNonIndexed(); const p = g.attributes.position, n = g.attributes.normal; c.set(sp.color ?? 0xc8c4bc);
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); const ay = Math.abs(n.getY(i)) > 0.5, ax = Math.abs(n.getX(i)) > 0.5; uv.push(ay ? 0 : (ax ? p.getZ(i) : p.getX(i)) / 8, ay ? 0 : p.getY(i) / 8); const k = ay ? 0.7 : 1; col.push(c.r * k, c.g * k, c.b * k); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat); m.userData.lodAlways = true; scene.add(m); return m;
}

// ------------------------------------------------------------------ terrain
// A disc of terrain (radius ~9 km round the city) on a polar grid, dense near the city and coarse far out.
// Height is 0 (under the city ground) inside the city rectangle and rises with distance from it into
// fractal ridges; the river valley is cut through east and west. Vertex colours: meadow → forest → rock.
function noise2(x, z) { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const h = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v; }
function fbm(x, z) { let a = 0, f = 1, w = 0.5; for (let i = 0; i < 6; i++) { a += w * noise2(x * f, z * f); f *= 2.03; w *= 0.5; } return a; }
export function terrainHeight(x, z) {
  const dx = Math.max(EXT.x0 - 140 - x, 0, x - EXT.x1 - 140), dz = Math.max(EXT.z0 - 140 - z, 0, z - EXT.z1 - 140), d = Math.hypot(dx, dz);
  if (d <= 0) return CURB - 0.6;
  const rise = Math.min(1, d / 1400), ridge = 1 - Math.abs(fbm(x / 1700, z / 1700) * 2 - 1);   // sharp ridges
  let h = rise * rise * (60 + 520 * Math.pow(ridge, 1.6) + 160 * fbm(x / 500 + 7, z / 500 - 3)) + Math.min(d, 300) * 0.05;
  const rc = (RIVER.z0 + RIVER.z1) / 2, rw = (RIVER.z1 - RIVER.z0) / 2 + 40 + Math.max(0, Math.abs(x - 200) - 2000) * 0.05;   // the valley widens away from the city
  const valley = Math.exp(-Math.pow(Math.max(0, Math.abs(z - rc) - rw) / 260, 2)); h = h * (1 - valley) + (Math.abs(z - rc) < rw ? -6 : h * 0.15) * valley;
  return h + CURB - 0.6;
}
function terrain(rnd) {
  const cx = 200, cz = 0, NA = 256, NR = 90, rMax = 9500, pos = [], col = [], idx = [];
  const c = new THREE.Color(), meadow = new THREE.Color(0x7a8a5a), forest = new THREE.Color(0x3e5236), rock = new THREE.Color(0x7a766c), snow = new THREE.Color(0xc8c8c0);
  for (let j = 0; j <= NR; j++) { const r = rMax * Math.pow(j / NR, 1.8);
    for (let i = 0; i < NA; i++) { const a = (i / NA) * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = terrainHeight(x, z); pos.push(x, y, z);
      const t = Math.min(1, Math.max(0, (y - 20) / 420)); c.copy(meadow).lerp(forest, Math.min(1, t * 2.5)); if (t > 0.55) c.lerp(rock, (t - 0.55) / 0.45); if (t > 0.92) c.lerp(snow, (t - 0.92) / 0.08 * 0.5);
      const k = 0.85 + noise2(x / 60, z / 60) * 0.3; col.push(c.r * k, c.g * k, c.b * k); } }
  for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const a = j * NA + i, b = j * NA + (i + 1) % NA, c2 = (j + 1) * NA + i, d = (j + 1) * NA + (i + 1) % NA; idx.push(a, b, c2, b, d, c2); }   // wound so the normals face up
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })); m.receiveShadow = false; m.userData.lodAlways = true; m.userData.region = true; return m;
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
const treeMat = () => mat('regtree', () => flatMat(0x46603a, { roughness: 1, key: 'regtree' }));
function treeGeo(x, z, s) { const g = new THREE.ConeGeometry(2.2 * s, 5 * s, 6).translate(x, CURB + 3.5 * s, z); return g; }

// fill one block according to its district template. ctx: { edge (faces an arterial), hotter (neighbour intensity
// above ours → mid-rise transition edge), rnd, pick, occl }
function fillBlock(spec, r, D, T, { edge, hotter, rnd, pick, occl }) {
  const W = r.x1 - r.x0, Dd = r.z1 - r.z0, cx0 = (r.x0 + r.x1) / 2, cz0 = (r.z0 + r.z1) / 2;
  const put = (x, z, w, d, h, m, color, roof = null) => { if (w < 4 || d < 4 || h < 2) return; spec(x, z, { geo: () => boxGeo(w, h, d, x, CURB, z), mat: m, box: [x - w / 2, z - d / 2, x + w / 2, z + d / 2, h], color, roof: true, roofMat: roof }); if (h > 12) occl(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h); };
  const flat = (geoF, matF, x, z, box, color) => spec(x, z, { geo: geoF, mat: matF, box, color });
  const lawn = (x0, z0, x1, z1) => flat(() => boxGeo(x1 - x0, 0.05, z1 - z0, (x0 + x1) / 2, CURB, (z0 + z1) / 2), () => groundMat('lawn'), (x0 + x1) / 2, (z0 + z1) / 2, [x0, z0, x1, z1, 0.05], 0x56603a);
  const pave = (x0, z0, x1, z1, c = 0x9a9890) => flat(() => boxGeo(x1 - x0, 0.04, z1 - z0, (x0 + x1) / 2, CURB, (z0 + z1) / 2), () => groundMat('plaza', { color: c }), (x0 + x1) / 2, (z0 + z1) / 2, [x0, z0, x1, z1, 0.04], c);
  const COM = [0xd8d2c4, 0xb8b4aa, 0xc9c0ae, 0x9aa0a4, 0xe0dcd0, 0xa89c88, 0xcfc6b4], GL = [0x46586a, 0x3e4a52, 0x5a6a74];
  const comBox = (x, z, w, d, h) => { const wc = pick(COM), gc = pick(GL), sg = rnd() < 0.35; put(x, z, w, d, h, () => comMat(wc, gc, sg), wc); };
  // perimeter frontage: buildings of varied width / height along the chosen block faces, depth dep
  const frontage = (faces, dep, hmin, hmax) => {
    for (const f of faces) {
      const along = f === 'n' || f === 's'; const len = along ? W : Dd; let a = 0;
      while (a < len - 8) { const w = Math.min(len - a, 12 + rnd() * 20), h = hmin + rnd() * (hmax - hmin);
        const c = along ? [r.x0 + a + w / 2, f === 'n' ? r.z0 + dep / 2 : r.z1 - dep / 2] : [f === 'w' ? r.x0 + dep / 2 : r.x1 - dep / 2, r.z0 + a + w / 2];
        if (!(along ? false : (c[1] - w / 2 < r.z0 + dep - 0.5 && (faces.includes('n'))) || (c[1] + w / 2 > r.z1 - dep + 0.5 && faces.includes('s')))) comBox(c[0], c[1], along ? w - 0.6 : dep, along ? dep : w - 0.6, h);
        a += w; }
    }
  };
  const arterialFaces = Object.entries(edge).filter(([, v]) => v).map(([k]) => k);
  switch (D.type) {
    case 'park': {
      lawn(r.x0, r.z0, r.x1, r.z1);
      for (let k = 0; k < Math.floor(W * Dd / 700); k++) { const x = r.x0 + 6 + rnd() * (W - 12), z = r.z0 + 6 + rnd() * (Dd - 12), s2 = 0.9 + rnd() * 0.8; spec(x, z, { geo: () => treeGeo(x, z, s2), mat: () => treeMat(), box: [x - 1, z - 1, x + 1, z + 1, 6 * s2], color: 0x4a6a3a, tree: true }); }
      return;
    }
    case 'stadium': {
      const R = Math.min(W, Dd) * 0.38; flat(() => new THREE.CylinderGeometry(R, R * 0.92, 32, 40, 1, true).translate(cx0, CURB + 16, cz0), () => flatMat(0xd8d8d0, { key: 'stadium' }), cx0, cz0, [cx0 - R, cz0 - R, cx0 + R, cz0 + R, 32], 0xd8d8d0);
      flat(() => boxGeo(R * 1.2, 0.06, R * 0.8, cx0, CURB, cz0), () => groundMat('lawn'), cx0, cz0, [cx0 - R * 0.6, cz0 - R * 0.4, cx0 + R * 0.6, cz0 + R * 0.4, 0.06], 0x56603a);
      pave(r.x0, r.z0, r.x1, r.z1, 0xb0aca4); occl(cx0 - R, cz0 - R, cx0 + R, cz0 + R, 32); return;
    }
    case 'campus': {   // low academic / hospital buildings round a green quad
      lawn(r.x0 + 30, r.z0 + 30, r.x1 - 30, r.z1 - 30);
      for (const [x, z, w, d] of [[r.x0 + 15, cz0, 24, Dd - 40], [r.x1 - 15, cz0, 24, Dd - 40], [cx0, r.z0 + 14, W - 70, 22], [cx0, r.z1 - 14, W - 70, 22]]) { const h = T.h[0] + rnd() * (T.h[1] - T.h[0]); put(x, z, w, d, h, () => villaMat(0x9a5a44), 0x9a5a44, roofGreen); }
      return;
    }
    case 'industrial': {
      pave(r.x0, r.z0, r.x1, r.z1, 0x8a8882);
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
        if (rnd() < 0.06) { pave(x, z, x + lotW, z + lotD, 0x7a7a76); continue; }   // a small parking lot / empty lot
        const corner = x < r.x0 + 2 || x + lotW > r.x1 - 2; const fl = 3 + Math.floor(rnd() * 2) + (corner ? 1 : 0), bc = pick([0x8a4a3a, 0x9a5a44, 0xd0c8b8, 0xc8c0b0, 0x7a4234, 0xb8a890]);
        const vh = 2.6 + 2.8 * fl, vx = x + lotW / 2, vz = z + lotD / 2;
        put(vx, vz, lotW - 1.4, lotD - 1.4, vh, () => villaMat(bc), bc, roofGreen);
        if (rnd() < 0.3) spec(vx, vz, { geo: () => { const g = new THREE.CylinderGeometry(0.01, (lotW - 1) / Math.SQRT2, 2.2, 4, 1); g.rotateY(Math.PI / 4); g.scale(1, 1, (lotD - 1) / (lotW - 1)); g.translate(vx, CURB + vh + 1.6, vz); return g; }, mat: () => flatMat(pick([0x5a3a2a, 0x3a4650, 0x4a5a4a]), { key: 'vroof' }), box: [vx - 1, vz - 1, vx + 1, vz + 1, 0.1], color: 0x5a3a2a });
      }
      return;
    }
    case 'downtown': {
      // perimeter commercial blocks: continuous frontage on every street, taller on arterials, a parking court inside
      const hi = T.h[1] + (hotter > 0 ? 10 : 0);
      for (const f of ['n', 's', 'w', 'e']) frontage([f], 20, edge[f] ? T.h[0] + 12 : T.h[0], edge[f] ? hi : hi * 0.6);
      pave(r.x0 + 21, r.z0 + 21, r.x1 - 21, r.z1 - 21, 0x6e6e6c);
      return;
    }
    case 'business': case 'cbd': case 'mixed': {
      // towers on podiums; plan, cladding, crown and height vary; heights rise toward the district seed
      const n = Math.max(1, Math.round(W / 60)), m = Math.max(1, Math.round(Dd / 60)), gw = W / n, gd = Dd / m;
      const dSeed = Math.hypot(cx0 - D.x, cz0 - D.z);
      for (let a = 0; a < n; a++) for (let b = 0; b < m; b++) {
        const cx = r.x0 + (a + 0.5) * gw, cz = r.z0 + (b + 0.5) * gd;
        if (D.type === 'mixed') { // 주상복합: a commercial podium + slender residential tower
          comBox(cx, cz, gw - 6, gd - 6, 14);
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
        put(cx, cz, Math.min(gw - 4, w + 12), Math.min(gd - 4, d + 12), podH, () => comMat(pick([0x9aa0a4, 0xb8b4aa, 0x7e8488]), 0x3e4a52), 0x9aa0a4);
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
      if (sh === 's' || sh === 'n') comBox(r.x0 + 30, sh === 's' ? r.z1 - 14 : r.z0 + 14, 50, 20, 8); else comBox(sh === 'w' ? r.x0 + 14 : r.x1 - 14, r.z0 + 30, 20, 50, 8);
      const style = D.type === 'slab' ? pick([0, 1, 1]) : pick([0, 2, 2]);       // one façade design per complex
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
          spec(x + 1, z + 6, { geo: () => boxGeo(2, h1 - 4, 12.2, x + 1, CURB + 2, z + 6), mat: () => flatMat(acc, { key: 'acc' + acc }), box: [x, z, x + 2, z + 12, h1], color: acc });
          for (const lx of [x + cut * 0.5, x + cut + (len - cut) * 0.5]) spec(lx, z + 6, { geo: () => boxGeo(5, 3, 6, lx, CURB + (lx < x + cut ? h1 : h2), z + 6), mat: () => flatMat(0x9a9c98, { key: 'plant' }), box: [lx - 2, z + 4, lx + 2, z + 8, 3], color: 0x9a9c98 });
        }
      }
      return;
    }
  }
}
