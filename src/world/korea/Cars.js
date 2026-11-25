// Korean street cars, procedural and generic (no real make is copied): sedan, hatchback, compact,
// SUV, minivan, 1-ton cab-over truck, taxi. Each type has its own side profile — lower body, glass
// house with A/B/C pillars and roof, wheel arches, lights, grille, bumpers, mirrors, plates. The
// geometry is built once per type and merged per material; cars only differ in materials and state
// (clean, dusty, damaged with broken glass and a flat, burnt-out).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// side profiles: x runs rear (-) to front (+); lower = body below the glass, cabin = glass house quad
// [rear-base, front-base, front-top, rear-top]; axles = wheel x; r = wheel radius
export const TYPES = {
  sedan: { L: 4.85, W: 1.85, r: 0.33, axles: [-1.42, 1.43],
    lower: [[-2.42, 0.3], [2.4, 0.3], [2.46, 0.5], [2.42, 0.74], [2.0, 0.84], [0.95, 0.93], [-1.4, 0.96], [-2.28, 0.93], [-2.45, 0.72]],
    cabin: [[-1.55, 0.94], [0.95, 0.91], [0.0, 1.44], [-0.95, 1.44]] },
  hatch: { L: 4.3, W: 1.8, r: 0.32, axles: [-1.3, 1.32],
    lower: [[-2.12, 0.3], [2.1, 0.3], [2.17, 0.5], [2.12, 0.74], [1.7, 0.84], [0.75, 0.92], [-1.95, 0.97], [-2.15, 0.75]],
    cabin: [[-2.0, 0.95], [0.75, 0.9], [-0.15, 1.46], [-1.82, 1.44]] },
  compact: { L: 3.6, W: 1.6, r: 0.29, axles: [-1.15, 1.2],
    lower: [[-1.78, 0.28], [1.78, 0.28], [1.83, 0.48], [1.79, 0.72], [1.05, 0.86], [-1.7, 0.92], [-1.83, 0.7]],
    cabin: [[-1.72, 0.9], [1.05, 0.86], [0.4, 1.52], [-1.63, 1.52]] },
  suv: { L: 4.7, W: 1.9, r: 0.38, axles: [-1.38, 1.4], ride: 0.08,
    lower: [[-2.33, 0.4], [2.33, 0.4], [2.38, 0.65], [2.32, 0.95], [1.9, 1.03], [1.15, 1.06], [-2.2, 1.1], [-2.37, 0.88]],
    cabin: [[-2.22, 1.09], [1.15, 1.05], [0.3, 1.7], [-2.05, 1.7]] },
  van: { L: 5.1, W: 1.99, r: 0.36, axles: [-1.55, 1.55],
    lower: [[-2.53, 0.34], [2.53, 0.34], [2.58, 0.6], [2.52, 0.86], [2.1, 0.96], [1.6, 1.0], [-2.4, 1.05], [-2.56, 0.8]],
    cabin: [[-2.45, 1.03], [1.6, 1.0], [0.72, 1.77], [-2.35, 1.77]] },
  truck: { L: 5.1, W: 1.74, r: 0.33, axles: [-1.25, 1.62], cab: true,
    lower: [[0.95, 0.45], [2.52, 0.45], [2.58, 0.72], [2.55, 1.12], [0.95, 1.15]],
    cabin: [[1.0, 1.14], [2.5, 1.14], [2.32, 1.98], [1.02, 1.98]] },
};
TYPES.taxi = { ...TYPES.sedan, taxi: true };

// ------------------------------------------------------------------ shared materials
const M = {};
function mats() {
  if (M.glass) return M;
  M.glass = new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.3 });
  M.broken = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 1 });
  M.black = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.85 });
  M.trim = new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.5, metalness: 0.3 });
  M.tyre = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.95 });
  M.rim = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.9 });
  M.head = new THREE.MeshStandardMaterial({ color: 0xe8eef0, roughness: 0.1, metalness: 0.5, emissive: 0x111111 });
  M.tail = new THREE.MeshStandardMaterial({ color: 0x8a0c0c, roughness: 0.25, emissive: 0x200000 });
  M.amber = new THREE.MeshStandardMaterial({ color: 0xd88a10, roughness: 0.3 });
  M.burnt = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1, metalness: 0.2 });
  M.burntRim = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 1 });
  M.plate = new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.5 });
  M.bed = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.6, metalness: 0.5 });
  M.taxiSign = new THREE.MeshStandardMaterial({ map: taxiTex(), roughness: 0.4, emissive: 0x222222 });
  return M;
}
const paintCache = new Map();
function paint(color, dusty) {
  const k = `${color}|${dusty}`; if (paintCache.has(k)) return paintCache.get(k);
  const m = new THREE.MeshStandardMaterial({ color, metalness: dusty ? 0.3 : 0.55, roughness: dusty ? 0.75 : 0.32, envMapIntensity: dusty ? 0.5 : 1 });
  paintCache.set(k, m); return m;
}
function plateTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 56; const g = c.getContext('2d');
  g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, 256, 56); g.strokeStyle = '#222'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 52);
  g.fillStyle = '#111'; g.font = 'bold 38px "WenQuanYi Zen Hei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('12가 3456', 128, 30);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function taxiTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#f2f0e6'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#1d3f8a'; g.font = 'bold 40px "WenQuanYi Zen Hei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('개인택시', 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ------------------------------------------------------------------ geometry per type
