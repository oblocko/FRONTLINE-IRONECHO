// Crew-served / vehicle-mounted weapons the player can man.
//  kind 'mg'  : tripod machine gun behind sandbags — heat instead of ammo
//  kind 'apc' : IFV turret autocannon — explosive rounds, turret traverse
// The player is seated on the weapon (constrained look); the weapon's pivot
// follows the player's aim; firing uses the shared Combat hitscan.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { events } from '../core/Events.js';
import { keyName } from '../player/Player.js';
import { settings } from '../core/Settings.js';
const settingsFov = () => settings.data.graphics.fov;

const DEFS = {
  mg: { name: 'M60 기관총', interval: 0.075, damage: 48, headMult: 2, range: 400, spread: 0.012, heatPerShot: 0.022, cool: 0.32, kick: 0.004, sound: 'rifle', vehicleDamage: 12 },
  apc: { name: 'K21 30mm 기관포', interval: 0.33, damage: 200, headMult: 1, range: 600, spread: 0.004, heatPerShot: 0.09, cool: 0.38, kick: 0.012, sound: 'rifle', vehicleDamage: 140,
    explosive: { radius: 3.6, damage: 160, owner: 'player', scale: 0.55, playerSafe: true } },
};

// ---- crew-served MG model (general-purpose MG on a tripod with T&E gear) ----
// Barrel points along -Z, the gunner sits at +Z. Geometry is merged per material
// into three moving parts: static tripod (root), traversing cradle (pivot) and
// the elevating gun (tilt), so the whole weapon is ~12 draw calls.
let MGM = null;
function mgMats() {
  if (MGM) return MGM;
  MGM = {
    park: new THREE.MeshStandardMaterial({ color: 0x26282a, metalness: 0.72, roughness: 0.42 }),     // parkerized steel
    worn: new THREE.MeshStandardMaterial({ color: 0x55585a, metalness: 0.92, roughness: 0.26 }),     // worn bare edges
    black: new THREE.MeshStandardMaterial({ color: 0x18191a, metalness: 0.35, roughness: 0.55 }),
    poly: new THREE.MeshStandardMaterial({ color: 0x1d1e1d, metalness: 0.05, roughness: 0.78 }),     // stock / grip
    od: new THREE.MeshStandardMaterial({ color: 0x48503a, metalness: 0.25, roughness: 0.62 }),       // ammo can, tripod paint
    brass: new THREE.MeshStandardMaterial({ color: 0xb08d45, metalness: 0.92, roughness: 0.3 }),
    link: new THREE.MeshStandardMaterial({ color: 0x2c2c2a, metalness: 0.8, roughness: 0.4 }),
  };
  return MGM;
}
function mgProfile(pts, width, bevel = 0.003) {
  const s = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -(width - 2 * bevel) / 2); g.rotateY(-Math.PI / 2); return g;
}
class Parts {
  constructor() { this.m = new Map(); }
  add(mat, geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    if (!this.m.has(mat)) this.m.set(mat, []); this.m.get(mat).push(g); return this;
  }
  build(parent) { for (const [mat, list] of this.m) { const mesh = new THREE.Mesh(mergeGeometries(list, false), mat); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); } }
}
const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cz = (r, len, seg = 14, r2 = r) => new THREE.CylinderGeometry(r, r2, len, seg).rotateX(Math.PI / 2);   // along Z
const cy = (r, len, seg = 10, r2 = r) => new THREE.CylinderGeometry(r, r2, len, seg);                        // along Y
const cx = (r, len, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);           // along X

