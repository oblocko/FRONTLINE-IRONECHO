// Articulated humanoid character with fully procedural animation:
// locomotion (walk/run/crouch-walk), aiming, firing kick, reload, hit flinch,
// death fall, wounded/lying pose, talk gestures, look-at head tracking, breathing.
// Hitboxes (spheres) are derived from bone positions for bullet tests.
import * as THREE from 'three';
import { pbr } from '../render/TextureFactory.js';

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

const LOOKS = {
  rok: { camo: 'camoROK', vest: 0x3f4632, helmet: 0x4b5338, skin: 0xc89f7f, gear: 0x2b2e24, patch: 0x2050a0 },
  kpa: { camo: 'camoEnemy', vest: 0x4a4934, helmet: 0x55573c, skin: 0xc29a78, gear: 0x30301f, patch: 0x9a2020 },
  us:  { camo: 'camoROK', vest: 0x6b6450, helmet: 0x6b6450, skin: 0xa77f62, gear: 0x3e3a2e, patch: 0x405070 },
  civ: { camo: 'fabric', vest: 0x2d3440, helmet: 0x1c1a18, skin: 0xd1a685, gear: 0x24262a, patch: 0x2d3440, civilian: true },
};

function rifleModel() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1b1a, roughness: 0.55, metalness: 0.4 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x2a2b28, roughness: 0.8 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(0.06, 0.09, 0.42), black, 0, 0, 0.05);
  add(new THREE.BoxGeometry(0.055, 0.07, 0.3), poly, 0, -0.005, 0.4);
  const b = add(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), black, 0, 0.01, 0.65); b.rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.05, 0.08, 0.26), poly, 0, -0.02, -0.28);
  add(new THREE.BoxGeometry(0.045, 0.16, 0.07), black, 0, -0.11, 0.12).rotation.x = 0.25;
  add(new THREE.BoxGeometry(0.04, 0.12, 0.05), poly, 0, -0.08, -0.07).rotation.x = -0.3;
  add(new THREE.BoxGeometry(0.04, 0.05, 0.12), black, 0, 0.07, 0.05);
  return g;
}

