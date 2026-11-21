// MISSION 01 — ROUTINE PATROL (일상 순찰)
// POV: PVT Han Min-jae. 2029-03-14 04:52 KST, central-front GOP sector.
// Segments (checkpoints): truck → gp → op_move → op_radio → fallback → village → extraction
import * as THREE from 'three';
import { setEnemyMix } from '../ai/CharacterLib.js';
import { pbr } from '../render/TextureFactory.js';
import { GopSector, LAYOUT } from '../world/levels/GopSector.js';
import { buildAPC, buildHelicopter } from '../world/Props.js';
import { events } from '../core/Events.js';
import { keyName } from '../player/Player.js';
import { MountedWeapon } from '../gameplay/MountedWeapon.js';
import { FireSupport } from '../gameplay/FireSupport.js';
import { EnemyVehicle } from '../gameplay/EnemyVehicle.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const TEXTURES = ['snowground', 'asphalt', 'dirt', 'concrete', 'plaster', 'brick', 'corrugated', 'paintedMetal', 'metal', 'wood', 'sandbag', 'rock', 'grassdead', 'camoROK', 'camoEnemy', 'fabric'];
export const EPILOGUE = '2029년 3월 14일 05시 31분. 한반도 전역에서 포성이 시작되었다. 같은 시각, 9,000km 떨어진 파리의 한 지하 주차장에서 한 남자가 휴대폰 배터리를 분리했다. 그는 아직 이 전쟁이 자신이 5년 전 묻어둔 일과 연결되어 있다는 것을 모른다.';

// ------------------------------------------------------------------
// build: level + persistent actors
// ------------------------------------------------------------------
export async function build(game) {
  setEnemyMix({ kpa_sf: 0.45, kpa_sfb: 0.2, kpa: 0.25, kpa_officer: 0.1 });   // enemy unit types for this mission (uniform / gear)
  const level = new GopSector(game);
  game.level = level;
  await level.build(() => {});
  const d = game.director; d.visionRange = 42;
  const squad = game.squad = {
    yoon: d.spawn({ team: 'friendly', name: '윤태호', pos: V(-6, 0, -12), invulnerable: true, accuracy: 1.2, followOffset: V(-2.2, 0, 2.5) }),
    doyun: d.spawn({ team: 'friendly', name: '박도윤', pos: V(-5, 0, -12), invulnerable: true, accuracy: 1.0, followOffset: V(2.4, 0, 3.2) }),
    jung: d.spawn({ team: 'friendly', name: '정경수', pos: V(-4, 0, -12), invulnerable: true, accuracy: 1.1, followOffset: V(0.3, 0, 5) }),
  };
  game.dialogue.bindSpeaker('yoon', squad.yoon); game.dialogue.bindSpeaker('doyun', squad.doyun); game.dialogue.bindSpeaker('jung', squad.jung);
  game.squadList = [
    { id: 'yoon', rank: 'SSG', name: '윤태호', status: '' }, { id: 'doyun', rank: 'CPL', name: '박도윤', status: '' }, { id: 'jung', rank: 'SGT', name: '정경수', status: '' },
  ];
  // friendly combat barks
  let barkT = 0;
  game.mission.every((dt) => {
    barkT -= dt; if (barkT > 0) return;
    const enemies = d.enemies().filter((e) => e.state === 'combat');
    if (!enemies.length) return;
    barkT = 7 + Math.random() * 6;
    const lines = [['yoon', '엄폐하고 사격해!'], ['jung', '사격 개시!'], ['doyun', '재장전! 엄호해 줘!'], ['yoon', '좌측! 좌측 주시!'], ['jung', '머리 숙여!'], ['doyun', '저 바위 뒤에 하나 있다!'], ['yoon', '민재, 붙어서 움직여!']];
    const l = lines[Math.floor(Math.random() * lines.length)]; game.dialogue.bark(l[0], l[1]);
  });
  // ammo resupply points
  for (const p of [level.ammoCrateGP, level.ammoCrateOP, level.ammoCrateRally]) game.player.addInteractable({ pos: p, prompt: '탄약 보급', radius: 2.2, onUse: () => { game.weapons.refill(); game.audio.reload('rifle', 1.2); game.ui.hint('탄약 보급 완료', 2); } });
  // dropped enemy weapons give ammo when walked over
  game.mission.every(() => {
    for (const a of d.agents) if (a.team === 'enemy' && a.dead && a.ammoDrop === undefined) a.ammoDrop = true;
    for (const a of d.agents) if (a.ammoDrop && a.dead && a.position.distanceTo(game.player.position) < 1.8) { a.ammoDrop = false; const got = game.weapons.addAmmo('rifle', 45); if (got > 0) game.ui.hint(`탄약 +${got}`, 1.5); }
  });
}

// helpers -----------------------------------------------------------
function setSquadStatus(game, id, status) { const s = game.squadList.find((x) => x.id === id); if (s) s.status = status; }
function squadFollow(game, list = ['yoon', 'doyun', 'jung']) { for (const k of list) { const a = game.squad[k]; a.unpose(); a.follow(game.player); a.setPassive(false); } }
function spawnEnemies(game, list, opts = {}) {
  return list.map(([x, z, extra = {}]) => game.director.spawn({ team: 'enemy', pos: V(x, 0, z), yaw: opts.yaw ?? 0, accuracy: opts.accuracy ?? 1, state: opts.state || 'idle', visionRange: opts.visionRange, ...extra }));
}
function attackOrder(game, enemies, target) { for (const e of enemies) { e.state = 'combat'; e.target = target; e.lastSeenPos = target.position.clone(); e.lastSeenT = game.director.time - 3; } }
function giveLoadout(game) { game.weapons.clear(); game.weapons.give('rifle', { mag: 30, reserve: 180 }); game.weapons.give('pistol'); game.weapons.grenades = 2; game.weapons.equip('rifle', true); game.weapons.emitAmmo(); }
function hintKeys(game) { const b = game.input.binding.bind(game.input); return (k) => `<kbd>${keyName(b(k))}</kbd>`; }

// Scripted artillery impact with incoming whistle
async function artillery(game, m, pos, { delay = 0, scale = 1.3, safeRadius = 9 } = {}) {
  if (delay) await m.wait(delay);
  const p = game.player.position;
  const gy = game.world.heightFn(pos.x, pos.z); const at = V(pos.x, gy, pos.z);
  // never land directly on the player: push out to safeRadius
  const dx = at.x - p.x, dz = at.z - p.z, d = Math.hypot(dx, dz);
  if (d < safeRadius) { const k = safeRadius / Math.max(0.01, d); at.x = p.x + dx * k; at.z = p.z + dz * k; at.y = game.world.heightFn(at.x, at.z); }
  game.combat.explode(at, { radius: 6, damage: 60, scale, shake: 1.2, snow: true, kind: 'artillery' });
  if (Math.random() < 0.35) { const em = game.effects.fireEmitter(at.clone().add(V(0, 0.2, 0)), 0.8); setTimeout(() => game.effects.removeEmitter(em), 40000); }
}

// ------------------------------------------------------------------
// SEGMENTS
// ------------------------------------------------------------------

