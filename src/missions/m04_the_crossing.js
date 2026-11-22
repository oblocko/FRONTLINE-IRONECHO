// MISSION 04 — THE CROSSING (도하)
// POV: PVT Han Min-jae. 2029-03-18 05:40 KST, west-coast port, dawn sea fog.
// The first combined ROK–US counter-landing. Events: helicopter door-gun run
// over the fogbound port (rail section, RPG hit) · landing with a US Marine
// company · three coastal gun batteries silenced with demolition charges ·
// naval gunfire called in by binoculars · IFV turret ride down into the port ·
// crane control room taken, a container dropped on an enemy truck · red smoke
// on the LZ and a timed hold against the counter-attack · the fog lifts on the
// allied fleet; a US comms officer tells Lee Seo-yeon about forged intercepts.
import * as THREE from 'three';
import { setEnemyMix } from '../ai/CharacterLib.js';
import { CoastalPort, PORT } from '../world/levels/CoastalPort.js';
import { buildAPC } from '../world/Props.js';
import { events } from '../core/Events.js';
import { MountedWeapon } from '../gameplay/MountedWeapon.js';
import { FireSupport } from '../gameplay/FireSupport.js';
import { pbr } from '../render/TextureFactory.js';
import { EnemyVehicle } from '../gameplay/EnemyVehicle.js';
import { V, spawnEnemies, attackOrder, giveLoadout, interact } from './common.js';
import { EnemyBase } from '../world/EnemyBase.js';

export const TEXTURES = ['concrete', 'asphalt', 'dirt', 'grassdead', 'rock', 'metal', 'paintedMetal', 'corrugated', 'wood', 'fabric', 'camoROK', 'camoUS', 'camoEnemy', 'sandbag', 'plaster'];
export const EPILOGUE = '3월 18일 오전, 연합 상륙부대 1만 2천 명이 서해 3부두로 들어왔다. 개전 후 첫 대규모 반격이었다. 같은 날 오후, 미 해병대 통신정보장교 해리스 중위는 개전 48시간 전 접수된 "북측 공격 명령 감청 기록"에 원본 신호가 존재하지 않는다는 비공식 메모를 이서연 중위에게 건넸다. 메모의 마지막 줄에는 한 단어만 적혀 있었다 — ECHO.';

const P = PORT;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const gy = (game, x, z) => game.level.hf(x, z);

// fly a group along a 3D curve; optional crab target keeps the right-hand door facing it
function fly(game, m, heli, pts, { speed = 16, look = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts); const len = curve.getLength(); const st = { u: 0, v: speed * 0.3, target: speed, done: false };
  m.every((dt, t) => {
    st.v += (st.target - st.v) * Math.min(1, dt * 0.5); st.u = Math.min(1, st.u + st.v * dt / len);
    const p = curve.getPoint(st.u), q = curve.getPoint(Math.min(1, st.u + 0.01));
    heli.position.copy(p).add(V(0, Math.sin(t * 1.3) * 0.15, 0));
    let yaw;
    const tg = look?.(p);
    if (tg) { const dx = tg.x - p.x, dz = tg.z - p.z, l = Math.hypot(dx, dz) || 1; yaw = Math.atan2(-dz / l, dx / l); }
    else yaw = Math.atan2(q.x - p.x, q.z - p.z);
    heli.rotation.y += wrap(yaw - heli.rotation.y) * Math.min(1, dt * 1.2);
    heli.rotation.z = Math.sin(t * 0.9) * 0.03; heli.rotation.x = -0.05 * (st.v / speed);
    heli.userData.sway = Math.sin(t * 1.7) * 0.015;
    if (st.u >= 1) { st.done = true; return false; }
  });
  return st;
}
// drive a ground vehicle along a curve following the terrain
function drive(game, m, obj, pts, { speed = 6, onStep = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => V(x, 0, z))); const len = curve.getLength(); const st = { u: 0, v: 0, target: speed, done: false };
  m.every((dt) => {
    st.v += (st.target - st.v) * Math.min(1, dt * 0.6); st.u = Math.min(1, st.u + st.v * dt / len);
    const p = curve.getPoint(st.u), q = curve.getPoint(Math.min(1, st.u + 0.01));
    obj.position.set(p.x, gy(game, p.x, p.z), p.z); obj.rotation.y += wrap(Math.atan2(q.x - p.x, q.z - p.z) - obj.rotation.y) * Math.min(1, dt * 2);
    onStep?.(st, dt); if (st.u >= 1) { st.done = true; return false; }
  });
  return st;
}
function seatIn(game, vehicle, list) {
  const scene = game.renderer.scene;
  for (const [a, x, y, z, yaw] of list) { scene.remove(a.actor.root); vehicle.add(a.actor.root); a.actor.root.position.set(x, y, z); a.yaw = yaw; a.actor.root.rotation.y = yaw; a.pose('sit'); a.actor.target.sit = 1; }
}
function unseat(game, vehicle, agents, at) {
  const scene = game.renderer.scene;
  agents.forEach((a, i) => { if (a.actor.root.parent === vehicle) vehicle.remove(a.actor.root); scene.add(a.actor.root); const x = at.x + (i % 3 - 1) * 1.6, z = at.z + 1.5 + Math.floor(i / 3) * 1.6; a.actor.root.position.set(x, gy(game, x, z), z); a.actor.root.rotation.set(0, 0, 0); a.unpose(); });
}
function place(game, a, x, z) { a.actor.root.position.set(x, gy(game, x, z), z); }
function allies(game) { const s = game.squad; return [s.yoon, s.jung, ...(game.marines || [])]; }
function ensureMarines(game, at) {
  if (game.marines) return game.marines;
  const d = game.director;
  const names = ['레예스', '모랄레스', '킴', '오코너'];
  game.marines = names.map((n, i) => d.spawn({ team: 'friendly', faction: 'us', name: n, pos: V(at.x + 2 + i * 1.3, 0, at.z + 2), invulnerable: true, accuracy: 1.15, followOffset: V(-3 + i * 2, 0, 5 + (i % 2) * 1.5) }));
  game.dialogue.bindSpeaker('reyes', game.marines[0]); game.dialogue.bindSpeaker('marine', game.marines[1]);
  game.squadList.push({ id: 'reyes', rank: 'CPT', name: '레예스 (미 해병)', status: '' });
  followAll(game);
  return game.marines;
}
// chain of command: Yoon leads the Korean squad toward the objective, Jung follows him; Capt. Reyes leads his marines
function followAll(game) {
  const s = game.squad; for (const a of allies(game)) { a.unpose(); a.setPassive(false); }
  s.yoon.lead(game.player); s.jung.follow(s.yoon, V(1.6, 0, 2.4));
  const mr = game.marines || []; if (mr[0]) { mr[0].lead(game.player); mr[0].followOffset = V(4, 0, 0); mr.slice(1).forEach((a, i) => a.follow(mr[0], V(i % 2 ? 2 : -2, 0, 2.5 + i * 1.5))); }
}
// Enemy strongpoint in the port below the bluff — the target for the naval gunfire. Sandbagged ring, a concrete
// bunker, an MG nest that sweeps the bluff with bursts and RPG teams that fire at the player. Returns its defenders.
function ensureSupport(game, calls = 2) { if (!game.support) game.support = new FireSupport(game, { calls, rounds: 5, spread: 8, delay: 5.5, caller: 'reyes' }); else game.support.calls = Math.max(game.support.calls, calls); }

