// 서울 신도심 — the new district east of the old centre (x 216..720). Contemporary, not futuristic.
// Laid out like a lakeside landmark district (north = -z):
//   boulevard (N-S)      x 408..432 — crosses the lake river (석촌천) on a road bridge
//   올림픽로 (E-W)        z -104..-84, the big crossing with the boulevard; rail viaduct just north (z -160..-144)
//   잠실로 (E-W, east)    z -16..-4, between the landmark block and the east lake
//   streets              N-S x 270..282 and 612..624, E-W z -276..-264 and 150..162
//   lake river (석촌천)   one short river from the west park to the east park, under the boulevard bridge; wide pools at
//                        both ends, narrow where it passes the bridge; two footbridges; the landmark north of the east pool
//   서울중앙역            north-west of the big crossing (hall over the viaduct, plaza on 올림픽로)
//   all other blocks      contemporary offices (east) and residential towers (west / south)
import * as THREE from 'three';
import { Rect } from './CityPlan.js';
import { flatMat, groundMat, wallMat, paintMat } from './CityMaterials.js';
import { modernTower, landmarkTower, shell, cap, outline, outlineColliders, outlineRect, curtainMat } from './Modern.js';
import { channelSign } from '../korea/Signs.js';
import { furnishSidewalk, placeCar, parkAlong, CURB } from './Streets.js';
import { carType } from '../korea/Cars.js';
import { buildCentralStation, footbridge, stationQuarter } from './Station.js';
import { waterMat } from './Water.js';
import * as SK from './SignKit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const ND = {
  x0: 216, x1: 720, boulevard: [408, 432], walk: 6, sw: 4, connector: [200, 216],
  roadsX: [[-104, -84, 216, 720], [-276, -264, 216, 720], [150, 162, 216, 720], [-16, -4, 432, 720]],     // E-W [z0, z1, x0, x1]
  roadsZ: [[270, 282, -300, -264], [270, 282, -104, 300], [612, 624, -300, 300]],                      // N-S [x0, x1, z0, z1] (the west one stops at the station block)
  rail: { z0: -246, z1: -206, y: 9 },   // 40 m further north than first built: more room between the station and the landmark
  // the river's centre line and half width: [x, cz, hw] (cosine-interpolated); the bridge span stays dry land / road
  river: [[296, 100, 0.6], [302, 100, 10], [318, 98, 22], [345, 94, 28], [372, 96, 22], [395, 92, 15], [420, 90, 14], [445, 88, 16], [470, 82, 24], [505, 74, 32], [540, 72, 34], [570, 78, 26], [588, 82, 14], [596, 84, 0.6]],
  bridge: [402, 438], footbridges: [345, 535],
  tower: V(488, 0, -50),
};
// the river is below the land: water at -0.9 (heightFn uses this); the boulevard bridge span is not water for walking
export function riverAt(x) {
  const P = ND.river; if (x <= P[0][0]) return { cz: P[0][1], hw: P[0][2] }; if (x >= P[P.length - 1][0]) return { cz: P[P.length - 1][1], hw: P[P.length - 1][2] };
  let i = 0; while (P[i + 1][0] < x) i++; const [x0, c0, h0] = P[i], [x1, c1, h1] = P[i + 1], t = (1 - Math.cos(((x - x0) / (x1 - x0)) * Math.PI)) / 2;
  return { cz: c0 + (c1 - c0) * t, hw: h0 + (h1 - h0) * t };
}
export function inLake(x, z, grow = 0) {
  const P = ND.river; if (x < P[0][0] - grow || x > P[P.length - 1][0] + grow) return false;
  if (!grow && x > ND.bridge[0] && x < ND.bridge[1]) return false;
  const { cz, hw } = riverAt(x); return Math.abs(z - cz) < hw + grow;
}

