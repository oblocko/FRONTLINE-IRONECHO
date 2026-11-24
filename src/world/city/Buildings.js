// Korean building generators. Every generator takes a parcel and builds INSIDE its buildable area,
// facing the street the parcel fronts, with the base on the ground height, its collider equal to its
// mass, and its doors opening onto walkable ground. All return the registered plan item(s).
//
//   ctx = { game, scene, world, plan, batch, fac (FacadeSet), rnd, ground(x, z) }
//   parcel = { rect, front: [nx, nz], streets: { '1,0': 'arterial', … }, zone }
//
// Uses (per zone, see CityPlan.ZONES): shops / shopsTall / mixedShops / apartmentShops (근린상가),
// office / officeTall, bank, apartment (단지), villa (다세대), house (단독), school, hospital, park,
// warehouse, factory, logistics, gas, parking, plaza.
import * as THREE from 'three';
import { Rect, rotRect } from './CityPlan.js';
import { wallMat, flatMat, groundMat, paintMat } from './CityMaterials.js';
import { windowSlots, FACADE } from '../Facade.js';
import { SHOPS, TENANTS, interiorType, boxSign, channelSign, verticalSign, windowLettering, banner, boxTexture } from '../korea/Signs.js';
import { buildCar, carColor, carType, TYPES as CAR } from '../korea/Cars.js';
import { warehouse } from '../Industrial.js';
import { facadeTexture } from '../CityProps.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const key = (nx, nz) => `${nx},${nz}`;
// the centre of a rect's face with outward normal (nx, nz), and its length
export function edge(r, nx, nz) { return nx ? { cx: nx > 0 ? r.x1 : r.x0, cz: r.cz, len: r.d } : { cx: r.cx, cz: nz > 0 ? r.z1 : r.z0, len: r.w }; }
// a point on a face: `a` along the face (viewer's right), `o` out from the wall
export function onFace(e, nx, nz, a, o = 0) { const rot = Math.atan2(nx, nz); return [e.cx + Math.cos(rot) * a + nx * o, e.cz - Math.sin(rot) * a + nz * o]; }
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// shared materials
const M = {};
function mats() {
  if (M.alu) return M;
  M.alu = flatMat(0x8c9296, { roughness: 0.35, metalness: 0.7, key: 'alu' });
  M.darkAlu = flatMat(0x2c2f32, { roughness: 0.4, metalness: 0.6, key: 'dalu' });
  M.roofGreen = flatMat(0x4c6e58, { roughness: 0.7, key: 'roofg' });          // urethane-painted rooftops
  M.roofGrey = flatMat(0x7a7a76, { roughness: 0.9, key: 'roofgr' });
  M.conc = wallMat('concrete', 0x9c9a94);
  M.concDark = wallMat('concrete', 0x76746e);
  M.iron = flatMat(0x23272a, { roughness: 0.5, metalness: 0.6, key: 'iron' });
  M.green = flatMat(0x2f5a3c, { roughness: 0.6, metalness: 0.3, key: 'fenceGreen' });
  M.steel = flatMat(0x8a8e90, { roughness: 0.45, metalness: 0.7, key: 'steel' });
  M.white = flatMat(0xe8e6e0, { roughness: 0.6, key: 'white' });
  M.tank = flatMat(0x9ab0b8, { roughness: 0.5, metalness: 0.3, key: 'tank' });
  M.blueTank = flatMat(0x2a5a9a, { roughness: 0.5, metalness: 0.2, key: 'btank' });
  M.rubber = flatMat(0x1a1a1a, { roughness: 0.95, key: 'rubber' });
  M.wood = flatMat(0x7a5a3a, { roughness: 0.8, key: 'wood' });
  M.red = flatMat(0xb8261e, { roughness: 0.5, key: 'red' });
  M.yellow = flatMat(0xd8b020, { roughness: 0.6, key: 'yellow' });
  return M;
}

// ------------------------------------------------------------------ building pieces
// a solid mass with roof slab, parapet and collider
function mass(ctx, rect, y0, h, wall, { roof = mats().roofGreen, parapet = 1.0, collide = true, surface = 'concrete' } = {}) {
  const B = ctx.batch;
  B.box(wall, rect.w, h, rect.d, rect.cx, y0 + h / 2, rect.cz);
  B.box(roof, rect.w - 0.5, 0.06, rect.d - 0.5, rect.cx, y0 + h + 0.03, rect.cz);
  if (parapet > 0) for (const [nx, nz] of SIDES) { const e = edge(rect, nx, nz); const t = 0.25; B.box(wall, nx ? t : e.len, parapet, nx ? e.len : t, e.cx - nx * t / 2, y0 + h + parapet / 2, e.cz - nz * t / 2); }
  return collide ? ctx.world.addBox(V(rect.x0, y0, rect.z0), V(rect.x1, y0 + h, rect.z1), { surface, cover: true, walkable: false }) : null;
}
// rooftop clutter on a flat roof: stair head (door facing `front`), tank, AC units, mast
function rooftop(ctx, rect, top, front, { tank = true, units = 3 } = {}) {
  const B = ctx.batch, m = mats(), r = ctx.rnd; const [fx, fz] = front;
  const hw = Math.min(4, rect.w * 0.3), hd = Math.min(3.6, rect.d * 0.3);
  const hx = rect.cx + (r() - 0.5) * (rect.w - hw - 2), hz = rect.cz + (r() - 0.5) * (rect.d - hd - 2);
  B.box(m.conc, hw, 2.8, hd, hx, top + 1.4, hz); B.box(m.roofGrey, hw + 0.3, 0.15, hd + 0.3, hx, top + 2.87, hz);
  const [dx, dz] = [hx + fx * (hw / 2 + 0.03), hz + fz * (hd / 2 + 0.03)]; B.box(m.steel, fx ? 0.04 : 0.95, 2.05, fx ? 0.95 : 0.04, dx, top + 1.03, dz);
  if (tank && rect.area > 120) { const tx = rect.cx - (hx - rect.cx) * 0.8, tz = rect.cz - (hz - rect.cz) * 0.8; const g = new THREE.CylinderGeometry(1.1, 1.1, 2.2, 14).translate(tx, top + 2.0, tz); B.add(g, r() < 0.5 ? m.tank : m.blueTank); B.box(m.iron, 2.2, 0.9, 2.2, tx, top + 0.45, tz); }
  for (let i = 0; i < units; i++) { const ux = rect.x0 + 1.5 + r() * (rect.w - 3), uz = rect.z0 + 1.5 + r() * (rect.d - 3); if (Math.abs(ux - hx) < hw && Math.abs(uz - hz) < hd) continue; B.box(m.white, 0.9, 0.7, 0.4, ux, top + 0.35, uz); }
  if (r() < 0.4) B.add(new THREE.CylinderGeometry(0.04, 0.06, 5, 6).translate(hx + hw / 3, top + 5.3, hz), m.steel);
}
// one facade face with windows (and optional tenant lettering)
function windows(ctx, style, rect, nx, nz, { y0, floors, startFloor = 1, wall, frame = 0x8e9498, lit = 0.03, guard = 0.1, ac = 0.12, minY = -1, tenants = 0 }) {
  const e = edge(rect, nx, nz);
  const p = { cx: e.cx, cz: e.cz, nx, nz, len: e.len, floors, y0, startFloor, minY };
  ctx.fac.get(style).face({ ...p, wall, frame, lit, guard, ac });
  if (tenants > 0) {
    const slots = windowSlots(p, style); const S = FACADE[style]; const used = new Set();
    for (const s of slots) {
      if (s.f > 3 || ctx.rnd() > tenants || used.has(s.f)) continue; used.add(s.f);
      const [text, color] = TENANTS[Math.floor(ctx.rnd() * TENANTS.length)];
      const l = windowLettering(text, color, S.w - 0.1, S.h * 0.7); l.position.set(s.x + nx * 0.045, s.y, s.z + nz * 0.045); l.rotation.y = s.rot; ctx.scene.add(l); ctx.own(l);
    }
  }
}
// pick a shop of an allowed category, least used so far (no street of identical shops)
function pickShop(ctx, cats) {
  const pool = SHOPS.filter((s) => cats.includes(s[2])); ctx.shopUse ||= new Map();
  pool.sort((a, b) => (ctx.shopUse.get(a[0]) || 0) - (ctx.shopUse.get(b[0]) || 0) || ctx.rnd() - 0.5);
  const s = pool[0]; ctx.shopUse.set(s[0], (ctx.shopUse.get(s[0]) || 0) + 1); return s;
}

