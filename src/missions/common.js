// Shared helpers for mission scripts.
import * as THREE from 'three';
import { keyName } from '../player/Player.js';

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
export function squadFollow(game, ids) { for (const k of ids) { const a = game.squad[k]; a.unpose(); a.follow(game.player); a.setPassive(false); } }
export function hintKeys(game) { const b = game.input.binding.bind(game.input); return (k) => `<kbd>${keyName(b(k))}</kbd>`; }
export function giveLoadout(game, { grenades = 2 } = {}) { game.weapons.clear(); game.weapons.give('rifle', { mag: 30, reserve: 180 }); game.weapons.give('pistol'); game.weapons.grenades = grenades; game.weapons.equip('rifle', true); game.weapons.emitAmmo(); }
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
