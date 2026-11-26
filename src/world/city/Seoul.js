// Seoul, downtown (fictional streets) — the large-city layout for later Seoul missions. Separate from the
// fictional Yeonseo City of M02, which keeps its own avenue level (levels/YeonseoCity.js).
//
// ROAD NETWORK
//   중앙대로 (arterial, N-S): carriageway x -12..12 (3 lanes each way + median), sidewalks to x ±16
//   cross streets (local, E-W) at z -120, -40, 40, 120: carriageway z ±4.5, sidewalks to ±7
//   back streets (alleys, N-S) x ±40..48 behind the frontage, except where a superblock sits (B west: the
//   apartment complex, B east: the school, E west north: the hospital); villa alley x 62..66 in E east
//   overpass band z 157..173 (elevated road) — nothing is built inside it, parking below
// ZONES (north → south; the convoy enters from the north)
//   A  z -260..-127  industrial both sides (logistics, warehouses, factories, a gas station on the corner)
//   B  z -113..-47   residential (west: 한빛마을 apartment complex + its shops) · public (east: elementary school)
//   C  z -33..33     commercial core around 중앙로역 (shops 5-10 floors, station plaza with exit 3, rear food alley)
//   D  z 47..113     business (office towers set back behind plazas, bank, offices, parking)
//   E  z 127..260    public (west: hospital, park) · residential (east: shop-houses on the avenue, villas behind)
import * as THREE from 'three';
import { CityPlan, Rect, Batch } from './CityPlan.js';
import { FacadeSet } from '../Facade.js';
import * as B from './Buildings.js';
import { buildGround, markings, median, furnishSidewalk, TreeBatch, placeCar, parkAlong, lamp, signal, CURB, CarBatch, bakeStatic } from './Streets.js';
import { CityKit } from '../CityProps.js';
import { groundMat } from './CityMaterials.js';
import { buildNewDistrict, inLake } from './NewDistrict.js';
import { buildHaneulDistrict } from './HaneulDistrict.js';
import { CityLod } from './CityLod.js';
import { Region, outerGround, REGION_EXT } from './Region.js';
import { carType } from '../korea/Cars.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const LAYOUT = {
  avenueHalf: 12, walk: 4, front: 16, backStreet: [40, 48], cross: [-120, -40, 40, 120], crossHalf: 4.5, crossWalk: 2.5,
  overpass: [157, 173], stationExit: V(20, 0, 20),
  // example scripted vehicle routes (a mission passes its own: nothing is parked or built in them)
  corridors: [{ rect: new Rect(-4.7, -230, -0.3, -117), why: 'convoy route' }, { rect: new Rect(-9.2, 0, -2.3, 203), why: 'escort / bus route' }, { rect: new Rect(8, 114.5, 62, 125.5), why: 'technical route' }],
};

