// Streetscape for a planned city: road surfaces and markings, raised blocks with sidewalks and curbs,
// medians, and street furniture placed by rule (not at random):
//   lamps     on the curb line of every sidewalk, ~30 m apart, starting clear of the crosswalks
//   trees     in grated pits between lamps, never in front of a door / gate / bus stop / subway exit
//   signals   one per corner of each signalised junction, on the curb, facing the approach
//   bus stops one per side of each long frontage, in the furniture zone, clear of doors
//   hydrant / bins / bollards near the crossings
// Cars: abandoned in lanes (avenue), parallel-parked along local-street curbs, in lots / under pilotis.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rect, rotRect } from './CityPlan.js';
import { groundMat, paintMat, flatMat, wallMat } from './CityMaterials.js';
import { buildCar, carColor, carType, TYPES as CAR, CarBatch } from '../korea/Cars.js';
export { CarBatch };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const CURB = 0.15;               // sidewalk / land height above the carriageway

// ------------------------------------------------------------------ ground: roads, blocks, sidewalks
export function buildGround(ctx) {
  const { plan, batch } = ctx, asph = groundMat('asphalt', { roughness: 0.85 });
  for (const r of plan.roads) if (r.kind !== 'drive') batch.box(asph, r.rect.w, 0.02, r.rect.d, r.rect.cx, -0.01, r.rect.cz, 0, { cast: false });
  // raised land: every block is a slab from -0.3 to CURB, its top = lot concrete; sidewalks get pavers on top
  const lot = groundMat('plaza', { color: 0x9a9890 }), curb = wallMat('stone', 0xb0aca4), pav = groundMat('pavers');
  for (const b of plan.blocks) batch.box(lot, b.rect.w, CURB + 0.3, b.rect.d, b.rect.cx, (CURB - 0.3) / 2, b.rect.cz, 0, { cast: false });
  for (const w of plan.walks) if (w.kind === 'sidewalk') {
    batch.box(pav, w.rect.w, 0.01, w.rect.d, w.rect.cx, CURB + 0.005, w.rect.cz, 0, { cast: false });
    // granite curb along the edge that meets a road
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ex = nx > 0 ? w.rect.x1 + 0.3 : nx < 0 ? w.rect.x0 - 0.3 : w.rect.cx, ez = nz > 0 ? w.rect.z1 + 0.3 : nz < 0 ? w.rect.z0 - 0.3 : w.rect.cz;
      if (!plan.onRoad(ex, ez)) continue;
      const len = nx ? w.rect.d : w.rect.w; const cx = nx > 0 ? w.rect.x1 - 0.1 : nx < 0 ? w.rect.x0 + 0.1 : w.rect.cx, cz = nz > 0 ? w.rect.z1 - 0.1 : nz < 0 ? w.rect.z0 + 0.1 : w.rect.cz;
      batch.box(curb, nx ? 0.2 : len, CURB + 0.32, nx ? len : 0.2, cx, (CURB - 0.3) / 2 + 0.01, cz, 0, { cast: false });
    }
  }
}

// lane / stop / crosswalk paint for a north-south arterial with a median, and east-west locals
export function markings(ctx, { avenue, junctions, half, laneW = 3.5 }) {
  const { batch } = ctx, white = paintMat(0xe8e4d8), yellow = paintMat(0xd8b020), y = 0.012;
  const runs = []; let z = avenue.z0;
  for (const j of junctions) { runs.push([z, j.z0 - 4.5]); z = j.z1 + 4.5; } runs.push([z, avenue.z1]);
  for (const [z0, z1] of runs) {
    if (z1 - z0 < 2) continue; const L = z1 - z0, cz = (z0 + z1) / 2;
    for (const s of [-1, 1]) {
      batch.box(yellow, 0.15, 0.005, L, s * 0.55, y, cz, 0, { cast: false });                 // double centre line beside the median
      batch.box(white, 0.15, 0.005, L, s * (half - 0.9), y, cz, 0, { cast: false });           // edge line
      for (let k = 1; k < 3; k++) for (let zz = z0 + 2; zz < z1 - 3; zz += 10) batch.box(white, 0.15, 0.005, 5, s * (0.7 + k * laneW), y, zz + 2.5, 0, { cast: false });
    }
  }
  for (const j of junctions) {
    for (const [zc, dir] of [[j.z0 - 2.25, -1], [j.z1 + 2.25, 1]]) {
      for (let x = -half + 0.8; x < half - 0.6; x += 1.0) batch.box(white, 0.5, 0.005, 3.5, x + 0.25, y, zc, 0, { cast: false });   // zebra
      batch.box(white, half - 0.6, 0.005, 0.45, dir < 0 ? -(half - 0.6) / 2 - 0.3 : (half - 0.6) / 2 + 0.3, y, zc + dir * 3.0, 0, { cast: false });   // stop line, approach side
    }
  }
}

