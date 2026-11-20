// First-person weapon models.
//  - buildRifle(): original modern carbine design built from bevelled side-profile
//    extrusions (receiver, magwell, grip, curved magazine, stock), octagonal
//    handguard with slot pattern, picatinny rail, holographic sight, light,
//    flash hider. Units: metres. Model space: muzzle toward -Z, stock toward +Z.
//  - buildGloveHand(): articulated gloved hand (palm, 4 three-segment fingers,
//    thumb) posed per weapon.
//  - buildPistolFromGLTF(): wraps the CC0 Poly Haven "service_pistol" scan.
// Each model exposes userData { mag, slide, muzzle, sightY, sightZ, leftHand, rightHand }
// consumed by WeaponSystem's animation layer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbr } from '../render/TextureFactory.js';

// ---------- materials ----------
let M = null;
function mats() {
  if (M) return M;
  const stipple = pbr('fabric', { repeat: [6, 6], color: 0x2b2c2d, key: 'gunpoly' });
  stipple.roughness = 0.75; stipple.normalScale.set(0.6, 0.6);
  M = {
    anod: new THREE.MeshStandardMaterial({ color: 0x232527, metalness: 0.65, roughness: 0.36 }),
    anodDark: new THREE.MeshStandardMaterial({ color: 0x141516, metalness: 0.6, roughness: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x3b3d40, metalness: 0.9, roughness: 0.3 }),
    poly: stipple,
    polySmooth: new THREE.MeshStandardMaterial({ color: 0x1e1f20, metalness: 0.05, roughness: 0.72 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0, roughness: 0.92 }),
    slot: new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.2, roughness: 0.9 }),
    mag: new THREE.MeshStandardMaterial({ color: 0x3a3830, metalness: 0.1, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x6fa3a0, metalness: 1, roughness: 0.04, transparent: true, opacity: 0.22, depthWrite: false }),
    lens: new THREE.MeshStandardMaterial({ color: 0xd8e8ff, emissive: 0x334455, metalness: 0.5, roughness: 0.1 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff2414, toneMapped: false }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2a2a24, metalness: 0, roughness: 0.85 }),
    gloveKnuckle: new THREE.MeshStandardMaterial({ color: 0x1c1c18, metalness: 0, roughness: 0.7 }),
    sleeve: pbr('camoROK', { repeat: [1.5, 1.5] }),
    cuff: new THREE.MeshStandardMaterial({ color: 0x2f3426, roughness: 0.95 }),
  };
  return M;
}

// ---------- geometry helpers ----------
// Side profile given as [z, y] points, extruded symmetrically along X.
function profile(pts, width, { bevel = 0.0025, segs = 2 } = {}) {
  const s = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  const b = Math.min(bevel, width * 0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth: width - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: segs, curveSegments: 6 });
  g.translate(0, 0, -(width - 2 * b) / 2); g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const cylZ = (r, len, z, { x = 0, y = 0, seg = 16, r2 = r, open = false } = {}) => { const g = new THREE.CylinderGeometry(r, r2, len, seg, 1, open); g.rotateX(Math.PI / 2); g.translate(x, y, z); return g; };
function mesh(geo, mat, parent) { const m = new THREE.Mesh(geo, mat); parent.add(m); return m; }
function merged(list, mat, parent) { return mesh(mergeGeometries(list.map((g) => g.index ? g.toNonIndexed() : g)), mat, parent); }

