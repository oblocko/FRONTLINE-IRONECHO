// MISSION 06 — NIGHT MARKET (야시장)
// POV: Daniel Voss. 2029-03-19 23:40 IST, Mumbai (fictional places and names), humid night, neon.
//
// Carries M05's outcome (storyFlags) into the mission and adds new decisions that again change play:
//   M05 carry-over  m05_drive upload → someone is probing Maya's server · carry → the drive is the only copy
//                   m05_tail tied → Daniel still has the trackers' radio (guard positions at the godown)
//                   m05_tail released → an anonymous warning about the rooftop lookout
//                   m05_cole stall → Brennan's phone surfaced at Mumbai airport
//   ① who won the lot (watched from the rooftop; no quiz)  m06_buyer   right / wrong / none
//   ② how to follow the courier with the case              m06_route   crowd (on foot, stealth) / rail (over the viaduct, get ahead)
//        crowd → tail through the bazaar and the laundry ghat; spotted → he runs and the godown is ready for you
//        rail  → fight the lookouts on the viaduct, come down first and wait inside the godown
//   ③ the standoff with Nadia                              m06_nadia   lower / aim / drive (only if the drive was carried) / maya (only if it was uploaded)
import * as THREE from 'three';
import { setEnemyMix } from '../ai/CharacterLib.js';
import { MumbaiMarket, MUMBAI } from '../world/levels/MumbaiMarket.js';
import { events } from '../core/Events.js';
import { saves } from '../core/SaveSystem.js';
import { keyName } from '../player/Player.js';
import { setSleeveLook } from '../player/WeaponModels.js';
import { V, attackOrder, interact, choose, flag } from './common.js';
import { suspicion, takedowns, fade, trackShots, ammoFromDead } from './stealth.js';

export const TEXTURES = ['concrete', 'asphalt', 'metal', 'paintedMetal', 'corrugated', 'wood', 'fabric', 'plaster'];
export const PROPS = ['wooden_crate_01', 'wooden_crate_02', 'metal_trash_can', 'Barrel_01'];
const M = MUMBAI;
const rand = (a, b) => a + Math.random() * (b - a);
const k = (game, a) => `<kbd>${keyName(game.input.binding(a))}</kbd>`;

export function EPILOGUE() {
  const f = saves.data.storyFlags; const out = [];
  out.push('경매에 나온 것은 ECHO의 "시연 데이터"였다. 레이더에 가짜 표적을 띄우고 감청 기록을 지어내는 방법을 보여 주는 기록 — 판매자는 끝까지 얼굴을 드러내지 않았다.');
  if (f.m06_buyer === 'right') out.push('마야는 낙찰자의 얼굴을 신원 조회에 걸었다. 홍콩에 등록된 해운 중개회사의 이사, 라비 데사이.');
  else out.push('낙찰자가 누구였는지는 끝내 확인하지 못했다.');
  if (f.m06_nadia === 'lower' || f.m06_nadia === 'drive' || f.m06_nadia === 'maya') out.push('나디아 라만은 총을 거두었다. 믿어서가 아니라, 기록을 남기려면 다니엘이 필요해서였다.');
  else out.push('나디아 라만은 총을 거두지 않은 채 다음 접선 장소만 알려 주었다.');
  return out.join(' ');
}

