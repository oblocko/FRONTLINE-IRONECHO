// MISSION 05 — OFF THE GRID (오프 더 그리드)
// POV: Daniel Voss. 2029-03-16 22:15 CET, Paris, light rain. Every name here is fictional.
//
// From this mission on the player's decisions change how the mission plays AND which decisions come
// next. Every pick is stored as a story flag (saves.storyFlags) for later missions and checkpoint
// restarts, and listed on the debrief.
//
//   ① who is the tail (shop-window reflection)  m05_tail_id   right / wrong
//        wrong → the tail knows he's made: the metro search starts hotter / he walks into the alley gun-first
//   ② how to shake him                         m05_route     metro / alley
//        metro → crowd stealth on the platform, catch the train          → m05_metro   clean / spotted
//        alley → ambush behind the dumpster, take him down (or shoot)     → m05_tail    released / tied / killed
//   ③ how to get into the archive              m05_entry     vent / code / front / power  (offered options depend on ①②)
//        vent  → quiet entry into the storage room (only if the metro escape was clean)
//        code  → his door code: walk in the front unannounced (only if he was taken alive)
//        front → force the door: the guards are waiting
//        power → cut the building's power: everyone is half blind, emergency lights only
//   ④ the drive                                 m05_drive     upload / carry / deal (deal only if the tail was released)
//        upload → hold the vault for the upload, leave lighter
//        carry  → grab it and run with them on your heels
//        deal   → hear Brennan out → ⑤ m05_cole: refuse / stall (stall lets Maya trace his phone)
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { setEnemyMix } from '../ai/CharacterLib.js';
import { ParisCity, PARIS } from '../world/levels/ParisCity.js';
import { events } from '../core/Events.js';
import { saves } from '../core/SaveSystem.js';
import { keyName } from '../player/Player.js';
import { setSleeveLook } from '../player/WeaponModels.js';
import { V, spawnEnemies, attackOrder, interact, choose, flag } from './common.js';

export const TEXTURES = ['concrete', 'asphalt', 'metal', 'paintedMetal', 'wood', 'fabric', 'plaster'];
export const PROPS = ['wooden_crate_01', 'wooden_crate_02', 'metal_trash_can', 'utility_box_01', 'utility_box_02', 'Barrel_01'];
const P = PARIS;
const rand = (a, b) => a + Math.random() * (b - a);
const k = (game, a) => `<kbd>${keyName(game.input.binding(a))}</kbd>`;

// the epilogue reads what the player chose
export function EPILOGUE() {
  const f = saves.data.storyFlags; const out = [];
  out.push('GLASSWATER 작전의 원본 비행 기록은 회수된 화물의 최종 하역지를 "본국 시설"이 아니라 인도 뭄바이의 민간 항만으로 적고 있었다.');
  if (f.m05_drive === 'upload') out.push('기록은 마야의 서버로 넘어갔다. 원본 드라이브는 더 이상 유일한 증거가 아니다 — 대신 누군가 그 서버를 찾기 시작할 것이다.');
  else out.push('드라이브는 다니엘의 주머니에 있다. 사본은 없다. 잃어버리면 끝이다.');
  if (f.m05_tail === 'released') out.push('풀려난 추적팀원은 콜 브레넌에게 다니엘의 말을 그대로 전했다.');
  if (f.m05_tail === 'tied') out.push('추적팀의 무전기는 아직 다니엘에게 있다. 그들의 채널은 바뀌지 않았다.');
  if (f.m05_cole === 'stall') out.push('마야는 브레넌의 전화가 마지막으로 잡힌 기지국을 기록해 두었다.');
  if (f.m05_metro === 'spotted' || f.m05_entry === 'front') out.push('파리 경찰은 그날 밤의 총격을 "조직 간 분쟁"으로 분류했다. 다니엘의 얼굴은 어느 기록에도 남지 않았다.');
  return out.join(' ');
}

