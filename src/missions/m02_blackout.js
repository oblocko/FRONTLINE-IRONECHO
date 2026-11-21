// MISSION 02 — BLACKOUT (블랙아웃)
// POV: PVT Han Min-jae. 2029-03-14 09:30 KST, Yeonseo City (fictional), power and comms down.
// Events: convoy ride · pushing a car out of a jam · kamikaze-drone swarm · recon drone
// spotting for enemy mortars · dark subway station by flashlight · forcing a shutter ·
// defusing a timed charge · leading civilians · bus escort from a truck-mounted MG ·
// overpass collapse.
import * as THREE from 'three';
import { setEnemyMix } from '../ai/CharacterLib.js';
import { YeonseoCity, CITY } from '../world/levels/YeonseoCity.js';
import { buildTruck } from '../world/Props.js';
import { events } from '../core/Events.js';
import { keyName } from '../player/Player.js';
import { MountedWeapon } from '../gameplay/MountedWeapon.js';
import { EnemyVehicle } from '../gameplay/EnemyVehicle.js';
import { Drone } from '../gameplay/Drone.js';
import { Jammer } from '../gameplay/Jammer.js';
import { V, spawnEnemies, attackOrder, spawnCivilians, squadFollow, hintKeys, giveLoadout, shell, interact } from './common.js';

export const TEXTURES = ['concrete', 'asphalt', 'dirt', 'metal', 'paintedMetal', 'corrugated', 'wood', 'fabric', 'camoROK', 'camoEnemy', 'sandbag'];
export const EPILOGUE = '연서시 시민 3만 2천 명이 그날 오후까지 남쪽으로 빠져나갔다. 시장 구역은 저녁 무렵 불길에 잠겼다. 이서연 중위는 그날 밤, 사단 명령 전문 열한 건 중 세 건의 서명 방식이 다른 것과 미세하게 다르다는 사실을 처음 기록했다.';

export async function build(game) {
  setEnemyMix({ kpa_sf: 0.5, kpa_sfb: 0.3, kpa: 0.2 });   // enemy unit types for this mission (uniform / gear)
  const lv = new YeonseoCity(game); game.level = lv; await lv.build();
  const d = game.director; d.visionRange = 55;
  game.squad = {
    yoon: d.spawn({ team: 'friendly', name: '윤태호', pos: V(-3, 0, -205), invulnerable: true, accuracy: 1.2, followOffset: V(-2.2, 0, 2.5) }),
    jung: d.spawn({ team: 'friendly', name: '정경수', pos: V(-4, 0, -205), invulnerable: true, accuracy: 1.1, followOffset: V(2.2, 0, 3) }),
  };
  game.dialogue.bindSpeaker('yoon', game.squad.yoon); game.dialogue.bindSpeaker('jung', game.squad.jung);
  game.squadList = [{ id: 'yoon', rank: 'SSG', name: '윤태호', status: '' }, { id: 'jung', rank: 'SGT', name: '정경수', status: '' }];
  game.audio.startWind(0.04);
  lv.siren = game.audio.sirenLoop(0.035);
  // ambient: burning buildings and smoke over the market district (west)
  for (const [x, z, s] of [[-80, -60, 2.2], [-95, 40, 2.6], [70, -150, 1.6], [-70, 150, 1.8]]) game.effects.smokeColumn(V(x, 18, z), s, [0.18, 0.17, 0.16]);
  for (const [x, y, z] of [[-30.5, 14, -70], [30.6, 9, 95], [-30.5, 20, 140]]) game.effects.fireEmitter(V(x, y, z), 0.9);
  // dropped weapons give ammo
  game.mission.every(() => {
    for (const a of d.agents) if (a.team === 'enemy' && a.dead && a.ammoDrop === undefined) a.ammoDrop = true;
    for (const a of d.agents) if (a.ammoDrop && a.dead && a.position.distanceTo(game.player.position) < 1.8) { a.ammoDrop = false; const got = game.weapons.addAmmo('rifle', 45); if (got > 0) game.ui.hint(`탄약 +${got}`, 1.5); }
  });
  let barkT = 0;
  game.mission.every((dt) => {
    barkT -= dt; if (barkT > 0 || !d.enemies().some((e) => e.state === 'combat')) return;
    barkT = 8 + Math.random() * 6;
    const lines = [['yoon', '차 뒤로! 엔진 블록 뒤가 안전하다!'], ['jung', '사격 중!'], ['yoon', '옥상 확인해!'], ['jung', '재장전! 엄호!'], ['yoon', '민재, 앞으로 너무 나가지 마!']];
    const l = lines[Math.floor(Math.random() * lines.length)]; game.dialogue.bark(l[0], l[1]);
  });
}