// Ground-floor shopfronts along one face. Units are split from the face; one narrow bay can be the
// building lobby (stairs to the upper floors). Every shop gets glass with its interior type, an aluminium
// frame, a door (registered as an entrance) and a sign in the building's sign style.
function shopfronts(ctx, item, rect, nx, nz, { y0, gfH = 4.2, cats, lobby = true, signStyle = 'box', vacant = 0.12, lit = 0.35, wall, from = 0, to = 1 }) {
  const m = mats(), B = ctx.batch, r = ctx.rnd, e = edge(rect, nx, nz), rot = Math.atan2(nx, nz);
  const a0 = -e.len / 2 + e.len * from + 0.6, a1 = -e.len / 2 + e.len * to - 0.6; const L = a1 - a0; if (L < 3) return;
  // split into units 4.5..8 m (+ lobby bay 2.4)
  const units = []; let a = a0; const lobbyAt = lobby ? (r() < 0.5 ? 'start' : 'end') : null;
  if (lobbyAt === 'start') { units.push({ a, w: 2.4, lobby: true }); a += 2.4; }
  const rest = a1 - a - (lobbyAt === 'end' ? 2.4 : 0); const n = Math.max(1, Math.round(rest / (5 + r() * 2.5))); const uw = rest / n;
  for (let i = 0; i < n; i++) { units.push({ a, w: uw }); a += uw; }
  if (lobbyAt === 'end') units.push({ a, w: 2.4, lobby: true });
  const P = (along, out) => onFace(e, nx, nz, along, out);
  const piece = (mat, along, y, w, h, out, d) => { const [x, z] = P(along, out + d / 2); B.box(mat, nx ? d : w, h, nx ? w : d, x, y, z); };
  // pilasters between units and at the ends, fascia band above
  for (const u of [...units, { a: a1 }]) piece(wall, u.a, y0 + gfH / 2, 0.42, gfH, 0, 0.1);
  piece(wall, (a0 + a1) / 2, y0 + gfH - 0.12, L + 0.42, 0.24, 0, 0.18);
  for (const u of units) {
    const c = u.a + u.w / 2, gw = u.w - 0.5, gy = y0 + 0.35, gh = gfH - 1.35;   // glass from the riser to the sign band
    const [gx, gz] = P(c, 0);
    // only where the frontage actually opens onto walkable ground (a street, sidewalk, plaza …)
    const [qx, qz] = P(c, 1.2), [qa, qb] = P(u.a + 0.4, 1.2), [qc, qd] = P(u.a + u.w - 0.4, 1.2);
    if (![[qx, qz], [qa, qb], [qc, qd]].every(([x, z]) => ctx.plan.walkable(x, z)) || ctx.plan.items.some((o) => o.kind === 'building' && o.rect.has(qx, qz))) { piece(wall, c, y0 + gfH / 2, u.w - 0.42, gfH - 0.3, 0, 0.04); continue; }
    if (u.lobby) {
      // building lobby: double glass door, tenant directory, address plate
      ctx.fac.get('commercial').shop(gx, gy + gh / 2, gz, rot, gw, gh, { type: 4, lit: 0.2 });
      piece(m.darkAlu, c, gy + gh / 2, 0.06, gh, 0.02, 0.06); for (const s of [-1, 1]) piece(m.darkAlu, c + s * gw / 2, gy + gh / 2, 0.08, gh, 0.02, 0.08);
      piece(m.darkAlu, c, gy + 2.2, gw, 0.08, 0.02, 0.08); piece(m.steel, c - 0.12, gy + 1.05, 0.03, 0.8, 0.07, 0.03); piece(m.steel, c + 0.12, gy + 1.05, 0.03, 0.8, 0.07, 0.03);
      const [px, pz] = P(c, 0.02); const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshStandardMaterial({ map: boxTexture(ctx.addr(), '', ['#1d4f9a', '#ffffff', '#ffffff'], 0.6, 0.22), roughness: 0.5 }));
      plate.position.set(px, gy + gh + 0.35, pz); plate.rotation.y = rot; ctx.scene.add(plate); ctx.own(plate);
      item.entrances.push({ x: gx, z: gz, nx, nz, lobby: true });
      continue;
    }
    const closed = r() < vacant; const shop = pickShop(ctx, cats); const [name, sub, cat, cols] = shop;
    const type = closed ? 7 : interiorType(cat);
    ctx.fac.get('commercial').shop(gx, gy + gh / 2, gz, rot, gw, gh, { type, lit: closed ? 0 : lit });
    // riser, frame: jambs, transom, mullions; a door on one side
    piece(m.conc, c, y0 + 0.175, u.w - 0.42, 0.35, 0, 0.08);
    for (const s of [-1, 1]) piece(m.alu, c + s * gw / 2, gy + gh / 2, 0.08, gh, 0.02, 0.08);
    piece(m.alu, c, gy + gh, gw, 0.08, 0.02, 0.08); piece(m.alu, c, gy + 2.3, gw, 0.06, 0.02, 0.07);
    const dw = u.w > 6 && r() < 0.4 ? 1.7 : 0.95, ds = r() < 0.5 ? -1 : 1, dc = c + ds * (gw / 2 - dw / 2 - 0.05);
    for (const s of [-1, 1]) piece(m.alu, dc + s * dw / 2, gy + 1.15, 0.07, 2.3, 0.02, 0.09);
    for (let k = 1; k < Math.floor((gw - dw) / 1.6) + 1; k++) piece(m.alu, c - ds * (gw / 2) + ds * k * (gw - dw) / (Math.floor((gw - dw) / 1.6) + 1), gy + gh / 2, 0.05, gh, 0.02, 0.06);
    piece(m.steel, dc - ds * dw * 0.32, gy + 1.0, 0.035, 0.9, 0.08, 0.035);              // pull handle
    if (dw > 1.2) piece(m.alu, dc, gy + 1.15, 0.05, 2.3, 0.02, 0.06);
    piece(m.conc, dc, y0 + 0.02, dw + 0.2, 0.04, 0, 0.5);                                  // threshold
    const [dx, dz] = P(dc, 0); item.entrances.push({ x: dx, z: dz, nx, nz });
    // sign
    const sw = u.w - 0.5, sy = y0 + gfH - 0.62;
    if (closed && r() < 0.6) { const b = banner('임대 문의', '010-0000-0000 · 상가 임대', Math.min(4, sw), 0.8); const [bx, bz] = P(c, 0.02); b.position.set(bx, sy, bz); b.rotation.y = rot; ctx.scene.add(b); ctx.own(b); continue; }
    const style = signStyle === 'mixed' ? (r() < 0.5 ? 'box' : 'channel') : signStyle;
    let s;
    if (style === 'channel') { s = channelSign(name, cols[0] === '#ffffff' || cols[0] === '#f2ede2' || cols[0] === '#f5ecd8' ? cols[1] : cols[0], 0.62, { outline: '#ffffff', raceway: '#2a2a2a' }); if (s.userData.width > sw) s.scale.setScalar(sw / s.userData.width); }
    else s = boxSign(name, sub, cols, sw, 0.95, { style: ['plain', 'split', 'logo', 'border'][Math.floor(r() * 4)], lit: lit > 0.5 });
    const [sx, sz] = P(c, 0.18); s.position.set(sx, sy, sz); s.rotation.y = rot; ctx.scene.add(s); ctx.own(s);
    // fabric awning on some cafes / restaurants / bakeries
    if ((cat === 'cafe' || cat === 'restaurant') && r() < 0.45) {
      const am = flatMat(new THREE.Color(cols[2]).getHex(), { roughness: 0.9, key: 'awn' }); const [ax, az] = P(c, 0.65);
      const g = new THREE.BoxGeometry(sw, 0.05, 1.3); g.rotateX(0.32); g.rotateY(rot); g.translate(ax, gy + gh + 0.05, az); B.add(g, am);
    }
  }
}

// ------------------------------------------------------------------ generators
let N = 0;
const id = (use) => `${use}-${++N}`;
function reg(ctx, o) { return ctx.plan.add({ kind: 'building', ...o }); }