// ======================================================================
export function buildRifle() {
  const m = mats(); const g = new THREE.Group(); g.name = 'rifle';
  // --- upper receiver ---
  mesh(profile([[-0.205, 0.0], [0.112, 0.0], [0.112, 0.046], [0.098, 0.056], [-0.205, 0.056]], 0.052), m.anod, g);
  // --- picatinny rail (full length) + teeth ---
  const rail = [box(0.042, 0.007, 0.715, 0, 0.0595, -0.245)];
  for (let z = -0.596; z < 0.105; z += 0.0105) rail.push(box(0.05, 0.0055, 0.0052, 0, 0.0655, z));
  merged(rail, m.anod, g);
  // --- lower receiver with flared magwell ---
  mesh(profile([[-0.17, 0.0], [0.088, 0.0], [0.088, -0.018], [0.062, -0.042], [-0.02, -0.042], [-0.05, -0.038], [-0.082, -0.044],
    [-0.086, -0.074], [-0.168, -0.074], [-0.178, -0.05], [-0.176, -0.02]], 0.047), m.anod, g);
  // magwell lip
  mesh(profile([[-0.17, -0.068], [-0.084, -0.068], [-0.083, -0.078], [-0.171, -0.078]], 0.05, { bevel: 0.002 }), m.anodDark, g);
  // trigger guard (tube) + trigger
  const tg = new THREE.CatmullRomCurve3([[-0.075, -0.04], [-0.07, -0.066], [-0.045, -0.076], [0.0, -0.075], [0.022, -0.047]].map(([z, y]) => new THREE.Vector3(0, y, z)));
  mesh(new THREE.TubeGeometry(tg, 24, 0.0035, 8, false), m.anod, g);
  const trig = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-0.032, -0.04], [-0.03, -0.054], [-0.036, -0.066]].map(([z, y]) => new THREE.Vector3(0, y, z))), 10, 0.0028, 6, false);
  mesh(trig, m.steel, g);
  // pistol grip (stippled polymer)
  mesh(profile([[0.012, -0.040], [0.062, -0.040], [0.099, -0.150], [0.092, -0.160], [0.052, -0.160], [0.043, -0.142], [0.046, -0.125], [0.035, -0.107], [0.037, -0.088], [0.026, -0.068], [0.018, -0.052]], 0.034, { bevel: 0.006, segs: 3 }), m.poly, g);
  // --- ejection port, forward assist, controls ---
  merged([box(0.002, 0.024, 0.062, 0.0262, 0.028, -0.06)], m.slot, g);                       // port opening
  mesh(box(0.003, 0.026, 0.066, 0.0272, 0.028, -0.06), m.anodDark, g).position.x = 0.0006;   // dust cover
  mesh(cylZ(0.0085, 0.024, 0.045, { x: 0.031, y: 0.04 }), m.anod, g);                          // forward assist
  mesh(profile([[0.04, 0.04], [0.08, 0.04], [0.08, 0.052], [0.05, 0.05]], 0.012, { bevel: 0.002 }), m.anod, g).position.x = 0.024; // brass deflector
  for (const s of [-1, 1]) {
    const sel = mesh(box(0.004, 0.006, 0.022, s * 0.026, -0.012, 0.046), m.steel, g); sel.rotation.x = -0.35;   // safety selector
    mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 12).rotateZ(Math.PI / 2).translate(s * 0.0245, -0.012, 0.04), m.anodDark, g);
  }
  mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 12).rotateZ(Math.PI / 2).translate(0.026, -0.022, -0.07), m.anodDark, g); // mag release
  mesh(box(0.004, 0.022, 0.012, -0.026, -0.012, -0.01), m.anodDark, g);                       // bolt catch
  // charging handle (T)
  mesh(profile([[0.098, 0.04], [0.13, 0.04], [0.13, 0.054], [0.098, 0.054]], 0.016, { bevel: 0.002 }), m.anod, g);
  mesh(box(0.05, 0.01, 0.012, 0, 0.047, 0.126), m.anod, g);
  // --- buffer tube + adjustable stock ---
  mesh(cylZ(0.0155, 0.22, 0.2, { y: 0.024, seg: 20 }), m.anod, g);
  mesh(cylZ(0.019, 0.012, 0.09, { y: 0.024, seg: 20 }), m.anodDark, g);                       // castle nut
  mesh(profile([[0.165, 0.044], [0.33, 0.05], [0.345, 0.036], [0.348, -0.07], [0.336, -0.082], [0.31, -0.066], [0.252, -0.026], [0.205, -0.012], [0.165, -0.004]], 0.042, { bevel: 0.005, segs: 3 }), m.polySmooth, g);
  mesh(box(0.046, 0.12, 0.012, 0, -0.016, 0.352), m.rubber, g);                                // butt pad
  mesh(profile([[0.2, 0.05], [0.31, 0.056], [0.315, 0.068], [0.205, 0.064]], 0.03, { bevel: 0.004 }), m.polySmooth, g);   // cheek riser
  mesh(box(0.012, 0.012, 0.03, 0, -0.004, 0.19), m.anodDark, g);                               // adjust lever
  // --- handguard (octagonal, slotted) ---
  const hg = cylZ(0.035, 0.385, -0.405, { y: 0.026, seg: 8 }); hg.rotateZ(Math.PI / 8); hg.translate(0, 0, 0);
  mesh(hg, m.anod, g);
  mesh(cylZ(0.0385, 0.016, -0.208, { y: 0.026, seg: 8 }).rotateZ(Math.PI / 8), m.anodDark, g); // barrel nut collar
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const z = -0.255 - i * 0.055;
    for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI * 0.75, -Math.PI * 0.75]) {
      const sl = new THREE.BoxGeometry(0.003, 0.0085, 0.032);
      const rr = 0.0335; sl.rotateZ(Math.PI / 2 - a); sl.translate(Math.sin(a) * rr, 0.026 + Math.cos(a) * rr, z);
      slots.push(sl);
    }
  }
  merged(slots, m.slot, g);
  // side rail sections at 3 and 9 o'clock (front)
  for (const s of [-1, 1]) {
    const sr = [box(0.006, 0.02, 0.09, s * 0.038, 0.026, -0.53)];
    for (let z = -0.57; z < -0.49; z += 0.0105) sr.push(box(0.004, 0.024, 0.005, s * 0.0415, 0.026, z));
    merged(sr, m.anod, g);
  }
  // weapon light (left) and laser/IR box (right)
  mesh(cylZ(0.0135, 0.11, -0.525, { x: -0.058, y: 0.026, seg: 18 }), m.anodDark, g);
  mesh(cylZ(0.0165, 0.03, -0.585, { x: -0.058, y: 0.026, seg: 18 }), m.anod, g);
  mesh(new THREE.CircleGeometry(0.014, 18).rotateY(Math.PI).translate(-0.058, 0.026, -0.6005), m.lens, g);
  mesh(box(0.012, 0.016, 0.03, -0.045, 0.026, -0.53), m.anodDark, g);
  mesh(profile([[-0.565, 0.012], [-0.49, 0.012], [-0.49, 0.042], [-0.56, 0.042]], 0.026, { bevel: 0.003 }), m.polySmooth, g).position.x = 0.056;
  mesh(new THREE.CircleGeometry(0.004, 10).rotateY(Math.PI).translate(0.056, 0.032, -0.5665), m.lens, g);
  // vertical foregrip
  mesh(new THREE.CylinderGeometry(0.0145, 0.0125, 0.085, 16).translate(0, -0.052, -0.455), m.poly, g);
  mesh(box(0.024, 0.01, 0.04, 0, -0.008, -0.455), m.anodDark, g);
  mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.008, 16).translate(0, -0.097, -0.455), m.rubber, g);
  // --- barrel, gas block, flash hider ---
  mesh(cylZ(0.0098, 0.13, -0.655, { y: 0.026, seg: 16 }), m.steel, g);
  mesh(cylZ(0.0128, 0.012, -0.598, { y: 0.026, seg: 16 }), m.anodDark, g);
  mesh(cylZ(0.0135, 0.058, -0.746, { y: 0.026, seg: 18 }), m.anodDark, g);
  const prongs = []; for (let i = 0; i < 4; i++) { const p = new THREE.BoxGeometry(0.003, 0.009, 0.034); p.translate(0, 0.0135, 0); p.rotateZ(i * Math.PI / 2 + Math.PI / 4); p.translate(0, 0.026, -0.755); prongs.push(p); }
  merged(prongs, m.slot, g);
  // folding back-up sights
  mesh(profile([[0.07, 0.068], [0.1, 0.068], [0.1, 0.078], [0.074, 0.076]], 0.03, { bevel: 0.002 }), m.anodDark, g);
  mesh(profile([[-0.585, 0.068], [-0.55, 0.068], [-0.555, 0.08], [-0.58, 0.078]], 0.03, { bevel: 0.002 }), m.anodDark, g);
  // QD sling points
  for (const z of [0.32, -0.25]) { const t = new THREE.TorusGeometry(0.009, 0.0022, 6, 14); t.rotateY(Math.PI / 2); t.translate(-0.03, z > 0 ? -0.03 : 0.0, z); mesh(t, m.steel, g); }

  // --- holographic sight ---
  const sight = new THREE.Group(); g.add(sight);
  const SY = 0.069; // rail top
  mesh(box(0.034, 0.008, 0.062, 0, SY + 0.004, -0.085), m.anodDark, sight);                    // mount
  mesh(profile([[-0.122, SY + 0.008], [-0.042, SY + 0.008], [-0.042, SY + 0.024], [-0.122, SY + 0.024]], 0.046, { bevel: 0.004 }), m.anod, sight); // body
  // hood: two frames + roof
  const winW = 0.04, winH = 0.03, wy = SY + 0.024;
  for (const z of [-0.118, -0.05]) {
    const fr = [box(0.005, winH + 0.006, 0.008, -winW / 2 - 0.0025, wy + winH / 2, z), box(0.005, winH + 0.006, 0.008, winW / 2 + 0.0025, wy + winH / 2, z), box(winW + 0.01, 0.005, 0.008, 0, wy + winH + 0.0025, z)];
    merged(fr, m.anod, sight);
  }
  mesh(box(winW + 0.01, 0.004, 0.076, 0, wy + winH + 0.004, -0.084), m.anod, sight);
  for (const s of [-1, 1]) mesh(box(0.0035, winH, 0.07, s * (winW / 2 + 0.003), wy + winH / 2, -0.084), m.anodDark, sight);
  mesh(new THREE.PlaneGeometry(winW, winH).translate(0, wy + winH / 2, -0.1), m.glass, sight);
  for (let i = 0; i < 3; i++) mesh(box(0.004, 0.003, 0.006, 0.026, SY + 0.016, -0.1 + i * 0.012), m.rubber, sight);  // buttons
  const dotY = wy + winH / 2;
  const dot = mesh(new THREE.CircleGeometry(0.00085, 12), m.dot, sight); dot.position.set(0, dotY, -0.099);
  const ring = mesh(new THREE.RingGeometry(0.0062, 0.0068, 32), m.dot, sight); ring.position.set(0, dotY, -0.0991);

  // --- curved magazine ---
  const magG = new THREE.Group(); g.add(magG);
  const front = [], back = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; const y = -0.07 - 0.18 * t; const off = 0.052 * t * t; front.push([-0.162 - off, y]); back.push([-0.091 - off * 0.8, y]); }
  const magPts = [...front, [-0.162 - 0.052 - 0.006, -0.256], [-0.091 - 0.0416 + 0.004, -0.256], ...back.reverse()];
  mesh(profile(magPts, 0.026, { bevel: 0.003 }), m.mag, magG);
  const ribs = []; for (let i = 1; i < 8; i++) { const t = i / 8.5; ribs.push(box(0.0275, 0.0035, 0.05, 0, -0.07 - 0.18 * t, -0.128 - 0.047 * t * t)); }
  merged(ribs, m.mag, magG);
  mesh(box(0.032, 0.01, 0.082, 0, -0.258, -0.172), m.rubber, magG);                            // floor plate
  magG.position.set(0, 0, 0);

  // --- hands ---
  const right = buildGloveHand('right'); right.rotation.order = 'ZXY'; right.position.set(0.03, -0.092, 0.088); right.rotation.set(0.38, 0, -Math.PI / 2); g.add(right);
  poseHand(right, { fingers: [1.25, 1.4, 1.45, 1.45], thumb: [1.0, 0.6], index: 0.55 });
  const left = buildGloveHand('left'); left.rotation.order = 'ZXY'; left.position.set(-0.028, -0.055, -0.428); left.rotation.set(0.05, 0, Math.PI / 2); g.add(left);
  poseHand(left, { fingers: [1.35, 1.45, 1.5, 1.5], thumb: [1.0, 0.6] });
  // forearms (sleeves) trail back toward the camera
  const rArm = buildForearm(); const lArm = buildForearm();
  // forearms are parented to the weapon (not the rolled hands) and run back/down toward the camera
  g.add(rArm); rArm.position.set(0.045, -0.105, 0.115); rArm.rotation.set(0.55, 0.42, 0);
  g.add(lArm); lArm.position.set(-0.035, -0.07, -0.385); lArm.rotation.set(0.62, -0.62, 0);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  g.userData = { mag: magG, magBaseY: 0, muzzle: new THREE.Vector3(0, 0.026, -0.78), sightY: dotY, sightZ: -0.099, dot, ring, leftHand: left, leftHandBase: left.position.clone(), rightHand: right };
  return g;
}

