// 연서 신도심 — the new district east of the old centre (x 216..720). Contemporary, not futuristic.
// Laid out like a lakeside landmark district (north = -z):
//   boulevard (N-S)      x 408..432 — runs between the two lakes
//   올림픽로 (E-W)        z -104..-84, the big crossing with the boulevard; rail viaduct just north (z -160..-144)
//   잠실로 (E-W, east)    z -16..-4, between the landmark block and the east lake
//   streets              N-S x 270..282 and 612..624, E-W z -236..-224 and 150..162
//   east lake (동호)      east of the boulevard, south of 잠실로; the landmark tower + mall on the block north of it
//   west lake (서호)      west of the boulevard, further south-west; lake park north of it
//   연서중앙역            north-west of the big crossing (hall over the viaduct, plaza on 올림픽로)
//   all other blocks      contemporary offices (east) and residential towers (west / south)
import * as THREE from 'three';
import { Rect } from './CityPlan.js';
import { flatMat, groundMat, wallMat, paintMat } from './CityMaterials.js';
import { modernTower, landmarkTower, shell, cap, outline, outlineColliders, outlineRect, curtainMat } from './Modern.js';
import { channelSign } from '../korea/Signs.js';
import { furnishSidewalk, placeCar, parkAlong, CURB } from './Streets.js';
import { carType } from '../korea/Cars.js';
import { buildCentralStation, footbridge, stationQuarter } from './Station.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const ND = {
  x0: 216, x1: 720, boulevard: [408, 432], walk: 6, sw: 4, connector: [200, 216],
  roadsX: [[-104, -84, 216, 720], [-236, -224, 216, 720], [150, 162, 216, 720], [-16, -4, 432, 720]],     // E-W [z0, z1, x0, x1]
  roadsZ: [[270, 282, -300, -224], [270, 282, -104, 300], [612, 624, -300, 300]],                      // N-S [x0, x1, z0, z1] (the west one stops at the station block)
  rail: { z0: -206, z1: -166, y: 9 },
  lakes: [{ cx: 522, cz: 70, rx: 72, rz: 44 }, { cx: 345, cz: 95, rx: 52, rz: 44 }],
  tower: V(488, 0, -50),
};
// lakes are below the land: water at -0.9 inside the ellipse (heightFn uses this)
export function inLake(x, z, grow = 0) { return ND.lakes.some((l) => ((x - l.cx) / (l.rx + grow)) ** 2 + ((z - l.cz) / (l.rz + grow)) ** 2 < 1); }

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
  const zCuts = { W: [[-300, -236], [-224, -104], [-84, 150], [162, 300]], E: [[-300, -236], [-224, -104], [-84, -16], [-4, 150], [162, 300]] };
  const cells = [];
  for (const side of ['W', 'E']) for (const [x0, x1] of xCuts[side]) for (const [z0, z1] of zCuts[side]) {
    // the station block west of the boulevard is one large block (no street through it)
    if (side === 'W' && z0 === -224 && x0 === 282) continue;
    const r = new Rect(side === 'W' && z0 === -224 && x0 === 216 ? 216 : x0, z0, side === 'W' && z0 === -224 && x0 === 216 ? bx0 : x1, z1); cells.push(r);
    plan.block(r, side === 'E' ? 'business' : 'residential', `N${side}${x0},${z0}`);
    const onRoad = (x, z) => plan.carriageways.some((q) => q.rect.has(x, z));
    const bw = (nx) => (nx && (x0 === bx1 || x1 === bx0) ? L.walk : L.sw);
    if (onRoad(r.x0 - 1, r.cz)) plan.walk(new Rect(r.x0, r.z0, r.x0 + (x0 === bx1 ? L.walk : L.sw), r.z1), 'sidewalk');
    if (onRoad(r.x1 + 1, r.cz)) plan.walk(new Rect(r.x1 - (x1 === bx0 ? L.walk : L.sw), r.z0, r.x1, r.z1), 'sidewalk');
    if (onRoad(r.cx, r.z0 - 1)) plan.walk(new Rect(r.x0, r.z0, r.x1, r.z0 + L.sw), 'sidewalk');
    if (onRoad(r.cx, r.z1 + 1)) plan.walk(new Rect(r.x0, r.z1 - L.sw, r.x1, r.z1), 'sidewalk');
  }
  const zEdges = [-300, 300];

  // ---------------------------------------------------------------- lakes + lake parks (west of the boulevard)
  const water = new THREE.MeshStandardMaterial({ color: 0x3a5a5e, roughness: 0.04, metalness: 0.35, envMapIntensity: 1.2 });
  for (const l of L.lakes) {
    const pts = outline('ellipse', l.rx * 2, l.rz * 2, { n: 64 }).map(([x, z], i) => [x * (1 + 0.04 * Math.sin(i * 1.7)), z * (1 + 0.05 * Math.cos(i * 2.3))]);
    // the park block around the lake: lawn land with the lake cut out of it
    const blk = plan.blocks.find((q) => q.rect.has(l.cx, l.cz)); if (blk) { (blk.holes ||= []).push(pts.map(([x, z]) => [l.cx + x, l.cz + z])); blk.lawn = true; plan.walk(blk.rect.inset(L.sw), 'park'); }
    batch.add(cap(pts, -0.9, { cx: l.cx, cz: l.cz }), water, { cast: false });
    batch.add(shell([{ y: -1.3, pts }, { y: CURB + 0.02, pts }], { cx: l.cx, cz: l.cz, uM: 2, vM: 1 }), wallMat('stone', 0x9a968c), { cast: false });     // stone revetment
    // promenade ring (walkable), railing posts, trees outside it
    const ring = new Rect(l.cx - l.rx - 8, l.cz - l.rz - 8, l.cx + l.rx + 8, l.cz + l.rz + 8);
    plan.walk(ring, 'park');
    plan.add({ kind: 'site', id: `lake${l.cx}${l.cz}`, use: 'park', zone: 'public', rect: ring, y0: CURB, h: 0 });
    const rail = flatMat(0x3a3e3c, { roughness: 0.5, metalness: 0.5, key: 'lakerail' }); const outer = pts.map(([x, z]) => [x * 1.02, z * 1.02]);
    batch.add(shell([{ y: CURB + 0.95, pts: outer }, { y: CURB + 1.0, pts: outer }], { cx: l.cx, cz: l.cz }), rail);
    for (let i = 0; i < outer.length; i += 2) { const [px, pz] = outer[i]; batch.box(rail, 0.06, 1.0, 0.06, l.cx + px, CURB + 0.5, l.cz + pz); }
    // lake edge collider: a ring of thin boxes so nobody walks into the water
    for (let i = 0; i < outer.length; i++) { const [ax, az] = outer[i], [qx, qz] = outer[(i + 1) % outer.length]; world.addBox(V(l.cx + Math.min(ax, qx) - 0.05, CURB, l.cz + Math.min(az, qz) - 0.05), V(l.cx + Math.max(ax, qx) + 0.05, CURB + 1.0, l.cz + Math.max(az, qz) + 0.05), { surface: 'metal', cover: false, walkable: false }); }
    const trees = []; for (let i = 0; i < 64; i += 2) { const a = (i / 64) * Math.PI * 2; trees.push([l.cx + Math.cos(a) * (l.rx + 5.5), l.cz + Math.sin(a) * (l.rz + 5.5)]); }
    ctx.trees(trees, { mix: 0.3 });
  }

  // ---------------------------------------------------------------- rail viaduct + 연서중앙역
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
  // 연서중앙역 (world/city/Station.js): train shed + concourse vault + arched glass front, twin towers, plaza with
  // a sunken metro plaza, bus terminal and taxi rank; a footbridge to the landmark
  const stBlock = new Rect(216 + 4, -224 + 4, bx0 - L.walk, -104 - L.sw);
  const station = buildCentralStation(ctx, { block: stBlock, rail: R });
  footbridge(ctx, { x0: stBlock.x1 - 30, z0: -116, x1: bx1 + L.walk + 10, z1: -84 + L.sw + 8 });   // lands on the landmark forecourt
  // the east side: mixed-use development across the boulevard (department store podium + hotel tower), its forecourt
  // where the footbridge lands
  plan.walk(new Rect(bx1 + L.walk, -166, bx1 + L.walk + 14, -104 - L.sw), 'plaza');
  plan.walk(new Rect(bx1 + L.walk, -112.5, 612 - 2, -104 - L.sw), 'plaza');   // the department store / hotel forecourt on 올림픽로
  modernTower(ctx, { x: 492, z: -137, y0: CURB, podium: { kind: 'round', w: 82, d: 50, h: 26, r: 10 }, sections: [{ kind: 'round', w: 34, d: 26, r: 8, h: 118, floorH: 4, rims: 2 }],
    crown: 'fin', zone: 'business', use: 'shops', front: [0, 1], palette: { glass: 0x5a7486, spandrel: 0xc8ccd0, mullion: 0xe0e4e6, key: 'hotel' } });
  stationQuarter(ctx, { st: station, block: stBlock, rail: R, east: [new Rect(bx1 + L.walk + 2, -206, 612 - L.sw - 2, -166), new Rect(624 + L.sw + 2, -206, L.x1 - 2, -166)] });
  // ---------------------------------------------------------------- the landmark + podium mall (east of the boulevard, facing the lakes)
  const T = L.tower; landmarkTower(ctx, { x: T.x, z: T.z, y0: CURB, H: 520, base: 58, name: '연서 하늘타워' });
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
  for (let k = 0; k < 18; k++) { const zz = -280 + rnd() * 560; if (L.roadsX.some((r) => zz > r[0] - 10 && zz < r[1] + 10)) continue; const lx = [410.2, 414, 426, 429.8][Math.floor(rnd() * 4)];
    placeCar(ctx, carType(rnd), lx, zz, (lx > 420 ? Math.PI : 0) + (rnd() - 0.5) * 0.2, { state: 'dusty' }); }
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