// a median planter strip on the arterial between junctions (low curb, shrubs; no collider on shrubs)
export function median(ctx, { z0, z1, width = 0.8 }) {
  const { batch, plan, world } = ctx; const L = z1 - z0; if (L < 4) return;
  batch.box(wallMat('stone', 0xb0aca4), width, 0.22, L, 0, 0.11, (z0 + z1) / 2, 0, { cast: false });
  batch.box(groundMat('lawn', { color: 0x9a9a7a }), width - 0.2, 0.02, L - 0.2, 0, 0.225, (z0 + z1) / 2, 0, { cast: false });
  const shrub = flatMat(0x3e5236, { roughness: 1, key: 'shrub' });
  for (let z = z0 + 1.5; z < z1 - 1.5; z += 2.2) { const g = new THREE.IcosahedronGeometry(0.45, 0); g.scale(1, 0.75, 1.3); g.translate(0, 0.5, z); batch.add(g, shrub); }
  plan.add({ kind: 'structure', id: `median${z0 | 0}`, rect: new Rect(-width / 2, z0, width / 2, z1), y0: 0, h: 0.22, tags: ['onRoad'], colliders: [world.addBox(V(-width / 2, 0, z0), V(width / 2, 0.22, z1), { surface: 'concrete', cover: false })] });
}

