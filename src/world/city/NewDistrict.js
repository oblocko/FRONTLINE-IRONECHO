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

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const ND = {
  x0: 216, x1: 720, boulevard: [408, 432], walk: 6, sw: 4, connector: [200, 216],
  roadsX: [[-104, -84, 216, 720], [-236, -224, 216, 720], [150, 162, 216, 720], [-16, -4, 432, 720]],     // E-W [z0, z1, x0, x1]
  roadsZ: [[270, 282], [612, 624]],                                                                     // N-S [x0, x1] (full length)
  rail: { z0: -172, z1: -132, y: 9 },
  lakes: [{ cx: 522, cz: 70, rx: 72, rz: 44 }, { cx: 345, cz: 95, rx: 52, rz: 44 }],
  tower: V(488, 0, -50), station: { x0: 288, x1: 402, z0: -200, z1: -124 },
};
// lakes are below the land: water at -0.9 inside the ellipse (heightFn uses this)
export function inLake(x, z, grow = 0) { return ND.lakes.some((l) => ((x - l.cx) / (l.rx + grow)) ** 2 + ((z - l.cz) / (l.rz + grow)) ** 2 < 1); }

export function buildNewDistrict(ctx) {
  const { plan, batch, scene, world, rnd } = ctx, L = ND, [bx0, bx1] = L.boulevard;
  // ---------------------------------------------------------------- roads
  plan.road(new Rect(L.connector[0], -300, L.connector[1], 300), 'arterial', 'z');
  plan.road(new Rect(bx0, -300, bx1, 300), 'arterial', 'z');
  for (const [z0, z1, x0, x1] of L.roadsX) plan.road(new Rect(x0, z0, x1, z1), z1 - z0 > 15 ? 'arterial' : 'local', 'x');
  for (const [x0, x1] of L.roadsZ) plan.road(new Rect(x0, -300, x1, 300), 'local', 'z');
  plan.reserve(new Rect(L.connector[1], L.rail.z0, L.x1, L.rail.z1), 'overpass', 'rail viaduct');
  // blocks = the cells between roads (per side), sidewalks along every edge that meets a road
  const xCuts = { W: [[216, 270], [282, bx0]], E: [[bx1, 612], [624, L.x1]] };
  const zCuts = { W: [[-300, -236], [-224, -104], [-84, 150], [162, 300]], E: [[-300, -236], [-224, -104], [-84, -16], [-4, 150], [162, 300]] };
  const cells = [];
  for (const side of ['W', 'E']) for (const [x0, x1] of xCuts[side]) for (const [z0, z1] of zCuts[side]) {
    const r = new Rect(x0, z0, x1, z1); cells.push(r);
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
  for (let x = deck.x0 + 12; x < deck.x1; x += 26) { const pr = Rect.c(x, deck.cz, 2.2, 6); if (plan.carriageways.some((r) => r.rect.hits(pr))) continue;
    batch.box(conc, 2.2, R.y - 1.6, 6, x, (R.y - 1.6) / 2 + 0.07, deck.cz); plan.add({ kind: 'structure', id: `railpier${x | 0}`, rect: pr, y0: CURB, h: R.y - 1.6, colliders: [world.addBox(V(pr.x0, 0, pr.z0), V(pr.x1, R.y - 1.6, pr.z1), { surface: 'concrete' })] }); }
  plan.add({ kind: 'structure', id: 'viaduct', rect: deck, y0: R.y - 1.6, h: 3, tags: ['elevated', 'onRoad'] });
  // tracks
  const rail2 = flatMat(0x6a6460, { roughness: 0.5, metalness: 0.7, key: 'rail' });
  for (const tz of [R.z0 + 2, R.z0 + 6.5, R.z1 - 6.5, R.z1 - 2]) for (const s of [-0.72, 0.72]) batch.box(rail2, deck.w, 0.16, 0.08, deck.cx, R.y + 0.1, tz + s, 0, { cast: false });
  // 연서중앙역 — a through station on the viaduct:
  //   train shed   a 320 m glass barrel vault along the tracks (steel ribs every 8 m), over the viaduct
  //   concourse    a north-south glass hall crossing the shed, entered from the plaza
  //   gate offices two glass office slabs either side of the concourse, bridging over the shed
  //   portal       a big steel arch on the plaza front with glass infill; a wave lattice canopy over the plaza
  const steel = flatMat(0xd8dcde, { roughness: 0.4, metalness: 0.7, key: 'steelw' });
  const vaultGlass = new THREE.MeshStandardMaterial({ color: 0x9ab0bc, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const shed = { x0: 236, x1: 556, z0: R.z0 - 2, z1: R.z1 + 2 }, spring = R.y + 7, rise = 15;
  { const n = 18, pos = [], idx = [];
    for (let i = 0; i <= n; i++) { const a = i / n, zz = shed.z0 + a * (shed.z1 - shed.z0), yy = spring + Math.sin(a * Math.PI) * rise; pos.push(shed.x0, yy, zz, shed.x1, yy, zz); }
    for (let i = 0; i < n; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); vg.setIndex(idx); vg.computeVertexNormals(); const vm = new THREE.Mesh(vg, vaultGlass); vm.userData.cell = `${Math.floor(396 / 60)},${Math.floor(-152 / 60)}`; scene.add(vm);
    for (let x = shed.x0; x <= shed.x1 + 0.01; x += 8) for (let i = 0; i < n; i++) { const a0 = i / n, a1 = (i + 1) / n; const z0 = shed.z0 + a0 * (shed.z1 - shed.z0), z1 = shed.z0 + a1 * (shed.z1 - shed.z0), y0 = spring + Math.sin(a0 * Math.PI) * rise, y1 = spring + Math.sin(a1 * Math.PI) * rise;
      const len = Math.hypot(z1 - z0, y1 - y0); const g = new THREE.BoxGeometry(0.4, 0.6, len); g.rotateX(-Math.atan2(y1 - y0, z1 - z0)); g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2); batch.add(g, steel); }
    for (const zz of [shed.z0, shed.z1]) { batch.box(steel, shed.x1 - shed.x0, 0.8, 0.8, (shed.x0 + shed.x1) / 2, spring, zz); for (let x = shed.x0; x <= shed.x1; x += 16) batch.box(steel, 0.6, spring - R.y, 0.6, x, (spring + R.y) / 2, zz); }
    // platforms + canopy edge lights under the vault
    for (const zz of [R.z0 + 9, R.z1 - 9, (R.z0 + R.z1) / 2]) batch.box(flatMat(0xb0aca4, { key: 'platform' }), shed.x1 - shed.x0, 1.0, 5, (shed.x0 + shed.x1) / 2, R.y + 0.5, zz); }
  // concourse hall (crosses the shed), glass with fine mullions
  const hall = new Rect(S.x0 + 30, S.z0, S.x1 - 30, S.z1), hy = spring + rise + 4;
  const glassHall = curtainMat({ glass: 0x6a8494, spandrel: 0xb8c0c4, mullion: 0xe0e4e6, bays: 8, floorH: 6, spandrelH: 0.25, key: 'hall' });
  batch.add(shell([{ y: CURB, pts: outline('rect', hall.w, hall.d) }, { y: hy, pts: outline('rect', hall.w, hall.d) }], { cx: hall.cx, cz: hall.cz, uM: 6, vM: 6 }), glassHall);
  batch.add(cap(outline('rect', hall.w + 2, hall.d + 2), hy, { cx: hall.cx, cz: hall.cz }), flatMat(0xd8dcde, { roughness: 0.4, metalness: 0.5, key: 'hallroof' }));
  // gate offices: legs north and south of the shed, a bridge block over it
  const offM = curtainMat({ glass: 0x4e6878, spandrel: 0x8a96a0, mullion: 0xc8d0d4, floorH: 4, key: 'gate' });
  for (const [x0, x1] of [[S.x0, hall.x0 - 1], [hall.x1 + 1, S.x1]]) {
    const w = x1 - x0, cx = (x0 + x1) / 2, top = hy + 14;
    for (const [z0, z1] of [[S.z0, shed.z0 - 1], [shed.z1 + 1, S.z1]]) { const pts = outline('rect', w, z1 - z0); batch.add(shell([{ y: CURB, pts }, { y: top, pts }], { cx, cz: (z0 + z1) / 2, uM: 6, vM: 4 }), offM); batch.add(cap(pts, top, { cx, cz: (z0 + z1) / 2 }), flatMat(0x8a8c88, { key: 'mroof' }));
      plan.add({ kind: 'building', id: `gate${x0}${z0}`, use: 'office', zone: 'business', rect: new Rect(x0, z0, x1, z1), y0: CURB, h: top, colliders: [world.addBox(V(x0, CURB, z0), V(x1, top, z1), { surface: 'concrete', cover: true, walkable: false })], entrances: [] }); }
    const bp = outline('rect', w, shed.z1 - shed.z0 + 2); batch.add(shell([{ y: hy - 2, pts: bp }, { y: top, pts: bp }], { cx, cz: (shed.z0 + shed.z1) / 2, uM: 6, vM: 4 }), offM); batch.add(cap(bp, hy - 2, { cx, cz: (shed.z0 + shed.z1) / 2 }), steel); batch.add(cap(bp, top, { cx, cz: (shed.z0 + shed.z1) / 2 }), flatMat(0x8a8c88, { key: 'mroof' }));
  }
  // portal arch on the plaza front with glass infill + name
  const portalR = Math.min(hall.w / 2 - 2, 22);
  { const tg = new THREE.TorusGeometry(portalR, 1.1, 8, 32, Math.PI); tg.translate(hall.cx, CURB + 4, hall.z1 + 1.2); batch.add(tg, steel);
    const disc = new THREE.CircleGeometry(portalR - 1, 32, 0, Math.PI); disc.translate(hall.cx, CURB + 4, hall.z1 + 0.6); const dm = new THREE.Mesh(disc, vaultGlass); scene.add(dm);
    for (const s2 of [-1, 1]) batch.box(steel, 2.2, 4, 2.2, hall.cx + s2 * portalR, CURB + 2, hall.z1 + 1.2); }
  const sn = channelSign('연서중앙역', '#1d3f8a', 3.2, { raceway: null }); sn.position.set(hall.cx, hy - 3.5, hall.z1 + 0.1); scene.add(sn);
  const se = channelSign('YEONSEO CENTRAL STATION', '#1d3f8a', 1.3, { raceway: null }); se.position.set(hall.cx, hy - 6.4, hall.z1 + 0.1); scene.add(se);
  const st = plan.add({ kind: 'building', id: 'central-station', use: 'civic', zone: 'public', rect: hall, y0: CURB, h: hy, entrances: [{ x: hall.cx, z: hall.z1, nx: 0, nz: 1 }],
    colliders: [world.addBox(V(hall.x0, CURB, hall.z0), V(hall.x1, hy, hall.z1), { surface: 'concrete', cover: true, walkable: false })] });
  // wave lattice canopy over the plaza (two humps), on slim columns
  { const lat = new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.strokeStyle = '#3a4046'; g.lineWidth = 5; for (let i = -128; i < 256; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); g.beginPath(); g.moveTo(i, 128); g.lineTo(i + 128, 0); g.stroke(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 });
    const cx0 = S.x0 + 4, cx1 = S.x1 - 4, cz0 = S.z1 + 2, cz1 = S.z1 + 18, nx = 24, nz = 4, pos = [], uv = [], idx = [];
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) { const u = i / nx, v = j / nz; pos.push(cx0 + u * (cx1 - cx0), CURB + 9 + Math.sin(u * Math.PI * 2) * 2.5 + Math.sin(v * Math.PI) * 1.2, cz0 + v * (cz1 - cz0)); uv.push(u * 12, v * 2); }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const a = i * (nz + 1) + j, b = a + nz + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); cg.setIndex(idx); cg.computeVertexNormals(); scene.add(new THREE.Mesh(cg, lat));
    for (let x = cx0 + 6; x < cx1; x += 18) for (const zz of [cz0 + 3, cz1 - 3]) batch.box(steel, 0.35, 8.5, 0.35, x, CURB + 4.25, zz); }
  // bus bays + taxi rank on 올림픽로 in front of the plaza
  for (const [x, rot] of [[312, Math.PI / 2], [344, Math.PI / 2]]) { const b = ctx.kit?.bus?.({ x, z: -100.5, rotY: rot, color: 0x2a6ab0 }); if (b) { b.userData.dynamic = false; } }
  for (let i = 0; i < 5; i++) placeCar(ctx, 'taxi', 362 + i * 5.2, -101.2, Math.PI / 2, { state: 'clean', tags: ['onRoad'] });
  // station plaza between the hall and the z -40 street; taxi rank lane, trees, benches
  const plaza = new Rect(S.x0, S.z1, S.x1, -104 - L.sw); plan.walk(plaza, 'plaza');
  batch.add(cap(outline('rect', plaza.w, plaza.d), CURB + 0.015, { cx: plaza.cx, cz: plaza.cz }), groundMat('plaza', { color: 0xd0ccc4 }), { cast: false });
  ctx.trees([...Array(8)].map((_, i) => [plaza.x0 + 8 + i * (plaza.w - 16) / 7, plaza.z1 - 3]));

  // ---------------------------------------------------------------- the landmark + podium mall (east of the boulevard, facing the lakes)
  const T = L.tower; landmarkTower(ctx, { x: T.x, z: T.z, y0: CURB, H: 470, base: 56, name: '연서 하늘타워' });
  // podium mall north / east of the tower: a long retail block and a rounded "dome" department store
  modernTower(ctx, { x: 566, z: -50, y0: CURB, sections: [{ kind: 'round', w: 80, d: 56, r: 14, h: 36, mat: 'grid', floorH: 6, rims: 1 }], crown: 'plant', zone: 'business', use: 'shops', front: [-1, 0], palette: { frame: 0xeeeae0, glass: 0x5a6a74, key: 'mall' } });
  domeStore(ctx, { x: 472, z: -117, w: 46, d: 18, h: 24 });
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
