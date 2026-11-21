// MISSION 03 — FALLING FRONT (무너지는 전선)
// POV: PVT Han Min-jae. 2029-03-15 02:10 KST, Hantan River line, night, heavy rain.
// Events: night convoy · thermal sight shows an "armoured battalion" that blinks
// out of existence (ECHO decoy) · squad leader's call to defy the order (player
// choice, dialogue branches) · flare-lit river assault: inflatable boats, mounted
// MG, mortar support by binoculars · planting demolition charges on the bridge
// under fire · enemy tank on the bridge, blowing the middle span · front
// collapse and fighting retreat to the medevac point · the medevac truck
// vanishes beyond the shelling: Park Do-yun is missing.
import * as THREE from 'three';
import { setEnemyMix } from '../ai/CharacterLib.js';
import { HantanRiver, RIVER } from '../world/levels/HantanRiver.js';
import { buildTruck } from '../world/Props.js';
import { events } from '../core/Events.js';
import { saves } from '../core/SaveSystem.js';
import { MountedWeapon } from '../gameplay/MountedWeapon.js';
import { FireSupport } from '../gameplay/FireSupport.js';
import { EnemyBoat } from '../gameplay/EnemyBoat.js';
import { V, spawnEnemies, attackOrder, hintKeys, giveLoadout, shell, interact } from './common.js';

export const TEXTURES = ['concrete', 'asphalt', 'dirt', 'grassdead', 'metal', 'paintedMetal', 'wood', 'fabric', 'camoROK', 'camoEnemy', 'sandbag', 'plaster', 'brick'];
export const EPILOGUE = '한탄대교는 그날 새벽 3시 41분에 끊어졌다. 서쪽 여울로 이동한 예비 중대는 그곳에서 단 한 발의 총성도 듣지 못했다. 박도윤 상병을 태운 후송 1호 차량은 포격 구간 너머에서 교신이 끊겼고, 실종자로 분류되었다. 이서연 중위는 그 명령 전문의 서명 코드가 어느 부대 기록에도 존재하지 않는다는 보고서를 사단에 올렸다. 답신은 오지 않았다.';

const R = RIVER;
function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
const gy = (game, x, z) => (Math.abs(x) < R.bridge.half && Math.abs(z) < R.bridge.z1 ? R.bridge.deck : game.level.hf(x, z));

// drive a group along a ground-following curve
function driver(game, m, obj, pts, { speed = 8, accel = 0.6, onStep = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => V(x, 0, z)));
  const len = curve.getLength(); const st = { u: 0, v: 0, target: speed, done: false };
  m.every((dt, t) => {
    st.v += (st.target - st.v) * Math.min(1, dt * accel); st.u = Math.min(1, st.u + st.v * dt / len);
    const p = curve.getPoint(st.u), q = curve.getPoint(Math.min(1, st.u + 0.01));
    obj.position.set(p.x, gy(game, p.x, p.z) + Math.abs(Math.sin(t * 7)) * 0.015, p.z);
    obj.rotation.y += wrap(Math.atan2(q.x - p.x, q.z - p.z) - obj.rotation.y) * Math.min(1, dt * 2);
    obj.userData.sway = Math.sin(t * 2.1) * 0.012 * (st.v / Math.max(1, speed));
    for (const w of obj.userData.wheels || []) w.rotation.x += st.v * dt / 0.55;
    onStep?.(st, dt);
    if (st.u >= 1) { st.done = true; return false; }
  });
  return st;
}
function seatSquad(game, truck) {
  const scene = game.renderer.scene; const sq = game.squad;
  const seat = (a, x, z, yaw) => { scene.remove(a.actor.root); truck.add(a.actor.root); a.actor.root.position.set(x, 1.36, z); a.yaw = yaw; a.actor.root.rotation.y = yaw; a.pose('sit'); a.actor.target.sit = 1; };
  seat(sq.yoon, 0.75, -0.4, -Math.PI / 2); seat(sq.doyun, 0.75, -1.6, -Math.PI / 2); seat(sq.jung, -0.75, -0.2, Math.PI / 2);
}
function unseatSquad(game, truck, at) {
  const scene = game.renderer.scene; const sq = game.squad;
  [sq.yoon, sq.jung, sq.doyun].forEach((a, i) => { if (a.actor.root.parent === truck) truck.remove(a.actor.root); scene.add(a.actor.root); const x = at.x + (i - 1) * 1.6, z = at.z + 1 + (i % 2); a.actor.root.position.set(x, game.level.hf(x, z), z); a.unpose(); });
}
function place(game, a, x, z) { a.actor.root.position.set(x, gy(game, x, z), z); }
function squadToLine(game) {
  const sq = game.squad;
  sq.yoon.setPassive(false); sq.jung.setPassive(false);
  sq.yoon.hold(V(-3.5, 0, 25), V(-3, 0, -30)); sq.jung.hold(V(13.5, 0, 25.4), V(10, 0, -30));
  sq.doyun.setPassive(true); sq.doyun.hold(V(R.cmd.x + 2, 0, R.cmd.z + 4.5)); sq.doyun.pose('sit');
}
function ensureSupport(game) { if (!game.support) game.support = new FireSupport(game, { calls: 2, rounds: 6, caller: 'seoyeon' }); }

