// Dev-only free roam of the Seoul downtown large city.
// Not part of the campaign: reached only with a save checkpoint { missionId: 'dev_city' } (tests, tools).
// The city's validation report is on window.__cityReport.
import { SeoulMetro } from '../world/levels/SeoulMetro.js';
import { V, giveLoadout } from './common.js';

export const TEXTURES = ['concrete', 'asphalt', 'metal', 'paintedMetal', 'corrugated', 'wood', 'fabric', 'plaster'];
export const EPILOGUE = '';
export async function build(game) {
  // free roam over both districts (old centre + new district)
  const lv = new SeoulMetro(game, { bounds: { minX: -450, maxX: 718, minZ: -298, maxZ: 298 } }); game.level = lv; await lv.build();
  game.squad = {}; game.squadList = [];
}
export const SEGMENTS = [{
  id: 'roam',
  async setup(game) { giveLoadout(game); game.player.teleport(V(-6, 0, -30), Math.PI); },
  async run(game, m) {
    // people are the level's lightweight crowd (SeoulMetro → city/Crowd.js)
    await m.until(() => false, 1e9);
  },
}];