// 상가 빌딩: shops on the ground floor, offices / clinics / academies above; built to the street line.
// opts: floors, wall: { kind, color }, signStyle, cats (shop categories), sides: faces that get windows / shops
export function commercial(ctx, parcel, o = {}) {
  const m = mats(), r = ctx.rnd, rect = parcel.rect, y0 = ctx.ground(rect.cx, rect.cz);
  const floors = o.floors ?? 5, gfH = 4.2, upH = FACADE.commercial.floorH, h = gfH + (floors - 1) * upH;
  const W = o.wall ?? { kind: ['tile', 'stone', 'panel', 'render'][Math.floor(r() * 4)], color: [0xd8d2c2, 0xb8b4aa, 0xc9c0ae, 0x9aa0a4, 0xe0dcd0][Math.floor(r() * 5)] };
  const wall = wallMat(W.kind, W.color);
  const it = reg(ctx, { id: id(o.use ?? 'shops'), use: o.use ?? 'shops', zone: parcel.zone, rect, y0, h, entrances: [] });
  ctx.ownBegin(it);
  it.colliders.push(mass(ctx, rect, y0, h, wall));
  const cats = o.cats ?? ['store', 'cafe', 'restaurant', 'pharmacy', 'office', 'phone', 'optician', 'salon', 'clinic'];
  for (const [nx, nz] of SIDES) {
    const st = parcel.streets[key(nx, nz)], front = nx === parcel.front[0] && nz === parcel.front[1];
    // a side against a neighbouring building (within 2 m) is a blank party wall
    const e = edge(rect, nx, nz), strip = nx ? new Rect(e.cx, e.cz - e.len / 2 + 0.5, e.cx + nx * 2, e.cz + e.len / 2 - 0.5) : new Rect(e.cx - e.len / 2 + 0.5, e.cz, e.cx + e.len / 2 - 0.5, e.cz + nz * 2);
    if (!st && ctx.plan.items.some((q) => q !== it && q.kind === 'building' && q.rect.hits(strip))) continue;
    if (st && ['sidewalk', 'plaza', 'alley', 'local', 'arterial', 'path'].includes(st)) shopfronts(ctx, it, rect, nx, nz, { y0, gfH, cats, lobby: front && floors > 2, signStyle: o.signStyle ?? 'mixed', wall, vacant: o.vacant ?? 0.12, lit: o.lit ?? 0.35 });
    windows(ctx, o.upper ?? 'commercial', rect, nx, nz, { y0: y0 + gfH - (o.upper === 'villa' ? FACADE.villa.floorH : upH), floors, startFloor: 1, wall: W.color, frame: [0x8e9498, 0x3a3e42, 0x6a5a48][Math.floor(r() * 3)], tenants: front && o.upper !== 'villa' ? 0.45 : 0, guard: o.upper === 'villa' ? 0.4 : 0.05 });
  }
  // a vertical projecting sign at the front corner for the upper tenants
  if (floors >= 4 && o.upper !== 'villa' && r() < 0.7) {
    const e = edge(rect, ...parcel.front); const [text, color] = TENANTS[Math.floor(r() * TENANTS.length)];
    const vs = verticalSign(text, color, '#ffffff', 0.6, Math.min(3.2, (floors - 1) * upH * 0.6)); const [vx, vz] = onFace(e, ...parcel.front, (r() < 0.5 ? -1 : 1) * (e.len / 2 - 0.5), 0);
    vs.position.set(vx, y0 + gfH + 2.2, vz); vs.rotation.y = Math.atan2(...parcel.front) + Math.PI / 2 * (r() < 0.5 ? 1 : -1) * 0; ctx.scene.add(vs); ctx.own(vs);
  }
  rooftop(ctx, rect, y0 + h, parcel.front);
  ctx.ownEnd(); return it;
}

// 오피스 타워: set back behind a plaza, glass curtain wall on all sides, lobby on the street side, name on top
export function officeTower(ctx, parcel, o = {}) {
  const m = mats(), r = ctx.rnd, [fx, fz] = parcel.front; const P = parcel.rect;
  const set = o.setback ?? 6; const rect = new Rect(P.x0 + (fx < 0 ? set : 1.5), P.z0 + (fz < 0 ? set : 1.5), P.x1 - (fx > 0 ? set : 1.5), P.z1 - (fz > 0 ? set : 1.5));
  const y0 = ctx.ground(rect.cx, rect.cz), floors = o.floors ?? 16, S = FACADE.office, podH = 5.2, h = podH + (floors - 1) * S.floorH;
  const it = reg(ctx, { id: id(o.use ?? 'office'), use: o.use ?? 'office', zone: parcel.zone, rect, y0, h, entrances: [] });
  ctx.ownBegin(it);
  const spandrel = flatMat(o.tint ?? 0x2a3a44, { roughness: 0.3, metalness: 0.6, key: 'spandrel' });
  it.colliders.push(mass(ctx, rect, y0, h, spandrel, { roof: m.roofGrey, parapet: 1.6 }));
  // plaza in the setback (paved, walkable), planters + bollards along the sidewalk
  const pz = new Rect(fx ? (fx > 0 ? rect.x1 : P.x0) : P.x0, fz ? (fz > 0 ? rect.z1 : P.z0) : P.z0, fx ? (fx > 0 ? P.x1 : rect.x0) : P.x1, fz ? (fz > 0 ? P.z1 : rect.z0) : P.z1);
  ctx.plan.walk(pz, 'plaza'); ctx.batch.box(groundMat('plaza'), pz.w, 0.04, pz.d, pz.cx, y0 + 0.02, pz.cz, 0, { cast: false });
  for (let k = 0; k < 3; k++) {
    const e = edge(pz, fx, fz); const [x, z] = onFace(e, fx, fz, (k - 1) * e.len * 0.33, -1.0);
    const pr = rotRect(x, z, fx ? 1.2 : 3, fx ? 3 : 1.2, 0); if (Math.abs((k - 1) * e.len * 0.33) < 3) continue;
    ctx.batch.box(m.concDark, pr.w, 0.6, pr.d, x, y0 + 0.3, z); ctx.batch.box(groundMat('lawn'), pr.w - 0.2, 0.02, pr.d - 0.2, x, y0 + 0.61, z);
    ctx.plan.add({ kind: 'prop', id: id('planter'), rect: pr, y0, h: 0.6, colliders: [ctx.world.addBox(V(pr.x0, y0, pr.z0), V(pr.x1, y0 + 0.6, pr.z1), { surface: 'concrete', cover: true })] });
  }
  // curtain wall all round, lobby glass on the front (two storeys), entrance in the middle
  for (const [nx, nz] of SIDES) {
    const e = edge(rect, nx, nz); ctx.fac.get('office').face({ cx: e.cx, cz: e.cz, nx, nz, len: e.len, floors, y0: y0 + podH - S.floorH, startFloor: 1, wall: o.tint ?? 0x2a3a44, frame: 0x9aa4ac, lit: 0.15 });
    const rot = Math.atan2(nx, nz); const [gx, gz] = onFace(e, nx, nz, 0, 0);
    ctx.fac.get('commercial').shop(gx, y0 + podH / 2, gz, rot, e.len - 2, podH - 0.6, { type: 4, lit: 0.5 });
    for (let a = -e.len / 2 + 1; a <= e.len / 2 - 1 + 0.01; a += (e.len - 2) / Math.round((e.len - 2) / 3)) { const [x, z] = onFace(e, nx, nz, a, 0.05); ctx.batch.box(m.darkAlu, nx ? 0.1 : 0.1, podH - 0.6, nx ? 0.1 : 0.1, x, y0 + podH / 2, z); }
    if (nx === fx && nz === fz) {
      const [cx, cz] = onFace(e, nx, nz, 0, 1.2); ctx.batch.box(m.steel, nx ? 2.4 : 6, 0.3, nx ? 6 : 2.4, cx, y0 + podH - 0.4, cz);   // canopy
      it.entrances.push({ x: gx, z: gz, nx, nz });
      if (o.name) { const s = channelSign(o.name, '#f2f2f2', 2.2, { raceway: '#1a1a1a' }); const [sx, sz] = onFace(e, nx, nz, 0, 0.05); s.position.set(sx, y0 + h - 2, sz); s.rotation.y = rot; if (s.userData.width > e.len - 2) s.scale.setScalar((e.len - 2) / s.userData.width); ctx.scene.add(s); ctx.own(s); }
    }
  }
  // crown + roof plant
  ctx.batch.box(m.darkAlu, rect.w - 3, 3, rect.d - 3, rect.cx, y0 + h + 1.5, rect.cz);
  ctx.ownEnd(); return it;
}

// 은행 / 소형 업무: stone, a bank hall with ATM corner
export function bank(ctx, parcel, o = {}) {
  return commercial(ctx, parcel, { ...o, use: o.use ?? 'bank', floors: o.floors ?? 4, wall: { kind: 'stone', color: 0xbab4a6 }, cats: ['office'], signStyle: 'box', vacant: 0, lit: 0.6 });
}

