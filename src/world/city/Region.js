// The metropolitan region around the detailed districts: ~3.4 x 2.8 km of planned city so the place reads
// as a real metropolis from any height, then a river to the north and mountains on the horizon.
// Beyond the playable streets: no colliders, low-poly masses with textured façades, merged per 240 m
// chunk (frustum culled), big buildings registered as occluders with the LOD system.
//
// PLAN (north = -z)
//   arterial grid continuing the core's main roads (x 0 = 연서대로, x 420 = the boulevard), local streets
//   between; a ring road around the detailed core
//   CBD        east of the new district — towers 80-230 m, a convention centre + mall, plazas
//   commercial mid-rise frontage along every arterial (5-15 floors)
//   residential apartment complexes (slab rows facing south, tower clusters) — most of the land,
//              riverside high-rises along the river; villa quarters (4-5 floors, dense) in the older parts
//   industrial the south-west edge
//   public     one large park (with a lake-free lawn + forest), a stadium complex by the river
//   river      z -1150..-800 with bridges on the arterials, riverside parks on both banks
import * as THREE from 'three';
import { Batch } from './CityPlan.js';
import { wallMat, flatMat, groundMat } from './CityMaterials.js';
import { curtainMat, gridMat, outline, shell, cap } from './Modern.js';
import { CURB } from './Streets.js';

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
const aptMat = (wall) => mat(`apt${wall}`, () => { const m = new THREE.MeshStandardMaterial({ roughness: 0.75, map: tex(`apt${wall}`, (g, W, H, r) => {
  g.fillStyle = css(wall); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2; i++) { const x = i * W / 2; g.fillStyle = r() < 0.5 ? '#41505a' : '#55626a'; g.fillRect(x + 10, H * 0.18, W / 2 - 20, H * 0.55); if (r() < 0.5) { g.fillStyle = 'rgba(220,214,200,0.6)'; g.fillRect(x + 10, H * 0.18, (W / 2 - 20) * (0.2 + r() * 0.4), H * 0.55); } }
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, H * 0.75, W, H * 0.06); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, H * 0.73, W, 4);
}) }); m.userData.uM = 6.8; m.userData.vM = 2.8; return m; });
// commercial / older mid-rise: windows on tile, tile = 3 x 3.3
const comMat = (wall, glass) => mat(`com${wall}${glass}`, () => { const m = new THREE.MeshStandardMaterial({ roughness: 0.8, map: tex(`com${wall}${glass}`, (g, W, H, r) => {
  g.fillStyle = css(wall); g.fillRect(0, 0, W, H); g.fillStyle = css(glass); g.fillRect(W * 0.1, H * 0.2, W * 0.8, H * 0.55); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(W * 0.1, H * 0.2, W * 0.8, 6);
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
  if (!DBG.includes('noground')) B.add(slab(EXT.x0 - 2600, RIVER.z1, EXT.x1 + 2600, EXT.z1 + 2600, [[-200, -270, 200, 270], [200, -300, 720, 300]]), gm, { cast: false });
  if (!DBG.includes('noground')) B.add(slab(EXT.x0 - 2600, EXT.z0 - 2600, EXT.x1 + 2600, RIVER.z0, []), gm, { cast: false });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, RIVER.z1 - RIVER.z0), new THREE.MeshStandardMaterial({ color: 0x4a6468, roughness: 0.08, metalness: 0.35, envMapIntensity: 1.1 }));
  water.rotation.x = -Math.PI / 2; water.position.set(200, -2.0, (RIVER.z0 + RIVER.z1) / 2); if (!DBG.includes('nowater')) scene.add(water);
  for (const z of [RIVER.z0, RIVER.z1]) { B.add(boxGeo(9000, 0.1, 60, 200, CURB, z + (z === RIVER.z1 ? 30 : -30)), groundMat('lawn'), { cast: false }); }   // riverside parks
  // the land must not cover the river: cut it with a dark trough (the ground slab is drawn under it)
  B.add(boxGeo(9000, 0.4, RIVER.z1 - RIVER.z0, 200, -4.0, (RIVER.z0 + RIVER.z1) / 2), flatMat(0x2a3436, { key: 'riverbed' }), { cast: false });
  for (const z of [RIVER.z0, RIVER.z1]) B.add(boxGeo(9000, CURB + 4, 1, 200, -4, z), wallMat('stone', 0x9a968c), { cast: false });   // embankments
  const asph = groundMat('asphalt', { roughness: 0.85 });
  // arterials (30 m) and the ring road around the core
  for (const x of ARTX) for (const [z0, z1] of [[EXT.z0, RIVER.z0], [RIVER.z1, EXT.z1]]) { if (x > CORE.x0 - 20 && x < CORE.x1 + 20 && false) continue; B.add(boxGeo(30, 0.05, z1 - z0, x, CURB - 0.02, (z0 + z1) / 2), asph, { cast: false }); }
  for (const z of ARTZ) B.add(boxGeo(EXT.x1 - EXT.x0, 0.05, 30, (EXT.x0 + EXT.x1) / 2, CURB - 0.02, z), asph, { cast: false });
  for (const z of [CORE.z0 - 14, CORE.z1 + 14]) B.add(boxGeo(CORE.x1 - CORE.x0 + 56, 0.05, 24, (CORE.x0 + CORE.x1) / 2, CURB - 0.02, z), asph, { cast: false });
  for (const x of [CORE.x0 - 14, CORE.x1 + 14]) B.add(boxGeo(24, 0.05, CORE.z1 - CORE.z0 + 56, x, CURB - 0.02, 0), asph, { cast: false });
  // bridges over the river on each arterial
  const conc = wallMat('concrete', 0xa8a6a0);
  for (const x of ARTX) { B.add(boxGeo(30, 2, RIVER.z1 - RIVER.z0 + 60, x, 8, (RIVER.z0 + RIVER.z1) / 2), conc); for (let z = RIVER.z0 + 30; z < RIVER.z1; z += 70) B.add(boxGeo(6, 10, 4, x, -2, z), conc); }

  // ---------------------------------------------------------------- zoning
  const zoneAt = (x, z) => {
    const dl = Math.hypot(x - LANDMARK.x, z - LANDMARK.z);
    if (x > 700 && x < 1500 && z > -650 && z < 650 && dl < 900) return 'cbd';
    if (x < -900 && z > 700) return 'industrial';
    if (x > 960 && x < 1500 && z > 660 && z < 1020) return 'park';
    if (x > 1380 && z < -660 && z > -800) return 'stadium';
    if (z < -660 || z > 1020 || x < -960 || x > 1500) return 'apartment';
    if ((x < -276 && x > -960 && z > 300) || (x > -276 && x < 420 && z > 306 && z < 660)) return 'villa';
    return 'apartment';
  };
  const nearArterial = (x, z) => ARTX.some((a) => Math.abs(x - a) < 60) || ARTZ.some((a) => Math.abs(z - a) < 60);

  // ---------------------------------------------------------------- blocks: cells between arterials split by local streets every ~120 m
  const xs = [EXT.x0, ...ARTX.filter((x) => x > EXT.x0 && x < EXT.x1), EXT.x1], zs = [EXT.z0, ...ARTZ, EXT.z1];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const ax0 = xs[i] + 15, ax1 = xs[i + 1] - 15, az0 = zs[j] + 15, az1 = zs[j + 1] - 15;
    const nx = Math.max(1, Math.round((ax1 - ax0) / 120)), nz = Math.max(1, Math.round((az1 - az0) / 120));
    const bw = (ax1 - ax0) / nx, bd = (az1 - az0) / nz;
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      const x0 = ax0 + a * bw + 5, x1 = ax0 + (a + 1) * bw - 5, z0 = az0 + b * bd + 5, z1 = az0 + (b + 1) * bd - 5;
      if (x1 - x0 < 30 || z1 - z0 < 30 || inCore(x0 - 30, z0 - 30, x1 + 30, z1 + 30) || inRiver(z0, z1)) continue;   // slivers at the edges stay open ground
      // local street around the block
      B.add(boxGeo(x1 - x0 + 10, 0.04, 10, (x0 + x1) / 2, CURB - 0.02, z1 + 5), asph, { cast: false });
      B.add(boxGeo(10, 0.04, z1 - z0 + 10, x1 + 5, CURB - 0.02, (z0 + z1) / 2), asph, { cast: false });
      const zone = zoneAt((x0 + x1) / 2, (z0 + z1) / 2);
      fillBlock(spec, { x0, z0, x1, z1 }, zone, nearArterial((x0 + x1) / 2, (z0 + z1) / 2), rnd, pick, occl);
    }
  }
  // riverside high-rise apartments on the north bank and the strip south of the river
  for (let x = EXT.x0 + 40; x < EXT.x1 - 60; x += 70) for (const z of [RIVER.z0 - 110, RIVER.z1 + 100]) {
    const h = 3 + 2.8 * (25 + Math.floor(rnd() * 15)), wall = pick([0xe8e4da, 0xdcd6c8, 0xe6e2d6]); spec(x, z, { geo: () => boxGeo(44, h, 14, x, CURB, z), mat: () => aptMat(wall), box: [x - 22, z - 7, x + 22, z + 7, h], color: wall, roof: true }); occl(x - 22, z - 7, x + 22, z + 7, h);
  }
  // mountains around the horizon
  const hill = new THREE.MeshStandardMaterial({ color: 0x4a5a48, roughness: 1 });
  for (let i = 0; i < (DBG.includes('nohills') ? 0 : 46); i++) {
    const a = (i / 46) * Math.PI * 2 + rnd() * 0.08, r = 3300 + rnd() * 1200, h = 260 + rnd() * 380;
    const g = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); const p = g.attributes.position; const ph = rnd() * 6; for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k); const n = 1 + 0.12 * Math.sin(x * 5 + ph) * Math.cos(z * 4 - ph) + 0.06 * Math.sin(x * 13 + z * 11); p.setXYZ(k, x * n, y * (0.75 + 0.35 * n), z * n); } g.computeVertexNormals();
    const m = new THREE.Mesh(g, hill); m.scale.set(500 + rnd() * 500, h, 500 + rnd() * 400); m.position.set(200 + Math.cos(a) * r, -10, Math.sin(a) * r); m.userData.lodAlways = true; scene.add(m);
  }
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
  for (const sp of specs) { const [x0, z0, x1, z1, h] = sp.box; const g = boxGeo(x1 - x0, h, z1 - z0, (x0 + x1) / 2, CURB, (z0 + z1) / 2).toNonIndexed(); const p = g.attributes.position, n = g.attributes.normal; c.set(sp.color ?? 0xc8c4bc);
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); const ay = Math.abs(n.getY(i)) > 0.5, ax = Math.abs(n.getX(i)) > 0.5; uv.push(ay ? 0 : (ax ? p.getZ(i) : p.getX(i)) / 8, ay ? 0 : p.getY(i) / 8); const k = ay ? 0.7 : 1; col.push(c.r * k, c.g * k, c.b * k); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat); m.userData.lodAlways = true; scene.add(m); return m;
}

