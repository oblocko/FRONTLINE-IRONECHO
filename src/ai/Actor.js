// Articulated humanoid character with fully procedural animation:
// locomotion (walk/run/crouch-walk), aiming, firing kick, reload, hit flinch,
// death fall, wounded/lying pose, talk gestures, look-at head tracking, breathing.
// Hitboxes (spheres) are derived from bone positions for bullet tests.
import * as THREE from 'three';
import { buildHuman, buildNpcRifle } from './HumanModel.js';

const lerp = (a, b, t) => a + (b - a) * t;

// ---- two-bone arm IK (shoulder → elbow → palm), solved in the chest bone's space ----
const UPPER = 0.32, FORE = 0.30, DOWN = new THREE.Vector3(0, -1, 0), X = new THREE.Vector3(1, 0, 0);
const _d = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3(), _x = new THREE.Vector3(), _f = new THREE.Vector3(), _h = new THREE.Vector3(), _p = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _qe = new THREE.Quaternion();
function signedAngle(from, to, axis) {
  const a = from.clone().projectOnPlane(axis).normalize(), b = to.clone().projectOnPlane(axis).normalize();
  return Math.atan2(axis.dot(_x.crossVectors(a, b)), a.dot(b));
}
function solveArm(shoulderPos, target, pole) {
  _d.copy(target).sub(shoulderPos);
  const dist = Math.max(0.1, Math.min(UPPER + FORE - 0.004, _d.length())); _d.normalize();
  const A = Math.acos(Math.max(-1, Math.min(1, (UPPER * UPPER + dist * dist - FORE * FORE) / (2 * UPPER * dist))));
  _n.crossVectors(_d, pole); if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0); _n.normalize();
  _u.copy(_d).applyAxisAngle(_n, A);                                   // upper arm direction (elbow toward the pole)
  _q1.setFromUnitVectors(DOWN, _u);
  _x.copy(X).applyQuaternion(_q1);
  _qt.setFromAxisAngle(_u, signedAngle(_x, _n, _u));                  // twist so the elbow hinge axis = plane normal
  const q = _qt.multiply(_q1).clone();
  const bend = Math.PI - Math.acos(Math.max(-1, Math.min(1, (UPPER * UPPER + FORE * FORE - dist * dist) / (2 * UPPER * FORE))));
  // pick the hinge direction that actually reaches the target
  let best = 0, bestErr = Infinity;
  for (const sgn of [-1, 1]) {
    _qe.setFromAxisAngle(X, sgn * bend);
    _f.copy(DOWN).applyQuaternion(_qe).applyQuaternion(q).multiplyScalar(FORE);
    _h.copy(DOWN).applyQuaternion(q).multiplyScalar(UPPER).add(shoulderPos).add(_f);
    const err = _h.distanceToSquared(target); if (err < bestErr) { bestErr = err; best = sgn * bend; }
  }
  return { q, elbow: best };
}
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

const LOOKS = {
  rok: { camo: 'camoROK', vest: 0x3f4632, helmet: 0x4b5338, skin: 0xc89f7f, gear: 0x2b2e24, patch: 0x2050a0 },
  kpa: { camo: 'camoEnemy', vest: 0x4a4934, helmet: 0x55573c, skin: 0xc29a78, gear: 0x30301f, patch: 0x9a2020 },
  us:  { camo: 'camoROK', vest: 0x6b6450, helmet: 0x6b6450, skin: 0xa77f62, gear: 0x3e3a2e, patch: 0x405070 },
  civ: { camo: 'fabric', vest: 0x2d3440, helmet: 0x1c1a18, skin: 0xd1a685, gear: 0x24262a, patch: 0x2d3440, civilian: true },
};

