import { Game } from './core/Game.js';

function webglOK() {
  try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; }
}

if (!webglOK()) {
  document.getElementById('ui').innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#ddd;font-family:sans-serif;padding:40px;text-align:center">이 게임은 WebGL 2를 지원하는 최신 브라우저(Chrome, Edge, Firefox)가 필요합니다.</div>';
} else {
  const game = new Game();
  game.boot().catch((e) => { console.error(e); });
}
