// 하늘길 지구: a commercial and cultural quarter west of the old centre, about 0.6 km² (x -945..-232,
// z -430..430). Laid out by hand (roads, zones, the plaza, the park, every connection); the buildings of the
// hand-made core (하늘길, HandStreets.js) and the plaza are specified one by one; the cafe rows, the commercial
// blocks and the villa quarter use the city's building generators on parcels drawn here (the residential
// zones are designed once and partly repeated, as in a real 다세대 quarter).
//
//   x -945..-706  villa quarter: N-S alleys, small E-W alleys, villas with corner shops
//   x -722..-646  하늘숲길: a linear park (x -700..-670) between two cafe alleys and cafe rows; at z -90..-10 it
//                 opens into the small square (작은 광장)
//   x -664..-495  mixed commercial blocks, the mid road (x -575..-565), taller buildings along the arterial
//   x -495..-465  the arterial (N-S, region road continues beyond the quarter)
//   x -465..-290  하늘길: the hand-made street (z -140..40) and its extension north as a pedestrian street to
//                 the quarter's edge; 하늘 광장 (main plaza, z 80..200) south of 하늘로; plaza towers with big
//                 screens (z 204..262); villas behind
//   x -278..-232  high-rise edge facing the old centre
//   roads: 하늘로 (E-W, z 60..80), 와우로 (E-W, z -230..-216), boundary roads z ±416..430, 동교로 (x -290..-278)
//   보행로: small square → (z -53..-45) through the commercial blocks → arterial crossing → 하늘길 passage →
//   down 하늘길 → scramble crossing at 하늘로 → 하늘 광장
import * as THREE from 'three';
import { Rect } from './CityPlan.js';
import { groundMat, paintMat, flatMat, wallMat } from './CityMaterials.js';
import { CURB, furnishSidewalk, signal, parkAlong } from './Streets.js';
import * as B from './Buildings.js';
import * as SK from './SignKit.js';
import { buildHandStreets, HAND, ledTex, lightPave } from './HandStreets.js';
import { curtainMat } from './Modern.js';

