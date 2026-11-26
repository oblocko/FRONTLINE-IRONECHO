// Free roam of the Seoul big city (not part of the campaign): reached from the main menu (FREE ROAM) or a save
// checkpoint { missionId: 'dev_city' } (tests, tools). Two ways to move: on foot (normal FPS movement, no
// enemies) or in the air (free flight). T switches between them, N jumps to the next landmark.
// The city's validation report is on window.__cityReport.
import { SeoulMetro } from '../world/levels/SeoulMetro.js';
import { V, giveLoadout } from './common.js';
import { events } from '../core/Events.js';

export const TEXTURES = ['concrete', 'asphalt', 'metal', 'paintedMetal', 'corrugated', 'wood', 'fabric', 'plaster'];
export const EPILOGUE = '';
// starting points (ground position, view yaw: 0 = north / -z, PI = south / +z)
export const SPOTS = [
  { id: 'haneul', name: '하늘길', pos: [-366, -60], yaw: 0 },
  { id: 'plaza', name: '하늘 광장', pos: [-372, 84], yaw: Math.PI },
  { id: 'square', name: '하늘숲길 · 작은 광장', pos: [-650, -12], yaw: 0.8 },
  { id: 'culture', name: '공연 · 맛집 골목', pos: [-885, -60], yaw: 0 },
  { id: 'station', name: '중앙역', pos: [330, -160], yaw: 0 },
  { id: 'old', name: '옛 도심 대로', pos: [-6, -30], yaw: Math.PI },
  { id: 'river', name: '석촌천 · 다리', pos: [395, 60], yaw: -Math.PI / 2 },
  { id: 'hanriver', name: '한강 다리', pos: [0, -760], yaw: 0 },
  { id: 'subw', name: '서부 부도심', pos: [-985, 640], yaw: 0 },
  { id: 'sube', name: '동부 부도심', pos: [1355, 640], yaw: 0 },
  { id: 'green', name: '개발제한구역', pos: [-1430, 1300], yaw: Math.PI * 0.75 },
  { id: 'sat', name: '위성 도시', pos: [-2750, 1450], yaw: 0 },
];
export async function build(game) {
  const lv = new SeoulMetro(game, { bounds: { minX: -3300, maxX: 3800, minZ: -2050, maxZ: 2000 } /* the whole metropolitan area + the satellite towns */, navBounds: { minX: -950, maxX: 718, minZ: -435, maxZ: 435 } /* AI / nav grid: the detailed streets only (a 1 m grid over the whole region froze the page) */ }); game.level = lv; await lv.build();
  game.squad = {}; game.squadList = [];
}
const spotOf = (game) => SPOTS.find((s) => s.id === game.freeRoam?.spot) ?? SPOTS[0];
function setMode(game, mode, { keepPlace = false } = {}) {
  const p = game.player, fr = (game.freeRoam ??= { mode: 'walk', spot: 'haneul' }); fr.mode = mode;
  if (mode === 'air') {
    p.flying = true; game.weapons.clear(); events.emit('hud:ammo', null);
    if (!keepPlace || p.position.y < 20) p.position.y = Math.max(p.position.y, 90);
    p.pitch = -0.45;
  } else {
    // land: drop from where the flight is (the player falls onto the street or a roof below)
    p.flying = false; giveLoadout(game, { grenades: 0 });
    const x = p.position.x, z = p.position.z; p.teleport(V(x, Math.min(p.position.y, 60), z), p.yaw); p.pitch = 0;
  }
  game.ui.hint(mode === 'air'
    ? '공중 비행 — WASD 이동 · 마우스 시점 · Space 상승 · C 하강 · Shift 빠르게 · T 도보로 내리기 · N 다음 장소'
    : '도보 — WASD 이동 · Shift 달리기 · T 공중 비행 · N 다음 장소', 7);
}
function goSpot(game, s) {
  const p = game.player, air = game.freeRoam?.mode === 'air';
  p.teleport(V(s.pos[0], air ? 90 : 0, s.pos[1]), s.yaw); p.yaw = s.yaw; p.pitch = air ? -0.45 : 0;
  if (air) { p.flying = true; p.position.y = 90; }
  game.ui.hint(`${s.name}`, 3);
}
export const SEGMENTS = [{
  id: 'roam',
  async setup(game) { giveLoadout(game, { grenades: 0 }); const s = spotOf(game); game.player.teleport(V(s.pos[0], 0, s.pos[1]), s.yaw); },
  async run(game, m) {
    const p = game.player; p.godMode = true;
    goSpot(game, spotOf(game)); setMode(game, game.freeRoam?.mode === 'air' ? 'air' : 'walk', { keepPlace: true });
    let si = SPOTS.indexOf(spotOf(game));
    m.every(() => {
      const keys = game.input.pressedThisFrame;
      if (keys?.has('KeyT')) setMode(game, game.freeRoam?.mode === 'air' ? 'walk' : 'air', { keepPlace: true });
      if (keys?.has('KeyN')) { si = (si + 1) % SPOTS.length; goSpot(game, SPOTS[si]); }
    });
    // people are the level's lightweight crowd (SeoulMetro → city/Crowd.js)
    await m.until(() => false, 1e9);
  },
}];
