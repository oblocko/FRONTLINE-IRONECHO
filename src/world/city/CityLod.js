// Level-of-detail for the planned city, per 120 m cell:
//   near   (< NEAR)  everything: window frames / rails / AC units / signs / small furniture
//   mid    (< MID)   building masses, window glass (interior mapping), floor bands, cars, trees
//   far    (>= MID)  HLOD: the cell's buildings as one merged proxy (boxes with a window-grid texture,
//                    one draw call per cell, no shadows); the detailed cell meshes are hidden
//   frustum          every group is split per cell, so three.js frustum culling works on them
//   occlusion        cells whose sample points are all hidden behind big buildings (CPU rays against the
//                    building boxes, refreshed a few times a second) are hidden entirely
//   shadows          proxies never cast shadows; the shadow camera stays a box around the player
// Objects that must always draw (the landmark) carry userData.lodAlways.
import * as THREE from 'three';

export const CELL = 120;   // LOD / HLOD / occlusion cell; the merged meshes and instances use the same 120 m grid
const NEAR = 160, MID = 420;
export const cellKey = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;

export class CityLod {
  constructor(game) {
    this.game = game; this.cells = new Map(); this.small = []; this.t = 0;
    this.occluders = []; this.grid = new Map(); this._ray = new THREE.Vector3();
  }
  cell(key) {
    if (!this.cells.has(key)) { const [i, j] = key.split(',').map(Number); this.cells.set(key, { key, cx: (i + 0.5) * CELL, cz: (j + 0.5) * CELL, maxH: 0, near: [], mid: [], full: [], boxes: [], proxy: null, vis: true }); }
    return this.cells.get(key);
  }
  // building volume (used for the proxy and as an occluder): rect {x0,z0,x1,z1}, base y0, height h, colour
  box(rect, y0, h, color = 0xc8c4bc) {
    const c = this.cell(cellKey((rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2)); c.boxes.push({ rect, y0, h, color }); c.maxH = Math.max(c.maxH, y0 + h);
    if (h > 14 && rect.x1 - rect.x0 > 8 && rect.z1 - rect.z0 > 8) {
      const o = { x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z1, y1: y0 + h, cell: c.key }; this.occluders.push(o);
      for (let i = Math.floor(o.x0 / CELL); i <= Math.floor(o.x1 / CELL); i++) for (let j = Math.floor(o.z0 / CELL); j <= Math.floor(o.z1 / CELL); j++) { const k = `${i},${j}`; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(o); }
    }
  }
  // an occluder only (region buildings: they stream their own detail)
  occluder(o) {
    o.cell ??= null; this.occluders.push(o);
    for (let i = Math.floor(o.x0 / CELL); i <= Math.floor(o.x1 / CELL); i++) for (let j = Math.floor(o.z0 / CELL); j <= Math.floor(o.z1 / CELL); j++) { const k = `${i},${j}`; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(o); }
  }
  // sort the scene's city meshes into cells / levels
  collect(scene) {
    const DETAIL = new Set(['frame', 'reveal', 'sill', 'guard', 'ac', 'acgrille', 'grille', 'chajja', 'shutter']);
    const box = new THREE.Box3(), sph = new THREE.Sphere();
    for (const o of scene.children) {
      if (o.userData.lodAlways || o.userData.dynamic || o.isLight || o.isCamera) continue;
      if (o.userData.cell) {
        let key = o.userData.cell; const sz = o.userData.cellSize;
        if (sz && sz !== CELL) { const [i, j] = key.split(',').map(Number); key = cellKey((i + 0.5) * sz, (j + 0.5) * sz); }   // a coarser instancing cell: judged at its centre
        const c = this.cell(key);
        if (o.userData.facade) (DETAIL.has(o.userData.facade) ? c.near : c.mid).push(o); else if (o.userData.lodNear) c.near.push(o); else if (o.userData.lodMid) c.mid.push(o); else c.full.push(o); continue; }
      box.setFromObject(o); if (box.isEmpty()) continue; box.getBoundingSphere(sph);
      if (sph.radius < 10 && !o.isInstancedMesh) { const c = this.cell(cellKey(sph.center.x, sph.center.z)); c.near.push(o); }
    }
    this.buildProxies(scene);
  }
  buildProxies(scene) {
    const tex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#7a8790'; for (let y = 6; y < 64; y += 16) for (let x = 4; x < 64; x += 16) g.fillRect(x, y, 10, 9); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.8 });
    const col = new THREE.Color();
    for (const c of this.cells.values()) {
      if (!c.boxes.length) continue;
      const pos = [], nor = [], uv = [], cols = [];
      for (const b of c.boxes) {
        const g = new THREE.BoxGeometry(b.rect.x1 - b.rect.x0, b.h, b.rect.z1 - b.rect.z0).toNonIndexed(); g.translate((b.rect.x0 + b.rect.x1) / 2, b.y0 + b.h / 2, (b.rect.z0 + b.rect.z1) / 2);
        const p = g.attributes.position, n = g.attributes.normal; col.set(b.color);
        for (let i = 0; i < p.count; i++) {
          pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i));
          const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); uv.push(ay > 0.5 ? 0 : (ax > 0.5 ? p.getZ(i) : p.getX(i)) / 12, ay > 0.5 ? 0 : p.getY(i) / 12);
          const k = ay > 0.5 ? 0.85 : 1; cols.push(col.r * k, col.g * k, col.b * k);
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = false; m.visible = false; m.userData.lodProxy = true; scene.add(m); c.proxy = m;
    }
  }
  // is a point hidden from the eye by an occluder (ray march through the occluder grid)?
  blocked(eye, tx, ty, tz, skipCell, cellRect = null) {
    const dx = tx - eye.x, dy = ty - eye.y, dz = tz - eye.z, len = Math.hypot(dx, dy, dz); const steps = Math.ceil(len / (CELL * 0.5)); const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, k = `${Math.floor((eye.x + dx * t) / CELL)},${Math.floor((eye.z + dz * t) / CELL)}`; if (seen.has(k)) continue; seen.add(k);
      for (const o of this.grid.get(k) || []) {
        if (o.cell === skipCell) continue;
        if (cellRect && o.x1 > cellRect.x0 && o.x0 < cellRect.x1 && o.z1 > cellRect.z0 && o.z0 < cellRect.z1) continue;   // a building standing in the cell cannot hide that cell
        // slab test, ray segment [0, 0.98]
        let t0 = 0, t1 = 0.98;
        for (const [p, d, a, b] of [[eye.x, dx, o.x0, o.x1], [eye.y, dy, -1, o.y1], [eye.z, dz, o.z0, o.z1]]) {
          if (Math.abs(d) < 1e-6) { if (p < a || p > b) { t1 = -1; break; } continue; }
          let u = (a - p) / d, v = (b - p) / d; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) break;
        }
        if (t0 <= t1 && t1 > 0) return true;
      }
    }
    return false;
  }
  update(dt, force = false) {
    if (!force && (this.t -= dt) > 0) return; this.t = 0.2;
    const eye = this.game.renderer.camera.position;
    for (const c of this.cells.values()) {
      const d = Math.hypot(c.cx - eye.x, c.cz - eye.z, Math.max(0, eye.y - c.maxH)) - CELL * 0.71;
      let visible = true;
      if (d > 30 && c.maxH > 0) {   // occlusion: the cell's top centre and four top corners
        const top = c.maxH, h = CELL / 2;
        const cr = { x0: c.cx - h, z0: c.cz - h, x1: c.cx + h, z1: c.cz + h };
        visible = [[c.cx, top, c.cz], [c.cx - h, top, c.cz - h], [c.cx + h, top, c.cz - h], [c.cx - h, top, c.cz + h], [c.cx + h, top, c.cz + h], [c.cx, top * 0.5, c.cz]].some(([x, y, z]) => !this.blocked(eye, x, y, z, c.key, cr));
      }
      const far = d >= MID;
      for (const o of c.near) o.visible = visible && d < NEAR;
      for (const o of c.mid) o.visible = visible && !far;
      for (const o of c.full) o.visible = visible && !far;
      if (c.proxy) c.proxy.visible = visible && far;
      c.vis = visible;
    }
  }
  stats() { let n = 0, near = 0, far = 0; for (const c of this.cells.values()) { if (!c.vis) n++; } return { cells: this.cells.size, occluded: n, occluders: this.occluders.length }; }
}