// one city block, filled according to its zone (frontage on arterials becomes mid-rise commercial)
function fillBlock(spec, r, zone, arterial, rnd, pick, occl) {
  const W = r.x1 - r.x0, D = r.z1 - r.z0;
  // m: () => material (built lazily with the chunk), color: the proxy colour
  const put = (x, z, w, d, h, m, color, roof = null) => { spec(x, z, { geo: () => boxGeo(w, h, d, x, CURB, z), mat: m, box: [x - w / 2, z - d / 2, x + w / 2, z + d / 2, h], color, roof: true, roofMat: roof }); if (h > 12) occl(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h); };
  const flat = (geoF, matF, x, z, box, color) => spec(x, z, { geo: geoF, mat: matF, box, color });
  const cx0 = (r.x0 + r.x1) / 2, cz0 = (r.z0 + r.z1) / 2;
  if (zone === 'park') { flat(() => boxGeo(W, 0.05, D, cx0, CURB, cz0), () => groundMat('lawn'), cx0, cz0, [r.x0, r.z0, r.x1, r.z1, 0.05], 0x56603a); return; }
  if (zone === 'stadium') { const R = Math.min(W, D) * 0.45; flat(() => new THREE.CylinderGeometry(R, R * 0.93, 28, 32, 1, true).translate(cx0, CURB + 14, cz0), () => flatMat(0xd8d8d0, { key: 'stadium' }), cx0, cz0, [cx0 - R, cz0 - R, cx0 + R, cz0 + R, 28], 0xd8d8d0); return; }
  // frontage strip on arterials: mid-rise commercial of varied widths / heights
  let inner = { ...r };
  if (arterial && zone !== 'cbd' && zone !== 'industrial') {
    for (let x = r.x0; x < r.x1 - 12; ) { const w = Math.min(r.x1 - x, 14 + rnd() * 22), h = 14 + rnd() * 34, wc = pick([0xd8d2c4, 0xb8b4aa, 0xc9c0ae, 0x9aa0a4, 0xe0dcd0, 0xa89c88]), gc = pick([0x46586a, 0x3e4a52, 0x5a6a74]); put(x + w / 2, r.z0 + 11, w - 1, 20, h, () => comMat(wc, gc), wc); x += w; }
    inner.z0 += 26;
  }
  const IW = inner.x1 - inner.x0, ID = inner.z1 - inner.z0;
  if (zone === 'cbd') {
    // towers: varied plans (rect / rounded / chamfered / elliptical), podiums, set-backs; taller toward the landmark
    const n = Math.max(1, Math.floor(W / 55)) * Math.max(1, Math.floor(D / 55));
    for (let k = 0; k < n; k++) {
      const gx = k % Math.max(1, Math.floor(W / 55)), gz = Math.floor(k / Math.max(1, Math.floor(W / 55)));
      const cx = r.x0 + 27 + gx * 55 + (rnd() - 0.5) * 6, cz = r.z0 + 27 + gz * 55 + (rnd() - 0.5) * 6;
      const dl = Math.hypot(cx - LANDMARK.x, cz - LANDMARK.z), H = Math.max(60, 240 - dl * 0.2) * (0.6 + rnd() * 0.5);
      const kind = pick(['rect', 'round', 'chamfer', 'ellipse']), w = 26 + rnd() * 16, d = 22 + rnd() * 14, fh = 4;
      const curtain = rnd() < 0.7, gl = pick([0x4e6a80, 0x5a7486, 0x56707e, 0x4a6478, 0x62767e]), sp = pick([0x6a7884, 0x9aa2a8, 0x7e8a92]), fr = pick([0xd6cfc0, 0xc8c4ba, 0xe2ddd2]);
      const m = () => (curtain ? curtainMat({ glass: gl, spandrel: sp, floorH: fh, key: 'reg' }) : gridMat({ frame: fr, floorH: 3.8, key: 'reg' })), uM = curtain ? 6 : 3, vM = curtain ? fh : 3.8;
      const pts = outline(kind, w, d, { r: 6, c: 5, n: 24 });
      put(cx, cz, w + 10, d + 10, 10, () => comMat(0x9aa0a4, 0x3e4a52), 0x9aa0a4);
      const split = rnd() < 0.4 ? 0.7 : 1, h1 = H * split, tint = curtain ? gl : fr;
      flat(() => { const g = shell([{ y: CURB + 10, pts }, { y: CURB + 10 + h1, pts }], { cx, cz, uM, vM }); return g; }, m, cx, cz, [cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 10 + h1], tint);
      flat(() => cap(pts, CURB + 10 + h1, { cx, cz }), roofM, cx, cz, [cx - 1, cz - 1, cx + 1, cz + 1, 0.1], 0x6e7270);
      if (split < 1) { const p2 = pts.map(([x, z]) => [x * 0.75, z * 0.75]); flat(() => shell([{ y: CURB + 10 + h1, pts: p2 }, { y: CURB + 10 + H, pts: p2 }], { cx, cz, uM, vM }), m, cx, cz, [cx - w * 0.37, cz - d * 0.37, cx + w * 0.37, cz + d * 0.37, 10 + H], tint); flat(() => cap(p2, CURB + 10 + H, { cx, cz }), roofM, cx, cz, [cx - 1, cz - 1, cx + 1, cz + 1, 0.1], 0x6e7270); }
      occl(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, H);
    }
    return;
  }
  if (zone === 'industrial') { for (let z = inner.z0; z < inner.z1 - 20; z += 34) for (let x = inner.x0; x < inner.x1 - 25; x += 46) put(x + 20, z + 14, 40, 28, 8 + rnd() * 5, () => wallMat('panel', 0xa0a6aa), 0xa0a6aa, () => flatMat(0x6e7a84, { roughness: 0.6, metalness: 0.4, key: 'indroof' })); return; }
  if (zone === 'villa') {
    // dense 4-5 storey villas on small lots, 4 m lanes
    for (let z = inner.z0; z < inner.z1 - 11; z += 15) for (let x = inner.x0; x < inner.x1 - 10; x += 14) {
      if (rnd() < 0.08) continue; const h = 2.6 + 2.8 * (3 + Math.floor(rnd() * 2)), bc = pick([0x8a4a3a, 0x9a5a44, 0xd0c8b8, 0xc8c0b0, 0x7a4234]); put(x + 5.5, z + 6, 11, 12, h, () => villaMat(bc), bc, roofGreen);
    }
    return;
  }
  // apartments: rows of south-facing slabs (or tower clusters), height per complex, sometimes a complex accent colour
  const towers = rnd() < 0.35, floors = 15 + Math.floor(rnd() * 16), wall = pick([0xe8e4da, 0xdcd6c8, 0xe2e0d8, 0xd8d4c8]);
  if (towers) { for (let z = inner.z0 + 10; z < inner.z1 - 22; z += 40) for (let x = inner.x0 + 10; x < inner.x1 - 22; x += 36) { const h = 3 + 2.8 * (floors + 10 + Math.floor(rnd() * 8)); put(x + 11, z + 11, 22, 22, h, () => aptMat(wall), wall); } return; }
  const len = Math.min(IW - 16, 40 + rnd() * 30); if (len < 20) return;
  for (let z = inner.z0 + 8; z < inner.z1 - 14; z += 34 + rnd() * 6) for (let x = inner.x0 + 8; x + len <= inner.x1 - 4; x += len + 14) { const h = 3 + 2.8 * (floors + Math.floor(rnd() * 4)); put(x + len / 2, z + 6, len, 12, h, () => aptMat(wall), wall); }
}
