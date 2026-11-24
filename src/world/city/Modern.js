// Contemporary (2010s-2020s Seoul) building forms for the new district: shells extruded from plan outlines
// (rounded rectangle, ellipse, chamfered, one curved face), curtain-wall / precast-grid / terrace façades
// with slab edges, podiums with retail glass and canopies, and the landmark tower.
// Every builder registers its footprint with the plan and gets colliders made of strips that follow the
// plan outline (not one oversized box), so the collision matches the model.
import * as THREE from 'three';
import { Rect } from './CityPlan.js';
import { flatMat, wallMat } from './CityMaterials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ plan outlines (closed, CCW, [x, z])
export function outline(kind, w, d, { r = 6, c = 6, bulge = 6, n = 72 } = {}) {
  const pts = [], hw = w / 2, hd = d / 2;
  if (kind === 'ellipse') { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([Math.cos(a) * hw, Math.sin(a) * hd]); } return pts; }
  // plus-shaped tower plan (four wings), arm width a = 45% of the size
  if (kind === 'cross') { const a = Math.min(hw, hd) * 0.45; return [[-a, -hd], [a, -hd], [a, -a], [hw, -a], [hw, a], [a, a], [a, hd], [-a, hd], [-a, a], [-hw, a], [-hw, -a], [-a, -a]]; }
  if (kind === 'chamfer') return [[-hw + c, -hd], [hw - c, -hd], [hw, -hd + c], [hw, hd - c], [hw - c, hd], [-hw + c, hd], [-hw, hd - c], [-hw, -hd + c]];
  if (kind === 'rect') return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  if (kind === 'bulge') {   // the +z face bows out as an arc
    const out = [[-hw, -hd], [hw, -hd], [hw, hd]]; const k = 20; for (let i = 1; i < k; i++) { const t = i / k; out.push([hw - t * w, hd + Math.sin(t * Math.PI) * bulge]); } out.push([-hw, hd]); return out;
  }
  // rounded rectangle
  const rr = Math.min(r, hw - 0.01, hd - 0.01), seg = 8;
  for (const [cx, cz, a0] of [[hw - rr, -hd + rr, -Math.PI / 2], [hw - rr, hd - rr, 0], [-hw + rr, hd - rr, Math.PI / 2], [-hw + rr, -hd + rr, Math.PI]])
    for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * Math.PI / 2; pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]); }
  return pts;
}
const scaleOutline = (pts, k, kz = k) => pts.map(([x, z]) => [x * k, z * kz]);
// outline offset outward by d (per-vertex average normal)
function offset(pts, d) {
  const n = pts.length; return pts.map(([x, z], i) => {
    const [px, pz] = pts[(i - 1 + n) % n], [nx, nz] = pts[(i + 1) % n];
    let ex = z - pz, ez = -(x - px), fx = nz - z, fz = -(nx - x); const l1 = Math.hypot(ex, ez) || 1, l2 = Math.hypot(fx, fz) || 1;
    let ox = ex / l1 + fx / l2, oz = ez / l1 + fz / l2; const l = Math.hypot(ox, oz) || 1; return [x + (ox / l) * d, z + (oz / l) * d];
  });
}
const perim = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); } return s; };

