// Character driven by authored animation clips (Quaternius Universal Animation
// Library, CC0) with procedural layers on top:
//   clips  : idle / walk / jog / sprint / crouch idle+walk / sit / lying / death /
//            hit reactions / overhand throw / talking / phone (radio)
//   layers : spine aim (yaw/pitch), rifle pose (carry ↔ shoulder), two-bone arm IK
//            putting both hands on the rifle, finger curl, recoil, reload reach,
//            pointing / halt gestures, head look-at.
// Same public interface as the procedural Actor (target / anim / rayTest / die …).
import * as THREE from 'three';
import { characterLib, cloneBody, bodyMaterial, gearFor } from './CharacterLib.js';
import { buildNpcRifle } from './HumanModel.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const tri = (a, b, c, x) => (x <= a || x >= c ? 0 : x < b ? (x - a) / (b - a) : (c - x) / (c - b));

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const IDQ = new THREE.Quaternion();

// rotate a bone (in world space) so that direction `from` becomes `to`, blended by w
function rotateToward(bone, from, to, w = 1) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  _q1.setFromUnitVectors(_v4.copy(from).normalize(), _v5.copy(to).normalize());
  if (w < 1) _q1.slerp(IDQ, 1 - w);
  bone.getWorldQuaternion(_q2); _q2.premultiply(_q1);
  bone.parent.getWorldQuaternion(_q3).invert(); bone.quaternion.copy(_q3.multiply(_q2));
  bone.updateMatrixWorld(true);
}
function setWorldQuat(bone, qWorld, w = 1) {
  bone.parent.getWorldQuaternion(_q3).invert(); _q3.multiply(qWorld);
  bone.quaternion.slerp(_q3, w); bone.updateMatrixWorld(true);
}
function rotateWorldAxis(bone, axis, angle) {
  if (Math.abs(angle) < 1e-5) return;
  _q1.setFromAxisAngle(axis, angle); bone.getWorldQuaternion(_q2); _q2.premultiply(_q1);
  setWorldQuat(bone, _q2, 1);
}
// orthonormal basis (x = along fingers, z = index→pinky) → rotation matrix
function basis(axis, side, out) {
  const x = _v1.copy(axis).normalize(); const z = _v2.copy(side).addScaledVector(x, -side.dot(x)).normalize(); const y = _v3.crossVectors(z, x);
  return out.makeBasis(x, y, z);
}

const CLIPS = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Idle_Talking_Loop', 'Idle_TalkingPhone_Loop', 'LayToIdle', 'Death01', 'Hit_Chest', 'Hit_Head', 'OverhandThrow'];
const ONESHOT = new Set(['Death01', 'Hit_Chest', 'Hit_Head', 'OverhandThrow']);
const FINGERS = ['index', 'middle', 'ring', 'pinky'];