const box = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
// extrude a side polygon across the width; geometry x = length, y = up, z = width
function extrude(pts, width, bevel = 0.04) {
  const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -(width - bevel * 2) / 2); return g;
}
// narrow the top of a geometry towards the centre line (tumblehome) above y0
function taper(g, y0, y1, k) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > y0) p.setZ(i, p.getZ(i) * (1 - k * Math.min(1, (y - y0) / (y1 - y0)))); } g.computeVertexNormals(); return g; }
// a thin bar between two (x, y) points on both sides at |z|
function bar(a, b, z, th = 0.07, w = 0.06) { const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy); const g = new THREE.BoxGeometry(len, th, w); g.rotateZ(Math.atan2(dy, dx)); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z); return g; }

const geoCache = new Map();
function typeGeo(type) {
  if (geoCache.has(type)) return geoCache.get(type);
  const T = TYPES[type], W = T.W, ride = T.ride || 0;
  const G = { paint: [], glass: [], black: [], trim: [], head: [], tail: [], amber: [], plate: [], tyre: [], rim: [], bed: [], taxi: [] };
  const lower = extrude(T.lower, W, 0.05);
  G.paint.push(lower);
  const [c0, c1, c2, c3] = T.cabin, top = c2[1];
  // glass house (narrowed), then pillars + roof in paint over it
  G.glass.push(taper(extrude([c0, c1, c2, c3], W - 0.12, 0.03), c0[1], top, 0.12));
  const zs = (y) => (W / 2 - 0.05) * (1 - 0.12 * Math.min(1, Math.max(0, (y - c0[1]) / (top - c0[1])))) ;
  for (const sgn of [-1, 1]) {
    const zA = sgn * zs((c1[1] + c2[1]) / 2);
    G.paint.push(bar(c1, c2, zA, 0.08, 0.06), bar(c3, c0, sgn * zs((c0[1] + c3[1]) / 2), 0.12, 0.06));
    const bx = T.cab ? null : (c2[0] + c3[0]) / 2 + (type === 'van' || type === 'suv' ? 0.2 : 0);
    if (bx !== null) G.trim.push(box(0.09, top - c0[1], 0.05, bx, (top + c0[1]) / 2, sgn * zs((top + c0[1]) / 2)));
    if (type === 'van' || type === 'suv' || type === 'hatch') G.trim.push(box(0.08, top - c0[1] - 0.06, 0.05, (c3[0] + bx) / 2 - 0.1, (top + c0[1]) / 2, sgn * zs((top + c0[1]) / 2)));
    // belt moulding, side skirt, door seams + handles
    G.trim.push(box(Math.abs(c1[0] - c0[0]), 0.025, 0.02, (c0[0] + c1[0]) / 2, c0[1] - 0.01, sgn * (W / 2 - 0.01)));
    G.black.push(box(Math.abs(T.axles[1] - T.axles[0]) - T.r * 2.3, 0.08, 0.04, (T.axles[0] + T.axles[1]) / 2, 0.33 + ride, sgn * (W / 2 - 0.02)));
    if (!T.cab) for (const x of [bx - 0.02, bx + (c1[0] - bx) * 0.98, (c0[0] + bx) / 2 - 0.25]) G.black.push(box(0.012, c0[1] - 0.42 - ride, 0.01, x, (c0[1] + 0.42 + ride) / 2, sgn * (W / 2 + 0.002)));
    for (const x of T.cab ? [2.1] : [bx + 0.35, bx - 0.7]) G.trim.push(box(0.16, 0.03, 0.025, x, c0[1] - 0.12, sgn * (W / 2 + 0.01)));
    // mirror
    G.paint.push(box(0.12, 0.1, 0.18, c1[0] - 0.12, c1[1] + 0.12, sgn * (W / 2 + 0.06)));
    // wheel arch shadows
    for (const ax of T.axles) { const a = new THREE.CircleGeometry(T.r + 0.07, 8, 0, Math.PI); if (sgn < 0) a.rotateY(Math.PI); a.translate(ax, T.r + ride, sgn * (W / 2 + 0.003)); G.black.push(a); }
  }
  G.paint.push(bar(c2, c3, 0, 0.05, W - 0.28));   // roof skin
  // front / rear: bumpers, grille, lights, plates
  const lx = (pts, side) => (side > 0 ? Math.max(...pts.map((p) => p[0])) : Math.min(...pts.map((p) => p[0])));
  const fx = lx(T.lower, 1), rx = T.cab ? -T.L / 2 : lx(T.lower, -1);
  G.black.push(box(0.12, 0.2, W - 0.06, fx - 0.02, 0.4 + ride, 0));
  G.black.push(box(0.04, 0.16, W * 0.45, fx + 0.02, 0.62 + ride, 0));   // grille
  for (const s of [-1, 1]) {
    G.head.push(box(0.06, 0.1, 0.34, fx - 0.03, (T.cab ? 0.82 : 0.68) + ride, s * (W / 2 - 0.25)));
    G.amber.push(box(0.05, 0.05, 0.1, fx - 0.03, 0.5 + ride, s * (W / 2 - 0.15)));
  }
  G.plate.push(box(0.02, 0.11, 0.52, fx + 0.06, 0.45 + ride, 0).rotateY(0));
  if (!T.cab) {
    G.black.push(box(0.12, 0.2, W - 0.06, rx + 0.02, 0.4 + ride, 0));
    for (const s of [-1, 1]) G.tail.push(box(0.06, 0.14, 0.42, rx + 0.02, 0.78 + ride, s * (W / 2 - 0.26)));
    G.plate.push(box(0.02, 0.11, 0.52, rx - 0.04, 0.6 + ride, 0));
  } else {
    // 1-ton truck: ladder frame, flat bed with drop sides, cab back wall
    G.black.push(box(3.4, 0.14, 0.9, -0.75, 0.6, 0));
    G.bed.push(box(3.5, 0.08, W, -0.82, 0.98, 0));
    for (const s of [-1, 1]) G.bed.push(box(3.5, 0.38, 0.04, -0.82, 1.21, s * (W / 2 - 0.02)));
    G.bed.push(box(0.04, 0.38, W, -2.55, 1.21, 0), box(0.06, 1.1, W - 0.1, 0.9, 1.5, 0));
    for (const s of [-1, 1]) G.tail.push(box(0.05, 0.12, 0.2, -2.58, 0.82, s * (W / 2 - 0.2)));
    G.plate.push(box(0.02, 0.11, 0.52, -2.6, 0.62, 0));
  }
  // wheels: tyre + rim disc with a hub
  for (const ax of T.axles) for (const s of [-1, 1]) {
    const ty = new THREE.CylinderGeometry(T.r, T.r, 0.22, 12); ty.rotateX(Math.PI / 2); ty.translate(ax, T.r + ride, s * (W / 2 - 0.13)); G.tyre.push(ty);
    const rm = new THREE.CylinderGeometry(T.r * 0.62, T.r * 0.62, 0.23, 8); rm.rotateX(Math.PI / 2); rm.translate(ax, T.r + ride, s * (W / 2 - 0.13)); G.rim.push(rm);
  }
  if (T.taxi) G.taxi.push(box(0.26, 0.18, 0.6, (c2[0] + c3[0]) / 2, top + 0.11, 0));
  // merge each material group (convert to non-indexed so mixed geometry types merge)
  const out = {};
  for (const [k, list] of Object.entries(G)) if (list.length) out[k] = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); return g; }));
  geoCache.set(type, out); return out;
}