export function buildNewDistrict(ctx) {
  const { plan, batch, scene, world, rnd } = ctx, L = ND, [bx0, bx1] = L.boulevard;
  // ---------------------------------------------------------------- roads
  plan.road(new Rect(L.connector[0], -300, L.connector[1], 300), 'arterial', 'z');
  plan.road(new Rect(bx0, -300, bx1, 300), 'arterial', 'z');
  for (const [z0, z1, x0, x1] of L.roadsX) plan.road(new Rect(x0, z0, x1, z1), z1 - z0 > 15 ? 'arterial' : 'local', 'x');
  for (const [x0, x1, z0, z1] of L.roadsZ) plan.road(new Rect(x0, z0, x1, z1), 'local', 'z');
  plan.reserve(new Rect(L.connector[1], L.rail.z0, L.x1, L.rail.z1), 'overpass', 'rail viaduct');
  // blocks = the cells between roads (per side), sidewalks along every edge that meets a road
  const xCuts = { W: [[216, 270], [282, bx0]], E: [[bx1, 612], [624, L.x1]] };
  const zCuts = { W: [[-300, -276], [-264, -104], [-84, 150], [162, 300]], E: [[-300, -276], [-264, -104], [-84, -16], [-4, 150], [162, 300]] };
  const cells = [];
  for (const side of ['W', 'E']) for (const [x0, x1] of xCuts[side]) for (const [z0, z1] of zCuts[side]) {
    // the station block west of the boulevard is one large block (no street through it)
    if (side === 'W' && z0 === -264 && x0 === 282) continue;
    const r = new Rect(side === 'W' && z0 === -264 && x0 === 216 ? 216 : x0, z0, side === 'W' && z0 === -264 && x0 === 216 ? bx0 : x1, z1); cells.push(r);
    plan.block(r, side === 'E' ? 'business' : 'residential', `N${side}${x0},${z0}`);
    const onRoad = (x, z) => plan.carriageways.some((q) => q.rect.has(x, z));
    const bw = (nx) => (nx && (x0 === bx1 || x1 === bx0) ? L.walk : L.sw);
    if (onRoad(r.x0 - 1, r.cz)) plan.walk(new Rect(r.x0, r.z0, r.x0 + (x0 === bx1 ? L.walk : L.sw), r.z1), 'sidewalk');
    if (onRoad(r.x1 + 1, r.cz)) plan.walk(new Rect(r.x1 - (x1 === bx0 ? L.walk : L.sw), r.z0, r.x1, r.z1), 'sidewalk');
    if (onRoad(r.cx, r.z0 - 1)) plan.walk(new Rect(r.x0, r.z0, r.x1, r.z0 + L.sw), 'sidewalk');
    if (onRoad(r.cx, r.z1 + 1)) plan.walk(new Rect(r.x0, r.z1 - L.sw, r.x1, r.z1), 'sidewalk');
  }
  const zEdges = [-300, 300];

  buildRiver(ctx);

  // ---------------------------------------------------------------- rail viaduct + 서울중앙역
  const R = L.rail, S = L.station, conc = wallMat('concrete', 0xb0aea6);
  const deck = new Rect(L.connector[1], R.z0, L.x1, R.z1);
  batch.box(conc, deck.w, 1.6, deck.d, deck.cx, R.y - 0.8, deck.cz);
  for (const s of [-1, 1]) batch.box(conc, deck.w, 1.2, 0.4, deck.cx, R.y + 0.6, deck.cz + s * (deck.d / 2 - 0.2));
  for (let x = deck.x0 + 12; x < deck.x1; x += 26) { const pr = Rect.c(x, deck.cz, 2.2, 6); if (plan.carriageways.some((r) => r.rect.hits(pr)) || (x > 255 && x < 368)) continue;   // the station concourse carries the deck there
    batch.box(conc, 2.2, R.y - 1.6, 6, x, (R.y - 1.6) / 2 + 0.07, deck.cz); plan.add({ kind: 'structure', id: `railpier${x | 0}`, rect: pr, y0: CURB, h: R.y - 1.6 - CURB, tags: ['support'], colliders: [world.addBox(V(pr.x0, 0, pr.z0), V(pr.x1, R.y - 1.6, pr.z1), { surface: 'concrete' })] }); }
  plan.add({ kind: 'structure', id: 'viaduct', rect: deck, y0: R.y - 1.6, h: 3, tags: ['elevated', 'onRoad'] });
  // tracks
  const rail2 = flatMat(0x6a6460, { roughness: 0.5, metalness: 0.7, key: 'rail' });
  for (const tz of [R.z0 + 2, R.z0 + 6.5, R.z1 - 6.5, R.z1 - 2]) for (const s of [-0.72, 0.72]) batch.box(rail2, deck.w, 0.16, 0.08, deck.cx, R.y + 0.1, tz + s, 0, { cast: false });
  // 서울중앙역 (world/city/Station.js): train shed + concourse vault + arched glass front, twin towers, plaza with
  // a sunken metro plaza, bus terminal and taxi rank; a footbridge to the landmark
  const stBlock = new Rect(216 + 4, -264 + 4, bx0 - L.walk, -104 - L.sw);
  const station = buildCentralStation(ctx, { block: stBlock, rail: R });
  footbridge(ctx, { x0: stBlock.x1 - 30, z0: -116, x1: bx1 + L.walk + 10, z1: -84 + L.sw + 8 });   // lands on the landmark forecourt
  // the east side: mixed-use development across the boulevard (department store podium + hotel tower), its forecourt
  // where the footbridge lands
  plan.walk(new Rect(bx1 + L.walk, R.z1, bx1 + L.walk + 14, -104 - L.sw), 'plaza');
  plan.walk(new Rect(bx1 + L.walk, -112.5, 612 - 2, -104 - L.sw), 'plaza');   // the department store / hotel forecourt on 올림픽로
  modernTower(ctx, { x: 492, z: -137, y0: CURB, podium: { kind: 'round', w: 82, d: 50, h: 26, r: 10 }, sections: [{ kind: 'round', w: 34, d: 26, r: 8, h: 118, floorH: 4, rims: 2 }],
    crown: 'fin', zone: 'business', use: 'shops', front: [0, 1], palette: { glass: 0x5a7486, spandrel: 0xc8ccd0, mullion: 0xe0e4e6, key: 'hotel' } });
  stationQuarter(ctx, { st: station, block: stBlock, rail: R, east: [new Rect(bx1 + L.walk + 2, R.z0, 612 - L.sw - 2, R.z1), new Rect(624 + L.sw + 2, R.z0, L.x1 - 2, R.z1)] });
  // ---------------------------------------------------------------- the landmark + podium mall (east of the boulevard, facing the lakes)
  const T = L.tower; landmarkTower(ctx, { x: T.x, z: T.z, y0: CURB, H: 520, base: 58, name: '서울 하늘타워' });
  // podium mall north / east of the tower: a long retail block and a rounded "dome" department store
  modernTower(ctx, { x: 566, z: -50, y0: CURB, sections: [{ kind: 'round', w: 80, d: 56, r: 14, h: 36, mat: 'grid', floorH: 6, rims: 1 }], crown: 'plant', zone: 'business', use: 'shops', front: [-1, 0], palette: { frame: 0xeeeae0, glass: 0x5a6a74, key: 'mall' } });
  domeStore(ctx, { x: 560, z: -128, w: 50, d: 30, h: 26 });
  // forecourt between the tower and the boulevard
  { const fc = new Rect(bx1 + L.walk, -80, T.x - 30, -20); plan.walk(fc, 'plaza'); batch.add(cap(outline('rect', fc.w, fc.d), CURB + 0.015, { cx: fc.cx, cz: fc.cz }), groundMat('plaza', { color: 0xc8c4bc }), { cast: false }); }

  // ---------------------------------------------------------------- contemporary offices / hotels / residences on the remaining parcels
  const forms = [
    { sections: [{ kind: 'ellipse', w: 34, d: 24, h: 120, floorH: 4 }], crown: 'fin', palette: { glass: 0x4e6a80, spandrel: 0x6a7884, mullion: 0xb8c0c8, key: 'a' } },               // curved glass tower
    { podium: { w: 40, d: 30, h: 10 }, sections: [{ kind: 'chamfer', w: 30, d: 24, c: 7, h: 96, floorH: 4, rims: 3 }], crown: 'slope', palette: { glass: 0x5a7486, spandrel: 0x9aa2a8, key: 'b' } },   // chamfered
    { sections: [{ kind: 'rect', w: 34, d: 26, h: 30, floorH: 3.6, terrace: true }, { kind: 'rect', w: 28, d: 22, h: 30, floorH: 3.6, terrace: true }, { kind: 'rect', w: 22, d: 18, h: 22, floorH: 3.6, terrace: true }], crown: 'plant', palette: { glass: 0x60788a, slab: 0xeceae4, key: 'c' } },   // stepped terraces
    { podium: { w: 36, d: 28, h: 8, kind: 'rect' }, sections: [{ kind: 'round', w: 30, d: 26, r: 5, h: 84, mat: 'grid', floorH: 3.8 }], crown: 'plant', palette: { frame: 0xd6cfc0, glass: 0x45586a, key: 'd' } },    // stone grid
    { sections: [{ kind: 'bulge', w: 36, d: 22, bulge: 7, h: 70, floorH: 4, rims: 1 }], crown: 'fin', palette: { glass: 0x56707e, spandrel: 0x7e8a92, key: 'e' } },              // one curved face, exposed slabs
    { podium: { w: 40, d: 32, h: 9 }, sections: [{ kind: 'round', w: 28, d: 28, r: 9, h: 140, floorH: 4, rims: 4 }], crown: 'slope', palette: { glass: 0x4a6478, spandrel: 0x8a96a0, key: 'f' } },   // tall rounded
  ];
  let fi = 0, ri = 0;
  const parcels = [];
  for (const c of cells) {
    const inner = c.inset(L.walk + 1);
    for (let z = inner.z0; z + 40 <= inner.z1; z += 50) for (let x = inner.x0; x + 40 <= inner.x1; x += 50) parcels.push(new Rect(x, z, Math.min(x + 44, inner.x1), Math.min(z + 44, inner.z1)));
  }
  // per-parcel form: type, size, height (tallest near the landmark, lower outward), materials, crown —
  // never the same type as the previous neighbour
  const GLASS = [0x4e6a80, 0x5a7486, 0x56707e, 0x4a6478, 0x62767e, 0x506a6e], STONE = [0xd6cfc0, 0xc8c4ba, 0xe2ddd2, 0xb8b4ac], SPAN = [0x6a7884, 0x9aa2a8, 0x7e8a92, 0x8a96a0, 0x5e666c];
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let lastKind = '';
  const office = (p, dist) => {
    const top = Math.max(45, Math.min(170, 200 - dist * 0.32)) * (0.7 + rnd() * 0.4); const kinds = ['curved', 'chamfer', 'stepped', 'grid', 'bulge', 'rounded', 'midrise'].filter((k) => k !== lastKind);
    const k = dist > 260 && rnd() < 0.35 ? 'midrise' : pick(kinds); lastKind = k;
    const w = Math.min(p.w - 4, 28 + rnd() * 14), d = Math.min(p.d - 4, 22 + rnd() * 12), g = pick(GLASS), key = `${k}${g}`;
    const pal = { glass: g, spandrel: pick(SPAN), mullion: pick([0xb8c0c8, 0xd0d4d8, 0x9aa2aa]), frame: pick(STONE), key };
    if (k === 'curved') return { sections: [{ kind: 'ellipse', w, d, h: top, floorH: 4, rims: rnd() < 0.5 ? 0 : 3 }], crown: 'fin', palette: pal };
    if (k === 'chamfer') return { podium: { w: w + 8, d: d + 6, h: 9 }, sections: [{ kind: 'chamfer', w, d, c: 4 + rnd() * 5, h: top - 9, floorH: 4, rims: 3 }], crown: 'slope', palette: pal };
    if (k === 'stepped') { const h = Math.min(top, 80); return { sections: [{ kind: 'rect', w, d, h: h * 0.4, floorH: 3.6, terrace: true }, { kind: 'rect', w: w * 0.8, d: d * 0.8, h: h * 0.35, floorH: 3.6, terrace: true }, { kind: 'rect', w: w * 0.62, d: d * 0.62, h: h * 0.25, floorH: 3.6, terrace: true }], crown: 'plant', palette: pal }; }
    if (k === 'grid') return { podium: { w: w + 6, d: d + 6, h: 8 }, sections: [{ kind: 'round', w, d, r: 3 + rnd() * 4, h: top * 0.75, mat: 'grid', floorH: 3.8 }], crown: 'plant', palette: pal };
    if (k === 'bulge') return { sections: [{ kind: 'bulge', w, d: d - 4, bulge: 4 + rnd() * 4, h: top * 0.8, floorH: 4, rims: 1 }], crown: 'fin', palette: pal };
    if (k === 'midrise') return { podium: { w: w + 4, d: d + 4, h: 6 }, sections: [{ kind: pick(['rect', 'round', 'chamfer']), w, d, r: 4, c: 4, h: 22 + rnd() * 20, mat: rnd() < 0.5 ? 'grid' : 'curtain', floorH: 3.8, rims: 1 }], crown: 'plant', palette: pal };
    return { podium: { w: w + 8, d: d + 8, h: 9 }, sections: [{ kind: 'round', w: Math.min(w, d), d: Math.min(w, d), r: 6 + rnd() * 4, h: top, floorH: 4, rims: 4 }], crown: 'slope', palette: pal };
  };
  // apartment towers: balcony slab every floor, cream precast frame, 25-38 floors
  const apartment = (p) => { const w = Math.min(p.w - 6, 30 + rnd() * 8), d = Math.min(p.d - 10, 18 + rnd() * 4), fl = 25 + Math.floor(rnd() * 14);
    return { sections: [{ kind: rnd() < 0.5 ? 'round' : 'chamfer', w, d, r: 3, c: 3, h: fl * 3, mat: 'grid', floorH: 3, rims: 1 }], crown: 'plant', palette: { frame: pick([0xe8e4da, 0xdcd6c8, 0xe2e0d8]), glass: 0x5e6e76, slab: 0xf0eee8, key: 'apt' + fl % 3 } }; };
  for (const p of parcels) {
    if (!plan.free(p.inset(-1), { kinds: ['building', 'structure', 'site'], walks: false }) || plan.walks.some((w) => (w.kind === 'plaza' || w.kind === 'park') && w.rect.hits(p)) || inLake(p.cx, p.cz, 30)) continue;
    const east = p.cx > bx1, resid = !east || p.cz > 150, dist = Math.hypot(p.cx - T.x, p.cz - T.z);
    const f = resid ? apartment(p) : office(p, dist), front = east ? [-1, 0] : [1, 0];
    modernTower(ctx, { x: p.cx, z: p.cz, y0: CURB, ...f, front, zone: resid ? 'residential' : 'business', use: resid ? 'apartment' : 'office' });
    plan.walk(p.inset(-3), 'grounds');   // the lot around the tower (forecourt, paths) is walkable
  }


  // ---------------------------------------------------------------- streetscape: lamps + double tree rows on the boulevard,
  // lamps + trees on the streets, lane paint, parked cars
  const avoid = plan.items.flatMap((it) => it.entrances.map((e) => ({ x: e.x, z: e.z, r: 2 })));
  for (const w of plan.walks.filter((q) => q.kind === 'sidewalk' && q.rect.x0 >= 216)) {
    const alongZ = w.rect.d > w.rect.w;
    if (alongZ) { const roadW = plan.carriageways.some((q) => q.rect.has(w.rect.x0 - 1, w.rect.cz)); const curb = roadW ? w.rect.x0 : w.rect.x1;
      furnishSidewalk(ctx, w.rect, { axis: 'z', curb, out: roadW ? -1 : 1, avoid, treeEvery: 9, crossings: L.roadsX.map((r) => (r[0] + r[1]) / 2) }); }
    else { const roadN = plan.carriageways.some((q) => q.rect.has(w.rect.cx, w.rect.z0 - 1)); const curb = roadN ? w.rect.z0 : w.rect.z1;
      furnishSidewalk(ctx, w.rect, { axis: 'x', curb, out: roadN ? -1 : 1, avoid, treeEvery: 10, crossings: [420, 276, 618] });
      parkAlong(ctx, { axis: 'x', line: curb + (roadN ? -1.1 : 1.1), from: w.rect.x0 + 8, to: w.rect.x1 - 8, dir: roadN ? 1 : -1, fill: 0.3 }); }
  }
  const white = paintMat(0xe8e4d8), yellow = paintMat(0xd8b020);
  for (const s2 of [-1, 1]) batch.box(yellow, 0.15, 0.005, 600, 420 + s2 * 0.2, 0.012, 0, 0, { cast: false });
  for (const lx of [-8, -4, 4, 8]) for (let zz = -296; zz < 296; zz += 10) if (!L.roadsX.some((r) => zz + 5 > r[0] - 4 && zz < r[1] + 4)) batch.box(white, 0.15, 0.005, 5, 420 + lx, 0.012, zz + 2.5, 0, { cast: false });
  for (const [z0, z1, x0, x1] of L.roadsX) { const zc = (z0 + z1) / 2; for (let xx = x0 + 4; xx < x1 - 3; xx += 8) if (xx + 4 < bx0 - 2 || xx > bx1 + 2) batch.box(yellow, 4, 0.005, 0.15, xx + 2, 0.012, zc, 0, { cast: false });
    for (const s2 of [z0 - 2.2, z1 + 2.2]) for (let xx = bx0 + 0.8; xx < bx1 - 0.6; xx += 1) batch.box(white, 0.5, 0.005, 3.5, xx + 0.25, 0.012, s2, 0, { cast: false }); }
  // moving traffic on the district's roads (right-hand traffic), signalised junctions on the boulevard and the
  // N-S streets; the lanes are kept free of parked cars (those stand at the curbs)
  ctx.trafficPlan = (T) => {
    const bc = (bx0 + bx1) / 2;
    for (const [dx, dir] of [[-2.2, 1], [-5.6, 1], [2.2, -1], [5.6, -1]]) T.lane(dir > 0 ? [bc + dx, -300] : [bc + dx, 300], dir > 0 ? [bc + dx, 300] : [bc + dx, -300], { speed: 13, count: 16 });
    for (const [z0, z1, x0, x1] of L.roadsX) { const zc = (z0 + z1) / 2, wide = z1 - z0 > 15;
      for (const [dz, dir] of wide ? [[2.2, 1], [5.6, 1], [-2.2, -1], [-5.2, -1]] : [[2, 1], [-2, -1]]) T.lane(dir > 0 ? [x0, zc + dz] : [x1, zc + dz], dir > 0 ? [x1, zc + dz] : [x0, zc + dz], { speed: wide ? 12 : 9, count: wide ? 12 : 6 });
      for (const [jx0, jx1] of [[bx0, bx1], [612, 624], [270, 282]]) if (jx1 > x0 && jx0 < x1) T.junction(jx0, z0, jx1, z1); }
    for (const [x0, x1, z0, z1] of L.roadsZ) { const xc = (x0 + x1) / 2; T.lane([xc - 2, z0], [xc - 2, z1], { speed: 9, count: 5 }); T.lane([xc + 2, z1], [xc + 2, z0], { speed: 9, count: 5 }); }
  };
}

