// MISSION 07 — CLOSE QUARTERS (근접전)
// POV: Daniel Voss. 2029-03-21 18:05 EST, New York (fictional places and names), sleet at dusk. With Nadia Rahman.
//
// Maya is taken from a café on the avenue; her phone answers from the 32nd floor of Asher Tower (Kestrel Risk
// Advisory — a Halvard Meridian front). Lobby fight → 32F floor by floor → the server → a gunship at the
// windows (the curtain wall comes apart) → down the freight elevator shaft on the car roof → the track
// access → a rail-car chase through the tunnel → the disused Hollis St station.
//
// Carries M06's outcome (storyFlags):
//   m06_buyer right  → Maya's contact had Desai's shipping records (the reason for the meeting)
//   m06_nadia        lower / drive / maya → Nadia trusts Daniel: she stays with him, and offers the flank at the end
//                    aim → she keeps her distance: takes the stairs instead of the shaft, rejoins at the tracks
// New decisions:
//   ① the Kestrel server                 m07_server   copy (hold 40 s, evidence) / wipe (pull the drives, quicker)
//   ② the hostage at Hollis St           m07_hostage  shoot / trade (copy only) / nadia (trust only) / lower
import * as THREE from 'three';
import { NewYorkTower, NY, OFF_DX } from '../world/levels/NewYorkTower.js';
import { events } from '../core/Events.js';
import { saves } from '../core/SaveSystem.js';
import { keyName } from '../player/Player.js';
import { setSleeveLook } from '../player/WeaponModels.js';
import { buildHelicopter } from '../world/Props.js';
import { V, attackOrder, interact, choose, flag } from './common.js';
import { fade, ammoFromDead } from './stealth.js';

export const TEXTURES = ['concrete', 'asphalt', 'metal', 'paintedMetal', 'wood', 'fabric'];
export const PROPS = ['metal_trash_can', 'Barrel_01'];
const rand = (a, b) => a + Math.random() * (b - a);
const k = (game, a) => `<kbd>${keyName(game.input.binding(a))}</kbd>`;
const facing = (dx, dz) => Math.atan2(-dx, -dz);   // player yaw that looks along (dx, dz)

export function EPILOGUE() {
  const f = saves.data.storyFlags; const out = [];
  out.push('케스트럴 리스크 어드바이저리는 다음 날 아침 32층 임대 계약을 해지했다. 건물 관리 회사는 "배관 공사 중 유리 파손"이라고 발표했다.');
  if (f.m07_server === 'copy') out.push('복사한 서버에는 할바르드가 지난 석 달 동안 사들인 전파 기록의 목록이 있었다. 대부분 한반도 상공이었다.');
  else out.push('뽑아 낸 드라이브는 박살 났다. 마야에 대한 그들의 기록도 함께 사라졌다 — 적어도 그 한 벌은.');
  if (f.m07_hostage === 'trade') out.push('그레이브스는 사본을 들고 사라졌다. 할바르드는 이제 다니엘이 무엇을 쥐고 있는지 안다.');
  else if (f.m07_hostage === 'nadia') out.push('나디아는 그날 밤 처음으로 다니엘에게 등을 보였다. 그는 그 의미를 알았다.');
  if (f.m07_maya === 'hurt') out.push('마야의 왼쪽 어깨에는 붕대가 감겼다. 그녀는 "타자 치는 손은 오른손"이라고만 했다.');
  return out.join(' ');
}

// ---------------------------------------------------------------------------------------------
function daniel(game) {
  setSleeveLook('jacket');
  const w = game.weapons; w.clear(); w.setSuppressed(false);
  w.give('carbine', { mag: 30, reserve: 150 }); w.give('pistol', { mag: 17, reserve: 51 }); w.grenades = 1; w.equip('carbine', true); w.emitAmmo();
}
const trusts = () => ['lower', 'drive', 'maya'].includes(flag('m06_nadia', 'lower'));
const pmc = (game, x, z, extra = {}, y = 0) => game.director.spawn({ team: 'enemy', faction: 'pmc', hat: 'headset', pos: V(x, y, z), accuracy: 0.85, state: 'idle', ...extra });
const civ = (game, x, z, extra = {}) => game.director.spawn({ team: 'civilian', faction: 'civ', hat: 'none', weapon: false, passive: true, invulnerable: true, name: '행인', pos: V(x, 0, z), ...extra });
function nadiaAt(game, pos) {
  const lv = game.level;
  if (lv.nadia && !lv.nadia.dead) { lv.nadia.actor.root.position.copy(pos); return lv.nadia; }
  const n = game.director.spawn({ team: 'friendly', faction: 'civ', look: 'nadia', sex: 'f', hat: 'none', weapon: true, invulnerable: true, accuracy: 1.25, name: '나디아', pos: pos.clone(), followOffset: V(1.6, 0, 2.2) });
  lv.nadia = n; game.dialogue.bindSpeaker?.('nadia', n); n.follow(game.player); return n;
}
// keep an AI agent standing on a moving object (rail car, helicopter, lift) at a local offset
function ride(m, a, obj, local, { pose = null } = {}) {
  a._placed = true; a.path = null; if (pose) a.pose(pose); else a.hold();
  const p = new THREE.Vector3();
  const off = m.every(() => { if (a.dead || a.removed) return false; obj.updateMatrixWorld(true); p.copy(local); obj.localToWorld(p); a.actor.root.position.copy(p); a.path = null; });
  return off;
}
// objective with a live count + markers over the listed enemies
async function clear(game, m, id, text, list, { timeout = 900 } = {}) {
  game.objectives.add(id, text, { count: list.length });
  let done = 0;
  m.every(() => { const live = list.filter((e) => !e.dead); const n = list.length - live.length; if (n > done) { game.objectives.progress(id, n - done); done = n; } if (!live.length) return false; game.objectives.setMarkers(id, live.map((e) => e.position.clone().setY(e.position.y + 2.1))); });
  await m.until(() => list.every((e) => e.dead), timeout);
  for (const e of list) if (!e.dead) e.kill(game.player.position);
  game.objectives.complete(id);
}
function toOffice(game) { const lv = game.level; lv.setArea('office'); game.player.teleport(NY.liftOut.clone(), facing(-1, 0)); }
function toShaft(game) { const lv = game.level; lv.setArea('under'); lv.setLift(NY.shaft.top); game.player.teleport(V(400.3, NY.shaft.top + 0.05, 0.4), facing(-1, 0)); }