// ---------------------------------------------------------------------------------------------
// helpers
function daniel(game, { rifle = false } = {}) {
  setSleeveLook('jacket');
  const w = game.weapons; w.clear(); w.setSuppressed(true);
  if (rifle || flag('m05_hasRifle')) w.give('carbine', { mag: 30, reserve: 60 });
  w.give('pistol', { mag: 17, reserve: 51 }); w.grenades = 0; w.equip(rifle || flag('m05_hasRifle') ? 'carbine' : 'pistol', true); w.emitAmmo();
}
function giveRifle(game) { if (game.weapons.inventory.carbine) return false; game.weapons.give('carbine', { mag: 30, reserve: 60 }); game.weapons.equip('carbine'); saves.setFlag('m05_hasRifle', true); game.ui.hint(`<b>M4A1 카빈 획득</b> — ${k(game, 'weapon1')} 카빈 · ${k(game, 'weapon2')} 소음 권총`, 4); return true; }
function spawnPmc(game, x, z, extra = {}) { return game.director.spawn({ team: 'enemy', faction: 'pmc', hat: 'headset', pos: V(x, 0, z), accuracy: 0.85, state: 'idle', ...extra }); }
function umbrella(a, color) {
  const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide });
  const can = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.28, 8, 1, true), m); can.position.y = 2.05; g.add(can);
  const st = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 4), new THREE.MeshStandardMaterial({ color: 0x222222 })); st.position.set(0, 1.6, 0); g.add(st);
  g.position.set(0.12, 0, 0.05); a.actor.root.add(g);
}
// pedestrians walking up and down the pavements (civilians, not involved)
function pedestrians(game, m, n = 12) {
  const d = game.director; const list = [];
  const cols = [0x1a1a1a, 0x6a1c1c, 0x1c2a4a, 0x2a4a2a, 0x8a7a5a];
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1; const x = side * rand(7.2, 9.2); const z = rand(-100, 110);
    const a = d.spawn({ team: 'civilian', faction: 'civ', hat: 'none', weapon: false, passive: true, invulnerable: true, name: '행인', pos: V(x, 0, z) });
    if (Math.random() < 0.7) umbrella(a, cols[i % cols.length]);
    list.push(a);
    const walk = async () => { let dir = Math.random() < 0.5 ? 1 : -1; for (;;) { const tz = dir > 0 ? rand(60, 115) : rand(-110, -30); a.moveTo(V(x + rand(-0.4, 0.4), 0, tz)); await m.until(() => a.dead || Math.abs(a.position.z - tz) < 1.5, 120); dir = -dir; await m.wait(rand(0, 3)); } };
    m.spawn(walk);
  }
  return list;
}
// Suspicion meter (as in M01): fills while a watcher can see the player — faster when close, moving fast,
// out in the open, with a light on; slower in a crowd. Returns a live state object.
function suspicion(game, m, { watchers, range = 22, crowd = null, label = '발각 위험', start = 0, dark = () => false }) {
  const p = game.player; const el = document.createElement('div'); el.className = 'stealth-meter';
  el.innerHTML = `<div class="lbl">${label}</div><div class="bar"><i></i></div><div class="st"></div>`; game.ui.hud.appendChild(el);
  const st = { meter: start, spotted: false, stop: () => { st.done = true; el.remove(); } }; m.bind(() => el.remove());
  const eye = new THREE.Vector3(), tp = new THREE.Vector3();
  m.every((dt) => {
    if (st.done) return false;
    if (p.firingRecently) st.meter = 1;
    let rate = 0; p.chestPos(tp);
    const inCrowd = crowd ? crowd().filter((c) => c.position.distanceTo(p.position) < 2.6).length >= 2 : false;
    const R = range * (dark() ? (p.flashOn ? 1.1 : 0.45) : 1);
    for (const e of watchers()) {
      if (e.dead || e.koed) continue; e.eyePos(eye); const d = eye.distanceTo(tp); if (d > R) continue;
      const fwd = V(Math.sin(e.yaw), 0, Math.cos(e.yaw)); const to = tp.clone().sub(eye); const cosA = (to.x * fwd.x + to.z * fwd.z) / Math.max(0.01, Math.hypot(to.x, to.z));
      if (cosA < 0.45 && d > 3) continue;
      if (!game.world.lineOfSight(eye, tp)) continue;
      rate += (1 - d / R) * (p.crouching ? 0.5 : 1) * (p.sprinting ? 2.2 : p.speed > 0.6 ? 1.3 : 1) * (d < 5 ? 2.2 : 1) * (inCrowd ? 0.2 : 1) * (p.flashOn ? 1.8 : 1) * 0.9;
    }
    st.meter = rate > 0 ? Math.min(1, st.meter + rate * dt) : Math.max(0, st.meter - dt * 0.2);
    el.querySelector('i').style.width = `${Math.round(st.meter * 100)}%`; el.classList.toggle('warn', st.meter > 0.35); el.classList.toggle('danger', st.meter > 0.75);
    el.querySelector('.st').textContent = rate > 0 ? (st.meter > 0.75 ? '발각 직전!' : inCrowd ? '군중 속 — 눈에 덜 띈다' : '누군가 이쪽을 보고 있다') : st.meter > 0.05 ? '의심이 가라앉는 중' : (inCrowd ? '군중 속' : '눈에 띄지 않음');
    if (st.meter >= 1) { st.spotted = true; st.stop(); }
  });
  return st;
}
// Non-lethal takedowns from behind on guards that have not spotted the player
function takedowns(game, m, guards, { canUse = () => true, onUse = null, radius = 1.7 } = {}) {
  const p = game.player;
  for (const g of guards) {
    const it = p.addInteractable({ pos: () => g.position.clone().add(V(0, 1, 0)), prompt: '뒤에서 제압', radius, onUse: () => {
      if (g.dead || g.koed) return; g.koed = true; g.setPassive(true); g.pose('wounded'); g.visionRange = 0.1; game.audio.click(0.4, 300, 0.12);
      game.stats.kills++; it.enabled = false; onUse?.(g);
    } });
    m.every(() => {
      if (g.dead || g.koed) { it.enabled = false; return false; }
      const fwd = V(Math.sin(g.yaw), 0, Math.cos(g.yaw)); const to = p.position.clone().sub(g.position).setY(0).normalize();
      it.enabled = canUse() && g.state !== 'combat' && fwd.dot(to) < -0.3;
    });
    m.bind(() => p.removeInteractable(it));
  }
}
function fade(game, m, mid) { return (async () => { events.emit('ui:fade', { to: 1, dur: 0.6 }); await m.wait(0.7); await mid(); events.emit('ui:fade', { to: 0, dur: 0.9 }); })(); }
function trackShots(game, m, onShot) { let last = null; m.every(() => { const s = game.weapons.lastShot; if (s && s !== last) { last = s; onShot(s); } }); }
// A downed contractor's carbine lies where it fell: walk up to it and pick it up (that exact gun leaves the
// ground and becomes the viewmodel). Magazines from the dead top up ammo automatically.
function ammoFromDead(game, m) {
  const d = game.director, p = game.player;
  m.every(() => {
    for (const a of d.agents) {
      if (a.team !== 'enemy' || !a.dead) continue;
      const gun = a.actor.droppedWeapon;
      if (gun && !a.gunOffered && gun.parent) {
        a.gunOffered = true;
        const it = p.addInteractable({ pos: () => gun.getWorldPosition(new THREE.Vector3()).add(V(0, 0.3, 0)), prompt: 'M4A1 카빈 줍기', radius: 1.8, onUse: () => {
          const had = !!game.weapons.inventory.carbine;
          gun.parent?.remove(gun); a.actor.droppedWeapon = null; it.enabled = false; p.removeInteractable(it);
          game.audio.click(0.3, 1500, 0.05);
          if (!giveRifle(game) && had) { const got = game.weapons.addAmmo('carbine', 30); game.ui.hint(`탄약 +${got}`, 1.5); }
        } });
        m.bind(() => p.removeInteractable(it));
      }
      if (a.ammoDrop === undefined) a.ammoDrop = true;
      if (a.ammoDrop && a.position.distanceTo(p.position) < 1.8) { a.ammoDrop = false; let got = game.weapons.addAmmo('pistol', 17); if (game.weapons.inventory.carbine) got += game.weapons.addAmmo('carbine', 30); if (got > 0) game.ui.hint(`탄약 +${got}`, 1.5); }
    }
  });
}

// ---------------------------------------------------------------------------------------------
export async function build(game) {
  setEnemyMix({ kpa: 1 });
  const lv = new ParisCity(game); game.level = lv; await lv.build();
  const d = game.director; d.visionRange = 40;
  game.squad = {}; game.squadList = [{ id: 'maya', rank: '', name: '마야 첸 (무전)', status: '' }];
  game.audio.startWind(0.05);
  ammoFromDead(game, game.mission);
}