// rounded department store with a curved roof and horizontal white bands (podium of the landmark)
function domeStore(ctx, { x, z, w, d, h }) {
  const rings = [], base = outline('round', w, d, { r: Math.min(w, d) * 0.45 });
  for (let i = 0; i <= 12; i++) { const t = i / 12; const k = t < 0.7 ? 1 : Math.cos(((t - 0.7) / 0.3) * Math.PI / 2) * 0.55 + 0.45; rings.push({ y: CURB + t * h, pts: base.map(([px, pz]) => [px * k, pz * k]) }); }
  const m = new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#eeece6'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 32) { g.fillStyle = '#9ab0bc'; g.fillRect(0, y + 22, 256, 6); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })(), roughness: 0.5 });
  ctx.batch.add(shell(rings, { cx: x, cz: z, uM: 8, vM: 4 }), m);
  ctx.batch.add(cap(rings[rings.length - 1].pts, CURB + h, { cx: x, cz: z }), flatMat(0xdcdad4, { key: 'domecap' }));
  ctx.plan.add({ kind: 'building', id: 'dome-store', use: 'shops', zone: 'business', rect: outlineRect(base, x, z), y0: CURB, h, entrances: [], colliders: outlineColliders(ctx.world, base, x, z, CURB, h * 0.8, { strips: 5 }) });
}