function seatSquadInTruck(game, truck) {
  const scene = game.renderer.scene;
  const seat = (a, x, z, yaw) => { scene.remove(a.actor.root); truck.add(a.actor.root); a.actor.root.position.set(x, 1.36, z); a.yaw = yaw; a.actor.root.rotation.y = yaw; a.pose('sit'); a.actor.target.sit = 1; };
  seat(game.squad.yoon, 0.75, -0.4, -Math.PI / 2); seat(game.squad.jung, -0.75, -0.9, Math.PI / 2);
}
function unseatSquad(game, truck, at) {
  const scene = game.renderer.scene; const sq = game.squad;
  [sq.yoon, sq.jung].forEach((a, i) => { if (a.actor.root.parent === truck) truck.remove(a.actor.root); scene.add(a.actor.root); a.actor.root.position.set(at.x + (i ? 1.5 : -1.5), 0, at.z + 1); a.unpose(); a.follow(game.player); });
}
function giveJammer(game) { if (!game.gadget) game.gadget = new Jammer(game); }
function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
// drive a group along a curve; returns {done(), set(speed)} controller
function driver(game, m, obj, pts, { speed = 8, accel = 0.6, onStep = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => V(x, 0, z)));
  const len = curve.getLength(); const st = { u: 0, v: 0, target: speed, done: false };
  m.every((dt, t) => {
    st.v += (st.target - st.v) * Math.min(1, dt * accel); st.u = Math.min(1, st.u + st.v * dt / len);
    const p = curve.getPoint(st.u), q = curve.getPoint(Math.min(1, st.u + 0.01));
    obj.position.set(p.x, Math.abs(Math.sin(t * 7)) * 0.015, p.z);
    obj.rotation.y += wrap(Math.atan2(q.x - p.x, q.z - p.z) - obj.rotation.y) * Math.min(1, dt * 2);
    obj.userData.sway = Math.sin(t * 2.1) * 0.01 * (st.v / Math.max(1, speed));
    for (const w of obj.userData.wheels || []) w.rotation.x += st.v * dt / 0.55;
    onStep?.(st, dt);
    if (st.u >= 1) { st.done = true; return false; }
  });
  return st;
}

