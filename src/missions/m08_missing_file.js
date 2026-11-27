// MISSION 08 — THE MISSING FILE (사라진 파일)
// POV: Daniel Voss. 2029-03-23 03:00 GMT, Corrin Head on the North Atlantic coast (fictional), a gale, heavy sea.
//
// A boat under the cliff in the storm → up the cliff (buttress ladder, the ledge in the gusts, the storm-torn stair,
// the searchlight) → the seawater pump house → the cooling tunnel → data hall B → rack H-17: the original of the
// "pre-emptive strike imminent" package. Inside it, the sensor log of GOP-3 sector 3, 14 March 04:21 KST — the same
// log M01's patrol was sent out to check — edited into "signs of a southern infiltration". Hold the hall while
// Maya pulls the file, the purge, the yard, Halloran's helicopter, the coast road, and the cut back to the fence line.
//
// Carries M06 / M07 (storyFlags):
//   m06_nadia lower / drive / maya → Nadia trusts Daniel: she splits off at the landing to take the security room
//                                    (the hall cameras are looped); aim → she will not leave him alone with the file
//                                    and comes along (the cameras stay live).
//   m07_server copy   → Maya has the rack number from the Kestrel copy (no asset terminal search)
//   m07_hostage trade / m07_graves escaped → Halvard doubled the night watch; Graves runs the response and the pursuit
//   m07_maya hurt     → a line about the shoulder
// New decisions:
//   ① the intake pumps            m08_pumps  stop (the tunnel drains; two men come down to check — fewer in the hall)
//                                             run  (the sump stays flooded: hold your breath under the baffle)
//   ② what to pull from H-17       m08_kerr   kerr (the package and Kerr's retention order — the copy takes longer)
//                                             echo (the package only)
//   ③ the purge                    m08_techs  open (unlock the operations room for the two technicians) / leave
import * as THREE from 'three';
import { CorrinHead, CH, edgeZ, roadZ } from '../world/levels/CorrinHead.js';
import { events } from '../core/Events.js';
import { saves } from '../core/SaveSystem.js';
import { keyName } from '../player/Player.js';
import { setSleeveLook } from '../player/WeaponModels.js';
import { buildHelicopter, buildTruck } from '../world/Props.js';
import { MountedWeapon } from '../gameplay/MountedWeapon.js';
import { EnemyVehicle } from '../gameplay/EnemyVehicle.js';
import { V, attackOrder, interact, choose, flag } from './common.js';
import { fade, takedowns, ammoFromDead } from './stealth.js';

export const TEXTURES = ['concrete', 'asphalt', 'metal', 'paintedMetal', 'rock', 'grassdead', 'corrugated', 'snowground', 'fabric', 'wood', 'dirt'];
export const PROPS = ['concrete_road_barrier_02', 'Barrel_01', 'utility_box_01'];
const rand = (a, b) => a + Math.random() * (b - a);
const k = (game, a) => `<kbd>${keyName(game.input.binding(a))}</kbd>`;
const facing = (dx, dz) => Math.atan2(-dx, -dz);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function EPILOGUE() {
  const f = saves.data.storyFlags; const out = [];
  out.push('세이블 리지 데이터 서비스는 다음 날 "폭풍으로 인한 정전과 설비 화재"를 발표했다. 코린 헤드 B 홀은 석 달 동안 문을 닫았다.');
  if (f.m08_kerr === 'kerr') out.push('마야는 패키지 원본과 함께 보존 명령서를 받았다. 서명란의 이름은 엘리아스 커였다. 그는 그 명령서가 남아 있다는 사실을 아직 모른다.');
  else out.push('마야가 받은 것은 패키지 원본뿐이었다. 누가 그것을 지우지 말라고 했는지는, 아직 아무도 증명하지 못한다.');
  if (f.m08_techs === 'open') out.push('운영실에서 나온 두 기술자 중 한 명은 나중에 자신이 본 것을 적어 두었다. 그 메모는 몇 주 뒤 마야의 메일함에 도착했다.');
  else out.push('구조대가 운영실 문을 연 것은 가스가 방출되고 40분이 지나서였다. 한 사람은 끝내 깨어나지 못했다. 다니엘은 그 이름을 찾아 적어 두었다.');
  if (f.m08_graves === 'down') out.push('해안 도로 아래 바위에서 할바르드 차량 한 대가 발견되었다. 그레이브스의 이름은 다시 나오지 않았다.');
  else if (f.m08_graves === 'escaped') out.push('그레이브스는 그날 밤도 빠져나갔다. 그는 이제 다니엘이 무엇을 쥐었는지 정확히 안다.');
  out.push('파일 속 04시 21분의 센서 로그는, 지구 반대편 철책 앞에서 아직 "고라니"로 기록되어 있었다.');
  return out.join(' ');
}