export function buildSeoul(game, { station = null, early = null, corridors = [], jam = false, district = true, region: regionOn = true } = {}) {
  const scene = game.renderer.scene, world = game.world, L = LAYOUT;
  let seed = 20260320; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const plan = new CityPlan({});
  // terrain: carriageways at 0, land (sidewalks, lots) at CURB; the station interior keeps its own levels
  const S = station;
  const heightFn = (x, z) => {
    if (S && x > 290) return x > S.pit[0] && x < S.pit[1] && z > S.z0 && z < S.z1 ? -1.3 : 0;
    if (x > 216 && inLake(x, z)) return -0.9;
    for (const r of plan.carriageways) if (r.rect.has(x, z)) return 0;
    if (x < REGION_EXT.x0 - 150 || x > REGION_EXT.x1 + 150 || z < REGION_EXT.z0 - 150 || z > REGION_EXT.z1 + 150) return outerGround(x, z);   // greenbelt hills, satellite towns
    return CURB;
  };
  plan.heightFn = heightFn;
  world.setTerrain(heightFn, () => 'concrete');
  const batch = new Batch(scene); plan.batch = batch;
  const landmarkBatch = new Batch(scene); landmarkBatch.lodAlways = true;
  const fac = new FacadeSet(game, {});
  const ctx = { game, scene, world, plan, batch, landmarkBatch, fac, rnd, ground: heightFn, cur: null };
  ctx.ownBegin = (it) => { ctx.cur = it; batch.owner = it; fac.owner = it; };
  ctx.ownEnd = () => { ctx.cur = null; batch.owner = null; fac.owner = null; };
  ctx.own = (o) => { if (ctx.cur) (ctx.cur.objs ||= []).push(o); };
  let addrN = 100; ctx.addr = () => `중앙대로 ${addrN += 2 + Math.floor(rnd() * 6)}`;
  ctx.treeBatch = new TreeBatch(ctx);
  ctx.carBatch = new CarBatch(scene);
  ctx.trees = (pts, { kind = 'leaf', mix = 0 } = {}) => pts.forEach(([x, z]) => ctx.treeBatch.add(x, z, { kind: rnd() < mix ? 'pine' : kind }));
  ctx.car = (type, x, z, rot, o = {}) => placeCar(ctx, type, x, z, rot, o);
  ctx.meshMat = () => game.props._fenceMat || (game.props.fence(0, 0, 0.01, 0, { collide: false, wire: false }), game.props._fenceMat);

  // ---------------------------------------------------------------- 1. road network
  const zc = L.cross, ch = L.crossHalf;
  plan.road(new Rect(-L.avenueHalf, -270, L.avenueHalf, 270), 'arterial', 'z');
  for (const z of zc) plan.road(new Rect(-200, z - ch, 200, z + ch), 'local', 'x');
  const bands = { A: [-270, zc[0] - ch], B: [zc[0] + ch, zc[1] - ch], C: [zc[1] + ch, zc[2] - ch], D: [zc[2] + ch, zc[3] - ch], E: [zc[3] + ch, 270] };
  const [bs0, bs1] = L.backStreet;
  const backStreet = { A: [1, -1], C: [1, -1], D: [1, -1], E: [1] };           // sides with a back street per band
  for (const [band, sides] of Object.entries(backStreet)) for (const s of sides) { const [z0, z1] = bands[band]; plan.road(new Rect(s * bs0, z0, s * bs1, z1), 'alley', 'z'); }
  plan.road(new Rect(-bs1, bands.E[0] + 32.5 + 0.0, -bs0, 270), 'alley', 'z');   // west E: alley starts south of the hospital
  plan.road(new Rect(62, bands.E[0], 66, 270), 'alley', 'z');                     // villa alley
  plan.reserve(new Rect(-220, L.overpass[0], 220, L.overpass[1]), 'overpass', 'overpass band');
  for (const c of corridors) plan.reserve(c.rect, 'vehicle', c.why);   // scripted vehicle routes of the mission using the city

  // ---------------------------------------------------------------- 2. blocks (land), sidewalks, zones
  const zoneOf = { A: ['industrial', 'industrial'], B: ['residential', 'public'], C: ['commercial', 'commercial'], D: ['business', 'business'], E: ['public', 'residential'] };
  for (const [band, [z0, z1]] of Object.entries(bands)) for (const s of [-1, 1]) {
    const zone = zoneOf[band][s < 0 ? 0 : 1];
    // land between the avenue and the far edge; carved by the back street where there is one (roads are drawn over)
    const land = s > 0 ? new Rect(L.avenueHalf, z0, 200, z1) : new Rect(-200, z0, -L.avenueHalf, z1);
    plan.block(land, zone, `${band}${s > 0 ? 'E' : 'W'}`);
    plan.walk(s > 0 ? new Rect(L.avenueHalf, z0, L.front, z1) : new Rect(-L.front, z0, -L.avenueHalf, z1), 'sidewalk');
    // cross-street sidewalks along the block's cross-street edges
    const xs = s > 0 ? [L.front, 200] : [-200, -L.front];
    if (band !== 'A') plan.walk(new Rect(xs[0], z0, xs[1], z0 + L.crossWalk), 'sidewalk');
    if (band !== 'E') plan.walk(new Rect(xs[0], z1 - L.crossWalk, xs[1], z1), 'sidewalk');
  }
  const pz0 = (band) => bands[band][0] + (band === 'A' ? 0 : L.crossWalk), pz1 = (band) => bands[band][1] - (band === 'E' ? 0 : L.crossWalk);
  // streets around a parcel: which faces touch which kind of street
  const streets = (rect) => {
    const out = {}; const probe = (nx, nz) => { const x = nx > 0 ? rect.x1 + 1 : nx < 0 ? rect.x0 - 1 : rect.cx, z = nz > 0 ? rect.z1 + 1 : nz < 0 ? rect.z0 - 1 : rect.cz;
      const r = plan.roads.find((q) => q.kind !== 'drive' && q.rect.has(x, z)); if (r) return r.kind;
      const w = plan.walks.find((q) => q.rect.has(x, z)); return w ? (w.kind === 'sidewalk' ? 'sidewalk' : w.kind) : null; };
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = probe(nx, nz); if (k) out[`${nx},${nz}`] = k; }
    return out;
  };
  const parcel = (x0, z0, x1, z1, zone, front) => { const rect = new Rect(x0, z0, x1, z1); return { rect, zone, front, streets: streets(rect) }; };
  const mirror = (s, a, b) => (s > 0 ? [a, b] : [-b, -a]);   // x range on side s

  // ---------------------------------------------------------------- 3-4. parcels and buildings, zone by zone
  const F = L.front, fx = (s) => [-s, 0];                     // front faces the avenue
  const build = [];
  // A — industrial
  for (const s of [-1, 1]) {
    const [a0, a1] = mirror(s, F, bs0), [r0, r1] = mirror(s, bs1, 88);
    if (s > 0) { build.push(() => B.gasStation(ctx, parcel(a0, pz1('A') - 24, a1, pz1('A'), 'industrial', fx(s))));
      build.push(() => B.industrial(ctx, parcel(a0, -205, a1, pz1('A') - 26, 'industrial', fx(s)), { use: 'warehouse' })); }
    else build.push(() => B.industrial(ctx, parcel(a0, -190, a1, pz1('A'), 'industrial', fx(s)), { use: 'logistics' }));
    build.push(() => B.industrial(ctx, parcel(a0, -262, a1, s > 0 ? -207 : -192, 'industrial', fx(s)), { use: 'warehouse' }));
    build.push(() => B.industrial(ctx, parcel(r0, -200, r1, pz1('A'), 'industrial', [s > 0 ? -1 : 1, 0]), { use: 'factory' }));
    build.push(() => B.industrial(ctx, parcel(r0, -262, r1, -202, 'industrial', [s > 0 ? -1 : 1, 0]), { use: 'warehouse' }));
  }
  // B west — apartment complex + its shops + residents' parking; B east — school
  build.push(() => B.apartmentComplex(ctx, { rect: new Rect(-92, pz0('B'), -F, -66), zone: 'residential', streets: streets(new Rect(-92, pz0('B'), -F, -66)) }, { name: '한빛마을 3단지', floors: 18, accent: 0x3a6a9a, firstDong: 301 }));
  build.push(() => B.commercial(ctx, parcel(-42, -64, -F, pz1('B'), 'residential', [1, 0]), { use: 'apartmentShops', floors: 3, cats: ['store', 'pharmacy', 'cafe', 'restaurant', 'salon', 'office', 'clinic'], signStyle: 'box' }));
  build.push(() => B.parkingLot(ctx, parcel(-92, -64, -44, pz1('B'), 'residential', [0, 1])));
  build.push(() => B.school(ctx, { rect: new Rect(F, pz0('B'), 92, pz1('B')), zone: 'public', streets: streets(new Rect(F, pz0('B'), 92, pz1('B'))) }, { name: '한빛초등학교' }));
  // C — commercial core
  const coreE = [[pz0('C'), -19, 7], [-19, -6, 9], [-6, 8, 10]], coreW = [[pz0('C'), -20, 6], [-20, -4, 8], [-4, 12, 7], [12, pz1('C'), 9]];
  for (const [z0, z1, fl] of coreE) build.push(() => B.commercial(ctx, parcel(F, z0, bs0, z1, 'commercial', [-1, 0]), { use: fl >= 9 ? 'shopsTall' : 'shops', floors: fl }));
  for (const [z0, z1, fl] of coreW) build.push(() => B.commercial(ctx, parcel(-bs0, z0, -F, z1, 'commercial', [1, 0]), { use: fl >= 9 ? 'shopsTall' : 'shops', floors: fl }));
  // station plaza (exit 3) and the building that faces it
  const plaza = new Rect(F, 8, 28, pz1('C'));
  plan.walk(plaza, 'plaza');
  build.push(() => B.commercial(ctx, parcel(28, 8, bs0, pz1('C'), 'commercial', [-1, 0]), { use: 'shopsTall', floors: 11, wall: { kind: 'panel', color: 0xa8b0b8 }, signStyle: 'channel' }));
  // rear: food alley shops facing the back street, public parking
  for (const s of [-1, 1]) {
    const [r0, r1] = mirror(s, bs1, 84), fr = [s > 0 ? -1 : 1, 0];
    build.push(() => B.parkingLot(ctx, parcel(r0, s > 0 ? pz0('C') : 6, r1, s > 0 ? -8 : pz1('C'), 'commercial', fr)));
    const spans = s > 0 ? [[-8, 6], [6, 20], [20, pz1('C')]] : [[pz0('C'), -18], [-18, -6], [-6, 6]];
    for (const [z0, z1] of spans) build.push(() => B.commercial(ctx, parcel(...(s > 0 ? [bs1, z0, bs1 + 18, z1] : [-bs1 - 18, z0, -bs1, z1]), 'commercial', fr), { floors: 3 + Math.floor(rnd() * 2), cats: ['restaurant', 'cafe', 'store'], signStyle: 'box', vacant: 0.2 }));
  }
  // D — business
  build.push(() => B.officeTower(ctx, parcel(F, pz0('D'), bs0, 80, 'business', [-1, 0]), { floors: 18, name: '한빛생명', tint: 0x26343e }));
  build.push(() => B.bank(ctx, parcel(F, 80, bs0, 96, 'business', [-1, 0])));
  build.push(() => B.commercial(ctx, parcel(F, 96, bs0, pz1('D'), 'business', [-1, 0]), { use: 'office', floors: 9, cats: ['office', 'cafe', 'store', 'clinic'], wall: { kind: 'stone', color: 0x9a9890 }, signStyle: 'channel', vacant: 0.05 }));
  build.push(() => B.officeTower(ctx, parcel(-bs0, pz0('D'), -F, 79, 'business', [1, 0]), { floors: 22, name: '미래금융센터', tint: 0x2a3640, use: 'officeTall' }));
  build.push(() => B.commercial(ctx, parcel(-bs0, 79, -F, 97, 'business', [1, 0]), { use: 'office', floors: 8, cats: ['office', 'cafe', 'store'], wall: { kind: 'panel', color: 0x8a9298 }, signStyle: 'channel', vacant: 0.05 }));
  build.push(() => B.bank(ctx, parcel(-bs0, 97, -F, pz1('D'), 'business', [1, 0])));
  for (const s of [-1, 1]) { const [r0, r1] = mirror(s, bs1, 84), fr = [s > 0 ? -1 : 1, 0];
    build.push(() => B.parkingLot(ctx, parcel(r0, pz0('D'), r1, 80, 'business', fr)));
    build.push(() => B.commercial(ctx, parcel(...(s > 0 ? [bs1, 80, bs1 + 20, pz1('D')] : [-bs1 - 20, 80, -bs1, pz1('D')]), 'business', fr), { use: 'office', floors: 6, cats: ['office', 'cafe', 'restaurant'], vacant: 0.1 })); }
  // E west — hospital (north of the overpass), park (south); E east — shop-houses on the avenue, villas behind
  build.push(() => B.hospital(ctx, parcel(-92, pz0('E'), -F, L.overpass[0] - 1, 'public', [1, 0]), { name: '서울중앙병원' }));
  build.push(() => B.park(ctx, { rect: new Rect(-bs0, L.overpass[1] + 1, -F, 232), zone: 'public', streets: streets(new Rect(-bs0, L.overpass[1] + 1, -F, 232)) }));
  build.push(() => B.park(ctx, { rect: new Rect(-92, L.overpass[1] + 1, -bs1, 232), zone: 'public', streets: streets(new Rect(-92, L.overpass[1] + 1, -bs1, 232)) }));
  for (const [z0, z1] of [[pz0('E'), L.overpass[0] - 1], [L.overpass[1] + 1, 260]]) {
    let z = z0; while (z1 - z > 12) { const w = Math.min(z1 - z, 12 + Math.floor(rnd() * 5)); const a = z, b = z + w;
      build.push(() => B.commercial(ctx, parcel(F, a, bs0 - 8, b - 0.4, 'residential', [-1, 0]), { use: 'mixedShops', floors: 4 + Math.floor(rnd() * 2), upper: 'villa', cats: ['store', 'restaurant', 'cafe', 'salon', 'office', 'pharmacy'], wall: { kind: rnd() < 0.5 ? 'brick' : 'tile', color: rnd() < 0.5 ? 0x8a5444 : 0xd0c8b8 }, signStyle: 'box', vacant: 0.18 }));
      z = b; }
    // villas: one row on the back street, one on the villa alley; houses behind
    for (const [x0, x1, fr] of [[bs1, 61.6, [-1, 0]], [66.2, 80, [-1, 0]]]) { let q = z0; while (z1 - q > 11) { const a = q, w = 12 + Math.floor(rnd() * 3); build.push(() => B.villa(ctx, parcel(x0, a, x1, a + w, 'residential', fr))); q += w + 1.5; } }
  }
  // under the overpass: parking on both sides
  for (const [x0, x1] of [[F, bs0], [bs1, 61.6], [-bs0, -F], [-92, -bs1]]) build.push(() => B.parkingLot(ctx, parcel(x0, L.overpass[0], x1, L.overpass[1], x0 > 0 ? 'residential' : 'public', [x0 > 0 ? -1 : 1, 0]), { fill: 0.35 }));

  // station exit 3 on the plaza (registered first so nothing is built over its approach)
  const kit = new CityKit(game); ctx.kit = kit;
  const ex = L.stationExit; const exit = kit.subwayEntrance(ex.x, ex.z, 0, '중앙로역 3번 출구'); exit.position.y = CURB;
  plan.add({ kind: 'structure', id: 'subway-exit-3', use: 'plaza', zone: 'commercial', rect: Rect.c(ex.x, ex.z, 3.5, 6.2), y0: CURB, h: 3.1, obj: exit, entrances: [{ x: ex.x, z: ex.z + 3.1, nx: 0, nz: 1 }] });
  early?.(ctx);
  for (const f of build) f();
  // the new district east of the old centre (its own roads, blocks, landmark, central station)
  if (district) buildNewDistrict(ctx);
  // the hand-made quarter west of the old centre (하늘길 …)
  if (district) buildHaneulDistrict(ctx);

  // ---------------------------------------------------------------- 5. streetscape
  const junctions = zc.map((z) => ({ z0: z - ch, z1: z + ch }));
  buildGround(ctx);
  markings(ctx, { avenue: { z0: -270, z1: 270 }, junctions, half: L.avenueHalf });
  // medians between junctions (clear of the crosswalks), broken at the evacuation checkpoint
  { let z = -270; for (const j of junctions) { median(ctx, { z0: z + 4.5, z1: j.z0 - 4.5 - 4 }); z = j.z1 + 4; } median(ctx, { z0: z + 4.5, z1: 198 }); median(ctx, { z0: 212, z1: 270 }); }
  const avoidPts = plan.items.flatMap((it) => it.entrances.map((e) => ({ x: e.x, z: e.z, r: e.gate ? 4.5 : 1.6 })));
  avoidPts.push({ x: ex.x, z: ex.z, r: 5 });
  for (const s of [-1, 1]) for (const [band, [z0, z1]] of Object.entries(bands)) {
    const walk = new Rect(s > 0 ? L.avenueHalf : -L.front, z0, s > 0 ? L.front : -L.avenueHalf, z1);
    // bus stop on the far-side of each long frontage, in the furniture zone
    furnishSidewalk(ctx, walk, { axis: 'z', curb: s * L.avenueHalf, out: -s, crossings: zc, avoid: avoidPts });
  }
  // signals: vehicle signal (arm over the lanes) on the near-right corner of each approach, pedestrian signals on the others
  for (const z of zc) for (const s of [-1, 1]) for (const t of [-1, 1]) signal(ctx, s * (L.avenueHalf + 0.6), z + t * (ch + 0.9), { arm: s === t ? -s : 0, face: t });
  for (const [x, z, r] of [[-L.avenueHalf - 2.2, -60, Math.PI / 2], [L.avenueHalf + 2.2, 60, -Math.PI / 2], [L.avenueHalf + 2.2, -88, -Math.PI / 2], [-L.avenueHalf - 2.2, 96, Math.PI / 2]]) {
    const rect = Rect.c(x, z, 1.8, 4.2); if (!plan.free(rect) || avoidPts.some((p) => Math.hypot(p.x - x, p.z - z) < 3)) continue;
    kit.busShelter(x, z, r); const sh = scene.children[scene.children.length - 1]; sh.position.y = CURB;
    plan.add({ kind: 'prop', id: `busstop${z}`, rect, y0: CURB, h: 2.6, obj: sh, tags: ['bake'] });
  }

  // ---------------------------------------------------------------- 6. vehicles
  // abandoned in the avenue lanes (evacuation jam), never in a scripted corridor
  const lanes = [-10.3, -6.8, -3.3, 3.3, 6.8, 10.3];
  for (let z = -255; z < 255; z += 7 + rnd() * 9) {
    const x = lanes[Math.floor(rnd() * lanes.length)] + (rnd() - 0.5) * 0.6; if (junctions.some((j) => z > j.z0 - 6 && z < j.z1 + 6)) continue;
    if (rnd() < 0.45) placeCar(ctx, carType(rnd), x, z, (x > 0 ? Math.PI : 0) + (rnd() - 0.5) * 0.35, { state: rnd() < 0.25 ? 'burnt' : rnd() < 0.4 ? 'damaged' : 'dusty' });
  }
  // an evacuation jam at the z -120 junction (optional): cars stopped in the lanes
  if (jam) for (const [x, z, r] of [[-7.0, -111.5, 0.12], [-10.3, -107.5, -0.08], [3.4, -110.5, Math.PI - 0.1], [6.9, -105.5, Math.PI + 0.2], [-6.8, -102.5, 0.05], [-3.3, -100.5, -0.1], [-10.2, -99, 0.04], [10.3, -112, Math.PI], [-6.9, -133.5, 0.06], [-10.2, -138, 0.1]])
    placeCar(ctx, carType(rnd), x, z, r, { state: 'dusty' });
  // parallel parking along the cross streets and back streets
  for (const z of zc) for (const s of [-1, 1]) for (const side of [-1, 1]) parkAlong(ctx, { axis: 'x', line: z + side * (ch - 1.1), from: s > 0 ? L.front + 4 : -bs0 + 2, to: s > 0 ? bs0 - 2 : -L.front - 4, dir: side, fill: 0.45 });
  for (const r of plan.roads.filter((q) => q.kind === 'alley')) parkAlong(ctx, { axis: 'z', line: r.rect.x1 - 1.1, from: r.rect.z0 + 8, to: r.rect.z1 - 8, dir: 1, fill: 0.35 });

  // ---------------------------------------------------------------- backdrop: the city continues beyond the playable streets
  // (visual only), each band keeps its zone: industrial north, apartments west, mid-rise centre, towers in the
  // business band, low-rise south; a street grid every ~55 m
  const asph = plan.carriageways[0];
  const kindOf = { A: ['industrial', 'industrial'], B: ['apartment', 'apartment'], C: ['commercial', 'commercial'], D: ['tower', 'tower'], E: ['house', 'villa'] };
  for (const [band, [z0, z1]] of Object.entries(bands)) for (const s of [-1, 1]) {
    const kind = kindOf[band][s < 0 ? 0 : 1];
    for (let a = 96; a < 196; a += 55) for (let z = z0 + 3; z < z1 - 8; z += 50) {
      const zz1 = Math.min(z1 - 3, z + 44); if (zz1 - z < 12) continue;
      const x0 = s > 0 ? a : -a - 47, x1 = s > 0 ? a + 47 : -a;
      if (kind === 'industrial') { for (let q = z; q < zz1 - 10; q += 24) B.backdrop(ctx, new Rect(x0 + 3, q, x1 - 3, Math.min(zz1, q + 20)), 8 + rnd() * 4, 'industrial'); }
      else if (kind === 'apartment') { for (let q = z + 2; q < zz1 - 10; q += 22) B.backdrop(ctx, new Rect(x0 + 4, q, x1 - 4, q + 12), 3 + 2.8 * (15 + Math.floor(rnd() * 9)), 'apartment', 2); }
      else if (kind === 'tower') { B.backdrop(ctx, new Rect(x0 + 6, z + 4, x0 + 26, z + 24), 50 + rnd() * 40, 'tower', 1); B.backdrop(ctx, new Rect(x1 - 20, zz1 - 22, x1 - 4, zz1 - 4), 30 + rnd() * 25, 'tower', 3); }
      else if (kind === 'commercial') { for (let q = z; q < zz1 - 8; q += 15) for (const [u0, u1] of [[x0 + 2, x0 + 22], [x1 - 22, x1 - 2]]) B.backdrop(ctx, new Rect(u0, q, u1, q + 14), 12 + rnd() * 18, 'commercial', Math.floor(rnd() * 5)); }
      else { for (let q = z; q < zz1 - 8; q += 13) for (let u = x0 + 2; u < x1 - 10; u += 13) B.backdrop(ctx, new Rect(u, q, u + 11, q + 11), kind === 'house' ? 6 : 11 + rnd() * 3, kind === 'house' ? 'house' : 'commercial', Math.floor(rnd() * 5)); }
      // grid street east and south of the cell
      batch.box(groundMat('asphalt'), 6, 0.02, z1 - z0, s > 0 ? a - 4 : -a + 4, CURB + 0.01, (z0 + z1) / 2, 0, { cast: false });
    }
  }

  // ---------------------------------------------------------------- 7. validate, then build merged geometry
  const report = plan.validate(world);
  bakeStatic(ctx);
  ctx.treeBatch.build();
  ctx.carBatch.build(plan.removedSet);
  batch.build(plan.removedSet);
  fac.build(plan.removedSet);
  landmarkBatch.build();
  // LOD: building volumes per 60 m cell (HLOD proxies + occluders), then sort the city meshes into near / mid / full
  const lod = new CityLod(game);
  const tint = { apartment: 0xe4e0d6, villa: 0x9a6a54, office: 0x6a8090, officeTall: 0x5a7486, shops: 0xd0c8b8, shopsTall: 0xa8b0b8, bank: 0xbab4a6, school: 0x9a5a44, hospital: 0xe6e4de, mixedShops: 0xc8a890, apartmentShops: 0xd8d2c4, warehouse: 0xa9b0b4, logistics: 0xa9b0b4, factory: 0xa9b0b4, gas: 0xe8e6e0, house: 0xd8ccb8, civic: 0x8a9ca8 };
  for (const it of plan.items) if (it.kind === 'building' && it.id !== 'landmark' && it.rect) lod.box(it.rect, it.y0, it.h, tint[it.use] ?? 0xc8c4bc);
  const region = regionOn && !(typeof location !== 'undefined' && /[?&]noregion\b/.test(location.search)) ? new Region(ctx, lod) : null;   // ?noregion: dev switch
  lod.collect(scene);
  return { plan, report, kit, ctx, lod, region };
}