export const SEGMENTS = [
  // ============ 0. RAIN, THE STREET, THE REFLECTION ============
  {
    id: 'street',
    async setup(game) {
      daniel(game); game.player.teleport(V(8.2, 0.14, 104), 0); game.audio.setMusic('ambient');
    },
    async run(game, m) {
      const lv = game.level, p = game.player, scene = game.renderer.scene;
      const crowd = pedestrians(game, m, 14);
      game.cine.title('OFF THE GRID', '2029. 03. 16  22:15 CET\n프랑스 파리 · 생-베렌 거리\n다니엘 보스', 7);
      await m.talk([
        ['maya', '…다니엘, 들려? 모든 화면에서 한국 얘기뿐이야. 개전 이틀째.', { radio: true }],
        ['daniel', '보관소는.'],
        ['maya', '두 블록 남쪽. 그런데 서두르지 마. 네가 역에서 나온 뒤로 같은 사람이 세 번 찍혔어. 확인해 봐 — 쇼윈도 유리를 거울처럼 써.', { radio: true }],
      ]);
      // ---- who is the tail? (observation, not a quiz) ----
      // Four people on the far pavement: a man waiting at the bus stop on his phone, a smoker at the café
      // terrace who glances over now and then, a woman with a red umbrella walking up and down, and the
      // tail — who keeps level with Daniel, stops a moment after he stops and moves when he moves. Daniel
      // can only watch them in the shop windows' reflections (turning round and staring burns him), and
      // points the tail out by holding his gaze on that person's reflection and pressing the interact key.
      const civ = (x, z, extra = {}) => game.director.spawn({ team: 'civilian', faction: 'civ', hat: 'none', weapon: false, passive: true, invulnerable: true, name: '행인', pos: V(x, 0, z), ...extra });
      const tail = game.director.spawn({ team: 'enemy', faction: 'pmc', hat: 'none', weapon: false, passive: true, name: '미행자', pos: V(-8.4, 0, 112), visionRange: 0.1 });
      const umbrellaWoman = civ(-7.6, 80); umbrella(umbrellaWoman, 0x9a1c1c);
      const phoneMan = civ(-8.9, 63); phoneMan.hold(V(-8.9, 0, 63)); phoneMan.lookAt(V(-13, 1.2, 63));
      const smoker = civ(-8.2, 71); smoker.hold(V(-8.2, 0, 71)); smoker.lookAt(V(-12, 1.6, 71));
      lv.tail = tail;
      // the tail keeps level with Daniel ~8 m behind on the other pavement; stops shortly after he stops
      let still = 0;
      m.every((dt) => {
        if (tail.dead || lv.tailFree) return false;
        still = p.speed < 0.4 ? still + dt : 0;
        const tz = p.position.z + 8;
        const level = Math.abs(tail.position.z - tz) < 3;   // he first catches up, then mirrors Daniel's stops
        if (level && (still > 0.7 || Math.abs(tail.position.z - tz) < 1.0)) { tail.path = null; tail.script = { kind: 'hold', pos: tail.position.clone() }; tail.lookAt(still > 2.5 && Math.sin(m.time * 0.7) > 0.6 ? p.position : V(-13, 1.4, tail.position.z)); }
        else if (tail.script?.kind !== 'move' || Math.abs(tail.script.pos.z - tz) > 2) tail.moveTo(V(-8.4, 0, tz), { run: Math.abs(tail.position.z - tz) > 9 });   // re-target only when Daniel has moved on
      });
      m.spawn(async () => { for (;;) { umbrellaWoman.moveTo(V(-7.6, 0, 40)); await m.until(() => umbrellaWoman.position.z < 41, 60); await m.wait(rand(1, 4)); umbrellaWoman.moveTo(V(-7.6, 0, 100)); await m.until(() => umbrellaWoman.position.z > 99, 60); } });
      m.spawn(async () => { for (;;) { await m.wait(rand(3, 7)); smoker.lookAt(p.position.clone()); await m.wait(rand(1, 2)); smoker.lookAt(V(-12, 1.6, 71)); } });   // a red herring: he looks over
      m.spawn(async () => { for (;;) { await m.wait(rand(6, 12)); phoneMan.hold(V(-8.9 + rand(-0.6, 0.6), 0, 63 + rand(-1.5, 1.5))); } });
      const suspects = [tail, phoneMan, smoker, umbrellaWoman];
      // two shop windows with live reflections
      const wins = lv.shopWindows.filter((w) => w.normal.x < 0).sort((a, b) => Math.abs(a.pos.z - 66) - Math.abs(b.pos.z - 66)).slice(0, 2);
      const mirrors = wins.map((win) => { const mr = new Reflector(new THREE.PlaneGeometry(win.w, 2.8), { clipBias: 0.003, textureWidth: 640, textureHeight: 420, color: 0x8a9496 });
        mr.position.copy(win.pos).addScaledVector(win.normal, 0.06); mr.rotation.y = Math.atan2(win.normal.x, win.normal.z); scene.add(mr); m.bind(() => scene.remove(mr)); return { mr, win }; });
      game.objectives.add('window', '쇼윈도에 비친 길 건너편에서 미행자 찾기', { markers: wins.map((w) => w.pos.clone().setY(2.2)) });
      await m.until(() => wins.some((w) => p.position.distanceTo(w.pos.clone().setY(p.position.y)) < 3.2), 240);
      game.weapons.lowered = true;
      await m.talk([
        ['maya', '유리에 비친 길 건너편을 봐. 돌아서서 쳐다보면 끝이야.', { radio: true, priority: 3 }],
        ['maya', '걸었다가 멈춰 봐. 너랑 같이 움직이고 같이 서는 사람이 있으면 그 사람이야.', { radio: true, priority: 3 }],
      ]);
      game.ui.hint(`유리에 비친 사람을 화면 가운데에 두고 잠시 지켜본 뒤 ${k(game, 'interact')} 로 지목`, 7);
      // focus HUD
      const fe = document.createElement('div'); fe.className = 'stealth-meter'; fe.innerHTML = '<div class="lbl">관찰</div><div class="bar"><i></i></div><div class="st"></div>'; game.ui.hud.appendChild(fe); m.bind(() => fe.remove());
      const cam = game.renderer.camera; const v = new THREE.Vector3(), ndc = new THREE.Vector3();
      let watched = null, watchT = 0, stare = 0, verdict = null; const t0 = m.time;
      const auto = game.autoChoices?.m05_tail_id;
      if (auto) verdict = auto === 'right' ? 'right' : 'wrong';
      m.every((dt) => {
        if (verdict) return false;
        // whose reflection is in the middle of the view?
        let best = null, bestD = 0.09;
        cam.updateMatrixWorld(); const C = cam.getWorldPosition(new THREE.Vector3());
        for (const { win } of mirrors) {
          const n = win.normal, W = win.pos;
          if (C.clone().sub(W).dot(n) <= 0) continue;
          for (const s of suspects) {
            const P = s.position.clone().add(V(0, 1.45, 0)); const P2 = P.clone().addScaledVector(n, -2 * P.clone().sub(W).dot(n));   // mirror image
            const dir = P2.clone().sub(C); const t = W.clone().sub(C).dot(n) / dir.dot(n); if (!(t > 0 && t < 1)) continue;
            const hit = C.clone().addScaledVector(dir, t); if (Math.abs(hit.z - W.z) > win.w / 2 || Math.abs(hit.y - 1.6) > 1.4) continue;
            ndc.copy(P2).project(cam); const d = Math.hypot(ndc.x, ndc.y); if (ndc.z < 1 && d < bestD) { bestD = d; best = s; }
          }
        }
        // staring straight at someone across the street gets Daniel made
        const f = new THREE.Vector3(); cam.getWorldDirection(f);
        const direct = suspects.find((s) => { const to = s.position.clone().add(V(0, 1.5, 0)).sub(C); const dd = to.length(); return dd < 30 && to.normalize().dot(f) > 0.99 && game.world.lineOfSight(C, s.position.clone().add(V(0, 1.5, 0))); });
        stare = direct ? stare + dt : Math.max(0, stare - dt * 0.5);
        if (stare > 1.3) { verdict = 'burned'; return false; }
        if (best !== watched) { watched = best; watchT = 0; } else if (best) watchT += dt;
        const k2 = Math.min(1, watchT / 1.2); fe.querySelector('i').style.width = `${Math.round(k2 * 100)}%`;
        fe.classList.toggle('danger', stare > 0.5);
        fe.querySelector('.st').textContent = stare > 0.5 ? '너무 대놓고 보고 있다!' : !best ? '유리에 비친 사람을 가운데에 두고 지켜본다' : k2 < 1 ? '지켜보는 중…' : '지목할 수 있다';
        if (best && k2 >= 1 && game.input.pressed('interact')) { verdict = best === tail ? 'right' : 'wrong'; return false; }
        if (m.time - t0 > 90) { verdict = 'timeout'; return false; }
      });
      m.spawn(async () => { await m.wait(45); if (!verdict) await m.say('maya', '…다니엘, 오래 서 있으면 그쪽도 이상하게 생각해.', { radio: true, priority: 2 }); });
      await m.until(() => verdict, 1e9);
      fe.remove();
      const right = verdict === 'right'; saves.setFlag('m05_tail_id', right ? 'right' : 'wrong');
      (game.choiceLog ||= []).push({ flag: 'm05_tail_id', key: right ? 'right' : 'wrong', text: right ? '미행자를 반사로 정확히 지목' : verdict === 'burned' ? '돌아서서 쳐다보다 미행자에게 들킴' : verdict === 'timeout' ? '미행자를 가려내지 못함' : '엉뚱한 사람을 지목 — 진짜 미행자가 눈치챔' });
      if (right) await m.talk([['daniel', '맞은편 그 남자. 내가 서면 서고, 걸으면 걷는다.', { priority: 3 }], ['maya', '…맞아. 역에서 찍힌 사람이랑 같아.', { radio: true, priority: 3 }]]);
      else if (verdict === 'burned') await m.talk([['maya', '돌아보지 말랬잖아! …너랑 같이 움직이던 남자가 방금 눈을 피했어. 이제 알아.', { radio: true, priority: 3 }]]);
      else if (verdict === 'timeout') await m.talk([['maya', '못 찾겠으면 움직여. …너랑 같이 서 있던 남자, 눈치챈 것 같아.', { radio: true, priority: 3 }]]);
      else await m.talk([['daniel', '저 사람이다.', { priority: 3 }], ['maya', '아니야 — 그 사람은 아까부터 그 자리였어. 진짜는 너랑 같이 움직이던 남자야. 네가 두리번거리는 걸 그쪽이 봤어.', { radio: true, priority: 3 }]]);
      game.weapons.lowered = false; for (const { mr } of mirrors) scene.remove(mr);
      game.objectives.complete('window');
      await m.say('maya', '어떻게 떼어 낼 거야? 메트로 입구가 광장에 있고, 왼쪽 건너편엔 안뜰로 이어지는 통로가 있어.', { radio: true, priority: 3 });
      const route = await choose(game, m, { flag: 'm05_route', tag: '결정 // 미행 따돌리기', timeout: 30, fallback: 0,
        options: [{ key: 'metro', text: '메트로 군중 속으로 사라진다', note: '은밀 — 들키지 않고 열차에 타면 보관소에 조용히 접근할 수 있다' },
          { key: 'alley', text: '통로로 유인해 제압한다', note: '근접 — 살려서 잡으면 정보를 얻는다. 대신 추적팀이 몰려온다' }] });
      lv.route = route; lv.crowd = crowd;
    },
  },

  // ============ 1. SHAKING THE TAIL (branch) ============
  {
    id: 'shake',
    async setup(game) {
      daniel(game); const lv = game.level;
      if (!lv.tail) { lv.tail = game.director.spawn({ team: 'enemy', faction: 'pmc', hat: 'none', weapon: false, passive: true, name: '미행자', pos: V(-8.4, 0, 75), visionRange: 0.1 }); lv.crowd = pedestrians(game, game.mission, 10); }
      game.player.teleport(V(8.4, 0.14, 66), Math.PI);
    },
    async run(game, m) { if (flag('m05_route') === 'alley') await alleyRoute(game, m); else await metroRoute(game, m); },
  },

  // ============ 2. THE COURTYARD: HOW TO GET IN ============
  {
    id: 'approach',
    async setup(game) { daniel(game); game.level.setUnderground(0); game.player.teleport(V(-77, 0, -26), 0); },
    async run(game, m) {
      const lv = game.level, p = game.player;
      if (p.position.z < 4) { game.objectives.add('court', '보관소 안뜰로 이동', { marker: V(-76, 1.5, 12) }); await m.reach(V(-76, 0, 12), 6, { yTol: 4 }); game.objectives.complete('court'); }
      const route = flag('m05_route'), metro = flag('m05_metro'), tail = flag('m05_tail');
      await m.talk([
        ['maya', '저 강철문이야. "기록물 보관 — 출입 제한". 지하 채석장 터널을 개조한 창고고, 경비는 Halvard 계약 업체야. 너희 옛 사람들.', { radio: true, priority: 3 }],
        ...(metro === 'clean' ? [['maya', '아무도 네가 여기 온 걸 몰라. 안뜰 바닥에 환기구가 있어 — 창고로 바로 떨어져.', { radio: true, priority: 3 }]] : []),
        ...(tail === 'released' || tail === 'tied' ? [['daniel', '코드는 4-1-7-7. 아까 그 친구가 친절하게 알려줬다.', { priority: 3 }]] : []),
        ...(metro === 'spotted' || tail === 'killed' ? [['maya', '경비가 무전으로 너를 찾고 있어. 정문 쪽은 이미 대비하고 있을 거야.', { radio: true, priority: 3 }]] : []),
        ['maya', '건물 배전함은 안뜰 동쪽 벽에 있어. 전원을 내리면 안은 비상등만 남아.', { radio: true, priority: 3 }],
      ]);
      const opts = [];
      if (metro === 'clean') opts.push({ key: 'vent', text: '환기구로 조용히 잠입', note: '창고로 바로 진입 · 경비는 아직 아무것도 모른다' });
      if (tail === 'released' || tail === 'tied') opts.push({ key: 'code', text: '빼앗은 출입 코드로 정문 진입', note: '문이 조용히 열린다 · 경비실을 지나가야 한다' });
      if (!opts.length) opts.push({ key: 'front', text: '정문을 강제로 연다', note: '경비가 기다리고 있다 · 정면 교전' });
      opts.push({ key: 'power', text: '전원을 내리고 어둠 속으로', note: '모두 반쯤 눈이 먼다 · 손전등은 들킨다 · 대신 경비가 수색을 시작한다' });
      const entry = await choose(game, m, { flag: 'm05_entry', tag: '결정 // 보관소 진입', timeout: 30, fallback: 0, options: opts });
      if (entry === 'power') {
        game.objectives.add('power', '배전함 차단', { marker: P.junction.clone().setY(1.5) });
        await interact(game, { pos: P.junction.clone().setY(1.2), prompt: '배전함 차단', hold: 2.0, radius: 2.0 });
        game.objectives.complete('power'); game.audio.click(0.6, 200, 0.3); lv.setArchiveDark(true); lv.keypad.material.emissiveIntensity = 0;
        await m.say('maya', '전원 차단. 문 잠금도 같이 풀렸어. 안은 칠흑이야 — 손전등은 아껴 써.', { radio: true, priority: 3 });
      }
      const door = entry === 'vent' ? P.vent : P.archiveDoor;
      game.objectives.add('enter', entry === 'vent' ? '환기구로 진입' : '보관소 문으로 진입', { marker: door.clone().setY(1.4) });
      await interact(game, { pos: door.clone().setY(entry === 'vent' ? 0.6 : 1.2), prompt: entry === 'vent' ? '환기구 덮개 열고 내려가기' : entry === 'code' ? '출입 코드 입력 (4-1-7-7)' : entry === 'front' ? '문 강제 개방' : '문 열기', hold: entry === 'front' ? 2.5 : 1.0, radius: 2.0 });
      game.objectives.complete('enter');
    },
  },

  // ============ 3. THE ARCHIVE ============
  {
    id: 'archive',
    async setup(game) { daniel(game); },
    async run(game, m) {
      const lv = game.level, p = game.player, A = P.a;
      const entry = flag('m05_entry', 'front'), tail = flag('m05_tail'), metro = flag('m05_metro');
      const dark = entry === 'power'; lv.setArchiveDark(dark);
      await fade(game, m, async () => { lv.setUnderground('archive'); p.teleport(entry === 'vent' ? A.vent.clone() : A.front.clone().add(V(0, 0, 1)), entry === 'vent' ? Math.PI : Math.PI); });
      if (dark) game.ui.hint(`${k(game, 'flashlight')} 손전등 — 켜면 경비 눈에 훨씬 잘 띈다`, 5);
      const alerted = entry === 'front' || (dark && metro === 'spotted');
      // garrison: guard room, tunnel patrol, storage, hall patrols, vault
      const G = [];
      const add = (x, z, extra = {}) => { const e = spawnPmc(game, x, z, { visionRange: alerted ? 40 : 0.1, ...extra }); if (!alerted) e.setPassive(true); G.push(e); return e; };
      if (entry !== 'code') { add(316, 74, { yaw: Math.PI }); add(305, 80, { yaw: 0.5 }); } else { const g1 = add(318, 82, { yaw: 0 }); g1.patrol = [V(318, 0, 82), V(306, 0, 82)]; }
      const pt = add(312, 90); pt.patrol = [V(312, 0, 90), V(312, 0, 116)];
      add(357, 101, { yaw: -Math.PI / 2 });
      const h1 = add(314, 136); h1.patrol = [V(314, 0, 136), V(340, 0, 137), V(340, 0, 129), V(314, 0, 129)];
      const h2 = add(327, 144); h2.patrol = [V(327, 0, 144), V(345, 0, 145), V(345, 0, 125)];
      add(348, 141, { yaw: -Math.PI / 2 }); add(346, 150, { yaw: -Math.PI / 2 });
      if (alerted) add(306, 140);
      lv.guards = G;
      // tied tail: his radio marks the guards for us
      if (tail === 'tied') {
        game.ui.hint('<b>추적팀 무전 감청</b> — 경비 위치가 표시된다', 4);
        game.objectives.add('intel', '감청 중 — 경비 위치', { markers: G.map((e) => e.position.clone().setY(2)) });
        m.every(() => { const live = G.filter((e) => !e.dead && !e.koed); if (!live.length) { game.objectives.complete('intel'); return false; } game.objectives.setMarkers('intel', live.map((e) => e.position.clone().setY(2.1))); });
      }
      const goAll = () => { for (const e of G) if (!e.dead && !e.koed) { e.setPassive(false); e.visionRange = dark ? 14 : 40; } attackOrder(game, G.filter((e) => !e.dead && !e.koed), p); lv.alarm = true; };
      let st = { spotted: alerted };
      if (!alerted) {
        st = suspicion(game, m, { watchers: () => G, range: 20, dark: () => dark, label: dark ? '발각 위험 · 정전' : '발각 위험' });
        takedowns(game, m, G, { canUse: () => !st.spotted });
        trackShots(game, m, (s) => { if (!s.suppressed) { st.meter = 1; return; } for (const e of G) if (!e.dead && !e.koed && e.position.distanceTo(p.position) < 8) st.meter = Math.min(1, (st.meter || 0) + 0.45); });
        m.bind(events.on('ai:death', ({ agent }) => { if (G.includes(agent)) for (const e of G) if (!e.dead && !e.koed && e !== agent && e.position.distanceTo(agent.position) < 9 && game.world.lineOfSight(e.eyePos(V(0, 0, 0)), agent.position.clone().add(V(0, 0.5, 0)))) st.meter = Math.min(1, (st.meter || 0) + 0.6); }));
        m.spawn(async () => { await m.until(() => st.spotted, 1e9); game.objectives.fail?.('quiet'); await m.say('guard', '접촉! 침입자다 — 아래층!', { priority: 3 }); goAll(); game.audio.setMusic('combat'); });
        game.objectives.add('quiet', '들키지 말 것 (선택)', { optional: true });
      } else { goAll(); game.audio.setMusic('combat'); await m.say('guard', '문이 열렸다! 놈이다!', { priority: 3 }); }
      if (!alerted) game.audio.setMusic('tension');
      await m.say('maya', '금고 케이지는 큰 홀 북동쪽 끝이야. 서버 랙 옆.', { radio: true, priority: 2 });
      game.objectives.add('vault', '보관 홀의 금고 케이지로', { marker: A.vault.clone().setY(1.6) });
      await m.reach(A.vault, 3.2);
      game.objectives.complete('vault'); if (!st.spotted) game.objectives.complete('quiet');
      game.objectives.add('safe', '금고에서 드라이브 회수', { marker: V(360.3, 1.2, 147) });
      await interact(game, { pos: V(360.2, 1.0, 147), prompt: '금고 열기', hold: 3.5, radius: 1.8 });
      game.objectives.complete('safe');
      lv.vaultScreen.material.emissive.setHex(0xd8a030);
      await m.talk([
        ['daniel', '…GLASSWATER. 2024년 7월. 비행 기록 원본이다.', { priority: 3 }],
        ['maya', '찾았다… 다니엘, 네트워크 포트가 살아 있으면 지금 나한테 올려 — 아니면 그냥 들고 뛰어.', { radio: true, priority: 3 }],
      ]);
      if (st.spotted === false && !lv.alarm) { st.stop?.(); }
    },
  },

  // ============ 4. THE DRIVE (choice) + EXFIL ============
  {
    id: 'drive',
    async setup(game) {
      daniel(game); const lv = game.level; lv.setArchiveDark(flag('m05_entry') === 'power'); lv.setUnderground('archive');
      game.player.teleport(V(357, 0, 147.5), Math.PI / 2);
    },
    async run(game, m) {
      const lv = game.level, p = game.player, A = P.a; const tail = flag('m05_tail');
      const dark = flag('m05_entry') === 'power';
      // the response team arrives either way
      game.audio.setMusic('combat');
      const opts = [{ key: 'upload', text: '지금 마야에게 업로드 — 케이지에서 버틴다', note: '사본이 남는다 · 업로드가 끝날 때까지 이곳을 지켜야 한다' },
        { key: 'carry', text: '드라이브만 들고 즉시 탈출', note: '바로 움직인다 · 대신 추격이 붙는다 · 사본은 없다' }];
      if (tail === 'released') opts.push({ key: 'deal', text: '울리는 무전기 — 브레넌의 말을 듣는다', note: '풀어준 그 친구가 말을 전했다' });
      const drive = await choose(game, m, { flag: 'm05_drive', tag: '결정 // 드라이브', timeout: 25, fallback: 1, options: opts });
      let holdFire = 0;
      if (drive === 'deal') {
        await m.talk([
          ['cole', '다니엘. 오랜만이다. 우리 애를 돌려보내 줘서 고맙다… 그래서 한 번만 말하겠다.', { radio: true, priority: 3 }],
          ['cole', '드라이브 내려놓고 사다리로 나가라. 아무도 안 쏜다. 5년 전처럼 그냥 사라져.', { radio: true, priority: 3 }],
          ['daniel', '5년 전에 내가 뭘 옮겼는지, 넌 알았냐, 콜.', { radio: true, priority: 3 }],
          ['cole', '…넌 그 답을 원하지 않을 거다.', { radio: true, priority: 3 }],
        ]);
        const cole = await choose(game, m, { flag: 'm05_cole', tag: '결정 // 브레넌', timeout: 20, fallback: 0,
          options: [{ key: 'refuse', text: '"내가 직접 확인하지."  — 거절하고 뚫고 나간다' }, { key: 'stall', text: '대답을 끌며 시간을 번다', note: '마야가 브레넌의 전화를 역추적한다 · 그동안 그의 팀은 쏘지 않는다' }] });
        if (cole === 'stall') {
          await m.talk([['daniel', '…조건이 뭐냐. 드라이브만 두면 끝이라는 걸 어떻게 믿지?', { radio: true, priority: 3 }], ['cole', '믿든 말든. 30초 준다.', { radio: true, priority: 3 }], ['maya', '(작게) 잡았어. 생-드니 쪽 기지국. 계속 말 시켜—', { radio: true, priority: 3 }], ['cole', '…시간 끄는군. 좋아. 끝이다.', { radio: true, priority: 3 }]]);
          holdFire = 0;
        } else { await m.say('daniel', '내가 직접 확인하지.', { radio: true, priority: 3 }); await m.say('cole', '…그럼 내려와서 가져가 보라고 하지.', { radio: true, priority: 3 }); }
      }
      // response waves come through the main tunnel and the storage corridor
      const spawnWave = (pts) => { const es = pts.map(([x, z]) => spawnPmc(game, x, z, { state: 'combat', visionRange: dark ? 18 : 40, accuracy: 0.8 })); attackOrder(game, es, p); return es; };
      if (drive === 'upload') {
        game.objectives.add('upload', '업로드 중 — 케이지 사수');
        await interact(game, { pos: V(356, 1.0, 150.4), prompt: '터미널에 드라이브 연결', hold: 1.2, radius: 1.8 });
        const total = 55; let waveN = 0;
        const bar = document.createElement('div'); bar.className = 'stealth-meter'; bar.innerHTML = '<div class="lbl">업로드</div><div class="bar"><i></i></div><div class="st"></div>'; game.ui.hud.appendChild(bar); m.bind(() => bar.remove());
        await m.say('maya', '받고 있어. 1분만 버텨!', { radio: true, priority: 3 });
        const t0 = m.time;
        await m.until(() => {
          const e = m.time - t0; const k2 = Math.min(1, e / total); bar.querySelector('i').style.width = `${Math.round(k2 * 100)}%`; bar.querySelector('.st').textContent = `${Math.round(k2 * 100)}%`;
          if (e > waveN * 16 && waveN < 4) { waveN++; spawnWave(waveN % 2 ? [[312, 118], [311, 121], [313, 124]] : [[350, 118], [349, 112], [351, 108]]); }
          return e >= total;
        }, 400);
        bar.remove(); game.objectives.complete('upload');
        await m.say('maya', '다 받았어! 사본 안전해. 나와!', { radio: true, priority: 3 });
      } else {
        await m.say('maya', drive === 'carry' ? '동쪽 터널 끝에 사다리가 있어. 뛰어!' : '동쪽 터널, 사다리! 지금!', { radio: true, priority: 3 });
        spawnWave([[312, 118], [311, 122], [350, 116]]);
        m.spawn(async () => { await m.wait(12); spawnWave([[349, 110], [313, 112]]); });
      }
      // exfil: the ladder at the end of the east tunnel, then the courtyard and the van
      const guardE = spawnWave([[392, 133.2], [386, 134.8]]);
      game.objectives.add('ladder', '동쪽 터널의 사다리로', { marker: A.ladder.clone().setY(1.5) });
      await interact(game, { pos: A.ladder.clone().setY(1.2), prompt: '사다리 오르기', radius: 2.0 });
      game.objectives.complete('ladder');
      await fade(game, m, async () => { lv.setUnderground(0); for (const e of game.director.enemies()) game.director.remove(e); p.teleport(V(-70, 0, 9), Math.PI); });
      const chasers = spawnWave([[-80, 30], [-84, 26], [-72, 32]]);
      const lane = spawnWave([[-74, -12], [-80, -18]]);
      game.objectives.add('van', '골목의 마야 밴으로', { marker: P.van.clone().setY(2.4) });
      await m.say('maya', '안뜰 남쪽 골목! 밴 시동 걸어 뒀어!', { radio: true, priority: 3 });
      await interact(game, { pos: P.van.clone().add(V(1.3, 1.0, 0)), prompt: '밴에 타기', radius: 2.4 });
      game.objectives.complete('van');
      for (const e of [...chasers, ...lane, ...guardE]) if (!e.dead) game.director.remove(e);
      // ending in the van
      game.cine.letterbox(true); game.weapons.hidden = true;
      p.enterSeat(lv.van, { offset: V(0.4, 1.7, 0.6), yawBase: 0, yawRange: 0.8, pitchRange: [-0.3, 0.2] });
      let vt = 0; m.every((dt) => { vt += dt; lv.van.position.z -= Math.min(9, vt * 3) * dt; if (vt > 9) return false; });
      await m.talk([
        ['maya', '…열었어. 비행 기록. 2024년 7월 11일, 회수된 화물을 실은 기체.', { radio: true, priority: 3 }],
        ['daniel', '본국 시설로 갔어야 했다.', { priority: 3 }],
        ['maya', '아니야. 마지막 착륙지는… 뭄바이. 민간 화물 터미널.', { radio: true, priority: 3 }],
        ['daniel', '…그럼 내가 옮긴 건, 처음부터 누군가에게 팔린 물건이었군.', { priority: 3 }],
      ]);
      await m.wait(1.5);
    },
  },
];

