// Realistic weapon / armour models (Sketchfab, CC-BY — see assets/CREDITS.md), normalised to the game's frames.
// Weapon frame (same as the procedural NPC rifles and the actor IK): +Z = muzzle, pistol grip at (0,-0.055,-0.035),
// support hand at (0,-0.03,0.25). Each entry: rot (Euler applied to the raw scene), len (overall length in m),
// off (metres, added after the bbox centre is moved to the origin), muzzle (z of the muzzle in the frame).
import * as THREE from 'three';
import { loadGLTF } from '../core/Assets.js';

export const GUNS = {
  k2c1:  { file: 'gear/k2c1.glb',  rot: [0, Math.PI, 0], len: 0.98, off: [0, -0.01, 0.155], muzzle: 0.645, muzzleY: 0.04 },
  ak74:  { file: 'gear/ak74.glb',  pca: true, rot: [0, 0, 0], len: 0.94, off: [0, -0.055, 0.14], muzzle: 0.6, muzzleY: -0.005 },
  ak74m: { file: 'gear/ak74m.glb', rot: [0, Math.PI, 0], len: 0.94, off: [0, -0.045, 0.155], muzzle: 0.625, muzzleY: 0.035 },
  m4a1:  { file: 'gear/m4a1.glb',  rot: [0, 0, 0], len: 0.84, off: [0, -0.015, 0.125], muzzle: 0.543, muzzleY: 0.037 },
};
const cache = {};
export async function loadGear(names = Object.keys(GUNS)) {
  await Promise.all([loadArmor(), ...names.map(async (n) => {
    if (cache[n]) return;
    try { const g = await loadGLTF(GUNS[n].file); cache[n] = normaliseGun(g.scene, GUNS[n]); }
    catch (e) { console.warn('gear load failed', n, e); cache[n] = null; }
  })]);
}
export function rawBox(scene) { scene.updateMatrixWorld(true); return new THREE.Box3().setFromObject(scene); }
function normaliseGun(scene, c) {
  const root = new THREE.Group(); const inner = new THREE.Group(); if (!c.pca) inner.add(scene); root.add(inner);
  if (c.pca) { // model is posed at an arbitrary angle: align its principal axes (length → Z, height → Y, width → X)
    scene.updateMatrixWorld(true); const pts = []; const v = new THREE.Vector3(), m = new THREE.Vector3();
    scene.traverse((o) => { if (o.isMesh) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).clone()); } });
    for (const p of pts) m.add(p); m.divideScalar(pts.length);
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of pts) { const d = [p.x - m.x, p.y - m.y, p.z - m.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
    const axes = []; const Cm = C.map((r) => r.slice());
    for (let k = 0; k < 2; k++) { let x = new THREE.Vector3(1, 0.7, 0.3).normalize(); for (let it = 0; it < 80; it++) { x = new THREE.Vector3(Cm[0][0] * x.x + Cm[0][1] * x.y + Cm[0][2] * x.z, Cm[1][0] * x.x + Cm[1][1] * x.y + Cm[1][2] * x.z, Cm[2][0] * x.x + Cm[2][1] * x.y + Cm[2][2] * x.z).normalize(); }
      let lam = 0; for (const p of pts) lam += ((p.x - m.x) * x.x + (p.y - m.y) * x.y + (p.z - m.z) * x.z) ** 2; axes.push(x);
      const a = [x.x, x.y, x.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) Cm[i][j] -= lam * a[i] * a[j]; }
    const zA = axes[0], yA = axes[1]; if (yA.y < 0) yA.negate(); const xA = new THREE.Vector3().crossVectors(yA, zA);
    const basis = new THREE.Matrix4().makeBasis(xA, yA, zA).transpose();   // world → aligned
    const g = new THREE.Group(); g.quaternion.setFromRotationMatrix(basis); g.add(scene); inner.add(g);
  }
  inner.rotation.set(...c.rot); root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(inner), sz = b.getSize(new THREE.Vector3()), ctr = b.getCenter(new THREE.Vector3());
  const s = c.len / sz.z; inner.scale.setScalar(s); inner.position.copy(ctr).multiplyScalar(-s).add(new THREE.Vector3(...c.off));
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  root.userData.muzzleZ = c.muzzle; root.userData.muzzleY = c.muzzleY ?? 0.005; root.userData.size = sz.clone().multiplyScalar(s);
  return root;
}
export function hasGun(n) { return !!cache[n]; }
export function cloneGun(n) { const src = cache[n]; if (!src) return null; const g = src.clone(true); g.userData = { ...src.userData }; return g; }

// ---- body armour / helmets: one mesh each, re-oriented (front +Z, up +Y) and fitted to a box (w,h,d in m) ----
// basis: images of the source x,y,z axes (columns) — for models authored Z-up / X-forward
const XFWD = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
export const ARMOR = {
  rig:     { file: 'gear/vestpack.glb', mesh: /Vest_T0/, size: [0.40, 0.50, 0.37] },        // chest rig (KPA)
  olive:   { file: 'gear/vestpack.glb', mesh: /^Vest_Vest_0/, size: [0.40, 0.46, 0.33] },   // plate carrier (ROK)
  heavy:   { file: 'gear/carrier.glb', basis: XFWD, size: [0.42, 0.44, 0.36] },        // loaded carrier (SF / US)
  helmet:  { file: 'gear/helmet_hs.glb', basis: XFWD, size: [0.30, 0.22, 0.30] },       // high-cut helmet + headset
};
const armorCache = {};
export async function loadArmor(names = Object.keys(ARMOR)) {
  const files = {};
  for (const n of names) (files[ARMOR[n].file] ||= []).push(n);
  await Promise.all(Object.entries(files).map(async ([file, list]) => {
    let g; try { g = await loadGLTF(file); } catch (e) { console.warn('armour load failed', file, e); return; }
    g.scene.updateMatrixWorld(true);
    for (const n of list) {
      const c = ARMOR[n]; let mesh = null;
      g.scene.traverse((o) => { if (o.isMesh && !mesh && (!c.mesh || c.mesh.test(o.name))) mesh = o; });
      if (!mesh) { console.warn('armour mesh missing', n); continue; }
      const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      if (c.basis) { const [a, b, d] = c.basis; geo.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(...d))); }
      geo.computeBoundingBox(); const bb = geo.boundingBox, sz = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
      geo.translate(-ctr.x, -ctr.y, -ctr.z); geo.scale(c.size[0] / sz.x, c.size[1] / sz.y, c.size[2] / sz.z);
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      geo.computeVertexNormals();
      const mat = mesh.material.clone(); mat.side = THREE.DoubleSide;
      armorCache[n] = { geometry: geo, material: mat };
    }
  }));
}
// geometry in model space centred at the origin (caller translates); material shared
export function armorPart(n) { return armorCache[n] || null; }