export async function build(game) {
  setEnemyMix({ kpa: 0.7, kpa_sf: 0.2, kpa_officer: 0.1 });   // enemy unit types for this mission (uniform / gear)
  const lv = new CoastalPort(game); game.level = lv; await lv.build();
  lv.enemyBase = new EnemyBase(game, PORT.base.clone().setY(lv.hf(PORT.base.x, PORT.base.z)), { facing: V(-1, 0, 0) });   // visible across the LZ from the battery bluff
  game.mission.bind(() => lv.enemyBase.dispose());
  const d = game.director; d.visionRange = 60;
  game.squad = {
    yoon: d.spawn({ team: 'friendly', name: '윤태호', pos: V(30, 0, -146), invulnerable: true, accuracy: 1.2, followOffset: V(-2.2, 0, 2.5) }),
    jung: d.spawn({ team: 'friendly', name: '정경수', pos: V(32, 0, -146), invulnerable: true, accuracy: 1.1, followOffset: V(2.2, 0, 3) }),
  };
  game.marines = null;
  game.dialogue.bindSpeaker('yoon', game.squad.yoon); game.dialogue.bindSpeaker('jung', game.squad.jung);
  game.squadList = [{ id: 'yoon', rank: 'SSG', name: '윤태호', status: '' }, { id: 'jung', rank: 'SGT', name: '정경수', status: '' }];
  game.audio.startWind(0.07);
  game.mission.every(() => {
    const p = game.player.position;
    for (const a of d.agents) if (a.team === 'enemy' && a.dead && a.ammoDrop === undefined) a.ammoDrop = true;
    for (const a of d.agents) if (a.ammoDrop && a.dead && a.position.distanceTo(p) < 1.8) { a.ammoDrop = false; const got = game.weapons.addAmmo('rifle', 45); if (got > 0) game.ui.hint(`탄약 +${got}`, 1.5); }
    for (const ap of lv.ammoPos) if (ap.distanceTo(p) < 2 && (lv.ammoT ?? 0) <= (game.mission?.time ?? 0)) { lv.ammoT = game.mission.time + 20; game.weapons.refill(); game.ui.hint('탄약 보급', 1.5); }
  });
  let barkT = 0;
  game.mission.every((dt) => {
    barkT -= dt; if (barkT > 0 || !d.enemies().some((e) => e.state === 'combat')) return;
    barkT = 7 + Math.random() * 6;
    const lines = [['yoon', '엄폐하고 쏴!'], ['jung', '사격 중!'], ['reyes', '정면에 적! 교전!'], ['marine', '이동 중!'], ['yoon', '컨테이너 위 조심해!'], ['jung', '재장전! 엄호!'], ['marine', '수류탄 투척!']];
    const l = lines[Math.floor(Math.random() * lines.length)]; game.dialogue.bark(l[0], l[1]);
  });
}