// ------------------------------------------------------------------
export const SEGMENTS = [
  // ============ 0. CONVOY INTO THE CITY ============
  {
    id: 'convoy',
    async setup(game) {
      giveLoadout(game); game.weapons.lowered = true;
      const lv = game.level, truck = lv.truck;
      truck.position.set(-3, 0, -215); truck.rotation.y = 0;
      seatSquadInTruck(game, truck);
      game.player.enterSeat(truck, { offset: V(-0.75, 2.62, -0.9), yawBase: -Math.PI / 2, yawRange: 1.9, pitchRange: [-0.5, 0.45] });
      game.engine = game.audio.engineLoop('truck'); game.engine?.set(0.5, 0.35);
      game.audio.setMusic('cinematic');
    },
    async run(game, m) {
      const lv = game.level, truck = lv.truck;
      game.cine.letterbox(true);
      game.cine.title('BLACKOUT', '2029. 03. 14  09:30 KST\n경기 북부 · 연서시\n제7보병사단 3대대 잔여 병력', 7);
      const ride = driver(game, m, truck, [[-3, -215], [-3, -170], [-2.5, -135], [-2.5, -122]], { speed: 7, onStep: () => { game.engine?.setPos(truck.position); } });
      await m.wait(4);
      // recon drone sighting overhead
      const recon = new Drone(game, { pos: V(-60, 45, -150), mode: 'recon', orbit: V(0, 0, -140), speed: 8 }); lv.firstRecon = recon;
      await m.talk([
        ['convoy', '연서시 진입한다. 전력, 통신 전부 나갔다. 신호등도 죽었어.', { radio: true }],
        ['jung', '…사람이 너무 많다. 다들 남쪽으로 걷고 있어.'],
        ['yoon', '우리 임무는 연서역 대피 지원이다. 역사에 시민이 갇혀 있다는 보고가 있었다.'],
        ['jung', '저기, 하늘. …드론이다.'],
        ['yoon', '정찰용이다. 우리를 보고 있어. 다들 고개 숙여.'],
        ['seoyeon', '순찰조, 여기 지휘통제실. 연서시 상공에 소형 무인기 다수 확인. 자폭형도 섞여 있습니다. 차량 이동 시 주의.', { radio: true }],
      ]);
      await m.until(() => ride.done);
      recon.remove();
      await m.say('convoy', '앞이 꽉 막혔다. 버려진 차들이야. 더는 못 간다.', { radio: true });
      game.cine.letterbox(false); game.audio.setMusic('ambient');
      game.player.exitSeat(truck.position.clone().add(V(-2.6, 0, 1))); game.player.yaw = Math.PI; game.weapons.lowered = false;
      unseatSquad(game, truck, truck.position.clone().add(V(0, 0, 6)));
    },
  },

  // ============ 1. CLEAR THE JAM, DRONE SWARM ============
  {
    id: 'jam',
    async setup(game) {
      giveLoadout(game); const truck = game.level.truck; truck.position.set(-2.5, 0, -122); truck.rotation.y = 0;
      game.player.teleport(V(-5.5, 0, -121), Math.PI); unseatSquad(game, truck, V(-2.5, 0, -116));
    },
    async run(game, m) {
      const lv = game.level, truck = lv.truck, sq = game.squad, k = hintKeys(game);
      const car = lv.jamCar;
      sq.yoon.moveTo(car.position.clone().add(V(-2.4, 0, -0.5)), { run: true, face: car.position }); sq.jung.moveTo(car.position.clone().add(V(-2.4, 0, 1.2)), { run: true, face: car.position });
      await m.say('yoon', '저 차부터 치운다. 민재, 같이 밀어!', { priority: 2 });
      game.objectives.add('push', '길을 막은 차량 밀어내기', { marker: car.position.clone().add(V(-2, 1, 0)) });
      await interact(game, { pos: car.position.clone().add(V(-2.2, 1, 0)), prompt: '차량 밀기', hold: 2.5, radius: 2.6 });
      game.audio.click(0.3, 400, 0.6);
      let pushed = 0; const col = car.userData.collider;
      await new Promise((res) => m.every((dt) => { const dx = Math.min(5.5 - pushed, dt * 2.2); pushed += dx; car.position.x += dx; car.rotation.y += dx * 0.06; game.world.moveCollider(col, dx, 0, 0); if (pushed >= 5.5) { res(); return false; } }));
      game.objectives.complete('push');
      await m.say('jung', '됐다! 길 열렸다!', { priority: 2 });
      // back on the truck… then the drones come
      sq.yoon.follow(game.player); sq.jung.follow(game.player);
      const proxy = { position: truck.position, aimHeight: 2, damage: () => {} };
      await m.wait(2.5);
      game.audio.setMusic('combat');
      await m.say('seoyeon', '순찰조! 자폭 드론 다수, 북서쪽에서 접근 중! 차량에서 떨어지세요!', { radio: true, priority: 3 });
      // the first one is already committed to the truck — nothing on the ground can stop it in time
      const first = new Drone(game, { pos: V(-34, 30, -150), target: proxy, speed: 22, hp: 600 }); first.isDrone = false;
      await m.say('yoon', '트럭에서 떨어져! 산개!', { priority: 3 });
      await m.until(() => first.removed || first.dead, 25);
      if (!lv.truckDead) { lv.truckDead = true; game.combat.explode(truck.position.clone().add(V(0, 1, 0)), { radius: 6, damage: 80, scale: 1.6, playerSafe: game.player.position.distanceTo(truck.position) > 7, kind: 'drone' }); game.effects.fireEmitter(truck.position.clone().add(V(0, 1.5, 0)), 1.4); truck.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.color?.multiplyScalar(0.2); } }); game.engine?.stop(); }
      await m.say('jung', '트럭이…! 운전병은!?', { priority: 3 });
      // the squad's counter-drone jammer goes to the player
      sq.jung.moveTo(game.player.position.clone().add(V(1.4, 0, 0.8)), { run: true, face: game.player.position });
      await m.talk([
        ['jung', '민재! 이거 받아라 — 휴대용 재밍건이다. 총으로 저 작은 걸 맞히는 건 운이야.', { priority: 3 }],
        ['yoon', '드론을 원 안에 붙잡아 두면 통제 신호가 끊긴다. 배터리 아껴 써!', { priority: 3 }],
      ]);
      giveJammer(game); game.gadget.announce();
      game.objectives.add('drones', '재밍건으로 자폭 드론 무력화', { count: 6 });
      const wave = []; const resolved = (d) => d.dead || d.removed;
      const offD = m.bind(events.on('drone:down', ({ drone }) => { if (wave.includes(drone)) game.objectives.progress('drones'); }));
      const offT = m.bind(events.on('drone:detonated', ({ drone }) => { if (wave.includes(drone)) game.objectives.progress('drones'); }));
      const launch = (list) => { const ds = list.map(([x, y, z, o = {}]) => new Drone(game, { pos: V(x, y, z), speed: 11, ...o })); wave.push(...ds); return ds; };
      // wave 1 — a single slow drone to learn the jammer on
      const w1 = launch([[-40, 34, -190, { speed: 6 }]]);
      m.spawn(async () => { await m.until(() => game.gadget?.active, 10); if (!game.gadget?.active) game.ui.hint(`<b>${hintKeys(game)('support')}</b> 를 눌러 재밍건을 드십시오`, 5); });
      await m.say('jung', '하나 온다, 북쪽! 천천히 오는 놈부터 연습해라!', { priority: 2 });
      await m.until(() => w1.every(resolved), 60);
      // wave 2 — two drones from different bearings
      await m.say('seoyeon', '두 대 추가 — 북서쪽, 그리고 서쪽 건물 뒤에서!', { radio: true, priority: 3 });
      const w2 = launch([[-70, 38, -170], [-80, 30, -110, { delay: 3, speed: 12 }]]);
      game.ui.hint('화면 가장자리의 화살표가 접근 중인 드론 방향입니다. <b style="color:var(--danger)">붉게 점멸</b>하면 곧 급강하합니다.', 6);
      await m.until(() => w2.every(resolved), 70);
      // wave 3 — three at once, one from behind
      await m.say('seoyeon', '마지막 무리입니다! 세 대 — 동쪽, 북쪽, 그리고… 남쪽 후방!', { radio: true, priority: 3 });
      const w3 = launch([[70, 40, -150, { speed: 12 }], [10, 44, -200, { delay: 2, speed: 13 }], [-10, 36, -60, { delay: 5, speed: 12 }]]);
      m.spawn(async () => { await m.wait(9); if (!w3[2].dead && !w3[2].removed) await m.say('jung', '뒤! 민재, 뒤에 하나!', { priority: 3 }); });
      await m.until(() => w3.every(resolved), 90);
      for (const d of wave) if (!resolved(d)) d.jam();
      offD(); offT(); game.objectives.complete('drones');
      game.audio.setMusic('tension');
      await m.talk([
        ['convoy', '…운전병은 무사하다. 차는 끝났다. 도보로 이동해.', { radio: true, priority: 3 }],
        ['jung', '재밍건은 네가 계속 들고 있어라. 저것들 또 올 거다.'],
        ['yoon', '연서역까지 1.4킬로. 도로 따라 남쪽으로 간다. 붙어.'],
      ]);
    },
  },

  // ============ 2. THE AVENUE: SPOTTER DRONE + SOF TEAM ============
  {
    id: 'avenue',
    async setup(game) {
      giveLoadout(game); giveJammer(game); const lv = game.level; lv.truck.position.set(-2.5, 0, -122); lv.truckDead = true;
      game.player.teleport(V(-3, 0, -105), Math.PI); squadFollow(game, ['yoon', 'jung']);
      game.squad.yoon.actor.root.position.set(-5, 0, -108); game.squad.jung.actor.root.position.set(-1, 0, -108);
    },
    async run(game, m) {
      const lv = game.level;
      squadFollow(game, ['yoon', 'jung']);
      game.objectives.add('station', '연서역 3번 출구로 이동', { marker: CITY.stationExit.clone().setY(1) });
      // enemy mortar observer drone: while it sees the player, rounds start falling nearby
      const spotter = new Drone(game, { pos: V(30, 50, -60), mode: 'recon', orbit: V(0, 0, -45), speed: 9, hp: 40 });
      let warned = false;
      spotter.onSpot = (pos) => m.spawn(async () => {
        if (!warned) { warned = true; await m.say('seoyeon', '정찰 드론에 발각됐습니다! 포격 들어옵니다 — 드론을 떨어뜨리세요!', { radio: true, priority: 3 }); game.objectives.add('spotter', '적 관측 드론 격추', { marker: spotter.position }); }
        game.ui.hint('<b style="color:var(--warn)">포격 경고 — 엄폐하고 관측 드론을 격추하십시오</b>', 3);
        for (let i = 0; i < 3; i++) await shell(game, m, pos.clone().add(V((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14)), { delay: 1.4 + i * 0.7, safeRadius: 5, damage: 45 });
      });
      m.every(() => { const o = game.objectives.get('spotter'); if (o && !o.done && !spotter.dead) game.objectives.setMarker('spotter', spotter.position); });
      const offS = m.bind(events.on('drone:down', ({ drone }) => { if (drone === spotter) { game.objectives.complete('spotter'); m.spawn(() => m.say('jung', '드론 떨어졌다!', { priority: 2 })); } }));
      await m.until(() => game.player.position.z > -75);
      // enemy special-forces team among the abandoned cars
      const sof = spawnEnemies(game, [[-6, -52], [5, -48], [-9, -36], [8, -30, { role: 'flanker' }], [1, -22], [-4, -14]], { state: 'idle', yaw: Math.PI });
      game.audio.setMusic('combat');
      m.spawn(async () => { await m.until(() => sof.some((e) => e.state === 'combat'), 20); attackOrder(game, sof.filter((e) => e.state !== 'combat'), game.player); });
      await m.say('yoon', '앞에 적이다! 특수부대 복장 — 차량 사이로!', { priority: 3 });
      game.objectives.add('sof', '대로의 적 특수부대 제압', { count: sof.length });
      const offK = m.bind(events.on('ai:death', ({ agent }) => { if (sof.includes(agent)) game.objectives.progress('sof'); }));
      await m.until(() => sof.every((e) => e.dead));
      offK(); game.objectives.complete('sof'); game.audio.setMusic('tension');
      await m.reach(CITY.stationExit, 6);
      game.objectives.complete('station');
      if (!spotter.dead) spotter.remove();   // the observer drone loses the squad under the canopy
      if (game.objectives.get('spotter')) game.objectives.complete('spotter');
      offS();
      await m.talk([['yoon', '역 입구다. 안은 정전이야. 손전등 켜.'], ['jung', '…안에서 사람 소리 들린다.']]);
    },
  },

  // ============ 3. THE DARK STATION ============
  {
    id: 'station',
    async setup(game) { giveLoadout(game); giveJammer(game); game.level.truckDead = true; game.player.teleport(V(12, 0, 18), 0); squadFollow(game, ['yoon', 'jung']); },
    async run(game, m) {
      const lv = game.level, sq = game.squad, k = hintKeys(game);
      await interact(game, { pos: CITY.stationExit.clone().add(V(0, 1, 2)), prompt: '역사로 내려가기', radius: 3.5 });
      events.emit('ui:fade', { to: 1, dur: 0.6 }); await m.wait(0.7);
      lv.setDark(1); game.player.teleport(lv.stationArrive, -Math.PI / 2);
      sq.yoon.actor.root.position.copy(lv.stationArrive).add(V(-1, 0, 1.5)); sq.jung.actor.root.position.copy(lv.stationArrive).add(V(-1, 0, -1.5));
      game.player.setFlashlight(true); lv.siren?.set(0.006);
      events.emit('ui:fade', { to: 0, dur: 1 });
      game.ui.hint(`${k('flashlight')} 손전등 켜기/끄기`, 6);
      game.audio.setMusic('tension');
      await m.say('pa', '…승강장… 안내… 지직… 대피…', { radio: true, priority: 2 });
      game.objectives.add('shutter', '승강장 방화 셔터 들어올리기', { marker: V(334.5, 1.2, 0) });
      await m.say('yoon', '셔터가 내려왔다. 승강장 쪽에서 소리가 나.', { priority: 2 });
      await interact(game, { pos: V(333.6, 1.2, 0), prompt: '셔터 들어올리기', hold: 3, radius: 2.4 });
      // shutter rises; collider goes away
      const sh = lv.shutter; game.world.removeCollider(sh.userData.collider); game.audio.click(0.4, 500, 1.2);
      await new Promise((res) => m.every((dt) => { sh.position.y += dt * 2; if (sh.position.y > 7) { res(); return false; } }));
      game.objectives.complete('shutter');
      // saboteur team on the platform, one arming a charge at the power room
      const team = spawnEnemies(game, [[346, -8], [349, 10], [352, -22], [344, 22], [354, -36, { name: 'sapper' }]], { state: 'idle', yaw: -Math.PI / 2 });
      attackOrder(game, team.slice(0, 4), game.player);
      game.audio.setMusic('combat');
      await m.say('jung', '승강장에 적! 손전등 끄면 우리도 안 보인다!', { priority: 3 });
      const charge = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.15), new THREE.MeshStandardMaterial({ color: 0x4a4a30, roughness: 0.7 }));
      charge.position.copy(lv.chargeSite); game.renderer.scene.add(charge);
      const ledM = new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false }); const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), ledM); led.position.set(0.12, 0.08, 0.08); charge.add(led);
      await m.say('seoyeon', '…순찰조… 신호가 약합니다… 변전실에 폭약 설치 정황… 역 전체가 무너질 수 있어요!', { radio: true, priority: 3 });
      game.objectives.add('defuse', '변전실 폭약 해체', { marker: lv.chargeSite });
      let left = 150; let defused = false;
      m.every((dt, t) => {
        if (defused) { events.emit('hud:timer', null); return false; }
        left -= dt; led.visible = Math.sin(t * (left < 30 ? 16 : 6)) > 0;
        events.emit('hud:timer', { label: '폭약 기폭까지', seconds: left });
        if (left <= 0) { events.emit('hud:timer', null); game.failMission('변전실 폭약이 기폭되었습니다', '폭약 해체'); game.combat.explode(lv.chargeSite.clone(), { radius: 60, damage: 999, scale: 3, kind: 'mission' }); return false; }
      });
      await interact(game, { pos: lv.chargeSite, prompt: '폭약 해체', hold: 4, radius: 2.0 });
      defused = true; ledM.color.setHex(0x30ff60); events.emit('hud:timer', null);
      game.objectives.complete('defuse');
      await m.say('minjae', '…해체했습니다.', { priority: 3 });
      await m.until(() => team.every((e) => e.dead), 90);
      for (const e of team) if (!e.dead) e.kill(game.player.position);
      game.audio.setMusic('ambient');
      // survivors in the stalled train
      game.objectives.add('survivors', '열차 안 생존자 확인 — 열린 스크린도어로', { marker: V(361.2, 1.2, 3) });
      await interact(game, { pos: V(361.4, 1.2, 3), prompt: '열차 문 두드리기', radius: 2.6 });
      lv.survivors = spawnCivilians(game, V(354, 0, 3), 8, { spread: 2.5 });
      const officer = game.director.spawn({ team: 'civilian', faction: 'rok', hat: 'cap', weapon: false, passive: true, invulnerable: true, name: '김정훈', pos: V(355, 0, 0), followOffset: V(0, 0, 1.6) });
      game.dialogue.bindSpeaker('police', officer); lv.officer = officer;
      game.objectives.complete('survivors');
      await m.talk([
        ['police', '군인입니까? …다행이다. 연서경찰서 김정훈 경위입니다. 시민 여덟 명, 다친 사람은 없습니다.', { priority: 3 }],
        ['civilian', '밖은… 밖은 어떻게 됐어요? 우리 집이 시장 쪽인데…', { priority: 3 }],
        ['minjae', '……', { priority: 3, duration: 1.6 }],
        ['yoon', '지상에 대피 버스가 대기 중입니다. 저희를 따라오세요. 총소리가 나면 그 자리에 엎드리십시오.', { priority: 3 }],
      ]);
    },
  },

  // ============ 4. LEAD THE CIVILIANS OUT ============
  {
    id: 'escort',
    async setup(game) {
      giveLoadout(game); giveJammer(game); const lv = game.level; lv.truckDead = true; lv.setDark(1); game.player.setFlashlight(true);
      game.player.teleport(V(350, 0, 0), -Math.PI / 2); squadFollow(game, ['yoon', 'jung']);
      game.squad.yoon.actor.root.position.set(347, 0, 2); game.squad.jung.actor.root.position.set(347, 0, -2);
      lv.survivors = spawnCivilians(game, V(352, 0, 3), 8, { spread: 2.5 });
    },
    async run(game, m) {
      const lv = game.level;
      for (const c of lv.survivors) c.follow(game.player);
      lv.officer?.follow(game.player, V(0, 0, 1.4));
      game.objectives.add('out', '시민들을 데리고 지상으로', { marker: lv.stationExitInside.clone().setY(1) });
      await m.reach(lv.stationExitInside, 3.5);
      await m.until(() => lv.survivors.every((c) => c.position.distanceTo(game.player.position) < 14), 25);
      events.emit('ui:fade', { to: 1, dur: 0.6 }); await m.wait(0.7);
      lv.setDark(0); game.player.setFlashlight(false); lv.siren?.set(0.035);
      const out = CITY.stationExit.clone().add(V(-3, 0, 5));
      game.player.teleport(out, Math.PI);
      lv.survivors.forEach((c, i) => c.actor.root.position.set(out.x + 1 + (i % 4), 0, out.z - 3 - Math.floor(i / 4) * 1.4));
      if (lv.officer) lv.officer.actor.root.position.set(out.x - 1, 0, out.z - 2);
      game.squad.yoon.actor.root.position.set(out.x - 2, 0, out.z + 2); game.squad.jung.actor.root.position.set(out.x + 3, 0, out.z + 2);
      events.emit('ui:fade', { to: 0, dur: 0.8 });
      game.objectives.complete('out');
      // the evacuation bus
      lv.evacBus = lv.kit.bus({ x: -6.5, z: 74, rotY: 0 });
      await m.talk([['yoon', '버스는 길 건너 정류장이다. 50미터. 시민들 붙여.'], ['police', '여러분, 군인들 뒤에 바짝 붙으세요!', { priority: 2 }]]);
      game.objectives.add('bus', '시민들을 대피 버스까지 인솔', { marker: V(-5, 1, 70) });
      // drones go for the crowd on the way
      await m.until(() => game.player.position.z > 40, 60);
      const ds = [new Drone(game, { pos: V(50, 40, 20), speed: 14 }), new Drone(game, { pos: V(-50, 42, 30), speed: 13, delay: 3 }), new Drone(game, { pos: V(10, 45, -20), speed: 15, delay: 6 })];
      await m.say('jung', '드론 또 온다! 시민들 엎드려!', { priority: 3 });
      await m.until(() => ds.every((dr) => dr.dead || dr.removed) || game.player.position.distanceTo(V(-5, 0, 70)) < 6, 120);
      await m.reach(V(-5, 0, 68), 6);
      await m.until(() => ds.every((dr) => dr.dead || dr.removed), 60);
      // board: civilians walk into the bus door and disappear inside
      const door = lv.evacBus.localToWorld(V(2.2, 0, 3.6));
      for (const [i, c] of [...lv.survivors, lv.officer].filter(Boolean).entries()) c.moveTo(door.clone().add(V(1 + (i % 2) * 0.5, 0, 0)), { onArrive: (a) => { a.actor.setVisible(false); a.invisible = true; } });
      await m.until(() => [...lv.survivors].every((c) => c.invisible), 40);
      game.objectives.complete('bus');
      await m.talk([['police', '고맙습니다. 정말로… 이름이 뭡니까?', { priority: 3 }], ['minjae', '…한민재 이병입니다.', { priority: 3 }], ['police', '한민재. 기억하겠습니다.', { priority: 3 }]]);
    },
  },

  // ============ 5. BUS ESCORT ============
  {
    id: 'busrun',
    async setup(game) {
      giveLoadout(game); giveJammer(game); const lv = game.level; lv.truckDead = true;
      lv.evacBus = lv.kit.bus({ x: -6.5, z: 74, rotY: 0 });
      game.player.teleport(V(-3, 0, 58), 0); squadFollow(game, ['yoon', 'jung']);
    },
    async run(game, m) {
      const lv = game.level, sq = game.squad, bus = lv.evacBus, scene = game.renderer.scene;
      // escort truck with a pintle MG behind the bus
      const esc = buildTruck({ canopy: false }); esc.position.set(-6.5, 0, 56); scene.add(esc);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 10), new THREE.MeshStandardMaterial({ color: 0x2a2c28, metalness: 0.5, roughness: 0.5 })); ped.position.set(0, 1.9, -2.2); esc.add(ped);
      const mg = new MountedWeapon(game, { kind: 'mg', pos: V(0, 0, 0), yaw: 0, yawRange: 2.6, pitchRange: [-0.35, 0.55], prompt: '호송 트럭 기관총 사용' });
      esc.add(mg.root); mg.root.position.set(0, 2.95, -2.2); mg.root.rotation.y = Math.PI; game.mounted.push(mg);
      game.objectives.add('mount', '호송 트럭 기관총에 탑승', { marker: mg.seatWorld() });
      await m.say('yoon', '민재, 트럭 기관총 잡아. 버스 뒤에 붙어서 간다!', { priority: 3 });
      await m.until(() => mg.manned, 120);
      if (!mg.manned) mg.mount();
      mg.it && (mg.it.enabled = false); mg.locked = true;
      game.objectives.complete('mount');
      // squad rides in the truck bed
      seatSquadInTruck(game, esc);
      const busHp = { hp: 1000, max: 1000 };
      const busTarget = { position: bus.position, aimHeight: 1.6, damage: (n) => { busHp.hp -= n; game.player.addShake(0.05); } };
      m.every(() => { events.emit('hud:escort', { name: '대피 버스', frac: busHp.hp / busHp.max }); if (busHp.hp <= 0 && !lv.busLost) { lv.busLost = true; busRun.target = 0; game.combat.explode(bus.position.clone().add(V(0, 1.5, 0)), { radius: 8, damage: 999, scale: 2 }); m.spawn(async () => { await m.say('yoon', '버스가…! 안 돼!', { priority: 3 }); game.ui.hint('<b style="color:var(--danger)">임무 실패 — 대피 버스가 파괴되었습니다</b>', 4); await m.wait(1.5); game.player.godMode = false; game.failMission('대피 버스가 파괴되었습니다', '버스 호송'); }); } });
      game.objectives.add('escort', '대피 버스 호송 — 남쪽 검문소까지', { marker: V(0, 1, 200) });
      game.audio.setMusic('combat');
      const route = [[-6.5, 74], [-6, 100], [-5.5, 130], [-5, 160], [-4.5, 196]];
      const busRun = driver(game, m, bus, route, { speed: 6.5, accel: 0.4 });
      const escRun = driver(game, m, esc, [[-6.5, 56], ...route.map(([x, z]) => [x, z - 16])], { speed: 6.5, accel: 0.4 });
      const eng = game.audio.engineLoop('truck'); eng?.set(0.6, 0.45);
      m.every(() => { eng?.setPos(esc.position); escRun.target = busRun.target; if (busRun.done) return false; });
      // ambush 1: drones at the bus
      await m.until(() => bus.position.z > 92);
      const d1 = [0, 1, 2, 3].map((i) => new Drone(game, { pos: V(-60 + i * 35, 40, 140 + i * 8), target: busTarget, speed: 12 + i, delay: i * 3 }));
      d1.forEach((dr) => { dr.payload = 160; });
      await m.say('seoyeon', '자폭 드론이 버스를 노립니다! 버스에 닿기 전에 떨어뜨리세요!', { radio: true, priority: 3 });
      // ambush 2: technical from the cross street + infantry at the crossing
      await m.until(() => bus.position.z > 108);
      busRun.target = 0; m.spawn(() => m.say('convoy', '교차로에 적! 버스 정지!', { radio: true, priority: 3 }));
      const tech = new EnemyVehicle(game, { path: [V(54, 0, 120), V(30, 0, 121), V(14, 0, 118)], speed: 8, hp: 450 });
      const inf = spawnEnemies(game, [[14, 128], [-14, 132], [16, 112], [-15, 116], [10, 136]], { state: 'combat' }); attackOrder(game, inf, game.player);
      game.objectives.add('tech', '교차로의 기관총 트럭 파괴', { marker: V(20, 1, 120) });
      await m.until(() => (tech.dead && inf.filter((e) => !e.dead).length <= 1) || m.time > 1e9, 90);
      if (!tech.dead) tech.destroy();
      game.objectives.complete('tech');
      busRun.target = 6.5;
      await m.say('convoy', '교차로 확보. 전진!', { radio: true, priority: 3 });
      // overpass comes down right behind the convoy
      await m.until(() => esc.position.z > lv.overpass.z + 12);
      m.spawn(() => m.say('jung', '뒤에 고가도로—!', { priority: 3 }));
      for (let i = 0; i < 2; i++) await shell(game, m, V(-10 + i * 20, 0, lv.overpass.z - 6), { delay: 0.3, safeRadius: 14, damage: 30 });
      lv.collapseOverpass();
      await m.until(() => busRun.done, 60);
      events.emit('hud:escort', null);
      if (lv.busLost) { game.failMission('대피 버스가 파괴되었습니다', '버스 호송'); return; }
      game.objectives.complete('escort');

      // ---------------- ENDING ----------------
      game.audio.setMusic('cinematic'); game.cine.letterbox(true); mg.fireT = 999;
      for (const e of game.director.enemies()) e.kill(game.player.position);
      await m.talk([
        ['convoy', '검문소 통과. 버스 인계 완료. 수고했다.', { radio: true, priority: 3 }],
        ['jung', '…시장 쪽. 다 타고 있다.', { priority: 3 }],
        ['minjae', '……', { priority: 3, duration: 2 }],
        ['yoon', '민재. 지금은 앞만 봐라. 네 어머니 가게는… 나중에 같이 간다.', { priority: 3 }],
        ['seoyeon', '순찰조, 이서연입니다. 사단 명령 전문을 정리하다가… 몇 건의 서명 방식이 다릅니다. 같은 사단 명령인데 형식이 미세하게 달라요.', { radio: true, priority: 3 }],
        ['yoon', '무슨 뜻입니까.', { radio: true, priority: 3 }],
        ['seoyeon', '아직 모르겠어요. 확인되는 대로 연락드리겠습니다. 다음 명령은… 한탄강 방어선 증원입니다.', { radio: true, priority: 3 }],
      ]);
      await m.wait(1.5);
      events.emit('ui:fade', { to: 1, dur: 2.5 }); await m.wait(3);
      eng?.stop(); lv.siren?.stop();
      game.cine.title('BLACKOUT', 'MISSION 02 COMPLETE', 5, 'center');
      game.audio.setMusic('ending');
      await m.wait(5.5);
    },
  },
];