// colour mix of a Korean street: mostly white / silver / grey / black
const COLORS = [[0xe6e6e2, 30], [0xa9adb1, 18], [0x5c6064, 14], [0x15171a, 18], [0x1f2a44, 6], [0x6a1414, 4], [0xb8ab90, 4], [0x3e4a3e, 3], [0x7a8a9a, 3]];
export function carColor(rnd = Math.random) { let r = rnd() * 100; for (const [c, w] of COLORS) { r -= w; if (r <= 0) return c; } return COLORS[0][0]; }
const TYPE_MIX = [['sedan', 28], ['suv', 22], ['hatch', 10], ['compact', 12], ['van', 10], ['truck', 10], ['taxi', 8]];
export function carType(rnd = Math.random) { let r = rnd() * 100; for (const [t, w] of TYPE_MIX) { r -= w; if (r <= 0) return t; } return 'sedan'; }

// state: 'clean' | 'dusty' | 'damaged' | 'burnt'. Returns [{ geo, mat }] in car space (front = +x)
export function carParts(type = 'sedan', { color = 0xa9adb1, state = 'dusty' } = {}) {
  const m = mats(), G = typeGeo(type);
  const burnt = state === 'burnt', broken = state === 'damaged' || burnt;
  const col = type === 'taxi' ? (color === 0xe6e6e2 ? color : 0xd8822a) : color;
  const pick = { paint: burnt ? m.burnt : paint(col, state !== 'clean'), glass: broken ? m.broken : m.glass, black: m.black, trim: burnt ? m.burnt : m.trim, head: burnt ? m.broken : m.head, tail: burnt ? m.broken : m.tail,
    amber: burnt ? m.broken : m.amber, plate: burnt ? m.burnt : m.plate, tyre: m.tyre, rim: burnt ? m.burntRim : m.rim, bed: burnt ? m.burnt : m.bed, taxi: m.taxiSign };
  return Object.entries(G).map(([k, geo]) => ({ k, geo, mat: pick[k] }));
}
export function buildCar(type = 'sedan', opts = {}) {
  const g = new THREE.Group(), T = TYPES[type];
  for (const { k, geo, mat } of carParts(type, opts)) { const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = k === 'paint' || k === 'glass' || k === 'bed'; mesh.receiveShadow = true; mesh.rotation.y = -Math.PI / 2; g.add(mesh); }
  g.userData.type = type; g.userData.size = V(T.W, 1.6, T.L);
  return g;
}
// static cars as instances. Per type the parts are merged into three geometries — paint (coloured per
// instance), fixed parts (tyres, trim, lights, plates: vertex colours) and glass (tinted per instance:
// dark, or black when broken) — so a whole street of cars costs three draw calls per type per cell.
const mergedCache = new Map();
export function mergedType(type) {
  if (mergedCache.has(type)) return mergedCache.get(type);
  const m = mats(), G = typeGeo(type), fixed = [], paintG = [], glassG = [];
  const fixedCol = { black: m.black.color, trim: m.trim.color, head: m.head.color, tail: m.tail.color, amber: m.amber.color, plate: new THREE.Color(0xe8e8e2), tyre: m.tyre.color, rim: m.rim.color, bed: m.bed.color, taxi: new THREE.Color(0xf0eee6) };
  for (const [k, geo] of Object.entries(G)) {
    const g = geo.clone(); g.rotateY(-Math.PI / 2);
    if (k === 'paint') paintG.push(g); else if (k === 'glass') glassG.push(g);
    else { const c = fixedCol[k] || new THREE.Color(0x222222), n = g.attributes.position.count, arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); fixed.push(g); }
  }
  const out = { paint: mergeGeometries(paintG), glass: mergeGeometries(glassG), fixed: mergeGeometries(fixed) }; mergedCache.set(type, out); return out;
}
const batchMats = {};
export class CarBatch {
  constructor(scene) { this.scene = scene; this.list = []; }
  add(type, opts, x, y, z, rotY, owner) {
    const state = opts.state || 'dusty', burnt = state === 'burnt', broken = burnt || state === 'damaged';
    const col = type === 'taxi' ? (opts.color === 0xe6e6e2 ? opts.color : 0xd8822a) : opts.color;
    this.list.push({ type, owner, mtx: new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rotY), V(1, 1, 1)),
      paint: new THREE.Color(burnt ? 0x2a2420 : col).multiplyScalar(state === 'clean' ? 1 : 0.88), glass: new THREE.Color(broken ? 0x050607 : 0x1a2228) });
  }
  build(removed = new Set()) {
    batchMats.paint ||= new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.4, envMapIntensity: 0.9 });
    batchMats.glass ||= new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.06, envMapIntensity: 1.3 });
    batchMats.fixed ||= new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.6 });
    const groups = new Map(), p = new THREE.Vector3();
    for (const e of this.list) { if (removed.has(e.owner)) continue; p.setFromMatrixPosition(e.mtx); const key = `${e.type}|${Math.floor(p.x / 120)},${Math.floor(p.z / 120)}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(e); }
    for (const [key, l] of groups) {
      const [type, cell] = key.split('|'), G = mergedType(type);
      for (const part of ['paint', 'glass', 'fixed']) {
        const im = new THREE.InstancedMesh(G[part], batchMats[part], l.length);
        l.forEach((e, i) => { im.setMatrixAt(i, e.mtx); if (part !== 'fixed') im.setColorAt(i, e[part]); });
        im.castShadow = part === 'paint'; im.receiveShadow = true; im.computeBoundingSphere(); im.userData.cell = cell; im.userData.cellSize = 120; im.userData.lodNear = true; this.scene.add(im);
      }
    }
  }
}
