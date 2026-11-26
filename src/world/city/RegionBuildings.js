// Building detail for the background city: what tells an office from a hotel from a 다세대 villa from a 상가.
//   · storefronts: lit interiors behind the glass (cafés with pendant lamps and a wood counter, bright shop
//     shelves, white clinics / 학원), mullions, awnings on some units
//   · sides: drain pipes, the yellow gas pipe, outdoor AC units hung on the wall, a steel fire escape on some
//   · 다세대 villas on pilotis (필로티 parking under the building), window rails, AC units
//   · apartment towers: a floor ledge every storey (balcony slabs), the lobby / 공동현관 canopy, the complex
//     gate (문주) with its name, the underground car park ramp; older slab blocks: balcony bands, stair-core
//     entrances, surface parking between the rows
//   · offices: a double-height glass lobby with a revolving door and a canopy, the company name on the crown;
//     hotels: a porte-cochère over the drop-off, the name down the tower, a glass rooftop restaurant
//   · public buildings: 구청, 경찰서, 소방서, 우체국, 도서관; culture: 공연장, 미술관; logistics centres
// Everything is merged per building / block into a few specs (streamed with the chunk).
import * as THREE from 'three';
import { CURB } from './Streets.js';
import { flatMat, wallMat, groundMat } from './CityMaterials.js';
import { mergeGeos } from './RegionStreets.js';

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cyl = (r0, r1, h, x, y, z, n = 10) => new THREE.CylinderGeometry(r0, r1, h, n).translate(x, y + h / 2, z);
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
function beam(a, b, t) { _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _d.length(); const g = new THREE.BoxGeometry(t, L, t); g.translate(0, L / 2, 0); _q.setFromUnitVectors(_up, _d.normalize()); g.applyQuaternion(_q); g.translate(a[0], a[1], a[2]); return g; }

