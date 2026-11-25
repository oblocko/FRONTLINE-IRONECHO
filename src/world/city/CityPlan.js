// City planning model + spatial validation.
//
// A city is generated in this order, never by scattering:
//   1. road network (arterial / local / alley rects, reserved corridors such as an overpass band)
//   2. blocks = land between roads; each block gets ONE zone (commercial, residential, business,
//      industrial, public) — uses are only ever drawn from the zone's allowed list
//   3. parcels along each block frontage; buildable area = parcel minus setbacks
//   4. buildings on parcels (footprint inside the buildable area, base on the ground height,
//      entrances facing a walkable street side)
//   5. streetscape (lamps, trees, signals, stops, subway exits) by placement rules
//   6. vehicles on lanes / parking stalls only, outside scripted vehicle corridors
//   7. validate(): overlap, road intrusion, ground contact, floating, zone fit, entrance access,
//      collider-vs-model size. Problems are repaired (moved / shrunk / removed) and reported in
//      plan.report (also window.__cityReport for tests).
import * as THREE from 'three';

export class Rect {
  constructor(x0, z0, x1, z1) { this.x0 = Math.min(x0, x1); this.x1 = Math.max(x0, x1); this.z0 = Math.min(z0, z1); this.z1 = Math.max(z0, z1); }
  static c(cx, cz, w, d) { return new Rect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2); }
  get w() { return this.x1 - this.x0; } get d() { return this.z1 - this.z0; }
  get cx() { return (this.x0 + this.x1) / 2; } get cz() { return (this.z0 + this.z1) / 2; }
  get area() { return this.w * this.d; }
  clone() { return new Rect(this.x0, this.z0, this.x1, this.z1); }
  inset(m, mz = m) { return new Rect(this.x0 + m, this.z0 + mz, this.x1 - m, this.z1 - mz); }
  // overlap depth on both axes > eps
  hits(o, eps = 0.02) { return this.x0 < o.x1 - eps && o.x0 < this.x1 - eps && this.z0 < o.z1 - eps && o.z0 < this.z1 - eps; }
  overlap(o) { return Math.max(0, Math.min(this.x1, o.x1) - Math.max(this.x0, o.x0)) * Math.max(0, Math.min(this.z1, o.z1) - Math.max(this.z0, o.z0)); }
  has(x, z, eps = 0) { return x >= this.x0 - eps && x <= this.x1 + eps && z >= this.z0 - eps && z <= this.z1 + eps; }
  inside(o, eps = 0.02) { return this.x0 >= o.x0 - eps && this.x1 <= o.x1 + eps && this.z0 >= o.z0 - eps && this.z1 <= o.z1 + eps; }
  corners(e = 0.05) { return [[this.x0 + e, this.z0 + e], [this.x1 - e, this.z0 + e], [this.x1 - e, this.z1 - e], [this.x0 + e, this.z1 - e], [this.cx, this.cz]]; }
  toString() { return `[${this.x0.toFixed(1)},${this.z0.toFixed(1)} .. ${this.x1.toFixed(1)},${this.z1.toFixed(1)}]`; }
}
// footprint of a w x l object centred at (x, z) rotated by rotY about Y (axis-aligned bound)
export function rotRect(x, z, w, l, rotY) { const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY)); return Rect.c(x, z, w * c + l * s, w * s + l * c); }

// what each zone may contain (building / site uses)
export const ZONES = {
  commercial: ['shops', 'shopsTall', 'parking', 'plaza', 'gas', 'bank', 'office'],
  residential: ['apartment', 'apartmentShops', 'villa', 'house', 'mixedShops', 'playground', 'parking', 'school'],
  business: ['office', 'officeTall', 'bank', 'plaza', 'parking', 'shops'],
  industrial: ['warehouse', 'factory', 'logistics', 'gas', 'yard'],
  public: ['school', 'hospital', 'park', 'civic', 'parking'],
};

