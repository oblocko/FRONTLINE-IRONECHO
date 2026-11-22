// K21 IFV — two-man turret with the 40 mm gun, original procedural model (after reference photos).
// Hierarchy for later use in the game: turret (yaw, origin = ring centre on the hull roof) → gun (pitch, trunnion).
// Axes: +Z = front, +Y = up, metres.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mats, profileX, box, cylX, cylY, clean, boxUV } from './k21_hull.js';

const cylZ = (r0, r1, len, x, y, z, seg = 20) => { const g = new THREE.CylinderGeometry(r1, r0, len, seg); g.rotateX(Math.PI / 2); g.translate(x, y, z); return g.toNonIndexed(); };
const tube = (pts, r, seg = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.01), pts.length * 6, r, seg, false).toNonIndexed();

// solid between two plan outlines ([x, z], same vertex count, counter-clockwise seen from above) at heights yb / yt
function loft(bottom, yb, top, yt) {
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const n = bottom.length; const B = bottom.map(([x, z]) => [x, yb, z]), T = top.map(([x, z]) => [x, yt, z]);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(B[i], T[j], B[j]); tri(B[i], T[i], T[j]); }
  const cap = (ring, flip) => { const idx = THREE.ShapeUtils.triangulateShape(ring.map(([x, , z]) => new THREE.Vector2(x, -z)), []); for (const [a, b, c] of idx) flip ? tri(ring[a], ring[c], ring[b]) : tri(ring[a], ring[b], ring[c]); };
  cap(T, true); cap(B, false);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return boxUV(g);
}

function mergeInto(group, parts, M, prefix) {
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list, false), M[k]); m.name = `${prefix}_${k}`; m.castShadow = m.receiveShadow = true; group.add(m);
  }
}