// ======================================================================
// Gloved hand. Origin at palm centre; fingers extend toward -Z when flat.
export function buildGloveHand(side = 'right') {
  const m = mats(); const s = side === 'right' ? 1 : -1;
  const h = new THREE.Group(); h.name = side + 'Hand';
  const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.03, 4, 10), m.glove); palm.rotation.x = Math.PI / 2; palm.scale.set(1.15, 1, 0.62); h.add(palm);
  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.02), m.gloveKnuckle); knuckle.position.set(0, 0.012, -0.022); h.add(knuckle);
  h.userData.fingers = [];
  const lens = [[0.024, 0.016, 0.013], [0.027, 0.018, 0.014], [0.025, 0.017, 0.013], [0.02, 0.014, 0.011]];
  for (let i = 0; i < 4; i++) {
    const base = new THREE.Group(); base.position.set(s * (-0.017 + i * 0.0115), 0.0, -0.03); h.add(base);
    const segs = []; let parent = base;
    lens[i].forEach((L, k) => {
      const j = new THREE.Group(); if (k > 0) j.position.z = -lens[i][k - 1]; parent.add(j);
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.0072 - k * 0.0008, L - 0.008, 3, 8), m.glove); seg.rotation.x = Math.PI / 2; seg.position.z = -L / 2; j.add(seg);
      segs.push(j); parent = j;
    });
    h.userData.fingers.push(segs);
  }
  const tb = new THREE.Group(); tb.position.set(-s * 0.024, -0.004, -0.004); tb.rotation.set(0, -s * 0.7, s * 0.5); h.add(tb);
  const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.022, 3, 8), m.glove); t1.rotation.x = Math.PI / 2; t1.position.z = -0.015; tb.add(t1);
  const tj = new THREE.Group(); tj.position.z = -0.03; tb.add(tj);
  const t2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0075, 0.016, 3, 8), m.glove); t2.rotation.x = Math.PI / 2; t2.position.z = -0.011; tj.add(t2);
  h.userData.thumb = [tb, tj];
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.03, 12), m.glove); wrist.rotation.x = Math.PI / 2; wrist.position.z = 0.035; wrist.scale.set(1.15, 0.75, 1); h.add(wrist);
  return h;
}
// curl: radians per joint for each finger (index..pinky); thumb [base, tip]
export function poseHand(h, { fingers = [0.8, 0.8, 0.8, 0.8], thumb = [0.4, 0.3], index = null } = {}) {
  h.userData.fingers.forEach((segs, i) => { const c = i === 0 && index !== null ? index : fingers[i]; segs.forEach((j, k) => { j.rotation.x = -c * (k === 0 ? 0.8 : 0.7); }); });
  h.userData.thumb[0].rotation.x = -thumb[0] * 0.6; h.userData.thumb[1].rotation.x = -thumb[1];
}
function buildForearm() {
  const m = mats(); const a = new THREE.Group();
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.3, 14), m.sleeve); sleeve.rotation.x = Math.PI / 2; sleeve.position.z = 0.17; a.add(sleeve);
  const fold = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.008, 6, 16), m.sleeve); fold.position.z = 0.03; a.add(fold);
  return a;
}