// 아파트 단지: slabs with the balcony face to the south (+z), gable end to the street with the block number,
// entrances on the north side onto a path, inner drive + parking, playground, perimeter fence with gates.
export function apartmentComplex(ctx, site, o = {}) {
  const m = mats(), r = ctx.rnd, R = site.rect, y0 = ctx.ground(R.cx, R.cz);
  const siteItem = ctx.plan.add({ kind: 'site', id: id('complex'), use: 'apartment', zone: site.zone, rect: R, y0, h: 0 });
  // perimeter: low wall + railing, hedge, gates (openings) where the site meets a street
  const gates = fence(ctx, R, site.streets, { gates: o.gates ?? 2, style: 'rail' });
  // inner drive loop 6 m wide just inside the fence on the street-facing sides, parking bays along it
  const inner = R.inset(3);
  const rows = []; const slabD = 12, perRow = inner.w > 62 ? 2 : 1, slabL = Math.min(o.slabLength ?? 46, (inner.w - 22 - (perRow - 1) * 12) / perRow);
  const floors = o.floors ?? 18, H = 3 + (floors - 1) * 2.8;
  const gap = Math.max(26, Math.min(H * 0.8, (inner.d - 2 * slabD) - 8));
  let z = inner.z0 + 10;
  while (z + slabD <= inner.z1 - 8) { rows.push(z); z += slabD + gap; }
  const streetX = site.streets[key(1, 0)] ? 1 : site.streets[key(-1, 0)] ? -1 : 1;   // which side the gable faces
  let dong = o.firstDong ?? 101;
  for (const z0 of rows) for (let k = 0; k < perRow; k++) {
    const x0 = streetX > 0 ? inner.x1 - 12 - slabL - k * (slabL + 12) : inner.x0 + 12 + k * (slabL + 12);
    const rect = new Rect(x0, z0 + k * 3, x0 + slabL, z0 + k * 3 + slabD);
    if (!ctx.plan.free(rect)) continue;
    const it = reg(ctx, { id: `apt-${dong}`, use: 'apartment', zone: site.zone, rect, y0, h: H, entrances: [] }); ctx.ownBegin(it);
    const wcol = [0xe8e4da, 0xdcd6c8, 0xe2e0d8][Math.floor(r() * 3)];
    const wall = wallMat('render', wcol);
    it.colliders.push(mass(ctx, rect, y0, H, wall, { parapet: 1.2 }));
    windows(ctx, 'apt', rect, 0, 1, { y0: y0 + 3 - 2.8, floors, startFloor: 1, wall: wcol, frame: 0xc8c8c0, lit: 0.04, guard: 1, ac: 0 });
    windows(ctx, 'aptN', rect, 0, -1, { y0: y0 + 3 - 2.8, floors, startFloor: 1, wall: wcol, frame: 0x9aa0a4, lit: 0.02, guard: 0, ac: 0.05 });
    // gable ends: accent stripe, block number, complex name
    const accent = flatMat(o.accent ?? 0x3a6a9a, { roughness: 0.7, key: 'aptAccent' });
    for (const nx of [-1, 1]) {
      const e = edge(rect, nx, 0); const [ax, az] = onFace(e, nx, 0, -e.len / 2 + 1.5, 0.03); ctx.batch.box(accent, 0.06, H - 4, 2.2, ax, y0 + H / 2 + 1, az);
      if (nx === streetX && k === 0) {
        const num = channelSign(`${dong}동`, '#1d3f6a', 3.2, { raceway: null }); const [nx2, nz2] = onFace(e, nx, 0, 1.5, 0.02); num.position.set(nx2, y0 + H - 4, nz2); num.rotation.y = Math.atan2(nx, 0); ctx.scene.add(num); ctx.own(num);
        const nm = channelSign(o.name ?? '한빛마을', '#3a6a9a', 1.3, { raceway: null }); nm.position.set(nx2, y0 + H - 7.2, nz2); nm.rotation.y = Math.atan2(nx, 0); ctx.scene.add(nm); ctx.own(nm);
      }
    }
    // entrances (stair / lift cores) on the north side, with canopies and a path in front
    const path = new Rect(rect.x0, rect.z0 - 4, rect.x1, rect.z0); ctx.plan.walk(path, 'path'); ctx.batch.box(groundMat('pavers'), path.w, 0.03, path.d, path.cx, y0 + 0.015, path.cz, 0, { cast: false });
    for (let a = rect.x0 + 6.8; a < rect.x1 - 3; a += 13.6) {
      ctx.fac.get('commercial').shop(a, y0 + 1.4, rect.z0, Math.PI, 2.2, 2.4, { type: 4, lit: 0.3 });
      ctx.batch.box(m.darkAlu, 2.5, 0.1, 0.1, a, y0 + 2.65, rect.z0 - 0.05); ctx.batch.box(m.steel, 3.2, 0.15, 1.6, a, y0 + 3.1, rect.z0 - 0.8);
      it.entrances.push({ x: a, z: rect.z0, nx: 0, nz: -1 });
    }
    // lift machine rooms on the roof
    for (let a = rect.x0 + 6.8; a < rect.x1 - 3; a += 13.6) ctx.batch.box(wall, 4, 3, 5, a, y0 + H + 1.5, rect.cz);
    ctx.ownEnd(); dong++;
  }
  // parking bays along the north path side of each row + a playground between rows
  for (const z0 of rows) {
    const pr = new Rect(inner.x0 + 8, z0 - 12, inner.x1 - 8, z0 - 6.5);
    const free = ctx.plan.free(pr, { kinds: ['building', 'structure'] }); if (!free) continue;
    ctx.plan.park(pr); paintedLot(ctx, pr, y0, { stall: 2.5, along: 'x' });
    const drive = new Rect(pr.x0, pr.z0 - 6, pr.x1, pr.z0); if (ctx.plan.free(drive, { kinds: ['building', 'structure'] })) { ctx.plan.road(drive, 'drive', 'x'); ctx.batch.box(groundMat('asphalt'), drive.w, 0.03, drive.d, drive.cx, y0 + 0.015, drive.cz, 0, { cast: false }); }
    fillStalls(ctx, pr, y0, { along: 'x', fill: 0.55 });
  }
  if (rows.length > 1) { const pg = Rect.c(inner.cx - (streetX > 0 ? 8 : -8), (rows[0] + rows[1] + slabD) / 2 + 2, 14, 10); playground(ctx, pg, y0, site.zone); }
  // trees on the lawn between rows
  const trees = []; for (const z0 of rows) for (let x = inner.x0 + 4; x < inner.x1 - 4; x += 7 + r() * 3) trees.push([x, z0 + slabD + 5 + r() * 3]);
  ctx.trees(trees, { zone: site.zone });
  ctx.batch.box(groundMat('lawn'), inner.w, 0.02, inner.d, inner.cx, y0 + 0.01, inner.cz, 0, { cast: false });
  siteItem.entrances = gates;
  return siteItem;
}

// perimeter fence of a site. style 'rail' (low wall + iron railing), 'wall' (masonry 1.8 m), 'mesh' (industrial mesh)
// gates: number of openings on street sides; returns gate entrances
export function fence(ctx, R, streets, { gates = 1, style = 'rail', gateWidth = 6, only = null } = {}) {
  const m = mats(), y0 = ctx.ground(R.cx, R.cz), out = [];
  const H = style === 'wall' ? 2.0 : style === 'mesh' ? 2.2 : 1.4;
  const wallM = style === 'wall' ? wallMat('brick', 0x8a4a3a) : m.conc;
  let gLeft = gates;
  const sides = SIDES.filter(([nx, nz]) => !only || only.includes(key(nx, nz))).sort((a, b) => (streets[key(...b)] ? 1 : 0) - (streets[key(...a)] ? 1 : 0));
  for (const [nx, nz] of sides) {
    const e = edge(R, nx, nz), st = streets[key(nx, nz)];
    const g = st && gLeft-- > 0 ? (gLeft === gates - 1 ? 0 : (ctx.rnd() - 0.5) * e.len * 0.4) : null;
    const segs = g === null ? [[-e.len / 2, e.len / 2]] : [[-e.len / 2, g - gateWidth / 2], [g + gateWidth / 2, e.len / 2]];
    for (const [a0, a1] of segs) {
      if (a1 - a0 < 0.3) continue; const [x, z] = onFace(e, nx, nz, (a0 + a1) / 2, -0.15); const L = a1 - a0;
      const cr = nx ? new Rect(x - 0.15, z - L / 2, x + 0.15, z + L / 2) : new Rect(x - L / 2, z - 0.15, x + L / 2, z + 0.15);
      if (style === 'rail') {
        ctx.batch.box(wallM, cr.w, 0.6, cr.d, x, y0 + 0.3, z);
        ctx.batch.box(m.iron, nx ? 0.05 : L, 0.05, nx ? L : 0.05, x, y0 + 1.38, z);
        for (let a = a0 + 0.1; a < a1; a += 0.15) { const [px, pz] = onFace(e, nx, nz, a, -0.15); ctx.batch.box(m.iron, 0.025, 0.8, 0.025, px, y0 + 1.0, pz); }
      } else if (style === 'wall') { ctx.batch.box(wallM, cr.w, H, cr.d, x, y0 + H / 2, z); ctx.batch.box(m.concDark, cr.w + 0.1, 0.1, cr.d + 0.1, x, y0 + H + 0.05, z); }
      else { ctx.batch.box(m.conc, cr.w, 0.3, cr.d, x, y0 + 0.15, z); ctx.batch.add(new THREE.PlaneGeometry(L, H - 0.3).rotateY(Math.atan2(nx, nz)).translate(x, y0 + 0.3 + (H - 0.3) / 2, z), ctx.meshMat()); for (let a = a0; a <= a1; a += 2.5) { const [px, pz] = onFace(e, nx, nz, a, -0.15); ctx.batch.box(m.green, 0.06, H, 0.06, px, y0 + H / 2, pz); } }
      ctx.plan.add({ kind: 'structure', id: id('fence'), rect: cr, y0, h: H, tags: ['attached'], group: 'fence', colliders: [ctx.world.addBox(V(cr.x0, y0, cr.z0), V(cr.x1, y0 + H, cr.z1), { surface: style === 'mesh' ? 'metal' : 'concrete', cover: style !== 'mesh', walkable: false })] });
    }
    if (g !== null) { const [gx, gz] = onFace(e, nx, nz, g, 0); out.push({ x: gx, z: gz, nx, nz, gate: true });
      for (const s of [-1, 1]) { const [px, pz] = onFace(e, nx, nz, g + s * (gateWidth / 2 + 0.25), -0.25); ctx.batch.box(style === 'wall' ? wallM : m.concDark, 0.5, H + 0.4, 0.5, px, y0 + (H + 0.4) / 2, pz); } }
  }
  return out;
}

