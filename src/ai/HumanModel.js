// Skinned humanoid character model (original procedural design).
// All body parts, gear and face details are generated in a bind pose, assigned to
// bones (with smooth blending across hips/knees/shoulders/elbows) and merged into
// ONE SkinnedMesh per material — ~10 draw calls per character instead of ~35.
// The bone hierarchy and names match what Actor's procedural animation drives.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbr } from '../render/TextureFactory.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// ---------------- geometry helpers ----------------
export function roundedBox(w, h, d, r, { taperTop = 1, taperBottom = 1, segs = 4 } = {}) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = new THREE.BoxGeometry(w, h, d, segs, segs, segs);
  const p = g.attributes.position; const v = new THREE.Vector3(), c = new THREE.Vector3();
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -ix, ix), clamp(v.y, -iy, iy), clamp(v.z, -iz, iz));
    const dir = v.clone().sub(c); if (dir.lengthSq() > 1e-12) dir.normalize().multiplyScalar(r);
    v.copy(c).add(dir);
    const s = lerp(taperBottom, taperTop, (v.y + h / 2) / h); v.x *= s; v.z *= s;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
// profile: [[radius, y], ...] from bottom to top
function lathe(profile, segs = 14) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs); }
function sphere(r, sx = 1, sy = 1, sz = 1, ws = 16, hs = 12, thetaLen = Math.PI) { const g = new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, thetaLen); g.scale(sx, sy, sz); return g; }
function cyl(rt, rb, h, segs = 12) { return new THREE.CylinderGeometry(rt, rb, h, segs); }
const T = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); g.translate(x, y, z); return g; };