// ---------------------------------------------------------------------------------------------
function daniel(game) {
  setSleeveLook('jacket');
  const w = game.weapons; w.clear(); w.setSuppressed(true);
  w.give('carbine', { mag: 30, reserve: 120 }); w.give('pistol', { mag: 17, reserve: 68 }); w.grenades = 2; w.equip('pistol', true); w.emitAmmo();
}
const trusts = () => ['lower', 'drive', 'maya'].includes(flag('m06_nadia', 'lower'));
const nadiaSplits = () => trusts();
const gravesHere = () => flag('m07_graves') === 'escaped' || flag('m07_hostage') === 'trade';
const pmc = (game, x, z, extra = {}, y = 0) => game.director.spawn({ team: 'enemy', faction: 'pmc', hat: 'headset', pos: V(x, y, z), accuracy: 0.8, state: 'idle', ...extra });
const civ = (game, x, z, extra = {}) => game.director.spawn({ team: 'civilian', faction: 'civ', hat: 'none', weapon: false, passive: true, invulnerable: true, name: '기술자', pos: V(x, 0, z), ...extra });
function nadiaAt(game, pos) {
  const lv = game.level;
  if (lv.nadia && !lv.nadia.dead && !lv.nadia.removed) { lv.nadia.actor.root.position.copy(pos); lv.nadia.path = null; return lv.nadia; }
  const n = game.director.spawn({ team: 'friendly', faction: 'civ', look: 'nadia', sex: 'f', hat: 'none', weapon: true, invulnerable: true, accuracy: 1.25, name: '나디아', pos: pos.clone(), followOffset: V(1.6, 0, 2.2) });
  lv.nadia = n; game.dialogue.bindSpeaker?.('nadia', n); n.follow(game.player); return n;
}
function dropNadia(game) { const lv = game.level; if (lv.nadia) { game.director.remove(lv.nadia); lv.nadia = null; } }
function ride(m, a, obj, local, { pose = null } = {}) {
  a._placed = true; a.path = null; if (pose) a.pose(pose); else a.hold();
  const p = new THREE.Vector3();
  return m.every(() => { if (a.dead || a.removed) return false; obj.updateMatrixWorld(true); p.copy(local); obj.localToWorld(p); a.actor.root.position.copy(p); a.path = null; });
}
async function clear(game, m, id, text, list, { timeout = 900 } = {}) {
  game.objectives.add(id, text, { count: list.length });
  let done = 0;
  m.every(() => { const live = list.filter((e) => !e.dead); const n = list.length - live.length; if (n > done) { game.objectives.progress(id, n - done); done = n; } if (!live.length) return false; game.objectives.setMarkers(id, live.map((e) => e.position.clone().setY(e.position.y + 2.1))); });
  await m.until(() => list.every((e) => e.dead), timeout);
  for (const e of list) if (!e.dead) e.kill(game.player.position);
  game.objectives.complete(id);
}
// a bar on the HUD (progress / breath)
function bar(game, m, label) {
  const el = document.createElement('div'); el.className = 'stealth-meter'; el.innerHTML = `<div class="lbl">${label}</div><div class="bar"><i></i></div><div class="st"></div>`;
  const used = new Set([...game.ui.hud.querySelectorAll('.stealth-meter')].map((e) => e.dataset.slot)); let slot = 0; while (used.has(String(slot))) slot++;
  el.dataset.slot = slot; el.style.top = `${92 + slot * 54}px`;   // a second bar (breath, progress) stacks under the first
  game.ui.hud.appendChild(el);
  const off = m.bind(() => el.remove());
  return { set(v, txt = '', cls = '') { el.querySelector('i').style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`; el.querySelector('.st').textContent = txt; el.classList.toggle('warn', cls === 'warn'); el.classList.toggle('danger', cls === 'danger'); }, remove() { el.remove(); off(); } };
}
// how fast a watcher (guard or camera) is noticing Daniel
function seeRate(game, e, R, fov = 0.45) {
  const p = game.player; if (e.dead || e.koed || e.removed) return 0;
  const eye = e.eyePos(new THREE.Vector3()), tp = p.chestPos(new THREE.Vector3()); const d = eye.distanceTo(tp);
  const RR = R * (p.flashOn ? 1.7 : 1); if (d > RR) return 0;
  const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw); const tx = tp.x - eye.x, tz = tp.z - eye.z; const cosA = (tx * fx + tz * fz) / Math.max(0.01, Math.hypot(tx, tz));
  if (cosA < fov && d > 2.5) return 0;
  if (!game.world.lineOfSight(eye, tp)) return 0;
  return (1 - d / RR) * (p.crouching ? 0.45 : 1) * (p.sprinting ? 2 : p.speed > 0.6 ? 1.2 : 0.75) * (d < 5 ? 2.6 : 1) * 1.15;
}
// a detection meter fed by any number of sources; onSpot fires once when it fills
function detector(game, m, label, sources, onSpot) {
  const b = bar(game, m, label); const st = { v: 0, spotted: false, done: false, stop() { st.done = true; b.remove(); } };
  m.every((dt) => {
    if (st.done) return false;
    let rate = 0, msg = ''; for (const s of sources) { const r = s(dt); if (r) { rate += r.rate ?? r; if ((r.rate ?? r) > 0 && r.msg) msg = r.msg; } }
    st.v = rate > 0 ? Math.min(1, st.v + rate * dt) : Math.max(0, st.v - dt * 0.22);
    b.set(st.v, rate > 0 ? (st.v > 0.75 ? '발각 직전!' : msg || '누군가 이쪽을 보고 있다') : st.v > 0.05 ? '의심이 가라앉는 중' : '눈에 띄지 않음', st.v > 0.75 ? 'danger' : st.v > 0.35 ? 'warn' : '');
    if (st.v >= 1 && !st.spotted) { st.spotted = true; onSpot?.(); }
  });
  st.bump = (v) => { st.v = Math.min(1, st.v + v); };
  return st;
}
// falling off the cliff / into the sea ends it
function hazards(game, m) {
  const p = game.player;
  m.every(() => {
    if (game.state !== 'playing' || p.seat || !p.alive || game.level.noHazard) return;
    if (p.velocity.y < -15 && game.level.area === 'ext') { p.godMode = false; game.failMission('추락했습니다', '돌풍이 불 때는 앉아서 벽 쪽에 붙어라'); return false; }
    if (p.position.y < CH.SEA + 0.4 && game.level.area === 'ext') { p.godMode = false; game.failMission('바다에 휩쓸렸습니다'); return false; }
  });
}
// cut a hole in the world: a door collider out, its leaf swung / rolled
function openDoor(game, c, leafFn) { if (c) game.world.removeCollider(c); leafFn?.(); game.world.navRegion?.(c || { min: V(0, 0, 0), max: V(0, 0, 0) }); }
// fly a helicopter along a curve; `look` keeps its right-hand door on a target
function fly(game, m, heli, pts, { speed = 16, look = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts); const len = curve.getLength(); const st = { u: 0, v: speed * 0.3, target: speed, done: false };
  m.every((dt, t) => {
    st.v += (st.target - st.v) * Math.min(1, dt * 0.5); st.u = Math.min(1, st.u + st.v * dt / len);
    const p = curve.getPoint(st.u), q = curve.getPoint(Math.min(1, st.u + 0.01));
    heli.position.copy(p).add(V(0, Math.sin(t * 1.3) * 0.25 + Math.sin(t * 3.1) * 0.08, 0));
    let yaw; const tg = look?.(p);
    if (tg) { const dx = tg.x - p.x, dz = tg.z - p.z, l = Math.hypot(dx, dz) || 1; yaw = Math.atan2(-dz / l, dx / l); } else yaw = Math.atan2(q.x - p.x, q.z - p.z);
    heli.rotation.y += wrap(yaw - heli.rotation.y) * Math.min(1, dt * 1.2);
    heli.rotation.z = Math.sin(t * 0.9) * 0.05 + Math.sin(t * 2.3) * 0.02; heli.rotation.x = -0.06 * (st.v / speed);
    if (st.u >= 1) { st.done = true; return false; }
  });
  return st;
}
function seatIn(game, vehicle, list) {
  const scene = game.renderer.scene;
  for (const [a, x, y, z, yaw] of list) { scene.remove(a.actor.root); vehicle.add(a.actor.root); a.actor.root.position.set(x, y, z); a.yaw = yaw; a.actor.root.rotation.y = yaw; a._placed = true; a.path = null; a.hold?.(); a.pose('sit'); a.actor.target.sit = 1; }
}
// the RIB: two grey tubes, a deck, a console and an outboard, running dark
function buildRib() {
  const g = new THREE.Group(); g.userData.dynamic = true;
  const tube = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.6 }), deck = new THREE.MeshStandardMaterial({ color: 0x343634, roughness: 0.85 }), dark = new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.5, metalness: 0.3 });
  for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 5.0, 4, 12).rotateX(Math.PI / 2), tube); t.position.set(s * 0.95, 0.32, -0.3); g.add(t); }
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.3, 8, 14, Math.PI), tube); bow.rotation.x = Math.PI / 2; bow.position.set(0, 0.32, 2.2); g.add(bow);
  const d = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 5.4), deck); d.position.set(0, 0.12, -0.2); g.add(d);
  const con = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.6), dark); con.position.set(0, 0.62, -1.1); g.add(con);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshStandardMaterial({ color: 0x9ab0b8, transparent: true, opacity: 0.3, side: THREE.DoubleSide })); ws.position.set(0, 1.22, -0.84); ws.rotation.x = -0.4; g.add(ws);
  const eng = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.95, 0.55), dark); eng.position.set(0, 0.62, -3.1); g.add(eng);
  return g;
}
function toTunnel(game) { const lv = game.level; lv.setArea('tunnel'); game.player.teleport(V(403, 0, 0.5), facing(1, 0)); }
function toHall(game) { const lv = game.level; lv.setArea('ext'); lv.setWater(CH.WL_RUN); game.player.speedScale = 1; const u = game.renderer.grade?.uniforms; if (u) u.tint.value.set(1, 1, 1); game.player.teleport(V(CH.hatch.x - 1.2, 0, CH.hatch.z + 0.5), facing(-1, 0.3)); }
function barks(game, m, { until = () => false } = {}) {
  let t = 4;
  m.every((dt) => {
    if (until()) return false; t -= dt; if (t > 0) return; t = 6 + Math.random() * 6;
    if (!game.director.enemies().some((e) => e.state === 'combat')) return;
    const L = [['contractor', '랙 사이에 있다! 좌측으로 돌아!'], ['contractor', '재장전!'], ['contractor', '엄호해, 들어간다!'], ['nadia', '왼쪽 통로!'], ['contractor', '서버 맞히지 마— 아, 상관없어, 쏴!'], ['nadia', '하나 더 온다!']];
    const l = L[Math.floor(Math.random() * L.length)]; if (l[0] === 'nadia' && !game.level.nadia) return; game.dialogue.bark(l[0], l[1]);
  });
}

// into the helicopter at the door gun (from the yard in one run, or straight from the exfil checkpoint)
function boardExfil(game) {
  const lv = game.level; if (lv.doorGun) return;
      if (!lv.heli) { const heli = buildHelicopter(); heli.position.set(-26, 1.6, 12); game.renderer.scene.add(heli); lv.heli = heli; lv.rotor = game.audio.rotorLoop?.(); lv.rotor?.set(0.9); const m0 = game.mission; m0.every((dt) => { heli.userData.rotor?.rotateY?.(dt * 30); heli.userData.tail?.rotateX?.(dt * 40); lv.rotor?.setPos?.(heli.position); }); }
  const heli = lv.heli; heli.rotation.set(0, 0, 0);
  const nadia = nadiaAt(game, heli.position.clone()); seatIn(game, heli, [[nadia, -0.45, -1.05, 0.6, Math.PI / 2]]);
  const mg = new MountedWeapon(game, { kind: 'mg', pos: V(0, 0, 0), yaw: 0, yawRange: 1.35, pitchRange: [-0.8, 0.3], prompt: '도어건', interactable: false, def: { damage: 70 } });
  heli.add(mg.root); mg.root.position.set(1.12, -0.2, -0.35); mg.root.rotation.y = -Math.PI / 2; game.mounted.push(mg); lv.doorGun = mg;
  mg.mount(); mg.locked = true;
}

export async function build(game) {
  const lv = new CorrinHead(game); game.level = lv; await lv.build();
  game.director.visionRange = 40;
  game.squad = {}; game.squadList = [{ id: 'nadia', rank: '', name: '나디아 라만', status: '' }, { id: 'maya', rank: '', name: '마야 첸', status: '무전 · 해안 마을' }];
  game.audio.startWind(0.16);
  ammoFromDead(game, game.mission, {});
  hazards(game, game.mission);
}

export const SEGMENTS = [
  // ============ 0. UNDER THE CLIFF ============
  {
    id: 'approach',
    async setup(game) { daniel(game); game.level.setArea('ext'); game.audio.setMusic('ambient'); },
    async run(game, m) {
      const lv = game.level, p = game.player;
      const boat = buildRib(); game.renderer.scene.add(boat); lv.boat = boat;
      const path = new THREE.CatmullRomCurve3([V(-150, 0, 230), V(-132, 0, 185), V(-112, 0, 140), V(-96, 0, 100), V(-89, 0, 72), V(-86.5, 0, 57.5)]);
      const len = path.getLength(); let u = 0, v = 4.5, target = 4.5;
      const place = () => { const a = path.getPoint(u), b = path.getPoint(Math.min(1, u + 0.01)); const yaw = Math.atan2(b.x - a.x, b.z - a.z); const [gx, gz] = lv.seaTilt(a.x, a.z); const fwd = gx * Math.sin(yaw) + gz * Math.cos(yaw), side = gx * Math.cos(yaw) - gz * Math.sin(yaw); boat.position.set(a.x, lv.seaY(a.x, a.z) + 0.2, a.z); boat.rotation.set(-Math.atan(fwd) * 0.6, yaw, Math.atan(side) * 0.6, 'YXZ'); };
      place();
      p.enterSeat(boat, { offset: V(0.3, 1.45, 0.3), yawBase: Math.PI, yawRange: Math.PI * 0.95, pitchRange: [-0.6, 0.5] });
      game.weapons.hidden = true;
      const nadia = nadiaAt(game, boat.position.clone()); const unN = ride(m, nadia, boat, V(-0.2, 0.2, -1.7));
      const eng = game.audio.engineLoop?.('truck'); eng?.set(0.35, 0.35);
      m.every((dt) => { v += (target - v) * Math.min(1, dt * 0.6); u = Math.min(1, u + v * dt / len); place(); eng?.setPos?.(boat.position); eng?.set(0.2 + v / 12, v > 0.5 ? 0.35 : 0.0); if (u >= 1 && lv.boatDone) return false; });
      lv.search.mode = 'sea';
      game.cine.title('THE MISSING FILE', '2029. 03. 23  03:00 GMT\n북대서양 연안 · 코린 헤드\n다니엘 보스', 7);
      await m.wait(2);
      await m.talk([
        ['maya', '들려? …바람 소리밖에 안 들리네. 좋아, 그게 정상이야.', { radio: true }],
        ['daniel', '정상이라는 말을 그렇게 넓게 쓰는 사람은 너밖에 없어.', {}],
        ['maya', '코린 헤드. 세이블 리지라는 회사가 정부 기관 몇 곳의 기록을 위탁 보관하는 곳이야. 서류상으로는 기상 관측소.', { radio: true }],
        ['maya', '한반도 전쟁을 연 그 패키지 — "선제 타격 임박" 묶음. 사본은 전부 지워졌는데, 원본은 B 홀 어딘가에 아직 있어.', { radio: true }],
        ['nadia', '왜 원본만 남아 있지?', {}],
        ['maya', '원본을 지우려면 원본이 어디 있는지 아는 사람이 지워야 하니까. 그 사람은 지금 자기는 아무것도 몰랐다고 말하는 중이고.', { radio: true }],
        ...(flag('m07_maya') === 'hurt' ? [['daniel', '어깨는?', {}], ['maya', '진통제 먹었어. 마우스는 오른손으로 잡아.', { radio: true }]] : []),
        ...(gravesHere() ? [['maya', '나쁜 소식 하나. 그레이브스가 가져간 케스트럴 사본을 보고 할바르드가 여기 야간 경비를 두 배로 늘렸어. 근무표에 그 이름도 있고.', { radio: true }], ['daniel', '커피 사겠다더니. 여기서 사려나 보군.', {}]] : []),
      ]);
      // the searchlight comes across the water: engine off, drift in the dark until it has gone by
      target = 0.6; eng?.set(0.1, 0.0);
      await m.say('nadia', '불빛. 엔진 끈다. 고개 숙여.', { priority: 3 });
      lv.search.mode = 'track'; lv.search.target = boat.position.clone().add(V(-24, 0, 14));
      for (let i = 0; i < 40; i++) { lv.search.target.lerp(boat.position.clone().add(V(8 - i * 0.6, 0, -4 + i * 0.3)), 0.2); await m.wait(0.15); }
      lv.search.mode = 'sweep';
      await m.say('nadia', '…지나갔어.', { priority: 3 });
      target = 4.2; eng?.set(0.4, 0.35);
      await m.talk([
        ['daniel', '세이블 리지는 경비를 누구한테 맡겼지?', {}],
        ['maya', '할바르드가 소개한 업체. 그러니까 사실상 할바르드.', { radio: true }],
        ['nadia', '절벽 밑 바위턱에 붙일 거야. 파도가 빠지는 순간에 내려. 한 번 놓치면 다음 파도까지 기다려야 해.', {}],
      ]);
      await m.until(() => u >= 0.995, 120);
      target = 0; lv.boatDone = true;
      await m.say('nadia', '지금!', { priority: 3 });
      eng?.stop(); unN();
      p.exitSeat(V(CH.land.x, CH.SHELF, CH.land.z)); p.yaw = facing(0, -1); game.weapons.hidden = false;
      nadiaAt(game, V(CH.land.x - 1.5, CH.SHELF, CH.land.z + 0.8));
      p.addShake?.(0.25); game.audio.footstep?.('concrete', 1.2);
      // the boat drifts off on its painter; Nadia ties it to an iron ring in the rock
      m.every((dt) => { boat.position.y = lv.seaY(boat.position.x, boat.position.z) + 0.05; boat.position.x += dt * 0.2; if (boat.position.x > -80) return false; });
    },
  },

  // ============ 1. THE CLIFF ============
  {
    id: 'cliff',
    async setup(game) { daniel(game); game.level.setArea('ext'); game.player.teleport(V(CH.land.x, CH.SHELF, CH.land.z), facing(0, -1)); nadiaAt(game, V(CH.land.x - 1.5, CH.SHELF, CH.land.z + 0.8)); },
    async run(game, m) {
      const lv = game.level, p = game.player, L = CH.ledge, P = CH.plat;
      let nadia = lv.nadia; nadia.hold(nadia.position.clone()); nadia.lookAt(p.position);
      const split = nadiaSplits();
      const opening = m.talk(split ? [
        ['nadia', '보안실은 내가 맡을게. 저 서쪽 골짜기에 옛날 등반로가 있어. 고정 로프가 아직 붙어 있다면.', { priority: 3 }],
        ['daniel', '"있다면"이 마음에 걸리는데.', { priority: 3 }],
        ['nadia', '내 걱정은 위에서 해. 카메라를 끄고 무전을 막을게. 당신은 그 파일만 생각해.', { priority: 3 }],
        ['daniel', '…조심해.', { priority: 3 }],
        ['nadia', '그 말, 5년 전에 누가 사미르한테도 해 줬으면 좋았을 텐데.', { priority: 3 }],
      ] : [
        ['daniel', '보안실을 누가 맡아 주면 좋겠는데.', { priority: 3 }],
        ['nadia', '그리고 당신 혼자 그 파일을 만지게 두고? 아니. 같이 간다.', { priority: 3 }],
        ['daniel', '그럼 카메라는 살아 있겠군.', { priority: 3 }],
        ['nadia', '그럼 카메라에 안 걸리면 되겠네.', { priority: 3 }],
      ]);
      // the mechanics run from the first step; the talk plays over them
      if (split) { const n0 = nadia; m.spawn(async () => { await opening; n0.moveTo(V(CH.land.x - 10, CH.SHELF, 46), { run: false }); await m.wait(5); dropNadia(game); }); nadia = null; }
      else m.spawn(() => opening);
      game.objectives.add('climb', '절벽을 올라 펌프실로', { marker: CH.pumpDoor.clone().setY(P.y + 2) });
      game.objectives.add('ladder', '버트레스의 사다리', { marker: V(CH.ladder.x0 - 0.2, CH.SHELF + 2.5, (CH.ladder.z0 + CH.ladder.z1) / 2) });
      game.ui.hint(`사다리를 마주 보고 ${k(game, 'forward')} — 위에서는 오른쪽(동쪽)으로 올라선다`, 6);
      // safety: at the top of the ladder always step onto the buttress
      const lad = CH.ladder;
      let ladDone = false;
      m.every(() => { const q = p.position; if (q.x > lad.x0 - 0.4 && q.x < lad.x1 + 0.2 && q.z > lad.z0 && q.z < lad.z1 && q.y > lad.top - 0.35 && q.y < lad.top + 0.5) { p.teleport(V(CH.buttress.x0 + 1.2, lad.top, q.z), facing(1, 0)); if (!ladDone) { ladDone = true; game.objectives.complete('ladder'); } } if (q.y > lad.top - 0.5 && !ladDone) { ladDone = true; game.objectives.complete('ladder'); } if (lv.cliffDone) return false; });
      // with Nadia along: she keeps a few steps behind, out of sight while she climbs
      const trail = [V(-84, CH.SHELF, 46), V(-79, CH.SHELF, 44), V(-73.5, L.y, 42.2), V(-62, L.y, 40.7), V(-48, L.y, 40.7), V(-38, L.y, 41.4), V(-29.3, -22, 41.5), V(-36, P.y, 43.5)];
      if (nadia) { nadia.setPassive(true); m.every(() => { if (!lv.nadia || lv.cliffDone) return false; let i = 0; for (let j = 0; j < trail.length; j++) if (p.position.distanceTo(trail[j]) < 3.5) i = j; const want = trail[Math.max(0, i - 1)]; const cam = game.renderer.camera; const to = want.clone().sub(cam.position); const seen = to.dot(cam.getWorldDirection(new THREE.Vector3())) > 0 && to.length() < 30; if (lv.nadia.position.distanceTo(want) > 2 && (!seen || lv.nadia.position.distanceTo(p.position) > 12)) { lv.nadia.actor.root.position.copy(want); lv.nadia._placed = true; lv.nadia.hold(want.clone()); } lv.nadia.lookAt(p.position); }); }
      // the pump-house sentry: under the overhang, smoking, watching the sea
      const sentry = pmc(game, -36.6, 44.8, { name: '경비', visionRange: 0.1 }, P.y); sentry.actor.root.position.y = P.y; sentry._placed = true; sentry.hold(V(-36.6, P.y, 44.8)); sentry.yaw = 0; sentry.lookAt(V(-36.6, P.y + 1.5, 60));
      takedowns(game, m, [sentry]);
      let spotted = false;
      const onSpot = () => {
        if (spotted) return; spotted = true; lv.cliffSpotted = true; game.audio.setMusic('combat');
        m.spawn(() => m.talk([['contractor', '절벽에 누가 있다! 탐조등 고정해!', { radio: true, priority: 3 }], ['maya', '들켰어, 다니엘. 서둘러 — 펌프실 안으로 들어가면 놈들 시야에서 벗어나.', { radio: true, priority: 3 }]]));
        lv.search.mode = 'track';
        if (!sentry.dead && !sentry.koed) { sentry.visionRange = 50; sentry.setPassive(false); attackOrder(game, [sentry], p); }
        // the tower above rakes the face for half a minute
        let t = 0; m.every((dt) => { t += dt; lv.search.target = p.position.clone().add(V(0, 1, 0)); if (t > 30 || lv.cliffDone) { lv.search.mode = 'sweep'; return false; } if (Math.random() < dt * 2.2) { const from = V(CH.tower.x, 3.4, CH.tower.z + 3); const to = p.chestPos(new THREE.Vector3()).add(V(rand(-2, 2), rand(-1, 1.5), rand(-0.5, 1.5))); game.effects.tracer(from, to); game.audio.shot(from, { enemy: true }); if (Math.random() < 0.12) p.takeDamage(11, from); else p.nearMiss?.(to); } });
      };
      // the searchlight: in the beam for long enough and they have you
      const beamSrc = () => { const S = lv.search; if (!S.on || lv.area !== 'ext') return 0; const o = S.head.getWorldPosition(new THREE.Vector3()); const dir = S.aim.clone().sub(o).normalize(); const to = p.chestPos(new THREE.Vector3()).sub(o); const d = to.length(); if (d > 120) return 0; const ang = to.normalize().angleTo(dir); if (ang > 0.07) return 0; return { rate: 2.2 * (p.crouching ? 0.6 : 1), msg: '탐조등에 걸렸다 — 빛을 벗어나라' }; };
      const det = detector(game, m, '발각 위험', [beamSrc, () => seeRate(game, sentry, 16)], onSpot);
      m.every(() => { if (spotted) return false; const s = game.weapons.lastShot; if (s && s !== lv._lastShot) { lv._lastShot = s; if (!s.suppressed) det.bump(1); else if (!sentry.dead && sentry.position.distanceTo(p.position) < 8) det.bump(0.4); } });
      // gusts on the ledge: a warning, then 2 s of wind pushing toward the drop; crouch against the rock to ride it out
      let gustT = 5, gust = 0, gustN = 0;
      const onLedge = () => p.position.x > L.x0 - 1 && p.position.x < L.x1 && Math.abs(p.position.y - L.y) < 0.6 && p.position.z < L.z1 + 0.4;
      let ledgeTold = false;
      m.every((dt) => {
        if (lv.cliffDone) return false;
        if (!onLedge()) { gust = 0; return; }
        if (!ledgeTold) { ledgeTold = true; game.ui.hint(`좁은 바위턱 — 돌풍이 오면 ${k(game, 'crouch')} 앉아서 벽 쪽으로 붙어라`, 6); }
        gustT -= dt;
        if (gustT <= 1.4 && gustT + dt > 1.4) { game.ui.hint('<b>돌풍!</b>', 1.4); game.audio.startWind?.(0.34); }
        if (gustT <= 0 && gust <= 0) { gust = 2.2; }
        if (gust > 0) {
          gust -= dt; const push = (p.crouching ? 0.16 : gustN === 0 ? 0.3 : 1.25) * dt;   // the first gust only shoves: it teaches game.world.moveCylinder(p.position, V(push * 0.15, 0, push), p.radius, 1.75, 0.45); p.addShake?.(0.02);
          if (Math.random() < dt * 6) game.effects.smoke.spawn({ x: p.position.x + rand(-3, 3), y: L.y - 2, z: 43, vx: 1, vy: 3, vz: -4, size: 1, endSize: 3.5, life: 1.2, alpha: 0.35, r: 0.85, g: 0.88, b: 0.9, drag: 0.5 });
          if (gust <= 0) { gustT = rand(6, 10); game.audio.startWind?.(0.16); if (gustN++ === 0) game.ui.hint(`다음 돌풍은 더 세다 — ${k(game, 'crouch')} 앉아서 벽 쪽에 붙어라`, 5); }
        }
      });
      m.spawn(async () => { await m.until(() => onLedge(), 900); await m.say('maya', '바위턱 위야? 그 동네 풍속계가 초속 25미터를 찍고 있어. 붙어서 가.', { radio: true, priority: 2 }); });
      m.spawn(async () => { await m.until(() => p.position.x > -40 && p.position.y > L.y - 0.5, 900); await m.say('daniel', '(뜯겨 나간 철계단을 보며) 아래쪽 절반은 바다가 가져갔군. 위쪽은 아직 붙어 있어.', { priority: 2 }); });
      m.spawn(async () => { await m.until(() => p.position.y > -20 && p.position.x > -36, 900); if (!sentry.dead && !sentry.koed && !spotted) await m.say('maya', '펌프실 앞에 한 명. 담배 불빛이 보여. …비 오는데 잘도 피우네.', { radio: true, priority: 2 }); });
      // at the pump house
      await interact(game, { pos: CH.pumpDoor.clone().setY(P.y + 1.2), prompt: '펌프실 문 따기', radius: 2.2 });
      lv.cliffDone = true; det.stop(); game.objectives.complete('climb'); if (!ladDone) game.objectives.complete('ladder');
      if (!sentry.dead && !sentry.koed) { game.director.remove(sentry); }
      saves.setFlag('m08_cliff', spotted ? 'spotted' : 'quiet');
      await fade(game, m, async () => { toTunnel(game); if (lv.nadia) nadiaAt(game, V(402, 0, -1.5)); game.audio.startWind?.(0.04); });
    },
  },

  // ============ 2. THE COOLING TUNNEL ============
  {
    id: 'tunnel',
    async setup(game) { daniel(game); toTunnel(game); if (!nadiaSplits()) nadiaAt(game, V(402, 0, -1.5)); },
    async run(game, m) {
      const lv = game.level, p = game.player, D = CH.dip;
      // water rushing through the intake: a low roar that the pumps drive
      const a = game.audio; let roar = null;
      if (a.ready && a.ctx) { const c = a.ctx; const n = a.noiseSrc(a.brown); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; const gg = c.createGain(); gg.gain.value = 0.18; n.connect(lp).connect(gg); a.route(gg, null, { bus: 'amb' }); n.start(); roar = { g: gg, stop: () => { try { n.stop(); } catch {} } }; m.bind(() => roar?.stop()); }
      game.audio.setMusic('tension');
      await m.talk([
        ['maya', '펌프실이면 냉각수 터널이야. 바닷물을 끌어올려서 B 홀 바로 밑까지 보내.', { radio: true }],
        ['daniel', '(손전등을 켜며) 바다 냄새 나는 데이터 센터라니.', {}],
        ['maya', '터널 중간에 침전조가 있어. 펌프가 돌면 거기가 천장까지 잠겨.', { radio: true }],
      ]);
      if (!p.flashOn) game.ui.hint(`${k(game, 'flashlight')} 손전등`, 4);
      game.objectives.add('panel', '펌프 제어반', { marker: CH.panel.clone().setY(1.8) });
      await interact(game, { pos: CH.panel.clone().setY(1.3), prompt: '제어반 확인', radius: 2.2 });
      game.objectives.complete('panel');
      await m.talk([
        ['maya', '펌프 세 대가 홀 냉각수를 돌리고 있어. 멈추면 침전조 물은 빠지는데—', { radio: true }],
        ['maya', '홀 온도가 올라가. 그럼 누군가 원인을 찾으러 내려오겠지. 이 터널로.', { radio: true }],
        ...(lv.nadia ? [['nadia', '아니면 숨 참고 물속을 지나가거나. 난 둘 다 싫어.', {}]] : []),
      ]);
      const pick = await choose(game, m, { flag: 'm08_pumps', tag: '결정 // 냉각 펌프', timeout: 25, fallback: 1, options: [
        { key: 'stop', text: '펌프를 멈춘다 — 침전조 물이 빠진다', note: '확인하러 사람이 내려온다 · 그만큼 홀 경비는 줄어든다' },
        { key: 'run', text: '펌프를 그대로 둔다 — 잠긴 구간은 잠수해서 지난다', note: '시설은 아무것도 모른다' },
      ] });
      const guards = [];
      if (pick === 'stop') {
        lv.pumpsStopped = true; game.audio.click(0.5, 220, 0.4); for (const l of lv.panelLeds) l.material.color.setHex(0xff2a14); lv.fanFast = false;
        let wl = CH.WL_RUN; m.every((dt) => { wl = Math.max(CH.WL_STOP, wl - dt * 0.16); lv.setWater(wl); if (roar) roar.g.gain.value = 0.04 + 0.14 * (wl - CH.WL_STOP) / (CH.WL_RUN - CH.WL_STOP); if (wl <= CH.WL_STOP) return false; });
        await m.say('daniel', '(물 빠지는 소리를 들으며) 이제 누가 내려올 때까지 시간 싸움이군.', { priority: 2 });
        game.objectives.add('through', '터널을 지나 수직 갱도로', { marker: V(634, 1.6, -1.6) });
        // the check team comes down the shaft after half a minute: two guards and a technician, torches on
        m.spawn(async () => {
          await m.wait(26);
          await m.say('control', '터널 점검조, 2번 펌프실 확인해. 냉각수 압력이 떨어졌어.', { radio: true, priority: 2 });
          const team = [pmc(game, 630, -0.5, { name: '경비', visionRange: 0.1, patrol: [V(600, 0, -1), V(470, 0, -1), V(420, 0, -1)] }), pmc(game, 631.5, 0.3, { name: '경비', visionRange: 0.1, patrol: [V(598, 0, 0), V(468, 0, 0), V(418, 0, 0)] }), civ(game, 632, -1, { name: '기술자', patrol: null })];
          team[2].moveTo(V(440, 0, -1));
          guards.push(team[0], team[1]); takedowns(game, m, [team[0], team[1]]);
          lv.tunnelTeam = team;
          await m.say('maya', '갱도에서 누가 내려와. 셋. 옆으로 빠진 공간에 숨어.', { radio: true, priority: 3 });
          if (lv.nadia) await m.say('nadia', '(속삭이며) 기술자는 건드리지 마. 저 사람은 월급 받고 일하는 거야.', { priority: 2 });
        });
      } else {
        lv.pumpsStopped = false;
        game.objectives.add('through', '침전조를 지나 수직 갱도로', { marker: V(634, 1.6, -1.6) });
        // one man sits at the foot of the shaft with a flask
        const g1 = pmc(game, 628, 1.2 - 2.2, { name: '경비', visionRange: 0.1 }); g1.hold(V(628, 0, -1)); g1.yaw = Math.PI / 2; g1.lookAt(V(600, 1.5, -1));
        guards.push(g1); takedowns(game, m, [g1]);
        // breath under the baffle
        const breath = { v: 1 }; let b = null; let told = false;
        m.every((dt) => {
          if (lv.under) { if (!b) b = bar(game, m, '호흡'); breath.v = Math.max(0, breath.v - dt / 28); b.set(breath.v, breath.v < 0.3 ? '숨이 차오른다 — 수면으로!' : '숨을 참는 중', breath.v < 0.3 ? 'danger' : breath.v < 0.55 ? 'warn' : ''); if (breath.v <= 0 && Math.random() < dt * 2) p.takeDamage(9, null, null, { kind: 'mission', label: '익사' }); }
          else { breath.v = Math.min(1, breath.v + dt / 3); if (b) { b.set(breath.v, '숨을 고르는 중'); if (breath.v >= 1) { b.remove(); b = null; } } }
          if (!told && p.position.x > D.x0 + 6 && lv.swimming) { told = true; game.ui.hint(`물이 천장까지 차 있다 — ${k(game, 'crouch')} 앉아서 잠수, 수문 아래를 지나 반대편에서 일어선다`, 7); }
          if (p.position.x > D.x1 + 8) { if (b) b.remove(); return false; }
        });
        m.spawn(async () => { await m.until(() => p.position.x > D.x1 + 2, 900); if (p.position.x < 700) await m.say('daniel', '(물을 뱉으며) …다음엔 계단이 있는 데이터 센터로 하자.', { priority: 2 }); });
      }
      // detection in the dark: torches make you visible, darkness hides you
      let spotted = false;
      const det = detector(game, m, '발각 위험', [() => guards.reduce((s, e) => s + seeRate(game, e, p.flashOn ? 22 : 11), 0)], () => {
        spotted = true; lv.tunnelSpotted = true; game.audio.setMusic('combat');
        for (const e of guards) if (!e.dead && !e.koed) { e.visionRange = 40; e.patrol = null; e.setPassive(false); } attackOrder(game, guards.filter((e) => !e.dead && !e.koed), p);
        m.spawn(() => m.say('contractor', '터널에 침입자! 관제, 터널에 침입자다!', { priority: 3 }));
      });
      m.every(() => { if (spotted) return false; const s = game.weapons.lastShot; if (s && s !== lv._lastShotT) { lv._lastShotT = s; if (!s.suppressed) det.bump(1); else if (guards.some((e) => !e.dead && !e.koed && e.position.distanceTo(p.position) < 9)) det.bump(0.35); } });
      // the shaft: climb out into the plant room
      await interact(game, { pos: V(634, 1.4, -1.9), prompt: '사다리를 올라 해치 열기', radius: 2.2 });
      det.stop(); game.objectives.complete('through');
      for (const e of [...guards, ...(lv.tunnelTeam || [])]) if (!e.dead && !e.removed) game.director.remove(e);
      saves.setFlag('m08_tunnel', spotted ? 'spotted' : 'quiet');
      await fade(game, m, async () => { toHall(game); if (lv.nadia) nadiaAt(game, V(CH.hatch.x + 1, 0, CH.hatch.z + 1.5)); roar?.stop(); roar = null; game.audio.startWind?.(0.05); });
    },
  },

  // ============ 3. DATA HALL B ============
  {
    id: 'hall',
    async setup(game) { daniel(game); toHall(game); if (!nadiaSplits()) nadiaAt(game, V(CH.hatch.x + 1, 0, CH.hatch.z + 1.5)); },
    async run(game, m) {
      const lv = game.level, p = game.player;
      const alert = lv.cliffSpotted || lv.tunnelSpotted || flag('m08_cliff') === 'spotted' || flag('m08_tunnel') === 'spotted';
      const fewer = flag('m08_pumps') === 'stop';
      game.audio.click(0.3, 400, 0.3);
      // guards: patrols in the aisles, one at the operations room door
      const G = (x, z, route) => pmc(game, x, z, { name: '경비', visionRange: 0.1, patrol: route ? route.map(([a, b]) => V(a, 0, b)) : null });
      const guards = [G(31, -55, [[31, -56], [31, -25]]), G(25, -38, [[25, -38], [76, -38]]), G(67, -25, [[67, -25], [67, -56]])];
      const door = G(41, -21.6); door.hold(V(41, 0, -21.6)); door.yaw = Math.PI; door.lookAt(V(41, 1.5, -30)); guards.push(door);
      if (!fewer) guards.push(G(49, -25, [[49, -25], [49, -56]]), G(52, -14, [[52, -14], [76, -14]]));
      if (alert || gravesHere()) guards.push(G(85, -22, [[85, -38], [85, -22]]), G(37, -56, [[37, -56], [37, -25]]));
      takedowns(game, m, guards);
      // the two night technicians in the operations room
      const techs = [civ(game, 27, -13, { name: '기술자' }), civ(game, 33.5, -12.5, { name: '기술자' })];
      for (const t of techs) { t.hold(t.position.clone()); t.lookAt(V(t.position.x, 1.2, -9)); }
      lv.techs = techs; game.dialogue.bindSpeaker?.('tech', techs[0]);
      // cameras: looped by Nadia from the security room, or live
      const live = !nadiaSplits();
      const cams = lv.cams.map((c) => ({ c, yaw: c.base, dead: false, eyePos: (o) => o.set(c.x, 5.0, c.z) }));
      if (live) {
        for (const cw of cams) {
          const hv = { isVehicle: true, dead: false, radius: 0.5, position: V(cw.c.x, 5.2, cw.c.z),
            rayTest(o, d, maxD) { const s = new THREE.Sphere(this.position, 0.35); const h = new THREE.Ray(o, d).intersectSphere(s, new THREE.Vector3()); if (!h) return null; const dist = h.distanceTo(o); return dist > maxD ? null : { dist, point: h }; },
            damage() { if (this.dead) return false; this.dead = true; cw.dead = true; cw.c.dead = true; cw.c.obj.rotation.x = 0.9; cw.c.led.visible = false; game.audio.glassBreak?.(this.position.clone(), 0.3); game.effects.impact?.(this.position.clone(), V(0, -1, 0), 'metal'); return true; }, update() {} };
          game.director.vehicles.push(hv); m.bind(() => { game.director.vehicles = game.director.vehicles.filter((x) => x !== hv); });
        }
        m.every(() => { for (const cw of cams) cw.yaw = cw.c.yaw ?? cw.c.base; });
      } else for (const cw of cams) { cw.dead = true; cw.c.led.visible = false; cw.c.dead = true; }
      // talk (in parallel: the guards are already walking)
      m.spawn(() => m.talk(nadiaSplits() ? [
        ['nadia', '(무전) 보안실. 경비 둘은 묶어 뒀어. 카메라는 어제 화면을 반복해서 내보내는 중이야. 30분.', { radio: true }],
        ['daniel', '30분이면 넉넉해.', {}],
        ['nadia', '당신 일이 넉넉하게 끝난 적이 있었나?', { radio: true }],
      ] : [
        ['nadia', '(속삭이며) 천장 카메라. 다섯 대야. 랙 뒤로 붙어서 가.', {}],
        ['daniel', '아니면 렌즈를 쏘거나.', {}],
        ['nadia', '소리 안 나게라면.', {}],
      ]));
      if (live) game.ui.hint('천장 카메라 — 시야에 오래 머물면 경보 · 소음 권총으로 쏴서 끌 수 있다', 6);
      // the rack: known from the Kestrel copy, or looked up at the asset terminal
      const known = flag('m07_server') === 'copy';
      if (known) {
        await m.say('maya', '케스트럴 서버 목록에 임대 랙 번호가 있었어. H-17. 동쪽에서 세 번째 줄.', { radio: true });
      } else {
        await m.say('maya', '랙 번호는 몰라. 홀 가운데 통로에 자산 관리 단말이 있어. 거기서 "케스트럴"로 찾아.', { radio: true });
        game.objectives.add('asset', '자산 관리 단말에서 임대 랙 찾기', { marker: CH.assetTerm.clone().setY(1.8) });
      }
      let spotted = false;
      const goLoud = () => {
        if (spotted) return; spotted = true; lv.hallSpotted = true; lv.setAlarm(true); game.audio.setMusic('combat');
        for (const e of guards) if (!e.dead && !e.koed) { e.visionRange = 50; e.patrol = null; e.setPassive(false); }
        attackOrder(game, guards.filter((e) => !e.dead && !e.koed), p);
        m.spawn(() => m.talk([['control', '홀 B 침입! 전 인원 홀 B로!', { radio: true, priority: 3 }], ...(lv.nadia ? [['nadia', '들켰어. 그럼 시끄럽게 가자.', { priority: 3 }]] : [['nadia', '(무전) 경보가 울렸어. 보안실 문은 내가 막고 있을게.', { radio: true, priority: 3 }]])]));
      };
      const det = detector(game, m, '발각 위험', [() => guards.reduce((s, e) => s + seeRate(game, e, 18), 0), () => (live ? cams.reduce((s, c) => s + (c.dead ? 0 : seeRate(game, c, 24, 0.8) * 0.8), 0) : 0)], goLoud);
      // a body found by another guard, an unsuppressed shot, a guard already fighting
      const counted = new Set();
      m.every(() => {
        if (spotted) return false;
        const s = game.weapons.lastShot; if (s && s !== lv._lastShotH) { lv._lastShotH = s; if (!s.suppressed) det.bump(1); else if (guards.some((e) => !e.dead && !e.koed && e.position.distanceTo(p.position) < 9)) det.bump(0.35); }
        for (const e of guards) { if ((e.dead || e.koed) && !counted.has(e)) { counted.add(e); for (const o of guards) if (!o.dead && !o.koed && o.position.distanceTo(e.position) < 14 && game.world.lineOfSight(o.eyePos(new THREE.Vector3()), e.position.clone().setY(e.position.y + 0.5))) det.bump(0.5); } if (!e.dead && !e.koed && e.state === 'combat') goLoud(); }
      });
      if (!known) {
        await interact(game, { pos: CH.assetTerm.clone().setY(1.2), prompt: '자산 단말 조회', radius: 1.8 });
        game.objectives.complete('asset');
        game.ui.hint('<b>[자산 관리]</b> KESTREL RISK ADVISORY — 랙 H-17 · G열 동쪽 면 · 임대 2027.11~', 5);
        await m.say('daniel', 'H-17. 동쪽에서 세 번째 줄.', { priority: 2 });
      }
      game.objectives.add('rack', '랙 H-17', { marker: CH.rack.clone().add(V(0.6, 2.2, 0)) });
      await interact(game, { pos: CH.rack.clone().add(V(0.4, 1.3, 0)), prompt: '랙 H-17 열기', radius: 1.8 });
      game.objectives.complete('rack'); det.stop();
      lv.sled.position.x += 0.35; lv.sledLed.visible = true; game.audio.click(0.3, 900, 0.08);
      await m.talk([
        ['daniel', '(마야의 연결 장치를 꽂으며) 연결했어.', { priority: 3 }],
        ['maya', '보여. …있다. "ECHO_PKG_0314_FINAL". 그리고 같은 슬레드에 다른 폴더가 하나 더 있어.', { radio: true, priority: 3 }],
        ['maya', '보존 명령서. 이 패키지를 지우지 말고 "격리 보관"하라는 지시야. 서명은 E. 커.', { radio: true, priority: 3 }],
        ['daniel', '커. 5년 전 글래스워터를 승인한 이름이야.', { priority: 3 }],
        ['maya', '둘 다 받으려면 시간이 더 걸려. 그리고 이 슬레드는 꺼내는 순간 경보가 울리게 돼 있어.', { radio: true, priority: 3 }],
      ]);
      await choose(game, m, { flag: 'm08_kerr', tag: '결정 // 랙 H-17', timeout: 25, fallback: 1, options: [
        { key: 'kerr', text: '패키지와 보존 명령서를 함께 받는다', note: '시간이 더 걸린다 — 그동안 버텨야 한다' },
        { key: 'echo', text: '패키지만 받는다', note: '빠르다' },
      ] });
      for (const e of guards) if (!e.dead && !e.koed) { e.visionRange = 50; e.patrol = null; e.setPassive(false); }
      lv.hallGuards = guards.filter((e) => !e.dead && !e.koed);
    },
  },

  // ============ 4. THE DOWNLOAD: hold the hall ============
  {
    id: 'download',
    async setup(game) { daniel(game); toHall(game); game.player.teleport(CH.rack.clone().add(V(1.4, 0, 0.5)), facing(-1, 0)); if (!nadiaSplits()) nadiaAt(game, CH.rack.clone().add(V(3, 0, 2))); const lv = game.level; lv.sled.position.x = CH.rack.x + 0.4; lv.sledLed.visible = true; },
    async run(game, m) {
      const lv = game.level, p = game.player, H = CH.hall;
      const kerr = flag('m08_kerr') === 'kerr', need = kerr ? 95 : 65;
      lv.setAlarm(true); game.audio.setMusic('combat');
      const klax = game.audio.sirenLoop?.(0.035); m.bind(() => klax?.stop());
      await m.say('control', '랙 H-17 탬퍼 경보! 홀 B 봉쇄! 대응팀 투입!', { radio: true, priority: 3 });
      if (gravesHere()) await m.say('graves', '(무전) 보스. 이번엔 커피 없어. 그 랙에서 손 떼.', { radio: true, priority: 3 });
      // whoever was still on the floor
      const left = (lv.hallGuards || []).filter((e) => !e.dead); attackOrder(game, left, p);
      // the NOC locks itself; the technicians stay inside
      lv.nocDoorC = game.world.addBox(V(CH.nocDoor.x - 1, 0, CH.noc.z0 - 0.06), V(CH.nocDoor.x + 1, 2.6, CH.noc.z0 + 0.06), { walkable: false, surface: 'metal' }); lv.nocDoorC.seeThrough = true;
      lv.nocLed.material.color.setHex(0xff2a14); lv.nocDoorLeaf.position.x = CH.nocDoor.x; game.audio.click(0.4, 300, 0.1);
      let prog = 0; const b = bar(game, m, kerr ? '전송 — 패키지 + 보존 명령서' : '전송 — 패키지');
      game.objectives.add('hold', '전송이 끝날 때까지 랙 H-17을 지켜라', { marker: CH.rack.clone().add(V(0.6, 2.4, 0)) });
      m.every((dt) => {
        const near = p.position.distanceTo(CH.rack) < 15;
        if (near) prog += dt; b.set(prog / need, prog >= need ? '완료' : near ? `전송 중… ${Math.round(prog / need * 100)}%` : '랙에서 멀어졌다 — 연결이 끊긴다', near ? '' : 'warn');
        if (prog >= need) return false;
      });
      barks(game, m, { until: () => prog >= need });
      // waves: the west door, the roll-up door, the plant-room door
      const spawnAt = (list, pos) => { const t = list.map(([dx, dz]) => pmc(game, pos.x + dx, pos.z + dz, { visionRange: 60, accuracy: 0.75 })); attackOrder(game, t, p); return t; };
      const all = [...left];
      m.spawn(async () => {
        await m.wait(6);
        openDoor(game, lv.westDoorC, () => { lv.westLeaves[0].position.z -= 1.6; lv.westLeaves[1].position.z += 1.6; }); lv.westDoorC = null;
        all.push(...spawnAt([[-5, -1], [-5, 1], [-8, 0], [-9, 2]], V(H.x0, 0, -38)));
        await m.say(lv.nadia ? 'nadia' : 'maya', lv.nadia ? '서쪽 문!' : '서쪽 문으로 넷 들어가!', { priority: 3, radio: !lv.nadia });
        await m.until(() => prog > need * 0.38, 900);
        let rollY = 1.5; m.every((dt) => { rollY += dt * 0.8; lv.roll.position.y = rollY; if (rollY > 4.2) return false; }); openDoor(game, lv.rollC); lv.rollC = null;
        const truckLights = V(64, 0, -3);
        all.push(...spawnAt(nadiaSplits() ? [[-1, 2], [1, 2.5], [0, 4]] : [[-2, 2], [0, 2.5], [2, 2], [-1, 5], [1, 6]], truckLights));
        await m.say('contractor', '하역문 열렸다! 진입! 진입!', { priority: 3 });
        if (nadiaSplits()) await m.say('nadia', '(무전) 하역장 쪽 둘은 내가 붙잡고 있어. 나머지는 당신 몫.', { radio: true, priority: 3 });
        await m.until(() => prog > need * 0.7, 900);
        openDoor(game, lv.plantC, () => { lv.plantLeaf.rotation.y = 1.3; lv.plantLeaf.position.z -= 0.6; }); lv.plantC = null;
        all.push(...spawnAt([[4, -1], [5, 1], [7, 0], [8, -2]], V(CH.plantDoor.x, 0, CH.plantDoor.z)));
        await m.say(lv.nadia ? 'nadia' : 'maya', lv.nadia ? '기계실 쪽! 뒤로 돌아온다!' : '기계실 문! 뒤에서 온다!', { priority: 3, radio: !lv.nadia });
      });
      // what Maya reads while it comes in
      const at = (f) => m.until(() => prog >= need * f, 900);
      m.spawn(async () => {
        await at(0.12);
        await m.say('maya', '들어오기 시작했어. 위성 사진 열두 장, 감청 기록 일곱 건, 통신 로그. 전부 "확인됨" 도장이 찍혀 있어.', { radio: true, priority: 2 });
        await at(0.32);
        await m.talk([
          ['maya', '감청 기록 7번. 원본 메타데이터가 덜 지워졌어. …다니엘, 이건 감청이 아니야. 센서 로그야.', { radio: true, priority: 2 }],
          ['daniel', '(사격하며) 무슨 센서?', { priority: 2 }],
          ['maya', '대한민국 육군 제7보병사단. GOP 3소초, 3구역 철책 감지 센서. 3월 14일, 04시 21분.', { radio: true, priority: 2 }],
        ]);
        await at(0.55);
        await m.talk([
          ['maya', '센서 다섯 개가 0.2초 간격으로 한꺼번에 울렸어. 사람도 짐승도 그렇게는 못 움직여. 만든 신호야. ECHO가 넣은 거야.', { radio: true, priority: 2 }],
          ['maya', '그런데 이 패키지 안에서는 그게 "남측 특수부대 침투 개시 징후"로 편집돼 있어. 패키지의 마지막 항목. 04시 21분에 추가됐고…', { radio: true, priority: 2 }],
          ['daniel', '…그리고?', { priority: 2 }],
          ['maya', '31분 뒤에 첫 포탄이 떨어졌어.', { radio: true, priority: 3 }],
        ]);
        if (lv.nadia) await m.say('nadia', '(재장전하며) 거짓말 하나에 31분이라.', { priority: 2 });
        if (kerr) { await at(0.82); await m.talk([['maya', '보존 명령서도 들어온다. 날짜는 개전 이틀 뒤야. 지우지 말고 격리하라고. 나중에 필요할 때 꺼내 쓰려고.', { radio: true, priority: 2 }], ['daniel', '지우면 자기 이름도 같이 지워지니까.', { priority: 2 }]]); }
      });
      await m.until(() => prog >= need, 1200);
      b.remove(); game.objectives.complete('hold'); lv.sledLed.material.color.setHex(0x40c8ff);
      await m.say('maya', '다 받았어. 다니엘, 거기서 나와. 지금.', { radio: true, priority: 3 });
      // whatever is still standing falls back to the doors for the purge
      lv.downloadLeft = all.filter((e) => !e.dead);
    },
  },

  // ============ 5. THE PURGE ============
  {
    id: 'purge',
    async setup(game) {
      daniel(game); toHall(game); const lv = game.level; lv.setAlarm(true);
      game.player.teleport(CH.rack.clone().add(V(1.4, 0, 0.5)), facing(-1, 0)); if (!nadiaSplits()) nadiaAt(game, CH.rack.clone().add(V(3, 0, 2)));
      if (lv.westDoorC) { game.world.removeCollider(lv.westDoorC); lv.westDoorC = null; lv.westLeaves[0].position.z -= 1.6; lv.westLeaves[1].position.z += 1.6; }
      lv.nocDoorLeaf.position.x = CH.nocDoor.x; if (!lv.nocDoorC) { lv.nocDoorC = game.world.addBox(V(CH.nocDoor.x - 1, 0, CH.noc.z0 - 0.06), V(CH.nocDoor.x + 1, 2.6, CH.noc.z0 + 0.06), { walkable: false, surface: 'metal' }); lv.nocDoorC.seeThrough = true; }
      if (!lv.techs) { lv.techs = [civ(game, 27, -13), civ(game, 33.5, -12.5)]; }
    },
    async run(game, m) {
      const lv = game.level, p = game.player, N = CH.noc;
      game.audio.setMusic('tension');
      for (const e of lv.downloadLeft || []) if (!e.dead) game.director.remove(e);
      await m.say('pa', '홀 B 소화 설비 수동 기동. 40초 후 가스가 방출됩니다. 인원은 즉시 대피하십시오.', { priority: 3 });
      await m.talk([
        ['control', '…잠깐, 운영실에 기술자 둘이 아직 있습니다! 문이 봉쇄 상태예요!', { radio: true, priority: 3 }],
        [gravesHere() ? 'graves' : 'contractor', '봉쇄 유지해. 문을 열면 저 녀석도 같이 나와.', { radio: true, priority: 3 }],
      ]);
      // the technicians at the glass
      const techs = lv.techs.filter((t) => !t.removed);
      techs.forEach((t, i) => { t.moveTo(V(CH.nocDoor.x - 2 + i * 3, 0, N.z0 + 0.8), { run: true }); });
      game.dialogue.bindSpeaker?.('tech', techs[0]);
      m.spawn(() => m.say('tech', '(유리를 두드리며) 문이 안 열려요! 여기 사람 있어요!', { priority: 3 }));
      let left = 40; events.emit('hud:timer', { label: '소화 가스 방출', seconds: left });
      m.every((dt) => { left -= dt; events.emit('hud:timer', { label: '소화 가스 방출', seconds: left }); if (left <= 0) { events.emit('hud:timer', null); return false; } });
      m.bind(() => events.emit('hud:timer', null));
      const pick = await choose(game, m, { flag: 'm08_techs', tag: '결정 // 운영실', timeout: 12, fallback: 1, options: [
        { key: 'open', text: '운영실 잠금을 푼다 — 기술자 둘을 데리고 나간다', note: '제어반을 해제하는 데 시간이 든다' },
        { key: 'leave', text: '서쪽 문으로 곧장 나간다', note: '가스가 방출되기 전에' },
      ] });
      if (pick === 'open') {
        game.objectives.add('noc', '운영실 잠금 해제', { marker: lv.nocPanel.clone().setY(2) });
        await interact(game, { pos: lv.nocPanel.clone(), prompt: '잠금 제어반 해제', radius: 1.8 });
        let t = 0; const b = bar(game, m, '잠금 해제');
        m.every((dt) => { const near = p.position.distanceTo(lv.nocPanel.clone().setY(p.position.y)) < 2.4; t = near ? t + dt : Math.max(0, t - dt); b.set(t / 5, near ? '배선을 바꾸는 중…' : '제어반에서 멀어졌다'); if (t >= 5) return false; });
        await m.until(() => t >= 5, 60);
        b.remove(); game.objectives.complete('noc');
        game.world.removeCollider(lv.nocDoorC); lv.nocDoorC = null; lv.nocDoorLeaf.position.x += 1.9; lv.nocLed.material.color.setHex(0x40ff70); game.audio.click(0.4, 600, 0.1);
        for (const t2 of techs) t2.moveTo(V(14, 0, -38 + rand(-2, 2)), { run: true });
        await m.talk([['tech', '…고마워요. 당신 누구예요?', { priority: 3 }], ['daniel', '지나가던 사람. 서쪽 문으로 뛰어. 뒤돌아보지 말고.', { priority: 3 }]]);
        lv.techsOut = true;
      } else {
        await m.say('daniel', '(유리 너머의 얼굴을 외면하며) …미안합니다.', { priority: 3 });
        if (lv.nadia) await m.say('nadia', '…', { priority: 2, duration: 1.2 });
      }
      game.objectives.add('out', '서쪽 문으로 — 가스가 방출되기 전에', { marker: CH.westDoor.clone().add(V(-4, 2, 0)) });
      // two of the response team are still at the roll-up door: they cover the exit
      const rear = [pmc(game, 62, -11, { visionRange: 60 }), pmc(game, 66, -12, { visionRange: 60 })]; attackOrder(game, rear, p);
      // gas: white fog, then it hurts; outside is safe
      m.every((dt) => {
        if (left > 0) return;
        lv.gas = Math.min(1, lv.gas + dt * 0.35);
        if (Math.random() < dt * 20) game.effects.smoke.spawn({ x: rand(24, 78), y: 9, z: rand(-58, -22), vx: 0, vy: -2.5, vz: 0, size: 2, endSize: 7, life: 3, alpha: 0.4, r: 0.92, g: 0.94, b: 0.95, drag: 0.4 });
        if (lv.inHall(p.position) && Math.random() < dt * 3) p.takeDamage(9 + lv.gas * 9, null, null, { kind: 'mission', label: '소화 가스' });
        if (lv.gas >= 1 && !lv.inHall(p.position)) return false;
      });
      if (lv.nadia) lv.nadia.follow(p);
      await m.until(() => p.position.x < CH.hall.x0 - 3, 300);
      game.objectives.complete('out');
      if (pick === 'leave') { for (const t2 of techs) t2.moveTo(V(t2.position.x, 0, N.z0 + 1)); }
      for (const e of rear) if (!e.dead) game.director.remove(e);
      if (left > 0) await m.until(() => left <= 0, 45);
      lv.setAlarm(false); lv.gas = 1;
      await m.say('pa', '가스 방출. 홀 B 출입 금지.', { priority: 2 });
    },
  },

  // ============ 6. THE YARD ============
  {
    id: 'yard',
    async setup(game) { daniel(game); const lv = game.level; lv.setArea('ext'); lv.gas = 1; game.player.teleport(V(14, 0, -38), facing(-1, 0)); if (!nadiaSplits()) nadiaAt(game, V(13, 0, -36)); },
    async run(game, m) {
      const lv = game.level, p = game.player;
      game.audio.startWind(0.16); game.audio.setMusic('combat');
      const nadia = nadiaAt(game, nadiaSplits() ? V(-18, 0, -28) : V(13, 0, -36)); nadia.setPassive(false); nadia.follow(p);
      if (nadiaSplits()) await m.say('nadia', '(보안실 문을 걷어차고 나오며) 늦었어, 보스. 정문으로 트럭이 들어온다.', { priority: 3 });
      if (lv.techsOut) { const ts = (lv.techs || []).filter((t) => !t.removed); ts.forEach((t, i) => t.moveTo(V(-30 + i * 2, 0, -50), { run: true })); }
      await m.talk([
        ['maya', '할로런이 2분 거리야. 헬기장으로 가. 착륙은 한 번밖에 못 한대.', { radio: true, priority: 3 }],
        ['halloran', '여기는 가닛. 바람이 초속 25미터야. 내려앉을 땐 한 번이고, 두 번째는 없어. 헬기장 비워 둬.', { radio: true, priority: 3 }],
      ]);
      // the response convoy: a gun truck through the gate, a transport that drops a team at the parking lot
      lv.barrier.rotation.z = 1.4;
      const tech = new EnemyVehicle(game, { path: [V(40, 0, -300), V(40, 0, -150), V(38, 0, -110), V(24, 0, -82), V(12, 0, -66)], speed: 10, hp: 650, fireRange: 80 });
      const truck = buildTruck({ model: true }); truck.position.set(40, 0, -230); truck.rotation.y = 0; game.renderer.scene.add(truck); truck.userData.dynamic = true;
      let tz = -230; const team = [];
      m.every((dt) => { if (tz >= -96) return false; tz = Math.min(-96, tz + dt * 11); truck.position.set(40, lv.hf(40, tz), tz); });
      m.spawn(async () => {
        await m.until(() => tz >= -96, 60);
        const drop = [[36, -92], [38, -94], [42, -93], [44, -95], [40, -97], [34, -95]].slice(0, gravesHere() ? 6 : 5);
        for (const [x, z] of drop) team.push(pmc(game, x, z, { visionRange: 60, accuracy: 0.7 }));
        attackOrder(game, team, p);
        if (gravesHere()) await m.say('graves', '(무전) 헬기 소리 들린다. 헬기장 막아. 아무도 못 떠나.', { radio: true, priority: 3 });
      });
      const yardGuards = [pmc(game, -40, -70, { visionRange: 60 }), pmc(game, -6, -64, { visionRange: 60 }), pmc(game, 8, -24, { visionRange: 60 })]; attackOrder(game, yardGuards, p);
      game.objectives.add('pad', '헬기장으로 — 착륙 지점 확보', { marker: CH.pad.clone().setY(2) });
      let left = 75; events.emit('hud:timer', { label: '헬기 도착', seconds: left });
      m.every((dt) => { left -= dt; events.emit('hud:timer', { label: '헬기 도착', seconds: Math.max(0, left) }); if (left <= 0) { events.emit('hud:timer', null); return false; } });
      m.bind(() => events.emit('hud:timer', null));
      barks(game, m, { until: () => left <= 0 });
      m.spawn(async () => { await m.until(() => tech.dead, 400); if (tech.dead) await m.say('nadia', '기관총 트럭 정리!', { priority: 2 }); });
      m.spawn(async () => { await m.wait(12); if (!tech.dead) await m.say('maya', '트럭 기관총이 헬기장을 노리고 있어. 그거 처리 안 하면 할로런이 못 내려와.', { radio: true, priority: 2 }); });
      await m.until(() => left <= 0, 200);
      // the helicopter comes in low over the cliff
      const heli = buildHelicopter(); heli.position.set(-160, 40, 260); game.renderer.scene.add(heli); lv.heli = heli;
      const rotor = game.audio.rotorLoop?.(); rotor?.set(0.9); lv.rotor = rotor;
      m.every((dt) => { heli.userData.rotor?.rotateY?.(dt * 30); heli.userData.tail?.rotateX?.(dt * 40); rotor?.setPos?.(heli.position); if (heli.userData.beacon) heli.userData.beacon.visible = Math.sin(m.time * 8) > 0; });
      lv.padStrobe = true;
      const run = fly(game, m, heli, [V(-160, 40, 260), V(-90, 30, 130), V(-40, 16, 50), V(-27, 6, 18), V(-26, 1.6, 12)], { speed: 18 });
      await m.say('halloran', '헬기장 보인다. 들어간다— 붙잡을 것 하나 잡아.', { radio: true, priority: 3 });
      await m.until(() => run.done, 60);
      // whoever is still on the yard gets cut down by the door gun / gives up
      if (!tech.dead) tech.destroy();
      for (const e of [...team, ...yardGuards]) if (!e.dead) e.kill(V(-26, 2, 12));
      game.objectives.complete('pad');
      game.objectives.add('board', '헬기 탑승', { marker: heli.position.clone().add(V(0, 1, 0)) });
      await interact(game, { pos: () => heli.position.clone().setY(1.1), prompt: '헬기 탑승', radius: 3.2 });
      game.objectives.complete('board');
      truck.parent?.remove(truck);
    },
  },

  // ============ 7. THE COAST ROAD: door gun ============
  {
    id: 'exfil',
    async setup(game) { daniel(game); game.level.setArea('ext'); boardExfil(game); },
    async run(game, m) {
      boardExfil(game);
      const lv = game.level, p = game.player, heli = lv.heli;
      game.audio.setMusic('combat');
      await m.talk([
        ['halloran', '전원 탑승? 좋아, 뜬다. 도어건은 장식 아니야. 해안 도로에 불빛이 따라붙고 있어.', { radio: true, priority: 3 }],
        ['nadia', '(헬기 바닥에 등을 붙이며) 할로런, 이번 일 끝나면 마야한테 청구서 보내.', { priority: 2 }],
        ['halloran', '이미 보냈어. 두 장.', { radio: true, priority: 2 }],
      ]);
      // the trucks on the coast road: one chasing from the gate, two coming the other way from the village; Graves in the chase car
      const road = lv.coastRoad.map(([x, z]) => V(x, 0, z));
      const fromGate = road.slice(0); const fromWest = road.slice(5).reverse();
      const trucks = [];
      const T = (pts, speed, hp, name) => { const t = new EnemyVehicle(game, { path: pts, speed, hp, fireRange: 120 }); t.name = name; trucks.push(t); return t; };
      T(fromGate, 15, 700, 'chase');
      let graves = null; if (gravesHere()) m.spawn(async () => { await m.wait(4); graves = T(fromGate.slice(0), 15.5, 1100, 'graves'); });
      m.spawn(async () => { await m.wait(9); T(fromWest.slice(0, 12), 12, 650, 'west1'); await m.wait(6); T(fromWest.slice(0, 10), 12, 650, 'west2'); });
      // keep them on the ground (the path is only sampled at its points)
      m.every(() => { for (const t of trucks) if (!t.dead) t.position.y = lv.hf(t.position.x, t.position.z); });
      const path = [V(-26, 1.6, 12), V(-28, 14, 22), V(-70, 24, 60), V(-200, 28, 70), V(-360, 30, 66), V(-520, 32, 60), V(-610, 36, 85), V(-620, 52, 280)];
      // the door (right-hand side) stays on the coast road: the nearest truck, or the road abeam when none is in range
      const look = (q) => { let best = null, bd = 260; for (const t of trucks) { if (t.dead) continue; const d = Math.hypot(t.position.x - q.x, t.position.z - q.z); if (d < bd) { bd = d; best = t.position; } } return best || (q.z > 150 ? null : V(q.x - 25, 0, roadZ(q.x - 25))); };
      const run = fly(game, m, heli, path, { speed: 15, look });
      game.objectives.add('road', '도어건으로 추격 차량 저지');
      // the helicopter takes hits from trucks in range
      let hp = 1;
      m.every((dt) => {
        if (run.done) { events.emit('hud:escort', null); return false; }
        for (const t of trucks) if (!t.dead && t.position.distanceTo(heli.position) < 120) hp -= dt * 0.011 * (t.name === 'graves' ? 1.6 : 1);
        events.emit('hud:escort', { name: '기체 상태', frac: hp });
        if (hp <= 0 && !lv.heliLost) { lv.heliLost = true; p.godMode = false; game.failMission('헬기가 추락했습니다', '도어건으로 추격 차량을 먼저 저지하라'); return false; }
      });
      m.bind(() => events.emit('hud:escort', null));
      m.spawn(async () => { await m.wait(5); await m.say('halloran', '왼쪽 아래 도로! 트럭 기관총!', { radio: true, priority: 3 }); });
      if (gravesHere()) m.spawn(async () => {
        await m.wait(14); if (!graves) return; await m.say('graves', '(무전) 보스, 바다로 나가 봤자야. 그 파일은 우리가 어디서든 찾아.', { radio: true, priority: 3 });
        await m.until(() => graves.dead || run.done, 200);
        if (graves.dead) { saves.setFlag('m08_graves', 'down'); await m.say('halloran', '선두 차량 전복— 도로 밖으로 굴렀어!', { radio: true, priority: 3 }); }
      });
      m.spawn(async () => { for (let i = 0; i < 3; i++) { await m.wait(rand(10, 16)); if (run.done) return; const from = V(heli.position.x + rand(-40, 40), lv.hf(heli.position.x, heli.position.z - 60) + 1, heli.position.z - 70); const near = heli.position.clone().add(V(rand(-6, 6), rand(-2, 3), rand(-6, 6))); game.effects.tracer(from, near, 90); game.audio.whiz?.(near); p.addShake?.(0.12); } });
      let barkT = 6;
      m.every((dt) => { if (run.done) return false; barkT -= dt; if (barkT > 0) return; barkT = 8 + Math.random() * 6; const L = [['halloran', '흔들린다, 꽉 잡아!'], ['nadia', '트럭 하나 더!'], ['halloran', '고도 낮춘다— 바람이 날 밀어!'], ['nadia', '맞았어! 계속 쏴!']]; const l = L[Math.floor(Math.random() * L.length)]; game.dialogue.bark(l[0], l[1]); });
      await m.until(() => run.done, 260);
      for (const t of trucks) if (!t.dead) { t.remove(); t.dead = true; }
      if (gravesHere() && flag('m08_graves') !== 'down') saves.setFlag('m08_graves', 'escaped');
      game.objectives.complete('road');
    },
  },

  // ============ 8. 04:21 ============
  {
    id: 'echo',
    async setup(game) { const lv = game.level; lv.setArea('ext'); if (!lv.heli) { const heli = buildHelicopter(); heli.position.set(-760, 60, 320); game.renderer.scene.add(heli); lv.heli = heli; } },
    async run(game, m) {
      const lv = game.level, p = game.player, heli = lv.heli;
      game.audio.setMusic('cinematic');
      game.cine.letterbox(true);
      // out over the sea, the coast falling behind in the rain
      lv.noHazard = true; boardExfil(game);
      const gun = lv.doorGun; if (!gun.manned) { gun.enabled = true; gun.mount(); game.ui.hint('', 0.01); } gun.locked = true;
      m.every(() => { gun.fireT = 1e9; });   // the gun is quiet now: just the view out of the door
      m.every((dt) => { heli.position.add(V(-dt * 6, Math.sin(m.time) * dt * 0.3, dt * 18)); heli.rotation.z = Math.sin(m.time * 0.9) * 0.04; });
      await m.talk([
        ['maya', '(무전) 원본 메타데이터를 다시 보고 있어. 센서 로그 원본 타임스탬프… 04시 21분 07초.', { radio: true, priority: 3 }],
        ['maya', '그 시각에 그 철책 앞에 누가 있었을까.', { radio: true, priority: 3 }],
      ]);
      // ---- cut: the fence line in Gangwon-do, nine days ago ----
      events.emit('ui:fade', { to: 1, dur: 1.2 }); await m.wait(1.4);
      gun.dismount(V(1100, 0, 9)); lv.setArea('flash'); lv.fbFire = undefined; game.weapons.hidden = true; events.emit('hud:mounted', null);
      const u = game.renderer.grade?.uniforms; if (u) u.tint.value.set(0.82, 0.9, 1.08); game.renderer.fx.desat = 0.35;
      game.audio.stopWind?.(); game.audio.startWind(0.05);
      const cam = game.renderer.camera;
      const rail = game.cine.rail([V(1028, 1.7, 9), V(1060, 1.5, 7.5), V(1095, 1.6, 6.5), V(1126, 1.8, 7), V(1160, 2.2, 9)], 24, { lookPoints: [V(1040, 1.2, 0), V(1072, 1.2, 0), V(1104, 1.2, 0), V(1136, 1.4, 0), V(1170, 1.6, -2)] });
      events.emit('ui:fade', { to: 0, dur: 1.6 });
      game.cine.title('04:21', '2029. 03. 14  KST\n강원도 중부전선 · GOP 3소초 3구역', 6);
      await m.wait(5.5);
      lv.sensorFire(); game.audio.click(0.25, 1800, 0.04); setTimeout(() => game.audio.click(0.25, 1800, 0.04), 200); setTimeout(() => game.audio.click(0.25, 1800, 0.04), 400);
      await m.wait(1.2);
      await m.talk([
        ['duty', '지휘통제실, 3소초 상황실입니다. 3구역 감지 센서 다섯 개가 한꺼번에 떴습니다.', { radio: true, priority: 3 }],
        ['tac', '또 3구역이야? 영상은.', { radio: true, priority: 3 }],
        ['duty', '…아무것도 안 보입니다. 눈만 옵니다.', { radio: true, priority: 3 }],
        ['tac', '로그 남겨 두고, 날 밝기 전에 순찰조 보내서 센서 점검해.', { radio: true, priority: 3 }],
        ['duty', '알겠습니다. 윤태호 중사님 조로 올리겠습니다.', { radio: true, priority: 3 }],
      ]);
      await rail;
      game.cine.release();
      events.emit('ui:fade', { to: 1, dur: 1.4 }); await m.wait(1.6);
      // ---- back in the helicopter ----
      if (u) u.tint.value.set(1, 1, 1); game.renderer.fx.desat = 0;
      lv.setArea('ext'); game.audio.startWind(0.16);
      gun.mount(); gun.locked = true; game.ui.hint('', 0.01);
      events.emit('ui:fade', { to: 0, dur: 1.4 });
      await m.talk([
        ['daniel', '…그 순찰조는 자기들이 뭘 확인하러 나가는지 몰랐겠지.', { priority: 3 }],
        ['maya', '이제는 알 거야. 31분 늦게.', { radio: true, priority: 3 }],
        ['nadia', '그러니까 기록해. 늦은 것까지 전부.', { priority: 3 }],
        ['daniel', '그래. 이번엔 전부.', { priority: 3, duration: 4 }],
      ]);
      await m.wait(2.5);
    },
  },
];