// ---------------------------------------------------------------- the lake river (석촌천) + its two parks
// One short river: a wide pool in the west park, narrowing to pass under the boulevard bridge, a wider pool in
// the east park under the landmark. Stone banks, a paved promenade with a railing along both banks, two arched
// footbridges; in the parks a pavilion (정자), a playground, an outdoor gym, benches, a café kiosk with a terrace.
function buildRiver(ctx) {
  const { plan, batch, world } = ctx, P = ND.river, X0 = P[0][0], X1 = P[P.length - 1][0], [b0, b1] = ND.bridge;
  const xs = []; for (let x = X0; x < X1; x += 2) xs.push(x); xs.push(X1);
  const edgeN = (x) => { const r = riverAt(x); return r.cz - r.hw; }, edgeS = (x) => { const r = riverAt(x); return r.cz + r.hw; };
  // water: a strip between the banks
  { const pos = [], idx = []; xs.forEach((x, i) => { pos.push(x, -0.9, edgeN(x), x, -0.9, edgeS(x)); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2)); g.setIndex(idx); g.computeVertexNormals();
    batch.add(g, waterMat(0x1e4452), { cast: false, texMeters: 9 });
    // the river bed seen through the shallows at the edge: a darker floor below
    const bed = g.clone(); bed.translate(0, -1.2, 0); batch.add(bed, flatMat(0x1a2a2a, { key: 'riverbed2' }), { cast: false }); }
  // stone banks (both faces: seen from the water and from the promenade)
  const stone = wallMat('stone', 0x9a968c);
  for (const ez of [edgeN, edgeS]) { const pos = [];
    for (let i = 1; i < xs.length; i++) { const xa = xs[i - 1], xb = xs[i], za = ez(xa), zb = ez(xb), y0 = -1.3, y1 = CURB + 0.02;
      const q = [[xa, y0, za], [xb, y0, zb], [xb, y1, zb], [xa, y1, za]]; for (const t of [[0, 1, 2, 0, 2, 3], [0, 2, 1, 0, 3, 2]]) for (const k of t) pos.push(...q[k]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2)); g.computeVertexNormals(); batch.add(g, stone, { cast: false }); }
  // the park blocks: lawn land with the river cut out of it
  const parks = [];
  for (const [px, side] of [[350, 'W'], [520, 'E']]) {
    const blk = plan.blocks.find((q) => q.rect.has(px, riverAt(px).cz)); if (!blk) continue;
    const xa = Math.max(X0, blk.rect.x0 + 0.05), xb = Math.min(X1, blk.rect.x1 - 0.05), seg = xs.filter((x) => x > xa && x < xb);
    const hole = [[xa, edgeN(xa)], ...seg.map((x) => [x, edgeN(x)]), [xb, edgeN(xb)], [xb, edgeS(xb)], ...seg.slice().reverse().map((x) => [x, edgeS(x)]), [xa, edgeS(xa)]];
    (blk.holes ||= []).push(hole); blk.lawn = true; plan.walk(blk.rect.inset(ND.sw), 'park');
    const zs = hole.map((p) => p[1]), ring = new Rect(Math.max(blk.rect.x0 + ND.sw, xa - 8), Math.max(blk.rect.z0 + ND.sw, Math.min(...zs) - 8), Math.min(blk.rect.x1 - ND.sw, xb + 8), Math.min(blk.rect.z1 - ND.sw, Math.max(...zs) + 8));
    plan.walk(ring, 'park'); plan.add({ kind: 'site', id: `river${side}`, use: 'park', zone: 'public', rect: ring, y0: CURB, h: 0 });
    parks.push({ side, blk: blk.rect, xa, xb });
  }
  // promenade (paving 3 m wide, 1.2 m back from the bank), railing on the bank with posts; colliders keep people out
  const pav = groundMat('pavers'), rail = flatMat(0x3a3e3c, { roughness: 0.5, metalness: 0.5, key: 'lakerail' }), dryX = (x) => x > b0 - 0.5 && x < b1 + 0.5;
  const fbAt = (x) => ND.footbridges.some((f) => Math.abs(x - f) < 1.9);
  for (const [ez, out] of [[edgeN, -1], [edgeS, 1]]) {
    const pos = [];
    for (let i = 1; i < xs.length; i++) { const xa = xs[i - 1], xb = xs[i]; if (xa < X0 + 5 || xb > X1 - 5 || dryX(xa) || dryX(xb)) continue;
      const za = ez(xa) + out * 1.2, zb = ez(xb) + out * 1.2, y = CURB + 0.012, q = [[xa, y, za], [xb, y, zb], [xb, y, zb + out * 3], [xa, y, za + out * 3]];
      for (const k of out > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) pos.push(...q[k]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2)); g.computeVertexNormals(); batch.add(g, pav, { cast: false });
    for (let i = 1; i < xs.length; i++) { const xa = xs[i - 1], xb = xs[i]; if (dryX(xa) || dryX(xb) || fbAt(xa) || fbAt(xb)) continue;
      const za = ez(xa) + out * 0.35, zb = ez(xb) + out * 0.35, L2 = Math.hypot(xb - xa, zb - za), ang = -Math.atan2(zb - za, xb - xa);
      batch.box(rail, L2, 0.06, 0.06, (xa + xb) / 2, CURB + 1.0, (za + zb) / 2, ang); batch.box(rail, L2, 0.04, 0.04, (xa + xb) / 2, CURB + 0.5, (za + zb) / 2, ang);
      if (i % 2 === 0) batch.box(rail, 0.07, 1.0, 0.07, xa, CURB + 0.5, za);
      world.addBox(V(Math.min(xa, xb) - 0.05, CURB, Math.min(za, zb) - 0.05), V(Math.max(xa, xb) + 0.05, CURB + 1.05, Math.max(za, zb) + 0.05), { surface: 'metal', cover: false, walkable: false }); }
  }
  // the boulevard bridge: deck under the road and both sidewalks, granite parapets with a handrail and lamps
  { let zmin = Infinity, zmax = -Infinity; for (let x = b0; x <= b1; x += 1) { zmin = Math.min(zmin, edgeN(x)); zmax = Math.max(zmax, edgeS(x)); } zmin -= 1; zmax += 1;
    const conc = wallMat('concrete', 0xb4b0a8), gran = wallMat('stone', 0xc8c4bc), dz = zmax - zmin, cz = (zmin + zmax) / 2;
    batch.box(conc, b1 - b0, 0.8, dz, (b0 + b1) / 2, -0.42, cz);
    for (const [x0, x1] of [[b0, ND.boulevard[0]], [ND.boulevard[1], b1]]) batch.box(conc, x1 - x0, CURB + 0.02, dz, (x0 + x1) / 2, (CURB + 0.02) / 2 - 0.02, cz);
    for (const x of [b0 + 0.25, b1 - 0.25]) {
      batch.box(gran, 0.5, 0.75, dz, x, CURB + 0.375, cz); batch.box(rail, 0.08, 0.06, dz, x, CURB + 1.08, cz);
      for (let z = zmin + 0.5; z < zmax; z += 2.5) batch.box(rail, 0.05, 0.33, 0.05, x, CURB + 0.9, z);
      world.addBox(V(x - 0.25, CURB, zmin), V(x + 0.25, CURB + 1.1, zmax), { surface: 'concrete', cover: true, walkable: false });
      for (const z of [zmin + 3, zmax - 3]) { batch.box(rail, 0.18, 4.2, 0.18, x, CURB + 0.75 + 2.1, z); batch.box(rail, 0.7, 0.12, 0.3, x, CURB + 4.95, z); }
    }
    // a name plate on the parapet
    for (const x of [b0 + 0.52, b1 - 0.52]) { const pl = channelSign('석촌천교', '#e8e0c8', 0.32, { raceway: null }); pl.position.set(x, CURB + 0.45, cz); pl.rotation.y = x < 420 ? -Math.PI / 2 : Math.PI / 2; ctx.scene.add(pl); }
  }
  // arched footbridges (walkable steps of a gentle arch, railings both sides)
  const deck = flatMat(0x8a6a4a, { roughness: 0.8, key: 'fbdeck' }), steel = flatMat(0xe8e8e4, { roughness: 0.4, metalness: 0.3, key: 'fbsteel' });
  for (const fx of ND.footbridges) {
    const z0 = edgeN(fx) - 2.2, z1 = edgeS(fx) + 2.2, n = Math.ceil((z1 - z0) / 1.0), L2 = (z1 - z0) / n;
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, y = CURB + 0.05 + 1.1 * Math.sin(Math.PI * t), z = z0 + (k + 0.5) * L2;
      batch.box(deck, 3.2, 0.12, L2 + 0.02, fx, y - 0.06, z); batch.box(steel, 0.25, 0.35, L2 + 0.02, fx, y - 0.3, z);
      world.addBox(V(fx - 1.6, y - 0.4, z - L2 / 2), V(fx + 1.6, y, z + L2 / 2), { surface: 'wood', cover: false, walkable: true });
      for (const s of [-1, 1]) { batch.box(steel, 0.06, 0.06, L2 + 0.02, fx + s * 1.55, y + 1.0, z); if (k % 2 === 0) batch.box(steel, 0.05, 1.0, 0.05, fx + s * 1.55, y + 0.5, z);
        world.addBox(V(fx + s * 1.55 - 0.05, y, z - L2 / 2), V(fx + s * 1.55 + 0.05, y + 1.05, z + L2 / 2), { surface: 'metal', cover: false, walkable: false }); } }
  }
  // park furniture: pavilion, playground, outdoor gym, benches, café kiosk, tree groves (on the lawn, clear of the river)
  const wood = flatMat(0x6a4a2e, { roughness: 0.8, key: 'parkwood' }), roof = flatMat(0x3a3e40, { roughness: 0.7, key: 'pavroof' }), red = flatMat(0xb8261c, { key: 'pavred' });
  const solid = (x, z, w, d, h) => world.addBox(V(x - w / 2, CURB, z - d / 2), V(x + w / 2, CURB + h, z + d / 2), { surface: 'wood', cover: false, walkable: false });
  const bench = (x, z, rotY) => { batch.box(wood, 1.8, 0.08, 0.45, x, CURB + 0.45, z, rotY); batch.box(rail, 1.6, 0.4, 0.06, x, CURB + 0.22, z, rotY); };
  const pavilion = (x, z) => {   // 정자: raised timber floor, red columns, a dark hipped roof
    batch.box(wood, 6, 0.5, 6, x, CURB + 0.25, z); for (const [a, b] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) batch.box(red, 0.3, 3, 0.3, x + a, CURB + 2, z + b);
    const g = new THREE.CylinderGeometry(0.01, 5.6, 1.9, 4, 1); g.rotateY(Math.PI / 4); g.translate(x, CURB + 4.45, z); batch.add(g, roof);
    world.addBox(V(x - 3, CURB, z - 3), V(x + 3, CURB + 0.5, z + 3), { surface: 'wood', cover: false, walkable: true }); };
  const playground = (x, z) => {
    batch.box(flatMat(0xc87a4a, { roughness: 1, key: 'rubber' }), 18, 0.04, 13, x, CURB + 0.02, z, 0, { cast: false });
    batch.box(flatMat(0xf2c21a, { key: 'pgy' }), 3.2, 2.6, 3.2, x - 4, CURB + 1.3, z - 2); solid(x - 4, z - 2, 3.2, 3.2, 2.6);
    const sl = new THREE.BoxGeometry(1.1, 0.12, 4.4); sl.rotateX(0.5); sl.translate(x - 4, CURB + 1.4, z + 1.6); batch.add(sl, flatMat(0x2a8ad8, { key: 'pgb' }));
    for (const s of [-1, 1]) batch.box(flatMat(0xd8261c, { key: 'pgr' }), 0.15, 2.4, 0.15, x + 4 + s * 2.5, CURB + 1.2, z); batch.box(flatMat(0xd8261c, { key: 'pgr' }), 5.2, 0.15, 0.15, x + 4, CURB + 2.4, z);
    for (const s of [-1, 1]) batch.box(rail, 0.6, 0.06, 0.3, x + 4 + s * 1.2, CURB + 0.55, z);   // swing seats
    for (const [a, b] of [[-9, 0], [9, 0]]) bench(x + a, z + b + 3, Math.PI / 2); };
  const gym = (x, z) => { for (let k = 0; k < 4; k++) { const gx = x + k * 3; batch.box(flatMat(0x2a7a5a, { key: 'gym' }), 0.12, 1.8, 0.12, gx, CURB + 0.9, z); batch.box(flatMat(0xf2c21a, { key: 'pgy' }), 1.2, 0.1, 0.5, gx, CURB + 1.4 - k * 0.2, z + 0.4); } };
  const kiosk = (x, z) => { batch.box(flatMat(0xf4f2ee, { key: 'kiosk' }), 6, 3.2, 4, x, CURB + 1.6, z); batch.box(flatMat(0x46586a, { roughness: 0.1, metalness: 0.4, key: 'kioskg' }), 5, 2, 0.05, x, CURB + 1.4, z + 2.03);
    solid(x, z, 6, 4, 3.2); const s = SK.awning('LAKE CAFÉ', { w: 5.5, depth: 1.6, drop: 0.45, color: '#2a4a3a', ink: '#ffffff', shape: 'slope', sub: 'coffee · gelato' }); s.position.set(x, CURB + 2.7, z + 2.02); SK.bake(ctx, s);
    for (let k = 0; k < 4; k++) { const tx = x - 4.5 + k * 3, tz = z + 6; batch.box(rail, 0.7, 0.05, 0.7, tx, CURB + 0.74, tz); batch.box(rail, 0.06, 0.72, 0.06, tx, CURB + 0.37, tz);
      const um = new THREE.ConeGeometry(1.3, 0.5, 8); um.translate(tx, CURB + 2.35, tz); batch.add(um, flatMat(k % 2 ? 0xf4f0e6 : 0x2a4a3a, { key: `umb${k % 2}` })); batch.box(rail, 0.04, 2.2, 0.04, tx, CURB + 1.1, tz); } };
  const T = [];
  for (const pk of parks) {
    const B = pk.blk, free = (x, z, m) => !inLake(x, z, m) && x > B.x0 + 7 && x < B.x1 - 7 && z > B.z0 + 7 && z < B.z1 - 7 && !(x > b0 - 6 && x < b1 + 6);
    if (pk.side === 'W') {
      pavilion(340, 30); playground(372, 10); gym(300, -20); for (let z = -70; z < 50; z += 9) bench(296, z, Math.PI / 2);
      for (const [x, z] of [[320, 48], [360, 52], [390, 56], [330, 140], [370, 142]]) if (free(x, z, 4)) bench(x, z, 0);
      batch.box(pav, 4, 0.02, 120, 312, CURB + 0.012, -10, 0, { cast: false }); batch.box(pav, 80, 0.02, 4, 345, CURB + 0.012, 0, 0, { cast: false });
    } else {
      kiosk(470, 120); pavilion(565, 128); for (const [x, z] of [[450, 20], [480, 22], [510, 24], [560, 28], [590, 30], [500, 128], [530, 130]]) if (free(x, z, 4)) bench(x, z, 0);
    }
    // groves on the lawn: clusters, never on the promenade / furniture
    for (let k = 0; k < 140; k++) { const x = B.x0 + 8 + ((k * 37.3) % (B.w - 16)), z = B.z0 + 8 + ((k * 61.7) % (B.d - 16));
      if (!free(x, z, 6.5)) continue; if ((pk.side === 'W' && ((Math.hypot(x - 340, z - 30) < 8) || (Math.abs(x - 372) < 12 && Math.abs(z - 10) < 9) || Math.abs(x - 312) < 4 || Math.abs(z) < 4 || (x > 295 && x < 314 && z < -15 && z > -26) || Math.abs(x - 296) < 2.5))
        || (pk.side === 'E' && ((Math.abs(x - 470) < 9 && Math.abs(z - 123) < 7) || Math.hypot(x - 565, z - 128) < 8))) continue;
      T.push([x, z]); }
  }
  ctx.trees(T, { mix: 0.25 });
}