// ---------------------------------------------------------------------------------------------
// ② metro route: crowd stealth on the platform, catch the train
async function metroRoute(game, m) {
  const lv = game.level, p = game.player, M = P.m;
  game.objectives.add('metro', '광장의 메트로 입구로', { marker: P.metroTop.clone().setY(2.4) });
  await interact(game, { pos: P.metroTop.clone().add(V(0, 0.6, 2.6)), prompt: '메트로로 내려가기', radius: 2.4 });
  game.objectives.complete('metro');
  const hot = flag('m05_tail_id') === 'wrong';
  for (const a of lv.crowd || []) game.director.remove(a); if (lv.tail && !lv.tail.dead) game.director.remove(lv.tail);
  await fade(game, m, async () => { lv.setUnderground('metro'); p.teleport(M.stairIn.clone(), -Math.PI / 2); });
  // the crowd: commuters in the hall and on the platform, some milling about
  const d = game.director; const crowd = [];
  const civ = (x, z, walk = false) => { const a = d.spawn({ team: 'civilian', faction: 'civ', hat: 'none', weapon: false, passive: true, invulnerable: true, name: '승객', pos: V(x, 0, z) }); crowd.push(a); if (walk) m.spawn(async () => { for (;;) { const tx = rand(360, 418), tz = rand(1.5, 6); a.moveTo(V(tx, 0, tz)); await m.until(() => a.position.distanceTo(V(tx, a.position.y, tz)) < 1.2, 40); await m.wait(rand(1, 6)); } }); else { a.hold(V(x, 0, z)); a.lookAt(V(x, 1.5, -3)); } return a; };
  for (let i = 0; i < 9; i++) civ(rand(362, 420), rand(1.5, 5.5), i % 3 === 0);
  for (let i = 0; i < 4; i++) { const a = civ(rand(364, 418), rand(1.5, 5.5)); }
  for (let i = 0; i < 5; i++) civ(rand(338, 352), rand(-8, 8), i % 2 === 0);
  game.objectives.add('blend', '승강장 군중 속에 섞여 열차를 기다린다', { marker: V(390, 1.4, 3.5) });
  await m.say('maya', '추적팀 둘이 따라 내려가. 사람들 사이에 붙어 있어. 뛰지 마.', { radio: true, priority: 3 });
  // trackers come down a few seconds later and sweep hall → platform
  const trackers = [];
  m.spawn(async () => {
    await m.wait(hot ? 3 : 7);
    const n = hot ? 3 : 2;
    for (let i = 0; i < n; i++) { const t = spawnPmc(game, 300.5 + i, (i - 0.5) * 1.2, { visionRange: 0.1, weapon: true }); t.setPassive(true); trackers.push(t);
      m.spawn(async () => { const pts = [V(320, 0, 0), V(345, 0, rand(-6, 6)), V(rand(362, 380), 0, rand(1.5, 5.5)), V(rand(385, 415), 0, rand(1.5, 5.5)), V(rand(362, 380), 0, rand(1.5, 5.5))];
        for (let j = 0; ; j = j < pts.length - 1 ? j + 1 : 2) { if (t.dead || t.state === 'combat') return; t.moveTo(pts[j]); await m.until(() => t.dead || t.state === 'combat' || t.position.distanceTo(V(pts[j].x, t.position.y, pts[j].z)) < 1.3, 40); await m.wait(rand(1.5, 4)); } }); }
    await m.say('tracker', '(무전) 메트로로 들어갔다. 승강장 확인한다.', { radio: true, priority: 2 });
  });
  const st = suspicion(game, m, { watchers: () => trackers, range: 22, crowd: () => crowd, start: hot ? 0.35 : 0 });
  trackShots(game, m, (s) => { if (!s.suppressed) st.meter = 1; else if (trackers.some((t) => !t.dead && t.position.distanceTo(p.position) < 10)) st.meter = Math.min(1, st.meter + 0.4); });
  let spotted = false;
  m.spawn(async () => { await m.until(() => st.spotted, 1e9); spotted = true; game.objectives.fail?.('blend');
    for (const t of trackers) if (!t.dead) { t.setPassive(false); t.visionRange = 40; } attackOrder(game, trackers.filter((t) => !t.dead), p);
    for (const c of crowd) { c.moveTo(V(rand(300, 334), 0, rand(-1.5, 1.5)), { run: true }); }
    game.audio.setMusic('combat'); await m.say('tracker', '찾았다! 승강장 — 놈이 무장했다!', { priority: 3 }); });
  // the train: announced, pulls in from the tunnel, doors open for a while
  await m.wait(18); await m.say('pa', '(안내 방송) 포르트 노르 방면 열차가 곧 도착합니다.', { priority: 2, lang: 'fr' });
  await m.wait(14);
  const tr = lv.train; tr.visible = true; tr.position.set(480, -1.1, -2.5);
  const eng = game.audio.engineLoop('truck'); eng?.set(0.6, 0.3);
  let v = 16; await new Promise((res) => m.every((dt) => { const left = tr.position.x - 362; v = Math.max(0.6, Math.min(16, left * 0.45)); tr.position.x -= v * dt; eng?.setPos(tr.position); if (left < 0.1) { tr.position.x = 362; res(); return false; } }));
  eng?.set(0.25, 0.3); lv.setTrainDoors(1); game.audio.click(0.3, 1600, 0.2);
  game.objectives.complete('blend'); game.objectives.add('board', '열차에 탑승', { markers: [V(371.5, 1.4, 1), V(390, 1.4, 1), V(408, 1.4, 1)] });
  const doorPts = []; tr.updateMatrixWorld(true); for (const dd of lv.trainDoors) { const w = dd.l.parent.getWorldPosition(new THREE.Vector3()); doorPts.push(V(w.x, 0, 0.9)); }
  let boarded = false; const its = doorPts.map((pt) => p.addInteractable({ pos: pt.clone().setY(1.1), prompt: '열차 탑승', radius: 1.8, onUse: () => { boarded = true; } }));
  m.bind(() => its.forEach((it) => p.removeInteractable(it)));
  await m.until(() => boarded, 28);
  its.forEach((it) => { it.enabled = false; });
  if (!boarded) { game.failMission('열차를 놓쳤습니다', '열차에 탑승'); await m.wait(999); }
  game.objectives.complete('board');
  saves.setFlag('m05_metro', spotted ? 'spotted' : 'clean');
  st.stop?.();
  lv.setTrainDoors(0);
  await m.say(spotted ? 'maya' : 'daniel', spotted ? '문 닫혔어 — 떨어졌어! 하지만 저 사람들 무전으로 다 불었을 거야.' : '…문 닫혔다. 아무도 못 탔어.', { radio: spotted, priority: 3 });
  game.cine.title('20분 후', '생-베렌 뒤편 · 보관소 안뜰', 3, 'chapter');
  await fade(game, m, async () => { eng?.stop(); for (const a of [...crowd, ...trackers]) game.director.remove(a); tr.visible = false; lv.setUnderground(0); p.teleport(V(-77, 0, -26), 0); });
}