export function buildK21Turret(M = mats()) {
  const parts = { paint: [], dark: [], steel: [], rubber: [], canvas: [], glass: [], lamp: [], red: [] };
  const P = (k, g) => parts[k].push(clean(g));
  const turret = new THREE.Group(); turret.name = 'turret';

  // ---- main body: plan view tapers to a wedge at the front (faces angled toward the gun), sides lean inward,
  //      front slopes back steeply, rear bustle overhangs the ring ----
  const BOT = [[-1.12, -1.62], [1.12, -1.62], [1.14, 0.2], [0.42, 1.16], [-0.42, 1.16], [-1.14, 0.2]];
  const MID = [[-1.08, -1.66], [1.08, -1.66], [1.1, 0.12], [0.38, 0.98], [-0.38, 0.98], [-1.1, 0.12]];
  const TOP = [[-0.98, -1.3], [0.98, -1.3], [1.0, -0.05], [0.32, 0.52], [-0.32, 0.52], [-1.0, -0.05]];
  P('paint', loft(BOT, 0.06, MID, 0.3)); P('paint', loft(MID, 0.3, TOP, 0.72));
  // rear bustle box (overhang) and armour bolt rows along the sides
  P('paint', loft([[-1.04, -1.9], [1.04, -1.9], [1.04, -1.4], [-1.04, -1.4]], 0.24, [[-0.96, -1.78], [0.96, -1.78], [0.96, -1.3], [-0.96, -1.3]], 0.66));
  for (const s of [-1, 1]) for (let z = -1.3; z < 0.1; z += 0.35) P('steel', cylX(0.02, 0.03, s * 1.11, 0.36, z, 8));
  // turret ring skirt
  P('dark', cylY(1.02, 1.02, 0.08, 0, 0.02, 0, 40));

  // ---- gun: mantlet + 40 mm barrel with jacket, coax MG (elevation pivot at the trunnion) ----
  const gun = new THREE.Group(); gun.name = 'gun'; gun.position.set(-0.08, 0.42, 0.78); turret.add(gun);
  const gparts = { paint: [], dark: [], steel: [] }; const G = (k, g) => gparts[k].push(clean(g));
  G('paint', box(0.62, 0.42, 0.42, 0, 0, 0.12));                     // mantlet block
  G('paint', box(0.5, 0.34, 0.12, 0, -0.01, 0.37, 0.12, 0, 0));       // mantlet face
  G('dark', cylZ(0.12, 0.11, 0.3, 0, 0, 0.55, 20));                  // barrel collar
  G('steel', cylZ(0.095, 0.085, 0.9, 0, 0, 1.12, 20));               // thermal jacket
  for (let i = 0; i < 5; i++) G('dark', cylZ(0.1, 0.1, 0.035, 0, 0, 0.75 + i * 0.18, 20));   // jacket bands
  G('steel', cylZ(0.058, 0.05, 1.55, 0, 0, 2.34, 18));               // barrel
  G('dark', cylZ(0.072, 0.072, 0.2, 0, 0, 3.15, 18));                // muzzle device
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; G('dark', box(0.02, 0.02, 0.12, Math.cos(a) * 0.072, Math.sin(a) * 0.072, 3.16)); }
  G('dark', box(0.1, 0.1, 0.24, 0.3, -0.06, 0.38)); G('steel', cylZ(0.018, 0.018, 0.3, 0.3, -0.06, 0.62, 10));   // coax MG
  mergeInto(gun, gparts, M, 'gun');
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0, 3.26); gun.add(muzzle);

  // ---- optics ----
  // gunner's sight: armoured box with a front window, front-left of the roof
  P('paint', box(0.42, 0.3, 0.5, -0.56, 0.86, 0.0)); P('dark', box(0.32, 0.16, 0.02, -0.56, 0.88, 0.255)); P('glass', box(0.28, 0.12, 0.01, -0.56, 0.88, 0.267));
  P('paint', box(0.46, 0.05, 0.56, -0.56, 1.03, 0.0));              // sight hood
  // commander's panoramic sight: pedestal + round head, right-rear of the roof
  P('paint', boxUV(cylY(0.17, 0.2, 0.2, 0.55, 0.82, -0.35, 20)));
  P('paint', boxUV(cylY(0.26, 0.26, 0.3, 0.55, 1.07, -0.35, 28))); P('dark', cylY(0.27, 0.27, 0.035, 0.55, 1.23, -0.35, 28));
  P('dark', box(0.32, 0.16, 0.04, 0.55, 1.08, -0.11)); P('glass', box(0.26, 0.11, 0.01, 0.55, 1.08, -0.088));
  // hatches (commander right, gunner left), periscopes
  for (const [x, z] of [[0.55, -0.95], [-0.6, -0.7]]) { P('paint', boxUV(cylY(0.33, 0.33, 0.06, x, 0.75, z, 24))); P('steel', box(0.06, 0.05, 0.36, x, 0.8, z)); P('dark', cylY(0.05, 0.05, 0.05, x + 0.22, 0.8, z + 0.12, 10)); }
  for (const dx of [-0.25, 0, 0.25]) { P('dark', box(0.13, 0.09, 0.08, -0.6 + dx, 0.77, -0.32)); P('glass', box(0.1, 0.05, 0.01, -0.6 + dx, 0.78, -0.277)); }

  // ---- smoke grenade launchers: 4-tube banks on the angled front faces ----
  for (const s of [-1, 1]) {
    const ang = s * Math.atan2(0.72, 0.96);           // face direction of the wedge side
    P('dark', box(0.34, 0.22, 0.16, s * 0.86, 0.48, 0.58, 0, ang, 0));
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { const g = new THREE.CylinderGeometry(0.045, 0.045, 0.26, 12); g.rotateX(Math.PI / 2 - 0.35); g.rotateY(ang); g.translate(s * (0.82 + c * 0.1), 0.46 + r * 0.1, 0.7 - c * 0.07); P('steel', g.toNonIndexed()); }
  }

  // ---- stowage: rear basket on the bustle + side baskets along the rear half of both sides (tube rails) ----
  const by = 0.3, bh = 0.42, bz1 = -2.2;                 // rear basket back edge
  const xo = 1.45, zs = -0.35;                           // side basket outer line / front end
  const rails = [];
  for (const yy of [by + bh, by + 0.22]) {
    for (const s of [-1, 1]) rails.push([[s * 1.12, yy, zs], [s * xo, yy, zs], [s * xo, yy, bz1 + 0.12], [s * (xo - 0.12), yy, bz1], [0, yy, bz1]].map((p) => p.slice()));
  }
  for (const r of rails) for (let i = 0; i < r.length - 1; i++) P('steel', tube([r[i], r[i + 1]], 0.02));
  // posts and floor bars
  for (const s of [-1, 1]) {
    for (const z of [zs, zs - 0.55, zs - 1.1, -1.55, bz1 + 0.12]) { P('steel', tube([[s * xo, by, z], [s * xo, by + bh, z]], 0.016)); P('steel', tube([[s * 1.1, by, z], [s * xo, by, z]], 0.014)); }
    for (const x of [0.35, 0.8, 1.2]) P('steel', tube([[s * x, by + bh, bz1], [s * x, by, bz1], [s * x, by, -1.9]], 0.014));
    // gear in the side baskets
    P('canvas', box(0.28, 0.26, 0.6, s * 1.29, by + 0.14, -0.75)); P('canvas', boxUV(new THREE.CapsuleGeometry(0.11, 0.55, 4, 10).rotateX(Math.PI / 2).translate(s * 1.28, by + 0.12, -1.45).toNonIndexed()));
  }
  for (const [x, w] of [[-0.55, 0.8], [0.4, 0.8]]) P('canvas', boxUV(new THREE.CapsuleGeometry(0.13, w, 4, 10).rotateZ(Math.PI / 2).translate(x, by + 0.15, -2.03).toNonIndexed()));   // bedrolls
  P('canvas', box(0.45, 0.28, 0.3, 0.95, by + 0.16, -2.0));
  for (const s of [-1, 1]) { P('dark', cylY(0.05, 0.05, 0.08, s * 0.95, 0.76, -1.45, 10)); P('steel', cylY(0.006, 0.006, 1.8, s * 0.95, 1.7, -1.45, 4)); P('dark', box(0.12, 0.1, 0.12, s * 1.12, 0.78, 0.35)); }

  mergeInto(turret, parts, M, 'turret');
  return turret;
}

// full vehicle: hull + turret on the ring (ring centre at z -1.15 on the hull roof, y 1.9)
export function buildK21(buildHull) {
  const M = mats(); const g = new THREE.Group(); g.name = 'K21';
  const hull = buildHull(M); g.add(hull);
  const t = buildK21Turret(M); t.position.set(0, 1.9, -0.7); g.add(t);
  g.userData.turret = t; g.userData.gun = t.getObjectByName('gun');
  return g;
}