export const DISTRICT = { x0: -945, x1: -232, z0: -430, z1: 430 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ZS = [[-416, -230], [-216, 60], [80, 416]];              // between the E-W roads
const ART = { x0: -495, x1: -465 }, HR = { z0: 60, z1: 80 }, WR = { z0: -230, z1: -216 };
const PLAZA = { x0: -465, x1: -290, z0: 80, z1: 200 };
const SQ = { x0: -722, x1: -646, z0: -93, z1: -7 };            // small square
const CONN = { z0: -53, z1: -45 };                              // 보행로 (lines up with the 하늘길 passage)
const PARK = { x0: -700, x1: -670 };

export function buildHaneulDistrict(ctx) {
  const { plan } = ctx, batch = ctx.batch, w = ctx.world, rnd = ctx.rnd;
  const sidewalks = [];   // [rect, axis, curb, out] for furniture
  const road = (x0, z0, x1, z1, kind, axis) => plan.road(new Rect(x0, z0, x1, z1), kind, axis);
  const land = (x0, z0, x1, z1, name = '하늘길 지구') => plan.block(new Rect(x0, z0, x1, z1), 'commercial', name);
  // sidewalk strip with its curb line and direction to the road (for street furniture)
  const side = (x0, z0, x1, z1, axis, curb, out) => { const r = new Rect(x0, z0, x1, z1); plan.walk(r, 'sidewalk'); sidewalks.push([r, axis, curb, out]); return r; };
  const paved = (r, mat = groundMat('pavers')) => batch.box(mat, r.w, 0.02, r.d, r.cx, CURB + 0.01, r.cz, 0, { cast: false });
  // the parcel's streets (same probe as the old centre): which sides face a road / walk
  const streets = (rect) => { const out = {}; for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = nx > 0 ? rect.x1 + 1 : nx < 0 ? rect.x0 - 1 : rect.cx, z = nz > 0 ? rect.z1 + 1 : nz < 0 ? rect.z0 - 1 : rect.cz;
    const r = plan.roads.find((q) => q.kind !== 'drive' && q.rect.has(x, z)); if (r) { out[`${nx},${nz}`] = r.kind; continue; } const wk = plan.walks.find((q) => q.rect.has(x, z)); if (wk) out[`${nx},${nz}`] = wk.kind === 'sidewalk' ? 'sidewalk' : wk.kind; } return out; };
  const parcel = (x0, z0, x1, z1, zone, front) => { const rect = new Rect(x0, z0, x1, z1); return { rect, zone, front, streets: streets(rect) }; };

  // ================================================================ 1. roads (hand-drawn network)
  road(DISTRICT.x0, -430, DISTRICT.x1, -416, 'local', 'x'); road(DISTRICT.x0, 416, DISTRICT.x1, 430, 'local', 'x');
  road(ART.x0, -416, ART.x1, 416, 'arterial', 'z');
  for (const [a, b] of [[DISTRICT.x0, ART.x0], [ART.x1, DISTRICT.x1]]) { road(a, HR.z0, b, HR.z1, 'local', 'x'); road(a, WR.z0, b, WR.z1, 'local', 'x'); }
  for (const [z0, z1] of ZS) {
    road(-290, z0, -278, z1, 'local', 'z');                                   // 동교로
    road(-575, z0, -565, z1, 'local', 'z');                                   // mid road
    for (const x of [-888, -833, -778]) road(x, z0, x + 6, z1, 'alley', 'z'); // villa alleys
  }
  // the cafe alleys along the park (they pass the small square as shared paving, no road there)
  for (const [z0, z1] of [[-416, -230], [-216, SQ.z0], [SQ.z1, 60], [80, 416]]) { road(-706, z0, -700, z1, 'alley', 'z'); road(-670, z0, -664, z1, 'alley', 'z'); }
  // the 하늘길 service road continues north and south out of the hand-made street
  road(-358, -416, -349, -230, 'local', 'z'); road(-358, -216, -349, HAND.z0, 'local', 'z'); road(-358, HAND.z1, -349, HR.z0, 'local', 'z');
  // small E-W alleys in the villa quarter and the commercial blocks (hand-placed cuts, ~65 m apart)
  const EW = { villa: [-323, -150, -96, -4, 160, 240, 320], comm: [-323, -96, -4, 160, 300] };
  for (const z of EW.villa) road(DISTRICT.x0, z - 3, -706, z + 3, 'alley', 'x');
  for (const z of EW.comm) road(-664, z - 3, ART.x0, z + 3, 'alley', 'x');

  // ================================================================ 2. land and sidewalks per zone
  // helper: a block between roads; sidewalks (4 m) on the sides that face a local / arterial road; returns the inner rect
  const block = (x0, z0, x1, z1, { sw = 4, name } = {}) => {
    land(x0, z0, x1, z1, name); const r = new Rect(x0, z0, x1, z1); let ix0 = x0, ix1 = x1, iz0 = z0, iz1 = z1;
    const on = (x, z) => plan.roads.find((q) => q.rect.has(x, z) && q.kind !== 'alley' && q.kind !== 'drive');
    const wide = (q) => (q?.kind === 'arterial' ? 5 : sw);
    let q;
    if ((q = on(x0 - 1, r.cz))) { side(x0, z0, x0 + wide(q), z1, 'z', x0, -1); ix0 += wide(q); }
    if ((q = on(x1 + 1, r.cz))) { side(x1 - wide(q), z0, x1, z1, 'z', x1, 1); ix1 -= wide(q); }
    if ((q = on(r.cx, z0 - 1))) { side(ix0, z0, ix1, z0 + wide(q), 'x', z0, -1); iz0 += wide(q); }
    if ((q = on(r.cx, z1 + 1))) { side(ix0, z1 - wide(q), ix1, z1, 'x', z1, 1); iz1 -= wide(q); }
    return new Rect(ix0, iz0, ix1, iz1);
  };
  // z cuts of a column from its segment and the alley list
  const cuts = (z0, z1, alleys, skip = []) => { const out = []; let a = z0; for (const z of [...alleys.filter((q) => q > z0 && q < z1)].sort((p, q) => p - q)) { out.push([a, z - 3]); a = z + 3; } out.push([a, z1]); return out.filter(([p, q]) => q - p > 8 && !skip.some(([s0, s1]) => p >= s0 && q <= s1)); };

  // ---- a) villa quarter (x -945..-706): double-loaded along the N-S alleys
  const villaCols = [[DISTRICT.x0, -888], [-882, -833], [-827, -778], [-772, -706]];
  for (const [z0, z1] of ZS) for (const [cz0, cz1] of cuts(z0, z1, EW.villa)) for (const [x0, xx1] of villaCols) {
    const x1 = xx1 === -706 && cz0 >= SQ.z0 && cz1 <= SQ.z1 ? SQ.x0 : xx1;
    const inner = block(x0, cz0, x1, cz1, { name: '하늘길 주거' });
    // the last column's east part is the west cafe row (along the park): it faces the cafe alley
    const cafeEdge = x1 === -706; const vx1 = cafeEdge ? -722 : inner.x1;
    if (cafeEdge && !(cz1 > SQ.z0 && cz0 < SQ.z1)) cafeRow(ctx, parcel, new Rect(-722, inner.z0, -706, inner.z1), [1, 0]);
    const mid = (inner.x0 + vx1) / 2;
    for (const [rx0, rx1, fx] of [[inner.x0, mid, -1], [mid, vx1, 1]]) {
      if (rx1 - rx0 < 10) continue;
      let z = inner.z0 + 0.5, k = 0;
      while (inner.z1 - z > 11) { const wdt = Math.min(inner.z1 - z, 13 + Math.floor(rnd() * 4)); const a = z, b2 = z + wdt - 0.8;
        // corners (first / last parcel on a road) are shop-houses, the rest villas (two hand-picked heights)
        const corner = k === 0 || inner.z1 - (z + wdt) < 11;
        if (corner) B.commercial(ctx, parcel(rx0, a, rx1, b2, 'residential', [fx, 0]), { use: 'mixedShops', floors: 4, upper: 'villa', cats: ['cafe', 'restaurant', 'store', 'salon', 'cafe'], wall: { kind: rnd() < 0.6 ? 'brick' : 'tile', color: rnd() < 0.5 ? 0x8a5444 : 0xd0c8b8 }, vacant: 0.08 });
        // the row repeats a hand-made sequence of plot types: villas of 3-5 floors, a narrow shop-house, a
        // resident parking lot, a pocket garden — shifted per row so neighbouring rows don't line up
        else { const T = ROW_PATTERN[(k + Math.round(rx0 / 7)) % ROW_PATTERN.length];
          if (T === 'park') B.parkingLot(ctx, parcel(rx0, a, rx1, b2, 'residential', [fx, 0]), { fill: 0.5 });
          else if (T === 'garden') pocketGarden(ctx, new Rect(rx0, a, rx1, b2));
          else if (T === 'shop') B.commercial(ctx, parcel(rx0, a, rx1, b2, 'residential', [fx, 0]), { use: 'mixedShops', floors: 3, upper: 'villa', cats: ['store', 'salon', 'restaurant', 'cafe'], wall: { kind: 'render', color: [0xece6d8, 0xd8e0e4, 0xe8d8c8][k % 3] }, vacant: 0.1 });
          else B.villa(ctx, parcel(rx0, a, rx1, b2, 'residential', [fx, 0]), { floors: T }); }
        z += wdt; k++; }
    }
  }
  // ---- b) 하늘숲길 park (x -700..-670) and the small square
  for (const [z0, z1] of [[-416, -230], [-216, SQ.z0], [SQ.z1, 60], [80, 416]]) parkStrip(ctx, z0, z1);
  smallSquare(ctx);
  // ---- c) commercial blocks between the park and the arterial
  for (const [z0, z1] of ZS) for (const [cz0, cz1] of cuts(z0, z1, [...EW.comm, ...(z0 === -216 ? [CONN.z0 + 3, CONN.z1 - 3] : [])])) {
    const inSq = cz1 > SQ.z0 && cz0 < SQ.z1;
    // east cafe row + mixed block (x -664..-575)
    const inA = block(inSq ? SQ.x1 : -664, cz0, -575, cz1, { name: '하늘길 카페거리' });
    if (!inSq) cafeRow(ctx, parcel, new Rect(-664, inA.z0, -646, inA.z1), [-1, 0]);
    commRow(ctx, parcel, new Rect(-618, inA.z0, inA.x1, inA.z1), [1, 0], { floors: [4, 7] });
    backLot(ctx, new Rect(-646, inA.z0, -618, inA.z1));
    // block along the arterial (x -565..-495): a row on the mid road, taller row on the arterial
    const inB = block(-565, cz0, ART.x0, cz1);
    const midX = (inB.x0 + inB.x1) / 2 - 4;
    commRow(ctx, parcel, new Rect(inB.x0, inB.z0, midX, inB.z1), [-1, 0], { floors: [4, 6] });
    commRow(ctx, parcel, new Rect(midX + 2, inB.z0, inB.x1, inB.z1), [1, 0], { floors: [8, 13], wide: true });
  }
  // the 보행로 through the commercial blocks (z -53..-45): paved, lit, benches and planters, crossings
  connector(ctx);
  // ---- d) 하늘길: the hand-made street, its west strip on the arterial, the extensions north
  buildHandStreets(ctx);
  { const r = new Rect(ART.x1, HAND.z0, HAND.x0, HAND.z1); land(r.x0, r.z0, r.x1, r.z1); plan.walk(r, 'plaza'); paved(r, lightPave());
    for (let z = r.z0 + 8; z < r.z1 - 4; z += 12) if (Math.abs(z - (CONN.z0 + CONN.z1) / 2) > 8) tree(ctx, r.cx, z); }
  for (const [z0, z1] of [[-416, -230], [-216, HAND.z0]]) hanulNorth(ctx, parcel, block, z0, z1);
  { const r = new Rect(ART.x1, HAND.z1, -290, HR.z0); land(r.x0, r.z0, r.x1, r.z1); plan.walk(r, 'plaza'); paved(r, lightPave()); sidewalks.push([r, 'x', HR.z0, 1]); }
  // ---- e) 하늘 광장 and the plaza towers, villas behind
  mainPlaza(ctx);
  plazaTowers(ctx, parcel);
  road(ART.x1, 337, -290, 343, 'alley', 'x');
  for (const [cz0, cz1] of cuts(266, 416, [340])) {
    const inner = block(ART.x1, cz0, -290, cz1, { name: '하늘길 주거' }); const mid = (inner.z0 + inner.z1) / 2;
    for (const [rz0, rz1, fz] of [[inner.z0, mid, -1], [mid, inner.z1, 1]]) { let x = inner.x0 + 0.5, k = 0; while (inner.x1 - x > 11) { const wdt = Math.min(inner.x1 - x, 14 + Math.floor(rnd() * 4));
      if (k % 4 === 0) B.commercial(ctx, parcel(x, rz0, x + wdt - 0.8, rz1, 'residential', [0, fz]), { use: 'mixedShops', floors: 5, upper: 'villa', cats: ['cafe', 'restaurant', 'store'], vacant: 0.05 });
      else B.villa(ctx, parcel(x, rz0, x + wdt - 0.8, rz1, 'residential', [0, fz]), { floors: 4 }); x += wdt; k++; } }
  }
  // ---- f) high-rise edge (x -278..-232) facing 동교로: towers that step up toward the old centre
  for (const [z0, z1] of ZS) { const inner = block(-278, z0, DISTRICT.x1, z1); let z = inner.z0 + 1, k = 0;
    while (inner.z1 - z > 30) { const d = Math.min(inner.z1 - z, 44 + Math.floor(rnd() * 14)); B.officeTower(ctx, parcel(inner.x0, z, inner.x1, z + d - 2, 'business', [-1, 0]), { floors: 14 + ((k * 7) % 11), setback: 4 }); z += d; k++; } }

  // ================================================================ 3. streetscape
  const crossings = [WR.z0 - 0, HR.z0, (CONN.z0 + CONN.z1) / 2];
  for (const [r, axis, curb, out] of sidewalks) furnishSidewalk(ctx, r, { axis, curb, out, crossings: axis === 'z' ? [(WR.z0 + WR.z1) / 2, (HR.z0 + HR.z1) / 2, (CONN.z0 + CONN.z1) / 2, -323, 160, 300] : [-575, -480, -284, -703, -667], lampEvery: 26 });
  // road paint: centre lines on the locals, the arterial lanes, crosswalks at the junctions
  roadPaint(ctx);
  // signals at the arterial junctions
  for (const zc of [(HR.z0 + HR.z1) / 2, (WR.z0 + WR.z1) / 2]) for (const s of [-1, 1]) for (const t of [-1, 1]) signal(ctx, -480 + s * 15.6, zc + t * 10.9, { arm: s === t ? -s : 0, face: t });
  for (const s of [-1, 1]) signal(ctx, -480 + s * 15.6, (CONN.z0 + CONN.z1) / 2 + s * 5.2, { arm: 0, face: s });   // the 보행로 crossing
  // cars parked along the locals
  for (const [z0, z1] of ZS) { parkAlong(ctx, { axis: 'z', line: -566.1, from: z0 + 10, to: z1 - 10, dir: 1, fill: 0.4, avoid: [-49, 160, 300, -323] }); parkAlong(ctx, { axis: 'z', line: -279.1, from: z0 + 10, to: z1 - 10, dir: 1, fill: 0.35 }); }
  parkAlong(ctx, { axis: 'x', line: 78.9, from: -940, to: -500, dir: 1, fill: 0.3, avoid: [-703, -667, -885, -830, -775] });
}