// painted parking stalls in a lot rect. along: the axis the row of stalls runs along
export function paintedLot(ctx, R, y0, { stall = 2.5, along = 'x', surface = true } = {}) {
  if (surface) ctx.batch.box(groundMat('asphalt'), R.w, 0.03, R.d, R.cx, y0 + 0.015, R.cz, 0, { cast: false });
  const pm = paintMat(0xe8e6dc), len = along === 'x' ? R.w : R.d;
  for (let a = 0; a <= len + 0.01; a += stall) {
    if (along === 'x') ctx.batch.box(pm, 0.1, 0.01, R.d - 0.4, R.x0 + a, y0 + 0.035, R.cz, 0, { cast: false });
    else ctx.batch.box(pm, R.w - 0.4, 0.01, 0.1, R.cx, y0 + 0.035, R.z0 + a, 0, { cast: false });
  }
}
// park cars in a lot's stalls (nose in), leaving gaps
export function fillStalls(ctx, R, y0, { along = 'x', stall = 2.5, fill = 0.6 } = {}) {
  const len = along === 'x' ? R.w : R.d, n = Math.floor(len / stall);
  for (let i = 0; i < n; i++) {
    if (ctx.rnd() > fill) continue;
    const t = carType(ctx.rnd); if (t === 'truck' || t === 'taxi') continue;
    const a = (i + 0.5) * stall, x = along === 'x' ? R.x0 + a : R.cx, z = along === 'x' ? R.cz : R.z0 + a;
    const rot = along === 'x' ? (ctx.rnd() < 0.5 ? 0 : Math.PI) : (ctx.rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    ctx.car(t, x, z, rot, {});
  }
}
export function playground(ctx, R, y0, zone) {
  if (!ctx.plan.free(R)) return null;
  const m = mats(), B = ctx.batch; B.box(groundMat('track', { color: 0xc8b090 }), R.w, 0.04, R.d, R.cx, y0 + 0.02, R.cz, 0, { cast: false });
  // slide tower + swings + bench
  B.box(m.yellow, 2, 1.6, 2, R.x0 + 3, y0 + 0.8, R.cz); B.box(m.red, 2.2, 0.15, 2.2, R.x0 + 3, y0 + 2.2, R.cz);
  const sl = new THREE.BoxGeometry(0.8, 0.08, 3.2); sl.rotateX(0.55); sl.translate(R.x0 + 3, y0 + 0.9, R.cz + 2.3); B.add(sl, m.blueTank);
  for (const s of [-1, 1]) B.box(m.steel, 0.08, 2.2, 0.08, R.x1 - 4 + s * 1.6, y0 + 1.1, R.cz); B.box(m.steel, 3.3, 0.08, 0.08, R.x1 - 4, y0 + 2.2, R.cz);
  ctx.plan.walk(R, 'playground');
  return ctx.plan.add({ kind: 'structure', id: id('playground'), use: 'playground', zone, rect: Rect.c(R.x0 + 3, R.cz, 2.2, 2.2), y0, h: 2.3, colliders: [ctx.world.addBox(V(R.x0 + 2, y0, R.cz - 1), V(R.x0 + 4, y0 + 1.6, R.cz + 1), { surface: 'metal' })] });
}

// 다세대 빌라: pilotis parking on the ground, 4 floors above, entrance at the back of the pilotis
export function villa(ctx, parcel, o = {}) {
  const m = mats(), r = ctx.rnd, P = parcel.rect, [fx, fz] = parcel.front;
  const rect = P.inset(0.8); const y0 = ctx.ground(rect.cx, rect.cz), pil = 2.6, floors = o.floors ?? 4, H = pil + floors * 2.8;
  const W = r() < 0.6 ? { kind: 'brick', color: [0x8a4a3a, 0x9a5a44, 0x7a4234][Math.floor(r() * 3)] } : { kind: 'render', color: [0xe0d8c8, 0xd0c8b8, 0xc8c8c0][Math.floor(r() * 3)] };
  const wall = wallMat(W.kind, W.color);
  const it = reg(ctx, { id: id('villa'), use: 'villa', zone: parcel.zone, rect, y0, h: H, entrances: [], tags: ['canopy'] }); ctx.ownBegin(it);
  // upper mass (on pilotis), columns, stair core at the back
  const B = ctx.batch; B.box(wall, rect.w, H - pil, rect.d, rect.cx, y0 + pil + (H - pil) / 2, rect.cz); B.box(m.roofGreen, rect.w - 0.5, 0.06, rect.d - 0.5, rect.cx, y0 + H + 0.03, rect.cz);
  for (const [nx, nz] of SIDES) { const e = edge(rect, nx, nz); B.box(wall, nx ? 0.25 : e.len, 0.9, nx ? e.len : 0.25, e.cx - nx * 0.125, y0 + H + 0.45, e.cz - nz * 0.125); }
  B.box(m.concDark, rect.w - 0.1, 0.35, rect.d - 0.1, rect.cx, y0 + pil - 0.175, rect.cz);     // soffit slab
  const core = fx ? new Rect(fx > 0 ? rect.x0 : rect.x1 - 4, rect.cz - 2, fx > 0 ? rect.x0 + 4 : rect.x1, rect.cz + 2) : new Rect(rect.cx - 2, fz > 0 ? rect.z0 : rect.z1 - 4, rect.cx + 2, fz > 0 ? rect.z0 + 4 : rect.z1);
  B.box(wall, core.w, pil, core.d, core.cx, y0 + pil / 2, core.cz);
  it.colliders.push(ctx.world.addBox(V(rect.x0, y0 + pil - 0.35, rect.z0), V(rect.x1, y0 + H, rect.z1), { surface: 'concrete', cover: true, walkable: false }));
  it.colliders.push(ctx.world.addBox(V(core.x0, y0, core.z0), V(core.x1, y0 + pil, core.z1), { surface: 'concrete', cover: true, walkable: false }));
  for (const [cx, cz] of [[rect.x0 + 0.25, rect.z0 + 0.25], [rect.x1 - 0.25, rect.z0 + 0.25], [rect.x0 + 0.25, rect.z1 - 0.25], [rect.x1 - 0.25, rect.z1 - 0.25]]) {
    B.box(m.conc, 0.45, pil, 0.45, cx, y0 + pil / 2, cz); it.colliders.push(ctx.world.addBox(V(cx - 0.22, y0, cz - 0.22), V(cx + 0.22, y0 + pil, cz + 0.22), { surface: 'concrete', cover: true }));
  }
  // entrance door on the core, facing the street through the pilotis
  const ce = edge(core, fx, fz); const [dx, dz] = onFace(ce, fx, fz, 0, 0.02); ctx.fac.get('commercial').shop(dx, y0 + 1.1, dz, Math.atan2(fx, fz), 1.0, 2.1, { type: 4, lit: 0.2 });
  B.box(m.darkAlu, fx ? 0.08 : 1.2, 0.08, fx ? 1.2 : 0.08, dx, y0 + 2.2, dz);
  it.entrances.push({ x: dx, z: dz, nx: fx, nz: fz });
  // parking under the pilotis (cars may stand inside the canopy)
  const park = fx ? new Rect(fx > 0 ? core.x1 + 0.3 : rect.x0 + 0.5, rect.z0 + 0.6, fx > 0 ? rect.x1 - 0.5 : core.x0 - 0.3, rect.z1 - 0.6) : new Rect(rect.x0 + 0.6, fz > 0 ? core.z1 + 0.3 : rect.z0 + 0.5, rect.x1 - 0.6, fz > 0 ? rect.z1 - 0.5 : core.z0 - 0.3);
  ctx.plan.park(park); ctx.plan.walk(park, 'pilotis');
  ctx.batch.box(groundMat('plaza', { color: 0xb0aca4 }), park.w, 0.02, park.d, park.cx, y0 + 0.01, park.cz, 0, { cast: false });
  if (r() < 0.7) { const t = ['sedan', 'compact', 'hatch', 'suv'][Math.floor(r() * 4)]; const L = CAR[t].L; if ((fx ? park.w : park.d) > L + 0.4) ctx.car(t, park.cx + (fx ? 0 : (r() - 0.5) * (park.w - 2.4)), park.cz + (fx ? (r() - 0.5) * (park.d - 2.4) : 0), fx ? Math.PI / 2 * fx : (fz > 0 ? 0 : Math.PI), { canopy: true }); }
  for (const [nx, nz] of SIDES) windows(ctx, 'villa', rect, nx, nz, { y0: y0 + pil - 2.8, floors: floors + 1, startFloor: 1, wall: W.color, frame: [0xe8e8e0, 0x6a5a48, 0x8e9498][Math.floor(r() * 3)], guard: 0.35, ac: 0.25 });
  // name plate
  const names = ['한울하이츠', '청솔빌', '대원맨션', '삼정빌라', '해든빌', '라온하우스', '그린파크빌', '동신빌라'];
  const nm = channelSign(names[Math.floor(r() * names.length)], '#e8e0c8', 0.5, { raceway: null }); const fe = edge(rect, fx, fz); const [nx2, nz2] = onFace(fe, fx, fz, 0, 0.02);
  nm.position.set(nx2, y0 + H - 0.6, nz2); nm.rotation.y = Math.atan2(fx, fz); ctx.scene.add(nm); ctx.own(nm);
  rooftop(ctx, rect, y0 + H, parcel.front, { units: 1 });
  ctx.ownEnd(); return it;
}

// 단독주택: two storeys with a hip roof inside a walled yard; gate to the street
export function house(ctx, parcel, o = {}) {
  const m = mats(), r = ctx.rnd, P = parcel.rect, [fx, fz] = parcel.front;
  const y0 = ctx.ground(P.cx, P.cz);
  const gates = fence(ctx, P.inset(0.05), parcel.streets, { gates: 1, style: 'wall', gateWidth: 2.4 });
  const yard = 3; const rect = new Rect(P.x0 + (fx < 0 ? yard + 1 : 1.2), P.z0 + (fz < 0 ? yard + 1 : 1.2), P.x1 - (fx > 0 ? yard + 1 : 1.2), P.z1 - (fz > 0 ? yard + 1 : 1.2));
  const h = 6.0, wcol = [0xe8e0cc, 0xd8ccb8, 0xc8c0b0][Math.floor(r() * 3)];
  const it = reg(ctx, { id: id('house'), use: 'house', zone: parcel.zone, rect, y0, h: h + 1.8, entrances: [] }); ctx.ownBegin(it);
  const wall = wallMat(r() < 0.5 ? 'brick' : 'render', r() < 0.5 ? 0x8a5a44 : wcol);
  ctx.batch.box(wall, rect.w, h, rect.d, rect.cx, y0 + h / 2, rect.cz);
  it.colliders.push(ctx.world.addBox(V(rect.x0, y0, rect.z0), V(rect.x1, y0 + h, rect.z1), { surface: 'concrete', cover: true, walkable: false }));
  ctx.game.props.hipRoof(ctx.scene, rect.cx, y0 + h, rect.cz, rect.w + 0.8, rect.d + 0.8, [0x3c4650, 0x6a3a2a, 0x4a5a4a][Math.floor(r() * 3)], 1.8, false);
  for (const [nx, nz] of SIDES) windows(ctx, 'villa', rect, nx, nz, { y0: y0 - 2.8 + 0.2, floors: 3, startFloor: 1, wall: wcol, frame: 0xe8e8e0, guard: 0.2, ac: 0.15 });
  const e = edge(rect, fx, fz); const [dx, dz] = onFace(e, fx, fz, e.len * 0.25, 0.02);
  ctx.batch.box(m.wood, fx ? 0.06 : 1.0, 2.1, fx ? 1.0 : 0.06, dx, y0 + 1.05, dz); it.entrances.push({ x: dx, z: dz, nx: fx, nz: fz });
  // the yard between the house and the gate is walkable
  ctx.plan.walk(new Rect(Math.min(P.x0 + 0.4, rect.x0), Math.min(P.z0 + 0.4, rect.z0), Math.max(P.x1 - 0.4, rect.x1), Math.max(P.z1 - 0.4, rect.z1)), 'yard');
  ctx.trees([[P.x0 + 1.6 + r() * 1.5, P.z0 + 1.6]], { zone: parcel.zone, kind: 'pine' });
  ctx.ownEnd(); it.gates = gates; return it;
}

// 학교: main block facing south across the field, perimeter wall, gate, name
export function school(ctx, site, o = {}) {
  const m = mats(), R = site.rect, y0 = ctx.ground(R.cx, R.cz);
  const gates = fence(ctx, R, site.streets, { gates: 1, style: 'wall', gateWidth: 7 });
  const siteItem = ctx.plan.add({ kind: 'site', id: id('school'), use: 'school', zone: site.zone, rect: R, y0, h: 0, entrances: gates });
  const inner = R.inset(3); const bw = Math.min(64, inner.w - 6), bd = 15, floors = 4, H = floors * 3.4 + 0.6;
  const rect = new Rect(inner.cx - bw / 2, inner.z0 + 2, inner.cx + bw / 2, inner.z0 + 2 + bd);
  const it = reg(ctx, { id: id('school'), use: 'school', zone: site.zone, rect, y0, h: H, entrances: [] }); ctx.ownBegin(it);
  const wcol = 0xd8cdb8; const wall = wallMat('brick', 0x9a5a44);
  it.colliders.push(mass(ctx, rect, y0, H, wall));
  windows(ctx, 'school', rect, 0, 1, { y0, floors, startFloor: 0, wall: 0xc8b8a0, frame: 0xe8e8e0, lit: 0.02, guard: 0, ac: 0 });
  windows(ctx, 'villa', rect, 0, -1, { y0: y0 - 2.8 + 0.6, floors: 5, startFloor: 1, wall: wcol, frame: 0xe8e8e0, guard: 0, ac: 0 });
  // central entrance porch + name + clock
  const e = edge(rect, 0, 1); const [ex, ez] = onFace(e, 0, 1, 0, 0);
  ctx.fac.get('commercial').shop(ex, y0 + 1.5, ez, 0, 3.6, 2.7, { type: 4, lit: 0.1 }); ctx.batch.box(m.conc, 6, 0.3, 3, ex, y0 + 3.3, ez + 1.5);
  for (const s of [-1, 1]) ctx.batch.box(m.conc, 0.4, 3.2, 0.4, ex + s * 2.8, y0 + 1.6, ez + 2.8);
  it.entrances.push({ x: ex, z: ez, nx: 0, nz: 1 });
  const nm = channelSign(o.name ?? '연서초등학교', '#f2f2ea', 1.1, { raceway: null }); nm.position.set(ex, y0 + H - 1.4, ez + 0.02); ctx.scene.add(nm); ctx.own(nm);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshStandardMaterial({ color: 0xf0f0e8, roughness: 0.5 })); clock.position.set(ex, y0 + H - 3.4, ez + 0.03); ctx.scene.add(clock); ctx.own(clock);
  ctx.ownEnd();
  // field + track south of the building, flagpoles, trees along the wall
  const field = new Rect(inner.x0 + 4, rect.z1 + 6, inner.x1 - 4, inner.z1 - 3);
  if (field.d > 10) {
    ctx.batch.box(groundMat('track'), field.w, 0.03, field.d, field.cx, y0 + 0.015, field.cz, 0, { cast: false });
    ctx.batch.box(groundMat('dirtField'), field.w - 4, 0.035, field.d - 4, field.cx, y0 + 0.02, field.cz, 0, { cast: false });
    ctx.plan.walk(field, 'field');
    for (const s of [-1, 1]) { ctx.batch.box(m.white, 0.1, 2.4, 7.3, field.cx + s * (field.w / 2 - 3), y0 + 1.2, field.cz); }
  }
  ctx.plan.walk(new Rect(inner.x0, rect.z1, inner.x1, rect.z1 + 6), 'yard');
  for (let i = 0; i < 3; i++) ctx.batch.add(new THREE.CylinderGeometry(0.05, 0.06, 9, 6).translate(ex - 4 + i * 4, y0 + 4.5, rect.z1 + 4), m.steel);
  const trees = []; for (let x = inner.x0 + 2; x < inner.x1 - 2; x += 6) { trees.push([x, inner.z1 - 0.5]); }
  ctx.trees(trees, { zone: site.zone });
  return siteItem;
}