// ------------------------------------------------------------------ furniture (registered + collided)
let FN = 0;
function prop(ctx, kind, rect, h, obj, { collide = true, tags = [], surface = 'metal' } = {}) {
  const y0 = ctx.ground(rect.cx, rect.cz);
  if (!ctx.plan.free(rect, { kinds: ['building', 'structure', 'prop', 'car'], roads: !tags.includes('onRoad') })) return null;
  if (obj) { obj.position.y += y0; ctx.scene.add(obj); }
  return ctx.plan.add({ kind: 'prop', id: `${kind}-${++FN}`, rect, y0, h, obj, tags, colliders: collide ? [ctx.world.addBox(V(rect.x0, y0, rect.z0), V(rect.x1, y0 + h, rect.z1), { surface, walkable: false, cover: h > 1 })] : [] });
}
const furnMat = () => flatMat(0x4a4e50, { roughness: 0.5, metalness: 0.6, key: 'furn' });
export function lamp(ctx, x, z, nx) {
  const g = new THREE.Group(); const m = furnMat();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 8, 8), m); pole.position.y = 4; pole.castShadow = true; g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6), m); arm.rotation.z = Math.PI / 2 - 0.12; arm.position.set(nx * 1.05, 7.95, 0); g.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.14, 0.32), m); head.position.set(nx * 2.15, 8.05, 0); g.add(head);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.24), new THREE.MeshStandardMaterial({ color: 0x8a8a80, roughness: 0.3 })); lens.rotation.x = Math.PI / 2; lens.position.set(nx * 2.15, 7.975, 0); g.add(lens);
  g.position.set(x, 0, z);
  return prop(ctx, 'lamp', Rect.c(x, z, 0.3, 0.3), 8, g, { tags: ['bake'] });
}
// traffic signal: pole on the curb; arm (sign of x towards the lanes, 0 = pedestrian signal only) with a
// 4-lamp head facing the approaching traffic (face = +1 faces +z)
export function signal(ctx, x, z, { arm = 0, face = 1 }) {
  const g = new THREE.Group(), m = furnMat(), dark = flatMat(0x161616, { roughness: 0.6, key: 'sighead' }), off = flatMat(0x2a2a2a, { roughness: 0.3, key: 'lampoff' });
  const H = arm ? 6.2 : 3.2; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, H, 8), m); pole.position.y = H / 2; pole.castShadow = true; g.add(pole);
  if (arm) { const a = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.14, 0.14), m); a.position.set(arm * 3.25, H - 0.3, 0); g.add(a);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.4, 0.3), dark); head.position.set(arm * 5.2, H - 0.62, 0); g.add(head);
    for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), off); l.position.set(arm * 5.2 - 0.54 + i * 0.36, H - 0.62, face * 0.16); l.rotation.y = face > 0 ? 0 : Math.PI; g.add(l); } }
  const ped = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.75, 0.25), dark); ped.position.set(0, 2.6, face * 0.2); g.add(ped);
  g.position.set(x, 0, z);
  return prop(ctx, 'signal', Rect.c(x, z, 0.3, 0.3), H, g, { tags: ['bake'] });
}
// deciduous / pine trees are instanced; trunk colliders registered
export class TreeBatch {
  constructor(ctx) { this.ctx = ctx; this.list = { leaf: [], pine: [] }; }
  add(x, z, { kind = 'leaf', s = 0.9 + Math.random() * 0.35, pit = false } = {}) {
    const ctx = this.ctx, rect = Rect.c(x, z, 0.5 * s, 0.5 * s);
    if (!ctx.plan.free(rect, { kinds: ['building', 'structure', 'prop', 'car'] })) return null;
    const y0 = ctx.ground(x, z);
    this.list[kind].push({ x, y: y0, z, s, r: Math.random() * 6.28 });
    if (pit) { const grate = flatMat(0x2a2a28, { roughness: 0.7, metalness: 0.5, key: 'grate' }); ctx.batch.box(grate, 1.3, 0.02, 1.3, x, y0 + 0.012, z, 0, { cast: false }); }
    return ctx.plan.add({ kind: 'prop', id: `tree-${++FN}`, rect, y0, h: 6, tags: ['tree'], colliders: [ctx.world.addBox(V(rect.x0, y0, rect.z0), V(rect.x1, y0 + 3, rect.z1), { surface: 'wood', walkable: false, cover: true })] });
  }
  build() {
    const scene = this.ctx.scene, d = new THREE.Object3D();
    const geos = { leaf: leafTreeGeo(), pine: pineGeo() };
    for (const [k, pts] of Object.entries(this.list)) {
      if (!pts.length) continue;
      for (const [part, mat] of geos[k]) {
        const im = new THREE.InstancedMesh(part, mat, pts.length);
        pts.forEach((p, i) => { d.position.set(p.x, p.y, p.z); d.rotation.set(0, p.r, 0); d.scale.setScalar(p.s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
      }
    }
  }
}
// early-spring street tree (zelkova / ginkgo shape): trunk, forked branches, a light sparse crown
function leafTreeGeo() {
  const bark = flatMat(0x4a3e34, { roughness: 0.95, key: 'bark' }), twig = flatMat(0x5a4c40, { roughness: 1, key: 'twig' });
  const trunk = [], twigs = []; let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  trunk.push(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 7).translate(0, 1.6, 0));
  const grow = (from, dir, len, rad, depth, out) => {
    const to = from.clone().addScaledVector(dir, len); const g = new THREE.CylinderGeometry(rad * 0.65, rad, len, depth < 2 ? 5 : 3, 1, true); g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir)); g.translate(from.x, from.y, from.z); out.push(g);
    if (depth >= 3) return;
    for (let i = 0; i < (depth < 2 ? 3 : 2); i++) { const nd = dir.clone().add(V((rnd() - 0.5) * 1.3, 0.25 + rnd() * 0.4, (rnd() - 0.5) * 1.3)).normalize(); grow(to, nd, len * 0.72, rad * 0.62, depth + 1, depth < 2 ? trunk : twigs); }
  };
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; grow(V(0, 3.0, 0), V(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize(), 1.9, 0.1, 0, trunk); }
  return [[mergeGeometries(trunk.map((g) => g.toNonIndexed())), bark], [mergeGeometries(twigs.map((g) => g.toNonIndexed())), twig]];
}
function pineGeo() {
  const bark = flatMat(0x5a4636, { roughness: 0.95, key: 'pbark' }), needles = flatMat(0x3a5034, { roughness: 1, key: 'needle' });
  const cones = []; for (let i = 0; i < 4; i++) { const g = new THREE.ConeGeometry(1.5 - i * 0.3, 2.2, 8); g.translate(0, 2.4 + i * 1.2, 0); cones.push(g.toNonIndexed()); }
  return [[new THREE.CylinderGeometry(0.1, 0.17, 2.6, 6).translate(0, 1.3, 0), bark], [mergeGeometries(cones), needles]];
}

// rule-based furniture along one sidewalk strip (a Rect beside a road). `curbX`/`curbZ` locate the curb
// edge; `axis` the walking direction; `avoid`: [{ x, z, r }] (doors, gates, stops, exits) to keep clear
export function furnishSidewalk(ctx, walk, { axis = 'z', curb, out, crossings = [], lampEvery = 30, treeEvery = 9.5, trees = true, avoid = [] }) {
  const along = axis === 'z' ? [walk.z0, walk.z1] : [walk.x0, walk.x1];
  const clearOf = (a) => crossings.every((c) => Math.abs(a - c) > 7) && avoid.every((p) => Math.hypot((axis === 'z' ? curb : a) - p.x, (axis === 'z' ? a : curb) - p.z) > p.r);
  const pos = (a, inset) => (axis === 'z' ? [curb - out * inset, a] : [a, curb - out * inset]);
  const lamps = [];
  for (let a = along[0] + 6; a < along[1] - 3; a += lampEvery) {
    let b = a; for (let k = 0; k < 6 && !clearOf(b); k++) b += 2; if (!clearOf(b)) continue;
    const [x, z] = pos(b, 0.6); if (lamp(ctx, x, z, axis === 'z' ? out : 0)) lamps.push(b);
  }
  if (trees) for (let a = along[0] + 4; a < along[1] - 2; a += treeEvery) {
    if (!clearOf(a) || lamps.some((l) => Math.abs(l - a) < 3.5)) continue;
    const [x, z] = pos(a, 1.1); ctx.treeBatch.add(x, z, { pit: true, s: 0.85 + Math.random() * 0.25 });
  }
}

