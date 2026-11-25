// Physical world: heightfield terrain + axis-aligned box colliders.
// Provides character movement resolution, ground queries, ray casts
// (bullets, AI line-of-sight), and a grid navigation mesh with A*.
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class World {
  constructor() {
    this.colliders = [];
    this.heightFn = () => 0;
    this.surfaceFn = () => 'dirt';
    this.bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
    this.indoorZones = [];
    this.cell = 8; this.grid = new Map();
    this.nav = null;
  }
  setTerrain(heightFn, surfaceFn) { this.heightFn = heightFn; if (surfaceFn) this.surfaceFn = surfaceFn; }

  addBox(min, max, opts = {}) {
    const c = { min: min.clone(), max: max.clone(), surface: opts.surface || 'concrete', walkable: opts.walkable !== false, cover: opts.cover ?? (max.y - min.y > 0.7), owner: opts.owner || null, dynamic: !!opts.dynamic, id: this.colliders.length };
    this.colliders.push(c); this.index(c); this.navRegion(c); return c;
  }
  addBoxCentered(center, size, opts) {
    const h = _v.set(size.x / 2, size.y / 2, size.z / 2);
    return this.addBox(center.clone().sub(h), center.clone().add(h), opts);
  }
  removeCollider(c) {
    this.colliders = this.colliders.filter((x) => x !== c);
    for (const set of this.grid.values()) set.delete(c);
    this.navRegion(c);
  }
  index(c) {
    const s = this.cell;
    for (let x = Math.floor(c.min.x / s); x <= Math.floor(c.max.x / s); x++)
      for (let z = Math.floor(c.min.z / s); z <= Math.floor(c.max.z / s); z++) {
        const k = x * 73856093 ^ z * 19349663; if (!this.grid.has(k)) this.grid.set(k, new Set()); this.grid.get(k).add(c);
      }
  }
  query(minX, minZ, maxX, maxZ) {
    const s = this.cell, out = new Set();
    for (let x = Math.floor(minX / s); x <= Math.floor(maxX / s); x++)
      for (let z = Math.floor(minZ / s); z <= Math.floor(maxZ / s); z++) {
        const set = this.grid.get(x * 73856093 ^ z * 19349663); if (set) for (const c of set) out.add(c);
      }
    return out;
  }
  moveCollider(c, dx, dy, dz) {
    for (const set of this.grid.values()) set.delete(c);
    const old = { min: c.min.clone(), max: c.max.clone() };
    c.min.x += dx; c.max.x += dx; c.min.y += dy; c.max.y += dy; c.min.z += dz; c.max.z += dz;
    this.index(c); this.navRegion(old); this.navRegion(c);
  }

  // Highest walkable surface under (x,z) at or below y+step
  groundHeight(x, z, y = Infinity, step = 0.55, radius = 0) {
    let h = this.heightFn(x, z);
    for (const c of this.query(x - radius, z - radius, x + radius, z + radius)) {
      if (!c.walkable) continue;
      if (x >= c.min.x - radius && x <= c.max.x + radius && z >= c.min.z - radius && z <= c.max.z + radius && c.max.y <= y + step && c.max.y > h) h = c.max.y;
    }
    return h;
  }
  surfaceAt(x, z, y) {
    for (const c of this.query(x, z, x, z)) if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z && Math.abs(c.max.y - y) < 0.2) return c.surface;
    return this.surfaceFn(x, z);
  }
  ceilingAbove(x, z, y, radius = 0.3) {
    let h = Infinity;
    for (const c of this.query(x - radius, z - radius, x + radius, z + radius))
      if (x >= c.min.x - radius && x <= c.max.x + radius && z >= c.min.z - radius && z <= c.max.z + radius && c.min.y >= y && c.min.y < h) h = c.min.y;
    return h;
  }
  isIndoor(p) {
    for (const z of this.indoorZones) if (p.x > z.min.x && p.x < z.max.x && p.z > z.min.z && p.z < z.max.z && p.y > z.min.y && p.y < z.max.y) return true;
    return false;
  }

  // Resolve a vertical cylinder (feet at pos.y) moving by delta. Mutates pos. Returns collision flags.
  moveCylinder(pos, delta, radius, height, step = 0.5) {
    const res = { hitWall: false };
    const resolveAxis = (axis) => {
      const near = this.query(pos.x - radius - 1, pos.z - radius - 1, pos.x + radius + 1, pos.z + radius + 1);
      for (const c of near) {
        if (c.max.y <= pos.y + step || c.min.y >= pos.y + height) continue; // can step over / pass under
        // closest point on box (xz) to circle center
        const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
        const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
        let dx = pos.x - cx, dz = pos.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = radius - d;
          pos.x += (dx / d) * push; pos.z += (dz / d) * push;
        } else {
          // center inside box: push out along minimal axis
          const px1 = c.max.x - pos.x + radius, px0 = pos.x - c.min.x + radius, pz1 = c.max.z - pos.z + radius, pz0 = pos.z - c.min.z + radius;
          const m = Math.min(px1, px0, pz1, pz0);
          if (m === px1) pos.x += px1; else if (m === px0) pos.x -= px0; else if (m === pz1) pos.z += pz1; else pos.z -= pz0;
        }
        res.hitWall = true;
      }
    };
    // substep to avoid tunnelling
    const len = Math.hypot(delta.x, delta.z); const steps = Math.max(1, Math.ceil(len / (radius * 0.8)));
    for (let i = 0; i < steps; i++) { pos.x += delta.x / steps; pos.z += delta.z / steps; resolveAxis(); }
    const b = this.bounds;
    pos.x = Math.max(b.minX, Math.min(b.maxX, pos.x)); pos.z = Math.max(b.minZ, Math.min(b.maxZ, pos.z));
    return res;
  }

  // Ray cast vs boxes and terrain. Returns nearest hit or null.
  raycast(origin, dir, maxDist = 300, opts = {}) {
    let best = null, bestT = maxDist;
    const inv = { x: 1 / dir.x, y: 1 / dir.y, z: 1 / dir.z };
    const ex = origin.x + dir.x * maxDist, ez = origin.z + dir.z * maxDist;
    const cand = maxDist < 120 ? this.query(Math.min(origin.x, ex), Math.min(origin.z, ez), Math.max(origin.x, ex), Math.max(origin.z, ez)) : this.colliders;
    for (const c of cand) {
      if (opts.ignore && opts.ignore(c)) continue;
      let tmin = (c.min.x - origin.x) * inv.x, tmax = (c.max.x - origin.x) * inv.x; let nAxis = 0;
      if (tmin > tmax) [tmin, tmax] = [tmax, tmin];
      let ty0 = (c.min.y - origin.y) * inv.y, ty1 = (c.max.y - origin.y) * inv.y; if (ty0 > ty1) [ty0, ty1] = [ty1, ty0];
      if (tmin > ty1 || ty0 > tmax) continue;
      if (ty0 > tmin) { tmin = ty0; nAxis = 1; } if (ty1 < tmax) tmax = ty1;
      let tz0 = (c.min.z - origin.z) * inv.z, tz1 = (c.max.z - origin.z) * inv.z; if (tz0 > tz1) [tz0, tz1] = [tz1, tz0];
      if (tmin > tz1 || tz0 > tmax) continue;
      if (tz0 > tmin) { tmin = tz0; nAxis = 2; } if (tz1 < tmax) tmax = tz1;
      if (tmin < 0) continue; // origin inside: ignore
      if (tmin < bestT) {
        bestT = tmin;
        const n = new THREE.Vector3(); const comp = ['x', 'y', 'z'][nAxis]; n[comp] = -Math.sign(dir[comp]) || 1;
        best = { dist: tmin, collider: c, normal: n, surface: c.surface };
      }
    }
    if (!opts.noTerrain) {
      // march terrain
      const stepLen = 0.6; let prevT = 0; let prevAbove = origin.y - this.heightFn(origin.x, origin.z);
      if (prevAbove > -0.01) for (let t = stepLen; t < bestT; t += stepLen) {
        const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
        const above = y - this.heightFn(x, z);
        if (above < 0) {
          let a = prevT, b = t; for (let i = 0; i < 6; i++) { const m = (a + b) / 2; const yy = origin.y + dir.y * m; if (yy - this.heightFn(origin.x + dir.x * m, origin.z + dir.z * m) < 0) b = m; else a = m; }
          const hx = origin.x + dir.x * b, hz = origin.z + dir.z * b; const e = 0.3;
          const n = new THREE.Vector3(this.heightFn(hx - e, hz) - this.heightFn(hx + e, hz), 2 * e, this.heightFn(hx, hz - e) - this.heightFn(hx, hz + e)).normalize();
          bestT = b; best = { dist: b, collider: null, normal: n, surface: this.surfaceFn(hx, hz), terrain: true };
          break;
        }
        prevT = t; prevAbove = above;
        if (y > 120 && dir.y > 0) break;
      }
    }
    if (best) best.point = origin.clone().addScaledVector(dir, best.dist);
    return best;
  }
  lineOfSight(a, b) {
    const d = _v.copy(b).sub(a); const len = d.length(); if (len < 0.01) return true;
    const dir = d.clone().divideScalar(len);
    const hit = this.raycast(a, dir, len - 0.05, { ignore: (c) => c.passBullets || c.seeThrough });   // seeThrough: glass
    return !hit;
  }

  // ---------- navigation grid ----------
  buildNav(cellSize = 1.0) {
    const b = this.bounds; const cs = cellSize;
    const w = Math.ceil((b.maxX - b.minX) / cs), h = Math.ceil((b.maxZ - b.minZ) / cs);
    this.nav = { w, h, cs, blocked: new Uint8Array(w * h), heights: new Float32Array(w * h), minX: b.minX, minZ: b.minZ, comp: null };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.navCompute(i, j);
    return this.nav;
  }
  navCompute(i, j) {
    const n = this.nav, cs = n.cs; const x = n.minX + (i + 0.5) * cs, z = n.minZ + (j + 0.5) * cs;
    const gh = this.heightFn(x, z);
    const sl = Math.max(Math.abs(this.heightFn(x + cs, z) - this.heightFn(x - cs, z)), Math.abs(this.heightFn(x, z + cs) - this.heightFn(x, z - cs))) / (2 * cs);
    let blk = sl > 0.9 ? 1 : 0; let top = gh;
    for (const c of this.query(x - 0.45, z - 0.45, x + 0.45, z + 0.45)) {
      // an agent is a 0.32 m cylinder: a cell is blocked when an obstacle comes within ~0.42 m of its centre
      if (x + 0.42 < c.min.x || x - 0.42 > c.max.x || z + 0.42 < c.min.z || z - 0.42 > c.max.z) continue;
      if (c.max.y - gh > 0.6 && c.min.y - gh < 1.7) { if (c.walkable && c.max.y - top < 0.55) { top = c.max.y; continue; } blk = 1; }
      else if (c.max.y > top && c.max.y - gh <= 0.6 && c.walkable) top = c.max.y;
    }
    n.blocked[j * n.w + i] = blk; n.heights[j * n.w + i] = top;
  }
  // re-evaluate the nav cells under a collider that was added / moved / removed after the grid was built
  navRegion(c) {
    const n = this.nav; if (!n) return;
    const [i0, j0] = this.navCell(c.min.x - 1, c.min.z - 1), [i1, j1] = this.navCell(c.max.x + 1, c.max.z + 1);
    for (let j = Math.max(0, j0); j <= Math.min(n.h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(n.w - 1, i1); i++) this.navCompute(i, j);
    n.comp = null;
  }
  // connected regions of the walkable grid (labels per cell; 0 = blocked) — lets the AI reject unreachable goals
  navComponents() {
    const n = this.nav || this.buildNav(); if (n.comp) return n.comp;
    const comp = new Int32Array(n.w * n.h); const size = [0]; let label = 0; const q = new Int32Array(n.w * n.h);
    for (let s0 = 0; s0 < comp.length; s0++) {
      if (comp[s0] || n.blocked[s0]) continue;
      label++; let qh = 0, qt = 0; q[qt++] = s0; comp[s0] = label; let cnt = 0;
      while (qh < qt) {
        const k = q[qh++]; cnt++; const ci = k % n.w, cj = (k / n.w) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= n.w || nj >= n.h) continue;
          const nk = nj * n.w + ni; if (comp[nk] || n.blocked[nk] || Math.abs(n.heights[nk] - n.heights[k]) > 0.6) continue;
          comp[nk] = label; q[qt++] = nk;
        }
      }
      size[label] = cnt;
    }
    n.comp = comp; n.compSize = size; return comp;
  }
  navCompAt(x, z) { const comp = this.navComponents(); const [i, j] = this.navCell(x, z); return this.navFree(i, j) ? comp[j * this.nav.w + i] : 0; }
  navCompSize(label) { this.navComponents(); return this.nav.compSize[label] || 0; }
  // nearest walkable point in a region of at least minSize cells (escape from inside props / sealed rooms)
  nearestOpen(p, minSize = 40, maxR = 12) {
    const comp = this.navComponents(), n = this.nav; const [ci, cj] = this.navCell(p.x, p.z);
    for (let r = 0; r <= maxR; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
      const i = ci + di, j = cj + dj; if (!this.navFree(i, j)) continue;
      const l = comp[j * n.w + i]; if (n.compSize[l] < minSize) continue;
      return new THREE.Vector3(n.minX + (i + 0.5) * n.cs, n.heights[j * n.w + i], n.minZ + (j + 0.5) * n.cs);
    }
    return null;
  }
  navCell(x, z) { const n = this.nav; return [Math.floor((x - n.minX) / n.cs), Math.floor((z - n.minZ) / n.cs)]; }
  navFree(i, j) { const n = this.nav; return i >= 0 && j >= 0 && i < n.w && j < n.h && !n.blocked[j * n.w + i]; }
  navWalkLine(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az); const steps = Math.ceil(d / (this.nav.cs * 0.5));
    for (let s = 0; s <= steps; s++) { const t = s / steps; const [i, j] = this.navCell(ax + (bx - ax) * t, az + (bz - az) * t); if (!this.navFree(i, j)) return false; }
    return true;
  }
  nearestFree(i, j) {
    if (this.navFree(i, j)) return [i, j];
    for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (Math.abs(di) === r || Math.abs(dj) === r) if (this.navFree(i + di, j + dj)) return [i + di, j + dj];
    return null;
  }
  findPath(from, to, maxIter = 60000) {
    if (!this.nav) this.buildNav();
    const n = this.nav;
    const s = this.nearestFree(...this.navCell(from.x, from.z)); const g = this.nearestFree(...this.navCell(to.x, to.z));
    if (!s || !g) return null;
    const key = (i, j) => j * n.w + i;
    const open = new MinHeap(); const came = new Map(); const gs = new Map();
    const sk = key(...s), gk = key(...g);
    gs.set(sk, 0); open.push(sk, 0);
    const H = (k) => { const i = k % n.w, j = (k / n.w) | 0; const dx = Math.abs(i - g[0]), dz = Math.abs(j - g[1]); return Math.max(dx, dz) + 0.41 * Math.min(dx, dz); };
    let it = 0, found = false, bestK = sk, bestH = H(sk);
    while (open.size && it++ < maxIter) {
      const cur = open.pop(); if (cur === gk) { found = true; break; }
      const hc = H(cur); if (hc < bestH) { bestH = hc; bestK = cur; }
      const ci = cur % n.w, cj = (cur / n.w) | 0; const cg = gs.get(cur);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ni = ci + di, nj = cj + dj; if (!this.navFree(ni, nj)) continue;
        if (di && dj && (!this.navFree(ci + di, cj) || !this.navFree(ci, cj + dj))) continue;
        const dh = Math.abs(n.heights[key(ni, nj)] - n.heights[cur]); if (dh > 0.6) continue;
        const nk = key(ni, nj); const ng = cg + (di && dj ? 1.414 : 1) + dh * 2;
        if (ng < (gs.get(nk) ?? Infinity)) { gs.set(nk, ng); came.set(nk, cur); open.push(nk, ng + H(nk)); }
      }
    }
    // goal unreachable (other side of a wall / sealed off): walk to the closest reachable cell instead of straight into the wall
    const endK = found ? gk : bestK; if (!found && endK === sk) return null;
    const cells = []; let k = endK; while (k !== undefined) { cells.push(k); k = came.get(k); } cells.reverse();
    const pts = cells.map((c) => new THREE.Vector3(n.minX + ((c % n.w) + 0.5) * n.cs, 0, n.minZ + (((c / n.w) | 0) + 0.5) * n.cs));
    if (found) pts[pts.length - 1] = new THREE.Vector3(to.x, 0, to.z);
    // string-pull smoothing
    const out = [pts[0]]; let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.navWalkLine(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]); i = j;
    }
    for (const p of out) p.y = this.groundHeight(p.x, p.z, 100);
    return out;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) { this.k.push(k); this.p.push(p); let i = this.k.length - 1; while (i > 0) { const pa = (i - 1) >> 1; if (this.p[pa] <= this.p[i]) break; this.swap(i, pa); i = pa; } }
  pop() {
    const top = this.k[0]; const lk = this.k.pop(), lp = this.p.pop();
    if (this.k.length) { this.k[0] = lk; this.p[0] = lp; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < this.k.length && this.p[l] < this.p[m]) m = l; if (r < this.k.length && this.p[r] < this.p[m]) m = r; if (m === i) break; this.swap(i, m); i = m; } }
    return top;
  }
  swap(a, b) { [this.k[a], this.k[b]] = [this.k[b], this.k[a]]; [this.p[a], this.p[b]] = [this.p[b], this.p[a]]; }
}