export class Actor {
  constructor(scene, { faction = 'rok', name = '', rank = '', variant = 0, scale = 1, weapon = true, hat = 'helmet' } = {}) {
    this.faction = faction; this.name = name; this.variant = variant;
    const L = LOOKS[faction] || LOOKS.rok;
    this.root = new THREE.Group(); this.root.scale.setScalar(scale); this.root.userData.dynamic = true; // never merged by the static batcher
    scene.add(this.root);
    // skinned body (see HumanModel.js); bones are driven by the procedural animation below
    const human = buildHuman({ faction: L.civilian ? 'civ' : faction, variant, hat });
    this.root.add(human.root); this.human = human;
    const Bn = human.bones;
    this.hips = Bn.hips; this.spine = Bn.spine; this.chest = Bn.chest; this.neck = Bn.neck; this.head = Bn.head; this.jaw = Bn.jaw;
    this.legs = [{ thigh: Bn.thighL, knee: Bn.kneeL, side: -1 }, { thigh: Bn.thighR, knee: Bn.kneeR, side: 1 }];
    this.arms = [{ shoulder: Bn.shoulderL, elbow: Bn.elbowL, side: -1 }, { shoulder: Bn.shoulderR, elbow: Bn.elbowR, side: 1 }];
    this.materials = human.meshes.map((m) => m.material);
    // weapon held in front of chest
    this.weapon = null;
    if (weapon) {
      this.weaponPivot = new THREE.Group(); this.weaponPivot.position.set(0.06, 0.02, 0.25); this.chest.add(this.weaponPivot);
      this.weapon = buildNpcRifle(); this.weaponPivot.add(this.weapon);
      this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.005, 0.77); this.weapon.add(this.muzzle);
      // IK targets: pistol grip (right palm) and handguard just ahead of the magazine (left palm), weapon-local
      this.gripR = new THREE.Vector3(0.0, -0.06, -0.04); this.gripL = new THREE.Vector3(0.0, -0.035, 0.24);
      this.poleR = new THREE.Vector3(0.7, -1, -0.35).normalize(); this.poleL = new THREE.Vector3(-0.5, -1, 0.1).normalize();
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
    // unarmed (civilians, or after the weapon is dropped): relaxed arms with a natural walk swing
    if (!this.weapon || this.weapon.parent !== this.weaponPivot) {
      for (const arm of [L, R]) {
        const swing = Math.sin(ph + (arm.side > 0 ? 0 : Math.PI)) * 0.45 * sw;
        arm.shoulder.rotation.set(-swing - cr * 0.3, 0, arm.side * 0.08);
        arm.elbow.rotation.set(-0.18 - Math.max(0, swing) * 0.4 - cr * 0.6, 0, 0);
      }
    }
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
      this.weaponPivot.position.set(lerp(0.1, 0.12, aim), lerp(-0.1, 0.09, aim), lerp(0.24, 0.3, aim));
      this.weaponPivot.rotation.set(lerp(0.45, 0, aim) - a.lookPitch * aim * 0.6 - a.recoil * 0.08, lerp(-0.7, -0.04, aim), lerp(0.35, 0, aim));
      // hands on the weapon via IK (blended out while gesturing, reloading, wounded, sitting or dying)
      if (this.weapon && this.weapon.parent === this.weaponPivot && !a.dying) {
        const free = 1 - Math.max(a.wounded, a.sit);
        const wR = free, wL = free * (a.reload > 0 ? 1 - Math.sin(a.reload * Math.PI) : 1) * (a.gesture > 0 ? 0 : 1);
        this.weaponPivot.updateMatrix();
        for (const [arm, local, w, pole] of [[R, this.gripR, wR, this.poleR], [L, this.gripL, wL, this.poleL]]) {
          if (w <= 0.01) continue;
          _p.copy(local).applyMatrix4(this.weaponPivot.matrix);
          const ik = solveArm(arm.shoulder.position, _p, pole);
          arm.shoulder.quaternion.slerp(ik.q, w);
          arm.elbow.rotation.x = lerp(arm.elbow.rotation.x, ik.elbow, w); arm.elbow.rotation.y = 0; arm.elbow.rotation.z = 0;
        }
      }
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