// Recon patrol stealth sequence. The patrol (leader with a sweeping flashlight)
// walks the road past the stone wall where the squad hides, one soldier comes
// over to check the wall, and the player can throw a tin to pull them away.
// A suspicion meter fills while any patrol member has line of sight to the
// player (faster when standing, moving, close, or caught in the flashlight).
async function stealthPatrol(game, m) {
  const lv = game.level, sq = game.squad, scene = game.renderer.scene, p = game.player, k = (a) => keyName(game.input.binding(a));
  const wallX = 74.6, hide = [V(72.2, 0, 31.5), V(72.4, 0, 34.5), V(72.1, 0, 37)];
  // the stone wall the squad crouches behind
  const wy = lv.hf(wallX, 34);
  game.props.box(V(0.45, 1.35, 9), V(wallX, wy + 0.67, 34), pbrBlk(), { surface: 'concrete' });
  ['yoon', 'jung', 'doyun'].forEach((key, i) => { const a = sq[key]; a.setPassive(true); a.moveTo(hide[i === 0 ? 0 : i === 1 ? 2 : 1].clone().add(V(-0.6, 0, i - 1)), { run: true, crouch: true, face: V(90, 0, 34) }); });
  game.objectives.add('hide', `돌담 뒤에 숨기 — ${k('crouch')} 앉기`, { marker: hide[1] });
  await m.say('yoon', '멈춰! 돌담 뒤로, 앉아. 정찰조다. 그냥 보내.', { priority: 3 });
  await m.until(() => (p.position.distanceTo(V(hide[1].x, p.position.y, hide[1].z)) < 3.5 && p.crouching), 12);
  game.objectives.complete('hide');
  game.objectives.add('stealth', '정찰조가 지나갈 때까지 들키지 않기 — 사격 금지');
  // HUD meter
  const meterEl = document.createElement('div'); meterEl.className = 'stealth-meter';
  meterEl.innerHTML = '<div class="lbl">발각 위험</div><div class="bar"><i></i></div><div class="st"></div>';
  game.ui.hud.appendChild(meterEl);
  // the patrol
  const patrol = spawnEnemies(game, [[83, 76], [84.5, 79], [82, 81.5], [83.5, 84]], { state: 'idle', visionRange: 1, yaw: Math.PI });
  m.flags.patrol = patrol;
  for (const e of patrol) { e.setPassive(true); }
  const leader = patrol[0];
  const torch = new THREE.Group(); torch.position.set(0, 1.45, 0.25); leader.actor.root.add(torch);
  const spot = new THREE.SpotLight(0xfff0d0, 40, 28, 0.32, 0.45, 1.6); spot.position.set(0, 0, 0); torch.add(spot);
  const tgt = new THREE.Object3D(); tgt.position.set(0, -0.5, 8); torch.add(tgt); spot.target = tgt;
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 9, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.rotation.x = -Math.PI / 2; beam.position.z = 4.5; torch.add(beam);
  const walk = (e, pts, { run = false } = {}) => (async () => { for (const pt of pts) { e.moveTo(pt, { run }); await m.until(() => e.dead || e.position.distanceTo(V(pt.x, e.position.y, pt.z)) < 1.2, 30); } })();
  // detection
  let meter = 0, spotted = false, gone = false; const wiped = () => patrol.every((e) => e.dead); const eye = new THREE.Vector3(), tp = new THREE.Vector3(), fwd = new THREE.Vector3();
  const tick = m.every((dt, t) => {
    if (spotted || gone) return false;
    torch.rotation.y = Math.sin(t * 0.9) * 0.55; torch.rotation.x = 0.12 + Math.sin(t * 0.6) * 0.05;
    let rate = 0; const moving = p.speed > 0.6;
    p.chestPos(tp);
    for (const e of patrol) {
      if (e.dead) continue;
      e.eyePos(eye); const d = eye.distanceTo(tp); if (d > 26) continue;
      fwd.set(Math.sin(e.yaw), 0, Math.cos(e.yaw)); const to = tp.clone().sub(eye); const flat = Math.hypot(to.x, to.z);
      const cosA = (to.x * fwd.x + to.z * fwd.z) / Math.max(0.01, flat);
      let lit = false;
      if (e === leader) { const ld = new THREE.Vector3(0, 0, 1).applyQuaternion(torch.getWorldQuaternion(new THREE.Quaternion())); lit = to.clone().normalize().dot(ld) > Math.cos(0.36) && d < 24; }
      if (cosA < 0.55 && !lit && d > 3) continue;                       // outside the field of view
      if (!game.world.lineOfSight(eye, tp)) continue;
      let v = (1 - d / 26) * (p.crouching ? 0.35 : 1) * (moving ? 1.8 : 1) * (lit ? 3 : 1) * (d < 6 ? 2.2 : 1);
      rate += v * 0.85;
    }
    if (p.firingRecently) { meter = 1; }
    meter = rate > 0 ? Math.min(1, meter + rate * dt) : Math.max(0, meter - dt * 0.22);
    const bar = meterEl.querySelector('i'); bar.style.width = `${Math.round(meter * 100)}%`;
    meterEl.classList.toggle('warn', meter > 0.35); meterEl.classList.toggle('danger', meter > 0.75);
    meterEl.querySelector('.st').textContent = rate > 0 ? (meter > 0.75 ? '발각 직전!' : '정찰조가 이쪽을 보고 있다') : meter > 0.05 ? '의심이 가라앉는 중' : '숨어 있음';
    if (meter >= 1 || wiped()) spotted = true;
  });
  // patrol route: up the road, a search halt, one soldier checks the wall
  const road = [V(81, 0, 60), V(79.5, 0, 46)];
  const all = patrol.map((e, i) => walk(e, road.map((r) => r.clone().add(V((i % 2) * 1.5, 0, i * 1.9)))));
  await Promise.race([Promise.all(all), m.until(() => spotted, 60)]);
  // a tin pile to throw for a distraction
  const tinPos = V(71.2, lv.hf(71.2, 39.5) + 0.5, 39.5);
  const tins = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0x8a8a80, metalness: 0.6, roughness: 0.5 }));
  tins.position.copy(tinPos).setY(tinPos.y - 0.4); scene.add(tins);
  let distracted = false;
  const throwIt = game.player.addInteractable({ pos: tinPos, prompt: '깡통 던지기 — 정찰조 유인', radius: 2.4, onUse: () => {
    throwIt.enabled = false; distracted = true; game.audio.click(0.4, 900, 0.15);
    setTimeout(() => { game.audio.click(0.5, 1600, 0.08); game.audio.click(0.4, 1300, 0.08, 0.15); }, 900);
  } });
  m.spawn(async () => { if (!spotted) { await m.say('jung', '(속삭임) …뒤에 깡통 더미 있다. 저쪽으로 던지면 끌려갈 거다.', { priority: 2 }); game.ui.hint(`<b>${k('interact')}</b> 깡통을 던져 정찰조를 다른 곳으로 유인할 수 있습니다`, 6); } });
  // the leader sweeps; one soldier walks over to check the wall
  const checker = patrol[2];
  if (!spotted && !checker.dead) {
    m.spawn(() => m.say('yoon', '(속삭임) 움직이지 마. 한 놈 온다.', { priority: 2 }));
    const near = walk(checker, [V(79.5, 0, 38), V(77.4, 0, 34)]);
    await Promise.race([near, m.until(() => spotted || distracted, 20)]);
    if (!distracted && !spotted) await m.until(() => spotted || distracted, 5);
  }
  if (distracted && !spotted) {
    await m.say('enemy', '…저쪽이다! 확인해!', { priority: 2 });
    await Promise.race([Promise.all(patrol.map((e, i) => walk(e, [V(92 + i, 0, 26 + i * 1.5), V(96 + i, 0, 2)], { run: true }))), m.until(() => spotted, 25)]);
  } else if (!spotted) {
    await Promise.race([Promise.all(patrol.map((e, i) => walk(e, [V(82 + i, 0, 24 + i), V(86 + i, 0, 2 + i)]))), m.until(() => spotted, 40)]);
  }
  gone = !spotted; tick();
  throwIt.enabled = false; game.player.removeInteractable(throwIt);
  meterEl.remove(); torch.parent?.remove(torch);
  for (const key of ['yoon', 'jung', 'doyun']) sq[key].unpose?.();
  if (spotted) {
    game.objectives.fail('stealth');
    for (const e of patrol) { if (!e.dead) { e.setPassive(false); e.visionRange = 45; } }
    attackOrder(game, patrol.filter((e) => !e.dead), game.player);
    return 'spotted';
  }
  game.objectives.complete('stealth');
  for (const e of patrol) if (!e.dead) game.director.remove(e);
  return 'clear';
}
const pbrBlk = () => pbr('concrete', { color: 0xa09c90, key: 'stealthwall' });

