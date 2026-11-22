// K21 IFV — two-man turret with the 40 mm gun, original procedural model (after reference photos).
// Hierarchy for later use in the game: turret (yaw, origin = ring centre on the hull roof) → gun (pitch, trunnion).
// Axes: +Z = front, +Y = up, metres.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mats, profileX, box, cylX, cylY, clean, boxUV } from './k21_hull.js';

const cylZ = (r0, r1, len, x, y, z, seg = 20) => { const g = new THREE.CylinderGeometry(r1, r0, len, seg); g.rotateX(Math.PI / 2); g.translate(x, y, z); return g.toNonIndexed(); };
const tube = (pts, r, seg = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.01), pts.length * 6, r, seg, false).toNonIndexed();

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

  // ---- main body: side profile [z, y] — long sloped front, flat roof, rear bustle — extruded across the width ----
  const BODY = [[-1.55, 0.06], [1.0, 0.06], [1.22, 0.2], [0.55, 0.66], [-1.25, 0.72], [-1.62, 0.62], [-1.62, 0.2]];
  P('paint', profileX(BODY, -1.12, 1.12, 0.04));
  // side armour cheeks: slightly wider, sloped plates on the front half of each side
  const CHEEK = [[-0.55, 0.12], [1.05, 0.12], [1.12, 0.22], [0.5, 0.6], [-0.55, 0.64]];
  for (const s of [-1, 1]) P('paint', s > 0 ? profileX(CHEEK, 1.05, 1.24, 0.02) : profileX(CHEEK, -1.24, -1.05, 0.02));
  // roof edge bevel strips + armour bolt heads
  for (const s of [-1, 1]) { P('paint', box(0.12, 0.06, 1.8, s * 1.06, 0.71, -0.35, 0, 0, s * 0.6)); for (let z = -1.3; z < 0.4; z += 0.42) P('steel', cylX(0.02, 0.03, s * 1.245, 0.36, z, 8)); }
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
  P('paint', box(0.42, 0.3, 0.5, -0.62, 0.86, 0.2)); P('dark', box(0.32, 0.16, 0.02, -0.62, 0.88, 0.455)); P('glass', box(0.28, 0.12, 0.01, -0.62, 0.88, 0.467));
  P('paint', box(0.46, 0.05, 0.56, -0.62, 1.03, 0.2));              // sight hood
  // commander's panoramic sight: pedestal + round head, right-rear of the roof
  P('paint', boxUV(cylY(0.17, 0.2, 0.2, 0.55, 0.82, -0.35, 20)));
  P('paint', boxUV(cylY(0.26, 0.26, 0.3, 0.55, 1.07, -0.35, 28))); P('dark', cylY(0.27, 0.27, 0.035, 0.55, 1.23, -0.35, 28));
  P('dark', box(0.32, 0.16, 0.04, 0.55, 1.08, -0.11)); P('glass', box(0.26, 0.11, 0.01, 0.55, 1.08, -0.088));
  // hatches (commander right, gunner left), periscopes
  for (const [x, z] of [[0.55, -0.95], [-0.6, -0.7]]) { P('paint', boxUV(cylY(0.33, 0.33, 0.06, x, 0.75, z, 24))); P('steel', box(0.06, 0.05, 0.36, x, 0.8, z)); P('dark', cylY(0.05, 0.05, 0.05, x + 0.22, 0.8, z + 0.12, 10)); }
  for (const dx of [-0.25, 0, 0.25]) { P('dark', box(0.13, 0.09, 0.08, -0.6 + dx, 0.77, -0.32)); P('glass', box(0.1, 0.05, 0.01, -0.6 + dx, 0.78, -0.277)); }

  // ---- smoke grenade launchers: 4-tube banks on both front corners ----
  for (const s of [-1, 1]) {
    P('dark', box(0.32, 0.22, 0.18, s * 1.02, 0.5, 0.62, 0, s * 0.5, 0));
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { const g = new THREE.CylinderGeometry(0.045, 0.045, 0.26, 12); g.rotateX(Math.PI / 2 - 0.35); g.rotateY(s * 0.55); g.translate(s * (1.0 + c * 0.1), 0.48 + r * 0.1, 0.78); P('steel', g.toNonIndexed()); }
  }

  // ---- rear: stowage basket (tube rails) on the bustle, antennas, warning sensors ----
  const bz0 = -1.62, bz1 = -2.15, by = 0.3, bh = 0.42;
  for (const x of [-1.05, 1.05]) { P('steel', tube([[x, by + bh, bz0], [x, by + bh, bz1], [x, by, bz1]], 0.02)); }
  P('steel', tube([[-1.05, by + bh, bz1], [1.05, by + bh, bz1]], 0.02)); P('steel', tube([[-1.05, by + 0.2, bz1], [1.05, by + 0.2, bz1]], 0.015));
  for (let x = -0.9; x <= 0.91; x += 0.3) P('steel', tube([[x, by, bz0], [x, by, bz1], [x, by + bh, bz1]], 0.012));
  for (const [x, w] of [[-0.6, 0.8], [0.35, 0.9]]) P('canvas', boxUV(new THREE.CapsuleGeometry(0.13, w, 4, 10).rotateZ(Math.PI / 2).translate(x, by + 0.15, -1.85).toNonIndexed()));   // bedrolls
  P('canvas', box(0.5, 0.3, 0.35, 0.65, by + 0.17, -1.86)); P('canvas', box(0.45, 0.25, 0.3, -0.75, by + 0.14, -1.9));   // packs
  for (const s of [-1, 1]) { P('dark', cylY(0.05, 0.05, 0.08, s * 0.95, 0.76, -1.45, 10)); P('steel', cylY(0.006, 0.006, 1.8, s * 0.95, 1.7, -1.45, 4)); P('dark', box(0.12, 0.1, 0.12, s * 1.12, 0.78, 0.35)); }

  mergeInto(turret, parts, M, 'turret');
  return turret;
}

// full vehicle: hull + turret on the ring (ring centre at z -1.15 on the hull roof, y 1.9)
export function buildK21(buildHull) {
  const M = mats(); const g = new THREE.Group(); g.name = 'K21';
  const hull = buildHull(M); g.add(hull);
  const t = buildK21Turret(M); t.position.set(0, 1.9, -1.15); g.add(t);
  g.userData.turret = t; g.userData.gun = t.getObjectByName('gun');
  return g;
}