// parked / abandoned cars ------------------------------------------------------------------
export function placeCar(ctx, type, x, z, rotY, { state, color, tags = [], dynamic = false, canopy = false } = {}) {
  const T = CAR[type]; const rect = rotRect(x, z, T.W + 0.1, T.L + 0.1, rotY);
  if (!ctx.plan.free(rect, { kinds: canopy ? ['structure', 'prop', 'car'] : ['building', 'structure', 'prop', 'car'], roads: false })) return null;
  const opts = { color: color ?? carColor(ctx.rnd), state: state ?? (ctx.rnd() < 0.15 ? 'damaged' : 'dusty') };
  const y0 = ctx.ground(x, z);
  const col = ctx.world.addBox(V(rect.x0 + 0.05, y0, rect.z0 + 0.05), V(rect.x1 - 0.05, y0 + (type === 'truck' ? 2.0 : 1.5), rect.z1 - 0.05), { surface: 'metal', cover: true });
  const it = ctx.plan.add({ kind: 'car', id: `car-${type}-${++FN}`, rect, y0, h: 1.6, tags, colliders: [col] });
  if (dynamic) { const c = buildCar(type, opts); c.position.set(x, y0, z); c.rotation.y = rotY; c.userData.dynamic = true; c.userData.collider = col; ctx.scene.add(c); it.obj = c; }
  else ctx.carBatch.add(type, opts, x, y0, z, rotY, it);   // static: instanced, built after validation
  return it;
}
// parallel parking along a curb line (one side of a local road)
export function parkAlong(ctx, { axis, line, from, to, dir = 1, fill = 0.5, avoid = [] }) {
  let a = from;
  while (a < to - 5) {
    const type = carType(ctx.rnd), L = CAR[type].L;
    if (ctx.rnd() < fill && avoid.every((p) => Math.abs(a + L / 2 - p) > 4)) {
      const [x, z] = axis === 'z' ? [line, a + L / 2] : [a + L / 2, line];
      placeCar(ctx, type, x, z, axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
    }
    a += L + 1.2 + ctx.rnd() * 2;
  }
}

// after validation: static furniture groups are baked into the merged batches (far fewer draw calls)
export function bakeStatic(ctx) {
  for (const it of ctx.plan.items) {
    if (!it.tags.includes('bake') || !it.obj?.parent) continue;
    it.obj.updateMatrixWorld(true);
    it.obj.traverse((o) => { if (!o.isMesh || Array.isArray(o.material)) return; const g = o.geometry.clone().applyMatrix4(o.matrixWorld); ctx.batch.add(g, o.material, { texMeters: 1 }); });
    it.obj.parent.remove(it.obj); it.obj = null;
  }
}

// concrete jersey barrier (2.4 m), procedural and batched; rotQ 1 = runs along z
let _jersey = null;
export function jersey(ctx, x, z, rotQ = 0, { tags = ['onRoad'] } = {}) {
  const rect = rotQ % 2 ? Rect.c(x, z, 0.6, 2.4) : Rect.c(x, z, 2.4, 0.6);
  if (!ctx.plan.free(rect, { roads: false })) return null;
  if (!_jersey) { const sh = new THREE.Shape(); sh.moveTo(-0.3, 0); sh.lineTo(0.3, 0); sh.lineTo(0.3, 0.08); sh.lineTo(0.12, 0.3); sh.lineTo(0.08, 0.8); sh.lineTo(-0.08, 0.8); sh.lineTo(-0.12, 0.3); sh.lineTo(-0.3, 0.08);
    _jersey = new THREE.ExtrudeGeometry(sh, { depth: 2.36, bevelEnabled: false }).translate(0, 0, -1.18); }
  const y0 = ctx.ground(x, z); const g = _jersey.clone(); if (rotQ % 2 === 0) g.rotateY(Math.PI / 2); g.translate(x, y0, z);
  const it = ctx.plan.add({ kind: 'prop', id: `jersey-${++FN}`, rect, y0, h: 0.8, tags, colliders: [ctx.world.addBox(V(rect.x0, y0, rect.z0), V(rect.x1, y0 + 0.8, rect.z1), { surface: 'concrete', cover: true })] });
  const prev = ctx.batch.owner; ctx.batch.owner = it; ctx.batch.add(g, wallMat('concrete', 0xb4b2aa), { texMeters: 2 }); ctx.batch.owner = prev;
  return it;
}