export async function build(game) {
  const lv = new NewYorkTower(game); game.level = lv; await lv.build();
  game.director.visionRange = 45;
  game.squad = {}; game.squadList = [{ id: 'nadia', rank: '', name: '나디아 라만', status: '' }, { id: 'maya', rank: '', name: '마야 첸', status: '연락 두절' }];
  game.audio.startWind(0.05);
  ammoFromDead(game, game.mission, {});
}

export const SEGMENTS = [
  // ============ 0. THE AVENUE ============
  {
    id: 'avenue',
    async setup(game) { daniel(game); game.level.setArea('street'); game.player.teleport(NY.start.clone(), facing(0, 1)); game.audio.setMusic('ambient'); },
    async run(game, m) {
      const lv = game.level, p = game.player;
      const nadia = nadiaAt(game, NY.start.clone().add(V(1.6, 0, -1.5)));
      // people on the sidewalks are the level's instanced crowd; they scatter when the shooting starts
      game.cine.title('CLOSE QUARTERS', '2029. 03. 21  18:05 EST\n미국 뉴욕 · 미드타운\n다니엘 보스', 7);
      const buyer = flag('m06_buyer');
      await m.talk([
        ['maya', '…창가 자리야. 커피는 두 잔 시켰어. 한 잔은 내 거고, 한 잔은 늦게 오는 사람 거.', { radio: true }],
        ['daniel', '난 늦은 적 없어. 신호가 느렸을 뿐이지.', {}],
        ...(buyer === 'right' ? [['maya', '연락책이 데사이 쪽 선적 기록을 가져온대. 뭄바이에서 네가 찍은 그 얼굴 말이야.', { radio: true }]] : [['maya', '연락책은 ECHO 서버를 관리했다는 사람이야. 본인 말로는.', { radio: true }]]),
        ['nadia', '그 "본인 말로는"이 제일 위험한 부분이야.', {}],
        ...(trusts() ? [] : [['nadia', '그리고 착각하지 마, 보스. 우린 같은 방향을 볼 뿐이야. 같은 편이 아니라.', {}], ['daniel', '방향이 같으면 대개 그걸 편이라고 불러.', {}]]),
      ]);
      game.objectives.add('cafe', '메리디안 카페로', { marker: NY.cafeDoor.clone().setY(2) });
      await m.until(() => p.position.z > -96, 240);
      // the abduction: a black SUV comes down the avenue, stops at the café; two men walk Maya out
      const suv = lv.suv; suv.visible = true; suv.position.set(-3.5, 0, -160); suv.rotation.y = Math.PI;
      const eng = game.audio.engineLoop?.('truck'); eng?.set(0.4, 1.1);
      let sx = -3.5, sz = -160, sp = 16;
      const drive = (tx, tz, speed, stopDist = 1) => new Promise((res) => { m.every((dt) => { const dx = tx - sx, dz = tz - sz, d = Math.hypot(dx, dz); if (d < stopDist) { res(); return false; } const s = Math.min(speed, d * 1.4 + 2); sx += dx / d * s * dt; sz += dz / d * s * dt; suv.position.set(sx, 0, sz); suv.rotation.y = Math.atan2(dx, dz); eng?.set(0.3 + s / 40, 0.9 + s / 30); }); });
      await drive(-6.8, -44, sp);
      const maya = civ(game, NY.cafe.x1 - 1.2, -40, { look: 'maya', sex: 'f', name: '마야' }); maya.hold(V(NY.cafe.x1 - 1.2, 0, -40));
      const grab = [pmc(game, NY.cafe.x1 - 0.5, -41.4, { name: '정장 남자' }), pmc(game, NY.cafe.x1 - 0.5, -38.6, { name: '정장 남자' })]; grab.forEach((e) => { e.setPassive(true); e.visionRange = 0.1; });
      m.spawn(() => m.talk([['maya', '다니엘, 지금 누가 내 테이블로—', { radio: true, priority: 3 }], ['maya', '…아니요, 같이 갈 생각 없—', { radio: true, priority: 3 }]]));
      game.audio.radio?.(true, 0.4);
      await m.wait(1.4);
      for (const a of [maya, ...grab]) a.moveTo(V(-8.2, 0, -44 + (a === maya ? 0 : a === grab[0] ? -1 : 1)), { run: true });
      await m.until(() => maya.position.distanceTo(V(-8.2, maya.position.y, -44)) < 1.5, 12);
      for (const a of [maya, ...grab]) game.director.remove(a);
      lv.crowd?.flee(V(-8, 0, -44), 25);
      await m.say('daniel', '마야! …놈들이 그녀를 차에 태웠다!', { priority: 3 });
      game.objectives.complete('cafe');
      // the SUV runs south and turns into the tower's garage ramp
      await drive(-3.5, 18, 20, 2); await drive(18.5, 26, 10, 1.5); await drive(18.5, 34, 6, 1);
      lv.hide(suv); eng?.stop();
      await m.talk([
        ['nadia', '애셔 타워 주차장. 저 차는 나오지 않을 거야.', { priority: 3 }],
        ['nadia', '(휴대폰을 보며) 마야 전화가 아직 켜져 있어. …32층. 케스트럴 리스크 어드바이저리.', { priority: 3 }],
        ['daniel', '할바르드가 뉴욕에서 쓰는 간판이야. 간판만 세 번 바꿨지.', { priority: 3 }],
        ['nadia', '로비 경비는 진짜 경비가 아닐 거야.', { priority: 3 }],
        ['daniel', '그럼 우리도 진짜 방문객은 아니니까 공평하네.', { priority: 3 }],
      ]);
      game.objectives.add('tower', '애셔 타워 로비로', { marker: NY.lobbyDoor.clone().add(V(-2, 2, 0)) });
      await m.reach(NY.lobbyDoor.clone().add(V(-3, 0, 0)), 4);
      game.objectives.complete('tower');
    },
  },

  // ============ 1. THE LOBBY ============
  {
    id: 'lobby',
    async setup(game) { daniel(game); game.level.setArea('street'); game.player.teleport(NY.lobbyDoor.clone().add(V(-3, 0, 0)), facing(1, 0)); nadiaAt(game, V(10.5, 0, 2)); },
    async run(game, m) {
      const lv = game.level, p = game.player;
      // the "security staff" behind the desk and the turnstiles, workers on their way out
      const guards = [pmc(game, 26.2, -3, { name: '경비' }), pmc(game, 26.2, 3, { name: '경비' }), pmc(game, 34.5, -8), pmc(game, 34.5, 8), pmc(game, 39, -13), pmc(game, 39, 12)];
      guards.forEach((e) => { e.setPassive(true); e.visionRange = 0.1; e.lookAt(V(15, 1.5, 0)); });
      const workers = [civ(game, 30, -5, { name: '직원' }), civ(game, 31, 5, { name: '직원' }), civ(game, 36, 0, { name: '직원' })];
      for (const w of workers) w.moveTo(V(rand(18, 22), 0, rand(-4, 4)));
      await m.say('contractor', '건물 업무 시간은 끝났습니다. 방문 예약 있으십니까?', { priority: 2 });
      await m.wait(0.6);
      await m.say('daniel', '32층. 예약은 없는데, 거기서 우리를 기다리는 것 같아서.', { priority: 2 });
      // they recognise him
      const goLoud = () => { if (lv.lobbyLoud) return; lv.lobbyLoud = true; for (const e of guards) { e.setPassive(false); e.visionRange = 50; } attackOrder(game, guards, p); game.audio.setMusic('combat'); for (const w of workers) w.moveTo(V(-12, 0, rand(-10, 10)), { run: true }); lv.panic = true; lv.crowd?.flee(V(15, 0, 0), 120); lv.stopTraffic = true; };
      m.spawn(async () => { await m.wait(1.2); await m.say('contractor', '…저 얼굴, 브리핑에서 본— 보스다! 사격!', { priority: 3 }); goLoud(); });
      m.every(() => { if (lv.lobbyLoud) return false; if (game.weapons.lastShot) goLoud(); });
      // two more come down the garage stair when the first ones fall
      m.spawn(async () => { await m.until(() => guards.filter((e) => e.dead).length >= 3, 600); const more = [pmc(game, 40.5, -17.5), pmc(game, 40.5, 17.5)]; attackOrder(game, more, p); guards.push(...more); await m.say('nadia', '주차장 계단에서 둘 더!', { priority: 2 }); });
      await m.wait(0.5);
      await clear(game, m, 'lobby', '로비 제압', guards);
      game.audio.setMusic('tension');
      await m.talk([
        ['nadia', '보안 데스크 화면. 32층으로 올라가는 엘리베이터는 2번만 열려 있어. 나머지는 잠겼고.', { priority: 2 }],
        ['daniel', '친절하게 우리 동선을 정해 주는군.', { priority: 2 }],
        ['nadia', '친절은 보통 함정이라는 뜻이야.', { priority: 2 }],
      ]);
      game.objectives.add('lift', '엘리베이터 2번 — 32층', { marker: NY.elevators[1].clone().add(V(-1, 2, 0)) });
      await interact(game, { pos: NY.elevators[1].clone().add(V(-0.8, 1.3, 0)), prompt: '32층 호출', radius: 2.4 });
      game.objectives.complete('lift');
      await fade(game, m, async () => { toOffice(game); nadiaAt(game, V(211, 0, 0.5)); });
      game.ui.hint('<b>32층</b> · 케스트럴 리스크 어드바이저리', 3);
    },
  },

  // ============ 2. THE 32ND FLOOR ============
  {
    id: 'floor32',
    async setup(game) { daniel(game); toOffice(game); nadiaAt(game, V(211, 0, 0.5)); },
    async run(game, m) {
      const lv = game.level, p = game.player;
      game.audio.click(0.25, 2200, 0.2);   // the lift chime
      const team = [pmc(game, 205.5, -6.6), pmc(game, 205.5, 11.8), pmc(game, 219, -12.2), pmc(game, 222, -17), pmc(game, 232, 7), pmc(game, 236, -3), pmc(game, 232.5, 16), pmc(game, 203, 16.5)];
      attackOrder(game, team, p); game.audio.setMusic('combat');
      await m.say('contractor', '엘리베이터! 2번이 올라왔다!', { priority: 3 });
      m.spawn(async () => { await m.wait(6); await m.say('nadia', '책상 밑으로 숙여. 칸막이는 총알 못 막아.', { priority: 2 }); });
      await clear(game, m, 'floor', '32층 제압', team);
      game.audio.setMusic('tension');
      // Maya's phone, left behind; the server room
      game.objectives.add('server', '서버실 — 납치 경로 확인', { marker: lv.serverTerm.clone().setY(1.8) });
      m.spawn(async () => {
        await interact(game, { pos: lv.phone.position.clone(), prompt: '휴대폰 줍기', radius: 1.8 }); lv.hide(lv.phone);
        await m.talk([['daniel', '(휴대폰 화면에 금이 가 있다) 마야 거야. 일부러 두고 간 거군. 우리가 여기까지 오라고.', { priority: 2 }], ['nadia', '놈들이? 아니면 마야가?', { priority: 2 }], ['daniel', '마야라면 메모도 남겼겠지. 잠금 화면에.', { priority: 2 }]]);
        game.ui.hint('<b>[잠금 화면 메모]</b> 화물 E/V · B3 · 커피 식는다', 5);
      });
      await interact(game, { pos: lv.serverTerm.clone(), prompt: '서버 접속', radius: 2.0 });
      game.objectives.complete('server');
      await m.talk([
        ['daniel', '출입 기록… 18시 11분, 화물 엘리베이터로 지하 3층. 선로 접근 통로.', { priority: 3 }],
        ['nadia', '지하철? 차로 빼면 될 걸 왜 굳이.', { priority: 3 }],
        ['daniel', '"18:40 HOLLIS ST — 인계". 폐역이야. 거기서 마야를 다른 팀에 넘긴다.', { priority: 3 }],
        ['nadia', '그리고 여기 이 서버. 저 사람들이 마야에 대해 아는 건 전부 이 안에 있을 거야.', { priority: 3 }],
      ]);
      // ① copy it (slow, evidence) or rip the drives out (quick, nothing left for them either)
      const pick = await choose(game, m, { flag: 'm07_server', tag: '결정 // 케스트럴 서버', timeout: 25, fallback: 1, options: [
        { key: 'copy', text: '서버를 통째로 복사한다 — 40초 걸린다', note: '증거가 남는다' },
        { key: 'wipe', text: '드라이브를 뽑아 부순다 — 마야에 관한 기록을 없앤다', note: '빠르다' },
      ] });
      const need = pick === 'copy' ? 40 : 12; let prog = 0;
      const bar = document.createElement('div'); bar.className = 'stealth-meter'; bar.innerHTML = `<div class="lbl">${pick === 'copy' ? '복사' : '드라이브 분리'}</div><div class="bar"><i></i></div><div class="st"></div>`; game.ui.hud.appendChild(bar); m.bind(() => bar.remove());
      game.objectives.add('data', pick === 'copy' ? '서버 복사 — 서버실을 지켜라' : '드라이브 분리', {});
      // the gunship comes up the west face; then more men from the stair
      const heli = buildHelicopter(); heli.position.set(NY.off.x0 - 60, -30, 30); game.renderer.scene.add(heli); lv.heli = heli; heli.userData.area = 'office';
      const rotor = game.audio.rotorLoop?.(); rotor?.set(0.2);
      let hx = NY.off.x0 - 60, hy = -30, hz = 30, ht = 0; let heliGone = false, heliHp = 900;
      const gunner = pmc(game, hx, hz, { name: '도어 거너', hp: 140, accuracy: 0.55 }); gunner.actor.root.position.y = hy;
      const unride = ride(m, gunner, heli, V(1.05, -0.9, 0.2));
      m.every((dt) => {
        if (heliGone && hy > 120) { game.renderer.scene.remove(heli); rotor?.stop(); return false; }
        ht += dt; heli.userData.rotor?.rotateY?.(dt * 28); heli.userData.tail?.rotateX?.(dt * 40);
        let tx, ty, tz;
        if (heliGone) { tx = hx - 40; ty = hy + 40; tz = hz + 30; }
        else if (ht < 7) { tx = NY.off.x0 - 22; ty = 0.5; tz = 6; }
        else { tx = NY.off.x0 - 16; ty = 0.2 + Math.sin(ht * 0.5) * 0.8; tz = Math.sin(ht * 0.22) * 12; }
        const kk = Math.min(1, dt * (heliGone ? 0.4 : 0.6)); hx += (tx - hx) * kk; hy += (ty - hy) * kk; hz += (tz - hz) * kk;
        heli.position.set(hx, hy, hz); heli.rotation.y = Math.atan2(p.position.x - hx, p.position.z - hz) - Math.PI / 2; heli.rotation.z = Math.sin(ht * 0.9) * 0.04;
        rotor?.set(Math.min(1, 0.2 + ht * 0.15)); if (rotor?.setPos) rotor.setPos(heli.position);
      });
      // the helicopter as a vehicle target (body hits wear it down; the gunner can be shot through the door)
      const hv = { isVehicle: true, dead: false, radius: 6, position: heli.position, _inv: new THREE.Matrix4(),
        rayTest(o, d, maxD) { heli.updateMatrixWorld(true); this._inv.copy(heli.matrixWorld).invert(); const lo = o.clone().applyMatrix4(this._inv), ld = d.clone().transformDirection(this._inv); const h = new THREE.Ray(lo, ld).intersectBox(new THREE.Box3(V(-1.2, -1.3, -3), V(1.2, 1.3, 3)), new THREE.Vector3()); if (!h) return null; const dist = h.distanceTo(lo); return dist > maxD ? null : { dist, point: h.applyMatrix4(heli.matrixWorld) }; },
        damage(a) { if (heliGone) return false; heliHp -= a * 6; if (heliHp <= 0) { leave('hull'); return true; } return false; }, update() {} };
      game.director.vehicles.push(hv); m.bind(() => { game.director.vehicles = game.director.vehicles.filter((x) => x !== hv); });
      const leave = (why) => { if (heliGone) return; heliGone = true; hv.dead = true; unride(); if (!gunner.dead) game.director.remove(gunner); game.effects.smokeColumn?.(heli.position.clone(), 0.6); m.spawn(() => m.say('nadia', why === 'gunner' ? '사수를 맞혔어! 헬기가 빠진다!' : '엔진에 연기— 물러간다!', { priority: 3 })); game.objectives.complete('heli'); };
      m.spawn(async () => {
        await m.wait(4);
        await m.say('nadia', '창밖— 헬기!', { priority: 3 });
        game.objectives.add('heli', '헬기 격퇴 — 도어 거너나 동체를 쏴라', { marker: heli.position.clone() });
        m.every(() => { if (heliGone) return false; game.objectives.setMarker('heli', heli.position.clone().add(V(0, 1, 0))); });
        attackOrder(game, [gunner], p); gunner.setPassive(false); gunner.visionRange = 80;
        // the opening burst walks along the west glass: the curtain wall comes apart pane by pane
        lv.windIn = true; lv.rain.points.visible = true; lv.snow.points.visible = true; game.audio.startWind?.(0.12);
        const order = [...lv.westPanes].sort((a, b) => Math.abs(a.z0 + 0.75 - 4) - Math.abs(b.z0 + 0.75 - 4));
        for (const pn of order) { if (heliGone) break; lv.breakPane(pn, V(1, 0.1, (Math.random() - 0.5) * 0.4)); game.effects.tracer?.(heli.position.clone(), V(NY.off.x0 + rand(2, 12), rand(0.5, 2.5), pn.z0 + 0.75)); p.addShake?.(0.08); await m.wait(rand(0.12, 0.3)); }
        await m.say('daniel', '유리창 하나에 40층짜리 경치라니, 비싼 사무실이군.', { priority: 2 });
        m.every(() => { if (heliGone) return false; if (gunner.dead) { leave('gunner'); return false; } });
      });
      m.spawn(async () => { await m.wait(14); const more = [pmc(game, NY.stairDoor.x, NY.stairDoor.z - 1.5), pmc(game, NY.stairDoor.x + 2, NY.stairDoor.z - 1.5), pmc(game, NY.stairDoor.x - 2, NY.stairDoor.z - 2.5)]; attackOrder(game, more, p); lv.stairTeam = more; await m.say('contractor', '계단으로 진입! 서버실 쪽이다!', { priority: 2 }); });
      // progress only while Daniel stays near the server room (copy) / at the rack (wipe)
      const S = NY.server;
      m.every((dt) => {
        const inRoom = p.position.x > S.x0 - 3 && p.position.z < S.z1 + 4;
        if (inRoom) prog += dt; bar.querySelector('i').style.width = `${Math.min(100, prog / need * 100)}%`;
        bar.querySelector('.st').textContent = prog >= need ? '완료' : inRoom ? (pick === 'copy' ? '복사 중… 서버실 근처에 있어라' : '랙에서 드라이브를 뽑는 중…') : '서버실에서 멀어졌다 — 중단';
        if (prog >= need) return false;
      });
      await m.until(() => prog >= need, 600);
      bar.remove(); game.objectives.complete('data');
      lv.serverScreen.material.emissiveIntensity = pick === 'copy' ? 0.8 : 0;
      if (pick === 'wipe') { for (const l of lv.leds) lv.hide(l); game.audio.explosion?.(lv.serverTerm.clone(), 0.08, { ring: false }); }
      await m.say(pick === 'copy' ? 'nadia' : 'daniel', pick === 'copy' ? '복사 끝. 이 정도면 작은 도서관이야.' : '(드라이브를 바닥에 내리치며) 이제 그쪽도 마야에 대해 아는 게 없다.', { priority: 2 });
      // the rest of the stair team and the gunship, if still here
      await m.until(() => (lv.stairTeam || []).every((e) => e.dead) && (heliGone || gunner.dead), 300);
      if (!heliGone) leave('gunner');
      game.audio.setMusic('tension');
      await m.talk([
        ['nadia', '18시 32분. 인계까지 8분.', { priority: 3 }],
        ['daniel', '계단으로 서른두 층이면 8분 안에 못 내려가.', { priority: 3 }],
        ['nadia', '그럼 계단 말고.', { priority: 3 }],
      ]);
      game.objectives.add('shaft', '화물 엘리베이터 샤프트', { marker: NY.freightDoor.clone().setY(2) });
      await interact(game, { pos: NY.freightDoor.clone().setY(1.2), prompt: '샤프트 문 비틀어 열기', radius: 2.4 });
      game.objectives.complete('shaft');
      await fade(game, m, async () => { lv.windIn = false; game.audio.startWind?.(0.03); toShaft(game); });
    },
  },

  // ============ 3. DOWN THE SHAFT ============
  {
    id: 'shaft',
    async setup(game) { daniel(game); toShaft(game); },
    async run(game, m) {
      const lv = game.level, p = game.player, S = NY.shaft;
      const withUs = trusts();
      let nadia = lv.nadia;
      let unNadia = null;
      if (withUs) { nadia = nadiaAt(game, V(399.2, S.top, -0.6)); unNadia = ride(m, nadia, lv.liftCar, V(-0.9, 0.02, -0.7)); }
      else if (nadia) { game.director.remove(nadia); lv.nadia = null; }
      await m.talk(withUs ? [
        ['nadia', '(엘리베이터 지붕 위, 제어함을 비틀어 열며) 브레이크를 풀 거야. 속도는 내 마음대로 안 돼.', { priority: 3 }],
        ['daniel', '내려가기만 하면 돼. 멈추는 건 바닥이 알아서 해 주겠지.', { priority: 3 }],
        ['nadia', '그게 걱정이라는 거야.', { priority: 3 }],
      ] : [
        ['nadia', '(무전) 난 계단으로 간다. 둘이 같은 줄에 매달리는 건 바보짓이야. 바닥에서 보자.', { radio: true, priority: 3 }],
        ['daniel', '(혼자 제어함을 열며) 그래, 줄은 내가 독차지하지.', { priority: 3 }],
      ]);
      game.objectives.add('down', '샤프트 하강 — 승강장 문의 사수를 제압', {});
      game.audio.click(0.5, 300, 0.4);
      const motor = game.audio.engineLoop?.('truck'); motor?.set(0.2, 0.5);
      let y = S.top, speed = 0; const spawned = new Set(); const shooters = [];
      m.every((dt) => {
        const near = NY.landings.find((ly) => y < ly + 7 && y > ly - 3 && shooters.some((e) => !e.dead && Math.abs(e.position.y - ly) < 1));
        const target = y <= 0.01 ? 0 : near !== undefined ? 0.9 : 2.2;
        speed += (target - speed) * Math.min(1, dt * 1.5);
        y = Math.max(0, y - speed * dt); lv.setLift(y); motor?.set(0.15 + speed * 0.08, 0.5 + speed * 0.15);
        for (const ly of NY.landings) if (!spawned.has(ly) && y < ly + 9) {
          spawned.add(ly);
          const pair = [pmc(game, S.x0 - 1.4, -0.5, {}, ly), pmc(game, S.x0 - 2.6, 0.6, {}, ly)];
          for (const e of pair) { e.actor.root.position.y = ly; e._placed = true; e.hold(); attackOrder(game, [e], p); e.visionRange = 30; }
          shooters.push(...pair);
          m.spawn(() => m.say('contractor', ly > 20 ? '샤프트 안이다! 엘리베이터 지붕!' : '아래로 내려간다— 쏴!', { priority: 2 }));
        }
        if (y <= 0) { motor?.stop(); return false; }
      });
      m.every(() => { for (const e of shooters) if (!e.dead) e.path = null; if (y <= 0) return false; });
      await m.until(() => y <= 0, 300);
      game.audio.click(0.6, 160, 0.3); p.addShake?.(0.15);
      for (const e of shooters) if (!e.dead) game.director.remove(e);
      game.objectives.complete('down');
      if (unNadia) { unNadia(); nadia.follow(p); }
      await m.say('daniel', withUs ? '(지붕에서 내려서며) 바닥이 알아서 멈춰 줬어.' : '(지붕에서 내려서며) 지하 3층. 엘리베이터 음악이 없어서 좋군.', { priority: 2 });
    },
  },

  // ============ 4. THE TRACKS: RAIL-CAR CHASE ============
  {
    id: 'tracks',
    async setup(game) { daniel(game); const lv = game.level; lv.setArea('under'); lv.setLift(0); game.player.teleport(V(403.5, 0, 0), facing(1, 0)); },
    async run(game, m) {
      const lv = game.level, p = game.player, P = NY.plat;
      game.objectives.add('track', '선로 접근 통로 → 정비 승강장', { marker: V(411.7, 1.6, 9) });
      await m.reach(V(411.7, 0, 9.5), 3);
      game.objectives.complete('track');
      // Nadia: with Daniel already, or arriving from the stair now
      const nadia = nadiaAt(game, trusts() ? V(410.5, 0, 9.2) : V(418, 0, 9.4));
      if (!trusts()) await m.talk([['nadia', '(계단 문을 걷어차고 나오며) 스물아홉 층. 다리는 나중에 불평할 거야.', { priority: 3 }], ['daniel', '난 스물아홉 층을 1분 만에 내려왔어.', { priority: 3 }], ['nadia', '알아. 소리 다 들렸어.', { priority: 3 }]]);
      // the kidnappers' car pulls away with Maya; Graves at the front, two shooters at the back
      const their = lv.theirCar, ours = lv.ourCar;
      const graves = game.director.spawn({ team: 'enemy', faction: 'pmc', hat: 'none', name: '그레이브스', pos: V(their.position.x, 0, NY.trackA), invulnerable: true, passive: true, visionRange: 0.1 });
      const maya = civ(game, their.position.x, NY.trackA, { look: 'maya', sex: 'f', name: '마야' });
      const shooters = [pmc(game, their.position.x - 2, NY.trackA, { name: '경호원', accuracy: 0.6 }), pmc(game, their.position.x - 3, NY.trackA, { name: '경호원', accuracy: 0.6 })];
      ride(m, graves, their, V(2.0, 1.125, -0.5)); ride(m, maya, their, V(1.0, 1.125, 0.6), { pose: 'sit' });
      ride(m, shooters[0], their, V(-2.6, 1.125, -0.6)); ride(m, shooters[1], their, V(-2.0, 1.125, 0.7));
      game.dialogue.bindSpeaker?.('graves', graves); game.dialogue.bindSpeaker?.('maya', maya);
      lv.graves = graves; lv.maya = maya;
      their.userData.head.intensity = 30; ours.userData.head.intensity = 30;
      await m.talk([['maya', '다니엘!', { priority: 3 }], ['graves', '출발해! 지금!', { priority: 3 }]]);
      let theirX = their.position.x, theirV = 0, ourX = ours.position.x, ourV = 0;
      const tEng = game.audio.engineLoop?.('truck'); tEng?.set(0.3, 0.7);
      let boarded = false;
      m.every((dt) => { if (boarded) return false; const want = theirX > ourX + 55 ? 0 : 4; theirV += (want - theirV) * Math.min(1, dt); theirX += theirV * dt; their.position.x = theirX; });
      attackOrder(game, shooters, p);
      game.objectives.add('board', '작업차에 올라타라', { marker: ours.position.clone().add(V(1.4, 2.4, 0)) });
      await interact(game, { pos: ours.position.clone().add(V(1.0, 1.6, -1.3)), prompt: '작업차 운전석', radius: 2.6 });
      game.objectives.complete('board'); boarded = true;
      // Daniel drives (W / S) and shoots from the deck; Nadia rides at the back
      p.enterSeat(ours, { offset: V(1.4, 1.125 + 1.6, 0), yawBase: -Math.PI / 2, yawRange: Math.PI, pitchRange: [-0.7, 0.6], armed: true });
      const unNadia = ride(m, nadia, ours, V(-2.2, 1.125, 0.6));
      game.ui.hint(`${k(game, 'forward')} 가속 · ${k(game, 'back')} 감속 — 달리면서 쏠 수 있다`, 6);
      game.audio.setMusic('combat');
      const oEng = game.audio.engineLoop?.('truck'); oEng?.set(0.3, 0.8);
      game.objectives.add('chase', '앞 차량 추격 — 경호원 제압', { count: shooters.length });
      let done = 0;
      m.every(() => { const n = shooters.filter((e) => e.dead).length; if (n > done) { game.objectives.progress('chase', n - done); done = n; } });
      // the chase: their speed rubber-bands to keep them 30–80 m ahead; they stop at Hollis St
      const St = NY.station; let warnT = 0; let express = null, chase = null;
      m.every((dt) => {
        const ax = game.input.moveAxes().z;   // +1 forward
        const gap = theirX - ourX;
        let maxV = 18; if (gap < 14) maxV = Math.max(0, (gap - 8) * 1.5);
        ourV += (ax > 0.2 ? 5.5 : ax < -0.2 ? -8 : -0.6) * dt; ourV = Math.max(0, Math.min(maxV, ourV));
        ourX = Math.min(ourX + ourV * dt, NY.tun.x1 - 12); ours.position.x = ourX; oEng?.set(0.25 + ourV / 30, 0.7 + ourV / 25);
        if (!lv.theirStop) {
          const want = shooters.every((e) => e.dead) ? 10 : gap > 80 ? 8 : gap < 30 ? 17 : 13;
          theirV += (want - theirV) * Math.min(1, dt * 0.8);
          if (theirX > St.x0 + 20) { theirV = Math.max(0, theirV - 9 * dt); if (theirV < 0.3) { lv.theirStop = true; tEng?.stop(); } }
          theirX += theirV * dt; their.position.x = theirX;
        }
        warnT -= dt; if (gap > 95 && warnT <= 0 && !lv.theirStop) { warnT = 8; m.spawn(() => m.say('nadia', '멀어진다! 밟아!', { priority: 2 })); }
        // a second car on track B, coming up from behind
        if (!chase && ourX > 560) chase = startChase();
        if (chase && !express && chase.over && ourX > 700) express = startExpress();
        if (lv.theirStop && ourX > theirX - 16 && ourV < 0.5) return false;
      });
      const startChase = () => {
        const c = lv.chaseCar; c.visible = true; lv.hide(c, false); c.userData.head.intensity = 30; let cx = ourX - 60, cv = ourV + 6; c.position.x = cx;
        const crew = [pmc(game, cx, NY.trackB, { accuracy: 0.6 }), pmc(game, cx, NY.trackB, { accuracy: 0.6 })];
        ride(m, crew[0], c, V(1.6, 1.125, -0.6)); ride(m, crew[1], c, V(-1.0, 1.125, -0.6)); attackOrder(game, crew, p);
        m.spawn(() => m.say('nadia', '오른쪽 선로! 뒤에서 하나 더 붙는다!', { priority: 3 }));
        game.objectives.add('side', '옆 선로의 차량', { markers: crew.map((e) => e.position.clone().setY(e.position.y + 2)) });
        const st = { over: false };
        m.every((dt) => {
          const alive = crew.filter((e) => !e.dead);
          if (alive.length) game.objectives.setMarkers('side', alive.map((e) => e.position.clone().setY(e.position.y + 2)));
          const want = alive.length ? ourV + Math.max(-3, Math.min(6, (ourX + 2 - cx) * 0.6)) : 0;
          cv += (want - cv) * Math.min(1, dt * (alive.length ? 1.2 : 0.5)); cx += Math.max(0, cv) * dt; c.position.x = cx;
          if (!alive.length && !st.over) { st.over = true; game.objectives.complete('side'); m.spawn(() => m.say('daniel', '옆 차선 정리. …지하철에도 차선이 있다니.', { priority: 2 })); }
          if (st.over && cx < ourX - 120) { lv.hide(c); return false; }
        });
        return st;
      };
      const startExpress = () => {
        const tr = lv.express; lv.hide(tr, false); tr.visible = true; tr.userData.head.intensity = 60; let tx = ourX + 420; tr.position.x = tx;
        const horn = () => { const a = game.audio; if (!a.ctx) return; const c = a.ctx, t = c.currentTime; for (const f of [311, 392]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.05); g.gain.setValueAtTime(0.12, t + 1.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600; o.connect(lp).connect(g); a.route(g, tr.position.clone(), { ref: 20 }); o.start(t); o.stop(t + 1.7); } };
        const roar = game.audio.engineLoop?.('truck'); roar?.set(0.1, 0.4); let honked = false;
        m.spawn(() => m.say('nadia', '불빛— 맞은편에서 열차가 온다!', { priority: 3 }));
        m.every((dt) => {
          tx -= 26 * dt; tr.position.x = tx; const d = Math.abs(tx - ourX);
          roar?.set(Math.min(1.2, 30 / Math.max(6, d)), 0.4 + Math.min(0.6, 20 / Math.max(10, d)));
          if (!honked && d < 140) { honked = true; horn(); setTimeout(horn, 1800); }
          if (d < 20) p.addShake?.(0.05);
          if (tx < ourX - 160) { roar?.stop(); lv.hide(tr); return false; }
        });
        return true;
      };
      await m.until(() => lv.theirStop && ourX > theirX - 16 && ourV < 0.5, 900);
      oEng?.stop();
      for (const e of shooters) if (!e.dead) e.kill(p.position);
      game.objectives.complete('chase');
      p.exitSeat(V(ourX + 1, 0, 12)); p.yaw = facing(1, 0);
      unNadia(); nadia.actor.root.position.set(ourX - 1, 0, 11); nadia.follow(p);
      lv.ourV = 0; lv.theirX = theirX;
    },
  },

  // ============ 5. HOLLIS ST ============
  {
    id: 'hollis',
    async setup(game) {
      daniel(game); const lv = game.level, St = NY.station; lv.setArea('under'); lv.setLift(0);
      lv.theirCar.position.x = St.x0 + 40; lv.ourCar.position.x = St.x0 + 22; lv.theirX = St.x0 + 40;
      game.player.teleport(V(St.x0 + 23, 0, 12), facing(1, 0)); nadiaAt(game, V(St.x0 + 21, 0, 11));
    },
    async run(game, m) {
      const lv = game.level, p = game.player, St = NY.station;
      const nadia = lv.nadia;
      // whoever rode with Maya is off the car now: Graves holds her at the platform edge, his back to the sealed stair
      for (const a of [lv.graves, lv.maya]) if (a) game.director.remove(a);
      const hx = lv.theirX - 2, hz = 11.2;
      const maya = civ(game, hx, hz, { look: 'maya', sex: 'f', name: '마야' }); maya.hold(V(hx, 0, hz)); maya.lookAt(p.position);
      const graves = game.director.spawn({ team: 'enemy', faction: 'pmc', hat: 'none', name: '그레이브스', pos: V(hx + 0.7, 0, hz - 0.35), passive: true, visionRange: 0.1, hp: 40, accuracy: 1.2 });
      graves.hold(V(hx + 0.7, 0, hz - 0.35)); graves.lookAt(p.position); graves.actor.target.aim = 1;
      game.dialogue.bindSpeaker?.('graves', graves); game.dialogue.bindSpeaker?.('maya', maya);
      if (nadia) { nadia.hold(V(St.x0 + 20, 0, 9.5)); nadia.setPassive(true); }
      game.objectives.add('maya', '마야', { marker: V(hx, 2.2, hz) });
      await m.talk([
        ['graves', '거기까지. 총구 내려, 보스. 천천히.', { priority: 3 }],
        ['daniel', '그레이브스. 아직도 남의 짐 들어 주는 일 하나?', { priority: 3 }],
        ['graves', '짐이 말이 많아서 문제지. 인수 팀이 계단으로 오고 있어. 2분이면 여기 사람이 더 많아질 거야.', { priority: 3 }],
        ['maya', '…다니엘, 나 괜찮아. 커피가 식은 것만 빼면.', { priority: 3 }],
      ]);
      const opts = [{ key: 'shoot', text: '그레이브스를 쏜다 — 기회는 한 번', note: '정확히 맞혀야 한다' }];
      if (flag('m07_server') === 'copy') opts.push({ key: 'trade', text: '서버 사본을 내민다 — 마야와 맞바꾼다' });
      if (trusts() && nadia) opts.push({ key: 'nadia', text: '말로 시간을 끈다 — 나디아가 옆으로 돈다' });
      if (opts.length < 3) opts.push({ key: 'lower', text: '총을 내린다' });
      const pick = await choose(game, m, { flag: 'm07_hostage', tag: '결정 // 인질', timeout: 25, fallback: opts.length - 1, options: opts });
      const stairTeam = () => { const t = [pmc(game, St.x0 + 35, 9.4), pmc(game, St.x0 + 36.5, 10.2), pmc(game, St.x0 + 33.5, 10.4)]; attackOrder(game, t, p); return t; };
      let team = null;
      if (pick === 'shoot') {
        // a moment of slow time; one clean hit on Graves
        game.ui.hint('<b>그레이브스</b> — 지금', 2.5); game.timeScale = 0.35; graves.setPassive(true);
        const t0 = m.time; await m.until(() => graves.dead || m.time - t0 > 1.2, 10);
        game.timeScale = 1;
        if (graves.dead) { saves.setFlag('m07_maya', 'ok'); await m.say('maya', '(주저앉으며) …귀 옆으로 지나갔어. 다음엔 미리 말해 줘.', { priority: 3 }); }
        else {
          saves.setFlag('m07_maya', 'hurt'); game.audio.shot(graves.position.clone(), { enemy: true }); maya.actor.flinch?.(); maya.pose('wounded');
          if (nadia) { nadia.setPassive(false); } graves.kill(nadia ? nadia.position : p.position);
          await m.talk([['maya', '윽— 어깨…! 괜찮아, 괜찮아…', { priority: 3 }], ['nadia', '(총구를 내리며) 맞혔어. 늦었지만.', { priority: 3 }]]);
        }
      } else if (pick === 'trade') {
        await m.talk([
          ['daniel', '(드라이브를 들어 보이며) 케스트럴 서버 사본. 마야가 아는 것보다 이게 더 많이 알아.', { priority: 3 }],
          ['graves', '…바닥에 밀어. 여자는 그다음.', { priority: 3 }],
        ]);
        maya.moveTo(V(St.x0 + 24, 0, 11.5), { run: true });
        graves.moveTo(V(St.x0 + 35, 0, 9.4), { run: true });
        saves.setFlag('m07_graves', 'escaped'); saves.setFlag('m07_maya', 'ok');
        await m.wait(2.2); game.director.remove(graves);
        await m.say('graves', '(계단 쪽에서) 거래 고마워, 보스. 다음엔 내가 커피 살게.', { priority: 3, radio: false });
      } else if (pick === 'nadia') {
        await m.talk([
          ['daniel', '(총을 천천히 내리며) 인수 팀이 오면 넌 쓸모가 없어져, 그레이브스. 그 사람들은 짐만 받아.', { priority: 3 }],
          ['graves', '…무슨 소리야.', { priority: 3 }],
          ['daniel', '할바르드가 전에 나한테 한 짓을 생각해 봐. 넌 내 자리에 서 있어.', { priority: 3 }],
        ]);
        if (nadia) { nadia.actor.root.position.set(hx + 6, NY.bed, 15.2); nadia.lookAt(graves.position); }
        await m.wait(0.8); game.audio.shot(V(hx + 6, 0, 15), {}); graves.kill(V(hx + 6, 1, 15));
        saves.setFlag('m07_maya', 'ok');
        await m.talk([['nadia', '(선로에서 올라오며) 말이 길었어. 덕분에 충분했지만.', { priority: 3 }], ['maya', '…두 사람, 언제부터 이렇게 손발이 맞았어?', { priority: 3 }]]);
      } else {
        await m.talk([['daniel', '(총을 바닥에 내려놓으며) 됐어. 그녀를 놔 줘.', { priority: 3 }], ['graves', '착하네. 그럼 우리는—', { priority: 3 }]]);
        await m.wait(0.6);
        await m.say('maya', '(그레이브스의 발등을 짓밟으며) 착하긴 누가!', { priority: 3 });
        maya.moveTo(V(St.x0 + 24, 0, 11.5), { run: true }); await m.wait(0.5);
        graves.kill(p.position); game.audio.shot(p.position.clone().add(V(0, 1.2, 0)), {});
        saves.setFlag('m07_maya', 'ok');
        await m.say('daniel', '(발목의 예비 권총을 집어넣으며) 내려놓은 건 하나뿐이었어.', { priority: 3 });
      }
      game.objectives.complete('maya');
      // the handover team comes down the sealed stair
      team = stairTeam(); game.audio.setMusic('combat');
      if (nadia) { nadia.setPassive(false); nadia.follow(p); }
      maya.unpose(); maya.moveTo(V(St.x0 + 12, 0, 9.4), { run: true });
      await m.say('nadia', '계단! 인수 팀이다!', { priority: 3 });
      await clear(game, m, 'handover', '인수 팀 제압', team);
      game.audio.setMusic('tension');
      // Maya opens her laptop: what was on the server they were after
      game.objectives.add('laptop', '마야', { marker: maya.position.clone().setY(2) });
      await m.reach(maya.position.clone(), 3.5);
      game.objectives.complete('laptop');
      await m.talk([
        ['maya', '(가방에서 노트북을 꺼내며) 이걸 노린 거야. 파리 이후로 계속 두드리던 거.', { priority: 3 }],
        ['daniel', '어깨는?', { priority: 3 }],
        ['maya', flag('m07_maya') === 'hurt' ? '피 나는 쪽은 왼쪽이야. 타자는 오른손으로 쳐.' : '멀쩡해. 커피만 못 마셨어.', { priority: 3 }],
        ['maya', '…다니엘. ECHO 로그에 한국군 주파수 대역이 있어.', { priority: 3, duration: 4.5 }],
      ]);
      game.cine.letterbox(true); await m.wait(2.5);
    },
  },
];