export async function build(game) {
  setEnemyMix({ kpa: 0.75, kpa_sfb: 0.15, kpa_officer: 0.1 });   // enemy unit types for this mission (uniform / gear)
  const lv = new HantanRiver(game); game.level = lv; await lv.build();
  const d = game.director; d.visionRange = 70;
  game.squad = {
    yoon: d.spawn({ team: 'friendly', name: '윤태호', pos: V(-2, 0, 60), invulnerable: true, accuracy: 1.2, followOffset: V(-2.2, 0, 2.5) }),
    jung: d.spawn({ team: 'friendly', name: '정경수', pos: V(2, 0, 60), invulnerable: true, accuracy: 1.1, followOffset: V(2.2, 0, 3) }),
    doyun: d.spawn({ team: 'friendly', name: '박도윤', pos: V(0, 0, 62), invulnerable: true, accuracy: 0.8, weapon: false, followOffset: V(1.2, 0, 2) }),
  };
  game.squad.doyun.setPassive(true);
  for (const k of ['yoon', 'jung', 'doyun']) game.dialogue.bindSpeaker(k, game.squad[k]);
  game.squadList = [{ id: 'yoon', rank: 'SSG', name: '윤태호', status: '' }, { id: 'doyun', rank: 'CPL', name: '박도윤', status: '부상 · 후송 대기' }, { id: 'jung', rank: 'SGT', name: '정경수', status: '' }];
  game.audio.startWind(0.06);
  // the bridge MG nest
  const n = R.mgNest;
  lv.mg = new MountedWeapon(game, { kind: 'mg', pos: V(n.x, lv.hf(n.x, n.z) + 0.95, n.z - 0.3), yaw: 0, yawRange: 1.25, pitchRange: [-0.42, 0.3], prompt: '거치 기관총 사용' });
  game.mounted.push(lv.mg);
  // resupply from ammo points and dropped enemy weapons
  game.mission.every(() => {
    const p = game.player.position;
    for (const a of d.agents) if (a.team === 'enemy' && a.dead && a.ammoDrop === undefined) a.ammoDrop = true;
    for (const a of d.agents) if (a.ammoDrop && a.dead && a.position.distanceTo(p) < 1.8) { a.ammoDrop = false; const got = game.weapons.addAmmo('rifle', 45); if (got > 0) game.ui.hint(`탄약 +${got}`, 1.5); }
    for (const ap of lv.ammoPos) if (ap.distanceTo(p) < 2 && (lv.ammoT ?? 0) <= m03time(game)) { lv.ammoT = m03time(game) + 20; game.weapons.refill(); game.ui.hint('탄약 보급', 1.5); }
  });
  let barkT = 0;
  game.mission.every((dt) => {
    barkT -= dt; if (barkT > 0 || !d.enemies().some((e) => e.state === 'combat')) return;
    barkT = 8 + Math.random() * 6;
    const lines = [['yoon', '탄 아껴 쏴! 조명탄 떨어질 때 노려!'], ['jung', '사격 중!'], ['yoon', '강가에 붙은 놈들 먼저!'], ['jung', '재장전! 엄호!'], ['yoon', '머리 숙여, 민재!'], ['jung', '저기, 다리 위에!']];
    const l = lines[Math.floor(Math.random() * lines.length)]; game.dialogue.bark(l[0], l[1]);
  });
}
const m03time = (game) => game.mission?.time ?? 0;