export class CityPlan {
  constructor({ heightFn }) {
    this.heightFn = heightFn;
    this.roads = [];        // { rect, kind: 'arterial'|'local'|'alley'|'drive', axis: 'x'|'z' }
    this.walks = [];        // sidewalks / plazas / paths: walkable pedestrian areas
    this.parking = [];      // parking areas (stalls) where cars may stand
    this.reserved = [];     // { rect, kind, why } nothing may be built here (corridors, overpass band)
    this.blocks = [];       // { rect, zone, name }
    this.items = [];        // placed things (see add())
    this.report = { errors: [], repaired: [], removed: [], warnings: [], counts: {} };
    this.removedSet = new Set();
    this.carriageways = [];  // roads that are lower than the land (arterial / local / alley): drives sit on the land
  }
  road(rect, kind, axis) { const r = { rect, kind, axis }; this.roads.push(r); if (kind !== 'drive') this.carriageways.push(r); return r; }
  walk(rect, kind = 'sidewalk') { const w = { rect, kind }; this.walks.push(w); return w; }
  park(rect, rotY = 0) { const p = { rect, rotY }; this.parking.push(p); return p; }
  reserve(rect, kind, why = '') { this.reserved.push({ rect, kind, why }); }
  block(rect, zone, name) { const b = { rect, zone, name, parcels: [] }; this.blocks.push(b); return b; }
  onRoad(x, z) { return this.roads.some((r) => r.rect.has(x, z)); }
  onWalk(x, z) { return this.walks.some((w) => w.rect.has(x, z)); }
  walkable(x, z) { return this.onWalk(x, z) || this.onRoad(x, z); }
  roadHits(rect) { return this.roads.filter((r) => r.rect.hits(rect)); }

  // Register a placed thing. kind: 'building' | 'site' (fenced yard / park, no volume) | 'prop' | 'car' | 'structure'
  // rect: footprint; y0: base height; h: height; zone/use for zone checks; entrances: [{ x, z, nx, nz }] (door
  // centre on the wall, outward normal); obj: the Object3D (moved on repair); colliders: World colliders;
  // tags: e.g. 'scripted' (allowed in a vehicle corridor), 'onRoad' (prop that belongs on the road: barrier, sign)
  add(item) {
    const it = { tags: [], entrances: [], colliders: [], y0: 0, h: 1, ...item };
    this.items.push(it); return it;
  }
  // can a footprint go here? (used by generators before building)
  free(rect, { kinds = ['building', 'structure', 'prop', 'car'], roads = true, walks = false, reserved = true, ignore = null } = {}) {
    if (roads && this.roads.some((r) => r.rect.hits(rect))) return false;
    if (walks && this.walks.some((w) => w.kind === 'sidewalk' && w.rect.hits(rect))) return false;
    if (reserved && this.reserved.some((r) => r.rect.hits(rect))) return false;
    return !this.items.some((o) => o !== ignore && kinds.includes(o.kind) && o.rect.hits(rect));
  }