// wall shell through rings: rings = [{ y, pts }], all rings with the same vertex count. UV: u = arc length / uM
// (or ring fraction * uTiles when uTiles is given: lines then converge as the shape tapers), v = y / vM
export function shell(rings, { uM = 6, vM = 4, uTiles = null, cx = 0, cz = 0 } = {}) {
  const n = rings[0].pts.length, pos = [], uv = [], idx = [];
  for (const r of rings) {
    const P = perim(r.pts); let acc = 0;
    for (let i = 0; i <= n; i++) {
      const [x, z] = r.pts[i % n]; if (i > 0) { const [px, pz] = r.pts[(i - 1) % n]; acc += Math.hypot(x - px, z - pz); }
      pos.push(cx + x, r.y, cz + z); uv.push(uTiles ? (acc / P) * uTiles : acc / uM, r.y / vM);
    }
  }
  const row = n + 1;
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) { const a = k * row + i, b = a + 1, c = a + row, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); g.userData.keepUV = true; return g;
}
// flat cap (roof / soffit) for an outline at height y
export function cap(pts, y, { cx = 0, cz = 0, down = false } = {}) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); if (down) g.rotateX(Math.PI).translate(0, 0, 0);
  g.translate(cx, y, cz); if (down) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, y); }
  return g;
}
// a slab edge ring (floor plate showing past the glass): outer wall + top + bottom annulus
export function rim(pts, y, h, out, { cx = 0, cz = 0 } = {}) {
  const o = offset(pts, out), n = pts.length, pos = [], idx = [];
  const ring = (P, yy) => { const base = pos.length / 3; for (const [x, z] of P) pos.push(cx + x, yy, cz + z); return base; };
  const a0 = ring(o, y), a1 = ring(o, y + h), b0 = ring(pts, y), b1 = ring(pts, y + h);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n;
    idx.push(a0 + i, a1 + i, a0 + j, a0 + j, a1 + i, a1 + j);           // outer face
    idx.push(a1 + i, b1 + i, a1 + j, a1 + j, b1 + i, b1 + j);           // top
    idx.push(a0 + i, a0 + j, b0 + i, b0 + i, a0 + j, b0 + j); }         // bottom
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// colliders that follow an outline: vertical strips across x
export function outlineColliders(world, pts, cx, cz, y0, h, { strips = 6, surface = 'concrete' } = {}) {
  const xs = pts.map((p) => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs), out = [];
  for (let i = 0; i < strips; i++) {
    const a = x0 + ((x1 - x0) * i) / strips, b = x0 + ((x1 - x0) * (i + 1)) / strips, mid = (a + b) / 2;
    // z extent of the outline at this strip (sample the polygon edges crossing a, mid, b)
    let zmin = Infinity, zmax = -Infinity;
    for (const xx of [a + 0.01, mid, b - 0.01]) for (let k = 0; k < pts.length; k++) { const [px, pz] = pts[k], [qx, qz] = pts[(k + 1) % pts.length];
      if ((px - xx) * (qx - xx) <= 0 && px !== qx) { const t = (xx - px) / (qx - px), z = pz + t * (qz - pz); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); } }
    if (zmin < zmax) out.push(world.addBox(V(cx + a, y0, cz + zmin), V(cx + b, y0 + h, cz + zmax), { surface, cover: true, walkable: false }));
  }
  return out;
}
export function outlineRect(pts, cx, cz) { const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]); return new Rect(cx + Math.min(...xs), cz + Math.min(...zs), cx + Math.max(...xs), cz + Math.max(...zs)); }