// ------------------------------------------------------------------
export const SEGMENTS = [
  // ============ 0. NIGHT CONVOY TO THE RIVER ============
  {
    id: 'convoy',
    async setup(game) {
      giveLoadout(game); game.weapons.lowered = true;
      const lv = game.level, truck = lv.truck;
      truck.position.set(0.8, lv.hf(0.8, 200), 200); truck.rotation.y = Math.PI;
      seatSquad(game, truck);
      game.player.enterSeat(truck, { offset: V(-0.75, 2.62, -0.9), yawBase: -Math.PI / 2, yawRange: 1.9, pitchRange: [-0.5, 0.45] });
      game.engine = game.audio.engineLoop('truck'); game.engine?.set(0.5, 0.35);
      game.audio.setMusic('cinematic');
    },
    async run(game, m) {
      const lv = game.level, truck = lv.truck;
      game.cine.letterbox(true);
      game.cine.title('FALLING FRONT', '2029. 03. 15  02:10 KST\n한탄강 전방 방어선\n제7보병사단 3대대', 7);
      const ride = driver(game, m, truck, [[0.8, 200], [1, 170], [1.5, 140], [2, 110], [1.5, 80], [1, 56]], { speed: 7, onStep: () => game.engine?.setPos(truck.position) });
      await m.wait(5);
      await m.talk([
        ['doyun', '…비까지 오네. 팔 쑤신다.'],
        ['jung', '후송 차량 오면 바로 태워 보낸다. 조금만 버텨라.'],
        ['doyun', '내 빠지면 이 분대 누가 웃기노. 민재 니가 할 끼가?'],
        ['minjae', '…노력해 보겠습니다.'],
        ['doyun', '봐라, 벌써 재미없다.'],
        ['seoyeon', '3분대, 이서연입니다. 한탄대교 방어선에 합류하십시오. …중사님, 오늘 밤 들어오는 명령 전문은 반드시 저를 거쳐서 확인해 주세요.', { radio: true }],
        ['yoon', '서명 이상 건 말입니까.', { radio: true }],
        ['seoyeon', '네. 같은 형식이 두 건 더 나왔습니다. 전부 \'사단장 직접 명령\'입니다.', { radio: true }],
      ]);
      await m.until(() => ride.done, 120);
      await m.say('driver', '대교 남단 도착! 내리십시오, 여기부터 조명 금지입니다!', { priority: 2 });
      game.cine.letterbox(false); game.audio.setMusic('ambient'); game.engine?.set(0.2, 0.3);
      game.player.exitSeat(truck.position.clone().add(V(-2.6, 0, 1))); game.player.yaw = 0; game.weapons.lowered = false;
      unseatSquad(game, truck, truck.position.clone().add(V(0, 0, 4)));
    },
  },

  // ============ 1. THE ORDER, THE THERMAL SIGHT, THE CHOICE ============
  {
    id: 'command',
    async setup(game) {
      giveLoadout(game); const lv = game.level;
      lv.truck.position.set(1, lv.hf(1, 56), 56); lv.truck.rotation.y = Math.PI;
      game.player.teleport(V(-2, lv.hf(-2, 54), 54), 0);
      unseatSquad(game, lv.truck, V(1, 0, 58));
    },
    async run(game, m) {
      const lv = game.level, sq = game.squad;
      sq.yoon.follow(game.player); sq.jung.follow(game.player); sq.doyun.follow(game.player, V(1.5, 0, 3));
      const door = V(R.cmd.x, 0, R.cmd.z + 3.6);
      game.objectives.add('cp', '전방지휘소에 도착 보고', { marker: door.clone().setY(lv.hf(door.x, door.z) + 1) });
      await m.reach(door, 4);
      game.objectives.complete('cp');
      sq.doyun.hold(V(R.cmd.x + 2, 0, R.cmd.z + 4.5)); m.spawn(async () => { await m.wait(3); sq.doyun.pose('sit'); });
      // the order comes over the battalion net
      await m.talk([
        ['tac', '전 예비대에 하달. 적 기갑 대대 규모, 서쪽 여울로 도하 중. 예비 중대는 즉시 서쪽 여울로 이동하라. 사단장 직접 명령이다.', { radio: true, priority: 3 }],
        ['yoon', '…서쪽 여울? 거기는 지금 수심이 허리까지 찹니다. 전차가 건널 데가 아닌데.', { priority: 3 }],
      ]);
      // the reserve leaves the line
      const reserve = [buildTruck(), buildTruck()]; const scene = game.renderer.scene;
      reserve.forEach((t, i) => { t.position.set(-1 - i * 2, lv.hf(-1, 64 + i * 10), 64 + i * 10); t.rotation.y = 0; scene.add(t); driver(game, m, t, [[-1 - i * 2, 64 + i * 10], [0, 95 + i * 8], [-12, 118], [-70, 112], [-160, 110]], { speed: 9 }); });
      const eng = game.audio.engineLoop('truck'); eng?.set(0.6, 0.4); m.every(() => { eng?.setPos(reserve[0].position); if (reserve[0].position.x < -150) { eng?.stop(); return false; } });
      await m.say('jung', '예비 중대가 빠진다… 정면은 우리 소대뿐이야.', { priority: 2 });
      await m.say('yoon', '민재. 열상 장비로 서쪽 여울 확인해 봐. 정말 기갑이 있는지.', { priority: 3 });
      game.objectives.add('thermal', '열상 관측장비로 서쪽 여울 확인', { marker: lv.thermalPos });
      await interact(game, { pos: lv.thermalPos, prompt: '열상 관측장비 보기', radius: 2.2 });
      // ---- thermal view ----
      const p = game.player; const canvas = game.renderer.renderer.domElement;
      const ov = document.createElement('div'); ov.className = 'thermal-ov'; ov.innerHTML = '<div class="ret"></div><div class="lbl">THERMAL · WHT · ×4 &nbsp; 방위 270°</div><div class="rec">● REC</div>';
      game.ui.hud.appendChild(ov);
      const c = lv.ghosts.reduce((a, t) => a.add(t.position), V(0, 0, 0)).multiplyScalar(1 / lv.ghosts.length).add(V(0, 1.4, 0));
      p.teleport(V(lv.thermalPos.x + 0.9, lv.hf(lv.thermalPos.x + 0.9, lv.thermalPos.z), lv.thermalPos.z), 0);
      const to = c.clone().sub(p.eyePos(V(0, 0, 0))); p.yaw = Math.atan2(-to.x, -to.z); p.pitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
      p.fovOverride = 16; game.weapons.hidden = true; canvas.style.filter = 'grayscale(1) contrast(1.35) brightness(1.15)'; lv.setThermal(true);
      game.objectives.complete('thermal');
      await m.talk([
        ['minjae', '…보입니다. 여울 건너편에 전차… 여섯 대.', { priority: 3 }],
        ['yoon', '확실하냐.', { priority: 3 }],
        ['minjae', '엔진 열이 선명합니다. 방금까지 움직이고 있었…', { priority: 3 }],
      ]);
      // the decoy drops out — all six at once
      let ft = 0; await new Promise((res) => m.every((dt) => { ft += dt; for (const t of lv.ghosts) t.visible = ft < 1.6 ? Math.random() < 0.5 : false; if (ft >= 1.7) { res(); return false; } }));
      lv.ghostsGone = true; game.audio.click(0.2, 300, 0.3);
      await m.talk([
        ['minjae', '…사라졌습니다. 여섯 대가 한꺼번에.', { priority: 3 }],
        ['seoyeon', '…저도 봤습니다. 열상 신호 여섯 개가 0.2초 간격으로 동시에 꺼졌어요. GOP 감지 센서 때와 똑같은 패턴입니다.', { radio: true, priority: 3 }],
        ['jung', '그럼… 저기엔 아무것도 없다는 거야?', { priority: 3 }],
      ]);
      canvas.style.filter = ''; p.fovOverride = null; game.weapons.hidden = false; lv.setThermal(false); ov.remove();
      // ---- the choice ----
      await m.say('yoon', '민재. 네가 직접 봤다. 명령대로 서쪽으로 가냐, 여기 남냐.', { priority: 3 });
      const k = hintKeys(game); const box = document.createElement('div'); box.className = 'choice-box';
      box.innerHTML = `<div class="tag">결정 // 윤태호 중사에게</div><div class="opt">${k('weapon1')} 명령대로 서쪽 여울로 가야 합니다</div><div class="opt">${k('weapon2')} 저건 가짜입니다. 교량에 남아야 합니다</div>`;
      game.ui.hud.appendChild(box);
      let choice = null; const t0 = m.time;
      await m.until(() => { if (game.input.pressed('weapon1')) choice = 'follow'; else if (game.input.pressed('weapon2')) choice = 'stay'; return choice || m.time - t0 > 20; });
      choice ||= 'stay'; box.remove(); saves.setFlag('m03_choice', choice);
      if (choice === 'follow') await m.talk([
        ['minjae', '…명령은 명령입니다, 중사님.', { priority: 3 }],
        ['yoon', '그래. 맞는 말이다. 군인은 그래야지.', { priority: 3 }],
        ['yoon', '…그런데 저 다리 뒤엔 연서시가 있다. 우리 분대는 남는다. 책임은 내가 진다.', { priority: 3 }],
      ]);
      else await m.talk([
        ['minjae', '저건 가짜입니다. 여기 남아야 합니다.', { priority: 3 }],
        ['yoon', '…나도 같은 걸 봤다. 분대는 교량에 남는다.', { priority: 3 }],
      ]);
      await m.talk([
        ['yoon', '지휘소, 3분대장. 3분대는 한탄대교 정면에 잔류합니다.', { radio: true, priority: 3 }],
        ['tac', '…3분대, 명령 불복으로 기록한다.', { radio: true, priority: 3 }],
        ['yoon', '기록하십시오.', { radio: true, priority: 3 }],
        ['yoon', '진지로! 정경수 우측, 나는 좌측. 민재, 기관총 진지 맡아!', { priority: 3 }],
      ]);
    },
  },

  // ============ 2. FLARES OVER THE RIVER: BOAT ASSAULT ============
  {
    id: 'assault',
    async setup(game) {
      giveLoadout(game); const lv = game.level;
      lv.truck.position.set(1, lv.hf(1, 56), 56); lv.ghostsGone = true;
      game.player.teleport(V(R.mgNest.x - 1, lv.hf(R.mgNest.x - 1, 30), 30), 0);
      unseatSquad(game, lv.truck, V(0, 0, 32));
    },
    async run(game, m) {
      const lv = game.level, sq = game.squad;
      squadToLine(game);
      game.objectives.add('mgpos', '교량 기관총 진지로 이동', { marker: lv.mg.seatWorld() });
      await m.until(() => lv.mg.manned || game.player.position.distanceTo(lv.mg.seatWorld()) < 4, 60);
      game.objectives.complete('mgpos');
      lv.war = true; game.audio.setMusic('tension');
      lv.flare(V(-10, 60, -40));
      await m.talk([
        ['jung', '조명탄! 강 위에— 보트다!', { priority: 3 }],
        ['seoyeon', '대교 정면! 적 도하 시작 — 고무보트 다수, 북안에 보병 화기 진지!', { radio: true, priority: 3 }],
      ]);
      game.audio.setMusic('combat');
      const north = spawnEnemies(game, [[-18, -30], [14, -31], [-36, -33], [32, -34], [-6, -41], [8, -42], [-28, -48], [24, -52]], { state: 'combat', accuracy: 0.55, visionRange: 120 });
      attackOrder(game, north, game.player);
      const landed = [];
      const boats = []; const resolved = (b) => b.dead || b.landed;
      game.objectives.add('boats', '도하 저지 — 고무보트 격침', { count: 6 });
      m.bind(events.on('boat:sunk', ({ boat }) => { if (boats.includes(boat)) game.objectives.progress('boats'); }));
      m.bind(events.on('boat:landed', ({ boat }) => { if (boats.includes(boat)) { game.objectives.progress('boats'); m.spawn(() => m.say('yoon', '상륙했다! 강가에 붙은 놈들 정리해!', { priority: 3 })); } }));
      const launch = (x, delay = 0, speed = 2.6) => {
        const b = new EnemyBoat(game, { from: V(x, 0, -13.5), to: V(x + (Math.random() - 0.5) * 4, 0, 13.2), water: R.water + 0.05, speed, delay,
          onLand: (pts) => { const es = pts.map((pp, i) => game.director.spawn({ team: 'enemy', pos: V(pp.x + (i - 1) * 1.2, 0, 17.6 + i * 0.6), state: 'combat', accuracy: 0.8 })); attackOrder(game, es, game.player); landed.push(...es); } });
        boats.push(b); return b;
      };
      // wave A
      launch(-26, 0); launch(22, 3);
      m.spawn(async () => { await m.wait(4); if (!lv.mg.manned) game.ui.hint('거치 기관총이 보트를 가장 빨리 가라앉힙니다. 과열에 주의하십시오.', 6); });
      await m.until(() => boats.every(resolved), 70);
      lv.flare(V(20, 58, -30));
      // mortar support by binoculars
      ensureSupport(game);
      await m.say('seoyeon', '대대 박격포 두 번 쓸 수 있습니다! 북안 화기 진지에 좌표 주십시오!', { radio: true, priority: 3 });
      game.support.announce();
      // wave B + rush over the bridge
      launch(-48, 0, 2.8); launch(44, 2.5, 2.8);
      const rush = spawnEnemies(game, [[-2, -27], [2, -26], [0, -24, { role: 'flanker' }], [-3, -22]], { state: 'combat', accuracy: 0.8 });
      attackOrder(game, rush, game.player);
      await m.say('jung', '다리 위로도 온다! 차량 뒤!', { priority: 3 });
      await m.until(() => boats.every(resolved), 80);
      // wave C
      lv.flare(V(-30, 60, -20));
      await m.say('seoyeon', '보트 두 척 더! 동쪽과 서쪽 끝!', { radio: true, priority: 3 });
      launch(-12, 0, 3); launch(36, 1.5, 3);
      await m.until(() => boats.every(resolved), 80);
      for (const b of boats) if (!resolved(b)) b.sink();
      await m.until(() => [...landed, ...rush].every((e) => e.dead), 90);
      for (const e of [...landed, ...rush]) if (!e.dead) e.kill(game.player.position);
      game.objectives.complete('boats');
      game.audio.setMusic('tension');
    },
  },

  // ============ 3. CHARGES ON THE BRIDGE, THE TANK ============
  {
    id: 'demolition',
    async setup(game) {
      giveLoadout(game); const lv = game.level; lv.ghostsGone = true; lv.war = true;
      lv.truck.position.set(1, lv.hf(1, 56), 56);
      game.player.teleport(V(3, lv.hf(3, 31), 31), 0);
      unseatSquad(game, lv.truck, V(0, 0, 33)); squadToLine(game); ensureSupport(game);
      const north = spawnEnemies(game, [[-18, -30], [14, -31], [-36, -33], [32, -34]], { state: 'combat', accuracy: 0.55, visionRange: 120 }); attackOrder(game, north, game.player);
    },
    async run(game, m) {
      const lv = game.level, sq = game.squad, scene = game.renderer.scene;
      if (lv.mg.manned) lv.mg.dismount();
      await m.talk([
        ['engineer', '…여기 공병 2소대! 폭약 설치조가 당했다! 장약은 남단 상자에 있다 — 누가 대신 설치해 줘야 한다!', { radio: true, priority: 3 }],
        ['yoon', '민재, 나랑 간다! 정경수, 다리 북단 엄호!', { priority: 3 }],
      ]);
      sq.yoon.setPassive(false); sq.yoon.moveTo(V(-2.5, 0, 12), { run: true, onArrive: (a) => a.hold(V(-2.5, 0, 12), V(0, 0, -30)) });
      const charges = R.charges.map((c) => c.clone());
      game.objectives.add('charges', '중앙 경간에 폭약 설치', { count: 3, markers: charges.map((c) => c.clone().setY(c.y + 0.4)) });
      const cm = new THREE.MeshStandardMaterial({ color: 0x4a4a30, roughness: 0.7 }); const ledM = new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false });
      const rushers = spawnEnemies(game, [[-2, -26], [2.5, -24], [0, -22]], { state: 'combat', accuracy: 0.75 }); attackOrder(game, rushers, game.player);
      let placed = 0; const pending = charges.map((c, i) => interact(game, { pos: c.clone().setY(c.y + 0.5), prompt: '폭약 설치', hold: 2.4, radius: 2.2 }).then(() => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.3), cm); box.position.copy(c).setY(c.y + 0.11); scene.add(box);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), ledM); led.position.set(0.12, 0.13, 0.1); box.add(led);
        placed++; game.objectives.progress('charges'); game.audio.click(0.3, 900, 0.1);
        const rest = charges.length - placed; if (rest > 0) game.ui.hint(`폭약 설치 — 남은 위치 ${rest}`, 2);
        if (i === 0) m.spawn(() => m.say('yoon', '좋아, 다음!', { priority: 2 }));
      }));
      // more pressure while the player is out on the deck
      m.spawn(async () => { await m.until(() => placed >= 1, 120); const more = spawnEnemies(game, [[-3, -27], [3, -27], [0, -25]], { state: 'combat', accuracy: 0.7 }); attackOrder(game, more, game.player); lv.flare(V(0, 60, -25)); });
      await Promise.all(pending);
      game.objectives.complete('charges');
      await m.say('yoon', '설치 끝! 기폭 장치로 뛰어!', { priority: 3 });
      sq.yoon.moveTo(V(-3.5, 0, 25), { run: true, onArrive: (a) => a.hold(V(-3.5, 0, 25), V(0, 0, -30)) });
      game.objectives.add('det', '기폭 장치로 복귀', { marker: R.detonator.clone().setY(lv.hf(R.detonator.x, R.detonator.z) + 0.8) });
      await m.reach(R.detonator, 3);
      game.objectives.complete('det');
      // ---- the tank ----
      const tank = lv.buildTank(); scene.add(tank); tank.position.set(-4, lv.hf(-4, -125), -125);
      const tankV = { isVehicle: true, position: tank.position, radius: 3, dead: false, hp: 1e9, damage: () => false, update() {}, remove() { scene.remove(tank); },
        rayTest(o, d, max) { tank.updateMatrixWorld(true); const inv = tank.matrixWorld.clone().invert(); const lo = o.clone().applyMatrix4(inv), ld = d.clone().transformDirection(inv); const h = new THREE.Ray(lo, ld).intersectBox(new THREE.Box3(V(-1.9, 0.4, -3.4), V(1.9, 2.8, 3.5)), new THREE.Vector3()); if (!h) return null; const dist = h.distanceTo(lo); return dist > max ? null : { dist, point: h.applyMatrix4(tank.matrixWorld) }; } };
      game.director.vehicles.push(tankV);
      const tEng = game.audio.engineLoop('truck'); tEng?.set(0.9, 0.25);
      const run = driver(game, m, tank, [[-4, -125], [-5, -95], [-1, -62], [0, -32], [0, -2]], { speed: 4.2, accel: 0.4, onStep: () => tEng?.setPos(tank.position) });
      const escort = spawnEnemies(game, [[-3, -112], [3, -110], [-2, -104]], { state: 'idle' });
      escort.forEach((e, i) => m.every(() => { if (e.dead || run.done) return false; if (e.state !== 'combat') e.moveTo(tank.position.clone().add(V((i - 1) * 2, 0, -6)), { run: false }); }));
      await m.talk([
        ['seoyeon', '적 전차 한 대, 북쪽 도로로 교량 접근 중!', { radio: true, priority: 3 }],
        ['yoon', '기다려… 놈이 중앙 경간에 올라설 때까지 기다려라, 민재!', { priority: 3 }],
      ]);
      game.objectives.add('blow', '전차가 중앙 경간에 들어서면 기폭', { marker: R.detonator.clone().setY(lv.hf(R.detonator.x, R.detonator.z) + 0.8) });
      // main gun: rounds land near the bank while it closes in
      let gunT = 5;
      m.every((dt) => {
        if (tankV.dead) { tEng?.stop(); return false; }
        const tur = tank.userData.turret; const tp = game.player.position; const yawTo = Math.atan2(tp.x - tank.position.x, tp.z - tank.position.z) - tank.rotation.y; tur.rotation.y += wrap(yawTo - tur.rotation.y) * Math.min(1, dt * 0.8);
        gunT -= dt; if (gunT <= 0 && tank.position.z > -70) {
          gunT = 6 + Math.random() * 3; const mz = tank.userData.gun.getWorldPosition(new THREE.Vector3()).add(V(0, 0, 0)); game.effects.muzzleFlash(mz, V(0, 0, 1)); game.effects.flashLight(mz, 0xffb060, 12, 0.1, 30); game.audio.explosion(mz, 0.7);
          const aim = tp.clone().add(V((Math.random() - 0.5) * 12, 0, (Math.random() - 0.3) * 10));
          m.spawn(() => shell(game, m, aim, { delay: 0.25, safeRadius: 7, damage: 55, scale: 1.4 }));
        }
      });
      await m.until(() => run.done || tank.position.z > R.bridge.mid[0] + 1, 240);
      game.ui.hint('<b>지금!</b> 기폭 장치를 누르십시오', 4);
      await interact(game, { pos: R.detonator.clone().setY(lv.hf(R.detonator.x, R.detonator.z) + 0.4), prompt: '기폭', radius: 2.4 });
      lv.plunger.position.y -= 0.2;
      for (const [i, c] of charges.entries()) setTimeout(() => game.combat.explode(c.clone(), { radius: 7, damage: 300, scale: 2.2, owner: 'player', playerSafe: true }), i * 180);
      await m.wait(0.5);
      lv.dropMidSpan(); tankV.dead = true;
      // the tank goes down with the span
      let tt = 0; const t0 = tank.position.clone();
      m.every((dt) => { tt += dt; const k = Math.min(1, tt / 1.6); tank.position.y = t0.y - k * k * 6.5; tank.rotation.x = -k * 0.5; if (k >= 1) { game.effects.explosion(V(tank.position.x, R.water + 0.3, tank.position.z), 1.8); game.audio.explosion(tank.position, 1.2); return false; } });
      for (const e of game.director.enemies()) if (Math.abs(e.position.x) < 6 && Math.abs(e.position.z) < 30) e.kill(V(0, 0, 0));
      game.objectives.complete('blow');
      game.player.addShake(1); game.audio.tinnitus(0.6);
      await m.wait(2.5);
      await m.talk([
        ['jung', '다리가… 끊겼다!', { priority: 3 }],
        ['yoon', '…끊었다. 이걸로 시간은 벌었다.', { priority: 3 }],
      ]);
      await m.until(() => game.director.enemies().filter((e) => e.position.z > -20).length === 0, 40);
    },
  },

  // ============ 4. THE FRONT COLLAPSES — CASEVAC ============
  {
    id: 'casevac',
    async setup(game) {
      giveLoadout(game); const lv = game.level; lv.ghostsGone = true; lv.war = true;
      lv.dropMidSpanInstant = true; lv.midSpan.visible = false; for (const c of lv.bridgeCols.mid) game.world.removeCollider(c);
      game.player.teleport(V(-6, lv.hf(-6, 40), 40), Math.PI);
      lv.truck.position.set(1, lv.hf(1, 56), 56);
      unseatSquad(game, lv.truck, V(-4, 0, 42));
      game.squad.doyun.unpose(); place(game, game.squad.doyun, R.cmd.x + 2, R.cmd.z + 4.5);
    },
    async run(game, m) {
      const lv = game.level, sq = game.squad;
      await m.talk([
        ['tac', '…전 부대. 서쪽 여울 접촉 없음. 반복, 서쪽 여울 적 없음. 적 주력은… 동측 철교와 정면—', { radio: true, priority: 3 }],
        ['seoyeon', '중사님! 동쪽 방어선이 무너졌습니다. 적이 남쪽으로 우회하고 있어요. 후송 지점으로 철수하십시오, 지금!', { radio: true, priority: 3 }],
        ['yoon', '도윤이 데리고 후송 지점까지 간다. 민재, 도윤이 옆에 붙어!', { priority: 3 }],
      ]);
      sq.doyun.unpose(); sq.doyun.follow(game.player, V(1.2, 0, 1.6));
      sq.yoon.setPassive(false); sq.jung.setPassive(false); sq.yoon.follow(game.player); sq.jung.follow(game.player);
      game.audio.setMusic('combat');
      game.objectives.add('casevac', '박도윤을 후송 지점까지 엄호', { marker: R.evac.clone().setY(lv.hf(R.evac.x, R.evac.z) + 1) });
      game.squadList.find((s) => s.id === 'doyun').status = '후송 중';
      // shelling walks along the road behind them
      m.spawn(async () => { while (!game.objectives.get('casevac')?.done) { const p = game.player.position; await shell(game, m, V(p.x + (Math.random() - 0.5) * 30, 0, p.z - 10 - Math.random() * 25), { delay: 3 + Math.random() * 3, safeRadius: 11, damage: 45 }); } });
      // east flank breaks in among the houses
      await m.until(() => game.player.position.z > 68, 120);
      const east = spawnEnemies(game, [[48, 84], [54, 92], [44, 100], [58, 76, { role: 'flanker' }]], { state: 'combat', accuracy: 0.8 }); attackOrder(game, east, game.player);
      await m.say('jung', '동쪽 밭! 우회조다!', { priority: 3 });
      await m.until(() => game.player.position.z > 108, 180);
      const west = spawnEnemies(game, [[-48, 116], [-56, 124], [-44, 132]], { state: 'combat', accuracy: 0.8 }); attackOrder(game, west, game.player);
      await m.say('yoon', '좌측에도! 멈추지 마, 계속 이동!', { priority: 3 });
      await m.until(() => game.player.position.distanceTo(R.evac) < 10 && sq.doyun.position.distanceTo(R.evac) < 14, 240);
      game.objectives.complete('casevac');
      // ---- loading the casevac truck ----
      const truck = lv.medevac; const rear = truck.localToWorld(V(0, 0, -5));
      sq.doyun.moveTo(rear, { onArrive: (a) => { a.actor.setVisible(false); a.invisible = true; } });
      game.objectives.add('hold', '후송 트럭 출발까지 엄호', { marker: R.evac.clone().setY(lv.hf(R.evac.x, R.evac.z) + 1) });
      await m.talk([
        ['doyun', '민재야.', { priority: 3 }],
        ['doyun', '카페 계약… 잊지 마래이. 바다 보이는 데로.', { priority: 3 }],
        ['minjae', '…네. 연서시에서 뵙겠습니다, 상병님.', { priority: 3 }],
        ['doyun', '커피는 니가 내리는 기다.', { priority: 3 }],
      ]);
      await m.until(() => sq.doyun.invisible, 20);
      if (!sq.doyun.invisible) { sq.doyun.actor.setVisible(false); sq.doyun.invisible = true; }
      game.squadList = game.squadList.filter((s) => s.id !== 'doyun');
      const north = spawnEnemies(game, [[-4, 112], [5, 108], [-9, 104], [8, 100], [0, 96, { role: 'flanker' }]], { state: 'combat', accuracy: 0.85 }); attackOrder(game, north, game.player);
      await m.say('yoon', '도로 북쪽! 트럭 출발할 때까지 막아!', { priority: 3 });
      const eng = game.audio.engineLoop('truck'); eng?.set(0.7, 0.45);
      const go = driver(game, m, truck, [[1.8, 152], [1.6, 168], [1, 186], [0.5, 204]], { speed: 6, accel: 0.3, onStep: () => eng?.setPos(truck.position) });
      await m.until(() => truck.position.z > 176, 60);
      // the road ahead of the truck is shelled — it drives into the smoke
      for (let i = 0; i < 4; i++) m.spawn(() => shell(game, m, V((Math.random() - 0.5) * 8, 0, 186 + i * 5), { delay: i * 0.5, safeRadius: 30, damage: 30, scale: 2 }));
      game.effects.smokeColumn(V(0, 2, 192), 2.4, [0.16, 0.16, 0.16]); game.effects.smokeColumn(V(4, 2, 198), 2, [0.18, 0.17, 0.16]);
      await m.say('medevac', '후송 1호, 포격 구간 진입한다— 지직—', { radio: true, priority: 3 });
      await m.until(() => go.done, 30); truck.visible = false; eng?.stop();
      await m.talk([
        ['seoyeon', '후송 1호, 응답하십시오. 후송 1호!', { radio: true, priority: 3 }],
        ['jung', '…연기 때문에 아무것도 안 보여.', { priority: 3 }],
      ]);
      await m.until(() => north.every((e) => e.dead) && game.director.enemies().filter((e) => e.position.z > 60).length <= 1, 120);
      game.objectives.complete('hold');
      // ---------------- ENDING ----------------
      game.audio.setMusic('cinematic'); game.cine.letterbox(true);
      for (const e of game.director.enemies()) e.kill(game.player.position);
      await m.talk([
        ['seoyeon', '…중사님. 서쪽 여울 이동 명령 말입니다.', { radio: true, priority: 3 }],
        ['seoyeon', '그 명령… 우리 사단 서명이 아니었습니다.', { radio: true, priority: 3 }],
        ['yoon', '…그럼 누구 서명입니까.', { radio: true, priority: 3 }],
        ['seoyeon', '어느 부대 기록에도 없는 코드입니다. 존재하지 않는 서명이에요.', { radio: true, priority: 3 }],
        ['yoon', '도윤이는.', { radio: true, priority: 3 }],
        ['seoyeon', '후송 1호… 아직 응답이 없습니다. 실종으로… 분류됩니다.', { radio: true, priority: 3 }],
        ['minjae', '……', { priority: 3, duration: 2.4 }],
        ['yoon', '…아직 끝난 거 아니다. 찾는다. 반드시.', { priority: 3 }],
      ]);
      await m.wait(1.5);
      events.emit('ui:fade', { to: 1, dur: 2.5 }); await m.wait(3);
      game.cine.title('FALLING FRONT', 'MISSION 03 COMPLETE', 5, 'center');
      game.audio.setMusic('ending');
      await m.wait(5.5);
    },
  },
];