  // ------------------------------------------------------------------ validation
  validate(world, { zoneOf = null } = {}) {
    const R = this.report, H = this.heightFn;
    const err = (code, it, msg) => R.errors.push({ code, id: it?.id, msg });
    const moveY = (it, dy) => { if (it.obj) it.obj.position.y += dy; this.batch?.shift(it, dy); for (const c of it.colliders) world.moveCollider?.(c, 0, dy, 0); it.y0 += dy; };
    const remove = (it, why) => {
      if (it.obj?.parent) it.obj.parent.remove(it.obj);
      for (const o of it.objs || []) o.parent?.remove(o);
      this.removedSet.add(it);
      for (const c of it.colliders) world.removeCollider(c);
      this.items.splice(this.items.indexOf(it), 1); R.removed.push({ id: it.id, why });
    };
    const solid = (it) => it.kind === 'building' || it.kind === 'structure';
    // 1. ground contact / floating / buried: base must sit on the ground under the whole footprint
    for (const it of [...this.items]) {
      if (it.tags.includes('elevated')) continue;
      const hs = it.rect.corners().map(([x, z]) => H(x, z)); const lo = Math.min(...hs), hi = Math.max(...hs);
      if (solid(it) && hi - lo > 0.35) err('slope', it, `${it.id} footprint spans ${(hi - lo).toFixed(2)} m of ground`);
      const want = it.kind === 'building' ? lo : H(it.rect.cx, it.rect.cz);
      if (Math.abs(it.y0 - want) > 0.03) { R.repaired.push({ id: it.id, fix: `base ${it.y0.toFixed(2)} → ${want.toFixed(2)} (${it.y0 > want ? 'floating' : 'buried'})` }); moveY(it, want - it.y0); }
    }
    // 2. buildings / structures vs roads, reserved corridors, sidewalks
    for (const it of [...this.items]) {
      if (!solid(it) || it.tags.includes('onRoad')) continue;
      const inBand = it.tags.includes('support');   // piers of an overpass / viaduct stand in its reserved band
      const bad = this.roads.find((r) => r.rect.hits(it.rect)) || (!inBand && this.reserved.find((r) => r.kind !== 'vehicle' && r.rect.hits(it.rect))) ||
        (it.kind === 'building' && this.walks.find((w) => w.kind === 'sidewalk' && w.rect.hits(it.rect)));
      if (bad) { err('road', it, `${it.id} intrudes ${bad.kind} ${bad.rect}`); remove(it, 'road intrusion'); }
    }
    // 3. building / structure overlap (later one is removed)
    const solids = this.items.filter(solid);
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i], b = solids[j];
      if (!this.items.includes(a) || !this.items.includes(b)) continue;
      if (a.tags.includes('attached') && b.tags.includes('attached') && a.group === b.group) continue;
      if ((a.tags.includes('elevated') && b.tags.includes('support')) || (b.tags.includes('elevated') && a.tags.includes('support'))) continue;   // a deck resting on its support
      if (a.rect.hits(b.rect, 0.05) && !(a.y0 + a.h <= b.y0 + 0.01 || b.y0 + b.h <= a.y0 + 0.01)) { err('overlap', b, `${b.id} overlaps ${a.id}`); remove(b, `overlap with ${a.id}`); }
    }
    // 4. props / cars inside solids, cars off the carriageway / parking, cars in vehicle corridors, cars overlapping
    const blockers = () => this.items.filter(solid);
    for (const it of [...this.items]) {
      if (it.kind !== 'prop' && it.kind !== 'car') continue;
      const inSolid = blockers().find((b) => b.rect.hits(it.rect, 0.05) && it.y0 < b.y0 + b.h && b.y0 < it.y0 + it.h && !(b.tags.includes('canopy') && it.kind === 'car'));
      if (inSolid) { err('inside', it, `${it.id} inside ${inSolid.id}`); remove(it, `inside ${inSolid.id}`); continue; }
      if (it.kind === 'car') {
        const onLane = this.roads.some((r) => it.rect.inside(r.rect, 0.3)) || this.parking.some((p) => it.rect.inside(p.rect, 0.3)) || this.roads.concat(this.parking).filter((r) => r.rect.hits(it.rect)).reduce((s, r) => s + r.rect.overlap(it.rect), 0) >= it.rect.area * 0.97;
        if (!onLane) { err('offroad', it, `${it.id} is not on a road or in a parking area`); remove(it, 'off road'); continue; }
        const cor = !it.tags.includes('scripted') && this.reserved.find((r) => r.kind === 'vehicle' && r.rect.hits(it.rect));
        if (cor) { err('corridor', it, `${it.id} blocks the scripted route ${cor.why}`); remove(it, `in ${cor.why}`); continue; }
      }
    }
    const movers = this.items.filter((i) => i.kind === 'car' || (i.kind === 'prop' && !i.tags.includes('flat')));
    for (let i = 0; i < movers.length; i++) for (let j = i + 1; j < movers.length; j++) {
      const a = movers[i], b = movers[j];
      if (!this.items.includes(a) || !this.items.includes(b)) continue;
      if (a.rect.hits(b.rect, 0.02)) { err('overlap', b, `${b.id} overlaps ${a.id}`); remove(b, `overlap with ${a.id}`); }
    }
    // 5. zone fit
    for (const it of this.items) {
      if (!it.use || !it.zone) continue;
      if (!(ZONES[it.zone] || []).includes(it.use)) err('zone', it, `${it.id}: ${it.use} does not belong in a ${it.zone} zone`);
    }
    // 6. entrances: 1.2 m in front of each door must be walkable ground (street, sidewalk, plaza, path) and clear
    for (const it of this.items) for (const e of it.entrances) {
      const px = e.x + e.nx * 1.2, pz = e.z + e.nz * 1.2;
      const walkable = this.onWalk(px, pz) || this.onRoad(px, pz);
      const blocked = this.items.find((o) => o !== it && !o.tags.includes('elevated') && (solid(o) || (o.kind === 'prop' && !o.tags.includes('flat')) || o.kind === 'car') && o.rect.has(px, pz, 0.2));
      if (!walkable) err('entrance', it, `${it.id}: door at (${e.x.toFixed(1)}, ${e.z.toFixed(1)}) opens onto no walkable area`);
      else if (blocked) { if (blocked.kind === 'building' || blocked.kind === 'structure') err('entrance', it, `${it.id}: door blocked by ${blocked.id}`); else remove(blocked, `blocked the door of ${it.id}`); }
    }
    // 7. collider vs model size (core mesh bounds vs footprint)
    const box = new THREE.Box3();
    for (const it of this.items) {
      if (!it.core || !it.colliders.length) continue;
      box.setFromObject(it.core); const dx = Math.abs((box.max.x - box.min.x) - it.rect.w), dz = Math.abs((box.max.z - box.min.z) - it.rect.d);
      if (dx > 0.5 || dz > 0.5) R.warnings.push(`${it.id}: model ${(box.max.x - box.min.x).toFixed(1)} x ${(box.max.z - box.min.z).toFixed(1)} vs collider ${it.rect.w.toFixed(1)} x ${it.rect.d.toFixed(1)}`);
    }
    for (const it of this.items) R.counts[it.use || it.kind] = (R.counts[it.use || it.kind] || 0) + 1;
    if (typeof window !== 'undefined') window.__cityReport = R;
    if (R.errors.length) console.warn(`[city] ${R.errors.length} problems found and handled`, R.errors.slice(0, 20));
    return R;
  }
}