// ------------------------------------------------------------------ zone builders
const ROW_PATTERN = [4, 3, 5, 4, 'shop', 4, 3, 'park', 5, 4, 3, 'garden', 4, 5];
// a pocket garden between the villas: lawn, a tree, a bench
function pocketGarden(ctx, r) { ctx.plan.walk(r, 'path'); ctx.batch.box(groundMat('lawn'), r.w, 0.02, r.d, r.cx, CURB + 0.01, r.cz, 0, { cast: false }); tree(ctx, r.cx, r.cz - 2, 1.05); bench(ctx, r.cx + 2.5, r.cz + 2); }
// cafe row along the park: narrow shop-houses, cafés downstairs, a terrace deck in front of some
function cafeRow(ctx, parcel, r, front) {
  const rnd = ctx.rnd; let z = r.z0 + 0.4, k = 0;
  while (r.z1 - z > 8) { const wdt = Math.min(r.z1 - z, 9 + Math.floor(rnd() * 5));
    B.commercial(ctx, parcel(r.x0, z, r.x1, z + wdt - 0.5, 'residential', front), { use: 'mixedShops', floors: 3 + (k % 3), upper: k % 2 ? 'villa' : undefined, cats: ['cafe', 'cafe', 'restaurant', 'cafe', 'store', 'salon'], wall: { kind: ['brick', 'render', 'tile', 'stone'][k % 4], color: [0x9a5a44, 0xece8e0, 0xd8d0c0, 0x6a6460][k % 4] }, signStyle: 'mixed', vacant: 0.04, lit: 0.6 });
    z += wdt; k++; }
}
function commRow(ctx, parcel, r, front, { floors = [4, 7], wide = false } = {}) {
  const rnd = ctx.rnd; let z = r.z0 + 0.4;
  if (r.x1 - r.x0 < 10) return;
  while (r.z1 - z > 10) { const wdt = Math.min(r.z1 - z, (wide ? 20 : 13) + Math.floor(rnd() * 8));
    B.commercial(ctx, parcel(r.x0, z, r.x1, z + wdt - 0.6, 'commercial', front), { use: wide ? 'shopsTall' : 'shops', floors: floors[0] + Math.floor(rnd() * (floors[1] - floors[0] + 1)), cats: ['store', 'cafe', 'restaurant', 'phone', 'optician', 'salon', 'clinic', 'pharmacy'], signStyle: 'mixed', vacant: 0.06, lit: 0.55 });
    z += wdt; }
}
// back courtyards between the rows: parking stalls, a few trees
function backLot(ctx, r) { if (r.w < 6) return; ctx.batch.box(groundMat('asphalt'), r.w, 0.02, r.d, r.cx, CURB + 0.01, r.cz, 0, { cast: false }); ctx.plan.walk(r, 'path'); }
function tree(ctx, x, z, s = 1) {
  const B2 = ctx.batch, trunk = flatMat(0x4a3c30, { roughness: 0.95, key: 'hd_trunk' }), leaf = flatMat(0x5a7e3a, { roughness: 0.9, key: 'hd_leaf' });
  B2.add(new THREE.CylinderGeometry(0.13 * s, 0.18 * s, 3.4 * s, 7).translate(x, CURB + 1.7 * s, z), trunk);
  for (const [dx, dy, dz, r] of [[0, 4.4, 0, 1.8], [1, 4, 0.5, 1.2], [-0.9, 4.1, -0.6, 1.3], [0.2, 5.3, -0.2, 1.2]]) B2.add(new THREE.IcosahedronGeometry(r * s, 1).translate(x + dx * s, CURB + dy * s, z + dz * s), leaf);
  ctx.world.addBoxCentered(V(x, CURB + 1, z), V(0.4, 2, 0.4), { surface: 'wood', walkable: false });
}
function bench(ctx, x, z, alongZ = true) {
  const wd = flatMat(0x9a7450, { roughness: 0.75, key: 'hd_wood' }), st = flatMat(0x6a6e72, { roughness: 0.4, metalness: 0.6, key: 'hd_steel' });
  ctx.batch.box(wd, alongZ ? 0.5 : 2, 0.07, alongZ ? 2 : 0.5, x, CURB + 0.45, z); for (const d of [-0.75, 0.75]) ctx.batch.box(st, alongZ ? 0.45 : 0.06, 0.42, alongZ ? 0.06 : 0.45, x + (alongZ ? 0 : d), CURB + 0.21, z + (alongZ ? d : 0));
  ctx.world.addBoxCentered(V(x, CURB + 0.25, z), V(alongZ ? 0.5 : 2, 0.5, alongZ ? 2 : 0.5), { surface: 'wood', walkable: false });
}
// 하늘숲길: lawn, a winding-looking path (two offset straight runs), trees in rows, benches, low lamps
function parkStrip(ctx, z0, z1) {
  const { plan, batch } = ctx; const r = new Rect(PARK.x0, z0, PARK.x1, z1);
  plan.block(r, 'public', '하늘숲길'); batch.box(groundMat('lawn'), r.w, 0.02, r.d, r.cx, CURB + 0.01, r.cz, 0, { cast: false });
  const half = (z0 + z1) / 2;
  for (const [a, b, x] of [[z0, half, -688], [half, z1, -682]]) { const p = new Rect(x - 2, a, x + 2, b); plan.walk(p, 'path'); batch.box(groundMat('pavers', { color: 0xd8d0c0 }), p.w, 0.03, p.d, p.cx, CURB + 0.02, p.cz, 0, { cast: false }); }
  { const p = new Rect(-690, half - 2, -680, half + 2); plan.walk(p, 'path'); batch.box(groundMat('pavers', { color: 0xd8d0c0 }), p.w, 0.03, p.d, p.cx, CURB + 0.02, p.cz, 0, { cast: false }); }
  for (let z = z0 + 6; z < z1 - 4; z += 11) { tree(ctx, -696, z, 0.9 + ((z * 7) % 3) * 0.08); tree(ctx, -674, z + 5, 0.95); }
  for (let z = z0 + 12; z < z1 - 8; z += 33) { bench(ctx, z < half ? -684.6 : -678.6, z); bench(ctx, z < half ? -691.4 : -685.4, z + 14); }
  const lm = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe8c0, emissiveIntensity: 1.0 }), pm = flatMat(0x2a2c2e, { roughness: 0.5, key: 'hd_pole' });
  for (let z = z0 + 9; z < z1 - 4; z += 22) { const x = z < half ? -685.3 : -679.3; ctx.batch.add(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 8).translate(x, CURB + 1.8, z), pm); ctx.batch.add(new THREE.SphereGeometry(0.22, 10, 8).translate(x, CURB + 3.7, z), lm); }
}
// 작은 광장: the park opens into a paved square with a fountain, stepped seating, kiosks and terraces
function smallSquare(ctx) {
  const { plan, batch } = ctx, w = ctx.world, r = new Rect(SQ.x0, SQ.z0, SQ.x1, SQ.z1);
  plan.block(r, 'public', '하늘숲 광장'); plan.walk(r, 'plaza'); batch.box(lightPave(), r.w, 0.03, r.d, r.cx, CURB + 0.015, r.cz, 0, { cast: false });
  const stone = wallMat('stone', 0xb8b0a4), water = new THREE.MeshStandardMaterial({ color: 0x5a7a88, roughness: 0.05, metalness: 0.3 });
  // fountain: a round basin with a jet column
  ctx.batch.add(new THREE.CylinderGeometry(6, 6.2, 0.6, 32).translate(-685, CURB + 0.3, -50), stone); ctx.batch.add(new THREE.CylinderGeometry(5.6, 5.6, 0.05, 32).translate(-685, CURB + 0.55, -50), water);
  ctx.batch.add(new THREE.CylinderGeometry(0.4, 0.6, 2.2, 12).translate(-685, CURB + 1.1, -50), stone); w.addBoxCentered(V(-685, CURB + 0.3, -50), V(11, 0.6, 11), { surface: 'concrete', walkable: false });
  // stepped seating facing the fountain on the north side, tree planters on the south
  for (let i = 0; i < 3; i++) { const h = 0.45 * (i + 1); batch.box(stone, 24, h, 1.6, -685, CURB + h / 2, -82 + i * 1.6 * 0 - i * 1.6 + 4.8); w.addBoxCentered(V(-685, CURB + h / 2, -77.2 - i * 1.6), V(24, h, 1.6), { surface: 'concrete', walkable: false }); }
  for (const x of [-712, -700, -670, -658]) { batch.box(stone, 3, 0.6, 3, x, CURB + 0.3, -20); tree(ctx, x, -20, 1.1); }
  for (const [x, z] of [[-712, -60], [-712, -40], [-658, -60], [-658, -40]]) bench(ctx, x, z);
  // two glass kiosks and café terraces (deck + tables + umbrellas)
  const gl = new THREE.MeshStandardMaterial({ color: 0x9ab8c4, transparent: true, opacity: 0.35, roughness: 0.05 }), white = flatMat(0xeceae6, { key: 'hd_white' });
  for (const [x, z, name] of [[-712, -82, '숲 커피'], [-658, -82, '하늘 젤라또']]) { batch.box(gl, 4, 2.8, 3, x, CURB + 1.4, z); batch.box(white, 4.4, 0.3, 3.4, x, CURB + 2.95, z); w.addBoxCentered(V(x, CURB + 1.4, z), V(4, 2.8, 3), { surface: 'glass', walkable: false });
    const s = SK.flex(name, { bg: '#ffffff', fg: '#2a4a2a', w: 3.2, h: 0.5 }); s.position.set(x, CURB + 2.6, z + 1.72); SK.bake(ctx, s); }
  terrace(ctx, -716, -34, 6, 14); terrace(ctx, -652, -34, 6, 14);
  const n = SK.neon('meet me at the fountain', { color: '#7ad8ff', h: 0.7 }); n.position.set(-685, CURB + 3.2, -88.8); SK.bake(ctx, n);
}
// a café terrace: timber deck, tables with umbrellas, planter edge
function terrace(ctx, cx, cz, wdt, dep) {
  const deck = flatMat(0x9a7450, { roughness: 0.75, key: 'hd_deck' }), fabric = flatMat(0xe8e0d0, { roughness: 0.9, key: 'hd_umb' }), metal = flatMat(0x2a2c2e, { roughness: 0.4, metalness: 0.5, key: 'hd_pole' });
  ctx.batch.box(deck, wdt, 0.12, dep, cx, CURB + 0.06, cz, 0, { cast: false });
  for (let z = cz - dep / 2 + 2.2; z < cz + dep / 2 - 1; z += 3.4) { ctx.batch.add(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 16).translate(cx, CURB + 0.86, z), flatMat(0xeceae6, { key: 'hd_white' })); ctx.batch.box(metal, 0.05, 0.8, 0.05, cx, CURB + 0.5, z);
    ctx.batch.add(new THREE.ConeGeometry(1.4, 0.5, 8, 1, true).translate(cx, CURB + 2.5, z), fabric); ctx.batch.box(metal, 0.04, 2.3, 0.04, cx, CURB + 1.2, z);
    for (const d of [-0.75, 0.75]) ctx.batch.box(flatMat(0x8a6440, { key: 'hd_chair' }), 0.42, 0.45, 0.42, cx + d, CURB + 0.33, z);
    ctx.world.addBoxCentered(V(cx, CURB + 0.45, z), V(2.2, 0.9, 1.2), { surface: 'wood', walkable: false }); }
}
// 보행로: paving, planters with seats, catenary lights over it, crosswalk paint on the roads it crosses
function connector(ctx) {
  const { plan, batch } = ctx, z0 = CONN.z0, z1 = CONN.z1, zc = (z0 + z1) / 2;
  for (const [x0, x1] of [[SQ.x1, -575], [-565, ART.x0]]) { const r = new Rect(x0, z0, x1, z1); plan.block(r, 'commercial', '하늘 보행로'); plan.walk(r, 'plaza'); batch.box(lightPave(), r.w, 0.03, r.d, r.cx, CURB + 0.015, r.cz, 0, { cast: false });
    for (let x = x0 + 8; x < x1 - 6; x += 14) { batch.box(wallMat('stone', 0xb0a898), 3, 0.5, 1.4, x, CURB + 0.25, z0 + 1.2); bench(ctx, x + 4, z0 + 1.2, false); tree(ctx, x, z0 + 1.2, 0.8); } }
  const bulb = new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false }), wire = flatMat(0x1a1a1a, { key: 'hd_wire' });
  for (let x = SQ.x1 + 4; x < ART.x0 - 2; x += 6) { if (x > -577 && x < -563) continue; batch.add(new THREE.CylinderGeometry(0.01, 0.01, z1 - z0, 4).rotateX(Math.PI / 2).translate(x, CURB + 6, zc), wire); for (let z = z0 + 0.5; z < z1; z += 1.2) batch.add(new THREE.SphereGeometry(0.07, 6, 4).translate(x, CURB + 6 - 0.5 * Math.sin(((z - z0) / (z1 - z0)) * Math.PI), z), bulb, { cast: false }); }
  const zebra = paintMat(0xe8e4d8);
  for (const [x0, x1] of [[-575, -565], [ART.x0, ART.x1]]) for (let z = z0 + 0.4; z < z1 - 0.3; z += 1.0) batch.box(zebra, x1 - x0 - 1, 0.01, 0.5, (x0 + x1) / 2, 0.012, z, 0, { cast: false });
  const s = SK.pylon('하늘 보행로', [['하늘숲 광장 ←', '#2a5a3a', '#ffffff'], ['하늘길 →', '#1a4a7a', '#ffffff'], ['하늘 광장 →', '#c8641a', '#ffffff']], { h: 3.4, w: 1.1, titleBg: '#1a4a7a' });
  s.position.set(ART.x1 + 6, CURB, z0 - 2); s.rotation.y = Math.PI / 2; SK.bake(ctx, s);
}
// the extension of 하늘길 to the north: a pedestrian street (x -384..-358) next to the service road,
// commercial rows on both sides, outdoor seating down the middle
function hanulNorth(ctx, parcel, block, z0, z1) {
  const { plan, batch } = ctx;
  const ped = new Rect(-384, z0, -358, z1); plan.block(ped, 'commercial', '하늘길'); plan.walk(ped, 'plaza'); batch.box(lightPave(), ped.w, 0.03, ped.d, ped.cx, CURB + 0.015, ped.cz, 0, { cast: false });
  for (let z = z0 + 10; z < z1 - 8; z += 24) { tree(ctx, -371, z, 1); bench(ctx, -373.6, z + 6); bench(ctx, -368.4, z + 6); }
  for (let z = z0 + 22; z < z1 - 10; z += 48) terrace(ctx, -378, z, 5, 10);
  const west = block(ART.x1, z0, -384, z1); const mid = (west.x0 + west.x1) / 2;
  commRow(ctx, parcel, new Rect(west.x0, west.z0, mid - 1, west.z1), [-1, 0], { floors: [6, 10], wide: true });
  commRow(ctx, parcel, new Rect(mid + 1, west.z0, west.x1, west.z1), [1, 0], { floors: [4, 7] });
  const east = block(-349, z0, -290, z1); const m2 = (east.x0 + east.x1) / 2;
  commRow(ctx, parcel, new Rect(east.x0, east.z0, m2 - 1, east.z1), [-1, 0], { floors: [4, 7] });
  commRow(ctx, parcel, new Rect(m2 + 1, east.z0, east.x1, east.z1), [1, 0], { floors: [5, 9] });
}
// 하늘 광장: the main square across 하늘로 from 하늘길: stepped amphitheatre around a stage, a water mirror,
// tree groves with seating, a media column, café terraces along the tower fronts
function mainPlaza(ctx) {
  const { plan, batch } = ctx, w = ctx.world, P = PLAZA, r = new Rect(P.x0, P.z0, P.x1, P.z1);
  plan.block(new Rect(P.x0, P.z0, P.x1, 266), 'commercial', '하늘 광장'); plan.walk(r, 'plaza');
  batch.box(lightPave(), r.w, 0.03, r.d, r.cx, CURB + 0.015, r.cz, 0, { cast: false });
  const stone = wallMat('stone', 0xc0b8ac), water = new THREE.MeshStandardMaterial({ color: 0x3a5260, roughness: 0.02, metalness: 0.5 });
  // water mirror (shallow, edge flush) in the centre
  batch.box(stone, 40, 0.2, 22, -378, CURB + 0.1, 130); batch.box(water, 39, 0.02, 21, -378, CURB + 0.205, 130, 0, { cast: false });
  w.addBoxCentered(V(-378, CURB + 0.1, 130), V(40, 0.2, 22), { surface: 'concrete', walkable: true });
  // amphitheatre on the west side: 5 tiers facing east to a stage
  for (let i = 0; i < 5; i++) { const h = 0.4 * (i + 1), x = -456 + i * 2.2; batch.box(stone, 2.2, h, 50, x, CURB + h / 2, 130); w.addBoxCentered(V(x, CURB + h / 2, 130), V(2.2, h, 50), { surface: 'concrete', walkable: false }); }
  batch.box(stone, 12, 0.6, 20, -432, CURB + 0.3, 130); w.addBoxCentered(V(-432, CURB + 0.3, 130), V(12, 0.6, 20), { surface: 'concrete', walkable: false });
  const truss = flatMat(0x3a3c3e, { roughness: 0.4, metalness: 0.7, key: 'hd_truss' });
  for (const z of [121, 139]) batch.box(truss, 0.3, 6, 0.3, -437, CURB + 3.6, z); batch.box(truss, 0.3, 0.3, 18.6, -437, CURB + 6.5, 130);
  // tree groves with benches on the east side
  for (let x = -330; x <= -300; x += 10) for (let z = 96; z <= 184; z += 14) { tree(ctx, x, z, 1.1); bench(ctx, x + 2.2, z + 5); }
  // the media column (four-sided LED tower) on the plaza axis
  const col = new THREE.Group(); const screens = ['tour', 'music', 'cinema', 'serum'];
  col.add(new THREE.Mesh(new THREE.BoxGeometry(4.4, 12, 4.4), flatMat(0x16171a, { key: 'hd_col' })));
  screens.forEach((k, i) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), new THREE.MeshBasicMaterial({ map: ledTex(k), toneMapped: false })); const a = i * Math.PI / 2; p.position.set(Math.sin(a) * 2.21, 2.5, Math.cos(a) * 2.21); p.rotation.y = a; col.add(p); });
  col.position.set(-378, CURB + 6, 104); SK.bake(ctx, col); w.addBoxCentered(V(-378, CURB + 6, 104), V(4.4, 12, 4.4), { surface: 'metal', walkable: false });
  // café terraces along the south edge (in front of the plaza towers)
  for (const x of [-440, -405, -350, -318]) terrace(ctx, x, 192, 10, 6);
  // scramble crossing over 하늘로 (straight + diagonal stripes)
  const zebra = paintMat(0xe8e4d8);
  for (let x = -455; x < -300; x += 1.0) { if (x > -440 && x < -316) continue; } // edges handled below
  for (const xc of [-440, -371, -316]) for (let z = HR.z0 + 0.6; z < HR.z1 - 0.4; z += 1.0) batch.box(zebra, 5, 0.01, 0.5, xc, 0.012, z, 0, { cast: false });
  for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.5, 0.01, 5); for (let k = -8; k <= 8; k++) { const gg = g.clone(); gg.rotateY(s * Math.atan2(62, 20)); gg.translate(-371 + s * k * 3.6, 0.013, 70 + k * 1.15); batch.add(gg, zebra, { cast: false }); } }
}
// the plaza's south edge: three towers with very large screens, rooftop boards and a hologram at the corner
function plazaTowers(ctx, parcel) {
  const specs = [[ART.x1 + 2, -410, 22, 'tour', '하늘 플라자'], [-406, -350, 28, 'music', 'K-ARENA'], [-348, -292, 18, 'cinema', 'MOTION 하늘']];
  for (const [x0, x1, floors, ad, name] of specs) {
    const it = B.officeTower(ctx, parcel(x0, 204, x1, 262, 'business', [0, -1]), { floors, setback: 3, name });
    // the giant screen on the plaza face (podium top to mid tower), and a rooftop board
    const scr = SK.screen(ledTex(ad), Math.min(x1 - x0 - 12, 34), 16); scr.position.set((x0 + x1) / 2, CURB + 18, 207 + 3 - 0.35); scr.rotation.y = Math.PI; SK.bake(ctx, scr);
    const rb = SK.roofBoard(name, { bg: '#101418', fg: '#ffffff', w: Math.min(x1 - x0 - 16, 26), h: 4 }); rb.position.set((x0 + x1) / 2, (it?.y0 ?? CURB) + (it?.h ?? 60), 214); rb.rotation.y = Math.PI; SK.bake(ctx, rb);
  }
  const h = SK.hologram('하늘', { color: '#7ad8ff', r: 0.9, h: 1.6 }); h.position.set(-300, CURB, 196); SK.bake(ctx, h); if (h.userData.spin) (ctx.spinners ??= []).push(h.userData.spin);
}
function roadPaint(ctx) {
  const { plan, batch } = ctx, white = paintMat(0xe8e4d8), yellow = paintMat(0xd8b020);
  for (const r of plan.roads) {
    if (r.rect.x1 < DISTRICT.x0 || r.rect.x0 > DISTRICT.x1 || r.rect.z1 < DISTRICT.z0 || r.rect.z0 > DISTRICT.z1) continue;
    if (r.kind === 'alley' || r.kind === 'drive') continue;
    const R = r.rect, along = r.axis === 'z' ? R.d : R.w;
    if (r.kind === 'arterial') { for (const d of [-0.12, 0.12]) batch.box(yellow, r.axis === 'z' ? 0.12 : along, 0.01, r.axis === 'z' ? along : 0.12, R.cx + (r.axis === 'z' ? d : 0), 0.011, R.cz + (r.axis === 'z' ? 0 : d), 0, { cast: false });
      for (const o of [-7.5, -3.75, 3.75, 7.5]) for (let a = 0; a < along - 4; a += 9) batch.box(white, r.axis === 'z' ? 0.12 : 3, 0.01, r.axis === 'z' ? 3 : 0.12, R.cx + (r.axis === 'z' ? o : -along / 2 + a + 1.5), 0.011, R.cz + (r.axis === 'z' ? -along / 2 + a + 1.5 : o), 0, { cast: false }); continue; }
    for (let a = 2; a < along - 4; a += 7) batch.box(r.rect.w > 15 || r.rect.d > 15 ? yellow : white, r.axis === 'z' ? 0.12 : 3.5, 0.01, r.axis === 'z' ? 3.5 : 0.12, r.axis === 'z' ? R.cx : R.x0 + a + 1.75, 0.011, r.axis === 'z' ? R.z0 + a + 1.75 : R.cz, 0, { cast: false });
  }
  // crosswalks on the arterial at 하늘로 and 와우로
  for (const zc of [(HR.z0 + HR.z1) / 2, (WR.z0 + WR.z1) / 2]) for (const s of [-1, 1]) for (let x = ART.x0 + 0.6; x < ART.x1 - 0.4; x += 1.0) batch.box(white, 0.5, 0.01, 4, x, 0.012, zc + s * ((zc === 70 ? 10 : 7) + 3), 0, { cast: false });
}