export class ModelActor {
  constructor(scene, { faction = 'rok', name = '', variant = 0, scale = 1, weapon = true, hat = 'helmet' } = {}) {
    const lib = characterLib();
    this.faction = faction; this.name = name; this.variant = variant; this.isModel = true;
    const civ = faction === 'civ';
    const sex = civ && lib.f && variant % 3 === 1 ? 'f' : 'm'; this.sex = sex;
    this.root = new THREE.Group(); this.root.scale.setScalar(scale); this.root.userData.dynamic = true; scene.add(this.root);
    this.model = cloneBody(sex); this.root.add(this.model);
    const look = civ ? 'civ' : (!weapon && hat === 'cap') ? 'police' : faction;
    this.bones = {}; let body = null;
    this.model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; if (o.isSkinnedMesh && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o; });
    body.material = bodyMaterial(body.material, look, variant);
    const B = this.bones;
    // hair / eyebrows (rest-space meshes re-parented to the head bone)
    const rest = lib[sex].restMatrix || (lib[sex].restMatrix = (() => { const o = {}; lib[sex].scene.updateMatrixWorld(true); lib[sex].scene.traverse((n) => { if (n.isBone) o[n.name] = n.matrixWorld.clone(); }); return o; })());
    const headInv = rest.Head.clone().invert();
    const addHair = (id, color) => {
      const src = lib.hairs[id]; if (!src) return;
      const mat = src.material.clone(); if (color != null) mat.color.setHex(color);
      const m = new THREE.Mesh(src.geometry, mat); m.matrixAutoUpdate = false; m.matrix.multiplyMatrices(headInv, src.matrixWorld); m.castShadow = true; B.Head.add(m);
    };
    const HAIRC = [0x1a1410, 0x2a1d14, 0x0f0d0b, 0x3a2a1c, 0x55463a];
    addHair(sex === 'f' ? 'eyebrows_female' : 'eyebrows_regular', 0x1a1410);
    if (hat === 'none' || hat === 'headset') {
      const pick = sex === 'f' ? ['hair_long', 'hair_buns', 'hair_buzzedfemale'][variant % 3] : ['hair_simpleparted', 'hair_buzzed', 'hair_simpleparted'][variant % 3];
      addHair(pick, HAIRC[variant % HAIRC.length]);
      if (sex === 'm' && civ && variant % 5 === 3) addHair('hair_beard', HAIRC[variant % HAIRC.length]);
    } else if (hat === 'cap') addHair('hair_buzzed', HAIRC[variant % HAIRC.length]);
    // rigid gear
    for (const g of gearFor(civ ? 'civ' : weapon ? 'soldier' : 'unarmed', look === 'police' ? 'police' : faction, hat, variant, sex)) {
      const m = new THREE.Mesh(g.geometry, g.material); m.castShadow = true; m.receiveShadow = true; B[g.bone]?.add(m);
    }
    // the rifle lives in actor space (not on a bone) so the clip's arm swing can't shake it
    this.weapon = null;
    if (weapon) {
      this.weaponPivot = new THREE.Group(); this.root.add(this.weaponPivot);
      this.weapon = buildNpcRifle(); this.weaponPivot.add(this.weapon);
      this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.005, 0.77); this.weapon.add(this.muzzle);
      this.gripR = new THREE.Vector3(0.0, -0.055, -0.035); this.gripL = new THREE.Vector3(0.0, -0.03, 0.25);
    }
    // animation
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const n of CLIPS) {
      const clip = lib.clips[n]; if (!clip) continue;
      const a = this.mixer.clipAction(clip); a.enabled = true; a.setEffectiveWeight(0); a.weight = 0;
      if (ONESHOT.has(n)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else a.play();
      a.time = Math.random() * clip.duration;
      this.actions[n] = a;
    }
    if (this.actions.LayToIdle) { this.actions.LayToIdle.play(); this.actions.LayToIdle.paused = true; this.actions.LayToIdle.time = 0.05; }
    this.weights = Object.fromEntries(Object.keys(this.actions).map((k) => [k, k === 'Idle_Loop' ? 1 : 0]));
    this.anim = {
      speed: 0, crouch: 0, aim: 0, recoil: 0, flinch: 0, flinchDir: 1, reload: 0, dead: 0, deadDir: new THREE.Vector3(0, 0, 1), dying: false,
      lookYaw: 0, lookPitch: 0, talk: 0, talkT: 0, wounded: 0, gesture: 0, gestureKind: null, sit: 0, breathe: Math.random() * 6, limp: 0,
    };
    this.target = { speed: 0, crouch: 0, aim: 0, lookYaw: 0, lookPitch: 0, sit: 0, wounded: 0 };
    this.head = B.Head; this.chest = B.spine_03; this.hips = B.pelvis;
    this.hitSpheres = [
      { part: 'head', r: 0.15, node: B.Head, off: new THREE.Vector3(0, 0.1, 0.01), mult: 2.5 },
      { part: 'chest', r: 0.26, node: B.spine_03, off: new THREE.Vector3(0, 0.04, 0), mult: 1 },
      { part: 'belly', r: 0.24, node: B.pelvis, off: new THREE.Vector3(0, 0, 0), mult: 1 },
      { part: 'legL', r: 0.16, node: B.thigh_l, off: new THREE.Vector3(0, 0.2, 0), mult: 0.7 },
      { part: 'legR', r: 0.16, node: B.thigh_r, off: new THREE.Vector3(0, 0.2, 0), mult: 0.7 },
    ];
    this.armLen = null; this._tmp = new THREE.Vector3();
  }

  get position() { return this.root.position; }
  setVisible(v) { this.root.visible = v; }
  dispose(scene) { scene.remove(this.root); this.mixer.stopAllAction(); if (this.droppedWeapon) scene.remove(this.droppedWeapon); }
  headWorld(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.head.localToWorld(out.set(0, 0.1, 0.02)); }
  muzzleWorld(out = new THREE.Vector3()) { if (!this.muzzle || this.weapon.parent !== this.weaponPivot) return this.headWorld(out); this.root.updateMatrixWorld(true); return this.muzzle.getWorldPosition(out); }
  chestWorld(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.chest.getWorldPosition(out); }

  rayTest(origin, dir, maxDist) {
    if (this.anim.dead > 0.6) return null;
    const c = this.root.position; const dx = c.x - origin.x, dz = c.z - origin.z;
    const along = dx * dir.x + dz * dir.z; if (along < -1 || along > maxDist + 1) return null;
    const perp2 = dx * dx + dz * dz - along * along / Math.max(1e-6, dir.x * dir.x + dir.z * dir.z);
    if (perp2 > 1.5) return null;
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

  flinch(dirSign = 1) { this.anim.flinch = 1; this.anim.flinchDir = dirSign; const a = this.actions[Math.random() < 0.3 ? 'Hit_Head' : 'Hit_Chest']; if (a && !this.anim.dying) { a.reset(); a.play(); this._hit = a; } }
  fireKick() { this.anim.recoil = 1; }
  die(fromDir) {
    if (this.anim.dying) return;
    this.anim.dying = true; this.anim.deadDir.copy(fromDir).setY(0).normalize();
    const d = this.actions.Death01; if (d) { d.reset(); d.play(); d.timeScale = 0.9 + Math.random() * 0.25; }
  }
  startTalk(dur = 2) { this.anim.talkT = dur; }
  gesture(kind, dur = 1.5) {
    this.anim.gestureKind = kind; this.anim.gesture = dur;
    if (kind === 'wave' && this.actions.OverhandThrow) { const a = this.actions.OverhandThrow; a.reset(); a.play(); }
  }

  update(dt) {
    const a = this.anim, t = this.target;
    a.speed = damp(a.speed, t.speed, 8, dt); a.crouch = damp(a.crouch, t.crouch, 7, dt); a.aim = damp(a.aim, t.aim, 9, dt);
    a.sit = damp(a.sit, t.sit, 5, dt); a.wounded = damp(a.wounded, t.wounded, 4, dt);
    a.lookYaw = damp(a.lookYaw, t.lookYaw, 6, dt); a.lookPitch = damp(a.lookPitch, t.lookPitch, 6, dt);
    a.recoil = Math.max(0, a.recoil - dt * 9); a.flinch = Math.max(0, a.flinch - dt * 2.5); a.breathe += dt;
    if (a.talkT > 0) { a.talkT -= dt; a.talk = damp(a.talk, 1, 6, dt); } else a.talk = damp(a.talk, 0, 4, dt);
    if (a.gesture > 0) a.gesture -= dt;
    if (a.reload > 0) a.reload = Math.max(0, a.reload - dt / 2.4);
    if (a.dying) a.dead = Math.min(1, a.dead + dt * 1.6);
    const armed = !!this.weapon && this.weapon.parent === this.weaponPivot;

    // ---- clip weights ----
    const W = {}; for (const k in this.actions) W[k] = 0;
    const s = a.speed / Math.max(0.5, this.root.scale.x);
    if (a.dying) W.Death01 = 1;
    else if (a.wounded > 0.5) W.LayToIdle = 1;
    else if (a.sit > 0.5) { W.Sitting_Talking_Loop = a.talk; W.Sitting_Idle_Loop = 1 - a.talk; }
    else {
      const c = a.crouch, st = 1 - c;
      const moving = sstep(0.15, 0.9, s);
      const idleW = st * (1 - moving);
      const talkW = armed && a.aim > 0.3 ? 0 : a.talk;
      W.Idle_Loop = idleW * (1 - talkW); W.Idle_Talking_Loop = idleW * talkW;
      W.Walk_Loop = st * moving * (s < 1.6 ? 1 : tri(0, 1.6, 3.4, s));
      W.Jog_Fwd_Loop = st * tri(1.6, 3.4, 5.4, s) + (s >= 5.4 ? 0 : 0);
      W.Sprint_Loop = st * sstep(3.6, 5.4, s);
      W.Crouch_Idle_Loop = c * (1 - moving); W.Crouch_Fwd_Loop = c * moving;
      if (a.gestureKind === 'radio' && a.gesture > 0 && idleW > 0.5) { const g = Math.min(1, a.gesture * 2) * 0.85; for (const k in W) W[k] *= 1 - g; W.Idle_TalkingPhone_Loop = g; }
    }
    if (this._hit && !a.dying) { const hw = a.flinch * 0.75; for (const k in W) W[k] *= 1 - hw; W[this._hit.getClip().name] = hw; }
    if (a.gestureKind === 'wave' && a.gesture > 0 && !a.dying) { const g = Math.min(1, a.gesture * 3); for (const k in W) W[k] *= 1 - g; W.OverhandThrow = g; }
    for (const k in this.actions) {
      const act = this.actions[k]; const target = W[k] || 0;
      this.weights[k] = k === 'Death01' && a.dying ? 1 : damp(this.weights[k], target, a.dying ? 10 : 8, dt);
      act.setEffectiveWeight(this.weights[k]);
    }
    const ac = this.actions;
    if (ac.Walk_Loop) ac.Walk_Loop.timeScale = clamp(s / 1.45, 0.55, 1.6);
    if (ac.Jog_Fwd_Loop) ac.Jog_Fwd_Loop.timeScale = clamp(s / 3.4, 0.6, 1.5);
    if (ac.Sprint_Loop) ac.Sprint_Loop.timeScale = clamp(s / 5.4, 0.7, 1.4);
    if (ac.Crouch_Fwd_Loop) ac.Crouch_Fwd_Loop.timeScale = clamp(s / 1.3, 0.5, 1.6);
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);

    // ---- procedural layers ----
    if (a.dying) { if (this.weapon && a.dead > 0.25 && !this._dropped) { this._dropped = true; this.dropWeapon(); } return; }
    const B = this.bones, up = _v1.set(0, 1, 0);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(-1, 0, 0).applyQuaternion(rootQ);          // model's right is −X
    const busy = Math.max(a.wounded, a.sit);
    // spine aim & look
    if (busy < 0.5) {
      const yawK = armed ? 0.33 : 0.2, pitchK = armed ? 0.33 * a.aim : 0.12;
      for (const n of ['spine_02', 'spine_03']) { rotateWorldAxis(B[n], up.set(0, 1, 0), a.lookYaw * yawK); rotateWorldAxis(B[n], right, -a.lookPitch * pitchK - (n === 'spine_03' ? a.recoil * 0.04 : 0)); }
      rotateWorldAxis(B.Head, up.set(0, 1, 0), a.lookYaw * 0.3 * (armed ? 1 - a.aim * 0.6 : 1));
      rotateWorldAxis(B.Head, right, -a.lookPitch * (armed ? 0.3 * (1 - a.aim) : 0.5));
    }
    if (!armed) return;
    // rifle pose in actor space: carry (low, angled) ↔ shouldered
    const chestL = this.root.worldToLocal(B.spine_03.getWorldPosition(_v2));
    const aim = a.aim * (1 - busy) * (a.gestureKind === 'wave' && a.gesture > 0 ? 0 : 1);
    const wp = this.weaponPivot;
    wp.position.set(chestL.x - lerp(0.09, 0.11, aim), chestL.y + lerp(-0.12, 0.11, aim) - busy * 0.1, chestL.z + lerp(0.22, 0.27, aim) - a.recoil * 0.03);
    wp.rotation.set(lerp(0.5, 0, aim) - a.lookPitch * aim - a.recoil * 0.06, lerp(0.75, 0.05, aim) + a.lookYaw * 0.66 * aim, lerp(-0.4, 0, aim));
    wp.updateMatrixWorld(true);
    // hands on the rifle (blended out for gestures / reload reach / sitting / lying / throwing)
    const free = 1 - busy;
    const gest = a.gesture > 0 && a.gestureKind !== 'radio' ? Math.min(1, a.gesture * 3) : 0;
    const reachL = a.reload > 0 ? Math.sin(a.reload * Math.PI) : 0;
    const wR = free * (a.gestureKind === 'wave' ? 1 - gest : 1), wL = free * (1 - gest) * (1 - reachL * 0.85);
    if (!this.armLen) { const p = (n) => B[n].getWorldPosition(new THREE.Vector3()); this.armLen = p('upperarm_r').distanceTo(p('lowerarm_r')) + p('lowerarm_r').distanceTo(p('hand_r')); }
    const fwdR = new THREE.Vector3(0, 0, 1).transformDirection(wp.matrixWorld), upR = new THREE.Vector3(0, 1, 0).transformDirection(wp.matrixWorld), rgtR = new THREE.Vector3(-1, 0, 0).transformDirection(wp.matrixWorld);
    const sideAxis = (s2) => new THREE.Vector3(0, 0, 0).add(s2);
    if (wR > 0.01) this.armIK('r', wp.localToWorld(this.gripR.clone()), _v3.copy(B.upperarm_r.getWorldPosition(new THREE.Vector3())).addScaledVector(right, 0.45).addScaledVector(up.set(0, 1, 0), -0.6).addScaledVector(fwdR, -0.25),
      fwdR.clone().multiplyScalar(0.8).addScaledVector(upR, -0.45).addScaledVector(rgtR, -0.2), upR.clone().negate(), wR, 0.95);
    if (wL > 0.01) this.armIK('l', wp.localToWorld(this.gripL.clone()), _v3.copy(B.upperarm_l.getWorldPosition(new THREE.Vector3())).addScaledVector(right, -0.35).addScaledVector(up.set(0, 1, 0), -0.7).addScaledVector(fwdR, 0.15),
      fwdR.clone().multiplyScalar(0.55).addScaledVector(rgtR, 0.75).addScaledVector(upR, 0.1), fwdR.clone().negate(), wL, 0.8);
    // reload: left hand reaches to the belt pouch
    if (reachL > 0.05) { const pouch = B.pelvis.localToWorld(new THREE.Vector3(0, 0.05, 0)).addScaledVector(right, -0.18).add(new THREE.Vector3(0, 0, 0)); this.armIK('l', pouch, B.upperarm_l.getWorldPosition(new THREE.Vector3()).addScaledVector(right, -0.4).add(new THREE.Vector3(0, -0.6, 0)), new THREE.Vector3(0, -1, 0), right.clone(), reachL, 0.3); }
    // pointing / halt with the left hand
    if (gest > 0 && (a.gestureKind === 'point' || a.gestureKind === 'halt')) {
      const sh = B.upperarm_l.getWorldPosition(new THREE.Vector3()); const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ);
      const tgt = sh.clone().addScaledVector(fwd, 0.55).add(new THREE.Vector3(0, a.gestureKind === 'halt' ? 0.25 : 0.05, 0)).addScaledVector(right, -0.1);
      this.armIK('l', tgt, sh.clone().addScaledVector(right, -0.4).add(new THREE.Vector3(0, -0.5, 0)), fwd.clone(), a.gestureKind === 'halt' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0), gest, 0);
    }
  }

  // two-bone IK for one arm, then orient the hand (axis = wrist→knuckles, side = index→pinky) and curl the fingers
  armIK(side, target, pole, handAxis, handSide, w, curl) {
    const B = this.bones; const U = B[`upperarm_${side}`], L = B[`lowerarm_${side}`], H = B[`hand_${side}`];
    const pa = U.getWorldPosition(new THREE.Vector3()), pb = L.getWorldPosition(new THREE.Vector3()), pc = H.getWorldPosition(new THREE.Vector3());
    const lab = pa.distanceTo(pb), lbc = pb.distanceTo(pc);
    // the wrist sits a little behind the palm contact point
    const wrist = target.clone().addScaledVector(handAxis.clone().normalize(), -0.075);
    const toT = wrist.clone().sub(pa); let d = toT.length(); const dir = toT.clone().divideScalar(d || 1);
    d = clamp(d, Math.abs(lab - lbc) + 0.01, (lab + lbc) * 0.999);
    const ad = (lab * lab + d * d - lbc * lbc) / (2 * d), h = Math.sqrt(Math.max(0, lab * lab - ad * ad));
    const pv = pole.clone().sub(pa); pv.addScaledVector(dir, -pv.dot(dir)); if (pv.lengthSq() < 1e-8) pv.set(0, -1, 0); pv.normalize();
    const elbow = pa.clone().addScaledVector(dir, ad).addScaledVector(pv, h);
    rotateToward(U, pb.clone().sub(pa), elbow.sub(pa), w);
    const pb2 = L.getWorldPosition(new THREE.Vector3()), pc2 = H.getWorldPosition(new THREE.Vector3());
    rotateToward(L, pc2.clone().sub(pb2), pa.clone().addScaledVector(dir, d).sub(pb2), w);
    // hand orientation from the finger joints
    const p = (n) => B[n].getWorldPosition(new THREE.Vector3());
    const curAxis = p(`middle_01_${side}`).sub(p(`hand_${side}`)), curSide = p(`pinky_01_${side}`).sub(p(`index_01_${side}`));
    basis(curAxis, curSide, _m1); basis(handAxis, handSide, _m2);
    _q1.setFromRotationMatrix(_m2.multiply(_m1.transpose()));
    H.getWorldQuaternion(_q2); _q2.premultiply(_q1); setWorldQuat(H, _q2.clone(), w);
    // curl the fingers around the grip
    if (curl > 0) for (const f of FINGERS) for (let j = 1; j <= 3; j++) { const bn = B[`${f}_0${j}_${side}`]; if (bn) { bn.quaternion.multiply(_q1.setFromAxisAngle(_v4.set(1, 0, 0), curl * (j === 1 ? 0.9 : 1.1) * w)); bn.updateMatrixWorld(true); } }
  }

  dropWeapon() {
    if (!this.weapon || this.weapon.parent !== this.weaponPivot) return;
    const wp = new THREE.Vector3(); this.weapon.getWorldPosition(wp);
    const scene = this.root.parent; if (!scene) return;
    this.weaponPivot.remove(this.weapon);
    this.weapon.position.copy(wp); this.weapon.position.y = this.root.position.y + 0.05;
    this.weapon.rotation.set(0, Math.random() * 6, Math.PI / 2);
    scene.add(this.weapon); this.droppedWeapon = this.weapon;
  }
}