// ② alley route: lure him into the passage, ambush behind the dumpster
async function alleyRoute(game, m) {
  const lv = game.level, p = game.player, A = P.alley; const tail = lv.tail; const hot = flag('m05_tail_id') === 'wrong';
  game.objectives.add('lure', '길을 건너 통로로 유인', { marker: V(-11, 2, 19) });
  await m.reach(V(-12, 0, 19), 3);
  game.objectives.complete('lure');
  lv.tailFree = true;
  const hide = V(-34.6, 0, 20.7);
  game.objectives.add('hide', `쓰레기통 뒤에 숨기 — ${k(game, 'crouch')} 앉기`, { marker: hide.clone().setY(1) });
  await m.say('maya', hot ? '그 사람 총 꺼냈어. 조심해 — 그냥 들어오지 않을 거야.' : '따라 들어온다. 숨어.', { radio: true, priority: 3 });
  await m.until(() => p.position.distanceTo(V(hide.x, p.position.y, hide.z)) < 2 && p.crouching, 30);
  game.objectives.complete('hide');
  let outcome = null;
  if (hot) {
    // he comes in armed and alert: no clean takedown
    lv.tail = null; game.director.remove(tail);
    const t = spawnPmc(game, -11, 18.5, { state: 'combat', visionRange: 30, accuracy: 0.7 }); attackOrder(game, [t], p); t.moveTo(V(-30, 0, 18), { run: false });
    await m.until(() => t.dead, 120); outcome = 'killed';
  } else {
    tail.moveTo(V(-12, 0, 19)); await m.until(() => tail.position.x < -11.5, 30);
    tail.moveTo(V(-45, 0, 19.4));
    let used = false;
    takedowns(game, m, [tail], { canUse: () => true, onUse: () => { used = true; }, radius: 2.4 });
    tail.yaw = -Math.PI / 2;
    await m.until(() => used || tail.dead || tail.position.x < -44, 60);
    if (tail.dead) outcome = 'killed';
    else if (used) outcome = 'taken';
    else { // he walks past: turns, sees you
      await m.say('tail', '…뭐야?', { priority: 3 }); game.director.remove(tail);
      const t = spawnPmc(game, tail.position.x, tail.position.z, { state: 'combat', accuracy: 0.6 }); attackOrder(game, [t], p); await m.until(() => t.dead, 120); outcome = 'killed';
    }
  }
  let tailFate = 'killed';
  if (outcome === 'taken') {
    await m.talk([
      ['daniel', '누가 보냈지.', { priority: 3 }],
      ['tail', '…헉… 브레넌. 콜 브레넌. 당신이 보관소로 갈 거라고 했어.', { priority: 3 }],
      ['daniel', '보관소 출입 코드.', { priority: 3 }],
      ['tail', '4-1-7-7… 제발. 난 그냥 따라다니라는 말만 들었어.', { priority: 3 }],
      ['maya', '다니엘. 시간 없어. 그 사람 무전기에서 호출이 오고 있어.', { radio: true, priority: 3 }],
    ]);
    tailFate = await choose(game, m, { flag: 'm05_tail', tag: '결정 // 미행자', timeout: 25, fallback: 1,
      options: [{ key: 'released', text: '풀어준다 — "브레넌에게 전해. 내가 간다고."', note: '브레넌이 말을 걸어올 것이다' },
        { key: 'tied', text: '묶어 두고 무전기를 챙긴다', note: '추적팀의 무전을 엿들을 수 있다' }] });
    if (tailFate === 'released') { await m.say('daniel', '가. 브레넌에게 전해 — 내가 간다고.', { priority: 3 }); tail.unpose(); tail.koed = false; tail.moveTo(V(-8, 0, 19), { run: true }); m.spawn(async () => { await m.wait(6); if (!tail.dead) game.director.remove(tail); }); }
    else { await m.say('daniel', '(케이블 타이) 소리 내지 마.', { priority: 3 }); }
  } else saves.setFlag('m05_tail', 'killed');
  // his team comes looking for him
  await m.wait(1.5);
  await m.say('tracker', '(무전) 에코 3, 응답하라. …에코 3? 통로로 들어간다.', { radio: true, priority: 3 });
  game.audio.setMusic('combat');
  const team = [spawnPmc(game, -8, 17.5, { state: 'combat', accuracy: 0.75 }), spawnPmc(game, -8.5, 20.5, { state: 'combat', accuracy: 0.75 }), spawnPmc(game, -64, 24, { state: 'combat', accuracy: 0.75, role: 'flanker' })];
  attackOrder(game, team, p);
  game.objectives.add('fight', '추적팀 제압', { count: team.length });
  m.bind(events.on('ai:death', ({ agent }) => { if (team.includes(agent)) game.objectives.progress('fight'); }));
  await m.until(() => team.every((e) => e.dead), 240);
  for (const e of team) if (!e.dead) e.kill(p.position);
  game.objectives.complete('fight'); game.audio.setMusic('tension');
  await m.say('maya', '통로 끝이 안뜰이야. 보관소 문이 거기 있어.', { radio: true, priority: 3 });
  game.objectives.add('court2', '통로를 지나 안뜰로', { marker: V(-70, 1.5, 19) });
  await m.reach(V(-68, 0, 19), 4);
  game.objectives.complete('court2');
}
