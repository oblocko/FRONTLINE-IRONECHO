// Dev-only free roam of the Yeonseo central district (the planned large city prepared for M10 / M15).
// Not part of the campaign: reached only with a save checkpoint { missionId: 'dev_city' } (tests, tools).
// The city's validation report is on window.__cityReport.
import { YeonseoMetro } from '../world/levels/YeonseoMetro.js';
import { V, giveLoadout } from './common.js';

export const TEXTURES = ['concrete', 'asphalt', 'metal', 'paintedMetal', 'corrugated', 'wood', 'fabric', 'plaster'];
export const EPILOGUE = '';
export async function build(game) {
  // free roam over both districts (old centre + new district)
  const lv = new YeonseoMetro(game, { bounds: { minX: -200, maxX: 718, minZ: -298, maxZ: 298 } }); game.level = lv; await lv.build();
  game.squad = {}; game.squadList = [];
}
export const SEGMENTS = [{
  id: 'roam',
  async setup(game) { giveLoadout(game); game.player.teleport(V(-6, 0, -30), Math.PI); },
  async run(game, m) {
    // people: on the station plaza and the boulevard sidewalks, walking between random points
    const rand = (a, b) => a + Math.random() * (b - a);
    const civ = (x, z) => game.director.spawn({ team: 'civilian', faction: 'civ', hat: 'none', weapon: false, passive: true, invulnerable: true, name: '시민', pos: V(x, 0, z) });
    const walkers = [[[232, 392], [-148, -112], 22], [[300, 322], [-150, -132], 8], [[433, 437], [-280, 280], 6], [[403, 407], [-280, 280], 6], [[440, 600], [-111, -106], 6]];
    for (const [[x0, x1], [z0, z1], n] of walkers) for (let i = 0; i < n; i++) {
      const a = civ(rand(x0, x1), rand(z0, z1));
      m.spawn(async () => { for (;;) { const tx = rand(x0, x1), tz = rand(z0, z1); a.moveTo(V(tx, 0, tz)); await m.until(() => a.dead || Math.hypot(a.position.x - tx, a.position.z - tz) < 1.2, 120); await m.wait(rand(0.5, 6)); } });
    }
    await m.until(() => false, 1e9);
  },
}];