export const SEGMENTS = [
  // ============ 0. TRUCK RIDE (opening cinematic, player keeps free look) ============
  {
    id: 'truck',
    async setup(game) {
      giveLoadout(game);
      game.weapons.lowered = true;
      const lv = game.level, truck = lv.truck, sq = game.squad;
      const route = new THREE.CatmullRomCurve3(LAYOUT.truckRoute.map(([x, z]) => V(x, lv.hf(x, z), z)));
      game.truckRoute = route;
      truck.position.copy(route.getPoint(0));
      // squad seated on benches facing inward
      const seat = (agent, x, z, yaw) => { game.renderer.scene.remove(agent.actor.root); truck.add(agent.actor.root); agent.actor.root.position.set(x, 1.3, z); agent.yaw = yaw; agent.actor.root.rotation.y = yaw; agent.pose('sit'); agent.actor.target.sit = 1; };
      seat(sq.yoon, 0.75, -0.2, -Math.PI / 2); seat(sq.doyun, -0.75, -1.6, Math.PI / 2); seat(sq.jung, 0.75, -2.6, -Math.PI / 2);
      game.player.enterSeat(truck, { offset: V(-0.75, 2.62, -0.4), yawBase: -Math.PI / 2, yawRange: 1.9, pitchRange: [-0.5, 0.4] });
      game.engine = game.audio.engineLoop('truck'); game.engine?.set(0.5, 0.35);
      game.audio.startWind(0.07);
      game.audio.setMusic('cinematic');
    },
    async run(game, m) {
      const lv = game.level, truck = lv.truck, route = game.truckRoute;
      game.cine.letterbox(true);
      game.cine.title('ROUTINE PATROL', '2029. 03. 14  04:52 KST\n강원도 중부전선 · GOP 3소초 인근\n이병 한민재 · 제7보병사단', 7);
      // drive along route over ~48 s with sway
      let u = 0; const len = route.getLength(); let speed = 0;
      const drive = m.every((dt, t) => {
        const target = u > 0.93 ? 1.2 : 7.5; speed += (target - speed) * Math.min(1, dt * 0.6);
        u = Math.min(1, u + speed * dt / len);
        const p = route.getPoint(u), q = route.getPoint(Math.min(1, u + 0.01));
        truck.position.copy(p); truck.lookAt(q.x, p.y, q.z);
        truck.userData.sway = Math.sin(t * 2.1) * 0.012 + Math.sin(t * 5.3) * 0.004;
        truck.position.y += Math.abs(Math.sin(t * 7)) * 0.02;
        for (const w of truck.userData.wheels) w.rotation.x += speed * dt / 0.55;
        game.engine?.set(speed / 8, 0.35); game.engine?.setPos(truck.position);
        if (u >= 1) return false;
      });
      await m.wait(6);
      await m.talk([
        ['driver', '소초 도착 5분 전입니다.'],
        ['doyun', '민재야, 첫 GOP 순찰 소감 한마디 해 봐라. 춥제?'],
        ['minjae', '…손이 좀 시립니다.'],
        ['doyun', '핫팩 아끼지 마라. 여기 3월은 3월이 아이다.'],
        ['jung', '전역 D-38. 3월은 그냥 지나가면 된다.'],
        ['doyun', '정 병장님은 매일 숫자만 세십니다.'],
        ['yoon', '잡담 그만. 오늘은 3구역 감지 센서 세 군데 점검한다. 어젯밤부터 오경보가 계속 떴어.'],
        ['doyun', '또 고라니 아입니까?'],
        ['yoon', '고라니든 뭐든, 확인하는 게 우리 일이다. 한민재.'],
        ['minjae', '이병 한민재.'],
        ['yoon', '센서는 네가 직접 확인해. 눈으로 보고, 손으로 확인하고, 보고한다. 알겠나.'],
        ['minjae', '예, 알겠습니다.'],
      ]);
      await m.talk([
        ['seoyeon', '3소초 순찰조, 여기 지휘통제실. 현재 위치 보고 바람.', { radio: true }],
        ['yoon', '지휘통제실, 순찰조. 소초 진입 중. 이상 무.', { radio: true }],
        ['seoyeon', '수신 양호. 참고로 04시 30분부터 북측 통신량이 평소의 세 배입니다. 경계 철저히 바랍니다.', { radio: true }],
        ['doyun', '세 배라… 저쪽도 오늘 바쁜갑네.'],
      ]);
      await m.until(() => u >= 1);
      drive();
      game.engine?.set(0.15, 0.2);
      await m.say('yoon', '하차. 정경수, 박도윤 앞으로. 민재는 나 따라와.');
      events.emit('ui:fade', { to: 1, dur: 0.6 }); await m.wait(0.7);
      // dismount
      const sq = game.squad; const scene = game.renderer.scene;
      const off = [V(-3, 0, -6), V(-1.5, 0, -7), V(-4, 0, -8)];
      [sq.yoon, sq.doyun, sq.jung].forEach((a, i) => { truck.remove(a.actor.root); scene.add(a.actor.root); a.actor.root.position.copy(truck.position).add(off[i]); a.actor.root.position.y = game.world.groundHeight(a.position.x, a.position.z, 50); a.unpose(); });
      game.player.exitSeat(truck.position.clone().add(V(-2.5, 0, -4)));
      game.player.yaw = Math.PI * 0.85; game.player.pitch = -0.05;
      game.weapons.lowered = false;
      // the truck becomes a static obstacle
      game.world.addBoxCentered(truck.position.clone().add(V(0, 1.4, 0)), V(3, 2.8, 7.5), { surface: 'metal' });
      game.cine.letterbox(false);
      events.emit('ui:fade', { to: 0, dur: 0.8 });
      game.audio.setMusic('ambient');
    },
  },

  // ============ 1. SENSOR CHECKS ============
  {
    id: 'gp',
    async setup(game) {
      giveLoadout(game);
      const lv = game.level; lv.truck.position.set(-6, lv.hf(-6, -15), -15); lv.truck.rotation.y = Math.PI / 2;
      game.world.addBoxCentered(lv.truck.position.clone().add(V(0, 1.4, 0)), V(7.5, 2.8, 3), { surface: 'metal' });
      game.player.teleport(V(-8, 0, -19), Math.PI * 0.85);
      squadFollow(game);
      game.audio.startWind(0.07); game.audio.setMusic('ambient');
    },
    async run(game, m) {
      const lv = game.level, sq = game.squad, k = hintKeys(game);
      squadFollow(game);
      const obj = game.objectives.add('sensors', '철책 감지 센서 점검', { count: 3 });
      game.objectives.setMarkers('sensors', lv.sensors.map((s) => s.pos));
      game.ui.hint(`${k('forward')}${k('left')}${k('back')}${k('right')} 이동 · ${k('sprint')} 달리기 · ${k('crouch')} 앉기 · ${k('jump')} 점프/넘기`, 7);
      m.spawn(async () => { await m.wait(9); game.ui.hint(`마우스 우클릭 조준 · 좌클릭 사격 · ${k('reload')} 재장전 · ${k('grenade')} 수류탄`, 6); });
      const checked = new Set();
      const done = new Promise((resolve) => {
        lv.sensors.forEach((s, i) => {
          const it = game.player.addInteractable({ pos: s.pos, prompt: `감지 센서 ${i + 1}번 점검`, hold: 1.8, radius: 2.4, onUse: () => {
            it.enabled = false; s.ok = true; checked.add(i); game.objectives.progress('sensors');
            game.objectives.setMarkers('sensors', lv.sensors.filter((x) => !x.ok).map((x) => x.pos));
            game.audio.click(0.2, 1800, 0.05); game.audio.ui('select');
            events.emit('m01:sensor', { i, count: checked.size });
            if (checked.size === 3) resolve();
          } });
        });
      });
      // contextual lines per sensor
      const onSensor = m.bind(events.on('m01:sensor', ({ count }) => {
        if (count === 1) m.spawn(async () => {
          await m.talk([['yoon', '1번 정상. 렌즈에 성에만 꼈네.'], ['doyun', '봐라, 고라니라 캤제.']]);
          await m.wait(4);
          await m.talk([
            ['doyun', '민재 니 고향이 연서시라 했제? 거 바다 보이는 카페 많다 아이가. 나 전역하면 거기서 카페 할 끼다.'],
            ['minjae', '…저희 어머니 가게 옆에 자리 하나 비어 있습니다.'],
            ['doyun', '오, 계약하자. 니는 커피 평생 공짜다.'],
            ['jung', '박도윤 커피는 공짜여도 안 마신다.'],
          ]);
        });
        if (count === 2) m.spawn(async () => {
          await m.talk([
            ['yoon', '2번도 정상인데… 로그가 이상하다. 감지 기록이 전부 같은 시각에 찍혀 있어.'],
            ['seoyeon', '순찰조, 센서 로그 원격으로 확인했습니다. 04시 21분, 3구역 전 센서가 0.2초 간격으로 동시에 반응했어요.', { radio: true }],
            ['seoyeon', '고장이라기엔… 패턴이 너무 깨끗합니다. 누가 일부러 만든 신호처럼요.', { radio: true }],
            ['yoon', '알았다. 마지막 거 확인하고 다시 보고하겠다.', { radio: true }],
          ]);
        });
      }));
      await done; onSensor();
      game.objectives.complete('sensors');
      await m.say('yoon', '지휘통제실, 순찰조. 3구역 센서 점검 완료. 이상—', { radio: true });
      // ---- BLACKOUT ----
      lv.blackout(); game.audio.distantArtillery();
      game.audio.setMusic('tension');
      game.player.addShake(0.1);
      await m.wait(1.2);
      await m.talk([
        ['doyun', '뭐꼬, 정전이가?'],
        ['jung', '발전기 소리도 안 들린다.'],
        ['seoyeon', '…순찰조, 소초 전력이 끊겼습니다. 그리고— OP 백두-3과 정기 교신이 두 번 연속 끊겼어요.', { radio: true }],
      ]);
      lv.startWar();
      await m.wait(1.5);
      await m.talk([
        ['jung', '…북쪽. 하늘 봐라.'],
        ['yoon', '…무기 들어. 지휘통제실, 순찰조는 백두-3 확인하러 이동한다.', { radio: true }],
        ['seoyeon', '승인합니다. 조심하세요. 지금 전 채널에— 잠시만요, 잡음이…', { radio: true }],
      ]);
    },
  },

  // ============ 2. MOVE TO OP UNDER BARRAGE ============
  {
    id: 'op_move',
    async setup(game) {
      giveLoadout(game);
      const lv = game.level; lv.truck.position.set(-6, lv.hf(-6, -15), -15); lv.truck.rotation.y = Math.PI / 2;
      for (const s of lv.sensors) s.ok = true;
      lv.blackout(); lv.startWar();
      game.player.teleport(V(42, 0, -51), -Math.PI / 2);
      squadFollow(game); for (const [k, a] of Object.entries(game.squad)) a.actor.root.position.set(38 - Object.keys(game.squad).indexOf(k) * 2, lv.hf(38, -51), -51);
      game.audio.startWind(0.07);
    },
    async run(game, m) {
      const lv = game.level, sq = game.squad;
      game.audio.setMusic('tension');
      squadFollow(game);
      const trenchEntry = V(52, lv.hf(52, -47.5), -47.5);
      game.objectives.add('op', 'OP 백두-3 상황 확인', { marker: V(76, lv.hf(76, -37), -37) });
      // barrage: far impacts north of fence, walking closer
      m.spawn(async () => {
        await m.wait(1.5);
        for (let i = 0; i < 3; i++) await artillery(game, m, V(20 + Math.random() * 80, 0, -90 - Math.random() * 40), { delay: 0.6 + Math.random() * 0.8, scale: 1.6 });
        if (m.flags.inTrench) return;
        game.objectives.setMarker('op', trenchEntry);
        await m.say('jung', '포격이다! 북쪽 전체에서!', { priority: 3 });
        if (!m.flags.inTrench) await m.say('yoon', '참호로! 동쪽 교통호로 들어가! 머리 숙이고 뛰어!', { priority: 3 });
        // a shell takes down the watchtower behind the squad
        if (game.player.position.distanceTo(V(32, 0, -52)) > 10) { await artillery(game, m, V(33, 0, -53.5), { scale: 1.5, safeRadius: 6 }); lv.collapseTower(1, game.player.position.clone()); }
        for (let i = 0; i < 10; i++) {
          const p = game.player.position;
          await artillery(game, m, V(p.x + (Math.random() - 0.3) * 40, 0, p.z - 14 - Math.random() * 30), { delay: 1 + Math.random() * 1.6, scale: 1.3, safeRadius: 12 });
          if (m.flags.inTrench) break;
        }
      });
      await m.until(() => Math.hypot(game.player.position.x - 60, game.player.position.z + 44) < 9);
      m.flags.inTrench = true;
      game.objectives.setMarker('op', V(76, lv.hf(76, -37), -37));
      // squad files into trench
      sq.yoon.moveTo(V(66, 0, -41), { run: true, onArrive: (a) => a.follow(game.player) });
      await m.talk([
        ['yoon', '백두-3, 백두-3. 여기 순찰조, 응답하라.', { radio: true }],
        ['op', '(…지직…)', { radio: true, duration: 1.4 }],
        ['doyun', '중사님, 벙커 문이 열려 있습니더.'],
        ['yoon', '…다들 조용히. 민재, 내 뒤에 붙어.'],
      ]);
      // OP infiltration team
      const team = spawnEnemies(game, [
        [78.5, -35.5], [75, -37], [73, -32.5, { patrol: [V(73, 0, -32.5), V(68, 0, -30)] }], [84, -31], [86, -42], [80, -46],
      ], { yaw: Math.PI });
      m.flags.opTeam = team;
      game.audio.setMusic('combat');
      m.spawn(async () => { await m.until(() => team.some((e) => e.state === 'combat'), 25); attackOrder(game, team.filter((e) => e.state !== 'combat'), game.player); await m.say('jung', '적이다! 벙커 안에 적!', { priority: 3 }); });
      await m.killAll(team);
      game.objectives.complete('op');
      game.audio.setMusic('tension');
      await m.wait(1.0);
      await m.talk([
        ['yoon', 'OP 확보. 다들 이상 없나.'],
        ['doyun', '…중사님. 백두-3 인원이 아무도 없습니더. 장비만 그대로…'],
        ['yoon', '철수한 흔적이 없다. 끌려간 거다.'],
        ['yoon', '민재. 벙커 무전기 살려. 지휘통제실이랑 연결해야 한다.'],
      ]);
    },
  },

  // ============ 3. RESTORE RADIO & HOLD ============
  {
    id: 'op_radio',
    async setup(game) {
      giveLoadout(game);
      const lv = game.level; for (const s of lv.sensors) s.ok = true; lv.blackout(); lv.startWar();
      game.player.teleport(V(72, 0, -39.5), -Math.PI / 2);
      squadFollow(game);
      game.squad.yoon.actor.root.position.set(70, lv.hf(70, -40), -40); game.squad.doyun.actor.root.position.set(69, lv.hf(69, -39), -39); game.squad.jung.actor.root.position.set(68, lv.hf(68, -40.5), -40.5);
      game.audio.startWind(0.07);
    },
    async run(game, m) {
      const lv = game.level, sq = game.squad;
      game.objectives.add('radio', 'OP 무전기 복구', { marker: lv.opRadio.pos });
      // squad takes positions at the northern fighting line
      sq.jung.hold(V(82, 0, -44.6), V(86, 0, -70)); sq.doyun.hold(V(75, 0, -44.6), V(80, 0, -70)); sq.yoon.moveTo(V(72, 0, -38.5), { onArrive: (a) => a.lookAt(lv.opRadio.pos) });
      await new Promise((resolve) => { const it = game.player.addInteractable({ pos: lv.opRadio.pos, prompt: '무전기 주파수 재설정', hold: 3.5, radius: 2.0, onUse: () => { it.enabled = false; resolve(); } }); });
      lv.opRadio.screenMat.color.setHex(0x7cff7a); lv.opBunker.userData.light && (lv.opBunker.userData.light.intensity = 2);
      game.objectives.complete('radio');
      game.audio.radio(true, 1);
      await m.talk([
        ['seoyeon', '…순찰조! 수신됩니다. 다행이다…', { radio: true, priority: 3 }],
        ['seoyeon', '지금 전 전선에서 포격이 시작됐습니다. 이건 훈련이 아닙니다. 반복합니다, 훈련이 아닙니다.', { radio: true, priority: 3 }],
        ['yoon', '지휘통제실, OP 백두-3 적 침투. 아군 인원 확인 불가. 철책 동측 절단 흔적 있다.', { radio: true, priority: 3 }],
        ['seoyeon', '확인. 열상 장비에 적 보병 다수가 3구역 철책 쪽으로 이동 중입니다. 그 위치에서 버텨 주세요. 기계화 부대가 이동하고 있습니다.', { radio: true, priority: 3 }],
      ]);
      // ---- DEFENCE: mounted MG, mortar support, three waves ----
      const mg = new MountedWeapon(game, { kind: 'mg', pos: V(78, lv.hf(78, -47.3) + 0.42, -47.3), yaw: 0, yawRange: 1.15, pitchRange: [-0.3, 0.25], prompt: '거치 기관총 사용' });
      game.mounted.push(mg);
      game.objectives.add('hold', '관측소 방어 — 철책 돌파 저지', { marker: V(87, lv.hf(87, -55), -55) });
      game.objectives.add('mg', '거치 기관총으로 사격 (선택)', { marker: mg.seatWorld(), optional: true });
      game.audio.setMusic('combat');
      await m.say('yoon', '민재! 교통호 기관총 잡아! 철책 구멍을 막아!', { priority: 3 });
      m.spawn(async () => { await m.until(() => mg.manned, 60); game.objectives.complete('mg'); });
      const breachIn = (n, x0, z0 = -80) => spawnEnemies(game, Array.from({ length: n }, (_, i) => [x0 + (i % 3) * 3 - 3, z0 - Math.floor(i / 3) * 4]), { state: 'combat' });
      const w1 = breachIn(6, 87); attackOrder(game, w1, game.player);
      await m.say('jung', '철책 쪽! 움직임 다수!', { priority: 3 });
      const t0 = m.time;
      await m.until(() => w1.filter((e) => !e.dead).length <= 1 || m.time - t0 > 45);
      // shell hits the eastern watchtower — it comes down
      await artillery(game, m, V(131, 0, -54), { scale: 1.5, safeRadius: 4 });
      lv.collapseTower(3, V(140, 0, -40));
      await m.say('doyun', '감시탑이… 무너진다!', { priority: 2 });
      await m.say('yoon', '두 번째 무리 온다! 탄약 확인해!', { priority: 2 });
      const w2 = breachIn(7, 88); attackOrder(game, w2, game.player);
      const flank = spawnEnemies(game, [[40, -70], [43, -72]], { state: 'combat' }); attackOrder(game, flank, sq.doyun);
      const t1 = m.time;
      await m.until(() => w2.filter((e) => !e.dead).length <= 2 || m.time - t1 > 40);
      // third group masses at the DMZ treeline, out of rifle reach — call the mortars
      const mass = spawnEnemies(game, [[92, -96], [96, -98], [100, -95], [94, -101], [99, -102], [103, -99]], { state: 'combat', accuracy: 0.6 });
      for (const e of mass) { e.hold(e.position.clone()); attackOrder(game, [e], game.player); }
      game.support = new FireSupport(game, { calls: 2, rounds: 6, spread: 7 });
      await m.talk([
        ['jung', '숲 가장자리! 또 모인다. 이 거리면 소총으론 안 닿는다!', { priority: 3 }],
        ['seoyeon', '순찰조, 대대 박격포반 연결했습니다. 쌍안경으로 좌표 지정하세요.', { radio: true, priority: 3 }],
      ]);
      game.support.announce();
      game.objectives.add('mortar', `쌍안경(${keyName(game.input.binding('support'))})으로 박격포 유도 — 숲 가장자리 적 집결지`, { marker: V(97, lv.hf(97, -98) + 1, -98) });
      const t2 = m.time;
      await m.until(() => mass.every((e) => e.dead) || m.time - t2 > 70);
      if (mass.every((e) => e.dead)) game.objectives.complete('mortar'); else game.objectives.fail('mortar');
      const all = [...w1, ...w2, ...flank, ...mass];
      // survivors retreat
      for (const e of all) if (!e.dead) { e.state = 'idle'; e.target = null; e.releaseToken(); e.setPath(V(87, 0, -110)); e.patrol = [V(87, 0, -120)]; }
      game.objectives.complete('hold');
      mg.disable(); game.support.available = false; if (game.support.active) game.support.toggle(false);
      game.audio.setMusic('tension');
      await m.talk([
        ['seoyeon', '순찰조, 철수하십시오. 마을을 거쳐 남쪽 집결지 브라보로. 장갑차가 15분 후 도착합니다.', { radio: true, priority: 3 }],
        ['yoon', '알았다. 전원 이동! 민재, 앞장서. 박도윤, 후방 맡아.'],
      ]);
    },
  },

  // ============ 4. FALL BACK THROUGH THE VILLAGE ============
  {
    id: 'fallback',
    async setup(game) {
      giveLoadout(game);
      const lv = game.level; for (const s of lv.sensors) s.ok = true; lv.blackout(); lv.startWar(); lv.dawn = 0.12;
      game.player.teleport(V(74, 0, -30), Math.PI);
      squadFollow(game);
      ['yoon', 'doyun', 'jung'].forEach((k, i) => game.squad[k].actor.root.position.set(72 - i * 1.5, lv.hf(72, -32), -32 - i));
      game.audio.startWind(0.07);
    },
    async run(game, m) {
      const lv = game.level, sq = game.squad;
      squadFollow(game);
      game.objectives.add('village', '민통선 마을을 지나 철수', { marker: V(78, lv.hf(78, 40), 40) });
      // dawn creeping in + fires in the distance
      m.every((dt) => { lv.dawn = Math.min(0.32, lv.dawn + dt * 0.0012); });
      game.effects.smokeColumn(V(-40, lv.hf(-40, -100) + 2, -100), 1.6); game.effects.smokeColumn(V(120, lv.hf(120, -120), -120), 2);
      game.effects.fireEmitter(V(13, lv.hf(13, -33) + 0.5, -33), 1.2); // generator shed burning
      m.spawn(async () => { await m.wait(5); await m.talk([['doyun', '마을 사람들은 다 대피했겠지예?'], ['yoon', '어제 소개령 떨어졌다. …떨어졌어야 한다.']]); });
      m.spawn(async () => { for (let i = 0; i < 4; i++) await artillery(game, m, V(40 + Math.random() * 80, 0, -10 - Math.random() * 30), { delay: 3 + Math.random() * 4, scale: 1.2, safeRadius: 18 }); });
      // ---- STEALTH: an enemy recon patrol sweeps the village edge — let it pass ----
      await m.until(() => game.player.position.z > 18);
      const outcome = await stealthPatrol(game, m);
      if (outcome === 'spotted') {
        game.audio.setMusic('combat');
        await m.say('jung', '들켰다! 정찰조 사격!', { priority: 3 });
        await m.until(() => m.flags.patrol.every((e) => e.dead), 60);
        for (const e of m.flags.patrol) if (!e.dead) e.kill(game.player.position);
        await m.say('yoon', '총소리 났다. 마을 쪽도 깨어났을 거다. 붙어서 가.', { priority: 3 });
      } else await m.say('yoon', '…지나갔다. 숨 쉬어라, 민재. 조용히 마을로 들어간다.', { priority: 3 });
      for (const k of ['yoon', 'jung']) { sq[k].setPassive(false); sq[k].follow(game.player); }
      sq.doyun.setPassive(false); sq.doyun.follow(game.player);
      await m.until(() => game.player.position.z > 30);
      // ---- AMBUSH ----
      const amb = spawnEnemies(game, [
        [100, 46], [97, 50.5], [104, 58], [96, 66, { role: 'flanker' }], [101, 72], [112, 60], [62, 66], [66, 47.5],
      ], { state: 'idle', yaw: -Math.PI / 2 });
      m.flags.ambush = amb;
      // Park is hit on the road (scripted, non-graphic)
      const parkSpot = V(80, 0, 47);
      sq.doyun.moveTo(parkSpot, { run: true });
      await m.until(() => sq.doyun.position.distanceTo(parkSpot) < 2 || game.player.position.z > 44, 15);
      attackOrder(game, amb, game.player);
      game.audio.setMusic('combat');
      game.audio.shot(V(97, 2, 50), { enemy: true });
      sq.doyun.actor.flinch(1); sq.doyun.pose('wounded'); sq.doyun.setPassive(true); setSquadStatus(game, 'doyun', 'wounded');
      game.effects.hitPuff(sq.doyun.chestPos(new THREE.Vector3()));
      await m.say('doyun', '윽—! 다리…! 다리 맞았다!', { priority: 3 });
      await m.say('yoon', '매복이다! 도윤이 맞았다! 민재, 도윤이 담벼락 뒤로 끌어! 내가 연막 깐다!', { priority: 3 });
      // smoke screen between Park and the eastern houses
      game.effects.smokeGrenade(V(88, lv.hf(88, 49), 49)); game.effects.smokeGrenade(V(86, lv.hf(86, 54), 54));
      sq.yoon.moveTo(V(77.5, 0, 52), { run: true }); sq.jung.moveTo(V(73, 0, 50.5), { run: true });
      game.objectives.add('rescue', '박도윤 상병을 엄폐물 뒤로 끌기', { marker: sq.doyun.position.clone() });
      await new Promise((resolve) => {
        const it = game.player.addInteractable({ pos: () => sq.doyun.position.clone().setY(sq.doyun.position.y + 0.5), prompt: '박도윤 끌기', hold: 1.2, radius: 2.0, onUse: () => { it.enabled = false; resolve(); } });
      });
      // DRAG: player moves slowly backwards-capable, weapon away; Park slides behind the player
      const coverPt = V(74, 0, 52.7);
      game.objectives.setMarker('rescue', coverPt.clone().setY(lv.hf(74, 52.7)));
      game.weapons.lowered = true; game.player.speedScale = 0.38;
      game.ui.hint('엄폐물(담벼락 뒤)까지 박도윤을 끌고 이동하십시오. 무기를 쓸 수 없습니다.', 4);
      const drag = m.every(() => {
        const p = game.player; const f = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
        const at = p.position.clone().addScaledVector(f, -1.0);
        const pr = sq.doyun.actor.root; pr.position.x += (at.x - pr.position.x) * 0.25; pr.position.z += (at.z - pr.position.z) * 0.25;
        pr.position.y = game.world.groundHeight(pr.position.x, pr.position.z, pr.position.y + 0.5);
        sq.doyun.yaw = Math.atan2(p.position.x - pr.position.x, p.position.z - pr.position.z) + Math.PI; pr.rotation.y = sq.doyun.yaw;
      });
      m.spawn(async () => { await m.wait(1.5); await m.say('doyun', '아악— 천천히… 천천히 해라…', { priority: 2 }); });
      await m.reach(coverPt, 2.2);
      drag(); game.weapons.lowered = false; game.player.speedScale = 1;
      game.objectives.complete('rescue');
      sq.yoon.moveTo(coverPt.clone().add(V(0.8, 0, 0.6)), { run: true, onArrive: (a) => { a.actor.gesture('point', 2); } });
      await m.say('yoon', '지혈대 감는다. 민재, 엄호해!', { priority: 3 });
      await m.wait(5);
      sq.doyun.unpose(); sq.doyun.limp = true; sq.doyun.follow(game.player, V(-1.0, 0, 1.6)); sq.doyun.setPassive(true);
      m.spawn(() => m.talk([
        ['doyun', '괜찮다… 괜찮다 캤제… 아, 씨. 커피 못 내리면 우짜노.', { priority: 2 }],
        ['minjae', '말하지 마십시오. 갑니다.'],
      ]));
      sq.yoon.follow(game.player, V(-2.5, 0, 3)); sq.jung.follow(game.player, V(2, 0, 2));
      game.objectives.add('clear', '마을의 적 제압', { count: amb.length });
      const off = m.bind(events.on('ai:death', ({ agent }) => { if (amb.includes(agent)) game.objectives.progress('clear'); }));
      await m.until(() => amb.every((e) => e.dead));
      off(); game.objectives.complete('clear'); game.objectives.complete('village');
      game.audio.setMusic('tension');
      await m.talk([['yoon', '정리됐다. 집결지까지 300미터. 멈추지 마.'], ['jung', '박도윤, 버텨라. 니 커피 마셔 준다 했다.']]);
    },
  },

  // ============ 5. RALLY POINT / EXTRACTION ============
  {
    id: 'extraction',
    async setup(game) {
      giveLoadout(game);
      const lv = game.level; for (const s of lv.sensors) s.ok = true; lv.blackout(); lv.startWar(); lv.dawn = 0.3;
      game.player.teleport(V(88, 0, 92), Math.PI);
      squadFollow(game); const sq = game.squad;
      sq.doyun.limp = true; sq.doyun.setPassive(true); sq.doyun.follow(game.player, V(-1, 0, 1.6)); setSquadStatus(game, 'doyun', 'wounded');
      ['yoon', 'doyun', 'jung'].forEach((k, i) => sq[k].actor.root.position.set(86 - i * 1.5, lv.hf(86, 90), 90 - i));
      game.audio.startWind(0.07);
    },
    async run(game, m) {
      const lv = game.level, sq = game.squad, scene = game.renderer.scene;
      m.every((dt) => { lv.dawn = Math.min(0.42, lv.dawn + dt * 0.0015); });
      game.objectives.add('rally', '집결지 브라보로 이동', { marker: V(100, lv.hf(100, 113), 113) });
      await m.reach(V(100, lv.hf(100, 113), 113), 8);
      game.objectives.complete('rally');
      sq.yoon.hold(V(96, 0, 110.5), V(90, 0, 80)); sq.jung.hold(V(105, 0, 110.5), V(95, 0, 80)); sq.doyun.pose('sit'); sq.doyun.actor.target.sit = 1;
      // APC arrives from the south
      const apc = buildAPC(); apc.position.set(100, lv.hf(100, 230), 230); apc.rotation.y = Math.PI; scene.add(apc);
      apc.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const eng = game.audio.engineLoop('apc'); eng?.set(0.7, 0.6);
      await m.say('apc', '여기 철마 2-1. 집결지 브라보 진입 중. 남쪽에서 접근한다, 사격 주의.', { radio: true, priority: 3 });
      game.objectives.add('defend', '장갑차 도착까지 집결지 사수');
      const wave = spawnEnemies(game, [[84, 84], [90, 88, { role: 'flanker' }], [96, 80], [104, 84], [110, 92], [80, 96]], { state: 'combat' });
      attackOrder(game, wave, game.player);
      game.audio.setMusic('combat');
      await m.say('yoon', '장갑차 올 때까지 버틴다! 진지 지켜!', { priority: 3 });
      // drive APC in over ~22s
      let arrived = false;
      const stopZ = 127;
      m.every((dt, t) => {
        if (arrived) return false;
        const remaining = apc.position.z - stopZ; const v = Math.min(9, Math.max(1.2, remaining * 0.35));
        apc.position.z -= v * dt; apc.position.y = lv.hf(apc.position.x, apc.position.z) + Math.sin(t * 9) * 0.01;
        apc.rotation.x = Math.sin(t * 3) * 0.006;
        eng?.setPos(apc.position); eng?.set(v / 9, 0.6);
        if (remaining < 0.05) { arrived = true; eng?.set(0.15, 0.4); }
      });
      await m.until(() => arrived);
      const apcCol = game.world.addBoxCentered(apc.position.clone().add(V(0, 1.2, 0)), V(3.6, 2.4, 7.2), { surface: 'metal' });
      // turret support fire on remaining enemies
      await m.say('apc', '2-1, 북쪽 위협 제압한다. 고개 숙여!', { radio: true, priority: 3 });
      const turret = apc.userData.turret;
      const support = m.every((dt, t) => {
        const live = wave.filter((e) => !e.dead); if (!live.length) return false;
        const tgt = live[0]; const yawTo = Math.atan2(tgt.position.x - apc.position.x, tgt.position.z - apc.position.z) - apc.rotation.y;
        turret.rotation.y += (yawTo - turret.rotation.y) * Math.min(1, dt * 2);
        m.flags.supT = (m.flags.supT || 0) - dt;
        if (m.flags.supT <= 0) {
          m.flags.supT = 1.6;
          const muzzle = turret.localToWorld(V(0, 0.35, 3.3));
          game.effects.muzzleFlash(muzzle, tgt.position.clone().sub(muzzle).normalize()); game.audio.shot(muzzle, { enemy: false });
          game.effects.tracer(muzzle, tgt.chestPos(new THREE.Vector3()));
          setTimeout(() => { if (!tgt.dead) game.combat.explode(tgt.position.clone(), { radius: 3.5, damage: 140, scale: 0.6, owner: 'world', playerSafe: true }); }, 180);
        }
      });
      await m.until(() => wave.every((e) => e.dead), 40);
      support();
      for (const e of wave) if (!e.dead) e.kill(apc.position);
      game.objectives.complete('defend');
      game.audio.setMusic('cinematic');
      // ramp down
      const ramp = apc.userData.ramp; let rt = 0;
      m.every((dt) => { rt = Math.min(1, rt + dt * 0.5); ramp.rotation.x = -rt * 1.35; if (rt >= 1) return false; });
      await m.say('apc', '램프 내린다. 빨리 타!', { radio: false, priority: 3 });
      const rampPos = apc.localToWorld(V(0, 1.0, -4.6));
      game.objectives.add('board', '장갑차 탑승', { marker: rampPos });
      sq.doyun.unpose(); sq.doyun.moveTo(apc.localToWorld(V(0, 0, -6)), { onArrive: (a) => a.pose('sit') });
      sq.yoon.moveTo(apc.localToWorld(V(-1.2, 0, -6.5))); sq.jung.moveTo(apc.localToWorld(V(1.2, 0, -6.5)));
      await new Promise((resolve) => { const it = game.player.addInteractable({ pos: rampPos, prompt: '장갑차 탑승', radius: 3, onUse: () => { it.enabled = false; resolve(); } }); });
      game.objectives.complete('board');

      // ---------------- APC TURRET RIDE ----------------
      events.emit('ui:fade', { to: 1, dur: 0.4 }); await m.wait(0.5);
      const seatAgent = (a, x, z, yaw) => { scene.remove(a.actor.root); apc.add(a.actor.root); a.actor.root.position.set(x, 0.62, z); a.yaw = yaw; a.actor.root.rotation.y = yaw; a.pose('sit'); a.actor.target.sit = 1; };
      seatAgent(sq.yoon, 0.75, -0.6, -Math.PI / 2); seatAgent(sq.doyun, -0.75, -1.2, Math.PI / 2); seatAgent(sq.jung, 0.75, -1.9, -Math.PI / 2);
      sq.doyun.limp = false; game.world.removeCollider(apcCol); ramp.rotation.x = 0;
      const gun = new MountedWeapon(game, { kind: 'apc', vehicle: apc, interactable: false, yawRange: Math.PI, pitchRange: [-0.2, 0.35] });
      game.mounted.push(gun); gun.mount();
      events.emit('ui:fade', { to: 0, dur: 0.8 });
      game.audio.setMusic('combat');
      game.objectives.add('turret', '장갑차 포탑 사수 — 동쪽 철수로 확보');
      await m.say('apc', '포수가 부상이다! 민재, 포탑 잡아! 동쪽 도로로 빠진다!', { radio: true, priority: 3 });
      const route = new THREE.CatmullRomCurve3([[100, 127], [104, 124.5], [116, 121.5], [134, 122.5], [155, 125.5], [178, 127], [196, 128]].map(([x, z]) => V(x, lv.hf(x, z), z)));
      const routeLen = route.getLength(); let u = 0, speed = 0; m.flags.apcHold = false;
      const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
      m.every((dt, t) => {
        speed += ((m.flags.apcHold ? 0 : 6.5) - speed) * Math.min(1, dt * 0.7);
        u = Math.min(1, u + speed * dt / routeLen);
        const p = route.getPoint(u), q = route.getPoint(Math.min(1, u + 0.01));
        apc.position.set(p.x, p.y + Math.sin(t * 9) * 0.012, p.z);
        apc.rotation.y += wrap(Math.atan2(q.x - p.x, q.z - p.z) - apc.rotation.y) * Math.min(1, dt * 1.6);
        apc.rotation.x = Math.sin(t * 2.7) * 0.008 * (speed / 6.5);
        eng?.setPos(apc.position); eng?.set(0.25 + speed / 8, 0.6);
        if (u >= 1) return false;
      });
      // roadside ambush: infantry in the treeline + two armed trucks
      await m.until(() => u > 0.12);
      const roadside = spawnEnemies(game, [[132, 108], [138, 106], [146, 109], [158, 107], [166, 110], [174, 108]], { state: 'combat' });
      attackOrder(game, roadside, game.player);
      await m.say('jung', '도로 북쪽 숲! 매복이다!', { priority: 3 });
      const techA = new EnemyVehicle(game, { path: [V(150, 0, 62), V(147, 0, 92), V(144, 0, 111)], speed: 8 });
      const techB = new EnemyVehicle(game, { path: [V(196, 0, 70), V(190, 0, 98), V(184, 0, 114)], speed: 7 });
      game.objectives.add('technicals', '적 기관총 트럭 파괴', { count: 2 });
      const offV = m.bind(events.on('vehicle:destroyed', () => game.objectives.progress('technicals')));
      await m.say('apc', '기관총 트럭 두 대! 기관포로 날려버려!', { radio: true, priority: 3 });
      await m.until(() => u > 0.32);
      m.flags.apcHold = true;
      await m.say('apc', '길에 잔해다 — 정지! 트럭부터 잡아!', { radio: true, priority: 3 });
      const tH = m.time;
      await m.until(() => (techA.dead && techB.dead) || m.time - tH > 60);
      for (const v of [techA, techB]) if (!v.dead) v.destroy();
      offV(); game.objectives.complete('technicals');
      m.flags.apcHold = false;
      await m.say('apc', '통로 열렸다, 전진!', { radio: true, priority: 3 });
      await m.until(() => u >= 1 || roadside.every((e) => e.dead), 50);
      for (const e of roadside) if (!e.dead) e.kill(apc.position);
      await m.until(() => u >= 1, 40);
      game.objectives.complete('turret');

      // ---------------- ENDING (from the turret hatch) ----------------
      game.audio.setMusic('cinematic'); game.cine.letterbox(true);
      gun.fireT = 999; // weapon safe
      const helos = [buildHelicopter(), buildHelicopter()];
      helos.forEach((h, i) => { h.position.set(apc.position.x - 30 + i * 18, 42 + i * 6, apc.position.z + 120 + i * 25); h.rotation.y = Math.PI; scene.add(h); });
      const rotor = game.audio.rotorLoop(); rotor?.set(0.9);
      m.every((dt, t) => {
        helos.forEach((h, i) => { h.position.z -= (38 + i * 4) * dt; h.position.y += Math.sin(t + i) * 0.02; h.rotation.x = -0.12; h.userData.rotor.rotation.y += dt * 30; h.userData.tail.rotation.x += dt * 40; h.userData.beacon.visible = Math.sin(t * 8) > 0; });
        rotor?.setPos(helos[0].position);
        if (helos[1].position.z < -300) return false;
      });
      await m.talk([
        ['apc', '포수, 잘했다. 이제 숨 돌려.', { priority: 3 }],
        ['jung', '…D-38이었는데.', { priority: 3 }],
        ['yoon', '전역은 미뤄졌다, 정경수.', { priority: 3 }],
        ['seoyeon', '전 부대에 알린다. 현 시각부로 데프콘 1 발령. 전 전선 교전 중.', { radio: true, priority: 3 }],
        ['seoyeon', '…연서시 방면, 통신 두절. 반복한다. 연서시 방면 통신 두절.', { radio: true, priority: 3 }],
        ['doyun', '…민재야. 연서시면… 니 집…', { priority: 3 }],
        ['minjae', '……', { priority: 3, duration: 2.4 }],
      ]);
      await m.wait(2.5);
      events.emit('ui:fade', { to: 1, dur: 2.5 }); await m.wait(3);
      rotor?.stop(); eng?.stop();
      game.cine.title('FRONTLINE — IRON ECHO', 'MISSION 01 COMPLETE', 6, 'center');
      game.audio.setMusic('ending');
      await m.wait(6.5);
    },
  },
];