// ---------------------------------------------------------------------------------------------
function daniel(game) {
  setSleeveLook('jacket');
  const w = game.weapons; w.clear(); w.setSuppressed(true);
  if (flag('m06_hasCarbine')) w.give('carbine', { mag: 30, reserve: 60 });
  w.give('pistol', { mag: 17, reserve: 51 }); w.grenades = 0; w.equip(flag('m06_hasCarbine') ? 'carbine' : 'pistol', true); w.emitAmmo();
}
function giveCarbine(game) { if (game.weapons.inventory.carbine) return false; game.weapons.give('carbine', { mag: 30, reserve: 60 }); game.weapons.equip('carbine'); saves.setFlag('m06_hasCarbine', true); game.ui.hint(`<b>카빈 획득</b> — ${k(game, 'weapon1')} 카빈 · ${k(game, 'weapon2')} 소음 권총`, 4); return true; }
const thug = (game, x, z, extra = {}, y = 0) => game.director.spawn({ team: 'enemy', faction: 'merc', hat: 'none', pos: V(x, y, z), accuracy: 0.7, state: 'idle', ...extra });
const civ = (game, x, z, extra = {}) => game.director.spawn({ team: 'civilian', faction: 'civ', hat: 'none', weapon: false, passive: true, invulnerable: true, name: '행인', pos: V(x, 0, z), ...extra });
function crowd(game, m, n = 22) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const x = rand(-2.8, 2.8), z = rand(-50, 76); const a = civ(game, x, z); list.push(a);
    m.spawn(async () => { for (;;) { const tz = rand(-52, 78), tx = rand(-2.8, 2.8); a.moveTo(V(tx, 0, tz)); await m.until(() => a.dead || a.position.distanceTo(V(tx, a.position.y, tz)) < 1.2, 90); await m.wait(rand(0.5, 5)); } });
  }
  for (let i = 0; i < 6; i++) { const a = civ(game, rand(-60, 30), rand(8, 12)); list.push(a); m.spawn(async () => { for (;;) { const tx = rand(-62, 34); a.moveTo(V(tx, 0, rand(8, 12))); await m.until(() => a.dead || Math.abs(a.position.x - tx) < 1.2, 90); await m.wait(rand(1, 6)); } }); }
  return list;
}

export async function build(game) {
  setEnemyMix({ kpa: 1 });
  const lv = new MumbaiMarket(game); game.level = lv; await lv.build();
  game.director.visionRange = 35;
  game.squad = {}; game.squadList = [{ id: 'maya', rank: '', name: '마야 첸 (무전)', status: '' }];
  game.audio.startWind(0.03);
  ammoFromDead(game, game.mission, { giveRifle: giveCarbine });
}