export function buildMG() {
  const M = mgMats();
  const g = new THREE.Group();
  const pivot = new THREE.Group(); g.add(pivot);                          // traverse (yaw)
  const tilt = new THREE.Group(); tilt.position.y = 0.05; pivot.add(tilt); // elevation (pitch)

  // ---------- tripod (static) ----------
  const T = new Parts();
  T.add(M.od, cy(0.045, 0.07, 16), { y: -0.07 });                                  // tripod head
  T.add(M.park, cy(0.02, 0.06, 10), { y: -0.02 });                                 // pintle
  const leg = (ax, az, len, spread) => {                                            // tube + foot from the head outward/downward
    const dir = new THREE.Vector3(ax, -1.25, az).normalize(); const mid = dir.clone().multiplyScalar(len / 2);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); const e = new THREE.Euler().setFromQuaternion(q);
    T.add(M.od, cy(0.016, len, 8, 0.013), { x: mid.x, y: -0.09 + mid.y, z: mid.z, rx: e.x, ry: e.y, rz: e.z });
    const foot = dir.clone().multiplyScalar(len); T.add(M.park, bx(0.07, 0.012, 0.05), { x: foot.x, y: -0.09 + foot.y, z: foot.z, ry: Math.atan2(ax, az) });
    T.add(M.park, cx(0.019, 0.05), { x: dir.x * 0.08, y: -0.09 - 0.1, z: dir.z * 0.08, ry: Math.atan2(ax, az) + spread });  // leg clamp
  };
  leg(-0.75, -0.8, 0.62, 0); leg(0.75, -0.8, 0.62, 0); leg(0, 1, 0.78, Math.PI / 2);
  // traversing bar between the rear leg and the head (the T&E slides on it)
  T.add(M.park, bx(0.26, 0.012, 0.02), { y: -0.2, z: 0.2 });
  T.add(M.worn, bx(0.012, 0.012, 0.11), { y: -0.2, z: 0.14 });
  T.build(g);

  // ---------- cradle (yaws with the gun) ----------
  const C = new Parts();
  C.add(M.park, bx(0.06, 0.05, 0.16), { y: 0.0, z: 0.02 });                        // cradle body
  for (const s of [-1, 1]) C.add(M.park, bx(0.012, 0.07, 0.06), { x: s * 0.05, y: 0.03, z: -0.03 });   // trunnion cheeks
  // T&E mechanism: elevating screw + handwheel behind the cradle
  C.add(M.worn, cy(0.009, 0.14, 8), { y: -0.04, z: 0.2 });
  C.add(M.park, cy(0.018, 0.05, 10), { y: -0.12, z: 0.2 });
  C.add(M.black, new THREE.TorusGeometry(0.035, 0.006, 5, 14).rotateX(Math.PI / 2), { y: -0.07, z: 0.2 });
  C.add(M.park, bx(0.02, 0.012, 0.18), { y: -0.03, z: 0.11 });
  // ammo tray on the left of the cradle + ammo can
  C.add(M.park, bx(0.11, 0.008, 0.19), { x: -0.125, y: -0.135, z: 0.0 });
  for (const s of [-1, 1]) C.add(M.park, bx(0.008, 0.06, 0.008), { x: -0.075, y: -0.1, z: s * 0.08 });   // tray struts
  C.add(M.od, bx(0.085, 0.13, 0.22), { x: -0.125, y: -0.066, z: 0.0 });           // can
  C.add(M.od, bx(0.089, 0.016, 0.224), { x: -0.125, y: 0.0, z: 0.0 });            // lid lip
  C.add(M.black, bx(0.012, 0.008, 0.07), { x: -0.125, y: 0.012, z: 0.0 });        // handle
  C.add(M.park, bx(0.012, 0.026, 0.02), { x: -0.08, y: -0.01, z: 0.1 });          // latch
  C.build(pivot);

  // ---------- gun (elevates) ----------
  const G = new Parts();
  // receiver: side profile with sloped front, extruded
  G.add(M.park, mgProfile([[-0.17, -0.045], [0.2, -0.045], [0.22, -0.02], [0.22, 0.04], [-0.12, 0.04], [-0.17, 0.0]], 0.078));
  G.add(M.worn, bx(0.08, 0.004, 0.36), { y: -0.045, z: 0.02 });                  // worn lower edge
  // feed cover (hinged at rear) + latch + feed tray
  G.add(M.black, mgProfile([[-0.12, 0.04], [0.1, 0.04], [0.1, 0.07], [-0.08, 0.075], [-0.12, 0.06]], 0.088));
  G.add(M.park, cx(0.008, 0.095), { y: 0.06, z: 0.105 });
  G.add(M.worn, bx(0.03, 0.008, 0.012), { x: 0.03, y: 0.075, z: -0.11 });
  G.add(M.park, bx(0.05, 0.03, 0.06), { x: -0.06, y: 0.035, z: -0.04 });          // feed tray guide (left)
  // rear sight leaf + aperture
  G.add(M.park, bx(0.036, 0.012, 0.03), { y: 0.081, z: 0.12 });
  // open aperture: a ring on two thin side posts (nothing solid behind the hole)
  for (const sx of [-1, 1]) G.add(M.black, bx(0.006, 0.05, 0.008), { x: sx * 0.012, y: 0.105, z: 0.13 });
  G.add(M.black, new THREE.TorusGeometry(0.009, 0.003, 6, 16), { y: 0.125, z: 0.13 });
  // charging handle (right) + slot
  G.add(M.black, bx(0.004, 0.012, 0.15), { x: 0.04, y: 0.0, z: -0.02 });
  G.add(M.worn, cx(0.009, 0.05), { x: 0.065, y: 0.0, z: -0.07 });
  // trigger group: housing, guard, pistol grip
  G.add(M.park, bx(0.05, 0.03, 0.12), { y: -0.06, z: 0.1 });
  G.add(M.park, new THREE.TorusGeometry(0.028, 0.004, 4, 12, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI), { y: -0.075, z: 0.08 });
  G.add(M.black, bx(0.005, 0.022, 0.006), { y: -0.085, z: 0.08, rx: 0.2 });
  G.add(M.poly, mgProfile([[0.1, -0.07], [0.14, -0.07], [0.175, -0.19], [0.14, -0.2], [0.115, -0.19]], 0.034, 0.006));
  for (let i = 0; i < 4; i++) G.add(M.black, bx(0.036, 0.004, 0.026), { y: -0.1 - i * 0.022, z: 0.135 + i * 0.008, rx: 0.32 });   // grip grooves
  // butt stock with buffer tube line and shoulder rest
  G.add(M.poly, mgProfile([[0.22, 0.035], [0.52, 0.03], [0.53, -0.09], [0.5, -0.11], [0.3, -0.06], [0.22, -0.04]], 0.052, 0.006));
  G.add(M.black, bx(0.056, 0.13, 0.02), { y: -0.035, z: 0.535 });                // butt plate
  G.add(M.park, bx(0.06, 0.012, 0.03), { y: 0.03, z: 0.46 });                     // shoulder rest hinge
  G.add(M.worn, cx(0.006, 0.062), { y: -0.0, z: 0.3 });                           // sling swivel pin
  // barrel group: chamber/barrel extension, finned handguard-free barrel, gas cylinder
  G.add(M.park, cz(0.027, 0.06, 16), { z: -0.2 });                                 // barrel nut
  G.add(M.park, cz(0.0175, 0.62, 16), { z: -0.53 });                               // barrel
  for (let i = 0; i < 9; i++) G.add(M.park, cz(0.022, 0.008, 14), { z: -0.25 - i * 0.022 });   // cooling rings near chamber
  G.add(M.park, cz(0.011, 0.42, 10), { y: -0.033, z: -0.43 });                   // gas cylinder
  G.add(M.park, bx(0.03, 0.04, 0.025), { y: -0.016, z: -0.64 });                // gas block
  for (const z of [-0.29, -0.52]) G.add(M.park, bx(0.026, 0.05, 0.012), { y: -0.012, z }); // gas cylinder bands
  // carrying handle (on the barrel, folds to the left)
  G.add(M.park, bx(0.03, 0.03, 0.03), { y: 0.03, z: -0.36 });
  G.add(M.black, new THREE.TorusGeometry(0.05, 0.007, 5, 14, Math.PI).rotateY(Math.PI / 2), { x: -0.02, y: 0.045, z: -0.36, rz: 0.5 });
  // front sight + protective ears
  // tall front sight so the post sits in the aperture when the eye is behind the rear sight
  G.add(M.park, bx(0.02, 0.06, 0.02), { y: 0.045, z: -0.79 });
  G.add(M.black, bx(0.004, 0.05, 0.004), { y: 0.1, z: -0.79 });
  for (const s of [-1, 1]) G.add(M.park, bx(0.004, 0.06, 0.016), { x: s * 0.014, y: 0.1, z: -0.79 });
  // flash hider: slotted cone
  G.add(M.black, cz(0.02, 0.012, 12), { z: -0.845 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; G.add(M.black, bx(0.005, 0.005, 0.075), { x: Math.cos(a) * 0.018, y: Math.sin(a) * 0.018, z: -0.885 }); }
  // folded bipod under the barrel
  G.add(M.park, bx(0.03, 0.02, 0.03), { y: -0.04, z: -0.74 });
  for (const s of [-1, 1]) { G.add(M.park, cz(0.006, 0.3, 6), { x: s * 0.012, y: -0.05, z: -0.6 }); G.add(M.black, bx(0.012, 0.01, 0.03), { x: s * 0.012, y: -0.052, z: -0.45 }); }
  // belt: links + brass rounds running from the can up into the feed tray
  const belt = [[-0.12, 0.0, 0.0], [-0.11, 0.022, 0.0], [-0.097, 0.04, 0.0], [-0.083, 0.052, 0.0]];
  for (const [x, y, z] of belt) for (let i = -1; i <= 1; i++) {
    G.add(M.brass, cx(0.0055, 0.06, 7), { x, y, z: z + i * 0.012 - 0.04, rz: 0.1 });
    G.add(M.brass, new THREE.ConeGeometry(0.0055, 0.016, 7).rotateZ(Math.PI / 2), { x: x + 0.038, y, z: z + i * 0.012 - 0.04 });
    G.add(M.link, bx(0.03, 0.006, 0.01), { x: x - 0.004, y: y + 0.004, z: z + i * 0.012 - 0.04 });
  }
  G.build(tilt);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, -0.93); tilt.add(muzzle);
  return { g, pivot, tilt, muzzle };
}

