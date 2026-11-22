// Shared helpers for mission scripts.
import * as THREE from 'three';
import { keyName } from '../player/Player.js';
import { saves } from '../core/SaveSystem.js';
import { setSleeveLook } from '../player/WeaponModels.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function spawnEnemies(game, list, opts = {}) {
  return list.map(([x, z, extra = {}]) => game.director.spawn({ team: 'enemy', pos: V(x, 0, z), yaw: opts.yaw ?? 0, accuracy: opts.accuracy ?? 1, state: opts.state || 'idle', visionRange: opts.visionRange, ...extra }));
}
export function attackOrder(game, enemies, target) {
  for (const e of enemies) { e.state = 'combat'; e.target = target; e.lastSeenPos = target.position.clone(); e.lastSeenT = game.director.time - 3; }
}
export function spawnCivilians(game, center, n, { spread = 3 } = {}) {
  return Array.from({ length: n }, (_, i) => game.director.spawn({ team: 'civilian', faction: 'civ', hat: 'none', weapon: false, passive: true, invulnerable: true, name: '주민',
    pos: V(center.x + (Math.random() - 0.5) * spread * 2, 0, center.z + (Math.random() - 0.5) * spread * 2), followOffset: V((i % 4 - 1.5) * 1.3, 0, 2.5 + Math.floor(i / 4) * 1.6) }));
}
export function setSquadStatus(game, id, status) { const s = game.squadList.find((x) => x.id === id); if (s) s.status = status; }
// Squad movement with a chain of command: the senior soldier present leads toward the objective, the
// others keep a loose file behind him; the player (a private) is not the formation anchor.
const SENIORITY = ['yoon', 'jung', 'doyun'];
export function squadFollow(game, ids) {
  const list = ids.filter((k) => game.squad[k] && !game.squad[k].dead).sort((a, b) => SENIORITY.indexOf(a) - SENIORITY.indexOf(b));
  const lead = list[0]; const L = game.squad[lead];
  list.forEach((k, i) => { const a = game.squad[k]; a.unpose(); a.setPassive(false);
    if (i === 0) a.lead(game.player); else a.follow(L, V(i % 2 ? 1.6 : -1.6, 0, 2.2 + i * 1.6)); });
}
export function hintKeys(game) { const b = game.input.binding.bind(game.input); return (k) => `<kbd>${keyName(b(k))}</kbd>`; }
export function giveLoadout(game, { grenades = 2 } = {}) { setSleeveLook('rok'); game.weapons.setSuppressed(false); game.weapons.setRifleName(); game.weapons.clear(); game.weapons.give('rifle', { mag: 30, reserve: 180 }); game.weapons.give('pistol'); game.weapons.grenades = grenades; game.weapons.equip('rifle', true); game.weapons.emitAmmo(); }
// shell / mortar impact that never lands right on the player
export async function shell(game, m, pos, { delay = 0, scale = 1.3, safeRadius = 9, damage = 60, snow = false } = {}) {
  if (delay) await m.wait(delay);
  const p = game.player.position; const at = V(pos.x, 0, pos.z);
  const dx = at.x - p.x, dz = at.z - p.z, d = Math.hypot(dx, dz);
  if (d < safeRadius) { const k = safeRadius / Math.max(0.01, d); at.x = p.x + dx * k; at.z = p.z + dz * k; }
  at.y = game.world.groundHeight(at.x, at.z, 50);
  game.combat.explode(at, { radius: 6, damage, scale, shake: 1.2, snow, kind: 'artillery' });
}
// a hold-to-use interaction as a promise
export function interact(game, opts) {
  return new Promise((resolve) => { const it = game.player.addInteractable({ ...opts, onUse: () => { it.enabled = false; game.player.removeInteractable(it); resolve(); } }); });
}

// ---- player decisions -------------------------------------------------------
// Shows a decision card and resolves with the chosen option's key. Options:
//   [{ key, text, note? }]  (up to 3; picked with 1 / 2 / 3). Each pick is stored as a
// persistent story flag (`flag`) so later missions and checkpoint restarts can read it,
// and listed in game.choiceLog for the mission debrief.
export async function choose(game, m, { flag, tag = '결정', title = '', options, timeout = 25, fallback = 0, record = null }) {
  const keys = ['Digit1', 'Digit2', 'Digit3'];
  const label = (i) => (i < 2 ? keyName(game.input.binding(i === 0 ? 'weapon1' : 'weapon2')) : '3');
  const box = document.createElement('div'); box.className = 'choice-box';
  box.innerHTML = `<div class="tag">${tag}</div>${title ? `<div class="ttl">${title}</div>` : ''}` +
    options.map((o, i) => `<div class="opt"><kbd>${label(i)}</kbd> ${o.text}${o.note ? `<span class="note">${o.note}</span>` : ''}</div>`).join('') +
    '<div class="timer"><i></i></div>';
  game.ui.hud.appendChild(box); game.weapons.switchLock = true;
  const bar = box.querySelector('.timer i'); let pick = -1; const t0 = m.time;
  const auto = game.autoChoices?.[flag];   // test hook: preset answers
  await m.until(() => {
    if (auto !== undefined) { pick = Math.max(0, options.findIndex((o) => o.key === auto)); return true; }
    for (let i = 0; i < options.length; i++) {
      const b = i === 0 ? 'weapon1' : i === 1 ? 'weapon2' : null;
      if ((b && game.input.pressed(b)) || game.input.pressedThisFrame?.has(keys[i])) pick = i;
    }
    if (bar) bar.style.width = `${Math.max(0, 100 - (m.time - t0) / timeout * 100)}%`;
    return pick >= 0 || m.time - t0 > timeout;
  });
  if (pick < 0) pick = fallback;
  m.spawn(async () => { await m.wait(0.3); game.weapons.switchLock = false; });
  const o = options[pick];
  box.classList.add('picked'); box.querySelectorAll('.opt')[pick]?.classList.add('on');
  game.audio.click(0.25, 1800, 0.03);
  if (flag) saves.setFlag(flag, o.key);
  (game.choiceLog ||= []).push({ flag, key: o.key, text: record || o.text });
  m.spawn(async () => { await m.wait(1.1); box.remove(); });
  game.ui.hint('<b>선택이 기록되었습니다</b> — 이 결정은 이후 전개에 영향을 줍니다', 3);
  return o.key;
}
export const flag = (k, d = null) => saves.data.storyFlags[k] ?? d;