// ------------------------------------------------------------------ materials
const cache = new Map(); const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
const MT = {
  metal: () => flatMat(0x4a5056, { metalness: 0.5, roughness: 0.45, key: 'bdmetal' }), steel: () => flatMat(0x8a8e92, { metalness: 0.6, roughness: 0.4, key: 'bdsteel' }),
  white: () => flatMat(0xeeece6, { key: 'bdwhite' }), dark: () => flatMat(0x26282a, { key: 'bddark' }), conc: () => wallMat('concrete', 0xb4b2aa), pipe: () => flatMat(0x8c9094, { roughness: 0.5, metalness: 0.3, key: 'bdpipe' }),
  gas: () => flatMat(0xe0b420, { roughness: 0.5, key: 'bdgas' }), ac: () => flatMat(0xdcdcd6, { roughness: 0.6, key: 'bdac' }), rail: () => flatMat(0x3a3e42, { metalness: 0.5, roughness: 0.5, key: 'bdrail' }),
  glassLobby: () => once('glassLobby', () => new THREE.MeshStandardMaterial({ color: 0x9ab4c0, roughness: 0.08, metalness: 0.5, emissive: 0x6a5a40, emissiveIntensity: 0.25 })),
  glassDark: () => flatMat(0x2e3a44, { roughness: 0.1, metalness: 0.6, key: 'bdglassd' }), lawn: () => groundMat('lawn'), wood: () => flatMat(0x7a5a3a, { key: 'bdwood' }),
  red: () => flatMat(0xc8241c, { key: 'bdred' }), blue: () => flatMat(0x1d4f9a, { key: 'bdblue' }), navy: () => flatMat(0x1a2e50, { key: 'bdnavy' }), orange: () => flatMat(0xe8601a, { key: 'bdorange' }), green: () => flatMat(0x2a6a4a, { key: 'bdgreen' }),
  warm: () => once('warmglass', () => new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 0.2, metalness: 0.3, emissive: 0xffd8a0, emissiveIntensity: 0.55 })),
  asph: () => groundMat('asphalt', { roughness: 0.85 }), line: () => flatMat(0xeeeee8, { key: 'stwhite' }),
};
export const AWN = [0xc8241c, 0x1d4f9a, 0x2a7a4a, 0xe8a020, 0x5a3a2a, 0x2a2c2e, 0xd86a1a];
const awnMat = (c) => () => flatMat(c, { roughness: 0.8, key: 'awn' + c });
// storefront glass with the shop lit inside: 0 café (pendants, wood counter, warm), 1 shop (bright shelves),
// 2 clinic / 학원 / office (white, line lights), 3 restaurant (tables, warm), tile = one 6 x 3 m unit
function storefrontMat(v) {
  return once('store' + v, () => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const g = cv.getContext('2d'); let s = 31 + v; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const bg = ['#5a4232', '#d8d8d0', '#e8eae6', '#6a4a34'][v]; g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
    const grd = g.createLinearGradient(0, 0, 0, 128); grd.addColorStop(0, 'rgba(255,240,210,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
    if (v === 0 || v === 3) { g.fillStyle = '#8a6a48'; g.fillRect(0, 70, 256, 58); for (let x = 20; x < 256; x += 46) { g.strokeStyle = '#222'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 22); g.stroke(); g.fillStyle = '#ffe8b0'; g.beginPath(); g.arc(x, 26, 7, 0, 7); g.fill(); }   // pendants over a wood counter / tables
      for (let x = 8; x < 256; x += 30) { g.fillStyle = 'rgba(40,30,20,0.6)'; g.fillRect(x, 82, 14, 4); } }
    else if (v === 1) { for (let y = 20; y < 110; y += 22) { g.fillStyle = '#b0aca4'; g.fillRect(0, y, 256, 3); for (let x = 2; x < 256; x += 7) { g.fillStyle = `hsl(${Math.floor(r() * 360)},55%,${45 + r() * 20}%)`; g.fillRect(x, y - 12, 5, 12); } } g.fillStyle = '#fff'; for (let x = 10; x < 256; x += 40) g.fillRect(x, 4, 28, 3); }
    else { g.fillStyle = '#fff'; for (let x = 6; x < 256; x += 60) g.fillRect(x, 6, 44, 3); g.fillStyle = '#c8ccd0'; g.fillRect(30, 70, 90, 30); g.fillStyle = '#9aa4aa'; g.fillRect(150, 50, 70, 50); g.fillStyle = '#7aa080'; g.fillRect(232, 60, 14, 40); }
    g.fillStyle = 'rgba(30,34,38,0.9)'; g.fillRect(0, 0, 256, 3); g.fillRect(0, 125, 256, 3); g.fillRect(127, 0, 3, 128); g.fillRect(0, 0, 3, 128);   // mullions
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(90, 0); g.lineTo(30, 128); g.lineTo(0, 128); g.fill();   // reflection
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.15, metalness: 0.2, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.45 }); m.userData.uM = 6; m.userData.vM = 3; return m;
  });
}
// a name board (canvas text), cached per name
function nameMat(text, bg = '#1a2e50', fg = '#f2efe4', w = 512, h = 128) {
  return () => once(`name|${text}|${bg}|${fg}`, () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg;
    let fs = Math.floor(h * 0.62); g.font = `bold ${fs}px sans-serif`; while (g.measureText(text).width > w * 0.9 && fs > 10) { fs -= 2; g.font = `bold ${fs}px sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35 }); });
}
// a plane facing (nx, nz) with its own 0..1 UVs (a name board / a storefront)
function quad(w, h, x, y, z, nx, nz, uRep = 1) { const g = new THREE.PlaneGeometry(w, h); if (uRep !== 1) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * uRep); } g.rotateY(Math.atan2(nx, nz)); g.translate(x, y, z); g.userData.keepUV = true; return g; }
function mergeUV(gs) { const pos = [], nor = [], uv = [], idx = []; let o = 0;
  for (const g of gs) { const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u.getX(i), u.getY(i)); } for (const k of g.index.array) idx.push(k + o); o += p.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); m.setIndex(idx); m.userData.keepUV = true; return m; }

// collects geometry builders per material and emits one decorative spec per material
export class Kit {
  constructor(spec, x, z) { this.spec = spec; this.x = x; this.z = z; this.m = new Map(); }
  // keyed by the material itself (resolved now: materials are cached), so inline closures still share one spec
  add(matFn, ...fs) { const k = matFn(); if (!this.m.has(k)) this.m.set(k, { uv: false, fs: [] }); this.m.get(k).fs.push(...fs); return this; }
  addUV(matFn, ...fs) { const k = matFn(); if (!this.m.has(k)) this.m.set(k, { uv: true, fs: [] }); this.m.get(k).fs.push(...fs); return this; }
  done(h = 6) { for (const [mat, { uv, fs }] of this.m) if (fs.length) this.spec(this.x, this.z, { geo: () => (uv ? mergeUV(fs.map((f) => f())) : mergeGeos(fs.map((f) => f()))), mat: () => mat, box: [this.x - 1, this.z - 1, this.x + 1, this.z + 1, h], color: 0x9a9a94, np: true }); }
}
const N = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };

// ------------------------------------------------------------------ low / mid-rise commercial (상가)
// box [x0, z0, x1, z1], h, faces (street sides). Storefronts + awnings on the street faces, pipes / AC / gas on a
// side face, a fire escape on some.
export function shopDetails(spec, rnd, [x0, z0, x1, z1], h, faces) {
  const K = new Kit(spec, (x0 + x1) / 2, (z0 + z1) / 2), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const f of faces) {
    const [nx, nz] = N[f], len = nx ? z1 - z0 : x1 - x0, n = Math.max(1, Math.round(len / 6.5)), uw = len / n;
    for (let k = 0; k < n; k++) {
      const a = -len / 2 + (k + 0.5) * uw, px = nx ? (nx > 0 ? x1 : x0) + nx * 0.06 : cx + a, pz = nz ? (nz > 0 ? z1 : z0) + nz * 0.06 : cz + a, v = Math.floor(rnd() * 4);
      K.addUV(() => storefrontMat(v), () => quad(uw - 0.5, 2.7, px, CURB + 1.45, pz, nx, nz, Math.max(1, Math.round((uw - 0.5) / 6))));
      if (rnd() < 0.35 && h > 5) { const c = AWN[Math.floor(rnd() * AWN.length)]; K.add(awnMat(c), () => { const g = new THREE.BoxGeometry(nx ? 1.3 : uw - 0.8, 0.08, nx ? uw - 0.8 : 1.3); if (nx) g.rotateZ(-nx * 0.32); else g.rotateX(nz * 0.32); g.translate(px + nx * 0.65, CURB + 3.1, pz + nz * 0.65); return g; }); }
    }
  }
  // a side (non-street) face: drain pipes at the corners, the gas pipe, AC units, maybe a fire escape
  const side = ['n', 's', 'w', 'e'].find((f) => !faces.includes(f)) ?? 'e', [sx, sz] = N[side], sl = sx ? z1 - z0 : x1 - x0;
  const at = (a, out = 0.12) => [sx ? (sx > 0 ? x1 : x0) + sx * out : cx + a, sz ? (sz > 0 ? z1 : z0) + sz * out : cz + a];
  for (const a of [-sl / 2 + 0.3, sl / 2 - 0.3]) { const [px, pz] = at(a); K.add(MT.pipe, () => cyl(0.07, 0.07, h, px, CURB, pz, 6)); }
  { const [px, pz] = at(-sl / 2 + 1.4, 0.1); K.add(MT.gas, () => cyl(0.04, 0.04, h - 0.5, px, CURB + 0.3, pz, 5)); }
  for (let y = 3.6; y < h - 2; y += 3.3) if (rnd() < 0.6) { const [px, pz] = at((rnd() - 0.5) * (sl - 3), 0.4); K.add(MT.ac, () => box(sx ? 0.6 : 0.9, 0.65, sx ? 0.9 : 0.6, px, CURB + y, pz)); K.add(MT.rail, () => box(sx ? 0.05 : 1.0, 0.05, sx ? 1.0 : 0.05, px + sx * 0.3, CURB + y - 0.05, pz + sz * 0.3)); }
  if (h > 11 && sl > 10 && rnd() < 0.4) {   // fire escape: landings each floor, flights between, a rail
    const a0 = sl / 2 - 4.5;
    for (let y = 3.3, i = 0; y < h - 1; y += 3.3, i++) { const [lx, lz] = at(a0, 0.75), [l2x, l2z] = at(a0 + (i % 2 ? -2.6 : 2.6), 0.75);
      K.add(MT.metal, () => box(sx ? 1.4 : 3.0, 0.1, sx ? 3.0 : 1.4, lx, CURB + y, lz), () => beam([lx, CURB + y, lz], [l2x, CURB + y + 3.3, l2z], 0.6),
        () => box(sx ? 0.05 : 3.0, 0.05, sx ? 3.0 : 0.05, lx + sx * 0.68, CURB + y + 1.0, lz + sz * 0.68)); } }
  K.done(h);
}

// ------------------------------------------------------------------ 다세대 villa on pilotis
// the building body starts 2.8 m up; under it the parking, columns, a dark ceiling, a car or two. Returns nothing;
// the caller registers the collider box (full height).
export function villaPiloti(spec, rnd, x, z, w, d, h, bodyMat, bc, roofMat) {
  const K = new Kit(spec, x, z), y1 = CURB + 2.8;
  spec(x, z, { geo: () => box(w, h - 2.8, d, x, y1, z), mat: bodyMat, box: [x - w / 2, z - d / 2, x + w / 2, z + d / 2, h], color: bc, roof: true, roofMat });
  K.add(MT.dark, () => box(w - 0.2, 0.04, d - 0.2, x, y1 - 0.04, z));
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) K.add(MT.conc, () => box(0.45, 2.8, 0.45, x + ox * (w / 2 - 0.3), CURB, z + oz * (d / 2 - 0.3)));
  K.add(() => wallMat('concrete', 0xb4b2aa), () => box(2.4, 2.8, d * 0.4, x + w / 2 - 1.3, CURB, z - d * 0.3));   // the stair core / entrance
  const cols = [0xeeece6, 0x2a2c2e, 0x8a8e92, 0x6a1e1e];
  for (let k = 0; k < 2; k++) if (rnd() < 0.6) { const cx2 = x - w / 2 + 2 + k * 2.6; K.add(() => flatMat(cols[k * 2 + (rnd() < 0.5 ? 1 : 0)], { roughness: 0.35, metalness: 0.4, key: 'vcar' + k }), () => box(1.8, 1.35, 4.4, cx2, CURB + 0.05, z + 0.5)); }
  // window rails, AC units, the gas pipe running up the side
  for (let y = y1 + 1.0; y < CURB + h - 1.5; y += 2.8) { K.add(MT.rail, () => box(w * 0.42, 0.04, 0.05, x, y, z + d / 2 + 0.25)); if (rnd() < 0.5) K.add(MT.ac, () => box(0.85, 0.6, 0.55, x + (rnd() < 0.5 ? -1 : 1) * w * 0.32, y - 0.4, z + d / 2 + 0.35)); }
  K.add(MT.gas, () => cyl(0.04, 0.04, h - 0.6, x - w / 2 - 0.08, CURB + 0.3, z + d / 4, 5));
  K.done(h);
}

// ------------------------------------------------------------------ apartment towers / slabs
// floor ledges (balcony slabs) round a tower of outline P (local points), a lobby canopy on the south side
export function towerDetails(spec, rnd, cx, cz, P, h, accent) {
  const K = new Kit(spec, cx, cz), Q = P.map(([a, b]) => [a * 1.05, b * 1.05]);
  const ring = (y) => { const pos = [], nor = []; for (let i = 0; i < Q.length; i++) { const [a, b] = Q[i], [c, d] = Q[(i + 1) % Q.length], nx = d - b, nz = -(c - a), l = Math.hypot(nx, nz) || 1;
      for (const [p, q, yy] of [[a, b, y], [c, d, y], [c, d, y + 0.22], [a, b, y], [c, d, y + 0.22], [a, b, y + 0.22]]) { pos.push(cx + p, yy, cz + q); nor.push(nx / l, 0, nz / l); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g; };
  for (let y = CURB + 3 + 2.8; y < CURB + h - 1; y += 2.8) K.add(MT.white, () => ring(y));
  const sz = Math.max(...P.map((p) => p[1]));
  K.add(MT.glassLobby, () => box(8, 3.6, 0.1, cx, CURB, cz + sz + 0.1));
  K.add(() => flatMat(accent, { key: 'acc' + accent }), () => box(9, 0.35, 3.2, cx, CURB + 3.6, cz + sz + 1.6));
  for (const o of [-4.2, 4.2]) K.add(MT.steel, () => cyl(0.1, 0.1, 3.6, cx + o, CURB, cz + sz + 3.0, 6));
  K.done(h);
}
// the complex: gate (문주) with the name on the street side, the car park ramp
const APT_NAMES = ['한빛마을', '푸른숲', '새솔', '늘봄', '한누리', '해오름', '가람', '다솜', '은하수', '청솔', '미르', '라온'];
export function complexDetails(spec, rnd, r, streetFace, accent) {
  const K = new Kit(spec, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2), name = `${APT_NAMES[Math.floor(rnd() * APT_NAMES.length)]} ${1 + Math.floor(rnd() * 9)}단지`;
  const [nx, nz] = N[streetFace], len = nx ? r.z1 - r.z0 : r.x1 - r.x0, a = len * (0.62 + rnd() * 0.15) - len / 2;
  const gx = nx ? (nx > 0 ? r.x1 - 1 : r.x0 + 1) : (r.x0 + r.x1) / 2 + a, gz = nz ? (nz > 0 ? r.z1 - 1 : r.z0 + 1) : (r.z0 + r.z1) / 2 + a;
  const along = !nx;
  for (const s of [-1, 1]) K.add(() => wallMat('stone', 0x8a8478), () => box(along ? 1.4 : 1.6, 6.5, along ? 1.6 : 1.4, gx + (along ? s * 6 : 0), CURB, gz + (along ? 0 : s * 6)));
  K.add(() => flatMat(accent, { key: 'acc' + accent }), () => box(along ? 14 : 1.2, 1.4, along ? 1.2 : 14, gx, CURB + 6.5, gz));
  K.addUV(nameMat(name, '#2a2c30', '#e8e0c8', 256, 64), () => quad(8, 1.0, gx + nx * 0.62, CURB + 7.2, gz + nz * 0.62, nx, nz));
  K.add(MT.asph, () => box(along ? 10 : 30, 0.04, along ? 30 : 10, gx - (along ? 0 : nx * 15), CURB + 0.01, gz - (along ? nz * 15 : 0)));
  // underground parking ramp (지하주차장 입구): a canopy over a ramp going down, beside the gate
  const rx = gx + (along ? 16 : -nx * 18), rz = gz + (along ? -nz * 18 : 16);
  K.add(MT.dark, () => box(along ? 7 : 16, 0.05, along ? 16 : 7, rx, CURB + 0.02, rz));
  for (const s of [-1, 1]) K.add(MT.conc, () => box(along ? 0.3 : 16, 1.1, along ? 16 : 0.3, rx + (along ? s * 3.6 : 0), CURB, rz + (along ? 0 : s * 3.6)));
  K.add(() => flatMat(0x7aa0a8, { roughness: 0.2, metalness: 0.4, key: 'rampglass' }), () => box(along ? 8 : 16, 0.15, along ? 16 : 8, rx, CURB + 3.2, rz));
  K.add(MT.steel, ...[-1, 1].flatMap((s) => [-6, 6].map((o) => () => cyl(0.08, 0.08, 3.2, rx + (along ? s * 3.8 : o), CURB, rz + (along ? o : s * 3.8), 6))));
  K.done(8);
  return [rx - 8, rz - 8, rx + 8, rz + 8];
}
// older slab: balcony bands on the south face, stair-core entrances on the north face
export function slabDetails(spec, rnd, x0, z0, x1, z1, h, accent) {
  const K = new Kit(spec, (x0 + x1) / 2, (z0 + z1) / 2), w = x1 - x0;
  for (let y = CURB + 3.2; y < CURB + h - 1; y += 2.8) K.add(MT.white, () => box(w, 0.18, 1.1, (x0 + x1) / 2, y, z1 + 0.55), () => box(w, 0.9, 0.06, (x0 + x1) / 2, y + 0.18, z1 + 1.07));
  for (let x = x0 + 8; x < x1 - 4; x += 16) { K.add(() => flatMat(accent, { key: 'acc' + accent }), () => box(3.6, 0.3, 2.4, x, CURB + 2.8, z0 - 1.2)); K.add(MT.glassLobby, () => box(3, 2.6, 0.08, x, CURB, z0 - 0.05)); }
  K.done(h);
}
// surface parking between slab rows (lines + parked cars)
export function parkingRow(spec, rnd, x0, z, x1) {
  const K = new Kit(spec, (x0 + x1) / 2, z), cols = [0xeeece6, 0x2a2c2e, 0x8a8e92, 0x6a7a8a, 0x8a2a2a, 0x1d3f6a];
  for (let x = x0; x + 2.5 <= x1; x += 2.6) { K.add(MT.line, () => box(0.12, 0.02, 5, x, CURB + 0.05, z)); if (rnd() < 0.7) { const c = cols[Math.floor(rnd() * cols.length)]; K.add(() => flatMat(c, { roughness: 0.35, metalness: 0.4, key: 'rxcar' + c }), () => box(1.8, 0.75, 4.4, x + 1.3, CURB + 0.3, z), () => box(1.6, 0.6, 2.3, x + 1.3, CURB + 1.05, z + 0.2)); } }
  K.done(2);
}

// ------------------------------------------------------------------ offices and hotels
const CORP = ['한누리생명', '세진건설', 'NOVA', '동명그룹', 'ARCHE', '새빛증권', '태광물산', 'KORION', '대한해운', 'LUMEN', '미래로', '청운전자'];
const HOTEL = ['HOTEL ARIA', '그랜드 한강', 'THE SEOUL', 'HOTEL RIVE', '라온 호텔', 'NOBLE STAY'];
// lobby on the street face of a podium (x, z centre, w x d), crown name on the tower (tower w, H top)
export function officeDetails(spec, rnd, x, z, w, d, podH, face, tw, H, hotel = false) {
  const K = new Kit(spec, x, z), [nx, nz] = N[face], along = !nx, len = along ? w : d;
  const fx = x + nx * (w / 2 + 0.08), fz = z + nz * (d / 2 + 0.08);
  K.add(MT.glassLobby, () => box(along ? len * 0.55 : 0.12, Math.min(podH - 0.5, 7), along ? 0.12 : len * 0.55, fx, CURB, fz));
  for (let k = -3; k <= 3; k++) K.add(MT.metal, () => box(along ? 0.12 : 0.16, Math.min(podH - 0.5, 7), along ? 0.16 : 0.12, fx + (along ? k * len * 0.55 / 6 : 0), CURB, fz + (along ? 0 : k * len * 0.55 / 6)));
  // revolving door: a glass drum with a canopy disc
  const rx = fx + nx * 1.4, rz = fz + nz * 1.4;
  K.add(MT.glassLobby, () => cyl(1.4, 1.4, 2.6, rx, CURB, rz, 16)); K.add(MT.steel, () => cyl(1.55, 1.55, 0.25, rx, CURB + 2.6, rz, 16));
  if (hotel) {   // porte-cochère over the drop-off: a big slab on columns reaching over the kerb lane
    K.add(MT.white, () => box(along ? 18 : 12, 0.8, along ? 12 : 18, fx + nx * 6, CURB + 5.2, fz + nz * 6));
    for (const s of [-1, 1]) K.add(MT.steel, () => cyl(0.35, 0.35, 5.2, fx + nx * 10.5 + (along ? s * 7.5 : 0), CURB, fz + nz * 10.5 + (along ? 0 : s * 7.5), 12));
    K.add(MT.asph, () => box(along ? 24 : 12, 0.03, along ? 12 : 24, fx + nx * 6.5, CURB + 0.01, fz + nz * 6.5));
  } else K.add(MT.steel, () => box(along ? 10 : 3.5, 0.3, along ? 3.5 : 10, fx + nx * 1.75, CURB + 4.6, fz + nz * 1.75));
  // the name: on the crown (offices), down the tower and on the canopy (hotels)
  const name = hotel ? HOTEL[Math.floor(rnd() * HOTEL.length)] : CORP[Math.floor(rnd() * CORP.length)];
  const cw = Math.min(tw * 0.7, 18), tfx = x + nx * (tw / 2 * 0.8 + 0.3), tfz = z + nz * (tw / 2 * 0.8 + 0.3);
  K.addUV(nameMat(name, hotel ? '#2a2420' : '#14181c', hotel ? '#e8c890' : '#f4f2ea'), () => quad(cw, cw * 0.25, tfx, CURB + H - cw * 0.2, tfz, nx, nz));
  if (hotel) { K.addUV(nameMat(name, '#2a2420', '#e8c890'), () => quad(along ? 10 : 10, 1.2, fx + nx * 12.1, CURB + 5.6, fz + nz * 12.1, nx, nz));
    K.add(MT.warm, () => box(tw * 0.55, 4.2, tw * 0.45, x, CURB + H, z)); K.add(MT.steel, () => box(tw * 0.6, 0.4, tw * 0.5, x, CURB + H + 4.2, z)); }
  K.done(H);
}

// ------------------------------------------------------------------ public / culture / logistics blocks
// H: { put, flat, lawn, pave, tree, occl, rnd, pick, spec }
export const CIVIC = ['gu', 'police', 'fire', 'post', 'library', 'hall', 'museum', 'logistics'];
export function civic(kind, r, H) {
  const { put, pave, lawn, rnd, spec } = H, W = r.x1 - r.x0, D = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, K = new Kit(spec, cx, cz);
  const wm = (kind2, c) => () => wallMat(kind2, c), trees = (n, x0, z0, x1, z1) => { for (let i = 0; i < n; i++) H.tree(x0 + rnd() * (x1 - x0), z0 + rnd() * (z1 - z0), 0.8 + rnd() * 0.5); };
  const sign = (text, bg, fg, x, y, z, nx, nz, w = 8) => K.addUV(nameMat(text, bg, fg), () => quad(w, w * 0.18, x, y, z, nx, nz));
  const flag = (x, z) => { K.add(MT.steel, () => cyl(0.07, 0.09, 11, x, CURB, z, 6)); K.add(MT.white, () => box(0.02, 1.2, 1.8, x, CURB + 9.4, z + 0.9)); };
  switch (kind) {
    case 'gu': {   // 구청: a wide 6-storey block behind a civic plaza, flagpoles, a car park at the back
      pave(r.x0, r.z0, r.x1, r.z1, 0xd8d4ca); const bw = Math.min(W - 20, 90), bz = r.z0 + 30;
      put(cx, bz, bw, 24, 24, wm('render', 0xd8d4cc), 0xd8d4cc); put(cx, bz + 16, 20, 10, 8, wm('panel', 0xb8bcc0), 0xb8bcc0);
      K.add(MT.glassDark, () => box(bw - 6, 18, 0.1, cx, CURB + 4, bz + 12.06)); K.add(MT.white, () => box(30, 0.6, 6, cx, CURB + 5, bz + 15));
      sign('중앙구청', '#ffffff', '#1a3a6a', cx, CURB + 21.5, bz + 12.12, 0, 1, 14);
      for (let k = -2; k <= 2; k++) flag(cx + k * 3, bz + 30);
      lawn(cx - 30, bz + 36, cx - 6, Math.min(r.z1 - 6, bz + 60)); lawn(cx + 6, bz + 36, cx + 30, Math.min(r.z1 - 6, bz + 60));
      trees(10, r.x0 + 4, r.z1 - 16, r.x1 - 4, r.z1 - 4); break;
    }
    case 'police': {   // 경찰서: white and blue, the badge sign, patrol cars in front
      pave(r.x0, r.z0, r.x1, r.z1, 0xc8c6c0); const bz = r.z0 + 18;
      put(cx, bz, Math.min(W - 16, 50), 18, 16, wm('render', 0xeeece6), 0xeeece6); K.add(MT.blue, () => box(Math.min(W - 16, 50) + 0.2, 1.2, 18.2, cx, CURB + 12, bz));
      sign('경찰서  POLICE', '#1a3a7a', '#ffffff', cx, CURB + 9, bz + 9.1, 0, 1, 12);
      for (let k = 0; k < 4; k++) { const px = cx - 9 + k * 6; K.add(MT.white, () => box(1.85, 1.0, 4.6, px, CURB + 0.3, bz + 17)); K.add(MT.navy, () => box(1.87, 0.25, 4.62, px, CURB + 0.75, bz + 17)); K.add(MT.red, () => box(1.0, 0.18, 0.4, px, CURB + 1.75, bz + 16.8)); K.add(MT.dark, () => box(1.6, 0.6, 2.3, px, CURB + 1.15, bz + 17.2)); }
      flag(cx + 28, bz + 12); trees(6, r.x0 + 4, r.z1 - 14, r.x1 - 4, r.z1 - 4); break;
    }
    case 'fire': {   // 소방서: red bay doors, a hose-drying / training tower, engines on the apron
      pave(r.x0, r.z0, r.x1, r.z1, 0xb8b6b0); const bz = r.z0 + 16, bw = Math.min(W - 24, 44);
      put(cx, bz, bw, 16, 11, wm('render', 0xe0dcd4), 0xe0dcd4);
      for (let k = 0; k < 4; k++) K.add(MT.red, () => box(bw / 4 - 1.4, 4.6, 0.12, cx - bw / 2 + (k + 0.5) * bw / 4, CURB, bz + 8.06));
      sign('119 소방서', '#c8241c', '#ffffff', cx, CURB + 8.4, bz + 8.14, 0, 1, 12);
      put(cx + bw / 2 + 5, bz - 2, 5, 5, 22, wm('render', 0xc8241c), 0xc8241c);
      for (let k = 0; k < 2; k++) { const px = cx - bw / 2 + (k + 0.5) * bw / 4; K.add(MT.red, () => box(2.4, 2.8, 8, px, CURB + 0.4, bz + 14)); K.add(MT.white, () => box(2.42, 0.3, 8.02, px, CURB + 1.6, bz + 14)); K.add(MT.dark, () => box(2.3, 1.0, 2.2, px, CURB + 2.0, bz + 10.6)); }
      trees(5, r.x0 + 4, r.z1 - 12, r.x1 - 4, r.z1 - 4); break;
    }
    case 'post': {   // 우체국: a red-orange band, the post sign, a red post box, mail vans
      pave(r.x0, r.z0, r.x1, r.z1, 0xc8c6c0); const bz = r.z0 + 16;
      put(cx, bz, Math.min(W - 20, 40), 16, 10, wm('render', 0xe8e4dc), 0xe8e4dc); K.add(MT.orange, () => box(Math.min(W - 20, 40) + 0.2, 1.4, 16.2, cx, CURB + 7.6, bz));
      sign('우체국 POST', '#e8601a', '#ffffff', cx, CURB + 5.2, bz + 8.1, 0, 1, 9); K.add(MT.red, () => box(0.7, 1.3, 0.6, cx + 8, CURB, bz + 10));
      for (let k = 0; k < 3; k++) { K.add(MT.white, () => box(2.0, 2.2, 4.8, cx - 12 + k * 3, CURB + 0.3, bz + 16)); K.add(MT.orange, () => box(2.02, 0.4, 4.82, cx - 12 + k * 3, CURB + 1.3, bz + 16)); }
      trees(6, r.x0 + 4, r.z1 - 14, r.x1 - 4, r.z1 - 4); break;
    }
    case 'library': {   // 도서관: a low building with long glazing and a timber louvre screen, a reading garden
      lawn(r.x0, r.z0, r.x1, r.z1); const bw = Math.min(W - 20, 70), bz = r.z0 + 22;
      put(cx, bz, bw, 26, 12, wm('render', 0xd8d0c0), 0xd8d0c0); K.add(MT.glassLobby, () => box(bw - 4, 8, 0.1, cx, CURB + 1, bz + 13.06));
      for (let k = 0; k < Math.floor(bw / 1.2); k++) K.add(MT.wood, () => box(0.18, 9, 0.4, cx - bw / 2 + 2 + k * 1.2, CURB + 1, bz + 13.4));   // 우드 루버
      sign('시립도서관', '#3a2a1e', '#f2e8d4', cx, CURB + 10.6, bz + 13.65, 0, 1, 10);
      pave(cx - 3, bz + 13, cx + 3, r.z1 - 4, 0xd8d0c0); trees(14, r.x0 + 6, bz + 18, r.x1 - 6, r.z1 - 6); break;
    }
    case 'hall': {   // 공연장: a curved shell roof over the auditorium, a glass foyer, a forecourt with a fountain
      pave(r.x0, r.z0, r.x1, r.z1, 0xe0dcd2); const R = Math.min(W, D) * 0.32, hz = cz - D * 0.08;
      spec(cx, hz, { geo: () => { const g = new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.45, 0.75); g.translate(cx, CURB + 10, hz); return g; }, mat: () => flatMat(0xdadcd8, { roughness: 0.3, metalness: 0.5, key: 'hallshell' }), box: [cx - R, hz - R * 0.75, cx + R, hz + R * 0.75, 10 + R * 0.45], color: 0xdadcd8 });
      put(cx, hz, R * 1.6, R * 1.2, 10, wm('panel', 0xc8ccd0), 0xc8ccd0);
      K.add(MT.glassLobby, () => box(R * 1.5, 9, 0.12, cx, CURB, hz + R * 0.6 + 0.1));
      sign('예술의 마당', '#20242a', '#e8dcc0', cx, CURB + 11.2, hz + R * 0.62, 0, 1, 12);
      K.add(MT.conc, () => cyl(6, 6.4, 0.6, cx, CURB, hz + R * 0.6 + 16, 24)); K.add(() => flatMat(0x3a8ab8, { roughness: 0.1, key: 'fountainw' }), () => cyl(5.6, 5.6, 0.62, cx, CURB, hz + R * 0.6 + 16, 24));
      trees(12, r.x0 + 4, r.z1 - 14, r.x1 - 4, r.z1 - 4); H.occl(cx - R, hz - R * 0.6, cx + R, hz + R * 0.6, 12); break;
    }
    case 'museum': {   // 미술관: stacked offset white boxes, a sculpture garden
      lawn(r.x0, r.z0, r.x1, r.z1); const bz = cz - 6;
      put(cx - 6, bz, Math.min(W - 30, 50), 30, 8, wm('render', 0xf2f0ea), 0xf2f0ea); put(cx + 8, bz + 4, Math.min(W - 40, 36), 22, 16, wm('render', 0xe8e6e0), 0xe8e6e0);
      K.add(MT.glassDark, () => box(18, 5, 0.1, cx - 6, CURB + 1, bz + 15.06)); sign('시립미술관', '#f2f0ea', '#2a2a2a', cx + 8, CURB + 13, bz + 15.08, 0, 1, 9);
      for (let k = 0; k < 4; k++) K.add(k % 2 ? MT.red : MT.steel, () => box(1.2, 3 + k, 1.2, r.x0 + 12 + k * 9, CURB, r.z1 - 12));
      trees(10, r.x0 + 4, r.z1 - 20, r.x1 - 4, r.z1 - 4); break;
    }
    case 'logistics': default: {   // 물류센터: a big flat shed with a row of dock doors, trucks backed up, a container yard
      pave(r.x0, r.z0, r.x1, r.z1, 0x9a9894); const bw = Math.min(W - 16, 130), bd = Math.min(D - 40, 60), bz = r.z0 + 8 + bd / 2;
      put(cx, bz, bw, bd, 14, wm('panel', 0xc8ccce), 0xc8ccce, () => flatMat(0x8a949a, { metalness: 0.4, key: 'indroof' }));
      for (let x = cx - bw / 2 + 4; x < cx + bw / 2 - 3; x += 5) { K.add(MT.steel, () => box(3.4, 3.8, 0.1, x, CURB + 1.2, bz + bd / 2 + 0.06)); K.add(MT.dark, () => box(3.8, 1.2, 0.5, x, CURB, bz + bd / 2 + 0.25)); }
      K.add(MT.steel, () => box(bw, 0.25, 3, cx, CURB + 5.6, bz + bd / 2 + 1.5));
      sign('한강 물류센터', '#1a3a5a', '#ffffff', cx - bw / 4, CURB + 11, bz + bd / 2 + 0.08, 0, 1, 16);
      for (let x = cx - bw / 2 + 4, k = 0; x < cx + bw / 2 - 3; x += 10, k++) if (rnd() < 0.6) { const tz = bz + bd / 2 + 7; K.add(k % 2 ? MT.white : MT.steel, () => box(2.5, 3.6, 10, x, CURB + 0.6, tz)); K.add(MT.blue, () => box(2.4, 2.6, 2.4, x, CURB + 0.4, tz + 6.4)); K.add(MT.dark, () => box(2.3, 1.0, 9, x, CURB, tz)); }
      const cols = [0x8a3a2a, 0x2a5a8a, 0x3a6a4a, 0xa8a49a, 0xc87a2a];
      for (let i = 0; i < 12; i++) { const x = r.x0 + 10 + (i % 6) * 13, z = r.z1 - 12 - Math.floor(i / 6) * 3; if (x > r.x1 - 10) continue; const c = cols[i % cols.length]; for (let l = 0; l < 1 + (i % 3 ? 1 : 0); l++) K.add(() => wallMat('panel', c), () => box(12.2, 2.6, 2.44, x, CURB + l * 2.6, z)); }
      H.occl(cx - bw / 2, bz - bd / 2, cx + bw / 2, bz + bd / 2, 14); break;
    }
  }
  K.done(12);
}