// 병원: main block + podium, entrance canopy facing the street, emergency entrance on a side street
export function hospital(ctx, parcel, o = {}) {
  const m = mats(), P = parcel.rect, [fx, fz] = parcel.front;
  const rect = new Rect(P.x0 + (fx < 0 ? 9 : 2), P.z0 + (fz < 0 ? 9 : 3), P.x1 - (fx > 0 ? 9 : 2), P.z1 - (fz > 0 ? 9 : 3));
  const y0 = ctx.ground(rect.cx, rect.cz), floors = o.floors ?? 9, H = 4.6 + (floors - 1) * 3.6;
  const it = reg(ctx, { id: id('hospital'), use: 'hospital', zone: parcel.zone, rect, y0, h: H, entrances: [] }); ctx.ownBegin(it);
  ctx.plan.walk(P, 'grounds');   // the hospital grounds around the block are walkable
  const wcol = 0xe6e4de; const wall = wallMat('panel', wcol);
  it.colliders.push(mass(ctx, rect, y0, H, wall));
  for (const [nx, nz] of SIDES) windows(ctx, 'commercial', rect, nx, nz, { y0: y0 + 4.6 - 3.3, floors: Math.floor((H - 4.6) / 3.3) + 1, startFloor: 1, wall: wcol, frame: 0x6a7480, lit: 0.12, guard: 0, ac: 0 });
  // drop-off forecourt (drive) and main entrance
  const fc = new Rect(fx ? (fx > 0 ? rect.x1 : P.x0) : P.x0, fz ? (fz > 0 ? rect.z1 : P.z0) : P.z0, fx ? (fx > 0 ? P.x1 : rect.x0) : P.x1, fz ? (fz > 0 ? P.z1 : rect.z0) : P.z1);
  ctx.plan.walk(fc, 'plaza'); ctx.batch.box(groundMat('plaza', { color: 0xc8c4bc }), fc.w, 0.03, fc.d, fc.cx, y0 + 0.015, fc.cz, 0, { cast: false });
  const e = edge(rect, fx, fz), rot = Math.atan2(fx, fz); const [ex, ez] = onFace(e, fx, fz, 0, 0);
  ctx.fac.get('commercial').shop(ex, y0 + 2.0, ez, rot, Math.min(14, e.len - 4), 3.6, { type: 3, lit: 0.6 });
  const [cx, cz] = onFace(e, fx, fz, 0, 3); ctx.batch.box(m.white, fx ? 6 : 16, 0.5, fx ? 16 : 6, cx, y0 + 4.4, cz);
  for (const s of [-1, 1]) { const [px, pz] = onFace(e, fx, fz, s * 7, 5.6); ctx.batch.box(m.white, 0.5, 4.2, 0.5, px, y0 + 2.1, pz); ctx.plan.add({ kind: 'prop', id: id('column'), rect: Rect.c(px, pz, 0.5, 0.5), y0, h: 4.2, colliders: [ctx.world.addBox(V(px - 0.25, y0, pz - 0.25), V(px + 0.25, y0 + 4.2, pz + 0.25), { surface: 'concrete' })] }); }
  it.entrances.push({ x: ex, z: ez, nx: fx, nz: fz });
  const nm = channelSign(o.name ?? '연서중앙병원', '#1d4f8a', 2.0, { raceway: null }); const [nx2, nz2] = onFace(e, fx, fz, 0, 0.03); nm.position.set(nx2, y0 + H - 1.8, nz2); nm.rotation.y = rot; ctx.scene.add(nm); ctx.own(nm);
  // emergency entrance on a side that faces a street
  const side = SIDES.find(([nx, nz]) => (nx !== fx || nz !== fz) && parcel.streets[key(nx, nz)]);
  if (side) { const se = edge(rect, ...side); const [sx, sz] = onFace(se, ...side, 0, 0); ctx.fac.get('commercial').shop(sx, y0 + 1.6, sz, Math.atan2(...side), 4, 2.8, { type: 3, lit: 0.9 });
    const er = boxSign('응급의료센터', 'EMERGENCY', ['#c8141a', '#ffffff', '#ffffff'], 4.6, 0.9, { lit: true }); const [rx, rz] = onFace(se, ...side, 0, 0.05); er.position.set(rx, y0 + 3.7, rz); er.rotation.y = Math.atan2(...side); ctx.scene.add(er); ctx.own(er); it.entrances.push({ x: sx, z: sz, nx: side[0], nz: side[1] }); }
  rooftop(ctx, rect, y0 + H, parcel.front, { units: 6 });
  ctx.batch.box(m.white, 12, 0.3, 12, rect.cx, y0 + H + 0.15, rect.cz);    // helipad
  ctx.ownEnd(); return it;
}