// ======================================================================
// Modern polymer-frame service pistol (original design). Muzzle -Z, grip at origin.
export function buildPistol() {
  const m = mats(); const g = new THREE.Group(); g.name = 'pistol';
  // frame: dust cover with accessory rail, trigger guard (squared front), raked grip
  mesh(profile([[-0.165, 0.022], [0.028, 0.022], [0.034, 0.0], [0.018, -0.005], [-0.035, -0.005], [-0.05, -0.002], [-0.165, 0.002]], 0.03, { bevel: 0.003 }), m.polySmooth, g);
  const rail = [box(0.024, 0.006, 0.05, 0, -0.004, -0.13)]; for (let z = -0.15; z < -0.11; z += 0.01) rail.push(box(0.03, 0.007, 0.004, 0, -0.006, z));
  merged(rail, m.polySmooth, g);
  const tg = new THREE.CatmullRomCurve3([[-0.075, 0.0], [-0.078, -0.022], [-0.062, -0.032], [-0.02, -0.032], [-0.006, -0.008]].map(([z, y]) => new THREE.Vector3(0, y, z)));
  mesh(new THREE.TubeGeometry(tg, 20, 0.004, 8, false), m.polySmooth, g);
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-0.044, 0.0], [-0.046, -0.014], [-0.05, -0.022]].map(([z, y]) => new THREE.Vector3(0, y, z))), 8, 0.003, 6, false), m.anodDark, g);
  mesh(profile([[-0.03, 0.004], [0.03, 0.004], [0.052, -0.092], [0.044, -0.104], [0.0, -0.104], [-0.008, -0.09], [-0.006, -0.075], [-0.014, -0.06], [-0.012, -0.045], [-0.022, -0.03], [-0.03, -0.012]], 0.031, { bevel: 0.006, segs: 3 }), m.poly, g);
  mesh(profile([[0.03, 0.004], [0.042, 0.004], [0.05, -0.012], [0.036, -0.012]], 0.028, { bevel: 0.003 }), m.polySmooth, g); // beavertail
  const magG = new THREE.Group(); g.add(magG);
  mesh(box(0.034, 0.012, 0.05, 0, -0.106, 0.022), m.polySmooth, magG).rotation.x = -0.2;      // magazine base plate
  // slide with front/rear serrations, ejection port, sights
  const slide = new THREE.Group(); g.add(slide);
  mesh(profile([[-0.17, 0.022], [0.03, 0.022], [0.036, 0.03], [0.036, 0.048], [0.03, 0.054], [-0.164, 0.054], [-0.17, 0.046]], 0.027, { bevel: 0.0035, segs: 2 }), m.anod, slide);
  const ser = []; for (let i = 0; i < 7; i++) { ser.push(box(0.0285, 0.022, 0.0018, 0, 0.037, 0.026 - i * 0.004)); ser.push(box(0.0285, 0.02, 0.0018, 0, 0.037, -0.148 + i * 0.004)); }
  merged(ser, m.slot, slide);
  mesh(box(0.004, 0.012, 0.032, 0.012, 0.046, -0.045), m.slot, slide);                          // ejection port
  mesh(box(0.004, 0.009, 0.03, 0.0125, 0.046, -0.045), m.steel, slide).position.x = 0.0005;   // barrel hood
  mesh(cylZ(0.0062, 0.004, -0.1705, { y: 0.039, seg: 16 }), m.slot, slide);                   // muzzle bore
  mesh(new THREE.RingGeometry(0.0062, 0.0082, 16).rotateY(Math.PI).translate(0, 0.039, -0.1715), m.steel, slide);
  const rear = [box(0.022, 0.008, 0.008, 0, 0.058, 0.02)]; rear.push(box(0.004, 0.003, 0.004, -0.007, 0.0625, 0.02), box(0.004, 0.003, 0.004, 0.007, 0.0625, 0.02));
  merged(rear, m.anodDark, slide);
  mesh(box(0.004, 0.008, 0.008, 0, 0.058, -0.155), m.anodDark, slide);                         // front post
  const tri = new THREE.MeshBasicMaterial({ color: 0x8dff6a, toneMapped: false });            // tritium dots
  for (const [x, z] of [[-0.007, 0.0158], [0.007, 0.0158], [0, -0.1592]]) mesh(new THREE.CircleGeometry(0.0013, 8).translate(x, z === 0.0158 ? 0.0585 : 0.06, z), tri, slide);
  // hands: same grip-wrap rig as the rifle
  const right = buildGloveHand('right'); right.rotation.order = 'ZXY'; right.position.set(0.024, -0.05, 0.02); right.rotation.set(0.3, 0, -Math.PI / 2); g.add(right);
  poseHand(right, { fingers: [1.2, 1.4, 1.45, 1.45], thumb: [0.7, 0.4], index: 0.55 });
  const left = buildGloveHand('left'); left.rotation.order = 'ZXY'; left.position.set(-0.026, -0.058, 0.018); left.rotation.set(0.3, 0, Math.PI / 2); g.add(left);
  poseHand(left, { fingers: [1.25, 1.35, 1.4, 1.4], thumb: [0.9, 0.5] });
  const rArm = buildForearm(); g.add(rArm); rArm.position.set(0.035, -0.08, 0.06); rArm.rotation.set(0.85, 0.3, 0);
  const lArm = buildForearm(); g.add(lArm); lArm.position.set(-0.035, -0.085, 0.06); lArm.rotation.set(0.85, -0.3, 0);
  g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
  g.userData = { mag: magG, magBaseY: 0, slide, slideAxis: 'z', slideBase: 0, muzzle: new THREE.Vector3(0, 0.039, -0.19), sightY: 0.062, sightZ: 0.02, leftHand: left, leftHandBase: left.position.clone(), rightHand: right };
  return g;
}