// Merges static geometry per material: generators push boxes / geometries here, build() makes one mesh per
// material. UVs are world-planar (texMeters per material) so textures keep their scale on every face.
export class Batch {
  constructor(scene) { this.scene = scene; this.buckets = new Map(); }
  add(geo, mat, { texMeters, cast = true, near = false } = {}) {
    if (this.owner) geo.userData.owner = this.owner;
    let b = this.buckets.get(mat); if (!b) { b = { geos: [], texMeters: texMeters ?? mat.userData.texMeters ?? 2, cast, near }; this.buckets.set(mat, b); }
    b.geos.push(geo); return geo;
  }
  shift(owner, dy) { for (const b of this.buckets.values()) for (const g of b.geos) if (g.userData.owner === owner) g.translate(0, dy, 0); }
  // axis-aligned (or rotY) box: centre x,y,z
  box(mat, sx, sy, sz, x, y, z, rotY = 0, opts) { const g = new THREE.BoxGeometry(sx, sy, sz); if (rotY) g.rotateY(rotY); g.translate(x, y, z); return this.add(g, mat, opts); }
  // removed: plan items whose geometry is dropped (failed validation)
  build(removed = new Set()) {
    const out = [];
    for (const [mat, b] of this.buckets) {
      const geos = b.geos.filter((g) => !removed.has(g.userData.owner)).map((g) => { const n = g.index ? g.toNonIndexed() : g; n.userData.keepUV = g.userData.keepUV; for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(a)) n.deleteAttribute(a); if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; });
      // world-planar UVs
      for (const g of geos) {
        if (g.userData.keepUV) continue;
        const p = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv, k = 1 / (mat.userData.uM ?? b.texMeters), kv = 1 / (mat.userData.vM ?? b.texMeters);
        for (let i = 0; i < p.count; i++) {
          const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i));
          if (ay > 0.6) uv.setXY(i, p.getX(i) * k, p.getZ(i) * k); else if (ax > 0.6) uv.setXY(i, p.getZ(i) * k, p.getY(i) * kv); else uv.setXY(i, p.getX(i) * k, p.getY(i) * kv);
        }
      }
      // split into chunks so frustum culling still works on a big city
      const chunks = new Map();
      for (const g of geos) { g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3()); const key = `${Math.floor(c.x / 120)},${Math.floor(c.z / 120)}`; if (!chunks.has(key)) chunks.set(key, []); chunks.get(key).push(g); }
      for (const [key, list] of chunks) {
        const merged = mergeAll(list); const m = new THREE.Mesh(merged, mat); m.castShadow = b.cast; m.receiveShadow = true; m.userData.cell = key; m.userData.cellSize = 120; if (b.near) m.userData.lodNear = true; else if (this.lodAlways || !b.cast) m.userData.lodAlways = true; this.scene.add(m); out.push(m);   // ground / road surfaces (no shadow) always draw
      }
    }
    this.buckets.clear(); return out;
  }
}
function mergeAll(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.computeBoundingSphere(); return m;
}