// 공원: lawn, cross paths, trees, benches, pergola, low fence with entrances on every street side
export function park(ctx, site, o = {}) {
  const m = mats(), R = site.rect, y0 = ctx.ground(R.cx, R.cz), r = ctx.rnd;
  const gates = fence(ctx, R, site.streets, { gates: 4, style: 'rail', gateWidth: 4 });
  const it = ctx.plan.add({ kind: 'site', id: id('park'), use: 'park', zone: site.zone, rect: R, y0, h: 0, entrances: gates });
  ctx.batch.box(groundMat('lawn'), R.w - 0.6, 0.02, R.d - 0.6, R.cx, y0 + 0.01, R.cz, 0, { cast: false });
  // paths from every gate to the centre plaza
  const hub = Rect.c(R.cx, R.cz, 14, 14); ctx.plan.walk(hub, 'plaza'); ctx.batch.box(groundMat('plaza'), hub.w, 0.03, hub.d, hub.cx, y0 + 0.015, hub.cz, 0, { cast: false });
  for (const g of gates) { const p = g.nx ? new Rect(Math.min(g.x, hub.cx), g.z - 1.5, Math.max(g.x, hub.cx), g.z + 1.5) : new Rect(g.x - 1.5, Math.min(g.z, hub.cz), g.x + 1.5, Math.max(g.z, hub.cz)); ctx.plan.walk(p, 'path'); ctx.batch.box(groundMat('pavers'), p.w, 0.025, p.d, p.cx, y0 + 0.013, p.cz, 0, { cast: false }); }
  // pergola in the hub
  const pg = Rect.c(hub.cx, hub.cz - 3, 6, 3);
  for (const [px, pz] of [[pg.x0, pg.z0], [pg.x1, pg.z0], [pg.x0, pg.z1], [pg.x1, pg.z1]]) ctx.batch.box(m.wood, 0.25, 2.6, 0.25, px, y0 + 1.3, pz);
  for (let x = pg.x0; x <= pg.x1; x += 0.6) ctx.batch.box(m.wood, 0.12, 0.15, pg.d + 0.6, x, y0 + 2.7, pg.cz);
  for (const s of [-1, 1]) { ctx.batch.box(m.wood, 2.2, 0.08, 0.5, hub.cx + s * 3.5, y0 + 0.45, hub.cz + 4); ctx.batch.box(m.iron, 2.2, 0.45, 0.08, hub.cx + s * 3.5, y0 + 0.22, hub.cz + 4.2); }
  // trees: rows inside the fence + clumps, kept off the paths
  const pts = [];
  for (let i = 0; i < 40; i++) { const x = R.x0 + 3 + r() * (R.w - 6), z = R.z0 + 3 + r() * (R.d - 6); if (hub.inset(-2).has(x, z) || ctx.plan.walks.some((w) => w.kind === 'path' && w.rect.has(x, z, 1.5))) continue; pts.push([x, z]); }
  ctx.trees(pts, { zone: site.zone, mix: 0.4 });
  return it;
}

// 주차장 (surface lot): stalls in rows facing an aisle, booth at the entrance, low fence
export function parkingLot(ctx, parcel, o = {}) {
  const m = mats(), R = parcel.rect.inset(0.3), y0 = ctx.ground(R.cx, R.cz), [fx, fz] = parcel.front;
  const it = ctx.plan.add({ kind: 'site', id: id('parking'), use: 'parking', zone: parcel.zone, rect: R, y0, h: 0 });
  ctx.batch.box(groundMat('asphalt'), R.w, 0.03, R.d, R.cx, y0 + 0.015, R.cz, 0, { cast: false });
  // rows run parallel to the street: stall rows 5.2 deep, aisles 6 m
  const alongX = fz !== 0; const depth = alongX ? R.d : R.w; let off = 0.5;
  while (off + 5.2 <= depth) {
    const row = alongX ? new Rect(R.x0 + 1, R.z0 + off, R.x1 - 1, R.z0 + off + 5.2) : new Rect(R.x0 + off, R.z0 + 1, R.x0 + off + 5.2, R.z1 - 1);
    ctx.plan.park(row); paintedLot(ctx, row, y0, { along: alongX ? 'x' : 'z', surface: false }); fillStalls(ctx, row, y0, { along: alongX ? 'x' : 'z', fill: o.fill ?? 0.5 });
    off += 5.2; if (off + 6 > depth) break;
    const aisle = alongX ? new Rect(R.x0, R.z0 + off, R.x1, R.z0 + off + 6) : new Rect(R.x0 + off, R.z0, R.x0 + off + 6, R.z1);
    ctx.plan.road(aisle, 'drive', alongX ? 'x' : 'z'); off += 6;
  }
  // booth by the entrance + P sign
  const e = edge(R, fx, fz); const [bx, bz] = onFace(e, fx, fz, e.len / 2 - 2.5, -1.4); const br = Rect.c(bx, bz, 1.6, 1.6);
  if (ctx.plan.free(br)) { ctx.batch.box(m.white, 1.6, 2.3, 1.6, bx, y0 + 1.15, bz); ctx.batch.box(m.blueTank, 1.9, 0.12, 1.9, bx, y0 + 2.36, bz); ctx.plan.add({ kind: 'prop', id: id('booth'), rect: br, y0, h: 2.4, colliders: [ctx.world.addBox(V(br.x0, y0, br.z0), V(br.x1, y0 + 2.3, br.z1), { surface: 'metal' })] }); }
  const ps = boxSign('P', '', ['#1d4f9a', '#ffffff', '#ffffff'], 1.0, 1.0); const [sx, sz] = onFace(e, fx, fz, -e.len / 2 + 1.2, 0.2); ps.position.set(sx, y0 + 3.2, sz); ps.rotation.y = Math.atan2(fx, fz); ctx.scene.add(ps);
  ctx.batch.add(new THREE.CylinderGeometry(0.05, 0.05, 3, 6).translate(sx, y0 + 1.5, sz), m.steel);
  it.entrances = [{ x: e.cx, z: e.cz, nx: fx, nz: fz }];
  return it;
}