export const SEGMENTS = [
  // ============ 0. THE BAZAAR, UP TO THE ROOF ============
  {
    id: 'market',
    async setup(game) { daniel(game); game.player.teleport(M.start.clone(), 0); game.audio.setMusic('ambient'); },
    async run(game, m) {
      const lv = game.level, p = game.player;
      lv.crowd = crowd(game, m);
      game.cine.title('NIGHT MARKET', '2029. 03. 19  23:40 IST\n인도 뭄바이 · 항구 옆 시장\n다니엘 보스', 7);
      const drive = flag('m05_drive'), tail = flag('m05_tail'), cole = flag('m05_cole');
      await m.talk([
        ['maya', '…들려? 시장 북쪽 끝 부두 창고. 자정에 경매가 시작돼. 품목 목록 네 번째 줄이 "기만 체계 시연 기록"이야.', { radio: true }],
        ['daniel', '이름을 그렇게 정직하게 붙였다고?', {}],
        ['maya', '정직한 건 이름뿐이야.', { radio: true }],
        ...(drive === 'upload' ? [['maya', '그리고 하나 더. 파리 이후로 누가 계속 내 서버 문을 두드려. 문을 세 개 더 달았어.', { radio: true }], ['daniel', '네 개면 좀 더 안심이 될 텐데.', {}]] : []),
        ...(drive === 'carry' ? [['maya', '드라이브는 아직 주머니에 있지? 그거 잃어버리면 우린 그냥 말 많은 두 사람이야.', { radio: true }], ['daniel', '단추까지 잠갔다.', {}]] : []),
        ...(cole === 'stall' ? [['maya', '참, 브레넌. 그 전화가 어제 여기 공항 기지국에 한 번 잡혔어. 우연은 아니겠지.', { radio: true }]] : []),
        ['maya', '부두가 내려다보이는 건물이 있어. 남쪽 바깥 계단으로 옥상까지.', { radio: true }],
      ]);
      if (tail === 'tied') { await m.say('tracker', '(빼앗은 무전기) …창고 쪽 경비 넷, 시장 옥상 감시 하나. 교대는 한 시.', { radio: true, priority: 2 }); await m.say('daniel', '파리에서 빌린 무전기가 아직 일을 하는군.', {}); }
      if (tail === 'released') { game.ui.hint('<b>[문자 · 발신자 없음]</b> 부두 쪽 옥상에 감시 한 명. 계단은 남쪽. — E3', 6); await m.say('daniel', '…파리에서 풀어준 친구군. 빚은 갚는 타입이었어.', {}); }
      game.objectives.add('roof', '부두가 보이는 건물 옥상으로 — 남쪽 바깥 계단', { marker: lv.roofStair.from.clone().setY(1.6) });
      await m.reach(lv.roofStair.from, 3, { yTol: 6 });
      game.objectives.setMarker('roof', lv.roofStair.to.clone().setY(M.roof.y + 1.6));
      // a lookout on the roof
      const look = thug(game, M.roof.x0 + 3, M.roof.z0 + 4, { visionRange: 0.1, yaw: Math.PI / 2 }); look.setPassive(true);
      look.hold(V(M.roof.x1 - 2, 0, M.roof.z0 + 5)); m.spawn(async () => { for (;;) { look.hold(V(M.roof.x1 - 2, 0, M.roof.z0 + rand(3, 8))); look.lookAt(V(60, 6, -60)); await m.wait(rand(4, 7)); look.hold(V(M.roof.x0 + 3, 0, M.roof.z0 + rand(3, 8))); await m.wait(rand(4, 7)); } });
      m.spawn(async () => { await m.wait(3); if (p.position.y > 6) return; await m.say('daniel', '(계단을 오르며) 계단은 마흔 넘은 사람의 적이야.', { priority: 1 }); await m.say('maya', '서른아홉 때도 똑같이 말했어.', { radio: true, priority: 1 }); });
      takedowns(game, m, [look]);
      const st = suspicion(game, m, { watchers: () => [look], range: 18 });
      m.spawn(async () => { await m.until(() => st.spotted, 1e9); look.setPassive(false); look.visionRange = 40; attackOrder(game, [look], p); });
      await m.until(() => p.position.y > M.roof.y - 1 && (look.dead || look.koed), 600);
      st.stop?.();
      game.objectives.complete('roof');
      if (look.koed) await m.say('daniel', '(쓰러진 감시원을 눕히며) 잘 자. 교대는 한 시라던데.', {});
    },
  },

  // ============ 1. THE AUCTION, WATCHED FROM THE ROOF ============
  {
    id: 'auction',
    async setup(game) { daniel(game); game.player.teleport(V(M.roof.x1 - 2.5, M.roof.y, M.roof.z0 + 6), -Math.PI / 2); },
    async run(game, m) {
      const lv = game.level, p = game.player, A = M.auctionTable;
      // auctioneer, five bidders around the table, guards, the courier waiting by the door
      const auc = civ(game, A.x + 0.2, A.z - 1.4, { name: '경매인' }); auc.hold(V(A.x + 0.2, 0, A.z - 1.4)); auc.lookAt(V(A.x - 6, 1.5, A.z));
      const spots = [[-3.5, 2.6], [-1.2, 3.4], [1.2, 3.4], [3.5, 2.6], [-5.2, 0.6]];
      const bidders = spots.map(([dx, dz], i) => { const b = civ(game, A.x + dz + 2, A.z + dx, { name: '응찰자' }); b.hold(V(A.x + dz + 2, 0, A.z + dx)); b.lookAt(V(A.x, 1.4, A.z)); return b; });
      const guards = [thug(game, A.x - 6, A.z - 4), thug(game, A.x - 6, A.z + 4), thug(game, A.x + 4, A.z - 5), thug(game, 58, -44)];
      guards.forEach((g) => { g.setPassive(true); g.visionRange = 0.1; g.lookAt(V(40, 1.5, -55)); });
      const courier = civ(game, A.x - 3, A.z - 6, { name: '운반책' }); courier.hold(V(A.x - 3, 0, A.z - 6));
      // Nadia: on the roof of the container stack across the yard (she is watching the same thing)
      const nadia = game.director.spawn({ team: 'civilian', faction: 'civ', look: 'nadia', sex: 'f', hat: 'none', weapon: true, passive: true, invulnerable: true, name: '나디아', pos: V(97, 5.2, -40) });
      nadia.hold(V(97, 0, -40)); nadia.lookAt(V(A.x, 1, A.z)); lv.nadia = nadia;
      const winner = bidders[Math.floor(Math.random() * 4)];   // differs every playthrough
      lv.winner = winner; lv.courier = courier; lv.aucGuards = guards;
      game.objectives.add('watch', '경매를 지켜보며 "시연 기록"의 낙찰자를 확인', { marker: A.clone().setY(2) });
      await m.talk([
        ['maya', '창고 문이 열려 있어. 테이블 위 조명 아래가 경매대야.', { radio: true }],
        ['daniel', '응찰자 다섯, 경비 넷. 경매인은 정장. 술은 안 보이는군.', {}],
        ['maya', '이 바닥에서 술은 계약서 쓰고 나서 마셔.', { radio: true }],
      ]);
      game.ui.hint(`사람을 화면 가운데 두고 잠시 지켜본 뒤 ${k(game, 'interact')} 로 표시`, 6);
      // the auction: three earlier lots, then the ECHO lot with three rounds of raised hands; the last raise wins
      const raise = (b) => { b.actor.gesture('wave', 0.9); b.lookAt(V(A.x, 2.2, A.z)); };
      const lot = async (name, n) => { await m.say('auctioneer', name, { priority: 2 }); for (let i = 0; i < n; i++) { await m.wait(rand(1.5, 2.6)); raise(bidders[Math.floor(Math.random() * 5)]); } await m.wait(1.5); await m.say('auctioneer', '낙찰.', { priority: 2 }); };
      await lot('3번 품목. 위성 통신 암호 모듈, 시작가 4만.', 3);
      await lot('4번 품목. "기만 체계 시연 기록" — 시작가 25만.', 0);
      const others = bidders.filter((b) => b !== winner);
      for (let i = 0; i < 4; i++) { await m.wait(rand(1.6, 2.8)); raise(i % 2 === 0 ? others[Math.floor(Math.random() * others.length)] : winner); }
      await m.wait(rand(1.8, 2.6)); raise(winner);
      await m.wait(2.2); await m.say('auctioneer', '…더 없습니까? 낙찰.', { priority: 3 });
      // the case goes to the courier, not to the winner
      lv.case.visible = false;
      courier.moveTo(V(A.x - 0.8, 0, A.z), { onArrive: (c) => c.actor.gesture('wave', 0.6) });
      await m.until(() => courier.position.distanceTo(V(A.x - 0.8, courier.position.y, A.z)) < 1.2, 30);
      await m.say('maya', '…가방을 받은 건 운반책이야. 낙찰자는 그대로 앉아 있어. 누가 손을 들었는지 봤어?', { radio: true, priority: 3 });
      // mark the winner: hold the view on a bidder, interact
      const fe = document.createElement('div'); fe.className = 'stealth-meter'; fe.innerHTML = '<div class="lbl">표시</div><div class="bar"><i></i></div><div class="st"></div>'; game.ui.hud.appendChild(fe); m.bind(() => fe.remove());
      const cam = game.renderer.camera; let watched = null, wt = 0, verdict = game.autoChoices?.m06_buyer ?? null; const t0 = m.time; const ndc = new THREE.Vector3(); let sawNadia = 0;
      p.fovOverride = 22;
      m.every((dt) => {
        if (verdict) return false;
        let best = null, bestD = 0.06;
        for (const b of bidders) { ndc.copy(b.position).add(V(0, 1.4, 0)).project(cam); const d = Math.hypot(ndc.x, ndc.y); if (ndc.z < 1 && d < bestD) { bestD = d; best = b; } }
        ndc.copy(nadia.position).add(V(0, 1.4, 0)).project(cam); if (ndc.z < 1 && Math.hypot(ndc.x, ndc.y) < 0.07) sawNadia += dt;
        if (sawNadia > 1.2 && !lv.sawNadia) { lv.sawNadia = true; saves.setFlag('m06_saw_nadia', true); m.spawn(() => m.say('daniel', '…컨테이너 위에 누가 있다. 우리랑 같은 걸 보고 있어.', { priority: 2 })); }
        if (best !== watched) { watched = best; wt = 0; } else if (best) wt += dt;
        const kk = Math.min(1, wt / 1.0); fe.querySelector('i').style.width = `${Math.round(kk * 100)}%`;
        fe.querySelector('.st').textContent = !best ? '응찰자를 가운데에 두고 지켜본다' : kk < 1 ? '지켜보는 중…' : '표시할 수 있다';
        if (best && kk >= 1 && game.input.pressed('interact')) { verdict = best === winner ? 'right' : 'wrong'; return false; }
        if (m.time - t0 > 40) { verdict = 'none'; return false; }
      });
      await m.until(() => verdict, 1e9);
      fe.remove(); p.fovOverride = null;
      saves.setFlag('m06_buyer', verdict); (game.choiceLog ||= []).push({ flag: 'm06_buyer', key: verdict, text: verdict === 'right' ? '낙찰자를 정확히 표시' : verdict === 'wrong' ? '엉뚱한 응찰자를 표시' : '낙찰자를 표시하지 못함' });
      if (verdict === 'right') await m.talk([['maya', '사진 받았어. 조회 걸게. 한 시간 줘.', { radio: true, priority: 3 }]]);
      else if (verdict === 'wrong') await m.talk([['maya', '…그 사람은 마지막에 손을 안 들었어. 사진은 일단 보내 둘게.', { radio: true, priority: 3 }]]);
      else await m.talk([['maya', '못 봤어? 괜찮아. 가방이 더 중요해.', { radio: true, priority: 3 }]]);
      game.objectives.complete('watch');
      // the courier leaves west with one guard
      courier.moveTo(V(46, 0, 10));
      await m.say('maya', '운반책이 나간다. 경비 하나 붙었어 — 서쪽 골목 쪽.', { radio: true, priority: 3 });
      const route = await choose(game, m, { flag: 'm06_route', tag: '결정 // 가방을 따라간다', timeout: 25, fallback: 0,
        options: [{ key: 'crowd', text: '내려가서 군중 속에서 따라간다', note: '조용히 — 들키면 운반책이 뛴다' },
          { key: 'rail', text: '고가 철로로 앞질러 간다', note: '빠르다 — 철로 위 감시를 뚫어야 한다' }] });
      lv.route = route;
    },
  },

  // ============ 2. FOLLOWING THE CASE ============
  {
    id: 'tail',
    async setup(game) {
      daniel(game); const lv = game.level;
      if (!lv.courier) { lv.courier = civ(game, 46, 10, { name: '운반책' }); lv.crowd = crowd(game, game.mission); }
      game.player.teleport(V(M.roof.x0 + 1.4, 0, M.roof.z1 + 1.6), Math.PI);
    },
    async run(game, m) {
      const lv = game.level, p = game.player, courier = lv.courier; const route = flag('m06_route', 'crowd');
      const escort = thug(game, courier.position.x + 1.5, courier.position.z, { visionRange: 0.1 }); escort.setPassive(true); lv.escort = escort;
      const path = [V(30, 0, 10), V(0, 0, 10), V(-2, 0, 18), V(-1, 0, 22), V(-30, 0, 20), V(-50, 0, 40), V(-64, 0, 55), M.godownDoor.clone().add(V(2, 0, 0))];
      let idx = 0, ran = false;
      const walk = (fast = false) => m.spawn(async () => { for (; idx < path.length; idx++) { const pt = path[idx]; courier.moveTo(pt, { run: fast || ran }); escort.moveTo(pt.clone().add(V(1.2, 0, 1.2)), { run: fast || ran }); await m.until(() => courier.position.distanceTo(V(pt.x, courier.position.y, pt.z)) < 1.6, 120); if (!ran && route === 'crowd' && Math.random() < 0.5) { await m.wait(rand(1, 2.5)); escort.lookAt(p.position.clone()); } } lv.courierArrived = true; });
      if (route === 'crowd') {
        game.objectives.add('follow', '운반책을 놓치지 말고 따라가기 — 들키지 말 것', { marker: courier.position });
        m.every(() => { game.objectives.setMarker('follow', courier.position.clone().setY(2.2)); if (lv.courierArrived) return false; });
        walk();
        // the escort keeps checking behind; close and in the open = suspicion, the crowd covers you
        const st = suspicion(game, m, { watchers: () => [escort], range: 20, crowd: () => lv.crowd || [], label: '눈치챔' });
        let lost = 0;
        m.every((dt) => { if (lv.courierArrived || ran) return false; const d = p.position.distanceTo(courier.position); lost = d > 45 ? lost + dt : 0; if (lost > 12) { game.failMission('운반책을 놓쳤습니다', '운반책을 따라가기'); return false; } });
        m.spawn(async () => { await m.until(() => st.spotted, 1e9); ran = true; saves.setFlag('m06_tail', 'spotted'); escort.setPassive(false); escort.visionRange = 40; attackOrder(game, [escort], p); await m.say('courier', '따라온다! 뛰어!', { priority: 3 }); walk(true); });
        await m.until(() => lv.courierArrived || courier.dead, 900);
        st.stop?.();
        if (!flag('m06_tail')) saves.setFlag('m06_tail', 'clean');
        game.objectives.complete('follow');
        await m.say('maya', ran ? '안으로 뛰어 들어갔어. 이제 다 알고 있어.' : '서쪽 창고로 들어갔어. 아무도 너를 못 봤어.', { radio: true, priority: 3 });
      } else {
        // over the viaduct: the courier walks; Daniel runs the deck and comes down by the ghat first
        walk();
        game.objectives.add('rail', '동쪽 역 계단으로 철로 위에', { marker: V((M.stationE.x0 + M.stationE.x1) / 2, 1.5, M.stationE.z1) });
        await m.reach(V((M.stationE.x0 + M.stationE.x1) / 2, 0, M.stationE.z1 - 1), 4, { yTol: 10 });
        game.objectives.complete('rail');
        const deck = [thug(game, 10, -20.5, { state: 'combat', accuracy: 0.6 }, M.rail.y), thug(game, -18, -19.5, { state: 'combat', accuracy: 0.6 }, M.rail.y), thug(game, -40, -21, { state: 'combat', accuracy: 0.6 }, M.rail.y)];
        m.spawn(async () => { await m.until(() => p.position.y > M.rail.y - 0.5, 300); attackOrder(game, deck, p); await m.say('thug', '철로 위에 누가 있다!', { priority: 2 }); });
        game.objectives.add('run', '철로를 따라 서쪽 역까지 — 운반책보다 먼저', { marker: V((M.stationW.x0 + M.stationW.x1) / 2, M.rail.y + 1.5, -18) });
        await m.reach(V((M.stationW.x0 + M.stationW.x1) / 2, M.rail.y, -17), 4, { yTol: 3 });
        game.objectives.complete('run');
        game.objectives.add('down', '계단으로 내려가 창고에 먼저 들어가기', { marker: M.godownDoor.clone().setY(1.6) });
        await m.reach(M.godownDoor.clone().add(V(-3, 0, 0)), 3.5);
        const first = !lv.courierArrived; saves.setFlag('m06_tail', first ? 'ahead' : 'late');
        game.objectives.complete('down');
        await m.say('maya', first ? '네가 먼저야. 운반책은 아직 빨래터 근처야.' : '…늦었어. 벌써 안에 있어.', { radio: true, priority: 3 });
        if (first) { await m.say('daniel', '(자루 더미 뒤로) 그럼 손님 맞을 준비를 하지.', {}); await m.until(() => lv.courierArrived, 300); }
      }
    },
  },

  // ============ 3. THE GODOWN ============
  {
    id: 'godown',
    async setup(game) { daniel(game); game.player.teleport(M.godownDoor.clone().add(V(6, 0, 0)), -Math.PI / 2); },
    async run(game, m) {
      const lv = game.level, p = game.player, Gd = M.godown;
      const tail = flag('m06_tail', 'clean');
      // inside: the contact and his men; the courier hands over the case
      const contact = thug(game, -83, 55, { name: '접선자', visionRange: 0.1 }); contact.setPassive(true);
      const men = [thug(game, -86, 47), thug(game, -86, 63), thug(game, -77, 66), thug(game, -77, 44)];
      if (tail === 'spotted' || tail === 'late') men.push(thug(game, -74, 52), thug(game, -74, 58));
      const courier = lv.courier && !lv.courier.dead ? lv.courier : civ(game, -78, 55, { name: '운반책' });
      courier.moveTo(V(-80, 0, 55));
      const all = [contact, ...men];
      if (flag('m05_tail') === 'tied') { game.objectives.add('intel', '빼앗은 무전기 — 창고 안 위치', { markers: all.map((e) => e.position.clone().setY(2)) }); m.every(() => { const live = all.filter((e) => !e.dead); if (!live.length) return false; game.objectives.setMarkers('intel', live.map((e) => e.position.clone().setY(2.1))); }); }
      const alerted = tail === 'spotted';
      if (alerted) { attackOrder(game, all, p); game.audio.setMusic('combat'); await m.say('thug', '문! 문 쪽이다!', { priority: 3 }); }
      else { for (const e of all) { e.setPassive(true); e.visionRange = 0.1; } await m.talk([['courier', '물건이다. 돈은 약속대로.', { priority: 2 }], ['thug', '…열어 봐.', { priority: 2 }]]); }
      game.objectives.add('case', '창고 안 — 가방을 확보', { marker: V(-81, 1.6, 55) });
      const goLoud = () => { for (const e of all) if (!e.dead) { e.setPassive(false); e.visionRange = 30; } attackOrder(game, all.filter((e) => !e.dead), p); game.audio.setMusic('combat'); };
      if (!alerted) { trackShots(game, m, (s) => { if (!s.suppressed || all.some((e) => !e.dead && e.position.distanceTo(p.position) < 9)) goLoud(); }); m.spawn(async () => { await m.until(() => p.position.x < -72.5, 600); await m.wait(2.5); goLoud(); }); }
      // midway through the fight the lights die — someone else is in here
      m.spawn(async () => {
        await m.until(() => all.filter((e) => e.dead).length >= 2, 600);
        lv.setGodownDark(true); game.audio.click(0.5, 180, 0.3);
        await m.say('daniel', '…전원이 나갔다. 내가 한 게 아니야.', { priority: 2 });
        game.ui.hint(`${k(game, 'flashlight')} 손전등`, 3);
        m.spawn(async () => { for (const e of all) { await m.wait(rand(0.8, 2)); if (!e.dead && Math.random() < 0.6) e.kill(V(-90, 1, 55)); } });   // shots from the dark that aren't his
      });
      await m.until(() => all.every((e) => e.dead), 420);
      for (const e of all) if (!e.dead) e.kill(p.position);
      if (!courier.dead) courier.moveTo(V(-87, 0, 68), { run: true });
      game.objectives.complete('case'); game.audio.setMusic('tension');
    },
  },

  // ============ 4. NADIA ============
  {
    id: 'nadia',
    async setup(game) { daniel(game); game.level.setGodownDark(true); game.player.teleport(V(-79, 0, 55), Math.PI / 2); },
    async run(game, m) {
      const lv = game.level, p = game.player;
      const nadia = game.director.spawn({ team: 'civilian', faction: 'civ', look: 'nadia', sex: 'f', hat: 'none', weapon: true, passive: true, invulnerable: true, name: '나디아', pos: V(-84, 0, 55.5) });
      if (lv.nadia && lv.nadia !== nadia) game.director.remove(lv.nadia);
      nadia.hold(V(-84, 0, 55.5)); nadia.lookAt(p.position); nadia.actor.target.aim = 1; game.dialogue.bindSpeaker('nadia', nadia);
      game.objectives.add('talk', '총을 겨눈 여자');
      const p0 = p.position.clone(); p.yaw = Math.atan2(-(nadia.position.x - p0.x), -(nadia.position.z - p0.z));
      lv.setGodownDark(false);
      await m.talk([
        ['nadia', '움직이지 마. 가방은 내 발 앞에 있어. 그리고 당신 얼굴은 내 기억 속에 있지.', { priority: 3 }],
        ['daniel', '전원은 당신이었군. 깔끔했어.', { priority: 3 }],
        ['nadia', '칭찬은 받아 둘게. 다니엘 보스. 2024년 7월, GLASSWATER.', { priority: 3 }],
        ...(flag('m06_saw_nadia') ? [['daniel', '컨테이너 위에서 경매를 보던 사람이 당신이었어.', { priority: 3 }], ['nadia', '당신도 날 봤으면서 손을 흔들진 않더군.', { priority: 3 }]] : []),
      ]);
      const opts = [{ key: 'lower', text: '총을 내리고 GLASSWATER에 대해 아는 대로 말한다' }, { key: 'aim', text: '총을 겨눈 채 거래를 제안한다 — 가방은 나눠서 본다' }];
      if (flag('m05_drive') === 'carry') opts.push({ key: 'drive', text: '주머니의 드라이브를 꺼낸다 — 원본 비행 기록' });
      else if (flag('m05_drive') === 'upload') opts.push({ key: 'maya', text: '무전기를 내밀어 마야와 연결한다' });
      const pick = await choose(game, m, { flag: 'm06_nadia', tag: '결정 // 나디아 라만', timeout: 30, fallback: 1, options: opts });
      if (pick === 'lower') await m.talk([
        ['daniel', '(총을 바닥에 내려놓으며) 나는 회수 작전이라고 들었어. 화물이 어디로 갔는지는 지난주에야 알았지.', { priority: 3 }],
        ['nadia', '편리한 기억력이네.', { priority: 3 }],
        ['daniel', '기억이 편리했으면 여기 안 왔겠지.', { priority: 3 }],
        ['nadia', '…총 다시 집어. 바닥에 두면 내가 불편해.', { priority: 3 }],
      ]);
      else if (pick === 'aim') await m.talk([
        ['daniel', '당신도 쏘지 않았고 나도 안 쐈어. 가방은 같이 연다. 내용은 둘 다 본다.', { priority: 3 }],
        ['nadia', '거래하는 말투가 꼭 당신 고용주 같네.', { priority: 3 }],
        ['daniel', '전 고용주. 그 사람들은 날 지웠어.', { priority: 3 }],
        ['nadia', '…총구는 내리지 않을 거야. 당신도 마찬가지겠지.', { priority: 3 }],
      ]);
      else if (pick === 'drive') await m.talk([
        ['daniel', '(드라이브를 꺼내며) 파리에서 꺼낸 원본 비행 기록이야. 화물은 본국으로 가지 않았어. 이 도시로 왔지.', { priority: 3 }],
        ['nadia', '…증거를 들고 다니는 사람은 처음 보네. 다들 증거를 지우러 다니거든.', { priority: 3 }],
        ['daniel', '지우는 쪽은 해 봤어. 재미없더군.', { priority: 3 }],
        ['nadia', '(총구를 내린다) 보여 줘. 나중에. 여기서 말고.', { priority: 3 }],
      ]);
      else await m.talk([
        ['daniel', '(무전기를 내밀며) 내 동료야. 기록은 이 사람이 갖고 있어.', { priority: 3 }],
        ['maya', '…안녕하세요. 지금 총이 저를 향하고 있는 건 아니죠?', { radio: true, priority: 3 }],
        ['nadia', '아직은. 당신 서버를 두드리는 게 누군지는 알아?', { priority: 3 }],
        ['maya', '알았으면 문을 세 개나 더 달진 않았겠죠.', { radio: true, priority: 3 }],
      ]);
      await m.talk([
        ['nadia', '저 운반책이 가는 곳을 알아. 그리고 낙찰자가 누구한테 물건을 넘기는지도.', { priority: 3 }],
        ['daniel', '그걸 왜 나한테 말해 주지.', { priority: 3 }],
        ['nadia', '당신이 필요해서. 좋아서가 아니고.', { priority: 3 }],
        ['nadia', '내 동생 이름은 사미르였어. 당신이 기억 못 하는 그 밤에.', { priority: 3, duration: 4.5 }],
      ]);
      game.objectives.complete('talk');
      game.cine.letterbox(true); await m.wait(2.5);
    },
  },
];