export class MountedWeapon {
  // opts: { kind, pos (world) | parent+local, yaw, yawRange, pitchRange, prompt, seatOffset }
  constructor(game, opts) {
    this.game = game; this.kind = opts.kind; this.def = { ...DEFS[opts.kind], ...(opts.def || {}) };
    this.heat = 0; this.overheated = false; this.fireT = 0; this.manned = false; this.enabled = true; this.ads = 0;
    if (opts.kind === 'mg') {
      const m = buildMG(); this.root = m.g; this.pivot = m.pivot; this.tilt = m.tilt; this.muzzle = m.muzzle;
      this.root.position.copy(opts.pos); this.root.rotation.y = opts.yaw ?? 0; game.renderer.scene.add(this.root);
      this.seat = new THREE.Object3D(); this.seat.position.set(0, 0.2, 0.62); this.pivot.add(this.seat);
      // gunner's eye: hip view just behind the stock; aimed view (right mouse) looks through the rear aperture
      this.hipEye = new THREE.Vector3(0, 0.2, 0.62); this.adsEye = new THREE.Vector3(0, 0.125, 0.43);   // on the sight line: aperture centre (y .125, z .13) → front post tip (y .125, z -.79)
      this.baseYaw = opts.yaw ?? 0;
    } else {
      // APC: drive an existing turret group (pivot = turret, tilt = gun mantlet)
      this.root = opts.vehicle; this.pivot = opts.vehicle.userData.turret;
      if (opts.vehicle.userData.gun) {
        // K21: the model's own gun group elevates; muzzle and gunner's eye come with the model
        this.tilt = opts.vehicle.userData.gun; this.muzzle = opts.vehicle.userData.muzzle;
        this.seat = new THREE.Object3D(); this.seat.position.set(-0.08, 1.55, -1.0); this.pivot.add(this.seat);   // gunner's view over the roof optics
        this.baseYaw = 0;
      } else {
      this.tilt = new THREE.Group(); this.tilt.position.set(0, 0.35, 0.95); this.pivot.add(this.tilt);
      const gun = this.pivot.children.find((c) => c.geometry?.type === 'CylinderGeometry' && Math.abs(c.position.z - 2.1) < 0.01);
      if (gun) { this.pivot.remove(gun); gun.position.set(0, 0, 1.15); this.tilt.add(gun); }
      this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0, 2.35); this.tilt.add(this.muzzle);
      this.seat = new THREE.Object3D(); this.seat.position.set(0, 1.05, -0.35); this.pivot.add(this.seat);
      this.baseYaw = 0;
      }
    }
    this.yawRange = opts.yawRange ?? 1.2; this.pitchRange = opts.pitchRange ?? [-0.35, 0.3];
    this.forward = this.kind === 'apc' ? 1 : -1; // model axis the barrel points along (+Z for the IFV, -Z for the MG)
    if (opts.interactable !== false) {
      this.it = game.player.addInteractable({ pos: () => this.seatWorld(), prompt: opts.prompt || `${this.def.name} 사용`, radius: 1.6, onUse: () => this.mount() });
    }
    this._v = new THREE.Vector3();
  }
  seatWorld() { this.root.updateMatrixWorld(true); return this.seat.getWorldPosition(new THREE.Vector3()); }

  mount() {
    const g = this.game, p = g.player; if (this.manned || !this.enabled) return;
    this.manned = true; if (this.it) this.it.enabled = false;
    // seat yaw: look along the barrel; the seat object sits behind the weapon
    p.enterSeat(this.seat, { yawFrom: this.root, yawBase: (this.forward > 0 ? Math.PI : 0) + (this.kind === 'apc' ? this.pivot.rotation.y : 0), yawRange: this.yawRange, pitchRange: this.pitchRange });
    p.lookYawLocal = 0; p.pitch = 0;
    g.weapons.hidden = true; this.lookYaw = 0;
    events.emit('hud:mounted', { name: this.def.name, heat: this.heat });
    g.ui.hint(`좌클릭 사격 · ${this.kind === 'mg' ? '우클릭 조준 · ' : ''}${this.kind === 'mg' ? `${keyName(g.input.binding('interact'))} 또는 ${keyName(g.input.binding('jump'))} 이탈 · 과열 주의` : '폭발탄 · 적 차량에 효과적'}`, 5);
    this.mountT = 0.4;
  }
  dismount(pos = null) {
    const g = this.game, p = g.player; if (!this.manned) return;
    this.manned = false; g.weapons.hidden = false; events.emit('hud:mounted', null); this.ads = 0; p.fovOverride = null;
    if (this.kind === 'mg') { const out = this.root.localToWorld(new THREE.Vector3(0, 0, 1.3)); p.exitSeat(pos || out); if (this.it) this.it.enabled = this.enabled; }
  }
  disable() { this.enabled = false; if (this.it) this.it.enabled = false; if (this.manned) this.dismount(); }

  update(dt, time) {
    const g = this.game, p = g.player, inp = g.input;
    this.heat = Math.max(0, this.heat - dt * this.def.cool * (this.overheated ? 0.7 : 1));
    if (this.overheated && this.heat < 0.35) this.overheated = false;
    this.fireT -= dt;
    if (!this.manned) return;
    // aim: the gun pivot follows the player's look offset from the weapon base; tilt follows pitch
    this.pivot.rotation.y = (p.lookYawLocal || 0) + (p.seat.yawBase - (this.forward > 0 ? Math.PI : 0));
    this.tilt.rotation.x = this.forward > 0 ? -p.pitch : p.pitch;
    this.mountT -= dt;
    if (this.kind === 'mg') {
      // right mouse: bring the eye down to the sights, narrow the view, tighten the cone of fire
      this.ads += ((inp.ads() ? 1 : 0) - this.ads) * Math.min(1, dt * 10);
      this.tilt.updateMatrix(); const eye = this.adsEye.clone().applyMatrix4(this.tilt.matrix);
      this.seat.position.lerpVectors(this.hipEye, eye, this.ads);
      p.fovOverride = this.ads > 0.02 ? settingsFov() * (1 - 0.38 * this.ads) : null;
    }
    if (this.kind === 'mg' && !this.locked && this.mountT <= 0 && (inp.pressed('interact') || inp.pressed('jump'))) { this.dismount(); return; }
    if (inp.fire() && this.fireT <= 0 && !this.overheated && p.alive) this.fire(time);
    events.emit('hud:mountedHeat', { heat: this.heat, over: this.overheated, ads: this.ads > 0.5 });
  }
  fire(time) {
    const g = this.game, p = g.player, d = this.def;
    this.fireT = d.interval; this.heat += d.heatPerShot; if (this.heat >= 1) { this.heat = 1; this.overheated = true; g.ui.hint('<b style="color:var(--warn)">과열! 냉각 중</b>', 1.5); }
    const eye = p.eyePos(new THREE.Vector3()); const f = p.forward(new THREE.Vector3());
    const r = Math.sqrt(Math.random()) * d.spread * (1 - 0.7 * this.ads), a = Math.random() * Math.PI * 2;
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw)); const up = new THREE.Vector3().crossVectors(right, f);
    const dir = f.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    this.root.updateMatrixWorld(true); const mz = this.muzzle.getWorldPosition(new THREE.Vector3());
    const res = g.combat.playerShot(eye, dir, { ...d, hipSpread: 0, moveSpread: 0, adsSpread: 0 }, mz);
    g.weapons.shotsFired++; if (res?.hitAgent || res?.hitVehicle) g.weapons.shotsHit++;
    g.effects.muzzleFlash(mz, dir); g.effects.flashLight(mz, 0xffb060, this.kind === 'apc' ? 10 : 5, 0.05, 9);
    g.audio.shot(this.kind === 'apc' ? mz : null, { kind: 'rifle' }); if (this.kind === 'apc') g.audio.explosion(mz, 0.12, { ring: false });   // muzzle report, no ear ringing
    p.pitch += d.kick * (1 - 0.4 * this.ads); p.recoilPitch += d.kick * 0.6; p.addShake(this.kind === 'apc' ? 0.12 : 0.035 * (1 - 0.6 * this.ads));
    p.lastFireT = time; g.director.noise(eye, 120, 'player');
  }
}
