// Dev-only free roam of the Yeonseo central district (the planned large city prepared for M10 / M15).
// Not part of the campaign: reached only with a save checkpoint { missionId: 'dev_city' } (tests, tools).
// The city's validation report is on window.__cityReport.
import { YeonseoMetro } from '../world/levels/YeonseoMetro.js';
import { V, giveLoadout } from './common.js';

export const TEXTURES = ['concrete', 'asphalt', 'metal', 'paintedMetal', 'corrugated', 'wood', 'fabric', 'plaster'];
export const EPILOGUE = '';
export async function build(game) {
  const lv = new YeonseoMetro(game); game.level = lv; await lv.build();
  game.squad = {}; game.squadList = [];
}
export const SEGMENTS = [{
  id: 'roam',
  async setup(game) { giveLoadout(game); game.player.teleport(V(-6, 0, -30), Math.PI); },
  async run(game, m) { await m.until(() => false, 1e9); },
}];