// 주유소 at a corner: canopy over two pump islands, kiosk with a shop, tall price sign
export function gasStation(ctx, parcel, o = {}) {
  const m = mats(), R = parcel.rect, y0 = ctx.ground(R.cx, R.cz), [fx, fz] = parcel.front;
  const site = ctx.plan.add({ kind: 'site', id: id('gas'), use: 'gas', zone: parcel.zone, rect: R, y0, h: 0 });
  ctx.batch.box(groundMat('plaza', { color: 0xb8b4aa }), R.w, 0.03, R.d, R.cx, y0 + 0.015, R.cz, 0, { cast: false });
  ctx.plan.park(R.inset(0.2)); ctx.plan.walk(R.inset(0.2), 'forecourt');
  // canopy (cars may stand under it) on four columns
  const cr = Rect.c(R.cx + fx * 2, R.cz + fz * 2, fx ? 10 : 16, fx ? 16 : 10);
  const can = ctx.plan.add({ kind: 'structure', id: id('canopy'), rect: cr, y0: y0 + 5.0, h: 1.0, tags: ['canopy', 'elevated'] });
  ctx.batch.box(m.white, cr.w, 0.9, cr.d, cr.cx, y0 + 5.45, cr.cz); ctx.batch.box(m.red, cr.w + 0.05, 0.3, cr.d + 0.05, cr.cx, y0 + 5.65, cr.cz);
  for (const s of [-1, 1]) {
    const [ix, iz] = fx ? [cr.cx + s * 2.6, cr.cz] : [cr.cx, cr.cz + s * 2.6]; const ir = Rect.c(ix, iz, fx ? 1.2 : 8, fx ? 8 : 1.2);
    ctx.batch.box(m.conc, ir.w, 0.2, ir.d, ix, y0 + 0.1, iz);
    for (const t of [-1, 1]) { const [px, pz] = fx ? [ix, iz + t * 2.2] : [ix + t * 2.2, iz]; ctx.batch.box(m.white, fx ? 0.6 : 1.0, 1.8, fx ? 1.0 : 0.6, px, y0 + 1.1, pz); ctx.batch.box(m.red, fx ? 0.62 : 1.02, 0.3, fx ? 1.02 : 0.62, px, y0 + 1.85, pz); }
    ctx.batch.box(m.white, 0.4, 5, 0.4, ix, y0 + 2.5, iz);
    ctx.plan.add({ kind: 'prop', id: id('pumps'), rect: ir, y0, h: 2, colliders: [ctx.world.addBox(V(ir.x0, y0, ir.z0), V(ir.x1, y0 + 2, ir.z1), { surface: 'metal', cover: true })] });
  }
  // kiosk at the back
  const kr = fx ? new Rect(fx > 0 ? R.x0 + 0.5 : R.x1 - 8.5, R.cz - 5, fx > 0 ? R.x0 + 8.5 : R.x1 - 0.5, R.cz + 5) : new Rect(R.cx - 5, fz > 0 ? R.z0 + 0.5 : R.z1 - 8.5, R.cx + 5, fz > 0 ? R.z0 + 8.5 : R.z1 - 0.5);
  const k = reg(ctx, { id: id('gas'), use: 'gas', zone: parcel.zone, rect: kr, y0, h: 3.6, entrances: [] }); ctx.ownBegin(k);
  k.colliders.push(mass(ctx, kr, y0, 3.6, wallMat('panel', 0xe8e6e0), { parapet: 0.4 }));
  const ke = edge(kr, fx, fz); const [kx, kz] = onFace(ke, fx, fz, 0, 0); ctx.fac.get('commercial').shop(kx, y0 + 1.5, kz, Math.atan2(fx, fz), ke.len - 2, 2.6, { type: 0, lit: 0.7 });
  k.entrances.push({ x: kx, z: kz, nx: fx, nz: fz });
  const ks = boxSign('연서주유소', '셀프 · 세차', ['#d8261c', '#ffffff', '#f2b705'], Math.min(6, ke.len - 1), 0.8, { style: 'logo', lit: true }); const [sx, sz] = onFace(ke, fx, fz, 0, 0.05); ks.position.set(sx, y0 + 3.2, sz); ks.rotation.y = Math.atan2(fx, fz); ctx.scene.add(ks); ctx.own(ks);
  ctx.ownEnd();
  // price pole at the street corner
  const pe = edge(R, fx, fz); const [qx, qz] = onFace(pe, fx, fz, pe.len / 2 - 1.2, -1.0);
  const pole = boxSign('휘발유 1,689', '경유 1,559 · 원/L', ['#1a1a1a', '#ffd400', '#ffd400'], 2.2, 1.6); pole.position.set(qx, y0 + 5.2, qz); pole.rotation.y = Math.atan2(fx, fz); ctx.scene.add(pole);
  ctx.batch.box(m.red, 0.4, 4.4, 0.4, qx, y0 + 2.2, qz); ctx.plan.add({ kind: 'prop', id: id('pole'), rect: Rect.c(qx, qz, 0.4, 0.4), y0, h: 6, colliders: [ctx.world.addBox(V(qx - 0.2, y0, qz - 0.2), V(qx + 0.2, y0 + 4.4, qz + 0.2), { surface: 'metal' })] });
  site.entrances = [{ x: pe.cx, z: pe.cz, nx: fx, nz: fz }];
  return site;
}

// 산업: warehouse / logistics shed / factory with office annex, inside a mesh-fenced yard with a gate
export function industrial(ctx, parcel, o = {}) {
  const r = ctx.rnd, P = parcel.rect, [fx, fz] = parcel.front, y0 = ctx.ground(P.cx, P.cz), use = o.use ?? 'warehouse';
  const gates = fence(ctx, P.inset(0.05), parcel.streets, { gates: 1, style: 'mesh', gateWidth: 8 });
  const site = ctx.plan.add({ kind: 'site', id: id(use + 'Yard'), use: 'yard', zone: parcel.zone, rect: P, y0, h: 0, entrances: gates });
  ctx.batch.box(wallMat('concrete', 0x8a8882), P.w - 0.4, 0.03, P.d - 0.4, P.cx, y0 + 0.015, P.cz, 0, { cast: false });
  ctx.plan.walk(P.inset(0.4), 'yard');
  const yardDepth = use === 'logistics' ? 18 : 12;
  const rect = new Rect(P.x0 + (fx < 0 ? yardDepth : 2.5), P.z0 + (fz < 0 ? yardDepth : 2.5), P.x1 - (fx > 0 ? yardDepth : 2.5), P.z1 - (fz > 0 ? yardDepth : 2.5));
  const h = use === 'factory' ? 9 : use === 'logistics' ? 11 : 8;
  // doors on the yard side (front)
  const side = fx > 0 ? 'e' : fx < 0 ? 'w' : fz > 0 ? 's' : 'n', len = fx ? rect.d : rect.w;
  const nDoors = use === 'logistics' ? Math.max(2, Math.floor(len / 6)) : 2;
  const doors = []; for (let i = 0; i < nDoors; i++) doors.push({ side, at: -len / 2 + (i + 0.5) * len / nDoors, width: use === 'logistics' ? 3.2 : 5, height: use === 'logistics' ? 3.6 : 5, kind: 'shutter', open: r() * 0.6 });
  doors.push({ side, at: len / 2 - 1.2, width: 1.0, kind: 'person' });
  const owners = ['연서물류', '한결정밀', '대성산업', '우진로지스', '태광금속', '서해냉동'];
  const grp = warehouse(ctx.game, { x: rect.cx, z: rect.cz, y: y0, w: rect.w, d: rect.d, h, rotQ: 0, doors, sign: `${1 + Math.floor(r() * 9)}`, owner: owners[Math.floor(r() * owners.length)] });
  const it = reg(ctx, { id: id(use), use, zone: parcel.zone, rect, y0, h: h + Math.min(rect.w, rect.d) * 0.08, obj: grp, colliders: [grp.userData.collider], entrances: [] });
  const e = edge(rect, fx, fz); const [dx, dz] = onFace(e, fx, fz, len / 2 - 1.2, 0); it.entrances.push({ x: dx, z: dz, nx: fx, nz: fz });
  // a parked truck / two in the yard
  for (let i = 0; i < (use === 'logistics' ? 2 : 1); i++) { const [tx, tz] = onFace(e, fx, fz, (i - 0.5) * 9, yardDepth / 2 + 0.5); const yr = Rect.c(tx, tz, fx ? yardDepth - 2 : 9, fx ? 9 : yardDepth - 2); ctx.plan.park(yr); ctx.car('truck', tx, tz, Math.atan2(fx, fz), {}); }
  return it;
}

// distant backdrop block (beyond the playable streets: no collider, painted windows, merged), zone-consistent
const bdMats = new Map();
function bdMat(kind, k) { const key = `${kind}${k}`; if (!bdMats.has(key)) { const m = new THREE.MeshStandardMaterial({ map: facadeTexture(k, 40 + k), roughness: 0.85 }); m.userData.texMeters = 12; bdMats.set(key, m); } return bdMats.get(key); }
export function backdrop(ctx, rect, h, kind, k = 0) {
  const m = mats();
  if (kind === 'industrial') { const g = new THREE.BoxGeometry(rect.w, h, rect.d).translate(rect.cx, h / 2, rect.cz); ctx.batch.add(g, wallMat('panel', 0xa0a6aa)); ctx.batch.box(flatMat(0x6e7a84, { roughness: 0.6, metalness: 0.4, key: 'bdroof' }), rect.w + 0.6, 0.4, rect.d + 0.6, rect.cx, h + 0.2, rect.cz); return; }
  ctx.batch.box(bdMat(kind, k % 5), rect.w, h, rect.d, rect.cx, h / 2, rect.cz);
  ctx.batch.box(kind === 'apartment' ? m.roofGrey : m.roofGreen, rect.w - 0.4, 0.1, rect.d - 0.4, rect.cx, h + 0.05, rect.cz);
  if (kind === 'house') ctx.game.props.hipRoof(ctx.scene, rect.cx, h, rect.cz, rect.w + 0.6, rect.d + 0.6, [0x3c4650, 0x6a3a2a, 0x4a5a4a][k % 3], 1.6, false);
}