// ------------------------------------------------------------------
export const SEGMENTS = [
  // ============ 0. DOOR GUN RUN OVER THE PORT ============
  {
    id: 'insertion',
    async setup(game) {
      giveLoadout(game); const lv = game.level;
      const heli = lv.helicopter(V(-300, 34, 160)); lv.heli = heli;
      seatIn(game, heli, [[game.squad.yoon, -0.45, -1.05, 0.9, Math.PI / 2], [game.squad.jung, -0.45, -1.05, -0.5, Math.PI / 2]]);
      const mg = new MountedWeapon(game, { kind: 'mg', pos: V(0, 0, 0), yaw: 0, yawRange: 1.35, pitchRange: [-0.8, 0.3], prompt: '도어건', interactable: false, def: { damage: 60 } });
      heli.add(mg.root); mg.root.position.set(1.12, -0.2, -0.35); mg.root.rotation.y = -Math.PI / 2; game.mounted.push(mg); lv.doorGun = mg;
      mg.mount(); mg.locked = true; game.weapons.lowered = false;
      lv.rotor = game.audio.rotorLoop?.(); lv.rotor?.set(0.9);
      game.audio.setMusic('cinematic');
    },
    async run(game, m) {
      const lv = game.level, heli = lv.heli;
      game.cine.title('THE CROSSING', '2029. 03. 18  05:40 KST\n서해안 · 서해 3부두\n한미 연합 기동부대', 7);
      const wing = lv.helicopter(V(-320, 36, 175));
      const path = [V(-300, 34, 160), V(-170, 30, 115), V(-80, 25, 70), V(-30, 22, 24), V(4, 24, -28), V(14, 27, -88), V(26, 26, -132), V(30, gy(game, 30, -150) + 6, -150), V(30, gy(game, 30, -150) + 1.5, -150)];
      const look = (p) => (p.z > -35 ? (p.x < -120 ? null : V(-20, 0, 30)) : p.z > -140 ? V(-25, 10, -130) : null);
      const run = fly(game, m, heli, path, { speed: 15, look });
      const wingRun = fly(game, m, wing, path.map((p, i) => p.clone().add(V(14, 4, 16 + (i === path.length - 1 ? -6 : 0)))).map((p, i, a) => (i >= a.length - 2 ? V(46, gy(game, 46, -162) + (i === a.length - 1 ? 1.5 : 6), -162) : p)), { speed: 15 });
      m.every(() => { lv.rotor?.setPos(heli.position); if (run.done) return false; });
      await m.talk([
        ['pilot', '해무가 짙다. 고도 30, 항만 상공 진입 1분 전.', { radio: true }],
        ['reyes', '여기는 이글 투, 레예스다. 한국군 분대, 환영한다. 우리 중대는 2번기다. 포대부터 끝내자.', { radio: true }],
        ['yoon', '…미군하고 같이 들어가는 건 처음이다.'],
        ['jung', '말 안 통하면 손짓하면 되지. 민재, 도어건 잡았지?'],
      ]);
      // enemies on the quay and the bluff
      const port = spawnEnemies(game, [[-45, 40], [-40, 20], [-30, 52], [-12, 30], [5, 10], [-20, -20], [10, -30], [-48, 64]], { state: 'combat', accuracy: 0.4, visionRange: 140 });
      attackOrder(game, port, game.player);
      const tech = new EnemyVehicle(game, { path: [V(-50, 0, 120), V(-50, 0, 60), V(-48, 0, 10)], speed: 7, hp: 420 });
      game.audio.setMusic('combat');
      await m.say('pilot', '부두에 적! 도어건, 쏴라!', { radio: true, priority: 3 });
      game.objectives.add('door', '도어건으로 착륙지대까지 엄호');
      // RPG hit over the container yard
      await m.until(() => heli.position.z < 10, 60);
      const src = V(-12, P.quay + 1.5, -24); const near = heli.position.clone().add(V(-4, 1.5, 3));
      game.effects.tracer(src, near, 90); game.audio.whiz?.(near);
      await m.wait(0.5);
      game.combat.explode(near, { radius: 3, damage: 0, scale: 1.1, playerSafe: true, shake: 2.2 }); game.audio.tinnitus(0.5);
      game.renderer.fx.flash = 0.6;
      m.spawn(async () => { for (let i = 0; i < 6; i++) { game.audio.click(0.25, 1800, 0.12); await m.wait(0.35); } });
      await m.say('pilot', '피격! RPG! …아직 날 수 있다, 버틴다!', { radio: true, priority: 3 });
      const bluff = spawnEnemies(game, [[-20, -96], [16, -100], [-14, -118], [22, -140], [40, -124], [14, -162]], { state: 'combat', accuracy: 0.45, visionRange: 140 });
      attackOrder(game, bluff, game.player);
      await m.until(() => run.done, 120);
      for (const e of port) if (!e.dead) e.kill(V(0, 0, 0));
      if (!tech.dead) tech.destroy();
      await m.say('pilot', '착륙! 내려, 내려!', { radio: true, priority: 3 });
      lv.doorGun.locked = false; lv.doorGun.disable(); game.player.exitSeat(V(32.5, gy(game, 32.5, -148), -148)); game.player.yaw = Math.PI; game.objectives.complete('door');
      unseat(game, heli, [game.squad.yoon, game.squad.jung], V(31, 0, -146));
      ensureMarines(game, V(44, 0, -160));
      followAll(game);
      // helicopters lift off and leave east
      m.spawn(async () => { await m.wait(5); fly(game, m, heli, [heli.position.clone(), heli.position.clone().add(V(0, 20, 10)), V(220, 60, -60)], { speed: 22 }); fly(game, m, wing, [wing.position.clone(), wing.position.clone().add(V(0, 20, 10)), V(230, 66, -40)], { speed: 22 }); await m.wait(14); lv.rotor?.stop(); });
      await m.talk([
        ['reyes', '착륙지대 확보! 한국군, 우리랑 같이 간다. 포대는 서쪽 절벽 위에 세 곳!', { priority: 3 }],
        ['yoon', '민재, 붙어라. 첫 포대부터!', { priority: 3 }],
      ]);
    },
  },

  // ============ 1. THE COASTAL BATTERIES ============
  {
    id: 'batteries',
    async setup(game) {
      giveLoadout(game);
      game.player.teleport(V(32, gy(game, 32, -146), -146), Math.PI);
      place(game, game.squad.yoon, 30, -144); place(game, game.squad.jung, 34, -144);
      ensureMarines(game, V(40, 0, -152)); followAll(game);
      const bluff = spawnEnemies(game, [[-20, -96], [16, -100], [-14, -118], [22, -140]], { state: 'combat', accuracy: 0.6 }); attackOrder(game, bluff, game.player);
    },
    async run(game, m) {
      const lv = game.level; followAll(game);
      game.audio.setMusic('combat');
      const bats = lv.batteries;
      game.objectives.add('batteries', '해안 포대 무력화 — 포미에 폭파 장약 설치', { count: 3, markers: bats.map((b) => b.breechPos.clone()) });
      // guns fire seaward until silenced
      for (const b of bats) {
        let t = 3 + Math.random() * 5;
        m.every((dt) => {
          if (b.destroyed) return false; t -= dt; if (t > 0) return;
          t = 7 + Math.random() * 4;
          const mz = b.barrelPivot.localToWorld(V(0, 0, 6.8)); game.effects.muzzleFlash(mz, V(-1, 0.1, 0)); game.effects.flashLight(mz, 0xffb060, 30, 0.12, 60); game.audio.explosion(mz, 0.9);
          game.effects.smokeColumn(mz, 0.5, [0.5, 0.5, 0.5]); game.player.addShake(Math.max(0, 0.4 - mz.distanceTo(game.player.position) / 120));
        });
      }
      // defenders at each battery
      const guards = bats.map((b, i) => spawnEnemies(game, [[b.pos.x + 6, b.pos.z + 5], [b.pos.x + 7, b.pos.z - 5], [b.pos.x + 12, b.pos.z], [b.pos.x + 3, b.pos.z + (i % 2 ? -7 : 7)]], { state: 'idle', yaw: Math.PI / 2 }));
      m.every(() => { for (const g of guards) for (const e of g) if (e.state !== 'combat' && !e.dead && e.position.distanceTo(game.player.position) < 45) { attackOrder(game, g, game.player); break; } });
      let done = 0;
      const plant = async (b) => {
        await interact(game, { pos: b.breechPos, prompt: `포대 ${b.name} 폭파 장약 설치`, hold: 2.4, radius: 2.4 });
        game.ui.hint('<b style="color:var(--warn)">장약 설치 — 4초 후 폭발, 물러나십시오!</b>', 3.5);
        for (let i = 0; i < 8; i++) { game.audio.click(0.25, 2400, 0.05); await m.wait(0.5); }
        game.combat.explode(b.breechPos.clone(), { radius: 6.5, damage: 160, scale: 2, owner: 'player', playerSafe: game.player.position.distanceTo(b.breechPos) > 7 });
        b.destroyed = true; game.effects.smokeColumn(b.breechPos.clone().add(V(0, 1, 0)), 1.2, [0.2, 0.2, 0.2]); game.effects.fireEmitter(b.breechPos.clone(), 0.8);
        let k = 0; m.every((dt) => { k = Math.min(1, k + dt * 1.5); b.barrelPivot.rotation.x = -0.12 + k * 0.32; b.mount.rotation.z = k * 0.06; if (k >= 1) return false; });
        done++; game.objectives.progress('batteries');
        if (done === 1) m.spawn(async () => {
          await m.talk([['reyes', `포대 ${b.name} 침묵! 구축함 연결됐다 — 함포 지원 두 번 가능하다. 쌍안경으로 찍어!`, { radio: true, priority: 3 }]]);
          ensureSupport(game, 2); game.support.announce();
          // the strongpoint in the port opens up on the bluff — the naval guns' target
          // the haze thins: the enemy compound on the inland hill east of the LZ comes into view and opens up
          const base = lv.enemyBase, C = base.C; lv.thinFog(0.0055, 12); lv.strong = base.activate(m, spawnEnemies);
          const label = () => `동쪽 언덕 적 거점 파괴 — 쌍안경으로 함포 지원 요청 (${base.keyTotal - base.keyLeft}/${base.keyTotal})`;
          game.objectives.add('strong', label(), { marker: C.clone().setY(C.y + 6) });
          m.bind(events.on('base:destroyed', ({ s }) => { if (!s.key) return; game.objectives.setText('strong', label()); game.ui.hint(`<b>${s.name}</b> 파괴`, 2); }));
          await m.say('jung', '동쪽 언덕! 적 거점이다 — 기관총이랑 RPG 쏜다! 엎드려!', { priority: 3 });
          await m.say('reyes', '저 거점 — 막사, 지휘 벙커, 통신탑, 유류고 전부 함포로 날려버려! 쌍안경으로 좌표 찍어!', { radio: true, priority: 3 });
          // the destroyer stays on station while the compound holds out
          m.every(() => { if (base.keyLeft <= 1) return false; if (game.support && game.support.calls <= 0 && !game.support.pending.some((p) => p.left > 0)) { game.support.calls = 1; game.support.announce(); } });
          await m.until(() => base.keyLeft <= 1, 480);
          for (const st of base.structures) if (st.key && !st.dead) base.destroy(st);
          for (const e of lv.strong) if (!e.dead) e.kill(C);
          game.objectives.complete('strong');
          await m.say('reyes', '직격! 거점 전체가 불타고 있다. 좋아!', { radio: true, priority: 3 });
        });
        else if (done < 3) m.spawn(() => m.say('yoon', `${b.name} 끝! 다음!`, { priority: 2 }));
      };
      await Promise.all(bats.map(plant));
      game.objectives.complete('batteries');
      if (lv.strong) await m.until(() => lv.strong.every((e) => e.dead), 300);
      // a counter-attack from the bunker line
      const counter = spawnEnemies(game, [[4, -132], [8, -128], [0, -146], [14, -150, { role: 'flanker' }], [-4, -122]], { state: 'combat', accuracy: 0.8 }); attackOrder(game, counter, game.player);
      await m.say('jung', '벙커 쪽에서 나온다!', { priority: 3 });
      await m.until(() => game.director.enemies().filter((e) => e.position.z < -60).length === 0, 120);
      for (const e of game.director.enemies()) if (e.position.z < -60) e.kill(game.player.position);
      game.audio.setMusic('tension');
      await m.talk([
        ['reyes', '포대 세 곳 전부 침묵 확인. 다음은 항만이다. 장갑차가 올라온다 — 포탑 맡을 사람!', { priority: 3 }],
        ['yoon', '민재가 합니다. 장갑차 포탑 해 봤습니다.', { priority: 3 }],
      ]);
    },
  },

  // ============ 2. IFV RIDE DOWN INTO THE PORT ============
  {
    id: 'descent',
    async setup(game) {
      giveLoadout(game);
      game.player.teleport(V(32, gy(game, 32, -118), -118), Math.PI);
      place(game, game.squad.yoon, 30, -120); place(game, game.squad.jung, 34, -120);
      ensureMarines(game, V(38, 0, -124)); followAll(game);
      for (const b of game.level.batteries) b.destroyed = true;
      for (const st of game.level.enemyBase.structures) game.level.enemyBase.destroy(st);
    },
    async run(game, m) {
      const lv = game.level, scene = game.renderer.scene;
      const apc = buildAPC(); apc.position.set(60, gy(game, 60, -150), -150); scene.add(apc); lv.apc = apc;
      const eng = game.audio.engineLoop('truck'); eng?.set(0.8, 0.35);
      const arrive = drive(game, m, apc, [[60, -150], [40, -132], [36, -116]], { speed: 6, onStep: () => eng?.setPos(apc.position) });
      await m.until(() => arrive.done, 40);
      game.objectives.add('apc', '장갑차 포탑 탑승', { marker: apc.position.clone().add(V(0, 2.6, 0)) });
      await interact(game, { pos: apc.position.clone().add(V(0, 1.5, 0)), prompt: '장갑차 포탑 탑승', radius: 4 });
      game.objectives.complete('apc');
      events.emit('ui:fade', { to: 1, dur: 0.4 }); await m.wait(0.45);
      seatIn(game, apc, [[game.squad.yoon, 0.75, 0.62, -0.6, -Math.PI / 2], [game.squad.jung, -0.75, 0.62, -1.4, Math.PI / 2]]);
      for (const mr of game.marines) { mr.actor.setVisible(false); mr.invisible = true; mr.setPassive(true); mr.hold(V(36, 0, -116)); }
      const gun = new MountedWeapon(game, { kind: 'apc', vehicle: apc, interactable: false, yawRange: Math.PI, pitchRange: [-0.25, 0.35] });
      game.mounted.push(gun); gun.mount(); lv.apcGun = gun;
      events.emit('ui:fade', { to: 0, dur: 0.8 });
      game.audio.setMusic('combat');
      game.objectives.add('road', '항만 진입로 확보 — 적 차량 파괴', { count: 2 });
      await m.say('apc', '출발한다! 포수, 부두 쪽 차량부터 잡아!', { radio: true, priority: 3 });
      const ride = drive(game, m, apc, [[36, -116], [36, -90], [35, -64], [32, -40], [27, -14], [23, 12]], { speed: 5.5, onStep: () => eng?.setPos(apc.position) });
      const techs = [new EnemyVehicle(game, { path: [V(24, 0, 75), V(22.5, 0, 50), V(24, 0, 32)], speed: 7, hp: 420 }), new EnemyVehicle(game, { path: [V(-50, 0, 25), V(-50, 0, -36), V(-40, 0, -41), V(6, 0, -42)], speed: 6, hp: 420 })];
      const inf = spawnEnemies(game, [[-6, -20], [6, -6], [-12, 4], [14, 22], [2, 40], [-26, 30], [40, 4]], { state: 'combat', accuracy: 0.6 }); attackOrder(game, inf, game.player);
      m.bind(events.on('vehicle:destroyed', ({ vehicle }) => { if (techs.includes(vehicle)) game.objectives.progress('road'); }));
      // live markers on the trucks still running (they come in from the quay side streets)
      m.every(() => { const live = techs.filter((t) => !t.dead); game.objectives.setMarkers('road', live.map((t) => t.position.clone().setY(t.position.y + 2))); if (!live.length) return false; });
      await m.until(() => ride.done && techs.every((t) => t.dead), 150);
      for (const t of techs) if (!t.dead) t.destroy();
      ride.target = 0; game.objectives.complete('road');
      await m.until(() => inf.filter((e) => !e.dead).length <= 1, 50);
      for (const e of inf) if (!e.dead) e.kill(apc.position);
      await m.say('apc', '여기까지다! 컨테이너 사이로는 못 들어간다. 하차!', { radio: true, priority: 3 });
      gun.manned = false; events.emit('hud:mounted', null); game.weapons.hidden = false; eng?.stop();
      game.player.exitSeat(V(apc.position.x - 3.5, P.quay, apc.position.z - 2)); game.player.yaw = -Math.PI / 2;
      unseat(game, apc, [game.squad.yoon, game.squad.jung], V(apc.position.x - 3, 0, apc.position.z - 4));
      game.marines.forEach((mr, i) => { mr.actor.setVisible(true); mr.invisible = false; place(game, mr, apc.position.x - 4 - i, apc.position.z + 3); mr.setPassive(false); });
      game.world.addBoxCentered(apc.position.clone().add(V(0, 1.2, 0)), V(3.4, 2.4, 7), { surface: 'metal' });
      followAll(game);
    },
  },

  // ============ 3. THE CRANE ============
  {
    id: 'crane',
    async setup(game) {
      giveLoadout(game);
      game.player.teleport(V(18, P.quay, 8), -Math.PI / 2);
      for (const st of game.level.enemyBase.structures) game.level.enemyBase.destroy(st);
      place(game, game.squad.yoon, 17, 11); place(game, game.squad.jung, 19, 11);
      ensureMarines(game, V(20, 0, 14)); followAll(game);
    },
    async run(game, m) {
      const lv = game.level, scene = game.renderer.scene, C = P.crane, cp = lv.craneParts;
      await m.say('reyes', '크레인 관제실을 잡아야 상륙정이 접안한다. 관제실은 부두 북쪽 끝!', { priority: 3 });
      const door = P.control.clone().add(V(4.5, 0, 1));
      game.objectives.add('control', '크레인 관제실 확보', { marker: door.clone().setY(P.quay + 1) });
      const guards = spawnEnemies(game, [[-30, -28], [-33, -36], [-40, -24], [-26, -18], [-44, -36], [-36, -30]], { state: 'combat', accuracy: 0.75 }); attackOrder(game, guards, game.player);
      await m.until(() => guards.every((e) => e.dead) && game.player.position.distanceTo(P.control) < 9, 300);
      for (const e of guards) if (!e.dead) e.kill(game.player.position);
      game.objectives.complete('control');
      await m.say('harris', '여기 해리스. 관제 시스템 원격 접속 열었다. 콘솔 만지면 크레인이 움직인다.', { radio: true, priority: 3 });
      game.objectives.add('console', '크레인 조작 콘솔 사용', { marker: lv.consolePos });
      await interact(game, { pos: lv.consolePos, prompt: '크레인 조작', radius: 2.2 });
      game.objectives.complete('console');
      // trolley runs in over the quay road
      game.audio.click(0.3, 300, 0.8);
      await new Promise((res) => m.every((dt) => { cp.trolley.position.x = Math.min(2, cp.trolley.position.x + dt * 6); if (cp.trolley.position.x >= 2) { res(); return false; } }));
      // an enemy armed truck comes down the quay road toward the squad
      await m.say('jung', '부두 북쪽에서 차량! 크레인 아래로 지나간다!', { priority: 3 });
      const truck = new EnemyVehicle(game, { path: [V(-50, 0, 125), V(-50, 0, 40), V(-50, 0, -32)], speed: 6.5, hp: 600 });
      game.objectives.add('drop', '차량이 크레인 아래를 지날 때 컨테이너 투하', { marker: V(C.x + 2, P.quay + 2, C.z) });
      // crane camera: looks down the quay road from the gantry; left click / F releases
      const cam = game.renderer.camera; game.player.cameraOverride = true; game.weapons.hidden = true;
      const ov = document.createElement('div'); ov.className = 'cctv-ov'; ov.innerHTML = '<div class="lbl">CRANE CAM 02 · 안벽 3번 · ● LIVE</div><div class="cross"></div><div class="key">좌클릭 / F — 컨테이너 투하</div>';
      game.ui.hud.appendChild(ov);
      const camOn = m.every(() => { cam.position.set(C.x + 0.5, P.quay + 27, C.z - 5); cam.lookAt(C.x + 2, P.quay, C.z + 15); cam.fov = 55; cam.updateProjectionMatrix(); });
      game.ui.hint('차량이 화면 가운데 표시선(크레인 바로 아래)에 들어오는 순간 투하하십시오', 6);
      await m.until(() => lv.dropNow || game.input.pressed('interact') || game.input.mouse.leftPressed || (!truck.dead && truck.position.z < C.z - 12), 120);
      lv.dropNow = false;
      // release: the container falls onto the road
      const box = cp.box; const wp = box.getWorldPosition(new THREE.Vector3()); cp.spreader.remove(box); scene.add(box); box.position.copy(wp); box.rotation.set(0, 0, 0);
      let vy = 0; const floor = P.quay + 1.3; let hitTruck = false;
      await new Promise((res) => m.every((dt) => {
        vy -= 22 * dt; box.position.y += vy * dt;
        if (!hitTruck && !truck.dead && Math.abs(truck.position.z - box.position.z) < 6.5 && Math.abs(truck.position.x - box.position.x) < 2.5 && box.position.y < floor + 3) { hitTruck = true; truck.destroy(); }
        if (box.position.y <= floor) { box.position.y = floor; game.effects.explosion(box.position.clone().add(V(0, -1, 0)), 0.6); game.audio.explosion(box.position, 0.8); game.player.addShake(0.4); res(); return false; }
      }));
      game.world.addBoxCentered(box.position.clone(), V(2.44, 2.6, 12.2), { surface: 'metal', cover: true });
      await m.wait(1.8);
      camOn(); ov.remove(); game.player.cameraOverride = false; game.weapons.hidden = false;
      game.objectives.complete('drop');
      if (hitTruck) await m.say('jung', '…깔렸다! 정통으로!', { priority: 3 });
      else {
        // missed: the container blocks the road; the truck stops behind it and the Marines' AT gunner finishes it
        m.every(() => { if (truck.dead) return false; if (truck.position.z < C.z + 10) truck.speed = 0; });
        await m.say('reyes', '빗나갔다! 그래도 길은 막혔어. 모랄레스, 대전차!', { priority: 3 });
        await m.until(() => truck.dead || truck.speed === 0, 25);
        await m.wait(2.5);
        if (!truck.dead) { const from = game.marines[1].position.clone().add(V(0, 1.5, 0)); game.effects.tracer(from, truck.position.clone().add(V(0, 1, 0)), 120); await m.wait(0.3); truck.destroy(); }
        await m.say('marine', 'Target destroyed! 차량 파괴!', { priority: 3 });
      }
      await m.say('harris', '좋아, 크레인 확보. 이제 상륙정이 붙을 수 있다. 착륙지대는 남쪽 광장이다.', { radio: true, priority: 3 });
    },
  },

  // ============ 4. RED SMOKE ON THE LZ, THE FOG LIFTS ============
  {
    id: 'lz',
    async setup(game) {
      giveLoadout(game);
      game.player.teleport(V(-30, P.quay, -22), Math.PI);
      for (const st of game.level.enemyBase.structures) game.level.enemyBase.destroy(st);
      place(game, game.squad.yoon, -28, -20); place(game, game.squad.jung, -32, -20);
      ensureMarines(game, V(-30, 0, -16)); followAll(game);
      game.level.craneParts.trolley.position.x = 2;
    },
    async run(game, m) {
      const lv = game.level, scene = game.renderer.scene, pz = P.plaza;
      followAll(game);
      game.objectives.add('smoke', '착륙지대에 적색 연막 표시', { marker: pz.clone().setY(P.quay + 1) });
      const way = spawnEnemies(game, [[24, 60], [14, 70], [36, 72], [30, 50]], { state: 'combat', accuracy: 0.7 }); attackOrder(game, way, game.player);
      await interact(game, { pos: pz.clone().setY(P.quay + 0.6), prompt: '적색 연막 투척', radius: 3 });
      game.effects.smokeGrenade(pz.clone().setY(P.quay + 0.1), [0.85, 0.22, 0.18], 160);
      game.objectives.complete('smoke');
      await m.talk([
        ['reyes', '이글 편대, 적색 연막 확인 바란다. 착륙지대 표시 완료!', { radio: true, priority: 3 }],
        ['pilot', '적색 연막 확인. 도착까지 75초. 착륙지대 지켜 줘라.', { radio: true, priority: 3 }],
      ]);
      ensureSupport(game, 1); game.support.calls = Math.max(1, game.support.calls); game.support.announce();
      game.objectives.add('hold', '증원 헬기 도착까지 착륙지대 사수');
      game.audio.setMusic('combat');
      let left = 75; m.every((dt) => { left -= dt; events.emit('hud:timer', { label: '증원 헬기 도착까지', seconds: left }); if (left <= 0) { events.emit('hud:timer', null); return false; } });
      const waves = [
        [[70, 96], [66, 104], [72, 84], [64, 112]],
        [[60, 60], [58, 130], [48, 124, { role: 'flanker' }], [74, 120], [66, 70]],
        [[70, 100], [62, 88], [68, 112], [56, 128]],
      ];
      for (const [i, w] of waves.entries()) {
        if (left <= 0) break;
        const es = spawnEnemies(game, w, { state: 'combat', accuracy: 0.75 }); attackOrder(game, es, game.player);
        if (i === 1) { new EnemyVehicle(game, { path: [V(95, 0, 96), V(60, 0, 94), V(46, 0, 92)], speed: 7, hp: 420 }); m.spawn(() => m.say('jung', '동쪽 창고에서 차량!', { priority: 3 })); }
        else m.spawn(() => m.say('yoon', i === 0 ? '창고 쪽! 동쪽!' : '또 온다!', { priority: 2 }));
        await m.until(() => left <= 0 || es.every((e) => e.dead), 32);
      }
      await m.until(() => left <= 0, 90);
      events.emit('hud:timer', null);
      // the reinforcement helicopters come in over the water and their door gunners clear the plaza
      const h1 = lv.helicopter(V(-260, 40, 80)), h2 = lv.helicopter(V(-270, 44, 110));
      const rotor = game.audio.rotorLoop?.(); rotor?.set(1);
      const f1 = fly(game, m, h1, [V(-260, 40, 80), V(-80, 30, 90), V(10, 14, 94), V(22, P.quay + 1.5, 92)], { speed: 20 });
      fly(game, m, h2, [V(-270, 44, 110), V(-90, 32, 112), V(20, 16, 108), V(36, P.quay + 1.5, 104)], { speed: 20 });
      m.every(() => { rotor?.setPos(h1.position); if (f1.done) return false; });
      await m.say('pilot', 'Eagle Flight 진입! 도어건 사격 개시!', { radio: true, priority: 3 });
      await m.wait(2);
      for (const e of game.director.enemies()) { const tr = h1.position.clone(); game.effects.tracer(tr, e.position.clone().add(V(0, 1, 0)), 200); e.kill(h1.position); }
      for (const v of game.director.vehicles) if (!v.dead && v.isVehicle && v.destroy && !v.isDrone) v.destroy?.();
      await m.until(() => f1.done, 30);
      game.objectives.complete('hold');
      game.audio.setMusic('cinematic');
      const more = ['로드리게스', '첸', '워커', '박'].map((n, i) => game.director.spawn({ team: 'friendly', faction: 'us', name: n, pos: V(24 + i * 1.5, 0, 96), invulnerable: true }));
      more.forEach((a, i) => a.moveTo(V(14 + i * 4, 0, 76), { run: true }));
      // ---------------- ENDING ----------------
      await m.say('reyes', '착륙지대 확보. …한국군. 서쪽 봐라. 바다.', { priority: 3 });
      lv.liftFog(8);
      game.objectives.add('look', '부두 끝에서 서쪽 바다 확인', { marker: V(-56, P.quay + 1, 60) });
      await m.until(() => game.player.position.x < -48 && Math.abs(game.player.position.z - 60) < 30, 45);
      game.objectives.complete('look');
      game.cine.letterbox(true);
      await m.wait(3);
      await m.talk([
        ['jung', '…세상에. 수평선이 전부 배다.', { priority: 3 }],
        ['yoon', '이제 반격이다, 민재.', { priority: 3 }],
        ['harris', '이 중위님, 해리스 중위입니다. 한국군 통신망 분석 담당이시라고 들었습니다.', { radio: true, priority: 3 }],
        ['seoyeon', '네, 이서연입니다. 무슨 일이죠?', { radio: true, priority: 3 }],
        ['harris', '개전 48시간 전에 우리 쪽에 들어온 \'북측 공격 명령 감청 기록\' 말입니다. 원본 신호가 없습니다. 기록만 있고, 전파는 없어요.', { radio: true, priority: 3 }],
        ['seoyeon', '…위조 감청 기록이라는 뜻입니까?', { radio: true, priority: 3 }],
        ['harris', '공식적으로는 아무 말도 안 했습니다. 다만 한국 쪽에서도 존재하지 않는 서명이 나온다고 들어서요.', { radio: true, priority: 3 }],
        ['seoyeon', '……같은 손일지도 모르겠네요.', { radio: true, priority: 3 }],
        ['minjae', '…도윤 상병님도 이걸 보셨으면 좋았을 텐데요.', { priority: 3 }],
        ['yoon', '보게 될 거다. 찾으러 갈 거니까.', { priority: 3 }],
      ]);
      await m.wait(1.5);
      events.emit('ui:fade', { to: 1, dur: 2.5 }); await m.wait(3);
      rotor?.stop();
      game.cine.title('THE CROSSING', 'MISSION 04 COMPLETE', 5, 'center');
      game.audio.setMusic('ending');
      await m.wait(5.5);
    },
  },
];