// ---------------- shared materials ----------------
const MAT = new Map();
function mat(key, make) { if (!MAT.has(key)) MAT.set(key, make()); return MAT.get(key); }
const std = (color, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const SKINS = [0xd4a888, 0xc49a78, 0xb08566, 0xdcb496];
const CIV_TOPS = [0x3b4a6b, 0x6b3b3b, 0x5a5a5a, 0x2f4f3f, 0x7a6a4a, 0x2a2a35, 0x8a8478, 0x4a3a5a, 0xa05a2a, 0x2a5a6a];
const CIV_PANTS = [0x24262c, 0x3a4458, 0x4a4036, 0x2e3a52];

function materialsFor(faction, variant) {
  const civ = faction === 'civ';
  const M = {
    skin: mat(`skin${variant % SKINS.length}`, () => std(SKINS[variant % SKINS.length], 0.62)),
    dark: mat('dark', () => std(0x16120e, 0.5)),
    eyeW: mat('eyeW', () => std(0xd6d2c8, 0.35)),
    hair: mat('hair', () => std(0x15110d, 0.85)),
    metal: mat('gearMetal', () => std(0x1e1f20, 0.45, 0.55)),
  };
  if (civ) {
    M.uniform = mat(`civPants${variant % CIV_PANTS.length}`, () => pbr('fabric', { color: CIV_PANTS[variant % CIV_PANTS.length], repeat: [3, 3], key: `cp${variant % CIV_PANTS.length}` }));
    M.top = mat(`civTop${variant % CIV_TOPS.length}`, () => pbr('fabric', { color: CIV_TOPS[variant % CIV_TOPS.length], repeat: [3, 3], key: `ct${variant % CIV_TOPS.length}` }));
    M.boot = mat(`civShoe${variant % 3}`, () => std([0xd8d8d4, 0x2a2a2a, 0x5a4636][variant % 3], 0.7));
    M.glove = M.skin; M.gear = mat('civBag', () => std(0x1f2a3a, 0.8));
  } else {
    const kpa = faction === 'kpa', us = faction === 'us';
    M.uniform = mat(`uni_${faction}`, () => { const m = pbr(kpa ? 'camoEnemy' : us ? 'camoUS' : 'camoROK', { repeat: [3, 3], key: `uni${faction}` }); m.normalScale.set(0.6, 0.6); return m; });
    M.top = M.uniform;
    M.gear = mat(`gear_${faction}`, () => pbr('fabric', { color: kpa ? 0x5a5537 : us ? 0x7a6a4e : 0x4b5036, repeat: [4, 4], key: `gear${faction}` }));
    M.plate = mat(`plate_${faction}`, () => pbr('fabric', { color: kpa ? 0x4a4630 : us ? 0x6c5e44 : 0x3c4130, repeat: [4, 4], key: `plate${faction}` }));
    M.helmet = mat(`helm_${faction}`, () => kpa ? pbr('paintedMetal', { color: 0x5c6040, key: 'helmkpa' }) : us ? pbr('paintedMetal', { color: 0x76684c, key: 'helmus' }) : pbr('camoROK', { repeat: [1.5, 1.5], key: 'helmrok' }));
    M.boot = mat('boot', () => std(0x231e19, 0.62));
    M.glove = mat('glove', () => std(0x2a2a24, 0.88));
    M.patch = mat(`patch_${faction}`, () => std(kpa ? 0x7a2020 : faction === 'us' ? 0x3c3c34 : 0x2a4a8a, 0.7));
  }
  return M;
}

// ---------------- NPC rifle (shared geometry, 2 draw calls) ----------------
let RIFLE = null;
function rifleGeometry() {
  if (RIFLE) return RIFLE;
  const metal = [], poly = [];
  metal.push(T(roundedBox(0.05, 0.075, 0.36, 0.012), 0, 0, 0.04));                              // receiver
  metal.push(T(roundedBox(0.04, 0.012, 0.62, 0.004), 0, 0.044, 0.2));                            // top rail
  poly.push(T(cyl(0.03, 0.03, 0.32, 8), 0, 0.005, 0.38, Math.PI / 2, 0, Math.PI / 8));          // handguard
  metal.push(T(cyl(0.0095, 0.0095, 0.2, 8), 0, 0.005, 0.62, Math.PI / 2));                         // barrel
  metal.push(T(cyl(0.014, 0.014, 0.055, 8), 0, 0.005, 0.735, Math.PI / 2));                       // flash hider
  poly.push(T(roundedBox(0.042, 0.09, 0.22, 0.015), 0, -0.012, -0.25));                          // stock
  metal.push(T(cyl(0.014, 0.014, 0.16, 8), 0, 0.012, -0.15, Math.PI / 2));                        // buffer tube
  poly.push(T(roundedBox(0.034, 0.1, 0.045, 0.01), 0, -0.075, -0.045, 0.32));                     // grip
  poly.push(T(roundedBox(0.026, 0.15, 0.065, 0.008), 0, -0.1, 0.11, -0.22));                     // magazine
  metal.push(T(roundedBox(0.04, 0.045, 0.075, 0.008), 0, 0.072, 0.03));                           // optic
  poly.push(T(cyl(0.012, 0.011, 0.07, 8), 0, -0.05, 0.42));                                        // fore grip
  const nonIdx = (a) => a.map((g) => (g.index ? g.toNonIndexed() : g));
  RIFLE = { metal: mergeGeometries(nonIdx(metal)), poly: mergeGeometries(nonIdx(poly)) };
  return RIFLE;
}
export function buildNpcRifle() {
  const g = new THREE.Group(); const r = rifleGeometry();
  const m1 = new THREE.Mesh(r.metal, mat('rifleMetal', () => std(0x1c1d1e, 0.45, 0.55))); const m2 = new THREE.Mesh(r.poly, mat('riflePoly', () => std(0x262725, 0.7)));
  m1.castShadow = m2.castShadow = true; g.add(m1, m2);
  return g;
}

// ---------------- the character ----------------
export function buildHuman({ faction = 'rok', variant = 0, hat = 'helmet' } = {}) {
  const civ = faction === 'civ';
  const M = materialsFor(faction, variant);
  const root = new THREE.Group();
  const B = {}; const bones = [];
  const bone = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); (parent ? B[parent] : root).add(b); B[name] = b; bones.push(b); return b; };
  bone('hips', null, 0, 0.95, 0);
  bone('spine', 'hips', 0, 0.08, 0); bone('chest', 'spine', 0, 0.28, 0); bone('neck', 'chest', 0, 0.235, 0); bone('head', 'neck', 0, 0.095, 0); bone('jaw', 'head', 0, -0.06, 0.07);
  for (const [s, n] of [[-1, 'L'], [1, 'R']]) {
    bone('thigh' + n, 'hips', s * 0.1, -0.05, 0); bone('knee' + n, 'thigh' + n, 0, -0.44, 0);
    bone('shoulder' + n, 'chest', s * 0.22, 0.17, 0); bone('elbow' + n, 'shoulder' + n, 0, -0.32, 0);
  }
  root.updateMatrixWorld(true);
  const boneIndex = new Map(bones.map((b, i) => [b.name, i]));

  // parts: geometry in bone-local space; optional blend toward the parent bone near the joint (local y≈0)
  const parts = [];
  const P = (boneName, material, geo, blend = 0) => parts.push({ boneName, material, geo, blend });
  const military = !civ;

  // ---- hips / pelvis ----
  P('hips', M.uniform, T(roundedBox(0.34, 0.24, 0.23, 0.07), 0, -0.02, 0));
  if (military) {
    P('hips', M.gear, T(roundedBox(0.37, 0.055, 0.255, 0.02), 0, 0.08, 0));                               // belt
    P('hips', M.metal, T(roundedBox(0.05, 0.035, 0.012, 0.004), 0, 0.08, 0.13));                          // buckle
    for (const s of [-1, 1]) P('hips', M.gear, T(roundedBox(0.07, 0.095, 0.06, 0.015), s * 0.175, 0.03, -0.04)); // side pouches
    P('hips', M.gear, T(roundedBox(0.12, 0.08, 0.05, 0.015), 0.06, 0.04, -0.14));                         // dump pouch
  } else P('hips', M.dark, T(roundedBox(0.36, 0.04, 0.245, 0.015), 0, 0.08, 0));                         // belt
  // ---- legs ----
  for (const [s, n] of [[-1, 'L'], [1, 'R']]) {
    P('thigh' + n, M.uniform, lathe([[0.064, -0.47], [0.073, -0.4], [0.084, -0.25], [0.093, -0.1], [0.096, -0.02], [0.086, 0.05]]), 0.08);
    if (military) P('thigh' + n, M.uniform, T(roundedBox(0.03, 0.13, 0.11, 0.012), s * 0.088, -0.22, 0.01)); // cargo pocket
    P('knee' + n, M.uniform, sphere(0.066), 0.05);
    P('knee' + n, M.uniform, lathe([[0.046, -0.36], [0.052, -0.3], [0.067, -0.17], [0.07, -0.08], [0.066, 0.02]]), 0.06);
    if (military) P('knee' + n, M.gear, T(roundedBox(0.11, 0.12, 0.05, 0.022), 0, -0.035, 0.064));      // knee pad
    P('knee' + n, M.boot, T(cyl(0.058, 0.056, 0.12, 12), 0, -0.33, 0));                                     // boot shaft
    P('knee' + n, M.boot, T(roundedBox(0.112, 0.095, 0.27, 0.04, { taperTop: 0.9 }), 0, -0.41, 0.048));    // boot
    P('knee' + n, M.dark, T(roundedBox(0.118, 0.03, 0.285, 0.012), 0, -0.465, 0.048));                      // sole
  }
  // ---- torso ----
  P('spine', M.top, T(roundedBox(0.31, 0.3, 0.205, 0.08, { taperTop: 1.06 }), 0, 0.12, 0), 0.06);
  P('chest', M.top, T(roundedBox(0.36, 0.42, 0.225, 0.09, { taperTop: 1.12, taperBottom: 0.92 }), 0, 0.02, 0));
  P('chest', M.top, T(cyl(0.07, 0.075, 0.05, 14), 0, 0.245, 0));                                          // collar
  if (military) {
    P('chest', M.plate, T(roundedBox(0.3, 0.34, 0.06, 0.025), 0, 0.0, 0.125));                             // front plate
    P('chest', M.plate, T(roundedBox(0.31, 0.36, 0.06, 0.025), 0, 0.02, -0.125));                          // back plate
    for (const s of [-1, 1]) {
      P('chest', M.plate, T(roundedBox(0.045, 0.2, 0.21, 0.02), s * 0.17, -0.07, 0));                      // cummerbund
      P('chest', M.plate, T(roundedBox(0.07, 0.035, 0.27, 0.012), s * 0.11, 0.2, 0));                      // shoulder straps
    }
    for (let i = -1; i <= 1; i++) {                                                                         // magazine pouches
      P('chest', M.gear, T(roundedBox(0.075, 0.12, 0.055, 0.016), i * 0.088, -0.065, 0.178));
      P('chest', M.gear, T(roundedBox(0.079, 0.025, 0.06, 0.008), i * 0.088, 0.0, 0.18));                  // flaps
    }
    P('chest', M.gear, T(roundedBox(0.16, 0.07, 0.04, 0.012), 0, 0.11, 0.17));                             // admin pouch
    P('chest', M.gear, T(roundedBox(0.075, 0.15, 0.065, 0.015), -0.2, 0.02, -0.06));                       // radio pouch
    P('chest', M.dark, T(cyl(0.004, 0.005, 0.36, 5), -0.21, 0.26, -0.08));                                 // antenna
    if (variant % 3 !== 0) P('chest', M.gear, T(roundedBox(0.28, 0.36, 0.14, 0.05), 0, -0.02, -0.225));  // assault pack
    else P('chest', M.gear, T(roundedBox(0.24, 0.3, 0.05, 0.02), 0, 0.0, -0.17));                         // hydration carrier
  } else {
    P('chest', M.top, T(roundedBox(0.37, 0.12, 0.235, 0.05), 0, -0.2, 0));                                 // jacket hem
    if (variant % 3 === 0) P('chest', M.gear, T(roundedBox(0.26, 0.32, 0.12, 0.05), 0, 0.0, -0.19));      // backpack
  }
  // ---- neck & head ----
  P('neck', M.skin, T(cyl(0.05, 0.056, 0.11, 12), 0, 0.03, 0.005));
  P('head', M.skin, T(sphere(0.1, 0.9, 1.05, 1.0, 22, 18), 0, 0.03, 0));                                   // skull
  P('head', M.skin, T(roundedBox(0.096, 0.07, 0.1, 0.035, { taperBottom: 0.82 }), 0, -0.03, 0.018));                              // jaw/cheeks
  P('head', M.skin, T(roundedBox(0.022, 0.045, 0.03, 0.009), 0, 0.012, 0.098, -0.2));                      // nose bridge
  P('head', M.skin, T(sphere(0.0135), 0, -0.009, 0.111));                                                  // nose tip
  P('head', M.skin, T(roundedBox(0.09, 0.018, 0.03, 0.008), 0, 0.046, 0.088));                             // brow ridge
  for (const s of [-1, 1]) {
    P('head', M.eyeW, T(sphere(0.0125, 1, 0.8, 1), s * 0.033, 0.029, 0.086));
    P('head', M.dark, T(sphere(0.0066), s * 0.033, 0.029, 0.0975));                                          // iris
    P('head', M.hair, T(roundedBox(0.036, 0.008, 0.012, 0.003), s * 0.034, 0.054, 0.096, 0, 0, s * -0.1)); // eyebrow
    P('head', M.skin, T(sphere(0.024, 0.4, 1, 0.7), s * 0.097, 0.018, 0.0));                                 // ear
  }
  P('jaw', M.dark, T(roundedBox(0.034, 0.005, 0.01, 0.002), 0, 0.02, 0.024));                             // mouth line (moves when talking)
  if (hat === 'helmet' && faction === 'kpa') {
    P('head', M.helmet, T(sphere(0.135, 1, 0.92, 1.05, 22, 10, Math.PI * 0.52), 0, 0.045, -0.003));
    P('head', M.helmet, T(cyl(0.152, 0.152, 0.01, 22), 0, 0.04, -0.003));                                  // brim
    for (const s of [-1, 1]) P('head', M.dark, T(roundedBox(0.008, 0.1, 0.01, 0.002), s * 0.098, -0.03, 0.025));
  } else if (hat === 'helmet') {
    P('head', M.helmet, T(sphere(0.128, 1, 0.94, 1.08, 22, 10, Math.PI * 0.5), 0, 0.045, -0.006));        // high-cut shell
    for (const s of [-1, 1]) {
      P('head', M.metal, T(roundedBox(0.012, 0.026, 0.12, 0.004), s * 0.123, 0.038, -0.004));             // side rails
      P('head', M.dark, T(roundedBox(0.008, 0.1, 0.012, 0.003), s * 0.1, -0.032, 0.02));                  // chin strap
    }
    P('head', M.metal, T(roundedBox(0.05, 0.034, 0.022, 0.006), 0, 0.122, 0.122, -0.4));                   // NVG shroud
    if (variant % 2 === 0) P('head', M.dark, T(new THREE.TorusGeometry(0.13, 0.009, 4, 24), 0, 0.075, 0.0, Math.PI / 2)); // goggle band
  } else if (hat === 'cap') {
    P('head', M.helmet || M.top, T(cyl(0.112, 0.118, 0.075, 18), 0, 0.09, -0.005));
    P('head', M.helmet || M.top, T(roundedBox(0.15, 0.012, 0.09, 0.004), 0, 0.06, 0.1));
  } else if (hat === 'headset') {
    P('head', M.hair, T(sphere(0.106, 1, 0.9, 1.06, 18, 8, Math.PI * 0.45), 0, 0.035, -0.012));
    P('head', M.metal, T(new THREE.TorusGeometry(0.112, 0.009, 4, 18, Math.PI), 0, 0.035, 0));
    for (const s of [-1, 1]) P('head', M.metal, T(cyl(0.035, 0.035, 0.03, 12), s * 0.108, 0.02, 0, 0, 0, Math.PI / 2));
  } else {
    P('head', M.hair, T(sphere(0.108, 0.98, 1.0, 1.06, 18, 10, Math.PI * (0.5 + (variant % 3) * 0.05)), 0, 0.036, -0.016, -0.35)); // hair, swept back
  }
  // ---- arms ----
  for (const [s, n] of [[-1, 'L'], [1, 'R']]) {
    P('shoulder' + n, M.top, sphere(0.072), 0.06);                                                           // deltoid
    P('shoulder' + n, M.top, lathe([[0.052, -0.33], [0.058, -0.26], [0.066, -0.13], [0.07, -0.04], [0.07, 0.03]]), 0.07);
    if (military) P('shoulder' + n, M.patch, T(roundedBox(0.006, 0.045, 0.06, 0.002), s * 0.069, -0.07, 0)); // shoulder patch
    P('elbow' + n, M.top, sphere(0.056), 0.05);
    P('elbow' + n, M.top, lathe([[0.041, -0.25], [0.046, -0.21], [0.055, -0.12], [0.058, -0.04], [0.056, 0.02]]), 0.06);
    P('elbow' + n, M.glove, T(cyl(0.045, 0.047, 0.04, 12), 0, -0.235, 0));                                // wrist/cuff
    P('elbow' + n, M.glove, T(roundedBox(0.068, 0.09, 0.038, 0.016), 0, -0.3, 0.004));                       // palm
    P('elbow' + n, M.glove, T(roundedBox(0.066, 0.05, 0.04, 0.016), 0, -0.352, 0.02, 0.55));                // curled fingers
    P('elbow' + n, M.glove, T(roundedBox(0.02, 0.05, 0.022, 0.009), -s * 0.036, -0.29, 0.025, 0.3, 0, s * 0.4)); // thumb
  }

  // ---- bake: skin weights, transform to bind space, merge per material ----
  const byMat = new Map();
  for (const part of parts) {
    let g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const n = g.attributes.position.count; const bi = boneIndex.get(part.boneName); const parent = B[part.boneName].parent;
    const pi = parent && parent.isBone ? boneIndex.get(parent.name) : bi;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const y = g.attributes.position.getY(i);
      // near the joint (local y ≈ 0 or above) vertices follow the parent half-way, fading to 0 at -blend
      const wp = part.blend > 0 ? 0.5 * smooth(-part.blend, 0, y) : 0;
      si[i * 4] = bi; si[i * 4 + 1] = pi; sw[i * 4] = 1 - wp; sw[i * 4 + 1] = wp;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.applyMatrix4(B[part.boneName].matrixWorld);
    if (!byMat.has(part.material)) byMat.set(part.material, []);
    byMat.get(part.material).push(g);
  }
  const skeleton = new THREE.Skeleton(bones);
  const meshes = [];
  for (const [material, list] of byMat) {
    const geo = mergeGeometries(list, false); geo.computeBoundingSphere();
    const sm = new THREE.SkinnedMesh(geo, material); sm.castShadow = true; sm.receiveShadow = true;
    sm.bind(skeleton); root.add(sm); meshes.push(sm);
    sm.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.6); // covers every pose incl. lying down
  }
  return { root, bones: B, meshes, skeleton };
}