// ------------------------------------------------------------------ façade materials (canvas, one tile = uM x vM metres)
const texCache = new Map();
function tex(key, W, H, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); let s = 7; for (const ch of key) s = (s * 31 + ch.charCodeAt(0)) % 2147483647;
  draw(g, W, H, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; texCache.set(key, t); return t;
}
const css = (h) => `#${new THREE.Color(h).getHexString()}`;
// curtain wall: per floor a spandrel band and glass with mullions; offices visible faintly through the glass
// (ceiling light rows, blinds at different heights, a few dark bays). tile: 6 m x one floor
export function curtainMat({ glass = 0x5a7080, spandrel = 0x8a949c, mullion = 0xc8ccd0, bays = 4, floorH = 4, spandrelH = 0.9, key = '' } = {}) {
  const k = `cw|${glass}|${spandrel}|${mullion}|${bays}|${floorH}|${spandrelH}|${key}`;
  const map = tex(k, 512, 256, (g, W, H, rnd) => {
    const sh = H * spandrelH / floorH;
    const gr = g.createLinearGradient(0, 0, 0, H - sh); gr.addColorStop(0, css(new THREE.Color(glass).multiplyScalar(0.75).getHex())); gr.addColorStop(1, css(glass)); g.fillStyle = gr; g.fillRect(0, 0, W, H - sh);
    const bw = W / bays;
    for (let i = 0; i < bays; i++) {
      // interior: ceiling light strip, blind drop, sometimes a dark empty bay
      const x = i * bw; const r = rnd();
      g.fillStyle = `rgba(235,240,235,${0.10 + rnd() * 0.12})`; g.fillRect(x + 4, 6, bw - 8, 5);
      if (r < 0.55) { const bh = (H - sh) * (0.15 + rnd() * 0.5); g.fillStyle = `rgba(200,200,192,${0.25 + rnd() * 0.2})`; g.fillRect(x + 3, 0, bw - 6, bh); }
      else if (r < 0.7) { g.fillStyle = 'rgba(10,14,18,0.35)'; g.fillRect(x + 3, 12, bw - 6, H - sh - 12); }
      g.fillStyle = 'rgba(30,36,40,0.25)'; g.fillRect(x + 6, H - sh - 30, bw * 0.4, 18);     // desks / partitions
    }
    g.fillStyle = css(spandrel); g.fillRect(0, H - sh, W, sh); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, H - sh, W, 3);
    g.fillStyle = css(mullion); for (let i = 0; i <= bays; i++) g.fillRect(i * bw - 2, 0, 4, H);
    g.fillRect(0, H - sh - 2, W, 3);
  });
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.22, metalness: 0.32, envMapIntensity: 0.85 }); m.userData.uM = 6; m.userData.vM = floorH; return m;
}
// precast / stone grid: deep frame with recessed glass (tile 3 m x one floor)
export function gridMat({ frame = 0xd8d2c4, glass = 0x46586a, floorH = 3.8, key = '' } = {}) {
  const k = `grid|${frame}|${glass}|${floorH}|${key}`;
  const map = tex(k, 256, 256, (g, W, H, rnd) => {
    g.fillStyle = css(frame); g.fillRect(0, 0, W, H);
    const x0 = W * 0.16, x1 = W * 0.84, y0 = H * 0.12, y1 = H * 0.78;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0 - 5, y0 - 5, x1 - x0 + 10, y1 - y0 + 10);
    const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, css(new THREE.Color(glass).multiplyScalar(0.7).getHex())); gr.addColorStop(1, css(glass)); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (rnd() < 0.6) { g.fillStyle = 'rgba(210,208,200,0.35)'; g.fillRect(x0, y0, x1 - x0, (y1 - y0) * (0.2 + rnd() * 0.5)); }
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, y1 + 6, W, 4); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(40,36,30,${rnd() * 0.06})`; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
  });
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.5, metalness: 0.15 }); m.userData.uM = 3; m.userData.vM = floorH; return m;
}
// glass balustrade (terraces)
export const balustradeMat = () => flatMat(0x9ab4bc, { roughness: 0.05, metalness: 0.3, key: 'balus' });
const glassBal = () => { const m = new THREE.MeshStandardMaterial({ color: 0xa8c0c8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }); return m; };
let _gb = null;

// ------------------------------------------------------------------ building builders
let MN = 0;
const _slabs = new Map();
const slabMat = (c) => { if (!_slabs.has(c)) _slabs.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide })); return _slabs.get(c); };
// sections: [{ kind, w, d, h, r/c/bulge, mat: 'curtain'|'grid', floorH, rims, terrace }] stacked bottom-up;
// podium: { h, inset } retail base with glass and a canopy on the street side; crown: 'fin' | 'slope' | 'plant'
export function modernTower(ctx, { x, z, y0, sections, podium = null, crown = 'plant', front = [0, 1], zone = 'business', use = 'office', name = null, palette = {} }) {
  const B = ctx.batch, world = ctx.world; const it = ctx.plan.add({ kind: 'building', id: `modern-${use}-${++MN}`, use, zone, rect: null, y0, h: 0, entrances: [] });
  ctx.ownBegin(it);
  let y = y0; const colliders = []; let foot = null;
  const slab = slabMat(palette.slab ?? 0xe4e2dc), roofM = flatMat(0x8a8c88, { roughness: 0.9, key: 'mroof' });
  if (podium) {
    const pts = outline(podium.kind ?? 'rect', podium.w, podium.d, podium); foot = pts;
    const pfh = podium.h > 12 ? 5.2 : podium.h;   // tall podiums (department stores) read as floors, low ones as one shop storey
    const shop = curtainMat({ glass: 0x3e4c54, spandrel: podium.h > 12 ? 0xc8ccd0 : 0x2e3236, mullion: 0x8a9094, floorH: pfh, spandrelH: Math.min(3, pfh * 0.3), bays: 3, key: 'retail' + pfh }); B.add(shell([{ y, pts }, { y: y + podium.h, pts }], { cx: x, cz: z, uM: 6, vM: pfh }), shop);
    B.add(rim(pts, y + podium.h - 0.6, 0.6, 0.25, { cx: x, cz: z }), slab);
    B.add(cap(pts, y + podium.h, { cx: x, cz: z }), roofM);
    colliders.push(...outlineColliders(world, pts, x, z, y, podium.h));
    // canopy along the front + entrance
    const [fx, fz] = front; const e = fx ? podium.d : podium.w; const cx = x + fx * (podium.w / 2 + 1.5), cz = z + fz * (podium.d / 2 + 1.5);
    B.box(slab, fx ? 3 : Math.min(e - 4, 18), 0.35, fx ? Math.min(e - 4, 18) : 3, cx, y + 4.6, cz, 0, { texMeters: 2 });
    it.entrances.push({ x: x + fx * podium.w / 2, z: z + fz * podium.d / 2, nx: fx, nz: fz });
    y += podium.h;
  }
  for (const s of sections) {
    const pts = outline(s.kind, s.w, s.d, s); if (!foot) foot = pts;
    const fh = s.floorH ?? 4, floors = Math.round(s.h / fh), h = floors * fh;
    const mat = s.mat === 'grid' ? gridMat({ frame: palette.frame ?? 0xd8d2c4, glass: palette.glass ?? 0x46586a, floorH: fh, key: palette.key }) : curtainMat({ glass: palette.glass ?? 0x5a7080, spandrel: palette.spandrel ?? 0x8a949c, mullion: palette.mullion ?? 0xc8ccd0, floorH: fh, key: palette.key });
    B.add(shell([{ y, pts }, { y: y + h, pts }], { cx: x, cz: z, uM: mat.userData.uM, vM: fh }), mat);
    // slab edges: every floor for terraces / exposed slabs, every 3rd for curtain walls with expressed floors
    const every = s.terrace ? 1 : s.rims ?? 0;
    if (every) for (let f = 1; f <= floors; f += every) B.add(rim(pts, y + f * fh - 0.45, 0.45, s.terrace ? 1.6 : 0.3, { cx: x, cz: z }), slab);
    if (s.terrace) { if (!_gb) _gb = glassBal(); for (let f = 1; f <= floors; f += 1) { const o = offset(pts, 1.55); ctx.scene.add(new THREE.Mesh(shell([{ y: y + f * fh, pts: o }, { y: y + f * fh + 1.05, pts: o }], { cx: x, cz: z }), _gb)); } }
    B.add(cap(pts, y + h, { cx: x, cz: z }), roofM);
    colliders.push(...outlineColliders(world, pts, x, z, y, h));
    y += h;
  }
  // crown
  const top = sections[sections.length - 1], tp = outline(top.kind, top.w, top.d, top);
  if (crown === 'fin') { B.add(shell([{ y, pts: tp }, { y: y + 8, pts: tp }], { cx: x, cz: z, uM: 6, vM: 8 }), flatMat(palette.mullion ?? 0xc8ccd0, { roughness: 0.4, metalness: 0.6, key: 'crownfin' })); }
  else if (crown === 'slope') { const k = 0.55; B.add(shell([{ y, pts: tp }, { y: y + 10, pts: scaleOutline(tp, 1, k) }], { cx: x, cz: z, uM: 6, vM: 4 }), curtainMat({ glass: palette.glass ?? 0x5a7080, key: palette.key })); B.add(cap(scaleOutline(tp, 1, k), y + 10, { cx: x, cz: z }), roofM); }
  else { const pp = scaleOutline(tp, 0.6); B.add(shell([{ y, pts: pp }, { y: y + 4, pts: pp }], { cx: x, cz: z, uM: 4, vM: 4 }), flatMat(0x9a9c98, { roughness: 0.8, key: 'plant' })); B.add(cap(pp, y + 4, { cx: x, cz: z }), roofM); }
  if (name) { ctx.nameSign?.(name, x, z, y, top, front); }
  it.rect = outlineRect(foot, x, z); it.h = y - y0; it.colliders.push(...colliders);
  ctx.ownEnd(); return it;
}

// ------------------------------------------------------------------ the landmark: 연서 하늘타워 (original design)
// Rounded-square plan with four deep re-entrant corner notches, so the shaft reads as four "petal" wings;
// a convex taper; the notches deepen with height until, near the top, the four wings separate into four
// blades of staggered height around a glass lantern and a spire. Bright sky-lobby bands mark the shaft.
export function landmarkTower(ctx, { x, z, y0, H = 520, base = 60, name = '연서 하늘타워' }) {
  const B = ctx.landmarkBatch || ctx.batch, N = 96;
  const finTex = tex('hanul-fins', 512, 512, (g, W, Hh, rnd) => {
    g.fillStyle = '#93a6b2'; g.fillRect(0, 0, W, Hh);
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.1)'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
    for (let x = 0; x < W; x += 16) { g.fillStyle = '#eef2f4'; g.fillRect(x, 0, 3, Hh); g.fillStyle = 'rgba(40,50,58,0.35)'; g.fillRect(x + 3, 0, 2, Hh); }
    for (let y = 0; y < Hh; y += 32) { g.fillStyle = 'rgba(220,226,230,0.5)'; g.fillRect(0, y, W, 2); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`; g.fillRect(rnd() * W, rnd() * Hh, 30 + rnd() * 80, 10 + rnd() * 30); }
  });
  const skin = new THREE.MeshStandardMaterial({ map: finTex, color: 0xdfe8ee, roughness: 0.18, metalness: 0.5, envMapIntensity: 1.3 });
  const notchM = flatMat(0x2a3440, { roughness: 0.25, metalness: 0.6, key: 'hanulNotch' });
  const lobbyM = new THREE.MeshStandardMaterial({ color: 0xf4f6f6, emissive: 0xdde6ea, emissiveIntensity: 0.25, roughness: 0.4 });
  const half = (t) => (base / 2) * (1 - 0.7 * Math.pow(t, 1.25) - 0.07 * Math.sin(t * Math.PI));   // convex taper
  const notch = (t) => 0.14 + 0.3 * Math.pow(t, 1.6);                                                 // corner notch depth (fraction)
  const ring = (t, depthMul = 1) => { const pts = [], hs = half(t), nd = notch(t) * depthMul;
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
      let r = hs / Math.pow(Math.pow(c, 2.8) + Math.pow(sn, 2.8), 1 / 2.8);                          // rounded square
      const dc = Math.min(...[0.25, 0.75, 1.25, 1.75].map((k) => Math.abs(a / Math.PI - k)));   // distance to a corner (in pi units)
      r *= 1 - nd * Math.exp(-Math.pow(dc / 0.06, 2));
      pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return pts; };
  const split = 0.86, rings = [];
  for (let i = 0; i <= 48; i++) { const t = (i / 48) * split; rings.push({ y: y0 + t * H, pts: ring(t) }); }
  const g = shell(rings, { uTiles: 64, vM: 16 }); g.translate(x, 0, z); B.add(g, skin);
  // dark glazing deep in each notch (reads as the four vertical seams)
  for (const ac of [0.25, 0.75, 1.25, 1.75]) { const sr = [];
    for (let i = 0; i <= 24; i++) { const t = (i / 24) * split, hs = half(t), a = ac * Math.PI, r0 = hs * 1.2 * (1 - notch(t)) * 0.97;
      const w = 0.9 + 1.6 * (1 - t); sr.push({ y: y0 + t * H, pts: [[Math.cos(a) * r0 - Math.sin(a) * w, Math.sin(a) * r0 + Math.cos(a) * w], [Math.cos(a) * r0 + Math.sin(a) * w, Math.sin(a) * r0 - Math.cos(a) * w], [Math.cos(a) * (r0 - 2), Math.sin(a) * (r0 - 2)]] }); }
    const sg = shell(sr, { uM: 4, vM: 4 }); sg.translate(x, 0, z); B.add(sg, notchM); }
  // sky-lobby bands
  for (const t of [0.22, 0.44, 0.64, 0.8]) B.add(rim(ring(t), y0 + t * H - 1.6, 3.2, 0.5, { cx: x, cz: z }), lobbyM);
  // crown: four blades (one per petal) of staggered height, open between them; glass lantern + spire in the middle
  const bladeTop = [1.0, 0.95, 0.985, 0.94];
  for (let k = 0; k < 4; k++) {
    const a0 = (k * 0.5 + 0.25 + 0.05) * Math.PI, a1 = (k * 0.5 + 0.75 - 0.05) * Math.PI, br = [];
    for (let i = 0; i <= 14; i++) { const t = split + (i / 14) * (bladeTop[k] - split), hs = half(t), pts = [];
      const thin = 1 - (i / 14) * 0.55;
      for (let j = 0; j <= 12; j++) { const a = a0 + (a1 - a0) * (0.5 + (j / 12 - 0.5) * thin); pts.push([Math.cos(a) * hs, Math.sin(a) * hs]); }
      for (let j = 12; j >= 0; j--) { const a = a0 + (a1 - a0) * (0.5 + (j / 12 - 0.5) * thin); pts.push([Math.cos(a) * (hs - 3), Math.sin(a) * (hs - 3)]); }
      br.push({ y: y0 + t * H, pts }); }
    const bg = shell(br, { uTiles: 14, vM: 16 }); bg.translate(x, 0, z); B.add(bg, skin);
  }
  const lr = half(split) * 0.42, lantern = new THREE.MeshStandardMaterial({ color: 0xb8d0dc, emissive: 0x8aa8b8, emissiveIntensity: 0.35, roughness: 0.1, metalness: 0.4 });
  B.add(new THREE.CylinderGeometry(lr * 0.7, lr, H * 0.1, 24).translate(x, y0 + (split + 0.05) * H, z), lantern);
  B.add(new THREE.ConeGeometry(lr * 0.35, H * 0.14, 12).translate(x, y0 + (split + 0.1) * H + H * 0.07, z), flatMat(0xdfe4e6, { roughness: 0.3, metalness: 0.8, key: 'spire' }));
  B.add(cap(ring(split), y0 + split * H, { cx: x, cz: z }), flatMat(0x9a9c98, { key: 'lwtroof' }));
  const pts0 = ring(0);
  const it = ctx.plan.add({ kind: 'building', id: 'landmark', use: 'officeTall', zone: 'business', rect: outlineRect(pts0, x, z), y0, h: H * 1.1, entrances: [], colliders: outlineColliders(ctx.world, pts0, x, z, y0, 120, { strips: 8 }) });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 })); beacon.position.set(x, y0 + (split + 0.24) * H, z); beacon.userData.lodAlways = true; ctx.scene.add(beacon);
  return it;
}