export class Actor {
  constructor(scene, { faction = 'rok', name = '', rank = '', variant = 0, scale = 1, weapon = true, hat = 'helmet' } = {}) {
    this.faction = faction; this.name = name; this.variant = variant;
    const L = LOOKS[faction] || LOOKS.rok;
    this.root = new THREE.Group(); this.root.scale.setScalar(scale);
    scene.add(this.root);
    const CIV_COLORS = [0x3b4a6b, 0x6b3b3b, 0x5a5a5a, 0x2f4f3f, 0x7a6a4a, 0x2a2a35, 0x8a8478, 0x4a3a5a];
    const civColor = CIV_COLORS[variant % CIV_COLORS.length], civPants = [0x24262c, 0x3a3f4a, 0x4a4036][variant % 3];
    const uniform = L.civilian ? pbr('fabric', { color: civPants, repeat: [2, 2], key: 'civp' + variant % 3 }) : pbr(L.camo, { repeat: [2, 2] });
    const vest = L.civilian ? pbr('fabric', { color: civColor, repeat: [2, 2], key: 'civ' + (variant % CIV_COLORS.length) }) : pbr('fabric', { color: L.vest, repeat: [2, 2] });
    const gear = new THREE.MeshStandardMaterial({ color: L.gear, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(L.skin).offsetHSL(0, 0, (variant % 3 - 1) * 0.04), roughness: 0.65 });
    const helmetMat = pbr('fabric', { color: L.helmet, repeat: [1, 1] });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.7 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x23241f, roughness: 0.9 });
    this.materials = [uniform, vest, gear, skin, helmetMat];
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };

    // hips & legs
    this.hips = joint(this.root, 0, 0.95, 0);
    mesh(new THREE.BoxGeometry(0.34, 0.2, 0.22), uniform, this.hips, 0, 0, 0);
    mesh(new THREE.BoxGeometry(0.36, 0.06, 0.24), gear, this.hips, 0, 0.08, 0); // belt
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = joint(this.hips, s * 0.1, -0.05, 0);
      mesh(new THREE.CapsuleGeometry(0.085, 0.32, 3, 8), uniform, thigh, 0, -0.22, 0);
      const knee = joint(thigh, 0, -0.44, 0);
      mesh(new THREE.CapsuleGeometry(0.07, 0.34, 3, 8), uniform, knee, 0, -0.21, 0);
      mesh(new THREE.BoxGeometry(0.11, 0.1, 0.13), gear, knee, 0, -0.02, 0.06); // knee pad
      const foot = mesh(new THREE.BoxGeometry(0.11, 0.1, 0.27), bootMat, knee, 0, -0.44, 0.05);
      this.legs.push({ thigh, knee, foot, side: s });
    }
    // torso
    this.spine = joint(this.hips, 0, 0.08, 0);
    this.chest = joint(this.spine, 0, 0.28, 0);
    mesh(new THREE.BoxGeometry(0.36, 0.5, 0.22), uniform, this.chest, 0, 0, 0);
    mesh(new THREE.BoxGeometry(0.4, 0.42, 0.29), vest, this.chest, 0, 0.0, 0.0);
    if (!L.civilian) {
      for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(0.09, 0.12, 0.06), gear, this.chest, -0.12 + i * 0.12, -0.08, 0.17); // pouches
      mesh(new THREE.BoxGeometry(0.3, 0.38, 0.16), gear, this.chest, 0, 0.0, -0.21); // pack
    } else if (variant % 3 === 0) mesh(new THREE.BoxGeometry(0.26, 0.32, 0.12), new THREE.MeshStandardMaterial({ color: 0x1f2a3a, roughness: 0.8 }), this.chest, 0, 0.0, -0.19); // backpack
    const patch = mesh(new THREE.PlaneGeometry(0.06, 0.04), new THREE.MeshStandardMaterial({ color: L.patch }), this.chest, 0.21, 0.14, 0); patch.rotation.y = Math.PI / 2;
    this.neck = joint(this.chest, 0, 0.3, 0);
    this.head = joint(this.neck, 0, 0.1, 0);
    mesh(new THREE.SphereGeometry(0.105, 14, 12), skin, this.head, 0, 0.02, 0.01).scale.set(0.95, 1.12, 1);
    mesh(new THREE.BoxGeometry(0.03, 0.04, 0.04), skin, this.head, 0, 0.0, 0.11); // nose
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.3 });
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.014, 6, 4), eyeMat, this.head, s * 0.038, 0.035, 0.096);
    this.jaw = mesh(new THREE.BoxGeometry(0.11, 0.035, 0.06), skin, this.head, 0, -0.06, 0.07);
    if (hat === 'helmet') {
      const helm = mesh(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.9), helmetMat, this.head, 0, 0.04, -0.005); helm.scale.set(1, 0.95, 1.08);
      mesh(new THREE.BoxGeometry(0.06, 0.04, 0.03), gear, this.head, 0, 0.13, 0.12); // NVG mount
      if (faction !== 'kpa') { const band = mesh(new THREE.TorusGeometry(0.135, 0.008, 4, 20), gear, this.head, 0, 0.07, 0); band.rotation.x = Math.PI / 2; }
    } else if (hat === 'cap') { mesh(new THREE.CylinderGeometry(0.115, 0.12, 0.08, 14), helmetMat, this.head, 0, 0.1, 0); mesh(new THREE.BoxGeometry(0.16, 0.015, 0.1), helmetMat, this.head, 0, 0.07, 0.11); }
    else if (hat === 'none') { const hair = mesh(new THREE.SphereGeometry(0.112, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.9 }), this.head, 0, 0.035, -0.012); hair.scale.set(1, 0.9, 1.08); }
    else if (hat === 'headset') { mesh(new THREE.TorusGeometry(0.11, 0.01, 4, 16, Math.PI), gear, this.head, 0, 0.04, 0); for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10), gear, this.head, s * 0.11, 0.02, 0).rotation.z = Math.PI / 2; }
    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = joint(this.chest, s * 0.22, 0.17, 0);
      mesh(new THREE.CapsuleGeometry(0.065, 0.24, 3, 8), uniform, shoulder, 0, -0.16, 0);
      const elbow = joint(shoulder, 0, -0.32, 0);
      mesh(new THREE.CapsuleGeometry(0.055, 0.22, 3, 8), uniform, elbow, 0, -0.14, 0);
      const hand = mesh(new THREE.BoxGeometry(0.07, 0.1, 0.05), glove, elbow, 0, -0.31, 0);
      this.arms.push({ shoulder, elbow, hand, side: s });
    }
    // weapon held in front of chest
    this.weapon = null;
    if (weapon) {
      this.weaponPivot = joint(this.chest, 0.06, 0.02, 0.25);
      this.weapon = rifleModel(); this.weaponPivot.add(this.weapon);
      this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.01, 0.82); this.weapon.add(this.muzzle);
    }

    // animation state
    this.anim = {
      speed: 0, phase: Math.random() * 6, crouch: 0, aim: 0, recoil: 0, flinch: 0, flinchDir: 1,
      reload: 0, dead: 0, deadDir: new THREE.Vector3(0, 0, 1), dying: false, lookYaw: 0, lookPitch: 0, talk: 0, talkT: 0,
      wounded: 0, gesture: 0, gestureKind: null, salute: 0, sit: 0, breathe: Math.random() * 6, limp: 0, cover: 0, point: 0,
    };
    this.target = { speed: 0, crouch: 0, aim: 0, lookYaw: 0, lookPitch: 0, sit: 0, wounded: 0 };
    this.hitSpheres = [
      { part: 'head', r: 0.15, node: this.head, off: new THREE.Vector3(0, 0.03, 0), mult: 2.5 },
      { part: 'chest', r: 0.26, node: this.chest, off: new THREE.Vector3(0, 0.02, 0), mult: 1 },
      { part: 'belly', r: 0.24, node: this.hips, off: new THREE.Vector3(0, 0.1, 0), mult: 1 },
      { part: 'legL', r: 0.16, node: this.legs[0].knee, off: new THREE.Vector3(0, 0.15, 0), mult: 0.7 },
      { part: 'legR', r: 0.16, node: this.legs[1].knee, off: new THREE.Vector3(0, 0.15, 0), mult: 0.7 },
    ];
    this._tmp = new THREE.Vector3();
  }

  get position() { return this.root.position; }
  setVisible(v) { this.root.visible = v; }
  dispose(scene) { scene.remove(this.root); }

  headWorld(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.head.getWorldPosition(out); }
  muzzleWorld(out = new THREE.Vector3()) { if (!this.muzzle) return this.headWorld(out); this.root.updateMatrixWorld(true); return this.muzzle.getWorldPosition(out); }
  chestWorld(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.chest.getWorldPosition(out); }

  // ray vs hit spheres; returns {dist, part, mult, point}
  rayTest(origin, dir, maxDist) {
    if (this.anim.dead > 0.6) return null;
    // broad phase
    const c = this.root.position; const dx = c.x - origin.x, dz = c.z - origin.z;
    const along = dx * dir.x + dz * dir.z; if (along < -1 || along > maxDist + 1) return null;
    const perp2 = dx * dx + dz * dz - along * along / Math.max(1e-6, dir.x * dir.x + dir.z * dir.z);
    if (perp2 > 1.5) return null;
    this.root.updateMatrixWorld(true);
    let best = null;
    for (const h of this.hitSpheres) {
      const p = h.node.localToWorld(this._tmp.copy(h.off));
      const ox = origin.x - p.x, oy = origin.y - p.y, oz = origin.z - p.z;
      const b = ox * dir.x + oy * dir.y + oz * dir.z; const cc = ox * ox + oy * oy + oz * oz - h.r * h.r;
      const disc = b * b - cc; if (disc < 0) continue;
      const t = -b - Math.sqrt(disc); if (t < 0 || t > maxDist) continue;
      if (!best || t < best.dist) best = { dist: t, part: h.part, mult: h.mult, point: origin.clone().addScaledVector(dir, t) };
    }
    return best;
  }

  flinch(dirSign = 1) { this.anim.flinch = 1; this.anim.flinchDir = dirSign; }
  fireKick() { this.anim.recoil = 1; }
  die(fromDir) {
    if (this.anim.dying) return;
    this.anim.dying = true; this.anim.deadDir.copy(fromDir).setY(0).normalize();
    // pick fall style relative to facing
    const fwd = new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
    this.anim.fallBack = fwd.dot(this.anim.deadDir) < 0 ? 1 : -1; // hit from front -> falls backwards
    this.anim.fallSide = (Math.random() - 0.5) * 0.8;
  }
  startTalk(dur = 2) { this.anim.talkT = dur; }
  gesture(kind, dur = 1.5) { this.anim.gestureKind = kind; this.anim.gesture = dur; }

  update(dt) {
    const a = this.anim, t = this.target;
    a.speed = damp(a.speed, t.speed, 8, dt);
    a.crouch = damp(a.crouch, t.crouch, 7, dt);
    a.aim = damp(a.aim, t.aim, 9, dt);
    a.sit = damp(a.sit, t.sit, 4, dt);
    a.wounded = damp(a.wounded, t.wounded, 3, dt);
    a.lookYaw = damp(a.lookYaw, t.lookYaw, 6, dt);
    a.lookPitch = damp(a.lookPitch, t.lookPitch, 6, dt);
    a.recoil = Math.max(0, a.recoil - dt * 9);
    a.flinch = Math.max(0, a.flinch - dt * 3.5);
    a.breathe += dt * (1.3 + a.speed * 0.3);
    if (a.talkT > 0) { a.talkT -= dt; a.talk = damp(a.talk, 1, 8, dt); } else a.talk = damp(a.talk, 0, 6, dt);
    if (a.gesture > 0) a.gesture -= dt;
    if (a.reload > 0) a.reload = Math.max(0, a.reload - dt / 2.4);

    if (a.dying) { a.dead = Math.min(1, a.dead + dt * 1.6); }

    const spd = a.speed; // m/s
    const running = Math.min(1, Math.max(0, (spd - 2.2) / 2));
    a.phase += dt * (spd > 0.05 ? (4.5 + spd * 1.6) : 0);
    const ph = a.phase; const sw = Math.min(1, spd / 1.5);
    const stride = (0.45 + running * 0.35) * sw;
    const cr = a.crouch;

    // hips height & bob
    const bob = Math.abs(Math.sin(ph)) * 0.04 * sw * (1 + running);
    this.hips.position.y = 0.95 - cr * 0.38 + bob - a.sit * 0.45;
    this.hips.rotation.y = Math.sin(ph) * 0.08 * sw;
    // legs
    for (const leg of this.legs) {
      const p = ph + (leg.side > 0 ? Math.PI : 0);
      let th = Math.sin(p) * stride - cr * 0.9 - a.sit * 1.4;
      let kn = Math.max(0, -Math.cos(p)) * (0.6 + running * 0.6) * sw + cr * 1.6 + a.sit * 1.5;
      if (a.limp > 0 && leg.side > 0) { kn *= 0.4; }
      leg.thigh.rotation.x = -th; leg.knee.rotation.x = kn;
      leg.thigh.rotation.z = leg.side * 0.04;
    }
    // torso lean & breathing
    const breath = Math.sin(a.breathe) * 0.015;
    this.spine.rotation.x = 0.08 * sw + running * 0.18 + cr * 0.25 + breath - a.recoil * 0.05 - a.flinch * 0.25;
    this.spine.rotation.z = a.flinch * 0.2 * a.flinchDir;
    this.spine.rotation.y = a.lookYaw * 0.5 * (1 - a.wounded);
    this.chest.rotation.x = -a.lookPitch * 0.4 * a.aim;
    this.chest.rotation.z = Math.sin(ph) * 0.04 * sw;
    this.neck.rotation.y = a.lookYaw * 0.5;
    this.head.rotation.x = -a.lookPitch * (1 - a.aim * 0.4) + (a.talk > 0.1 ? Math.sin(a.breathe * 4) * 0.04 * a.talk : 0);
    this.jaw.position.y = -0.06 - (a.talk > 0.1 ? Math.abs(Math.sin(a.breathe * 9)) * 0.012 * a.talk : 0);

    // arms: aim pose vs carry pose
    const aim = a.aim;
    const [L, R] = this.arms;
    const carryR = { sx: -0.5, sz: -0.15, el: -1.0 }, aimR = { sx: -1.35, sz: 0.05, el: -0.35 };
    const carryL = { sx: -0.9, sz: 0.35, el: -1.25 }, aimL = { sx: -1.45, sz: 0.55, el: -0.55 };
    R.shoulder.rotation.x = lerp(carryR.sx, aimR.sx, aim) - a.lookPitch * aim * 0.8 + a.recoil * 0.12;
    R.shoulder.rotation.z = lerp(carryR.sz, aimR.sz, aim);
    R.elbow.rotation.x = lerp(carryR.el, aimR.el, aim);
    L.shoulder.rotation.x = lerp(carryL.sx, aimL.sx, aim) - a.lookPitch * aim * 0.8 + a.recoil * 0.12;
    L.shoulder.rotation.z = lerp(carryL.sz, aimL.sz, aim);
    L.elbow.rotation.x = lerp(carryL.el, aimL.el, aim);
    if (sw > 0.1 && aim < 0.3) { const k = Math.sin(ph) * 0.15 * sw; R.shoulder.rotation.x += k; L.shoulder.rotation.x += k * 0.5; }
    // reload: left hand to belt and back
    if (a.reload > 0) { const r = Math.sin(a.reload * Math.PI); L.shoulder.rotation.x = lerp(L.shoulder.rotation.x, 0.1, r); L.elbow.rotation.x = lerp(L.elbow.rotation.x, -0.8, r); }
    // gestures
    if (a.gesture > 0) {
      const g = Math.min(1, a.gesture * 2, 1);
      if (a.gestureKind === 'point') { L.shoulder.rotation.x = lerp(L.shoulder.rotation.x, -1.6, g); L.shoulder.rotation.z = lerp(L.shoulder.rotation.z, 0.2, g); L.elbow.rotation.x = lerp(L.elbow.rotation.x, -0.05, g); }
      if (a.gestureKind === 'wave') { L.shoulder.rotation.x = lerp(L.shoulder.rotation.x, -2.6, g); L.elbow.rotation.x = lerp(L.elbow.rotation.x, -0.5 + Math.sin(a.breathe * 8) * 0.4, g); }
      if (a.gestureKind === 'halt') { L.shoulder.rotation.x = lerp(L.shoulder.rotation.x, -2.9, g); L.elbow.rotation.x = lerp(L.elbow.rotation.x, -1.5, g); }
      if (a.gestureKind === 'radio') { L.shoulder.rotation.x = lerp(L.shoulder.rotation.x, -1.8, g); L.shoulder.rotation.z = lerp(L.shoulder.rotation.z, -0.6, g); L.elbow.rotation.x = lerp(L.elbow.rotation.x, -2.2, g); this.head.rotation.z = 0.2 * g; }
    } else this.head.rotation.z = 0;
    if (a.talk > 0.1 && aim < 0.3 && a.gesture <= 0) { L.shoulder.rotation.x += Math.sin(a.breathe * 2.2) * 0.12 * a.talk; L.elbow.rotation.x -= Math.max(0, Math.sin(a.breathe * 1.7)) * 0.3 * a.talk; }
    if (this.weaponPivot) {
      this.weaponPivot.position.set(lerp(0.12, 0.08, aim), lerp(-0.08, 0.12, aim), lerp(0.22, 0.32, aim));
      this.weaponPivot.rotation.set(lerp(0.5, 0, aim) - a.lookPitch * aim * 0.6 - a.recoil * 0.08, lerp(-0.6, 0, aim), lerp(0.4, 0, aim));
    }

    // wounded: lying on back, propped on elbow
    if (a.wounded > 0.01) {
      const w = a.wounded;
      this.hips.position.y = lerp(this.hips.position.y, 0.18, w);
      this.hips.rotation.x = lerp(0, -1.35, w);
      this.spine.rotation.x = lerp(this.spine.rotation.x, 0.35, w);
      for (const leg of this.legs) { leg.thigh.rotation.x = lerp(leg.thigh.rotation.x, leg.side > 0 ? -0.2 : -0.6, w); leg.knee.rotation.x = lerp(leg.knee.rotation.x, leg.side > 0 ? 0.3 : 1.0, w); }
      R.shoulder.rotation.x = lerp(R.shoulder.rotation.x, 0.4, w); R.elbow.rotation.x = lerp(R.elbow.rotation.x, -1.2, w);
      L.shoulder.rotation.x = lerp(L.shoulder.rotation.x, -0.6, w); L.elbow.rotation.x = lerp(L.elbow.rotation.x, -1.9, w);
      this.head.rotation.x = lerp(this.head.rotation.x, 0.4 + Math.sin(a.breathe * 1.5) * 0.08, w);
    } else this.hips.rotation.x = 0;

    // death fall: rotate whole skeleton around feet
    if (a.dead > 0) {
      const d = a.dead; const e = d < 1 ? 1 - Math.pow(1 - d, 3) : 1;
      const fall = a.fallBack;
      // knees buckle first then topple
      const buckle = Math.min(1, d * 2.2);
      for (const leg of this.legs) { leg.knee.rotation.x = lerp(leg.knee.rotation.x, 1.2 * (1 - e) + 0.3, buckle); leg.thigh.rotation.x = lerp(leg.thigh.rotation.x, fall > 0 ? 0.1 : -0.8, buckle); }
      this.hips.position.y = lerp(this.hips.position.y, 0.15, e);
      this.hips.rotation.x = lerp(this.hips.rotation.x, fall > 0 ? -1.5 : 1.45, Math.max(0, (d - 0.25) / 0.75) ** 0.8);
      this.hips.rotation.z = a.fallSide * e;
      R.shoulder.rotation.x = lerp(R.shoulder.rotation.x, fall > 0 ? -2.5 : 0.2, e); L.shoulder.rotation.x = lerp(L.shoulder.rotation.x, fall > 0 ? -2.2 : 0.4, e);
      R.shoulder.rotation.z = lerp(R.shoulder.rotation.z, -0.6, e); L.shoulder.rotation.z = lerp(L.shoulder.rotation.z, 0.7, e);
      this.spine.rotation.x = lerp(this.spine.rotation.x, 0.1, e); this.spine.rotation.y = 0;
      this.head.rotation.x = lerp(this.head.rotation.x, 0.3, e); this.head.rotation.y = a.fallSide * 0.6 * e;
      if (this.weaponPivot && d > 0.3 && !this._dropped) { this._dropped = true; this.dropWeapon(); }
    }
  }
  dropWeapon() {
    if (!this.weapon) return;
    const wp = new THREE.Vector3(); this.weapon.getWorldPosition(wp);
    const scene = this.root.parent; if (!scene) return;
    this.weaponPivot.remove(this.weapon);
    this.weapon.position.copy(wp); this.weapon.position.y = this.root.position.y + 0.05;
    this.weapon.rotation.set(0, Math.random() * 6, Math.PI / 2);
    scene.add(this.weapon);
    this.droppedWeapon = this.weapon;
  }
}
